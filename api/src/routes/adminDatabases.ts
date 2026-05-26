import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateAdmin);

// List all databases, or filter by userId
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    const result = userId
      ? await query(
          'SELECT d.*, u.username as owner_name FROM databases d JOIN users u ON d.user_id = u.id WHERE d.user_id = $1 ORDER BY d.created_at DESC',
          [userId]
        )
      : await query(
          'SELECT d.*, u.username as owner_name FROM databases d JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC'
        );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Create a database for any user (admin)
router.post('/', async (req, res) => {
  const { userId, dbName, dbPassword } = req.body;
  if (!userId || !dbName || !dbPassword)
    return res.status(400).json({ message: 'userId, dbName, and dbPassword are required' });

  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const username = userRes.rows[0].username;

    const safeName   = dbName.replace(/[^a-zA-Z0-9_]/g, '');
    const fullDbName = `${username}_${safeName}`;
    const fullDbUser = fullDbName;

    const result = await query(
      'INSERT INTO databases (user_id, db_name, db_user) VALUES ($1, $2, $3) RETURNING *',
      [userId, fullDbName, fullDbUser]
    );

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['CREATE_DATABASE', { dbName: fullDbName, dbUser: fullDbUser, dbPassword }]
    );

    res.status(201).json({ ...result.rows[0], taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Change password for a database user
router.put('/:id/password', async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ message: 'newPassword is required' });

  try {
    const dbRes = await query('SELECT db_user FROM databases WHERE id = $1', [id]);
    if (dbRes.rows.length === 0) return res.status(404).json({ message: 'Database not found' });

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['CHANGE_DB_PASSWORD', { dbUser: dbRes.rows[0].db_user, newPassword }]
    );

    res.json({ message: 'Password change queued', taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Delete any database
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const dbRes = await query('SELECT db_name, db_user FROM databases WHERE id = $1', [id]);
    if (dbRes.rows.length === 0) return res.status(404).json({ message: 'Database not found' });

    const { db_name, db_user } = dbRes.rows[0];
    await query('DELETE FROM databases WHERE id = $1', [id]);

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['DELETE_DATABASE', { dbName: db_name, dbUser: db_user }]
    );

    res.json({ message: 'Database deletion queued', taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
