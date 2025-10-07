import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from "@shared/schema";

// Database configuration
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[DB] ❌ DATABASE_URL must be set in production');
    console.error('[DB] Server will start but database features will NOT work');
  } else {
    console.log("[DB] No DATABASE_URL found - using dummy connection for testing");
  }
}

// Safe logging - only show protocol and host, not credentials
if (dbUrl) {
  const urlParts = dbUrl.match(/^(postgresql:\/\/)([^@]+@)?([^\/]+)/);
  const safeUrl = urlParts ? `${urlParts[1]}***@${urlParts[3]}` : 'postgresql://***';
  console.log(`[DB] Database URL configured: ${safeUrl}`);
}

// Configure standard PostgreSQL pool with SSL for production
const connectionConfig: any = {
  connectionString: dbUrl || "postgresql://fallback:fallback@localhost:5432/fallback",
};

// Enable SSL in production for remote databases
if (process.env.NODE_ENV === 'production' && dbUrl && !dbUrl.includes('localhost')) {
  connectionConfig.ssl = { 
    rejectUnauthorized: false // Required for Railway and most cloud providers
  };
  console.log('[DB] SSL enabled for production');
}

console.log('[DB] Creating connection pool with standard pg driver...');
export const pool = new Pool(connectionConfig);

// Test the connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('[DB] ❌ Initial connection test failed:', err.message);
    console.error('[DB] The server will continue but database operations may fail');
  } else {
    console.log('[DB] ✓ Connection test successful');
    release();
  }
});

export const db = drizzle(pool, { schema });
console.log('[DB] ✓ Drizzle ORM initialized with standard pg driver');