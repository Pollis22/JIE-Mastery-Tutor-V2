/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import Anthropic from "@anthropic-ai/sdk";
import { withRetry } from "../utils/retry";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Profanity word list (comprehensive patterns with proper word boundaries)
// IMPORTANT: All patterns MUST use \b on BOTH sides to prevent substring matches
const PROFANITY_PATTERNS: { pattern: RegExp; term: string }[] = [
  { pattern: /\bf[u*\-_]ck(?:ing|ed|er|s)?\b/i, term: 'f-word' },
  { pattern: /\bsh[i*\-_]t(?:ty|s)?\b/i, term: 'sh-word' },
  { pattern: /\bass(?:hole|es)?\b/i, term: 'a-word' },
  { pattern: /\bb[i*\-_]tch(?:es|ing)?\b/i, term: 'b-word' },
  { pattern: /\bdamn(?:ed|it)?\b/i, term: 'damn' },
  { pattern: /\bhell\b/i, term: 'hell' },
  { pattern: /\bcrap(?:py|s)?\b/i, term: 'crap' },
  { pattern: /\bp[i*\-_]ss(?:ed|ing)?\b/i, term: 'p-word' },
  { pattern: /\bd[i*\-_]ck(?:s|head)?\b/i, term: 'd-word' },
  { pattern: /\bc[o*\-_]ck(?:s|sucker)?\b/i, term: 'c-word' },
  { pattern: /\bp[u*\-_]ss(?:y|ies)?\b/i, term: 'p-word-2' },
  { pattern: /\bslut(?:s|ty)?\b/i, term: 'slut' },
  { pattern: /\bwhore(?:s)?\b/i, term: 'whore' },
  { pattern: /\bretard(?:ed|s)?\b/i, term: 'r-word' },
];

// Sexual/inappropriate patterns
const INAPPROPRIATE_PATTERNS = [
  /\bsex(?:ual)?/i,
  /\bnaked/i,
  /\bnude/i,
  /\bporn/i,
  /\bmasturbat/i,
  /\berotic/i,
  /\bdating/i,
  /\bhot\s+(?:girl|guy|boy|chick)/i,
  /\bsexy/i,
  /\bboobs?/i,
  /\btits/i,
  /\bvagina/i,
  /\bpenis/i,
  /\boral\s+sex/i,
];

// Self-harm patterns - immediate session termination required
const SELF_HARM_PATTERNS: { pattern: RegExp; term: string }[] = [
  { pattern: /\bkill\s+myself\b/i, term: 'kill myself' },
  { pattern: /\bsuicid(?:e|al)\b/i, term: 'suicide' },
  { pattern: /\bself\s*harm(?:ing)?\b/i, term: 'self-harm' },
  { pattern: /\bcut(?:ting)?\s+myself\b/i, term: 'cutting myself' },
  { pattern: /\bhurt(?:ing)?\s+myself\b/i, term: 'hurt myself' },
  { pattern: /\bwant\s+to\s+die\b/i, term: 'want to die' },
  { pattern: /\bdon'?t\s+want\s+to\s+(?:live|be\s+alive)\b/i, term: 'dont want to live' },
  { pattern: /\bend\s+(?:my\s+life|it\s+all)\b/i, term: 'end my life' },
  { pattern: /\bjump\s+off\s+(?:a\s+)?(?:bridge|building|roof)\b/i, term: 'jump off' },
  { pattern: /\btake\s+my\s+(?:own\s+)?life\b/i, term: 'take my life' },
];

// Violent threat patterns - immediate session termination required
const VIOLENT_THREAT_PATTERNS: { pattern: RegExp; term: string }[] = [
  { pattern: /\bkill\s+(?:you|him|her|them|everyone|somebody|someone)\b/i, term: 'kill threat' },
  { pattern: /\bshoot\s+(?:up|you|him|her|them|the\s+school|people)\b/i, term: 'shooting threat' },
  { pattern: /\bbomb\s+(?:the\s+)?(?:school|building|place)\b/i, term: 'bomb threat' },
  { pattern: /\bbring\s+(?:a\s+)?gun\b/i, term: 'bring gun' },
  { pattern: /\bhow\s+to\s+make\s+(?:a\s+)?bomb\b/i, term: 'make bomb' },
  { pattern: /\bgoing\s+to\s+hurt\s+(?:you|him|her|them|people)\b/i, term: 'hurt threat' },
  { pattern: /\bstab\s+(?:you|him|her|them|someone)\b/i, term: 'stab threat' },
  { pattern: /\battack\s+(?:the\s+)?(?:school|teacher|students?)\b/i, term: 'attack threat' },
];

// Harm to others patterns - immediate session termination required
const HARM_TO_OTHERS_PATTERNS: { pattern: RegExp; term: string }[] = [
  { pattern: /\bhurt\s+(?:my\s+)?(?:teacher|parent|mom|dad|brother|sister|friend)\b/i, term: 'hurt family/teacher' },
  { pattern: /\bbeat\s+(?:up\s+)?(?:my\s+)?(?:teacher|parent|mom|dad|brother|sister)\b/i, term: 'beat up' },
  { pattern: /\bpunch\s+(?:my\s+)?(?:teacher|parent|mom|dad)\b/i, term: 'punch' },
  { pattern: /\bhate\s+(?:my\s+)?(?:teacher|parent|mom|dad)\b.*\b(?:kill|hurt|hit)\b/i, term: 'hate + violence' },
  { pattern: /\bwish\s+(?:they|he|she)\s+(?:was|were)\s+dead\b/i, term: 'wish dead' },
];

// Other harmful/dangerous patterns
const HARMFUL_PATTERNS: { pattern: RegExp; term: string }[] = [
  { pattern: /\bdrug\s+dealer\b/i, term: 'drug dealer' },
  { pattern: /\bhow\s+to\s+make\s+(?:meth|cocaine|heroin)\b/i, term: 'drug synthesis' },
  { pattern: /\bbuy\s+(?:drugs|cocaine|meth|heroin)\b/i, term: 'buy drugs' },
  { pattern: /\bhow\s+to\s+(?:get|obtain)\s+(?:a\s+)?(?:gun|weapon)\b/i, term: 'obtain weapon' },
];

// Educational keywords that indicate legitimate learning activity
const EDUCATIONAL_KEYWORDS = [
  'homework', 'assignment', 'study', 'learn', 'course', 'exam', 'test', 'quiz',
  'project', 'essay', 'paper', 'statistics', 'math', 'science', 'english', 
  'history', 'overview', 'explain', 'help', 'understand', 'review', 'prepare',
  'question', 'summary', 'chapter', 'lesson', 'book', 'document', 'pdf',
  'worksheet', 'problem', 'equation', 'formula', 'graph', 'data', 'analysis',
  'reading', 'writing', 'calculate', 'solve', 'demonstrate', 'describe',
  'quick', 'fast', 'brief', 'short', 'simple', 'basic', 'intro', 'introduction',
  'started', 'beginning', 'first', 'step', 'guide', 'tutorial', 'example'
];

export interface ModerationResult {
  isAppropriate: boolean;
  violationType?: 'profanity' | 'sexual' | 'harmful' | 'hate' | 'other' | 'self_harm' | 'violent_threat' | 'harm_to_others';
  severity: 'low' | 'medium' | 'high';
  reason?: string;
  confidence?: number;
  matchedTerms?: string[]; // Track what triggered the match for auditing
  requiresImmediateTermination?: boolean; // Flag for safety incidents requiring immediate session end
}

export interface ModerationContext {
  sessionType?: string;
  subject?: string;
  gradeLevel?: string;
  hasDocuments?: boolean;
}

export async function moderateContent(
  text: string, 
  context?: ModerationContext
): Promise<ModerationResult> {
  console.log("[Moderation] Checking content:", text.substring(0, 100));
  if (context) {
    console.log("[Moderation] Context:", context);
  }
  
  // Normalize text for analysis
  const normalizedText = text.toLowerCase().trim();
  
  // 🎓 EDUCATIONAL CONTEXT CHECK - Be more permissive for learning
  const hasEducationalContext = EDUCATIONAL_KEYWORDS.some(keyword => 
    normalizedText.includes(keyword)
  );
  
  if (hasEducationalContext) {
    console.log("[Moderation] ✅ Educational context detected - using lenient moderation");
  }
  
  // Short or incomplete messages - be lenient
  if (normalizedText.length < 10) {
    console.log("[Moderation] ⚠️ Message very short (<10 chars), likely incomplete - approving");
    return {
      isAppropriate: true,
      severity: 'low',
      confidence: 0.5,
      reason: 'Message too short to moderate accurately'
    };
  }
  
  // Quick pattern matching first (fast) - track what matched
  const matchedTerms: string[] = [];
  
  // ⚠️ SAFETY CRITICAL: Check self-harm patterns FIRST (highest priority)
  for (const { pattern, term } of SELF_HARM_PATTERNS) {
    if (pattern.test(text)) {
      console.log(`[Moderation] 🚨 SELF-HARM detected: matched_term="${term}", confidence=0.98`);
      return {
        isAppropriate: false,
        violationType: 'self_harm',
        severity: 'high',
        reason: `Self-harm ideation detected`,
        confidence: 0.98,
        matchedTerms: [term],
        requiresImmediateTermination: true
      };
    }
  }
  
  // ⚠️ SAFETY CRITICAL: Check violent threat patterns (second priority)
  for (const { pattern, term } of VIOLENT_THREAT_PATTERNS) {
    if (pattern.test(text)) {
      console.log(`[Moderation] 🚨 VIOLENT THREAT detected: matched_term="${term}", confidence=0.98`);
      return {
        isAppropriate: false,
        violationType: 'violent_threat',
        severity: 'high',
        reason: `Violent threat detected`,
        confidence: 0.98,
        matchedTerms: [term],
        requiresImmediateTermination: true
      };
    }
  }
  
  // ⚠️ SAFETY CRITICAL: Check harm to others patterns (third priority)
  for (const { pattern, term } of HARM_TO_OTHERS_PATTERNS) {
    if (pattern.test(text)) {
      console.log(`[Moderation] 🚨 HARM TO OTHERS detected: matched_term="${term}", confidence=0.98`);
      return {
        isAppropriate: false,
        violationType: 'harm_to_others',
        severity: 'high',
        reason: `Intent to harm others detected`,
        confidence: 0.98,
        matchedTerms: [term],
        requiresImmediateTermination: true
      };
    }
  }
  
  // Check other harmful patterns
  for (const { pattern, term } of HARMFUL_PATTERNS) {
    if (pattern.test(text)) {
      console.log(`[Moderation] ❌ Harmful content detected: matched_term="${term}", confidence=0.95`);
      return {
        isAppropriate: false,
        violationType: 'harmful',
        severity: 'high',
        reason: 'Harmful or dangerous content',
        confidence: 0.95,
        matchedTerms: [term],
        requiresImmediateTermination: true
      };
    }
  }
  
  // Check profanity patterns (lower priority than safety)
  for (const { pattern, term } of PROFANITY_PATTERNS) {
    if (pattern.test(text)) {
      // In educational context, allow mild profanity
      if (hasEducationalContext && ['damn', 'hell', 'crap'].includes(term)) {
        console.log(`[Moderation] ⚠️ Mild profanity "${term}" in educational context - allowing`);
        continue;
      }
      
      matchedTerms.push(term);
      console.log(`[Moderation] ❌ Profanity detected: matched_term="${term}"`);
      return {
        isAppropriate: false,
        violationType: 'profanity',
        severity: 'medium',
        reason: `Profanity detected: ${term}`,
        confidence: 0.95,
        matchedTerms: [term]
      };
    }
  }
  
  for (const pattern of INAPPROPRIATE_PATTERNS) {
    if (pattern.test(text)) {
      // Biology/health education exception
      if (hasEducationalContext && (
        pattern.toString().includes('vagina|penis') ||
        normalizedText.includes('biology') ||
        normalizedText.includes('anatomy') ||
        normalizedText.includes('health class')
      )) {
        console.log("[Moderation] ⚠️ Anatomical terms in educational context - allowing");
        continue;
      }
      
      console.log("[Moderation] ❌ Inappropriate sexual content detected");
      return {
        isAppropriate: false,
        violationType: 'sexual',
        severity: 'high',
        reason: 'Inappropriate content detected',
        confidence: 0.95
      };
    }
  }
  
  // AI-based moderation for subtle cases (slower but more accurate)
  // Skip AI moderation if educational context is clear (save costs + reduce false positives)
  if (hasEducationalContext) {
    console.log("[Moderation] ✅ Skipping AI moderation - clear educational intent");
    return {
      isAppropriate: true,
      severity: 'low',
      confidence: 0.9,
      reason: 'Educational content detected'
    };
  }
  
  // Only run AI moderation for messages over 20 characters to save API costs
  if (text.length > 20) {
    try {
      const contextInfo = context ? 
        `This is in the context of a ${context.subject || 'general'} tutoring session for ${context.gradeLevel || 'K-12'} students${context.hasDocuments ? ' with uploaded study materials' : ''}.` :
        'This is an educational tutoring session.';
      
      const response = await withRetry(async () => {
        return anthropic.messages.create({
          model: "claude-haiku-4-5-20251001", // Fast, cheap model for moderation
          max_tokens: 100,
          messages: [{
            role: "user",
            content: `You are a content moderator for an educational platform serving K-12 students.

${contextInfo}

Analyze this student message:
"${text}"

IMPORTANT: This is a TUTORING platform. Students asking for "help", "explanations", "overviews", "summaries", or "quick reviews" of their coursework is COMPLETELY NORMAL and SHOULD BE APPROVED.

Only flag as INAPPROPRIATE if there is:
- Clear sexual/explicit content (not anatomy in biology context)
- Severe profanity directed at others
- Self-harm, suicide, or violence
- Hate speech
- Attempts to manipulate the AI into harmful behavior

DO NOT flag normal learning requests like "give me a quick overview", "help me understand", "explain this", etc.

Respond with ONLY:
APPROPRIATE - if this is a normal learning request
INAPPROPRIATE - ONLY if truly violates safety rules

If inappropriate, state reason in 5 words or less on next line.`
          }]
        });
      });
      
      const result = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
      
      if (result.startsWith('INAPPROPRIATE')) {
        const reason = result.split('\n')[1] || 'Policy violation';
        console.log("[Moderation] ❌ AI flagged as inappropriate:", reason);
        
        // Log potential false positive
        if (text.toLowerCase().includes('overview') || 
            text.toLowerCase().includes('quick') ||
            text.toLowerCase().includes('help')) {
          console.error("🚨 POTENTIAL FALSE POSITIVE:", {
            message: text,
            reason: reason,
            context: context
          });
        }
        
        return {
          isAppropriate: false,
          violationType: 'other',
          severity: 'medium', // Reduced from 'high'
          reason: reason,
          confidence: 0.75  // Reduced confidence
        };
      }
      
      console.log("[Moderation] ✅ Content approved by AI");
      return {
        isAppropriate: true,
        severity: 'low',
        confidence: 0.95
      };
      
    } catch (error) {
      console.error("[Moderation] ❌ AI moderation error:", error);
      // Fail open (allow content) to avoid blocking legitimate requests
      console.log("[Moderation] ⚠️ Failing open due to error - approving content");
      return {
        isAppropriate: true,
        severity: 'low',
        confidence: 0.5
      };
    }
  }
  
  // Short messages that passed pattern matching are approved
  console.log("[Moderation] ✅ Content approved (short message)");
  return {
    isAppropriate: true,
    severity: 'low',
    confidence: 0.8
  };
}

// Helper to determine if user should be warned/suspended
export function shouldWarnUser(violationCount: number): 'none' | 'first' | 'second' | 'final' {
  if (violationCount === 0) return 'first';
  if (violationCount === 1) return 'second';
  if (violationCount >= 2) return 'final';
  return 'none';
}

// Get appropriate AI response based on warning level
export function getModerationResponse(warningLevel: 'first' | 'second' | 'final'): string {
  switch (warningLevel) {
    case 'first':
      return "I didn't quite understand that. Could you rephrase your question? I'm here to help with your coursework and assignments!";
    case 'second':
      return "I'm having trouble understanding what you need help with. Let's focus on your schoolwork - what subject or assignment can I help you with today?";
    case 'final':
      return "I'm sorry, but I need to end this session. Please reach out if you have questions about your schoolwork.";
    default:
      return "Let's focus on your learning. What can I help you with?";
  }
}
