#!/usr/bin/env tsx
/**
 * Verify Railway database connection and columns
 * Run: railway run npx tsx server/scripts/verify-railway-db.ts
 */

import { Client } from 'pg';

async function verifyRailwayDatabase() {
  console.log('🔍 RAILWAY DATABASE VERIFICATION');
  console.log('==================================');
  console.log('');
  
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set!');
    console.log('Make sure you run this with: railway run npx tsx ...');
    process.exit(1);
  }
  
  // Parse DATABASE_URL to show connection info (without password)
  const urlParts = new URL(databaseUrl);
  console.log('📊 Connection Info:');
  console.log(`  Host: ${urlParts.hostname}`);
  console.log(`  Port: ${urlParts.port}`);
  console.log(`  Database: ${urlParts.pathname.slice(1)}`);
  console.log(`  User: ${urlParts.username}`);
  console.log('');
  
  // Railway internal connections don't use SSL
  const client = new Client({
    connectionString: databaseUrl
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Railway database');
    console.log('');
    
    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.error('❌ CRITICAL: users table does not exist!');
      console.log('This database might be empty or wrong.');
      process.exit(1);
    }
    
    console.log('✅ users table exists');
    console.log('');
    
    // Check critical columns
    console.log('🔍 Checking critical columns...');
    const criticalColumns = [
      'billing_cycle_start',
      'subscription_minutes_used',
      'subscription_minutes_limit',
      'purchased_minutes_balance',
      'email_verified',
      'reset_token',
      'reset_token_expiry'
    ];
    
    for (const colName of criticalColumns) {
      const colCheck = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = $1
      `, [colName]);
      
      if (colCheck.rows.length > 0) {
        console.log(`  ✅ ${colName} (${colCheck.rows[0].data_type})`);
      } else {
        console.log(`  ❌ ${colName} MISSING!`);
      }
    }
    
    console.log('');
    
    // List ALL columns in the users table
    console.log('📋 All columns in users table:');
    const allColumns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    allColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
    
    console.log('');
    
    // Check if pollis@mfhfoods.com exists
    console.log('🔍 Checking for user account...');
    const userCheck = await client.query(
      `SELECT email, username FROM users WHERE email = $1`,
      ['pollis@mfhfoods.com']
    );
    
    if (userCheck.rows.length > 0) {
      console.log(`✅ User found: ${userCheck.rows[0].email}`);
    } else {
      console.log('❌ User pollis@mfhfoods.com not found');
    }
    
    console.log('');
    
    // Test the exact query that fails
    console.log('🧪 Testing the login query...');
    try {
      const testQuery = await client.query(`
        SELECT 
          id, email, username, password,
          subscription_minutes_used,
          subscription_minutes_limit,
          billing_cycle_start
        FROM users 
        WHERE email = $1
        LIMIT 1
      `, ['pollis@mfhfoods.com']);
      
      console.log('✅ Login query works!');
      if (testQuery.rows.length > 0) {
        console.log('  User data retrieved successfully');
      }
    } catch (error: any) {
      console.error('❌ Login query failed:', error.message);
      console.log('');
      console.log('This is the exact error Railway is seeing!');
      
      // Check for column name issues
      if (error.message.includes('column')) {
        const match = error.message.match(/column "(\w+)"/);
        if (match) {
          console.log('');
          console.log(`Missing column: ${match[1]}`);
          console.log('');
          console.log('To fix, run:');
          console.log(`railway run psql $DATABASE_URL -c "ALTER TABLE users ADD COLUMN ${match[1]} TIMESTAMP"`);
        }
      }
    }
    
    console.log('');
    console.log('==================================');
    console.log('SUMMARY:');
    
    // Count missing columns
    let missingCount = 0;
    for (const colName of criticalColumns) {
      const check = await client.query(`
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = $1
      `, [colName]);
      if (check.rows.length === 0) missingCount++;
    }
    
    if (missingCount === 0) {
      console.log('✅ All critical columns exist');
      console.log('✅ Database structure is correct');
      console.log('');
      console.log('The issue might be:');
      console.log('1. Railway app needs redeployment');
      console.log('2. Environment variables are wrong');
      console.log('3. Old code is cached');
      console.log('');
      console.log('Try:');
      console.log('1. git push to trigger new deployment');
      console.log('2. railway up --detach to force redeploy');
    } else {
      console.log(`❌ ${missingCount} critical columns are missing`);
      console.log('');
      console.log('The database needs columns added.');
      console.log('Run the fix script to add them.');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

verifyRailwayDatabase()
  .then(() => {
    console.log('');
    console.log('Verification complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });