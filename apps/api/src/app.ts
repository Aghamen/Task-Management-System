import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { SESSION_COOKIE, userFromToken } from './auth.js';
import { HttpError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { boardRoutes } from './routes/boards.js';
import { listRoutes } from './routes/lists.js';
import { cardRoutes } from './routes/cards.js';
import { checklistRoutes } from './routes/checklists.js';

export async function buildApp({ logger = false }: { logger?: boolean } = {}) {
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 1024 * 1024 });

  await app.register(cookie);

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    req.user = await userFromToken(req.cookies[SESSION_COOKIE]);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: err.issues[0]?.message ?? 'Invalid input', issues: err.issues });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'That value is already in use' });
      if (err.code === 'P2025') return reply.status(404).send({ error: 'Not found' });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: (err as Error).message });
    req.log.error(err);
    return reply.status(500).send({ error: 'Something went wrong' });
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(adminRoutes);
      await api.register(boardRoutes);
      await api.register(listRoutes);
      await api.register(cardRoutes);
      await api.register(checklistRoutes);
      api.get('/health', async () => ({ ok: true }));
    },
    { prefix: '/api' },
  );

  // Serve the built web app (single container deployment).
  const webDist =
    process.env.WEB_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/assets/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
