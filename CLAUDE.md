# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Superhost** is a modular web hosting & billing control panel — think cPanel/Plesk but built on modern TypeScript. It manages Nginx, PHP-FPM, Postfix/Dovecot, MariaDB, DNS zones, SSL certs, backups, and more on a Linux host. All 9 development phases are complete.

## Repository Layout

```
api/        Express API (port 3001) — runs as user `jonathan` via systemd
worker/     Privileged daemon — runs as root via systemd, executes system commands
dashboard/  React + Vite SPA
shared/     TypeScript types shared across api/ and worker/
docs/migrations/  PostgreSQL schema migrations (apply in order 001–015)
```

## Build & Run Commands

### API
```bash
cd api
npm run dev       # tsx watch (hot reload)
npm run build     # tsc → dist/
npm start         # node dist/index.js
```

### Worker
```bash
cd worker
npm run dev       # tsx watch (hot reload, must run as root for full function)
npm run build     # tsc → dist/
npm start         # node dist/index.js
```

### Dashboard
```bash
cd dashboard
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build → dist/
npm run lint      # ESLint
npm run preview   # Preview production build
```

### Systemd (production)
```bash
sudo systemctl restart superhost-api      # Restart API service
sudo systemctl restart superhost-worker   # Restart worker service (runs as root)
sudo journalctl -u superhost-api -f       # Stream API logs
sudo journalctl -u superhost-worker -f   # Stream worker logs
```

## Architecture: Task Queue Pattern

The central design pattern: **API creates tasks → Worker polls & executes them**.

1. API route validates request and inserts a row into the `tasks` table with a `command` and JSON `payload`
2. Worker polls `tasks` WHERE status='pending', picks one up, sets status='processing'
3. Worker executes the system operation (shell commands, file writes, service restarts)
4. Worker updates the task to status='completed' or 'failed' with optional `error_message`
5. Dashboard polls `GET /api/tasks/:id` until the task resolves

This decoupling means **the API never touches the filesystem or runs shell commands** — only the worker does. 70+ task types are handled in `worker/src/index.ts` (a single large switch/dispatch file).

Worker safety mechanisms:
- **Optimistic locking**: `UPDATE tasks SET status='processing' WHERE id=$1 AND status='pending' RETURNING id` — safe for concurrent workers
- **5-minute timeout** wraps every task promise
- All shell arguments pass through `shellEscape()` from `shared/sanitize.js` — never interpolate user input directly into shell strings

## Authentication Flows

Two separate auth systems with distinct JWT tokens:

- **Admin** (`/api/auth/`): Username + password → optional TOTP 2FA → JWT. Supports FIDO2/WebAuthn passkeys (`/api/fido2/`).
- **Client** (`/api/client/auth/`): Similar flow but for hosting clients with `role: 'client'` in JWT.

Route files use middleware from `api/src/middleware/` — check `authenticateAdmin` vs `authenticateClient` to know which routes are accessible to which role.

## Database Setup

PostgreSQL is the primary database. Apply migrations in order:

```bash
psql -U superhost -d superhost -f docs/migrations/001_initial_schema.sql
# ... through 015_deleted_users.sql
```

There are two files prefixed `009_` (`009_email_catchall.sql` and `009_security_hardening.sql`) — apply both before `010_`.

The API connects via `api/src/db.ts` (connection pool). The worker has its own pool and also connects to MariaDB for client database operations. Two separate DB users:
- `superhost` — API user (limited privileges)
- `superhost_worker` — Worker user (elevated privileges for admin operations)

## Key Patterns

**Adding a new feature** typically requires changes in 3–4 places:
1. `shared/types.ts` — add the TypeScript interface
2. `api/src/routes/<feature>.ts` — REST endpoints that queue tasks
3. `api/src/index.ts` — mount the new router
4. `worker/src/index.ts` — add task handler(s) to the switch statement
5. `dashboard/src/pages/<Feature>.tsx` — UI
6. `dashboard/src/App.tsx` — add route

**Worker task handlers** follow this pattern in the switch:
```typescript
case 'MY_TASK_COMMAND': {
  const { param } = task.payload as { param: string };
  // do system work
  await completeTask(taskId, { result: 'data' });
  break;
}
```

**Client resource isolation**: Client resources (domains, databases, email, etc.) are always scoped by `user_id` from the JWT. The worker prefixes MariaDB database names with the username to prevent collisions.

**Recently added routes** (not yet widespread in the codebase documentation):
- `/api/admin/apps` (`adminApps.ts`) — manage user app runtimes; queues `SETUP_APP_RUNTIME`, `MANAGE_APP_RUNTIME`, `DELETE_APP_RUNTIME`
- `/api/admin/deleted-users` (`adminDeletedUsers.ts`) — soft-deleted account archive; queues `RESTORE_USER`, `PURGE_USER_ARCHIVE`. The `deleted_users` table (migration 015) stores a JSON snapshot of the user's domains, databases, DNS zones, and mail accounts.

**`HostingPackage` limits**: a value of `-1` means unlimited. Check this when reading/writing package-gated resource caps.

## Tech Stack Details

- **API**: Express 5, PostgreSQL (`pg`), JWT (`jsonwebtoken`), bcryptjs, `@simplewebauthn/server` for WebAuthn, `speakeasy` for TOTP, Stripe for billing
- **Worker**: Raw `exec`/`child_process` for shell, `pg` for PostgreSQL, `mysql2` for MariaDB
- **Dashboard**: React 19, React Router 7, TanStack Query v5, Tailwind CSS v4, Recharts, `@simplewebauthn/browser`, Lucide icons
- **All packages**: ES modules (`"type": "module"`), TypeScript with strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`

## Environment Variables

**api/.env**: `PORT`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME`, `DB_PORT`, `JWT_SECRET`, `NODE_ENV`

**worker/.env**: `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME`, `DB_PORT`, `NODE_ENV`, `DB_ADMIN_USER`, `DB_ADMIN_PASS`

## No Test Suite

There is currently no test framework configured. Manual testing is done by running services locally and hitting the API directly, or via the dashboard.
