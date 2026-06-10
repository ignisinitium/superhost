import { Client } from 'pg';
import dotenv from 'dotenv';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import { validateUsername, validateDomainName, validateIpAddress, validatePort, validateProtocol, validateRuleNumber, validateServiceName, validateServiceAction, validatePm2Action, validateBranchName, validateRepoUrl, validateSignal, validatePid, validatePath, validateEmailLocalPart, validateMysqlIdentifier, validateInterfaceName, validateWebhookUrl, validateCronField, validateCronCommand, validateLineCount, validatePhpVersion, validateDnsType, redactPayload, shellEscape, } from './sanitize.js';
const execPromise = promisify(exec);
// execFile runs a binary directly with an argument array (no shell), so values
// can never be interpreted as shell metacharacters. Prefer this over execPromise
// whenever any argument is user-controlled.
const execFilePromise = promisify(execFile);
dotenv.config();
// Fail loudly if required env vars are missing — never fall back to hardcoded credentials
const REQUIRED_ENV = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD'];
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
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Task timed out after ${ms / 1000}s: ${label}`)), ms)),
    ]);
}
async function handleTask(task) {
    // Redact sensitive fields before logging
    console.log(`Processing task: ${task.command}`, redactPayload(task.payload));
    try {
        // Optimistic lock: only proceed if we successfully claim the task from 'pending' state.
        // In a multi-worker setup, only the first worker to execute this UPDATE will get rows back.
        const lockRes = await client.query("UPDATE tasks SET status = 'processing', started_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id", [task.id]);
        if (lockRes.rowCount === 0) {
            // Another worker already claimed this task — skip it
            console.log(`Task ${task.id} already claimed by another worker. Skipping.`);
            return;
        }
        // Scrub secrets (SSH creds, passwords, tokens) from the persisted payload
        // now that we hold the in-memory copy. Tasks live in the DB indefinitely and
        // are readable by any admin via GET /api/tasks/:id, so secrets must not
        // remain at rest. Handlers still use the in-memory task.payload below.
        if (task.payload && typeof task.payload === 'object') {
            const scrubbed = redactPayload(task.payload);
            await client.query('UPDATE tasks SET payload = $1 WHERE id = $2', [scrubbed, task.id])
                .catch(() => { });
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
            case 'TOGGLE_SSH_ACCESS':
                await handleToggleSshAccess(task.payload);
                break;
            case 'SET_LINUX_PASSWORD':
                await handleSetLinuxPassword(task.payload);
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
            case 'SUSPEND_ACCOUNT':
                await handleSuspendAccount(task.payload);
                break;
            case 'UNSUSPEND_ACCOUNT':
                await handleUnsuspendAccount(task.payload);
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
            case 'CONFIGURE_MAIL_RELAY':
                await handleConfigureMailRelay();
                break;
            case 'SCAN_RELAY_QUARANTINE':
                await handleScanRelayQuarantine();
                break;
            case 'RELEASE_RELAY_QUARANTINE':
                await handleReleaseRelayQuarantine(task.payload);
                break;
            case 'DELETE_RELAY_QUARANTINE':
                await handleDeleteRelayQuarantine(task.payload);
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
            case 'REFRESH_MAIL_STATS':
                await handleRefreshMailStats();
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
            case 'DELETE_QUARANTINE_FILE':
                await handleDeleteQuarantineFile(task.payload);
                break;
            case 'LEARN_SPAM':
                await handleLearnSpam(task.payload);
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
            case 'TEST_SSH_CONNECTION':
                await handleTestSshConnection(task.id, task.payload);
                break;
            case 'DISCOVER_CWP':
                await handleDiscoverCwp(task.payload);
                break;
            case 'MIGRATE_CWP':
                await handleMigrateCwp(task.payload);
                break;
            case 'MIGRATE_SITE':
                await handleMigrateSite(task.payload);
                break;
            default:
                throw new Error(`Unknown command: ${task.command}`);
        }
        await client.query("UPDATE tasks SET status = 'completed', updated_at = NOW() WHERE id = $1", [task.id]);
        console.log(`Task ${task.id} completed.`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Task ${task.id} (${task.command}) failed:`, message);
        await client.query("UPDATE tasks SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2", [message, task.id]);
    }
}
async function handleCreateUser(payload) {
    const username = validateUsername(payload?.username);
    try {
        // Check if user already exists (safe: no shell interpolation)
        // Default shell is nologin — SSH access is explicitly enabled via TOGGLE_SSH_ACCESS
        await execPromise(`id -u ${shellEscape(username)}`).catch(async () => {
            await execPromise(`sudo useradd -m -s /usr/sbin/nologin ${shellEscape(username)}`);
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
            if (detected && /^[78]\.\d{1,2}$/.test(detected))
                phpVersion = detected;
        }
        catch {
            // Default to 8.3 if detection fails
        }
        // ── MariaDB database ─────────────────────────────────────────────────────
        const dbName = validateMysqlIdentifier(`${username}_db`);
        const dbUser = dbName;
        const dbPassword = crypto.randomBytes(24).toString('base64url');
        await handleCreateDatabase({ dbName, dbUser, dbPassword });
        // Track in PostgreSQL so the dashboard can display it; also fetch resource limits
        const userRow = await client.query(`
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
            await client.query(`INSERT INTO databases (user_id, db_name, db_user)
         VALUES ($1, $2, $3) ON CONFLICT (db_name) DO NOTHING`, [limits.id, dbName, dbUser]);
        }
        // ── .env file ────────────────────────────────────────────────────────────
        const serverIp = process.env.SERVER_IP ?? '';
        const masterDomain = process.env.MASTER_DOMAIN ?? '';
        const smtpHost = process.env.SMTP_HOST ?? `mail.${masterDomain}`;
        const fmtLimit = (v) => (v === -1 || v == null) ? 'unlimited' : String(v);
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
        const pyver = (await execPromise('python3 --version').catch(() => ({ stdout: 'unavailable' }))).stdout.trim();
        const phpver = phpVersion;
        const fmtMd = (v) => (v === -1 || v == null) ? '∞ Unlimited' : String(v);
        const fmtBool = (v) => v ? 'Yes' : 'No';
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
        if (!masterDomain)
            throw new Error('MASTER_DOMAIN environment variable is not set');
        await handleCreateDomain({
            domainName: `${username}.${masterDomain}`,
            username,
            phpVersion,
            docRoot: `/home/${username}/public_html`,
        });
        console.log(`Linux user ${username} created with automatic staging subdomain.`);
    }
    catch (err) {
        console.error(`Failed to create user ${username}:`, err);
        throw err;
    }
}
async function handleSetLinuxPassword(payload) {
    const username = validateUsername(payload?.username);
    const password = payload?.password;
    if (!password)
        throw new Error('password is required');
    // chpasswd reads "username:password" from stdin — no shell interpolation of the password
    const { exec } = await import('child_process');
    await new Promise((resolve, reject) => {
        const proc = exec(`sudo chpasswd`, (err) => err ? reject(err) : resolve());
        proc.stdin.write(`${username}:${password}\n`);
        proc.stdin.end();
    });
    console.log(`Linux password updated for ${username}`);
}
async function handleToggleSshAccess(payload) {
    const username = validateUsername(payload?.username);
    const enabled = payload?.enabled === true;
    const shell = enabled ? '/bin/bash' : '/usr/sbin/nologin';
    await execPromise(`sudo usermod -s ${shellEscape(shell)} ${shellEscape(username)}`);
    console.log(`SSH access ${enabled ? 'enabled' : 'disabled'} for ${username}`);
}
async function handleArchiveAndDeleteUser(payload) {
    const { userId } = payload;
    if (!userId)
        throw new Error('userId is required');
    const userRow = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRow.rows.length === 0)
        throw new Error(`User ${userId} not found`);
    const user = userRow.rows[0];
    const username = validateUsername(user.username);
    // Collect full snapshot for restore
    const domainsRes = await client.query('SELECT * FROM domains WHERE user_id = $1', [userId]);
    const zonesRes = await client.query('SELECT * FROM dns_zones WHERE user_id = $1', [userId]);
    const dnsZones = [];
    for (const zone of zonesRes.rows) {
        const recordsRes = await client.query('SELECT * FROM dns_records WHERE zone_id = $1', [zone.id]);
        dnsZones.push({ ...zone, records: recordsRes.rows });
    }
    const dbsRes = await client.query('SELECT * FROM databases WHERE user_id = $1', [userId]);
    const mailRes = await client.query('SELECT * FROM mail_users WHERE user_id = $1', [userId]);
    const appsRes = await client.query('SELECT * FROM user_apps WHERE user_id = $1', [userId]);
    const snapshot = {
        user, domains: domainsRes.rows, dns_zones: dnsZones,
        databases: dbsRes.rows, mail_users: mailRes.rows, user_apps: appsRes.rows,
    };
    // Build archive in staging dir
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archiveDir = '/var/superhost/archives';
    const archivePath = `${archiveDir}/${username}_${timestamp}.tar.gz`;
    const stagingDir = `/tmp/superhost_archive_${username}_${Date.now()}`;
    await execPromise(`sudo mkdir -p ${shellEscape(archiveDir)}`);
    await fs.mkdir(`${stagingDir}/databases`, { recursive: true });
    await fs.mkdir(`${stagingDir}/metadata`, { recursive: true });
    await fs.mkdir(`${stagingDir}/home`, { recursive: true });
    // Dump each MariaDB database
    const dbAdminUser = process.env.DB_ADMIN_USER ?? 'superhost_worker';
    const dbAdminPass = process.env.DB_ADMIN_PASS ?? 'worker_db_pass';
    for (const db of dbsRes.rows) {
        const safeDb = validateMysqlIdentifier(db.db_name);
        const dumpPath = `${stagingDir}/databases/${safeDb}.sql`;
        await execPromise(`mysqldump -u ${shellEscape(dbAdminUser)} -p${shellEscape(dbAdminPass)} ${shellEscape(safeDb)} > ${shellEscape(dumpPath)}`).catch(err => console.warn(`DB dump failed for ${safeDb}:`, err));
    }
    // Write full snapshot JSON
    await fs.writeFile(`${stagingDir}/metadata/snapshot.json`, JSON.stringify(snapshot, null, 2));
    // Copy home directory
    await execPromise(`sudo cp -a /home/${shellEscape(username)}/. ${shellEscape(stagingDir)}/home/`).catch(() => { });
    // Create gzip archive
    await execPromise(`sudo tar -czf ${shellEscape(archivePath)} -C ${shellEscape(stagingDir)} .`);
    const { stdout: sizeOut } = await execPromise(`sudo du -sb ${shellEscape(archivePath)}`);
    const archiveSize = parseInt(sizeOut.split('\t')[0] ?? '0', 10);
    // Record deletion
    await client.query(`INSERT INTO deleted_users (username, email, original_user_id, archive_path, archive_size_bytes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`, [username, user.email, userId, archivePath, archiveSize, JSON.stringify(snapshot)]);
    // Stop PM2 apps
    for (const app of appsRes.rows) {
        await execPromise(`sudo -u ${shellEscape(username)} pm2 delete app_${app.id}`).catch(() => { });
    }
    await execPromise(`sudo -u ${shellEscape(username)} pm2 save --force`).catch(() => { });
    // Remove nginx vhosts for all domains
    for (const domain of domainsRes.rows) {
        const dn = domain.domain_name;
        await execPromise(`sudo rm -f /etc/nginx/sites-enabled/${shellEscape(dn)}`).catch(() => { });
        await execPromise(`sudo rm -f /etc/nginx/sites-available/${shellEscape(dn)}`).catch(() => { });
        // Remove mail vhost too
        await execPromise(`sudo rm -f /etc/nginx/sites-enabled/mail.${shellEscape(dn)}`).catch(() => { });
        await execPromise(`sudo rm -f /etc/nginx/sites-available/mail.${shellEscape(dn)}`).catch(() => { });
        await execPromise(`sudo certbot delete --cert-name ${shellEscape(dn)} --non-interactive`).catch(() => { });
    }
    await execPromise('sudo nginx -t && sudo systemctl reload nginx').catch(() => { });
    // Remove BIND zones
    const zonesConfPath = '/etc/bind/named.conf.zones';
    let zonesConf = await fs.readFile(zonesConfPath, 'utf8').catch(() => '');
    for (const zone of dnsZones) {
        const dn = zone.domain_name;
        await execPromise(`sudo rm -f /etc/bind/zones/db.${shellEscape(dn)}`).catch(() => { });
        zonesConf = zonesConf.replace(new RegExp(`\\nzone "${dn.replace(/\./g, '\\.')}"[^}]+};\\n`, 'g'), '\n');
    }
    if (dnsZones.length > 0) {
        const tmpConf = `/tmp/named_zones_${Date.now()}`;
        await fs.writeFile(tmpConf, zonesConf);
        await execPromise(`sudo mv ${shellEscape(tmpConf)} ${zonesConfPath}`).catch(() => { });
        await execPromise('sudo named-checkconf && sudo systemctl reload bind9').catch(() => { });
    }
    // Drop MariaDB databases and users
    for (const db of dbsRes.rows) {
        await handleDeleteDatabase({ dbName: db.db_name, dbUser: db.db_user }).catch(() => { });
    }
    // Delete from PostgreSQL (cascade removes domains, dns, apps, etc.)
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    // Remove Linux user and home directory
    await execPromise(`sudo userdel -r ${shellEscape(username)}`).catch(() => { });
    // Clean up staging dir
    await execPromise(`sudo rm -rf ${shellEscape(stagingDir)}`).catch(() => { });
    console.log(`User ${username} archived to ${archivePath} and deleted.`);
}
async function handleRestoreUser(payload) {
    const { deletedUserId } = payload;
    if (!deletedUserId)
        throw new Error('deletedUserId is required');
    const deletedRow = await client.query('SELECT * FROM deleted_users WHERE id = $1', [deletedUserId]);
    if (deletedRow.rows.length === 0)
        throw new Error(`Deleted user record ${deletedUserId} not found`);
    const deleted = deletedRow.rows[0];
    const snapshot = deleted.metadata;
    const { user, domains, dns_zones, databases, user_apps } = snapshot;
    const username = validateUsername(deleted.username);
    // Extract archive
    const stagingDir = `/tmp/superhost_restore_${username}_${Date.now()}`;
    await fs.mkdir(stagingDir, { recursive: true });
    await execPromise(`sudo tar -xzf ${shellEscape(deleted.archive_path)} -C ${shellEscape(stagingDir)}`);
    // Re-create Linux user; restore SSH shell setting from snapshot
    const restoredShell = user.ssh_enabled ? '/bin/bash' : '/usr/sbin/nologin';
    await execPromise(`id -u ${shellEscape(username)}`).catch(async () => {
        await execPromise(`sudo useradd -m -s ${shellEscape(restoredShell)} ${shellEscape(username)}`);
    });
    // If the user already existed, still enforce the correct shell
    await execPromise(`sudo usermod -s ${shellEscape(restoredShell)} ${shellEscape(username)}`);
    // Restore home directory
    const homeStaging = `${stagingDir}/home`;
    const homeExists = await fs.access(homeStaging).then(() => true).catch(() => false);
    if (homeExists) {
        await execPromise(`sudo cp -a ${shellEscape(homeStaging)}/. /home/${shellEscape(username)}/`);
        await execPromise(`sudo chown -R ${shellEscape(username)}:${shellEscape(username)} /home/${shellEscape(username)}`);
        await execPromise(`sudo chmod 711 /home/${shellEscape(username)}`);
    }
    // Re-insert user in PostgreSQL
    const newUserRes = await client.query(`INSERT INTO users (username, email, home_dir, password_hash, disk_limit_mb, bandwidth_limit_mb, package_id, ssh_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, ssh_enabled = EXCLUDED.ssh_enabled RETURNING id`, [user.username, user.email, user.home_dir, user.password_hash,
        user.disk_limit_mb, user.bandwidth_limit_mb, user.package_id, user.ssh_enabled ?? false]);
    const newUserId = newUserRes.rows[0].id;
    // Restore MariaDB databases
    const dbAdminUser = process.env.DB_ADMIN_USER ?? 'superhost_worker';
    const dbAdminPass = process.env.DB_ADMIN_PASS ?? 'worker_db_pass';
    for (const db of (databases ?? [])) {
        const safeDb = validateMysqlIdentifier(db.db_name);
        const dumpPath = `${stagingDir}/databases/${safeDb}.sql`;
        const dumpExists = await fs.access(dumpPath).then(() => true).catch(() => false);
        const newPass = crypto.randomBytes(24).toString('base64url');
        await handleCreateDatabase({ dbName: safeDb, dbUser: db.db_user, dbPassword: newPass }).catch(() => { });
        if (dumpExists) {
            await execPromise(`mysql -u ${shellEscape(dbAdminUser)} -p${shellEscape(dbAdminPass)} ${shellEscape(safeDb)} < ${shellEscape(dumpPath)}`).catch(err => console.warn(`DB restore failed for ${safeDb}:`, err));
        }
        // Patch .env with new password
        await execPromise(`sudo sed -i 's/^DB_PASS=.*/DB_PASS=${newPass}/' /home/${shellEscape(username)}/.env`).catch(() => { });
        await client.query(`INSERT INTO databases (user_id, db_name, db_user) VALUES ($1, $2, $3) ON CONFLICT (db_name) DO NOTHING`, [newUserId, safeDb, db.db_user]);
    }
    // Restore domains + nginx vhosts + DNS
    for (const domain of (domains ?? [])) {
        const domainRes = await client.query(`INSERT INTO domains (user_id, domain_name, document_root, php_version, is_ssl)
       VALUES ($1, $2, $3, $4, false) ON CONFLICT (domain_name) DO NOTHING RETURNING id`, [newUserId, domain.domain_name, domain.document_root, domain.php_version]);
        const newDomainId = domainRes.rows[0]?.id;
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
            const zoneId = zoneRes.rows[0].id;
            for (const record of (zone.records ?? [])) {
                await client.query(`INSERT INTO dns_records (zone_id, type, name, content, priority, ttl)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, [zoneId, record.type, record.name, record.content, record.priority ?? null, record.ttl]);
            }
        }
    }
    // Remove deleted_users record now that restore is complete
    await client.query('DELETE FROM deleted_users WHERE id = $1', [deletedUserId]);
    // Remove archive file
    await execPromise(`sudo rm -f ${shellEscape(deleted.archive_path)}`).catch(() => { });
    // Clean up staging
    await execPromise(`sudo rm -rf ${shellEscape(stagingDir)}`).catch(() => { });
    console.log(`User ${username} restored successfully.`);
}
async function handlePurgeUserArchive(payload) {
    const { deletedUserId, archivePath } = payload;
    await execPromise(`sudo rm -f ${shellEscape(archivePath)}`).catch(() => { });
    await client.query('DELETE FROM deleted_users WHERE id = $1', [deletedUserId]);
    console.log(`Archive purged: ${archivePath}`);
}
async function handleReadLogs(payload, taskId) {
    const { logType } = payload;
    const lineCount = validateLineCount(payload?.lines ?? 50, 10000);
    // Log paths are fixed — logType selects from a hard-coded map, never interpolated
    const LOG_PATHS = {
        nginx_access: '/var/log/nginx/access.log',
        nginx_error: '/var/log/nginx/error.log',
        php_fpm: '/var/log/php8.3-fpm.log',
        system: '/var/log/syslog',
        auth: '/var/log/auth.log',
    };
    const filePath = LOG_PATHS[logType];
    if (!filePath)
        throw new Error(`Unknown log type: ${logType}`);
    try {
        // Use fixed path (from allowlist) and validated line count — no interpolation needed
        const { stdout } = await execPromise(`sudo tail -n ${lineCount} ${shellEscape(filePath)}`);
        await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: stdout }), taskId]);
    }
    catch (err) {
        console.error(`Failed to read log ${logType}:`, err);
        throw err;
    }
}
async function handleCreateDomain(payload) {
    const { domainName, username, phpVersion = '8.5' } = payload;
    if (!domainName || !username)
        throw new Error('Domain name and username are required');
    const docRoot = payload.docRoot ?? `/home/${username}/public_html`;
    try {
        await execPromise(`sudo mkdir -p ${shellEscape(docRoot)}`);
        await execPromise(`sudo chown -R ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(docRoot)}`);
        // Write a default welcome page only if the doc root has no existing content
        const indexPath = `${docRoot}/index.html`;
        const hasContent = await execPromise(`sudo find ${shellEscape(docRoot)} -maxdepth 1 -not -name '.' -print -quit 2>/dev/null`)
            .then(({ stdout }) => stdout.trim().length > 0).catch(() => false);
        const indexExists = hasContent || await execPromise(`sudo test -f ${shellEscape(indexPath)}`).then(() => true).catch(() => false);
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
            const userId = userRow.rows[0].id;
            const serverIp = process.env.SERVER_IP ?? '15.235.73.176';
            // Upsert zone record
            const zoneResult = await client.query(`INSERT INTO dns_zones (user_id, domain_name, ttl)
         VALUES ($1, $2, 3600)
         ON CONFLICT (domain_name) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING id`, [userId, domainName]);
            const zoneId = zoneResult.rows[0].id;
            // Insert default A records (skip if already present)
            for (const name of ['@', 'www']) {
                await client.query(`INSERT INTO dns_records (zone_id, type, name, content, ttl)
           VALUES ($1, 'A', $2, $3, 3600)
           ON CONFLICT DO NOTHING`, [zoneId, name, serverIp]);
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
            const tempZonePath = `/tmp/db_${domainName}`;
            await fs.writeFile(tempZonePath, zoneContent);
            await execPromise(`sudo mkdir -p /etc/bind/zones`);
            await execPromise(`sudo mv ${shellEscape(tempZonePath)} ${shellEscape(zoneFilePath)}`);
            // Register zone in named.conf.zones if not already there
            const zonesConfPath = '/etc/bind/named.conf.zones';
            let zonesConf = '';
            try {
                zonesConf = await fs.readFile(zonesConfPath, 'utf8');
            }
            catch { /* create fresh */ }
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
            if (!certbotEmail)
                throw new Error('CERTBOT_EMAIL not set');
            await execPromise(`sudo certbot --nginx -d ${shellEscape(domainName)} --non-interactive --agree-tos --email ${shellEscape(certbotEmail)}`);
            await client.query('UPDATE domains SET is_ssl = TRUE WHERE domain_name = $1', [domainName]);
            console.log(`SSL certificate issued for ${domainName}`);
            // Update WordPress siteurl/home to https if present
            await execPromise(`sudo mysql -e "UPDATE wp_options SET option_value=REPLACE(option_value,'http://','https://') WHERE option_name IN ('siteurl','home');" ${shellEscape(docRoot.split('/')[2] ?? '')} 2>/dev/null || true`).catch(() => { });
            // Also try common table prefixes by checking all databases for tables with the domain
            await execPromise(`sudo find ${shellEscape(docRoot)} -maxdepth 2 -name 'wp-config.php' -exec grep -l ${shellEscape(domainName)} {} \\; 2>/dev/null | head -1`).then(async ({ stdout }) => {
                const cfg = stdout.trim();
                if (!cfg)
                    return;
                const dbName = (await execPromise(`sudo grep "DB_NAME" ${shellEscape(cfg)} 2>/dev/null`).catch(() => ({ stdout: '' }))).stdout.match(/'([^']+)'/)?.[1];
                const prefix = (await execPromise(`sudo grep "table_prefix" ${shellEscape(cfg)} 2>/dev/null`).catch(() => ({ stdout: '' }))).stdout.match(/'([^']+)'/)?.[1] ?? 'wp_';
                if (dbName) {
                    await execPromise(`sudo mysql ${shellEscape(dbName)} -e "UPDATE ${shellEscape(prefix)}options SET option_value=REPLACE(option_value,'http://','https://') WHERE option_name IN ('siteurl','home');" 2>/dev/null || true`).catch(() => { });
                }
            }).catch(() => { });
        }
        catch (sslErr) {
            console.warn(`SSL immediate issue failed for ${domainName}, queuing PROVISION_SSL retry:`, sslErr);
            // Queue a retry — the worker will pick it up on the next poll cycle by
            // which point DNS propagation is likely complete.
            await client.query(`INSERT INTO tasks (command, payload, status) VALUES ('PROVISION_SSL', $1, 'pending')`, [JSON.stringify({ domainName })]);
        }
        // ── Email DNS (MX, SPF, DKIM, DMARC) ────────────────────────────────────
        // Only run for domains added via the API (domainId present). Staging
        // subdomains created internally by handleCreateUser have no domainId.
        if (payload.domainId) {
            try {
                await handleGenerateEmailDns({ domainId: payload.domainId, domainName });
            }
            catch (emailErr) {
                console.warn(`Email DNS setup failed for ${domainName}, continuing:`, emailErr);
            }
        }
        console.log(`Domain ${domainName} created pointing to ${docRoot}`);
    }
    catch (err) {
        console.error(`Failed to create domain ${domainName}:`, err);
        throw err;
    }
}
async function handleDeleteDomain(payload) {
    const domainName = validateDomainName(payload?.domainName);
    const username = validateUsername(payload?.username);
    // Remove Nginx config and reload
    await execPromise(`sudo rm -f /etc/nginx/sites-enabled/${shellEscape(domainName)}`);
    await execPromise(`sudo rm -f /etc/nginx/sites-available/${shellEscape(domainName)}`);
    // Remove document root
    const docRoot = `/home/${shellEscape(username)}/public_html/${shellEscape(domainName)}`;
    await execPromise(`sudo rm -rf ${docRoot}`).catch(() => { });
    // Remove SSL certs if they exist
    await execPromise(`sudo certbot delete --cert-name ${shellEscape(domainName)} --non-interactive`).catch(() => { });
    // Remove BIND zone file if present
    await execPromise(`sudo rm -f /etc/bind/zones/db.${shellEscape(domainName)}`).catch(() => { });
    await execPromise('sudo nginx -t && sudo systemctl reload nginx').catch(() => { });
    console.log(`Domain ${domainName} deleted.`);
}
// ── Account suspension (subscription canceled/unpaid) ───────────────────────
const SUSPENDED_ROOT = '/var/www/suspended';
const SUSPEND_BACKUP_DIR = '/etc/nginx/suspended-backups';
async function fileExists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
}
// Write the shared "temporarily unavailable" landing page once.
async function ensureSuspendedPage() {
    await execPromise(`sudo mkdir -p ${SUSPENDED_ROOT}`);
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Site temporarily unavailable</title>
<style>body{margin:0;font-family:system-ui,Arial,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}
.box{max-width:520px;padding:40px}h1{font-size:1.6rem;margin:0 0 12px}p{color:#94a3b8;line-height:1.6}</style></head>
<body><div class="box"><h1>This site is temporarily unavailable</h1>
<p>The website you're trying to reach is currently offline. If you are the site owner, please sign in to your account to restore service.</p></div></body></html>`;
    const tmp = '/tmp/suspended.html';
    await fs.writeFile(tmp, html);
    await execPromise(`sudo mv ${shellEscape(tmp)} ${SUSPENDED_ROOT}/suspended.html`);
}
function buildSuspendedVhost(domain, hasSsl) {
    const block = (listen, ssl) => `server {
    ${listen}
    server_name ${domain} www.${domain};
    ${ssl}
    root ${SUSPENDED_ROOT};
    location / { return 503; }
    error_page 503 /suspended.html;
    location = /suspended.html { internal; }
}`;
    let out = block('listen 80;\n    listen [::]:80;', '');
    if (hasSsl) {
        out += '\n' + block('listen 443 ssl;\n    listen [::]:443 ssl;', `ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;`);
    }
    return out + '\n';
}
// Take all of a user's websites offline behind a 503 page. Reversible — the
// real vhost is backed up so UNSUSPEND_ACCOUNT can restore it exactly.
async function handleSuspendAccount(payload) {
    const username = validateUsername(payload?.username);
    const userId = payload?.userId;
    if (!userId)
        throw new Error('userId required');
    const res = await client.query('SELECT domain_name FROM domains WHERE user_id = $1', [userId]);
    if (res.rowCount === 0) {
        console.log(`Suspend: no domains for ${username}`);
        return;
    }
    await ensureSuspendedPage();
    await execPromise(`sudo mkdir -p ${SUSPEND_BACKUP_DIR}`);
    for (const row of res.rows) {
        let domain;
        try {
            domain = validateDomainName(row.domain_name);
        }
        catch {
            continue;
        }
        const avail = `/etc/nginx/sites-available/${domain}`;
        const backup = `${SUSPEND_BACKUP_DIR}/${domain}`;
        if (!(await fileExists(avail)))
            continue;
        // Back up the real vhost once (don't clobber an existing backup).
        if (!(await fileExists(backup))) {
            await execPromise(`sudo cp ${shellEscape(avail)} ${shellEscape(backup)}`).catch(() => { });
        }
        const hasSsl = await fileExists(`/etc/letsencrypt/live/${domain}/fullchain.pem`);
        const tmp = `/tmp/suspended_${domain}.conf`;
        await fs.writeFile(tmp, buildSuspendedVhost(domain, hasSsl));
        await execPromise(`sudo mv ${shellEscape(tmp)} ${shellEscape(avail)}`);
        await execPromise(`sudo ln -sf ${shellEscape(avail)} /etc/nginx/sites-enabled/${shellEscape(domain)}`).catch(() => { });
    }
    try {
        await execPromise('sudo nginx -t');
        await execPromise('sudo systemctl reload nginx');
        console.log(`Suspended ${res.rowCount} site(s) for ${username}`);
    }
    catch (e) {
        console.error('nginx invalid after suspend — restoring backups:', e.message);
        await handleUnsuspendAccount({ username, userId });
        throw e;
    }
}
// Restore a user's websites from backup (subscription reactivated).
async function handleUnsuspendAccount(payload) {
    const username = validateUsername(payload?.username);
    const userId = payload?.userId;
    if (!userId)
        throw new Error('userId required');
    const res = await client.query('SELECT domain_name FROM domains WHERE user_id = $1', [userId]);
    let restored = 0;
    for (const row of res.rows) {
        let domain;
        try {
            domain = validateDomainName(row.domain_name);
        }
        catch {
            continue;
        }
        const avail = `/etc/nginx/sites-available/${domain}`;
        const backup = `${SUSPEND_BACKUP_DIR}/${domain}`;
        if (await fileExists(backup)) {
            await execPromise(`sudo mv ${shellEscape(backup)} ${shellEscape(avail)}`).catch(() => { });
            await execPromise(`sudo ln -sf ${shellEscape(avail)} /etc/nginx/sites-enabled/${shellEscape(domain)}`).catch(() => { });
            restored++;
        }
    }
    await execPromise('sudo nginx -t && sudo systemctl reload nginx').catch((e) => console.error('nginx reload failed during unsuspend:', e.message));
    console.log(`Unsuspended ${restored} site(s) for ${username}`);
}
async function handleUpdateDomainConfig(payload) {
    const { domainName, username, phpVersion, reverseProxyBlock } = payload;
    if (!domainName || !username)
        throw new Error('Domain name and username are required');
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
async function handleSetupCustomApi(payload) {
    const { userId, port, serviceName, domainId } = payload;
    // 1. Get Domain Info
    const domainRes = await client.query('SELECT d.domain_name, u.username FROM domains d JOIN users u ON d.user_id = u.id WHERE d.id = $1', [domainId]);
    if (domainRes.rows.length === 0)
        throw new Error('Domain not found');
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
    }
    else {
        config = config.replace('location / {', `${proxyBlock}\n    location / {`);
    }
    await fs.writeFile(configPath, config);
    await execPromise('nginx -t && systemctl reload nginx');
    console.log(`Custom API proxy setup for ${domain_name} on port ${port}.`);
}
async function handleFirewallAllow(payload) {
    const port = validatePort(payload?.port);
    const protocol = validateProtocol(payload?.protocol ?? 'tcp');
    await execPromise(`sudo ufw allow ${port}/${protocol}`);
    console.log(`Firewall allowed ${port}/${protocol}`);
}
async function handleFirewallDelete(payload) {
    const ruleNumber = validateRuleNumber(payload?.ruleNumber);
    await execPromise(`sudo ufw --force delete ${ruleNumber}`);
    console.log(`Firewall rule ${ruleNumber} deleted.`);
}
async function handleGetFirewallStatus(_payload, taskId) {
    const { stdout } = await execPromise('sudo ufw status numbered');
    await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: stdout }), taskId]);
}
async function handleGetProcesses(payload, taskId) {
    let command;
    if (payload?.username) {
        const username = validateUsername(payload.username);
        // Use shellEscape to safely include the validated username
        command = `ps -u ${shellEscape(username)} -o user,pid,%cpu,%mem,vsz,rss,tty,stat,start,time,command --sort=-%cpu`;
    }
    else {
        command = 'ps aux --sort=-%cpu';
    }
    const { stdout } = await execPromise(command);
    await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: stdout }), taskId]);
}
async function handleKillProcess(payload) {
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
async function handleInstallSsl(payload) {
    const domainName = validateDomainName(payload?.domainName);
    const certbotEmail = process.env.CERTBOT_EMAIL;
    if (!certbotEmail)
        throw new Error('CERTBOT_EMAIL environment variable is not set');
    // All args are validated / escaped — domainName passes DNS regex check
    await execPromise(`certbot --nginx -d ${shellEscape(domainName)} --non-interactive --agree-tos --email ${shellEscape(certbotEmail)}`);
    await client.query('UPDATE domains SET is_ssl = TRUE WHERE domain_name = $1', [domainName]);
    console.log(`SSL installed for ${domainName}`);
}
// PROVISION_SSL: queued automatically by handleCreateDomain when certbot fails
// on initial domain creation (DNS not propagated yet). Re-runs certbot once the
// task is picked up — by then DNS is usually live.
async function handleProvisionSsl(payload) {
    const domainName = validateDomainName(payload?.domainName);
    const certbotEmail = process.env.CERTBOT_EMAIL;
    if (!certbotEmail)
        throw new Error('CERTBOT_EMAIL environment variable is not set');
    await execPromise(`sudo certbot --nginx -d ${shellEscape(domainName)} --non-interactive --agree-tos --email ${shellEscape(certbotEmail)}`);
    await client.query('UPDATE domains SET is_ssl = TRUE WHERE domain_name = $1', [domainName]);
    console.log(`SSL provisioned (retry) for ${domainName}`);
}
async function handleRestartService(payload) {
    const serviceName = validateServiceName(payload?.serviceName);
    await execPromise(`sudo systemctl restart ${shellEscape(serviceName)}`);
    console.log(`Service ${serviceName} restarted.`);
}
async function handleSyncMigrationData(payload) {
    if (!payload?.sourcePath || !payload?.targetPath || !payload?.username) {
        throw new Error('sourcePath, targetPath, and username are required for sync');
    }
    // Backup contents originate from a foreign host, so paths/username are
    // untrusted. Validate the username and escape every value before shell use.
    const username = validateUsername(payload.username);
    const sourcePath = String(payload.sourcePath);
    const targetPath = String(payload.targetPath);
    if (/[\r\n\x00]/.test(sourcePath) || /[\r\n\x00]/.test(targetPath)) {
        throw new Error('Illegal character in migration path');
    }
    // Ensure target directory exists
    await fs.mkdir(targetPath, { recursive: true });
    // Use rsync to move files and preserve permissions/structure
    console.log(`Syncing files from ${sourcePath} to ${targetPath}...`);
    await execPromise(`rsync -av ${shellEscape(sourcePath + '/')} ${shellEscape(targetPath + '/')}`);
    // Fix permissions for the new user
    await execPromise(`chown -R ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(targetPath)}`);
    // Cleanup source path if it's in /tmp
    if (sourcePath.includes('/tmp/migrate_')) {
        // We only clean up the specific temp dir, but be careful with rm -rf
        // Typically the migration script should handle its own temp dir, 
        // but the worker needs the files. We'll let the worker clean up after sync.
        // For safety, we'll only delete if it looks like a migration temp dir.
    }
    console.log(`Sync completed for ${username} at ${targetPath}`);
}
async function handleUpdateResourceUsage(payload) {
    const { username, userId } = payload;
    if (!username || !userId)
        throw new Error('Username and userId are required');
    const homeDir = `/home/${username}`;
    try {
        // 1. Get current limits from DB
        const userRes = await client.query('SELECT disk_limit_mb, bandwidth_limit_mb FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0)
            throw new Error('User not found');
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
                if (!isNaN(bytes))
                    totalBytes += bytes;
            }
            catch (e) {
                // Log file might not exist yet if no traffic
            }
        }
        const bandwidthUsedMb = Math.round(totalBytes / (1024 * 1024));
        // 4. Update Database
        await client.query('UPDATE users SET disk_used_mb = $1, bandwidth_used_mb = $2, updated_at = NOW() WHERE id = $3', [diskUsedMb, bandwidthUsedMb, userId]);
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
    }
    catch (err) {
        console.error(`Failed to update resources for ${username}:`, err);
        throw err;
    }
}
async function handleCreateDatabase(payload) {
    const { dbPassword } = payload;
    if (!payload?.dbName || !payload?.dbUser || !dbPassword)
        throw new Error('dbName, dbUser, and dbPassword are required');
    // Identifiers can't be bound parameters in MySQL — validate to a safe charset
    // here in the worker (never trust the API to have done it). The password IS
    // bound as a parameter so it can never break out of the SQL literal.
    const dbName = validateMysqlIdentifier(payload.dbName, 'dbName');
    const dbUser = validateMysqlIdentifier(payload.dbUser, 'dbUser');
    if (typeof dbPassword !== 'string')
        throw new Error('dbPassword must be a string');
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: process.env.DB_ADMIN_USER || 'superhost_worker',
        password: process.env.DB_ADMIN_PASS || 'worker_db_pass',
    });
    try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await connection.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY ?`, [dbPassword]);
        await connection.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost'`);
        await connection.query('FLUSH PRIVILEGES');
        console.log(`Database ${dbName} and user ${dbUser} created successfully.`);
    }
    catch (err) {
        console.error(`Error creating database ${dbName}:`, err);
        throw err;
    }
    finally {
        await connection.end();
    }
}
async function handleChangeDbPassword(payload) {
    const { dbUser, newPassword } = payload;
    if (!dbUser || !newPassword)
        throw new Error('dbUser and newPassword are required');
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
    }
    finally {
        await connection.end();
    }
}
async function handleDeleteDatabase(payload) {
    if (!payload?.dbName || !payload?.dbUser)
        throw new Error('dbName and dbUser are required');
    const dbName = validateMysqlIdentifier(payload.dbName, 'dbName');
    const dbUser = validateMysqlIdentifier(payload.dbUser, 'dbUser');
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
    }
    catch (err) {
        console.error(`Error deleting database ${dbName}:`, err);
        throw err;
    }
    finally {
        await connection.end();
    }
}
async function handleGenerateEmailDns(payload) {
    const { domainId, domainName } = payload;
    if (!domainId || !domainName)
        throw new Error('domainId and domainName are required');
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
        if (!pubKey)
            throw new Error('Failed to parse DKIM public key');
        const dkimRecord = `v=DKIM1; h=sha256; k=rsa; p=${pubKey}`;
        // 3. Update OpenDKIM mapping files (avoid duplicates)
        // Write entries via temp files to avoid any shell-quoting issues
        const keyTableEntry = `${selector}._domainkey.${domainName} ${domainName}:${selector}:${keyDir}/${selector}.private`;
        const signingEntry = `*@${domainName} ${selector}._domainkey.${domainName}`;
        const tmpKT = `/tmp/opendkim_kt_${domainName}`;
        const tmpST = `/tmp/opendkim_st_${domainName}`;
        const tmpTH = `/tmp/opendkim_th_${domainName}`;
        await fs.writeFile(tmpKT, keyTableEntry + '\n');
        await fs.writeFile(tmpST, signingEntry + '\n');
        await fs.writeFile(tmpTH, domainName + '\n');
        // Append only if the entry is not already present
        await execPromise(`sudo grep -qF ${shellEscape(keyTableEntry)} /etc/opendkim/KeyTable   || sudo tee -a /etc/opendkim/KeyTable   < ${shellEscape(tmpKT)}   > /dev/null`);
        await execPromise(`sudo grep -qF ${shellEscape(signingEntry)}   /etc/opendkim/SigningTable || sudo tee -a /etc/opendkim/SigningTable < ${shellEscape(tmpST)} > /dev/null`);
        await execPromise(`sudo grep -qF ${shellEscape(domainName)}     /etc/opendkim/TrustedHosts || sudo tee -a /etc/opendkim/TrustedHosts < ${shellEscape(tmpTH)} > /dev/null`);
        await Promise.all([fs.rm(tmpKT), fs.rm(tmpST), fs.rm(tmpTH)]).catch(() => { });
        await execPromise('sudo systemctl restart opendkim');
        // 4. Upsert DNS records into dns_records table (zone must already exist from handleCreateDomain)
        const zoneRes = await client.query('SELECT id FROM dns_zones WHERE domain_name = $1', [domainName]);
        if (zoneRes.rows.length === 0)
            throw new Error(`No DNS zone found for ${domainName} — create the domain first`);
        const zoneId = zoneRes.rows[0].id;
        // Helper: upsert a dns_record (match on zone_id + type + name)
        const upsertRecord = async (type, name, content, priority) => {
            await client.query(`INSERT INTO dns_records (zone_id, type, name, content, priority, ttl)
         VALUES ($1, $2, $3, $4, $5, 3600)
         ON CONFLICT DO NOTHING`, [zoneId, type, name, content, priority ?? null]);
            // Also update if it already exists for this type+name
            await client.query(`UPDATE dns_records SET content = $1, priority = $2 WHERE zone_id = $3 AND type = $4 AND name = $5`, [content, priority ?? null, zoneId, type, name]);
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
        // A record for spam subdomain
        await upsertRecord('A', 'spam', serverIp);
        // 5. Sync BIND zone file
        await handleSyncDnsZone({ zoneId, domainName });
        // 6. Provision webmail vhost at mail.<domain>
        await handleProvisionWebmailVhost({ domainName });
        // 7. Provision spam vhost at spam.<domain>
        await handleProvisionSpamVhost({ domainName });
        console.log(`Email DNS (MX, SPF, DKIM, DMARC) configured for ${domainName}`);
    }
    catch (err) {
        console.error(`Error generating email DNS for ${domainName}:`, err);
        throw err;
    }
}
async function handleProvisionWebmailVhost({ domainName }) {
    const mailHost = `mail.${domainName}`;
    const nginxConf = `/etc/nginx/sites-available/${mailHost}`;
    const nginxLink = `/etc/nginx/sites-enabled/${mailHost}`;
    const certPath = `/etc/letsencrypt/live/${mailHost}/fullchain.pem`;
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
        const certbotRes = await execPromise(`sudo certbot certonly --nginx --non-interactive --agree-tos ` +
            `--email hostmaster@${domainName} -d ${shellEscape(mailHost)} 2>&1`);
        console.log(`Certbot for ${mailHost}:`, certbotRes.stdout.slice(0, 200));
    }
    catch (certErr) {
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
async function handleProvisionSpamVhost({ domainName }) {
    const spamHost = `spam.${domainName}`;
    const nginxConf = `/etc/nginx/sites-available/${spamHost}`;
    const nginxLink = `/etc/nginx/sites-enabled/${spamHost}`;
    const certPath = `/etc/letsencrypt/live/${spamHost}/fullchain.pem`;
    const dashRoot = '/home/jonathan/superhost/dashboard/dist';
    const httpConf = `server {
    listen 80;
    server_name ${spamHost};

    root ${dashRoot};
    index index.html;

    access_log /var/log/nginx/${spamHost}.access.log;
    error_log  /var/log/nginx/${spamHost}.error.log;

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
    await fs.writeFile(`/tmp/${spamHost}.nginx`, httpConf);
    await execPromise(`sudo mv /tmp/${spamHost}.nginx ${nginxConf}`);
    await execPromise(`sudo ln -sf ${nginxConf} ${nginxLink}`);
    await execPromise('sudo nginx -t && sudo systemctl reload nginx');
    try {
        await execPromise(`sudo certbot certonly --nginx --non-interactive --agree-tos ` +
            `--email hostmaster@${domainName} -d ${shellEscape(spamHost)} 2>&1`);
    }
    catch (certErr) {
        console.warn(`Certbot failed for ${spamHost} (DNS may still be propagating):`, certErr.stderr?.slice(0, 200));
        return;
    }
    const httpsConf = `server {
    listen 80;
    server_name ${spamHost};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ${spamHost};

    ssl_certificate     ${certPath};
    ssl_certificate_key /etc/letsencrypt/live/${spamHost}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    root ${dashRoot};
    index index.html;

    access_log /var/log/nginx/${spamHost}.access.log;
    error_log  /var/log/nginx/${spamHost}.error.log;

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
    await fs.writeFile(`/tmp/${spamHost}.nginx`, httpsConf);
    await execPromise(`sudo mv /tmp/${spamHost}.nginx ${nginxConf}`);
    await execPromise('sudo nginx -t && sudo systemctl reload nginx');
    console.log(`Spam vhost provisioned: https://${spamHost}`);
}
async function handleInstallWordPress(payload) {
    const { dbName: rawDbName, dbUser: rawDbUser, dbPassword, siteTitle, adminUser, adminPassword, adminEmail } = payload;
    // Validate identifiers that flow into shell/SQL. execFile arrays neutralise
    // the remaining free-text values (title/password/email), so they can't break
    // out into a shell.
    const username = validateUsername(payload?.username);
    const domainName = validateDomainName(payload?.domainName);
    const dbName = validateMysqlIdentifier(rawDbName, 'dbName');
    const dbUser = validateMysqlIdentifier(rawDbUser, 'dbUser');
    if (typeof dbPassword !== 'string' || !dbPassword)
        throw new Error('dbPassword required');
    if (typeof adminUser !== 'string' || !/^[a-zA-Z0-9._@\-]{1,60}$/.test(adminUser))
        throw new Error('Invalid admin user');
    if (typeof adminPassword !== 'string' || adminPassword.length < 8)
        throw new Error('Admin password too short');
    if (typeof adminEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail))
        throw new Error('Invalid admin email');
    const title = typeof siteTitle === 'string' && siteTitle.trim() ? siteTitle.slice(0, 200) : domainName;
    const docRoot = `/home/${username}/public_html/${domainName}`;
    // Run wp-cli as the hosting user via execFile (argument array, no shell).
    const wp = (...args) => execFilePromise('sudo', ['-u', username, 'wp', `--path=${docRoot}`, ...args]);
    try {
        // 1. Ensure DB exists (reuse create DB logic)
        await handleCreateDatabase({ dbName, dbUser, dbPassword });
        // 2. Download and config WP
        console.log(`Starting WordPress installation in ${docRoot}...`);
        await wp('core', 'download');
        await wp('config', 'create', `--dbname=${dbName}`, `--dbuser=${dbUser}`, `--dbpass=${dbPassword}`, '--dbhost=localhost');
        // 3. Install core
        await wp('core', 'install', `--url=http://${domainName}`, `--title=${title}`, `--admin_user=${adminUser}`, `--admin_password=${adminPassword}`, `--admin_email=${adminEmail}`);
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
    }
    catch (err) {
        console.error(`Error installing WordPress for ${domainName}:`, err);
        throw err;
    }
}
async function handleSetupAppRuntime(payload) {
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
        await execPromise(`pm2 startup systemd -u ${shellEscape(username)} --hp ${shellEscape(`/home/${username}`)} --silent`).catch(() => { });
        await execPromise(`sudo -u ${shellEscape(username)} pm2 save --force`);
        // 4. Update status in DB
        await client.query('UPDATE user_apps SET status = $1 WHERE id = $2', ['running', appId]);
        console.log(`App ${appName} (${type}) setup on port ${port}`);
    }
    catch (err) {
        console.error('Failed to setup app runtime:', err);
        throw err;
    }
}
async function handleManageAppRuntime(payload) {
    const { username, action, appId } = payload;
    const appName = `app_${appId}`;
    try {
        await execPromise(`sudo -u ${shellEscape(username)} pm2 ${shellEscape(action)} ${shellEscape(appName)}`);
        await execPromise(`sudo -u ${shellEscape(username)} pm2 save --force`);
        const status = action === 'stop' ? 'stopped' : 'running';
        await client.query('UPDATE user_apps SET status = $1 WHERE id = $2', [status, appId]);
        console.log(`App ${appName} ${action}ed.`);
    }
    catch (err) {
        console.error(`Failed to ${action} app:`, err);
        throw err;
    }
}
async function handleDeleteAppRuntime(payload) {
    const { username, domainName, appId } = payload;
    const appName = `app_${appId}`;
    try {
        // 1. Delete from PM2 and save so the process doesn't come back on reboot
        await execPromise(`sudo -u ${shellEscape(username)} pm2 delete ${shellEscape(appName)}`).catch(() => { });
        await execPromise(`sudo -u ${shellEscape(username)} pm2 save --force`).catch(() => { });
        // 2. Revert Nginx to standard
        await handleCreateDomain({ username, domainName, phpVersion: '8.5' });
        console.log(`App ${appName} deleted and domain ${domainName} reverted to standard.`);
    }
    catch (err) {
        console.error('Failed to delete app runtime:', err);
        throw err;
    }
}
async function handleGitDeploy(payload, taskId) {
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
            await execPromise(`sudo -u ${shellEscape(username)} git clone -b ${shellEscape(branch)} ${shellEscape(repoUrl)} ${shellEscape(fullPath)}`);
        }
        else {
            // cd into fixed path, fetch, then reset to escaped branch
            await execPromise(`sudo -u ${shellEscape(username)} sh -c ${shellEscape(`cd ${fullPath} && git fetch --all && git reset --hard origin/${branch}`)}`);
        }
        await client.query('UPDATE user_git_repos SET last_deployed = NOW() WHERE id = $1', [repoId]);
        console.log(`Git deployment successful for repo ID ${repoId}`);
    }
    catch (err) {
        console.error('Git deployment failed:', err);
        throw err;
    }
}
async function handleSyncCrontab(payload) {
    const username = validateUsername(payload?.username);
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
    // Use a secure temp directory with restricted permissions
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'superhost-cron-'));
    const tempFile = path.join(tmpDir, 'crontab');
    try {
        // Validate every field of every job before writing
        const cronLines = jobs.map((job, idx) => {
            try {
                const minute = validateCronField(job.minute ?? '*', 'minute');
                const hour = validateCronField(job.hour ?? '*', 'hour');
                const day = validateCronField(job.day ?? '*', 'day');
                const month = validateCronField(job.month ?? '*', 'month');
                const weekday = validateCronField(job.weekday ?? '*', 'weekday');
                const command = validateCronCommand(job.command);
                return `${minute} ${hour} ${day} ${month} ${weekday} ${command}`;
            }
            catch (e) {
                throw new Error(`Cron job #${idx}: ${e.message}`);
            }
        });
        const crontabContent = cronLines.join('\n') + '\n';
        await fs.writeFile(tempFile, crontabContent, { mode: 0o600 });
        await execPromise(`sudo crontab -u ${shellEscape(username)} ${shellEscape(tempFile)}`);
        console.log(`Crontab synchronized for ${username}.`);
    }
    finally {
        // Always clean up temp files, even on error
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => { });
    }
    try {
        // placeholder to keep original catch block structure intact
    }
    catch (err) {
        console.error(`Failed to sync crontab for ${username}:`, err);
        throw err;
    }
}
async function handleSyncFtp(payload) {
    const { username } = payload;
    if (!username)
        throw new Error('username is required');
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
    }
    catch (err) {
        console.error(`Failed to sync FTP for ${username}:`, err);
        throw err;
    }
}
// Reject anything that could inject extra lines/directives into a BIND zone
// file. Newlines and control chars are the zone-file injection vector.
function sanitizeZoneField(value, label) {
    const s = String(value ?? '');
    if (/[\r\n\x00-\x1f\x7f]/.test(s))
        throw new Error(`Illegal control character in DNS ${label}`);
    return s;
}
async function handleSyncDnsZone(payload) {
    const { zoneId } = payload;
    if (!zoneId || !payload?.domainName)
        throw new Error('zoneId and domainName are required');
    // Validate before any shell/file use — guarantees no metacharacters/newlines.
    const domainName = validateDomainName(payload.domainName);
    try {
        // 1. Fetch Zone and Records
        const zoneRes = await client.query('SELECT * FROM dns_zones WHERE id = $1', [zoneId]);
        const recordsRes = await client.query('SELECT * FROM dns_records WHERE zone_id = $1', [zoneId]);
        const zone = zoneRes.rows[0];
        const records = recordsRes.rows;
        // 2. Load Template
        let template = await fs.readFile(path.join(process.cwd(), 'src/templates/bind_zone.tplt'), 'utf8');
        // 3. Prepare placeholders — prefer DB settings, fall back to env
        const settingsRes = await client.query("SELECT key, value FROM server_settings WHERE key IN ('ns1','ns2','master_domain')").catch(() => ({ rows: [] }));
        const dbSettings = {};
        for (const row of settingsRes.rows)
            dbSettings[row.key] = row.value;
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
        const recordLines = records.map((r) => {
            const type = validateDnsType(r.type);
            const rawName = sanitizeZoneField(r.name, 'record name');
            const name = rawName === '@' ? '' : rawName;
            const priority = r.priority ? `\t${parseInt(r.priority, 10)}` : '';
            const ttl = r.ttl ? `\t${parseInt(r.ttl, 10)}` : '';
            let content = sanitizeZoneField(r.content, 'record content');
            if (type === 'TXT') {
                // Strip outer quotes, escape embedded backslashes/quotes, then re-quote
                // and split into ≤255-byte chunks for BIND.
                const raw = content.replace(/^"+|"+$/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                const chunkSize = 255;
                if (raw.length <= chunkSize) {
                    content = `"${raw}"`;
                }
                else {
                    const chunks = [];
                    for (let i = 0; i < raw.length; i += chunkSize)
                        chunks.push(raw.slice(i, i + chunkSize));
                    content = '( ' + chunks.map(c => `"${c}"`).join(' ') + ' )';
                }
            }
            return `${name}${ttl}\tIN\t${type}${priority}\t${content}`;
        }).join('\n');
        template = template.replace(/{{RECORDS}}/g, recordLines);
        // 5. Write Zone File (domainName is validated, so interpolation is safe;
        // still use the escaped form consistently as defence in depth).
        const safeDomain = shellEscape(domainName);
        const zoneFilePath = `/etc/bind/zones/db.${domainName}`;
        const tmpZone = `/tmp/db.${domainName}`;
        await execPromise('sudo mkdir -p /etc/bind/zones');
        await fs.writeFile(tmpZone, template);
        // Validate the generated zone before installing it — a malformed zone
        // would otherwise break named's reload for every domain.
        await execPromise(`named-checkzone ${safeDomain} ${shellEscape(tmpZone)}`);
        await execPromise(`sudo mv ${shellEscape(tmpZone)} ${shellEscape(zoneFilePath)}`);
        // 6. Ensure zone entry exists in named.conf.zones — but ONLY if the zone
        //    isn't already declared anywhere named includes. A duplicate zone (e.g.
        //    qc.fyi also declared in named.conf.local) makes named refuse to start,
        //    taking down DNS for every hosted domain. So check both files first.
        const zonesConfPath = '/etc/bind/named.conf.zones';
        const zoneDecl = `zone "${domainName}"`;
        let zonesConf = '';
        try {
            zonesConf = await fs.readFile(zonesConfPath, 'utf8');
        }
        catch { /* file may not exist yet */ }
        let localConf = '';
        try {
            localConf = await fs.readFile('/etc/bind/named.conf.local', 'utf8');
        }
        catch { /* optional */ }
        if (!zonesConf.includes(zoneDecl) && !localConf.includes(zoneDecl)) {
            const zoneEntry = `zone "${domainName}" { type master; file "/etc/bind/zones/db.${domainName}"; };\n`;
            // Back up so we can roll back if the result fails validation.
            await execPromise(`sudo cp -p ${zonesConfPath} ${zonesConfPath}.bak`).catch(() => { });
            const tmpZonesConf = '/tmp/named.conf.zones.new';
            await fs.writeFile(tmpZonesConf, zonesConf + (zonesConf.endsWith('\n') || !zonesConf ? '' : '\n') + zoneEntry);
            await execPromise(`sudo mv ${shellEscape(tmpZonesConf)} ${zonesConfPath}`);
            // Validate the whole BIND config; if it's now broken, roll back rather
            // than leave named unable to start.
            try {
                await execPromise('sudo named-checkconf');
            }
            catch (cfgErr) {
                await execPromise(`sudo mv ${zonesConfPath}.bak ${zonesConfPath}`).catch(() => { });
                throw new Error(`named-checkconf failed after adding zone ${domainName}; rolled back: ${cfgErr.message}`);
            }
        }
        // 7. Reload Bind
        await execPromise(`sudo rndc reload ${safeDomain}`).catch(async () => {
            await execPromise('sudo rndc reconfig').catch(async () => {
                await execPromise('sudo systemctl reload bind9');
            });
        });
        console.log(`DNS zone ${domainName} synchronized.`);
    }
    catch (err) {
        console.error(`Failed to sync DNS zone ${domainName}:`, err);
        throw err;
    }
}
async function handleRemoveDnsZone(payload) {
    const { domainName } = payload;
    if (!domainName)
        throw new Error('domainName is required');
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
        }
        catch { /* ignore if file missing */ }
        await execPromise('sudo rndc reconfig').catch(async () => {
            await execPromise('sudo systemctl reload bind9');
        });
        console.log(`DNS zone ${domainName} removed.`);
    }
    catch (err) {
        console.error(`Failed to remove DNS zone ${domainName}:`, err);
        throw err;
    }
}
// Apply greylisting, DNSBL/RBL rejection, and attachment-extension blocking
// based on server_settings toggles. Safe to call repeatedly (idempotent).
async function applyMailSpamInfraConfig() {
    const settingsRes = await client.query(`SELECT key, value FROM server_settings WHERE key IN
     ('greylisting_enabled','rbl_enabled','mail_rbls','attachment_blocking_enabled','blocked_attachment_extensions')`).catch(() => ({ rows: [] }));
    const s = {};
    for (const row of settingsRes.rows)
        s[row.key] = row.value;
    // ── Greylisting via postgrey ──────────────────────────────────────────────
    const greylist = s['greylisting_enabled'] === 'true';
    if (greylist) {
        await execPromise('sudo apt-get install -y postgrey').catch(() => { });
        await execPromise('sudo systemctl enable --now postgrey').catch(() => { });
    }
    // ── RBL / DNSBL rejection ─────────────────────────────────────────────────
    const rblEnabled = s['rbl_enabled'] === 'true';
    const rblZones = (s['mail_rbls'] ?? '')
        .split(',').map(z => z.trim())
        .filter(z => /^[a-zA-Z0-9.\-]+$/.test(z)); // reject anything non-hostname
    // Build smtpd_recipient_restrictions in a fixed, safe order.
    const restrictions = ['permit_mynetworks', 'permit_sasl_authenticated'];
    if (greylist)
        restrictions.push('check_policy_service inet:127.0.0.1:10023');
    if (rblEnabled)
        for (const z of rblZones)
            restrictions.push(`reject_rbl_client ${z}`);
    restrictions.push('permit');
    await execPromise(`sudo postconf -e ${shellEscape('smtpd_recipient_restrictions = ' + restrictions.join(', '))}`);
    // ── Attachment / dangerous-extension blocking ─────────────────────────────
    const attachEnabled = s['attachment_blocking_enabled'] === 'true';
    if (attachEnabled) {
        const exts = (s['blocked_attachment_extensions'] ?? '')
            .split(',').map(e => e.trim().toLowerCase())
            .filter(e => /^[a-z0-9]{1,10}$/.test(e));
        if (exts.length) {
            const body = [
                '# Superhost-managed — block dangerous attachment extensions',
                `/^[^>]*name\\s*=\\s*"?[^"]*\\.(${exts.join('|')})"?\\s*$/  REJECT Attachment type .$1 not allowed for security reasons`,
            ].join('\n');
            const tmp = '/tmp/superhost_mime_header_checks';
            await fs.writeFile(tmp, body + '\n');
            await execPromise(`sudo mv ${shellEscape(tmp)} /etc/postfix/mime_header_checks`);
            await execPromise('sudo postconf -e mime_header_checks=pcre:/etc/postfix/mime_header_checks');
        }
    }
    else {
        await execPromise('sudo postconf -e mime_header_checks=').catch(() => { });
    }
}
// Configure Postfix to relay inbound mail for customer "spam filter" domains to
// their real mail server. DB-driven pgsql maps so adding/removing a relay domain
// in the panel takes effect without rewriting files. Additive + validated:
// existing virtual-mailbox delivery is untouched, and relay_recipient_maps means
// we only accept the customer's real addresses (no backscatter).
async function handleConfigureMailRelay() {
    console.log('Configuring mail relay...');
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbName = process.env.DB_NAME;
    const creds = `user = ${dbUser}\npassword = ${dbPassword}\nhosts = ${dbHost}\ndbname = ${dbName}`;
    const maps = {
        'pgsql-relay-domains.cf': `${creds}\nquery = SELECT domain_name FROM mail_relay_domains WHERE domain_name='%s' AND enabled=true`,
        // Route relay domains through the pipe content-filter (scan → quarantine
        // spam / forward clean). Scoped to relay domains only; hosted mail is never
        // routed here.
        'pgsql-relay-transport.cf': `${creds}\nquery = SELECT 'relayfilter:' FROM mail_relay_domains WHERE domain_name='%s' AND enabled=true`,
        'pgsql-relay-recipients.cf': `${creds}\nquery = SELECT 'OK' FROM mail_relay_recipients r JOIN mail_relay_domains d ON r.relay_domain_id = d.id WHERE lower(r.address)=lower('%s') AND d.enabled=true`,
    };
    for (const [file, content] of Object.entries(maps)) {
        const tmp = `/tmp/${file}`;
        await fs.writeFile(tmp, content + '\n');
        await execPromise(`sudo mv ${shellEscape(tmp)} /etc/postfix/${file}`);
        await execPromise(`sudo chown root:postfix /etc/postfix/${file}`);
        await execPromise(`sudo chmod 640 /etc/postfix/${file}`);
    }
    // 1. Install the pipe content-filter script.
    const scriptSrc = path.join(process.cwd(), 'scripts/relayfilter.py');
    await execPromise(`sudo cp ${shellEscape(scriptSrc)} /usr/local/bin/relayfilter.py`);
    await execPromise('sudo chmod 755 /usr/local/bin/relayfilter.py');
    // 2. Per-domain destination config the script reads ("host port threshold").
    await execPromise('sudo mkdir -p /etc/postfix/relay-dest');
    const domains = await client.query('SELECT domain_name, destination_host, destination_port, spam_threshold FROM mail_relay_domains WHERE enabled = true');
    await execPromise('sudo rm -f /etc/postfix/relay-dest/*').catch(() => { });
    for (const d of domains.rows) {
        const dom = validateDomainName(d.domain_name);
        const tmp = `/tmp/relaydest_${dom}`;
        await fs.writeFile(tmp, `${d.destination_host} ${d.destination_port} ${d.spam_threshold}\n`);
        await execPromise(`sudo mv ${shellEscape(tmp)} /etc/postfix/relay-dest/${shellEscape(dom)}`);
    }
    await execPromise('sudo chmod 644 /etc/postfix/relay-dest/* 2>/dev/null').catch(() => { });
    // 3. Quarantine spool (owned by vmail, the user the pipe runs as).
    await execPromise('sudo mkdir -p /var/mail/relay-quarantine');
    await execPromise('sudo chown vmail:vmail /var/mail/relay-quarantine');
    // 4. Define the relayfilter pipe transport in master.cf (idempotent).
    const masterHasFilter = await execPromise('grep -q "^relayfilter" /etc/postfix/master.cf && echo yes || echo no')
        .then(r => r.stdout.trim() === 'yes').catch(() => false);
    if (!masterHasFilter) {
        const entry = 'relayfilter unix - n n - 10 pipe\n  flags=Rq user=vmail argv=/usr/local/bin/relayfilter.py ${sender} ${recipient}\n';
        await fs.writeFile('/tmp/relayfilter.master', entry);
        await execPromise('cat /tmp/relayfilter.master | sudo tee -a /etc/postfix/master.cf > /dev/null');
        await execPromise('rm -f /tmp/relayfilter.master');
    }
    await execPromise(`sudo postconf -e ${shellEscape('relay_domains = pgsql:/etc/postfix/pgsql-relay-domains.cf')}`);
    await execPromise(`sudo postconf -e ${shellEscape('relay_recipient_maps = pgsql:/etc/postfix/pgsql-relay-recipients.cf')}`);
    // Preserve any existing transport_maps and append ours.
    const cur = await execPromise('sudo postconf -h transport_maps').then(r => r.stdout.trim()).catch(() => '');
    const relayT = 'pgsql:/etc/postfix/pgsql-relay-transport.cf';
    const transport = cur && !cur.includes(relayT) ? `${cur}, ${relayT}` : relayT;
    await execPromise(`sudo postconf -e ${shellEscape('transport_maps = ' + transport)}`);
    await execPromise('sudo postfix check');
    await execPromise('sudo systemctl reload postfix');
    console.log(`Mail relay configured (${domains.rowCount} domain(s)).`);
}
// Index relay-quarantine .eml files dropped by the pipe filter into the DB.
async function handleScanRelayQuarantine() {
    const base = '/var/mail/relay-quarantine';
    let dirs = [];
    try {
        dirs = await fs.readdir(base);
    }
    catch {
        return;
    }
    for (const domain of dirs) {
        const newDir = `${base}/${domain}/new`;
        let files = [];
        try {
            files = await fs.readdir(newDir);
        }
        catch {
            continue;
        }
        const relayRes = await client.query('SELECT id FROM mail_relay_domains WHERE domain_name = $1', [domain]);
        const relayId = relayRes.rows[0]?.id ?? null;
        for (const f of files) {
            if (!f.endsWith('.eml'))
                continue;
            const filePath = `${newDir}/${f}`;
            const existing = await client.query('SELECT 1 FROM mail_relay_quarantine WHERE file_path = $1', [filePath]);
            if (existing.rowCount)
                continue;
            let recipient = '', sender = '', score = '0';
            try {
                const meta = await fs.readFile(`${newDir}/${f.replace(/\.eml$/, '.meta')}`, 'utf8');
                recipient = /recipient=(.*)/.exec(meta)?.[1]?.trim() ?? '';
                sender = /sender=(.*)/.exec(meta)?.[1]?.trim() ?? '';
                score = /score=(.*)/.exec(meta)?.[1]?.trim() ?? '0';
            }
            catch { /* meta optional */ }
            let subject = '';
            try {
                const eml = await fs.readFile(filePath, 'utf8');
                subject = /^Subject:\s*(.*)$/im.exec(eml.slice(0, 8192))?.[1]?.trim() ?? '';
            }
            catch { /* ignore */ }
            await client.query(`INSERT INTO mail_relay_quarantine (relay_domain_id, recipient, sender, subject, spam_score, file_path)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (file_path) DO NOTHING`, [relayId, recipient, sender || null, subject || null, parseFloat(score) || 0, filePath]);
        }
    }
}
// Release a quarantined relay message: deliver it onward to the customer's server.
async function handleReleaseRelayQuarantine(payload) {
    const { id } = payload;
    const r = await client.query(`SELECT q.*, d.destination_host, d.destination_port
     FROM mail_relay_quarantine q JOIN mail_relay_domains d ON q.relay_domain_id = d.id
     WHERE q.id = $1 AND q.status = 'held'`, [id]);
    const item = r.rows[0];
    if (!item)
        return;
    // Re-inject via the local Postfix using sendmail; transport routes it onward.
    // Use python to SMTP it directly to the destination (loop-safe).
    const py = `import smtplib,sys
raw=open(${JSON.stringify(item.file_path)},'rb').read()
s=smtplib.SMTP(${JSON.stringify(item.destination_host)},${item.destination_port},timeout=30)
s.sendmail(${JSON.stringify(item.sender || '')},[${JSON.stringify(item.recipient)}],raw); s.quit()`;
    const tmp = `/tmp/relayrelease_${id}.py`;
    await fs.writeFile(tmp, py);
    await execPromise(`python3 ${shellEscape(tmp)}`);
    await fs.unlink(tmp).catch(() => { });
    await execPromise(`rm -f ${shellEscape(item.file_path)} ${shellEscape(item.file_path.replace(/\.eml$/, '.meta'))}`).catch(() => { });
    await client.query("UPDATE mail_relay_quarantine SET status='released', released_at=NOW() WHERE id=$1", [id]);
    console.log(`Released relay quarantine ${id} → ${item.destination_host}`);
}
async function handleDeleteRelayQuarantine(payload) {
    const { id } = payload;
    const r = await client.query("SELECT file_path FROM mail_relay_quarantine WHERE id=$1", [id]);
    const fp = r.rows[0]?.file_path;
    if (fp) {
        await execPromise(`rm -f ${shellEscape(fp)} ${shellEscape(String(fp).replace(/\.eml$/, '.meta'))}`).catch(() => { });
    }
    await client.query('DELETE FROM mail_relay_quarantine WHERE id=$1', [id]);
}
async function handleConfigureMailServer() {
    console.log('Configuring mail server...');
    try {
        const dbUser = process.env.DB_USER ?? 'superhost';
        const dbPassword = process.env.DB_PASSWORD ?? '';
        const dbHost = process.env.DB_HOST ?? 'localhost';
        const dbName = process.env.DB_NAME ?? 'superhost';
        // 1. Generate Postfix pgsql lookup files from env vars (no hardcoded credentials)
        const postfixConfigs = {
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
            // Route virtual delivery through Dovecot LMTP so sieve scripts run
            'virtual_transport = lmtp:unix:private/dovecot-lmtp',
            // Milters: OpenDKIM (signing) + spamass-milter (SpamAssassin) + clamav-milter (AV)
            'smtpd_milters = inet:localhost:12301, unix:spamass/spamass.sock, unix:clamav/clamav-milter.ctl',
            'non_smtpd_milters = inet:localhost:12301, unix:spamass/spamass.sock, unix:clamav/clamav-milter.ctl',
            'milter_default_action = accept',
        ];
        for (const setting of postconfSettings) {
            await execPromise(`sudo postconf -e ${shellEscape(setting)}`);
        }
        // 2b. Admin-configurable anti-spam infrastructure (greylisting, RBLs,
        //     attachment blocking) driven by server_settings keys (migration 021).
        await applyMailSpamInfraConfig();
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
        // ROTATION SAFEGUARD: Dovecot can load several passdb/userdb SQL config
        // files; if any keeps a stale DB password, auth silently breaks (as happened
        // after a password rotation). Sync the current password into every Dovecot
        // SQL config so re-running this task fully restores mail auth.
        await execPromise(`for f in $(sudo grep -rls "dbname *=* *${dbName}" /etc/dovecot/ 2>/dev/null | grep -v '\\.bak'); do ` +
            `sudo sed -i -E "s|password = [^[:space:]]+|password = ${dbPassword}|; s|password=[^[:space:]]+|password=${dbPassword}|" "$f"; done`).catch((e) => console.warn('Dovecot password sync warning:', e.message));
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

# editheader lets per-user "tag" rules prepend [SPAM] to the Subject.
# variables is enabled by default but we list it for clarity.
sieve_extensions = +editheader +variables
`;
        const tempQuota = '/tmp/91-superhost-plugins.conf';
        await fs.writeFile(tempQuota, dovecotPlugins);
        await execPromise(`sudo mv ${tempQuota} /etc/dovecot/conf.d/91-superhost-plugins.conf`);
        await execPromise('sudo chown root:root /etc/dovecot/conf.d/91-superhost-plugins.conf');
        // 4b. Expose Dovecot LMTP socket inside Postfix chroot so virtual_transport can reach it
        const dovecotLmtpConf = `# Superhost-managed: expose LMTP socket inside Postfix chroot for sieve delivery
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}

# Override Debian default: our SQL userdb stores full email addresses (user@domain),
# so don't strip the domain before lookup. 20-lmtp.conf strips it for /etc/passwd.
protocol lmtp {
  auth_username_format = %{user | lower}
}
`;
        const tempLmtp = '/tmp/92-superhost-lmtp.conf';
        await fs.writeFile(tempLmtp, dovecotLmtpConf);
        await execPromise(`sudo mv ${tempLmtp} /etc/dovecot/conf.d/92-superhost-lmtp.conf`);
        await execPromise('sudo chown root:root /etc/dovecot/conf.d/92-superhost-lmtp.conf');
        // 5. Ensure vmail user + /var/mail/vhosts exist
        await execPromise(`id vmail`).catch(async () => {
            await execPromise(`sudo groupadd -g 5000 vmail`).catch(() => { });
            await execPromise(`sudo useradd -g vmail -u 5000 vmail -d /var/mail`);
        });
        await execPromise('sudo mkdir -p /var/mail/vhosts');
        await execPromise('sudo chown -R vmail:vmail /var/mail');
        await execPromise('sudo chmod -R 770 /var/mail');
        // 6. SpamAssassin — managed local.cf. Crucially, add X-Spam-Level to ALL
        // mail (not just mail above the global score) so per-mailbox sieve
        // thresholds below the global required_score still work. report_safe 0
        // keeps the original message intact (no MIME wrapping) for quarantine.
        const saLocalCf = `# Superhost-managed — do not edit by hand
required_score 5.0
report_safe 0
add_header all Level _STARS(*)_
add_header all Status _YESNO_, score=_SCORE_ required=_REQD_ tests=_TESTS_
rewrite_header Subject [SPAM]
use_bayes 1
bayes_auto_learn 1
`;
        const tempSa = '/tmp/superhost-spamassassin.cf';
        await fs.writeFile(tempSa, saLocalCf);
        await execPromise(`sudo mv ${tempSa} /etc/spamassassin/local.cf`).catch((e) => console.warn('Could not write SpamAssassin local.cf:', e.message));
        await execPromise('sudo systemctl enable spamassassin').catch(() => { });
        await execPromise('sudo systemctl restart spamassassin').catch(() => execPromise('sudo systemctl start spamassassin').catch(() => { }));
        await execPromise('sudo systemctl restart spamass-milter').catch(() => { });
        // 7. Restart services
        await execPromise('sudo postfix check');
        await execPromise('sudo systemctl restart postfix');
        await execPromise('sudo systemctl restart dovecot');
        console.log('Mail server configuration updated successfully.');
    }
    catch (err) {
        console.error('Failed to configure mail server:', err);
        throw err;
    }
}
async function handleProvisionMailbox(payload) {
    const { email } = payload;
    if (!email || !email.includes('@'))
        throw new Error('Valid email address required');
    const [user, domain] = email.split('@');
    const maildir = `/var/mail/vhosts/${shellEscape(domain)}/${shellEscape(user)}`;
    // Create Maildir structure
    await execPromise(`sudo mkdir -p ${maildir}/new ${maildir}/cur ${maildir}/tmp`);
    await execPromise(`sudo chown -R vmail:vmail /var/mail/vhosts`);
    await execPromise(`sudo chmod -R 700 ${maildir}`);
    console.log(`Maildir provisioned for ${email}`);
}
async function handleChangeEmailPassword(payload) {
    const { mailUserId, passwordHash } = payload;
    if (!mailUserId || !passwordHash)
        throw new Error('mailUserId and passwordHash required');
    await client.query('UPDATE mail_users SET password_hash = $1 WHERE id = $2', [passwordHash, mailUserId]);
    console.log(`Email password updated for mailbox ${mailUserId}`);
}
async function handleApplyEmailQuota(payload) {
    const { email } = payload;
    if (!email)
        throw new Error('email required');
    // Recalculate stored quota usage — non-fatal if maildir doesn't exist yet
    await execPromise(`sudo doveadm quota recalc -u ${shellEscape(email)}`).catch((err) => {
        console.warn(`Quota recalc skipped for ${email}: ${err.message}`);
    });
    console.log(`Quota applied for ${email}`);
}
// ── Sieve script generation ────────────────────────────────────────────────────
function sieveStr(s) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
function sieveEnvelopeTest(pattern) {
    if (pattern.startsWith('@')) {
        return `envelope :domain :is "from" ${sieveStr(pattern.slice(1))}`;
    }
    return `envelope :is "from" ${sieveStr(pattern)}`;
}
function buildSieveScript(opts) {
    const { email, spamFilterEnabled, spamAction, spamScoreThreshold, globalAllows, globalBlocks, domainAllows, domainBlocks, mbAllows, mbBlocks, arEnabled, arMessage } = opts;
    // Precedence (most specific wins): mailbox → domain → global.
    const allAllows = [...mbAllows, ...domainAllows, ...globalAllows];
    const allBlocks = [...mbBlocks, ...domainBlocks, ...globalBlocks];
    const needFileinto = spamFilterEnabled && (allBlocks.length > 0 || spamAction === 'quarantine');
    const needEnvelope = spamFilterEnabled && (allAllows.length > 0 || allBlocks.length > 0);
    const needVacation = arEnabled && !!arMessage?.trim();
    const needEditheader = spamFilterEnabled && spamAction === 'tag';
    const exts = [];
    if (needFileinto)
        exts.push('fileinto');
    if (needEnvelope)
        exts.push('envelope');
    if (needVacation)
        exts.push('vacation');
    if (needEditheader)
        exts.push('editheader', 'variables');
    if (exts.length === 0)
        return '';
    const lines = [`require [${exts.map(e => `"${e}"`).join(', ')}];`, ''];
    if (spamFilterEnabled) {
        // Allow rules — whitelist bypasses all spam checks
        for (const p of allAllows) {
            lines.push(`if ${sieveEnvelopeTest(p)} {`, '  keep;', '  stop;', '}');
        }
        if (allAllows.length > 0)
            lines.push('');
        // Block rules — quarantine the message
        for (const p of allBlocks) {
            lines.push(`if ${sieveEnvelopeTest(p)} {`, '  fileinto "Quarantine";', '  stop;', '}');
        }
        if (allBlocks.length > 0)
            lines.push('');
        // Per-mailbox score threshold. SpamAssassin adds an X-Spam-Level header
        // with one '*' per integer score point; a message scoring >= N therefore
        // contains a run of N literal stars. :contains matches that substring, so
        // this honours the user's chosen threshold rather than SA's global score.
        if (spamAction !== 'deliver') {
            const stars = Math.max(1, Math.min(40, Math.round(spamScoreThreshold || 5)));
            lines.push(`if header :contains "X-Spam-Level" ${sieveStr('*'.repeat(stars))} {`);
            if (spamAction === 'quarantine') {
                lines.push('  fileinto "Quarantine";', '  stop;');
            }
            else {
                // tag — prepend [SPAM] to the Subject so it is visible in the inbox
                lines.push('  if header :matches "Subject" "*" { set "subj" "${1}"; }');
                lines.push('  deleteheader "Subject";');
                lines.push('  addheader :last "Subject" "[SPAM] ${subj}";');
                lines.push('  keep;', '  stop;');
            }
            lines.push('}', '');
        }
    }
    if (needVacation) {
        lines.push('vacation', '  :days 1', '  :subject "Auto-reply"', `  :from ${sieveStr(email)}`, `  ${sieveStr(arMessage)};`, '');
    }
    return lines.join('\n');
}
async function writeSieve(mailboxId, email, script) {
    const [user, domain] = email.split('@');
    const maildirBase = `/var/mail/vhosts/${domain}/${user}`;
    const sievePath = `${maildirBase}/.dovecot.sieve`;
    await execPromise(`sudo mkdir -p ${shellEscape(maildirBase)}`).catch(() => { });
    if (!script.trim()) {
        await execPromise(`sudo rm -f ${shellEscape(sievePath)}`).catch(() => { });
        return;
    }
    const temp = `/tmp/sieve_${mailboxId}.sieve`;
    await fs.writeFile(temp, script + '\n');
    await execPromise(`sudo mv ${shellEscape(temp)} ${shellEscape(sievePath)}`);
    await execPromise(`sudo chown vmail:vmail ${shellEscape(sievePath)}`);
    await execPromise(`sudo chmod 600 ${shellEscape(sievePath)}`);
    await execPromise(`sudo sievec ${shellEscape(sievePath)}`).catch(() => { });
}
async function ensureQuarantineMaildir(email) {
    const [user, domain] = email.split('@');
    const base = `/var/mail/vhosts/${domain}/${user}/.Quarantine`;
    for (const sub of ['cur', 'new', 'tmp']) {
        await execPromise(`sudo mkdir -p ${shellEscape(`${base}/${sub}`)}`).catch(() => { });
    }
    await execPromise(`sudo chown -R vmail:vmail ${shellEscape(base)}`).catch(() => { });
}
// ── SYNC_SPAM_RULES ────────────────────────────────────────────────────────────
async function handleSyncSpamRules(payload) {
    const { mailUserId } = payload;
    const mailboxRes = await client.query(`
    SELECT id, email, domain_id, spam_filter_enabled, spam_score_threshold, spam_action
    FROM mail_users
    WHERE ($1::int IS NULL OR id = $1)
  `, [mailUserId ?? null]);
    const globalRes = await client.query('SELECT sender_pattern, access_type FROM mail_global_rules');
    const globalAllows = globalRes.rows.filter(r => r.access_type === 'allow').map(r => r.sender_pattern);
    const globalBlocks = globalRes.rows.filter(r => r.access_type === 'block').map(r => r.sender_pattern);
    // Cache per-domain rules so repeated mailboxes in the same domain hit it once.
    const domainRuleCache = new Map();
    const getDomainRules = async (domainId) => {
        if (domainRuleCache.has(domainId))
            return domainRuleCache.get(domainId);
        const dr = await client.query('SELECT sender_pattern, access_type FROM mail_domain_rules WHERE domain_id = $1', [domainId]).catch(() => ({ rows: [] }));
        const rules = {
            allows: dr.rows.filter(r => r.access_type === 'allow').map(r => r.sender_pattern),
            blocks: dr.rows.filter(r => r.access_type === 'block').map(r => r.sender_pattern),
        };
        domainRuleCache.set(domainId, rules);
        return rules;
    };
    for (const mailbox of mailboxRes.rows) {
        try {
            const mbRes = await client.query('SELECT sender_pattern, access_type FROM mail_access_control WHERE mail_user_id = $1', [mailbox.id]);
            const mbAllows = mbRes.rows.filter(r => r.access_type === 'allow').map(r => r.sender_pattern);
            const mbBlocks = mbRes.rows.filter(r => r.access_type === 'block').map(r => r.sender_pattern);
            const domainRules = await getDomainRules(mailbox.domain_id);
            const arRes = await client.query('SELECT message, enabled FROM mail_autoresponders WHERE mail_user_id = $1', [mailbox.id]);
            const ar = arRes.rows[0];
            const script = buildSieveScript({
                email: mailbox.email,
                spamFilterEnabled: mailbox.spam_filter_enabled,
                spamAction: mailbox.spam_action ?? 'quarantine',
                spamScoreThreshold: Number(mailbox.spam_score_threshold) || 5,
                globalAllows, globalBlocks,
                domainAllows: domainRules.allows, domainBlocks: domainRules.blocks,
                mbAllows, mbBlocks,
                arEnabled: ar?.enabled ?? false,
                arMessage: ar?.message ?? '',
            });
            await writeSieve(mailbox.id, mailbox.email, script);
            if (mailbox.spam_filter_enabled) {
                await ensureQuarantineMaildir(mailbox.email);
            }
            console.log(`Spam rules synced for ${mailbox.email}`);
        }
        catch (err) {
            console.error(`Failed to sync spam rules for mailbox ${mailbox.id}:`, err.message);
        }
    }
}
// ── SCAN_QUARANTINE_FOLDERS ────────────────────────────────────────────────────
async function handleScanQuarantineFolders(payload) {
    const { mailUserId } = payload;
    const mailboxRes = await client.query(`SELECT id, email FROM mail_users WHERE ($1::int IS NULL OR id = $1) AND spam_filter_enabled = true`, [mailUserId ?? null]);
    let found = 0;
    for (const mailbox of mailboxRes.rows) {
        try {
            const [user, domain] = mailbox.email.split('@');
            const qBase = `/var/mail/vhosts/${domain}/${user}/.Quarantine`;
            for (const sub of ['new', 'cur']) {
                const dir = `${qBase}/${sub}`;
                let listing = '';
                try {
                    const r = await execPromise(`sudo ls -1 ${shellEscape(dir)} 2>/dev/null`);
                    listing = r.stdout.trim();
                }
                catch {
                    continue;
                }
                if (!listing)
                    continue;
                for (const filename of listing.split('\n').filter(Boolean)) {
                    const filePath = `${dir}/${filename}`;
                    const existing = await client.query('SELECT id FROM mail_quarantine WHERE file_path = $1 AND released_at IS NULL', [filePath]);
                    if ((existing.rowCount ?? 0) > 0)
                        continue;
                    let sender = '', subject = '', spamScore = null;
                    try {
                        const { stdout } = await execPromise(`sudo head -150 ${shellEscape(filePath)}`);
                        const angleMatch = stdout.match(/^From:\s*.*?<([^>]+)>/mi);
                        const plainMatch = stdout.match(/^From:\s*(\S+@\S+)/mi);
                        sender = (angleMatch?.[1] ?? plainMatch?.[1] ?? '').trim();
                        const subjectMatch = stdout.match(/^Subject:\s*(.+?)(?=\r?\n[^\s]|\r?\n\r?\n|$)/mis);
                        if (subjectMatch)
                            subject = subjectMatch[1].replace(/\r?\n\s+/g, ' ').trim();
                        const scoreMatch = stdout.match(/^X-Spam-Score:\s*([\d.-]+)/mi)
                            ?? stdout.match(/score=([\d.-]+)/i);
                        if (scoreMatch)
                            spamScore = parseFloat(scoreMatch[1]);
                    }
                    catch { /* unreadable — still record it */ }
                    // ClamAV scan — clamdscan returns exit 1 if infected, stdout: "file: VIRUS.NAME FOUND"
                    let virusName = null;
                    try {
                        const { stdout: clamOut } = await execPromise(`sudo clamdscan --no-summary --infected ${shellEscape(filePath)} 2>/dev/null || true`);
                        const virusMatch = clamOut.match(/:\s+(.+?)\s+FOUND/i);
                        if (virusMatch)
                            virusName = virusMatch[1].trim();
                    }
                    catch { /* clamd unavailable — skip */ }
                    await client.query(`
            INSERT INTO mail_quarantine (mail_user_id, sender, subject, spam_score, virus_name, file_path)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
          `, [mailbox.id, sender || 'unknown', subject || null, spamScore, virusName, filePath]);
                    found++;
                }
            }
        }
        catch (err) {
            console.error(`Quarantine scan failed for mailbox ${mailbox.id}:`, err.message);
        }
    }
    if (found > 0)
        console.log(`Quarantine scan: recorded ${found} new emails`);
}
// ── UPDATE_AUTORESPONDER (updated to include spam rules) ───────────────────────
async function handleUpdateAutoresponder(payload) {
    const { email } = payload;
    if (!email || !email.includes('@'))
        throw new Error('Valid email address required');
    // Find the mailbox id and delegate to handleSyncSpamRules, which reads all
    // current DB state (spam rules + autoresponder) and writes a combined script.
    const mbRes = await client.query('SELECT id FROM mail_users WHERE email = $1', [email]);
    if (mbRes.rows.length === 0) {
        console.warn(`handleUpdateAutoresponder: mailbox not found for ${email}`);
        return;
    }
    await handleSyncSpamRules({ mailUserId: mbRes.rows[0].id });
    console.log(`Auto-responder updated for ${email}`);
}
async function handleReleaseQuarantine(payload) {
    const { id, filePath, recipient } = payload;
    if (!filePath || !recipient)
        throw new Error('filePath and recipient are required');
    try {
        const [user, domain] = recipient.split('@');
        const destDir = `/var/mail/vhosts/${domain}/${user}/new`;
        const fileName = path.basename(filePath);
        await execPromise(`sudo mkdir -p ${destDir}`);
        await execPromise(`sudo mv ${shellEscape(filePath)} ${shellEscape(destDir + '/' + fileName)}`);
        await execPromise(`sudo chown vmail:vmail ${shellEscape(destDir + '/' + fileName)}`);
        // Mark as released (keep for FP stats; purge job cleans up after 7 days)
        await client.query('UPDATE mail_quarantine SET released_at = NOW() WHERE id = $1', [id]);
        // A released message is a confirmed false-positive → teach Bayes it's ham.
        await learnMessage(destDir + '/' + fileName, 'ham');
        console.log(`Released quarantined email ${id} to ${recipient}.`);
    }
    catch (err) {
        console.error(`Failed to release quarantine for ${id}:`, err);
        throw err;
    }
}
/**
 * Feed a message to SpamAssassin's Bayes classifier. Idempotent: each file path
 * is learned at most once (tracked in mail_learn_log) so repeated actions don't
 * skew the corpus. Non-fatal — a learn failure never breaks the caller.
 */
async function learnMessage(filePath, type) {
    const p = String(filePath ?? '');
    if (!p || !p.startsWith('/var/mail/vhosts/') || p.includes('..') || /[\r\n\x00]/.test(p)) {
        console.warn(`learnMessage: refusing suspicious path ${p}`);
        return;
    }
    try {
        const ins = await client.query(`INSERT INTO mail_learn_log (learn_type, file_path) VALUES ($1, $2)
       ON CONFLICT (file_path) DO NOTHING RETURNING id`, [type, p]);
        if (ins.rowCount === 0)
            return; // already learned
        await execPromise(`sudo sa-learn --${type} ${shellEscape(p)}`);
        console.log(`sa-learn --${type} ${p}`);
    }
    catch (err) {
        console.warn(`sa-learn --${type} failed for ${p}: ${err.message}`);
    }
}
// Mark an inbox/quarantine message as spam and retrain Bayes (user "Report spam").
async function handleLearnSpam(payload) {
    const { filePath } = payload;
    if (!filePath)
        throw new Error('filePath required');
    await learnMessage(filePath, 'spam');
}
function htmlEscape(s) {
    return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
async function handleSendSpamDigest(payload) {
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
            if (qRes.rowCount === 0)
                continue;
            console.log(`Sending spam digest to ${user.email} with ${qRes.rowCount} items...`);
            const emailDomain = user.email.split('@')[1] ?? process.env.MASTER_DOMAIN;
            const dashBase = `https://spam.${emailDomain}/my-spam`;
            const rows = qRes.rows.map((item) => {
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
            const masterDomain = process.env.MASTER_DOMAIN ?? 'localhost';
            const rawSubject = `Daily Spam Digest for ${user.email}`;
            const encodedSubject = `=?UTF-8?B?${Buffer.from(rawSubject).toString('base64')}?=`;
            const fullMessage = [
                `From: Superhost Spam Filter <noreply@${masterDomain}>`,
                `To: ${user.email}`,
                `Subject: ${encodedSubject}`,
                'MIME-Version: 1.0',
                'Content-Type: text/html; charset=utf-8',
                '',
                htmlBody,
            ].join('\r\n');
            const tempMail = `/tmp/digest_${user.id}.eml`;
            await fs.writeFile(tempMail, fullMessage);
            await execPromise(`/usr/sbin/sendmail -t < ${shellEscape(tempMail)}`);
            await fs.rm(tempMail);
        }
    }
    catch (err) {
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
            }
            catch { /* file may already be gone */ }
        }
    }
    if (expired.rows.length > 0) {
        await client.query('DELETE FROM mail_quarantine WHERE id = ANY($1)', [expired.rows.map((r) => r.id)]);
        console.log(`Purged ${expired.rows.length} expired quarantine records`);
    }
}
// ── REFRESH_MAIL_STATS ─────────────────────────────────────────────────────────
async function handleRefreshMailStats() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    // Count emails delivered to Dovecot today by parsing the Postfix mail log.
    // Each "status=sent" from a postfix/lmtp process represents one delivery to Dovecot
    // (and thus one email scanned by SpamAssassin/Sieve).
    let totalReceived = 0;
    try {
        const { stdout } = await execPromise(`sudo grep "$(date +'%b %e')" /var/log/mail.log 2>/dev/null | grep "postfix/lmtp" | grep -c "status=sent" || echo 0`);
        totalReceived = parseInt(stdout.trim(), 10) || 0;
    }
    catch { /* best effort — log may not exist or be unreadable */ }
    await client.query(`
    INSERT INTO mail_server_stats (date, total_received, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (date) DO UPDATE SET
      total_received = GREATEST(EXCLUDED.total_received, mail_server_stats.total_received),
      updated_at = NOW()
  `, [today, totalReceived]);
    console.log(`Mail stats refreshed: ${totalReceived} received today (${today})`);
}
async function handleScanMalware(payload, taskId) {
    const { username, userId } = payload;
    if (!username || !userId)
        throw new Error('Username and userId are required');
    const scanPath = `/home/${username}/public_html`;
    // 1. Create a scan record
    const scanRes = await client.query('INSERT INTO malware_scans (user_id, scan_path) VALUES ($1, $2) RETURNING id', [userId, scanPath]);
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
        }
        catch (err) {
            // If a virus is found, execPromise will throw because exit code is 1
            if (err.code === 1 && err.stdout) {
                scanOutput = err.stdout;
            }
            else {
                throw err;
            }
        }
        // Parse the output to count infections
        const match = scanOutput.match(/Infected files:\s+(\d+)/);
        if (match && match[1]) {
            infectionsFound = parseInt(match[1], 10);
        }
        // 3. Update the scan record
        await client.query('UPDATE malware_scans SET status = $1, infections_found = $2, report = $3, completed_at = NOW() WHERE id = $4', ['completed', infectionsFound, scanOutput, scanId]);
        // Also update the task payload for the API
        await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ scanId, infectionsFound }), taskId]);
        console.log(`Malware scan completed for ${username}. Infections found: ${infectionsFound}`);
    }
    catch (err) {
        console.error(`Failed to scan malware for ${username}:`, err);
        await client.query('UPDATE malware_scans SET status = $1, report = $2, completed_at = NOW() WHERE id = $3', ['failed', err.message, scanId]);
        throw err;
    }
}
async function handleCreateBackup(payload, taskId) {
    const { userId, username, backupId } = payload;
    if (!username || !userId || !backupId)
        throw new Error('username, userId, and backupId are required');
    const homeDir = `/home/${username}`;
    const backupFileName = `${username}_backup_${Date.now()}.tar.gz`;
    const backupDir = path.join(process.cwd(), 'backups');
    const backupPath = path.join(backupDir, backupFileName);
    try {
        console.log(`Starting backup for ${username}...`);
        await fs.mkdir(backupDir, { recursive: true });
        // 1. Dump MySQL Databases
        const dbRes = await client.query('SELECT db_name FROM databases WHERE user_id = $1', [userId]);
        const dumpFiles = [];
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
            for (const dump of dumpFiles) {
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
        await client.query('UPDATE backups SET status = $1, file_path = $2, size_bytes = $3, completed_at = NOW() WHERE id = $4', ['completed', backupPath, stats.size, backupId]);
        console.log(`Backup completed for ${username}: ${backupPath}`);
    }
    catch (err) {
        console.error(`Failed to create backup for ${username}:`, err);
        await client.query('UPDATE backups SET status = $1, completed_at = NOW() WHERE id = $2', ['failed', backupId]);
        throw err;
    }
}
async function handleRestoreBackup(payload, taskId) {
    const { userId, username, backupId } = payload;
    if (!username || !userId || !backupId)
        throw new Error('username, userId, and backupId are required');
    try {
        const backupRes = await client.query('SELECT file_path FROM backups WHERE id = $1 AND user_id = $2', [backupId, userId]);
        if (backupRes.rows.length === 0)
            throw new Error('Backup not found');
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
        }
        catch (e) {
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
                }
                finally {
                    await connection.end();
                }
                await execPromise(`mysql -u ${dbUser} -p'${dbPass}' ${dbName} < ${path.join(tempDir, file)}`);
            }
        }
        // 4. Clean up
        await execPromise(`rm -rf ${tempDir}`);
        console.log(`Restore completed for ${username}.`);
    }
    catch (err) {
        console.error(`Failed to restore backup for ${username}:`, err);
        throw err;
    }
}
async function handleAddVirtualIp(payload) {
    const { ipAddress, interface: iface } = payload;
    if (!ipAddress || !iface)
        throw new Error('ipAddress and interface are required');
    try {
        // Add the IP to the network interface dynamically
        // In production, you would also persist this to /etc/network/interfaces or netplan
        await execPromise(`sudo ip addr add ${ipAddress}/32 dev ${iface.split(':')[0]} label ${iface}`);
        console.log(`Added virtual IP ${ipAddress} to interface ${iface}`);
    }
    catch (err) {
        if (!err.message.includes('File exists')) { // Ignore if IP is already assigned
            console.error(`Failed to add virtual IP ${ipAddress}:`, err);
            throw err;
        }
    }
}
async function handleRemoveVirtualIp(payload) {
    const { ipAddress, interface: iface } = payload;
    if (!ipAddress || !iface)
        throw new Error('ipAddress and interface are required');
    try {
        await execPromise(`sudo ip addr del ${ipAddress}/32 dev ${iface.split(':')[0]} label ${iface}`);
        console.log(`Removed virtual IP ${ipAddress} from interface ${iface}`);
    }
    catch (err) {
        if (!err.message.includes('Cannot assign requested address')) {
            console.error(`Failed to remove virtual IP ${ipAddress}:`, err);
            throw err;
        }
    }
}
async function handleAssignVirtualIp(payload) {
    const { domainName, ipAddress } = payload;
    if (!domainName)
        throw new Error('domainName is required');
    try {
        const configPath = `/etc/nginx/sites-available/${domainName}`;
        let config = await fs.readFile(configPath, 'utf8');
        // Replace default listen 80; with listen IP:80;
        if (ipAddress) {
            config = config.replace(/listen 80;/g, `listen ${ipAddress}:80;`);
            config = config.replace(/listen \[::\]:80;/g, ''); // Remove IPv6 for dedicated IPv4
        }
        else {
            // Revert to shared IP if unassigned
            config = config.replace(/listen .*:80;/g, `listen 80;`);
        }
        await fs.writeFile(configPath, config);
        await execPromise('nginx -t');
        await execPromise('systemctl reload nginx');
        console.log(`Updated Nginx config for ${domainName} with IP ${ipAddress || 'shared'}`);
    }
    catch (err) {
        console.error(`Failed to assign IP to ${domainName}:`, err);
        throw err;
    }
}
async function handleCheckNodeHealth(payload) {
    const { nodeId } = payload;
    const ipAddress = validateIpAddress(payload?.ipAddress);
    if (!nodeId)
        throw new Error('nodeId is required');
    try {
        // Use array-style exec to avoid shell injection — execFile would be better, but execPromise wraps exec
        // IP is validated to be a safe IPv4/IPv6 address
        const { stdout } = await execPromise(`ping -c 1 -W 2 ${shellEscape(ipAddress)}`);
        const status = stdout.includes('1 received') ? 'online' : 'offline';
        await client.query('UPDATE cluster_nodes SET status = $1, last_seen = NOW() WHERE id = $2', [status, nodeId]);
    }
    catch {
        await client.query('UPDATE cluster_nodes SET status = $1 WHERE id = $2', ['offline', nodeId]);
    }
}
async function handleGetMasterSshKey(taskId) {
    try {
        // Return only the PUBLIC key — never expose the private key
        const { stdout } = await execPromise('sudo cat /root/.ssh/id_ed25519.pub');
        await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: stdout.trim() }), taskId]);
        console.log('Master SSH public key retrieved.');
    }
    catch (err) {
        console.error('Failed to get master SSH key:', err);
        throw err;
    }
}
// Known hosts file for cluster nodes — avoids disabling StrictHostKeyChecking
const CLUSTER_KNOWN_HOSTS = '/etc/superhost/cluster_known_hosts';
async function handleSyncClusterConfig(payload) {
    const ipAddress = validateIpAddress(payload?.ipAddress);
    // Verify this IP is a registered cluster node before syncing
    const nodeRes = await client.query("SELECT id FROM cluster_nodes WHERE ip_address = $1 AND status != 'removed'", [ipAddress]);
    if (nodeRes.rows.length === 0) {
        throw new Error(`IP ${ipAddress} is not a registered cluster node`);
    }
    const sshOpts = `-o StrictHostKeyChecking=yes -o UserKnownHostsFile=${CLUSTER_KNOWN_HOSTS} -o BatchMode=yes`;
    try {
        console.log(`Starting cluster config sync for node ${ipAddress}...`);
        // 1. Push Nginx configurations via rsync with strict host key checking
        await execPromise(`sudo rsync -az -e ${shellEscape(`ssh ${sshOpts}`)} /etc/nginx/sites-available/ root@${shellEscape(ipAddress)}:/etc/nginx/sites-available/`);
        // 2. Reload Nginx on remote node via SSH
        await execPromise(`sudo ssh ${sshOpts} root@${shellEscape(ipAddress)} "systemctl reload nginx"`);
        console.log(`Successfully synchronized with node ${ipAddress}.`);
    }
    catch (err) {
        console.error(`Failed to sync with node ${ipAddress}:`, err);
        throw err;
    }
}
async function handleListFiles(payload, taskId) {
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
    await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result }), taskId]);
}
async function handleReadFile(payload, taskId) {
    const username = validateUsername(payload?.username);
    const baseDir = `/home/${username}/public_html`;
    const absolutePath = await validatePath(payload?.filePath ?? '', baseDir);
    const content = await fs.readFile(absolutePath, 'utf8');
    await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: content }), taskId]);
}
async function handleWriteFile(payload) {
    const username = validateUsername(payload?.username);
    const baseDir = `/home/${username}/public_html`;
    const absolutePath = await validatePath(payload?.filePath ?? '', baseDir);
    const { content } = payload;
    if (typeof content !== 'string')
        throw new Error('Content must be a string');
    if (content.length > 10 * 1024 * 1024)
        throw new Error('File content too large (max 10 MB)');
    await fs.writeFile(absolutePath, content, { mode: 0o644 });
    await execPromise(`sudo chown ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(absolutePath)}`);
}
async function handleDeleteFile(payload) {
    const username = validateUsername(payload?.username);
    const baseDir = `/home/${username}/public_html`;
    const absolutePath = await validatePath(payload?.filePath ?? '', baseDir);
    await fs.rm(absolutePath, { recursive: true, force: true });
}
// Delete a quarantined mail file, then remove its DB row. Quarantine files
// live under /var/mail/vhosts/<domain>/<user>/.Quarantine and are owned by
// vmail, so they're outside the file-manager's home-dir sandbox — this handler
// validates the path is genuinely a quarantine file before rm. Deleting the
// file BEFORE the row prevents the 5-minute scanner from resurrecting it.
async function handleDeleteQuarantineFile(payload) {
    const { quarantineId, filePath } = payload;
    const p = String(filePath ?? '');
    // Defence in depth: must be a real quarantine path with no traversal/metachars.
    const ok = p.startsWith('/var/mail/vhosts/')
        && p.includes('/.Quarantine/')
        && !p.includes('..')
        && !/[\r\n\x00]/.test(p);
    if (p && ok) {
        // Deleting a quarantined item confirms it as spam → reinforce Bayes before
        // the file is gone.
        await learnMessage(p, 'spam');
        await execPromise(`sudo rm -f ${shellEscape(p)}`).catch((e) => console.warn(`Quarantine file rm failed for ${p}: ${e.message}`));
    }
    else if (p) {
        console.warn(`Refusing to delete non-quarantine path: ${p}`);
    }
    if (quarantineId != null && Number.isInteger(Number(quarantineId))) {
        await client.query('DELETE FROM mail_quarantine WHERE id = $1', [quarantineId]);
    }
}
async function handleZipFiles(payload) {
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
    const files = Array.isArray(payload?.files) ? payload.files : [];
    const safeFiles = await Promise.all(files.map(f => validatePath(f, dirPath)));
    // Build command with properly escaped arguments
    const fileArgs = safeFiles.map(f => shellEscape(path.relative(dirPath, f))).join(' ');
    await execPromise(`cd ${shellEscape(dirPath)} && zip -r ${shellEscape(zipName)} ${fileArgs}`);
    await execPromise(`sudo chown ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(path.join(dirPath, zipName))}`);
}
async function handleUnzipFile(payload) {
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
    const sendNotification = async (message) => {
        try {
            const res = await client.query('SELECT * FROM notification_settings WHERE id = 1');
            const settings = res.rows[0];
            if (!settings || !settings.is_enabled)
                return;
            if (settings.slack_webhook_url) {
                try {
                    // Validate webhook URL against allowed prefixes (SSRF prevention)
                    const safeUrl = validateWebhookUrl(settings.slack_webhook_url);
                    await axios.post(safeUrl, { text: message }, { timeout: 5000 });
                }
                catch (urlErr) {
                    console.error('Invalid Slack webhook URL:', urlErr instanceof Error ? urlErr.message : urlErr);
                }
            }
            if (settings.telegram_bot_token && settings.telegram_chat_id) {
                // Telegram bot token: validate format (digits:alphanumeric)
                if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(settings.telegram_bot_token)) {
                    console.error('Invalid Telegram bot token format');
                }
                else {
                    const url = `https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`;
                    await axios.post(url, { chat_id: settings.telegram_chat_id, text: message }, { timeout: 5000 });
                }
            }
        }
        catch (err) {
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
            await client.query('INSERT INTO server_metrics (cpu_percent, ram_used_mb, network_rx_mbps, network_tx_mbps) VALUES ($1, $2, $3, $4)', [cpu, ram, rx || 0, tx || 0]);
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
        }
        catch (err) {
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
                if (!logPath)
                    continue;
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
        }
        catch (err) {
            console.error('Failed to collect traffic stats:', err);
        }
    };
    // Schedules — wrap in try/catch so a single failure doesn't stop future runs
    setInterval(async () => {
        try {
            await collectMetrics();
        }
        catch (err) {
            console.error('collectMetrics error:', err instanceof Error ? err.message : err);
        }
    }, 5 * 60 * 1000);
    setInterval(async () => {
        try {
            await collectTrafficStats();
        }
        catch (err) {
            console.error('collectTrafficStats error:', err instanceof Error ? err.message : err);
        }
    }, 15 * 60 * 1000);
    // Scan quarantine folders every 5 minutes to populate mail_quarantine table
    setInterval(async () => {
        try {
            await handleScanQuarantineFolders({});
        }
        catch (err) {
            console.error('Quarantine scan error:', err instanceof Error ? err.message : err);
        }
    }, 5 * 60 * 1000);
    // Index relay-gateway quarantine (spam held for external-mail customers)
    setInterval(async () => {
        try {
            await handleScanRelayQuarantine();
        }
        catch (err) {
            console.error('Relay quarantine scan error:', err instanceof Error ? err.message : err);
        }
    }, 2 * 60 * 1000);
    // Refresh Postfix delivery stats every hour
    setInterval(async () => {
        try {
            await handleRefreshMailStats();
        }
        catch (err) {
            console.error('Refresh mail stats error:', err instanceof Error ? err.message : err);
        }
    }, 60 * 60 * 1000);
    handleRefreshMailStats().catch(err => console.error('Initial mail stats error:', err));
    // Enforce quarantine retention (30-day expiry, 7-day post-release) daily,
    // plus once shortly after startup. Without this, quarantine grows forever.
    setInterval(async () => {
        try {
            await handlePurgeExpiredQuarantine();
        }
        catch (err) {
            console.error('Quarantine purge error:', err instanceof Error ? err.message : err);
        }
    }, 24 * 60 * 60 * 1000);
    handlePurgeExpiredQuarantine().catch(err => console.error('Initial quarantine purge error:', err));
    // Purge expired token-blocklist + FIDO2 challenge rows daily so they don't
    // accumulate (the blocklist only needs entries until the token's own expiry).
    setInterval(async () => {
        try {
            await client.query('DELETE FROM token_blocklist WHERE expires_at < NOW()');
            await client.query('DELETE FROM fido2_challenges WHERE expires_at < NOW()').catch(() => { });
        }
        catch (err) {
            console.error('Token blocklist cleanup error:', err instanceof Error ? err.message : err);
        }
    }, 24 * 60 * 60 * 1000);
    // Daily spam digest. Checked hourly but guarded by a stored date so it fires
    // at most once per UTC day regardless of how often the worker restarts.
    const maybeSendDailyDigest = async () => {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
        const res = await client.query("SELECT value FROM server_settings WHERE key = 'last_spam_digest_date'").catch(() => ({ rows: [] }));
        if (res.rows[0]?.value === today)
            return;
        await client.query(`INSERT INTO server_settings (key, value) VALUES ('last_spam_digest_date', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [today]);
        await handleSendSpamDigest({});
    };
    setInterval(() => {
        maybeSendDailyDigest().catch(err => console.error('Spam digest error:', err instanceof Error ? err.message : err));
    }, 60 * 60 * 1000);
    collectMetrics().catch(err => console.error('Initial collectMetrics error:', err));
    collectTrafficStats().catch(err => console.error('Initial collectTrafficStats error:', err));
    // --- System Security Log Monitor (SSH Brute Force Protection) ---
    const startAuthLogWatcher = () => {
        console.log('Starting system security log monitor...');
        // spawn is imported at the top of the file
        const tail = spawn('sudo', ['tail', '-f', '-n', '0', '/var/log/auth.log']);
        tail.stdout.on('data', async (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                const match = line.match(/Failed password for (?:invalid user )?(\S+) from ([\d\.]+) port/);
                if (match) {
                    const rawIp = match[2] ?? '';
                    // Only act on valid IPs — skip if not parseable
                    try {
                        const ipAddress = validateIpAddress(rawIp);
                        const checkRes = await client.query("SELECT count(*) FROM login_attempts WHERE ip_address = $1 AND success = false AND created_at > NOW() - INTERVAL '15 minutes'", [ipAddress]);
                        if (parseInt(checkRes.rows[0]?.count ?? '0') >= 5) {
                            console.warn(`SECURITY: Brute force detected from ${ipAddress}. Blocking...`);
                            await handleFirewallBlockIp({ ipAddress });
                            await sendNotification(`🛡️ IP blocked due to brute force: ${ipAddress}`);
                        }
                    }
                    catch (e) {
                        console.error('Failed to process security log entry:', e instanceof Error ? e.message : e);
                    }
                }
            }
        });
        tail.on('error', (err) => {
            console.error('Auth log watcher error:', err.message);
        });
        tail.on('close', (code) => {
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
                const task = JSON.parse(msg.payload);
                // Don't await — process tasks concurrently; locking prevents double-processing
                handleTask(task).catch(err => console.error(`Unhandled task error for ${task.command}:`, err instanceof Error ? err.message : err));
            }
            catch (parseErr) {
                console.error('Failed to parse task notification payload:', parseErr);
            }
        }
    });
    // Pick up any tasks that were pending before this worker started
    const res = await client.query('SELECT * FROM tasks WHERE status = \'pending\' ORDER BY created_at ASC');
    for (const task of res.rows) {
        handleTask(task).catch(err => console.error(`Unhandled startup task error for ${task.command}:`, err instanceof Error ? err.message : err));
    }
    // Polling fallback — catches tasks missed if LISTEN/NOTIFY is delayed or dropped
    setInterval(async () => {
        try {
            const pendingRes = await client.query("SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10");
            for (const task of pendingRes.rows) {
                handleTask(task).catch(err => console.error(`Unhandled poll task error for ${task.command}:`, err instanceof Error ? err.message : err));
            }
        }
        catch (pollErr) {
            console.error('Task poll error:', pollErr instanceof Error ? pollErr.message : pollErr);
        }
    }, 5000);
}
// --- Missing Handlers ---
async function handleGetSystemStats(taskId) {
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
        await client.query('UPDATE tasks SET status = $1, payload = payload || $2, updated_at = NOW() WHERE id = $3', ['completed', JSON.stringify({ result }), taskId]);
    }
    catch (err) {
        console.error('Failed to get system stats:', err);
        throw err;
    }
}
async function handleFirewallBlockIp(payload) {
    const ipAddress = validateIpAddress(payload?.ipAddress);
    await execPromise(`sudo ufw deny from ${shellEscape(ipAddress)}`);
    console.log(`Firewall blocked IP: ${ipAddress}`);
}
async function handleFirewallUnblockIp(payload) {
    const ipAddress = validateIpAddress(payload?.ipAddress);
    await execPromise(`sudo ufw delete deny from ${shellEscape(ipAddress)}`);
    console.log(`Firewall unblocked IP: ${ipAddress}`);
}
async function handleGetServicesStatus(taskId) {
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
    const result = [];
    for (const svc of candidates) {
        try {
            const { stdout: activeOut } = await execPromise(`systemctl is-active ${shellEscape(svc)} 2>/dev/null || true`);
            const activeStr = activeOut.trim();
            if (activeStr === 'not-found' || activeStr === '')
                continue;
            const status = activeStr === 'active' ? 'active'
                : activeStr === 'failed' ? 'failed'
                    : 'inactive';
            let autostart = false;
            try {
                const { stdout: enabledOut } = await execPromise(`systemctl is-enabled ${shellEscape(svc)} 2>/dev/null || true`);
                autostart = enabledOut.trim() === 'enabled';
            }
            catch { /* not enabled */ }
            result.push({ name: svc, status, autostart });
        }
        catch { /* service not installed on this system */ }
    }
    await client.query('UPDATE tasks SET status = $1, payload = payload || $2, updated_at = NOW() WHERE id = $3', ['completed', JSON.stringify({ result }), taskId]);
}
async function handleManageService(taskId, payload) {
    const service = validateServiceName(payload?.service);
    const action = validateServiceAction(payload?.action);
    // If restarting/stopping the worker itself, mark the task done FIRST —
    // the process will die before the outer handler can write 'completed'.
    const selfAffecting = service === 'superhost-worker' &&
        (action === 'restart' || action === 'stop');
    if (selfAffecting) {
        await client.query("UPDATE tasks SET status = 'completed', payload = payload || $1, updated_at = NOW() WHERE id = $2", [JSON.stringify({ message: `${service} ${action} initiated` }), taskId]);
    }
    await execPromise(`systemctl ${action} ${shellEscape(service)}`);
    console.log(`Service ${service} ${action} executed.`);
}
async function handleGetBindStatus(taskId) {
    const isActive = await execPromise('systemctl is-active bind9').then(r => r.stdout.trim() === 'active').catch(() => false);
    // bind9 is an alias for named.service — is-enabled returns 'alias'; treat that as enabled
    const isEnabled = await execPromise('systemctl is-enabled bind9').then(r => ['enabled', 'alias'].includes(r.stdout.trim())).catch(() => false);
    let version = '';
    try {
        const { stdout } = await execPromise('named -v 2>&1 || true');
        version = stdout.trim().split('\n')[0] ?? '';
    }
    catch { /* bind not installed */ }
    // Read zone names from both managed file and local config
    let zones = [];
    try {
        // -h suppresses filename prefix when searching multiple files
        const { stdout } = await execPromise("grep -hoP '(?<=zone \")[^\"]+' /etc/bind/named.conf.zones /etc/bind/named.conf.local 2>/dev/null || true");
        zones = [...new Set(stdout.trim().split('\n').filter(Boolean))];
    }
    catch { /* ignore */ }
    await client.query('UPDATE tasks SET status=$1, payload=payload||$2, updated_at=NOW() WHERE id=$3', ['completed', JSON.stringify({ isActive, isEnabled, version, zones }), taskId]);
}
async function handleManageBind(taskId, payload) {
    const allowed = ['start', 'stop', 'restart', 'reload'];
    const action = payload?.action;
    if (!allowed.includes(action))
        throw new Error(`Invalid bind action: ${action}`);
    await execPromise(`systemctl ${shellEscape(action)} bind9`);
    const isActive = await execPromise('systemctl is-active bind9').then(r => r.stdout.trim() === 'active').catch(() => false);
    await client.query('UPDATE tasks SET status=$1, payload=payload||$2, updated_at=NOW() WHERE id=$3', ['completed', JSON.stringify({ action, isActive }), taskId]);
}
async function handleGetUpdates(taskId) {
    const { stdout } = await execPromise("apt list --upgradable");
    const updates = stdout.split('\n').filter(l => l.includes('/')).length;
    await client.query('UPDATE tasks SET status = $1, payload = payload || $2, updated_at = NOW() WHERE id = $3', ['completed', JSON.stringify({ count: updates }), taskId]);
}
async function handleInstallUpdates(taskId) {
    await execPromise("sudo apt-get update && sudo apt-get upgrade -y");
    await client.query('UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', taskId]);
}
async function handleManageAutoUpdates(payload) {
    const { enabled } = payload;
    if (enabled) {
        await execPromise("sudo apt-get install unattended-upgrades -y");
    }
    else {
        await execPromise("sudo apt-get remove unattended-upgrades -y");
    }
}
// ── System action handlers ────────────────────────────────────────────────────
async function handleRebootServer(taskId) {
    // Mark the task completed BEFORE rebooting — the process dies with the system
    await client.query("UPDATE tasks SET status = 'completed', payload = payload || $1, updated_at = NOW() WHERE id = $2", [JSON.stringify({ message: 'Server reboot initiated' }), taskId]);
    console.warn('[REBOOT] Server reboot requested — initiating shutdown now.');
    // Non-blocking: let the task mark finish before the kernel tears down processes
    setTimeout(() => {
        execPromise('sudo shutdown -r now "Reboot requested via Superhost admin panel"').catch(() => { });
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
        }
        catch {
            // Service not installed — skip
        }
    }
}
async function handleExecCommand(payload, taskId) {
    const { command } = payload;
    if (!command || typeof command !== 'string' || !command.trim()) {
        throw new Error('command is required');
    }
    console.log(`[ROOT TERMINAL] Executing: ${command}`);
    try {
        const { stdout, stderr } = await execPromise(command, { timeout: 30_000 });
        const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
        await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: output, exitCode: 0 }), taskId]);
    }
    catch (err) {
        // The command ran but returned a non-zero exit — treat as completed, not failed
        const output = (err.stdout ?? '') + (err.stderr ? `\nSTDERR:\n${err.stderr}` : '');
        await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: output || err.message, exitCode: err.code ?? 1 }), taskId]);
    }
}
async function handleAdminBackup(taskId) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = `/root/superhost-backups/config_${ts}.tar.gz`;
    await execPromise('sudo mkdir -p /root/superhost-backups');
    // Archive key config directories — skip those that don't exist
    const dirs = ['/etc/nginx', '/etc/postfix', '/etc/dovecot', '/etc/bind', '/etc/opendkim'];
    const existingDirs = [];
    for (const d of dirs) {
        try {
            await execPromise(`sudo test -d ${shellEscape(d)}`);
            existingDirs.push(d);
        }
        catch { /* not installed — skip */ }
    }
    if (existingDirs.length === 0)
        throw new Error('No config directories found to back up');
    await execPromise(`sudo tar -czf ${shellEscape(backupPath)} ${existingDirs.map(shellEscape).join(' ')}`);
    const { stdout: sizeOut } = await execPromise(`sudo stat -c '%s' ${shellEscape(backupPath)}`);
    const sizeBytes = parseInt(sizeOut.trim(), 10);
    await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ path: backupPath, sizeBytes, dirs: existingDirs }), taskId]);
    console.log(`Admin config backup created: ${backupPath} (${sizeBytes} bytes)`);
}
async function cwpLog(migrationId, msg) {
    const ts = new Date().toISOString().slice(11, 19);
    await client.query("UPDATE cwp_migrations SET logs = logs || $1::jsonb, updated_at = NOW() WHERE id = $2", [JSON.stringify([`[${ts}] ${msg}`]), migrationId]);
    console.log(`[Migration ${migrationId}] ${msg}`);
}
async function cwpProgress(migrationId, progress) {
    await client.query("UPDATE cwp_migrations SET progress = $1, updated_at = NOW() WHERE id = $2", [JSON.stringify(progress), migrationId]);
}
// ── Generic site migration over SSH (Node.js / static / PHP) ────────────────
async function siteLog(id, msg) {
    const ts = new Date().toISOString().slice(11, 19);
    await client.query('UPDATE site_migrations SET log = log || $1 WHERE id = $2', [`[${ts}] ${msg}\n`, id]);
    console.log(`[SiteMigration ${id}] ${msg}`);
}
async function handleMigrateSite(payload) {
    const { migrationId, sourceHost, sourcePort, sshUser, authType, sshPassword, sshKey, remotePath, userId, username: rawUser, domainName: rawDomain, domainId, stack, appPort, installCommand, buildCommand, startCommand, phpVersion } = payload;
    const username = validateUsername(rawUser);
    const domain = validateDomainName(rawDomain);
    const docRoot = `/home/${username}/public_html/${domain}`;
    const cred = await setupSshCred(migrationId, authType, sshPassword, sshKey);
    await client.query("UPDATE site_migrations SET status='running' WHERE id=$1", [migrationId]);
    try {
        await siteLog(migrationId, `Connecting to ${sshUser}@${sourceHost}:${sourcePort} …`);
        await sshRun(sourceHost, Number(sourcePort), sshUser, cred, 'echo ok');
        await siteLog(migrationId, 'SSH connection OK. Syncing files…');
        // 1. Pull the site files (skip deps/VCS; we reinstall locally).
        await execPromise(`sudo mkdir -p ${shellEscape(docRoot)}`);
        const src = String(remotePath).replace(/\/?$/, '/'); // ensure trailing slash → copy contents
        await rsyncFromRemote(sourceHost, Number(sourcePort), sshUser, cred, src, docRoot + '/', ['--exclude=node_modules', '--exclude=.git', '--exclude=.env']);
        await execPromise(`sudo chown -R ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(docRoot)}`);
        await execPromise(`sudo setfacl -R -m user:jonathan:rwx ${shellEscape(docRoot)}`).catch(() => { });
        await siteLog(migrationId, 'Files synced.');
        if (stack === 'node' || stack === 'python') {
            if (installCommand) {
                await siteLog(migrationId, `Installing dependencies: ${installCommand}`);
                await execPromise(`sudo -u ${shellEscape(username)} bash -lc ${shellEscape(`cd ${docRoot} && ${installCommand}`)}`, { timeout: 15 * 60 * 1000 });
            }
            if (buildCommand) {
                await siteLog(migrationId, `Building: ${buildCommand}`);
                await execPromise(`sudo -u ${shellEscape(username)} bash -lc ${shellEscape(`cd ${docRoot} && ${buildCommand}`)}`, { timeout: 15 * 60 * 1000 });
            }
            // Allocate a port (use the requested one, else the first free port in range).
            let port = parseInt(appPort, 10);
            if (!Number.isInteger(port) || port < 1024) {
                const p = await client.query('SELECT gs FROM generate_series(30000,40000) gs WHERE gs NOT IN (SELECT port FROM user_apps) ORDER BY gs LIMIT 1');
                port = p.rows[0]?.gs ?? 30000;
            }
            // Reverse-proxy vhost → the app port.
            const vhost = `server {
    listen 80;
    listen [::]:80;
    server_name ${domain} www.${domain};
    access_log /var/log/nginx/${domain}.access.log;
    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
            await fs.writeFile(`/tmp/${domain}.vhost`, vhost);
            await execPromise(`sudo mv ${shellEscape(`/tmp/${domain}.vhost`)} /etc/nginx/sites-available/${shellEscape(domain)}`);
            await execPromise(`sudo ln -sf /etc/nginx/sites-available/${shellEscape(domain)} /etc/nginx/sites-enabled/${shellEscape(domain)}`);
            await execPromise('sudo nginx -t && sudo systemctl reload nginx');
            // Record the app + start it under PM2 via a launcher (handles any start command).
            const appRes = await client.query(`INSERT INTO user_apps (user_id, domain_id, name, type, port, startup_script, status)
         VALUES ($1,$2,$3,$4,$5,$6,'running') RETURNING id`, [userId, domainId ?? null, domain, stack, port, startCommand ?? null]);
            const appName = `app_${appRes.rows[0].id}`;
            const cmd = startCommand || (stack === 'python' ? 'python3 app.py' : 'npm start');
            const launcher = `${docRoot}/.superhost-start.sh`;
            await fs.writeFile('/tmp/.superhost-start.sh', `#!/bin/bash\ncd ${docRoot}\nexport PORT=${port}\nexec ${cmd}\n`);
            await execPromise(`sudo mv /tmp/.superhost-start.sh ${shellEscape(launcher)}`);
            await execPromise(`sudo chown ${shellEscape(username)}:${shellEscape(username)} ${shellEscape(launcher)} && sudo chmod 755 ${shellEscape(launcher)}`);
            await siteLog(migrationId, `Starting app on port ${port} (${cmd})`);
            await execPromise(`sudo -u ${shellEscape(username)} pm2 start ${shellEscape(launcher)} --name ${shellEscape(appName)} --interpreter bash --cwd ${shellEscape(docRoot)}`);
            await execPromise(`pm2 startup systemd -u ${shellEscape(username)} --hp /home/${shellEscape(username)} --silent`).catch(() => { });
            await execPromise(`sudo -u ${shellEscape(username)} pm2 save --force`).catch(() => { });
        }
        else {
            // static / php: serve the docroot directly.
            const ver = validatePhpVersion(phpVersion || '8.3');
            const phpBlock = stack === 'php'
                ? `\n    location ~ \\.php$ {\n        include snippets/fastcgi-php.conf;\n        fastcgi_pass unix:/run/php/php${ver}-fpm.sock;\n    }`
                : '';
            const idx = stack === 'php' ? 'index.php index.html' : 'index.html';
            const tryf = stack === 'php' ? 'try_files $uri $uri/ /index.php?$query_string;' : 'try_files $uri $uri/ /index.html;';
            const vhost = `server {
    listen 80;
    listen [::]:80;
    server_name ${domain} www.${domain};
    root ${docRoot};
    index ${idx};
    access_log /var/log/nginx/${domain}.access.log;
    location / { ${tryf} }${phpBlock}
    location ~ /\\.ht { deny all; }
}
`;
            await fs.writeFile(`/tmp/${domain}.vhost`, vhost);
            await execPromise(`sudo mv ${shellEscape(`/tmp/${domain}.vhost`)} /etc/nginx/sites-available/${shellEscape(domain)}`);
            await execPromise(`sudo ln -sf /etc/nginx/sites-available/${shellEscape(domain)} /etc/nginx/sites-enabled/${shellEscape(domain)}`);
            await execPromise('sudo nginx -t && sudo systemctl reload nginx');
        }
        await client.query("UPDATE site_migrations SET status='completed', completed_at=NOW() WHERE id=$1", [migrationId]);
        await siteLog(migrationId, '✓ Migration complete. Point DNS to this server and run SSL when ready.');
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await client.query("UPDATE site_migrations SET status='failed', error_message=$1 WHERE id=$2", [msg, migrationId]);
        await siteLog(migrationId, `ERROR: ${msg}`);
        throw err;
    }
    finally {
        if (cred.type === 'key')
            await fs.unlink(cred.keyPath).catch(() => { });
    }
}
async function handleTestSshConnection(taskId, payload) {
    const { remoteHost, remotePort, remoteUser, authType, sshPassword, sshKey } = payload;
    const cred = await setupSshCred(taskId, authType, sshPassword, sshKey);
    try {
        await sshRun(remoteHost, remotePort, remoteUser, cred, 'echo ok');
    }
    finally {
        if (cred.type === 'key')
            await fs.unlink(cred.keyPath).catch(() => { });
    }
}
async function setupSshCred(migrationId, authType, sshPassword, sshKey) {
    if (authType === 'key' && sshKey) {
        const keyPath = `/tmp/cwp_key_${migrationId}`;
        await fs.writeFile(keyPath, sshKey.trim() + '\n', { mode: 0o600 });
        return { type: 'key', keyPath };
    }
    // Verify sshpass is available before attempting password auth
    await execPromise('which sshpass').catch(() => {
        throw new Error('sshpass is not installed on this server. Install it with: sudo apt-get install -y sshpass');
    });
    return { type: 'password', password: sshPassword ?? '' };
}
function sshBaseArgs(port, cred) {
    return [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=30',
        '-o', 'ServerAliveInterval=30',
        '-p', String(port),
        ...(cred.type === 'key' ? ['-i', cred.keyPath] : ['-o', 'PubkeyAuthentication=no']),
    ];
}
async function sshRun(host, port, user, cred, script) {
    return new Promise((resolve, reject) => {
        const args = [...sshBaseArgs(port, cred), `${user}@${host}`, 'bash -s'];
        const env = cred.type === 'password'
            ? { ...process.env, SSHPASS: cred.password }
            : { ...process.env };
        const cmd = cred.type === 'password' ? 'sshpass' : 'ssh';
        const finalArgs = cred.type === 'password' ? ['-e', 'ssh', ...args] : args;
        const proc = spawn(cmd, finalArgs, { env });
        let out = '', err = '';
        proc.stdout.on('data', (d) => out += d.toString());
        proc.stderr.on('data', (d) => err += d.toString());
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code !== 0)
                reject(new Error(`SSH failed (${code}): ${err.slice(0, 500)}`));
            else
                resolve(out);
        });
        proc.stdin.write(script);
        proc.stdin.end();
    });
}
async function rsyncFromRemote(host, port, remoteUser, cred, remotePath, localPath, extraArgs = []) {
    const sshCmd = [
        'ssh', '-o', 'StrictHostKeyChecking=no', '-p', String(port),
        ...(cred.type === 'key' ? ['-i', cred.keyPath] : ['-o', 'PubkeyAuthentication=no']),
    ].join(' ');
    const env = cred.type === 'password'
        ? { ...process.env, SSHPASS: cred.password }
        : { ...process.env };
    const base = cred.type === 'password' ? 'sshpass -e rsync' : 'rsync';
    const args = [
        '-avz', '--stats', '--timeout=120',
        '-e', shellEscape(sshCmd),
        ...extraArgs,
        `${shellEscape(remoteUser)}@${shellEscape(host)}:${shellEscape(remotePath)}`,
        shellEscape(localPath),
    ].join(' ');
    await execPromise(`${base} ${args}`, { env, timeout: 20 * 60 * 1000 });
}
async function importRemoteDb(host, port, remoteUser, cred, remoteDb, localDb, localDbUser, localDbPass) {
    return new Promise((resolve, reject) => {
        const dumpScript = `mysqldump --single-transaction --no-tablespaces --skip-lock-tables ${shellEscape(remoteDb)}`;
        const sshArgs = [...sshBaseArgs(port, cred)];
        const env = cred.type === 'password'
            ? { ...process.env, SSHPASS: cred.password }
            : { ...process.env };
        const dumpCmd = cred.type === 'password' ? 'sshpass' : 'ssh';
        const dumpArgs = cred.type === 'password'
            ? ['-e', 'ssh', ...sshArgs, `${remoteUser}@${host}`, dumpScript]
            : [...sshArgs, `${remoteUser}@${host}`, dumpScript];
        const dumpProc = spawn(dumpCmd, dumpArgs, { env });
        const importProc = spawn('mysql', [`-u${localDbUser}`, `-p${localDbPass}`, localDb]);
        dumpProc.stdout.pipe(importProc.stdin);
        let importErr = '', dumpErr = '';
        dumpProc.stderr.on('data', (d) => dumpErr += d.toString());
        importProc.stderr.on('data', (d) => importErr += d.toString());
        dumpProc.on('error', reject);
        importProc.on('error', reject);
        importProc.on('close', (code) => {
            if (code !== 0)
                reject(new Error(`DB import failed: ${(importErr + dumpErr).slice(0, 300)}`));
            else
                resolve();
        });
    });
}
// Discovery script — runs via bash heredoc on remote server
const DISCOVERY_SCRIPT = `python3 << 'CWPEOF'
import os, json, subprocess, re, socket
from datetime import datetime

SKIP = {'root','nobody','cwp','cwpsrv','postfix','dovecot','mysql','www-data','nginx','apache','apache2','vmail','named','bind','mail','daemon','sync','games','man','lp','news','uucp','proxy','backup','list','irc','gnats','systemd-network','systemd-resolve','_apt','messagebus','ntp','sshd','dnsmasq','tcpdump','pollinate'}

sh_errors = []
def sh(cmd, timeout=30):
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.PIPE, timeout=timeout)
        return out.decode('utf-8', errors='replace').strip()
    except subprocess.CalledProcessError as e:
        err = (e.stderr or b'').decode('utf-8', errors='replace').strip()[:120]
        if err:  # suppress empty-stderr exits (e.g. grep finding no matches)
            sh_errors.append((cmd[0] if isinstance(cmd,list) else str(cmd)[:40], err))
        return ''
    except Exception as e:
        sh_errors.append((str(cmd)[:40], str(e)[:120]))
        return ''

CHECK_DIRS = [
    '/usr/local/cwpsrv/conf/nginx/conf.d','/etc/nginx/conf.d','/usr/local/nginx/conf/vhosts',
    '/etc/nginx/sites-enabled','/usr/local/cwpsrv/conf/nginx','/usr/local/cwpsrv/var/services/nginx/conf',
    '/usr/local/apache/conf.d','/etc/httpd/conf.d','/usr/local/apache/conf/userdata','/etc/httpd/conf/vhosts.d',
    '/usr/local/cwpsrv/conf/apache','/usr/local/apache/conf/vhosts',
    '/etc/virtual','/etc/dovecot/virtual','/var/mail/virtual',
    '/usr/local/cwpsrv/var/services/users','/usr/local/cwpsrv/conf/users','/usr/local/cwp/conf/users',
]
existing_dirs = [d for d in CHECK_DIRS if os.path.isdir(d)]

# Probe CWP Apache conf directories to understand where vhosts live
apache_diag = {}
for probe_dir in ['/usr/local/apache/conf','/usr/local/apache/conf/vhosts',
                  '/usr/local/apache/conf/extra',
                  '/usr/local/cwpsrv/conf/apache','/etc/httpd/conf.d']:
    try:
        if os.path.isdir(probe_dir):
            files = sorted(os.listdir(probe_dir))
            apache_diag[probe_dir] = files[:40]
    except: pass

# Read httpd-vhosts.conf and httpd.conf Include lines to find where user vhosts actually live
apache_vhost_sample = ''
vhosts_conf_head = ''
httpd_includes = ''
try:
    with open('/usr/local/apache/conf/extra/httpd-vhosts.conf') as f:
        raw = f.read()
    lines = [l.strip() for l in raw.splitlines() if l.strip() and not l.strip().startswith('#')]
    vhosts_conf_head = ' | '.join(lines[:20])
except: pass
try:
    with open('/usr/local/apache/conf/httpd.conf') as f:
        raw = f.read()
    inc_lines = [l.strip() for l in raw.splitlines() if re.match(r'^\s*[Ii]nclude', l) or 'VirtualHost' in l]
    httpd_includes = ' | '.join(inc_lines[:20])
except: pass
apache_vhost_sample = ('vhosts.conf: '+vhosts_conf_head if vhosts_conf_head else '') + (' || httpd includes: '+httpd_includes if httpd_includes else '')

# Size of main httpd.conf
httpd_conf_size = 0
try:
    httpd_conf_size = os.path.getsize('/usr/local/apache/conf/httpd.conf')
except: pass

httpd_conf_sample = list(apache_diag.get('/etc/httpd/conf.d', []))
httpd_conf_content_sample = apache_vhost_sample

raw_users = []
user_domains = []
debug = {'scanned':0,'skip_uid':[],'skip_home':[],'skip_name':[],'skip_nodir':[],'accepted':[],'sh_errors':sh_errors,'existing_dirs':existing_dirs,'user_domains':user_domains,'apache_diag':apache_diag,'apache_vhost_sample':apache_vhost_sample,'httpd_conf_size':httpd_conf_size,'httpd_conf_files':httpd_conf_sample,'httpd_conf_sample':httpd_conf_content_sample}
try:
    with open('/etc/passwd') as f:
        for line in f:
            p = line.strip().split(':')
            if len(p) < 7: continue
            uname, uid, home = p[0], int(p[2]), p[5]
            debug['scanned'] += 1
            if uid < 500 or uid >= 65000: debug['skip_uid'].append(uname); continue
            if not home.startswith('/home/'): debug['skip_home'].append(uname); continue
            if uname in SKIP: debug['skip_name'].append(uname); continue
            if not os.path.isdir(home): debug['skip_nodir'].append(uname); continue
            debug['accepted'].append(uname)
            raw_users.append((uname, home))
except Exception as e:
    print(json.dumps({'error': str(e), 'users': [], 'debug': debug})); raise SystemExit(1)

# Linux password hashes from /etc/shadow (requires root on source; skipped gracefully).
# These are one-way crypt hashes ($6$/$2y$/etc) — re-applied verbatim on the new host.
shadow = {}
try:
    with open('/etc/shadow') as f:
        for line in f:
            parts = line.split(':')
            if len(parts) >= 2 and parts[1] and parts[1] not in ('*','!','!!',''):
                shadow[parts[0]] = parts[1]
except Exception as e:
    sh_errors.append(('shadow', str(e)[:120]))

# Email mailbox password hashes from CWP's mail DB. Maps full email -> hash.
mail_pw = {}
for mdb in ['postfix','vmail','mail','roundcube']:
    raw_mpw = sh(['mysql', mdb, '-N', '-e', 'SELECT username, password FROM mailbox'])
    if raw_mpw:
        for ln in raw_mpw.split('\\n'):
            cols = ln.split('\\t')
            if len(cols) >= 2 and '@' in cols[0] and cols[1].strip():
                mail_pw[cols[0].strip()] = cols[1].strip()
        if mail_pw: break
debug['shadow_count'] = len(shadow)
debug['mail_pw_count'] = len(mail_pw)

result = []
for uname, home in raw_users:
    # Read CWP user.conf for email and primary domain
    email = ''
    primary_domain = ''
    conf_sample = ''
    for cp in ['/usr/local/cwpsrv/var/services/users/'+uname+'/user.conf',
               '/usr/local/cwpsrv/conf/users/'+uname+'.conf',
               '/usr/local/cwp/conf/users/'+uname+'.conf']:
        try:
            with open(cp) as f:
                lines = f.readlines()
            if not conf_sample and uname == raw_users[0][0]:
                conf_sample = '|'.join(l.strip() for l in lines[:10])
                debug['conf_sample'] = cp+': '+conf_sample
            for line in lines:
                k, _, v = line.strip().partition('=')
                kl = k.lower().strip()
                if kl in ('email','e-mail') and not email: email = v.strip()
                if kl in ('domain','maindomain','main_domain','site','website') and not primary_domain:
                    primary_domain = v.strip()
            if email or primary_domain: break
        except: pass
    if not email: email = uname + '@localhost'
    if primary_domain: user_domains.append(uname+':'+primary_domain)

    disk_raw = sh(['du','-sm',home]).split()
    disk_mb = int(disk_raw[0]) if disk_raw else 0

    domains = []
    seen_d = set()

    def add_domain(dom, docroot, php, has_ssl):
        if not dom or '.' not in dom or dom in seen_d: return
        if dom.startswith('www.') or dom in ('localhost','_') or '~' in dom: return
        seen_d.add(dom)
        domains.append({'domain':dom,'document_root':docroot,'php_version':php,'has_ssl':has_ssl,'disk_mb':0})

    # 1. Primary domain from CWP user.conf
    if primary_domain:
        add_domain(primary_domain, home+'/public_html', '8.1',
                   os.path.exists('/etc/letsencrypt/live/'+primary_domain+'/fullchain.pem'))

    # 2. /usr/local/apache/conf/userdata/{...}/{username}/{domain}/ directory structure
    userdata = '/usr/local/apache/conf/userdata'
    if os.path.isdir(userdata):
        for dirpath, _, filenames in os.walk(userdata):
            parts = dirpath.replace('\\\\','').split('/')
            if uname not in parts: continue
            uidx = len(parts) - 1 - parts[::-1].index(uname)
            if uidx + 1 < len(parts):
                dom_cand = parts[uidx + 1]
                add_domain(dom_cand, home+'/public_html', '8.1',
                           os.path.exists('/etc/letsencrypt/live/'+dom_cand+'/fullchain.pem'))

    # 3. CWP database — most complete source of domain→user mapping
    for cwp_db in ['cwp', 'cwpdb']:
        raw_dom = sh(['mysql', cwp_db, '-N', '-e',
            "SELECT domain FROM accounts WHERE user='"+uname+"' UNION SELECT domain FROM domains WHERE user='"+uname+"'"])
        if raw_dom:
            for dom in (d.strip() for d in raw_dom.split('\\n') if d.strip()):
                add_domain(dom, home+'/public_html', '8.1',
                           os.path.exists('/etc/letsencrypt/live/'+dom+'/fullchain.pem'))
            break

    def parse_apache_vhosts(content, match_home):
        """Extract (ServerName, docroot, has_ssl) from VirtualHost blocks containing match_home."""
        results = []
        for blk in re.finditer(r'<VirtualHost[^>]*>(.*?)</VirtualHost>', content, re.DOTALL|re.IGNORECASE):
            bt = blk.group(1)
            if match_home not in bt: continue
            sn = re.search(r'ServerName\\s+(\\S+)', bt)
            if not sn: continue
            dr = re.search(r'DocumentRoot\\s+(\\S+)', bt)
            docroot = dr.group(1) if dr else match_home+'/public_html'
            ssl = 'SSLEngine' in bt or os.path.exists('/etc/letsencrypt/live/'+sn.group(1)+'/fullchain.pem')
            results.append((sn.group(1), docroot, ssl))
        return results

    # 4. Filename-based Apache conf lookup (CWP names files after username or domain)
    for conf_fp in ['/usr/local/apache/conf.d/'+uname+'.conf',
                    '/usr/local/apache/conf.d/vhost_'+uname+'.conf',
                    '/etc/httpd/conf.d/'+uname+'.conf',
                    '/etc/httpd/conf.d/vhost_'+uname+'.conf',
                    '/etc/httpd/conf.d/'+uname+'_vhost.conf']:
        if not os.path.exists(conf_fp): continue
        try: content = open(conf_fp).read()
        except: continue
        for sn, docroot, ssl in parse_apache_vhosts(content, home):
            add_domain(sn, docroot, '8.1', ssl)

    # 5. grep Apache conf files (CWP's conf.d, then fallbacks) for this user's home
    apache_seen_files = set()
    for confdir in ['/usr/local/apache/conf.d', '/etc/httpd/conf.d',
                    '/usr/local/apache/conf/vhosts', '/etc/httpd/conf/vhosts.d',
                    '/usr/local/cwpsrv/conf/apache', '/usr/local/apache/conf/extra',
                    '/usr/local/apache/conf']:
        if not os.path.isdir(confdir) and not os.path.isfile(confdir): continue
        search_target = confdir if os.path.isdir(confdir) else os.path.dirname(confdir)
        hits = sh(['grep', '-rl', home, search_target])
        for fp in (l.strip() for l in hits.split('\\n') if l.strip()):
            if fp in apache_seen_files: continue
            apache_seen_files.add(fp)
            try: content = open(fp).read()
            except: continue
            for sn, docroot, ssl in parse_apache_vhosts(content, home):
                add_domain(sn, docroot, '8.1', ssl)

    # 6. Filename-based Nginx conf lookup (CWP stores confs named after username or domain)
    for conf_fp in [
            '/usr/local/cwpsrv/conf/nginx/conf.d/'+uname+'.conf',
            '/usr/local/cwpsrv/conf/nginx/conf.d/vhost_'+uname+'.conf',
            '/etc/nginx/conf.d/'+uname+'.conf',
            '/etc/nginx/conf.d/vhost_'+uname+'.conf',
            '/usr/local/nginx/conf/vhosts/'+uname+'.conf',
            '/etc/nginx/sites-enabled/'+uname+'.conf']:
        if not os.path.exists(conf_fp): continue
        try: content = open(conf_fp).read()
        except: continue
        rm = re.search(r'root\\s+([^\\s;\\r\\n<]+)', content)
        docroot = rm.group(1) if rm else home+'/public_html'
        has_ssl = 'ssl_certificate' in content
        for sm in re.finditer(r'server_name\\s+([^;\\r\\n<]+)', content):
            for sn in sm.group(1).split():
                sn = sn.strip().rstrip(';')
                add_domain(sn, docroot, '8.1', has_ssl or os.path.exists('/etc/letsencrypt/live/'+sn+'/fullchain.pem'))

    # 7. grep Nginx conf dirs for this user's home directory
    for confdir in [
            '/usr/local/cwpsrv/conf/nginx/conf.d',
            '/usr/local/cwpsrv/conf/nginx',
            '/etc/nginx/conf.d',
            '/etc/nginx/sites-enabled',
            '/usr/local/nginx/conf/vhosts',
            '/usr/local/cwpsrv/var/services/nginx/conf']:
        if not os.path.isdir(confdir): continue
        hits = sh(['grep', '-rl', home, confdir])
        for fp in (l.strip() for l in hits.split('\\n') if l.strip()):
            try: content = open(fp).read()
            except: continue
            rm = re.search(r'root\\s+([^\\s;\\r\\n<]+)', content)
            docroot = rm.group(1) if rm else home+'/public_html'
            has_ssl = 'ssl_certificate' in content
            for sm in re.finditer(r'server_name\\s+([^;\\r\\n<]+)', content):
                for sn in sm.group(1).split():
                    sn = sn.strip().rstrip(';')
                    add_domain(sn, docroot, '8.1', has_ssl or os.path.exists('/etc/letsencrypt/live/'+sn+'/fullchain.pem'))

    # DNS records — read BIND zone files from common CWP paths
    def read_zone_dns(domain):
        """Parse a BIND zone file and return list of record dicts, excluding SOA/NS."""
        zone_paths = [
            '/var/named/'+domain,
            '/var/named/'+domain+'.db',
            '/var/named/'+domain+'.zone',
            '/etc/named/'+domain+'.db',
            '/etc/bind/zones/db.'+domain,
            '/etc/bind/'+domain+'.db',
            '/var/named/data/'+domain+'.db',
        ]
        content = ''
        for zp in zone_paths:
            try:
                with open(zp) as f: content = f.read(); break
            except: pass
        if not content:
            # Try named-compilezone or just grep named.conf for zone file path
            raw = sh(['grep', '-r', '"'+domain+'"', '/etc/named.conf', '/etc/named/', '/etc/bind/named.conf'], timeout=5)
            for line in raw.split('\\n'):
                m = re.search(r'file\\s+["\\']+([^"\\']+)["\\']+', line)
                if m:
                    try:
                        with open(m.group(1)) as f: content = f.read(); break
                    except: pass
        if not content:
            return []
        records = []
        current_ttl = 3600
        origin = domain + '.'
        for line in content.split('\\n'):
            line = line.strip()
            if not line or line.startswith(';'): continue
            if line.startswith('$TTL'):
                try: current_ttl = int(line.split()[1])
                except: pass
                continue
            if line.startswith('$ORIGIN'):
                try: origin = line.split()[1]
                except: pass
                continue
            # Skip SOA and NS — we generate these fresh
            if ' SOA ' in line or '\\tSOA\\t' in line: continue
            if (' NS ' in line or '\\tNS\\t' in line) and 'IN' in line: continue
            # Parse: [name] [ttl] [class] type rdata
            m = re.match(r'^(\\S+)?\\s+(?:(\\d+)\\s+)?(?:IN\\s+)?(A|AAAA|MX|TXT|CNAME|SRV|CAA|PTR)\\s+(.+)$', line, re.IGNORECASE)
            if not m: continue
            name_raw, ttl_raw, rtype, rdata = m.group(1), m.group(2), m.group(3).upper(), m.group(4).strip()
            ttl = int(ttl_raw) if ttl_raw else current_ttl
            # Strip inline BIND comments from rdata (semicolon outside TXT quotes)
            if rtype != 'TXT':
                rdata = re.sub(r'\\s*;.*$', '', rdata).strip()
            # Normalise name — handle full domain name used in place of @
            if not name_raw or name_raw == '@': name = '@'
            elif name_raw.rstrip('.') in (domain, ''): name = '@'
            elif name_raw.endswith('.'): name = name_raw[:-len(domain)-2] if name_raw.endswith('.'+domain+'.') else name_raw.rstrip('.')
            else: name = name_raw
            # Clean TXT — join quoted segments
            if rtype == 'TXT':
                rdata = ''.join(re.findall(r'"([^"]*)"', rdata)) or rdata.strip('"')
            # MX: split priority from exchange
            priority = None
            if rtype == 'MX':
                parts = rdata.split()
                if len(parts) == 2:
                    try: priority = int(parts[0]); rdata = parts[1].rstrip('.')
                    except: rdata = rdata.rstrip('.')
                else: rdata = rdata.rstrip('.')
            else:
                if rdata.endswith('.'): rdata = rdata[:-1]
            rec = {'name': name, 'type': rtype, 'content': rdata, 'ttl': ttl}
            if priority is not None: rec['priority'] = priority
            records.append(rec)
        return records

    # CWP-generated boilerplate subdomain names — never worth migrating
    CWP_STD_NAMES = {
        '@','www','mail','smtp','smtps','pop','pop3','imap','imaps',
        'webmail','ftp','sftp','cpanel','cwp','whm','whmcs','localhost',
        'spam','default._domainkey','_dmarc','autodiscover','autoconfig',
    }

    def is_custom_record(r, domain, old_ips):
        """Return True only for genuinely custom records worth migrating."""
        if r['type'] in ('SOA','NS'): return False
        if r['name'].lower() in CWP_STD_NAMES: return False
        # Skip CNAMEs that point directly to the apex domain (CWP boilerplate)
        if r['type'] == 'CNAME' and r['content'].rstrip('.') in (domain, domain+'.'): return False
        # Skip A/AAAA records pointing to the old server's IPs
        if r['type'] in ('A','AAAA') and r['content'] in old_ips: return False
        # Skip boilerplate TXT records we regenerate
        for prefix in ('v=spf1','v=DKIM1','v=DMARC1'):
            if r['content'].startswith(prefix): return False
        return True

    # Attach DNS records to each discovered domain
    # Collect all IPs from A records for @ — these are the old server IPs to skip
    for dom in domains:
        all_recs = read_zone_dns(dom['domain'])
        old_ips = {r['content'] for r in all_recs if r['type'] == 'A' and r['name'] == '@'}
        dom['dns_records'] = [r for r in all_recs if is_custom_record(r, dom['domain'], old_ips)]

    # Databases — information_schema is readable without special grants
    dbs = []
    raw_db = sh(['mysql','-N','-e',
        "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME LIKE '"+uname+"\\_%' OR SCHEMA_NAME='"+uname+"'"])
    if not raw_db:
        # fallback: mysql.db grants table
        raw_db = sh(['mysql','-N','-e',
            "SELECT DISTINCT Db FROM mysql.db WHERE User='"+uname+"' OR User LIKE '"+uname+"\\_%'"])
    for db_name in raw_db.split('\\n'):
        db_name = db_name.strip()
        if not db_name or db_name in ('information_schema','performance_schema','mysql','sys'): continue
        sz_raw = sh(['mysql','-N','-e',
            "SELECT ROUND(SUM(data_length+index_length)/1024/1024,1) FROM information_schema.tables WHERE table_schema='"+db_name+"'"]) or '0'
        try: size = float(sz_raw.split()[0]) if sz_raw.split() else 0.0
        except: size = 0.0
        dbs.append({'db_name':db_name,'db_user':uname,'size_mb':size})

    # Email accounts
    email_accs = []
    seen_e = set()
    dom_set = {d['domain'] for d in domains}

    # /var/vmail/{domain}/{user}/ — Dovecot Maildir structure used by CWP
    if os.path.isdir('/var/vmail'):
        try:
            for dom_dir in os.listdir('/var/vmail'):
                dom_path = '/var/vmail/' + dom_dir
                if not os.path.isdir(dom_path) or '.' not in dom_dir: continue
                if dom_dir not in dom_set:
                    # Domain wasn't found in web-hosting discovery; confirm via conf files
                    confirmed = False
                    for confdir in ['/usr/local/cwpsrv/conf/nginx/conf.d','/etc/nginx/conf.d',
                                    '/usr/local/cwpsrv/conf/nginx','/etc/httpd/conf.d',
                                    '/etc/nginx/sites-enabled']:
                        if not os.path.isdir(confdir): continue
                        probe = sh(['grep', '-rl', dom_dir, confdir])
                        for fp in (l.strip() for l in probe.split('\\n') if l.strip()):
                            try:
                                c = open(fp).read()
                                if home in c:
                                    confirmed = True
                                    add_domain(dom_dir, home+'/public_html', '8.1',
                                               os.path.exists('/etc/letsencrypt/live/'+dom_dir+'/fullchain.pem'))
                                    break
                            except: pass
                        if confirmed: break
                    if not confirmed: continue
                for mbox in os.listdir(dom_path):
                    if mbox.startswith('.'): continue
                    if not os.path.isdir(dom_path+'/'+mbox): continue
                    addr = mbox+'@'+dom_dir
                    if addr not in seen_e:
                        seen_e.add(addr)
                        email_accs.append({'email':addr,'domain':dom_dir,'quota_mb':1024,'password_hash':mail_pw.get(addr,'')})
        except: pass

    # Fallback: file-based virtual mailbox lists (/etc/virtual, /etc/dovecot/virtual)
    if not email_accs:
        for vdir in ['/etc/virtual', '/etc/dovecot/virtual', '/var/mail/virtual']:
            if not os.path.isdir(vdir): continue
            try:
                for root2, _, files in os.walk(vdir):
                    dom2 = os.path.basename(root2)
                    for fname in files:
                        if fname not in ('passwd','accounts','passwd.db'): continue
                        try:
                            with open(os.path.join(root2, fname)) as ef:
                                for line in ef:
                                    if not line.strip(): continue
                                    addr = line.strip().split(':')[0]
                                    if '@' not in addr: addr = addr+'@'+dom2
                                    if addr in seen_e: continue
                                    seen_e.add(addr)
                                    em_dom = addr.split('@')[1]
                                    if em_dom not in dom_set: continue  # can't attribute to this user
                                    email_accs.append({'email':addr,'domain':em_dom,'quota_mb':1024,'password_hash':mail_pw.get(addr,'')})
                        except: pass
            except: pass

    result.append({'username':uname,'email':email,'home_dir':home,'disk_usage_mb':disk_mb,'domains':domains,'databases':dbs,'email_accounts':email_accs,'password_hash':shadow.get(uname,'')})

print(json.dumps({'users':result,'debug':debug,'discovered_at':datetime.utcnow().isoformat()+'Z','remote_host':socket.gethostname()}))
CWPEOF
`;
async function handleDiscoverCwp(payload) {
    const { migrationId, remoteHost, remotePort, remoteUser, authType, sshPassword, sshKey } = payload;
    const cred = await setupSshCred(migrationId, authType, sshPassword, sshKey);
    try {
        await cwpLog(migrationId, `Connecting to ${remoteUser}@${remoteHost}:${remotePort}…`);
        // Test connectivity first
        await sshRun(remoteHost, remotePort, remoteUser, cred, 'echo ok');
        await cwpLog(migrationId, 'SSH connection established. Running discovery…');
        const output = await sshRun(remoteHost, remotePort, remoteUser, cred, DISCOVERY_SCRIPT);
        let discoveryData;
        try {
            discoveryData = JSON.parse(output);
        }
        catch {
            throw new Error(`Discovery returned invalid JSON. Output: ${output.slice(0, 300)}`);
        }
        if (discoveryData.error)
            throw new Error(`Discovery error: ${discoveryData.error}`);
        const users = (discoveryData.users ?? []);
        const dbg = discoveryData.debug;
        if (dbg) {
            await cwpLog(migrationId, `Scanned ${dbg.scanned} passwd entries → accepted: [${dbg.accepted.join(', ') || 'none'}]`);
            if (dbg.skip_uid.length)
                await cwpLog(migrationId, `  Skipped (UID out of range): ${dbg.skip_uid.join(', ')}`);
            if (dbg.skip_home.length)
                await cwpLog(migrationId, `  Skipped (home not /home/): ${dbg.skip_home.join(', ')}`);
            if (dbg.skip_name.length)
                await cwpLog(migrationId, `  Skipped (system name): ${dbg.skip_name.join(', ')}`);
            if (dbg.skip_nodir.length)
                await cwpLog(migrationId, `  Skipped (home dir missing): ${dbg.skip_nodir.join(', ')}`);
            const shErrs = dbg.sh_errors ?? [];
            for (const [cmd, err] of shErrs)
                await cwpLog(migrationId, `  sh() error [${cmd}]: ${err}`);
            if (dbg.existing_dirs?.length)
                await cwpLog(migrationId, `  Dirs found: ${dbg.existing_dirs.join(', ')}`);
            else
                await cwpLog(migrationId, `  No expected dirs found`);
            if (dbg.conf_sample)
                await cwpLog(migrationId, `  user.conf sample: ${dbg.conf_sample}`);
            if (dbg.user_domains?.length)
                await cwpLog(migrationId, `  Domains from user.conf: ${dbg.user_domains.join(', ')}`);
            if (dbg.httpd_conf_size)
                await cwpLog(migrationId, `  /usr/local/apache/conf/httpd.conf size: ${dbg.httpd_conf_size} bytes`);
            const apacheDiag = dbg.apache_diag ?? {};
            for (const [dir, files] of Object.entries(apacheDiag))
                await cwpLog(migrationId, `  ${dir}: [${files.join(', ')}]`);
            if (dbg.apache_vhost_sample)
                await cwpLog(migrationId, `  vhost sample: ${dbg.apache_vhost_sample}`);
        }
        const totalDomains = users.reduce((s, u) => s + (u.domains?.length ?? 0), 0);
        const totalDbs = users.reduce((s, u) => s + (u.databases?.length ?? 0), 0);
        const totalEmails = users.reduce((s, u) => s + (u.email_accounts?.length ?? 0), 0);
        await client.query(`UPDATE cwp_migrations SET status = 'ready', discovery_data = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(discoveryData), migrationId]);
        await cwpLog(migrationId, `Discovery complete: ${users.length} user(s), ${totalDomains} domain(s), ${totalDbs} database(s), ${totalEmails} email account(s)`);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await client.query(`UPDATE cwp_migrations SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`, [msg, migrationId]);
        await cwpLog(migrationId, `ERROR: ${msg}`);
        throw err;
    }
    finally {
        if (cred.type === 'key')
            await fs.unlink(cred.keyPath).catch(() => { });
    }
}
function resolvePhpVersion(requested) {
    // Find the best available PHP-FPM socket on this server.
    // Prefer exact match, then nearest higher version, then any available.
    const { readdirSync } = require('fs');
    let available = [];
    try {
        available = readdirSync('/run/php')
            .map((f) => { const m = f.match(/^php(\d+\.\d+)-fpm\.sock$/); return m ? m[1] : null; })
            .filter(Boolean);
    }
    catch { /* /run/php not accessible */ }
    if (available.length === 0)
        return requested;
    if (available.includes(requested))
        return requested;
    // Pick the closest version >= requested, or the highest available
    const sorted = available.sort((a, b) => parseFloat(a) - parseFloat(b));
    return sorted.find(v => parseFloat(v) >= parseFloat(requested)) ?? sorted[sorted.length - 1];
}
async function patchCmsDbConfig(configPath, dbUser, dbPass) {
    // Rewrites DB_USER / DB_PASSWORD / DB_HOST in WordPress (and compatible) config files.
    // Uses a temp Python script so special chars in credentials are never interpolated by the shell.
    const script = [
        'import sys',
        'path, u, p = sys.argv[1], sys.argv[2], sys.argv[3]',
        'out = []',
        'with open(path) as f:',
        '    for line in f:',
        '        if "DB_USER" in line and "define" in line:',
        "            line = \"define('DB_USER', '\" + u + \"');\\n\"",
        '        elif "DB_PASSWORD" in line and "define" in line:',
        "            line = \"define('DB_PASSWORD', '\" + p + \"');\\n\"",
        '        elif "DB_HOST" in line and "define" in line:',
        "            line = \"define('DB_HOST', 'localhost');\\n\"",
        '        out.append(line)',
        'with open(path, "w") as f:',
        '    f.writelines(out)',
    ].join('\n');
    const tmp = `/tmp/.cms_patch_${process.pid}.py`;
    await fs.writeFile(tmp, script, { mode: 0o600 });
    try {
        await execPromise(`sudo python3 ${shellEscape(tmp)} ${shellEscape(configPath)} ${shellEscape(dbUser)} ${shellEscape(dbPass)}`);
    }
    finally {
        await fs.unlink(tmp).catch(() => { });
    }
}
// Convert a migrated mailbox password hash into a form Dovecot accepts via the
// SQL passdb. Dovecot needs an explicit {SCHEME} prefix when the hash isn't in
// the configured default scheme (BLF-CRYPT). Returns null for unknown formats
// so the caller can fall back to a placeholder rather than store garbage.
function normalizeMailHash(h) {
    if (!h || typeof h !== 'string')
        return null;
    const v = h.trim();
    if (!v)
        return null;
    if (v.startsWith('{'))
        return v; // already has a Dovecot scheme prefix
    if (v.startsWith('$6$'))
        return `{SHA512-CRYPT}${v}`;
    if (v.startsWith('$5$'))
        return `{SHA256-CRYPT}${v}`;
    if (v.startsWith('$2a$') || v.startsWith('$2b$') || v.startsWith('$2y$'))
        return `{BLF-CRYPT}${v}`;
    if (v.startsWith('$1$'))
        return `{MD5-CRYPT}${v}`;
    return null;
}
// Mint a single-use, 7-day password-setup token for a user and return the full
// dashboard URL the user visits to set their panel password. Stores only the
// token's sha256 hash. Used to onboard migrated users (who have no panel password).
async function generateSetupLink(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await client.query('INSERT INTO password_setup_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [userId, tokenHash, expiresAt]);
    const base = process.env.DASHBOARD_DOMAIN || process.env.MASTER_DOMAIN || 'localhost';
    const origin = base.startsWith('http') ? base : `https://${base}`;
    return `${origin}/client/set-password?token=${token}`;
}
async function handleMigrateCwp(payload) {
    const { migrationId, remoteHost, remotePort, remoteUser, selectedUsers, authType, sshPassword, sshKey } = payload;
    const cred = await setupSshCred(migrationId, authType, sshPassword, sshKey);
    try {
        const migRes = await client.query('SELECT * FROM cwp_migrations WHERE id = $1', [migrationId]);
        const mig = migRes.rows[0];
        if (!mig)
            throw new Error('Migration record not found');
        const discoveryData = mig.discovery_data;
        const allUsers = (discoveryData?.users ?? []);
        const usersToMigrate = allUsers.filter((u) => selectedUsers.includes(u.username));
        await cwpLog(migrationId, `Starting migration of ${usersToMigrate.length} user(s)…`);
        // Collected so we can print all set-password links together at the end.
        const setupLinks = [];
        for (let i = 0; i < usersToMigrate.length; i++) {
            const cwpUser = usersToMigrate[i];
            const { username } = cwpUser;
            await cwpProgress(migrationId, {
                users_total: usersToMigrate.length,
                users_done: i,
                current_user: username,
                current_step: 'Creating user account',
            });
            await cwpLog(migrationId, `━━━ Migrating user: ${username} ━━━`);
            // ── 1. Create Superhost user account ──────────────────────────────────
            const existingUser = await client.query('SELECT id FROM users WHERE username = $1', [username]);
            let userId;
            if (existingUser.rows[0]) {
                userId = existingUser.rows[0].id;
                await cwpLog(migrationId, `  [${username}] User already exists — skipping account creation`);
            }
            else {
                const homeDir = `/home/${username}`;
                const email = cwpUser.email || `${username}@localhost`;
                const insertRes = await client.query(`INSERT INTO users (username, email, home_dir) VALUES ($1, $2, $3)
           ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email RETURNING id`, [username, email, homeDir]);
                userId = insertRes.rows[0].id;
                // System setup (creates Linux user, default DB, staging domain)
                await handleCreateUser({ username, email });
                // Preserve the original Linux password hash (crypt format) so the
                // user's system password keeps working once SSH/FTP is enabled.
                const linuxHash = cwpUser.password_hash?.trim();
                if (linuxHash && linuxHash.startsWith('$')) {
                    await execPromise(`echo ${shellEscape(`${username}:${linuxHash}`)} | sudo chpasswd -e`)
                        .then(() => cwpLog(migrationId, `  [${username}] Linux password hash migrated`))
                        .catch((e) => cwpLog(migrationId, `  [${username}] Could not set Linux password: ${e.message}`));
                }
                // Migrated users have no dashboard password — generate a one-time
                // set-password link they can use to set one.
                try {
                    const link = await generateSetupLink(userId);
                    setupLinks.push(`${username}: ${link}`);
                    await cwpLog(migrationId, `  [${username}] Set-password link (7-day, single-use): ${link}`);
                }
                catch (e) {
                    await cwpLog(migrationId, `  [${username}] Could not generate set-password link: ${e instanceof Error ? e.message : String(e)}`);
                }
                await cwpLog(migrationId, `  [${username}] Superhost account created`);
            }
            // ── 2. Rsync home directory ───────────────────────────────────────────
            await cwpProgress(migrationId, { users_total: usersToMigrate.length, users_done: i, current_user: username, current_step: 'Syncing files' });
            await cwpLog(migrationId, `  [${username}] Syncing home directory from remote…`);
            try {
                await rsyncFromRemote(remoteHost, remotePort, remoteUser, cred, `/home/${username}/`, `/home/${username}/`, ['--exclude=.env', '--exclude=logs/']);
                await execPromise(`sudo chown -R ${shellEscape(username)}:${shellEscape(username)} /home/${shellEscape(username)}/`);
                await cwpLog(migrationId, `  [${username}] Files synced`);
            }
            catch (e) {
                await cwpLog(migrationId, `  [${username}] File sync warning: ${e instanceof Error ? e.message : String(e)}`);
            }
            // Re-apply permissions — rsync preserves source server's mode bits (source used Apache-as-user;
            // this server uses nginx/www-data which needs world-read on public_html).
            try {
                const h = `/home/${shellEscape(username)}`;
                await execPromise(`sudo chmod 711 ${h}`);
                await execPromise(`sudo setfacl -m user:jonathan:rwx,default:user:jonathan:rwx ${h}`);
                await execPromise(`sudo find ${h}/public_html -type d -exec chmod 755 {} +`);
                await execPromise(`sudo find ${h}/public_html -type f -exec chmod 644 {} +`);
                await execPromise(`sudo find ${h}/public_html -type d -exec setfacl -m user:jonathan:rwx,default:user:jonathan:rwx {} +`);
                await execPromise(`sudo find ${h}/public_html -type f -exec setfacl -m user:jonathan:rw- {} +`);
            }
            catch (e) {
                await cwpLog(migrationId, `  [${username}] Permission fix warning: ${e instanceof Error ? e.message : String(e)}`);
            }
            // ── 3. Set up domains ─────────────────────────────────────────────────
            const domains = (cwpUser.domains ?? []);
            for (const dom of domains) {
                await cwpProgress(migrationId, { users_total: usersToMigrate.length, users_done: i, current_user: username, current_step: `Domain: ${dom.domain}` });
                await cwpLog(migrationId, `  [${username}] Setting up domain: ${dom.domain}`);
                try {
                    const existingDom = await client.query('SELECT id FROM domains WHERE domain_name = $1', [dom.domain]);
                    if (existingDom.rows[0]) {
                        await cwpLog(migrationId, `  [${username}] Domain ${dom.domain} already exists — skipping`);
                        continue;
                    }
                    const phpVersion = resolvePhpVersion(dom.php_version || '8.3');
                    const domainInsert = await client.query(`INSERT INTO domains (user_id, domain_name, document_root, is_ssl, php_version)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`, [userId, dom.domain, dom.document_root || `/home/${username}/public_html`, dom.has_ssl ?? false, phpVersion]);
                    const domainId = domainInsert.rows[0].id;
                    await handleCreateDomain({
                        domainName: dom.domain,
                        username,
                        phpVersion,
                        docRoot: dom.document_root || `/home/${username}/public_html`,
                        domainId,
                    });
                    await cwpLog(migrationId, `  [${username}] Domain ${dom.domain} configured`);
                    // Import custom DNS records from the source zone (skip CWP boilerplate we manage ourselves)
                    const sourceRecords = (dom.dns_records ?? []);
                    // Discovery script already pre-filters; this is a safety net for any that slip through
                    const cwpStdNames = new Set([
                        '@', 'www', 'mail', 'smtp', 'smtps', 'pop', 'pop3', 'imap', 'imaps',
                        'webmail', 'ftp', 'sftp', 'cpanel', 'cwp', 'whm', 'whmcs', 'localhost',
                        'spam', 'default._domainkey', '_dmarc', 'autodiscover', 'autoconfig',
                    ]);
                    const customRecords = sourceRecords.filter((r) => {
                        if (['SOA', 'NS'].includes(String(r.type)))
                            return false;
                        if (cwpStdNames.has(String(r.name).toLowerCase()))
                            return false;
                        if (String(r.type) === 'CNAME' && String(r.content).replace(/\.$/, '') === String(dom.domain))
                            return false;
                        if (['v=spf1', 'v=DKIM1', 'v=DMARC1'].some(p => String(r.content).startsWith(p)))
                            return false;
                        return true;
                    });
                    if (customRecords.length > 0) {
                        const zoneRes = await client.query('SELECT id FROM dns_zones WHERE domain_name = $1', [dom.domain]);
                        const zoneId = zoneRes.rows[0]?.id;
                        if (zoneId) {
                            for (const r of customRecords) {
                                await client.query(`INSERT INTO dns_records (zone_id, type, name, content, priority, ttl)
                   VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, [zoneId, r.type, r.name, r.content, r.priority ?? null, r.ttl ?? 3600]);
                            }
                            // Rebuild the zone file with all records
                            await client.query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_DNS_ZONE', JSON.stringify({ domainName: dom.domain })]);
                            await cwpLog(migrationId, `  [${username}] Imported ${customRecords.length} custom DNS record(s) for ${dom.domain}`);
                        }
                    }
                }
                catch (e) {
                    await cwpLog(migrationId, `  [${username}] Domain error (${dom.domain}): ${e instanceof Error ? e.message : String(e)}`);
                }
            }
            // ── 4. Import databases ───────────────────────────────────────────────
            const dbs = (cwpUser.databases ?? []);
            for (const db of dbs) {
                await cwpProgress(migrationId, { users_total: usersToMigrate.length, users_done: i, current_user: username, current_step: `Database: ${db.db_name}` });
                await cwpLog(migrationId, `  [${username}] Importing database: ${db.db_name}`);
                try {
                    const localDbName = validateMysqlIdentifier(db.db_name);
                    const localDbUser = validateMysqlIdentifier(username);
                    const localDbPass = crypto.randomBytes(16).toString('hex');
                    // Create the DB locally
                    await handleCreateDatabase({ dbName: localDbName, dbUser: localDbUser, dbPassword: localDbPass });
                    // Track in PostgreSQL
                    await client.query(`INSERT INTO databases (user_id, db_name, db_user) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [userId, localDbName, localDbUser]);
                    // Import data from remote
                    await importRemoteDb(remoteHost, remotePort, remoteUser, cred, db.db_name, localDbName, localDbUser, localDbPass);
                    await cwpLog(migrationId, `  [${username}] Database ${db.db_name} imported`);
                    // Patch CMS config files that reference this database
                    const { stdout: cfgHits } = await execPromise(`sudo grep -rl ${shellEscape(localDbName)} /home/${shellEscape(username)}/ --include='wp-config.php' 2>/dev/null || true`).catch(() => ({ stdout: '' }));
                    for (const cfgPath of cfgHits.trim().split('\n').filter(Boolean)) {
                        try {
                            await patchCmsDbConfig(cfgPath, localDbUser, localDbPass);
                            await execPromise(`sudo setfacl -m user:jonathan:rw- ${shellEscape(cfgPath)}`);
                            await cwpLog(migrationId, `  [${username}] Patched DB credentials in ${cfgPath.split('/').pop()}`);
                        }
                        catch (e) {
                            await cwpLog(migrationId, `  [${username}] Config patch warning (${cfgPath.split('/').pop()}): ${e instanceof Error ? e.message : String(e)}`);
                        }
                    }
                }
                catch (e) {
                    await cwpLog(migrationId, `  [${username}] DB error (${db.db_name}): ${e instanceof Error ? e.message : String(e)}`);
                }
            }
            // ── 5. Set up email accounts ──────────────────────────────────────────
            const emailAccounts = (cwpUser.email_accounts ?? []);
            for (const acc of emailAccounts) {
                await cwpProgress(migrationId, { users_total: usersToMigrate.length, users_done: i, current_user: username, current_step: `Email: ${acc.email}` });
                await cwpLog(migrationId, `  [${username}] Creating email: ${acc.email}`);
                try {
                    const emailAddr = acc.email;
                    const [, emailDomain] = emailAddr.split('@');
                    // Ensure mail_domains record exists
                    const mdRes = await client.query(`INSERT INTO mail_domains (domain_name, user_id)
             VALUES ($1, $2) ON CONFLICT (domain_name) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`, [emailDomain, userId]);
                    const domainId = mdRes.rows[0].id;
                    // Migrate the mailbox password hash so IMAP/SMTP/webmail keep working;
                    // fall back to a placeholder the admin must replace if none was found.
                    const mailHash = normalizeMailHash(acc.password_hash) ?? '$MIGRATED$';
                    await client.query(`INSERT INTO mail_users (domain_id, email, password_hash, quota)
             VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING`, [domainId, emailAddr, mailHash, acc.quota_mb ?? 1024]);
                    if (mailHash !== '$MIGRATED$') {
                        await cwpLog(migrationId, `  [${username}] Mailbox password migrated for ${emailAddr}`);
                    }
                    // Provision the Dovecot mailbox directory
                    await handleProvisionMailbox({ email: emailAddr });
                    // Rsync Maildir if available on remote
                    const [localPart] = emailAddr.split('@');
                    const remoteMaildir = `/var/mail/vhosts/${emailDomain}/${localPart}/`;
                    const localMaildir = `/var/mail/vhosts/${emailDomain}/${localPart}/`;
                    try {
                        await rsyncFromRemote(remoteHost, remotePort, remoteUser, cred, remoteMaildir, localMaildir);
                        await cwpLog(migrationId, `  [${username}] Email ${emailAddr} + Maildir synced`);
                    }
                    catch {
                        await cwpLog(migrationId, `  [${username}] Email ${emailAddr} created (no remote Maildir found)`);
                    }
                }
                catch (e) {
                    await cwpLog(migrationId, `  [${username}] Email error (${acc.email}): ${e instanceof Error ? e.message : String(e)}`);
                }
            }
            await cwpProgress(migrationId, {
                users_total: usersToMigrate.length,
                users_done: i + 1,
                current_user: username,
                current_step: 'Done',
            });
            await cwpLog(migrationId, `  [${username}] ✓ Migration complete`);
        }
        await client.query(`UPDATE cwp_migrations SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`, [migrationId]);
        await cwpLog(migrationId, `All ${usersToMigrate.length} user(s) migrated successfully.`);
        if (setupLinks.length) {
            await cwpLog(migrationId, '━━━ Set-password links (send one to each user; 7-day, single-use) ━━━');
            for (const l of setupLinks)
                await cwpLog(migrationId, `  ${l}`);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await client.query(`UPDATE cwp_migrations SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`, [msg, migrationId]);
        await cwpLog(migrationId, `FATAL ERROR: ${msg}`);
        throw err;
    }
    finally {
        if (cred.type === 'key')
            await fs.unlink(cred.keyPath).catch(() => { });
    }
}
start().catch(console.error);
//# sourceMappingURL=index.js.map