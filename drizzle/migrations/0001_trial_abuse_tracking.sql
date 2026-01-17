-- Migration: trial_abuse_tracking table (production-hardening)
-- Date: 2026-01-17
-- Description: Creates anti-abuse tracking table with required constraints and indexes
-- IDEMPOTENT: Safe to run multiple times

-- Enable pgcrypto extension for gen_random_uuid() if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create trial_abuse_tracking table if not exists
CREATE TABLE IF NOT EXISTS public.trial_abuse_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_hash TEXT,
  ip_hash TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  trial_count INTEGER NOT NULL DEFAULT 0,
  last_trial_at TIMESTAMPTZ,
  week_start DATE NOT NULL DEFAULT date_trunc('week', now())::date,
  blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add NOT NULL constraint to ip_hash if missing (for existing tables)
-- Handle NULL ip_hash rows carefully to avoid UNIQUE constraint violations
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trial_abuse_tracking' 
    AND column_name = 'ip_hash' 
    AND is_nullable = 'YES'
  ) THEN
    -- Delete rows with NULL ip_hash (orphaned records that can't be tracked)
    DELETE FROM trial_abuse_tracking WHERE ip_hash IS NULL;
    -- Now safe to add NOT NULL constraint
    ALTER TABLE trial_abuse_tracking ALTER COLUMN ip_hash SET NOT NULL;
  END IF;
END $$;

-- Ensure week_start is DATE type (not TIMESTAMPTZ)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trial_abuse_tracking' 
    AND column_name = 'week_start' 
    AND data_type != 'date'
  ) THEN
    -- Drop dependent constraints first
    ALTER TABLE trial_abuse_tracking DROP CONSTRAINT IF EXISTS trial_abuse_tracking_ip_week_unique;
    DROP INDEX IF EXISTS idx_trial_abuse_device_week_unique;
    -- Convert column type
    ALTER TABLE trial_abuse_tracking 
    ALTER COLUMN week_start TYPE DATE USING week_start::date;
    ALTER TABLE trial_abuse_tracking 
    ALTER COLUMN week_start SET DEFAULT date_trunc('week', now())::date;
    ALTER TABLE trial_abuse_tracking 
    ALTER COLUMN week_start SET NOT NULL;
  END IF;
END $$;

-- Ensure trial_count has NOT NULL and correct default
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trial_abuse_tracking' 
    AND column_name = 'trial_count' 
    AND is_nullable = 'YES'
  ) THEN
    UPDATE trial_abuse_tracking SET trial_count = 0 WHERE trial_count IS NULL;
    ALTER TABLE trial_abuse_tracking ALTER COLUMN trial_count SET NOT NULL;
    ALTER TABLE trial_abuse_tracking ALTER COLUMN trial_count SET DEFAULT 0;
  END IF;
END $$;

-- Ensure blocked has NOT NULL constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trial_abuse_tracking' 
    AND column_name = 'blocked' 
    AND is_nullable = 'YES'
  ) THEN
    UPDATE trial_abuse_tracking SET blocked = false WHERE blocked IS NULL;
    ALTER TABLE trial_abuse_tracking ALTER COLUMN blocked SET NOT NULL;
  END IF;
END $$;

-- Ensure created_at has NOT NULL constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trial_abuse_tracking' 
    AND column_name = 'created_at' 
    AND is_nullable = 'YES'
  ) THEN
    UPDATE trial_abuse_tracking SET created_at = now() WHERE created_at IS NULL;
    ALTER TABLE trial_abuse_tracking ALTER COLUMN created_at SET NOT NULL;
  END IF;
END $$;

-- REQUIRED: UNIQUE constraint for UPSERT on (ip_hash, week_start)
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

-- REQUIRED: Index for IP lookup with recent trials first
CREATE INDEX IF NOT EXISTS idx_trial_abuse_ip_recent 
ON trial_abuse_tracking (ip_hash, last_trial_at DESC);

-- REQUIRED: Index for weekly cleanup/aggregation queries
CREATE INDEX IF NOT EXISTS idx_trial_abuse_week_start 
ON trial_abuse_tracking (week_start);

-- REQUIRED: Index for user lookup
CREATE INDEX IF NOT EXISTS idx_trial_abuse_user_id 
ON trial_abuse_tracking (user_id);

-- OPTIONAL: Unique partial index for device-based tracking
CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_abuse_device_week_unique 
ON trial_abuse_tracking (device_hash, week_start) 
WHERE device_hash IS NOT NULL;
