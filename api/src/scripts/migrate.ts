import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { query } from '../db.js';
import dotenv from 'dotenv';

const execPromise = promisify(exec);
dotenv.config();

interface MigrationMetadata {
  username: string;
  email: string;
  domains: string[];
  databases: string[];
}

async function orchestrateMigration(metadata: MigrationMetadata, sourceHtml?: string) {
  console.log('Detected Metadata:', metadata);

  // A. Create User
  const userRes = await query(
    'INSERT INTO users (username, email, home_dir) VALUES ($1, $2, $3) ON CONFLICT (username) DO UPDATE SET username = $1 RETURNING id',
    [metadata.username, metadata.email || `${metadata.username}@migrated.com`, `/home/${metadata.username}`]
  );
  const userId = userRes.rows[0].id;

  await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', [
    'CREATE_USER', { username: metadata.username }
  ]);

  // B. Create Domains
  for (const domain of metadata.domains) {
    await query(
      'INSERT INTO domains (user_id, domain_name, document_root) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [userId, domain, `/home/${metadata.username}/public_html/${domain}`]
    );
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', [
      'CREATE_DOMAIN', { domainName: domain, username: metadata.username }
    ]);
  }

  // C. Sync Data if provided
  if (sourceHtml) {
    const targetHtml = `/home/${metadata.username}/public_html`;
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', [
      'SYNC_MIGRATION_DATA', { sourcePath: sourceHtml, targetPath: targetHtml, username: metadata.username }
    ]);
    console.log(`Sync task queued for ${metadata.username}.`);
  }

  console.log('Migration orchestration complete.');
}

async function migrateCPanel(backupPath: string) {
  const tempDir = path.join('/tmp', `migrate_cp_${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    console.log(`Extracting cPanel backup: ${backupPath}...`);
    await execPromise(`tar -xzf ${backupPath} -C ${tempDir}`);

    const metadata: MigrationMetadata = {
      username: '',
      email: '',
      domains: [],
      databases: [],
    };

    const dirs = await fs.readdir(tempDir);
    metadata.username = dirs.find(d => !d.startsWith('.')) || 'unknown';

    const userdataPath = path.join(tempDir, metadata.username, 'cp', 'userdata');
    try {
      const vhostFiles = await fs.readdir(userdataPath);
      metadata.domains = vhostFiles.filter(f => !f.includes('_') && !f.includes('.'));
    } catch (e) {
      console.warn('Could not find userdata, attempting fallback domain detection...');
    }

    const mysqlDir = path.join(tempDir, metadata.username, 'mysql');
    try {
      const dbFiles = await fs.readdir(mysqlDir);
      metadata.databases = dbFiles.filter(f => f.endsWith('.sql')).map(f => f.replace('.sql', ''));
    } catch (e) {}

    const sourceHtml = path.join(tempDir, metadata.username, 'homedir', 'public_html');
    await orchestrateMigration(metadata, sourceHtml);
  } catch (err) {
    console.error('cPanel Migration failed:', err);
    // Cleanup on error only, otherwise worker cleans up after sync
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function migrateCWP(backupPath: string) {
  const tempDir = path.join('/tmp', `migrate_cwp_${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    console.log(`Extracting CWP backup: ${backupPath}...`);
    await execPromise(`tar -xzf ${backupPath} -C ${tempDir}`);

    const metadata: MigrationMetadata = {
      username: '',
      email: '',
      domains: [],
      databases: [],
    };

    const dirs = await fs.readdir(tempDir);
    metadata.username = backupPath.split('_').pop()?.split('.')[0] || 'unknown_cwp';

    const vhostPath = path.join(tempDir, 'vhost');
    try {
      const vhostFiles = await fs.readdir(vhostPath);
      metadata.domains = vhostFiles.filter(f => f.endsWith('.conf')).map(f => f.replace('.conf', ''));
    } catch (e) {
      const publicHtml = path.join(tempDir, 'homedir', 'public_html');
      try {
        const sites = await fs.readdir(publicHtml);
        metadata.domains = sites.filter(s => s.includes('.'));
      } catch (e2) {}
    }

    const mysqlDir = path.join(tempDir, 'mysql');
    try {
      const dbFiles = await fs.readdir(mysqlDir);
      metadata.databases = dbFiles.filter(f => f.endsWith('.sql')).map(f => f.replace('.sql', ''));
    } catch (e) {}

    const sourceHtml = path.join(tempDir, 'homedir', 'public_html');
    await orchestrateMigration(metadata, sourceHtml);
  } catch (err) {
    console.error('CWP Migration failed:', err);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

const backupFile = process.argv[2];
if (!backupFile) {
  console.error('Usage: ts-node migrate.ts <path_to_backup.tar.gz>');
  process.exit(1);
}

const isCWP = backupFile.toLowerCase().includes('backup_');
if (isCWP) {
  migrateCWP(backupFile).catch(console.error);
} else {
  migrateCPanel(backupFile).catch(console.error);
}
