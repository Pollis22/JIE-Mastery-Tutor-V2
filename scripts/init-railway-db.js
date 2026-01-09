const { Pool } = require('pg');

async function initializeDatabase() {
  console.log('🚀 Initializing Railway database...');
  
  // Railway internal connections don't use SSL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Try to enable pgvector extension for document embeddings
    console.log('📝 Enabling pgvector extension...');
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
      console.log('✅ pgvector extension enabled');
    } catch (vectorError) {
      console.log('⚠️  Vector extension error:', vectorError.message);
      console.log('⚠️  Continuing without vector extension (RAG features may be limited)');
    }

    // Add missing columns to users table (hybrid minute tracking)
    console.log('📝 Adding missing columns to users table...');
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
      
      -- Hybrid Minute Tracking System
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_minutes_used INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_minutes_limit INTEGER DEFAULT 60;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS purchased_minutes_balance INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ;
      
      -- Legacy fields (for backward compatibility)
      ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_voice_minutes_used INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_reset_date TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_voice_minutes INTEGER DEFAULT 60;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_voice_minutes_used INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_reset_date TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_minutes INTEGER DEFAULT 0;
      
      -- User profile fields
      ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS student_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS student_age INTEGER;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS grade_level TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_subject TEXT;
      
      -- Marketing fields
      ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in_date TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_out_date TIMESTAMPTZ;
      
      -- Preferences
      ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'english';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_style TEXT DEFAULT 'cheerful';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS speech_speed NUMERIC DEFAULT 1.0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS volume_level INTEGER DEFAULT 75;
      
      -- Admin and verification
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;
    `);
    console.log('✅ Users table columns updated');

    // Create minute_purchases table with correct schema
    console.log('📝 Creating minute_purchases table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS minute_purchases (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        minutes_purchased INTEGER NOT NULL,
        minutes_remaining INTEGER NOT NULL,
        price_paid NUMERIC(10, 2),
        purchased_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        expires_at TIMESTAMPTZ,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_minute_purchases_user ON minute_purchases(user_id, status);
    `);
    console.log('✅ minute_purchases table created');

    // Add duration column to learning_sessions if missing
    console.log('📝 Updating learning_sessions table...');
    await pool.query(`
      ALTER TABLE learning_sessions ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0;
      ALTER TABLE learning_sessions ADD COLUMN IF NOT EXISTS context_documents JSONB;
    `);
    console.log('✅ learning_sessions table updated');

    // Create user_documents table for RAG system
    console.log('📝 Creating user_documents table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_documents (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id),
        original_name TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        subject TEXT,
        grade TEXT,
        title TEXT,
        description TEXT,
        keep_for_future_sessions BOOLEAN DEFAULT false,
        processing_status TEXT DEFAULT 'queued',
        processing_error TEXT,
        retry_count INTEGER DEFAULT 0,
        next_retry_at TIMESTAMPTZ,
        parsed_text_path TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_user_docs_status ON user_documents(processing_status);
      CREATE INDEX IF NOT EXISTS idx_user_docs_retry ON user_documents(next_retry_at);
    `);
    console.log('✅ user_documents table created');

    // Create document_chunks table
    console.log('📝 Creating document_chunks table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id VARCHAR NOT NULL REFERENCES user_documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(document_id, chunk_index)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_document_index ON document_chunks(document_id, chunk_index);
    `);
    console.log('✅ document_chunks table created');

    // Create document_embeddings table with vector column
    console.log('📝 Creating document_embeddings table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_embeddings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        chunk_id VARCHAR NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
        embedding vector(1536) NOT NULL,
        embedding_model TEXT DEFAULT 'text-embedding-3-small',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(chunk_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_chunk_unique ON document_embeddings(chunk_id);
      CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw ON document_embeddings USING hnsw (embedding vector_cosine_ops);
    `);
    console.log('✅ document_embeddings table created');

    // Create admin_logs table
    console.log('📝 Creating admin_logs table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id VARCHAR NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        details JSONB,
        timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ admin_logs table created');

    // Create marketing_campaigns table
    console.log('📝 Creating marketing_campaigns table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_campaigns (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id VARCHAR NOT NULL REFERENCES users(id),
        campaign_name TEXT NOT NULL,
        segment TEXT NOT NULL,
        contact_count INTEGER NOT NULL,
        filters JSONB,
        exported_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_campaigns_admin ON marketing_campaigns(admin_id);
      CREATE INDEX IF NOT EXISTS idx_campaigns_exported ON marketing_campaigns(exported_at);
    `);
    console.log('✅ marketing_campaigns table created');

    // Add trial management columns to users table
    console.log('📝 Adding trial management columns to users table...');
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_minutes_limit INTEGER DEFAULT 30;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_minutes_used INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_reminder_sent BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_trial_active BOOLEAN DEFAULT false;
    `);
    console.log('✅ Trial management columns added');

    // Create trial_sessions table for 5-minute free trial system
    console.log('📝 Creating trial_sessions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trial_sessions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        email_hash VARCHAR(64) NOT NULL,
        email TEXT,
        verification_token VARCHAR(64),
        verification_expiry TIMESTAMPTZ,
        verified_at TIMESTAMPTZ,
        trial_started_at TIMESTAMPTZ,
        trial_ends_at TIMESTAMPTZ,
        consumed_seconds INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        device_id_hash VARCHAR(64),
        ip_hash VARCHAR(64),
        last_active_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_email_hash ON trial_sessions(email_hash);
      CREATE INDEX IF NOT EXISTS idx_trial_device_hash ON trial_sessions(device_id_hash);
      CREATE INDEX IF NOT EXISTS idx_trial_status ON trial_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_trial_verification_token ON trial_sessions(verification_token);
      CREATE INDEX IF NOT EXISTS idx_trial_ip_hash ON trial_sessions(ip_hash);
      CREATE INDEX IF NOT EXISTS idx_trial_last_active ON trial_sessions(last_active_at);
    `);
    console.log('✅ trial_sessions table created');

    // Create trial_rate_limits table for IP-based rate limiting
    console.log('📝 Creating trial_rate_limits table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trial_rate_limits (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        ip_hash VARCHAR(64) NOT NULL,
        attempt_count INTEGER DEFAULT 1,
        window_start TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_ip ON trial_rate_limits(ip_hash);
    `);
    console.log('✅ trial_rate_limits table created');

    console.log('✅ Database initialization complete!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    console.log('⚠️  Continuing despite errors - app will start anyway');
    // Don't throw - allow app to start even if migration has issues
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('✅ All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
