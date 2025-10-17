#!/usr/bin/env tsx
/**
 * Complete fix for Railway production database
 * Adds ALL missing columns individually and resets password
 * Run: railway run npx tsx server/scripts/fix-railway-database.ts
 */

import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import pkg from 'pg';
const { Client } = pkg;

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

async function fixRailwayDatabase() {
  console.log('🔧 RAILWAY DATABASE COMPLETE FIX');
  console.log('=================================');
  console.log('');
  
  // Railway internal connections don't use SSL
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Railway database');
    console.log('');
    
    // Add columns one by one to avoid any errors
    const columnsToAdd = [
      // Critical voice tracking columns
      { name: 'subscription_minutes_used', type: 'INTEGER DEFAULT 0' },
      { name: 'subscription_minutes_limit', type: 'INTEGER DEFAULT 60' },
      { name: 'purchased_minutes_balance', type: 'INTEGER DEFAULT 0' },
      { name: 'billing_cycle_start', type: 'TIMESTAMPTZ DEFAULT NOW()' },
      { name: 'last_reset_at', type: 'TIMESTAMPTZ' },
      
      // Email verification columns
      { name: 'email_verified', type: 'BOOLEAN DEFAULT true' },
      { name: 'email_verification_token', type: 'TEXT' },
      { name: 'email_verification_expiry', type: 'TIMESTAMPTZ' },
      
      // Password reset columns
      { name: 'reset_token', type: 'TEXT' },
      { name: 'reset_token_expiry', type: 'TIMESTAMPTZ' },
      
      // Legacy voice columns (for backward compatibility)
      { name: 'monthly_voice_minutes', type: 'INTEGER DEFAULT 60' },
      { name: 'monthly_voice_minutes_used', type: 'INTEGER DEFAULT 0' },
      { name: 'bonus_minutes', type: 'INTEGER DEFAULT 0' },
      { name: 'monthly_reset_date', type: 'TIMESTAMPTZ DEFAULT (NOW() + INTERVAL \'30 days\')' },
      { name: 'weekly_voice_minutes_used', type: 'INTEGER DEFAULT 0' },
      { name: 'weekly_reset_date', type: 'TIMESTAMPTZ DEFAULT (NOW() + INTERVAL \'7 days\')' },
      
      // Marketing columns
      { name: 'marketing_opt_in', type: 'BOOLEAN DEFAULT false' },
      { name: 'marketing_opt_in_date', type: 'TIMESTAMPTZ' },
      { name: 'marketing_opt_out_date', type: 'TIMESTAMPTZ' },
      
      // Timestamps
      { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()' },
      { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()' }
    ];
    
    console.log('📦 Adding missing columns one by one...');
    let addedCount = 0;
    let existingCount = 0;
    
    for (const column of columnsToAdd) {
      try {
        await client.query(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`);
        console.log(`  ✅ Added: ${column.name}`);
        addedCount++;
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log(`  ⚠️  Already exists: ${column.name}`);
          existingCount++;
        } else {
          console.log(`  ❌ Error adding ${column.name}:`, error.message);
        }
      }
    }
    
    console.log('');
    console.log(`Summary: ${addedCount} columns added, ${existingCount} already existed`);
    console.log('');
    
    // Update defaults for ALL users
    console.log('📝 Setting safe defaults for all users...');
    await client.query(`
      UPDATE users 
      SET 
        email_verified = COALESCE(email_verified, true),
        subscription_minutes_used = COALESCE(subscription_minutes_used, 0),
        subscription_minutes_limit = COALESCE(subscription_minutes_limit, 60),
        purchased_minutes_balance = COALESCE(purchased_minutes_balance, 0),
        billing_cycle_start = COALESCE(billing_cycle_start, created_at, NOW()),
        monthly_voice_minutes = COALESCE(monthly_voice_minutes, 60),
        monthly_voice_minutes_used = COALESCE(monthly_voice_minutes_used, 0),
        bonus_minutes = COALESCE(bonus_minutes, 0),
        monthly_reset_date = COALESCE(monthly_reset_date, NOW() + INTERVAL '30 days'),
        weekly_reset_date = COALESCE(weekly_reset_date, NOW() + INTERVAL '7 days')
    `);
    console.log('✅ Defaults updated for all users');
    console.log('');
    
    // Check if user exists
    console.log('🔍 Checking for user pollis@mfhfoods.com...');
    const userCheck = await client.query(
      'SELECT id, email, username FROM users WHERE email = $1',
      ['pollis@mfhfoods.com']
    );
    
    if (userCheck.rows.length === 0) {
      console.log('⚠️  User not found, creating new account...');
      
      const hashedPassword = await hashPassword('Crenshaw22$$');
      await client.query(`
        INSERT INTO users (
          email, username, first_name, last_name,
          parent_name, student_name, student_age, grade_level,
          primary_subject, password, email_verified,
          subscription_minutes_limit, subscription_minutes_used,
          purchased_minutes_balance, monthly_voice_minutes,
          is_admin, created_at, updated_at
        ) VALUES (
          'pollis@mfhfoods.com', 'robbierobertson', 'Robbie', 'Robertson',
          'Robbie Robertson', 'Robbie', 12, '6-8',
          'General', $1, true,
          60, 0, 0, 60,
          false, NOW(), NOW()
        )
      `, [hashedPassword]);
      console.log('✅ User account created');
    } else {
      console.log('✅ User exists:', userCheck.rows[0].email);
    }
    console.log('');
    
    // Reset password
    console.log('🔐 Resetting password to Crenshaw22$$...');
    const hashedPassword = await hashPassword('Crenshaw22$$');
    
    const updateResult = await client.query(`
      UPDATE users 
      SET 
        password = $1,
        email_verified = true,
        updated_at = NOW()
      WHERE email = $2
      RETURNING id, email, username
    `, [hashedPassword, 'pollis@mfhfoods.com']);
    
    if (updateResult.rows.length === 0) {
      console.error('❌ Failed to update password');
      process.exit(1);
    }
    
    console.log('✅ Password reset successfully!');
    console.log('');
    
    // Verify all critical columns exist
    console.log('🔍 Verifying critical columns...');
    const criticalColumns = [
      'subscription_minutes_used',
      'subscription_minutes_limit', 
      'purchased_minutes_balance',
      'email_verified',
      'reset_token',
      'reset_token_expiry'
    ];
    
    for (const colName of criticalColumns) {
      const check = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = $1
      `, [colName]);
      
      if (check.rows.length > 0) {
        console.log(`  ✅ ${colName} exists`);
      } else {
        console.log(`  ❌ ${colName} MISSING - This will cause errors!`);
      }
    }
    console.log('');
    
    // Test the exact query that login uses
    console.log('🧪 Testing login query...');
    try {
      const testQuery = await client.query(`
        SELECT 
          id, email, username, password,
          first_name, last_name, parent_name, student_name,
          student_age, grade_level, primary_subject,
          stripe_customer_id, stripe_subscription_id,
          subscription_plan, subscription_status,
          subscription_minutes_used,
          subscription_minutes_limit,
          purchased_minutes_balance,
          billing_cycle_start,
          last_reset_at,
          monthly_voice_minutes,
          monthly_voice_minutes_used,
          bonus_minutes,
          monthly_reset_date,
          weekly_voice_minutes_used,
          weekly_reset_date,
          preferred_language,
          voice_style,
          speech_speed,
          volume_level,
          is_admin,
          email_verified,
          email_verification_token,
          email_verification_expiry,
          reset_token,
          reset_token_expiry,
          marketing_opt_in,
          marketing_opt_in_date,
          marketing_opt_out_date,
          created_at,
          updated_at
        FROM users 
        WHERE email = $1
        LIMIT 1
      `, ['pollis@mfhfoods.com']);
      
      console.log('✅ Login query works perfectly!');
      
      const user = testQuery.rows[0];
      if (user) {
        console.log('');
        console.log('User details:');
        console.log(`  Email: ${user.email}`);
        console.log(`  Verified: ${user.email_verified}`);
        console.log(`  Minutes: ${user.subscription_minutes_limit} limit, ${user.subscription_minutes_used} used`);
        console.log(`  Password hash length: ${user.password.length} chars`);
      }
    } catch (error: any) {
      console.error('❌ Login query FAILED:', error.message);
      console.error('');
      console.error('The exact error Railway is seeing:');
      console.error(error.message);
      
      // Try to identify the missing column
      if (error.message.includes('column')) {
        const match = error.message.match(/column "(\w+)"/);
        if (match) {
          console.error('');
          console.error(`MISSING COLUMN: ${match[1]}`);
          console.error('Add it manually with:');
          console.error(`railway run psql $DATABASE_URL -c "ALTER TABLE users ADD COLUMN ${match[1]} TEXT"`);
        }
      }
    }
    
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║              🎉 DATABASE FIX COMPLETE! 🎉             ║');
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log('║                                                       ║');
    console.log('║  LOGIN CREDENTIALS:                                   ║');
    console.log('║  ─────────────────                                   ║');
    console.log('║  URL:      https://jie-mastery-tutor-v2-             ║');
    console.log('║            production.up.railway.app/auth             ║');
    console.log('║  Email:    pollis@mfhfoods.com                       ║');
    console.log('║  Password: Crenshaw22$$                               ║');
    console.log('║                                                       ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    
  } catch (error: any) {
    console.error('');
    console.error('❌ Critical Error:', error.message);
    if (error.code) {
      console.error('Error Code:', error.code);
    }
    if (error.detail) {
      console.error('Details:', error.detail);
    }
    throw error;
  } finally {
    await client.end();
    console.log('');
    console.log('Database connection closed');
  }
}

// Run the fix
fixRailwayDatabase()
  .then(() => {
    console.log('');
    console.log('✅ Script completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Push code changes: git push');
    console.log('2. Wait for Railway to deploy');
    console.log('3. Test login at production URL');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('❌ Script failed:', error.message);
    console.error('');
    console.error('Try running this command directly:');
    console.error('railway run psql $DATABASE_URL');
    console.error('Then paste the SQL from the fix script');
    process.exit(1);
  });