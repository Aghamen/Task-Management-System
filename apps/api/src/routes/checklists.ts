import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireTeamUser } from '../auth.js';
import {
  boardIdOfCard,
  checklistContext,
  checklistItemContext,
  isBoardMember,
  requireBoardRole,
} from '../access.js';
import { badRequest } from '../errors.js';
import { notifyBoard } from '../realtime.js';
import { id, nullableDate, originSocket, params, parse, position, title } from '../validation.js';

const GAP = 65536;
const itemText = z.string().trim().min(1, 'Item text is required').max(1000);

export async function checklistRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    requireTeamUser(req);
  });

  app.post('/cards/:cardId/checklists', async (req) => {
    const { cardId } = params(req, { cardId: id });
    const body = parse(z.object({ title }), req.body);
    const boardId = await boardIdOfCard(cardId);
    await requireBoardRole(req.user!, boardId, 'MEMBER');
    const last = await prisma.checklist.findFirst({ where: { cardId }, orderBy: { position: 'desc' } });
    const checklist = await prisma.checklist.create({
      data: { cardId, title: body.title, position: (last?.position ?? 0) + GAP },
    });
    notifyBoard(boardId, originSocket(req), cardId);
    return { checklist: { ...checklist, items: [] } };
  });

  app.patch('/checklists/:checklistId', async (req) => {
    const { checklistId } = params(req, { checklistId: id });
    const body = parse(z.object({ title: title.optional(), position: position.optional() }), req.body);
    const ctx = await checklistContext(checklistId);
    await requireBoardRole(req.user!, ctx.boardId, 'MEMBER');
    await prisma.checklist.update({ where: { id: checklistId }, data: body });
    notifyBoard(ctx.boardId, originSocket(req), ctx.cardId);
    return { ok: true };
  });

  app.delete('/checklists/:checklistId', async (req) => {
    const { checklistId } = params(req, { checklistId: id });
    const ctx = await checklistContext(checklistId);
    await requireBoardRole(req.user!, ctx.boardId, 'MEMBER');
    await prisma.checklist.delete({ where: { id: checklistId } });
    notifyBoard(ctx.boardId, originSocket(req), ctx.cardId);
    return { ok: true };
  });

  app.post('/checklists/:checklistId/items', async (req) => {
    const { checklistId } = params(req, { checklistId: id });
    const body = parse(z.object({ text: itemText }), req.body);
    const ctx = await checklistContext(checklistId);
    await requireBoardRole(req.user!, ctx.boardId, 'MEMBER');
    const last = await prisma.checklistItem.findFirst({ where: { checklistId }, orderBy: { position: 'desc' } });
    const item = await prisma.checklistItem.create({
      data: { checklistId, text: body.text, position: (last?.position ?? 0) + GAP },
    });
    notifyBoard(ctx.boardId, originSocket(req), ctx.cardId);
    return { item };
  });

  app.patch('/checklist-items/:itemId', async (req) => {
    const { itemId } = params(req, { itemId: id });
    const body = parse(
      z.object({
        text: itemText.optional(),
        checked: z.boolean().optional(),
        position: position.optional(),
        assigneeId: id.nullable().optional(),
        dueDate: nullableDate.optional(),
      }),
      req.body,
    );
    const ctx = await checklistItemContext(itemId);
    await requireBoardRole(req.user!, ctx.boardId, 'MEMBER');
    if (body.assigneeId && !(await isBoardMember(ctx.boardId, body.assigneeId))) {
      throw badRequest('Only board members can be assigned');
    }
    await prisma.checklistItem.update({ where: { id: itemId }, data: body });
    notifyBoard(ctx.boardId, originSocket(req), ctx.cardId);
    return { ok: true };
  });

  app.delete('/checklist-items/:itemId', async (req) => {
    const { itemId } = params(req, { itemId: id });
    const ctx = await checklistItemContext(itemId);
    await requireBoardRole(req.user!, ctx.boardId, 'MEMBER');
    await prisma.checklistItem.delete({ where: { id: itemId } });
    notifyBoard(ctx.boardId, originSocket(req), ctx.cardId);
    return { ok: true };
  });
}
