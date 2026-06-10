import express from 'express';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateClient);
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM domains WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Subdomains ───────────────────────────────────────────────────────────────
const SUBDOMAIN_LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
// List subdomains of a parent domain the client owns
router.get('/:id/subdomains', async (req, res) => {
    const { id } = req.params;
    try {
        const parent = await query('SELECT id FROM domains WHERE id = $1 AND user_id = $2', [id, req.userId]);
        if (parent.rowCount === 0)
            return res.status(404).json({ message: 'Domain not found' });
        const result = await query('SELECT * FROM domains WHERE parent_domain_id = $1 AND user_id = $2 ORDER BY domain_name', [id, req.userId]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Create a subdomain under a parent domain (enforces the package cap)
router.post('/:id/subdomains', async (req, res) => {
    const { id } = req.params;
    const { label } = req.body;
    try {
        if (!label || !SUBDOMAIN_LABEL_RE.test(label)) {
            return res.status(400).json({ message: 'Invalid subdomain label' });
        }
        const parentRes = await query('SELECT d.domain_name, u.username, u.package_id FROM domains d JOIN users u ON d.user_id = u.id WHERE d.id = $1 AND d.user_id = $2 AND d.is_subdomain = FALSE', [id, req.userId]);
        if (parentRes.rows.length === 0)
            return res.status(404).json({ message: 'Parent domain not found' });
        const { domain_name: parentName, username, package_id } = parentRes.rows[0];
        // Enforce the package subdomain cap (-1 = unlimited).
        if (package_id) {
            const pkgRes = await query('SELECT subdomains_allowed FROM products WHERE id = $1', [package_id]);
            const cap = pkgRes.rows[0]?.subdomains_allowed;
            if (cap != null && cap !== -1) {
                const countRes = await query('SELECT COUNT(*)::int AS n FROM domains WHERE parent_domain_id = $1', [id]);
                if ((countRes.rows[0]?.n ?? 0) >= cap) {
                    return res.status(403).json({ message: `Subdomain limit reached (${cap})` });
                }
            }
        }
        const fullName = `${label.toLowerCase()}.${parentName}`;
        const docRoot = `/home/${username}/public_html/${fullName}`;
        const dup = await query('SELECT id FROM domains WHERE domain_name = $1', [fullName]);
        if (dup.rows.length > 0)
            return res.status(400).json({ message: 'Subdomain already exists' });
        const result = await query(`INSERT INTO domains (user_id, domain_name, document_root, php_version, parent_domain_id, is_subdomain)
       VALUES ($1, $2, $3, '8.3', $4, TRUE) RETURNING *`, [req.userId, fullName, docRoot, id]);
        const domain = result.rows[0];
        const taskRes = await query('INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id', ['CREATE_DOMAIN', { domainId: domain.id, domainName: fullName, username, phpVersion: '8.3', docRoot }]);
        res.status(201).json({ ...domain, taskId: taskRes.rows[0].id });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Delete a subdomain
router.delete('/subdomains/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const subRes = await query('SELECT d.domain_name, u.username FROM domains d JOIN users u ON d.user_id = u.id WHERE d.id = $1 AND d.user_id = $2 AND d.is_subdomain = TRUE', [id, req.userId]);
        if (subRes.rows.length === 0)
            return res.status(404).json({ message: 'Subdomain not found' });
        const { domain_name, username } = subRes.rows[0];
        await query('DELETE FROM domains WHERE id = $1', [id]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['DELETE_DOMAIN', { domainName: domain_name, username }]);
        res.json({ message: 'Subdomain deletion queued' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Clients can trigger SSL installation for their own domains
router.post('/:id/install-ssl', async (req, res) => {
    const { id } = req.params;
    try {
        const domainRes = await query('SELECT domain_name FROM domains WHERE id = $1 AND user_id = $2', [id, req.userId]);
        if (domainRes.rows.length === 0) {
            return res.status(404).json({ message: 'Domain not found or access denied' });
        }
        const { domain_name } = domainRes.rows[0];
        const taskRes = await query('INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id', ['INSTALL_SSL', { domainName: domain_name }]);
        res.json({ message: 'SSL installation task started', taskId: taskRes.rows[0].id });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=clientDomains.js.map