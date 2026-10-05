import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import { prisma } from './db.js';
import { forbidden, HttpError } from './errors.js';

export const SESSION_COOKIE = 'sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

export const hashPassword = (password: string) => hash(password);
export const verifyPassword = (passwordHash: string, password: string) =>
  verify(passwordHash, password).catch(() => false);

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return token;
}

export async function deleteSession(token: string) {
  await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function userFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date() || !session.user.isActive) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function requireUser(req: FastifyRequest): User {
  if (!req.user) throw new HttpError(401, 'Please log in');
  return req.user;
}

export function requireSuperAdmin(req: FastifyRequest): User {
  const user = requireUser(req);
  if (!user.isSuperAdmin) throw forbidden();
  return user;
}

/** Board features are for team members only; the super admin account is management-only. */
export function requireTeamUser(req: FastifyRequest): User {
  const user = requireUser(req);
  if (user.isSuperAdmin) throw forbidden('The super admin account can only use the admin panel');
  return user;
}

export function publicUser(user: Pick<User, 'id' | 'username' | 'fullName' | 'avatarColor'>) {
  return { id: user.id, username: user.username, fullName: user.fullName, avatarColor: user.avatarColor };
}

export function selfUser(user: User) {
  return { ...publicUser(user), email: user.email, isSuperAdmin: user.isSuperAdmin };
}

/** Very small in-memory limiter for login attempts (enough for a single-server team app). */
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export function checkLoginRate(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    throw new HttpError(429, 'Too many login attempts. Try again in a few minutes.');
  }
}

export function recordLoginFailure(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count++;
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
