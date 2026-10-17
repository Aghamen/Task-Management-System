// One-time local setup for `npm run dev` (works on Windows, macOS and Linux):
//   1. creates apps/api/.env from .env.example if it doesn't exist
//   2. applies the database migrations
import { copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps', 'api');
const envFile = path.join(apiDir, '.env');

if (!existsSync(envFile)) {
  copyFileSync(path.join(apiDir, '.env.example'), envFile);
  console.log('Created apps/api/.env (edit it to use your own database).');
} else {
  console.log('apps/api/.env already exists, keeping it.');
}

console.log('Applying database migrations…');
const res = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: apiDir,
  stdio: 'inherit',
  shell: true,
});
if (res.status !== 0) {
  console.error(
    '\nCould not reach the database. Start it with `npm run db` (needs Docker),\n' +
      'or point DATABASE_URL in apps/api/.env at your own PostgreSQL, then run `npm run setup` again.',
  );
  process.exit(1);
}
console.log('\nDone! Now run `npm run dev` and open http://localhost:5173 (login: admin / admin12345).');
