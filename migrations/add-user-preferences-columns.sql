-- Migration: Add user preferences columns
-- Date: 2025-11-18
-- Description: Add nullable preference columns for interface language, voice language, 
--              email notifications, and marketing emails
-- 
-- PRODUCTION DEPLOYMENT INSTRUCTIONS:
-- Run this SQL in Railway's PostgreSQL database console (Data > Query tab)

-- Add preference columns (nullable for backward compatibility)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS interface_language VARCHAR(10),
ADD COLUMN IF NOT EXISTS voice_language VARCHAR(10),
ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN,
ADD COLUMN IF NOT EXISTS marketing_emails BOOLEAN;

-- Verify columns were created
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('interface_language', 'voice_language', 'email_notifications', 'marketing_emails')
ORDER BY column_name;

-- Optional: Set default values for existing users (recommended)
-- UPDATE users 
-- SET 
--   interface_language = COALESCE(interface_language, 'en'),
--   voice_language = COALESCE(voice_language, preferred_language, 'en'),
--   email_notifications = COALESCE(email_notifications, true),
--   marketing_emails = COALESCE(marketing_emails, false)
-- WHERE interface_language IS NULL 
--    OR voice_language IS NULL 
--    OR email_notifications IS NULL 
--    OR marketing_emails IS NULL;
