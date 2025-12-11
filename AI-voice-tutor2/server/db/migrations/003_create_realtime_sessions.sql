-- Migration: Add realtime_sessions table for OpenAI Realtime API sessions
-- This table tracks WebRTC voice conversation sessions with metadata

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create the realtime_sessions table
CREATE TABLE IF NOT EXISTS realtime_sessions (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id          VARCHAR NOT NULL,
  student_id       VARCHAR,
  subject          TEXT,
  language         TEXT DEFAULT 'en',
  age_group        TEXT DEFAULT '3-5',
  voice            TEXT,
  model            TEXT DEFAULT 'gpt-4o-realtime-preview-2024-10-01',
  status           TEXT DEFAULT 'connecting',
  transcript       JSONB,
  context_documents JSONB,
  started_at       TIMESTAMPTZ DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  minutes_used     INTEGER DEFAULT 0,
  error_message    TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  
  -- Foreign key constraints
  CONSTRAINT fk_realtime_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_realtime_sessions_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_realtime_sessions_user ON realtime_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_realtime_sessions_student ON realtime_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_realtime_sessions_status ON realtime_sessions(status);
CREATE INDEX IF NOT EXISTS idx_realtime_sessions_started ON realtime_sessions(started_at);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON realtime_sessions TO CURRENT_USER;
