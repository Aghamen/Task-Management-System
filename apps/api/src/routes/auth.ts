import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  checkLoginRate,
  clearLoginFailures,
  createSession,
  deleteSession,
  hashPassword,
  recordLoginFailure,
  requireUser,
  selfUser,
  SESSION_COOKIE,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';
import { HttpError } from '../errors.js';
import { color, fullName, parse, password } from '../validation.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const body = parse(z.object({ login: z.string().trim().min(1), password: z.string().min(1) }), req.body);
    const login = body.login.toLowerCase();
    const rateKey = `${req.ip}:${login}`;
    checkLoginRate(rateKey);

    const user = await prisma.user.findFirst({ where: { OR: [{ username: login }, { email: login }] } });
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      recordLoginFailure(rateKey);
      throw new HttpError(401, 'Wrong username/email or password');
    }
    if (!user.isActive) throw new HttpError(403, 'This account has been deactivated');

    clearLoginFailures(rateKey);
    setSessionCookie(reply, await createSession(user.id));
    return { user: selfUser(user) };
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deleteSession(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', async (req) => ({ user: selfUser(requireUser(req)) }));

  app.patch('/auth/me', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ fullName: fullName.optional(), avatarColor: color.optional() }), req.body);
    const updated = await prisma.user.update({ where: { id: user.id }, data: body });
    return { user: selfUser(updated) };
  });

  app.post('/auth/password', async (req, reply) => {
    const user = requireUser(req);
    const body = parse(z.object({ currentPassword: z.string(), newPassword: password }), req.body);
    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
      throw new HttpError(400, 'Current password is incorrect');
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
    // Sign out every other session, keep this one alive with a fresh token.
    await prisma.session.deleteMany({ where: { userId: user.id } });
    setSessionCookie(reply, await createSession(user.id));
    return { ok: true };
  });
}
