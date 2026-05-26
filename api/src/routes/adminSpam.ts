import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateAdmin);

// ── Aggregate stats ────────────────────────────────────────────────────────────

router.get('/stats', async (_req, res) => {
  try {
    const [
      mailboxes,
      quarantined,
      filterEnabled,
      rules,
      highSeverity,
      topSenders,
      scoreDist,
      recent,
      dailyVolume,
    ] = await Promise.all([
      query('SELECT COUNT(*) FROM mail_users'),
      query('SELECT COUNT(*) FROM mail_quarantine'),
      query('SELECT COUNT(*) FROM mail_users WHERE spam_filter_enabled = TRUE'),
      query('SELECT COUNT(*) FROM mail_access_control'),
      query("SELECT COUNT(*) FROM mail_quarantine WHERE spam_score > 10"),
      query(`
        SELECT sender, COUNT(*)::int AS count
        FROM mail_quarantine
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
        GROUP BY range
        ORDER BY MIN(spam_score)
      `),
      query(`
        SELECT mq.id, mq.sender, mq.subject, mq.spam_score, mq.created_at,
               mu.email AS mailbox_email, u.username AS owner
        FROM mail_quarantine mq
        JOIN mail_users mu ON mq.mail_user_id = mu.id
        JOIN mail_domains md ON mu.domain_id = md.id
        JOIN users u ON md.user_id = u.id
        ORDER BY mq.created_at DESC
        LIMIT 8
      `),
      query(`
        SELECT DATE(created_at) AS day, COUNT(*)::int AS count
        FROM mail_quarantine
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY day
        ORDER BY day ASC
      `),
    ]);

    res.json({
      totalMailboxes:    parseInt(mailboxes.rows[0].count),
      totalQuarantined:  parseInt(quarantined.rows[0].count),
      filterEnabled:     parseInt(filterEnabled.rows[0].count),
      totalRules:        parseInt(rules.rows[0].count),
      highSeverity:      parseInt(highSeverity.rows[0].count),
      topSenders:        topSenders.rows,
      scoreDistribution: scoreDist.rows,
      recentQuarantine:  recent.rows,
      dailyVolume:       dailyVolume.rows,
    });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── Quarantine: list all (admin) ───────────────────────────────────────────────

router.get('/quarantine', async (req, res) => {
  const { search, userId, limit = '100', offset = '0' } = req.query;
  try {
    const params: unknown[] = [];
    const wheres: string[] = [];
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

    const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

    const [rows, countRow] = await Promise.all([
      query(`
        SELECT mq.id, mq.sender, mq.subject, mq.spam_score, mq.created_at, mq.file_path,
               mq.mail_user_id, mu.email AS mailbox_email, md.domain_name, u.username AS owner
        FROM mail_quarantine mq
        JOIN mail_users mu ON mq.mail_user_id = mu.id
        JOIN mail_domains md ON mu.domain_id = md.id
        JOIN users u ON md.user_id = u.id
        ${where}
        ORDER BY mq.created_at DESC
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
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── Quarantine: bulk action ────────────────────────────────────────────────────
// Must be defined BEFORE /:id routes to avoid "bulk" matching as :id

router.post('/quarantine/bulk', async (req, res) => {
  const { ids, action } = req.body as { ids: number[]; action: 'release' | 'delete' };
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
          await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
            ['DELETE_FILE', { filePath: row.file_path }]);
        }
      }
    } else {
      const qRes = await query(`
        SELECT mq.id, mq.file_path, mu.email AS recipient
        FROM mail_quarantine mq
        JOIN mail_users mu ON mq.mail_user_id = mu.id
        WHERE mq.id = ANY($1)
      `, [safeIds]);
      for (const row of qRes.rows) {
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
          ['RELEASE_QUARANTINE', { id: row.id, filePath: row.file_path, recipient: row.recipient }]);
      }
    }
    res.json({ processed: safeIds.length });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── Quarantine: single release ─────────────────────────────────────────────────

router.post('/quarantine/:id/release', async (req, res) => {
  const { id } = req.params;
  try {
    const qRes = await query(`
      SELECT mq.*, mu.email AS recipient
      FROM mail_quarantine mq
      JOIN mail_users mu ON mq.mail_user_id = mu.id
      WHERE mq.id = $1
    `, [id]);
    if (qRes.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const item = qRes.rows[0];
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['RELEASE_QUARANTINE', { id: item.id, filePath: item.file_path, recipient: item.recipient }]);
    res.json({ message: 'Release queued' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── Quarantine: single delete ──────────────────────────────────────────────────

router.delete('/quarantine/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const qRes = await query('SELECT file_path FROM mail_quarantine WHERE id = $1', [id]);
    if (qRes.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    await query('DELETE FROM mail_quarantine WHERE id = $1', [id]);
    if (qRes.rows[0].file_path) {
      await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
        ['DELETE_FILE', { filePath: qRes.rows[0].file_path }]);
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
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
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── Access-control rules: delete ──────────────────────────────────────────────

router.delete('/rules/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM mail_access_control WHERE id = $1', [id]);
    res.json({ message: 'Rule deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── Spam digest ────────────────────────────────────────────────────────────────

router.post('/digest/all', async (_req, res) => {
  try {
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['SEND_SPAM_DIGEST', {}]);
    res.json({ message: 'Digest queued for all users' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/digest/:mailUserId', async (req, res) => {
  const { mailUserId } = req.params;
  try {
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['SEND_SPAM_DIGEST', { mailUserId: parseInt(mailUserId, 10) }]);
    res.json({ message: 'Digest queued' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
