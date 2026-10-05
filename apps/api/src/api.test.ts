import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { hashPassword } from './auth.js';
import { prisma } from './db.js';

let app: FastifyInstance;

type Client = ReturnType<typeof client>;

function client(cookie = '') {
  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url: `/api${url}`, payload: payload as object, headers: { cookie } });
    return { status: res.statusCode, body: res.json() as any, cookie: res.headers['set-cookie'] };
  };
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, body?: unknown) => call('POST', url, body ?? {}),
    patch: (url: string, body: unknown) => call('PATCH', url, body),
    put: (url: string, body?: unknown) => call('PUT', url, body ?? {}),
    del: (url: string) => call('DELETE', url),
  };
}

async function login(loginName: string, password: string): Promise<Client> {
  const res = await client().post('/auth/login', { login: loginName, password });
  expect(res.status).toBe(200);
  const raw = Array.isArray(res.cookie) ? res.cookie[0] : res.cookie!;
  return client(raw.split(';')[0]);
}

let admin: Client;
let alice: Client;
let bob: Client;
let aliceId: string;
let bobId: string;
let carolId: string;

beforeAll(async () => {
  app = await buildApp();
  await prisma.$executeRawUnsafe('TRUNCATE "User", "Board" CASCADE');
  await prisma.user.create({
    data: {
      username: 'root',
      email: 'root@example.com',
      fullName: 'Root',
      isSuperAdmin: true,
      passwordHash: await hashPassword('rootpassword'),
    },
  });
  admin = await login('root', 'rootpassword');

  const mk = async (username: string) => {
    const res = await admin.post('/admin/users', {
      username,
      email: `${username}@example.com`,
      fullName: username.toUpperCase(),
      password: 'password123',
    });
    expect(res.status).toBe(200);
    return res.body.user.id as string;
  };
  aliceId = await mk('alice');
  bobId = await mk('bob');
  carolId = await mk('carol');
  alice = await login('alice@example.com', 'password123'); // login by email
  bob = await login('BOB', 'password123'); // login by username, case-insensitive
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('auth', () => {
  it('rejects wrong passwords', async () => {
    const res = await client().post('/auth/login', { login: 'alice', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('requires a session', async () => {
    expect((await client().get('/boards')).status).toBe(401);
  });

  it('only the super admin can use admin routes', async () => {
    expect((await alice.get('/admin/users')).status).toBe(403);
    expect((await admin.get('/admin/users')).status).toBe(200);
  });

  it('the super admin cannot use board routes', async () => {
    expect((await admin.get('/boards')).status).toBe(403);
  });

  it('regular users cannot create boards via the admin API', async () => {
    expect((await alice.post('/admin/boards', { title: 'x', adminUserId: aliceId })).status).toBe(403);
  });
});

describe('boards and access', () => {
  let boardId: string;

  it('super admin creates a board with a chosen admin', async () => {
    const res = await admin.post('/admin/boards', { title: 'Dev', adminUserId: aliceId, memberIds: [bobId] });
    expect(res.status).toBe(200);
    boardId = res.body.board.id;

    const aliceBoards = await alice.get('/boards');
    expect(aliceBoards.body.boards).toMatchObject([{ id: boardId, role: 'ADMIN' }]);
    const bobBoards = await bob.get('/boards');
    expect(bobBoards.body.boards).toMatchObject([{ id: boardId, role: 'MEMBER' }]);
  });

  it('non-members cannot see the board', async () => {
    const carol = await login('carol', 'password123');
    expect((await carol.get(`/boards/${boardId}`)).status).toBe(404);
  });

  it('members build lists and cards; observers are read-only', async () => {
    const list = await bob.post(`/boards/${boardId}/lists`, { title: 'To Do' });
    expect(list.status).toBe(200);
    const card = await bob.post(`/lists/${list.body.list.id}/cards`, { title: 'First task' });
    expect(card.status).toBe(200);

    await alice.post(`/boards/${boardId}/members`, { userId: carolId, role: 'OBSERVER' });
    const carol = await login('carol', 'password123');
    expect((await carol.get(`/boards/${boardId}`)).status).toBe(200);
    expect((await carol.post(`/lists/${list.body.list.id}/cards`, { title: 'nope' })).status).toBe(403);

    const board = await carol.get(`/boards/${boardId}`);
    expect(board.body.board.lists[0].cards[0].title).toBe('First task');
  });

  it('only board admins manage members', async () => {
    expect((await bob.post(`/boards/${boardId}/members`, { userId: carolId })).status).toBe(403);
  });

  it('keeps at least one admin', async () => {
    expect((await alice.patch(`/boards/${boardId}/members/${aliceId}`, { role: 'MEMBER' })).status).toBe(400);
    expect((await alice.del(`/boards/${boardId}/members/${aliceId}`)).status).toBe(400);
  });

  it('card details: labels, members, dates, checklist, comments', async () => {
    const board = (await bob.get(`/boards/${boardId}`)).body.board;
    const cardId = board.lists[0].cards[0].id;
    const labelId = board.labels[0].id;

    expect((await bob.put(`/cards/${cardId}/labels/${labelId}`)).status).toBe(200);
    expect((await bob.put(`/cards/${cardId}/members/${aliceId}`)).status).toBe(200);
    expect((await bob.put(`/cards/${cardId}/members/${carolId}`)).status).toBe(200); // observer is a board member
    const patched = await bob.patch(`/cards/${cardId}`, {
      description: '# Hello',
      dueDate: '2026-12-01T10:00:00.000Z',
      startDate: '2026-11-01T00:00:00.000Z',
    });
    expect(patched.status).toBe(200);

    const cl = await bob.post(`/cards/${cardId}/checklists`, { title: 'Steps' });
    const item = await bob.post(`/checklists/${cl.body.checklist.id}/items`, { text: 'Do it' });
    await bob.post(`/checklists/${cl.body.checklist.id}/items`, { text: 'Check it' });
    await bob.patch(`/checklist-items/${item.body.item.id}`, { checked: true });
    await bob.post(`/cards/${cardId}/comments`, { body: 'Looks good' });

    const summary = (await bob.get(`/boards/${boardId}`)).body.board.lists[0].cards[0];
    expect(summary).toMatchObject({
      labelIds: [labelId],
      checklist: { done: 1, total: 2 },
      commentCount: 1,
      hasDescription: true,
    });

    const detail = (await bob.get(`/cards/${cardId}`)).body.card;
    expect(detail.comments[0]).toMatchObject({ body: 'Looks good', author: { username: 'bob' } });
    expect(detail.memberIds.sort()).toEqual([aliceId, carolId].sort());

    // Alice (admin) may delete Bob's comment; Carol (observer) can't comment at all.
    const carol = await login('carol', 'password123');
    expect((await carol.post(`/cards/${cardId}/comments`, { body: 'hi' })).status).toBe(403);
    expect((await alice.del(`/comments/${detail.comments[0].id}`)).status).toBe(200);
  });

  it('removing a member also unassigns them from cards', async () => {
    expect((await alice.del(`/boards/${boardId}/members/${carolId}`)).status).toBe(200);
    const card = (await bob.get(`/boards/${boardId}`)).body.board.lists[0].cards[0];
    expect(card.memberIds).toEqual([aliceId]);
  });

  it('archive and restore cards and boards', async () => {
    const board = (await bob.get(`/boards/${boardId}`)).body.board;
    const cardId = board.lists[0].cards[0].id;
    await bob.patch(`/cards/${cardId}`, { archived: true });
    expect((await bob.get(`/boards/${boardId}`)).body.board.lists[0].cards).toHaveLength(0);
    expect((await bob.get(`/boards/${boardId}/archived`)).body.cards).toHaveLength(1);
    await bob.patch(`/cards/${cardId}`, { archived: false });
    expect((await bob.get(`/boards/${boardId}`)).body.board.lists[0].cards).toHaveLength(1);

    expect((await bob.patch(`/boards/${boardId}`, { archived: true })).status).toBe(403);
    expect((await alice.patch(`/boards/${boardId}`, { archived: true })).status).toBe(200);
    expect((await bob.get(`/boards/${boardId}`)).status).toBe(404);
    expect((await alice.get('/boards/archived')).body.boards).toHaveLength(1);
    expect((await alice.patch(`/boards/${boardId}`, { archived: false })).status).toBe(200);
  });

  it('cannot move a card to a list on another board', async () => {
    const other = await admin.post('/admin/boards', { title: 'Other', adminUserId: bobId });
    const otherList = await bob.post(`/boards/${other.body.board.id}/lists`, { title: 'L' });
    const card = (await bob.get(`/boards/${boardId}`)).body.board.lists[0].cards[0];
    const res = await bob.patch(`/cards/${card.id}`, { listId: otherList.body.list.id, position: 1 });
    expect(res.status).toBe(400);
  });
});

describe('admin user management', () => {
  it('reset password logs the user out and the new one works', async () => {
    const bobSession = await login('bob', 'password123');
    expect((await admin.post(`/admin/users/${bobId}/password`, { password: 'newpassword1' })).status).toBe(200);
    expect((await bobSession.get('/boards')).status).toBe(401);
    await login('bob', 'newpassword1');
  });

  it('deactivated users cannot log in', async () => {
    await admin.patch(`/admin/users/${carolId}`, { isActive: false });
    const res = await client().post('/auth/login', { login: 'carol', password: 'password123' });
    expect(res.status).toBe(403);
  });

  it('rejects duplicate usernames', async () => {
    const res = await admin.post('/admin/users', {
      username: 'alice',
      email: 'other@example.com',
      fullName: 'X',
      password: 'password123',
    });
    expect(res.status).toBe(409);
  });
});
