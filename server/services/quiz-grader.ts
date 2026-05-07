/**
 * State University AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 *
 * Quiz Grader — voice transcript → A/B/C/D extraction
 *
 * Two-tier parser:
 *   1. Regex tier (fast, free) — handles ~80%+ of common patterns
 *   2. Claude fallback — for ambiguous/content-match cases
 *
 * Always returns parse_method so we can measure regex hit rate after
 * first 50 quizzes and tune accordingly.
 *
 * TODO(v2): Add unit test suite — 30-row table of (transcript, expected option).
 */

import Anthropic from "@anthropic-ai/sdk";

// <important_do_not_delete>
const DEFAULT_MODEL_STR = "claude-sonnet-4-6";
// </important_do_not_delete>

let anthropic: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type Option = "A" | "B" | "C" | "D";
export type ParseMethod = "regex" | "claude_fallback" | "ambiguous" | "timeout" | "skip";

export interface GraderInput {
  transcript: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  /** When true, skip Claude fallback even if regex fails (e.g. cost-cap mode). */
  regexOnly?: boolean;
}

export interface GraderResult {
  parsedOption: Option | null;
  confidence: number;       // 0.00–1.00
  parseMethod: ParseMethod;
  reasoning?: string;       // diagnostic, useful for logs
}

// ── Skip / give-up phrases ──────────────────────────────────────────────────

const SKIP_PATTERNS = [
  /\bskip\b/i,
  /\bnext\b/i,
  /\bpass\b/i,
  /\bi\s*don'?t\s*know\b/i,
  /\bno\s*idea\b/i,
  /\bdunno\b/i,
];

function detectSkip(transcript: string): boolean {
  return SKIP_PATTERNS.some((re) => re.test(transcript));
}

// ── Tier 1: Regex parser ────────────────────────────────────────────────────

interface RegexResult {
  option: Option | null;
  confidence: number;
  reason: string;
}

const ORDINAL_MAP: Record<string, Option> = {
  first: "A", "1st": "A", one: "A",
  second: "B", "2nd": "B", two: "B",
  third: "C", "3rd": "C", three: "C",
  fourth: "D", "4th": "D", four: "D", last: "D",
};

const PHONETIC_MAP: Record<string, Option> = {
  // Common STT mishearings of A/B/C/D
  alpha: "A", apple: "A", able: "A", "ay": "A", "eh": "A",
  bravo: "B", "bee": "B", "be": "B",
  charlie: "C", "see": "C", "sea": "C",
  delta: "D", "dee": "D", "the": "D",
};

function parseWithRegex(transcript: string): RegexResult {
  const t = transcript.trim();
  const lower = t.toLowerCase();

  // Pattern 1: Lone letter — "B", "B.", "b!"  (highest confidence)
  const lone = t.match(/^\s*([A-Da-d])\s*[.!?]?\s*$/);
  if (lone) {
    return { option: lone[1].toUpperCase() as Option, confidence: 0.99, reason: "lone-letter" };
  }

  // Pattern 2: "answer is B" / "I'll go with C" / "the answer's D" / "letter A"
  const explicit = lower.match(/\b(?:answer(?:'?s)?(?:\s+is)?|going\s+with|going\s+for|i'?ll\s+(?:go|pick|choose)\s+(?:with\s+)?|i\s+(?:pick|choose|select)|letter|option)\s+([a-d])\b/);
  if (explicit) {
    return { option: explicit[1].toUpperCase() as Option, confidence: 0.95, reason: "explicit-phrase" };
  }

  // Pattern 3: "B" prefixed with thinking sounds — "um, B" / "hmm... C" / "uh D"
  const thinking = lower.match(/^\s*(?:um+|uh+|hmm+|well|so|like)[,\s.]+\s*([a-d])\s*[.!?]?\s*$/);
  if (thinking) {
    return { option: thinking[1].toUpperCase() as Option, confidence: 0.92, reason: "thinking-prefix" };
  }

  // Pattern 4: Trailing letter — "I think it's B" / "maybe C"
  const trailing = lower.match(/\b(?:think(?:\s+it'?s)?|maybe|probably|believe|guess(?:\s+it'?s)?|gonna\s+say|got\s+to\s+be|has\s+to\s+be|must\s+be|it'?s)\s+([a-d])\b/);
  if (trailing) {
    return { option: trailing[1].toUpperCase() as Option, confidence: 0.88, reason: "trailing-letter" };
  }

  // Pattern 5: Ordinal — "the third one" / "second option" / "the first"
  const ordinal = lower.match(/\b(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|last)\s*(?:one|option|answer|choice)?\b/);
  if (ordinal) {
    const opt = ORDINAL_MAP[ordinal[1].toLowerCase()];
    if (opt) return { option: opt, confidence: 0.85, reason: "ordinal" };
  }

  // Pattern 6: NATO/phonetic — "Bravo" / "Charlie"
  const phonetic = lower.match(/\b(alpha|bravo|charlie|delta)\b/);
  if (phonetic) {
    return { option: PHONETIC_MAP[phonetic[1]], confidence: 0.90, reason: "nato-phonetic" };
  }

  // Pattern 7: Multiple letters in transcript — ambiguous, fall through
  const allLetters = lower.match(/\b([a-d])\b/g);
  if (allLetters && allLetters.length === 1) {
    return { option: allLetters[0].toUpperCase() as Option, confidence: 0.75, reason: "single-letter-in-context" };
  }
  if (allLetters && allLetters.length > 1) {
    return { option: null, confidence: 0, reason: "multiple-letters-ambiguous" };
  }

  // Pattern 8: Phonetic lookup for words that often replace single letters
  for (const word of lower.split(/\s+/)) {
    if (PHONETIC_MAP[word]) {
      return { option: PHONETIC_MAP[word], confidence: 0.65, reason: `phonetic-word:${word}` };
    }
  }

  return { option: null, confidence: 0, reason: "no-match" };
}

// ── Tier 2: Claude fallback ─────────────────────────────────────────────────

async function parseWithClaude(input: GraderInput): Promise<RegexResult> {
  const client = getAnthropicClient();

  const prompt = `A student answered a multiple-choice question by voice. Determine which option (A, B, C, or D) they chose. The transcript may match an option's content rather than the letter.

Options:
A. ${input.optionA}
B. ${input.optionB}
C. ${input.optionC}
D. ${input.optionD}

Student transcript: "${input.transcript}"

Reply with ONLY one of: A, B, C, D, or NONE
Reply NONE if you genuinely cannot tell which option they picked.`;

  try {
    const response = await client.messages.create({
      model: DEFAULT_MODEL_STR,
      max_tokens: 5,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (response.content.find((b) => b.type === "text") as any)?.text ?? "";
    const match = text.trim().match(/^([A-D]|NONE)/i);
    if (!match) {
      return { option: null, confidence: 0, reason: "claude-malformed" };
    }
    const verdict = match[1].toUpperCase();
    if (verdict === "NONE") {
      return { option: null, confidence: 0, reason: "claude-none" };
    }
    return { option: verdict as Option, confidence: 0.80, reason: "claude-content-match" };
  } catch (err: any) {
    console.warn(`[QuizGrader] Claude fallback errored: ${err?.message}`);
    return { option: null, confidence: 0, reason: "claude-error" };
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function gradeAttempt(input: GraderInput): Promise<GraderResult> {
  const transcript = input.transcript.trim();

  // Empty transcript → ambiguous
  if (!transcript) {
    return { parsedOption: null, confidence: 0, parseMethod: "ambiguous", reasoning: "empty-transcript" };
  }

  // Skip / give-up
  if (detectSkip(transcript)) {
    return { parsedOption: null, confidence: 1.0, parseMethod: "skip", reasoning: "skip-detected" };
  }

  // Tier 1: regex
  const regex = parseWithRegex(transcript);
  if (regex.option && regex.confidence >= 0.85) {
    return {
      parsedOption: regex.option,
      confidence: regex.confidence,
      parseMethod: "regex",
      reasoning: regex.reason,
    };
  }

  // Skip Claude if explicitly disabled
  if (input.regexOnly) {
    return {
      parsedOption: regex.option,
      confidence: regex.confidence,
      parseMethod: regex.option ? "regex" : "ambiguous",
      reasoning: `regex-only:${regex.reason}`,
    };
  }

  // Tier 2: Claude fallback for low-confidence or no-match regex results
  const claude = await parseWithClaude(input);
  if (claude.option) {
    return {
      parsedOption: claude.option,
      confidence: claude.confidence,
      parseMethod: "claude_fallback",
      reasoning: `regex:${regex.reason}|claude:${claude.reason}`,
    };
  }

  // Both tiers failed
  return {
    parsedOption: null,
    confidence: 0,
    parseMethod: "ambiguous",
    reasoning: `regex:${regex.reason}|claude:${claude.reason}`,
  };
}

// ── Synchronous helper for unit tests / regex-only callers ──────────────────

export function gradeAttemptSync(input: Omit<GraderInput, "regexOnly">): GraderResult {
  const transcript = input.transcript.trim();
  if (!transcript) {
    return { parsedOption: null, confidence: 0, parseMethod: "ambiguous", reasoning: "empty-transcript" };
  }
  if (detectSkip(transcript)) {
    return { parsedOption: null, confidence: 1.0, parseMethod: "skip", reasoning: "skip-detected" };
  }
  const regex = parseWithRegex(transcript);
  return {
    parsedOption: regex.option,
    confidence: regex.confidence,
    parseMethod: regex.option ? "regex" : "ambiguous",
    reasoning: regex.reason,
  };
}
