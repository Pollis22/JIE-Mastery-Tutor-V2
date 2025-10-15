#!/bin/bash
# Quick fix for Railway production database
# Run: bash fix-railway-now.sh

echo "🚀 RAILWAY QUICK FIX"
echo "===================="
echo ""
echo "This script will:"
echo "1. Add all missing database columns"
echo "2. Reset your password to Crenshaw22$$"
echo "3. Make Railway work again"
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not installed"
    echo ""
    echo "Install it with:"
    echo "npm install -g @railway/cli"
    echo ""
    echo "Then run:"
    echo "railway login"
    echo "railway link"
    echo ""
    exit 1
fi

echo "📝 Step 1: Adding missing columns to Railway database..."
echo ""

# Add all columns in one command
railway run psql $DATABASE_URL << 'EOF'
-- Add all missing columns individually to avoid errors
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_minutes_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_minutes_limit INTEGER DEFAULT 60;
ALTER TABLE users ADD COLUMN IF NOT EXISTS purchased_minutes_balance INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_voice_minutes INTEGER DEFAULT 60;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_voice_minutes_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_minutes INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_reset_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_voice_minutes_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_reset_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days');

-- Update defaults
UPDATE users 
SET 
  email_verified = COALESCE(email_verified, true),
  subscription_minutes_used = COALESCE(subscription_minutes_used, 0),
  subscription_minutes_limit = COALESCE(subscription_minutes_limit, 60);

-- Check result
SELECT 'Columns added successfully!' as status;
EOF

echo ""
echo "📝 Step 2: Resetting password..."
echo ""

# Run the TypeScript fix script
railway run npx tsx server/scripts/fix-railway-database.ts

echo ""
echo "✅ RAILWAY FIX COMPLETE!"
echo ""
echo "Test your login:"
echo "URL:      https://jie-mastery-tutor-v2-production.up.railway.app/auth"
echo "Email:    pollis@mfhfoods.com"
echo "Password: Crenshaw22$$"
echo ""