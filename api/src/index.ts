import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import { query } from './db.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import clientAuthRoutes from './routes/clientAuth.js';
import mailAuthRoutes from './routes/mailAuth.js';
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
import filesRoutes from './routes/files.js';
import gitRoutes from './routes/git.js';
import cronRoutes from './routes/cron.js';
import adminCronRoutes from './routes/adminCron.js';
import ftpRoutes from './routes/ftp.js';
import adminFtpRoutes from './routes/adminFtp.js';
import dnsRoutes from './routes/dns.js';
import adminDnsRoutes from './routes/adminDns.js';
import adminNameserversRoutes from './routes/adminNameservers.js';
import resellerRoutes from './routes/reseller.js';
import adminEmailRoutes from './routes/adminEmail.js';
import adminSpamRoutes from './routes/adminSpam.js';
import adminAppsRoutes from './routes/adminApps.js';
import adminDeletedUsersRoutes from './routes/adminDeletedUsers.js';
import systemRoutes from './routes/system.js';
import adminMigrationsRoutes from './routes/adminMigrations.js';
import auditLogRoutes from './routes/auditLog.js';
import publicRoutes from './routes/public.js';
import clientRelayRoutes from './routes/clientRelay.js';

dotenv.config();

// Validate critical environment variables at startup
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

const app = express();
const port = process.env.PORT ?? 3001;

// Security headers (must be before routes)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS — restrict to known origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: async (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Dynamically allow https://spam.<domain> for any registered mail domain
    const spamMatch = origin.match(/^https:\/\/spam\.(.+)$/);
    if (spamMatch) {
      try {
        const res = await query('SELECT 1 FROM mail_domains WHERE domain_name = $1', [spamMatch[1]]);
        if (res.rowCount && res.rowCount > 0) return callback(null, true);
      } catch {
        // fall through to deny
      }
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Stripe webhook needs raw body — mount BEFORE express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/client/auth', clientAuthRoutes);
app.use('/api/mail-auth', mailAuthRoutes);
app.use('/api/client/domains', clientDomainsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/ports', portRoutes);
app.use('/api/firewall', firewallRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/processes', processRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/databases', databaseRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/client/email', emailRoutes);
app.use('/api/apps', appsRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/themes', themesRoutes);
app.use('/api/cluster', clusterRoutes);
app.use('/api/services', servicesRoutes);

app.use('/api/admin/databases', adminDatabaseRoutes);
app.use('/api/admin/updates', updateRoutes);
app.use('/api/admin/cron', adminCronRoutes);
app.use('/api/admin/ftp', adminFtpRoutes);
app.use('/api/admin/dns', adminDnsRoutes);
app.use('/api/admin/nameservers', adminNameserversRoutes);
app.use('/api/admin/reseller', resellerRoutes);
app.use('/api/admin/email', adminEmailRoutes);
app.use('/api/admin/spam', adminSpamRoutes);
app.use('/api/spam', adminSpamRoutes);
app.use('/api/admin/apps', adminAppsRoutes);
app.use('/api/admin/deleted-users', adminDeletedUsersRoutes);
app.use('/api/admin/system', systemRoutes);
app.use('/api/admin/migrations', adminMigrationsRoutes);
app.use('/api/admin/audit', auditLogRoutes);
app.use('/api/public', publicRoutes);

app.use('/api/client/files', filesRoutes);
app.use('/api/client/git', gitRoutes);
app.use('/api/client/cron', cronRoutes);
app.use('/api/client/ftp', ftpRoutes);
app.use('/api/client/dns', dnsRoutes);
app.use('/api/client/relay', clientRelayRoutes);

app.use('/api/fido2', fido2Routes);

app.get('/health', async (_req, res) => {
  try {
    const result = await query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0]?.now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Database unavailable' });
  }
});

// ── Global error handler (must be last) ──────────────────────────────────────
app.use(globalErrorHandler);

app.listen(port, () => {
  console.log(`Superhost API running on port ${port}`);
});
