-- Fix billing date synchronization for all existing users
-- This ensures subscription renewal and minute reset happen on the same date

-- Update all active subscriptions to have synchronized dates
UPDATE users 
SET 
  monthly_reset_date = billing_cycle_start,
  last_reset_at = billing_cycle_start
WHERE subscription_status = 'active'
  AND (monthly_reset_date != billing_cycle_start 
       OR last_reset_at != billing_cycle_start
       OR monthly_reset_date IS NULL 
       OR last_reset_at IS NULL);

-- For users without billing_cycle_start, use created_at as the baseline
UPDATE users 
SET 
  billing_cycle_start = created_at,
  monthly_reset_date = created_at,
  last_reset_at = created_at
WHERE subscription_status = 'active'
  AND billing_cycle_start IS NULL;

-- Show results
SELECT 
  email,
  subscription_plan,
  subscription_status,
  billing_cycle_start::date as billing_start,
  monthly_reset_date::date as reset_date,
  last_reset_at::date as last_reset,
  (billing_cycle_start = monthly_reset_date AND billing_cycle_start = last_reset_at) as dates_synced
FROM users
WHERE subscription_status = 'active'
ORDER BY email
LIMIT 10;