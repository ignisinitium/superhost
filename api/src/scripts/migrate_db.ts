import { query } from '../db.js';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  try {
    console.log('Updating users table with password and resource columns...');
    await query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS password_hash TEXT,
      ADD COLUMN IF NOT EXISTS disk_limit_mb INTEGER DEFAULT 1024,
      ADD COLUMN IF NOT EXISTS disk_used_mb INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS bandwidth_limit_mb INTEGER DEFAULT 5120,
      ADD COLUMN IF NOT EXISTS bandwidth_used_mb INTEGER DEFAULT 0;
    `);
    console.log('Database migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit();
  }
}

migrate();
