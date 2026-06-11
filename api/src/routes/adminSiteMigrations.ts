import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../audit.js';

const router = express.Router();
router.use(authenticateAdmin);

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i;
const HOST_RE = /^(?!-)[a-z0-9.-]{1,253}$|^(\d{1,3}\.){3}\d{1,3}$/i;
const USERNAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const STACKS = ['node', 'python', 'static', 'php'];

// Create a local user (mirrors POST /api/users) and queue its provisioning.
// Returns { id, username } with the conflict-resolved final username.
async function createUserInline(username: string, email?: string, password?: string, packageId?: number) {
  let finalUsername = username;
  for (let i = 0; i < 10; i++) {
    const c = await query(
      `SELECT 1 FROM users WHERE username = $1 UNION ALL SELECT 1 FROM deleted_users WHERE username = $1 LIMIT 1`,
      [finalUsername]);
    if (c.rows.length === 0) break;
    finalUsername = `${username.slice(0, 28)}_${crypto.randomBytes(2).toString('hex').slice(0, 3)}`;
  }
  const homeDir = `/home/${finalUsername}`;
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const r = await query(
    `INSERT INTO users (username, email, home_dir, password_hash, disk_limit_mb, bandwidth_limit_mb, package_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, username`,
    [finalUsername, email ?? null, homeDir, passwordHash, 1024, 5120, packageId ?? null]);
  await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CREATE_USER', { username: finalUsername }]);
  return r.rows[0] as { id: number; username: string };
}

// List migrations
router.get('/', async (_req, res) => {
  try {
    const r = await query(
      `SELECT m.id, m.direction, m.source_host, m.ssh_user, m.remote_path, m.domain_name, m.stack,
              m.detected_type, m.migrated_db, m.status, m.error_message, m.created_at, m.completed_at, u.username AS target_user
       FROM site_migrations m LEFT JOIN users u ON u.id = m.target_user_id
       ORDER BY m.created_at DESC LIMIT 100`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

// One migration (status + full log)
router.get('/:id', async (req, res) => {
  try {
    const r = await query('SELECT * FROM site_migrations WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

// Test SSH connectivity (reuses the worker's TEST_SSH_CONNECTION); UI polls the task.
router.post('/test-connection', async (req, res) => {
  const { host, port, user, authType, sshPassword, sshKey } = req.body ?? {};
  try {
    const t = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['TEST_SSH_CONNECTION', { remoteHost: host, remotePort: parseInt(port ?? 22, 10), remoteUser: user, authType, sshPassword, sshKey }]);
    res.json({ taskId: t.rows[0].id });
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

// Scan a remote server for hosted websites; UI polls GET /scan/:id.
router.post('/scan', async (req, res) => {
  const { sourceHost, sourcePort, sshUser, authType, sshPassword, sshKey } = req.body ?? {};
  const host = String(sourceHost ?? '').trim();
  try {
    if (!HOST_RE.test(host)) return res.status(400).json({ message: 'Invalid remote host' });
    if (!sshUser) return res.status(400).json({ message: 'SSH user is required' });
    if (authType === 'key' && !sshKey) return res.status(400).json({ message: 'SSH private key is required' });
    const port = parseInt(sourcePort ?? 22, 10) || 22;
    const s = await query(
      'INSERT INTO server_scans (source_host, source_port, ssh_user) VALUES ($1,$2,$3) RETURNING id',
      [host, port, sshUser]);
    const scanId = s.rows[0].id;
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SCAN_SERVER', {
      scanId, sourceHost: host, sourcePort: port, sshUser, authType: authType || 'key', sshPassword, sshKey,
    }]);
    res.status(201).json({ scanId });
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

// Scan status + discovered sites (no secrets stored on this row).
router.get('/scan/:id', async (req, res) => {
  try {
    const r = await query('SELECT id, source_host, ssh_user, status, sites, error_message, created_at FROM server_scans WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

// Import discovered sites: optionally create a new user, then queue a pull per site.
router.post('/scan-import', async (req: AuthRequest, res) => {
  const {
    sourceHost, sourcePort, sshUser, authType, sshPassword, sshKey,
    createUser, username, email, password, package_id, targetUserId, sites,
  } = req.body ?? {};
  const host = String(sourceHost ?? '').trim();
  const port = parseInt(sourcePort ?? 22, 10) || 22;

  try {
    if (!HOST_RE.test(host)) return res.status(400).json({ message: 'Invalid remote host' });
    if (!sshUser) return res.status(400).json({ message: 'SSH user is required' });
    if (!Array.isArray(sites) || sites.length === 0) return res.status(400).json({ message: 'Select at least one site' });

    let userId: number, uname: string;
    if (createUser) {
      const uReq = String(username ?? '').toLowerCase().trim();
      if (!USERNAME_RE.test(uReq)) return res.status(400).json({ message: 'Invalid username' });
      const u = await createUserInline(uReq, email, password, package_id ? parseInt(package_id, 10) : undefined);
      userId = u.id; uname = u.username;
    } else {
      const u = await query('SELECT id, username FROM users WHERE id = $1', [targetUserId]);
      if (u.rows.length === 0) return res.status(404).json({ message: 'Target user not found' });
      userId = u.rows[0].id; uname = u.rows[0].username;
    }

    const migrated: string[] = [], skipped: string[] = [];
    for (const s of sites) {
      const dom = String(s?.domainName ?? s?.domain ?? '').toLowerCase().trim();
      const frontendRoot = String(s?.frontendRoot ?? s?.remotePath ?? '');
      const serverBlock: string | null = typeof s?.serverBlock === 'string' ? s.serverBlock : null;
      const backends = Array.isArray(s?.backends) ? s.backends : [];
      const hasFrontend = frontendRoot.startsWith('/');
      const st = backends.length ? 'fullstack' : (STACKS.includes(s?.stack) ? s.stack : 'static');
      // Valid if it has a domain and at least one of: doc-root, backend, or server block.
      if (!DOMAIN_RE.test(dom) || (!hasFrontend && backends.length === 0 && !serverBlock)) { skipped.push(dom || '(invalid)'); continue; }
      const dupe = await query('SELECT 1 FROM domains WHERE lower(domain_name) = lower($1)', [dom]);
      if (dupe.rowCount) { skipped.push(dom); continue; }

      const mig = await query(
        `INSERT INTO site_migrations
           (direction, source_host, source_port, ssh_user, remote_path, target_user_id, domain_name, stack,
            server_block, frontend_root, backends)
         VALUES ('pull',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [host, port, sshUser, hasFrontend ? frontendRoot : '', userId, dom, st, serverBlock, hasFrontend ? frontendRoot : null, JSON.stringify(backends)]);
      const migrationId = mig.rows[0].id;

      const docRoot = `/home/${uname}/public_html/${dom}`;
      const domRes = await query(
        `INSERT INTO domains (user_id, domain_name, document_root, php_version) VALUES ($1,$2,$3,'8.3') RETURNING id`,
        [userId, dom, docRoot]);

      await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['MIGRATE_SITE', {
        migrationId, direction: 'pull', sourceHost: host, sourcePort: port, sshUser, authType: authType || 'key', sshPassword, sshKey,
        remotePath: hasFrontend ? frontendRoot : '', userId, username: uname, domainName: dom, domainId: domRes.rows[0].id, stack: st,
        frontendRoot: hasFrontend ? frontendRoot : null, serverBlock, backends, phpVersion: '8.3',
      }]);
      migrated.push(dom);
    }

    await logAudit(req, 'site.migrate_account', { targetType: 'user', targetId: userId, metadata: { remoteHost: host, migrated, skipped } });
    res.status(201).json({ userId, username: uname, migrated, skipped });
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

// Start a migration (direction: 'pull' = import here, 'push' = export to remote)
router.post('/', async (req: AuthRequest, res) => {
  const {
    direction, sourceHost, sourcePort, sshUser, authType, sshPassword, sshKey, remotePath,
    targetUserId, domainName, stack, appPort, installCommand, buildCommand, startCommand, phpVersion,
  } = req.body ?? {};
  const dir = direction === 'push' ? 'push' : 'pull';
  const host = String(sourceHost ?? '').trim();
  const dom = String(domainName ?? '').toLowerCase().trim();
  const st = String(stack ?? 'static');
  const port = parseInt(sourcePort ?? 22, 10) || 22;

  try {
    if (!HOST_RE.test(host)) return res.status(400).json({ message: 'Invalid remote host' });
    if (!sshUser) return res.status(400).json({ message: 'SSH user is required' });
    if (!remotePath || !String(remotePath).startsWith('/')) return res.status(400).json({ message: 'Remote path must be absolute' });
    if (!DOMAIN_RE.test(dom)) return res.status(400).json({ message: 'Invalid domain name' });
    if (!STACKS.includes(st)) return res.status(400).json({ message: 'Invalid stack' });
    if (authType === 'key' && !sshKey) return res.status(400).json({ message: 'SSH private key is required' });

    let userId: number, username: string, domainId: number | null = null;

    if (dir === 'push') {
      // Export an existing local site → must already be hosted here.
      const d = await query(
        `SELECT d.id, d.user_id, u.username FROM domains d JOIN users u ON u.id = d.user_id
         WHERE lower(d.domain_name) = lower($1)`, [dom]);
      if (d.rows.length === 0) return res.status(404).json({ message: 'No site with that domain is hosted here' });
      userId = d.rows[0].user_id; username = d.rows[0].username; domainId = d.rows[0].id;
    } else {
      // Import → target user must exist and the domain must be free.
      const u = await query('SELECT id, username FROM users WHERE id = $1', [targetUserId]);
      if (u.rows.length === 0) return res.status(404).json({ message: 'Target user not found' });
      userId = u.rows[0].id; username = u.rows[0].username;
      const dupe = await query('SELECT 1 FROM domains WHERE lower(domain_name) = lower($1)', [dom]);
      if (dupe.rowCount) return res.status(409).json({ message: 'That domain already exists here' });
    }

    const mig = await query(
      `INSERT INTO site_migrations
         (direction, source_host, source_port, ssh_user, remote_path, target_user_id, domain_name, stack,
          app_port, install_command, build_command, start_command)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [dir, host, port, sshUser, remotePath, userId, dom, st,
       appPort ? parseInt(appPort, 10) : null, installCommand ?? null, buildCommand ?? null, startCommand ?? null]);
    const migrationId = mig.rows[0].id;

    if (dir === 'pull') {
      // Register the domain so it appears in the panel; the worker writes its vhost.
      const docRoot = `/home/${username}/public_html/${dom}`;
      const domRes = await query(
        `INSERT INTO domains (user_id, domain_name, document_root, php_version) VALUES ($1,$2,$3,$4) RETURNING id`,
        [userId, dom, docRoot, phpVersion || '8.3']);
      domainId = domRes.rows[0].id;
    }

    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['MIGRATE_SITE', {
      migrationId, direction: dir, sourceHost: host, sourcePort: port, sshUser, authType: authType || 'key', sshPassword, sshKey,
      remotePath, userId, username, domainName: dom, domainId, stack: st,
      appPort, installCommand, buildCommand, startCommand, phpVersion: phpVersion || '8.3',
    }]);

    await logAudit(req, 'site.migrate', { targetType: 'domain', targetId: dom, metadata: { direction: dir, remoteHost: host, stack: st } });
    res.status(201).json({ id: migrationId });
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

// Cancel + clean up a migration's artifacts (vhost, app, db, files, domain;
// optionally the whole user if it has no other sites).
router.post('/:id/cancel', async (req: AuthRequest, res) => {
  const removeUser = req.body?.removeUser === true;
  try {
    const r = await query('SELECT id, status, domain_name FROM site_migrations WHERE id=$1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    if (r.rows[0].status === 'cancelled') return res.status(409).json({ message: 'Already cancelled' });
    await query("UPDATE site_migrations SET status='cancelling' WHERE id=$1", [req.params.id]);
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CLEANUP_SITE_MIGRATION', { migrationId: Number(req.params.id), removeUser }]);
    await logAudit(req, 'site.migrate_cancel', { targetType: 'domain', targetId: r.rows[0].domain_name, metadata: { removeUser } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

// Resume a FAILED migration: re-run it with freshly-supplied SSH credentials
// (host/path are reused from the record; secrets are never stored).
router.post('/:id/resume', async (req: AuthRequest, res) => {
  const { authType, sshPassword, sshKey } = req.body ?? {};
  try {
    const r = await query('SELECT * FROM site_migrations WHERE id=$1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const m = r.rows[0];
    if (m.status !== 'failed') return res.status(409).json({ message: 'Only failed migrations can be resumed' });
    if (authType === 'key' && !sshKey) return res.status(400).json({ message: 'SSH private key is required' });
    if (authType !== 'key' && !sshPassword) return res.status(400).json({ message: 'SSH password is required' });

    const u = await query('SELECT username FROM users WHERE id=$1', [m.target_user_id]);
    if (u.rows.length === 0) return res.status(409).json({ message: 'Target user no longer exists — cancel and re-create instead' });
    const d = await query('SELECT id FROM domains WHERE lower(domain_name)=lower($1)', [m.domain_name]);

    await query("UPDATE site_migrations SET status='pending', error_message=NULL WHERE id=$1", [req.params.id]);
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['MIGRATE_SITE', {
      migrationId: m.id, direction: m.direction, sourceHost: m.source_host, sourcePort: m.source_port,
      sshUser: m.ssh_user, authType: authType || 'key', sshPassword, sshKey,
      remotePath: m.remote_path, userId: m.target_user_id, username: u.rows[0].username,
      domainName: m.domain_name, domainId: d.rows[0]?.id ?? null, stack: m.stack,
      appPort: m.app_port, installCommand: m.install_command, buildCommand: m.build_command,
      startCommand: m.start_command, phpVersion: '8.3',
      // full-stack context (rebuilds the multi-component path on resume)
      frontendRoot: m.frontend_root, serverBlock: m.server_block, backends: m.backends ?? [],
    }]);
    await logAudit(req, 'site.migrate_resume', { targetType: 'domain', targetId: m.domain_name });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

// Remove a migration record from history (only when it isn't actively running).
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const r = await query('SELECT status FROM site_migrations WHERE id=$1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    if (['running', 'pending', 'cancelling'].includes(r.rows[0].status))
      return res.status(409).json({ message: 'Cancel the migration before deleting its record' });
    await query('DELETE FROM site_migrations WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

export default router;
