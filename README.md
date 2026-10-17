# TaskBoard

A self-hosted, Trello-style task board for a small team.

- **Super admin panel** (`/admin`): create users, reset passwords, deactivate accounts, create boards and choose who can access each one.
- **Boards**: lists and cards with drag and drop, colored backgrounds, starring, and closing/reopening boards.
- **Board roles**: Admin (manages the board's members), Member (edits), Observer (read-only).
- **Cards**: description (Markdown), labels, members, start and due dates with "complete", checklists with progress bars (items can have an assignee and due date), comments, cover colors, move between lists, archive/restore and delete.
- **Live updates**: changes made by teammates appear without refreshing.
- **Filters**: keyword, labels, members, due date.

See [docs/PLAN.md](docs/PLAN.md) for the full plan and the upcoming phases.

---

## Run it on your computer

### Option 1: one command with Docker (easiest)

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS) or Docker Engine (Linux), then:

```bash
git clone https://github.com/aghamen/task-management-system.git taskboard
cd taskboard
docker compose -f docker-compose.local.yml up --build
```

Wait for `Created super admin account "admin"` (the first build takes a few minutes), then open
**http://localhost:3000** and log in with **`admin` / `admin12345`**.

- Stop: `Ctrl+C` (or `docker compose -f docker-compose.local.yml down`)
- Start again later: same `up` command. Your boards and users are kept.
- Wipe all data: `docker compose -f docker-compose.local.yml down -v`

Teammates on the same network can use it too: open `http://<your-computer's-IP>:3000`.

### Option 2: developer mode (live reload while editing the code)

Requires **Node.js 22+**, plus Docker for the database (or your own PostgreSQL 16).

```bash
npm install
npm run db       # starts PostgreSQL in Docker on localhost:5433 (skip if you use your own Postgres)
npm run setup    # creates apps/api/.env and sets up the database tables
npm run dev      # starts the API and the web app
```

Open **http://localhost:5173** and log in with **`admin` / `admin12345`**. Code changes reload automatically.

Using your own PostgreSQL instead of `npm run db`? Create an empty database, set `DATABASE_URL`
in `apps/api/.env`, then run `npm run setup`.

---

## Deploying on a VPS (subdomain, e.g. `tasks.example.com`)

You need a Linux VPS with **Docker** and the **Docker Compose plugin**, and a DNS `A` record pointing your subdomain at the VPS IP.

### 1. Get the code and configure it

```bash
git clone https://github.com/aghamen/task-management-system.git taskboard
cd taskboard
cp .env.example .env
nano .env        # set POSTGRES_PASSWORD, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD
```

Generate strong values with `openssl rand -base64 24`.

### 2. Start it

```bash
docker compose up -d --build
docker compose logs -f app      # wait for "Created super admin account"
```

The app now listens on `127.0.0.1:3000` (only reachable from the VPS itself).
The database lives in the Docker volume `db-data`.

### 3. Put it on the subdomain with HTTPS

Use **one** of the options below.

**Option A: nginx is already on the VPS** (common when other sites run there)

Create `/etc/nginx/sites-available/tasks.example.com`:

```nginx
server {
    listen 80;
    server_name tasks.example.com;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSockets (live updates)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1h;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tasks.example.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tasks.example.com     # free HTTPS certificate
```

**Option B: Caddy** (gets HTTPS certificates automatically)

`/etc/caddy/Caddyfile`:

```
tasks.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

### 4. First login

Open `https://tasks.example.com`, log in with `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD`, then:

1. **Users → Create user** for each teammate. The app shows the login details to send them.
2. **Boards → Create board**. Pick the board admin and, optionally, its members.

The board admin can then add or remove people from inside the board using the **Share** button.

> The super admin account is only for administration. It cannot open boards.
> Changing `SUPERADMIN_*` in `.env` after the first start has no effect. Change the
> password from the admin panel (**Users → Reset password**) or from **Profile**.

### Updating to a new version

```bash
git pull
docker compose up -d --build     # database migrations run automatically on start
```

### Backups

```bash
# Backup
docker compose exec -T db pg_dump -U taskboard taskboard | gzip > backup-$(date +%F).sql.gz

# Restore (into an empty database)
gunzip -c backup-2026-10-05.sql.gz | docker compose exec -T db psql -U taskboard taskboard
```

Add the backup line to a daily cron job, for example `0 3 * * * cd /path/to/taskboard && ...`.

---

## Development

| Command | What it does |
|---|---|
| `npm run local` | Whole app in Docker on http://localhost:3000 (same as Option 1) |
| `npm run db` | Start only the local PostgreSQL (Docker, port 5433) |
| `npm run setup` | Create `apps/api/.env` if missing and apply database migrations |
| `npm run dev` | API (auto-reload) + web app on http://localhost:5173 |
| `npm run build` / `npm start` | Production build, then serve everything on http://localhost:3000 |
| `npm run typecheck` | TypeScript checks for both apps |
| `npm test` | API integration tests (needs a `taskboard_test` database, or set `TEST_DATABASE_URL`) |

### Layout

```
apps/api     Fastify + Prisma (PostgreSQL) + Socket.IO, serves the built web app in production
  prisma/    Database schema and migrations
  src/routes auth, admin, boards, lists, cards, checklists
apps/web     React + Vite + Tailwind + dnd-kit + TanStack Query
  src/pages  Login, Boards, Board, CardModal, Profile, admin/*
scripts/     setup.mjs (local setup helper)
```
