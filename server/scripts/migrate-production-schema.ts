/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * Production Database Schema Migration
 * 
 * This script safely adds missing columns to the production database
 * without losing existing data.
 * 
 * Usage: tsx server/scripts/migrate-production-schema.ts
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

async function migrateProductionSchema() {
  console.log('🔄 Starting production schema migration...');
  console.log('');
  
  try {
    // Add missing columns to user_documents table if they don't exist
    console.log('📊 Checking user_documents table...');
    
    const migrations = [
      {
        name: 'subject',
        sql: sql`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS subject TEXT`
      },
      {
        name: 'grade',
        sql: sql`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS grade TEXT`
      },
      {
        name: 'title',
        sql: sql`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS title TEXT`
      },
      {
        name: 'description',
        sql: sql`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS description TEXT`
      },
      {
        name: 'processing_status',
        sql: sql`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'queued'`
      },
      {
        name: 'processing_error',
        sql: sql`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS processing_error TEXT`
      },
      {
        name: 'retry_count',
        sql: sql`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0`
      },
      {
        name: 'next_retry_at',
        sql: sql`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP`
      },
      {
        name: 'parsed_text_path',
        sql: sql`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS parsed_text_path TEXT`
      },
      {
        name: 'expires_at',
        sql: sql`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`
      },
      {
        name: 'updated_at',
        sql: sql`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`
      }
    ];
    
    for (const migration of migrations) {
      console.log(`  ➕ Adding column: ${migration.name}...`);
      await db.execute(migration.sql);
      console.log(`  ✅ Column ${migration.name} ready`);
    }
    
    console.log('');
    console.log('📊 Creating indexes...');
    
    // Add indexes (IF NOT EXISTS works in PostgreSQL 9.5+)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_docs_status ON user_documents(processing_status)`);
    console.log('  ✅ idx_user_docs_status');
    
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_docs_retry ON user_documents(next_retry_at)`);
    console.log('  ✅ idx_user_docs_retry');
    
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_docs_expires ON user_documents(expires_at)`);
    console.log('  ✅ idx_user_docs_expires');
    
    console.log('');
    console.log('✅ Production schema migration completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Test document upload in production');
    console.log('2. Test document list retrieval');
    console.log('3. Verify no 500 errors appear');
    
    process.exit(0);
    
  } catch (error) {
    console.error('');
    console.error('❌ Migration failed:', error);
    console.error('');
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Verify DATABASE_URL is set correctly on Railway');
    console.error('2. Check that the database user has ALTER TABLE permissions');
    console.error('3. Review Railway logs for additional error details');
    
    process.exit(1);
  }
}

// Run migration
migrateProductionSchema();
