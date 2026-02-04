/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * TTS Text Sanitization for Grade 6+ Students
 * Fixes: markdown formatting, number pronunciation, empty sentence fragments
 */

// Grade bands that use the sanitizer
const OLDER_GRADE_BANDS = ['6-8', '9-12', 'college', 'College/Adult', 'college/adult', 'ADV'];

/**
 * Check if a grade band is 6+ (uses TTS sanitization)
 */
export function isOlderGradeBand(gradeBand: string | undefined): boolean {
  if (!gradeBand) return false;
  return OLDER_GRADE_BANDS.includes(gradeBand);
}

/**
 * Convert decimal numbers to spoken form
 * "2.5" → "two point five"
 * "5.5" → "five point five"
 */
function convertDecimalToWords(match: string): string {
  const [wholePart, decimalPart] = match.split('.');
  
  if (!decimalPart) return match;
  
  const wholeWord = numberToWords(parseInt(wholePart, 10));
  
  // Special case for .5 (half)
  if (decimalPart === '5') {
    return `${wholeWord} point five`;
  }
  
  // Convert each decimal digit to words
  const decimalWords = decimalPart.split('').map(d => {
    return singleDigitToWord(parseInt(d, 10));
  }).join(' ');
  
  return `${wholeWord} point ${decimalWords}`;
}

/**
 * Convert a single digit to word
 */
function singleDigitToWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  return words[n] || String(n);
}

/**
 * Convert number to words (0-999)
 */
function numberToWords(n: number): string {
  if (n < 0) return 'negative ' + numberToWords(-n);
  
  const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
                'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 
                'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  
  if (n < 20) return ones[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t] : `${tens[t]}-${ones[o]}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return r === 0 ? `${ones[h]} hundred` : `${ones[h]} hundred ${numberToWords(r)}`;
  }
  
  // For larger numbers, just return the string representation
  return String(n);
}

/**
 * Convert large comma-separated numbers to words
 * "2,500,000" → "two point five million"
 * "1,000,000" → "one million"
 */
function convertLargeNumberToWords(match: string): string {
  // Remove commas to get the actual number
  const numStr = match.replace(/,/g, '');
  const num = parseInt(numStr, 10);
  
  if (isNaN(num)) return match;
  
  // Handle common large number patterns
  if (num >= 1_000_000_000) {
    const billions = num / 1_000_000_000;
    if (Number.isInteger(billions)) {
      return `${numberToWords(billions)} billion`;
    }
    return `${formatDecimalAsWords(billions)} billion`;
  }
  
  if (num >= 1_000_000) {
    const millions = num / 1_000_000;
    if (Number.isInteger(millions)) {
      return `${numberToWords(millions as number)} million`;
    }
    return `${formatDecimalAsWords(millions)} million`;
  }
  
  if (num >= 1_000) {
    const thousands = num / 1_000;
    if (Number.isInteger(thousands)) {
      return `${numberToWords(thousands as number)} thousand`;
    }
    return `${formatDecimalAsWords(thousands)} thousand`;
  }
  
  return numberToWords(num);
}

/**
 * Format a decimal number as words
 */
function formatDecimalAsWords(n: number): string {
  const whole = Math.floor(n);
  const decimal = n - whole;
  
  // Common fractions
  if (Math.abs(decimal - 0.5) < 0.01) {
    return `${numberToWords(whole)} point five`;
  }
  if (Math.abs(decimal - 0.25) < 0.01) {
    return `${numberToWords(whole)} point two five`;
  }
  if (Math.abs(decimal - 0.75) < 0.01) {
    return `${numberToWords(whole)} point seven five`;
  }
  
  // General case: just use the decimal digits
  const decimalStr = n.toFixed(2).split('.')[1];
  const decimalWords = decimalStr.split('').filter(d => d !== '0' || decimalStr.indexOf(d) === 0)
    .map(d => singleDigitToWord(parseInt(d, 10))).join(' ');
  
  return `${numberToWords(whole)} point ${decimalWords}`;
}

/**
 * Normalize numbers for TTS
 * Converts decimals and large numbers to spoken forms
 */
export function normalizeNumbersForTts(text: string): string {
  let result = text;
  
  // 1. Convert decimal numbers (e.g., "2.5" → "two point five")
  // Match patterns like 2.5, 10.25, 0.5, etc.
  result = result.replace(/\b(\d+)\.(\d+)\b/g, (match) => {
    return convertDecimalToWords(match);
  });
  
  // 2. Convert large comma-separated numbers (e.g., "2,500,000" → "two point five million")
  result = result.replace(/\b\d{1,3}(,\d{3})+\b/g, (match) => {
    return convertLargeNumberToWords(match);
  });
  
  return result;
}

/**
 * Strip all markdown formatting from text
 */
export function stripMarkdown(text: string): string {
  let result = text;
  
  // Remove bold/italic markers: **text**, __text__, *text*, _text_
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');
  result = result.replace(/\*([^*]+)\*/g, '$1');
  result = result.replace(/_([^_]+)_/g, '$1');
  
  // Remove inline code: `code`
  result = result.replace(/`([^`]+)`/g, '$1');
  
  // Remove code blocks: ```code```
  result = result.replace(/```[\s\S]*?```/g, '');
  
  // Remove markdown links: [text](url)
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // Remove heading markers: # ## ### etc.
  result = result.replace(/^#{1,6}\s*/gm, '');
  
  // Remove bullet prefixes: - * + at start of lines
  result = result.replace(/^[\-\*\+]\s+/gm, '');
  
  // Remove stray markdown artifacts: **., half**, etc.
  result = result.replace(/\*\*\.?/g, '');
  result = result.replace(/\.?\*\*/g, '');
  
  // Remove repeated periods (from streaming artifacts)
  result = result.replace(/\.{2,}/g, '.');
  
  return result;
}

/**
 * Normalize whitespace
 */
function normalizeWhitespace(text: string): string {
  // Replace newlines with spaces
  let result = text.replace(/\n+/g, ' ');
  
  // Collapse multiple spaces
  result = result.replace(/\s{2,}/g, ' ');
  
  return result.trim();
}

/**
 * Main sanitization function for TTS text
 * Used ONLY for grade bands 6-8, 9-12, and College/Adult
 */
export function sanitizeTtsText(raw: string, gradeBand: string): { 
  sanitized: string; 
  wasModified: boolean;
  skipped: boolean;
  skipReason?: string;
} {
  const logPrefix = '[VOICE_TTS_SANITIZE_6PLUS]';
  
  // Check if this grade band should use sanitization
  if (!isOlderGradeBand(gradeBand)) {
    return { sanitized: raw, wasModified: false, skipped: false };
  }
  
  // Step 1: Strip markdown
  let result = stripMarkdown(raw);
  
  // Step 2: Normalize whitespace
  result = normalizeWhitespace(result);
  
  // Step 3: Normalize numbers for pronunciation
  result = normalizeNumbersForTts(result);
  
  // Step 4: Final cleanup - remove any remaining artifacts
  result = result.replace(/\s+([.,!?])/g, '$1'); // Fix spacing before punctuation
  result = result.replace(/([.,!?]){2,}/g, '$1'); // Remove duplicate punctuation
  
  const wasModified = result !== raw;
  
  // Logging
  if (wasModified) {
    console.log(`${logPrefix} 📝 Raw: "${raw.substring(0, 80)}..."`);
    console.log(`${logPrefix} ✅ Sanitized: "${result.substring(0, 80)}..."`);
  }
  
  // Check for empty result
  if (!result.trim()) {
    console.log(`${logPrefix} ⚠️ Empty after sanitization, raw was: "${raw.substring(0, 50)}"`);
    return { 
      sanitized: '', 
      wasModified: true, 
      skipped: true, 
      skipReason: 'empty_after_sanitization' 
    };
  }
  
  return { sanitized: result, wasModified, skipped: false };
}

/**
 * Filter and coalesce sentence fragments for TTS
 * Returns sentences ready for ElevenLabs (non-empty, properly formatted)
 */
export function filterAndCoalesceSentences(
  sentences: string[], 
  gradeBand: string
): { 
  filtered: string[]; 
  skipped: number; 
  coalesced: number;
} {
  const logPrefix = '[VOICE_TTS_SANITIZE_6PLUS]';
  const MIN_SENTENCE_LENGTH = 4; // Minimum chars for a valid sentence
  
  if (!isOlderGradeBand(gradeBand)) {
    return { filtered: sentences, skipped: 0, coalesced: 0 };
  }
  
  const filtered: string[] = [];
  let skipped = 0;
  let coalesced = 0;
  let pendingFragment = '';
  
  for (const sentence of sentences) {
    // Sanitize each sentence
    const { sanitized, skipped: wasSkipped, skipReason } = sanitizeTtsText(sentence, gradeBand);
    
    if (wasSkipped) {
      console.log(`${logPrefix} ⛔ Skipped sentence: "${sentence.substring(0, 30)}..." (${skipReason})`);
      skipped++;
      continue;
    }
    
    // Check if it's a fragment (too short)
    if (sanitized.length < MIN_SENTENCE_LENGTH) {
      // Accumulate as pending fragment
      pendingFragment += (pendingFragment ? ' ' : '') + sanitized;
      console.log(`${logPrefix} 🔗 Fragment buffered: "${sanitized}" → pending: "${pendingFragment}"`);
      continue;
    }
    
    // If we have a pending fragment, prepend it to current sentence
    if (pendingFragment) {
      const combined = pendingFragment + ' ' + sanitized;
      console.log(`${logPrefix} 🔗 Coalesced: "${pendingFragment}" + "${sanitized.substring(0, 20)}..."`);
      filtered.push(combined);
      pendingFragment = '';
      coalesced++;
    } else {
      filtered.push(sanitized);
    }
  }
  
  // Handle any remaining fragment
  if (pendingFragment && pendingFragment.length >= MIN_SENTENCE_LENGTH) {
    filtered.push(pendingFragment);
  } else if (pendingFragment) {
    console.log(`${logPrefix} ⛔ Final fragment discarded: "${pendingFragment}" (too short)`);
    skipped++;
  }
  
  // Final validation: ensure no sentence is empty or starts with newline
  const validated = filtered.filter(s => {
    const trimmed = s.trim();
    if (!trimmed) {
      console.log(`${logPrefix} ⛔ Filtered empty sentence`);
      skipped++;
      return false;
    }
    if (trimmed.startsWith('\n')) {
      console.log(`${logPrefix} ⚠️ Sentence starts with newline, trimming: "${trimmed.substring(0, 30)}..."`);
      return true; // Will be fixed below
    }
    return true;
  }).map(s => s.trim());
  
  console.log(`${logPrefix} 📊 Results: ${validated.length} sentences, ${skipped} skipped, ${coalesced} coalesced`);
  
  return { filtered: validated, skipped, coalesced };
}
