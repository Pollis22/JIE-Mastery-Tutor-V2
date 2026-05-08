/**
 * State University AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 *
 * Quiz Voice Controller
 *
 * State machine for voice-driven 10-question MCQ quizzes.
 * Lives independently of the tutor pipeline; the integration in
 * custom-voice-ws.ts decides when to route transcripts here vs to the LLM.
 *
 * State machine:
 *   IDLE → ASKING → LISTENING → GRADING → FEEDBACK → (back to ASKING) → SUMMARY → DONE
 *   ABANDONING is a terminal-but-non-summary path (mid-quiz close).
 *
 * Per-question timer (HS band POC):
 *   When timerEnabled, a setTimeout is armed at the start of LISTENING.
 *   If it fires before a transcript arrives, submitAnswer is called
 *   with timedOut=true and the state machine advances normally.
 *
 * Echo guard:
 *   Each question/feedback sentence is recorded via runtime.recordEcho()
 *   BEFORE the TTS sends. The existing echo guard then suppresses any
 *   transcript that contains tutor-spoken phrases.
 *
 * TODO(v2): retry on ambiguous transcript (currently counts as wrong).
 * TODO(v2): exam mode (suppress per-question feedback).
 * TODO(v2): remediation handoff after summary.
 */

import {
  createQuiz,
  submitAnswer,
  abandonQuiz,
  type QuestionPayload,
  type SubmitAnswerResult,
} from "./quiz-service";
import type { GradeBand } from "./quiz-question-generator";

// ════════════════════════════════════════════════════════════════════════════
// Runtime injection — keeps controller decoupled from custom-voice-ws.ts
// ════════════════════════════════════════════════════════════════════════════

export interface QuizVoiceRuntime {
  /** Generate TTS for `text` and stream to client. Awaits completion. */
  speak(text: string): Promise<void>;

  /** Record `text` into echo guard before TTS plays so mic pickup is suppressed. */
  recordEcho(text: string): void;

  /** Tear down STT before tutor speaks so audio doesn't bleed into transcript. */
  teardownStt(reason: string): void;

  /** Send a typed event to the client (e.g. quiz_question_announced, quiz_score). */
  sendEvent(type: string, payload: Record<string, unknown>): void;

  /** Mirror question/answer text into the tutor transcript log. */
  sendTranscript(speaker: "tutor" | "student", text: string): void;

  /** Heartbeat for the watchdog so the session isn't killed during quiz TTS. */
  markProgress(): void;
}

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export type QuizPhase =
  | "IDLE"
  | "STARTING"
  | "ASKING"
  | "LISTENING"
  | "GRADING"
  | "FEEDBACK"
  | "SUMMARY"
  | "DONE"
  | "ABANDONING";

export interface QuizVoiceControllerOptions {
  userId: string;
  runtime: QuizVoiceRuntime;
}

export interface StartQuizParams {
  topic: string;
  gradeBand: GradeBand;
  mode?: "practice" | "exam";
}

// ════════════════════════════════════════════════════════════════════════════
// Controller
// ════════════════════════════════════════════════════════════════════════════

export class QuizVoiceController {
  private readonly userId: string;
  private readonly runtime: QuizVoiceRuntime;

  private phase: QuizPhase = "IDLE";
  private quizId: string | null = null;
  private currentQuestion: QuestionPayload | null = null;
  private listeningStartedAt: number = 0;
  private perQuestionTimer: NodeJS.Timeout | null = null;
  private timerEnabled: boolean = false;
  private perQuestionSeconds: number | null = null;

  constructor(opts: QuizVoiceControllerOptions) {
    this.userId = opts.userId;
    this.runtime = opts.runtime;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────

  isActive(): boolean {
    return this.phase !== "IDLE" && this.phase !== "DONE";
  }

  getPhase(): QuizPhase {
    return this.phase;
  }

  getQuizId(): string | null {
    return this.quizId;
  }

  /** Begin a new quiz. Caller must verify isActive() === false beforehand. */
  async start(params: StartQuizParams): Promise<void> {
    if (this.isActive()) {
      throw new Error(`Quiz already active (phase=${this.phase})`);
    }
    this.setPhase("STARTING");

    this.runtime.sendEvent("quiz_starting", {
      topic: params.topic,
      gradeBand: params.gradeBand,
      mode: params.mode ?? "practice",
    });

    // Brief verbal preface so the user knows generation is in flight (~2-3s)
    await this.speakQuestionedly("One moment — generating your quiz.");

    let firstQuestion: QuestionPayload;
    let quizId: string;
    try {
      const result = await createQuiz({
        userId: this.userId,
        topic: params.topic,
        gradeBand: params.gradeBand,
        mode: params.mode,
      });
      quizId = result.quizId;
      firstQuestion = result.firstQuestion;
    } catch (err: any) {
      console.error(`[QuizVoice] ❌ createQuiz failed: ${err?.message}`);
      this.setPhase("DONE");
      this.runtime.sendEvent("quiz_error", { message: "Failed to create quiz", detail: err?.message });
      await this.speakQuestionedly("Sorry — I couldn't generate that quiz. Try again later.");
      return;
    }

    this.quizId = quizId;
    // Timer config is decided server-side per band; surface to client for UI
    this.timerEnabled = params.gradeBand === "grades-9-12" || params.gradeBand === "college-adult";
    this.perQuestionSeconds = this.timerEnabled
      ? (params.gradeBand === "college-adult" ? 75 : 60)
      : null;

    this.runtime.sendEvent("quiz_started", {
      quizId,
      totalQuestions: 10,
      timerEnabled: this.timerEnabled,
      perQuestionSeconds: this.perQuestionSeconds,
    });

    await this.askQuestion(firstQuestion);
  }

  /** Route an incoming user transcript to the active quiz. */
  async handleTranscript(transcript: string): Promise<void> {
    if (this.phase !== "LISTENING") {
      console.warn(`[QuizVoice] handleTranscript called in phase=${this.phase} — ignoring`);
      return;
    }
    if (!this.quizId || !this.currentQuestion) {
      console.error(`[QuizVoice] handleTranscript with no active question`);
      return;
    }

    this.clearPerQuestionTimer();
    this.setPhase("GRADING");

    const elapsedMs = Date.now() - this.listeningStartedAt;
    this.runtime.sendTranscript("student", transcript);

    let result: SubmitAnswerResult;
    try {
      result = await submitAnswer(
        {
          quizId: this.quizId,
          questionId: this.currentQuestion.questionId,
          transcript,
          elapsedMs,
          timedOut: false,
        },
        this.userId
      );
    } catch (err: any) {
      console.error(`[QuizVoice] ❌ submitAnswer failed: ${err?.message}`);
      // Recoverable: speak a generic move-on and try the next question if we can.
      await this.speakQuestionedly("Sorry, I had trouble grading that. Let's continue.");
      await this.advanceOrFinish(null);
      return;
    }

    await this.deliverFeedbackAndAdvance(result);
  }

  /** End the quiz mid-flight (user closed UI, navigated away, etc.). */
  async abandon(): Promise<void> {
    if (!this.quizId || this.phase === "DONE") {
      this.setPhase("DONE");
      return;
    }
    this.setPhase("ABANDONING");
    this.clearPerQuestionTimer();
    try {
      await abandonQuiz(this.quizId, this.userId);
    } catch (err: any) {
      console.warn(`[QuizVoice] abandon error (continuing): ${err?.message}`);
    }
    this.runtime.sendEvent("quiz_abandoned", { quizId: this.quizId });
    this.setPhase("DONE");
  }

  // ──────────────────────────────────────────────────────────────────────
  // Internal flow
  // ──────────────────────────────────────────────────────────────────────

  private async askQuestion(question: QuestionPayload): Promise<void> {
    this.currentQuestion = question;
    this.setPhase("ASKING");

    const spokenText = this.formatQuestionForSpeech(question);
    this.runtime.sendEvent("quiz_question_announced", {
      position: question.position,
      questionText: question.questionText,
      options: {
        A: question.optionA,
        B: question.optionB,
        C: question.optionC,
        D: question.optionD,
      },
      topicTag: question.topicTag,
      difficulty: question.difficulty,
    });
    this.runtime.sendTranscript("tutor", spokenText);
    await this.speakQuestionedly(spokenText);

    this.startListening();
  }

  private startListening(): void {
    this.setPhase("LISTENING");
    this.listeningStartedAt = Date.now();
    this.runtime.sendEvent("quiz_listening", {
      questionId: this.currentQuestion?.questionId,
      timerEnabled: this.timerEnabled,
      perQuestionSeconds: this.perQuestionSeconds,
    });

    if (this.timerEnabled && this.perQuestionSeconds) {
      this.perQuestionTimer = setTimeout(() => {
        void this.handleTimeout();
      }, this.perQuestionSeconds * 1000);
    }
  }

  private async handleTimeout(): Promise<void> {
    if (this.phase !== "LISTENING" || !this.quizId || !this.currentQuestion) return;
    console.log(`[QuizVoice] ⏰ timeout on Q${this.currentQuestion.position}`);
    this.setPhase("GRADING");

    let result: SubmitAnswerResult;
    try {
      result = await submitAnswer(
        {
          quizId: this.quizId,
          questionId: this.currentQuestion.questionId,
          transcript: "",
          elapsedMs: this.perQuestionSeconds! * 1000,
          timedOut: true,
        },
        this.userId
      );
    } catch (err: any) {
      console.error(`[QuizVoice] ❌ submitAnswer (timeout) failed: ${err?.message}`);
      await this.speakQuestionedly("Time's up. Moving on.");
      await this.advanceOrFinish(null);
      return;
    }

    await this.speakQuestionedly(`Time's up. The answer was ${result.correctOption}.`);
    await this.advanceOrFinish(result);
  }

  private async deliverFeedbackAndAdvance(result: SubmitAnswerResult): Promise<void> {
    this.setPhase("FEEDBACK");

    let line: string;
    if (result.parseMethod === "ambiguous") {
      // Couldn't parse the transcript at all — count as wrong and move on
      // (no retry in POC; v2 will add a single retry per question)
      line = `I couldn't tell what you picked. The answer was ${result.correctOption}.`;
    } else if (result.isCorrect) {
      line = "Correct!";
    } else {
      const explanation = result.explanation ? ` ${this.trimExplanation(result.explanation)}` : "";
      line = `The answer was ${result.correctOption}.${explanation}`;
    }

    this.runtime.sendEvent("quiz_answer_graded", {
      questionId: result.attemptId,
      parsedOption: result.parsedOption,
      correctOption: result.correctOption,
      isCorrect: result.isCorrect,
      parseMethod: result.parseMethod,
      parseConfidence: result.parseConfidence,
    });
    this.runtime.sendTranscript("tutor", line);
    await this.speakQuestionedly(line);

    await this.advanceOrFinish(result);
  }

  private async advanceOrFinish(result: SubmitAnswerResult | null): Promise<void> {
    if (result?.quizComplete && result.summary) {
      this.setPhase("SUMMARY");
      this.runtime.sendEvent("quiz_complete", { summary: result.summary });
      const summaryLine = this.composeSummaryLine(result);
      this.runtime.sendTranscript("tutor", summaryLine);
      await this.speakQuestionedly(summaryLine);
      this.setPhase("DONE");
      this.currentQuestion = null;
      this.quizId = null;
      return;
    }

    if (result?.nextQuestion) {
      await this.askQuestion(result.nextQuestion);
      return;
    }

    // Fallback: result was null (network error) and we couldn't fetch next
    console.warn(`[QuizVoice] advanceOrFinish: no next question and no summary — ending quiz`);
    this.setPhase("DONE");
    this.currentQuestion = null;
  }

  private composeSummaryLine(result: SubmitAnswerResult): string {
    if (!result.summary) return "Quiz complete.";
    const { questionsCorrect, totalQuestions, scorePct } = result.summary;
    const lead = `You got ${questionsCorrect} out of ${totalQuestions}, ${Math.round(scorePct)}%.`;

    // Add a one-line topic insight if there's a clear weakest area
    const topics = result.summary.perTopicBreakdown ?? [];
    const weakest = topics
      .filter((t) => t.total >= 2)
      .sort((a, b) => a.accuracyPct - b.accuracyPct)[0];
    if (weakest && weakest.accuracyPct < 67) {
      const humanTopic = weakest.topicTag.replace(/-/g, " ");
      return `${lead} You did well overall, but ${humanTopic} is worth reviewing.`;
    }
    return `${lead} Nice work.`;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────

  private formatQuestionForSpeech(q: QuestionPayload): string {
    // Pause-friendly punctuation between options helps ElevenLabs phrasing
    return `Question ${q.position}. ${q.questionText} A. ${q.optionA}. B. ${q.optionB}. C. ${q.optionC}. D. ${q.optionD}.`;
  }

  private trimExplanation(explanation: string): string {
    // Keep feedback short — first sentence only, max ~140 chars
    const firstSentence = explanation.split(/(?<=[.!?])\s+/)[0] ?? explanation;
    return firstSentence.length > 140 ? firstSentence.slice(0, 137) + "..." : firstSentence;
  }

  private async speakQuestionedly(text: string): Promise<void> {
    // Echo guard recording happens BEFORE TTS so any picked-up audio is suppressed
    this.runtime.recordEcho(text);
    this.runtime.teardownStt("quiz_speaking");
    try {
      await this.runtime.speak(text);
    } catch (err: any) {
      console.error(`[QuizVoice] speak failed: ${err?.message}`);
    } finally {
      this.runtime.markProgress();
    }
  }

  private setPhase(next: QuizPhase): void {
    if (this.phase === next) return;
    console.log(`[QuizVoice] phase: ${this.phase} → ${next}`);
    this.phase = next;
  }

  private clearPerQuestionTimer(): void {
    if (this.perQuestionTimer) {
      clearTimeout(this.perQuestionTimer);
      this.perQuestionTimer = null;
    }
  }
}
