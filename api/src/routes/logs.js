import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateAdmin);
router.get('/:logType', async (req, res) => {
    const { logType } = req.params;
    const lines = parseInt(req.query.lines) || 50;
    try {
        const taskRes = await query('INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id', ['READ_LOGS', { logType, lines }]);
        res.json({ taskId: taskRes.rows[0].id, message: `Requesting ${logType} logs...` });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=logs.js.map