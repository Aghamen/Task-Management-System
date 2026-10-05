import { buildApp } from './app.js';
import { hashPassword } from './auth.js';
import { prisma } from './db.js';
import { initRealtime } from './realtime.js';

/** Creates the super admin account from env vars the first time the app starts. */
async function ensureSuperAdmin() {
  if (await prisma.user.findFirst({ where: { isSuperAdmin: true } })) return;
  const username = process.env.SUPERADMIN_USERNAME?.trim().toLowerCase();
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!username || !email || !password || password.length < 8) {
    throw new Error(
      'No super admin exists. Set SUPERADMIN_USERNAME, SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD (min 8 chars).',
    );
  }
  await prisma.user.create({
    data: {
      username,
      email,
      fullName: 'Super Admin',
      isSuperAdmin: true,
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Created super admin account "${username}"`);
}

async function main() {
  await ensureSuperAdmin();
  const app = await buildApp({ logger: true });
  initRealtime(app.server);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

  const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
