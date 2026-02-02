/**
 * Safety Detection Service Tests
 * Tests for profanity detection with proper word-boundary matching
 * 
 * Root cause of original bug: substring matching on "ass" triggered false positives
 * for words like "class", "assignment", "pass", etc.
 * 
 * Fix: Use word-boundary regex matching instead of substring .includes()
 * 
 * Run with: npx tsx server/services/__tests__/safety-detection-service.test.ts
 */

import { detectSafetyIssues } from '../safety-detection-service';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error: any) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got ${JSON.stringify(actual)}`);
      }
    },
    toContain(substring: string) {
      if (typeof actual !== 'string' || !actual.includes(substring)) {
        throw new Error(`Expected "${actual}" to contain "${substring}"`);
      }
    },
  };
}

console.log('\n🧪 Safety Detection Service Tests\n');
console.log('=' .repeat(60));

// FALSE POSITIVES - These should NOT trigger
console.log('\n📝 Testing FALSE POSITIVES (should NOT trigger):\n');

const falsePositiveTests = [
  'operations within class b',
  'ClassB requirements',
  'Class B airspace operations',
  'assignment due tomorrow',
  'I need help with my assignment',
  'pass the test',
  'Did I pass?',
  'passing grade',
  'class discussion',
  'classes start Monday',
  'classroom activities',
  'compass directions',
  'bypass the issue',
  'assessment results',
  'mass and weight in physics',
  'brass instruments',
  'grass is green',
  'bass guitar lesson',
  'assume the position is correct',
  'assistant professor',
  'classic literature',
];

for (const input of falsePositiveTests) {
  test(`"${input}" should NOT trigger`, () => {
    const result = detectSafetyIssues(input, '9-12');
    expect(result.detected).toBe(false);
    expect(result.flagType).toBeNull();
  });
}

// TRUE POSITIVES - These SHOULD trigger
console.log('\n📝 Testing TRUE POSITIVES (SHOULD trigger):\n');

const truePositiveTests = [
  { input: "you're an ass", expectedFlag: 'LANGUAGE_CONCERN' },
  { input: "this is shit", expectedFlag: 'SEVERE_LANGUAGE' },
  { input: "fuck that", expectedFlag: 'SEVERE_LANGUAGE' },
  { input: "damn it", expectedFlag: 'LANGUAGE_CONCERN' },
  { input: "go to hell", expectedFlag: 'LANGUAGE_CONCERN' },
];

for (const { input, expectedFlag } of truePositiveTests) {
  test(`"${input}" SHOULD trigger as ${expectedFlag}`, () => {
    const result = detectSafetyIssues(input, '9-12');
    expect(result.detected).toBe(true);
    expect(result.flagType).toBe(expectedFlag);
  });
}

// AVIATION TERMS
console.log('\n✈️  Testing AVIATION TERMS (should NOT trigger):\n');

const aviationTerms = [
  'operations within class a',
  'class b airspace',
  'entering class c',
  'class d tower',
  'class e uncontrolled',
  'class g airspace below',
];

for (const input of aviationTerms) {
  test(`Aviation: "${input}" should NOT trigger`, () => {
    const result = detectSafetyIssues(input, 'college');
    expect(result.detected).toBe(false);
    expect(result.flagType).toBeNull();
  });
}

// SAFETY CRITICAL
console.log('\n🚨 Testing SAFETY CRITICAL (MUST trigger):\n');

test('Self-harm detection', () => {
  const result = detectSafetyIssues('I want to hurt myself', 'college');
  expect(result.detected).toBe(true);
  expect(result.flagType).toBe('SELF_HARM_CONCERN');
});

test('Violence detection', () => {
  const result = detectSafetyIssues('I want to shoot someone', '9-12');
  expect(result.detected).toBe(true);
  expect(result.flagType).toBe('VIOLENCE_CONCERN');
});

// SUMMARY
console.log('\n' + '=' .repeat(60));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All tests passed!\n');
}
