-- Fix NULL preference values for all existing users in PRODUCTION
-- Run this in Railway's PostgreSQL database console

UPDATE users 
SET 
  interface_language = COALESCE(interface_language, 'en'),
  voice_language = COALESCE(voice_language, 'en'),
  email_notifications = COALESCE(email_notifications, true),
  marketing_emails = COALESCE(marketing_emails, false)
WHERE interface_language IS NULL 
   OR voice_language IS NULL 
   OR email_notifications IS NULL 
   OR marketing_emails IS NULL;

-- Verify the fix
SELECT email, interface_language, voice_language, email_notifications, marketing_emails
FROM users 
WHERE email = 'pollis@mineralxtrade.com';
