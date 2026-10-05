import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { publicUser, requireTeamUser } from '../auth.js';
import { boardIdOfLabel, requireBoardRole } from '../access.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { notifyBoard, notifyUser } from '../realtime.js';
import { background, boardRole, color, id, originSocket, params, parse, title } from '../validation.js';
import { removeBoardMember } from './admin.js';
import { cardSummaryInclude, toCardSummary } from './cards.js';

async function adminCount(boardId: string) {
  return prisma.boardMember.count({ where: { boardId, role: 'ADMIN' } });
}

export async function boardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    requireTeamUser(req);
  });

  // Active users the board admins can add to boards.
  app.get('/users', async () => {
    const users = await prisma.user.findMany({
      where: { isActive: true, isSuperAdmin: false },
      orderBy: { fullName: 'asc' },
    });
    return { users: users.map(publicUser) };
  });

  app.get('/boards', async (req) => {
    const memberships = await prisma.boardMember.findMany({
      where: { userId: req.user!.id, board: { archivedAt: null } },
      include: { board: true },
      orderBy: { board: { title: 'asc' } },
    });
    return {
      boards: memberships.map((m) => ({
        id: m.board.id,
        title: m.board.title,
        background: m.board.background,
        starred: m.starred,
        role: m.role,
      })),
    };
  });

  // Closed boards that the current user can reopen.
  app.get('/boards/archived', async (req) => {
    const memberships = await prisma.boardMember.findMany({
      where: { userId: req.user!.id, role: 'ADMIN', board: { archivedAt: { not: null } } },
      include: { board: true },
      orderBy: { board: { archivedAt: 'desc' } },
    });
    return {
      boards: memberships.map((m) => ({
        id: m.board.id,
        title: m.board.title,
        background: m.board.background,
        archivedAt: m.board.archivedAt,
      })),
    };
  });

  app.get('/boards/:boardId', async (req) => {
    const { boardId } = params(req, { boardId: id });
    const membership = await requireBoardRole(req.user!, boardId, 'OBSERVER');
    const board = await prisma.board.findUniqueOrThrow({
      where: { id: boardId },
      include: {
        members: { include: { user: true }, orderBy: { createdAt: 'asc' } },
        labels: { orderBy: { id: 'asc' } },
        lists: {
          where: { archivedAt: null },
          orderBy: { position: 'asc' },
          include: {
            cards: { where: { archivedAt: null }, orderBy: { position: 'asc' }, include: cardSummaryInclude },
          },
        },
      },
    });
    return {
      board: {
        id: board.id,
        title: board.title,
        background: board.background,
        myRole: membership.role,
        starred: membership.starred,
        members: board.members.map((m) => ({ role: m.role, user: publicUser(m.user) })),
        labels: board.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
        lists: board.lists.map((l) => ({
          id: l.id,
          title: l.title,
          position: l.position,
          cards: l.cards.map(toCardSummary),
        })),
      },
    };
  });

  app.patch('/boards/:boardId', async (req) => {
    const { boardId } = params(req, { boardId: id });
    const body = parse(
      z.object({ title: title.optional(), background: background.optional(), archived: z.boolean().optional() }),
      req.body,
    );
    if (body.archived !== undefined) {
      await requireBoardRole(req.user!, boardId, 'ADMIN', { allowArchived: true });
    } else {
      await requireBoardRole(req.user!, boardId, 'MEMBER');
    }
    const board = await prisma.board.update({
      where: { id: boardId },
      data: {
        title: body.title,
        background: body.background,
        ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date() : null } : {}),
      },
      include: { members: { select: { userId: true } } },
    });
    notifyBoard(boardId, originSocket(req));
    if (body.archived !== undefined || body.title || body.background) {
      for (const m of board.members) if (m.userId !== req.user!.id) notifyUser(m.userId);
    }
    return { ok: true };
  });

  app.put('/boards/:boardId/star', async (req) => {
    const { boardId } = params(req, { boardId: id });
    const body = parse(z.object({ starred: z.boolean() }), req.body);
    await requireBoardRole(req.user!, boardId, 'OBSERVER');
    await prisma.boardMember.update({
      where: { boardId_userId: { boardId, userId: req.user!.id } },
      data: { starred: body.starred },
    });
    return { ok: true };
  });

  // ---- Members ----

  app.post('/boards/:boardId/members', async (req) => {
    const { boardId } = params(req, { boardId: id });
    const body = parse(z.object({ userId: id, role: boardRole.default('MEMBER') }), req.body);
    await requireBoardRole(req.user!, boardId, 'ADMIN');
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user || !user.isActive || user.isSuperAdmin) throw notFound('User not found');
    const existing = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: body.userId } },
    });
    if (existing) throw conflict(`${user.fullName} is already on this board`);
    await prisma.boardMember.create({ data: { boardId, userId: body.userId, role: body.role } });
    notifyBoard(boardId, originSocket(req));
    notifyUser(body.userId);
    return { ok: true };
  });

  app.patch('/boards/:boardId/members/:userId', async (req) => {
    const { boardId, userId } = params(req, { boardId: id, userId: id });
    const body = parse(z.object({ role: boardRole }), req.body);
    await requireBoardRole(req.user!, boardId, 'ADMIN');
    const target = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId } } });
    if (!target) throw notFound('Member not found');
    if (target.role === 'ADMIN' && body.role !== 'ADMIN' && (await adminCount(boardId)) <= 1) {
      throw badRequest('A board needs at least one admin');
    }
    await prisma.boardMember.update({ where: { boardId_userId: { boardId, userId } }, data: { role: body.role } });
    notifyBoard(boardId, originSocket(req));
    notifyUser(userId);
    return { ok: true };
  });

  app.delete('/boards/:boardId/members/:userId', async (req) => {
    const { boardId, userId } = params(req, { boardId: id, userId: id });
    const self = userId === req.user!.id;
    await requireBoardRole(req.user!, boardId, self ? 'OBSERVER' : 'ADMIN');
    const target = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId } } });
    if (!target) throw notFound('Member not found');
    if (target.role === 'ADMIN' && (await adminCount(boardId)) <= 1) {
      throw badRequest('A board needs at least one admin. Make someone else admin first.');
    }
    await removeBoardMember(boardId, userId);
    return { ok: true };
  });

  // ---- Labels ----

  app.post('/boards/:boardId/labels', async (req) => {
    const { boardId } = params(req, { boardId: id });
    const body = parse(z.object({ name: z.string().trim().max(100).default(''), color }), req.body);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    const label = await prisma.label.create({ data: { boardId, name: body.name, color: body.color } });
    notifyBoard(boardId, originSocket(req));
    return { label };
  });

  app.patch('/labels/:labelId', async (req) => {
    const { labelId } = params(req, { labelId: id });
    const body = parse(z.object({ name: z.string().trim().max(100).optional(), color: color.optional() }), req.body);
    const boardId = await boardIdOfLabel(labelId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    const label = await prisma.label.update({ where: { id: labelId }, data: body });
    notifyBoard(boardId, originSocket(req));
    return { label };
  });

  app.delete('/labels/:labelId', async (req) => {
    const { labelId } = params(req, { labelId: id });
    const boardId = await boardIdOfLabel(labelId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    await prisma.label.delete({ where: { id: labelId } });
    notifyBoard(boardId, originSocket(req));
    return { ok: true };
  });

  // ---- Archived items ----

  app.get('/boards/:boardId/archived', async (req) => {
    const { boardId } = params(req, { boardId: id });
    await requireBoardRole(req.user!, boardId, 'OBSERVER');
    const [lists, cards] = await Promise.all([
      prisma.list.findMany({ where: { boardId, archivedAt: { not: null } }, orderBy: { archivedAt: 'desc' } }),
      prisma.card.findMany({
        where: { boardId, archivedAt: { not: null } },
        orderBy: { archivedAt: 'desc' },
        include: { ...cardSummaryInclude, list: { select: { title: true } } },
      }),
    ]);
    return {
      lists: lists.map((l) => ({ id: l.id, title: l.title, archivedAt: l.archivedAt })),
      cards: cards.map((c) => ({ ...toCardSummary(c), listTitle: c.list.title, archivedAt: c.archivedAt })),
    };
  });
}
