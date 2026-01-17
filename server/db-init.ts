import { execSync } from 'child_process';
import { db, pool } from './db';
import { sql } from 'drizzle-orm';

export async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('[DB-Init] ❌ DATABASE_URL is not set');
    return false;
  }

  try {
    // First, ensure session table exists (critical for auth)
    await ensureSessionTable();
    
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
    
    // REGRESSION GUARD: Verify critical trial column exists with correct name
    await verifyTrialSchemaColumns();
    
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

async function ensureSessionTable() {
  try {
    console.log('[DB-Init] Checking for session table...');
    
    // Check if session table exists
    const result = await pool.query(`
      SELECT COUNT(*) FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'session'
    `);
    
    const tableCount = parseInt(result.rows[0]?.count || '0', 10);
    const tableExists = tableCount > 0;
    
    if (!tableExists) {
      console.log('[DB-Init] Creating session table...');
      
      // Create session table using raw SQL that matches connect-pg-simple expectations
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "session" (
          "sid" VARCHAR(255) NOT NULL COLLATE "default",
          "sess" JSON NOT NULL,
          "expire" TIMESTAMP(6) NOT NULL,
          CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
        ) WITH (OIDS=FALSE)
      `);
      
      // Create index on expire column for performance
      await pool.query(`
        CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
      `);
      
      console.log('[DB-Init] ✅ Session table created successfully');
    } else {
      console.log('[DB-Init] ✅ Session table already exists');
    }
  } catch (error) {
    console.error('[DB-Init] ❌ Failed to ensure session table:', error);
    // Don't throw - let connect-pg-simple try to create it
  }
}

/**
 * REGRESSION GUARD: Verify trial schema columns exist with correct names
 * This prevents code/DB schema mismatches that cause 500 errors
 */
async function verifyTrialSchemaColumns() {
  console.log('[DB-Init] Verifying trial schema columns...');
  
  try {
    // Check for is_trial_active column (production schema)
    const isTrialActiveResult = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_trial_active'
    `);
    
    // Check for legacy trial_active column (should NOT exist in production)
    const trialActiveResult = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'trial_active'
    `);
    
    const hasIsTrialActive = isTrialActiveResult.rows.length > 0;
    const hasLegacyTrialActive = trialActiveResult.rows.length > 0;
    
    if (hasIsTrialActive) {
      console.log('[DB-Init] ✅ is_trial_active column exists (correct)');
    } else if (hasLegacyTrialActive) {
      // Dev environment might have old column - warn but don't fail
      console.warn('[DB-Init] ⚠️ Found legacy trial_active column. Production uses is_trial_active.');
      console.warn('[DB-Init] ⚠️ Run "npm run db:push" to sync schema or rename column manually.');
    } else {
      console.warn('[DB-Init] ⚠️ No trial column found. Schema may need sync.');
    }
    
    // Verify other trial columns exist
    const trialColumnsResult = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('trial_minutes_total', 'trial_minutes_used', 'trial_started_at')
    `);
    
    const foundColumns = trialColumnsResult.rows.map((r: any) => r.column_name);
    const requiredColumns = ['trial_minutes_total', 'trial_minutes_used', 'trial_started_at'];
    const missingColumns = requiredColumns.filter(c => !foundColumns.includes(c));
    
    if (missingColumns.length === 0) {
      console.log('[DB-Init] ✅ All trial columns verified');
    } else {
      console.warn(`[DB-Init] ⚠️ Missing trial columns: ${missingColumns.join(', ')}`);
    }
  } catch (error) {
    console.error('[DB-Init] ❌ Failed to verify trial columns:', error);
    // Don't throw - just warn, the app might still work
  }
}