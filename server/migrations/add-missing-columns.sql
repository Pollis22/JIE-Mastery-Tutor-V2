-- Add voice minute tracking columns
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS subscription_minutes_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_minutes_limit INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS purchased_minutes_balance INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ DEFAULT NOW();

-- Add email verification columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMPTZ;

-- Add password reset columns  
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_token TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(email_verification_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
CREATE INDEX IF NOT EXISTS idx_users_voice_usage ON users(subscription_minutes_used, subscription_minutes_limit);
CREATE INDEX IF NOT EXISTS idx_users_billing_cycle ON users(billing_cycle_start);

-- Set existing users as verified and with starter plan limits
UPDATE users 
SET 
  email_verified = true,
  email_verified_at = created_at,
  subscription_minutes_limit = 60,
  subscription_minutes_used = 0,
  purchased_minutes_balance = 0,
  billing_cycle_start = COALESCE(created_at, NOW()),
  last_reset_at = COALESCE(created_at, NOW())
WHERE email_verified IS NULL;

-- Specifically verify the owner account
UPDATE users 
SET 
  email_verified = true,
  email_verified_at = NOW()
WHERE email = 'pollis@mfhfoods.com';

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN (
    'subscription_minutes_used',
    'subscription_minutes_limit',
    'purchased_minutes_balance',
    'billing_cycle_start',
    'last_reset_at',
    'email_verified',
    'reset_token'
  )
ORDER BY column_name;