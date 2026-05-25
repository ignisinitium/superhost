# Superhost — Full Audit & Implementation Plan

**Date:** 2026-05-25  
**Scope:** Full codebase audit — API, Worker, Dashboard, Shared types  
**Total findings:** 180+ issues across all severity levels

---

## Executive Summary

The codebase has solid architectural bones but contains **widespread, systematic security vulnerabilities** primarily stemming from:

1. **Shell injection everywhere** — the Worker runs as root and interpolates unescaped user input directly into `exec()` calls throughout its 62K-line handler.
2. **Broken authentication logic** — the `authenticateAdmin` middleware has a logic bug that allows any JWT holder to access admin routes.
3. **Hardcoded fallback secrets** — `JWT_SECRET || 'secret'` appears in 4 files, meaning any unset env var produces forgeable tokens.
4. **No input sanitization layer** — neither the API nor Worker validate domain names, usernames, ports, IPs, branch names, or file paths against expected formats before using them in shell commands.
5. **Token stored in localStorage** — vulnerable to any XSS attack.

The fixes are grouped below by severity. All changes will be implemented in order.

---

## CRITICAL — Fix Immediately (Server Compromise Risk)

### C-01: Hardcoded JWT fallback secret `'secret'`
**Files:** `api/src/middleware/auth.ts:17,36`, `api/src/routes/auth.ts:39,62`, `api/src/routes/clientAuth.ts:36`, `api/src/routes/fido2.ts:148`  
**Fix:** Throw at startup if `JWT_SECRET` is not set. Remove all `|| 'secret'` and `|| 'fallback'` fallbacks.

### C-02: Broken `authenticateAdmin` middleware allows any JWT holder admin access
**File:** `api/src/middleware/auth.ts`  
**Issue:** Condition `if (decoded.role && decoded.role !== 'admin' && !decoded.id)` is logically broken — any token with an `id` field passes. A client token with `role: 'client'` and any `id` bypasses the admin check entirely.  
**Fix:** Replace with `if (!decoded.role || decoded.role !== 'admin') throw`.

### C-03: Hardcoded default DB credentials baked into source
**File:** `worker/src/index.ts:15-20, 509-510, 533-534, 1076-1077`  
**Issue:** `password: process.env.DB_ADMIN_PASS || 'worker_db_pass'` — default password in source code.  
**Fix:** Throw at startup if required env vars are absent. No fallback defaults for credentials.

### C-04: Shell injection — Worker runs as root with unescaped user input
**File:** `worker/src/index.ts` — affects every handler that calls `execPromise()`  
**Root cause:** Variables like `domainName`, `username`, `ipAddress`, `branch`, `repoUrl`, `port`, `service`, `action`, `zipName`, `files[]` are all interpolated directly into shell strings.  
**Impact:** Any of these values containing `;`, `$(...)`, backticks, `|`, `&&` executes arbitrary commands as root.  
**Affected handlers (partial list):**
- `handleCreateUser` — `username` in `useradd`
- `handleCreateDomain` — `domainName` in `mv`, `ln -s`
- `handleGenerateEmailDns` — `domainName` in `sudo bash -c 'echo ...'`
- `handleInstallWordPress` — `siteTitle`, `adminUser`, `adminPassword`, `adminEmail` in wp-cli
- `handleSyncCrontab` — `username` in `crontab -u`, `job.command` directly in crontab file
- `handleSyncFtp` — `uid`, `gid`, `homedir` in `mkdir`, `chown`
- `handleZipFiles` — `zipName`, `files[]` in `zip -r`
- `handleUnzipFile` — `zipName`, `targetPath` in `unzip`
- `handleSyncDnsZone` — `domainName` in `rndc reload`
- `handleRemoveDnsZone` — `domainName` in `rm -f`
- `handleGitDeploy` — `branch`, `repoUrl` in `git clone`, `git reset`
- `handleSetupAppRuntime`/`handleManageAppRuntime` — `command`, `action`, `appName` in `pm2`/`bash -c`
- `handleManageService` — `service`, `action` in `systemctl`
- `handleFirewallAllow`/`Delete`/`BlockIp` — `port`, `protocol`, `ruleNumber`, `ipAddress` in `ufw`
- `handleSyncClusterConfig` — `ipAddress` in `rsync` and `ssh`
- `handleCheckNodeHealth` — `ipAddress` in `ping`
- `handleAddVirtualIp`/`handleRemoveVirtualIp` — `ipAddress`, `iface` in `ip addr`
- `handleScanMalware` — `username` in scan path
- `handleGetProcesses` — `username` in `ps -u`
- `handleKillProcess` — `signal` in `kill -s`
- `handleRestoreBackup` — `backupPath` in `tar -xzf`
- `handleSyncMigrationData` — `sourcePath`, `targetPath` in `rsync`
- `handleSendSpamDigest` — `user.email` in `sudo mail`
- `handleInstallSsl` — `domainName` in `certbot`

**Fix:** Create `worker/src/sanitize.ts` with strict validation + shell-escaping functions. Apply to every handler before any `execPromise` call.

### C-05: MySQL injection in `handleCreateDatabase`
**File:** `worker/src/index.ts:514-517`  
**Issue:** `CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPassword}'` — backtick quoting of database names does not prevent `'` injection in username/password fields.  
**Fix:** Validate `dbUser` against `[a-zA-Z0-9_]{1,32}`. Use `mysql.escape()` for the password value.

### C-06: Path traversal in file manager — symlink bypass
**File:** `worker/src/index.ts:1288-1355`  
**Issue:** `if (!absolutePath.startsWith(baseDir))` does not resolve symlinks. A symlink at `public_html/link -> /etc/passwd` bypasses the check.  
**Fix:** Use `fs.realpath()` on both `absolutePath` and `baseDir` before comparison.

### C-07: SSH `StrictHostKeyChecking=no` in cluster sync
**File:** `worker/src/index.ts:1277,1279`  
**Issue:** Disables host key verification, allowing MITM attacks during cluster config push.  
**Fix:** Remove `-o StrictHostKeyChecking=no`. Add cluster node fingerprints to a known_hosts file and reference it explicitly: `-o UserKnownHostsFile=/etc/superhost/cluster_known_hosts`.

### C-08: Stripe webhook accepted without signature verification in demo mode
**File:** `api/src/routes/billing.ts:28-29`  
**Issue:** When `STRIPE_SECRET_KEY` is not set, the webhook body is parsed as raw JSON with no verification, allowing forged payment events.  
**Fix:** If `STRIPE_WEBHOOK_SECRET` is not set, return 503 on webhook endpoint rather than accepting unverified events.

### C-09: Missing `authenticateAdmin` on reseller list endpoint
**File:** `api/src/routes/reseller.ts:13-24`  
**Issue:** `router.get('/')` is defined before `router.use(authenticateAdmin)`, making it publicly accessible — any unauthenticated request can enumerate all resellers.  
**Fix:** Move the `GET /` handler after the `router.use(authenticateAdmin)` line, or apply middleware inline.

### C-10: No global error handler — unhandled exceptions crash Express
**File:** `api/src/index.ts`  
**Issue:** Any thrown error in a route handler propagates uncaught and crashes the process.  
**Fix:** Add Express error middleware `(err, req, res, next)` as the last app-level middleware, returning 500 without leaking stack traces.

### C-11: Race condition — multiple workers can claim the same task
**File:** `worker/src/index.ts:1510-1520`  
**Issue:** On NOTIFY, the worker calls `handleTask(task)` with the task payload from the notification. If two worker instances are running, both receive the same notification and process the same task simultaneously.  
**Fix:** Replace optimistic read with `UPDATE tasks SET status='processing', started_at=NOW() WHERE id=$1 AND status='pending' RETURNING *` — only the instance that wins the UPDATE proceeds.

### C-12: Passwords leaked to process list via command-line arguments
**File:** `worker/src/index.ts:1081, 620`  
**Issue:** `mysqldump -u user -p'${dbPass}'` and WP-CLI `--admin_password="${adminPassword}"` expose credentials in `ps aux` output.  
**Fix:** For mysqldump, write a `~/.my.cnf` temp file with `[client]\npassword=...` and pass `--defaults-extra-file`. For WP-CLI, use `--prompt-db-pass` reading from stdin or a temp config file. Delete temp files in `finally`.

---

## HIGH — Fix Before Next Release

### H-01: No global input sanitization — create `sanitize.ts`
**Fix:** New file `worker/src/sanitize.ts` with:
```typescript
validateDomainName(s)   // /^[a-zA-Z0-9][a-zA-Z0-9\-\.]{0,253}[a-zA-Z0-9]$/
validateUsername(s)     // /^[a-z_][a-z0-9_-]{0,31}$/
validateIpAddress(s)    // IPv4 + IPv6 with net.isIP()
validatePort(s)         // 1-65535 integer
validateBranchName(s)   // /^[a-zA-Z0-9_\-\.\/]{1,255}$/
validateServiceName(s)  // allowlist: ['nginx','php8.3-fpm','postfix','dovecot',...]
validateActionName(s)   // allowlist: ['start','stop','restart','reload','status','enable','disable']
validatePm2Action(s)    // allowlist: ['start','stop','restart','delete','logs','status']
shellEscape(s)          // wraps in single quotes, escapes embedded single quotes
validatePath(p, base)   // resolves realpath, checks prefix
validateSignal(s)       // allowlist: ['SIGTERM','SIGKILL','SIGHUP','SIGUSR1','SIGUSR2']
```

### H-02: File path traversal in API routes not sanitized before worker dispatch
**Files:** `api/src/routes/files.ts`, `api/src/routes/backups.ts`, `api/src/routes/ftp.ts`  
**Fix:** Validate `filePath` and `path` params in the API before queuing the task. Apply `path.normalize()` and reject any path containing `..`.

### H-03: Missing rate limiting on critical endpoints
**Files:** `api/src/routes/auth.ts`, `api/src/routes/clientAuth.ts`, password-change endpoints  
**Fix:** Apply `express-rate-limit` (5 req/15min) on `/login`, `/verify-2fa`, `/register`, `/reset-password`. The existing `checkIpBlock` middleware only blocks IPs after brute-force — add a proper rate limiter upstream.

### H-04: Broken Dovecot password hash generation
**File:** `api/src/routes/email.ts:17-30`  
**Issue:** `generateDovecotPassword()` function is dead code. The live path uses `{BLF-CRYPT}` prefix with bcrypt, but `{BLF-CRYPT}` is not a valid Dovecot password scheme. The correct scheme is `{BF-CRYPT}` or `{BCRYPT}`.  
**Fix:** Unify to use `{CRYPT}` with `$2y$` bcrypt output: `{CRYPT}${await bcrypt.hash(password, 12)}`. Delete the dead function.

### H-05: FIDO2 challenge stored in process memory (Map)
**File:** `api/src/routes/fido2.ts:23-24`  
**Issue:** Challenges are lost on restart and cannot work across multiple API instances.  
**Fix:** Store challenges in PostgreSQL with a TTL column (`expires_at = NOW() + INTERVAL '5 minutes'`). Clean up expired rows on each auth flow.

### H-06: Webhook URLs accepted without validation — SSRF risk
**File:** `worker/src/index.ts:1368-1375`  
**Fix:** Validate Slack/Telegram webhook URLs against known prefixes (`https://hooks.slack.com/`, `https://api.telegram.org/`) before calling `axios.post()`. Add a 5-second timeout to all outgoing webhook requests.

### H-07: Cron job command injection via `job.command`
**File:** `worker/src/index.ts:754`  
**Issue:** Cron commands are written to crontab verbatim with no validation.  
**Fix:** Validate each cron time field is an integer or `*`. Validate `job.command` is an absolute path or starts with an allowed command. Reject entries with shell metacharacters (`;`, `|`, `&`, backtick, `$(`).

### H-08: Git deploy — branch and repo URL not validated
**File:** `worker/src/index.ts:732,735`  
**Fix:** Apply `validateBranchName()`. Validate `repoUrl` is a well-formed `https://` URL or SSH git URL. Reject any URL with shell metacharacters.

### H-09: No request body size limit
**File:** `api/src/index.ts`  
**Fix:** `app.use(express.json({ limit: '1mb' }))`.

### H-10: Missing security headers
**File:** `api/src/index.ts`  
**Fix:** Add `helmet` package. `app.use(helmet())` before routes. Configure CSP. Add `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.

### H-11: Admin cron route permission check always true
**File:** `api/src/routes/adminCron.ts:52-57`  
**Issue:** `WHERE (user_id = $1) OR (user_id IS NULL AND $2 IS NULL)` — when passing the same parameter for both `$1` and `$2`, the second condition `$2 IS NULL` is never true. The intended query to get all jobs for an admin is broken.  
**Fix:** Use two separate queries or fix the parameter binding.

### H-12: CORS allows all origins
**File:** `api/src/index.ts:44`  
**Fix:** `cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'], credentials: true })`.

### H-13: `useTaskMonitor` hook — no cleanup on unmount, swallows errors
**File:** `dashboard/src/hooks/useTaskMonitor.ts`  
**Fix:** Return cleanup function from `useEffect`. Wrap `checkStatus()` in try/catch. Use exponential backoff (2s → 4s → 8s → max 30s) instead of fixed 2s polling.

### H-14: JWT tokens stored in `localStorage` — XSS-accessible
**File:** `dashboard/src/pages/Login.tsx`, `ClientLogin.tsx`  
**Fix:** Move auth to `httpOnly` cookies by changing the API to `Set-Cookie: token=...; HttpOnly; SameSite=Strict; Secure`. Remove all `localStorage.getItem('token')` from the axios client and rely on automatic cookie sending. Remove `localStorage.setItem` from login pages.

### H-15: `ProtectedRoute` reads role from `localStorage` — spoofable
**File:** `dashboard/src/App.tsx:46`  
**Fix:** After moving to cookies, decode the role from the JWT payload server-side. On the client, fetch `/api/auth/me` to get the current user's role rather than reading from localStorage.

### H-16: No error boundary — single component crash kills the app
**File:** `dashboard/src/App.tsx`  
**Fix:** Wrap the router in a `<ErrorBoundary>` component that renders a friendly error page and offers a "Reload" button.

### H-17: All polling `setInterval` calls leak on component unmount
**Files:** `dashboard/src/pages/Logs.tsx`, `Processes.tsx`, `ClientFileManager.tsx`, and others  
**Fix:** Refactor all polling into the `useTaskMonitor` hook or custom hooks that return cleanup functions. Every `setInterval` must be cleared in a `useEffect` return function.

### H-18: DOM node leak in log download
**File:** `dashboard/src/pages/Logs.tsx:63-70`  
**Issue:** `document.body.appendChild(element)` and `element.click()` but the `<a>` is never removed from DOM, and `URL.revokeObjectURL()` is never called.  
**Fix:** `document.body.removeChild(element)` after click. Call `URL.revokeObjectURL(element.href)`.

### H-19: Log filter input is rendered but not wired up
**File:** `dashboard/src/pages/Logs.tsx:154-161`  
**Fix:** Add `value={filter}` and `onChange={e => setFilter(e.target.value)}` state. Filter `logContent` lines client-side.

### H-20: Form submit buttons allow double-submission
**File:** Multiple pages — email, databases, domains, etc.  
**Fix:** Set button `disabled={isPending}` using React Query's mutation state. Show a spinner inside the button while pending.

---

## MEDIUM — Fix in This Sprint

### M-01: Task execution has no timeout — worker can hang forever
**Fix:** Wrap each handler call in `Promise.race([handler(task), timeout(300_000)])`. On timeout, mark task as `failed` with `error_message: 'Task timed out after 5 minutes'`.

### M-02: Temporary files use predictable `/tmp/<name>` paths — race condition
**File:** `worker/src/index.ts:270, 758, 852, 985`  
**Fix:** Replace all `/tmp/nginx_${domainName}`, `/tmp/cron_${username}`, etc. with `await fs.mkdtemp(path.join(os.tmpdir(), 'superhost-'))`. Set file permissions to 0o600. Delete in `finally` blocks.

### M-03: Backup/restore has no file integrity check
**File:** `worker/src/index.ts:1063-1175`  
**Fix:** On backup creation, compute SHA256 of the `.tar.gz` and store it in `backups.checksum`. On restore, verify the checksum before extracting.

### M-04: Temporary backup dump files not cleaned up on failure
**File:** `worker/src/index.ts:1080-1099`  
**Fix:** Move `rm -f ${dump}` cleanup into a `finally` block so it runs even if `tar` fails.

### M-05: `watchAuthLogs` spawned process never restarted if it exits
**File:** `worker/src/index.ts:1478`  
**Fix:** Listen for `tail.on('close', ...)` and restart the process with exponential backoff. Add `tail.on('error', ...)` handler.

### M-06: `setInterval` for metrics collection swallows errors silently
**File:** `worker/src/index.ts:1465-1469`  
**Fix:** Wrap `collectMetrics`, `collectTrafficStats`, `updateResourceUsage` in try/catch inside their setInterval callbacks and log errors.

### M-07: `process.cwd()` used for template/config file paths
**File:** `worker/src/index.ts:261, 887`  
**Fix:** Replace with `new URL('../templates/...', import.meta.url)` (ES module equivalent of `__dirname`) to get paths relative to the source file, not the CWD.

### M-08: `mysql2` connections not pooled — new connection per task
**File:** `worker/src/index.ts:507-524, 531-547, 1162-1171`  
**Fix:** Create a single `mysql2` connection pool at startup, reuse across handlers. Connections are released automatically on pool.query().

### M-09: DNS record content not validated before writing BIND zone file
**File:** `worker/src/index.ts:840-845`  
**Fix:** Validate each record type against allowed values (`A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`, `SRV`). Validate content format per type (IP for A, hostname for CNAME/MX, etc.).

### M-10: Email address not validated before creation
**File:** `api/src/routes/email.ts`  
**Fix:** Validate `localPart` against `/^[a-zA-Z0-9._%+\-]{1,64}$/` before storing or dispatching.

### M-11: phpMyAdmin SSO URL not validated before `window.open()`
**File:** `dashboard/src/pages/ClientDatabases.tsx:59-67`  
**Fix:** Validate returned URL starts with the expected phpMyAdmin origin before opening. Use `new URL(url).origin === expectedOrigin` check.

### M-12: FIDO2 challenge storage in-memory breaks clustering
**File:** `api/src/routes/fido2.ts:23-24`  
*(See H-05 — consolidate to PostgreSQL)*

### M-13: `adminCron` query bug — second `IS NULL` condition always evaluates the same
**File:** `api/src/routes/adminCron.ts:52-57`  
*(See H-11)*

### M-14: Incomplete port validation for app runtime
**File:** `api/src/routes/apps.ts:33-37`  
**Fix:** After the port-scanning loop, verify the selected port is not in a blocked range (1-1024, system reserved ports). Cap scan at port 50000.

### M-15: Git webhook token never rotated, no expiry
**File:** `api/src/routes/git.ts`  
**Fix:** Add a `POST /client/git/:id/rotate-webhook` endpoint to regenerate the token. Store token creation timestamp; warn in UI if token is older than 90 days.

### M-16: Theme colors injected as CSS variables without format validation
**File:** `dashboard/src/App.tsx:65-70`  
**Fix:** Validate each color value is a valid hex color (`/^#[0-9a-fA-F]{6}$/`) before calling `root.style.setProperty()`.

### M-17: Hardcoded domain limit in dashboard widget
**File:** `dashboard/src/components/dashboard/AccountLimitsWidget.tsx:31`  
**Fix:** Fetch limits from `/api/client/limits` (create this endpoint) that reads from the user's plan in the database.

### M-18: Webhook notifications sent without timeout
**File:** `worker/src/index.ts:1369`  
**Fix:** `axios.post(url, data, { timeout: 5000 })`.

### M-19: Missing `AbortController` for in-flight API requests
**File:** `dashboard/src/pages/Logs.tsx` and others with `useEffect` + `api.get()`  
**Fix:** Create AbortController in `useEffect`, pass `signal` to axios, and abort in cleanup function.

### M-20: Reseller branding accessible by any admin (IDOR)
**File:** `api/src/routes/reseller.ts:41-77`  
**Fix:** Scope `GET /branding` and `PUT /branding` queries to `WHERE reseller_id IN (SELECT id FROM resellers WHERE admin_id = $1)`.

---

## LOW — Polish & Hardening

### L-01: Certbot `--register-unsafely-without-email` is deprecated
**Fix:** Add `CERTBOT_EMAIL` env var. Use `--email ${email}` flag. Fail loudly at startup if not set.

### L-02: Sensitive payloads (passwords, tokens) logged to console
**Files:** `worker/src/index.ts:23` — logs full task payload  
**Fix:** Before logging, redact fields named `password`, `dbPassword`, `adminPassword`, `token`, `secret` from the payload.

### L-03: Error messages stored in task table may contain internal paths
**Fix:** Distinguish between internal error (log full) and user-facing error (sanitized). Store a `internal_error` text field separately from `error_message`.

### L-04: `useradd` without `--shell` validation — PHP version hardcoded
**File:** `worker/src/index.ts:216`  
**Fix:** Remove hardcoded `phpVersion: '8.5'`. Detect installed PHP versions at startup with `ls /etc/php/` and validate against that list.

### L-05: Process list parser uses fragile `split(/\s+/)` on 10 columns
**File:** `dashboard/src/pages/Processes.tsx:70-89`  
**Fix:** Use `--format` with fixed-width output or JSON from ps, or use a more robust parser that reads exactly N fields.

### L-06: Incomplete placeholder pages still visible in navigation
**Files:** `dashboard/src/pages/Settings.tsx` ("Advanced Identity Control — coming soon")  
**Fix:** Either implement or hide behind a feature flag. Don't ship visible "coming soon" cards.

### L-07: Inconsistent error responses across API routes
**Fix:** Create a shared `sendError(res, status, message)` helper used by all routes. Standardize all error shapes to `{ success: false, message: string }`.

### L-08: Missing `Content-Type: application/json` validation on inbound requests
**Fix:** Middleware to verify `Content-Type: application/json` on all POST/PATCH/PUT routes.

### L-09: `navigator.clipboard.writeText()` has no fallback
**File:** `dashboard/src/pages/ClientGitManager.tsx:85-88`  
**Fix:** Add try/catch + fallback to `document.execCommand('copy')` on unsupported browsers.

### L-10: No confirmation dialog on destructive actions in file manager and databases
**Fix:** Add `window.confirm()` or a modal confirmation before delete-file, delete-database, delete-email-account operations.

---

## Missing Features / Incomplete Code

### F-01: `/api/client/limits` endpoint does not exist
Dashboard `AccountLimitsWidget` needs this endpoint to show accurate plan limits.  
**Add:** `GET /api/client/limits` — returns `{ domains: n, databases: n, emailAccounts: n, storage_gb: n }` from the user's plan.

### F-02: Task status never surfaced to user in most flows
Many operations queue a task but the dashboard never shows success/failure.  
**Fix:** `useTaskMonitor` hook should be used consistently. On task failure, show a toast with the error message.

### F-03: No server-side `/api/auth/me` endpoint
Dashboard has no way to re-validate the session without re-logging in. Required for httpOnly cookie approach.  
**Add:** `GET /api/auth/me` and `GET /api/client/auth/me` returning current user from JWT.

### F-04: Backup checksums not stored or verified
*See M-03.*

### F-05: Cluster `known_hosts` management UI missing
The cluster sync feature disables host key checking (C-07). A UI to add/remove cluster node fingerprints is needed.

### F-06: No session invalidation / logout on server
Logging out only removes localStorage. Tokens remain valid until expiry.  
**Fix:** Add token blocklist table in PostgreSQL (id, token_jti, expires_at). On logout, insert the JTI. On verify, check blocklist. Clean expired entries with a scheduled job.

### F-07: `watchAuthLogs` brute-force detection has no notification
When an IP is blocked, no alert is sent to the admin.  
**Fix:** Call `sendNotification()` when `handleFirewallBlockIp` is triggered from the auth log watcher.

### F-08: PHP version list is hardcoded in domain creation UI
**Fix:** Add `GET /api/admin/php-versions` endpoint that reads available versions from `/etc/php/`.

---

## Implementation Order

### Phase 1 — Security Critical (C-01 through C-12)
1. `api/src/middleware/auth.ts` — fix broken admin check, JWT secret guard
2. `api/src/index.ts` — global error handler, helmet, CORS, body size limit
3. `api/src/routes/reseller.ts` — add missing auth
4. `api/src/routes/billing.ts` — fix Stripe webhook verification
5. `api/src/routes/auth.ts`, `clientAuth.ts`, `fido2.ts` — remove JWT fallbacks
6. `worker/src/sanitize.ts` — create validation/escaping utility (NEW FILE)
7. `worker/src/index.ts` — apply sanitize to every exec call, fix task locking, fix credential defaults

### Phase 2 — High Priority (H-01 through H-20)
8. `worker/src/index.ts` — task timeout, SSH known_hosts, SSRF webhook validation, temp file security
9. `api/src/routes/email.ts` — fix Dovecot hash
10. `api/src/routes/fido2.ts` — PostgreSQL challenge storage
11. `dashboard` — httpOnly cookies, error boundary, useEffect cleanup, form submit guards, log filter, DOM leak fix

### Phase 3 — Medium Priority (M-01 through M-20)
12. Worker — mysql2 pooling, backup checksums, metrics error handling, config file paths
13. API — email validation, port range validation, rate limiting, git token rotation
14. Dashboard — phpMyAdmin URL validation, theme color validation, abort controllers

### Phase 4 — Low + Missing Features (L-*, F-*)
15. API — `/api/auth/me`, `/api/client/limits`, token blocklist/logout
16. Worker — certbot email, payload redaction in logs, PHP version detection
17. Dashboard — confirmation dialogs, process parser, placeholder page removal

---

## Files to Create (New)
- `worker/src/sanitize.ts` — input validation & shell escaping utility
- `api/src/middleware/errorHandler.ts` — global Express error handler
- `api/src/middleware/validateContentType.ts` — content-type enforcement
- `dashboard/src/components/ErrorBoundary.tsx` — React error boundary
- `dashboard/src/hooks/useAbortableFetch.ts` — fetch with AbortController
- `docs/migrations/009_security_hardening.sql` — token blocklist table, FIDO2 challenges table

## Files to Modify (Significant Changes)
- `worker/src/index.ts` — sanitize all exec calls, task locking, credential guards, temp files, timeout
- `api/src/middleware/auth.ts` — fix role check logic, JWT secret guard
- `api/src/index.ts` — helmet, CORS, body limit, error handler mount
- `api/src/routes/auth.ts` — remove JWT fallback, JWT expiry 1h
- `api/src/routes/clientAuth.ts` — same
- `api/src/routes/fido2.ts` — PostgreSQL challenges, remove JWT fallback
- `api/src/routes/billing.ts` — webhook verification
- `api/src/routes/reseller.ts` — add auth, fix IDOR
- `api/src/routes/email.ts` — fix Dovecot hash, add email validation
- `api/src/routes/adminCron.ts` — fix query bug
- `api/src/routes/files.ts` — path validation before dispatch
- `api/src/routes/backups.ts` — path validation on download
- `dashboard/src/App.tsx` — error boundary, auth/me pattern, cookie auth
- `dashboard/src/hooks/useTaskMonitor.ts` — cleanup, error handling, backoff
- `dashboard/src/pages/Login.tsx` + `ClientLogin.tsx` — cookie auth
- `dashboard/src/pages/Logs.tsx` — filter wiring, DOM leak, cleanup
- `dashboard/src/pages/Processes.tsx` — parser fix
