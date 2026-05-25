import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

// Public route to get the active theme for the frontend
router.get('/active', async (req, res) => {
  try {
    const result = await query('SELECT * FROM panel_themes WHERE is_active = true LIMIT 1');
    if (result.rows.length === 0) {
      // Fallback defaults
      return res.json({
        primary_color: '#ea580c',
        secondary_color: '#d97706',
        background_color: '#f8fafc',
        text_color: '#0f172a',
        sidebar_bg: '#0f172a'
      });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Admin route to list all themes
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const result = await query('SELECT * FROM panel_themes ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Admin route to set active theme
router.post('/:id/activate', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query('UPDATE panel_themes SET is_active = false');
    await query('UPDATE panel_themes SET is_active = true WHERE id = $1', [id]);
    
    const result = await query('SELECT * FROM panel_themes WHERE is_active = true LIMIT 1');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
