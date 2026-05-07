/**
 * State University AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 *
 * Quiz Mode REST endpoints
 *   POST /api/quiz/start             → create quiz, return first question
 *   GET  /api/quiz/:quizId/current   → resume support, returns current question
 *   POST /api/quiz/:quizId/submit    → grade transcript, return next question or summary
 *   POST /api/quiz/:quizId/abandon   → mark abandoned (mid-quiz close)
 *   GET  /api/quiz/:quizId/summary   → final score breakdown
 *   GET  /api/quiz/recent            → user's recent quizzes (last 20)
 *
 * Auth: requires authenticated user. Uses requireAuth() helper matching
 * server/routes/academic.ts pattern.
 */

import { Router } from "express";
import { z } from "zod";
import {
  createQuiz,
  getCurrentQuestion,
  submitAnswer,
  abandonQuiz,
  getSummary,
} from "../services/quiz-service";
import { db } from "../db";
import { voiceQuizSessions } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Auth helper (matches academic.ts pattern)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function requireAuth(req: any, res: any): string | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return (req.user as any).id;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rate limiting — POC: 10 quizzes/user/day (cheap in-memory counter)
// v2: move to Redis or DB-backed counter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const POC_DAILY_LIMIT = 10;
const dailyCounter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const entry = dailyCounter.get(userId);

  if (!entry || entry.resetAt < now) {
    dailyCounter.set(userId, { count: 1, resetAt: now + dayMs });
    return { allowed: true, remaining: POC_DAILY_LIMIT - 1 };
  }

  if (entry.count >= POC_DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: POC_DAILY_LIMIT - entry.count };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation schemas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const startSchema = z.object({
  topic: z.string().min(2).max(200).trim(),
  gradeBand: z.enum(["kindergarten-2", "grades-3-5", "grades-6-8", "grades-9-12", "college-adult"]),
  mode: z.enum(["practice", "exam"]).optional().default("practice"),
});

const submitSchema = z.object({
  questionId: z.string().min(1),
  transcript: z.string().max(2000),
  elapsedMs: z.number().int().nonnegative().optional(),
  timedOut: z.boolean().optional().default(false),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/quiz/start
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post("/start", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const limit = checkRateLimit(userId);
  if (!limit.allowed) {
    return res.status(429).json({
      error: "Daily quiz limit reached",
      message: `Limit of ${POC_DAILY_LIMIT} quizzes per day. Try again tomorrow.`,
    });
  }

  try {
    const result = await createQuiz({
      userId,
      topic: parsed.data.topic,
      gradeBand: parsed.data.gradeBand,
      mode: parsed.data.mode,
    });
    res.json({
      success: true,
      quizId: result.quizId,
      firstQuestion: result.firstQuestion,
      remainingToday: limit.remaining,
    });
  } catch (err: any) {
    console.error(`[QuizRoute] Failed to create quiz:`, err?.message ?? err);
    res.status(500).json({ error: "Failed to create quiz", message: err?.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/quiz/:quizId/current
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get("/:quizId/current", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const question = await getCurrentQuestion(req.params.quizId, userId);
    if (!question) {
      return res.json({ success: true, question: null, message: "No active question — quiz may be complete" });
    }
    res.json({ success: true, question });
  } catch (err: any) {
    console.error(`[QuizRoute] Get current failed:`, err?.message);
    res.status(404).json({ error: err?.message ?? "Quiz not found" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/quiz/:quizId/submit
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post("/:quizId/submit", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const result = await submitAnswer(
      {
        quizId: req.params.quizId,
        questionId: parsed.data.questionId,
        transcript: parsed.data.transcript,
        elapsedMs: parsed.data.elapsedMs,
        timedOut: parsed.data.timedOut,
      },
      userId
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[QuizRoute] Submit failed:`, err?.message);
    res.status(400).json({ error: err?.message ?? "Submit failed" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/quiz/:quizId/abandon
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post("/:quizId/abandon", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    await abandonQuiz(req.params.quizId, userId);
    res.json({ success: true });
  } catch (err: any) {
    console.error(`[QuizRoute] Abandon failed:`, err?.message);
    res.status(400).json({ error: err?.message ?? "Abandon failed" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/quiz/:quizId/summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get("/:quizId/summary", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const summary = await getSummary(req.params.quizId, userId);
    res.json({ success: true, summary });
  } catch (err: any) {
    console.error(`[QuizRoute] Summary failed:`, err?.message);
    res.status(404).json({ error: err?.message ?? "Quiz not found" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/quiz/recent  → user's last 20 quizzes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get("/recent", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const rows = await db
      .select({
        id: voiceQuizSessions.id,
        topic: voiceQuizSessions.topic,
        gradeBand: voiceQuizSessions.gradeBand,
        scorePct: voiceQuizSessions.scorePct,
        status: voiceQuizSessions.status,
        questionsAnswered: voiceQuizSessions.questionsAnswered,
        questionCount: voiceQuizSessions.questionCount,
        startedAt: voiceQuizSessions.startedAt,
        completedAt: voiceQuizSessions.completedAt,
      })
      .from(voiceQuizSessions)
      .where(eq(voiceQuizSessions.userId, userId))
      .orderBy(desc(voiceQuizSessions.startedAt))
      .limit(20);

    res.json({ success: true, quizzes: rows });
  } catch (err: any) {
    console.error(`[QuizRoute] Recent failed:`, err?.message);
    res.status(500).json({ error: "Failed to load recent quizzes" });
  }
});

export default router;
