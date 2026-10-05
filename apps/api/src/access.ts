import type { BoardRole, User } from '@prisma/client';
import { prisma } from './db.js';
import { forbidden, notFound } from './errors.js';

const rank: Record<BoardRole, number> = { OBSERVER: 0, MEMBER: 1, ADMIN: 2 };

/**
 * Ensures `user` is a member of the board with at least `min` role.
 * Non-members get a 404 so board existence isn't leaked.
 * Archived boards are only reachable when `allowArchived` is set (used to restore them).
 */
export async function requireBoardRole(
  user: User,
  boardId: string,
  min: BoardRole,
  { allowArchived = false } = {},
) {
  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: user.id } },
    include: { board: true },
  });
  if (!membership) throw notFound('Board not found');
  if (membership.board.archivedAt && !allowArchived) throw notFound('Board not found');
  if (rank[membership.role] < rank[min]) {
    throw forbidden(min === 'ADMIN' ? 'Only board admins can do this' : 'Observers cannot make changes');
  }
  return membership;
}

export async function boardIdOfList(listId: string) {
  const list = await prisma.list.findUnique({ where: { id: listId }, select: { boardId: true } });
  if (!list) throw notFound('List not found');
  return list.boardId;
}

export async function boardIdOfCard(cardId: string) {
  const card = await prisma.card.findUnique({ where: { id: cardId }, select: { boardId: true } });
  if (!card) throw notFound('Card not found');
  return card.boardId;
}

export async function boardIdOfLabel(labelId: string) {
  const label = await prisma.label.findUnique({ where: { id: labelId }, select: { boardId: true } });
  if (!label) throw notFound('Label not found');
  return label.boardId;
}

export async function checklistContext(checklistId: string) {
  const checklist = await prisma.checklist.findUnique({
    where: { id: checklistId },
    select: { cardId: true, card: { select: { boardId: true } } },
  });
  if (!checklist) throw notFound('Checklist not found');
  return { cardId: checklist.cardId, boardId: checklist.card.boardId };
}

export async function checklistItemContext(itemId: string) {
  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: { checklist: { select: { cardId: true, card: { select: { boardId: true } } } } },
  });
  if (!item) throw notFound('Checklist item not found');
  return { cardId: item.checklist.cardId, boardId: item.checklist.card.boardId };
}

export async function isBoardMember(boardId: string, userId: string) {
  const m = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId } } });
  return !!m;
}
