/**
 * Unit tests for TTS Sanitization utilities
 * Run with: npx tsx server/utils/__tests__/tts-sanitizer.test.ts
 */

import { 
  sanitizeTtsText, 
  normalizeNumbersForTts, 
  stripMarkdown,
  filterAndCoalesceSentences,
  isOlderGradeBand
} from '../tts-sanitizer';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}`);
    console.log(`   Error: ${e instanceof Error ? e.message : e}`);
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected "${expected}" but got "${actual}"`);
      }
    },
    toContain(expected: string) {
      if (!String(actual).includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toMatch(expected: RegExp) {
      if (!expected.test(String(actual))) {
        throw new Error(`Expected "${actual}" to match ${expected}`);
      }
    },
    toEqual(expected: any) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    }
  };
}

console.log('\n=== isOlderGradeBand ===');
test('returns true for grade 6-8', () => {
  expect(isOlderGradeBand('6-8')).toBe(true);
});
test('returns true for grade 9-12', () => {
  expect(isOlderGradeBand('9-12')).toBe(true);
});
test('returns true for college', () => {
  expect(isOlderGradeBand('college')).toBe(true);
  expect(isOlderGradeBand('College/Adult')).toBe(true);
  expect(isOlderGradeBand('ADV')).toBe(true);
});
test('returns false for K-2 and 3-5', () => {
  expect(isOlderGradeBand('K-2')).toBe(false);
  expect(isOlderGradeBand('k-2')).toBe(false);
  expect(isOlderGradeBand('3-5')).toBe(false);
});
test('returns false for undefined', () => {
  expect(isOlderGradeBand(undefined)).toBe(false);
});

console.log('\n=== stripMarkdown ===');
test('removes bold markdown', () => {
  expect(stripMarkdown('This is **bold** text')).toBe('This is bold text');
  expect(stripMarkdown('**two** and a **half**')).toBe('two and a half');
});
test('removes italic markdown', () => {
  expect(stripMarkdown('This is *italic* text')).toBe('This is italic text');
  expect(stripMarkdown('_also italic_')).toBe('also italic');
});
test('removes inline code', () => {
  expect(stripMarkdown('Use `console.log()` to debug')).toBe('Use console.log() to debug');
});
test('removes markdown links', () => {
  expect(stripMarkdown('Visit [Google](https://google.com)')).toBe('Visit Google');
});
test('removes heading markers', () => {
  expect(stripMarkdown('# Heading\n## Subheading')).toBe('Heading\nSubheading');
});
test('removes stray markdown artifacts', () => {
  expect(stripMarkdown('half**')).toBe('half');
  expect(stripMarkdown('**test**')).toBe('test');
});

console.log('\n=== normalizeNumbersForTts ===');
test('converts simple decimals to words', () => {
  expect(normalizeNumbersForTts('2.5')).toBe('two point five');
  expect(normalizeNumbersForTts('5.5')).toBe('five point five');
  expect(normalizeNumbersForTts('0.5')).toBe('zero point five');
});
test('converts decimals in sentences', () => {
  const input = 'The distance is 2.5 million light years.';
  const output = normalizeNumbersForTts(input);
  expect(output).toContain('two point five');
});
test('converts large comma-separated numbers', () => {
  expect(normalizeNumbersForTts('2,500,000')).toBe('two point five million');
  expect(normalizeNumbersForTts('1,000,000')).toBe('one million');
  expect(normalizeNumbersForTts('5,000,000')).toBe('five million');
});
test('preserves non-number text', () => {
  expect(normalizeNumbersForTts('Hello world')).toBe('Hello world');
});

console.log('\n=== sanitizeTtsText ===');
test('does not modify text for K-2 grade', () => {
  const result = sanitizeTtsText('**bold** text', 'K-2');
  expect(result.sanitized).toBe('**bold** text');
  expect(result.wasModified).toBe(false);
});
test('does not modify text for 3-5 grade', () => {
  const result = sanitizeTtsText('**bold** text', '3-5');
  expect(result.sanitized).toBe('**bold** text');
  expect(result.wasModified).toBe(false);
});
test('sanitizes markdown for grade 6-8', () => {
  const result = sanitizeTtsText('The distance is **two** and a **half** million light years.', '6-8');
  expect(result.sanitized).toContain('two and a half');
  expect(result.wasModified).toBe(true);
});
test('sanitizes markdown for grade 9-12', () => {
  const result = sanitizeTtsText('This is **important**!', '9-12');
  expect(result.sanitized).toBe('This is important!');
  expect(result.wasModified).toBe(true);
});
test('sanitizes markdown for college', () => {
  const result = sanitizeTtsText('Let me explain **clearly**.', 'college');
  expect(result.sanitized).toBe('Let me explain clearly.');
  expect(result.wasModified).toBe(true);
});
test('normalizes numbers in text', () => {
  const result = sanitizeTtsText('Andromeda is 2.5 million light years away.', '6-8');
  expect(result.sanitized).toContain('two point five million');
});
test('handles combined markdown and numbers', () => {
  const input = 'Let me be very clear: The distance is **two** and a **half** million light years. Not five million.';
  const result = sanitizeTtsText(input, 'college');
  expect(result.sanitized).toContain('two and a half million');
  expect(result.wasModified).toBe(true);
});
test('skips and marks empty results', () => {
  const result = sanitizeTtsText('**', '6-8');
  expect(result.skipped).toBe(true);
});
test('normalizes whitespace and newlines', () => {
  const result = sanitizeTtsText('Line 1\n\nLine 2', '6-8');
  expect(result.sanitized).toBe('Line 1 Line 2');
});

console.log('\n=== filterAndCoalesceSentences ===');
test('filters empty sentences', () => {
  const result = filterAndCoalesceSentences(['Hello.', '', 'World!'], '6-8');
  expect(result.filtered).toEqual(['Hello.', 'World!']);
  expect(result.skipped).toBe(1);
});
test('coalesces short fragments', () => {
  const result = filterAndCoalesceSentences(['two', 'and', 'This is a complete sentence.'], '6-8');
  expect(result.filtered.length).toBeLessThan(3);
  expect(result.coalesced).toBeGreaterThan(0);
});
test('does not modify for K-2', () => {
  const sentences = ['**Bold**.', 'Normal.'];
  const result = filterAndCoalesceSentences(sentences, 'K-2');
  expect(result.filtered).toEqual(sentences);
  expect(result.skipped).toBe(0);
  expect(result.coalesced).toBe(0);
});

console.log('\n=== Regression: Number pronunciation ===');
test('2.5 should speak as "two point five", not "five"', () => {
  const result = sanitizeTtsText('Andromeda is 2.5 million light years away.', 'college');
  expect(result.sanitized).toMatch(/two point five/i);
});
test('2,500,000 should speak as "two point five million"', () => {
  const result = sanitizeTtsText('The distance is 2,500,000 light years.', '6-8');
  expect(result.sanitized).toMatch(/two point five million/i);
});
test('5.5 should speak as "five point five"', () => {
  const result = sanitizeTtsText('It is 5.5 million miles away.', '9-12');
  expect(result.sanitized).toMatch(/five point five/i);
});

console.log('\n=== Summary ===');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
