# SuperHost — Requirements

## 1. Authentication & Access Control

### 1.1 Authentication
- R-AUTH-01: Users authenticate with email + password (bcrypt hashed).
- R-AUTH-02: Sessions are JWT-based, stored in Redis, with configurable TTL (default 8 h).
- R-AUTH-03: Support TOTP two-factor authentication (RFC 6238).
- R-AUTH-04: Support FIDO2 / WebAuthn hardware security key authentication for `admin`
  and `operator` roles (passkey registration, assertion, resident-key support).
- R-AUTH-05: Failed login attempts are rate-limited and locked after N failures (configurable).
- R-AUTH-06: Password reset via email link (time-limited, single-use token).
- R-AUTH-07: Admin accounts may be configured to require FIDO2 as the second factor;
  TOTP alone is not accepted for those accounts.

### 1.2 Roles & Permissions
- R-RBAC-01: Built-in roles: `admin`, `operator`, `customer`.
- R-RBAC-02: `admin` has unrestricted access to all resources and servers.
- R-RBAC-03: `operator` can manage servers, domains, and accounts but cannot change
  billing plans or create other operators.
- R-RBAC-04: `customer` can only see and manage resources assigned to their account.
- R-RBAC-05: All API endpoints enforce role checks; unauthorized requests return 403.

---

## 2. Server & Agent Management

### 2.1 Agent Daemon
- R-AGENT-01: A lightweight Node.js daemon (`superhost-agent`) runs on each managed server.
- R-AGENT-02: The panel issues a one-time provisioning token; the agent calls back to the
  panel to register and exchange mTLS certificates.
- R-AGENT-03: Agent exposes a local REST API (localhost only); the panel connects via a
  reverse tunnel or direct HTTPS + mTLS.
- R-AGENT-04: Agent reports heartbeat and basic system metrics (CPU, memory, disk, load)
  to the panel every 30 s.
- R-AGENT-05: Agent operations are idempotent — re-running any apply command leaves
  the server in the same state.

### 2.2 Server Lifecycle
- R-SRV-01: Admins can add a new server by generating a provisioning token and running
  the one-liner install command on the target server.
- R-SRV-02: Servers can be placed into maintenance mode, which blocks new resource
  creation on that server.
- R-SRV-03: Servers can be removed; the panel warns if active resources still reside there.
- R-SRV-04: The panel displays server health status (online / degraded / offline) based on
  heartbeat recency.

### 2.3 Performance Viewer
- R-PERF-01: The server detail page shows real-time graphs (30-second rolling window) for
  CPU usage, memory usage, disk I/O, and network I/O per interface.
- R-PERF-02: Historical metrics are stored for 30 days and browsable with a date-range picker.
- R-PERF-03: Per-account bandwidth throughput is visible to admins and to the account owner.
- R-PERF-04: Load average, uptime, and top-5 CPU-consuming processes are displayed on the
  server overview card.

### 2.4 Process Manager
- R-PROC-01: The panel provides a live process list for each server (PID, user, CPU%, MEM%,
  command), sorted by CPU or memory.
- R-PROC-02: Admins and operators can send SIGTERM or SIGKILL to any process from the UI.
- R-PROC-03: The process list auto-refreshes every 5 s; the user can pause refresh.
- R-PROC-04: Filtering by username or command substring is supported.

### 2.5 Log Viewer
- R-LOG-01: The panel provides a browser-based log viewer for each server, accessible to
  admins and operators.
- R-LOG-02: Supported log sources: Nginx access log, Nginx error log, PHP-FPM slow log,
  PHP error log, Postfix log, Dovecot log, Rspamd log, syslog/journald.
- R-LOG-03: Logs are streamed in real time via SSE (Server-Sent Events); the user can
  pause streaming and search within the buffered output.
- R-LOG-04: Log lines can be filtered by log level, date range, and keyword (regex).
- R-LOG-05: Customers can view only the logs for their own virtual hosts and mailboxes.

---

## 3. Domain & DNS Management

### 3.1 Domains
- R-DNS-01: Domains are registered in the panel and associated with a customer account.
- R-DNS-02: A domain can designate one of the managed servers as its primary nameserver host.
- R-DNS-03: Domain ownership is verified via a DNS TXT record challenge before activation.

### 3.2 DNS Records
- R-DNS-04: Supported record types: A, AAAA, CNAME, MX, TXT, NS, SRV, CAA.
- R-DNS-05: Records are managed via the PowerDNS HTTP API on the target server.
- R-DNS-06: TTL is configurable per record (min 60 s, max 86400 s).
- R-DNS-07: The panel enforces basic sanity checks (e.g., no CNAME alongside other records
  at zone apex).
- R-DNS-08: Bulk import/export of zone files in BIND format.

---

## 4. SSL Certificate Management

- R-SSL-01: Let's Encrypt certificates are provisioned automatically on domain creation
  if the domain resolves to the server.
- R-SSL-02: DNS-01 challenge is supported for wildcard certificates.
- R-SSL-03: Certificates are renewed automatically 30 days before expiry via a scheduled
  job on the panel.
- R-SSL-04: Certificate status (valid, expiring-soon, expired, pending) is surfaced per
  virtual host in the UI.
- R-SSL-05: Custom (uploaded) certificates are also supported.
- R-SSL-06: Certificate private keys are stored encrypted at rest (AES-256-GCM, key from
  environment-injected secret).

---

## 5. Web Server Management

### 5.1 Virtual Hosts
- R-WEB-01: Each virtual host is associated with a domain and a server.
- R-WEB-02: The panel generates Nginx server blocks from templates and applies them via
  the agent.
- R-WEB-03: Supported virtual host types: static site, PHP-FPM application, reverse proxy.
- R-WEB-04: Document root is configurable; default `/var/www/<domain>/public`.
- R-WEB-05: Custom Nginx directives can be injected into a designated "custom config" block
  without overwriting panel-managed sections.
- R-WEB-06: Reloading Nginx (not restarting) is triggered after config changes.

### 5.2 PHP
- R-PHP-01: The agent manages PHP-FPM pools; each virtual host can select an installed
  PHP version (e.g., 8.2, 8.3).
- R-PHP-02: Common php.ini overrides (memory_limit, upload_max_filesize, max_execution_time)
  are configurable per virtual host.
- R-PHP-03: Adding a new PHP version to a server is done via the panel (agent installs
  the appropriate package).

### 5.3 Account Throughput Limits
- R-SPEED-01: Each customer account can have a maximum outbound bandwidth rate applied
  at the Nginx level using `limit_rate` directives per virtual host.
- R-SPEED-02: Throughput limits are defined in the billing plan (e.g., 10 Mbps) and
  can be overridden per account by an admin.
- R-SPEED-03: Changing a speed limit triggers a Nginx reload on the affected server;
  no full restart is required.

---

## 6. Database Management

### 6.1 MySQL / MariaDB
- R-DB-01: The panel can provision databases and users on any registered server running
  the agent with MySQL support enabled.
- R-DB-02: Database names and usernames are namespaced per customer account to avoid
  conflicts (e.g., `c42_myapp`).
- R-DB-03: The panel can grant and revoke per-database permissions for users.
- R-DB-04: Database size and row counts are reported in the UI (polled every 15 min).
- R-DB-05: The panel offers on-demand and scheduled mysqldump backups, stored either
  locally or in an S3-compatible bucket.
- R-DB-06: Restoring a backup re-creates the database from the dump file.

### 6.2 phpMyAdmin
- R-PHPMYA-01: The agent can install phpMyAdmin as a server-level tool accessible under
  a configurable path (e.g., `https://<server-hostname>/phpmyadmin`).
- R-PHPMYA-02: Access is restricted by IP allowlist and requires authentication via a
  panel-issued single-sign-on token (no direct DB root password in the browser).
- R-PHPMYA-03: Per-account phpMyAdmin sessions are scoped to only the databases owned
  by that account.

---

## 7. Email Hosting

### 7.1 Mailboxes
- R-MAIL-01: Mailboxes are provisioned via the agent (Postfix + Dovecot + virtual users).
- R-MAIL-02: Each mailbox has a configurable quota (default from the billing plan).
- R-MAIL-03: Passwords are stored using Dovecot's `SHA512-CRYPT` scheme.
- R-MAIL-04: Mailbox creation automatically adds the necessary DNS records (MX, SPF, DKIM,
  DMARC) if the domain's DNS is managed by the panel.

### 7.2 Forwarders & Aliases
- R-MAIL-05: Email addresses can be forwarded to one or more external addresses without
  creating a local mailbox.
- R-MAIL-06: Catch-all addresses are supported per domain.

### 7.3 Anti-Spam
- R-MAIL-07: Rspamd is used for inbound and outbound spam scoring.
- R-MAIL-08: Per-domain DKIM signing keys are generated by the agent and the public key
  is automatically added as a DNS TXT record.
- R-MAIL-09: Spam thresholds are configurable per server by an admin.

### 7.4 Webmail — Roundcube
- R-WM-01: The agent can install and configure Roundcube as a webmail client, accessible
  at `https://webmail.<domain>` or a configurable subdomain.
- R-WM-02: Roundcube is configured automatically with the correct IMAP and SMTP settings
  for the server; no manual configuration is required after installation.
- R-WM-03: Roundcube version management (install, update) is handled via the panel UI.
- R-WM-04: Each managed server can have one shared Roundcube installation serving all
  domains on that server.

### 7.5 Antivirus — ClamAV
- R-AV-01: The agent can install ClamAV and integrate it with Postfix via clamav-milter.
- R-AV-02: Inbound and outbound messages are scanned; infected messages are quarantined
  and the recipient is notified.
- R-AV-03: ClamAV virus definitions are updated automatically (freshclam) on a daily
  schedule managed by the panel.
- R-AV-04: The panel displays ClamAV status (running / stopped, definition age, last scan
  count) per server.
- R-AV-05: On-demand filesystem scans can be triggered from the panel for a specific
  account's document root; results are shown in the log viewer.

---

## 8. File Manager

- R-FILE-01: A browser-based file manager allows customers to browse, upload, download,
  rename, move, delete, and edit plain-text files within their document root.
- R-FILE-02: File operations are proxied through the panel API → agent; the agent
  enforces that paths stay within the account's allowed root.
- R-FILE-03: File uploads are chunked (max 100 MB per chunk, unlimited total).
- R-FILE-04: A basic code editor (Monaco) is embedded for editing text files in-browser.

---

## 9. Application Installer

- R-APP-01: The panel provides a one-click application installer (analogous to Softaculous)
  accessible to customers.
- R-APP-02: v1 supported applications: WordPress, with the framework designed to add more.
- R-APP-03: WordPress installation: downloads latest release, creates a database and user,
  configures `wp-config.php`, sets file permissions, and optionally installs a starter theme.
- R-APP-04: Installed applications are listed per account with version, installation path,
  and an "update available" badge when a newer release exists.
- R-APP-05: One-click update applies the new release in-place, preserving `wp-content`
  and the database.
- R-APP-06: Each application installer is defined as a module file under
  `agent/src/installers/<app>.ts`; adding new installers does not require changes to
  core agent code.

---

## 10. Firewall Management

- R-FW-01: The agent manages the server firewall using `nftables` (with a fallback to
  `ufw` if nftables is unavailable).
- R-FW-02: The panel provides a rule editor: add, remove, and reorder inbound/outbound
  rules per server (protocol, source IP/CIDR, destination port, action: ACCEPT/DROP/REJECT).
- R-FW-03: Default rule set on agent install: allow SSH (22), HTTP (80), HTTPS (443),
  panel agent port; deny everything else inbound.
- R-FW-04: Rules are applied atomically; if validation fails the previous ruleset is
  restored automatically.
- R-FW-05: Per-account IP blocking: admins can add an IP or CIDR to a server-level
  blocklist, taking effect within 30 s.
- R-FW-06: The panel stores the authoritative rule set in PostgreSQL; the agent re-applies
  it on boot so reboots don't leave the server open.

---

## 11. Antivirus (ClamAV)

See section 7.5 (ClamAV is integrated at the email layer; on-demand filesystem scans
are also available per account).

---

## 12. Network Interface Management

- R-NET-01: The agent can enumerate existing physical and virtual network interfaces on
  the server and report their configuration (name, MAC, IPs, state) to the panel.
- R-NET-02: Admins can add a virtual Ethernet interface (e.g., a `dummy` or `veth`
  adapter) to a server from the panel.
- R-NET-03: IP address assignment: admins can assign an IPv4 or IPv6 address with prefix
  length (CIDR) and optional gateway to any interface on a registered server.
- R-NET-04: Changes are applied via the agent using `ip` / `iproute2` commands and
  persisted in `netplan` (Ubuntu) or an equivalent mechanism so they survive reboots.
- R-NET-05: Admins can maintain a pool of public IP addresses in the panel and assign
  them to customer accounts or directly to server interfaces.
- R-NET-06: IP assignment history is recorded in the audit log.

---

## 13. Account Backup & Restore

- R-BKP-01: A full account backup includes all virtual host files and all databases
  belonging to the account, packaged as a single compressed archive.
- R-BKP-02: Backups can be triggered on-demand or on a schedule (daily/weekly) defined
  per account or globally by plan.
- R-BKP-03: Backup archives are stored locally on the server or uploaded to an
  S3-compatible object store (configurable endpoint, bucket, credentials).
- R-BKP-04: The panel lists available backups per account with size, timestamp, and
  storage location.
- R-BKP-05: Restore: the customer or admin selects a backup; the agent extracts files
  into the document root and imports databases; existing data is overwritten after
  confirmation.
- R-BKP-06: Partial restore is supported: restore only files, only databases, or only
  specific databases by name.
- R-BKP-07: Backup and restore operations report real-time progress via SSE
  (percent complete, current file/table being processed).

---

## 14. Billing & Customer Accounts

### 14.1 Plans
- R-BILL-01: Admins define hosting plans with named resource limits:
  disk quota, bandwidth quota, throughput limit, max domains, max mailboxes,
  max databases, max email accounts.
- R-BILL-02: Customers are assigned exactly one active plan at a time.
- R-BILL-03: Plan changes (upgrade / downgrade) take effect immediately; quota changes
  are enforced by the agent within 5 min.

### 14.2 Customers
- R-BILL-04: Each customer account has a name, email, and billing contact.
- R-BILL-05: An admin can suspend or terminate a customer account; suspension disables
  access but retains data; termination schedules data deletion after a grace period.

### 14.3 Invoicing
- R-BILL-06: The panel generates monthly invoices as PDF, listing line items per resource.
- R-BILL-07: Invoices can be paid via Stripe (card, saved payment method); the Stripe
  Customer ID and payment method are stored against the account.
- R-BILL-08: Email notifications are sent for invoice generation, payment confirmation,
  payment failure, and upcoming renewals.
- R-BILL-09: Invoices can also be marked paid manually by an admin (for cash/bank transfer).

### 14.4 Stripe Integration
- R-STRIPE-01: Stripe is integrated for card payment processing (Stripe Checkout or
  Stripe Elements embedded in the customer portal).
- R-STRIPE-02: Webhooks from Stripe update invoice and subscription status in real time
  (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`).
- R-STRIPE-03: Admins configure Stripe API keys via environment variables; test/live mode
  is toggled via an admin settings page.
- R-STRIPE-04: Customer payment methods are managed entirely on Stripe's side; no raw
  card data is stored in the panel database.

### 14.5 Usage Metering
- R-BILL-10: Disk and bandwidth usage per customer is tracked and displayed in the UI.
- R-BILL-11: Agents report bandwidth counters (from Nginx access logs) every 15 min.
- R-BILL-12: Admins receive an alert when a customer exceeds 90% of any plan quota.

### 14.6 Self-Service Customer Portal
- R-PORTAL-01: Customers have a dedicated portal showing their account summary,
  resource usage, and billing status.
- R-PORTAL-02: Customers can view all past invoices and download them as PDF.
- R-PORTAL-03: Customers can update their payment method via the Stripe-hosted flow.
- R-PORTAL-04: Customers can request a plan upgrade or downgrade; the request is auto-
  approved if the plan change is configured as self-service by the admin.
- R-PORTAL-05: Customers can order additional services (extra domains, mailboxes,
  databases) from a service catalogue defined by the admin.
- R-PORTAL-06: Customers can submit a cancellation request; the admin receives a
  notification and the account enters a configurable grace period before termination.
- R-PORTAL-07: Customers can manage their own email accounts (change password, adjust
  forwarders) within their plan limits without admin involvement.

---

## 15. Account Migration / Import

### 15.1 cPanel Importer
- R-IMP-CPN-01: The panel can import a full cPanel account backup archive
  (`.tar.gz` in cPanel backup format).
- R-IMP-CPN-02: Imported data: virtual host config, DNS zones, MySQL databases and
  users, email accounts and forwarders, cron jobs, SSL certificates.
- R-IMP-CPN-03: The importer maps cPanel resource limits to SuperHost plan limits;
  an admin reviews and confirms before applying.
- R-IMP-CPN-04: Import progress is shown in real time (SSE); errors for individual
  resources do not abort the entire import.

### 15.2 Control Web Panel (CWP) Importer
- R-IMP-CWP-01: The panel can import an account exported from Control Web Panel.
- R-IMP-CWP-02: Imported data: virtual hosts (Apache config translated to Nginx),
  DNS zones, MySQL databases and users, email accounts.
- R-IMP-CWP-03: Apache-specific directives that have no Nginx equivalent are flagged
  in a post-import review list for manual resolution.
- R-IMP-CWP-04: Import progress follows the same SSE pattern as the cPanel importer.

---

## 16. Panel High Availability

- R-HA-01: The panel API is stateless; multiple instances can run behind a load balancer.
- R-HA-02: Sessions are stored in Redis (single Redis instance or Sentinel cluster).
- R-HA-03: Background jobs (cert renewal, usage collection, backup scheduling) use a
  distributed job queue (BullMQ on Redis) so only one panel node processes each job.
- R-HA-04: The panel's PostgreSQL database is the recommended HA boundary; operators
  should use PostgreSQL Streaming Replication or a managed PostgreSQL service.
- R-HA-05: If the primary panel node is unreachable, any other node can serve all requests
  without warm-up or manual intervention.
- R-HA-06: Panel nodes emit health-check endpoints (`/healthz`, `/readyz`) suitable for
  use with HAProxy or Nginx upstream health checks.

---

## 17. Audit & Observability

- R-AUDIT-01: All state-changing API calls are recorded in an audit log: who, what, when,
  source IP, result.
- R-AUDIT-02: Audit log is append-only from the application's perspective (no delete API).
- R-AUDIT-03: Audit log is queryable by date range, user, resource type, and action.
- R-OBS-01: Panel exposes a Prometheus metrics endpoint (`/metrics`): request rates,
  latencies, job queue depths, agent connection counts.
- R-OBS-02: Agent exposes its own `/metrics` endpoint for host-level metrics.

---

## 18. Theming & Modularity

### 18.1 Custom Themes
- R-THEME-01: The UI supports swappable themes; a theme is a directory containing CSS
  variables, a logo asset, and an optional favicon.
- R-THEME-02: Themes are uploaded via the admin UI and stored server-side; the active
  theme is applied globally to all UI pages including the customer portal.
- R-THEME-03: The default theme uses CSS custom properties so that colour and typography
  can be overridden without touching component code.
- R-THEME-04: White-labelling: the panel name, logo, and support URL are configurable
  from the admin settings page (no code change required).

### 18.2 Modular Architecture
- R-MOD-01: Each major feature domain (DNS, email, firewall, databases, backups, etc.)
  is implemented as a self-contained module with its own directory under
  `apps/panel/src/modules/<feature>/` and `agent/src/modules/<feature>/`.
- R-MOD-02: A module exports: router (Fastify plugin), service layer, DB schema slice,
  and its own Zod validation schemas. No module directly imports internals of another.
- R-MOD-03: Modules are registered at startup via a manifest file; disabling a module
  in the manifest removes its routes and UI nav items without requiring code changes.
- R-MOD-04: Agent capability modules follow the same pattern under
  `agent/src/modules/<feature>/`; the agent reports which modules are active to the
  panel during registration.

---

## 19. Long-Running Task Progress

- R-PROG-01: Any operation that may take more than 2 s (backup, restore, SSL issuance,
  app install, account import, ClamAV scan) is executed as a background job.
- R-PROG-02: Progress is streamed to the browser via SSE on a job-specific endpoint
  (`GET /jobs/:id/progress`).
- R-PROG-03: Progress events include: percent complete (0–100), current step description,
  log lines, and a terminal event with success or error detail.
- R-PROG-04: A persistent jobs panel in the UI corner shows in-flight and recent
  completed jobs; clicking a job opens the progress stream.
- R-PROG-05: Jobs survive panel restarts; if a job was running and the panel restarted,
  its status is reconciled with the agent on reconnect.

---

## 20. Security Baseline

- R-SEC-01: All panel ↔ browser traffic is HTTPS; HTTP redirects to HTTPS.
- R-SEC-02: All panel ↔ agent traffic uses mutual TLS; agent rejects requests without a
  valid panel certificate.
- R-SEC-03: Agent certificates are rotated automatically every 90 days.
- R-SEC-04: The panel runs as a non-root user; the agent runs as root only where
  necessary (config writes, service reloads) and drops to a service user otherwise.
- R-SEC-05: CSRF protection is applied to all state-changing endpoints.
- R-SEC-06: Content Security Policy, X-Frame-Options, and Referrer-Policy headers
  are set on all panel responses.
- R-SEC-07: Secrets (DB credentials, Redis URL, mTLS CA key) are supplied via
  environment variables, never committed to the repository.
- R-SEC-08: Dependencies are pinned and audited with `pnpm audit` in CI.
