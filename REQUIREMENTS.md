# SuperHost — Requirements

## 1. Authentication & Access Control

### 1.1 Authentication
- R-AUTH-01: Users authenticate with email + password (bcrypt hashed).
- R-AUTH-02: Sessions are JWT-based, stored in Redis, with configurable TTL (default 8 h).
- R-AUTH-03: Support TOTP two-factor authentication (RFC 6238).
- R-AUTH-04: Failed login attempts are rate-limited and locked after N failures (configurable).
- R-AUTH-05: Password reset via email link (time-limited, single-use token).

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

---

## 8. File Manager

- R-FILE-01: A browser-based file manager allows customers to browse, upload, download,
  rename, move, delete, and edit plain-text files within their document root.
- R-FILE-02: File operations are proxied through the panel API → agent; the agent
  enforces that paths stay within the account's allowed root.
- R-FILE-03: File uploads are chunked (max 100 MB per chunk, unlimited total).
- R-FILE-04: A basic code editor (Monaco) is embedded for editing text files in-browser.

---

## 9. Billing & Customer Accounts

### 9.1 Plans
- R-BILL-01: Admins define hosting plans with named resource limits:
  - Disk quota, bandwidth quota, max domains, max mailboxes, max databases.
- R-BILL-02: Customers are assigned exactly one active plan at a time.
- R-BILL-03: Plan changes (upgrade / downgrade) take effect immediately; quota changes
  are enforced by the agent within 5 min.

### 9.2 Customers
- R-BILL-04: Each customer account has a name, email, and billing contact.
- R-BILL-05: An admin can suspend or terminate a customer account; suspension disables
  access but retains data; termination schedules data deletion after a grace period.

### 9.3 Invoicing
- R-BILL-06: The panel generates monthly invoices as PDF, listing line items per resource.
- R-BILL-07: Invoices can be marked paid manually (external payment processor integration
  is a v2 feature).
- R-BILL-08: Email notifications are sent for invoice generation and upcoming renewals.

### 9.4 Usage Metering
- R-BILL-09: Disk and bandwidth usage per customer is tracked and displayed in the UI.
- R-BILL-10: Agents report bandwidth counters (from Nginx access logs) every 15 min.
- R-BILL-11: Admins receive an alert when a customer exceeds 90% of their plan quota.

---

## 10. Panel High Availability

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

## 11. Audit & Observability

- R-AUDIT-01: All state-changing API calls are recorded in an audit log: who, what, when,
  source IP, result.
- R-AUDIT-02: Audit log is append-only from the application's perspective (no delete API).
- R-AUDIT-03: Audit log is queryable by date range, user, resource type, and action.
- R-OBS-01: Panel exposes a Prometheus metrics endpoint (`/metrics`): request rates,
  latencies, job queue depths, agent connection counts.
- R-OBS-02: Agent exposes its own `/metrics` endpoint for host-level metrics.

---

## 12. Security Baseline

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
