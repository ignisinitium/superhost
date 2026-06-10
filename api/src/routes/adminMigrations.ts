import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateAdmin);

router.get('/', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, remote_host, remote_port, remote_user, status,
              progress, logs, error_message, created_at, updated_at, completed_at
         FROM cwp_migrations ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM cwp_migrations WHERE id = $1', [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Migration not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/test-connection', async (req, res) => {
  const { remoteHost, remotePort = 22, remoteUser = 'root', authType, sshPassword, sshKey } = req.body;

  if (!remoteHost) return res.status(400).json({ message: 'Remote host is required' });
  if (!['password', 'key'].includes(authType))
    return res.status(400).json({ message: 'authType must be "password" or "key"' });
  if (authType === 'password' && !sshPassword)
    return res.status(400).json({ message: 'SSH password is required' });
  if (authType === 'key' && !sshKey)
    return res.status(400).json({ message: 'SSH private key content is required' });

  try {
    const taskRes = await query(
      `INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id`,
      ['TEST_SSH_CONNECTION', { remoteHost, remotePort: Number(remotePort), remoteUser, authType, sshPassword, sshKey }]
    );
    res.json({ taskId: taskRes.rows[0].id as number });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/discover', async (req, res) => {
  const { remoteHost, remotePort = 22, remoteUser = 'root', authType, sshPassword, sshKey } = req.body;

  if (!remoteHost) return res.status(400).json({ message: 'Remote host is required' });
  if (!['password', 'key'].includes(authType))
    return res.status(400).json({ message: 'authType must be "password" or "key"' });
  if (authType === 'password' && !sshPassword)
    return res.status(400).json({ message: 'SSH password is required' });
  if (authType === 'key' && !sshKey)
    return res.status(400).json({ message: 'SSH private key content is required' });

  try {
    const migRes = await query(
      `INSERT INTO cwp_migrations (remote_host, remote_port, remote_user, status)
       VALUES ($1, $2, $3, 'discovering') RETURNING id`,
      [remoteHost, Number(remotePort), remoteUser]
    );
    const migrationId = migRes.rows[0].id as number;

    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', [
      'DISCOVER_CWP',
      { migrationId, remoteHost, remotePort: Number(remotePort), remoteUser, authType, sshPassword, sshKey },
    ]);

    res.json({ migrationId });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/:id/retry-discover', async (req, res) => {
  const { authType, sshPassword, sshKey } = req.body;
  try {
    const migRes = await query('SELECT * FROM cwp_migrations WHERE id = $1', [Number(req.params.id)]);
    if (!migRes.rows[0]) return res.status(404).json({ message: 'Migration not found' });
    const mig = migRes.rows[0];

    await query(
      `UPDATE cwp_migrations SET status = 'discovering', error_message = NULL, logs = '[]', updated_at = NOW() WHERE id = $1`,
      [mig.id]
    );
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', [
      'DISCOVER_CWP',
      { migrationId: mig.id, remoteHost: mig.remote_host, remotePort: mig.remote_port,
        remoteUser: mig.remote_user, authType, sshPassword, sshKey },
    ]);
    res.json({ message: 'Rediscovery started' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/:id/migrate', async (req, res) => {
  const { selectedUsers, authType, sshPassword, sshKey } = req.body;

  if (!Array.isArray(selectedUsers) || selectedUsers.length === 0)
    return res.status(400).json({ message: 'Select at least one user to migrate' });

  try {
    const migRes = await query('SELECT * FROM cwp_migrations WHERE id = $1', [Number(req.params.id)]);
    if (!migRes.rows[0]) return res.status(404).json({ message: 'Migration not found' });
    const mig = migRes.rows[0];
    if (mig.status !== 'ready')
      return res.status(400).json({ message: `Migration is in '${mig.status as string}' state, expected 'ready'` });

    await query(
      `UPDATE cwp_migrations SET status = 'migrating', selected_users = $1, updated_at = NOW() WHERE id = $2`,
      [selectedUsers, mig.id]
    );

    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', [
      'MIGRATE_CWP',
      {
        migrationId: mig.id,
        remoteHost: mig.remote_host,
        remotePort: mig.remote_port,
        remoteUser: mig.remote_user,
        selectedUsers,
        authType,
        sshPassword,
        sshKey,
      },
    ]);

    res.json({ message: 'Migration started' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM cwp_migrations WHERE id = $1', [Number(req.params.id)]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
