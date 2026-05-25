import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateAdmin);
router.get('/', async (req, res) => {
    const { username } = req.query;
    try {
        // We'll use a task to get the processes from the worker since it needs root/system access
        const taskRes = await query('INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id', ['GET_PROCESSES', { username }]);
        res.json({ taskId: taskRes.rows[0].id, message: `Fetching processes${username ? ` for ${username}` : ''}...` });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/kill', async (req, res) => {
    const { pid, signal, username } = req.body;
    try {
        const taskRes = await query('INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id', ['KILL_PROCESS', { pid, signal, username }]);
        res.json({ taskId: taskRes.rows[0].id, message: `Task created to kill process ${pid}` });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/restart', async (req, res) => {
    const { serviceName } = req.body;
    try {
        const taskRes = await query('INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id', ['RESTART_SERVICE', { serviceName }]);
        res.json({ taskId: taskRes.rows[0].id, message: `Task created to restart ${serviceName}` });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=processes.js.map