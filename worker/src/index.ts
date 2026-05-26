import { Client } from 'pg';
import dotenv from 'dotenv';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
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
      case 'GENERATE_EMAIL_DNS':
        await handleGenerateEmailDns(task.payload);
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

    // Detect installed PHP versions instead of hardcoding
    let phpVersion = '8.3';
    try {
      const { stdout } = await execPromise('ls /etc/php/ 2>/dev/null | sort -V | tail -1');
      const detected = stdout.trim();
      if (detected && /^[78]\.\d{1,2}$/.test(detected)) phpVersion = detected;
    } catch {
      // Default to 8.3 if detection fails
    }

    // Create automatic staging subdomain
    const masterDomain = process.env.MASTER_DOMAIN;
    if (!masterDomain) throw new Error('MASTER_DOMAIN environment variable is not set');
    await handleCreateDomain({
      domainName: `${username}.${masterDomain}`,
      username,
      phpVersion,
    });

    console.log(`Linux user ${username} created with automatic staging subdomain.`);
  } catch (err) {
    console.error(`Failed to create user ${username}:`, err);
    throw err;
  }
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

  // Root strategy: All domains for this user point to their primary public_html
  const docRoot = `/home/${username}/public_html`;
  
  try {
    await execPromise(`sudo mkdir -p ${docRoot}`);
    await execPromise(`sudo chown -R ${username}:${username} ${docRoot}`);

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
    await execPromise(`sudo ln -sf ${configPath} /etc/nginx/sites-enabled/`);
    await execPromise('sudo nginx -t && sudo systemctl reload nginx');
    
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
    // 1. Generate DKIM keys
    await execPromise(`sudo mkdir -p ${keyDir}`);
    await execPromise(`sudo opendkim-genkey -s ${selector} -d ${domainName} -D ${keyDir}`);
    await execPromise(`sudo chown -R opendkim:opendkim ${keyDir}`);

    // 2. Read the public key to construct the DNS record
    const { stdout: pubKeyOut } = await execPromise(`sudo cat ${keyDir}/${selector}.txt`);
    
    // Extract the raw public key string from the formatted bind record
    const match = pubKeyOut.match(/p=([^"]+)/);
    const pubKey = match ? match[1] : '';

    if (!pubKey) throw new Error('Failed to parse DKIM public key');

    const dkimRecord = `v=DKIM1; h=sha256; k=rsa; p=${pubKey}`;

    // 3. Update OpenDKIM mapping files
    await execPromise(`sudo bash -c 'echo "${selector}._domainkey.${domainName} ${domainName}:${selector}:${keyDir}/${selector}.private" >> /etc/opendkim/KeyTable'`);
    await execPromise(`sudo bash -c 'echo "*@${domainName} ${selector}._domainkey.${domainName}" >> /etc/opendkim/SigningTable'`);
    await execPromise(`sudo bash -c 'grep -q "${domainName}" /etc/opendkim/TrustedHosts || echo "${domainName}" >> /etc/opendkim/TrustedHosts'`);
    await execPromise(`sudo systemctl restart opendkim`);

    // 4. Save SPF, DKIM, and DMARC records to database
    await client.query('DELETE FROM domain_dns_records WHERE domain_id = $1 AND (type = \'TXT\' OR name LIKE \'_domainkey%\' OR name LIKE \'_dmarc%\')', [domainId]);

    // SPF
    await client.query('INSERT INTO domain_dns_records (domain_id, type, name, content) VALUES ($1, $2, $3, $4)', 
      [domainId, 'TXT', '@', 'v=spf1 mx a -all']);
    
    // DKIM
    await client.query('INSERT INTO domain_dns_records (domain_id, type, name, content) VALUES ($1, $2, $3, $4)', 
      [domainId, 'TXT', `${selector}._domainkey`, dkimRecord]);

    // DMARC
    await client.query('INSERT INTO domain_dns_records (domain_id, type, name, content) VALUES ($1, $2, $3, $4)', 
      [domainId, 'TXT', '_dmarc', `v=DMARC1; p=quarantine; sp=quarantine; adkim=r; aspf=r;`]);

    console.log(`Generated email DNS records for ${domainName}.`);
  } catch (err) {
    console.error(`Error generating DNS for ${domainName}:`, err);
    throw err;
  }
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
    let command = '';
    if (type === 'node') {
      command = `pm2 start ${startupScript || 'index.js'} --name ${appName} --interpreter node --cwd ${appPath}`;
    } else if (type === 'python') {
      command = `pm2 start ${startupScript || 'app.py'} --name ${appName} --interpreter python3 --cwd ${appPath}`;
    }

    await execPromise(`sudo -u ${username} bash -c "cd ${appPath} && ${command}"`);
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
    await execPromise(`sudo -u ${username} pm2 ${action} ${appName}`);
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
    // 1. Delete from PM2
    await execPromise(`sudo -u ${username} pm2 delete ${appName}`).catch(() => {});
    
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
      return `${name}${ttl}\tIN\t${r.type}${priority}\t${r.content}`;
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
  console.log('Configuring mail server with advanced features...');
  try {
    const configDir = path.join(process.cwd(), 'src/mail_configs');
    
    // 1. Copy Postfix PGSQL configurations
    const postfixFiles = [
      'pgsql-virtual-mailbox-domains.cf',
      'pgsql-virtual-mailbox-maps.cf',
      'pgsql-virtual-alias-maps.cf'
    ];

    for (const file of postfixFiles) {
      await execPromise(`sudo cp ${path.join(configDir, file)} /etc/postfix/`);
      await execPromise(`sudo chown root:postfix /etc/postfix/${file}`);
      await execPromise(`sudo chmod 640 /etc/postfix/${file}`);
    }

    // 2. Update Postfix main.cf for virtual aliases (Forwarders)
    await execPromise(`sudo postconf -e "virtual_alias_maps = proxy:pgsql:/etc/postfix/pgsql-virtual-alias-maps.cf"`);
    
    // 3. Integrate SpamAssassin (using spamass-milter or similar)
    // For this implementation, we will assume spamc/spamd is used via Postfix milter
    await execPromise(`sudo systemctl enable spamassassin && sudo systemctl start spamassassin`);
    
    // 4. Restart Services
    await execPromise(`sudo systemctl restart postfix`);
    await execPromise(`sudo systemctl restart dovecot`);

    console.log('Mail server configuration updated successfully.');
  } catch (err) {
    console.error('Failed to configure mail server:', err);
    throw err;
  }
}

async function handleReleaseQuarantine(payload: any) {
  const { id, filePath, recipient } = payload;
  if (!filePath || !recipient) throw new Error('filePath and recipient are required');

  try {
    // 1. Deliver the file to the user's Maildir
    // We assume standard Maildir structure: /var/mail/vhosts/domain/user/new/
    const [user, domain] = recipient.split('@');
    const destDir = `/var/mail/vhosts/${domain}/${user}/new`;
    const fileName = path.basename(filePath);
    
    await execPromise(`sudo mkdir -p ${destDir}`);
    await execPromise(`sudo mv ${filePath} ${destDir}/${fileName}`);
    await execPromise(`sudo chown vmail:vmail ${destDir}/${fileName}`);

    // 2. Clean up DB record
    await client.query('DELETE FROM mail_quarantine WHERE id = $1', [id]);

    console.log(`Released quarantined email to ${recipient}.`);
  } catch (err) {
    console.error(`Failed to release quarantine for ${id}:`, err);
    throw err;
  }
}

async function handleSendSpamDigest(payload: any) {
  const { mailUserId } = payload;
  
  try {
    // 1. Get user and their quarantined items from the last 24h
    const userRes = await client.query(`
      SELECT mu.email, mu.id 
      FROM mail_users mu 
      WHERE ($1::int IS NULL OR mu.id = $1) AND mu.spam_digest_enabled = true
    `, [mailUserId || null]);

    for (const user of userRes.rows) {
      const qRes = await client.query(`
        SELECT * FROM mail_quarantine 
        WHERE mail_user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
      `, [user.id]);

      if (qRes.rowCount === 0) continue;

      // 2. Build the Digest Email (Simplified)
      console.log(`Sending spam digest to ${user.email} with ${qRes.rowCount} items...`);
      
      let htmlBody = `<h1>Daily Spam Digest for ${user.email}</h1>`;
      htmlBody += `<p>The following emails were quarantined in the last 24 hours:</p><table border="1">`;
      htmlBody += `<tr><th>From</th><th>Subject</th><th>Score</th><th>Action</th></tr>`;

      for (const item of qRes.rows) {
        htmlBody += `<tr>
          <td>${item.sender}</td>
          <td>${item.subject}</td>
          <td>${item.spam_score}</td>
          <td>
            <a href="https://${process.env.DASHBOARD_DOMAIN}/client/spam?release=${item.id}">Allow</a> | 
            <a href="https://${process.env.DASHBOARD_DOMAIN}/client/spam?delete=${item.id}">Delete</a>
          </td>
        </tr>`;
      }
      htmlBody += `</table>`;

      // 3. Send via sendmail or internal transport
      const tempMail = `/tmp/digest_${user.id}.html`;
      await fs.writeFile(tempMail, htmlBody);
      await execPromise(`sudo mail -a "Content-Type: text/html" -s "Daily Spam Digest" ${user.email} < ${tempMail}`);
      await fs.rm(tempMail);
    }
  } catch (err) {
    console.error('Failed to send spam digest:', err);
    throw err;
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

start().catch(console.error);
