-- Migration: Add constraints and indexes for trial_abuse_tracking table
-- Date: 2026-01-17
-- Description: Adds UNIQUE constraint and performance indexes for trial abuse tracking UPSERT operations

-- Create table if not exists (idempotent)
CREATE TABLE IF NOT EXISTS trial_abuse_tracking (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  device_hash VARCHAR(64),
  ip_hash VARCHAR(64),
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  trial_count INTEGER DEFAULT 1,
  last_trial_at TIMESTAMPTZ DEFAULT NOW(),
  week_start DATE DEFAULT CURRENT_DATE,
  blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert week_start from TIMESTAMPTZ to DATE if needed (idempotent)
-- Must drop dependent constraints first, then recreate after type change
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trial_abuse_tracking' 
    AND column_name = 'week_start' 
    AND data_type != 'date'
  ) THEN
    -- Drop constraint (will also drop backing index)
    ALTER TABLE trial_abuse_tracking DROP CONSTRAINT IF EXISTS trial_abuse_tracking_ip_week_unique;
    -- Drop partial index
    DROP INDEX IF EXISTS idx_trial_abuse_device_week_unique;
    -- Convert column type
    ALTER TABLE trial_abuse_tracking 
    ALTER COLUMN week_start TYPE DATE USING week_start::date;
    ALTER TABLE trial_abuse_tracking 
    ALTER COLUMN week_start SET DEFAULT CURRENT_DATE;
  END IF;
END $$;

-- Add UNIQUE constraint for UPSERT on (ip_hash, week_start)
-- This allows ON CONFLICT (ip_hash, week_start) DO UPDATE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'trial_abuse_tracking_ip_week_unique'
  ) THEN
    ALTER TABLE trial_abuse_tracking 
    ADD CONSTRAINT trial_abuse_tracking_ip_week_unique 
    UNIQUE (ip_hash, week_start);
  END IF;
END $$;

-- Index for IP lookup with recent trials first
CREATE INDEX IF NOT EXISTS idx_trial_abuse_ip_recent 
ON trial_abuse_tracking (ip_hash, last_trial_at DESC);

-- Index for weekly cleanup/aggregation queries
CREATE INDEX IF NOT EXISTS idx_trial_abuse_week_start 
ON trial_abuse_tracking (week_start);

-- Index for user lookup (find all trials by user)
CREATE INDEX IF NOT EXISTS idx_trial_abuse_user_id 
ON trial_abuse_tracking (user_id);

-- Unique partial index for device-based tracking (optional, for future device limit enforcement)
-- Only applies when device_hash is not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_abuse_device_week_unique 
ON trial_abuse_tracking (device_hash, week_start) 
WHERE device_hash IS NOT NULL;

-- Grant appropriate permissions (adjust role name as needed for production)
-- GRANT SELECT, INSERT, UPDATE ON trial_abuse_tracking TO app_user;
