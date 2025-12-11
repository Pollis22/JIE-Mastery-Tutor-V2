import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@shared/schema';

// Database configuration
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[DB] ❌ DATABASE_URL is not set');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL must be set in production');
  }
}

// Configure PostgreSQL pool
// Railway internal connections don't use SSL
const pool = new Pool({
  connectionString: connectionString || 'postgresql://localhost:5432/dummy',
  // No SSL config - Railway internal connections don't use SSL
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

console.log('[DB] ✓ PostgreSQL pool created with standard pg driver');

// Initialize Drizzle ORM
export const db = drizzle(pool, { schema });
export { pool };

console.log('[DB] ✓ Drizzle ORM initialized');

// Test connection on startup
pool.on('connect', () => {
  console.log('[DB] ✓ Database connection established');
});

pool.on('error', (err) => {
  console.error('[DB] ❌ Unexpected database error:', err);
});