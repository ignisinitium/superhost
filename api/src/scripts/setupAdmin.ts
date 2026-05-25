import bcrypt from 'bcryptjs';
import { query } from '../db';
import dotenv from 'dotenv';

dotenv.config();

async function setupAdmin() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3];

  if (!password) {
    console.error('Usage: ts-node setupAdmin.ts <username> <password>');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  try {
    await query(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET password_hash = $2',
      [username, hash]
    );
    console.log(`Admin user '${username}' created/updated successfully.`);
  } catch (err) {
    console.error('Error creating admin user:', err);
  } finally {
    process.exit();
  }
}

setupAdmin();
