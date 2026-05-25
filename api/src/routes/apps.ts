import express from 'express';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

router.use(authenticateClient);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      'SELECT a.*, d.domain_name FROM user_apps a JOIN domains d ON a.domain_id = d.id WHERE a.user_id = $1 ORDER BY a.created_at DESC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  const { domainId, name, type, startupScript } = req.body;
  const userId = req.userId!;

  try {
    // 1. Verify domain
    const domainRes = await query('SELECT domain_name FROM domains WHERE id = $1 AND user_id = $2', [domainId, userId]);
    if (domainRes.rows.length === 0) return res.status(403).json({ message: 'Domain access denied' });
    const domainName = domainRes.rows[0].domain_name;

    // 2. Find a free port between 40000 and 50000
    const portRes = await query('SELECT port FROM user_apps UNION SELECT port FROM user_ports');
    const usedPorts = portRes.rows.map(r => r.port);
    let port = 40000;
    while (usedPorts.includes(port)) port++;

    // 3. Save to DB
    const result = await query(
      'INSERT INTO user_apps (user_id, domain_id, name, type, port, startup_script) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [userId, domainId, name, type, port, startupScript]
    );

    // 4. Get username
    const userRes = await query('SELECT username FROM users WHERE id = $1', [userId]);
    const username = userRes.rows[0].username;

    // 5. Create worker task
    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['SETUP_APP_RUNTIME', { 
        appId: result.rows[0].id,
        username,
        domainName,
        type,
        port,
        startupScript
      }]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/:id/manage', async (req: AuthRequest, res) => {
  const { action } = req.body; // start, stop, restart
  const { id } = req.params;
  try {
    const appRes = await query('SELECT a.*, u.username FROM user_apps a JOIN users u ON a.user_id = u.id WHERE a.id = $1 AND a.user_id = $2', [id, req.userId]);
    if (appRes.rows.length === 0) return res.status(404).json({ message: 'App not found' });
    const app = appRes.rows[0];

    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['MANAGE_APP_RUNTIME', { appId: app.id, username: app.username, action, type: app.type, name: app.name }]
    );

    res.json({ message: `App ${action} task queued` });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const appRes = await query('SELECT a.*, u.username, d.domain_name FROM user_apps a JOIN users u ON a.user_id = u.id JOIN domains d ON a.domain_id = d.id WHERE a.id = $1 AND a.user_id = $2', [id, req.userId]);
    if (appRes.rows.length === 0) return res.status(404).json({ message: 'App not found' });
    const app = appRes.rows[0];

    await query('DELETE FROM user_apps WHERE id = $1', [id]);

    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['DELETE_APP_RUNTIME', { appId: app.id, username: app.username, domainName: app.domain_name, name: app.name }]
    );

    res.json({ message: 'App deletion task queued' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/install-wordpress', async (req: AuthRequest, res) => {
  const { domainId, title, adminUser, adminPassword, adminEmail } = req.body;
  const userId = req.userId!;

  try {
    // 1. Verify the domain belongs to the user
    const domainRes = await query('SELECT id, domain_name FROM domains WHERE id = $1 AND user_id = $2', [domainId, userId]);
    if (domainRes.rows.length === 0) {
      return res.status(403).json({ message: 'Domain not found or access denied' });
    }
    const domainName = domainRes.rows[0].domain_name;

    // 2. Get the username for database prefixing
    const userRes = await query('SELECT username FROM users WHERE id = $1', [userId]);
    const username = userRes.rows[0].username;

    // 3. Generate unique DB credentials for this installation
    const dbSuffix = crypto.randomBytes(4).toString('hex');
    const fullDbName = `${username}_wp_${dbSuffix}`.substring(0, 64);
    const fullDbUser = fullDbName;
    const dbPassword = crypto.randomBytes(16).toString('base64');

    // 4. Save DB to PostgreSQL tracking table
    await query(
      'INSERT INTO databases (user_id, db_name, db_user) VALUES ($1, $2, $3)',
      [userId, fullDbName, fullDbUser]
    );

    // 5. Queue worker tasks: Create DB, then Install WP
    // We send a single task that orchestrates both to ensure atomic installation
    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['INSTALL_WORDPRESS', { 
        domainName, 
        username,
        dbName: fullDbName, 
        dbUser: fullDbUser, 
        dbPassword,
        siteTitle: title || `${domainName} - WordPress`,
        adminUser,
        adminPassword,
        adminEmail
      }]
    );

    res.status(202).json({ taskId: taskRes.rows[0].id, message: 'WordPress installation queued successfully.' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
