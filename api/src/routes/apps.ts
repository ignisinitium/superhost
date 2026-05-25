import express from 'express';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

router.use(authenticateClient);

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
