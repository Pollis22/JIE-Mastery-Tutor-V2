-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 🔧 Railway Database Schema Fix
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Copy and paste this entire file into Railway's SQL Query console
-- to fix the missing columns issue

-- Add missing columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS max_concurrent_logins INTEGER DEFAULT 1;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verification_token TEXT;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMP;

-- Verify columns were added
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

-- Show count of users (should work now)
SELECT COUNT(*) as total_users FROM users;
