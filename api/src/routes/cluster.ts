import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/nodes', async (req, res) => {
  try {
    const result = await query('SELECT * FROM cluster_nodes ORDER BY hostname ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/nodes', async (req, res) => {
  const { hostname, ipAddress, role, sshPort } = req.body;
  try {
    const result = await query(
      'INSERT INTO cluster_nodes (hostname, ip_address, role, ssh_port) VALUES ($1, $2, $3, $4) RETURNING *',
      [hostname, ipAddress, role || 'edge', sshPort || 22]
    );

    // Queue a health check task
    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['CHECK_NODE_HEALTH', { nodeId: result.rows[0].id, ipAddress }]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/nodes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM cluster_nodes WHERE id = $1', [id]);
    res.json({ message: 'Node removed from cluster.' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/sync-all', async (req, res) => {
  try {
    // Logic to trigger a global sync across all active edge nodes
    const nodes = await query('SELECT id, ip_address FROM cluster_nodes WHERE status = \'online\'');
    
    for (const node of nodes.rows) {
      await query(
        'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
        ['SYNC_CLUSTER_CONFIG', { nodeId: node.id, ipAddress: node.ip_address }]
      );
    }
    
    res.json({ message: `Sync tasks queued for ${nodes.rows.length} online nodes.` });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
