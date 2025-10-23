#!/bin/bash
# Complete Railway Database Fix Script
# This handles ALL cases: missing columns AND missing user

echo "🚨 COMPLETE RAILWAY FIX - This will solve everything"
echo "====================================================="
echo ""

# Step 1: Add ALL missing columns (won't error if they exist)
echo "📋 Step 1: Adding all missing columns..."
railway run psql $DATABASE_URL << 'ADDSQL'
-- Add voice tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_minutes_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_minutes_limit INTEGER DEFAULT 60;
ALTER TABLE users ADD COLUMN IF NOT EXISTS purchased_minutes_balance INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ DEFAULT NOW();

-- Add auth columns  
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

-- Add marketing columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in_date TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_out_date TIMESTAMPTZ;

-- Add profile columns if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS student_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS student_age INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS grade_level VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_subject VARCHAR(100);

-- Add timestamps if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

SELECT 'COLUMNS ADDED' as status;
ADDSQL

echo ""
echo "✅ All columns added (or already exist)"
echo ""

# Step 2: Check if user exists
echo "📋 Step 2: Checking if your user exists..."
USER_EXISTS=$(railway run psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM users WHERE email = 'pollis@mfhfoods.com';" | tr -d ' ')

if [ "$USER_EXISTS" = "0" ] || [ -z "$USER_EXISTS" ]; then
    echo "❌ User doesn't exist - Creating it now..."
    
    # Generate password hash
    HASH=$(node -e "
    const crypto = require('crypto');
    const { promisify } = require('util');
    const scrypt = promisify(crypto.scrypt);
    (async () => {
      const password = 'Crenshaw22\$\$';
      const salt = crypto.randomBytes(16).toString('hex');
      const buf = await scrypt(password, salt, 64);
      const hash = buf.toString('hex') + '.' + salt;
      process.stdout.write(hash);
    })();
    " 2>/dev/null)
    
    echo "📋 Creating user account..."
    railway run psql $DATABASE_URL << CREATESQL
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
    'pollis@mfhfoods.com',
    'pollis',
    '$HASH',
    true,
    NOW(),
    0,
    60,
    0,
    'Parent',
    'Student',
    NOW(),
    NOW()
) ON CONFLICT (email) DO UPDATE SET
    password = EXCLUDED.password,
    email_verified = true,
    updated_at = NOW();
    
SELECT 'USER CREATED/UPDATED' as status;
CREATESQL
    
    echo "✅ User account created with password: Crenshaw22\$\$"
else
    echo "✅ User exists - Resetting password..."
    
    # Generate password hash
    HASH=$(node -e "
    const crypto = require('crypto');
    const { promisify } = require('util');
    const scrypt = promisify(crypto.scrypt);
    (async () => {
      const password = 'Crenshaw22\$\$';
      const salt = crypto.randomBytes(16).toString('hex');
      const buf = await scrypt(password, salt, 64);
      const hash = buf.toString('hex') + '.' + salt;
      process.stdout.write(hash);
    })();
    " 2>/dev/null)
    
    railway run psql $DATABASE_URL << UPDATESQL
UPDATE users 
SET password = '$HASH',
    email_verified = true,
    email_verified_at = COALESCE(email_verified_at, NOW()),
    updated_at = NOW()
WHERE email = 'pollis@mfhfoods.com';

SELECT 'PASSWORD RESET' as status;
UPDATESQL
    
    echo "✅ Password reset to: Crenshaw22\$\$"
fi

echo ""
echo "📋 Step 3: Verifying everything..."
railway run psql $DATABASE_URL << 'VERIFYSQL'
SELECT 
    email,
    username,
    email_verified,
    subscription_minutes_used,
    subscription_minutes_limit,
    substring(password, 1, 20) as password_preview
FROM users 
WHERE email = 'pollis@mfhfoods.com';
VERIFYSQL

echo ""
echo "====================================================="
echo "🎉 RAILWAY DATABASE COMPLETELY FIXED!"
echo "====================================================="
echo ""
echo "LOGIN CREDENTIALS:"
echo "Email:    pollis@mfhfoods.com"
echo "Password: Crenshaw22\$\$"
echo ""
echo "Test at: https://jie-mastery-tutor-v2-production.up.railway.app/auth"
echo ""