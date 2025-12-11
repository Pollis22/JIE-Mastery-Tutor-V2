-- ========================================
-- PRODUCTION DATABASE INVESTIGATION & CLEANUP
-- For unauthorized subscription upgrade issue
-- Created: December 6, 2025
-- ========================================

-- STEP 1: Investigate the specific user
SELECT 
  id, email, username,
  subscription_plan,
  subscription_status,
  subscription_minutes_limit,
  subscription_minutes_used,
  purchased_minutes_balance,
  stripe_customer_id,
  stripe_subscription_id,
  billing_cycle_start,
  created_at,
  updated_at
FROM users 
WHERE email = 'pollis@mineralxtrade.com';

-- STEP 2: Find ALL users with paid plans but NO Stripe subscription
-- These are potentially unauthorized upgrades
SELECT 
  email, 
  subscription_plan, 
  subscription_status, 
  subscription_minutes_limit, 
  stripe_subscription_id,
  stripe_customer_id,
  updated_at
FROM users
WHERE subscription_status = 'active'
  AND subscription_plan IN ('starter', 'standard', 'pro', 'elite')
  AND (stripe_subscription_id IS NULL OR stripe_subscription_id = '')
ORDER BY updated_at DESC;

-- STEP 3: Check recently modified subscriptions (last 7 days)
SELECT 
  email, 
  subscription_plan, 
  subscription_status,
  stripe_subscription_id,
  updated_at
FROM users
WHERE updated_at > NOW() - INTERVAL '7 days'
  AND subscription_plan IS NOT NULL
ORDER BY updated_at DESC;

-- ========================================
-- CLEANUP: Revert affected users to free tier
-- ========================================

-- CAUTION: Only run after verifying no real Stripe subscription exists!
-- First, run this to see what will be affected:
SELECT email, subscription_plan, stripe_subscription_id
FROM users
WHERE subscription_status = 'active'
  AND subscription_plan IN ('starter', 'standard', 'pro', 'elite')
  AND (stripe_subscription_id IS NULL OR stripe_subscription_id = '');

-- Then run this to revert (after confirming the list above):
/*
UPDATE users
SET 
  subscription_plan = 'free',
  subscription_status = 'inactive',
  subscription_minutes_limit = 0,
  subscription_minutes_used = 0,
  updated_at = NOW()
WHERE subscription_status = 'active'
  AND subscription_plan IN ('starter', 'standard', 'pro', 'elite')
  AND (stripe_subscription_id IS NULL OR stripe_subscription_id = '');
*/

-- Revert SPECIFIC user (after confirming no Stripe subscription):
/*
UPDATE users
SET 
  subscription_plan = 'free',
  subscription_status = 'inactive',
  subscription_minutes_limit = 0,
  subscription_minutes_used = 0,
  updated_at = NOW()
WHERE email = 'pollis@mineralxtrade.com'
  AND (stripe_subscription_id IS NULL OR stripe_subscription_id = '');
*/
