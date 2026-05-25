/**
 * sanitize.ts — Input validation and shell-escaping utilities for the Worker
 *
 * ALL user-supplied values must pass through a validation function here before
 * being used in execPromise() calls. The worker runs as root; a single unsanitized
 * variable is a full system compromise.
 */

import net from 'net';
import path from 'path';
import fs from 'fs/promises';

// ---------------------------------------------------------------------------
// Shell escaping
// ---------------------------------------------------------------------------

/**
 * Wraps a string in single quotes and escapes any embedded single quotes.
 * Use this when you MUST interpolate a value into a shell command string.
 * Prefer execFile() with argument arrays wherever possible.
 */
export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

// ---------------------------------------------------------------------------
// Domain names
// ---------------------------------------------------------------------------

const DOMAIN_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export function validateDomainName(name: unknown): string {
  if (typeof name !== 'string') throw new Error('Domain name must be a string');
  const trimmed = name.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 253) {
    throw new Error('Domain name must be 1–253 characters');
  }
  if (!DOMAIN_RE.test(trimmed)) {
    throw new Error(`Invalid domain name: ${trimmed}`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Linux usernames
// ---------------------------------------------------------------------------

// Linux useradd restrictions: starts with letter/underscore, rest alphanumeric/underscore/hyphen/dot
const USERNAME_RE = /^[a-z_][a-z0-9_\-]{0,31}$/;

export function validateUsername(name: unknown): string {
  if (typeof name !== 'string') throw new Error('Username must be a string');
  const trimmed = name.trim();
  if (!USERNAME_RE.test(trimmed)) {
    throw new Error(`Invalid username: ${trimmed}. Must be lowercase letters, numbers, hyphens, underscores (max 32 chars)`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// IP addresses
// ---------------------------------------------------------------------------

export function validateIpAddress(ip: unknown): string {
  if (typeof ip !== 'string') throw new Error('IP address must be a string');
  const trimmed = ip.trim();
  if (net.isIP(trimmed) === 0) {
    throw new Error(`Invalid IP address: ${trimmed}`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export function validatePort(port: unknown): number {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid port: ${port}. Must be an integer 1–65535`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Network protocol
// ---------------------------------------------------------------------------

const ALLOWED_PROTOCOLS = new Set(['tcp', 'udp']);

export function validateProtocol(proto: unknown): string {
  if (typeof proto !== 'string') throw new Error('Protocol must be a string');
  const lower = proto.trim().toLowerCase();
  if (!ALLOWED_PROTOCOLS.has(lower)) {
    throw new Error(`Invalid protocol: ${proto}. Must be 'tcp' or 'udp'`);
  }
  return lower;
}

// ---------------------------------------------------------------------------
// UFW rule numbers
// ---------------------------------------------------------------------------

export function validateRuleNumber(n: unknown): number {
  const num = Number(n);
  if (!Number.isInteger(num) || num < 1 || num > 9999) {
    throw new Error(`Invalid rule number: ${n}`);
  }
  return num;
}

// ---------------------------------------------------------------------------
// Systemctl service names (allowlist)
// ---------------------------------------------------------------------------

const ALLOWED_SERVICES = new Set([
  'nginx', 'apache2',
  'php7.4-fpm', 'php8.0-fpm', 'php8.1-fpm', 'php8.2-fpm', 'php8.3-fpm', 'php8.4-fpm',
  'mysql', 'mariadb', 'postgresql',
  'postfix', 'dovecot', 'opendkim', 'spamassassin',
  'bind9', 'named',
  'proftpd', 'vsftpd',
  'redis', 'memcached',
  'clamav-daemon', 'clamav-freshclam',
  'fail2ban', 'ufw',
  'superhost-api', 'superhost-worker',
  'ssh', 'sshd',
  'cron', 'rsyslog',
]);

export function validateServiceName(service: unknown): string {
  if (typeof service !== 'string') throw new Error('Service name must be a string');
  const trimmed = service.trim();
  if (!ALLOWED_SERVICES.has(trimmed)) {
    throw new Error(`Service '${trimmed}' is not in the allowed services list`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Systemctl actions (allowlist)
// ---------------------------------------------------------------------------

const ALLOWED_ACTIONS = new Set(['start', 'stop', 'restart', 'reload', 'status', 'enable', 'disable']);

export function validateServiceAction(action: unknown): string {
  if (typeof action !== 'string') throw new Error('Service action must be a string');
  const trimmed = action.trim().toLowerCase();
  if (!ALLOWED_ACTIONS.has(trimmed)) {
    throw new Error(`Action '${trimmed}' is not allowed. Allowed: ${[...ALLOWED_ACTIONS].join(', ')}`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// PM2 actions (allowlist)
// ---------------------------------------------------------------------------

const ALLOWED_PM2_ACTIONS = new Set(['start', 'stop', 'restart', 'delete', 'logs', 'status']);

export function validatePm2Action(action: unknown): string {
  if (typeof action !== 'string') throw new Error('PM2 action must be a string');
  const trimmed = action.trim().toLowerCase();
  if (!ALLOWED_PM2_ACTIONS.has(trimmed)) {
    throw new Error(`PM2 action '${trimmed}' is not allowed`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Git branch names
// ---------------------------------------------------------------------------

// Git branch names: alphanumeric, dash, underscore, dot, forward slash (for remote/branch)
const BRANCH_RE = /^[a-zA-Z0-9_\-\.\/]{1,255}$/;

export function validateBranchName(branch: unknown): string {
  if (typeof branch !== 'string') throw new Error('Branch name must be a string');
  const trimmed = branch.trim();
  if (!BRANCH_RE.test(trimmed)) {
    throw new Error(`Invalid branch name: ${trimmed}`);
  }
  // Reject double-dot path traversal sequences that git allows but are dangerous
  if (trimmed.includes('..')) {
    throw new Error('Branch name cannot contain ".."');
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Git repository URLs
// ---------------------------------------------------------------------------

export function validateRepoUrl(url: unknown): string {
  if (typeof url !== 'string') throw new Error('Repository URL must be a string');
  const trimmed = url.trim();
  // Allow https:// and git@ SSH URLs only
  if (
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('git@') &&
    !trimmed.startsWith('ssh://git@')
  ) {
    throw new Error('Repository URL must use https:// or git@ SSH format');
  }
  // Reject shell metacharacters
  if (/[;&|`$<>(){}[\]!#]/.test(trimmed)) {
    throw new Error('Repository URL contains invalid characters');
  }
  if (trimmed.length > 500) throw new Error('Repository URL too long');
  return trimmed;
}

// ---------------------------------------------------------------------------
// Process signals (allowlist)
// ---------------------------------------------------------------------------

const ALLOWED_SIGNALS = new Set([
  'SIGTERM', 'SIGKILL', 'SIGHUP', 'SIGUSR1', 'SIGUSR2',
  'SIGINT', 'SIGQUIT', 'SIGABRT', 'SIGSTOP', 'SIGCONT',
]);

export function validateSignal(signal: unknown): string {
  if (typeof signal !== 'string') throw new Error('Signal must be a string');
  const upper = signal.trim().toUpperCase();
  if (!ALLOWED_SIGNALS.has(upper)) {
    throw new Error(`Signal '${signal}' is not allowed. Allowed: ${[...ALLOWED_SIGNALS].join(', ')}`);
  }
  return upper;
}

// ---------------------------------------------------------------------------
// Process IDs (PIDs)
// ---------------------------------------------------------------------------

export function validatePid(pid: unknown): number {
  const n = Number(pid);
  if (!Number.isInteger(n) || n < 1 || n > 4194304) {
    throw new Error(`Invalid PID: ${pid}`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// File paths — prevent traversal attacks
// ---------------------------------------------------------------------------

/**
 * Validates that a path stays within the allowed base directory.
 * Uses fs.realpath to resolve symlinks, so symlink-based escapes are caught.
 * Returns the resolved absolute path on success.
 */
export async function validatePath(inputPath: unknown, baseDir: string): Promise<string> {
  if (typeof inputPath !== 'string') throw new Error('Path must be a string');

  // Normalize but don't resolve yet — file may not exist
  const joined = path.normalize(path.join(baseDir, inputPath));

  // Reject any path still containing .. after normalize
  if (joined.includes('..')) {
    throw new Error('Path traversal detected');
  }

  // If the file/dir exists, resolve symlinks and re-check
  try {
    const resolved = await fs.realpath(joined);
    const resolvedBase = await fs.realpath(baseDir);
    if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
      throw new Error('Path escapes base directory');
    }
    return resolved;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // File doesn't exist yet — just return the normalized join (write operations)
      return joined;
    }
    throw err;
  }
}

/**
 * Synchronously validates a path string does not traverse above baseDir.
 * Does NOT follow symlinks — use validatePath (async) for read operations.
 */
export function validatePathSync(inputPath: unknown, baseDir: string): string {
  if (typeof inputPath !== 'string') throw new Error('Path must be a string');
  const joined = path.normalize(path.join(baseDir, inputPath));
  if (!joined.startsWith(baseDir + path.sep) && joined !== baseDir) {
    throw new Error('Path traversal detected');
  }
  return joined;
}

// ---------------------------------------------------------------------------
// Email local parts
// ---------------------------------------------------------------------------

const EMAIL_LOCAL_RE = /^[a-zA-Z0-9._%+\-]{1,64}$/;

export function validateEmailLocalPart(local: unknown): string {
  if (typeof local !== 'string') throw new Error('Email local part must be a string');
  const trimmed = local.trim();
  if (!EMAIL_LOCAL_RE.test(trimmed)) {
    throw new Error(`Invalid email local part: ${trimmed}`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// MySQL identifiers (database names, usernames)
// ---------------------------------------------------------------------------

const MYSQL_IDENT_RE = /^[a-zA-Z0-9_]{1,64}$/;

export function validateMysqlIdentifier(name: unknown, label = 'identifier'): string {
  if (typeof name !== 'string') throw new Error(`${label} must be a string`);
  const trimmed = name.trim();
  if (!MYSQL_IDENT_RE.test(trimmed)) {
    throw new Error(`Invalid MySQL ${label}: ${trimmed}. Only alphanumeric characters and underscores allowed.`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Network interface names
// ---------------------------------------------------------------------------

const IFACE_RE = /^[a-zA-Z0-9_:\-\.]{1,20}$/;

export function validateInterfaceName(iface: unknown): string {
  if (typeof iface !== 'string') throw new Error('Interface name must be a string');
  const base = iface.trim().split(':')[0] ?? '';  // Strip virtual interface suffix
  if (!IFACE_RE.test(base)) {
    throw new Error(`Invalid interface name: ${iface}`);
  }
  return base;
}

// ---------------------------------------------------------------------------
// Webhook URLs (SSRF prevention)
// ---------------------------------------------------------------------------

const ALLOWED_WEBHOOK_PREFIXES = [
  'https://hooks.slack.com/',
  'https://api.telegram.org/',
];

export function validateWebhookUrl(url: unknown): string {
  if (typeof url !== 'string') throw new Error('Webhook URL must be a string');
  const trimmed = url.trim();
  const isAllowed = ALLOWED_WEBHOOK_PREFIXES.some(prefix => trimmed.startsWith(prefix));
  if (!isAllowed) {
    throw new Error('Webhook URL must be a Slack or Telegram webhook URL');
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Cron time fields
// ---------------------------------------------------------------------------

/** Validates a single cron time field (minute, hour, day, month, weekday). Allows * and numeric ranges. */
export function validateCronField(field: unknown, label: string): string {
  if (typeof field !== 'string') throw new Error(`Cron ${label} must be a string`);
  const trimmed = field.trim();
  // Allow: *, number, */step, range (e.g. 1-5), list (e.g. 1,2,3)
  if (!/^(\*|[0-9]+([,\-\/][0-9]+)*)$/.test(trimmed)) {
    throw new Error(`Invalid cron ${label}: ${trimmed}`);
  }
  return trimmed;
}

/**
 * Validates a cron command. Rejects shell metacharacters that would allow injection.
 * Allows absolute paths and common operators like redirects used in logging.
 */
export function validateCronCommand(command: unknown): string {
  if (typeof command !== 'string') throw new Error('Cron command must be a string');
  const trimmed = command.trim();
  if (trimmed.length === 0) throw new Error('Cron command cannot be empty');
  if (trimmed.length > 1000) throw new Error('Cron command too long');
  // Reject the most dangerous injection patterns
  if (/[`$()]/.test(trimmed) || /\$\{/.test(trimmed)) {
    throw new Error('Cron command contains disallowed shell constructs');
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Tail/log line counts
// ---------------------------------------------------------------------------

export function validateLineCount(lines: unknown, max = 10000): number {
  const n = Number(lines);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new Error(`Line count must be an integer between 1 and ${max}`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// PHP versions
// ---------------------------------------------------------------------------

const PHP_VERSION_RE = /^[78]\.\d{1,2}$/;

export function validatePhpVersion(version: unknown): string {
  if (typeof version !== 'string') throw new Error('PHP version must be a string');
  const trimmed = version.trim();
  if (!PHP_VERSION_RE.test(trimmed)) {
    throw new Error(`Invalid PHP version: ${trimmed}`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// DNS record types
// ---------------------------------------------------------------------------

const ALLOWED_DNS_TYPES = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR']);

export function validateDnsType(type: unknown): string {
  if (typeof type !== 'string') throw new Error('DNS record type must be a string');
  const upper = type.trim().toUpperCase();
  if (!ALLOWED_DNS_TYPES.has(upper)) {
    throw new Error(`Invalid DNS record type: ${type}`);
  }
  return upper;
}

// ---------------------------------------------------------------------------
// Redact sensitive fields from log output
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  'password', 'dbPassword', 'adminPassword', 'dbPass', 'token',
  'secret', 'apiKey', 'api_key', 'webhook_secret', 'private_key',
]);

export function redactPayload(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return payload;
  if (Array.isArray(payload)) return payload.map(redactPayload);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key) ? '[REDACTED]' : redactPayload(value);
  }
  return result;
}
