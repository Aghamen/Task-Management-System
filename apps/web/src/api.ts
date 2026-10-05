import { getSocketId } from './socket';

export type BoardRole = 'ADMIN' | 'MEMBER' | 'OBSERVER';

export interface PublicUser {
  id: string;
  username: string;
  fullName: string;
  avatarColor: string;
}

export interface Me extends PublicUser {
  email: string;
  isSuperAdmin: boolean;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface CardSummary {
  id: string;
  listId: string;
  title: string;
  position: number;
  startDate: string | null;
  dueDate: string | null;
  dueComplete: boolean;
  coverColor: string | null;
  hasDescription: boolean;
  labelIds: string[];
  memberIds: string[];
  checklist: { done: number; total: number };
  commentCount: number;
}

export interface BoardList {
  id: string;
  title: string;
  position: number;
  cards: CardSummary[];
}

export interface Board {
  id: string;
  title: string;
  background: string;
  myRole: BoardRole;
  starred: boolean;
  members: { role: BoardRole; user: PublicUser }[];
  labels: Label[];
  lists: BoardList[];
}

export interface BoardTile {
  id: string;
  title: string;
  background: string;
  starred: boolean;
  role: BoardRole;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  position: number;
  assigneeId: string | null;
  dueDate: string | null;
}

export interface Checklist {
  id: string;
  title: string;
  position: number;
  items: ChecklistItem[];
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: PublicUser | null;
}

export interface CardDetail {
  id: string;
  boardId: string;
  list: { id: string; title: string };
  title: string;
  description: string;
  position: number;
  startDate: string | null;
  dueDate: string | null;
  dueComplete: boolean;
  coverColor: string | null;
  archivedAt: string | null;
  createdAt: string;
  createdBy: PublicUser | null;
  labelIds: string[];
  memberIds: string[];
  checklists: Checklist[];
  comments: Comment[];
}

export interface AdminUser extends Me {
  isActive: boolean;
  createdAt: string;
  boardCount: number;
}

export interface AdminBoard {
  id: string;
  title: string;
  background: string;
  archivedAt: string | null;
  createdAt: string;
  cardCount: number;
  listCount: number;
  members: { role: BoardRole; user: PublicUser & { isActive: boolean } }[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const socketId = getSocketId();
  if (socketId) headers['x-socket-id'] = socketId;
  const res = await fetch(`/api${url}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('auth:expired'));
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T = { ok: true }>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T = { ok: true }>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T = { ok: true }>(url: string, body: unknown = {}) => request<T>('PUT', url, body),
  del: <T = { ok: true }>(url: string) => request<T>('DELETE', url),
};

export const BACKGROUNDS = [
  '#0079bf', '#d29034', '#519839', '#b04632', '#89609e',
  '#cd5a91', '#4bbf6b', '#00aecc', '#838c91', '#172b4d',
  'linear-gradient(135deg, #0c66e4 0%, #37b4c3 100%)',
  'linear-gradient(135deg, #6e5dc6 0%, #e774bb 100%)',
  'linear-gradient(135deg, #e34935 0%, #faa53d 100%)',
  'linear-gradient(135deg, #1f845a 0%, #94c748 100%)',
  'linear-gradient(135deg, #172b4d 0%, #6e5dc6 100%)',
  'linear-gradient(135deg, #0055cc 0%, #09326c 100%)',
];

export const LABEL_COLORS = [
  '#4bce97', '#f5cd47', '#fea362', '#f87168', '#9f8fef', '#579dff',
  '#1f845a', '#946f00', '#c25100', '#c9372c', '#6e5dc6', '#0c66e4',
  '#6cc3e0', '#94c748', '#e774bb', '#8590a2', '#227d9b', '#5b7f24',
];

export const COVER_COLORS = [
  '#4bce97', '#f5cd47', '#fea362', '#f87168', '#9f8fef',
  '#579dff', '#6cc3e0', '#94c748', '#e774bb', '#8590a2',
];

export const AVATAR_COLORS = ['#0c66e4', '#1f845a', '#c25100', '#ae2e24', '#6e5dc6', '#206a83', '#943d73', '#5b7f24'];
