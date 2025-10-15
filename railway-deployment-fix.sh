#!/bin/bash
# Railway Complete Deployment Fix
# This script fixes both deployment crashes and authentication issues

echo "🚨 RAILWAY COMPLETE FIX SCRIPT"
echo "=============================="
echo ""

# Step 1: Database Schema Fix
echo "📋 Step 1: Fixing Railway Database Schema..."
echo ""

railway run psql $DATABASE_URL << 'DBFIX'
-- Add all missing columns safely
DO $$ 
BEGIN
    -- Voice tracking columns
    BEGIN
        ALTER TABLE users ADD COLUMN subscription_minutes_used INTEGER DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN subscription_minutes_limit INTEGER DEFAULT 60;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN purchased_minutes_balance INTEGER DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN billing_cycle_start TIMESTAMPTZ DEFAULT NOW();
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN last_reset_at TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    -- Auth columns
    BEGIN
        ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN reset_token TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN reset_token_expiry TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    -- Legacy columns (for backward compatibility)
    BEGIN
        ALTER TABLE users ADD COLUMN password_reset_token TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN password_reset_expires TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN email_verification_token TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN email_verification_expires TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    -- Profile columns
    BEGIN
        ALTER TABLE users ADD COLUMN parent_name VARCHAR(255);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN student_name VARCHAR(255);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN student_age INTEGER;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN grade_level VARCHAR(50);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN primary_subject VARCHAR(100);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    -- Marketing columns
    BEGIN
        ALTER TABLE users ADD COLUMN marketing_opt_in BOOLEAN DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN marketing_opt_in_date TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN marketing_opt_out_date TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    -- Timestamps
    BEGIN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
END $$;

-- Update all users to have required fields
UPDATE users 
SET 
    email_verified = COALESCE(email_verified, true),
    subscription_minutes_limit = COALESCE(subscription_minutes_limit, 60),
    subscription_minutes_used = COALESCE(subscription_minutes_used, 0),
    purchased_minutes_balance = COALESCE(purchased_minutes_balance, 0);

-- Show schema status
SELECT 
    'Schema Fixed!' as status,
    COUNT(*) as columns_count
FROM information_schema.columns 
WHERE table_name = 'users';
DBFIX

echo ""
echo "✅ Database schema updated"
echo ""

# Step 2: Check if user exists
echo "📋 Step 2: Checking user account..."
USER_COUNT=$(railway run psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM users WHERE email = 'pollis@mfhfoods.com';" | tr -d ' ')

if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
    echo "❌ User not found - Creating account..."
    
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
    
    railway run psql $DATABASE_URL << CREATEUSER
    INSERT INTO users (
        email, 
        username, 
        password,
        email_verified,
        email_verified_at,
        subscription_minutes_limit,
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
        60,
        'Parent',
        'Student',
        NOW(),
        NOW()
    );
    
    SELECT 'User Created!' as status;
CREATEUSER
    
    echo "✅ User account created"
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
    
    railway run psql $DATABASE_URL << UPDATEPASS
    UPDATE users 
    SET 
        password = '$HASH',
        email_verified = true,
        email_verified_at = COALESCE(email_verified_at, NOW()),
        updated_at = NOW()
    WHERE email = 'pollis@mfhfoods.com';
    
    SELECT 'Password Reset!' as status;
UPDATEPASS
    
    echo "✅ Password reset complete"
fi

echo ""
echo "📋 Step 3: Verifying account..."
railway run psql $DATABASE_URL << 'VERIFY'
SELECT 
    email,
    username,
    email_verified,
    subscription_minutes_limit,
    subscription_minutes_used,
    created_at
FROM users 
WHERE email = 'pollis@mfhfoods.com';
VERIFY

echo ""
echo "=============================="
echo "🎉 RAILWAY FIX COMPLETE!"
echo "=============================="
echo ""
echo "LOGIN CREDENTIALS:"
echo "Email:    pollis@mfhfoods.com"
echo "Password: Crenshaw22$$"
echo ""
echo "Test at: https://jie-mastery-tutor-v2-production.up.railway.app/auth"
echo ""
echo "If deployment is still crashing, check:"
echo "1. Railway environment variables are set"
echo "2. Build logs for compilation errors"
echo "3. Deploy logs for runtime errors"
echo ""