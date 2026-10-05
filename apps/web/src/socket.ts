import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket() {
  if (!socket) socket = io({ path: '/socket.io', withCredentials: true });
  else if (socket.disconnected) socket.connect();
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export const getSocket = () => socket;
export const getSocketId = () => socket?.id;
