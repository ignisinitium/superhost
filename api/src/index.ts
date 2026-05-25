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
import fido2Routes from './routes/fido2.js';
import logRoutes from './routes/logs.js';
import databaseRoutes from './routes/databases.js';
import emailRoutes from './routes/email.js';
import appsRoutes from './routes/apps.js';
import securityRoutes from './routes/security.js';
import billingRoutes from './routes/billing.js';
import backupRoutes from './routes/backups.js';
import networkRoutes from './routes/network.js';
import metricsRoutes from './routes/metrics.js';
import themesRoutes from './routes/themes.js';
import clusterRoutes from './routes/cluster.js';
import servicesRoutes from './routes/services.js';
import adminDatabaseRoutes from './routes/adminDatabases.js';
import updateRoutes from './routes/updates.js';

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
app.use('/api/fido2', fido2Routes);
app.use('/api/logs', logRoutes);
app.use('/api/client/databases', databaseRoutes);
app.use('/api/client/email', emailRoutes);
app.use('/api/client/apps', appsRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/client/backups', backupRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/themes', themesRoutes);
app.use('/api/cluster', clusterRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/admin/databases', adminDatabaseRoutes);
app.use('/api/admin/updates', updateRoutes);

app.get('/health', async (req, res) => {
  try {
    const result = await query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: (err as Error).message });
  }
});

app.listen(port, () => {
  console.log(`Superhost API running on port ${port}`);
});
