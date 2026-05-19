# SuperHost — Incremental Build Phases

Each phase produces a working, testable slice of the product. Later phases
build on earlier ones but do not require later ones to exist.

---

## Phase 0 — Project Skeleton (Week 1)

**Goal:** A running monorepo that CI can lint, type-check, and test.

### Deliverables
- pnpm workspace + Turborepo pipeline
- Shared tsconfig, ESLint, Prettier configs (`packages/config`)
- Shared Zod schema + TypeScript types package (`packages/shared`)
- Fastify API shell: starts, returns `GET /healthz` → 200
- React + Vite UI shell: blank shell with routing (React Router), loads without errors
- Docker Compose for local dev: PostgreSQL, Redis
- Drizzle ORM wiring + first migration (users, sessions tables)
- GitHub Actions CI: install → lint → typecheck → test (no tests yet, just green pipeline)

### Exit Criteria
- `pnpm dev` starts both API and UI
- `GET /healthz` returns `{ status: "ok" }`
- CI passes on every push

---

## Phase 1 — Authentication (Week 2)

**Goal:** Users can register, log in, log out, and use TOTP 2FA.

### Deliverables
- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`
- JWT issued on login, stored in Redis with TTL
- Middleware that validates JWT on every protected route
- TOTP enrolment and verification endpoints
- Password reset flow (email token, requires SMTP config)
- Rate limiting on login endpoint (using `@fastify/rate-limit`)
- UI: Login page, Register page, 2FA setup page, password reset flow
- Role enum seeded in DB (`admin`, `operator`, `customer`)
- Integration tests for auth endpoints

### Exit Criteria
- A user can complete the full login → 2FA → logout cycle
- An unauthenticated request to a protected endpoint returns 401
- Rate limiter blocks after 10 failures in 60 s

---

## Phase 2 — Admin Shell & User Management (Week 3)

**Goal:** Admins can manage users and see an overview dashboard.

### Deliverables
- Admin UI layout: sidebar nav, breadcrumbs, top bar
- CRUD endpoints for users (`GET /users`, `POST /users`, `PATCH /users/:id`,
  `DELETE /users/:id`)
- Role-based access: operator and customer accounts scoped to their own data
- Customer account creation (name, email, plan assignment — plan is freeform text
  until Phase 7)
- Audit log table in DB; middleware writes every state-changing request
- `GET /audit-log` endpoint with filters (date, user, action)
- Basic dashboard: user count, server count (0 for now)

### Exit Criteria
- Admin can create an operator and a customer account
- Audit log records the creation events
- Operator cannot delete a user; request returns 403

---

## Phase 3 — Server Registration & Agent (Weeks 4–5)

**Goal:** The panel can register a server and the agent can connect back.

### Deliverables

**Agent daemon (`agent/`)**
- Minimal Node.js Fastify service, runs as a systemd unit
- One-time provisioning: accepts a token, generates a keypair, calls panel back
- mTLS certificate exchange with the panel's CA
- Heartbeat `POST /panel/heartbeat` every 30 s
- `GET /healthz` local health endpoint
- Exposes: system metrics (CPU, mem, disk) via `GET /metrics`

**Panel**
- CA key generation on first boot (stored encrypted in DB)
- `POST /servers/provision-token` → returns one-time token
- `POST /servers/register` (agent calls this) → signs agent cert, stores server record
- `GET /servers` → list of servers with status (online / offline)
- `GET /servers/:id` → detail with metrics snapshot
- `packages/agent-client` → mTLS HTTP client used by panel to call agent endpoints
- Server status updated from heartbeat; mark offline after 90 s of silence

**UI**
- Servers list page
- Add server page: shows the install one-liner
- Server detail page: status badge, metrics cards

### Exit Criteria
- Running the install command on a VM registers it in the panel
- Server appears as "online" in the UI
- Stopping the agent marks it "offline" within 2 min

---

## Phase 4 — Domain & DNS Management (Week 6)

**Goal:** Add a domain, manage DNS records via PowerDNS on a managed server.

### Deliverables
- Agent: PowerDNS management (create zone, CRUD records via PowerDNS HTTP API)
- Domain model in panel DB: domain, owner account, authoritative server, status
- `POST /domains` — add domain, trigger DNS TXT ownership challenge
- `POST /domains/:id/verify` — check TXT record, mark verified
- `GET/POST/PATCH/DELETE /domains/:id/records` — CRUD DNS records
- Bulk zone import endpoint (BIND zone file → panel creates records)
- UI: domains list, add domain wizard, DNS record editor (table + inline edit)

### Exit Criteria
- A domain can be added and verified end-to-end
- Adding an A record reflects in a `dig` query within 5 s (TTL permitting)
- Invalid record combinations (CNAME at apex) are rejected with a clear error

---

## Phase 5 — SSL Certificate Management (Week 7)

**Goal:** Let's Encrypt certificates are provisioned and auto-renewed.

### Deliverables
- Agent: `certbot` wrapper — request cert (HTTP-01 and DNS-01), renew, get status
- Panel: certificate model (domain, server, expiry, status, encrypted private key)
- `POST /certificates` — trigger cert request for a domain
- Renewal job (BullMQ, runs daily): finds certs expiring in ≤ 30 days, queues renewal
- `GET /certificates` — list with status badges
- UI: certificate list, status indicators, manual renew button

### Exit Criteria
- Certificate is provisioned and HTTPS works on the domain
- A cert expiring in < 30 days is automatically renewed by the background job
- Expired cert shows warning badge in UI

---

## Phase 6 — Virtual Host & PHP Management (Weeks 8–9)

**Goal:** Create web-accessible virtual hosts with Nginx and PHP-FPM.

### Deliverables
- Agent: Nginx config template engine (Jinja2-style via nunjucks)
  - Virtual host types: static, PHP-FPM, reverse proxy
  - Custom config injection block
  - `nginx -t` validation before apply; rollback on failure
- Agent: PHP-FPM pool management (create/update/delete pool, select PHP version)
- Panel: virtual host model linked to domain + server + certificate
- `POST /vhosts`, `GET /vhosts`, `PATCH /vhosts/:id`, `DELETE /vhosts/:id`
- `PATCH /vhosts/:id/php` — update PHP version / ini overrides
- UI: virtual hosts list, create/edit form, PHP settings tab

### Exit Criteria
- Creating a vhost serves the document root over HTTPS
- Changing PHP version restarts only the affected FPM pool, not Nginx
- Supplying a bad custom config block is rejected before applying

---

## Phase 7 — Database Management (Week 10)

**Goal:** Provision MySQL databases and users per customer.

### Deliverables
- Agent: MySQL provisioning (create DB, create user, grant/revoke, drop)
- Namespace enforcement: `c<accountId>_<name>` format, validated in panel
- `POST /databases`, `GET /databases`, `DELETE /databases/:id`
- `POST /database-users`, `PATCH /database-users/:id/grants`
- Usage polling job (every 15 min): store DB size in time-series table
- `POST /databases/:id/backup` — on-demand mysqldump, store to local path or S3
- `POST /databases/:id/restore` — restore from a backup record
- UI: databases list, create form, user/grants tab, backups tab

### Exit Criteria
- A database and user can be created and connected to from the server
- Size appears in the UI after the next polling cycle
- A backup can be created and restored

---

## Phase 8 — Email Hosting (Weeks 11–12)

**Goal:** Provision mailboxes, forwarders, DKIM, and spam filtering.

### Deliverables
- Agent: Postfix virtual mailbox config, Dovecot userdb/passdb, Rspamd integration
- Agent: DKIM key generation + DNS record creation (calls panel DNS API)
- `POST /mailboxes`, `GET /mailboxes`, `PATCH /mailboxes/:id`, `DELETE /mailboxes/:id`
- `POST /forwarders`, `GET /forwarders`, `DELETE /forwarders/:id`
- Auto-populate MX, SPF, DKIM, DMARC DNS records on mailbox creation if domain DNS
  is managed by the panel
- Quota enforcement via Dovecot quota plugin
- UI: mailboxes list, create form, quota bar, forwarders tab

### Exit Criteria
- A mailbox can send and receive email
- DKIM signature validates in an external mail header checker
- Sending to a full-quota mailbox bounces with a quota error

---

## Phase 9 — File Manager (Week 13)

**Goal:** Customers can browse and edit files through the browser.

### Deliverables
- Agent: file API endpoints — list, read, write, move, delete, mkdir; path jailed to
  account root (`/var/www/<domain>`)
- Panel: proxy file API calls through to the correct agent
- UI: file browser (tree + list view), drag-and-drop upload (chunked), Monaco editor
  for text files, context menu (rename, move, delete, download)

### Exit Criteria
- Customer can upload a file and have it appear at the virtual host URL
- Attempting to access a path outside the account root returns 403
- Files > 100 MB upload successfully via chunked upload

---

## Phase 10 — Billing & Plans (Week 14)

**Goal:** Define plans, assign customers, generate invoices.

### Deliverables
- Plan model: disk, bandwidth, max_domains, max_mailboxes, max_databases
- `POST /plans`, `GET /plans`, `PATCH /plans/:id`, `DELETE /plans/:id`
- `PATCH /accounts/:id/plan` — assign / change plan; quota changes pushed to agent
- Quota enforcement middleware: API rejects resource creation when account is over limit
- Usage metering: agents report Nginx bandwidth via log parsing every 15 min
- Monthly invoice generation job (BullMQ): PDF via `pdfkit`, stored and emailed
- `GET /invoices`, `GET /invoices/:id` (PDF download), `PATCH /invoices/:id/mark-paid`
- Usage dashboard: disk and bandwidth bars per customer
- Alert job: email admin when customer hits 90% of any quota

### Exit Criteria
- Assigning a plan with max 2 domains blocks creating a 3rd domain
- Invoice PDF contains correct line items
- Usage bar reflects actual disk usage reported by the agent

---

## Phase 11 — Panel HA Hardening (Week 15)

**Goal:** Multiple panel instances can run simultaneously without conflicts.

### Deliverables
- Session middleware reads/writes only from Redis (no in-process state)
- BullMQ job deduplication: cert renewal, usage polling, invoice jobs use unique job IDs
  so a second panel node does not double-process
- `GET /readyz` returns 503 until DB and Redis are reachable
- `GET /healthz` returns 200 always (process-level liveness)
- Docker Compose HA example: 2× panel nodes behind Nginx, shared PG + Redis
- Load balancer health check documentation

### Exit Criteria
- Starting two panel nodes and killing one mid-request does not lose session
- Running two panel nodes simultaneously does not double-send invoice emails
- `readyz` returns 503 immediately if Redis is down

---

## Phase 12 — Security Hardening & Audit (Week 16)

**Goal:** Meet all security baseline requirements before public use.

### Deliverables
- CSRF token middleware (`@fastify/csrf-protection`) on all mutations
- HTTP security headers middleware (CSP, X-Frame-Options, Referrer-Policy)
- Agent cert auto-rotation job (90-day cycle, panel CA re-signs)
- `pnpm audit` integrated into CI; build fails on high-severity advisories
- Penetration test checklist review (OWASP Top 10 mapped to code)
- Secrets documentation: which env vars are required, how to rotate them

### Exit Criteria
- `pnpm audit` reports zero high-severity advisories
- CSP header blocks inline script execution in browser
- Agent cert rotation completes without service interruption

---

## Milestone Summary

| Phase | Theme | Target Week |
|---|---|---|
| 0 | Project skeleton | 1 |
| 1 | Authentication | 2 |
| 2 | Admin shell & users | 3 |
| 3 | Server registration & agent | 4–5 |
| 4 | Domain & DNS | 6 |
| 5 | SSL certificates | 7 |
| 6 | Virtual hosts & PHP | 8–9 |
| 7 | Database management | 10 |
| 8 | Email hosting | 11–12 |
| 9 | File manager | 13 |
| 10 | Billing & plans | 14 |
| 11 | Panel HA hardening | 15 |
| 12 | Security hardening | 16 |

**Estimated total: ~16 weeks to a complete v1 suitable for self-hosted use.**

---

## Future Phases (v2+)

- Payment processor integration (Stripe)
- PostgreSQL database hosting (alongside MySQL)
- Apache virtual host support
- Multi-panel federation (multiple independent panels sharing a customer DB)
- Prometheus + Grafana dashboard bundle
- Managed Redis hosting
- Automated server provisioning (Hetzner / DigitalOcean API)
