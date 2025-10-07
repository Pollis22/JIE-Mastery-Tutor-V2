import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Database configuration with proper SSL handling
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

// Configure pool with secure SSL handling
const connectionConfig: any = {
  connectionString: dbUrl || "postgresql://fallback:fallback@localhost:5432/fallback",
};

// Only configure SSL if explicitly enabled
if (process.env.DATABASE_SSL === 'true') {
  connectionConfig.ssl = {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false'
  };
} else if (process.env.NODE_ENV === 'production' && dbUrl && !dbUrl.includes('localhost')) {
  // Default to SSL in production for remote databases
  connectionConfig.ssl = { rejectUnauthorized: true };
}

console.log('[DB] Creating connection pool...');
export const pool = new Pool(connectionConfig);
console.log('[DB] ✓ Pool created (will connect on first query)');

export const db = drizzle({ client: pool, schema });
console.log('[DB] ✓ Drizzle ORM initialized');