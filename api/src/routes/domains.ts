import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import type { Domain } from '../../../shared/types.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    const result = userId
      ? await query('SELECT d.*, u.username FROM domains d JOIN users u ON d.user_id = u.id WHERE d.user_id = $1 ORDER BY d.created_at DESC', [userId])
      : await query('SELECT d.*, u.username FROM domains d JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/', async (req, res) => {
  const { userId, domainName, phpVersion } = req.body;

  try {
    // 1. Get username
    const userRes = await query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const username = userRes.rows[0].username;

    const docRoot = `/home/${username}/public_html/${domainName}`;

    // 2. Insert into DB
    const result = await query(
      'INSERT INTO domains (user_id, domain_name, document_root, php_version) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, domainName, docRoot, phpVersion || '8.3']
    );
    const domain: Domain = result.rows[0];

    // 3. Insert Task for Worker
    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['CREATE_DOMAIN', { domainName, username, phpVersion: domain.php_version }]
    );

    // 4. Auto-create DNS Zone
    await query(
      'INSERT INTO dns_zones (user_id, domain_name) VALUES ($1, $2) ON CONFLICT (domain_name) DO NOTHING',
      [userId, domainName]
    );

    res.status(201).json({ ...domain, taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { phpVersion, reverseProxyBlock } = req.body;

  try {
    const domainRes = await query('SELECT d.*, u.username FROM domains d JOIN users u ON d.user_id = u.id WHERE d.id = $1', [id]);
    if (domainRes.rows.length === 0) return res.status(404).json({ message: 'Domain not found' });
    const domain = domainRes.rows[0];

    // Update DB
    await query(
      'UPDATE domains SET php_version = COALESCE($1, php_version) WHERE id = $2',
      [phpVersion, id]
    );

    // Trigger Worker Task
    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['UPDATE_DOMAIN_CONFIG', { 
        domainName: domain.domain_name, 
        username: domain.username,
        phpVersion: phpVersion || domain.php_version,
        reverseProxyBlock: reverseProxyBlock || ''
      }]
    );

    res.json({ message: 'Domain configuration update started', taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/:id/install-ssl', async (req, res) => {
  const { id } = req.params;

  try {
    const domainRes = await query('SELECT domain_name FROM domains WHERE id = $1', [id]);
    if (domainRes.rows.length === 0) return res.status(404).json({ message: 'Domain not found' });
    
    const { domain_name } = domainRes.rows[0];

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['INSTALL_SSL', { domainName: domain_name }]
    );

    res.json({ message: 'SSL installation task started', taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const domainRes = await query(
      'SELECT d.*, u.username FROM domains d JOIN users u ON d.user_id = u.id WHERE d.id = $1',
      [id]
    );
    if (domainRes.rows.length === 0) return res.status(404).json({ message: 'Domain not found' });
    const domain = domainRes.rows[0];

    await query('DELETE FROM domains WHERE id = $1', [id]);

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['DELETE_DOMAIN', { domainName: domain.domain_name, username: domain.username }]
    );

    res.json({ message: 'Domain deleted', taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
