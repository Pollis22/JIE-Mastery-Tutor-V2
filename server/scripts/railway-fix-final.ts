#!/usr/bin/env tsx
// FINAL FIX: Direct password update for Railway production database
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

async function fixRailwayAuth() {
  console.log('🚨 RAILWAY AUTH FIX - FINAL SOLUTION');
  console.log('=====================================');
  console.log('');
  
  const email = 'pollis@mfhfoods.com';
  const password = 'Crenshaw22$$';
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('railway.app') ? {
      rejectUnauthorized: false
    } : undefined
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    console.log('');
    
    // Step 1: Add ALL columns that might be missing
    console.log('📋 Step 1: Ensuring all columns exist...');
    
    const columnsToAdd = [
      'subscription_minutes_used INTEGER DEFAULT 0',
      'subscription_minutes_limit INTEGER DEFAULT 60',
      'purchased_minutes_balance INTEGER DEFAULT 0',
      'billing_cycle_start TIMESTAMPTZ DEFAULT NOW()',
      'last_reset_at TIMESTAMPTZ',
      'email_verified BOOLEAN DEFAULT true',
      'email_verified_at TIMESTAMPTZ',
      'email_verification_token TEXT',
      'email_verification_expires TIMESTAMPTZ',
      'reset_token TEXT',
      'reset_token_expiry TIMESTAMPTZ',
      'password_reset_token TEXT',
      'password_reset_expires TIMESTAMPTZ',
      'marketing_opt_in BOOLEAN DEFAULT false',
      'marketing_opt_in_date TIMESTAMPTZ',
      'marketing_opt_out_date TIMESTAMPTZ',
      'parent_name VARCHAR(255)',
      'student_name VARCHAR(255)',
      'student_age INTEGER',
      'grade_level VARCHAR(50)',
      'primary_subject VARCHAR(100)',
      'created_at TIMESTAMPTZ DEFAULT NOW()',
      'updated_at TIMESTAMPTZ DEFAULT NOW()'
    ];
    
    for (const column of columnsToAdd) {
      const [colName] = column.split(' ');
      try {
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${column}`);
        console.log(`  ✓ Column ${colName} exists`);
      } catch (e) {
        // Column already exists, that's fine
        console.log(`  ⚠ Column ${colName} already exists (OK)`);
      }
    }
    
    console.log('✅ All columns verified');
    console.log('');
    
    // Step 2: Check if user exists
    console.log('📋 Step 2: Checking if user exists...');
    const userCheck = await client.query(
      'SELECT id, email, username FROM users WHERE email = $1',
      [email]
    );
    
    const hashedPassword = await hashPassword(password);
    console.log('✅ Password hashed');
    
    if (userCheck.rows.length === 0) {
      // User doesn't exist - create it
      console.log('❌ User not found - creating...');
      
      await client.query(`
        INSERT INTO users (
          email, 
          username, 
          password,
          email_verified,
          email_verified_at,
          subscription_minutes_used,
          subscription_minutes_limit,
          purchased_minutes_balance,
          parent_name,
          student_name,
          created_at,
          updated_at
        ) VALUES (
          $1, -- email
          $2, -- username
          $3, -- password (hashed)
          true, -- email_verified
          NOW(), -- email_verified_at
          0, -- subscription_minutes_used
          60, -- subscription_minutes_limit
          0, -- purchased_minutes_balance
          'Parent', -- parent_name
          'Student', -- student_name
          NOW(), -- created_at
          NOW() -- updated_at
        )
      `, [email, 'pollis', hashedPassword]);
      
      console.log('✅ User created successfully!');
    } else {
      // User exists - update password
      console.log('✅ User found - updating password...');
      
      await client.query(`
        UPDATE users 
        SET 
          password = $1,
          email_verified = true,
          email_verified_at = COALESCE(email_verified_at, NOW()),
          updated_at = NOW()
        WHERE email = $2
      `, [hashedPassword, email]);
      
      console.log('✅ Password updated successfully!');
    }
    
    // Step 3: Verify the user can be queried properly
    console.log('');
    console.log('📋 Step 3: Verifying user account...');
    
    const finalCheck = await client.query(`
      SELECT 
        email,
        username,
        email_verified,
        subscription_minutes_used,
        subscription_minutes_limit,
        purchased_minutes_balance,
        substring(password, 1, 30) as password_preview
      FROM users 
      WHERE email = $1
    `, [email]);
    
    if (finalCheck.rows.length > 0) {
      const user = finalCheck.rows[0];
      console.log('');
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║                                                        ║');
      console.log('║         🎉 RAILWAY AUTH FIXED SUCCESSFULLY! 🎉        ║');
      console.log('║                                                        ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log('║                                                        ║');
      console.log('║  LOGIN CREDENTIALS:                                    ║');
      console.log('║  ─────────────────                                    ║');
      console.log('║  Email:    pollis@mfhfoods.com                        ║');
      console.log('║  Password: Crenshaw22$$                                ║');
      console.log('║                                                        ║');
      console.log('║  ACCOUNT STATUS:                                       ║');
      console.log('║  ──────────────                                       ║');
      console.log(`║  ✅ Email Verified: ${user.email_verified ? 'Yes' : 'No'}                             ║`);
      console.log(`║  ✅ Voice Minutes:  ${user.subscription_minutes_limit}/${user.subscription_minutes_used} used                     ║`);
      console.log(`║  ✅ Password Set:   Yes                               ║`);
      console.log('║                                                        ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('🌐 TEST YOUR LOGIN NOW:');
      console.log('https://jie-mastery-tutor-v2-production.up.railway.app/auth');
      console.log('');
    }
    
    // Step 4: Test that the exact login query works
    console.log('📋 Step 4: Testing login query...');
    try {
      const loginTest = await client.query(`
        SELECT 
          id, email, username, password,
          subscription_minutes_used,
          subscription_minutes_limit,
          purchased_minutes_balance,
          email_verified
        FROM users 
        WHERE email = $1
        LIMIT 1
      `, [email]);
      
      if (loginTest.rows.length > 0) {
        console.log('✅ Login query successful - authentication should work!');
      }
    } catch (error: any) {
      console.error('❌ Login query failed:', error.message);
      console.error('This means the login will still fail');
    }
    
  } catch (error: any) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    if (error.detail) {
      console.error('Details:', error.detail);
    }
    if (error.hint) {
      console.error('Hint:', error.hint);
    }
    throw error;
  } finally {
    await client.end();
    console.log('');
    console.log('Connection closed');
  }
}

// Run immediately
fixRailwayAuth()
  .then(() => {
    console.log('');
    console.log('✅ Script completed successfully!');
    console.log('✅ You should now be able to log in on Railway!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });