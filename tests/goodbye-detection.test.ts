/**
 * Goodbye Detection Tests
 * 
 * Tests for strict goodbye detection that only triggers session end
 * on explicit commands, not ambiguous farewells like "see you later"
 */

import { describe, it, expect } from '@jest/globals';

// Since the goodbye detection functions are not exported from custom-voice-ws,
// we replicate the logic here for testing purposes
// These must match the implementation in custom-voice-ws.ts

const STRICT_GOODBYE_PHRASES = [
  'goodbye', 'good bye', 'bye', 'bye bye', 'bye-bye',
  'end session', 'end the session', 'stop session', 'stop the session',
  'quit', 'exit',
  'adios', 'adiós', 'au revoir', 'ciao', 'sayonara', 'sayōnara',
  'auf wiedersehen', 'tschüss', 'tchüss', 'arrivederci',
  'zài jiàn', '再见', 'annyeong', '안녕'
];

const AMBIGUOUS_FAREWELL_PHRASES = [
  'see you', 'see ya', 'later', 'see you later', 'talk to you later',
  'catch you later', 'talk later', 'until next time', 'next time',
  'gotta go', 'got to go', 'have to go', 'need to go',
  'i have to leave', 'i need to leave', 'leaving now',
  'good night', 'goodnight', 'night night'
];

const FILLER_WORDS = new Set([
  'um', 'uh', 'ah', 'oh', 'hmm', 'hm', 'er', 'like', 'you know',
  'well', 'so', 'just', 'actually', 'basically', 'literally'
]);

function countNonFillerWords(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  return words.filter(word => !FILLER_WORDS.has(word)).length;
}

// Unicode-aware word boundary for accented characters (adiós, tschüss, etc.)
function createWordBoundaryRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s|[^\\p{L}])${escaped}(?:$|\\s|[^\\p{L}])`, 'iu');
}

// Simple word boundary for ASCII-only phrases
function createSimpleWordBoundaryRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

// Check if phrase contains non-ASCII characters
function hasNonAscii(text: string): boolean {
  return /[^\x00-\x7F]/.test(text);
}

function containsAmbiguousFarewell(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return AMBIGUOUS_FAREWELL_PHRASES.some(phrase => {
    const regex = hasNonAscii(phrase)
      ? createWordBoundaryRegex(phrase)
      : createSimpleWordBoundaryRegex(phrase);
    return regex.test(normalized);
  });
}

// CJK phrases that don't work with word boundaries
const CJK_PHRASES = ['再见', '안녕'];

function detectGoodbye(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  
  if (countNonFillerWords(normalized) < 1) {
    return false;
  }
  
  // Check CJK phrases with includes (word boundaries don't work for CJK)
  for (const phrase of CJK_PHRASES) {
    if (normalized.includes(phrase)) {
      return true;
    }
  }
  
  for (const phrase of STRICT_GOODBYE_PHRASES) {
    // Skip CJK phrases for regex check (handled above)
    if (CJK_PHRASES.includes(phrase)) continue;
    
    // Use Unicode-aware regex for accented phrases (adiós, tschüss, etc.)
    const regex = hasNonAscii(phrase)
      ? createWordBoundaryRegex(phrase)
      : createSimpleWordBoundaryRegex(phrase);
    if (regex.test(normalized)) {
      return true;
    }
  }
  
  return false;
}

describe('Goodbye Detection - Strict Mode', () => {
  describe('detectGoodbye - should END session', () => {
    it('should detect "goodbye"', () => {
      expect(detectGoodbye('goodbye')).toBe(true);
    });

    it('should detect "bye"', () => {
      expect(detectGoodbye('bye')).toBe(true);
    });

    it('should detect "bye bye"', () => {
      expect(detectGoodbye('bye bye')).toBe(true);
    });

    it('should detect "End the session"', () => {
      expect(detectGoodbye('End the session')).toBe(true);
    });

    it('should detect "end session" (case insensitive)', () => {
      expect(detectGoodbye('END SESSION')).toBe(true);
    });

    it('should detect "stop session"', () => {
      expect(detectGoodbye('stop session')).toBe(true);
    });

    it('should detect "stop the session"', () => {
      expect(detectGoodbye('stop the session')).toBe(true);
    });

    it('should detect "quit"', () => {
      expect(detectGoodbye('quit')).toBe(true);
    });

    it('should detect "exit"', () => {
      expect(detectGoodbye('exit')).toBe(true);
    });

    it('should detect "Goodbye!" with punctuation', () => {
      expect(detectGoodbye('Goodbye!')).toBe(true);
    });

    it('should detect "Ok bye" with prefix', () => {
      expect(detectGoodbye('Ok bye')).toBe(true);
    });

    it('should detect "Thanks, bye!" with thanks', () => {
      expect(detectGoodbye('Thanks, bye!')).toBe(true);
    });

    it('should detect multilingual "adios"', () => {
      expect(detectGoodbye('adios')).toBe(true);
    });

    it('should detect multilingual "adiós" with accent', () => {
      expect(detectGoodbye('adiós')).toBe(true);
    });

    it('should detect "adiós" in sentence', () => {
      expect(detectGoodbye('ok adiós')).toBe(true);
    });

    it('should detect multilingual "tschüss" with umlaut', () => {
      expect(detectGoodbye('tschüss')).toBe(true);
    });

    it('should detect multilingual "au revoir"', () => {
      expect(detectGoodbye('au revoir')).toBe(true);
    });

    it('should detect multilingual "ciao"', () => {
      expect(detectGoodbye('ciao')).toBe(true);
    });

    it('should detect multilingual "sayonara"', () => {
      expect(detectGoodbye('sayonara')).toBe(true);
    });

    it('should detect multilingual "再见"', () => {
      expect(detectGoodbye('再见')).toBe(true);
    });
  });

  describe('detectGoodbye - should NOT end session (regression tests)', () => {
    it('should NOT detect "Can\'t wait to see you two times." (REGRESSION)', () => {
      expect(detectGoodbye("Can't wait to see you two times.")).toBe(false);
    });

    it('should NOT detect "see you later"', () => {
      expect(detectGoodbye('see you later')).toBe(false);
    });

    it('should NOT detect "I\'ll see you tomorrow"', () => {
      expect(detectGoodbye("I'll see you tomorrow")).toBe(false);
    });

    it('should NOT detect "talk to you later"', () => {
      expect(detectGoodbye('talk to you later')).toBe(false);
    });

    it('should NOT detect "catch you later"', () => {
      expect(detectGoodbye('catch you later')).toBe(false);
    });

    it('should NOT detect "gotta go"', () => {
      expect(detectGoodbye('gotta go')).toBe(false);
    });

    it('should NOT detect "I have to go"', () => {
      expect(detectGoodbye('I have to go')).toBe(false);
    });

    it('should NOT detect "good night"', () => {
      expect(detectGoodbye('good night')).toBe(false);
    });

    it('should NOT detect "until next time"', () => {
      expect(detectGoodbye('until next time')).toBe(false);
    });

    it('should NOT detect normal sentences with "bye" embedded', () => {
      expect(detectGoodbye('I went by the store yesterday')).toBe(false);
    });

    it('should NOT detect "see you" in longer sentence', () => {
      expect(detectGoodbye('I hope to see you at the game tomorrow')).toBe(false);
    });

    it('should NOT detect "later" in normal context', () => {
      expect(detectGoodbye('I will do that later after lunch')).toBe(false);
    });

    it('should NOT detect filler-only input', () => {
      expect(detectGoodbye('um uh well')).toBe(false);
    });

    it('should NOT detect empty input', () => {
      expect(detectGoodbye('')).toBe(false);
    });

    it('should NOT detect whitespace-only input', () => {
      expect(detectGoodbye('   ')).toBe(false);
    });

    it('should NOT detect "This is amazing, I can\'t wait to see you two times!"', () => {
      expect(detectGoodbye("This is amazing, I can't wait to see you two times!")).toBe(false);
    });
  });

  describe('containsAmbiguousFarewell', () => {
    it('should detect "see you later" as ambiguous', () => {
      expect(containsAmbiguousFarewell('see you later')).toBe(true);
    });

    it('should detect "talk to you later" as ambiguous', () => {
      expect(containsAmbiguousFarewell('talk to you later')).toBe(true);
    });

    it('should detect "gotta go" as ambiguous', () => {
      expect(containsAmbiguousFarewell('gotta go')).toBe(true);
    });

    it('should detect "good night" as ambiguous', () => {
      expect(containsAmbiguousFarewell('good night')).toBe(true);
    });

    it('should NOT detect "goodbye" as ambiguous (it is explicit)', () => {
      expect(containsAmbiguousFarewell('goodbye')).toBe(false);
    });

    it('should NOT detect "bye" as ambiguous (it is explicit)', () => {
      expect(containsAmbiguousFarewell('bye')).toBe(false);
    });
  });

  describe('countNonFillerWords', () => {
    it('should count words correctly', () => {
      expect(countNonFillerWords('hello world')).toBe(2);
    });

    it('should exclude filler words', () => {
      expect(countNonFillerWords('um well hello')).toBe(1);
    });

    it('should return 0 for filler-only', () => {
      expect(countNonFillerWords('um uh ah')).toBe(0);
    });

    it('should return 0 for empty string', () => {
      expect(countNonFillerWords('')).toBe(0);
    });

    it('should handle mixed content', () => {
      // "well", "like" are fillers; "I", "think", "maybe", "yes" are not
      expect(countNonFillerWords('well I think like maybe yes')).toBe(4);
    });
  });

  describe('STRICT_GOODBYE_PHRASES constant', () => {
    it('should NOT include "see you"', () => {
      expect(STRICT_GOODBYE_PHRASES.includes('see you')).toBe(false);
    });

    it('should NOT include "later"', () => {
      expect(STRICT_GOODBYE_PHRASES.includes('later')).toBe(false);
    });

    it('should NOT include "talk to you later"', () => {
      expect(STRICT_GOODBYE_PHRASES.includes('talk to you later')).toBe(false);
    });

    it('should include "goodbye"', () => {
      expect(STRICT_GOODBYE_PHRASES.includes('goodbye')).toBe(true);
    });

    it('should include "bye"', () => {
      expect(STRICT_GOODBYE_PHRASES.includes('bye')).toBe(true);
    });

    it('should include "end session"', () => {
      expect(STRICT_GOODBYE_PHRASES.includes('end session')).toBe(true);
    });

    it('should include "quit"', () => {
      expect(STRICT_GOODBYE_PHRASES.includes('quit')).toBe(true);
    });
  });
});
