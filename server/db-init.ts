import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
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
    
    // Run trial abuse tracking migration (idempotent)
    await runTrialAbuseTrackingMigration();
    
    // CRITICAL: Verify trial_abuse_tracking table exists (fail-fast)
    await verifyTrialAbuseTrackingTable();
    
    // REGRESSION GUARD: Verify critical trial column exists with correct name
    await verifyTrialSchemaColumns();
    
    // PRODUCTION-SAFE: Ensure realtime_sessions columns exist for telemetry
    await ensureRealtimeSessionsColumns();
    
    // PRODUCTION-SAFE: Ensure users.transcript_email column exists
    await ensureUsersTranscriptEmailColumn();
    
    // PRODUCTION-SAFE: Ensure users.additional_emails column exists
    await ensureUsersAdditionalEmailsColumn();
    
    // PRODUCTION-SAFE: Ensure content_violations and user_suspensions tables exist
    await ensureContentModerationTables();
    
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
      AND column_name IN ('trial_minutes_limit', 'trial_minutes_used', 'trial_started_at')
    `);
    
    const foundColumns = trialColumnsResult.rows.map((r: any) => r.column_name);
    const requiredColumns = ['trial_minutes_limit', 'trial_minutes_used', 'trial_started_at'];
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

/**
 * Run the trial_abuse_tracking migration (idempotent)
 * This ensures the anti-abuse table exists with correct schema on every deploy
 */
async function runTrialAbuseTrackingMigration() {
  console.log('[DB-Init] Running trial_abuse_tracking migration...');
  
  try {
    // Enable pgcrypto extension for gen_random_uuid()
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    
    // Create table if not exists with correct schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.trial_abuse_tracking (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_hash TEXT,
        ip_hash TEXT NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        trial_count INTEGER NOT NULL DEFAULT 0,
        last_trial_at TIMESTAMPTZ,
        week_start DATE NOT NULL DEFAULT date_trunc('week', now())::date,
        blocked BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    
    // Handle legacy NULL ip_hash rows (delete orphaned records)
    await pool.query(`DELETE FROM trial_abuse_tracking WHERE ip_hash IS NULL`);
    
    // Add UNIQUE constraint for UPSERT (idempotent check)
    const constraintExists = await pool.query(`
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'trial_abuse_tracking_ip_week_unique'
    `);
    
    if (constraintExists.rows.length === 0) {
      await pool.query(`
        ALTER TABLE trial_abuse_tracking 
        ADD CONSTRAINT trial_abuse_tracking_ip_week_unique 
        UNIQUE (ip_hash, week_start)
      `);
    }
    
    // Create indexes (IF NOT EXISTS is idempotent)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_trial_abuse_ip_recent 
      ON trial_abuse_tracking (ip_hash, last_trial_at DESC)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_trial_abuse_week_start 
      ON trial_abuse_tracking (week_start)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_trial_abuse_user_id 
      ON trial_abuse_tracking (user_id)
    `);
    
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_abuse_device_week_unique 
      ON trial_abuse_tracking (device_hash, week_start) 
      WHERE device_hash IS NOT NULL
    `);
    
    console.log('[DB-Init] ✅ trial_abuse_tracking migration completed');
  } catch (error) {
    console.error('[DB-Init] ❌ trial_abuse_tracking migration failed:', error);
    throw error; // Re-throw to fail startup
  }
}

/**
 * CRITICAL: Verify trial_abuse_tracking table exists
 * FAIL FAST if table is missing - prevents silent failures in production
 */
async function verifyTrialAbuseTrackingTable() {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'trial_abuse_tracking'
    `);
    
    const tableExists = parseInt(result.rows[0]?.count || '0', 10) > 0;
    
    if (!tableExists) {
      console.error('[DB-Init] ❌ FATAL: trial_abuse_tracking table is missing!');
      console.error('[DB-Init] ❌ Trial signup will fail without this table.');
      console.error('[DB-Init] ❌ Run migration: drizzle/migrations/0001_trial_abuse_tracking.sql');
      throw new Error('FATAL: trial_abuse_tracking table is missing');
    }
    
    // Verify required constraint exists
    const constraintResult = await pool.query(`
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'trial_abuse_tracking_ip_week_unique'
    `);
    
    if (constraintResult.rows.length === 0) {
      console.error('[DB-Init] ❌ FATAL: trial_abuse_tracking_ip_week_unique constraint missing!');
      throw new Error('FATAL: trial_abuse_tracking UNIQUE constraint missing');
    }
    
    console.log('[DB-Init] ✅ trial_abuse_tracking table verified');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('FATAL:')) {
      throw error; // Re-throw FATAL errors
    }
    console.error('[DB-Init] ❌ Failed to verify trial_abuse_tracking:', error);
    throw new Error('FATAL: Could not verify trial_abuse_tracking table');
  }
}

/**
 * PRODUCTION-SAFE: Ensure realtime_sessions table has all telemetry columns
 * Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS for idempotent execution
 */
async function ensureRealtimeSessionsColumns() {
  console.log('[DB-Init] Checking realtime_sessions telemetry columns...');
  
  const columnsToAdd = [
    { name: 'close_reason', type: 'text', defaultValue: null },
    { name: 'close_details', type: 'jsonb', defaultValue: null },
    { name: 'reconnect_count', type: 'integer', defaultValue: '0' },
    { name: 'last_heartbeat_at', type: 'timestamp', defaultValue: null }
  ];
  
  const addedColumns: string[] = [];
  
  for (const col of columnsToAdd) {
    try {
      // Check if column exists
      const checkResult = await pool.query(`
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'realtime_sessions' 
        AND column_name = $1
      `, [col.name]);
      
      if (checkResult.rows.length === 0) {
        // Column doesn't exist - add it
        let alterSql = `ALTER TABLE realtime_sessions ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`;
        if (col.defaultValue !== null) {
          alterSql += ` DEFAULT ${col.defaultValue}`;
        }
        
        await pool.query(alterSql);
        addedColumns.push(col.name);
        console.log(`[DB-Init] ✅ Added column: realtime_sessions.${col.name}`);
      }
    } catch (error) {
      console.error(`[DB-Init] ⚠️ Failed to add column ${col.name}:`, error);
      // Don't throw - continue with other columns
    }
  }
  
  if (addedColumns.length > 0) {
    console.log(`[DB-Init] ✅ Added ${addedColumns.length} columns to realtime_sessions: ${addedColumns.join(', ')}`);
  } else {
    console.log('[DB-Init] ✅ All realtime_sessions telemetry columns already exist');
  }
}

/**
 * PRODUCTION-SAFE: Ensure users table has transcript_email column
 * Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS for idempotent execution
 */
async function ensureUsersTranscriptEmailColumn() {
  console.log('[DB-Init] Checking users.transcript_email column...');
  
  try {
    // Check if column exists
    const checkResult = await pool.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'transcript_email'
    `);
    
    if (checkResult.rows.length === 0) {
      // Column doesn't exist - add it
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS transcript_email text`);
      console.log('[DB-Init] ✅ Added column: users.transcript_email');
    } else {
      console.log('[DB-Init] ✅ users.transcript_email column already exists');
    }
  } catch (error) {
    console.error('[DB-Init] ⚠️ Failed to add users.transcript_email column:', error);
    // Don't throw - this is non-critical, fallback to login email will work
  }
}

/**
 * PRODUCTION-SAFE: Ensure users table has additional_emails column
 * Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS for idempotent execution
 */
async function ensureUsersAdditionalEmailsColumn() {
  console.log('[DB-Init] Checking users.additional_emails column...');
  
  try {
    const checkResult = await pool.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'additional_emails'
    `);
    
    if (checkResult.rows.length === 0) {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS additional_emails text[]`);
      console.log('[DB-Init] ✅ Added column: users.additional_emails');
    } else {
      console.log('[DB-Init] ✅ users.additional_emails column already exists');
    }
  } catch (error) {
    console.error('[DB-Init] ⚠️ Failed to add users.additional_emails column:', error);
  }
}

/**
 * PRODUCTION-SAFE: Ensure content_violations and user_suspensions tables exist
 * Uses CREATE TABLE IF NOT EXISTS for idempotent execution
 */
async function ensureContentModerationTables() {
  console.log('[DB-Init] Checking content moderation tables...');
  
  try {
    // Check if content_violations table exists
    const cvResult = await pool.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'content_violations'
    `);
    
    if (cvResult.rows.length === 0) {
      console.log('[DB-Init] Creating content_violations table...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS content_violations (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id varchar NOT NULL,
          session_id varchar,
          violation_type text NOT NULL,
          severity text NOT NULL,
          user_message text NOT NULL,
          ai_response text,
          confidence decimal(3,2),
          matched_terms text[],
          review_status text DEFAULT 'pending',
          action_taken text,
          notified_parent boolean DEFAULT false,
          notified_support boolean DEFAULT false,
          reviewed_by varchar,
          reviewed_at timestamp,
          review_notes text,
          created_at timestamp DEFAULT now()
        )
      `);
      
      // Add indexes
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_violations_user ON content_violations(user_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_violations_status ON content_violations(review_status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_violations_created ON content_violations(created_at)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_violations_user_created ON content_violations(user_id, created_at)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_violations_session ON content_violations(session_id)`);
      
      console.log('[DB-Init] ✅ Created content_violations table with indexes');
    } else {
      console.log('[DB-Init] ✅ content_violations table already exists');
      
      // Add new notification tracking columns if missing
      const colCheck = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'content_violations' 
        AND column_name IN ('notified_parent', 'notified_support')
      `);
      const existingCols = colCheck.rows.map((r: any) => r.column_name);
      
      if (!existingCols.includes('notified_parent')) {
        await pool.query(`ALTER TABLE content_violations ADD COLUMN notified_parent boolean DEFAULT false`);
        console.log('[DB-Init] Added notified_parent column to content_violations');
      }
      if (!existingCols.includes('notified_support')) {
        await pool.query(`ALTER TABLE content_violations ADD COLUMN notified_support boolean DEFAULT false`);
        console.log('[DB-Init] Added notified_support column to content_violations');
      }
    }
    
    // Check if user_suspensions table exists
    const usResult = await pool.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'user_suspensions'
    `);
    
    if (usResult.rows.length === 0) {
      console.log('[DB-Init] Creating user_suspensions table...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_suspensions (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id varchar NOT NULL,
          reason text NOT NULL,
          violation_ids text[],
          suspended_until timestamp,
          is_permanent boolean DEFAULT false,
          suspended_by varchar,
          is_active boolean DEFAULT true,
          lifted_at timestamp,
          lifted_by varchar,
          lift_reason text,
          created_at timestamp DEFAULT now()
        )
      `);
      
      // Add indexes
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_suspensions_user ON user_suspensions(user_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_suspensions_active ON user_suspensions(is_active)`);
      
      console.log('[DB-Init] ✅ Created user_suspensions table with indexes');
    } else {
      console.log('[DB-Init] ✅ user_suspensions table already exists');
    }
  } catch (error) {
    console.error('[DB-Init] ⚠️ Failed to ensure content moderation tables:', error);
  }

  console.log('[DB-Init] Checking verification reminder system...');
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_verification_email_sent_at TIMESTAMP`);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS verification_reminder_tracking (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reminder_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_verification_reminder_user ON verification_reminder_tracking(user_id)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_reminder_unique ON verification_reminder_tracking(user_id, reminder_date)`);
    
    const backfillResult = await pool.query(`
      UPDATE users SET first_login_at = COALESCE(first_login_at, created_at)
      WHERE email_verified = true AND first_login_at IS NULL
    `);
    if (backfillResult.rowCount && backfillResult.rowCount > 0) {
      console.log(`[DB-Init] ✅ Backfilled first_login_at for ${backfillResult.rowCount} verified users`);
    }
    
    console.log('[DB-Init] ✅ Verification reminder system ready');
  } catch (error) {
    console.error('[DB-Init] ⚠️ Failed to setup verification reminder system:', error);
  }
}