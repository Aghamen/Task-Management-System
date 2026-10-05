import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { SESSION_COOKIE, userFromToken } from './auth.js';
import { isBoardMember } from './access.js';

let io: Server | null = null;

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

const boardRoom = (boardId: string) => `board:${boardId}`;
const userRoom = (userId: string) => `user:${userId}`;

export function initRealtime(server: HttpServer) {
  io = new Server(server, { path: '/socket.io', serveClient: false });

  io.use(async (socket, next) => {
    const user = await userFromToken(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    socket.join(userRoom(socket.data.userId));

    socket.on('board:join', async (boardId: unknown) => {
      if (typeof boardId !== 'string') return;
      for (const room of socket.rooms) if (room.startsWith('board:')) socket.leave(room);
      if (await isBoardMember(boardId, socket.data.userId)) socket.join(boardRoom(boardId));
    });

    socket.on('board:leave', (boardId: unknown) => {
      if (typeof boardId === 'string') socket.leave(boardRoom(boardId));
    });
  });

  return io;
}

/** Tell everyone viewing a board (except the socket that made the change) to refresh. */
export function notifyBoard(boardId: string, exceptSocketId?: string, cardId?: string) {
  if (!io) return;
  const target = exceptSocketId ? io.to(boardRoom(boardId)).except(exceptSocketId) : io.to(boardRoom(boardId));
  target.emit('board:changed', { boardId, cardId });
}

/** Tell a user their board list or access changed. */
export function notifyUser(userId: string) {
  if (!io) return;
  io.to(userRoom(userId)).emit('boards:changed');
}

/** Remove a user from a board's live room after losing access. */
export function kickFromBoard(userId: string, boardId: string) {
  if (!io) return;
  io.in(userRoom(userId)).socketsLeave(boardRoom(boardId));
  notifyUser(userId);
}

export function disconnectUser(userId: string) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}
