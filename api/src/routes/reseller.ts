import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

router.use(authenticateAdmin);

// --- Reseller Management (Master Admin Only) ---

router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT r.*, a.username, a.email 
      FROM resellers r 
      JOIN admins a ON r.admin_id = a.id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/', async (req, res) => {
  const { adminId, companyName, planTier, maxUsers } = req.body;
  try {
    const result = await query(
      'INSERT INTO resellers (admin_id, company_name, plan_tier, max_users) VALUES ($1, $2, $3, $4) RETURNING *',
      [adminId, companyName, planTier || 'standard', maxUsers || 10]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// --- Branding / White-Label Settings ---

router.get('/branding', async (req: AuthRequest, res) => {
  try {
    // Check if the current admin is a reseller
    const resRes = await query('SELECT id FROM resellers WHERE admin_id = $1', [req.adminId]);
    const resellerId = resRes.rows[0]?.id || null;

    const result = await query('SELECT * FROM white_label_settings WHERE reseller_id IS NOT DISTINCT FROM $1', [resellerId]);
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.put('/branding', async (req: AuthRequest, res) => {
  const { panelName, logoUrl, primaryColor, supportEmail, customDomain } = req.body;
  try {
    const resRes = await query('SELECT id FROM resellers WHERE admin_id = $1', [req.adminId]);
    const resellerId = resRes.rows[0]?.id || null;

    const result = await query(`
      INSERT INTO white_label_settings (reseller_id, panel_name, logo_url, primary_color, support_email, custom_domain)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (reseller_id) DO UPDATE 
      SET panel_name = EXCLUDED.panel_name,
          logo_url = EXCLUDED.logo_url,
          primary_color = EXCLUDED.primary_color,
          support_email = EXCLUDED.support_email,
          custom_domain = EXCLUDED.custom_domain,
          updated_at = NOW()
      RETURNING *
    `, [resellerId, panelName, logoUrl, primaryColor, supportEmail, customDomain]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// --- API Key Management ---

router.get('/keys', async (req: AuthRequest, res) => {
  try {
    const result = await query('SELECT id, key_prefix, label, permissions, last_used_at, created_at FROM api_keys WHERE owner_id = $1', [req.adminId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/keys', async (req: AuthRequest, res) => {
  const { label, permissions } = req.body;
  try {
    const key = crypto.randomBytes(32).toString('hex');
    const prefix = key.substring(0, 8);
    const hash = crypto.createHash('sha256').update(key).digest('hex');

    await query(
      'INSERT INTO api_keys (owner_id, key_prefix, key_hash, label, permissions) VALUES ($1, $2, $3, $4, $5)',
      [req.adminId, prefix, hash, label, JSON.stringify(permissions || [])]
    );

    res.status(201).json({ key: `sh_${key}`, message: 'Copy your key now, it will not be shown again.' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/keys/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM api_keys WHERE id = $1 AND owner_id = $2', [id, req.adminId]);
    res.json({ message: 'API key revoked' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
