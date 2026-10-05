import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireTeamUser } from '../auth.js';
import { boardIdOfList, requireBoardRole } from '../access.js';
import { badRequest } from '../errors.js';
import { notifyBoard } from '../realtime.js';
import { id, originSocket, params, parse, position, title } from '../validation.js';

const GAP = 65536;

export async function listRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    requireTeamUser(req);
  });

  app.post('/boards/:boardId/lists', async (req) => {
    const { boardId } = params(req, { boardId: id });
    const body = parse(z.object({ title, position: position.optional() }), req.body);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    let pos = body.position;
    if (pos === undefined) {
      const last = await prisma.list.findFirst({ where: { boardId }, orderBy: { position: 'desc' } });
      pos = (last?.position ?? 0) + GAP;
    }
    const list = await prisma.list.create({ data: { boardId, title: body.title, position: pos } });
    notifyBoard(boardId, originSocket(req));
    return { list: { id: list.id, title: list.title, position: list.position, cards: [] } };
  });

  app.patch('/lists/:listId', async (req) => {
    const { listId } = params(req, { listId: id });
    const body = parse(
      z.object({ title: title.optional(), position: position.optional(), archived: z.boolean().optional() }),
      req.body,
    );
    const boardId = await boardIdOfList(listId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    const list = await prisma.list.update({
      where: { id: listId },
      data: {
        title: body.title,
        position: body.position,
        ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date() : null } : {}),
      },
    });
    notifyBoard(boardId, originSocket(req));
    return { list: { id: list.id, title: list.title, position: list.position } };
  });

  // Archive every card in a list (Trello's "Archive all cards in this list").
  app.post('/lists/:listId/archive-cards', async (req) => {
    const { listId } = params(req, { listId: id });
    const boardId = await boardIdOfList(listId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    await prisma.card.updateMany({ where: { listId, archivedAt: null }, data: { archivedAt: new Date() } });
    notifyBoard(boardId, originSocket(req));
    return { ok: true };
  });

  // Move every card in a list to another list on the same board.
  app.post('/lists/:listId/move-cards', async (req) => {
    const { listId } = params(req, { listId: id });
    const body = parse(z.object({ toListId: id }), req.body);
    const boardId = await boardIdOfList(listId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    if ((await boardIdOfList(body.toListId)) !== boardId) throw badRequest('Lists must be on the same board');
    const last = await prisma.card.findFirst({ where: { listId: body.toListId }, orderBy: { position: 'desc' } });
    const cards = await prisma.card.findMany({ where: { listId }, orderBy: { position: 'asc' } });
    let pos = last?.position ?? 0;
    await prisma.$transaction(
      cards.map((c) => prisma.card.update({ where: { id: c.id }, data: { listId: body.toListId, position: (pos += GAP) } })),
    );
    notifyBoard(boardId, originSocket(req));
    return { ok: true };
  });

  app.delete('/lists/:listId', async (req) => {
    const { listId } = params(req, { listId: id });
    const boardId = await boardIdOfList(listId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    await prisma.list.delete({ where: { id: listId } });
    notifyBoard(boardId, originSocket(req));
    return { ok: true };
  });
}
