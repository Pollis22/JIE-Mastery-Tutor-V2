/**
 * State University AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 *
 * Quiz Question Generator
 *
 * Generates 10 MCQ questions for a topic + grade band via Claude Sonnet 4.6
 * with prompt caching. Falls back to GPT-4o on Anthropic overload (matches
 * ai-service.ts retry/fallback pattern).
 *
 * Output: structured JSON, validated against MCQ schema before return.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { QUIZ_GENERATOR_PROMPT } from "../prompts/quiz-system-prompt";

/*
<important_code_snippet_instructions>
The newest Anthropic model is "claude-sonnet-4-6", not "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229".
If the user doesn't specify a model, always prefer using "claude-sonnet-4-6" as it is the latest model.
</important_code_snippet_instructions>
*/

// ── Lazy clients (matches ai-service.ts pattern) ────────────────────────────
let anthropic: Anthropic | null = null;
let openai: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY environment variable");
    }
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

function getOpenAIClient(): OpenAI | null {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) return null;
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// <important_do_not_delete>
const DEFAULT_MODEL_STR = "claude-sonnet-4-6";
// </important_do_not_delete>
const OPENAI_FALLBACK_MODEL = "gpt-4o";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

// ── Types ───────────────────────────────────────────────────────────────────

export type GradeBand =
  | "kindergarten-2"
  | "grades-3-5"
  | "grades-6-8"
  | "grades-9-12"
  | "college-adult";

export type Difficulty = "easy" | "medium" | "hard";
export type CorrectOption = "A" | "B" | "C" | "D";

export interface GeneratedQuestion {
  position: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: CorrectOption;
  explanation: string;
  topic_tag: string;
  difficulty: Difficulty;
}

export interface GenerateQuizInput {
  topic: string;
  gradeBand: GradeBand;
  questionCount?: number;  // default 10, POC fixed at 10
}

export interface GenerateQuizResult {
  questions: GeneratedQuestion[];
  modelUsed: "claude" | "openai-fallback";
  tokensUsed: { input: number; output: number; cacheReads: number; cacheWrites: number };
  durationMs: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isRetryableError(err: any): boolean {
  const status = err?.status || err?.statusCode || 0;
  const type = err?.error?.type || err?.type || "";
  const msg = (err?.message || err?.error?.message || "").toLowerCase();
  return (
    status === 529 || status === 429 || status === 500 ||
    type === "overloaded_error" || type === "rate_limit_error" || type === "api_error" ||
    msg.includes("overloaded") || msg.includes("rate limit")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUserMessage(input: GenerateQuizInput): string {
  const count = input.questionCount ?? 10;
  return `Topic: ${input.topic}
Grade band: ${input.gradeBand}
Number of questions: ${count}

Generate the quiz now. Return ONLY the JSON object — no preamble, no fences.`;
}

// Strip markdown fences if Claude/OpenAI emit them despite instructions
function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

// ── Validation ──────────────────────────────────────────────────────────────

function validateQuestions(raw: unknown, expectedCount: number): GeneratedQuestion[] {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Generator returned non-object");
  }
  const obj = raw as any;
  if (!Array.isArray(obj.questions)) {
    throw new Error("Generator response missing 'questions' array");
  }
  if (obj.questions.length !== expectedCount) {
    throw new Error(`Generator returned ${obj.questions.length} questions, expected ${expectedCount}`);
  }

  const validDifficulties: Difficulty[] = ["easy", "medium", "hard"];
  const validOptions: CorrectOption[] = ["A", "B", "C", "D"];
  const validated: GeneratedQuestion[] = [];

  for (let i = 0; i < obj.questions.length; i++) {
    const q = obj.questions[i];
    const errs: string[] = [];

    if (typeof q.question_text !== "string" || q.question_text.length < 4) errs.push("question_text");
    if (typeof q.option_a !== "string" || !q.option_a) errs.push("option_a");
    if (typeof q.option_b !== "string" || !q.option_b) errs.push("option_b");
    if (typeof q.option_c !== "string" || !q.option_c) errs.push("option_c");
    if (typeof q.option_d !== "string" || !q.option_d) errs.push("option_d");
    if (!validOptions.includes(q.correct_option)) errs.push("correct_option");
    if (typeof q.explanation !== "string") errs.push("explanation");
    if (typeof q.topic_tag !== "string" || q.topic_tag.length === 0) errs.push("topic_tag");
    if (!validDifficulties.includes(q.difficulty)) errs.push("difficulty");

    if (errs.length > 0) {
      throw new Error(`Question ${i + 1} invalid fields: ${errs.join(", ")}`);
    }

    validated.push({
      position: i + 1,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_option: q.correct_option,
      explanation: q.explanation,
      topic_tag: q.topic_tag.toLowerCase().slice(0, 30),
      difficulty: q.difficulty,
    });
  }

  // Sanity check: correct answers shouldn't all be the same letter
  const letters = validated.map((q) => q.correct_option);
  const distinctLetters = new Set(letters).size;
  if (distinctLetters < 2) {
    console.warn(`[QuizGen] ⚠️ All correct answers on letter ${letters[0]} — possible generation issue`);
  }

  return validated;
}

// ── Claude generation path ──────────────────────────────────────────────────

async function generateViaClaude(input: GenerateQuizInput): Promise<{
  questions: GeneratedQuestion[];
  tokensUsed: GenerateQuizResult["tokensUsed"];
}> {
  const client = getAnthropicClient();
  const userMessage = buildUserMessage(input);
  const expectedCount = input.questionCount ?? 10;

  let lastErr: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: DEFAULT_MODEL_STR,
        max_tokens: 4000,
        system: [
          {
            type: "text",
            text: QUIZ_GENERATOR_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
      });

      const textBlock = response.content.find((b) => b.type === "text") as
        | { type: "text"; text: string }
        | undefined;
      if (!textBlock) {
        throw new Error("Claude response had no text block");
      }

      const cleaned = stripFences(textBlock.text);
      const parsed = JSON.parse(cleaned);
      const questions = validateQuestions(parsed, expectedCount);

      const u: any = response.usage || {};
      const tokensUsed = {
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheReads: u.cache_read_input_tokens ?? 0,
        cacheWrites: u.cache_creation_input_tokens ?? 0,
      };
      const cacheStatus = tokensUsed.cacheReads > 0 ? "✅ HIT" : tokensUsed.cacheWrites > 0 ? "🔵 WRITE" : "⚠️ MISS";
      console.log(
        `[QuizGen] 💾 Cache ${cacheStatus} | reads:${tokensUsed.cacheReads} writes:${tokensUsed.cacheWrites} input:${tokensUsed.input} output:${tokensUsed.output}`
      );

      return { questions, tokensUsed };
    } catch (err: any) {
      lastErr = err;
      if (!isRetryableError(err) || attempt === MAX_RETRIES) break;
      const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1), 8000);
      console.warn(`[QuizGen] Claude attempt ${attempt} failed (${err?.message}), retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastErr ?? new Error("Claude generation failed without error");
}

// ── OpenAI fallback ─────────────────────────────────────────────────────────

async function generateViaOpenAI(input: GenerateQuizInput): Promise<{
  questions: GeneratedQuestion[];
  tokensUsed: GenerateQuizResult["tokensUsed"];
}> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error("OpenAI fallback unavailable — OPENAI_API_KEY not set");
  }

  const userMessage = buildUserMessage(input);
  const expectedCount = input.questionCount ?? 10;

  const response = await client.chat.completions.create({
    model: OPENAI_FALLBACK_MODEL,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: QUIZ_GENERATOR_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("OpenAI response had no content");

  const parsed = JSON.parse(stripFences(text));
  const questions = validateQuestions(parsed, expectedCount);

  return {
    questions,
    tokensUsed: {
      input: response.usage?.prompt_tokens ?? 0,
      output: response.usage?.completion_tokens ?? 0,
      cacheReads: 0,
      cacheWrites: 0,
    },
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function generateQuiz(input: GenerateQuizInput): Promise<GenerateQuizResult> {
  const start = Date.now();
  const requestedCount = input.questionCount ?? 10;
  console.log(`[QuizGen] Generating quiz: topic="${input.topic}" band=${input.gradeBand} count=${requestedCount}`);

  try {
    const { questions, tokensUsed } = await generateViaClaude({ ...input, questionCount: requestedCount });
    const durationMs = Date.now() - start;
    console.log(`[QuizGen] ✅ Claude generated ${questions.length} questions in ${durationMs}ms`);
    return { questions, modelUsed: "claude", tokensUsed, durationMs };
  } catch (claudeErr: any) {
    console.warn(`[QuizGen] Claude failed (${claudeErr?.message}), trying OpenAI fallback`);
    try {
      const { questions, tokensUsed } = await generateViaOpenAI({ ...input, questionCount: requestedCount });
      const durationMs = Date.now() - start;
      console.log(`[QuizGen] ✅ OpenAI fallback generated ${questions.length} questions in ${durationMs}ms`);
      return { questions, modelUsed: "openai-fallback", tokensUsed, durationMs };
    } catch (openaiErr: any) {
      console.error(`[QuizGen] ❌ Both providers failed. Claude: ${claudeErr?.message}. OpenAI: ${openaiErr?.message}`);
      throw new Error(`Quiz generation failed: ${claudeErr?.message ?? "unknown"}`);
    }
  }
}
