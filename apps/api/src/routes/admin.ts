import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, publicUser, requireSuperAdmin } from '../auth.js';
import { badRequest, notFound } from '../errors.js';
import { disconnectUser, kickFromBoard, notifyBoard, notifyUser } from '../realtime.js';
import { background, boardRole, email, fullName, id, params, parse, password, title, username } from '../validation.js';

export const DEFAULT_LABEL_COLORS = ['#4bce97', '#f5cd47', '#fea362', '#f87168', '#9f8fef', '#579dff'];

const adminUser = (u: {
  id: string;
  username: string;
  email: string;
  fullName: string;
  avatarColor: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  createdAt: Date;
  _count?: { memberships: number };
}) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  fullName: u.fullName,
  avatarColor: u.avatarColor,
  isSuperAdmin: u.isSuperAdmin,
  isActive: u.isActive,
  createdAt: u.createdAt,
  boardCount: u._count?.memberships ?? 0,
});

async function teamUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('User not found');
  if (user.isSuperAdmin) throw badRequest('The super admin account cannot be added to boards');
  return user;
}

export async function adminRoutes(app: FastifyInstance) {
  // This plugin is encapsulated, so the hook only guards the routes below.
  app.addHook('preHandler', async (req) => {
    requireSuperAdmin(req);
  });

  // ---- Users ----

  app.get('/admin/users', async () => {
    const users = await prisma.user.findMany({
      orderBy: [{ isSuperAdmin: 'desc' }, { fullName: 'asc' }],
      include: { _count: { select: { memberships: true } } },
    });
    return { users: users.map(adminUser) };
  });

  app.post('/admin/users', async (req) => {
    const body = parse(z.object({ username, email, fullName, password }), req.body);
    const user = await prisma.user.create({
      data: {
        username: body.username,
        email: body.email,
        fullName: body.fullName,
        passwordHash: await hashPassword(body.password),
        avatarColor: randomAvatarColor(),
      },
    });
    return { user: adminUser(user) };
  });

  app.patch('/admin/users/:userId', async (req) => {
    const { userId } = params(req, { userId: id });
    const body = parse(
      z.object({
        username: username.optional(),
        email: email.optional(),
        fullName: fullName.optional(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    );
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw notFound('User not found');
    if (existing.isSuperAdmin && body.isActive === false) throw badRequest('The super admin cannot be deactivated');

    const user = await prisma.user.update({ where: { id: userId }, data: body });
    if (body.isActive === false) {
      await prisma.session.deleteMany({ where: { userId } });
      disconnectUser(userId);
    }
    return { user: adminUser(user) };
  });

  app.post('/admin/users/:userId/password', async (req) => {
    const { userId } = params(req, { userId: id });
    const body = parse(z.object({ password }), req.body);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(body.password) } });
    // Force the user to log in again with the new password (the admin keeps their own session).
    if (userId !== req.user!.id) {
      await prisma.session.deleteMany({ where: { userId } });
      disconnectUser(userId);
    }
    return { ok: true };
  });

  app.delete('/admin/users/:userId', async (req) => {
    const { userId } = params(req, { userId: id });
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw notFound('User not found');
    if (existing.isSuperAdmin) throw badRequest('The super admin cannot be deleted');
    disconnectUser(userId);
    await prisma.user.delete({ where: { id: userId } });
    return { ok: true };
  });

  // ---- Boards ----

  app.get('/admin/boards', async () => {
    const boards = await prisma.board.findMany({
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      include: {
        members: { include: { user: true }, orderBy: { createdAt: 'asc' } },
        _count: { select: { cards: true, lists: true } },
      },
    });
    return {
      boards: boards.map((b) => ({
        id: b.id,
        title: b.title,
        background: b.background,
        archivedAt: b.archivedAt,
        createdAt: b.createdAt,
        cardCount: b._count.cards,
        listCount: b._count.lists,
        members: b.members.map((m) => ({ role: m.role, user: { ...publicUser(m.user), isActive: m.user.isActive } })),
      })),
    };
  });

  app.post('/admin/boards', async (req) => {
    const body = parse(
      z.object({
        title,
        background: background.optional(),
        adminUserId: id,
        memberIds: z.array(id).max(200).optional(),
      }),
      req.body,
    );
    await teamUser(body.adminUserId);
    const memberIds = [...new Set(body.memberIds ?? [])].filter((m) => m !== body.adminUserId);
    for (const m of memberIds) await teamUser(m);

    const board = await prisma.board.create({
      data: {
        title: body.title,
        background: body.background,
        createdById: req.user!.id,
        members: {
          create: [
            { userId: body.adminUserId, role: 'ADMIN' },
            ...memberIds.map((userId) => ({ userId, role: 'MEMBER' as const })),
          ],
        },
        labels: { create: DEFAULT_LABEL_COLORS.map((c) => ({ color: c })) },
      },
    });
    for (const userId of [body.adminUserId, ...memberIds]) notifyUser(userId);
    return { board };
  });

  app.patch('/admin/boards/:boardId', async (req) => {
    const { boardId } = params(req, { boardId: id });
    const body = parse(
      z.object({ title: title.optional(), background: background.optional(), archived: z.boolean().optional() }),
      req.body,
    );
    const board = await prisma.board.update({
      where: { id: boardId },
      data: {
        title: body.title,
        background: body.background,
        ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date() : null } : {}),
      },
      include: { members: { select: { userId: true } } },
    });
    notifyBoard(boardId);
    for (const m of board.members) notifyUser(m.userId);
    return { board: { ...board, members: undefined } };
  });

  app.delete('/admin/boards/:boardId', async (req) => {
    const { boardId } = params(req, { boardId: id });
    const members = await prisma.boardMember.findMany({ where: { boardId }, select: { userId: true } });
    await prisma.board.delete({ where: { id: boardId } });
    for (const m of members) kickFromBoard(m.userId, boardId);
    return { ok: true };
  });

  app.put('/admin/boards/:boardId/members/:userId', async (req) => {
    const { boardId, userId } = params(req, { boardId: id, userId: id });
    const body = parse(z.object({ role: boardRole }), req.body);
    await teamUser(userId);
    const member = await prisma.boardMember.upsert({
      where: { boardId_userId: { boardId, userId } },
      create: { boardId, userId, role: body.role },
      update: { role: body.role },
    });
    notifyBoard(boardId);
    notifyUser(userId);
    return { member };
  });

  app.delete('/admin/boards/:boardId/members/:userId', async (req) => {
    const { boardId, userId } = params(req, { boardId: id, userId: id });
    await removeBoardMember(boardId, userId);
    return { ok: true };
  });
}

/** Removes a member from a board and from all cards on it. */
export async function removeBoardMember(boardId: string, userId: string) {
  await prisma.$transaction([
    prisma.cardMember.deleteMany({ where: { userId, card: { boardId } } }),
    prisma.boardMember.delete({ where: { boardId_userId: { boardId, userId } } }),
  ]);
  kickFromBoard(userId, boardId);
  notifyBoard(boardId);
}

const AVATAR_COLORS = ['#0c66e4', '#1f845a', '#c25100', '#ae2e24', '#6e5dc6', '#206a83', '#943d73', '#5b7f24'];
const randomAvatarColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
