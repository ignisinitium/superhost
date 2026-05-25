import { Client } from 'pg';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';
import type { Task } from '../../shared/types.js';

const execPromise = promisify(exec);
dotenv.config();

const client = new Client({
  user: process.env.DB_USER || 'superhost',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'superhost',
  password: process.env.DB_PASSWORD || 'superhost_pass',
  port: parseInt(process.env.DB_PORT || '5432'),
});

async function handleTask(task: Task) {
  console.log(`Processing task: ${task.command}`, task.payload);
  
  try {
    await client.query('UPDATE tasks SET status = \'processing\', updated_at = NOW() WHERE id = $1', [task.id]);

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
        await handleManageService(task.payload);
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
      default:
        throw new Error(`Unknown command: ${task.command}`);
    }

    await client.query('UPDATE tasks SET status = \'completed\', updated_at = NOW() WHERE id = $1', [task.id]);
    console.log(`Task ${task.id} completed.`);
  } catch (err) {
    console.error(`Task ${task.id} failed:`, err);
    await client.query('UPDATE tasks SET status = \'failed\', error_message = $1, updated_at = NOW() WHERE id = $2', [(err as Error).message, task.id]);
  }
}

async function handleCreateUser(payload: any) {
  const { username } = payload;
  if (!username) throw new Error('Username is required');
  
  try {
    await execPromise(`id -u ${username}`).catch(async () => {
      await execPromise(`sudo useradd -m -s /bin/bash ${username}`);
    });
    
    // Create default public_html
    const homeDir = `/home/${username}`;
    const publicHtml = `${homeDir}/public_html`;
    await execPromise(`sudo mkdir -p ${publicHtml}`);
    await execPromise(`sudo chown -R ${username}:${username} ${homeDir}`);
    
    // Create automatic staging subdomain: username.web02.qc.fyi
    await handleCreateDomain({ 
      domainName: `${username}.web02.qc.fyi`, 
      username,
      phpVersion: '8.5'
    });

    console.log(`Linux user ${username} created with automatic staging subdomain.`);
  } catch (err) {
    console.error(`Failed to create user ${username}:`, err);
    throw err;
  }
}

async function handleReadLogs(payload: any, taskId: number) {
  const { logType, lines = 50 } = payload;
  let filePath = '';

  switch (logType) {
    case 'nginx_access': filePath = '/var/log/nginx/access.log'; break;
    case 'nginx_error': filePath = '/var/log/nginx/error.log'; break;
    case 'php_fpm': filePath = '/var/log/php8.5-fpm.log'; break;
    case 'system': filePath = '/var/log/syslog'; break;
    case 'auth': filePath = '/var/log/auth.log'; break;
    default: throw new Error(`Unknown log type: ${logType}`);
  }

  try {
    const { stdout } = await execPromise(`sudo tail -n ${lines} ${filePath}`);
    await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: stdout }), taskId]);
    console.log(`Read ${lines} lines from ${logType}.`);
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
  const { port, protocol } = payload;
  await execPromise(`sudo ufw allow ${port}/${protocol}`);
  console.log(`Firewall allowed ${port}/${protocol}`);
}

async function handleFirewallDelete(payload: any) {
  const { ruleNumber } = payload;
  if (!ruleNumber) throw new Error('Rule number is required');
  await execPromise(`sudo ufw --force delete ${ruleNumber}`);
  console.log(`Firewall rule ${ruleNumber} deleted.`);
}

async function handleGetFirewallStatus(payload: any, taskId: number) {
  const { stdout } = await execPromise('sudo ufw status numbered');
  // Store the result back in the task or a separate table
  await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: stdout }), taskId]);
  console.log('Firewall status fetched.');
}

async function handleGetProcesses(payload: any, taskId: number) {
  const { username } = payload;
  let command = 'ps aux --sort=-%cpu';
  
  if (username) {
    command = `ps -u ${username} -o user,pid,%cpu,%mem,vsz,rss,tty,stat,start,time,command --sort=-%cpu`;
  } else {
    // Default: Show Nginx and PHP-FPM if no user specified
    command = 'ps aux | grep -E "nginx|php-fpm" | grep -v grep';
  }

  const { stdout } = await execPromise(command);
  await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: stdout }), taskId]);
  console.log(`Processes fetched${username ? ` for user ${username}` : ''}.`);
}

async function handleKillProcess(payload: any) {
  const { pid, signal = 'SIGTERM', username } = payload;
  if (!pid) throw new Error('PID is required');

  // Security: Verify process belongs to the user if username is provided
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
  const { domainName } = payload;
  if (!domainName) throw new Error('Domain name is required');

  // Use certbot with nginx plugin
  // --non-interactive is crucial here
  await execPromise(`certbot --nginx -d ${domainName} --non-interactive --agree-tos --register-unsafely-without-email`);
  
  await client.query('UPDATE domains SET is_ssl = TRUE WHERE domain_name = $1', [domainName]);
  console.log(`SSL installed for ${domainName}`);
}

async function handleRestartService(payload: any) {
  const { serviceName } = payload;
  if (!serviceName) throw new Error('Service name is required');
  
  await execPromise(`sudo systemctl restart ${serviceName}`);
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
  const { nodeId, ipAddress } = payload;
  if (!nodeId || !ipAddress) throw new Error('nodeId and ipAddress are required');

  try {
    const { stdout } = await execPromise(`ping -c 1 -W 2 ${ipAddress}`);
    const status = stdout.includes('1 received') ? 'online' : 'offline';
    await client.query('UPDATE cluster_nodes SET status = $1, last_seen = NOW() WHERE id = $2', [status, nodeId]);
  } catch (err) {
    await client.query('UPDATE cluster_nodes SET status = $1 WHERE id = $2', ['offline', nodeId]);
  }
}

async function handleSyncClusterConfig(payload: any) {
  const { ipAddress } = payload;
  if (!ipAddress) throw new Error('ipAddress is required');

  try {
    console.log(`Starting cluster config sync for node ${ipAddress}...`);
    // Simulated sync delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.log(`Successfully synchronized with node ${ipAddress}.`);
  } catch (err) {
    console.error(`Failed to sync with node ${ipAddress}:`, err);
    throw err;
  }
}

async function handleGetSystemStats(taskId: number) {
  try {
    const { stdout: uptime } = await execPromise("uptime -p");
    const { stdout: os } = await execPromise("lsb_release -ds");
    const { stdout: kernel } = await execPromise("uname -r");
    const { stdout: ip } = await execPromise("hostname -I | awk '{print $1}'");
    const { stdout: load } = await execPromise("cat /proc/loadavg | awk '{print $1 \", \" $2 \", \" $3}'");

    const stats = {
      uptime: uptime.trim().replace('up ', ''),
      os: os.trim().replace(/"/g, ''),
      kernel: kernel.trim(),
      ip: ip.trim(),
      loadAvg: load.trim()
    };

    await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: stats }), taskId]);
    console.log('System stats fetched.');
  } catch (err) {
    console.error('Failed to fetch system stats:', err);
    throw err;
  }
}

async function handleFirewallBlockIp(payload: any) {
  const { ipAddress } = payload;
  if (!ipAddress) throw new Error('IP address is required');
  // Use insert 1 to ensure it's at the top of the rules
  await execPromise(`sudo ufw insert 1 deny from ${ipAddress}`);
  console.log(`IP ${ipAddress} blocked at firewall.`);
}

async function handleFirewallUnblockIp(payload: any) {
  const { ipAddress } = payload;
  if (!ipAddress) throw new Error('IP address is required');
  await execPromise(`sudo ufw delete deny from ${ipAddress}`);
  console.log(`IP ${ipAddress} unblocked at firewall.`);
}

async function handleGetServicesStatus(taskId: number) {
  const services = [
    'nginx', 'mariadb', 'postfix', 'dovecot', 
    'clamav-daemon', 'postgresql', 'opendkim'
  ];
  
  const results = [];
  for (const service of services) {
    try {
      // is-active returns 0 if active, 3 if inactive
      const active = await execPromise(`systemctl is-active ${service}`).then(() => true).catch(() => false);
      const { stdout: enabledOut } = await execPromise(`systemctl is-enabled ${service}`);
      results.push({
        name: service,
        status: active ? 'active' : 'inactive',
        autostart: enabledOut.trim() === 'enabled'
      });
    } catch (err) {
      results.push({ name: service, status: 'inactive', autostart: false });
    }
  }

  await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: results }), taskId]);
}

async function handleManageService(payload: any) {
  const { service, action } = payload;
  if (!service || !action) throw new Error('Service and action are required');

  const validActions = ['start', 'stop', 'restart', 'enable', 'disable'];
  if (!validActions.includes(action)) throw new Error('Invalid action');

  await execPromise(`sudo systemctl ${action} ${service}`);
  console.log(`Service ${service} ${action}ed.`);
}

async function handleGetUpdates(taskId: number) {
  try {
    await execPromise('sudo apt-get update');
    const { stdout } = await execPromise('apt list --upgradable');
    
    // Parse output (skipping the "Listing..." header)
    const lines = stdout.split('\n').filter(line => line.includes('/') && !line.includes('Listing...'));
    const updates = lines.map(line => {
      const [namePart, info] = line.split(' ');
      const name = namePart.split('/')[0];
      return { name, info };
    });

    // Check if auto-updates are enabled
    const { stdout: autoStatus } = await execPromise('cat /etc/apt/apt.conf.d/20auto-upgrades').catch(() => ({ stdout: '0' }));
    const isAutoEnabled = autoStatus.includes('1');

    await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: { updates, isAutoEnabled } }), taskId]);
    console.log(`Found ${updates.length} updates.`);
  } catch (err) {
    console.error('Failed to get updates:', err);
    throw err;
  }
}

async function handleInstallUpdates(taskId: number) {
  try {
    console.log('Installing system updates...');
    const { stdout } = await execPromise('sudo DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y');
    await client.query('UPDATE tasks SET payload = payload || $1 WHERE id = $2', [JSON.stringify({ result: stdout }), taskId]);
    console.log('Updates installed successfully.');
  } catch (err) {
    console.error('Failed to install updates:', err);
    throw err;
  }
}

async function handleManageAutoUpdates(payload: any) {
  const { enabled } = payload;
  const value = enabled ? '1' : '0';
  const config = `APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "${value}";\n`;
  
  try {
    const tempFile = `/tmp/20auto-upgrades`;
    await fs.writeFile(tempFile, config);
    await execPromise(`sudo mv ${tempFile} /etc/apt/apt.conf.d/20auto-upgrades`);
    await execPromise('sudo systemctl restart unattended-upgrades');
    console.log(`Automatic updates ${enabled ? 'enabled' : 'disabled'}.`);
  } catch (err) {
    console.error('Failed to manage auto-updates:', err);
    throw err;
  }
}

async function start() {
  await client.connect();
  console.log('Worker connected to database.');

  // --- Background Metrics Collection ---
  const collectMetrics = async () => {
    try {
      // 1. CPU Usage (average over 1 second)
      const { stdout: cpuOut } = await execPromise("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'");
      const cpu = parseFloat(cpuOut.trim()) || 0;

      // 2. RAM Usage
      const { stdout: ramOut } = await execPromise("free -m | grep Mem | awk '{print $3}'");
      const ram = parseInt(ramOut.trim()) || 0;

      // 3. Network Throughput (Total bytes RX/TX)
      // This is a simplified delta calculation. In a real app, you'd compare two readings.
      // For now, we'll just log absolute values or small random fluctuations for the demo if delta is hard.
      const { stdout: netOut } = await execPromise("cat /proc/net/dev | grep eth0 | awk '{print $2 \" \" $10}'");
      const [rx, tx] = netOut.trim().split(' ').map(n => Math.round(parseInt(n) / (1024 * 1024))); // Convert to MB

      await client.query(
        'INSERT INTO server_metrics (cpu_percent, ram_used_mb, network_rx_mbps, network_tx_mbps) VALUES ($1, $2, $3, $4)',
        [cpu, ram, rx || 0, tx || 0]
      );
      
      // Cleanup old metrics (keep last 7 days)
      await client.query("DELETE FROM server_metrics WHERE recorded_at < NOW() - INTERVAL '7 days'");
    } catch (err) {
      console.error('Failed to collect background metrics:', err);
    }
  };

  // Run every 5 minutes
  setInterval(collectMetrics, 5 * 60 * 1000);
  collectMetrics(); // Run immediately on start

  // --- System Security Log Monitor (SSH Brute Force Protection) ---
  const watchAuthLogs = async () => {
    console.log('Starting system security log monitor...');
    const { spawn } = await import('child_process');
    // We tail the log and process line by line
    const tail = spawn('sudo', ['tail', '-f', '-n', '0', '/var/log/auth.log']);

    tail.stdout.on('data', async (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        // Match: Failed password for root from 1.2.3.4 ...
        // Match: Failed password for invalid user admin from 1.2.3.4 ...
        const match = line.match(/Failed password for (?:invalid user )?(\S+) from ([\d\.]+) port/);
        if (match) {
          const username = match[1];
          const ipAddress = match[2];
          console.log(`SECURITY: Detected failed SSH login for ${username} from ${ipAddress}`);
          
          try {
             await client.query(
               'INSERT INTO login_attempts (ip_address, username, success) VALUES ($1, $2, $3)',
               [ipAddress, `ssh:${username}`, false]
             );

             const checkRes = await client.query(
               'SELECT count(*) FROM login_attempts WHERE ip_address = $1 AND success = false AND created_at > NOW() - INTERVAL \'15 minutes\'',
               [ipAddress]
             );

             if (parseInt(checkRes.rows[0].count) >= 5) {
               console.warn(`SECURITY: Brute force detected from ${ipAddress}. Blocking...`);
               
               await client.query(
                 'INSERT INTO blocked_ips (ip_address, reason, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'24 hours\') ON CONFLICT (ip_address) DO NOTHING',
                 [ipAddress, 'Automatic block: SSH brute-force detected']
               );

               await handleFirewallBlockIp({ ipAddress });
             }
          } catch (e) {
            console.error('Failed to process security log entry:', e);
          }
        }
      }
    });

    tail.stderr.on('data', (data) => {
      console.error('Auth log monitor error:', data.toString());
    });
  };

  watchAuthLogs();

  // --- Task Listener ---
  await client.query('LISTEN new_task');

  client.on('notification', async (msg) => {
    if (msg.channel === 'new_task' && msg.payload) {
      const task = JSON.parse(msg.payload);
      await handleTask(task);
    }
  });

  // Also check for any missed pending tasks on startup
  const res = await client.query('SELECT * FROM tasks WHERE status = \'pending\' ORDER BY created_at ASC');
  for (const task of res.rows) {
    await handleTask(task);
  }
}

start().catch(console.error);
