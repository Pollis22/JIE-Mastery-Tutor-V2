/**
 * Document Mention Guard Tests
 * Tests for the document acknowledgment policy enforcement
 * 
 * Run with: npx tsx server/services/__tests__/doc-mention-guard.test.ts
 */

import {
  didStudentAskAboutDocs,
  containsUnpromptedDocMention,
  filterDocMentions,
} from '../doc-mention-guard';

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
    toBeTrue() {
      if (actual !== true) {
        throw new Error(`Expected true but got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalse() {
      if (actual !== false) {
        throw new Error(`Expected false but got ${JSON.stringify(actual)}`);
      }
    },
    toContain(substring: string) {
      if (typeof actual !== 'string' || !actual.includes(substring)) {
        throw new Error(`Expected "${actual}" to contain "${substring}"`);
      }
    },
    toNotContain(substring: string) {
      if (typeof actual === 'string' && actual.includes(substring)) {
        throw new Error(`Expected "${actual}" to NOT contain "${substring}"`);
      }
    },
  };
}

console.log('\n🧪 Document Mention Guard Tests\n');
console.log('=' .repeat(60));

// Test Student Ask Detection
console.log('\n📝 Testing Student Document Request Detection:\n');

const studentAskedCases = [
  'what documents do you have?',
  'can you use my documents?',
  'use my pdf please',
  'search the uploaded file',
  'which documents are active?',
  'list my documents',
  'show me the files I uploaded',
  'can you see my document?',
  'use the uploaded materials',
  'what is in my documents?',
  'reference my uploaded file',
];

for (const input of studentAskedCases) {
  test(`Student DID ask: "${input}"`, () => {
    expect(didStudentAskAboutDocs(input)).toBeTrue();
  });
}

const studentDidNotAskCases = [
  'help me with math',
  'what is 2 plus 2?',
  'explain photosynthesis',
  'I need help with my homework',
  'can you help me study?',
  'what is the capital of France?',
];

for (const input of studentDidNotAskCases) {
  test(`Student did NOT ask: "${input}"`, () => {
    expect(didStudentAskAboutDocs(input)).toBeFalse();
  });
}

// Test Unprompted Doc Mention Detection
console.log('\n📝 Testing Unprompted Document Mention Detection:\n');

const violatingResponses = [
  "I see you uploaded a PDF document. Let me help you with it.",
  "I notice you have uploaded the following documents: math.pdf, science.docx",
  "You've uploaded 3 files that I can access.",
  "Looking at your uploaded materials, I can see...",
  "Based on your uploaded documents, I recommend...",
  "Here is a list of your documents: test.pdf, notes.txt",
  "You have 2 documents available for this session.",
  "I have access to the following documents you shared...",
];

for (const response of violatingResponses) {
  test(`Should detect violation: "${response.substring(0, 50)}..."`, () => {
    const result = containsUnpromptedDocMention(response);
    expect(result.hasViolation).toBeTrue();
  });
}

const allowedResponses = [
  "Hello! I'm ready to help you learn today. What would you like to work on?",
  "Great question! Let me explain photosynthesis.",
  "To solve this math problem, we need to first...",
  "That's correct! You're making great progress.",
  "According to the formula, we can calculate...",
];

for (const response of allowedResponses) {
  test(`Should NOT detect violation: "${response.substring(0, 50)}..."`, () => {
    const result = containsUnpromptedDocMention(response);
    expect(result.hasViolation).toBeFalse();
  });
}

// Test Document Acknowledgment Policy
console.log('\n📝 Testing Document Acknowledgment Policy:\n');

test('If user does not ask about docs, assistant MUST NOT enumerate documents', () => {
  const studentMessage = 'help me with my homework';
  const aiResponse = "I see you uploaded the following documents: homework.pdf, notes.docx. Let me help you with them.";
  
  const result = filterDocMentions(aiResponse, studentMessage);
  
  expect(result.wasFiltered).toBeTrue();
  expect(result.filteredResponse.toLowerCase()).toNotContain('uploaded');
});

test('If user DOES ask about docs, assistant MAY list active filenames', () => {
  const studentMessage = 'what documents do you have?';
  const aiResponse = "I have access to the following documents: math.pdf, science.docx. Which one would you like me to use?";
  
  const result = filterDocMentions(aiResponse, studentMessage);
  
  // Should NOT be filtered because student asked
  expect(result.wasFiltered).toBeFalse();
});

test('Greeting should NOT mention documents', () => {
  const studentMessage = ''; // Session start
  const aiResponse = "Hi there! I can see you've brought some documents today. What would you like to work on?";
  
  const result = filterDocMentions(aiResponse, studentMessage);
  
  expect(result.wasFiltered).toBeTrue();
});

test('Normal tutoring response should NOT be filtered', () => {
  const studentMessage = 'what is 2 plus 2?';
  const aiResponse = "Great question! 2 plus 2 equals 4. Do you want me to explain why?";
  
  const result = filterDocMentions(aiResponse, studentMessage);
  
  expect(result.wasFiltered).toBeFalse();
  expect(result.filteredResponse).toBe(aiResponse); // Unchanged
});

// Test Live Session Scenarios
console.log('\n📝 Testing Live Session Document Upload Scenarios:\n');

test('Upload during session → doc shows as Uploaded (not mentioned by tutor)', () => {
  // Simulating: User uploads doc, tutor should NOT acknowledge it unprompted
  const studentMessage = 'can you help me with fractions?';
  const aiResponse = "I notice you just uploaded a new document called fractions.pdf. Let me take a look at it.";
  
  const result = filterDocMentions(aiResponse, studentMessage);
  
  expect(result.wasFiltered).toBeTrue();
});

test('User explicitly activates doc → tutor can reference when asked', () => {
  const studentMessage = 'use my fractions document please';
  const aiResponse = "I'll use your fractions.pdf document. Looking at page 1, I can see...";
  
  const result = filterDocMentions(aiResponse, studentMessage);
  
  // Should NOT filter because student explicitly asked to use document
  expect(result.wasFiltered).toBeFalse();
});

// SUMMARY
console.log('\n' + '=' .repeat(60));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All tests passed!\n');
}
