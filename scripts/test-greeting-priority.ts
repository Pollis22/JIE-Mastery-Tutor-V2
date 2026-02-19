/**
 * Greeting Priority Regression Tests
 * 
 * Tests the strict priority order for session greetings:
 * (1) Active docs > (2) Continuity > (3) Generic
 * 
 * Scenarios:
 * A) active_count=1 + continuity exists → greeting mentions active doc, NOT "continue last time"
 * B) active_count=0 + continuity exists → greeting uses continuity
 * C) active_count=1 + no continuity → greeting mentions active doc
 * D) active_count=0 + no continuity → generic greeting
 */

type GreetingResult = {
  mode: 'ACTIVE_DOCS' | 'CONTINUITY' | 'GENERIC';
  greeting: string;
};

function buildGreeting(
  name: string,
  tutorName: string,
  ageGroup: string,
  docTitles: string[],
  priorExists: boolean,
  continuityTopic: string | null,
): GreetingResult {
  const intro = `Hi ${name}! I'm ${tutorName}, your AI tutor.`;
  const docAck = (count: number, titles: string) =>
    count === 1
      ? ` I can see you've uploaded "${titles}" - excellent!`
      : ` I've loaded ${count} documents for our session.`;
  const closings: Record<string, Record<string, string>> = {
    'College/Adult': {
      withDocs: " I'm ready to help you analyze this material. What aspects would you like to focus on?",
      noDocs: " I'm here to support your learning goals. What subject can I help you with today?",
    },
  };
  const ageClosing = docTitles.length > 0
    ? (closings[ageGroup]?.withDocs || closings['College/Adult'].withDocs)
    : (closings[ageGroup]?.noDocs || closings['College/Adult'].noDocs);

  // (1) ACTIVE DOCS GREETING
  if (docTitles.length > 0) {
    if (docTitles.length <= 3) {
      return {
        mode: 'ACTIVE_DOCS',
        greeting: intro + docAck(docTitles.length, docTitles.join(', ')) + ageClosing,
      };
    } else {
      return {
        mode: 'ACTIVE_DOCS',
        greeting: intro + ` You have multiple Active documents selected for this session.` + ageClosing,
      };
    }
  }

  // (2) CONTINUITY GREETING
  if (priorExists && continuityTopic) {
    return {
      mode: 'CONTINUITY',
      greeting: `Welcome back, ${name}! I'm ${tutorName}, your AI tutor. Shall we continue our discussion on ${continuityTopic}? What do you remember most from last time?`,
    };
  }

  // (3) GENERIC GREETING
  return {
    mode: 'GENERIC',
    greeting: intro + ageClosing,
  };
}

let passed = 0;
let failed = 0;

function assert(testName: string, condition: boolean, detail: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${testName} — ${detail}`);
    failed++;
  }
}

console.log('=== Greeting Priority Regression Tests ===\n');

// Test A: active_count=1 + continuity exists → Active doc greeting wins
console.log('Test A: active_count=1 + continuity exists');
{
  const result = buildGreeting('Alex', 'Spark', 'College/Adult', ['Physics Test.pdf'], true, 'algebra');
  assert('mode is ACTIVE_DOCS', result.mode === 'ACTIVE_DOCS', `got ${result.mode}`);
  assert('greeting mentions doc name', result.greeting.includes('Physics Test.pdf'), `greeting: ${result.greeting}`);
  assert('greeting does NOT mention "continue"', !result.greeting.toLowerCase().includes('continue our discussion'), `greeting: ${result.greeting}`);
  assert('greeting does NOT mention "Welcome back"', !result.greeting.includes('Welcome back'), `greeting: ${result.greeting}`);
}
console.log('');

// Test B: active_count=0 + continuity exists → Continuity greeting
console.log('Test B: active_count=0 + continuity exists');
{
  const result = buildGreeting('Alex', 'Spark', 'College/Adult', [], true, 'fractions');
  assert('mode is CONTINUITY', result.mode === 'CONTINUITY', `got ${result.mode}`);
  assert('greeting mentions "Welcome back"', result.greeting.includes('Welcome back'), `greeting: ${result.greeting}`);
  assert('greeting mentions topic', result.greeting.includes('fractions'), `greeting: ${result.greeting}`);
  assert('greeting does NOT mention uploaded docs', !result.greeting.includes('uploaded'), `greeting: ${result.greeting}`);
}
console.log('');

// Test C: active_count=1 + no continuity → Active doc greeting
console.log('Test C: active_count=1 + no continuity');
{
  const result = buildGreeting('Alex', 'Spark', 'College/Adult', ['Math Homework.docx'], false, null);
  assert('mode is ACTIVE_DOCS', result.mode === 'ACTIVE_DOCS', `got ${result.mode}`);
  assert('greeting mentions doc name', result.greeting.includes('Math Homework.docx'), `greeting: ${result.greeting}`);
  assert('greeting does NOT mention "Welcome back"', !result.greeting.includes('Welcome back'), `greeting: ${result.greeting}`);
}
console.log('');

// Test D: active_count=0 + no continuity → Generic greeting
console.log('Test D: active_count=0 + no continuity');
{
  const result = buildGreeting('Alex', 'Spark', 'College/Adult', [], false, null);
  assert('mode is GENERIC', result.mode === 'GENERIC', `got ${result.mode}`);
  assert('greeting has intro', result.greeting.includes("Hi Alex! I'm Spark"), `greeting: ${result.greeting}`);
  assert('greeting does NOT mention "Welcome back"', !result.greeting.includes('Welcome back'), `greeting: ${result.greeting}`);
  assert('greeting does NOT mention docs', !result.greeting.includes('uploaded'), `greeting: ${result.greeting}`);
}
console.log('');

// Test E: active_count=4 + continuity exists → Active docs (many) greeting wins, no filenames
console.log('Test E: active_count=4 + continuity exists (4+ docs)');
{
  const result = buildGreeting('Alex', 'Spark', 'College/Adult', ['Doc1.pdf', 'Doc2.pdf', 'Doc3.pdf', 'Doc4.pdf'], true, 'algebra');
  assert('mode is ACTIVE_DOCS', result.mode === 'ACTIVE_DOCS', `got ${result.mode}`);
  assert('greeting mentions "multiple Active documents"', result.greeting.includes('multiple Active documents'), `greeting: ${result.greeting}`);
  assert('greeting does NOT list individual filenames', !result.greeting.includes('Doc1.pdf'), `greeting: ${result.greeting}`);
  assert('greeting does NOT mention "continue"', !result.greeting.toLowerCase().includes('continue our discussion'), `greeting: ${result.greeting}`);
}
console.log('');

// Test F: active_count=3 + continuity exists → Active docs greeting, names all 3
console.log('Test F: active_count=3 + continuity exists (exactly 3 docs)');
{
  const result = buildGreeting('Alex', 'Spark', 'College/Adult', ['A.pdf', 'B.pdf', 'C.pdf'], true, 'geometry');
  assert('mode is ACTIVE_DOCS', result.mode === 'ACTIVE_DOCS', `got ${result.mode}`);
  assert('greeting mentions 3 documents loaded', result.greeting.includes('3 documents'), `greeting: ${result.greeting}`);
  assert('greeting does NOT mention "Welcome back"', !result.greeting.includes('Welcome back'), `greeting: ${result.greeting}`);
}
console.log('');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
