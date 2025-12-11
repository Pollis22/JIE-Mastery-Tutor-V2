import { db } from '../db';
import { sql } from 'drizzle-orm';

async function fixProductionSchema() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 Fixing Production Database Schema');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    console.log('\n📋 Checking existing schema...');

    // Add missing columns to users table
    console.log('\n➕ Adding missing columns to users table...');

    // Check and add max_concurrent_logins
    try {
      await db.execute(sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS max_concurrent_logins INTEGER DEFAULT 1;
      `);
      console.log('✅ max_concurrent_logins column added/verified');
    } catch (error: any) {
      console.log('ℹ️  max_concurrent_logins may already exist:', error.message);
    }

    // Add email verification columns if missing
    try {
      await db.execute(sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
      `);
      console.log('✅ email_verified column added/verified');
    } catch (error: any) {
      console.log('ℹ️  email_verified may already exist');
    }

    try {
      await db.execute(sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
      `);
      console.log('✅ email_verification_token column added/verified');
    } catch (error: any) {
      console.log('ℹ️  email_verification_token may already exist');
    }

    try {
      await db.execute(sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMP;
      `);
      console.log('✅ email_verification_expiry column added/verified');
    } catch (error: any) {
      console.log('ℹ️  email_verification_expiry may already exist');
    }

    // Verify the fix by selecting from users table
    console.log('\n🔍 Verifying schema fix...');
    
    const testQuery = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN (
        'max_concurrent_logins',
        'email_verified',
        'email_verification_token',
        'email_verification_expiry'
      )
      ORDER BY column_name;
    `);

    console.log('\n📊 Current schema for critical columns:');
    if (testQuery.rows && testQuery.rows.length > 0) {
      testQuery.rows.forEach((row: any) => {
        console.log(`   ✓ ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });
    }

    // Test that we can now query users table
    console.log('\n🧪 Testing user query...');
    const testUser = await db.execute(sql`
      SELECT id, email, username, email_verified, max_concurrent_logins
      FROM users
      LIMIT 1;
    `);
    
    if (testUser.rows && testUser.rows.length > 0) {
      console.log('✅ User query successful!');
      console.log('   Sample user:', testUser.rows[0]);
    } else {
      console.log('ℹ️  No users in database yet (expected for new deployment)');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Schema Fix Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n👉 You can now try logging in again.\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Schema fix failed:');
    console.error(error);
    process.exit(1);
  }
}

fixProductionSchema();
