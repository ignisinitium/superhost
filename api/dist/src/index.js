import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { query } from './db.js';
import authRoutes from './routes/auth.js';
import clientAuthRoutes from './routes/clientAuth.js';
import clientDomainsRoutes from './routes/clientDomains.js';
import userRoutes from './routes/users.js';
import domainRoutes from './routes/domains.js';
import portRoutes from './routes/ports.js';
import firewallRoutes from './routes/firewall.js';
import taskRoutes from './routes/tasks.js';
import processRoutes from './routes/processes.js';
dotenv.config();
const app = express();
const port = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/client/auth', clientAuthRoutes);
app.use('/api/client/domains', clientDomainsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/ports', portRoutes);
app.use('/api/firewall', firewallRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/processes', processRoutes);
app.get('/health', async (req, res) => {
    try {
        const result = await query('SELECT NOW()');
        res.json({ status: 'ok', time: result.rows[0].now });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});
app.listen(port, () => {
    console.log(`Superhost API running on port ${port}`);
});
//# sourceMappingURL=index.js.map