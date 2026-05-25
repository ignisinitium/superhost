import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Fail loudly at startup if required DB config is missing
const required = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD'] as const;
for (const key of required) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT ?? '5432'),
  // Connection pool settings
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Surface pool-level errors (e.g., lost connection) without crashing the process
pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

// Verify connectivity on startup
pool.connect()
  .then((client) => {
    client.release();
    console.log('PostgreSQL connection pool ready');
  })
  .catch((err) => {
    console.error('FATAL: Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  });

export const query = (text: string, params?: unknown[]) => pool.query(text, params);
export default pool;
