import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { runWorkerTask } from '../lib/workerTask.js';
const router = express.Router();
router.use(authenticateAdmin);
// ── Aggregate stats ────────────────────────────────────────────────────────────
router.get('/stats', async (_req, res) => {
    try {
        const [mailboxes, quarantined, released, filterEnabled, rules, globalRules, highSeverity, topSenders, scoreDist, recent, dailyVolume, allTimeTotal, avgScore, topMailboxes, topRecipientDomains, topSenderDomains, weeklyTrend, serverStats, virusTotal,] = await Promise.all([
            query('SELECT COUNT(*) FROM mail_users'),
            query("SELECT COUNT(*) FROM mail_quarantine WHERE released_at IS NULL"),
            query("SELECT COUNT(*) FROM mail_quarantine WHERE released_at IS NOT NULL AND released_at >= NOW() - INTERVAL '30 days'"),
            query('SELECT COUNT(*) FROM mail_users WHERE spam_filter_enabled = TRUE'),
            query('SELECT COUNT(*) FROM mail_access_control'),
            query('SELECT COUNT(*) FROM mail_global_rules'),
            query("SELECT COUNT(*) FROM mail_quarantine WHERE spam_score > 10 AND released_at IS NULL"),
            query(`
        SELECT sender, COUNT(*)::int AS count
        FROM mail_quarantine
        WHERE released_at IS NULL
        GROUP BY sender
        ORDER BY count DESC
        LIMIT 10
      `),
            query(`
        SELECT
          CASE
            WHEN spam_score < 5  THEN '0–5'
            WHEN spam_score < 10 THEN '5–10'
            WHEN spam_score < 20 THEN '10–20'
            ELSE '20+'
          END AS range,
          COUNT(*)::int AS count
        FROM mail_quarantine
        WHERE released_at IS NULL
        GROUP BY range
        ORDER BY MIN(spam_score)
      `),
            query(`
        SELECT mq.id, mq.sender, mq.subject, mq.spam_score, mq.virus_name, mq.created_at, mq.message_date,
               mu.email AS mailbox_email, md.domain_name, u.username AS owner
        FROM mail_quarantine mq
        JOIN mail_users mu ON mq.mail_user_id = mu.id
        JOIN mail_domains md ON mu.domain_id = md.id
        JOIN users u ON md.user_id = u.id
        WHERE mq.released_at IS NULL
        ORDER BY COALESCE(mq.message_date, mq.created_at) DESC
        LIMIT 8
      `),
            query(`
        SELECT DATE(created_at) AS day, COUNT(*)::int AS count
        FROM mail_quarantine
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY day
        ORDER BY day ASC
      `),
            // All-time quarantine total (including released false positives)
            query('SELECT COUNT(*)::int AS count FROM mail_quarantine'),
            // Average spam score across all active quarantine
            query(`
        SELECT ROUND(AVG(spam_score)::numeric, 2)::real AS avg
        FROM mail_quarantine
        WHERE spam_score IS NOT NULL AND released_at IS NULL
      `),
            // Top mailboxes by spam received (all-time)
            query(`
        SELECT mu.email, md.domain_name, u.username AS owner,
               COUNT(*)::int AS spam_count,
               ROUND(AVG(mq.spam_score)::numeric, 1)::real AS avg_score
        FROM mail_quarantine mq
        JOIN mail_users mu ON mq.mail_user_id = mu.id
        JOIN mail_domains md ON mu.domain_id = md.id
        JOIN users u ON md.user_id = u.id
        GROUP BY mu.email, md.domain_name, u.username
        ORDER BY spam_count DESC
        LIMIT 10
      `),
            // Top receiving domains by spam volume
            query(`
        SELECT md.domain_name, COUNT(*)::int AS spam_count
        FROM mail_quarantine mq
        JOIN mail_users mu ON mq.mail_user_id = mu.id
        JOIN mail_domains md ON mu.domain_id = md.id
        GROUP BY md.domain_name
        ORDER BY spam_count DESC
        LIMIT 10
      `),
            // Top sender domains found in quarantine (extract domain from sender address)
            query(`
        SELECT
          CASE WHEN sender LIKE '%@%' THEN split_part(sender, '@', 2) ELSE sender END AS sender_domain,
          COUNT(*)::int AS count,
          ROUND(AVG(spam_score)::numeric, 1)::real AS avg_score
        FROM mail_quarantine
        WHERE released_at IS NULL
        GROUP BY sender_domain
        ORDER BY count DESC
        LIMIT 10
      `),
            // Week-over-week quarantine volume
            query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int  AS this_week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14 days'
                              AND created_at <  NOW() - INTERVAL '7 days')::int  AS last_week
        FROM mail_quarantine
      `),
            // Total emails received (scanned) from Postfix log tracker
            query('SELECT COALESCE(SUM(total_received), 0)::int AS total FROM mail_server_stats'),
            // Virus detections in quarantined mail
            query(`
        SELECT COUNT(*)::int AS count,
               COALESCE(json_agg(json_build_object('name', virus_name, 'count', cnt) ORDER BY cnt DESC), '[]') AS top_viruses
        FROM (
          SELECT virus_name, COUNT(*)::int AS cnt
          FROM mail_quarantine
          WHERE virus_name IS NOT NULL AND released_at IS NULL
          GROUP BY virus_name
          ORDER BY cnt DESC
          LIMIT 5
        ) sub
      `),
        ]);
        const totalScanned = parseInt(serverStats.rows[0].total) || 0;
        const totalQuarantined = parseInt(quarantined.rows[0].count);
        const catchRate = totalScanned > 0
            ? Math.round((totalQuarantined / totalScanned) * 1000) / 10 // one decimal %
            : null;
        res.json({
            totalMailboxes: parseInt(mailboxes.rows[0].count),
            totalQuarantined,
            releasedCount: parseInt(released.rows[0].count),
            filterEnabled: parseInt(filterEnabled.rows[0].count),
            totalRules: parseInt(rules.rows[0].count) + parseInt(globalRules.rows[0].count),
            highSeverity: parseInt(highSeverity.rows[0].count),
            topSenders: topSenders.rows,
            scoreDistribution: scoreDist.rows,
            recentQuarantine: recent.rows,
            dailyVolume: dailyVolume.rows,
            allTimeQuarantined: parseInt(allTimeTotal.rows[0].count),
            avgSpamScore: avgScore.rows[0].avg ?? null,
            topMailboxesBySpam: topMailboxes.rows,
            topRecipientDomains: topRecipientDomains.rows,
            topSenderDomains: topSenderDomains.rows,
            weeklyTrend: weeklyTrend.rows[0] ?? { this_week: 0, last_week: 0 },
            totalScanned,
            catchRate,
            virusCount: parseInt(virusTotal.rows[0].count),
            topViruses: virusTotal.rows[0].top_viruses ?? [],
        });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Quarantine: list all (admin) ───────────────────────────────────────────────
router.get('/quarantine', async (req, res) => {
    const { search, userId, dateFrom, dateTo, limit = '100', offset = '0' } = req.query;
    try {
        const params = [];
        const wheres = ['mq.released_at IS NULL'];
        let p = 1;
        if (userId) {
            wheres.push(`md.user_id = $${p++}`);
            params.push(userId);
        }
        if (search && typeof search === 'string' && search.trim()) {
            wheres.push(`(mq.sender ILIKE $${p} OR mq.subject ILIKE $${p})`);
            params.push(`%${search.trim()}%`);
            p++;
        }
        if (dateFrom && typeof dateFrom === 'string') {
            wheres.push(`mq.created_at >= $${p++}`);
            params.push(dateFrom);
        }
        if (dateTo && typeof dateTo === 'string') {
            wheres.push(`mq.created_at <= $${p++}`);
            params.push(dateTo);
        }
        const where = `WHERE ${wheres.join(' AND ')}`;
        const [rows, countRow] = await Promise.all([
            query(`
        SELECT mq.id, mq.sender, mq.subject, mq.spam_score, mq.virus_name, mq.created_at, mq.message_date, mq.file_path,
               mq.mail_user_id, mu.email AS mailbox_email, md.domain_name, u.username AS owner
        FROM mail_quarantine mq
        JOIN mail_users mu ON mq.mail_user_id = mu.id
        JOIN mail_domains md ON mu.domain_id = md.id
        JOIN users u ON md.user_id = u.id
        ${where}
        ORDER BY COALESCE(mq.message_date, mq.created_at) DESC
        LIMIT $${p} OFFSET $${p + 1}
      `, [...params, limit, offset]),
            query(`
        SELECT COUNT(*)::int AS total
        FROM mail_quarantine mq
        JOIN mail_users mu ON mq.mail_user_id = mu.id
        JOIN mail_domains md ON mu.domain_id = md.id
        JOIN users u ON md.user_id = u.id
        ${where}
      `, params),
        ]);
        res.json({ items: rows.rows, total: countRow.rows[0].total });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Quarantine: bulk action ────────────────────────────────────────────────────
// Must be defined BEFORE /:id routes to avoid "bulk" matching as :id
router.post('/quarantine/bulk', async (req, res) => {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || !ids.length || !['release', 'delete'].includes(action)) {
        return res.status(400).json({ message: 'ids[] and action (release|delete) required' });
    }
    const safeIds = ids.slice(0, 500).map(Number).filter(n => Number.isFinite(n) && n > 0);
    try {
        if (action === 'delete') {
            const qRes = await query('SELECT file_path FROM mail_quarantine WHERE id = ANY($1)', [safeIds]);
            await query('DELETE FROM mail_quarantine WHERE id = ANY($1)', [safeIds]);
            for (const row of qRes.rows) {
                if (row.file_path) {
                    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['DELETE_FILE', { filePath: row.file_path }]);
                }
            }
        }
        else {
            const qRes = await query(`
        SELECT mq.id, mq.file_path, mu.email AS recipient
        FROM mail_quarantine mq
        JOIN mail_users mu ON mq.mail_user_id = mu.id
        WHERE mq.id = ANY($1)
      `, [safeIds]);
            for (const row of qRes.rows) {
                await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['RELEASE_QUARANTINE', { id: row.id, filePath: row.file_path, recipient: row.recipient }]);
            }
        }
        res.json({ processed: safeIds.length });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Quarantine: single release ─────────────────────────────────────────────────
router.post('/quarantine/:id/release', async (req, res) => {
    const { id } = req.params;
    const { addToAllowlist } = req.body;
    try {
        const qRes = await query(`
      SELECT mq.*, mu.email AS recipient
      FROM mail_quarantine mq
      JOIN mail_users mu ON mq.mail_user_id = mu.id
      WHERE mq.id = $1
    `, [id]);
        if (qRes.rows.length === 0)
            return res.status(404).json({ message: 'Not found' });
        const item = qRes.rows[0];
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['RELEASE_QUARANTINE', { id: item.id, filePath: item.file_path, recipient: item.recipient }]);
        if (addToAllowlist && item.sender) {
            await query(`
        INSERT INTO mail_access_control (mail_user_id, sender_pattern, access_type)
        VALUES ($1, $2, 'allow')
        ON CONFLICT (mail_user_id, sender_pattern) DO UPDATE SET access_type = 'allow'
      `, [item.mail_user_id, item.sender]);
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_SPAM_RULES', { mailUserId: item.mail_user_id }]);
        }
        res.json({ message: addToAllowlist ? 'Released & sender allowlisted' : 'Release queued' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Quarantine: view message source + parsed contents ──────────────────────────
// Delegates to the worker (the .eml lives in vmail-owned Maildir the API can't read).
router.get('/quarantine/:id/message', async (req, res) => {
    const { id } = req.params;
    try {
        const exists = await query('SELECT id FROM mail_quarantine WHERE id = $1', [id]);
        if (exists.rowCount === 0)
            return res.status(404).json({ message: 'Not found' });
        const result = await runWorkerTask('READ_QUARANTINE_MESSAGE', { quarantineId: Number(id) });
        res.json(result);
    }
    catch (err) {
        res.status(502).json({ message: err.message });
    }
});
// ── Quarantine: block sender (blacklist + delete the message) ───────────────────
router.post('/quarantine/:id/block', async (req, res) => {
    const { id } = req.params;
    try {
        const qRes = await query('SELECT id, file_path, sender, mail_user_id FROM mail_quarantine WHERE id = $1', [id]);
        if (qRes.rows.length === 0)
            return res.status(404).json({ message: 'Not found' });
        const item = qRes.rows[0];
        if (item.sender) {
            await query(`
        INSERT INTO mail_access_control (mail_user_id, sender_pattern, access_type)
        VALUES ($1, $2, 'block')
        ON CONFLICT (mail_user_id, sender_pattern) DO UPDATE SET access_type = 'block'
      `, [item.mail_user_id, item.sender]);
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_SPAM_RULES', { mailUserId: item.mail_user_id }]);
        }
        await query('DELETE FROM mail_quarantine WHERE id = $1', [id]);
        if (item.file_path) {
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['DELETE_FILE', { filePath: item.file_path }]);
        }
        res.json({ message: 'Sender blocked and message deleted', sender: item.sender });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Quarantine: single delete ──────────────────────────────────────────────────
router.delete('/quarantine/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const qRes = await query('SELECT file_path FROM mail_quarantine WHERE id = $1', [id]);
        if (qRes.rows.length === 0)
            return res.status(404).json({ message: 'Not found' });
        await query('DELETE FROM mail_quarantine WHERE id = $1', [id]);
        if (qRes.rows[0].file_path) {
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['DELETE_FILE', { filePath: qRes.rows[0].file_path }]);
        }
        res.json({ message: 'Deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Access-control rules: list all ────────────────────────────────────────────
router.get('/rules', async (_req, res) => {
    try {
        const result = await query(`
      SELECT mac.id, mac.sender_pattern, mac.access_type, mac.created_at,
             mac.mail_user_id, mu.email AS mailbox_email,
             md.domain_name, u.username AS owner
      FROM mail_access_control mac
      JOIN mail_users mu ON mac.mail_user_id = mu.id
      JOIN mail_domains md ON mu.domain_id = md.id
      JOIN users u ON md.user_id = u.id
      ORDER BY mac.access_type ASC, mac.sender_pattern ASC
    `);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Access-control rules: add (admin on behalf of any mailbox) ────────────────
router.post('/rules', async (req, res) => {
    const { mailUserId, senderPattern, accessType } = req.body;
    if (!mailUserId || !senderPattern || !['allow', 'block'].includes(accessType ?? '')) {
        return res.status(400).json({ message: 'mailUserId, senderPattern, and accessType (allow|block) required' });
    }
    try {
        const result = await query(`
      INSERT INTO mail_access_control (mail_user_id, sender_pattern, access_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (mail_user_id, sender_pattern) DO UPDATE SET access_type = EXCLUDED.access_type
      RETURNING *
    `, [mailUserId, senderPattern, accessType]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_SPAM_RULES', { mailUserId }]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Access-control rules: delete ──────────────────────────────────────────────
router.delete('/rules/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await query('SELECT mail_user_id FROM mail_access_control WHERE id = $1', [id]);
        await query('DELETE FROM mail_access_control WHERE id = $1', [id]);
        if (existing.rows[0]) {
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_SPAM_RULES', { mailUserId: existing.rows[0].mail_user_id }]);
        }
        res.json({ message: 'Rule deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Global allow/block rules (server-wide) ─────────────────────────────────────
router.get('/global-rules', async (_req, res) => {
    try {
        const result = await query('SELECT * FROM mail_global_rules ORDER BY access_type ASC, sender_pattern ASC');
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/global-rules', async (req, res) => {
    const { senderPattern, accessType, note } = req.body;
    if (!senderPattern || !['allow', 'block'].includes(accessType ?? '')) {
        return res.status(400).json({ message: 'senderPattern and accessType (allow|block) required' });
    }
    try {
        const result = await query(`
      INSERT INTO mail_global_rules (sender_pattern, access_type, note)
      VALUES ($1, $2, $3)
      ON CONFLICT (sender_pattern) DO UPDATE
        SET access_type = EXCLUDED.access_type, note = EXCLUDED.note
      RETURNING *
    `, [senderPattern, accessType, note ?? null]);
        // Sync all mailboxes — global rule affects everyone
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_SPAM_RULES', {}]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.delete('/global-rules/:id', async (req, res) => {
    try {
        await query('DELETE FROM mail_global_rules WHERE id = $1', [req.params.id]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_SPAM_RULES', {}]);
        res.json({ message: 'Global rule deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Spam digest ────────────────────────────────────────────────────────────────
router.post('/digest/all', async (_req, res) => {
    try {
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SEND_SPAM_DIGEST', {}]);
        res.json({ message: 'Digest queued for all users' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/digest/:mailUserId', async (req, res) => {
    const { mailUserId } = req.params;
    try {
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SEND_SPAM_DIGEST', { mailUserId: parseInt(mailUserId, 10) }]);
        res.json({ message: 'Digest queued' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Anti-spam infrastructure settings (greylisting / RBL / attachment) ───────
const INFRA_KEYS = [
    'greylisting_enabled', 'rbl_enabled', 'mail_rbls',
    'attachment_blocking_enabled', 'blocked_attachment_extensions',
];
router.get('/settings', async (_req, res) => {
    try {
        const result = await query(`SELECT key, value FROM server_settings WHERE key = ANY($1)`, [INFRA_KEYS]);
        const settings = {};
        for (const row of result.rows)
            settings[row.key] = row.value;
        res.json(settings);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.put('/settings', async (req, res) => {
    const body = req.body;
    try {
        for (const key of INFRA_KEYS) {
            if (body[key] === undefined)
                continue;
            let value = String(body[key]);
            // Validate the free-text lists so they can't inject hostnames/extensions
            // that later land in Postfix config.
            if (key === 'mail_rbls') {
                value = value.split(',').map(z => z.trim()).filter(z => /^[a-zA-Z0-9.\-]+$/.test(z)).join(',');
            }
            else if (key === 'blocked_attachment_extensions') {
                value = value.split(',').map(e => e.trim().toLowerCase()).filter(e => /^[a-z0-9]{1,10}$/.test(e)).join(',');
            }
            else {
                value = value === 'true' ? 'true' : 'false';
            }
            await query(`INSERT INTO server_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]);
        }
        // Re-apply mail config so changes take effect.
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CONFIGURE_MAIL_SERVER', {}]);
        res.json({ message: 'Spam infrastructure settings updated' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=adminSpam.js.map