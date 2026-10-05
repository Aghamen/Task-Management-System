import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { publicUser, requireTeamUser } from '../auth.js';
import { boardIdOfCard, boardIdOfList, isBoardMember, requireBoardRole } from '../access.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { notifyBoard } from '../realtime.js';
import { color, id, nullableDate, originSocket, params, parse, position, title } from '../validation.js';

const GAP = 65536;

export const cardSummaryInclude = {
  labels: { select: { labelId: true } },
  members: { select: { userId: true } },
  checklists: { select: { items: { select: { checked: true } } } },
  _count: { select: { comments: true } },
} satisfies Prisma.CardInclude;

type CardWithSummary = Prisma.CardGetPayload<{ include: typeof cardSummaryInclude }>;

export function toCardSummary(c: CardWithSummary) {
  const items = c.checklists.flatMap((cl) => cl.items);
  return {
    id: c.id,
    listId: c.listId,
    title: c.title,
    position: c.position,
    startDate: c.startDate,
    dueDate: c.dueDate,
    dueComplete: c.dueComplete,
    coverColor: c.coverColor,
    hasDescription: c.description.trim().length > 0,
    labelIds: c.labels.map((l) => l.labelId),
    memberIds: c.members.map((m) => m.userId),
    checklist: { done: items.filter((i) => i.checked).length, total: items.length },
    commentCount: c._count.comments,
  };
}

async function cardDetail(cardId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      list: { select: { id: true, title: true } },
      createdBy: true,
      labels: { select: { labelId: true } },
      members: { select: { userId: true } },
      checklists: { orderBy: { position: 'asc' }, include: { items: { orderBy: { position: 'asc' } } } },
      comments: { orderBy: { createdAt: 'desc' }, include: { author: true } },
    },
  });
  if (!card) throw notFound('Card not found');
  return {
    id: card.id,
    boardId: card.boardId,
    list: card.list,
    title: card.title,
    description: card.description,
    position: card.position,
    startDate: card.startDate,
    dueDate: card.dueDate,
    dueComplete: card.dueComplete,
    coverColor: card.coverColor,
    archivedAt: card.archivedAt,
    createdAt: card.createdAt,
    createdBy: card.createdBy ? publicUser(card.createdBy) : null,
    labelIds: card.labels.map((l) => l.labelId),
    memberIds: card.members.map((m) => m.userId),
    checklists: card.checklists.map((cl) => ({
      id: cl.id,
      title: cl.title,
      position: cl.position,
      items: cl.items.map((i) => ({
        id: i.id,
        text: i.text,
        checked: i.checked,
        position: i.position,
        assigneeId: i.assigneeId,
        dueDate: i.dueDate,
      })),
    })),
    comments: card.comments.map((cm) => ({
      id: cm.id,
      body: cm.body,
      createdAt: cm.createdAt,
      editedAt: cm.editedAt,
      author: cm.author ? publicUser(cm.author) : null,
    })),
  };
}

export async function cardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    requireTeamUser(req);
  });

  app.post('/lists/:listId/cards', async (req) => {
    const { listId } = params(req, { listId: id });
    const body = parse(z.object({ title, position: position.optional() }), req.body);
    const boardId = await boardIdOfList(listId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    let pos = body.position;
    if (pos === undefined) {
      const last = await prisma.card.findFirst({ where: { listId }, orderBy: { position: 'desc' } });
      pos = (last?.position ?? 0) + GAP;
    }
    const card = await prisma.card.create({
      data: { boardId, listId, title: body.title, position: pos, createdById: req.user!.id },
      include: cardSummaryInclude,
    });
    notifyBoard(boardId, originSocket(req));
    return { card: toCardSummary(card) };
  });

  app.get('/cards/:cardId', async (req) => {
    const { cardId } = params(req, { cardId: id });
    await requireBoardRole(req.user!, await boardIdOfCard(cardId), 'OBSERVER');
    return { card: await cardDetail(cardId) };
  });

  app.patch('/cards/:cardId', async (req) => {
    const { cardId } = params(req, { cardId: id });
    const body = parse(
      z
        .object({
          title: title.optional(),
          description: z.string().max(20000).optional(),
          startDate: nullableDate.optional(),
          dueDate: nullableDate.optional(),
          dueComplete: z.boolean().optional(),
          coverColor: color.nullable().optional(),
          listId: id.optional(),
          position: position.optional(),
          archived: z.boolean().optional(),
        })
        .strict(),
      req.body,
    );
    const boardId = await boardIdOfCard(cardId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    if (body.listId && (await boardIdOfList(body.listId)) !== boardId) {
      throw badRequest('That list is on a different board');
    }
    const { archived, ...data } = body;
    await prisma.card.update({
      where: { id: cardId },
      data: { ...data, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) },
    });
    notifyBoard(boardId, originSocket(req), cardId);
    return { card: await cardDetail(cardId) };
  });

  app.delete('/cards/:cardId', async (req) => {
    const { cardId } = params(req, { cardId: id });
    const boardId = await boardIdOfCard(cardId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    await prisma.card.delete({ where: { id: cardId } });
    notifyBoard(boardId, originSocket(req), cardId);
    return { ok: true };
  });

  // ---- Labels on a card ----

  app.put('/cards/:cardId/labels/:labelId', async (req) => {
    const { cardId, labelId } = params(req, { cardId: id, labelId: id });
    const boardId = await boardIdOfCard(cardId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    const label = await prisma.label.findUnique({ where: { id: labelId } });
    if (!label || label.boardId !== boardId) throw notFound('Label not found');
    await prisma.cardLabel.upsert({
      where: { cardId_labelId: { cardId, labelId } },
      create: { cardId, labelId },
      update: {},
    });
    notifyBoard(boardId, originSocket(req), cardId);
    return { ok: true };
  });

  app.delete('/cards/:cardId/labels/:labelId', async (req) => {
    const { cardId, labelId } = params(req, { cardId: id, labelId: id });
    const boardId = await boardIdOfCard(cardId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    await prisma.cardLabel.deleteMany({ where: { cardId, labelId } });
    notifyBoard(boardId, originSocket(req), cardId);
    return { ok: true };
  });

  // ---- Members on a card ----

  app.put('/cards/:cardId/members/:userId', async (req) => {
    const { cardId, userId } = params(req, { cardId: id, userId: id });
    const boardId = await boardIdOfCard(cardId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    if (!(await isBoardMember(boardId, userId))) throw badRequest('Only board members can be added to cards');
    await prisma.cardMember.upsert({
      where: { cardId_userId: { cardId, userId } },
      create: { cardId, userId },
      update: {},
    });
    notifyBoard(boardId, originSocket(req), cardId);
    return { ok: true };
  });

  app.delete('/cards/:cardId/members/:userId', async (req) => {
    const { cardId, userId } = params(req, { cardId: id, userId: id });
    const boardId = await boardIdOfCard(cardId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    await prisma.cardMember.deleteMany({ where: { cardId, userId } });
    notifyBoard(boardId, originSocket(req), cardId);
    return { ok: true };
  });

  // ---- Comments ----

  const commentBody = z.string().trim().min(1, 'Comment cannot be empty').max(10000);

  app.post('/cards/:cardId/comments', async (req) => {
    const { cardId } = params(req, { cardId: id });
    const body = parse(z.object({ body: commentBody }), req.body);
    const boardId = await boardIdOfCard(cardId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    await prisma.comment.create({ data: { cardId, authorId: req.user!.id, body: body.body } });
    notifyBoard(boardId, originSocket(req), cardId);
    return { ok: true };
  });

  app.patch('/comments/:commentId', async (req) => {
    const { commentId } = params(req, { commentId: id });
    const body = parse(z.object({ body: commentBody }), req.body);
    const comment = await prisma.comment.findUnique({ where: { id: commentId }, include: { card: true } });
    if (!comment) throw notFound('Comment not found');
    await requireBoardRole(req.user!, comment.card.boardId, 'MEMBER');
    if (comment.authorId !== req.user!.id) throw forbidden('You can only edit your own comments');
    await prisma.comment.update({ where: { id: commentId }, data: { body: body.body, editedAt: new Date() } });
    notifyBoard(comment.card.boardId, originSocket(req), comment.cardId);
    return { ok: true };
  });

  app.delete('/comments/:commentId', async (req) => {
    const { commentId } = params(req, { commentId: id });
    const comment = await prisma.comment.findUnique({ where: { id: commentId }, include: { card: true } });
    if (!comment) throw notFound('Comment not found');
    const membership = await requireBoardRole(req.user!, comment.card.boardId, 'MEMBER');
    if (comment.authorId !== req.user!.id && membership.role !== 'ADMIN') {
      throw forbidden('You can only delete your own comments');
    }
    await prisma.comment.delete({ where: { id: commentId } });
    notifyBoard(comment.card.boardId, originSocket(req), comment.cardId);
    return { ok: true };
  });
}
