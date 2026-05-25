# Superhost Master Plan

A full-featured web hosting control panel designed for modern Linux servers. This document serves as the master architectural guide and long-term vision. For immediate tasks and progress tracking, refer to [todo.md](./todo.md).

## Architecture (Current State)

Superhost follows a distributed architecture:

- **`api/`**: (Built) Central management layer.
  - **Auth**: JWT-based with 2FA support (Login, Setup, Verify, Enable).
  - **Routes**: Users, Domains, Ports, Firewall, and Task orchestration.
- **`dashboard/`**: (Partially Built) Administrative UI.
  - **Login**: (Built) Supports 2FA login flow.
  - **Users/Domains**: (Built) Basic CRUD and list views.
  - **Settings/Firewall**: (Planned) Currently placeholders.
- **`worker/`**: (Built) Privileged system daemon.
  - **Task Loop**: (Built) Handles `CREATE_USER`, `CREATE_DOMAIN`, `INSTALL_SSL`, `FIREWALL_ALLOW`, etc.
  - **Nginx**: (Built) Config generation from templates.
- **`shared/`**: (Empty) Intended for unified TypeScript interfaces.

## Key Workflows

### Task Execution Pattern
1. API receives a request (e.g., "Create Domain").
2. API inserts the record into the primary table (`domains`) and a task into the `tasks` table.
3. API issues a `NOTIFY new_task` signal.
4. Worker (listening on `new_task`) picks up the task, executes system commands, and updates the task status to `completed` or `failed`.

### Development Setup
- **API**: `cd api && npm install && npm run dev` (Ensure `.env` is configured).
- **Dashboard**: `cd dashboard && npm install && npm run dev`.
- **Worker**: `cd worker && npm install && npm run dev` (Requires root/sudo for many tasks).

## Coding Standards

- **Language**: TypeScript is mandatory across the entire stack. Avoid `any` and use explicit interfaces.
- **Surgical Updates**: When modifying existing files, preserve surrounding style and logic.
- **Validation**: Every backend change should be verified with a test or manual verification script. UI changes must be verified against the API.
- **Security**: Never expose system internals to the dashboard. All system operations must be gated by the API and executed by the worker.

## Project Structure Highlights
- `api/src/routes/`: Domain-specific API endpoints.
- `worker/src/index.ts`: The main task handler for system operations.
- `docs/migrations/`: SQL schema and migration strategies.
