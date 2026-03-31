-- ============================================================
-- Family Academic Command Center — SQL Tables
-- JIE Mastery K-12 Consumer Platform
-- Execute in Beekeeper or psql against your PostgreSQL database
-- ============================================================

-- 1. family_children — Child profiles under a parent account
CREATE TABLE IF NOT EXISTS family_children (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_name TEXT NOT NULL,
  child_age INTEGER,
  grade_level TEXT,
  avatar_emoji TEXT,
  color TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_children_parent ON family_children(parent_user_id);

-- 2. family_courses — Classes/subjects per child
CREATE TABLE IF NOT EXISTS family_courses (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id VARCHAR NOT NULL REFERENCES family_children(id) ON DELETE CASCADE,
  parent_user_id VARCHAR NOT NULL REFERENCES users(id),
  course_name TEXT NOT NULL,
  teacher_name TEXT,
  school_name TEXT,
  semester TEXT,
  schedule_text TEXT,
  color TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_courses_child ON family_courses(child_id);
CREATE INDEX IF NOT EXISTS idx_family_courses_parent ON family_courses(parent_user_id);

-- 3. family_calendar_events — Tests, homework, projects per child
CREATE TABLE IF NOT EXISTS family_calendar_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id VARCHAR NOT NULL REFERENCES family_children(id) ON DELETE CASCADE,
  parent_user_id VARCHAR NOT NULL REFERENCES users(id),
  course_id VARCHAR REFERENCES family_courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  event_type TEXT,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TEXT,
  end_time TEXT,
  is_from_schedule BOOLEAN DEFAULT false,
  priority TEXT,
  status TEXT DEFAULT 'upcoming',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_events_child ON family_calendar_events(child_id);
CREATE INDEX IF NOT EXISTS idx_family_events_parent ON family_calendar_events(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_family_events_date ON family_calendar_events(child_id, start_date);

-- 4. family_tasks — Auto-generated + manual study tasks per child
CREATE TABLE IF NOT EXISTS family_tasks (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id VARCHAR NOT NULL REFERENCES family_children(id) ON DELETE CASCADE,
  parent_user_id VARCHAR NOT NULL REFERENCES users(id),
  course_id VARCHAR REFERENCES family_courses(id) ON DELETE SET NULL,
  event_id VARCHAR REFERENCES family_calendar_events(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  task_type TEXT,
  due_date DATE,
  priority TEXT,
  status TEXT DEFAULT 'pending',
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  xp_reward INTEGER DEFAULT 10,
  notes TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_tasks_child ON family_tasks(child_id);
CREATE INDEX IF NOT EXISTS idx_family_tasks_parent ON family_tasks(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_family_tasks_status ON family_tasks(child_id, status);

-- 5. family_reminders — Notifications for parent + child
CREATE TABLE IF NOT EXISTS family_reminders (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id VARCHAR NOT NULL REFERENCES family_children(id) ON DELETE CASCADE,
  parent_user_id VARCHAR NOT NULL REFERENCES users(id),
  event_id VARCHAR REFERENCES family_calendar_events(id) ON DELETE SET NULL,
  task_id VARCHAR REFERENCES family_tasks(id) ON DELETE SET NULL,
  reminder_type TEXT,
  reminder_date DATE,
  message TEXT,
  delivered BOOLEAN DEFAULT false,
  delivered_at TIMESTAMP,
  delivery_method TEXT DEFAULT 'in_app',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_reminders_child ON family_reminders(child_id);
CREATE INDEX IF NOT EXISTS idx_family_reminders_date ON family_reminders(reminder_date, delivered);

-- 6. family_engagement_scores — Weekly engagement per child
CREATE TABLE IF NOT EXISTS family_engagement_scores (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id VARCHAR NOT NULL REFERENCES family_children(id) ON DELETE CASCADE,
  parent_user_id VARCHAR NOT NULL REFERENCES users(id),
  course_id VARCHAR REFERENCES family_courses(id) ON DELETE SET NULL,
  week_start DATE,
  sessions_completed INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  tasks_pending INTEGER DEFAULT 0,
  tasks_missed INTEGER DEFAULT 0,
  total_study_minutes INTEGER DEFAULT 0,
  engagement_score DECIMAL DEFAULT 0,
  trend TEXT DEFAULT 'stable',
  risk_level TEXT DEFAULT 'on_track',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_engagement_child ON family_engagement_scores(child_id);
CREATE INDEX IF NOT EXISTS idx_family_engagement_week ON family_engagement_scores(child_id, week_start);

-- 7. family_study_goals — Parent-set weekly goals per child
CREATE TABLE IF NOT EXISTS family_study_goals (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id VARCHAR NOT NULL REFERENCES family_children(id) ON DELETE CASCADE,
  parent_user_id VARCHAR NOT NULL REFERENCES users(id),
  goal_type TEXT NOT NULL,
  target_value INTEGER NOT NULL,
  current_value INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_goals_child ON family_study_goals(child_id);

-- 8. family_achievements — Badges and milestones per child
CREATE TABLE IF NOT EXISTS family_achievements (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id VARCHAR NOT NULL REFERENCES family_children(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  achievement_emoji TEXT,
  earned_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_achievements_child ON family_achievements(child_id);

-- 9. family_streaks — Daily activity tracking
CREATE TABLE IF NOT EXISTS family_streaks (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id VARCHAR NOT NULL REFERENCES family_children(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  had_session BOOLEAN DEFAULT false,
  had_task_completion BOOLEAN DEFAULT false,
  study_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(child_id, activity_date)
);
CREATE INDEX IF NOT EXISTS idx_family_streaks_child ON family_streaks(child_id, activity_date);

-- 10. family_weekly_reports — Cached weekly digest data for parent emails
CREATE TABLE IF NOT EXISTS family_weekly_reports (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id VARCHAR NOT NULL REFERENCES family_children(id) ON DELETE CASCADE,
  parent_user_id VARCHAR NOT NULL REFERENCES users(id),
  week_start DATE,
  report_data JSONB,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_reports_parent ON family_weekly_reports(parent_user_id, week_start);
