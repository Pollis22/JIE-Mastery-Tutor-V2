import { execSync } from 'child_process';
import { db, pool } from './db';
import { sql } from 'drizzle-orm';

export async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('[DB-Init] ❌ DATABASE_URL is not set');
    return false;
  }

  try {
    // Check if tables exist by trying a simple query
    console.log('[DB-Init] Checking database schema...');
    
    // Try to query the users table using raw SQL
    const result = await pool.query(`
      SELECT COUNT(*) FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
    `);
    
    const tableCount = parseInt(result.rows[0]?.count || '0', 10);
    const tableExists = tableCount > 0;
    
    if (!tableExists) {
      console.log('[DB-Init] Tables missing! Running schema sync...');
      
      // Run drizzle-kit push to sync schema
      try {
        execSync('npm run db:push --force', {
          stdio: 'inherit',
          env: { ...process.env }
        });
        console.log('[DB-Init] ✅ Database schema synced successfully');
      } catch (syncError) {
        console.error('[DB-Init] ❌ Failed to sync schema:', syncError);
        
        // Try alternative: push with force flag directly
        console.log('[DB-Init] Retrying with force flag...');
        try {
          execSync('npx drizzle-kit push --force', {
            stdio: 'inherit',
            env: { ...process.env }
          });
          console.log('[DB-Init] ✅ Database schema force-synced successfully');
        } catch (forceError) {
          console.error('[DB-Init] ❌ Force sync also failed:', forceError);
          throw new Error('Database schema sync failed');
        }
      }
    } else {
      console.log('[DB-Init] ✅ Database schema already exists');
    }
    
    return true;
  } catch (error) {
    console.error('[DB-Init] ❌ Database initialization error:', error);
    
    // In production, try to force sync anyway
    if (process.env.NODE_ENV === 'production') {
      console.log('[DB-Init] Production mode - attempting force sync...');
      try {
        execSync('npx drizzle-kit push --force', {
          stdio: 'inherit',
          env: { ...process.env }
        });
        console.log('[DB-Init] ✅ Production database force-synced');
        return true;
      } catch (syncError) {
        console.error('[DB-Init] ❌ Production sync failed:', syncError);
      }
    }
    
    return false;
  }
}