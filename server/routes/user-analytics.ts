/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// GET /api/user/analytics - User analytics dashboard
router.get('/analytics', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('📊 [Analytics] Fetching analytics for user:', userId);

    // Get voice usage statistics from realtime_sessions
    let usageStats = {
      total_sessions: 0,
      total_minutes_used: 0,
      active_days: 0,
      unique_students: 0
    };

    try {
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');
      
      const statsResult = await db.execute(sql`
        SELECT 
          COUNT(DISTINCT id) as total_sessions,
          COALESCE(SUM(minutes_used), 0) as total_minutes_used,
          COUNT(DISTINCT DATE(started_at)) as active_days,
          COUNT(DISTINCT student_id) as unique_students
        FROM realtime_sessions
        WHERE user_id = ${userId}
          AND status = 'ended'
      `);

      if (statsResult.rows && statsResult.rows[0]) {
        usageStats = statsResult.rows[0] as any;
      }
    } catch (error: any) {
      console.error('[Analytics] Error fetching session stats:', error);
      // Continue with empty stats
    }

    // Get recent sessions
    let recentSessions: any[] = [];
    try {
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');
      
      const sessionsResult = await db.execute(sql`
        SELECT 
          id,
          subject,
          language,
          minutes_used,
          started_at,
          ended_at,
          status
        FROM realtime_sessions
        WHERE user_id = ${userId}
        ORDER BY started_at DESC
        LIMIT 10
      `);

      recentSessions = sessionsResult.rows || [];
    } catch (error: any) {
      console.error('[Analytics] Error fetching recent sessions:', error);
    }

    // Get usage by subject
    let bySubject: any[] = [];
    try {
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');
      
      const subjectResult = await db.execute(sql`
        SELECT 
          subject,
          COUNT(*) as session_count,
          SUM(COALESCE(minutes_used, 0)) as total_minutes
        FROM realtime_sessions
        WHERE user_id = ${userId}
          AND status = 'ended'
        GROUP BY subject
        ORDER BY total_minutes DESC
      `);

      bySubject = subjectResult.rows || [];
    } catch (error: any) {
      console.error('[Analytics] Error fetching subject breakdown:', error);
    }

    // Current usage from user record
    const currentUsage = {
      minutesUsed: user.monthlyVoiceMinutesUsed || 0,
      minutesLimit: user.monthlyVoiceMinutes || 60,
      bonusMinutes: user.bonusMinutes || 0,
      minutesRemaining: (user.monthlyVoiceMinutes || 60) + (user.bonusMinutes || 0) - (user.monthlyVoiceMinutesUsed || 0),
      plan: user.subscriptionPlan || 'starter'
    };

    const response = {
      summary: {
        totalSessions: parseInt(usageStats.total_sessions?.toString() || '0'),
        totalMinutesUsed: parseFloat(usageStats.total_minutes_used?.toString() || '0'),
        activeDays: parseInt(usageStats.active_days?.toString() || '0'),
        uniqueStudents: parseInt(usageStats.unique_students?.toString() || '0')
      },
      currentUsage,
      recentSessions,
      bySubject
    };

    console.log('✅ [Analytics] Analytics fetched successfully');
    res.json(response);

  } catch (error: any) {
    console.error('❌ [Analytics] Failed to fetch analytics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch analytics',
      message: error.message 
    });
  }
});

// GET /api/user/voice-balance - Get hybrid minute balance for dashboard
router.get('/voice-balance', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    
    const { getUserMinuteBalance } = await import('../services/voice-minutes');
    const balance = await getUserMinuteBalance(userId);
    
    console.log('💰 [VoiceBalance] Fetched balance for user:', userId);
    res.json(balance);

  } catch (error: any) {
    console.error('❌ [VoiceBalance] Failed to fetch balance:', error);
    res.status(500).json({ 
      error: 'Failed to fetch voice balance',
      message: error.message 
    });
  }
});

// GET /api/usage/weekly - Rolling 7-day usage summary
router.get('/usage-weekly', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    console.log('📊 [WeeklyUsage] Fetching weekly data for user:', userId);

    let last7Days = 0;
    let previous7Days = 0;

    try {
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');
      
      // Last 7 days (rolling, not calendar week)
      const last7DaysResult = await db.execute(sql`
        SELECT COALESCE(SUM(minutes_used), 0) as total_minutes
        FROM realtime_sessions
        WHERE user_id = ${userId}
          AND status = 'ended'
          AND started_at >= NOW() - INTERVAL '7 days'
      `);

      if (last7DaysResult.rows && last7DaysResult.rows[0]) {
        last7Days = Math.round(parseFloat((last7DaysResult.rows[0] as any).total_minutes) || 0);
      }

      // Previous 7 days (8-14 days ago)
      const prev7DaysResult = await db.execute(sql`
        SELECT COALESCE(SUM(minutes_used), 0) as total_minutes
        FROM realtime_sessions
        WHERE user_id = ${userId}
          AND status = 'ended'
          AND started_at >= NOW() - INTERVAL '14 days'
          AND started_at < NOW() - INTERVAL '7 days'
      `);

      if (prev7DaysResult.rows && prev7DaysResult.rows[0]) {
        previous7Days = Math.round(parseFloat((prev7DaysResult.rows[0] as any).total_minutes) || 0);
      }
    } catch (error: any) {
      console.error('[WeeklyUsage] Error fetching weekly stats:', error);
    }

    // Calculate percentage change
    let percentChange = 0;
    if (previous7Days > 0) {
      percentChange = Math.round(((last7Days - previous7Days) / previous7Days) * 100);
    } else if (last7Days > 0) {
      percentChange = 100; // Any activity is +100% from zero
    }

    const response = {
      last7Days,
      previous7Days,
      percentChange
    };

    console.log('✅ [WeeklyUsage] Weekly data fetched successfully');
    res.json(response);

  } catch (error: any) {
    console.error('❌ [WeeklyUsage] Failed to fetch weekly data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch weekly usage data',
      message: error.message 
    });
  }
});

// GET /api/user/usage-analytics - Alias for /analytics
router.get('/usage-analytics', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('📊 [UsageAnalytics] Fetching analytics for user:', userId);

    let usageStats = {
      total_sessions: 0,
      total_minutes_used: 0,
      active_days: 0,
      unique_students: 0
    };

    try {
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');
      
      const statsResult = await db.execute(sql`
        SELECT 
          COUNT(DISTINCT id) as total_sessions,
          COALESCE(SUM(minutes_used), 0) as total_minutes_used,
          COUNT(DISTINCT DATE(started_at)) as active_days,
          COUNT(DISTINCT student_id) as unique_students
        FROM realtime_sessions
        WHERE user_id = ${userId}
          AND status = 'ended'
      `);

      if (statsResult.rows && statsResult.rows[0]) {
        usageStats = statsResult.rows[0] as any;
      }
    } catch (error: any) {
      console.error('[UsageAnalytics] Error fetching session stats:', error);
    }

    const response = {
      summary: {
        totalSessions: parseInt(usageStats.total_sessions?.toString() || '0'),
        totalMinutesUsed: parseFloat(usageStats.total_minutes_used?.toString() || '0'),
        activeDays: parseInt(usageStats.active_days?.toString() || '0'),
        uniqueStudents: parseInt(usageStats.unique_students?.toString() || '0')
      }
    };

    console.log('✅ [UsageAnalytics] Analytics fetched successfully');
    res.json(response);

  } catch (error: any) {
    console.error('❌ [UsageAnalytics] Failed to fetch analytics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch usage analytics',
      message: error.message 
    });
  }
});

export default router;
