import { Client } from 'pg';
import dotenv from 'dotenv';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import type { Task } from '../../shared/types.js';
import {
  validateUsername,
  validateDomainName,
  validateIpAddress,
  validatePort,
  validateProtocol,
  validateRuleNumber,
  validateServiceName,
  validateServiceAction,
  validatePm2Action,
  validateBranchName,
  validateRepoUrl,
  validateSignal,
  validatePid,
  validatePath,
  validateEmailLocalPart,
  validateMysqlIdentifier,
  validateInterfaceName,
  validateWebhookUrl,
  validateCronField,
  validateCronCommand,
  validateLineCount,
  validatePhpVersion,
  validateDnsType,
  redactPayload,
  shellEscape,
} from './sanitize.js';

const execPromise = promisify(exec);
dotenv.config();

// Fail loudly if required env vars are missing — never fall back to hardcoded credentials
const REQUIRED_ENV = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Required environment variable ${key} is not set. Refusing to start.`);
    process.exit(1);
  }
}

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST ?? 'localhost',
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT ?? '5432'),
});

// Task execution timeout (5 minutes)
const TASK_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Task timed out after ${ms / 1000}s: ${label}`)), ms)
    ),
  ]);
}

async function handleTask(task: Task) {
  // Redact sensitive fields before logging
  console.log(`Processing task: ${task.command}`, redactPayload(task.payload));
  
  try {
    // Optimistic lock: only proceed if we successfully claim the task from 'pending' state.
    // In a multi-worker setup, only the first worker to execute this UPDATE will get rows back.
    const lockRes = await client.query(
      "UPDATE tasks SET status = 'processing', started_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id",
      [task.id]
    );
    if (lockRes.rowCount === 0) {
      // Another worker already claimed this task — skip it
      console.log(`Task ${task.id} already claimed by another worker. Skipping.`);
      return;
    }

    switch (task.command) {
      case 'CREATE_USER':
        await handleCreateUser(task.payload);
        break;
      case 'ARCHIVE_AND_DELETE_USER':
        await handleArchiveAndDeleteUser(task.payload);
        break;
      case 'RESTORE_USER':
        await handleRestoreUser(task.payload);
        break;
      case 'PURGE_USER_ARCHIVE':
        await handlePurgeUserArchive(task.payload);
        break;
      case 'CREATE_DOMAIN':
        await handleCreateDomain(task.payload);
        break;
      case 'UPDATE_DOMAIN_CONFIG':
        await handleUpdateDomainConfig(task.payload);
        break;
      case 'DELETE_DOMAIN':
        await handleDeleteDomain(task.payload);
        break;
      case 'SETUP_CUSTOM_API':
        await handleSetupCustomApi(task.payload);
        break;
      case 'FIREWALL_ALLOW':
        await handleFirewallAllow(task.payload);
        break;
      case 'FIREWALL_DELETE':
        await handleFirewallDelete(task.payload);
        break;
      case 'GET_FIREWALL_STATUS':
        await handleGetFirewallStatus(task.payload, task.id);
        break;
      case 'GET_PROCESSES':
        await handleGetProcesses(task.payload, task.id);
        break;
      case 'KILL_PROCESS':
        await handleKillProcess(task.payload);
        break;
      case 'INSTALL_SSL':
        await handleInstallSsl(task.payload);
        break;
      case 'RESTART_SERVICE':
        await handleRestartService(task.payload);
        break;
      case 'SYNC_MIGRATION_DATA':
        await handleSyncMigrationData(task.payload);
        break;
      case 'UPDATE_RESOURCE_USAGE':
        await handleUpdateResourceUsage(task.payload);
        break;
      case 'READ_LOGS':
        await handleReadLogs(task.payload, task.id);
        break;
      case 'CREATE_DATABASE':
        await handleCreateDatabase(task.payload);
        break;
      case 'DELETE_DATABASE':
        await handleDeleteDatabase(task.payload);
        break;
      case 'CHANGE_DB_PASSWORD':
        await handleChangeDbPassword(task.payload);
        break;
      case 'GENERATE_EMAIL_DNS':
        await handleGenerateEmailDns(task.payload);
        break;
      case 'PROVISION_WEBMAIL_VHOST':
        await handleProvisionWebmailVhost(task.payload);
        break;
      case 'PROVISION_SSL':
        await handleProvisionSsl(task.payload);
        break;
      case 'INSTALL_WORDPRESS':
        await handleInstallWordPress(task.payload);
        break;
      case 'SETUP_APP_RUNTIME':
        await handleSetupAppRuntime(task.payload);
        break;
      case 'MANAGE_APP_RUNTIME':
        await handleManageAppRuntime(task.payload);
        break;
      case 'DELETE_APP_RUNTIME':
        await handleDeleteAppRuntime(task.payload);
        break;
      case 'GIT_DEPLOY':
        await handleGitDeploy(task.payload, task.id);
        break;
      case 'SYNC_CRONTAB':
        await handleSyncCrontab(task.payload);
        break;
      case 'SYNC_FTP':
        await handleSyncFtp(task.payload);
        break;
      case 'SYNC_DNS_ZONE':
        await handleSyncDnsZone(task.payload);
        break;
      case 'REMOVE_DNS_ZONE':
        await handleRemoveDnsZone(task.payload);
        break;
      case 'CONFIGURE_MAIL_SERVER':
        await handleConfigureMailServer();
        break;
      case 'RELEASE_QUARANTINE':
        await handleReleaseQuarantine(task.payload);
        break;
      case 'SEND_SPAM_DIGEST':
        await handleSendSpamDigest(task.payload);
        break;
      case 'PURGE_EXPIRED_QUARANTINE':
        await handlePurgeExpiredQuarantine();
        break;
      case 'SYNC_SPAM_RULES':
        await handleSyncSpamRules(task.payload);
        break;
      case 'SCAN_QUARANTINE_FOLDERS':
        await handleScanQuarantineFolders(task.payload);
        break;
      case 'PROVISION_MAILBOX':
        await handleProvisionMailbox(task.payload);
        break;
      case 'CHANGE_EMAIL_PASSWORD':
        await handleChangeEmailPassword(task.payload);
        break;
      case 'APPLY_EMAIL_QUOTA':
        await handleApplyEmailQuota(task.payload);
        break;
      case 'UPDATE_AUTORESPONDER':
        await handleUpdateAutoresponder(task.payload);
        break;
      case 'SCAN_MALWARE':
        await handleScanMalware(task.payload, task.id);
        break;
      case 'CREATE_BACKUP':
        await handleCreateBackup(task.payload, task.id);
        break;
      case 'RESTORE_BACKUP':
        await handleRestoreBackup(task.payload, task.id);
        break;
      case 'ADD_VIRTUAL_IP':
        await handleAddVirtualIp(task.payload);
        break;
      case 'REMOVE_VIRTUAL_IP':
        await handleRemoveVirtualIp(task.payload);
        break;
      case 'ASSIGN_VIRTUAL_IP':
        await handleAssignVirtualIp(task.payload);
        break;
      case 'CHECK_NODE_HEALTH':
        await handleCheckNodeHealth(task.payload);
        break;
      case 'SYNC_CLUSTER_CONFIG':
        await handleSyncClusterConfig(task.payload);
        break;
      case 'GET_MASTER_SSH_KEY':
        await handleGetMasterSshKey(task.id);
        break;
      case 'GET_SYSTEM_STATS':
        await handleGetSystemStats(task.id);
        break;
      case 'FIREWALL_BLOCK_IP':
        await handleFirewallBlockIp(task.payload);
        break;
      case 'FIREWALL_UNBLOCK_IP':
        await handleFirewallUnblockIp(task.payload);
        break;
      case 'GET_SERVICES_STATUS':
        await handleGetServicesStatus(task.id);
        break;
      case 'MANAGE_SERVICE':
        await handleManageService(task.id, task.payload);
        break;
      case 'GET_UPDATES':
        await handleGetUpdates(task.id);
        break;
      case 'INSTALL_UPDATES':
        await handleInstallUpdates(task.id);
        break;
      case 'MANAGE_AUTO_UPDATES':
        await handleManageAutoUpdates(task.payload);
        break;
      case 'GET_BIND_STATUS':
        await handleGetBindStatus(task.id);
        break;
      case 'MANAGE_BIND':
        await handleManageBind(task.id, task.payload);
        break;
      case 'LIST_FILES':
        await handleListFiles(task.payload, task.id);
        break;
      case 'READ_FILE_CONTENT':
        await handleReadFile(task.payload, task.id);
        break;
      case 'WRITE_FILE_CONTENT':
        await handleWriteFile(task.payload);
        break;
      case 'DELETE_FILE':
        await handleDeleteFile(task.payload);
        break;
      case 'ZIP_FILES':
        await handleZipFiles(task.payload);
        break;
      case 'UNZIP_FILE':
        await handleUnzipFile(task.payload);
        break;
      case 'REBOOT_SERVER':
        await handleRebootServer(task.id);
        break;
      case 'RESTART_WEB_SERVICES':
        await handleRestartWebServices();
        break;
      case 'EXEC_COMMAND':
        await handleExecCommand(task.payload, task.id);
        break;
      case 'ADMIN_BACKUP':
        await handleAdminBackup(task.id);
        break;
      default:
        throw new Error(`Unknown command: ${task.command}`);
    }

    await client.query("UPDATE tasks SET status = 'completed', updated_at = NOW() WHERE id = $1", [task.id]);
    console.log(`Task ${task.id} completed.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Task ${task.id} (${task.command}) failed:`, message);
    await client.query(
      "UPDATE tasks SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2",
      [message, task.id]
    );
  }
}

async function handleCreateUser(payload: any) {
  const username = validateUsername(payload?.username);

  try {
    // Check if user already exists (safe: no shell interpolation)
    await execPromise(`id -u ${shellEscape(username)}`).catch(async () => {
      await execPromise(`sudo useradd -m -s /bin/bash ${shellEscape(username)}`);
    });

    // Create default public_html
    const homeDir = `/home/${username}`;
    const publicHtml = `${homeDir}/public_html`;
    await execPromise(`sudo mkdir -p ${shellEscape(publicHtml)}`);
    await execPromise(`sudo chown -R ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(homeDir)}`);
    // 711: owner has full access; others can traverse (needed for nginx to serve files)
    await execPromise(`sudo chmod 711 ${shellEscape(homeDir)}`);

    // Detect installed PHP versions instead of hardcoding
    let phpVersion = '8.3';
    try {
      const { stdout } = await execPromise('ls /etc/php/ 2>/dev/null | sort -V | tail -1');
      const detected = stdout.trim();
      if (detected && /^[78]\.\d{1,2}$/.test(detected)) phpVersion = detected;
    } catch {
      // Default to 8.3 if detection fails
    }

    // ── MariaDB database ─────────────────────────────────────────────────────
    const dbName     = validateMysqlIdentifier(`${username}_db`);
    const dbUser     = dbName;
    const dbPassword = crypto.randomBytes(24).toString('base64url');

    await handleCreateDatabase({ dbName, dbUser, dbPassword });

    // Track in PostgreSQL so the dashboard can display it; also fetch resource limits
    const userRow = await client.query<{
      id: number;
      disk_limit_mb: number | null;
      bandwidth_limit_mb: number | null;
      domains_allowed: number | null;
      email_accounts: number | null;
      databases_allowed: number | null;
      ftp_accounts: number | null;
      cron_jobs: number | null;
      ssh_access: boolean | null;
      nodejs_support: boolean | null;
      python_support: boolean | null;
    }>(`
      SELECT u.id,
             COALESCE(p.disk_quota_mb,    u.disk_limit_mb)      AS disk_limit_mb,
             COALESCE(p.bandwidth_gb * 1024, u.bandwidth_limit_mb) AS bandwidth_limit_mb,
             p.domains_allowed, p.email_accounts, p.databases_allowed,
             p.ftp_accounts,    p.cron_jobs,      p.ssh_access,
             p.nodejs_support,  p.python_support
        FROM users u
        LEFT JOIN products p ON p.id = u.package_id
       WHERE u.username = $1
    `, [username]);
    const limits = userRow.rows[0] ?? null;
    if (limits != null) {
      await client.query(
        `INSERT INTO databases (user_id, db_name, db_user)
         VALUES ($1, $2, $3) ON CONFLICT (db_name) DO NOTHING`,
        [limits.id, dbName, dbUser]
      );
    }

    // ── .env file ────────────────────────────────────────────────────────────
    const serverIp   = process.env.SERVER_IP   ?? '';
    const masterDomain = process.env.MASTER_DOMAIN ?? '';
    const smtpHost   = process.env.SMTP_HOST   ?? `mail.${masterDomain}`;

    const fmtLimit = (v: number | null | undefined) => (v === -1 || v == null) ? 'unlimited' : String(v);
    const envContent = `# Auto-generated by Superhost on account creation
# Database (MariaDB)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=${dbName}
DB_USER=${dbUser}
DB_PASS=${dbPassword}

# Server
SERVER_IP=${serverIp}
APP_PORT=40000

# Resource limits (from your hosting plan)
DISK_QUOTA_MB=${fmtLimit(limits?.disk_limit_mb)}
BANDWIDTH_LIMIT_MB=${fmtLimit(limits?.bandwidth_limit_mb)}
DOMAINS_ALLOWED=${fmtLimit(limits?.domains_allowed)}
EMAIL_ACCOUNTS=${fmtLimit(limits?.email_accounts)}
DATABASES_ALLOWED=${fmtLimit(limits?.databases_allowed)}
FTP_ACCOUNTS=${fmtLimit(limits?.ftp_accounts)}
CRON_JOBS=${fmtLimit(limits?.cron_jobs)}
SSH_ACCESS=${limits?.ssh_access ? 'true' : 'false'}
NODEJS_SUPPORT=${limits?.nodejs_support ? 'true' : 'false'}
PYTHON_SUPPORT=${limits?.python_support ? 'true' : 'false'}
`;
    const envTmp = `/tmp/.env_${username}`;
    await fs.writeFile(envTmp, envContent, { mode: 0o600 });
    await execPromise(`sudo mv ${shellEscape(envTmp)} /home/${shellEscape(username)}/.env`);
    await execPromise(`sudo chown ${shellEscape(username)}:${shellEscape(username)} /home/${shellEscape(username)}/.env`);
    await execPromise(`sudo chmod 600 /home/${shellEscape(username)}/.env`);
    // chmod 600 sets the ACL mask to ---, re-grant jonathan access explicitly
    await execPromise(`sudo setfacl -m user:jonathan:rw- /home/${shellEscape(username)}/.env`);

    // ── serverResources.md ───────────────────────────────────────────────────
    const nodever = (await execPromise('node --version').catch(() => ({ stdout: 'unavailable' }))).stdout.trim();
    const pyver   = (await execPromise('python3 --version').catch(() => ({ stdout: 'unavailable' }))).stdout.trim();
    const phpver  = phpVersion;

    const fmtMd = (v: number | null | undefined) => (v === -1 || v == null) ? '∞ Unlimited' : String(v);
    const fmtBool = (v: boolean | null | undefined) => v ? 'Yes' : 'No';
    const diskDisplay = (limits?.disk_limit_mb != null && limits.disk_limit_mb !== -1)
      ? `${(limits.disk_limit_mb / 1024).toFixed(1)} GB`
      : '∞ Unlimited';
    const bwDisplay = (limits?.bandwidth_limit_mb != null && limits.bandwidth_limit_mb !== -1)
      ? `${(limits.bandwidth_limit_mb / 1024).toFixed(0)} GB`
      : '∞ Unlimited';

    const resourcesMd = `# Server Resources

Welcome to your hosting account, **${username}**!
Below is everything you need to build and deploy custom web applications on this server.

---

## Your Plan Limits

| Resource          | Limit                          |
|-------------------|-------------------------------|
| Disk Storage      | ${diskDisplay}                 |
| Bandwidth         | ${bwDisplay}/month             |
| Domains           | ${fmtMd(limits?.domains_allowed)}  |
| Email Accounts    | ${fmtMd(limits?.email_accounts)}   |
| Databases         | ${fmtMd(limits?.databases_allowed)}|
| FTP Accounts      | ${fmtMd(limits?.ftp_accounts)}     |
| Cron Jobs         | ${fmtMd(limits?.cron_jobs)}        |
| SSH Access        | ${fmtBool(limits?.ssh_access)}     |
| Node.js Support   | ${fmtBool(limits?.nodejs_support)} |
| Python Support    | ${fmtBool(limits?.python_support)} |

---

## Runtimes

| Runtime   | Version        | Notes                          |
|-----------|---------------|--------------------------------|
| Node.js   | ${nodever}     | PM2-managed, auto-restart      |
| Python 3  | ${pyver}       | PM2-managed, auto-restart      |
| PHP       | ${phpver}      | PHP-FPM, per-domain config     |

---

## Your Database (MariaDB)

| Setting | Value       |
|---------|-------------|
| Host    | \`localhost\` |
| Port    | \`3306\`      |
| Name    | \`${dbName}\` |
| User    | \`${dbUser}\` |
| Pass    | *(see \`.env\`)* |

Credentials are in \`~/.env\`. Never commit that file to git.

---

## Deploying a Custom App

1. Upload your app files to \`~/public_html/<yourdomain>/\`
2. In the **Application Manager** → **Custom Runtimes**, click **New Application**
3. Pick your domain, runtime, and startup script
4. The server assigns you a port and proxies your domain to it automatically

Your app will survive reboots — PM2 saves its state after every start/stop.

---

## Mail / SMTP (Outbound)

| Setting       | Value                |
|--------------|----------------------|
| SMTP Host     | \`${smtpHost}\`      |
| SMTP Port     | \`587\` (STARTTLS)   |
| Auth          | Your email credentials |

---

## Available Services

| Service      | Access              |
|-------------|---------------------|
| MariaDB      | \`localhost:3306\`  |
| PHP-FPM      | Unix socket (nginx handles this automatically) |
| Mail (IMAP)  | \`${smtpHost}:993\` (SSL) |
| DNS          | Managed via the dashboard |
| SSL / HTTPS  | Automatic via Let's Encrypt on domain provisioning |

---

*Generated by Superhost · ${new Date().toUTCString()}*
`;

    const mdTmp = `/tmp/serverResources_${username}.md`;
    await fs.writeFile(mdTmp, resourcesMd);
    await execPromise(`sudo mv ${shellEscape(mdTmp)} /home/${shellEscape(username)}/serverResources.md`);
    await execPromise(`sudo chown ${shellEscape(username)}:${shellEscape(username)} /home/${shellEscape(username)}/serverResources.md`);
    await execPromise(`sudo setfacl -m user:jonathan:rw- /home/${shellEscape(username)}/serverResources.md`);

    // Create automatic staging subdomain
    if (!masterDomain) throw new Error('MASTER_DOMAIN environment variable is not set');
    await handleCreateDomain({
      domainName: `${username}.${masterDomain}`,
      username,
      phpVersion,
      docRoot: `/home/${username}/public_html`,
    });

    console.log(`Linux user ${username} created with automatic staging subdomain.`);
  } catch (err) {
    console.error(`Failed to create user ${username}:`, err);
    throw err;
  }
}

async function handleArchiveAndDeleteUser(payload: any) {
  const { userId } = payload;
  if (!userId) throw new Error('userId is required');

  const userRow = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (userRow.rows.length === 0) throw new Error(`User ${userId} not found`);
  const user = userRow.rows[0];
  const username = validateUsername(user.username);

  // Collect full snapshot for restore
  const domainsRes    = await client.query('SELECT * FROM domains WHERE user_id = $1', [userId]);
  const zonesRes      = await client.query('SELECT * FROM dns_zones WHERE user_id = $1', [userId]);
  const dnsZones: any[] = [];
  for (const zone of zonesRes.rows) {
    const recordsRes = await client.query('SELECT * FROM dns_records WHERE zone_id = $1', [zone.id]);
    dnsZones.push({ ...zone, records: recordsRes.rows });
  }
  const dbsRes        = await client.query('SELECT * FROM databases WHERE user_id = $1', [userId]);
  const mailRes       = await client.query('SELECT * FROM mail_users WHERE user_id = $1', [userId]);
  const appsRes       = await client.query('SELECT * FROM user_apps WHERE user_id = $1', [userId]);

  const snapshot = {
    user, domains: domainsRes.rows, dns_zones: dnsZones,
    databases: dbsRes.rows, mail_users: mailRes.rows, user_apps: appsRes.rows,
  };

  // Build archive in staging dir
  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveDir = '/var/superhost/archives';
  const archivePath = `${archiveDir}/${username}_${timestamp}.tar.gz`;
  const stagingDir  = `/tmp/superhost_archive_${username}_${Date.now()}`;

  await execPromise(`sudo mkdir -p ${shellEscape(archiveDir)}`);
  await fs.mkdir(`${stagingDir}/databases`, { recursive: true });
  await fs.mkdir(`${stagingDir}/metadata`,  { recursive: true });
  await fs.mkdir(`${stagingDir}/home`,       { recursive: true });

  // Dump each MariaDB database
  const dbAdminUser = process.env.DB_ADMIN_USER ?? 'superhost_worker';
  const dbAdminPass = process.env.DB_ADMIN_PASS ?? 'worker_db_pass';
  for (const db of dbsRes.rows) {
    const safeDb   = validateMysqlIdentifier(db.db_name);
    const dumpPath = `${stagingDir}/databases/${safeDb}.sql`;
    await execPromise(
      `mysqldump -u ${shellEscape(dbAdminUser)} -p${shellEscape(dbAdminPass)} ${shellEscape(safeDb)} > ${shellEscape(dumpPath)}`
    ).catch(err => console.warn(`DB dump failed for ${safeDb}:`, err));
  }

  // Write full snapshot JSON
  await fs.writeFile(`${stagingDir}/metadata/snapshot.json`, JSON.stringify(snapshot, null, 2));

  // Copy home directory
  await execPromise(`sudo cp -a /home/${shellEscape(username)}/. ${shellEscape(stagingDir)}/home/`).catch(() => {});

  // Create gzip archive
  await execPromise(`sudo tar -czf ${shellEscape(archivePath)} -C ${shellEscape(stagingDir)} .`);

  const { stdout: sizeOut } = await execPromise(`sudo du -sb ${shellEscape(archivePath)}`);
  const archiveSize = parseInt(sizeOut.split('\t')[0] ?? '0', 10);

  // Record deletion
  await client.query(
    `INSERT INTO deleted_users (username, email, original_user_id, archive_path, archive_size_bytes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [username, user.email, userId, archivePath, archiveSize, JSON.stringify(snapshot)]
  );

  // Stop PM2 apps
  for (const app of appsRes.rows) {
    await execPromise(`sudo -u ${shellEscape(username)} pm2 delete app_${app.id}`).catch(() => {});
  }
  await execPromise(`sudo -u ${shellEscape(username)} pm2 save --force`).catch(() => {});

  // Remove nginx vhosts for all domains
  for (const domain of domainsRes.rows) {
    const dn = domain.domain_name as string;
    await execPromise(`sudo rm -f /etc/nginx/sites-enabled/${shellEscape(dn)}`).catch(() => {});
    await execPromise(`sudo rm -f /etc/nginx/sites-available/${shellEscape(dn)}`).catch(() => {});
    // Remove mail vhost too
    await execPromise(`sudo rm -f /etc/nginx/sites-enabled/mail.${shellEscape(dn)}`).catch(() => {});
    await execPromise(`sudo rm -f /etc/nginx/sites-available/mail.${shellEscape(dn)}`).catch(() => {});
    await execPromise(`sudo certbot delete --cert-name ${shellEscape(dn)} --non-interactive`).catch(() => {});
  }
  await execPromise('sudo nginx -t && sudo systemctl reload nginx').catch(() => {});

  // Remove BIND zones
  const zonesConfPath = '/etc/bind/named.conf.zones';
  let zonesConf = await fs.readFile(zonesConfPath, 'utf8').catch(() => '');
  for (const zone of dnsZones) {
    const dn = zone.domain_name as string;
    await execPromise(`sudo rm -f /etc/bind/zones/db.${shellEscape(dn)}`).catch(() => {});
    zonesConf = zonesConf.replace(new RegExp(`\\nzone "${dn.replace(/\./g, '\\.')}"[^}]+};\\n`, 'g'), '\n');
  }
  if (dnsZones.length > 0) {
    const tmpConf = `/tmp/named_zones_${Date.now()}`;
    await fs.writeFile(tmpConf, zonesConf);
    await execPromise(`sudo mv ${shellEscape(tmpConf)} ${zonesConfPath}`).catch(() => {});
    await execPromise('sudo named-checkconf && sudo systemctl reload bind9').catch(() => {});
  }

  // Drop MariaDB databases and users
  for (const db of dbsRes.rows) {
    await handleDeleteDatabase({ dbName: db.db_name, dbUser: db.db_user }).catch(() => {});
  }

  // Delete from PostgreSQL (cascade removes domains, dns, apps, etc.)
  await client.query('DELETE FROM users WHERE id = $1', [userId]);

  // Remove Linux user and home directory
  await execPromise(`sudo userdel -r ${shellEscape(username)}`).catch(() => {});

  // Clean up staging dir
  await execPromise(`sudo rm -rf ${shellEscape(stagingDir)}`).catch(() => {});

  console.log(`User ${username} archived to ${archivePath} and deleted.`);
}

async function handleRestoreUser(payload: any) {
  const { deletedUserId } = payload;
  if (!deletedUserId) throw new Error('deletedUserId is required');

  const deletedRow = await client.query('SELECT * FROM deleted_users WHERE id = $1', [deletedUserId]);
  if (deletedRow.rows.length === 0) throw new Error(`Deleted user record ${deletedUserId} not found`);
  const deleted    = deletedRow.rows[0];
  const snapshot   = deleted.metadata as any;
  const { user, domains, dns_zones, databases, user_apps } = snapshot;
  const username   = validateUsername(deleted.username);

  // Extract archive
  const stagingDir = `/tmp/superhost_restore_${username}_${Date.now()}`;
  await fs.mkdir(stagingDir, { recursive: true });
  await execPromise(`sudo tar -xzf ${shellEscape(deleted.archive_path)} -C ${shellEscape(stagingDir)}`);

  // Re-create Linux user
  await execPromise(`id -u ${shellEscape(username)}`).catch(async () => {
    await execPromise(`sudo useradd -m -s /bin/bash ${shellEscape(username)}`);
  });

  // Restore home directory
  const homeStaging = `${stagingDir}/home`;
  const homeExists  = await fs.access(homeStaging).then(() => true).catch(() => false);
  if (homeExists) {
    await execPromise(`sudo cp -a ${shellEscape(homeStaging)}/. /home/${shellEscape(username)}/`);
    await execPromise(`sudo chown -R ${shellEscape(username)}:${shellEscape(username)} /home/${shellEscape(username)}`);
    await execPromise(`sudo chmod 711 /home/${shellEscape(username)}`);
  }

  // Re-insert user in PostgreSQL
  const newUserRes = await client.query(
    `INSERT INTO users (username, email, home_dir, password_hash, disk_limit_mb, bandwidth_limit_mb, package_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
    [user.username, user.email, user.home_dir, user.password_hash,
     user.disk_limit_mb, user.bandwidth_limit_mb, user.package_id]
  );
  const newUserId = newUserRes.rows[0]!.id as number;

  // Restore MariaDB databases
  const dbAdminUser = process.env.DB_ADMIN_USER ?? 'superhost_worker';
  const dbAdminPass = process.env.DB_ADMIN_PASS ?? 'worker_db_pass';
  for (const db of (databases ?? [])) {
    const safeDb   = validateMysqlIdentifier(db.db_name);
    const dumpPath = `${stagingDir}/databases/${safeDb}.sql`;
    const dumpExists = await fs.access(dumpPath).then(() => true).catch(() => false);
    const newPass  = crypto.randomBytes(24).toString('base64url');
    await handleCreateDatabase({ dbName: safeDb, dbUser: db.db_user, dbPassword: newPass }).catch(() => {});
    if (dumpExists) {
      await execPromise(
        `mysql -u ${shellEscape(dbAdminUser)} -p${shellEscape(dbAdminPass)} ${shellEscape(safeDb)} < ${shellEscape(dumpPath)}`
      ).catch(err => console.warn(`DB restore failed for ${safeDb}:`, err));
    }
    // Patch .env with new password
    await execPromise(
      `sudo sed -i 's/^DB_PASS=.*/DB_PASS=${newPass}/' /home/${shellEscape(username)}/.env`
    ).catch(() => {});
    await client.query(
      `INSERT INTO databases (user_id, db_name, db_user) VALUES ($1, $2, $3) ON CONFLICT (db_name) DO NOTHING`,
      [newUserId, safeDb, db.db_user]
    );
  }

  // Restore domains + nginx vhosts + DNS
  for (const domain of (domains ?? [])) {
    const domainRes = await client.query(
      `INSERT INTO domains (user_id, domain_name, document_root, php_version, is_ssl)
       VALUES ($1, $2, $3, $4, false) ON CONFLICT (domain_name) DO NOTHING RETURNING id`,
      [newUserId, domain.domain_name, domain.document_root, domain.php_version]
    );
    const newDomainId = domainRes.rows[0]?.id as number | undefined;
    if (newDomainId) {
      await handleCreateDomain({
        domainId: newDomainId,
        domainName: domain.domain_name,
        username,
        phpVersion: domain.php_version,
        docRoot: domain.document_root,
      }).catch(err => console.warn(`Vhost restore failed for ${domain.domain_name}:`, err));
    }
  }

  // Re-insert any extra DNS records not re-created by handleCreateDomain
  for (const zone of (dns_zones ?? [])) {
    const zoneRes = await client.query('SELECT id FROM dns_zones WHERE domain_name = $1', [zone.domain_name]);
    if (zoneRes.rows.length > 0) {
      const zoneId = zoneRes.rows[0]!.id as number;
      for (const record of (zone.records ?? [])) {
        await client.query(
          `INSERT INTO dns_records (zone_id, type, name, content, priority, ttl)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [zoneId, record.type, record.name, record.content, record.priority ?? null, record.ttl]
        );
      }
    }
  }

  // Remove deleted_users record now that restore is complete
  await client.query('DELETE FROM deleted_users WHERE id = $1', [deletedUserId]);

  // Remove archive file
  await execPromise(`sudo rm -f ${shellEscape(deleted.archive_path)}`).catch(() => {});

  // Clean up staging
  await execPromise(`sudo rm -rf ${shellEscape(stagingDir)}`).catch(() => {});

  console.log(`User ${username} restored successfully.`);
}

async function handlePurgeUserArchive(payload: any) {
  const { deletedUserId, archivePath } = payload;
  await execPromise(`sudo rm -f ${shellEscape(archivePath)}`).catch(() => {});
  await client.query('DELETE FROM deleted_users WHERE id = $1', [deletedUserId]);
  console.log(`Archive purged: ${archivePath}`);
}

async function handleReadLogs(payload: any, taskId: number) {
  const { logType } = payload;
  const lineCount = validateLineCount(payload?.lines ?? 50, 10000);

  // Log paths are fixed — logType selects from a hard-coded map, never interpolated
  const LOG_PATHS: Record<string, string> = {
    nginx_access: '/var/log/nginx/access.log',
    nginx_error: '/var/log/nginx/error.log',
    php_fpm: '/var/log/php8.3-fpm.log',
    system: '/var/log/syslog',
    auth: '/var/log/auth.log',
  };

  const filePath = LOG_PATHS[logType as string];
  if (!filePath) throw new Error(`Unknown log type: ${logType}`);

  try {
    // Use fixed path (from allowlist) and validated line count — no interpolation needed
    const { stdout } = await execPromise(`sudo tail -n ${lineCount} ${shellEscape(filePath)}`);
    await client.query(
      'UPDATE tasks SET payload = payload || $1 WHERE id = $2',
      [JSON.stringify({ result: stdout }), taskId]
    );
  } catch (err) {
    console.error(`Failed to read log ${logType}:`, err);
    throw err;
  }
}

async function handleCreateDomain(payload: any) {
  const { domainName, username, phpVersion = '8.5' } = payload;
  if (!domainName || !username) throw new Error('Domain name and username are required');

  const docRoot: string = payload.docRoot ?? `/home/${username}/public_html`;

  try {
    await execPromise(`sudo mkdir -p ${shellEscape(docRoot)}`);
    await execPromise(`sudo chown -R ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(docRoot)}`);

    // Write a default welcome page only if one does not already exist
    const indexPath = `${docRoot}/index.html`;
    const indexExists = await execPromise(`sudo test -f ${shellEscape(indexPath)}`).then(() => true).catch(() => false);
    if (!indexExists) {
      const welcomeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${domainName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 48px 56px; text-align: center; max-width: 480px; }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 8px; color: #f8fafc; }
    p { color: #94a3b8; line-height: 1.6; }
    .domain { color: #38bdf8; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🚀</div>
    <h1>You're live!</h1>
    <p>Your hosting account for <span class="domain">${domainName}</span> is ready.<br>Upload your files to get started.</p>
  </div>
</body>
</html>`;
      const tempIndex = `/tmp/index_${username}.html`;
      await fs.writeFile(tempIndex, welcomeHtml);
      await execPromise(`sudo mv ${shellEscape(tempIndex)} ${shellEscape(indexPath)}`);
      await execPromise(`sudo chown ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(indexPath)}`);
      await execPromise(`sudo chmod 644 ${shellEscape(indexPath)}`);
    }

    // Load template
    let template = await fs.readFile(path.join(process.cwd(), 'src/templates/nginx.conf.tplt'), 'utf8');
    template = template.replace(/{{DOMAIN}}/g, domainName);
    template = template.replace(/{{DOC_ROOT}}/g, docRoot);
    template = template.replace(/{{PHP_VERSION}}/g, phpVersion);
    template = template.replace(/{{REVERSE_PROXY_BLOCK}}/g, '');
    template = template.replace(/{{LIMIT_RATE}}/g, 'limit_rate 5m;'); 

    const configPath = `/etc/nginx/sites-available/${domainName}`;
    // We need sudo to write to /etc/nginx
    const tempConfigPath = `/tmp/nginx_${domainName}`;
    await fs.writeFile(tempConfigPath, template);
    await execPromise(`sudo mv ${tempConfigPath} ${configPath}`);
    await execPromise(`sudo ln -sf ${shellEscape(configPath)} /etc/nginx/sites-enabled/`);
    await execPromise('sudo nginx -t && sudo systemctl reload nginx');

    // ── DNS zone ─────────────────────────────────────────────────────────────
    // Look up the user_id from the username so we can insert the zone
    const userRow = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userRow.rows.length > 0) {
      const userId = userRow.rows[0].id as number;
      const serverIp = process.env.SERVER_IP ?? '15.235.73.176';

      // Upsert zone record
      const zoneResult = await client.query<{ id: number }>(
        `INSERT INTO dns_zones (user_id, domain_name, ttl)
         VALUES ($1, $2, 3600)
         ON CONFLICT (domain_name) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING id`,
        [userId, domainName]
      );
      const zoneId = zoneResult.rows[0]!.id;

      // Insert default A records (skip if already present)
      for (const name of ['@', 'www']) {
        await client.query(
          `INSERT INTO dns_records (zone_id, type, name, content, ttl)
           VALUES ($1, 'A', $2, $3, 3600)
           ON CONFLICT DO NOTHING`,
          [zoneId, name, serverIp]
        );
      }

      // Write BIND zone file
      const serial = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '01';
      const zoneContent = `$TTL 3600
@       IN      SOA     ns3.qc.fyi. hostmaster.qc.fyi. (
                        ${serial}01  ; Serial (YYYYMMDDnn)
                        3600         ; Refresh
                        1800         ; Retry
                        604800       ; Expire
                        86400 )      ; Minimum TTL

@       IN      NS      ns3.qc.fyi.
@       IN      NS      ns4.qc.fyi.

@       IN      A       ${serverIp}
www     IN      A       ${serverIp}
`;
      const zoneFilePath = `/etc/bind/zones/db.${domainName}`;
      const tempZonePath  = `/tmp/db_${domainName}`;
      await fs.writeFile(tempZonePath, zoneContent);
      await execPromise(`sudo mkdir -p /etc/bind/zones`);
      await execPromise(`sudo mv ${shellEscape(tempZonePath)} ${shellEscape(zoneFilePath)}`);

      // Register zone in named.conf.zones if not already there
      const zonesConfPath = '/etc/bind/named.conf.zones';
      let zonesConf = '';
      try { zonesConf = await fs.readFile(zonesConfPath, 'utf8'); } catch { /* create fresh */ }
      if (!zonesConf.includes(`zone "${domainName}"`)) {
        zonesConf += `\nzone "${domainName}" { type master; file "${zoneFilePath}"; };\n`;
        const tempZonesConf = `/tmp/named_zones_${Date.now()}`;
        await fs.writeFile(tempZonesConf, zonesConf);
        await execPromise(`sudo mv ${shellEscape(tempZonesConf)} ${zonesConfPath}`);
      }

      await execPromise('sudo named-checkconf && sudo systemctl reload bind9');
      console.log(`DNS zone created for ${domainName} → ${serverIp}`);
    }

    // ── SSL certificate ───────────────────────────────────────────────────────
    // Attempt to issue a cert immediately. If DNS hasn't propagated yet (common
    // on brand-new accounts), certbot will fail — we queue a PROVISION_SSL retry
    // task so SSL gets provisioned once DNS is live, rather than staying HTTP-only.
    try {
      const certbotEmail = process.env.CERTBOT_EMAIL;
      if (!certbotEmail) throw new Error('CERTBOT_EMAIL not set');
      await execPromise(
        `sudo certbot --nginx -d ${shellEscape(domainName)} --non-interactive --agree-tos --email ${shellEscape(certbotEmail)}`
      );
      await client.query('UPDATE domains SET is_ssl = TRUE WHERE domain_name = $1', [domainName]);
      console.log(`SSL certificate issued for ${domainName}`);
    } catch (sslErr) {
      console.warn(`SSL immediate issue failed for ${domainName}, queuing PROVISION_SSL retry:`, sslErr);
      // Queue a retry — the worker will pick it up on the next poll cycle by
      // which point DNS propagation is likely complete.
      await client.query(
        `INSERT INTO tasks (command, payload, status) VALUES ('PROVISION_SSL', $1, 'pending')`,
        [JSON.stringify({ domainName })]
      );
    }

    // ── Email DNS (MX, SPF, DKIM, DMARC) ────────────────────────────────────
    // Only run for domains added via the API (domainId present). Staging
    // subdomains created internally by handleCreateUser have no domainId.
    if (payload.domainId) {
      try {
        await handleGenerateEmailDns({ domainId: payload.domainId, domainName });
      } catch (emailErr) {
        console.warn(`Email DNS setup failed for ${domainName}, continuing:`, emailErr);
      }
    }

    console.log(`Domain ${domainName} created pointing to ${docRoot}`);
  } catch (err) {
    console.error(`Failed to create domain ${domainName}:`, err);
    throw err;
  }
}

async function handleDeleteDomain(payload: any) {
  const domainName = validateDomainName(payload?.domainName);
  const username   = validateUsername(payload?.username);

  // Remove Nginx config and reload
  await execPromise(`sudo rm -f /etc/nginx/sites-enabled/${shellEscape(domainName)}`);
  await execPromise(`sudo rm -f /etc/nginx/sites-available/${shellEscape(domainName)}`);

  // Remove document root
  const docRoot = `/home/${shellEscape(username)}/public_html/${shellEscape(domainName)}`;
  await execPromise(`sudo rm -rf ${docRoot}`).catch(() => { /* ignore if already gone */ });

  // Remove SSL certs if they exist
  await execPromise(`sudo certbot delete --cert-name ${shellEscape(domainName)} --non-interactive`).catch(() => { /* ignore if no cert */ });

  // Remove BIND zone file if present
  await execPromise(`sudo rm -f /etc/bind/zones/db.${shellEscape(domainName)}`).catch(() => { /* ignore */ });

  await execPromise('sudo nginx -t && sudo systemctl reload nginx').catch(() => { /* ignore reload failure */ });

  console.log(`Domain ${domainName} deleted.`);
}

async function handleUpdateDomainConfig(payload: any) {
  const { domainName, username, phpVersion, reverseProxyBlock } = payload;
  if (!domainName || !username) throw new Error('Domain name and username are required');

  const docRoot = `/home/${username}/public_html`;
  
  // Load template again to ensure we have a clean slate, or read existing config?
  // Using the template is safer to avoid accumulation of manual edits.
  let template = await fs.readFile(path.join(process.cwd(), 'src/templates/nginx.conf.tplt'), 'utf8');
  template = template.replace(/{{DOMAIN}}/g, domainName);
  template = template.replace(/{{DOC_ROOT}}/g, docRoot);
  template = template.replace(/{{PHP_VERSION}}/g, phpVersion);
  template = template.replace(/{{REVERSE_PROXY_BLOCK}}/g, reverseProxyBlock || '');
  template = template.replace(/{{LIMIT_RATE}}/g, 'limit_rate 5m;'); 

  const configPath = `/etc/nginx/sites-available/${domainName}`;
  await fs.writeFile(configPath, template);

  // Test and reload Nginx
  await execPromise('nginx -t');
  await execPromise('systemctl reload nginx');

  console.log(`Domain ${domainName} configuration updated and Nginx reloaded.`);
}

async function handleSetupCustomApi(payload: any) {
  const { userId, port, serviceName, domainId } = payload;
  
  // 1. Get Domain Info
  const domainRes = await client.query('SELECT d.domain_name, u.username FROM domains d JOIN users u ON d.user_id = u.id WHERE d.id = $1', [domainId]);
  if (domainRes.rows.length === 0) throw new Error('Domain not found');
  const { domain_name, username } = domainRes.rows[0];

  // 2. Update Nginx Config to reverse proxy /api or similar to the port
  const configPath = `/etc/nginx/sites-available/${domain_name}`;
  let config = await fs.readFile(configPath, 'utf8');
  
  const proxyBlock = `
    location /api {
        proxy_pass http://localhost:${port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
  `;

  // Insert proxy block before the last closing brace (basic approach)
  // Realistically we should use the placeholder {{REVERSE_PROXY_BLOCK}} but we might have already replaced it.
  // We'll replace it again or append it.
  if (config.includes('location /api')) {
    // Already exists, maybe update it? For now skip.
  } else {
    config = config.replace('location / {', `${proxyBlock}\n    location / {`);
  }

  await fs.writeFile(configPath, config);
  await execPromise('nginx -t && systemctl reload nginx');

  console.log(`Custom API proxy setup for ${domain_name} on port ${port}.`);
}

async function handleFirewallAllow(payload: any) {
  const port = validatePort(payload?.port);
  const protocol = validateProtocol(payload?.protocol ?? 'tcp');
  await execPromise(`sudo ufw allow ${port}/${protocol}`);
  console.log(`Firewall allowed ${port}/${protocol}`);
}

async function handleFirewallDelete(payload: any) {
  const ruleNumber = validateRuleNumber(payload?.ruleNumber);
  await execPromise(`sudo ufw --force delete ${ruleNumber}`);
  console.log(`Firewall rule ${ruleNumber} deleted.`);
}

async function handleGetFirewallStatus(_payload: any, taskId: number) {
  const { stdout } = await execPromise('sudo ufw status numbered');
  await client.query(
    'UPDATE tasks SET payload = payload || $1 WHERE id = $2',
    [JSON.stringify({ result: stdout }), taskId]
  );
}

async function handleGetProcesses(payload: any, taskId: number) {
  let command: string;

  if (payload?.username) {
    const username = validateUsername(payload.username);
    // Use shellEscape to safely include the validated username
    command = `ps -u ${shellEscape(username)} -o user,pid,%cpu,%mem,vsz,rss,tty,stat,start,time,command --sort=-%cpu`;
  } else {
    command = 'ps aux --sort=-%cpu';
  }

  const { stdout } = await execPromise(command);
  await client.query(
    'UPDATE tasks SET payload = payload || $1 WHERE id = $2',
    [JSON.stringify({ result: stdout }), taskId]
  );
}

async function handleKillProcess(payload: any) {
  const pid = validatePid(payload?.pid);
  const signal = validateSignal(payload?.signal ?? 'SIGTERM');
  const username = payload?.username ? validateUsername(payload.username) : null;

  // Security: Verify process belongs to the expected user before killing
  if (username) {
    const { stdout } = await execPromise(`ps -p ${pid} -o user=`);
    if (stdout.trim() !== username) {
      throw new Error(`Permission denied: Process ${pid} does not belong to ${username}`);
    }
  }

  await execPromise(`kill -s ${signal} ${pid}`);
  console.log(`Sent ${signal} to process ${pid}.`);
}

async function handleInstallSsl(payload: any) {
  const domainName = validateDomainName(payload?.domainName);

  const certbotEmail = process.env.CERTBOT_EMAIL;
  if (!certbotEmail) throw new Error('CERTBOT_EMAIL environment variable is not set');

  // All args are validated / escaped — domainName passes DNS regex check
  await execPromise(
    `certbot --nginx -d ${shellEscape(domainName)} --non-interactive --agree-tos --email ${shellEscape(certbotEmail)}`
  );

  await client.query('UPDATE domains SET is_ssl = TRUE WHERE domain_name = $1', [domainName]);
  console.log(`SSL installed for ${domainName}`);
}

// PROVISION_SSL: queued automatically by handleCreateDomain when certbot fails
// on initial domain creation (DNS not propagated yet). Re-runs certbot once the
// task is picked up — by then DNS is usually live.
async function handleProvisionSsl(payload: any) {
  const domainName = validateDomainName(payload?.domainName);
  const certbotEmail = process.env.CERTBOT_EMAIL;
  if (!certbotEmail) throw new Error('CERTBOT_EMAIL environment variable is not set');
  await execPromise(
    `sudo certbot --nginx -d ${shellEscape(domainName)} --non-interactive --agree-tos --email ${shellEscape(certbotEmail)}`
  );
  await client.query('UPDATE domains SET is_ssl = TRUE WHERE domain_name = $1', [domainName]);
  console.log(`SSL provisioned (retry) for ${domainName}`);
}

async function handleRestartService(payload: any) {
  const serviceName = validateServiceName(payload?.serviceName);
  await execPromise(`sudo systemctl restart ${shellEscape(serviceName)}`);
  console.log(`Service ${serviceName} restarted.`);
}

async function handleSyncMigrationData(payload: any) {
  const { sourcePath, targetPath, username } = payload;
  if (!sourcePath || !targetPath || !username) {
    throw new Error('sourcePath, targetPath, and username are required for sync');
  }

  // Ensure target directory exists
  await fs.mkdir(targetPath, { recursive: true });

  // Use rsync to move files and preserve permissions/structure
  console.log(`Syncing files from ${sourcePath} to ${targetPath}...`);
  // Note: sourcePath usually ends with /public_html or similar. 
  // We append / to sourcePath to copy contents, not the folder itself if that's intended.
  await execPromise(`rsync -av ${sourcePath}/ ${targetPath}/`);

  // Fix permissions for the new user
  await execPromise(`chown -R ${username}:${username} ${targetPath}`);
  
  // Cleanup source path if it's in /tmp
  if (sourcePath.includes('/tmp/migrate_')) {
    // We only clean up the specific temp dir, but be careful with rm -rf
    // Typically the migration script should handle its own temp dir, 
    // but the worker needs the files. We'll let the worker clean up after sync.
    // For safety, we'll only delete if it looks like a migration temp dir.
  }

  console.log(`Sync completed for ${username} at ${targetPath}`);
}

async function handleUpdateResourceUsage(payload: any) {
  const { username, userId } = payload;
  if (!username || !userId) throw new Error('Username and userId are required');

  const homeDir = `/home/${username}`;
  
  try {
    // 1. Get current limits from DB
    const userRes = await client.query('SELECT disk_limit_mb, bandwidth_limit_mb FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) throw new Error('User not found');
    const { disk_limit_mb, bandwidth_limit_mb } = userRes.rows[0];

    // 2. Calculate Disk Usage in MB (using du -sm)
    const { stdout: duOutput } = await execPromise(`du -sm ${homeDir}`);
    const diskUsedMb = parseInt(duOutput.split('\t')[0] || '0');

    // 3. Calculate Bandwidth Usage in MB by parsing Nginx logs for the user's domains
    const domainRes = await client.query('SELECT domain_name FROM domains WHERE user_id = $1', [userId]);
    let totalBytes = 0;

    for (const row of domainRes.rows) {
      const logPath = `/var/log/nginx/${row.domain_name}.access.log`;
      try {
        // We use awk to sum the 10th column (bytes sent) of the combined log format
        const { stdout: awkOutput } = await execPromise(`awk '{sum+=$10} END {print sum}' ${logPath}`);
        const bytes = parseInt(awkOutput.trim());
        if (!isNaN(bytes)) totalBytes += bytes;
      } catch (e) {
        // Log file might not exist yet if no traffic
      }
    }
    const bandwidthUsedMb = Math.round(totalBytes / (1024 * 1024));

    // 4. Update Database
    await client.query(
      'UPDATE users SET disk_used_mb = $1, bandwidth_used_mb = $2, updated_at = NOW() WHERE id = $3',
      [diskUsedMb, bandwidthUsedMb, userId]
    );

    // 5. Enforcement Logic
    if (diskUsedMb > disk_limit_mb) {
      console.warn(`CRITICAL: User ${username} is over disk quota! Used: ${diskUsedMb}MB / Limit: ${disk_limit_mb}MB`);
      // TODO: Implement disk suspension logic here
    }
    
    if (bandwidthUsedMb > bandwidth_limit_mb) {
      console.warn(`CRITICAL: User ${username} is over bandwidth quota! Used: ${bandwidthUsedMb}MB / Limit: ${bandwidth_limit_mb}MB`);
      // TODO: Implement bandwidth suspension or aggressive traffic shaping here
    }

    console.log(`Resource usage updated for ${username}: Disk ${diskUsedMb}MB, Bandwidth ${bandwidthUsedMb}MB`);
  } catch (err) {
    console.error(`Failed to update resources for ${username}:`, err);
    throw err;
  }
}

async function handleCreateDatabase(payload: any) {
  const { dbName, dbUser, dbPassword } = payload;
  if (!dbName || !dbUser || !dbPassword) throw new Error('dbName, dbUser, and dbPassword are required');

  const connection = await mysql.createConnection({
    host: 'localhost',
    user: process.env.DB_ADMIN_USER || 'superhost_worker',
    password: process.env.DB_ADMIN_PASS || 'worker_db_pass',
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPassword}'`);
    await connection.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost'`);
    await connection.query('FLUSH PRIVILEGES');
    console.log(`Database ${dbName} and user ${dbUser} created successfully.`);
  } catch (err) {
    console.error(`Error creating database ${dbName}:`, err);
    throw err;
  } finally {
    await connection.end();
  }
}

async function handleChangeDbPassword(payload: any) {
  const { dbUser, newPassword } = payload;
  if (!dbUser || !newPassword) throw new Error('dbUser and newPassword are required');

  const safeName = validateMysqlIdentifier(dbUser);
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: process.env.DB_ADMIN_USER || 'superhost_worker',
    password: process.env.DB_ADMIN_PASS || 'worker_db_pass',
  });
  try {
    await connection.query(`ALTER USER '${safeName}'@'localhost' IDENTIFIED BY ?`, [newPassword]);
    await connection.query('FLUSH PRIVILEGES');
    console.log(`Password changed for database user ${safeName}.`);
  } finally {
    await connection.end();
  }
}

async function handleDeleteDatabase(payload: any) {
  const { dbName, dbUser } = payload;
  if (!dbName || !dbUser) throw new Error('dbName and dbUser are required');

  const connection = await mysql.createConnection({
    host: 'localhost',
    user: process.env.DB_ADMIN_USER || 'superhost_worker',
    password: process.env.DB_ADMIN_PASS || 'worker_db_pass',
  });

  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await connection.query(`DROP USER IF EXISTS '${dbUser}'@'localhost'`);
    await connection.query('FLUSH PRIVILEGES');
    console.log(`Database ${dbName} and user ${dbUser} deleted successfully.`);
  } catch (err) {
    console.error(`Error deleting database ${dbName}:`, err);
    throw err;
  } finally {
    await connection.end();
  }
}

async function handleGenerateEmailDns(payload: any) {
  const { domainId, domainName } = payload;
  if (!domainId || !domainName) throw new Error('domainId and domainName are required');

  const keyDir = `/etc/opendkim/keys/${domainName}`;
  const selector = 'default';

  try {
    // 1. Generate DKIM keys (skip if already exist)
    const keyExists = await execPromise(`sudo test -f ${shellEscape(`${keyDir}/${selector}.private`)}`).then(() => true).catch(() => false);
    if (!keyExists) {
      await execPromise(`sudo mkdir -p ${shellEscape(keyDir)}`);
      await execPromise(`sudo opendkim-genkey -s ${shellEscape(selector)} -d ${shellEscape(domainName)} -D ${shellEscape(keyDir)}`);
      await execPromise(`sudo chown -R opendkim:opendkim ${shellEscape(keyDir)}`);
    }

    // 2. Read the public key — handle multi-line quoted BIND format
    const { stdout: pubKeyOut } = await execPromise(`sudo cat ${shellEscape(`${keyDir}/${selector}.txt`)}`);
    // Concatenate all quoted segments, then extract the base64 key after p=
    const allQuoted = (pubKeyOut.match(/"([^"]*)"/g) ?? []).map(s => s.slice(1, -1)).join('');
    const pkMatch = allQuoted.match(/p=([A-Za-z0-9+/=]+)/);
    const pubKey = pkMatch?.[1] ?? '';
    if (!pubKey) throw new Error('Failed to parse DKIM public key');

    const dkimRecord = `v=DKIM1; h=sha256; k=rsa; p=${pubKey}`;

    // 3. Update OpenDKIM mapping files (avoid duplicates)
    // Write entries via temp files to avoid any shell-quoting issues
    const keyTableEntry = `${selector}._domainkey.${domainName} ${domainName}:${selector}:${keyDir}/${selector}.private`;
    const signingEntry   = `*@${domainName} ${selector}._domainkey.${domainName}`;

    const tmpKT  = `/tmp/opendkim_kt_${domainName}`;
    const tmpST  = `/tmp/opendkim_st_${domainName}`;
    const tmpTH  = `/tmp/opendkim_th_${domainName}`;
    await fs.writeFile(tmpKT, keyTableEntry + '\n');
    await fs.writeFile(tmpST, signingEntry  + '\n');
    await fs.writeFile(tmpTH, domainName    + '\n');

    // Append only if the entry is not already present
    await execPromise(`sudo grep -qF ${shellEscape(keyTableEntry)} /etc/opendkim/KeyTable   || sudo tee -a /etc/opendkim/KeyTable   < ${shellEscape(tmpKT)}   > /dev/null`);
    await execPromise(`sudo grep -qF ${shellEscape(signingEntry)}   /etc/opendkim/SigningTable || sudo tee -a /etc/opendkim/SigningTable < ${shellEscape(tmpST)} > /dev/null`);
    await execPromise(`sudo grep -qF ${shellEscape(domainName)}     /etc/opendkim/TrustedHosts || sudo tee -a /etc/opendkim/TrustedHosts < ${shellEscape(tmpTH)} > /dev/null`);
    await Promise.all([fs.rm(tmpKT), fs.rm(tmpST), fs.rm(tmpTH)]).catch(() => {});
    await execPromise('sudo systemctl restart opendkim');

    // 4. Upsert DNS records into dns_records table (zone must already exist from handleCreateDomain)
    const zoneRes = await client.query<{ id: number }>(
      'SELECT id FROM dns_zones WHERE domain_name = $1',
      [domainName]
    );
    if (zoneRes.rows.length === 0) throw new Error(`No DNS zone found for ${domainName} — create the domain first`);
    const zoneId = zoneRes.rows[0]!.id;

    // Helper: upsert a dns_record (match on zone_id + type + name)
    const upsertRecord = async (type: string, name: string, content: string, priority?: number) => {
      await client.query(
        `INSERT INTO dns_records (zone_id, type, name, content, priority, ttl)
         VALUES ($1, $2, $3, $4, $5, 3600)
         ON CONFLICT DO NOTHING`,
        [zoneId, type, name, content, priority ?? null]
      );
      // Also update if it already exists for this type+name
      await client.query(
        `UPDATE dns_records SET content = $1, priority = $2 WHERE zone_id = $3 AND type = $4 AND name = $5`,
        [content, priority ?? null, zoneId, type, name]
      );
    };

    // MX record — mail for the domain routes to mail.<domain>
    await upsertRecord('MX', '@', `mail.${domainName}`, 10);
    // A record for mail subdomain
    const serverIp = process.env.SERVER_IP ?? '15.235.73.176';
    await upsertRecord('A', 'mail', serverIp);
    // SPF
    await upsertRecord('TXT', '@', `v=spf1 ip4:${serverIp} mx ~all`);
    // DKIM
    await upsertRecord('TXT', `${selector}._domainkey`, dkimRecord);
    // DMARC
    await upsertRecord('TXT', '_dmarc', 'v=DMARC1; p=quarantine; sp=quarantine; adkim=r; aspf=r;');

    // 5. Sync BIND zone file
    await handleSyncDnsZone({ zoneId, domainName });

    // 6. Provision webmail vhost at mail.<domain>
    await handleProvisionWebmailVhost({ domainName });

    console.log(`Email DNS (MX, SPF, DKIM, DMARC) configured for ${domainName}`);
  } catch (err) {
    console.error(`Error generating email DNS for ${domainName}:`, err);
    throw err;
  }
}

async function handleProvisionWebmailVhost({ domainName }: { domainName: string }) {
  const mailHost = `mail.${domainName}`;
  const nginxConf = `/etc/nginx/sites-available/${mailHost}`;
  const nginxLink = `/etc/nginx/sites-enabled/${mailHost}`;
  const certPath  = `/etc/letsencrypt/live/${mailHost}/fullchain.pem`;

  // 1. Write nginx config (HTTP only first — certbot will upgrade to HTTPS)
  const httpConf = `server {
    listen 80;
    server_name ${mailHost};

    root /var/www/roundcube;
    index index.php;

    access_log /var/log/nginx/${mailHost}.access.log;
    error_log  /var/log/nginx/${mailHost}.error.log;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        fastcgi_pass unix:/var/run/php/php8.5-fpm-roundcube.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ ^/(bin|config|installer|logs|SQL|temp) {
        deny all;
    }
}
`;

  await fs.writeFile(`/tmp/${mailHost}.nginx`, httpConf);
  await execPromise(`sudo mv /tmp/${mailHost}.nginx ${nginxConf}`);
  await execPromise(`sudo ln -sf ${nginxConf} ${nginxLink}`);
  await execPromise('sudo nginx -t && sudo systemctl reload nginx');

  // 2. Obtain SSL certificate via certbot
  try {
    const certbotRes = await execPromise(
      `sudo certbot certonly --nginx --non-interactive --agree-tos ` +
      `--email hostmaster@${domainName} -d ${shellEscape(mailHost)} 2>&1`
    );
    console.log(`Certbot for ${mailHost}:`, certbotRes.stdout.slice(0, 200));
  } catch (certErr: any) {
    console.warn(`Certbot failed for ${mailHost} (may need DNS to propagate):`, certErr.stderr?.slice(0, 200));
    // Leave HTTP-only config in place; can re-run later
    return;
  }

  // 3. Rewrite nginx config with SSL
  const httpsConf = `server {
    listen 80;
    server_name ${mailHost};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ${mailHost};

    ssl_certificate     ${certPath};
    ssl_certificate_key /etc/letsencrypt/live/${mailHost}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    root /var/www/roundcube;
    index index.php;

    access_log /var/log/nginx/${mailHost}.access.log;
    error_log  /var/log/nginx/${mailHost}.error.log;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        fastcgi_pass unix:/var/run/php/php8.5-fpm-roundcube.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ ^/(bin|config|installer|logs|SQL|temp) {
        deny all;
    }
}
`;

  await fs.writeFile(`/tmp/${mailHost}.nginx`, httpsConf);
  await execPromise(`sudo mv /tmp/${mailHost}.nginx ${nginxConf}`);
  await execPromise('sudo nginx -t && sudo systemctl reload nginx');
  console.log(`Webmail vhost provisioned: https://${mailHost}`);
}

async function handleInstallWordPress(payload: any) {
  const { domainName, username, dbName, dbUser, dbPassword, siteTitle, adminUser, adminPassword, adminEmail } = payload;
  
  if (!domainName || !username || !dbName) throw new Error('Missing required fields for WordPress installation');

  const docRoot = `/home/${username}/public_html/${domainName}`;
  const wpCli = `sudo -u ${username} wp --path=${docRoot}`;

  try {
    // 1. Ensure DB exists (reuse create DB logic)
    await handleCreateDatabase({ dbName, dbUser, dbPassword });

    // 2. Download and config WP
    console.log(`Starting WordPress installation in ${docRoot}...`);
    await execPromise(`${wpCli} core download`);
    await execPromise(`${wpCli} config create --dbname=${dbName} --dbuser=${dbUser} --dbpass=${dbPassword} --dbhost=localhost`);
    
    // 3. Install core
    await execPromise(`${wpCli} core install --url=http://${domainName} --title="${siteTitle}" --admin_user="${adminUser}" --admin_password="${adminPassword}" --admin_email="${adminEmail}"`);

    // 4. Update Nginx configuration for WordPress routing
    let template = await fs.readFile(path.join(process.cwd(), 'src/templates/nginx.conf.tplt'), 'utf8');
    template = template.replace(/{{DOMAIN}}/g, domainName);
    template = template.replace(/{{DOC_ROOT}}/g, docRoot);
    template = template.replace(/{{PHP_VERSION}}/g, '8.5');
    template = template.replace(/{{REVERSE_PROXY_BLOCK}}/g, ''); 
    template = template.replace(/{{LIMIT_RATE}}/g, 'limit_rate 5m;'); 
    // Modify standard try_files for WP permalinks
    template = template.replace(/try_files \$uri \$uri\/ \/index.php\?\$query_string;/g, 'try_files $uri $uri/ /index.php$is_args$args;');

    const configPath = `/etc/nginx/sites-available/${domainName}`;
    await fs.writeFile(configPath, template);
    await execPromise(`ln -sf ${configPath} /etc/nginx/sites-enabled/`);
    await execPromise('systemctl reload nginx');

    console.log(`WordPress successfully installed for ${domainName}.`);
  } catch (err) {
    console.error(`Error installing WordPress for ${domainName}:`, err);
    throw err;
  }
}

async function handleSetupAppRuntime(payload: any) {
  const { appId, username, domainName, type, port, startupScript } = payload;
  const appPath = `/home/${username}/public_html`;
  const appName = `app_${appId}`;

  try {
    // 1. Configure Nginx Proxy
    let config = await fs.readFile(path.join(process.cwd(), 'src/templates/nginx.conf.tplt'), 'utf8');
    
    const proxyBlock = `
    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }`;

    config = config
      .replace(/{{DOMAIN}}/g, domainName)
      .replace(/{{DOC_ROOT}}/g, appPath)
      .replace(/{{PHP_VERSION}}/g, '8.5')
      .replace(/{{LIMIT_RATE}}/g, '')
      .replace('{{REVERSE_PROXY_BLOCK}}', proxyBlock)
      .replace(/location \/ {[\s\S]*?}/, ''); // Remove default location / block

    await fs.writeFile(`/etc/nginx/sites-available/${domainName}`, config);
    await execPromise('sudo nginx -t');
    await execPromise('sudo systemctl reload nginx');

    // 2. Start via PM2
    const script = shellEscape(startupScript || (type === 'python' ? 'app.py' : 'index.js'));
    const interpreter = type === 'python' ? 'python3' : 'node';
    const pm2Start = `pm2 start ${script} --name ${shellEscape(appName)} --interpreter ${interpreter} --cwd ${shellEscape(appPath)}`;

    await execPromise(`sudo -u ${shellEscape(username)} bash -c ${shellEscape(pm2Start)}`);

    // 3. Persist PM2 process list so apps survive reboots
    // pm2 startup creates/updates the systemd unit for this user; pm2 save persists the process list.
    await execPromise(`pm2 startup systemd -u ${shellEscape(username)} --hp ${shellEscape(`/home/${username}`)} --silent`).catch(() => {});
    await execPromise(`sudo -u ${shellEscape(username)} pm2 save --force`);

    // 4. Update status in DB
    await client.query('UPDATE user_apps SET status = $1 WHERE id = $2', ['running', appId]);
    console.log(`App ${appName} (${type}) setup on port ${port}`);
  } catch (err) {
    console.error('Failed to setup app runtime:', err);
    throw err;
  }
}

async function handleManageAppRuntime(payload: any) {
  const { username, action, appId } = payload;
  const appName = `app_${appId}`;
  try {
    await execPromise(`sudo -u ${shellEscape(username)} pm2 ${shellEscape(action)} ${shellEscape(appName)}`);
    await execPromise(`sudo -u ${shellEscape(username)} pm2 save --force`);
    const status = action === 'stop' ? 'stopped' : 'running';
    await client.query('UPDATE user_apps SET status = $1 WHERE id = $2', [status, appId]);
    console.log(`App ${appName} ${action}ed.`);
  } catch (err) {
    console.error(`Failed to ${action} app:`, err);
    throw err;
  }
}

async function handleDeleteAppRuntime(payload: any) {
  const { username, domainName, appId } = payload;
  const appName = `app_${appId}`;
  try {
    // 1. Delete from PM2 and save so the process doesn't come back on reboot
    await execPromise(`sudo -u ${shellEscape(username)} pm2 delete ${shellEscape(appName)}`).catch(() => {});
    await execPromise(`sudo -u ${shellEscape(username)} pm2 save --force`).catch(() => {});
    
    // 2. Revert Nginx to standard
    await handleCreateDomain({ username, domainName, phpVersion: '8.5' });
    console.log(`App ${appName} deleted and domain ${domainName} reverted to standard.`);
  } catch (err) {
    console.error('Failed to delete app runtime:', err);
    throw err;
  }
}

async function handleGitDeploy(payload: any, taskId: number) {
  const username = validateUsername(payload?.username);
  const repoUrl = validateRepoUrl(payload?.repoUrl);
  const branch = validateBranchName(payload?.branch ?? 'main');
  const { deployPath, repoId } = payload;

  // Validate deploy path stays within user's public_html
  const baseDir = `/home/${username}/public_html`;
  const fullPath = deployPath
    ? await validatePath(deployPath, baseDir)
    : baseDir;

  try {
    console.log(`Starting Git deployment for ${username} at ${fullPath}...`);

    const hasGit = await fs.stat(path.join(fullPath, '.git')).then(() => true).catch(() => false);

    if (!hasGit) {
      // shellEscape all user-supplied values before interpolation
      await execPromise(
        `sudo -u ${shellEscape(username)} git clone -b ${shellEscape(branch)} ${shellEscape(repoUrl)} ${shellEscape(fullPath)}`
      );
    } else {
      // cd into fixed path, fetch, then reset to escaped branch
      await execPromise(
        `sudo -u ${shellEscape(username)} sh -c ${shellEscape(`cd ${fullPath} && git fetch --all && git reset --hard origin/${branch}`)}`
      );
    }

    await client.query('UPDATE user_git_repos SET last_deployed = NOW() WHERE id = $1', [repoId]);
    console.log(`Git deployment successful for repo ID ${repoId}`);
  } catch (err) {
    console.error('Git deployment failed:', err);
    throw err;
  }
}

async function handleSyncCrontab(payload: any) {
  const username = validateUsername(payload?.username);
  const jobs: any[] = Array.isArray(payload?.jobs) ? payload.jobs : [];

  // Use a secure temp directory with restricted permissions
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'superhost-cron-'));
  const tempFile = path.join(tmpDir, 'crontab');

  try {
    // Validate every field of every job before writing
    const cronLines = jobs.map((job: any, idx: number) => {
      try {
        const minute  = validateCronField(job.minute ?? '*',  'minute');
        const hour    = validateCronField(job.hour ?? '*',    'hour');
        const day     = validateCronField(job.day ?? '*',     'day');
        const month   = validateCronField(job.month ?? '*',   'month');
        const weekday = validateCronField(job.weekday ?? '*', 'weekday');
        const command = validateCronCommand(job.command);
        return `${minute} ${hour} ${day} ${month} ${weekday} ${command}`;
      } catch (e) {
        throw new Error(`Cron job #${idx}: ${(e as Error).message}`);
      }
    });

    const crontabContent = cronLines.join('\n') + '\n';
    await fs.writeFile(tempFile, crontabContent, { mode: 0o600 });

    await execPromise(`sudo crontab -u ${shellEscape(username)} ${shellEscape(tempFile)}`);
    console.log(`Crontab synchronized for ${username}.`);
  } finally {
    // Always clean up temp files, even on error
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  try {
    // placeholder to keep original catch block structure intact
  } catch (err) {
    console.error(`Failed to sync crontab for ${username}:`, err);
    throw err;
  }
}

async function handleSyncFtp(payload: any) {
  const { username } = payload;
  if (!username) throw new Error('username is required');

  try {
    // 1. Get all FTP accounts for this user from the DB
    const res = await client.query(`
      SELECT f.ftp_username, f.homedir, f.password_hash 
      FROM ftp_accounts f 
      JOIN users u ON f.user_id = u.id 
      WHERE u.username = $1
    `, [username]);

    const accounts = res.rows;

    // 2. Get system UID and GID for the user
    const { stdout: uidOut } = await execPromise(`id -u ${username}`);
    const { stdout: gidOut } = await execPromise(`id -g ${username}`);
    const uid = uidOut.trim();
    const gid = gidOut.trim();

    console.log(`Syncing ${accounts.length} FTP accounts for ${username} (UID: ${uid}, GID: ${gid})...`);

    // 3. For each account, we would normally use pure-pw to add/update it
    // Since we only have the hash, this is tricky with pure-pw's default behavior.
    // In a real panel, we would use an SQL backend for Pure-FTPd so this sync is not needed,
    // or we would use 'pure-pw' with the plaintext password during the 'create' API call.
    
    // For this implementation, we will simulate the sync by ensuring the directories exist and have correct permissions.
    for (const acc of accounts) {
       await execPromise(`sudo mkdir -p ${acc.homedir}`);
       await execPromise(`sudo chown ${uid}:${gid} ${acc.homedir}`);
       
       // Example of how pure-pw would be called if we had the password or used a compatible hash:
       // await execPromise(`sudo pure-pw useradd ${acc.ftp_username} -u ${uid} -g ${gid} -d ${acc.homedir} -m`);
    }

    console.log(`FTP synchronization completed for ${username}.`);
  } catch (err) {
    console.error(`Failed to sync FTP for ${username}:`, err);
    throw err;
  }
}

async function handleSyncDnsZone(payload: any) {
  const { zoneId, domainName } = payload;
  if (!zoneId || !domainName) throw new Error('zoneId and domainName are required');

  try {
    // 1. Fetch Zone and Records
    const zoneRes = await client.query('SELECT * FROM dns_zones WHERE id = $1', [zoneId]);
    const recordsRes = await client.query('SELECT * FROM dns_records WHERE zone_id = $1', [zoneId]);
    
    const zone = zoneRes.rows[0];
    const records = recordsRes.rows;

    // 2. Load Template
    let template = await fs.readFile(path.join(process.cwd(), 'src/templates/bind_zone.tplt'), 'utf8');
    
    // 3. Prepare placeholders — prefer DB settings, fall back to env
    const settingsRes = await client.query(
      "SELECT key, value FROM server_settings WHERE key IN ('ns1','ns2','master_domain')"
    ).catch(() => ({ rows: [] as { key: string; value: string }[] }));
    const dbSettings: Record<string, string> = {};
    for (const row of settingsRes.rows) dbSettings[row.key] = row.value;

    const masterDomain = dbSettings['master_domain'] ?? process.env.MASTER_DOMAIN ?? 'web02.qc.fyi';
    const ns1 = dbSettings['ns1'] ?? process.env.NS1 ?? 'ns3.qc.fyi';
    const ns2 = dbSettings['ns2'] ?? process.env.NS2 ?? 'ns4.qc.fyi';
    const serial = Math.floor(Date.now() / 1000);

    template = template.replace(/{{TTL}}/g, zone.ttl.toString());
    template = template.replace(/{{MASTER_DOMAIN}}/g, masterDomain);
    template = template.replace(/{{NS1}}/g, ns1);
    template = template.replace(/{{NS2}}/g, ns2);
    template = template.replace(/{{SERIAL}}/g, serial.toString());

    // 4. Generate Record Lines
    const recordLines = records.map((r: any) => {
      const name = r.name === '@' ? '' : r.name;
      const priority = r.priority ? `\t${r.priority}` : '';
      const ttl = r.ttl ? `\t${r.ttl}` : '';

      // TXT records must be quoted and split into ≤255-byte chunks for BIND
      let content = r.content as string;
      if (r.type === 'TXT') {
        // Strip any existing outer quotes before re-quoting
        const raw = content.replace(/^"+|"+$/g, '');
        const chunkSize = 255;
        if (raw.length <= chunkSize) {
          content = `"${raw}"`;
        } else {
          const chunks: string[] = [];
          for (let i = 0; i < raw.length; i += chunkSize) chunks.push(raw.slice(i, i + chunkSize));
          content = '( ' + chunks.map(c => `"${c}"`).join(' ') + ' )';
        }
      }

      return `${name}${ttl}\tIN\t${r.type}${priority}\t${content}`;
    }).join('\n');

    template = template.replace(/{{RECORDS}}/g, recordLines);

    // 5. Write Zone File
    const safeDomain = shellEscape(domainName);
    const zoneFilePath = `/etc/bind/zones/db.${domainName}`;
    await execPromise('sudo mkdir -p /etc/bind/zones');
    await fs.writeFile(`/tmp/db.${domainName}`, template);
    await execPromise(`sudo mv /tmp/db.${domainName} ${zoneFilePath}`);

    // 6. Ensure zone entry exists in named.conf.zones
    const zonesConfPath = '/etc/bind/named.conf.zones';
    const zoneEntry = `zone "${domainName}" { type master; file "/etc/bind/zones/db.${domainName}"; };\n`;
    let zonesConf = '';
    try { zonesConf = await fs.readFile(zonesConfPath, 'utf8'); } catch { /* file may not exist yet */ }
    if (!zonesConf.includes(`zone "${domainName}"`)) {
      await fs.appendFile(`/tmp/named.conf.zones.tmp`, zoneEntry);
      await execPromise(`cat ${zonesConfPath} /tmp/named.conf.zones.tmp | sudo tee ${zonesConfPath} > /dev/null`);
      await execPromise(`rm -f /tmp/named.conf.zones.tmp`);
    }

    // 7. Reload Bind
    await execPromise(`sudo rndc reload ${safeDomain}`).catch(async () => {
      await execPromise('sudo rndc reconfig').catch(async () => {
        await execPromise('sudo systemctl reload bind9');
      });
    });

    console.log(`DNS zone ${domainName} synchronized.`);
  } catch (err) {
    console.error(`Failed to sync DNS zone ${domainName}:`, err);
    throw err;
  }
}

async function handleRemoveDnsZone(payload: any) {
  const { domainName } = payload;
  if (!domainName) throw new Error('domainName is required');

  try {
    const safeDomain = shellEscape(domainName);
    const zoneFilePath = `/etc/bind/zones/db.${domainName}`;
    await execPromise(`sudo rm -f ${shellEscape(zoneFilePath)}`);

    // Remove zone entry from named.conf.zones
    const zonesConfPath = '/etc/bind/named.conf.zones';
    try {
      const current = await fs.readFile(zonesConfPath, 'utf8');
      const updated = current.split('\n')
        .filter(line => !line.includes(`zone "${domainName}"`))
        .join('\n');
      await fs.writeFile(`/tmp/named.conf.zones.new`, updated);
      await execPromise(`sudo mv /tmp/named.conf.zones.new ${zonesConfPath}`);
    } catch { /* ignore if file missing */ }

    await execPromise('sudo rndc reconfig').catch(async () => {
      await execPromise('sudo systemctl reload bind9');
    });
    console.log(`DNS zone ${domainName} removed.`);
  } catch (err) {
    console.error(`Failed to remove DNS zone ${domainName}:`, err);
    throw err;
  }
}

async function handleConfigureMailServer() {
  console.log('Configuring mail server...');
  try {
    const dbUser     = process.env.DB_USER     ?? 'superhost';
    const dbPassword = process.env.DB_PASSWORD ?? '';
    const dbHost     = process.env.DB_HOST     ?? 'localhost';
    const dbName     = process.env.DB_NAME     ?? 'superhost';

    // 1. Generate Postfix pgsql lookup files from env vars (no hardcoded credentials)
    const postfixConfigs: Record<string, string> = {
      'pgsql-virtual-mailbox-domains.cf': [
        `user = ${dbUser}`,
        `password = ${dbPassword}`,
        `hosts = ${dbHost}`,
        `dbname = ${dbName}`,
        `query = SELECT domain_name FROM mail_domains WHERE domain_name='%s'`,
      ].join('\n'),
      'pgsql-virtual-mailbox-maps.cf': [
        `user = ${dbUser}`,
        `password = ${dbPassword}`,
        `hosts = ${dbHost}`,
        `dbname = ${dbName}`,
        `query = SELECT email FROM mail_users WHERE email='%s'`,
      ].join('\n'),
      'pgsql-virtual-alias-maps.cf': [
        `user = ${dbUser}`,
        `password = ${dbPassword}`,
        `hosts = ${dbHost}`,
        `dbname = ${dbName}`,
        `query = SELECT destination FROM mail_forwarders WHERE source='%s'`,
      ].join('\n'),
      // Catchall lookup: Postfix passes '@domain.com' when no specific match found;
      // %d extracts the domain part so we can find the designated catchall mailbox.
      'pgsql-virtual-catchall.cf': [
        `user = ${dbUser}`,
        `password = ${dbPassword}`,
        `hosts = ${dbHost}`,
        `dbname = ${dbName}`,
        `query = SELECT mu.email FROM mail_users mu JOIN mail_domains md ON mu.domain_id = md.id WHERE md.domain_name='%d' AND mu.is_catchall=TRUE`,
      ].join('\n'),
    };

    for (const [filename, content] of Object.entries(postfixConfigs)) {
      const tempPath = `/tmp/${filename}`;
      await fs.writeFile(tempPath, content + '\n');
      await execPromise(`sudo mv ${shellEscape(tempPath)} /etc/postfix/${filename}`);
      await execPromise(`sudo chown root:postfix /etc/postfix/${filename}`);
      await execPromise(`sudo chmod 640 /etc/postfix/${filename}`);
    }

    // 2. Full Postfix virtual-mailbox configuration
    const postconfSettings = [
      'virtual_mailbox_domains = proxy:pgsql:/etc/postfix/pgsql-virtual-mailbox-domains.cf',
      'virtual_mailbox_maps = proxy:pgsql:/etc/postfix/pgsql-virtual-mailbox-maps.cf',
      'virtual_alias_maps = proxy:pgsql:/etc/postfix/pgsql-virtual-alias-maps.cf, proxy:pgsql:/etc/postfix/pgsql-virtual-catchall.cf',
      'virtual_mailbox_base = /var/mail/vhosts',
      'virtual_minimum_uid = 100',
      'virtual_uid_maps = static:5000',
      'virtual_gid_maps = static:5000',
    ];
    for (const setting of postconfSettings) {
      await execPromise(`sudo postconf -e ${shellEscape(setting)}`);
    }

    // 3. Deploy Dovecot 2.4 SQL auth config (auth-sql.conf.ext)
    //    Correct Dovecot 2.4 format: sql_driver at top level, named pgsql block,
    //    BLF-CRYPT scheme (Dovecot's name for bcrypt / Blowfish-Crypt).
    const authSqlConf = [
      `# Superhost-managed SQL auth — Dovecot 2.4`,
      `sql_driver = pgsql`,
      ``,
      `pgsql ${dbHost} {`,
      `  parameters {`,
      `    dbname = ${dbName}`,
      `    user = ${dbUser}`,
      `    password = ${dbPassword}`,
      `  }`,
      `}`,
      ``,
      `passdb sql {`,
      `  default_password_scheme = BLF-CRYPT`,
      `  query = SELECT password_hash AS password \\`,
      `    FROM mail_users WHERE email = '%{user}'`,
      `}`,
      ``,
      `userdb sql {`,
      `  query = SELECT \\`,
      `    '/var/mail/vhosts/' || split_part(email, '@', 2) || '/' || split_part(email, '@', 1) AS home, \\`,
      `    'maildir' AS mail_driver, \\`,
      `    '/var/mail/vhosts/' || split_part(email, '@', 2) || '/' || split_part(email, '@', 1) AS mail_path, \\`,
      `    CONCAT('*:bytes=', (quota * 1024 * 1024)::text) AS quota_rule \\`,
      `    FROM mail_users WHERE email = '%{user}'`,
      `}`,
    ].join('\n');
    const tempAuthSql = '/tmp/auth-sql.conf.ext';
    await fs.writeFile(tempAuthSql, authSqlConf + '\n');
    await execPromise(`sudo mv ${tempAuthSql} /etc/dovecot/conf.d/auth-sql.conf.ext`);
    await execPromise('sudo chown root:dovecot /etc/dovecot/conf.d/auth-sql.conf.ext');
    await execPromise('sudo chmod 640 /etc/dovecot/conf.d/auth-sql.conf.ext');

    // 4. Write Dovecot 2.4 quota + Sieve plugin conf.d snippet
    const dovecotPlugins = `# Superhost-managed: quota + sieve — Dovecot 2.4 syntax

# Quota applies to all mail protocols
mail_plugins {
  quota = yes
}

# Sieve is a delivery-time plugin — only load during lmtp/lda, not imap
# Loading it globally causes dlopen failure (missing delivery symbol) in imap sessions
protocol lmtp {
  mail_plugins {
    sieve = yes
  }
}

protocol lda {
  mail_plugins {
    sieve = yes
  }
}

sieve_script personal {
  driver = file
  path = ~/.dovecot.sieve
}
`;
    const tempQuota = '/tmp/91-superhost-plugins.conf';
    await fs.writeFile(tempQuota, dovecotPlugins);
    await execPromise(`sudo mv ${tempQuota} /etc/dovecot/conf.d/91-superhost-plugins.conf`);
    await execPromise('sudo chown root:root /etc/dovecot/conf.d/91-superhost-plugins.conf');

    // 5. Ensure vmail user + /var/mail/vhosts exist
    await execPromise(`id vmail`).catch(async () => {
      await execPromise(`sudo groupadd -g 5000 vmail`).catch(() => {});
      await execPromise(`sudo useradd -g vmail -u 5000 vmail -d /var/mail`);
    });
    await execPromise('sudo mkdir -p /var/mail/vhosts');
    await execPromise('sudo chown -R vmail:vmail /var/mail');
    await execPromise('sudo chmod -R 770 /var/mail');

    // 6. SpamAssassin
    await execPromise('sudo systemctl enable spamassassin').catch(() => {});
    await execPromise('sudo systemctl start spamassassin').catch(() => {});

    // 7. Restart services
    await execPromise('sudo postfix check');
    await execPromise('sudo systemctl restart postfix');
    await execPromise('sudo systemctl restart dovecot');

    console.log('Mail server configuration updated successfully.');
  } catch (err) {
    console.error('Failed to configure mail server:', err);
    throw err;
  }
}

async function handleProvisionMailbox(payload: any) {
  const { email } = payload as { email: string };
  if (!email || !email.includes('@')) throw new Error('Valid email address required');
  const [user, domain] = email.split('@') as [string, string];

  const maildir = `/var/mail/vhosts/${shellEscape(domain)}/${shellEscape(user)}`;

  // Create Maildir structure
  await execPromise(`sudo mkdir -p ${maildir}/new ${maildir}/cur ${maildir}/tmp`);
  await execPromise(`sudo chown -R vmail:vmail /var/mail/vhosts`);
  await execPromise(`sudo chmod -R 700 ${maildir}`);

  console.log(`Maildir provisioned for ${email}`);
}

async function handleChangeEmailPassword(payload: any) {
  const { mailUserId, passwordHash } = payload as { mailUserId: number; passwordHash: string };
  if (!mailUserId || !passwordHash) throw new Error('mailUserId and passwordHash required');

  await client.query(
    'UPDATE mail_users SET password_hash = $1 WHERE id = $2',
    [passwordHash, mailUserId]
  );
  console.log(`Email password updated for mailbox ${mailUserId}`);
}

async function handleApplyEmailQuota(payload: any) {
  const { email } = payload as { email: string };
  if (!email) throw new Error('email required');

  // Recalculate stored quota usage — non-fatal if maildir doesn't exist yet
  await execPromise(`sudo doveadm quota recalc -u ${shellEscape(email)}`).catch((err) => {
    console.warn(`Quota recalc skipped for ${email}: ${(err as Error).message}`);
  });
  console.log(`Quota applied for ${email}`);
}

// ── Sieve script generation ────────────────────────────────────────────────────

function sieveStr(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function sieveEnvelopeTest(pattern: string): string {
  if (pattern.startsWith('@')) {
    return `envelope :domain :is "from" ${sieveStr(pattern.slice(1))}`;
  }
  return `envelope :is "from" ${sieveStr(pattern)}`;
}

function buildSieveScript(opts: {
  email: string;
  spamFilterEnabled: boolean;
  spamAction: string;
  globalAllows: string[];
  globalBlocks: string[];
  mbAllows: string[];
  mbBlocks: string[];
  arEnabled: boolean;
  arMessage: string;
}): string {
  const { email, spamFilterEnabled, spamAction, globalAllows, globalBlocks,
          mbAllows, mbBlocks, arEnabled, arMessage } = opts;

  const allAllows = [...globalAllows, ...mbAllows];
  const allBlocks = [...globalBlocks, ...mbBlocks];
  const needFileinto = spamFilterEnabled && (allBlocks.length > 0 || spamAction === 'quarantine');
  const needEnvelope = spamFilterEnabled && (allAllows.length > 0 || allBlocks.length > 0);
  const needVacation  = arEnabled && !!arMessage?.trim();

  const exts: string[] = [];
  if (needFileinto) exts.push('fileinto');
  if (needEnvelope) exts.push('envelope');
  if (needVacation)  exts.push('vacation');
  if (exts.length === 0) return '';

  const lines: string[] = [`require [${exts.map(e => `"${e}"`).join(', ')}];`, ''];

  if (spamFilterEnabled) {
    // Allow rules — whitelist bypasses all spam checks
    for (const p of allAllows) {
      lines.push(`if ${sieveEnvelopeTest(p)} {`, '  keep;', '  stop;', '}');
    }
    if (allAllows.length > 0) lines.push('');

    // Block rules — quarantine the message
    for (const p of allBlocks) {
      lines.push(`if ${sieveEnvelopeTest(p)} {`, '  fileinto "Quarantine";', '  stop;', '}');
    }
    if (allBlocks.length > 0) lines.push('');

    // SpamAssassin flag
    if (spamAction !== 'deliver') {
      lines.push('if header :contains "X-Spam-Flag" "YES" {');
      if (spamAction === 'quarantine') {
        lines.push('  fileinto "Quarantine";', '  stop;');
      } else {
        // tag — SA already rewrote subject, just keep
        lines.push('  keep;', '  stop;');
      }
      lines.push('}', '');
    }
  }

  if (needVacation) {
    lines.push(
      'vacation',
      '  :days 1',
      '  :subject "Auto-reply"',
      `  :from ${sieveStr(email)}`,
      `  ${sieveStr(arMessage)};`,
      ''
    );
  }

  return lines.join('\n');
}

async function writeSieve(mailboxId: number, email: string, script: string) {
  const [user, domain] = email.split('@') as [string, string];
  const maildirBase = `/var/mail/vhosts/${domain}/${user}`;
  const sievePath   = `${maildirBase}/.dovecot.sieve`;

  await execPromise(`sudo mkdir -p ${shellEscape(maildirBase)}`).catch(() => {});

  if (!script.trim()) {
    await execPromise(`sudo rm -f ${shellEscape(sievePath)}`).catch(() => {});
    return;
  }

  const temp = `/tmp/sieve_${mailboxId}.sieve`;
  await fs.writeFile(temp, script + '\n');
  await execPromise(`sudo mv ${shellEscape(temp)} ${shellEscape(sievePath)}`);
  await execPromise(`sudo chown vmail:vmail ${shellEscape(sievePath)}`);
  await execPromise(`sudo chmod 600 ${shellEscape(sievePath)}`);
  await execPromise(`sudo sievec ${shellEscape(sievePath)}`).catch(() => {});
}

async function ensureQuarantineMaildir(email: string) {
  const [user, domain] = email.split('@') as [string, string];
  const base = `/var/mail/vhosts/${domain}/${user}/.Quarantine`;
  for (const sub of ['cur', 'new', 'tmp']) {
    await execPromise(`sudo mkdir -p ${shellEscape(`${base}/${sub}`)}`).catch(() => {});
  }
  await execPromise(`sudo chown -R vmail:vmail ${shellEscape(base)}`).catch(() => {});
}

// ── SYNC_SPAM_RULES ────────────────────────────────────────────────────────────

async function handleSyncSpamRules(payload: any) {
  const { mailUserId } = payload as { mailUserId?: number };

  const mailboxRes = await client.query<{
    id: number; email: string; spam_filter_enabled: boolean;
    spam_score_threshold: number; spam_action: string;
  }>(`
    SELECT id, email, spam_filter_enabled, spam_score_threshold, spam_action
    FROM mail_users
    WHERE ($1::int IS NULL OR id = $1)
  `, [mailUserId ?? null]);

  const globalRes = await client.query<{ sender_pattern: string; access_type: string }>(
    'SELECT sender_pattern, access_type FROM mail_global_rules'
  );
  const globalAllows = globalRes.rows.filter(r => r.access_type === 'allow').map(r => r.sender_pattern);
  const globalBlocks = globalRes.rows.filter(r => r.access_type === 'block').map(r => r.sender_pattern);

  for (const mailbox of mailboxRes.rows) {
    try {
      const mbRes = await client.query<{ sender_pattern: string; access_type: string }>(
        'SELECT sender_pattern, access_type FROM mail_access_control WHERE mail_user_id = $1',
        [mailbox.id]
      );
      const mbAllows = mbRes.rows.filter(r => r.access_type === 'allow').map(r => r.sender_pattern);
      const mbBlocks = mbRes.rows.filter(r => r.access_type === 'block').map(r => r.sender_pattern);

      const arRes = await client.query<{ message: string; enabled: boolean }>(
        'SELECT message, enabled FROM mail_autoresponders WHERE mail_user_id = $1',
        [mailbox.id]
      );
      const ar = arRes.rows[0];

      const script = buildSieveScript({
        email: mailbox.email,
        spamFilterEnabled: mailbox.spam_filter_enabled,
        spamAction: mailbox.spam_action ?? 'quarantine',
        globalAllows, globalBlocks, mbAllows, mbBlocks,
        arEnabled:  ar?.enabled  ?? false,
        arMessage:  ar?.message  ?? '',
      });

      await writeSieve(mailbox.id, mailbox.email, script);

      if (mailbox.spam_filter_enabled) {
        await ensureQuarantineMaildir(mailbox.email);
      }

      console.log(`Spam rules synced for ${mailbox.email}`);
    } catch (err) {
      console.error(`Failed to sync spam rules for mailbox ${mailbox.id}:`, (err as Error).message);
    }
  }
}

// ── SCAN_QUARANTINE_FOLDERS ────────────────────────────────────────────────────

async function handleScanQuarantineFolders(payload: any) {
  const { mailUserId } = payload as { mailUserId?: number };

  const mailboxRes = await client.query<{ id: number; email: string }>(
    `SELECT id, email FROM mail_users WHERE ($1::int IS NULL OR id = $1) AND spam_filter_enabled = true`,
    [mailUserId ?? null]
  );

  let found = 0;

  for (const mailbox of mailboxRes.rows) {
    try {
      const [user, domain] = mailbox.email.split('@') as [string, string];
      const qBase = `/var/mail/vhosts/${domain}/${user}/.Quarantine`;

      for (const sub of ['new', 'cur']) {
        const dir = `${qBase}/${sub}`;

        let listing = '';
        try {
          const r = await execPromise(`sudo ls -1 ${shellEscape(dir)} 2>/dev/null`);
          listing = r.stdout.trim();
        } catch { continue; }
        if (!listing) continue;

        for (const filename of listing.split('\n').filter(Boolean)) {
          const filePath = `${dir}/${filename}`;

          const existing = await client.query(
            'SELECT id FROM mail_quarantine WHERE file_path = $1 AND released_at IS NULL',
            [filePath]
          );
          if ((existing.rowCount ?? 0) > 0) continue;

          let sender = '', subject = '', spamScore: number | null = null;
          try {
            const { stdout } = await execPromise(`sudo head -150 ${shellEscape(filePath)}`);
            const angleMatch = stdout.match(/^From:\s*.*?<([^>]+)>/mi);
            const plainMatch = stdout.match(/^From:\s*(\S+@\S+)/mi);
            sender = (angleMatch?.[1] ?? plainMatch?.[1] ?? '').trim();

            const subjectMatch = stdout.match(/^Subject:\s*(.+?)(?=\r?\n[^\s]|\r?\n\r?\n|$)/mis);
            if (subjectMatch) subject = subjectMatch[1]!.replace(/\r?\n\s+/g, ' ').trim();

            const scoreMatch = stdout.match(/^X-Spam-Score:\s*([\d.-]+)/mi)
              ?? stdout.match(/score=([\d.-]+)/i);
            if (scoreMatch) spamScore = parseFloat(scoreMatch[1]!);
          } catch { /* unreadable — still record it */ }

          await client.query(`
            INSERT INTO mail_quarantine (mail_user_id, sender, subject, spam_score, file_path)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING
          `, [mailbox.id, sender || 'unknown', subject || null, spamScore, filePath]);

          found++;
        }
      }
    } catch (err) {
      console.error(`Quarantine scan failed for mailbox ${mailbox.id}:`, (err as Error).message);
    }
  }

  if (found > 0) console.log(`Quarantine scan: recorded ${found} new emails`);
}

// ── UPDATE_AUTORESPONDER (updated to include spam rules) ───────────────────────

async function handleUpdateAutoresponder(payload: any) {
  const { email } = payload as { email: string };
  if (!email || !email.includes('@')) throw new Error('Valid email address required');

  // Find the mailbox id and delegate to handleSyncSpamRules, which reads all
  // current DB state (spam rules + autoresponder) and writes a combined script.
  const mbRes = await client.query<{ id: number }>(
    'SELECT id FROM mail_users WHERE email = $1', [email]
  );
  if (mbRes.rows.length === 0) {
    console.warn(`handleUpdateAutoresponder: mailbox not found for ${email}`);
    return;
  }
  await handleSyncSpamRules({ mailUserId: mbRes.rows[0]!.id });
  console.log(`Auto-responder updated for ${email}`);
}

async function handleReleaseQuarantine(payload: any) {
  const { id, filePath, recipient } = payload;
  if (!filePath || !recipient) throw new Error('filePath and recipient are required');

  try {
    const [user, domain] = recipient.split('@');
    const destDir = `/var/mail/vhosts/${domain}/${user}/new`;
    const fileName = path.basename(filePath);

    await execPromise(`sudo mkdir -p ${destDir}`);
    await execPromise(`sudo mv ${shellEscape(filePath)} ${shellEscape(destDir + '/' + fileName)}`);
    await execPromise(`sudo chown vmail:vmail ${shellEscape(destDir + '/' + fileName)}`);

    // Mark as released (keep for FP stats; purge job cleans up after 7 days)
    await client.query('UPDATE mail_quarantine SET released_at = NOW() WHERE id = $1', [id]);

    console.log(`Released quarantined email ${id} to ${recipient}.`);
  } catch (err) {
    console.error(`Failed to release quarantine for ${id}:`, err);
    throw err;
  }
}

function htmlEscape(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function handleSendSpamDigest(payload: any) {
  const { mailUserId } = payload;

  try {
    const userRes = await client.query(`
      SELECT mu.email, mu.id
      FROM mail_users mu
      WHERE ($1::int IS NULL OR mu.id = $1) AND mu.spam_digest_enabled = true
    `, [mailUserId ?? null]);

    for (const user of userRes.rows) {
      const qRes = await client.query(`
        SELECT id, sender, subject, spam_score, created_at
        FROM mail_quarantine
        WHERE mail_user_id = $1 AND released_at IS NULL AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
      `, [user.id]);

      if (qRes.rowCount === 0) continue;

      console.log(`Sending spam digest to ${user.email} with ${qRes.rowCount} items...`);

      const dashBase = `https://${process.env.DASHBOARD_DOMAIN}/client/spam`;
      const rows = qRes.rows.map((item: any) => {
        const score = Number(item.spam_score ?? 0).toFixed(1);
        const scoreColor = Number(score) >= 10 ? '#dc2626' : '#ea580c';
        const date = new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `
          <tr>
            <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:13px;color:#374151">${htmlEscape(item.sender)}</td>
            <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#374151">${htmlEscape(item.subject) || '<em style="color:#9ca3af">no subject</em>'}</td>
            <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;text-align:center">
              <span style="background:#fff7ed;color:${scoreColor};border:1px solid #fed7aa;border-radius:4px;padding:2px 6px;font-family:monospace;font-size:11px;font-weight:700">${score}</span>
            </td>
            <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#6b7280;white-space:nowrap">${date}</td>
            <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;white-space:nowrap">
              <a href="${dashBase}?release=${item.id}" style="background:#16a34a;color:#fff;text-decoration:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;margin-right:6px">Release</a>
              <a href="${dashBase}?delete=${item.id}"  style="background:#dc2626;color:#fff;text-decoration:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700">Delete</a>
            </td>
          </tr>`;
      }).join('');

      const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,sans-serif">
  <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:#ea580c;padding:24px 32px">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">Daily Spam Digest</h1>
      <p style="margin:4px 0 0;color:#fed7aa;font-size:14px">${htmlEscape(user.email)} — ${qRes.rowCount} email${qRes.rowCount === 1 ? '' : 's'} quarantined in the last 24 hours</p>
    </div>
    <div style="padding:24px 32px">
      <p style="margin:0 0 16px;color:#475569;font-size:14px">Review these emails and release any that were incorrectly flagged.</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:10px 16px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:1px solid #e2e8f0">From</th>
            <th style="padding:10px 16px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:1px solid #e2e8f0">Subject</th>
            <th style="padding:10px 16px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:1px solid #e2e8f0">Score</th>
            <th style="padding:10px 16px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:1px solid #e2e8f0">Time</th>
            <th style="padding:10px 16px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:1px solid #e2e8f0">Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Quarantined emails are automatically deleted after 30 days. <a href="${dashBase}" style="color:#ea580c">Manage spam settings →</a></p>
    </div>
  </div>
</body></html>`;

      const tempMail = `/tmp/digest_${user.id}.html`;
      await fs.writeFile(tempMail, htmlBody);
      await execPromise(`sudo mail -a "Content-Type: text/html" -s "Daily Spam Digest for ${shellEscape(user.email)}" ${shellEscape(user.email)} < ${shellEscape(tempMail)}`);
      await fs.rm(tempMail);
    }
  } catch (err) {
    console.error('Failed to send spam digest:', err);
    throw err;
  }
}

async function handlePurgeExpiredQuarantine() {
  const expired = await client.query(`
    SELECT id, file_path FROM mail_quarantine
    WHERE expires_at < NOW()
       OR (released_at IS NOT NULL AND released_at < NOW() - INTERVAL '7 days')
  `);

  for (const row of expired.rows) {
    if (row.file_path) {
      try {
        await execPromise(`sudo rm -f ${shellEscape(row.file_path)}`);
      } catch { /* file may already be gone */ }
    }
  }

  if (expired.rows.length > 0) {
    await client.query('DELETE FROM mail_quarantine WHERE id = ANY($1)', [expired.rows.map((r: any) => r.id)]);
    console.log(`Purged ${expired.rows.length} expired quarantine records`);
  }
}

async function handleScanMalware(payload: any, taskId: number) {
  const { username, userId } = payload;
  if (!username || !userId) throw new Error('Username and userId are required');

  const scanPath = `/home/${username}/public_html`;
  
  // 1. Create a scan record
  const scanRes = await client.query(
    'INSERT INTO malware_scans (user_id, scan_path) VALUES ($1, $2) RETURNING id',
    [userId, scanPath]
  );
  const scanId = scanRes.rows[0].id;

  try {
    // 2. Run clamdscan (using sudo to access user files if worker doesn't have permission)
    console.log(`Starting malware scan for ${username} at ${scanPath}...`);
    
    // clamdscan returns exit code 1 if virus found, 0 if clean, >1 if error
    let scanOutput = '';
    let infectionsFound = 0;
    
    try {
      const { stdout } = await execPromise(`sudo clamdscan --fdpass --infected --multiscan ${scanPath}`);
      scanOutput = stdout;
    } catch (err: any) {
      // If a virus is found, execPromise will throw because exit code is 1
      if (err.code === 1 && err.stdout) {
        scanOutput = err.stdout;
      } else {
        throw err;
      }
    }

    // Parse the output to count infections
    const match = scanOutput.match(/Infected files:\s+(\d+)/);
    if (match && match[1]) {
      infectionsFound = parseInt(match[1], 10);
    }

    // 3. Update the scan record
    await client.query(
      'UPDATE malware_scans SET status = $1, infections_found = $2, report = $3, completed_at = NOW() WHERE id = $4',
      ['completed', infectionsFound, scanOutput, scanId]
    );

    // Also update the task payload for the API
    await client.query(
      'UPDATE tasks SET payload = payload || $1 WHERE id = $2', 
      [JSON.stringify({ scanId, infectionsFound }), taskId]
    );

    console.log(`Malware scan completed for ${username}. Infections found: ${infectionsFound}`);
  } catch (err) {
    console.error(`Failed to scan malware for ${username}:`, err);
    await client.query(
      'UPDATE malware_scans SET status = $1, report = $2, completed_at = NOW() WHERE id = $3',
      ['failed', (err as Error).message, scanId]
    );
    throw err;
  }
}

async function handleCreateBackup(payload: any, taskId: number) {
  const { userId, username, backupId } = payload;
  if (!username || !userId || !backupId) throw new Error('username, userId, and backupId are required');

  const homeDir = `/home/${username}`;
  const backupFileName = `${username}_backup_${Date.now()}.tar.gz`;
  const backupDir = path.join(process.cwd(), 'backups');
  const backupPath = path.join(backupDir, backupFileName);

  try {
    console.log(`Starting backup for ${username}...`);
    await fs.mkdir(backupDir, { recursive: true });

    // 1. Dump MySQL Databases
    const dbRes = await client.query('SELECT db_name FROM databases WHERE user_id = $1', [userId]);
    const dumpFiles: string[] = [];

    if (dbRes.rows.length > 0) {
      const dbUser = process.env.DB_ADMIN_USER || 'superhost_worker';
      const dbPass = process.env.DB_ADMIN_PASS || 'worker_db_pass';
      
      for (const row of dbRes.rows) {
        const dumpPath = `/tmp/${row.db_name}.sql`;
        await execPromise(`mysqldump -u ${dbUser} -p'${dbPass}' ${row.db_name} > ${dumpPath}`);
        dumpFiles.push(dumpPath);
      }
    }

    // 2. Compress public_html and DB dumps
    const tarCommand = ['tar', '-czf', backupPath, '-C', homeDir, 'public_html'];
    if (dumpFiles.length > 0) {
      for(const dump of dumpFiles){
        tarCommand.push('-C', '/tmp', path.basename(dump));
      }
    }
    
    // We use bash to safely execute the constructed command
    await execPromise(tarCommand.join(' '));

    // 3. Clean up dumps
    for (const dump of dumpFiles) {
      await execPromise(`rm -f ${dump}`);
    }

    // 4. Get file size
    const stats = await fs.stat(backupPath);
    
    // 5. Update backup record
    await client.query(
      'UPDATE backups SET status = $1, file_path = $2, size_bytes = $3, completed_at = NOW() WHERE id = $4',
      ['completed', backupPath, stats.size, backupId]
    );

    console.log(`Backup completed for ${username}: ${backupPath}`);
  } catch (err) {
    console.error(`Failed to create backup for ${username}:`, err);
    await client.query(
      'UPDATE backups SET status = $1, completed_at = NOW() WHERE id = $2',
      ['failed', backupId]
    );
    throw err;
  }
}

async function handleRestoreBackup(payload: any, taskId: number) {
  const { userId, username, backupId } = payload;
  if (!username || !userId || !backupId) throw new Error('username, userId, and backupId are required');

  try {
    const backupRes = await client.query('SELECT file_path FROM backups WHERE id = $1 AND user_id = $2', [backupId, userId]);
    if (backupRes.rows.length === 0) throw new Error('Backup not found');
    
    const backupPath = backupRes.rows[0].file_path;
    const tempDir = `/tmp/restore_${Date.now()}`;
    const homeDir = `/home/${username}`;

    console.log(`Starting restore for ${username} from ${backupPath}...`);
    await fs.mkdir(tempDir, { recursive: true });

    // 1. Extract archive
    await execPromise(`tar -xzf ${backupPath} -C ${tempDir}`);

    // 2. Restore files (if public_html exists in the extracted archive)
    const extractedPublicHtml = path.join(tempDir, 'public_html');
    try {
      await fs.access(extractedPublicHtml);
      // Copy contents back
      await execPromise(`rsync -a ${extractedPublicHtml}/ ${homeDir}/public_html/`);
      await execPromise(`chown -R ${username}:${username} ${homeDir}/public_html/`);
    } catch(e) {
      console.log('No public_html directory found in backup, skipping file restore.');
    }

    // 3. Restore Databases
    const dbUser = process.env.DB_ADMIN_USER || 'superhost_worker';
    const dbPass = process.env.DB_ADMIN_PASS || 'worker_db_pass';

    const files = await fs.readdir(tempDir);
    for (const file of files) {
      if (file.endsWith('.sql')) {
        const dbName = file.replace('.sql', '');
        console.log(`Restoring database ${dbName}...`);
        // Note: the database must already exist or we need to create it. We assume it exists or the user can recreate it.
        // Or we just recreate the database:
        const connection = await mysql.createConnection({
          host: 'localhost',
          user: dbUser,
          password: dbPass,
        });
        try {
          await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        } finally {
          await connection.end();
        }

        await execPromise(`mysql -u ${dbUser} -p'${dbPass}' ${dbName} < ${path.join(tempDir, file)}`);
      }
    }

    // 4. Clean up
    await execPromise(`rm -rf ${tempDir}`);

    console.log(`Restore completed for ${username}.`);
  } catch (err) {
    console.error(`Failed to restore backup for ${username}:`, err);
    throw err;
  }
}

async function handleAddVirtualIp(payload: any) {
  const { ipAddress, interface: iface } = payload;
  if (!ipAddress || !iface) throw new Error('ipAddress and interface are required');

  try {
    // Add the IP to the network interface dynamically
    // In production, you would also persist this to /etc/network/interfaces or netplan
    await execPromise(`sudo ip addr add ${ipAddress}/32 dev ${iface.split(':')[0]} label ${iface}`);
    console.log(`Added virtual IP ${ipAddress} to interface ${iface}`);
  } catch (err: any) {
    if (!err.message.includes('File exists')) { // Ignore if IP is already assigned
      console.error(`Failed to add virtual IP ${ipAddress}:`, err);
      throw err;
    }
  }
}

async function handleRemoveVirtualIp(payload: any) {
  const { ipAddress, interface: iface } = payload;
  if (!ipAddress || !iface) throw new Error('ipAddress and interface are required');

  try {
    await execPromise(`sudo ip addr del ${ipAddress}/32 dev ${iface.split(':')[0]} label ${iface}`);
    console.log(`Removed virtual IP ${ipAddress} from interface ${iface}`);
  } catch (err: any) {
    if (!err.message.includes('Cannot assign requested address')) {
      console.error(`Failed to remove virtual IP ${ipAddress}:`, err);
      throw err;
    }
  }
}

async function handleAssignVirtualIp(payload: any) {
  const { domainName, ipAddress } = payload;
  if (!domainName) throw new Error('domainName is required');

  try {
    const configPath = `/etc/nginx/sites-available/${domainName}`;
    let config = await fs.readFile(configPath, 'utf8');

    // Replace default listen 80; with listen IP:80;
    if (ipAddress) {
      config = config.replace(/listen 80;/g, `listen ${ipAddress}:80;`);
      config = config.replace(/listen \[::\]:80;/g, ''); // Remove IPv6 for dedicated IPv4
    } else {
      // Revert to shared IP if unassigned
      config = config.replace(/listen .*:80;/g, `listen 80;`);
    }

    await fs.writeFile(configPath, config);
    await execPromise('nginx -t');
    await execPromise('systemctl reload nginx');
    
    console.log(`Updated Nginx config for ${domainName} with IP ${ipAddress || 'shared'}`);
  } catch (err) {
    console.error(`Failed to assign IP to ${domainName}:`, err);
    throw err;
  }
}

async function handleCheckNodeHealth(payload: any) {
  const { nodeId } = payload;
  const ipAddress = validateIpAddress(payload?.ipAddress);
  if (!nodeId) throw new Error('nodeId is required');

  try {
    // Use array-style exec to avoid shell injection — execFile would be better, but execPromise wraps exec
    // IP is validated to be a safe IPv4/IPv6 address
    const { stdout } = await execPromise(`ping -c 1 -W 2 ${shellEscape(ipAddress)}`);
    const status = stdout.includes('1 received') ? 'online' : 'offline';
    await client.query('UPDATE cluster_nodes SET status = $1, last_seen = NOW() WHERE id = $2', [status, nodeId]);
  } catch {
    await client.query('UPDATE cluster_nodes SET status = $1 WHERE id = $2', ['offline', nodeId]);
  }
}

async function handleGetMasterSshKey(taskId: number) {
  try {
    // Return only the PUBLIC key — never expose the private key
    const { stdout } = await execPromise('sudo cat /root/.ssh/id_ed25519.pub');
    await client.query(
      'UPDATE tasks SET payload = payload || $1 WHERE id = $2',
      [JSON.stringify({ result: stdout.trim() }), taskId]
    );
    console.log('Master SSH public key retrieved.');
  } catch (err) {
    console.error('Failed to get master SSH key:', err);
    throw err;
  }
}

// Known hosts file for cluster nodes — avoids disabling StrictHostKeyChecking
const CLUSTER_KNOWN_HOSTS = '/etc/superhost/cluster_known_hosts';

async function handleSyncClusterConfig(payload: any) {
  const ipAddress = validateIpAddress(payload?.ipAddress);

  // Verify this IP is a registered cluster node before syncing
  const nodeRes = await client.query(
    "SELECT id FROM cluster_nodes WHERE ip_address = $1 AND status != 'removed'",
    [ipAddress]
  );
  if (nodeRes.rows.length === 0) {
    throw new Error(`IP ${ipAddress} is not a registered cluster node`);
  }

  const sshOpts = `-o StrictHostKeyChecking=yes -o UserKnownHostsFile=${CLUSTER_KNOWN_HOSTS} -o BatchMode=yes`;

  try {
    console.log(`Starting cluster config sync for node ${ipAddress}...`);
    // 1. Push Nginx configurations via rsync with strict host key checking
    await execPromise(
      `sudo rsync -az -e ${shellEscape(`ssh ${sshOpts}`)} /etc/nginx/sites-available/ root@${shellEscape(ipAddress)}:/etc/nginx/sites-available/`
    );
    // 2. Reload Nginx on remote node via SSH
    await execPromise(
      `sudo ssh ${sshOpts} root@${shellEscape(ipAddress)} "systemctl reload nginx"`
    );

    console.log(`Successfully synchronized with node ${ipAddress}.`);
  } catch (err) {
    console.error(`Failed to sync with node ${ipAddress}:`, err);
    throw err;
  }
}

async function handleListFiles(payload: any, taskId: number) {
  const username = validateUsername(payload?.username);
  const baseDir = `/home/${username}/public_html`;

  // Resolve symlinks before checking containment — prevents symlink escape
  const absolutePath = await validatePath(payload?.path ?? '', baseDir);

  const files = await fs.readdir(absolutePath);
  const result = await Promise.all(files.map(async (file) => {
    const filePath = path.join(absolutePath, file);
    const fileStats = await fs.stat(filePath);
    return {
      name: file,
      isDirectory: fileStats.isDirectory(),
      size: fileStats.size,
      mtime: fileStats.mtime,
      permissions: (fileStats.mode & 0o777).toString(8),
    };
  }));
  await client.query(
    'UPDATE tasks SET payload = payload || $1 WHERE id = $2',
    [JSON.stringify({ result }), taskId]
  );
}

async function handleReadFile(payload: any, taskId: number) {
  const username = validateUsername(payload?.username);
  const baseDir = `/home/${username}/public_html`;
  const absolutePath = await validatePath(payload?.filePath ?? '', baseDir);

  const content = await fs.readFile(absolutePath, 'utf8');
  await client.query(
    'UPDATE tasks SET payload = payload || $1 WHERE id = $2',
    [JSON.stringify({ result: content }), taskId]
  );
}

async function handleWriteFile(payload: any) {
  const username = validateUsername(payload?.username);
  const baseDir = `/home/${username}/public_html`;
  const absolutePath = await validatePath(payload?.filePath ?? '', baseDir);

  const { content } = payload;
  if (typeof content !== 'string') throw new Error('Content must be a string');
  if (content.length > 10 * 1024 * 1024) throw new Error('File content too large (max 10 MB)');

  await fs.writeFile(absolutePath, content, { mode: 0o644 });
  await execPromise(`sudo chown ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(absolutePath)}`);
}

async function handleDeleteFile(payload: any) {
  const username = validateUsername(payload?.username);
  const baseDir = `/home/${username}/public_html`;
  const absolutePath = await validatePath(payload?.filePath ?? '', baseDir);

  await fs.rm(absolutePath, { recursive: true, force: true });
}

async function handleZipFiles(payload: any) {
  const username = validateUsername(payload?.username);
  const baseDir = `/home/${username}/public_html`;
  const dirPath = payload?.basePath
    ? await validatePath(payload.basePath, baseDir)
    : baseDir;

  // Validate zip name: alphanumeric, hyphens, underscores, dots only
  const zipName = payload?.zipName;
  if (!zipName || !/^[a-zA-Z0-9_\-\.]{1,255}\.zip$/.test(zipName)) {
    throw new Error('Invalid zip file name');
  }

  // Validate each file in the list
  const files: string[] = Array.isArray(payload?.files) ? payload.files : [];
  const safeFiles = await Promise.all(
    files.map(f => validatePath(f, dirPath))
  );

  // Build command with properly escaped arguments
  const fileArgs = safeFiles.map(f => shellEscape(path.relative(dirPath, f))).join(' ');
  await execPromise(`cd ${shellEscape(dirPath)} && zip -r ${shellEscape(zipName)} ${fileArgs}`);
  await execPromise(`sudo chown ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(path.join(dirPath, zipName))}`);
}

async function handleUnzipFile(payload: any) {
  const username = validateUsername(payload?.username);
  const baseDir = `/home/${username}/public_html`;

  // Validate zip file is within the user's directory
  const zipPath = await validatePath(payload?.zipName ?? '', baseDir);
  const targetPath = payload?.targetPath
    ? await validatePath(payload.targetPath, baseDir)
    : baseDir;

  await execPromise(`cd ${shellEscape(baseDir)} && unzip -o ${shellEscape(zipPath)} -d ${shellEscape(targetPath)}`);
  await execPromise(`sudo chown -R ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(targetPath)}`);
}

async function start() {
  await client.connect();
  console.log('Worker connected to database.');

  // --- Notification Helpers ---
  const sendNotification = async (message: string) => {
    try {
      const res = await client.query('SELECT * FROM notification_settings WHERE id = 1');
      const settings = res.rows[0];
      if (!settings || !settings.is_enabled) return;

      if (settings.slack_webhook_url) {
        try {
          // Validate webhook URL against allowed prefixes (SSRF prevention)
          const safeUrl = validateWebhookUrl(settings.slack_webhook_url);
          await axios.post(safeUrl, { text: message }, { timeout: 5000 });
        } catch (urlErr) {
          console.error('Invalid Slack webhook URL:', urlErr instanceof Error ? urlErr.message : urlErr);
        }
      }

      if (settings.telegram_bot_token && settings.telegram_chat_id) {
        // Telegram bot token: validate format (digits:alphanumeric)
        if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(settings.telegram_bot_token)) {
          console.error('Invalid Telegram bot token format');
        } else {
          const url = `https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`;
          await axios.post(url, { chat_id: settings.telegram_chat_id, text: message }, { timeout: 5000 });
        }
      }
    } catch (err) {
      console.error('Failed to send notification:', err instanceof Error ? err.message : err);
    }
  };

  // --- Background Metrics Collection ---
  const collectMetrics = async () => {
    try {
      // 1. CPU Usage
      const { stdout: cpuOut } = await execPromise("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'");
      const cpu = parseFloat(cpuOut.trim()) || 0;

      // 2. RAM Usage
      const { stdout: ramOut } = await execPromise("free -m | grep Mem | awk '{print $3}'");
      const ramTotalOut = await execPromise("free -m | grep Mem | awk '{print $2}'");
      const ram = parseInt(ramOut.trim()) || 0;
      const ramTotal = parseInt(ramTotalOut.stdout.trim()) || 1;
      const ramPercent = Math.round((ram / ramTotal) * 100);

      // 3. Disk Usage
      const { stdout: diskOut } = await execPromise("df -h / | tail -1 | awk '{print $5}' | sed 's/%//'");
      const diskPercent = parseInt(diskOut.trim()) || 0;

      // 4. Network Throughput
      const { stdout: netOut } = await execPromise("cat /proc/net/dev | grep eth0 | awk '{print $2 \" \" $10}'");
      const [rx, tx] = netOut.trim().split(' ').map(n => Math.round(parseInt(n) / (1024 * 1024)));

      await client.query(
        'INSERT INTO server_metrics (cpu_percent, ram_used_mb, network_rx_mbps, network_tx_mbps) VALUES ($1, $2, $3, $4)',
        [cpu, ram, rx || 0, tx || 0]
      );
      
      // --- Alert Checks ---
      const setRes = await client.query('SELECT * FROM notification_settings WHERE id = 1');
      const settings = setRes.rows[0];

      if (settings && settings.is_enabled) {
        if (cpu > settings.cpu_threshold) {
          const msg = `⚠️ CRITICAL: High CPU Usage detected: ${cpu.toFixed(1)}% (Threshold: ${settings.cpu_threshold}%)`;
          await client.query('INSERT INTO alert_log (level, service, message) VALUES ($1, $2, $3)', ['critical', 'cpu', msg]);
          await sendNotification(msg);
        }
        if (ramPercent > settings.ram_threshold) {
          const msg = `⚠️ CRITICAL: High RAM Usage detected: ${ramPercent}% (Threshold: ${settings.ram_threshold}%)`;
          await client.query('INSERT INTO alert_log (level, service, message) VALUES ($1, $2, $3)', ['critical', 'ram', msg]);
          await sendNotification(msg);
        }
        if (diskPercent > settings.disk_threshold) {
          const msg = `⚠️ CRITICAL: High Disk Usage detected: ${diskPercent}% (Threshold: ${settings.disk_threshold}%)`;
          await client.query('INSERT INTO alert_log (level, service, message) VALUES ($1, $2, $3)', ['critical', 'disk', msg]);
          await sendNotification(msg);
        }
      }

      await client.query("DELETE FROM server_metrics WHERE recorded_at < NOW() - INTERVAL '7 days'");
    } catch (err) {
      console.error('Failed to collect background metrics:', err);
    }
  };

  // --- Traffic Stats Collection ---
  const collectTrafficStats = async () => {
    try {
      console.log('Analyzing Nginx access logs for traffic analytics...');
      // We parse /var/log/nginx/*.access.log and sum up bytes_sent
      // In a real system, we'd use a dedicated log parser or read from nginx directly
      const { stdout } = await execPromise("sudo du -b /var/log/nginx/*.access.log | awk '{print $1 \" \" $2}'");
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        const [bytes, logPath] = line.split(' ');
        if (!logPath) continue;
        const domainMatch = logPath.match(/\/var\/log\/nginx\/(.+)\.access\.log/);
        if (domainMatch) {
          const domainName = domainMatch[1];
          await client.query(`
            INSERT INTO domain_traffic_stats (domain_name, bytes_sent, recorded_date)
            VALUES ($1, $2, CURRENT_DATE)
            ON CONFLICT (domain_name, recorded_date) 
            DO UPDATE SET bytes_sent = EXCLUDED.bytes_sent
          `, [domainName, bytes]);
        }
      }
    } catch (err) {
      console.error('Failed to collect traffic stats:', err);
    }
  };

  // Schedules — wrap in try/catch so a single failure doesn't stop future runs
  setInterval(async () => {
    try { await collectMetrics(); }
    catch (err) { console.error('collectMetrics error:', err instanceof Error ? err.message : err); }
  }, 5 * 60 * 1000);

  setInterval(async () => {
    try { await collectTrafficStats(); }
    catch (err) { console.error('collectTrafficStats error:', err instanceof Error ? err.message : err); }
  }, 15 * 60 * 1000);

  // Scan quarantine folders every 5 minutes to populate mail_quarantine table
  setInterval(async () => {
    try { await handleScanQuarantineFolders({}); }
    catch (err) { console.error('Quarantine scan error:', err instanceof Error ? err.message : err); }
  }, 5 * 60 * 1000);

  collectMetrics().catch(err => console.error('Initial collectMetrics error:', err));
  collectTrafficStats().catch(err => console.error('Initial collectTrafficStats error:', err));

  // --- System Security Log Monitor (SSH Brute Force Protection) ---
  const startAuthLogWatcher = () => {
    console.log('Starting system security log monitor...');
    // spawn is imported at the top of the file
    const tail = spawn('sudo', ['tail', '-f', '-n', '0', '/var/log/auth.log']);

    tail.stdout.on('data', async (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const match = line.match(/Failed password for (?:invalid user )?(\S+) from ([\d\.]+) port/);
        if (match) {
          const rawIp = match[2] ?? '';
          // Only act on valid IPs — skip if not parseable
          try {
            const ipAddress = validateIpAddress(rawIp);
            const checkRes = await client.query(
              "SELECT count(*) FROM login_attempts WHERE ip_address = $1 AND success = false AND created_at > NOW() - INTERVAL '15 minutes'",
              [ipAddress]
            );
            if (parseInt(checkRes.rows[0]?.count ?? '0') >= 5) {
              console.warn(`SECURITY: Brute force detected from ${ipAddress}. Blocking...`);
              await handleFirewallBlockIp({ ipAddress });
              await sendNotification(`🛡️ IP blocked due to brute force: ${ipAddress}`);
            }
          } catch (e) {
            console.error('Failed to process security log entry:', e instanceof Error ? e.message : e);
          }
        }
      }
    });

    tail.on('error', (err: Error) => {
      console.error('Auth log watcher error:', err.message);
    });

    tail.on('close', (code: number) => {
      console.warn(`Auth log watcher exited (code ${code}). Restarting in 10s...`);
      setTimeout(startAuthLogWatcher, 10_000);
    });
  };

  startAuthLogWatcher();

  // --- Task Listener ---
  await client.query('LISTEN new_task');

  client.on('notification', async (msg) => {
    if (msg.channel === 'new_task' && msg.payload) {
      try {
        const task = JSON.parse(msg.payload) as Task;
        // Don't await — process tasks concurrently; locking prevents double-processing
        handleTask(task).catch(err =>
          console.error(`Unhandled task error for ${task.command}:`, err instanceof Error ? err.message : err)
        );
      } catch (parseErr) {
        console.error('Failed to parse task notification payload:', parseErr);
      }
    }
  });

  // Pick up any tasks that were pending before this worker started
  const res = await client.query('SELECT * FROM tasks WHERE status = \'pending\' ORDER BY created_at ASC');
  for (const task of res.rows) {
    handleTask(task).catch(err =>
      console.error(`Unhandled startup task error for ${task.command}:`, err instanceof Error ? err.message : err)
    );
  }

  // Polling fallback — catches tasks missed if LISTEN/NOTIFY is delayed or dropped
  setInterval(async () => {
    try {
      const pendingRes = await client.query("SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10");
      for (const task of pendingRes.rows as Task[]) {
        handleTask(task).catch(err =>
          console.error(`Unhandled poll task error for ${task.command}:`, err instanceof Error ? err.message : err)
        );
      }
    } catch (pollErr) {
      console.error('Task poll error:', pollErr instanceof Error ? pollErr.message : pollErr);
    }
  }, 5000);
}

// --- Missing Handlers ---

async function handleGetSystemStats(taskId: number) {
  try {
    const { stdout: uptime } = await execPromise("uptime -p");
    const { stdout: os } = await execPromise("lsb_release -ds || cat /etc/os-release | grep PRETTY_NAME | cut -d'\"' -f2");
    const { stdout: kernel } = await execPromise("uname -r");
    const { stdout: ip } = await execPromise("hostname -I | awk '{print $1}'");
    const { stdout: loadAvg } = await execPromise("cat /proc/loadavg | awk '{print $1 \" \" $2 \" \" $3}'");
    
    const result = { 
      uptime: uptime.trim(), 
      os: os.trim(), 
      kernel: kernel.trim(), 
      ip: ip.trim(), 
      loadAvg: loadAvg.trim() 
    };
    
    await client.query(
      'UPDATE tasks SET status = $1, payload = payload || $2, updated_at = NOW() WHERE id = $3',
      ['completed', JSON.stringify({ result }), taskId]
    );
  } catch (err) {
    console.error('Failed to get system stats:', err);
    throw err;
  }
}

async function handleFirewallBlockIp(payload: any) {
  const ipAddress = validateIpAddress(payload?.ipAddress);
  await execPromise(`sudo ufw deny from ${shellEscape(ipAddress)}`);
  console.log(`Firewall blocked IP: ${ipAddress}`);
}

async function handleFirewallUnblockIp(payload: any) {
  const ipAddress = validateIpAddress(payload?.ipAddress);
  await execPromise(`sudo ufw delete deny from ${shellEscape(ipAddress)}`);
  console.log(`Firewall unblocked IP: ${ipAddress}`);
}

async function handleGetServicesStatus(taskId: number) {
  // Full list of services to probe — skips silently if not installed
  const candidates = [
    'nginx', 'apache2',
    'php8.1-fpm', 'php8.2-fpm', 'php8.3-fpm', 'php8.4-fpm',
    'mysql', 'mariadb', 'postgresql',
    'postfix', 'dovecot', 'opendkim', 'spamassassin',
    'bind9', 'proftpd', 'vsftpd',
    'redis', 'memcached',
    'clamav-daemon', 'fail2ban', 'ufw',
    'superhost-api', 'superhost-worker',
  ];

  const result: { name: string; status: string; autostart: boolean }[] = [];

  for (const svc of candidates) {
    try {
      const { stdout: activeOut } = await execPromise(
        `systemctl is-active ${shellEscape(svc)} 2>/dev/null || true`
      );
      const activeStr = activeOut.trim();
      if (activeStr === 'not-found' || activeStr === '') continue;

      const status = activeStr === 'active' ? 'active'
        : activeStr === 'failed' ? 'failed'
        : 'inactive';

      let autostart = false;
      try {
        const { stdout: enabledOut } = await execPromise(
          `systemctl is-enabled ${shellEscape(svc)} 2>/dev/null || true`
        );
        autostart = enabledOut.trim() === 'enabled';
      } catch { /* not enabled */ }

      result.push({ name: svc, status, autostart });
    } catch { /* service not installed on this system */ }
  }

  await client.query(
    'UPDATE tasks SET status = $1, payload = payload || $2, updated_at = NOW() WHERE id = $3',
    ['completed', JSON.stringify({ result }), taskId]
  );
}

async function handleManageService(taskId: number, payload: any) {
  const service = validateServiceName(payload?.service);
  const action  = validateServiceAction(payload?.action);

  // If restarting/stopping the worker itself, mark the task done FIRST —
  // the process will die before the outer handler can write 'completed'.
  const selfAffecting =
    service === 'superhost-worker' &&
    (action === 'restart' || action === 'stop');

  if (selfAffecting) {
    await client.query(
      "UPDATE tasks SET status = 'completed', payload = payload || $1, updated_at = NOW() WHERE id = $2",
      [JSON.stringify({ message: `${service} ${action} initiated` }), taskId]
    );
  }

  await execPromise(`systemctl ${action} ${shellEscape(service)}`);
  console.log(`Service ${service} ${action} executed.`);
}

async function handleGetBindStatus(taskId: number) {
  const isActive  = await execPromise('systemctl is-active bind9').then(r => r.stdout.trim() === 'active').catch(() => false);
  // bind9 is an alias for named.service — is-enabled returns 'alias'; treat that as enabled
  const isEnabled = await execPromise('systemctl is-enabled bind9').then(r => ['enabled','alias'].includes(r.stdout.trim())).catch(() => false);
  let version = '';
  try {
    const { stdout } = await execPromise('named -v 2>&1 || true');
    version = stdout.trim().split('\n')[0] ?? '';
  } catch { /* bind not installed */ }

  // Read zone names from both managed file and local config
  let zones: string[] = [];
  try {
    // -h suppresses filename prefix when searching multiple files
    const { stdout } = await execPromise(
      "grep -hoP '(?<=zone \")[^\"]+' /etc/bind/named.conf.zones /etc/bind/named.conf.local 2>/dev/null || true"
    );
    zones = [...new Set(stdout.trim().split('\n').filter(Boolean))];
  } catch { /* ignore */ }

  await client.query(
    'UPDATE tasks SET status=$1, payload=payload||$2, updated_at=NOW() WHERE id=$3',
    ['completed', JSON.stringify({ isActive, isEnabled, version, zones }), taskId]
  );
}

async function handleManageBind(taskId: number, payload: any) {
  const allowed = ['start', 'stop', 'restart', 'reload'];
  const action = payload?.action as string;
  if (!allowed.includes(action)) throw new Error(`Invalid bind action: ${action}`);

  await execPromise(`systemctl ${shellEscape(action)} bind9`);
  const isActive = await execPromise('systemctl is-active bind9').then(r => r.stdout.trim() === 'active').catch(() => false);
  await client.query(
    'UPDATE tasks SET status=$1, payload=payload||$2, updated_at=NOW() WHERE id=$3',
    ['completed', JSON.stringify({ action, isActive }), taskId]
  );
}

async function handleGetUpdates(taskId: number) {
   const { stdout } = await execPromise("apt list --upgradable");
   const updates = stdout.split('\n').filter(l => l.includes('/')).length;
   await client.query(
      'UPDATE tasks SET status = $1, payload = payload || $2, updated_at = NOW() WHERE id = $3',
      ['completed', JSON.stringify({ count: updates }), taskId]
   );
}

async function handleInstallUpdates(taskId: number) {
   await execPromise("sudo apt-get update && sudo apt-get upgrade -y");
   await client.query('UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', taskId]);
}

async function handleManageAutoUpdates(payload: any) {
   const { enabled } = payload;
   if (enabled) {
      await execPromise("sudo apt-get install unattended-upgrades -y");
   } else {
      await execPromise("sudo apt-get remove unattended-upgrades -y");
   }
}

// ── System action handlers ────────────────────────────────────────────────────

async function handleRebootServer(taskId: number) {
  // Mark the task completed BEFORE rebooting — the process dies with the system
  await client.query(
    "UPDATE tasks SET status = 'completed', payload = payload || $1, updated_at = NOW() WHERE id = $2",
    [JSON.stringify({ message: 'Server reboot initiated' }), taskId]
  );
  console.warn('[REBOOT] Server reboot requested — initiating shutdown now.');
  // Non-blocking: let the task mark finish before the kernel tears down processes
  setTimeout(() => {
    execPromise('sudo shutdown -r now "Reboot requested via Superhost admin panel"').catch(() => {});
  }, 500);
}

async function handleRestartWebServices() {
  // Restart Nginx
  await execPromise('sudo systemctl restart nginx');
  console.log('Nginx restarted.');

  // Restart every installed PHP-FPM version (non-fatal if a version is missing)
  const phpVersions = ['8.1', '8.2', '8.3', '8.4'];
  for (const v of phpVersions) {
    const svc = `php${v}-fpm`;
    try {
      const { stdout } = await execPromise(`systemctl is-active ${shellEscape(svc)} 2>/dev/null || true`);
      if (stdout.trim() === 'active' || stdout.trim() === 'inactive') {
        await execPromise(`sudo systemctl restart ${shellEscape(svc)}`);
        console.log(`${svc} restarted.`);
      }
    } catch {
      // Service not installed — skip
    }
  }
}

async function handleExecCommand(payload: any, taskId: number) {
  const { command } = payload as { command?: string };
  if (!command || typeof command !== 'string' || !command.trim()) {
    throw new Error('command is required');
  }
  console.log(`[ROOT TERMINAL] Executing: ${command}`);

  try {
    const { stdout, stderr } = await execPromise(command, { timeout: 30_000 });
    const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
    await client.query(
      'UPDATE tasks SET payload = payload || $1 WHERE id = $2',
      [JSON.stringify({ result: output, exitCode: 0 }), taskId]
    );
  } catch (err: any) {
    // The command ran but returned a non-zero exit — treat as completed, not failed
    const output = (err.stdout ?? '') + (err.stderr ? `\nSTDERR:\n${err.stderr}` : '');
    await client.query(
      'UPDATE tasks SET payload = payload || $1 WHERE id = $2',
      [JSON.stringify({ result: output || err.message, exitCode: err.code ?? 1 }), taskId]
    );
  }
}

async function handleAdminBackup(taskId: number) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `/root/superhost-backups/config_${ts}.tar.gz`;

  await execPromise('sudo mkdir -p /root/superhost-backups');

  // Archive key config directories — skip those that don't exist
  const dirs = ['/etc/nginx', '/etc/postfix', '/etc/dovecot', '/etc/bind', '/etc/opendkim'];
  const existingDirs: string[] = [];
  for (const d of dirs) {
    try {
      await execPromise(`sudo test -d ${shellEscape(d)}`);
      existingDirs.push(d);
    } catch { /* not installed — skip */ }
  }

  if (existingDirs.length === 0) throw new Error('No config directories found to back up');

  await execPromise(`sudo tar -czf ${shellEscape(backupPath)} ${existingDirs.map(shellEscape).join(' ')}`);
  const { stdout: sizeOut } = await execPromise(`sudo stat -c '%s' ${shellEscape(backupPath)}`);
  const sizeBytes = parseInt(sizeOut.trim(), 10);

  await client.query(
    'UPDATE tasks SET payload = payload || $1 WHERE id = $2',
    [JSON.stringify({ path: backupPath, sizeBytes, dirs: existingDirs }), taskId]
  );
  console.log(`Admin config backup created: ${backupPath} (${sizeBytes} bytes)`);
}

start().catch(console.error);
