/**
 * State University AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 *
 * Quiz Service — orchestrates quiz lifecycle:
 *   1. createQuiz() → generates 10 questions, persists to DB
 *   2. getCurrentQuestion() → returns the next unanswered question
 *   3. submitAnswer() → grades transcript, advances state, returns next question or final summary
 *   4. abandonQuiz() → marks abandoned (user closed mid-quiz)
 *   5. getSummary() → final score breakdown
 *
 * Per-band timer defaults: see TIMER_DEFAULTS_BY_BAND below.
 */

import { db } from "../db";
import { voiceQuizSessions, voiceQuizQuestions, voiceQuizAttempts } from "@shared/schema";
import type { VoiceQuizSession, VoiceQuizQuestion } from "@shared/schema";
import { eq, and, asc, count, sql } from "drizzle-orm";
import { generateQuiz, type GradeBand } from "./quiz-question-generator";
import { gradeAttempt, type Option, type ParseMethod } from "./quiz-grader";

// ════════════════════════════════════════════════════════════════════════════
// Per-band timer defaults
// ════════════════════════════════════════════════════════════════════════════

interface TimerDefaults {
  enabled: boolean;
  perQuestionSeconds: number | null;
}

const TIMER_DEFAULTS_BY_BAND: Record<GradeBand, TimerDefaults> = {
  "kindergarten-2":   { enabled: false, perQuestionSeconds: null },
  "grades-3-5":       { enabled: false, perQuestionSeconds: null },
  "grades-6-8":       { enabled: false, perQuestionSeconds: null },  // configurable in v2
  "grades-9-12":      { enabled: true,  perQuestionSeconds: 60 },     // POC default
  "college-adult":    { enabled: true,  perQuestionSeconds: 75 },     // standardized test prep tightens this further in v2
};

const QUIZ_QUESTION_COUNT = 10;

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export interface CreateQuizInput {
  userId: string;
  topic: string;
  gradeBand: GradeBand;
  mode?: "practice" | "exam";  // POC default: practice
}

export interface QuestionPayload {
  questionId: string;
  position: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  topicTag: string | null;
  difficulty: string | null;
}

export interface SubmitAnswerInput {
  quizId: string;
  questionId: string;
  transcript: string;
  elapsedMs?: number;
  timedOut?: boolean;
}

export interface SubmitAnswerResult {
  attemptId: string;
  parsedOption: Option | null;
  isCorrect: boolean;
  correctOption: Option;
  explanation: string | null;
  parseMethod: ParseMethod;
  parseConfidence: number;
  // What's next
  nextQuestion: QuestionPayload | null;
  quizComplete: boolean;
  summary: QuizSummary | null;
}

export interface QuizSummary {
  quizId: string;
  topic: string;
  totalQuestions: number;
  questionsAnswered: number;
  questionsCorrect: number;
  scorePct: number;
  startedAt: Date;
  completedAt: Date | null;
  perTopicBreakdown: Array<{ topicTag: string; correct: number; total: number; accuracyPct: number }>;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Create quiz
// ════════════════════════════════════════════════════════════════════════════

export async function createQuiz(input: CreateQuizInput): Promise<{ quizId: string; firstQuestion: QuestionPayload }> {
  const timer = TIMER_DEFAULTS_BY_BAND[input.gradeBand];
  const totalSeconds = timer.enabled && timer.perQuestionSeconds
    ? timer.perQuestionSeconds * QUIZ_QUESTION_COUNT
    : null;

  console.log(`[QuizService] Creating quiz: user=${input.userId} topic="${input.topic}" band=${input.gradeBand} timer=${timer.enabled}`);

  // Generate questions BEFORE inserting session — if generation fails, no orphan row.
  const generated = await generateQuiz({
    topic: input.topic,
    gradeBand: input.gradeBand,
    questionCount: QUIZ_QUESTION_COUNT,
  });

  // Insert session
  const [session] = await db
    .insert(voiceQuizSessions)
    .values({
      userId: input.userId,
      topic: input.topic,
      gradeBand: input.gradeBand,
      mode: input.mode ?? "practice",
      questionCount: QUIZ_QUESTION_COUNT,
      timerEnabled: timer.enabled,
      perQuestionSeconds: timer.perQuestionSeconds ?? undefined,
      timeLimitSeconds: totalSeconds ?? undefined,
    })
    .returning();

  // Insert all 10 questions
  const questionRows = generated.questions.map((q) => ({
    quizId: session.id,
    position: q.position,
    questionText: q.question_text,
    optionA: q.option_a,
    optionB: q.option_b,
    optionC: q.option_c,
    optionD: q.option_d,
    correctOption: q.correct_option,
    explanation: q.explanation,
    topicTag: q.topic_tag,
    difficulty: q.difficulty,
  }));
  const inserted = await db.insert(voiceQuizQuestions).values(questionRows).returning();

  const firstQ = inserted.find((q) => q.position === 1);
  if (!firstQ) throw new Error("Failed to insert quiz questions");

  console.log(`[QuizService] ✅ Quiz ${session.id} created with ${inserted.length} questions in ${generated.durationMs}ms`);

  return {
    quizId: session.id,
    firstQuestion: questionToPayload(firstQ),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Get current question (resume support)
// ════════════════════════════════════════════════════════════════════════════

export async function getCurrentQuestion(quizId: string, userId: string): Promise<QuestionPayload | null> {
  const session = await loadSessionForUser(quizId, userId);
  if (!session) throw new Error("Quiz not found");
  if (session.status !== "in_progress") return null;

  const nextPosition = session.questionsAnswered + 1;
  if (nextPosition > session.questionCount) return null;

  const [q] = await db
    .select()
    .from(voiceQuizQuestions)
    .where(and(eq(voiceQuizQuestions.quizId, quizId), eq(voiceQuizQuestions.position, nextPosition)))
    .limit(1);

  return q ? questionToPayload(q) : null;
}

// ════════════════════════════════════════════════════════════════════════════
// 3. Submit answer
// ════════════════════════════════════════════════════════════════════════════

export async function submitAnswer(input: SubmitAnswerInput, userId: string): Promise<SubmitAnswerResult> {
  const session = await loadSessionForUser(input.quizId, userId);
  if (!session) throw new Error("Quiz not found");
  if (session.status !== "in_progress") throw new Error(`Quiz already ${session.status}`);

  const [question] = await db
    .select()
    .from(voiceQuizQuestions)
    .where(and(eq(voiceQuizQuestions.id, input.questionId), eq(voiceQuizQuestions.quizId, input.quizId)))
    .limit(1);
  if (!question) throw new Error("Question not found");

  // Verify question is the expected next position (prevents skip-ahead)
  const expectedPosition = session.questionsAnswered + 1;
  if (question.position !== expectedPosition) {
    throw new Error(`Out-of-order submission: expected position ${expectedPosition}, got ${question.position}`);
  }

  // Grade
  let parsedOption: Option | null = null;
  let confidence = 0;
  let parseMethod: ParseMethod;
  let reasoning: string | undefined;

  if (input.timedOut) {
    parseMethod = "timeout";
    reasoning = "timer-expired";
  } else {
    const result = await gradeAttempt({
      transcript: input.transcript,
      optionA: question.optionA,
      optionB: question.optionB,
      optionC: question.optionC,
      optionD: question.optionD,
    });
    parsedOption = result.parsedOption;
    confidence = result.confidence;
    parseMethod = result.parseMethod;
    reasoning = result.reasoning;
  }

  const correctOption = question.correctOption as Option;
  const isCorrect = parsedOption !== null && parsedOption === correctOption;

  // Persist attempt
  const [attempt] = await db
    .insert(voiceQuizAttempts)
    .values({
      questionId: question.id,
      quizId: input.quizId,
      rawTranscript: input.transcript,
      parsedOption: parsedOption ?? undefined,
      isCorrect,
      parseConfidence: confidence.toFixed(2),
      parseMethod,
      elapsedMs: input.elapsedMs,
      timedOut: input.timedOut ?? false,
    })
    .returning();

  console.log(
    `[QuizService] Q${question.position}/${session.questionCount} | ${isCorrect ? "✅" : "❌"} ` +
    `parsed=${parsedOption ?? "null"} correct=${correctOption} method=${parseMethod} reason=${reasoning ?? "n/a"}`
  );

  // Update session counters
  const newAnswered = session.questionsAnswered + 1;
  const newCorrect = session.questionsCorrect + (isCorrect ? 1 : 0);
  const isComplete = newAnswered >= session.questionCount;
  const newScorePct = isComplete ? (newCorrect / session.questionCount) * 100 : null;

  await db
    .update(voiceQuizSessions)
    .set({
      questionsAnswered: newAnswered,
      questionsCorrect: newCorrect,
      scorePct: newScorePct?.toFixed(2),
      status: isComplete ? "completed" : "in_progress",
      completedAt: isComplete ? new Date() : null,
    })
    .where(eq(voiceQuizSessions.id, input.quizId));

  // Load next question or summary
  let nextQuestion: QuestionPayload | null = null;
  let summary: QuizSummary | null = null;

  if (!isComplete) {
    const [next] = await db
      .select()
      .from(voiceQuizQuestions)
      .where(and(eq(voiceQuizQuestions.quizId, input.quizId), eq(voiceQuizQuestions.position, newAnswered + 1)))
      .limit(1);
    if (next) nextQuestion = questionToPayload(next);
  } else {
    summary = await getSummary(input.quizId, userId);
  }

  return {
    attemptId: attempt.id,
    parsedOption,
    isCorrect,
    correctOption,
    explanation: question.explanation,
    parseMethod,
    parseConfidence: confidence,
    nextQuestion,
    quizComplete: isComplete,
    summary,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Abandon
// ════════════════════════════════════════════════════════════════════════════

export async function abandonQuiz(quizId: string, userId: string): Promise<void> {
  const session = await loadSessionForUser(quizId, userId);
  if (!session) throw new Error("Quiz not found");
  if (session.status !== "in_progress") return;  // already ended, no-op

  await db
    .update(voiceQuizSessions)
    .set({ status: "abandoned", completedAt: new Date() })
    .where(eq(voiceQuizSessions.id, quizId));

  console.log(`[QuizService] Quiz ${quizId} abandoned at Q${session.questionsAnswered}/${session.questionCount}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. Summary
// ════════════════════════════════════════════════════════════════════════════

export async function getSummary(quizId: string, userId: string): Promise<QuizSummary> {
  const session = await loadSessionForUser(quizId, userId);
  if (!session) throw new Error("Quiz not found");

  // Per-topic_tag breakdown via SQL
  const breakdown = await db
    .select({
      topicTag: voiceQuizQuestions.topicTag,
      correct: sql<number>`SUM(CASE WHEN ${voiceQuizAttempts.isCorrect} THEN 1 ELSE 0 END)::int`,
      total: count(voiceQuizAttempts.id),
    })
    .from(voiceQuizAttempts)
    .innerJoin(voiceQuizQuestions, eq(voiceQuizAttempts.questionId, voiceQuizQuestions.id))
    .where(eq(voiceQuizAttempts.quizId, quizId))
    .groupBy(voiceQuizQuestions.topicTag);

  const perTopicBreakdown = breakdown
    .filter((r) => r.topicTag != null)
    .map((r) => ({
      topicTag: r.topicTag as string,
      correct: Number(r.correct),
      total: Number(r.total),
      accuracyPct: r.total > 0 ? (Number(r.correct) / Number(r.total)) * 100 : 0,
    }));

  return {
    quizId: session.id,
    topic: session.topic,
    totalQuestions: session.questionCount,
    questionsAnswered: session.questionsAnswered,
    questionsCorrect: session.questionsCorrect,
    scorePct: session.scorePct ? Number(session.scorePct) : 0,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    perTopicBreakdown,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ════════════════════════════════════════════════════════════════════════════

async function loadSessionForUser(quizId: string, userId: string): Promise<VoiceQuizSession | null> {
  const [session] = await db
    .select()
    .from(voiceQuizSessions)
    .where(and(eq(voiceQuizSessions.id, quizId), eq(voiceQuizSessions.userId, userId)))
    .limit(1);
  return session ?? null;
}

function questionToPayload(q: VoiceQuizQuestion): QuestionPayload {
  return {
    questionId: q.id,
    position: q.position,
    questionText: q.questionText,
    optionA: q.optionA,
    optionB: q.optionB,
    optionC: q.optionC,
    optionD: q.optionD,
    topicTag: q.topicTag,
    difficulty: q.difficulty,
  };
}
