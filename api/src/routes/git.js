import express from 'express';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
import crypto from 'crypto';
const router = express.Router();
// Public Webhook Receiver (No Auth)
router.post('/webhook/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const repoRes = await query('SELECT r.*, u.username FROM user_git_repos r JOIN users u ON r.user_id = u.id WHERE r.webhook_token = $1', [token]);
        if (repoRes.rows.length === 0)
            return res.status(404).json({ message: 'Invalid token' });
        const repo = repoRes.rows[0];
        // Create worker task for git pull
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['GIT_DEPLOY', {
                username: repo.username,
                repoUrl: repo.repo_url,
                branch: repo.branch,
                deployPath: repo.deploy_path,
                repoId: repo.id
            }]);
        res.json({ message: 'Deployment triggered' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Authenticated Routes
router.use(authenticateClient);
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT r.*, d.domain_name FROM user_git_repos r JOIN domains d ON r.domain_id = d.id WHERE r.user_id = $1', [req.userId]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/', async (req, res) => {
    const { domainId, repoUrl, branch, deployPath } = req.body;
    const webhookToken = crypto.randomBytes(32).toString('hex');
    try {
        // Verify domain
        const domainRes = await query('SELECT domain_name FROM domains WHERE id = $1 AND user_id = $2', [domainId, req.userId]);
        if (domainRes.rows.length === 0)
            return res.status(403).json({ message: 'Domain access denied' });
        const result = await query('INSERT INTO user_git_repos (user_id, domain_id, repo_url, branch, deploy_path, webhook_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [req.userId, domainId, repoUrl, branch || 'main', deployPath || '', webhookToken]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await query('DELETE FROM user_git_repos WHERE id = $1 AND user_id = $2', [id, req.userId]);
        res.json({ message: 'Repo unlinked' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=git.js.map