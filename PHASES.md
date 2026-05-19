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
- Module manifest system: `apps/panel/src/modules/index.ts` registers feature modules;
  `agent/src/modules/index.ts` does the same for agent capabilities
- GitHub Actions CI: install → lint → typecheck → test (no tests yet, just green pipeline)

### Exit Criteria
- `pnpm dev` starts both API and UI
- `GET /healthz` returns `{ status: "ok" }`
- Disabling a module in the manifest removes its routes with no code change
- CI passes on every push

---

## Phase 1 — Authentication & FIDO2 (Week 2)

**Goal:** Users can register, log in, log out, use TOTP, and admins can use FIDO2 hardware keys.

### Deliverables
- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`
- JWT issued on login, stored in Redis with TTL
- Middleware that validates JWT on every protected route
- TOTP enrolment and verification endpoints (RFC 6238)
- FIDO2 / WebAuthn: passkey registration (`POST /auth/webauthn/register`) and
  assertion (`POST /auth/webauthn/authenticate`) using the `@simplewebauthn/server` library
- Admin accounts can be flagged as FIDO2-required; TOTP alone is rejected for those accounts
- Password reset flow (email token, requires SMTP config)
- Rate limiting on login endpoint (using `@fastify/rate-limit`)
- UI: Login page, Register page, TOTP setup page, FIDO2 key registration page,
  password reset flow
- Role enum seeded in DB (`admin`, `operator`, `customer`)
- Integration tests for auth endpoints

### Exit Criteria
- A user can complete the full login → TOTP → logout cycle
- An admin can register a FIDO2 key and use it to authenticate
- An admin account with FIDO2-required rejects a TOTP-only login
- Rate limiter blocks after 10 failures in 60 s

---

## Phase 2 — Admin Shell & User Management (Week 3)

**Goal:** Admins can manage users and see an overview dashboard.

### Deliverables
- Admin UI layout: sidebar nav (module-driven — nav items come from module manifest),
  breadcrumbs, top bar
- CRUD endpoints for users (`GET /users`, `POST /users`, `PATCH /users/:id`,
  `DELETE /users/:id`)
- Role-based access: operator and customer accounts scoped to their own data
- Customer account creation (name, email, plan assignment — plan is freeform text
  until Phase 11)
- Audit log table in DB; middleware writes every state-changing request
- `GET /audit-log` endpoint with filters (date, user, action)
- Persistent jobs panel widget: corner overlay showing in-flight and recently completed
  background jobs (SSE feed from `GET /jobs/:id/progress`)
- Basic dashboard: user count, server count (0 for now)

### Exit Criteria
- Admin can create an operator and a customer account
- Audit log records the creation events
- Operator cannot delete a user; request returns 403
- Jobs panel shows a placeholder entry to prove the SSE channel works

---

## Phase 3 — Server Registration & Agent (Weeks 4–5)

**Goal:** The panel can register a server and the agent can connect back.

### Deliverables

**Agent daemon (`agent/`)**
- Minimal Node.js Fastify service, runs as a systemd unit
- Module manifest mirrors the panel's: agent reports active capability modules to panel
  during registration
- One-time provisioning: accepts a token, generates a keypair, calls panel back
- mTLS certificate exchange with the panel's CA
- Heartbeat `POST /panel/heartbeat` every 30 s
- `GET /healthz` local health endpoint
- System metrics (CPU, mem, disk, network I/O per interface) via `GET /metrics`

**Panel**
- CA key generation on first boot (stored encrypted in DB)
- `POST /servers/provision-token` → returns one-time token
- `POST /servers/register` (agent calls this) → signs agent cert, stores server record
- `GET /servers` → list of servers with status (online / offline)
- `GET /servers/:id` → detail with metrics snapshot
- `packages/agent-client` → mTLS HTTP client used by panel to call agent endpoints
- Server status updated from heartbeat; mark offline after 90 s of silence

**Performance viewer**
- Real-time CPU/memory/disk/network graphs on server detail page (30 s rolling window,
  SSE-fed)
- Historical metrics stored for 30 days; date-range picker in UI
- Load average, uptime, top-5 CPU processes on server overview card

**Process manager**
- `GET /servers/:id/processes` → live process list from agent (PID, user, CPU%, MEM%,
  command)
- `DELETE /servers/:id/processes/:pid` with signal param (SIGTERM / SIGKILL)
- UI: process table with sort, filter, auto-refresh toggle (5 s interval)

**UI**
- Servers list page
- Add server page: shows install one-liner
- Server detail page: status badge, metrics graphs, process table

### Exit Criteria
- Running the install command on a VM registers it in the panel
- Server appears as "online" in the UI; metrics graphs update in real time
- Admin can kill a test process from the UI and verify it's gone
- Stopping the agent marks it "offline" within 2 min

---

## Phase 4 — Firewall Management (Week 6)

**Goal:** Admins can manage server firewall rules from the panel.

### Deliverables
- Agent: nftables ruleset management (fallback to ufw)
  - `GET /firewall/rules` → current ruleset
  - `PUT /firewall/rules` → replace ruleset atomically (restore on validation failure)
  - Default ruleset applied at agent install (allow 22, 80, 443, agent port; deny rest)
  - Ruleset persisted to DB; re-applied on agent boot
- Panel: rule model in PostgreSQL per server
- `GET/POST/DELETE /servers/:id/firewall/rules` CRUD
- Per-account IP blocklist: `POST /servers/:id/firewall/blocklist`
- UI: firewall rules table per server (drag to reorder), add rule form, blocklist tab

### Exit Criteria
- Adding a DROP rule for a port blocks connections to that port within 30 s
- Submitting an invalid ruleset leaves the previous rules intact
- Agent restart re-applies the stored ruleset automatically

---

## Phase 5 — Log Viewer (Week 7)

**Goal:** Admins and customers can view and search server logs in the browser.

### Deliverables
- Agent: log streaming endpoint — tails the requested log file and emits lines via SSE
  - Supported sources: Nginx access, Nginx error, PHP-FPM slow, PHP error,
    Postfix, Dovecot, Rspamd, syslog/journald
  - Path jailing: customer log requests are restricted to their own vhost/mailbox logs
- Panel: proxy SSE stream from agent to browser
- `GET /servers/:id/logs?source=nginx-access&domain=example.com` → SSE
- UI: log viewer page per server — source selector, real-time stream, pause button,
  keyword filter (regex), log-level filter, date range

### Exit Criteria
- Nginx access log streams in real time as requests hit the server
- Customer can only see logs for their own domains; accessing another domain's log
  returns 403
- Regex filter hides non-matching lines client-side with no additional requests

---

## Phase 6 — Domain & DNS Management (Week 8)

**Goal:** Add a domain, manage DNS records via PowerDNS on a managed server.

### Deliverables
- Agent: PowerDNS management module (create zone, CRUD records via PowerDNS HTTP API)
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

## Phase 7 — SSL Certificate Management (Week 9)

**Goal:** Let's Encrypt certificates are provisioned and auto-renewed.

### Deliverables
- Agent: certbot wrapper — request cert (HTTP-01 and DNS-01), renew, get status
- Panel: certificate model (domain, server, expiry, status, encrypted private key)
- `POST /certificates` — trigger cert request; job with SSE progress
- Renewal job (BullMQ, runs daily): finds certs expiring in ≤ 30 days, queues renewal
- `GET /certificates` — list with status badges
- UI: certificate list, status indicators, manual renew button

### Exit Criteria
- Certificate is provisioned and HTTPS works on the domain
- A cert expiring in < 30 days is automatically renewed by the background job
- Expired cert shows warning badge in UI
- Progress SSE shows cert issuance steps (challenge, validation, download)

---

## Phase 8 — Virtual Host & PHP Management (Weeks 10–11)

**Goal:** Create web-accessible virtual hosts with Nginx and PHP-FPM.

### Deliverables
- Agent: Nginx config template engine (nunjucks)
  - Virtual host types: static, PHP-FPM, reverse proxy
  - Custom config injection block
  - `nginx -t` validation before apply; rollback on failure
  - Account throughput limit: `limit_rate` directive per vhost from plan settings
- Agent: PHP-FPM pool management (create/update/delete pool, select PHP version)
- Panel: virtual host model linked to domain + server + certificate
- `POST /vhosts`, `GET /vhosts`, `PATCH /vhosts/:id`, `DELETE /vhosts/:id`
- `PATCH /vhosts/:id/php` — update PHP version / ini overrides
- `PATCH /vhosts/:id/speed-limit` — set throughput cap
- UI: virtual hosts list, create/edit form, PHP settings tab, speed limit field

### Exit Criteria
- Creating a vhost serves the document root over HTTPS
- Changing PHP version restarts only the affected FPM pool, not Nginx
- Supplying a bad custom config block is rejected before applying
- Setting a speed limit of 1 Mbps observably throttles downloads

---

## Phase 9 — Database Management & phpMyAdmin (Week 12)

**Goal:** Provision MySQL databases and users; provide phpMyAdmin access.

### Deliverables
- Agent: MySQL provisioning module (create DB, create user, grant/revoke, drop)
- Namespace enforcement: `c<accountId>_<name>` format validated in panel
- `POST /databases`, `GET /databases`, `DELETE /databases/:id`
- `POST /database-users`, `PATCH /database-users/:id/grants`
- Usage polling job (every 15 min): store DB size in time-series table
- `POST /databases/:id/backup` — on-demand mysqldump → progress SSE
- `POST /databases/:id/restore` — restore from backup record → progress SSE
- Agent: phpMyAdmin install/update via panel-triggered job; SSO token endpoint
- `GET /servers/:id/phpmyadmin/token` → short-lived SSO token for the browser
- UI: databases list, create form, user/grants tab, backups tab, "Open phpMyAdmin" button

### Exit Criteria
- A database and user can be created and connected to from the server
- phpMyAdmin opens and is scoped to only the account's databases
- Backup and restore complete with progress visible in jobs panel

---

## Phase 10 — Email Hosting & Webmail (Weeks 13–14)

**Goal:** Provision mailboxes, DKIM, spam filtering, Roundcube webmail, and ClamAV.

### Deliverables

**Email core**
- Agent: Postfix virtual mailbox config, Dovecot userdb/passdb, Rspamd integration
- Agent: DKIM key generation + auto-add public key to DNS via panel DNS API
- `POST /mailboxes`, `GET /mailboxes`, `PATCH /mailboxes/:id`, `DELETE /mailboxes/:id`
- `POST /forwarders`, `GET /forwarders`, `DELETE /forwarders/:id`
- Auto-populate MX, SPF, DKIM, DMARC on mailbox creation
- Quota enforcement via Dovecot quota plugin

**Roundcube**
- Agent: Roundcube install/update module; configures IMAP+SMTP automatically
- `POST /servers/:id/roundcube/install` → progress SSE job
- Accessible at `webmail.<domain>` via a panel-generated Nginx vhost
- UI: webmail section in email management, install/update button, version display

**ClamAV**
- Agent: ClamAV + clamav-milter install module; freshclam daily schedule
- `POST /servers/:id/clamav/install` → progress SSE
- `POST /accounts/:id/clamav/scan` → on-demand scan of document root → progress SSE;
  results in log viewer
- UI: ClamAV status card per server (running, definition age, last scan); scan button

### Exit Criteria
- A mailbox can send and receive email; DKIM validates in an external checker
- Roundcube login works without manual configuration
- ClamAV blocks a test EICAR attachment from being delivered
- Sending to a full-quota mailbox bounces with quota error

---

## Phase 11 — File Manager (Week 15)

**Goal:** Customers can browse and edit files through the browser.

### Deliverables
- Agent: file API module — list, read, write, move, delete, mkdir; path jailed to
  account root (`/var/www/<domain>`)
- Panel: proxy file API calls through to the correct agent
- UI: file browser (tree + list view), drag-and-drop upload (chunked, progress SSE),
  Monaco editor for text files, context menu (rename, move, delete, download)

### Exit Criteria
- Customer can upload a file and have it appear at the virtual host URL
- Attempting to access a path outside the account root returns 403
- Files > 100 MB upload successfully; progress shown in jobs panel

---

## Phase 12 — Application Installer — WordPress (Week 16)

**Goal:** Customers can install WordPress with one click.

### Deliverables
- Agent: `agent/src/modules/installers/wordpress.ts` — download, extract, configure,
  create DB+user, set permissions; progress via SSE
- Panel: installed apps table (account, app name, version, path, update available)
- `POST /apps/install` → queued job with SSE progress
- `POST /apps/:id/update` → one-click update preserving `wp-content` and DB
- Version check job (daily): compare installed version against WordPress releases API
- UI: app installer page, installed apps list, update badge, install form

### Exit Criteria
- WordPress installs and is accessible at the chosen domain path
- Admin panel login works immediately after install
- "Update available" badge appears when a newer WordPress version exists
- One-click update completes without losing posts or media

---

## Phase 13 — Billing, Stripe & Customer Portal (Weeks 17–18)

**Goal:** Full billing cycle with Stripe payments and self-service customer portal.

### Deliverables

**Plans & limits**
- Plan model: disk, bandwidth, throughput, max_domains, max_mailboxes, max_databases
- Quota enforcement middleware: API rejects resource creation when account is over limit
- `POST/GET/PATCH/DELETE /plans`; `PATCH /accounts/:id/plan`

**Stripe integration**
- `POST /billing/setup-intent` → Stripe SetupIntent for card capture
- `POST /billing/checkout` → Stripe Checkout session for new subscriptions
- Stripe webhook handler: `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.deleted`
- Stripe API keys configured via admin settings page (test/live toggle)

**Invoicing**
- Monthly invoice generation job (BullMQ): PDF via pdfkit; stored and emailed
- `GET /invoices`, `GET /invoices/:id` (PDF download), `PATCH /invoices/:id/mark-paid`
- Usage metering: bandwidth from Nginx log parsing every 15 min; disk every 15 min

**Customer portal**
- Dedicated portal UI section (accessible to `customer` role)
- Account summary: plan, usage bars (disk, bandwidth), billing status
- Invoice list (past invoices, PDF download, status)
- Update payment method (Stripe-hosted flow)
- Plan upgrade/downgrade request flow
- Service catalogue: order additional domains, mailboxes, databases
- Cancellation request flow (grace period config)
- Self-service email password change and forwarder management

### Exit Criteria
- Customer can pay an invoice with a test card and invoice status updates to "paid"
- Stripe webhook correctly marks invoice paid within 5 s of Stripe event
- Customer cannot create a 3rd domain when their plan allows max 2
- Customer portal loads correctly when logged in as a `customer` role user

---

## Phase 14 — Network Interface Management (Week 19)

**Goal:** Admins can manage virtual network adapters and public IP pools.

### Deliverables
- Agent: network interface module using iproute2
  - `GET /network/interfaces` → list interfaces with IP/state
  - `POST /network/interfaces` → create dummy/veth adapter
  - `PUT /network/interfaces/:name/address` → assign IP/CIDR/gateway
  - Changes persisted in netplan (Ubuntu) or NetworkManager
- Panel: IP address pool model (address, prefix, gateway, assigned-to)
- `GET/POST/DELETE /ip-pool` — manage the pool
- `POST /ip-pool/:id/assign` — assign IP to an account or server interface
- UI: server network tab (interface list, add interface form, IP assignment);
  IP pool management page in admin area

### Exit Criteria
- Admin creates a dummy interface on a test server; it appears in `ip addr` output
- Assigning an IP to the interface survives an agent restart (netplan persist)
- IP pool shows assignment history in the audit log

---

## Phase 15 — Account Backup & Restore (Week 20)

**Goal:** Full account backups (files + databases) with S3 support and restore.

### Deliverables
- Agent: backup module — tar.gz of document root + mysqldump of all account DBs,
  combined into a single archive with manifest
- `POST /backups` — trigger on-demand backup → queued job with SSE progress
- `POST /backups/schedule` — define backup schedule per account or globally
- S3-compatible upload (endpoint, bucket, access key from admin settings)
- `GET /backups` — list with size, timestamp, storage location
- `POST /backups/:id/restore` — full or partial restore → queued job with SSE progress
  (options: files-only, databases-only, specific DB by name)
- UI: backups tab per account, on-demand trigger, schedule config, restore dialog with
  partial restore options, progress in jobs panel

### Exit Criteria
- A full backup of a WordPress site restores to a clean state (files + DB intact)
- Partial restore of only the database leaves existing files unchanged
- Backup upload to an S3-compatible bucket (MinIO in dev) succeeds
- Progress SSE reports percent complete and current file/table name

---

## Phase 16 — Account Import — cPanel & CWP (Weeks 21–22)

**Goal:** Migrate accounts from cPanel and Control Web Panel without manual steps.

### Deliverables

**cPanel importer**
- Agent/panel: cPanel `.tar.gz` archive parser (virtual hosts, DNS zones, MySQL DBs+users,
  email accounts, forwarders, cron jobs, SSL certs)
- `POST /import/cpanel` → upload archive → queued job with per-resource SSE progress
- Admin review screen: mapping of imported resources to SuperHost equivalents,
  plan limit check before apply
- Partial failures logged; import continues for remaining resources

**CWP importer**
- Agent/panel: CWP export format parser
- Apache → Nginx config translation: panel maps common directives; unknown directives
  flagged in a post-import review list
- `POST /import/cwp` → same flow as cPanel importer
- UI: import wizard (upload, review, confirm, progress, post-import report)

### Exit Criteria
- A cPanel account archive restores with DNS, web, databases, and email all functional
- An Apache directive with no Nginx equivalent appears in the review list, not silently
  dropped or applied incorrectly
- SSE progress shows per-resource status (pending / success / error)

---

## Phase 17 — Theming & White-Label (Week 23)

**Goal:** Operators can install custom themes and white-label the panel.

### Deliverables
- Theme format: directory containing `variables.css`, `logo.svg`, `favicon.ico`,
  optional `login-bg.jpg`
- `POST /themes` — upload theme zip → extract, validate, store
- `PATCH /settings/active-theme` — switch active theme
- `GET /themes` — list installed themes
- White-label settings: panel name, support URL, from-email name (admin settings page)
- UI applies active theme via injected CSS custom properties; no component rebuild needed
- Default theme ships as the reference implementation

### Exit Criteria
- Uploading a theme with a custom colour palette and logo changes the appearance for all
  users including the customer portal
- White-label name replaces "SuperHost" in the browser tab, email footer, and login page
- Reverting to the default theme works without a panel restart

---

## Phase 18 — Panel HA Hardening (Week 24)

**Goal:** Multiple panel instances can run simultaneously without conflicts.

### Deliverables
- Session middleware reads/writes only from Redis (no in-process state)
- BullMQ job deduplication: cert renewal, usage polling, invoice jobs use unique job IDs
  so a second panel node does not double-process
- `GET /readyz` returns 503 until DB and Redis are reachable
- `GET /healthz` returns 200 always (process-level liveness)
- Docker Compose HA example: 2× panel nodes behind Nginx, shared PostgreSQL + Redis
- Load balancer health check documentation

### Exit Criteria
- Starting two panel nodes and killing one mid-request does not lose session
- Running two panel nodes simultaneously does not double-send invoice emails
- `readyz` returns 503 immediately if Redis is down

---

## Phase 19 — Security Hardening & Audit (Week 25)

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
| 0 | Project skeleton + module system | 1 |
| 1 | Authentication + FIDO2 | 2 |
| 2 | Admin shell + users + jobs panel | 3 |
| 3 | Server registration, agent, performance viewer, process manager | 4–5 |
| 4 | Firewall management | 6 |
| 5 | Log viewer | 7 |
| 6 | Domain & DNS | 8 |
| 7 | SSL / Let's Encrypt | 9 |
| 8 | Virtual hosts, PHP & speed limits | 10–11 |
| 9 | Database management & phpMyAdmin | 12 |
| 10 | Email, Roundcube & ClamAV | 13–14 |
| 11 | File manager | 15 |
| 12 | WordPress installer | 16 |
| 13 | Billing, Stripe & customer portal | 17–18 |
| 14 | Network interface & IP management | 19 |
| 15 | Account backup & restore | 20 |
| 16 | cPanel & CWP account importer | 21–22 |
| 17 | Theming & white-label | 23 |
| 18 | Panel HA hardening | 24 |
| 19 | Security hardening | 25 |

**Estimated total: ~25 weeks to a complete v1.**

---

## Future Phases (v2+)

- PostgreSQL database hosting (alongside MySQL)
- Apache virtual host support
- Multi-panel federation (multiple independent panels sharing a customer DB)
- Prometheus + Grafana dashboard bundle
- Managed Redis hosting
- Automated server provisioning (Hetzner / DigitalOcean / Vultr API)
- Additional one-click app installers (Joomla, Drupal, Magento, Ghost)
- Mobile app for admin alerts and quick actions
