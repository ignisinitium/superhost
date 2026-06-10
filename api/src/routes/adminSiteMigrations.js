import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { logAudit } from '../audit.js';
const router = express.Router();
router.use(authenticateAdmin);
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i;
const HOST_RE = /^(?!-)[a-z0-9.-]{1,253}$|^(\d{1,3}\.){3}\d{1,3}$/i;
const STACKS = ['node', 'python', 'static', 'php'];
// List migrations
router.get('/', async (_req, res) => {
    try {
        const r = await query(`SELECT m.id, m.source_host, m.ssh_user, m.remote_path, m.domain_name, m.stack,
              m.status, m.error_message, m.created_at, m.completed_at, u.username AS target_user
       FROM site_migrations m LEFT JOIN users u ON u.id = m.target_user_id
       ORDER BY m.created_at DESC LIMIT 100`);
        res.json(r.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// One migration (status + full log)
router.get('/:id', async (req, res) => {
    try {
        const r = await query('SELECT * FROM site_migrations WHERE id = $1', [req.params.id]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: 'Not found' });
        res.json(r.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Test SSH connectivity (reuses the worker's TEST_SSH_CONNECTION); UI polls the task.
router.post('/test-connection', async (req, res) => {
    const { host, port, user, authType, sshPassword, sshKey } = req.body ?? {};
    try {
        const t = await query('INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id', ['TEST_SSH_CONNECTION', { host, port: parseInt(port ?? 22, 10), user, authType, sshPassword, sshKey }]);
        res.json({ taskId: t.rows[0].id });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Start a migration
router.post('/', async (req, res) => {
    const { sourceHost, sourcePort, sshUser, authType, sshPassword, sshKey, remotePath, targetUserId, domainName, stack, appPort, installCommand, buildCommand, startCommand, phpVersion, } = req.body ?? {};
    const host = String(sourceHost ?? '').trim();
    const dom = String(domainName ?? '').toLowerCase().trim();
    const st = String(stack ?? 'static');
    try {
        if (!HOST_RE.test(host))
            return res.status(400).json({ message: 'Invalid source host' });
        if (!sshUser)
            return res.status(400).json({ message: 'SSH user is required' });
        if (!remotePath || !String(remotePath).startsWith('/'))
            return res.status(400).json({ message: 'Remote path must be absolute' });
        if (!DOMAIN_RE.test(dom))
            return res.status(400).json({ message: 'Invalid domain name' });
        if (!STACKS.includes(st))
            return res.status(400).json({ message: 'Invalid stack' });
        if (authType === 'key' && !sshKey)
            return res.status(400).json({ message: 'SSH private key is required' });
        const u = await query('SELECT id, username FROM users WHERE id = $1', [targetUserId]);
        if (u.rows.length === 0)
            return res.status(404).json({ message: 'Target user not found' });
        const { id: userId, username } = u.rows[0];
        const dupe = await query('SELECT 1 FROM domains WHERE lower(domain_name) = lower($1)', [dom]);
        if (dupe.rowCount)
            return res.status(409).json({ message: 'That domain already exists here' });
        const port = parseInt(sourcePort ?? 22, 10) || 22;
        const mig = await query(`INSERT INTO site_migrations
         (source_host, source_port, ssh_user, remote_path, target_user_id, domain_name, stack,
          app_port, install_command, build_command, start_command)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [host, port, sshUser, remotePath, userId, dom, st,
            appPort ? parseInt(appPort, 10) : null, installCommand ?? null, buildCommand ?? null, startCommand ?? null]);
        const migrationId = mig.rows[0].id;
        // Register the domain so it appears in the panel; the worker writes its vhost.
        const docRoot = `/home/${username}/public_html/${dom}`;
        const domRes = await query(`INSERT INTO domains (user_id, domain_name, document_root, php_version) VALUES ($1,$2,$3,$4) RETURNING id`, [userId, dom, docRoot, phpVersion || '8.3']);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['MIGRATE_SITE', {
                migrationId, sourceHost: host, sourcePort: port, sshUser, authType: authType || 'key', sshPassword, sshKey,
                remotePath, userId, username, domainName: dom, domainId: domRes.rows[0].id, stack: st,
                appPort, installCommand, buildCommand, startCommand, phpVersion: phpVersion || '8.3',
            }]);
        await logAudit(req, 'site.migrate', { targetType: 'domain', targetId: dom, metadata: { sourceHost: host, stack: st } });
        res.status(201).json({ id: migrationId });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=adminSiteMigrations.js.map