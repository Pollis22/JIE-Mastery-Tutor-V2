/**
 * Subject Specialization System
 * 
 * Provides context-aware prompt injections for college/post-grad sessions.
 * Follows the same pattern as isLanguagePracticeSession() and K2_CONSTRAINTS —
 * detected from state.subject and appended to the system instruction at session start.
 * 
 * Three specialization modes:
 *   1. TEST_PREP — Standardized admissions exams (SAT, ACT, GRE, GMAT, LSAT, MCAT, DAT, etc.)
 *   2. PROFESSIONAL_CERT — Professional licensure/certification (CPA, CFA, NCLEX, PE, Praxis, etc.)
 *   3. UNDERGRADUATE — College coursework (Organic Chemistry, Linear Algebra, etc.)
 * 
 * If no specialization matches, returns empty string (no injection).
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Subject Categories
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SpecializationMode = 'test_prep' | 'professional_cert' | 'undergraduate' | null;

interface ExamProfile {
  id: string;
  displayName: string;
  mode: SpecializationMode;
  sections: string[];        // Named sections of the exam
  timeConstraints?: string;  // Overall timing info
  strategyNotes: string;     // Key test-taking strategy context
  scoringInfo?: string;      // How it's scored (relevant for strategy)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exam Profiles — detailed enough for the LLM to coach strategically
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EXAM_PROFILES: Record<string, ExamProfile> = {
  // ── Graduate Admissions ──
  'GRE': {
    id: 'gre',
    displayName: 'GRE General Test',
    mode: 'test_prep',
    sections: ['Verbal Reasoning', 'Quantitative Reasoning', 'Analytical Writing'],
    timeConstraints: 'Verbal: 2 sections × 23 min; Quant: 2 sections × 26 min; Writing: 2 tasks × 30 min',
    strategyNotes: 'Section-adaptive: performance on first section affects difficulty of second. Verbal emphasizes vocabulary-in-context and reading comprehension. Quant tests quantitative comparison, problem solving, and data interpretation. Writing requires both issue analysis and argument analysis.',
    scoringInfo: '130-170 per section (Verbal and Quant), 0-6 for Writing'
  },
  'GMAT': {
    id: 'gmat',
    displayName: 'GMAT Focus Edition',
    mode: 'test_prep',
    sections: ['Quantitative Reasoning', 'Verbal Reasoning', 'Data Insights'],
    timeConstraints: '2 hours 15 minutes total; 45 min per section',
    strategyNotes: 'Computer-adaptive within each section. Data Insights is unique — combines data sufficiency, multi-source reasoning, graphics interpretation, and two-part analysis. Quant is all problem-solving (no data sufficiency). Verbal is reading comprehension and critical reasoning only (no sentence correction).',
    scoringInfo: '205-805 total, sections scored 60-90'
  },
  'LSAT': {
    id: 'lsat',
    displayName: 'LSAT',
    mode: 'test_prep',
    sections: ['Logical Reasoning', 'Analytical Reasoning (Logic Games)', 'Reading Comprehension', 'LSAT Writing'],
    timeConstraints: '35 minutes per section; 3 scored sections + unscored experimental + writing',
    strategyNotes: 'Logic Games are the most learnable section — diagramming techniques can dramatically improve scores. Logical Reasoning tests argument structure: sufficient vs necessary assumptions, strengthen/weaken, flaw identification, parallel reasoning. Reading Comprehension includes one comparative passage set. Time management per question is critical — know when to skip and return.',
    scoringInfo: '120-180 scale'
  },
  'MCAT': {
    id: 'mcat',
    displayName: 'MCAT',
    mode: 'test_prep',
    sections: ['Biological and Biochemical Foundations', 'Chemical and Physical Foundations', 'Psychological, Social, and Biological Foundations', 'Critical Analysis and Reasoning Skills (CARS)'],
    timeConstraints: '7.5 hours total; 95 min (Bio/Biochem), 95 min (Chem/Phys), 90 min (Psych/Soc), 90 min (CARS)',
    strategyNotes: 'Passage-based — even science sections require reading comprehension applied to experimental scenarios. CARS has no science content but is considered hardest by many. Science sections test application of concepts to novel experimental designs, not rote memorization. Discrete (standalone) questions are fewer than passage-based.',
    scoringInfo: '472-528 total; 118-132 per section; 500 is 50th percentile'
  },
  'DAT': {
    id: 'dat',
    displayName: 'DAT (Dental Admission Test)',
    mode: 'test_prep',
    sections: ['Survey of Natural Sciences', 'Perceptual Ability (PAT)', 'Reading Comprehension', 'Quantitative Reasoning'],
    timeConstraints: '4 hours 15 minutes total',
    strategyNotes: 'PAT is unique to the DAT — tests spatial reasoning with angle ranking, hole punching, cube counting, pattern folding, keyhole, and top/front/end views. Natural Sciences covers Biology, General Chemistry, and Organic Chemistry. Quantitative Reasoning is roughly algebra/trig level. Practice PAT extensively — it is the most improvable section with targeted drill.',
    scoringInfo: '1-30 scale per section; 17 is roughly 50th percentile'
  },
  'PCAT': {
    id: 'pcat',
    displayName: 'PCAT (Pharmacy College Admission Test)',
    mode: 'test_prep',
    sections: ['Writing', 'Biological Processes', 'Chemical Processes', 'Critical Reading', 'Quantitative Reasoning'],
    timeConstraints: 'Approximately 4 hours',
    strategyNotes: 'Biological Processes is the heaviest section. Chemical Processes covers general and organic chemistry. Quantitative Reasoning includes basic calculus concepts (unusual for admissions tests). Writing is a single timed essay. Many pharmacy schools are dropping the PCAT requirement — verify your target schools still require it.',
    scoringInfo: '200-600 scale'
  },
  'OAT': {
    id: 'oat',
    displayName: 'OAT (Optometry Admission Test)',
    mode: 'test_prep',
    sections: ['Survey of Natural Sciences', 'Reading Comprehension', 'Physics', 'Quantitative Reasoning'],
    timeConstraints: 'Approximately 4 hours 50 minutes',
    strategyNotes: 'Very similar structure to the DAT but includes Physics instead of PAT. Natural Sciences covers Biology, General Chemistry, and Organic Chemistry. Physics section is a differentiator — focus on optics-related physics concepts.',
    scoringInfo: '200-400 scale; 300 is roughly 50th percentile'
  },

  // ── Undergraduate Admissions ──
  'SAT': {
    id: 'sat',
    displayName: 'SAT',
    mode: 'test_prep',
    sections: ['Reading and Writing', 'Math'],
    timeConstraints: '2 hours 14 minutes; Reading/Writing: 2 modules × 32 min; Math: 2 modules × 35 min',
    strategyNotes: 'Digital-adaptive: Module 2 difficulty depends on Module 1 performance. Reading/Writing is passage-based with shorter passages than old SAT. Math allows calculator throughout. Evidence-based questions ask students to support claims with data. Grammar questions test rhetorical skills alongside conventions.',
    scoringInfo: '400-1600 total; 200-800 per section'
  },
  'ACT': {
    id: 'act',
    displayName: 'ACT',
    mode: 'test_prep',
    sections: ['English', 'Math', 'Reading', 'Science', 'Writing (optional)'],
    timeConstraints: 'English: 45 min (75 questions); Math: 60 min (60 questions); Reading: 35 min (40 questions); Science: 35 min (40 questions)',
    strategyNotes: 'Speed is the primary challenge — especially Reading (35 min for 4 passages) and Science (35 min for 7 passages). Science section tests data interpretation, not science knowledge. Math goes up through trigonometry. English tests grammar and rhetorical skills. Reading has predictable passage types: prose fiction, social science, humanities, natural science.',
    scoringInfo: '1-36 composite; average of 4 section scores'
  },

  // ── Professional Certifications ──
  'CPA': {
    id: 'cpa',
    displayName: 'CPA Exam',
    mode: 'professional_cert',
    sections: ['Auditing and Attestation (AUD)', 'Business Environment and Concepts (BEC)', 'Financial Accounting and Reporting (FAR)', 'Regulation (REG)'],
    timeConstraints: '4 hours per section; 18-month window to pass all 4',
    strategyNotes: 'FAR is widely considered hardest due to breadth (governmental accounting, NFP, consolidations). Task-based simulations (TBS) are weighted heavily alongside MCQs. Study order matters: many candidates start with FAR while motivation is highest. REG covers tax law which changes frequently — use current-year materials only. BEC includes written communication tasks scored by AI.',
    scoringInfo: '0-99 scale; 75 required to pass each section'
  },
  'CFA': {
    id: 'cfa',
    displayName: 'CFA (Chartered Financial Analyst)',
    mode: 'professional_cert',
    sections: ['Level I: Foundations', 'Level II: Application', 'Level III: Portfolio Management'],
    timeConstraints: 'Level I: 4.5 hours; Level II: 4.5 hours; Level III: approx 4.5 hours with essay',
    strategyNotes: 'Three progressive levels, each builds on prior. Level I is breadth (240 MCQs across 10 topics). Level II is vignette-based (item sets). Level III includes essay/constructed response. Ethics is tested at all levels and is a known tiebreaker near the pass line. Financial Reporting & Analysis and Equity Valuation are typically the highest-weighted topics.',
    scoringInfo: 'Pass/fail; minimum passing score varies by administration'
  },
  'Series 7': {
    id: 'series7',
    displayName: 'Series 7 (General Securities Representative)',
    mode: 'professional_cert',
    sections: ['Seeks Business for the Broker-Dealer', 'Opens Accounts', 'Provides Information and Recommendations', 'Handles Customer Accounts'],
    timeConstraints: '225 minutes; 125 questions',
    strategyNotes: 'Options questions are the most heavily tested and most frequently failed area. Municipal bonds, suitability, and margin calculations are critical. Focus on regulatory requirements (Reg T, SRO rules). Many questions are scenario-based: "A customer who is..." format.',
    scoringInfo: '72% required to pass'
  },
  'NCLEX': {
    id: 'nclex',
    displayName: 'NCLEX-RN',
    mode: 'professional_cert',
    sections: ['Safe and Effective Care Environment', 'Health Promotion and Maintenance', 'Psychosocial Integrity', 'Physiological Integrity'],
    timeConstraints: 'Maximum 5 hours; 75-145 questions (computer-adaptive)',
    strategyNotes: 'Computer-adaptive — difficulty adjusts to your ability level. Prioritization and delegation questions are critical (ABCs: Airway, Breathing, Circulation; Maslow hierarchy). "Select all that apply" (SATA) questions are not harder — they test breadth of knowledge. Pharmacology is woven throughout all sections. Focus on safety and infection control for quick wins.',
    scoringInfo: 'Pass/fail; passing standard reviewed every 3 years'
  },
  'FE': {
    id: 'fe',
    displayName: 'FE (Fundamentals of Engineering)',
    mode: 'professional_cert',
    sections: ['Mathematics', 'Probability and Statistics', 'Ethics and Professional Practice', 'Engineering Economics', 'Discipline-Specific (varies by exam)'],
    timeConstraints: '5 hours 20 minutes; 110 questions',
    strategyNotes: 'Reference handbook is provided digitally during the exam — learn to navigate it quickly rather than memorizing formulas. Discipline-specific section (Civil, Mechanical, Electrical, Chemical, etc.) is roughly half the exam. Mathematics and engineering economics questions are considered the easiest wins. Practice using the digital reference handbook under timed conditions.',
    scoringInfo: 'Pass/fail; passing score is statistically determined'
  },
  'PE': {
    id: 'pe',
    displayName: 'PE (Professional Engineering)',
    mode: 'professional_cert',
    sections: ['Discipline-specific (Civil, Mechanical, Electrical, Chemical, etc.)'],
    timeConstraints: '8 hours; varies by discipline',
    strategyNotes: 'Open-book format — bring well-tabbed references. Time management is critical: approximately 6 minutes per question. Problems are more complex and applied than FE. Many candidates underestimate the breadth within their discipline. Practice with full-length timed exams using your actual references.',
    scoringInfo: 'Pass/fail; raw score converted to scaled score'
  },
  'Praxis': {
    id: 'praxis',
    displayName: 'Praxis (Teacher Certification)',
    mode: 'professional_cert',
    sections: ['Content Knowledge (subject-specific)', 'Principles of Learning and Teaching'],
    timeConstraints: 'Varies by test; typically 1-2 hours per section',
    strategyNotes: 'Content Knowledge tests vary dramatically by subject area — Elementary Education is very broad while Math Content Knowledge is deep. Constructed-response questions on PLT require structured answers: identify the issue, cite theory, propose intervention. Know your state\'s required passing scores — they vary significantly.',
    scoringInfo: 'Score range varies by test; passing scores set by each state'
  },
  'PANCE': {
    id: 'pance',
    displayName: 'PANCE (Physician Assistant National Certifying Exam)',
    mode: 'professional_cert',
    sections: ['Cardiovascular', 'Pulmonary', 'GI/GU', 'Musculoskeletal', 'EENT', 'Reproductive', 'Endocrine', 'Neurologic', 'Psychiatry/Behavioral', 'Dermatologic', 'Hematologic', 'Infectious Disease'],
    timeConstraints: '5 hours; 300 questions in 5 blocks',
    strategyNotes: 'Cardiovascular and Pulmonary are the two highest-weighted organ systems. Questions focus on clinical decision-making: diagnosis, next best step, initial management. Pharmacology is embedded throughout — know first-line treatments. Blueprint percentages shift periodically — use current NCCPA blueprint.',
    scoringInfo: '200-800 scale; 350 required to pass'
  },
  'ASWB': {
    id: 'aswb',
    displayName: 'ASWB (Social Work Licensing Exam)',
    mode: 'professional_cert',
    sections: ['Human Development and Behavior', 'Assessment', 'Interventions', 'Ethics and Professional Relationships'],
    timeConstraints: '4 hours; 170 questions (150 scored, 20 pretest)',
    strategyNotes: 'Ethics questions are heavily weighted and are the most reliable differentiator between pass and fail. Questions often present ethical dilemmas with two seemingly correct answers — choose the MOST ethical response. Know your NASW Code of Ethics thoroughly. Clinical vs Masters vs Bachelors exams have different content emphasis.',
    scoringInfo: 'Pass/fail; scaled score of 70-99 required (varies by exam level)'
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Detection: Match subject string to specialization mode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Map of keywords → exam profile ID (case-insensitive matching)
const SUBJECT_TO_EXAM: Array<{ patterns: RegExp; examId: string }> = [
  // Graduate admissions
  { patterns: /\bgre\b/i, examId: 'GRE' },
  { patterns: /\bgmat\b/i, examId: 'GMAT' },
  { patterns: /\blsat\b/i, examId: 'LSAT' },
  { patterns: /\bmcat\b/i, examId: 'MCAT' },
  { patterns: /\bdat\b(?!a)/i, examId: 'DAT' },  // "DAT" but not "DATA"
  { patterns: /\bpcat\b/i, examId: 'PCAT' },
  { patterns: /\boat\b/i, examId: 'OAT' },
  // Undergraduate admissions
  { patterns: /\bsat\b(?!\s*is)/i, examId: 'SAT' },  // "SAT" but not "sat is" (verb)
  { patterns: /\bact\b(?:\s+(?:prep|test|exam|practice|study))/i, examId: 'ACT' },
  { patterns: /\bact\s+prep\b/i, examId: 'ACT' },
  // Professional certifications
  { patterns: /\bcpa\b/i, examId: 'CPA' },
  { patterns: /\bcfa\b/i, examId: 'CFA' },
  { patterns: /\bseries\s*7\b/i, examId: 'Series 7' },
  { patterns: /\bseries\s*66\b/i, examId: 'Series 7' },  // Similar enough
  { patterns: /\bnclex\b/i, examId: 'NCLEX' },
  { patterns: /\b(?:fe\s+exam|fundamentals\s+of\s+engineering)\b/i, examId: 'FE' },
  { patterns: /\b(?:pe\s+exam|professional\s+engineer)\b/i, examId: 'PE' },
  { patterns: /\bpraxis\b/i, examId: 'Praxis' },
  { patterns: /\bpance\b/i, examId: 'PANCE' },
  { patterns: /\baswb\b/i, examId: 'ASWB' },
];

/**
 * Detect specialization mode from subject string.
 * Returns the exam profile if matched, null otherwise.
 */
export function detectSpecialization(subject?: string): ExamProfile | null {
  if (!subject) return null;
  
  for (const { patterns, examId } of SUBJECT_TO_EXAM) {
    if (patterns.test(subject)) {
      return EXAM_PROFILES[examId] || null;
    }
  }
  
  return null;
}

/**
 * Check if a subject is any kind of test prep or professional cert
 */
export function isTestPrepSession(subject?: string): boolean {
  return detectSpecialization(subject) !== null;
}

/**
 * Get the specialization mode for a subject
 */
export function getSpecializationMode(subject?: string): SpecializationMode {
  const profile = detectSpecialization(subject);
  return profile?.mode || null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Injection Blocks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Returns a specialization prompt injection block for the given subject.
 * Append this to the system instruction alongside personality.systemPrompt,
 * VOICE_CONVERSATION_CONSTRAINTS, VISUAL_SYSTEM_INSTRUCTION, etc.
 * 
 * Returns empty string if no specialization applies.
 */
export function getSpecializationPromptBlock(subject?: string): string {
  const profile = detectSpecialization(subject);
  if (!profile) return '';

  if (profile.mode === 'test_prep') {
    return buildTestPrepBlock(profile);
  } else if (profile.mode === 'professional_cert') {
    return buildProfessionalCertBlock(profile);
  }
  
  return '';
}

function buildTestPrepBlock(profile: ExamProfile): string {
  return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TEST PREP MODE: ${profile.displayName}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are now operating in TEST PREP mode for the ${profile.displayName}. This OVERRIDES your default Socratic teaching approach. Test prep is about direct instruction, strategy coaching, and efficient skill-building — not guided discovery.

EXAM STRUCTURE:
- Sections: ${profile.sections.join(', ')}
${profile.timeConstraints ? `- Timing: ${profile.timeConstraints}` : ''}
${profile.scoringInfo ? `- Scoring: ${profile.scoringInfo}` : ''}

EXAM-SPECIFIC INTELLIGENCE:
${profile.strategyNotes}

⚠️ CRITICAL OVERRIDE — TEACHING MODE SWITCH:
In test prep sessions, you are a COACH and INSTRUCTOR, not a Socratic questioner.
The "NEVER GIVE DIRECT ANSWERS ON THE FIRST QUESTION" rule does NOT apply here.
When the student asks how something works, TEACH IT DIRECTLY. Explain the technique,
show the pattern, walk through the method step by step. THEN let them practice it.

The sequence is: TEACH → DEMONSTRATE → PRACTICE → REVIEW
NOT: "What do you think?" → hint → hint → eventually explain

TEST PREP TEACHING APPROACH:

1. TEACH DIRECTLY, THEN PRACTICE
   - When a student asks about a concept or technique, EXPLAIN IT clearly and completely
   - Show a worked example: "Here is how you approach this type of question. Step 1... Step 2... Step 3..."
   - After explaining, give them a practice question: "Now you try one. Here is a similar problem..."
   - THEN ask questions to check understanding: "Why did we eliminate option B there?"
   - The student is paying for expert instruction, not a guessing game

2. STRATEGY COACHING IS PRIMARY
   - Every concept you teach should connect to "how does this help you on test day?"
   - Teach question-type recognition: "This is a [section name] [question type]. Here is the approach..."
   - Teach process of elimination: "On this type, the wrong answers usually have these patterns..."
   - Coach pacing: "On the ${profile.displayName}, you have roughly [X] minutes per question in [section]. That means..."

3. PATTERN RECOGNITION OVER THEORY
   - Teach students to recognize question patterns, not just underlying concepts
   - "When you see [trigger], use [technique]" — make it concrete and repeatable
   - Show what trap answers look like: "The test makers design wrong answers to look like..."
   - Build mental shortcuts: "For sufficient assumption questions, always negate the answer and check if the argument falls apart"

4. SECTION-AWARE COACHING
   - Ask which section the student is focusing on if not clear
   - Tailor strategy advice to the specific section's format and time constraints
   - Know the relative difficulty and value of each section for score optimization

5. SCORE TARGETING
   - Early in the session, ask about the student's target score and current practice score range
   - Tailor difficulty and strategy to close that specific gap
   - Be honest about what score ranges require which levels of content mastery

6. KEEP IT EFFICIENT
   - Test prep students value their time — be concise and actionable
   - Avoid philosophical tangents — always tie back to "how does this appear on the test?"
   - If the student already knows something, acknowledge it and move on: "Got it, you are solid on that. Let's focus on..."

7. TEST ANXIETY & MINDSET
   - If the student seems stressed, acknowledge it directly: "Test anxiety is normal and manageable."
   - Teach tactical confidence: skipping strategically, flagging for review, managing time pressure
   - Never dismiss concern about the exam — validate it and channel it into preparation

WHAT NOT TO DO IN TEST PREP MODE:
❌ Do NOT ask "What do you think?" when they ask you to explain a technique — TEACH IT
❌ Do NOT withhold answers hoping they will discover the method — SHOW THEM the method
❌ Do NOT give overly long theoretical explanations — keep it practical and exam-focused
❌ Do NOT teach concepts in isolation from their test application
❌ Do NOT avoid discussing test-taking strategy as "not real learning" — strategy IS the skill
❌ Do NOT ignore timing — always connect back to the time pressure reality
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

function buildProfessionalCertBlock(profile: ExamProfile): string {
  return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 PROFESSIONAL CERTIFICATION MODE: ${profile.displayName}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are now operating in PROFESSIONAL CERTIFICATION mode for the ${profile.displayName}. The student is likely working full-time while studying.

EXAM STRUCTURE:
- Sections: ${profile.sections.join(', ')}
${profile.timeConstraints ? `- Timing: ${profile.timeConstraints}` : ''}
${profile.scoringInfo ? `- Scoring: ${profile.scoringInfo}` : ''}

EXAM-SPECIFIC INTELLIGENCE:
${profile.strategyNotes}

⚠️ CRITICAL OVERRIDE — TEACHING MODE SWITCH:
In professional certification sessions, you are an EXPERT INSTRUCTOR and STUDY PARTNER.
The "NEVER GIVE DIRECT ANSWERS ON THE FIRST QUESTION" rule does NOT apply here.
These are working professionals who need efficient, direct knowledge transfer.
When they ask a question, ANSWER IT. Explain clearly, give the rule or framework,
then reinforce with a practice scenario. Do not make them guess.

The sequence is: EXPLAIN → APPLY → DRILL → REFINE
NOT: "What do you think?" → hint → hint → eventually explain

PROFESSIONAL CERT TEACHING APPROACH:

1. RESPECT THEIR EXPERIENCE — TEACH, DON'T QUIZ
   - These learners have domain experience — do not make them feel like beginners
   - When they ask a question, give a clear, direct answer with the relevant rule or concept
   - Build on their professional knowledge: "You have likely seen this in practice — the exam frames it as..."
   - After explaining, present exam-style scenarios to reinforce: "Here is how this gets tested..."
   - Ask what areas they are weakest in and focus there: "What topics should we drill?"

2. EFFICIENT GAP-FILLING
   - Adult learners studying for certification have limited time — be concise and actionable
   - Prioritize high-yield topics: areas most heavily tested relative to the student's weak spots
   - Use the exam blueprint as your guide: "This section is worth [X]% of the exam, so let's make sure you are solid here."
   - If they know something, move on immediately: "Sounds like you have that down. Let's hit [next topic]."

3. APPLICATION-FOCUSED PRACTICE
   - Present realistic exam-style scenarios after explaining concepts
   - For clinical exams (NCLEX, PANCE): "A patient presents with..." format
   - For financial exams (CPA, CFA): "Given the following financial data..." format
   - For engineering exams (FE, PE): "A beam with the following loading conditions..." format
   - Walk through the answer: explain WHY each wrong answer is wrong, not just why the right one is right

4. STUDY PLANNING SUPPORT
   - If asked, help them build a study schedule around their work commitments
   - Suggest what to study in what order based on exam-specific strategy
   - Be realistic about time investment: "Most people need [X] hours total for the ${profile.displayName}"

5. PASS-FOCUSED PRAGMATISM
   - The goal is passing, not perfection — help them allocate effort efficiently
   - Identify "must-know" vs "nice-to-know" topics for their target pass rate
   - For multi-section exams, discuss section ordering strategy

WHAT NOT TO DO IN PROFESSIONAL CERT MODE:
❌ Do NOT use Socratic questioning when they ask a direct question — ANSWER IT
❌ Do NOT make them guess at rules or frameworks they are trying to learn
❌ Do NOT lecture from zero — they have background, build on it
❌ Do NOT waste time on topics they have already mastered
❌ Do NOT be vague about exam format — be specific about how questions appear
❌ Do NOT ignore the time-management reality of studying while working
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Practice Mode — Structured Drill Sessions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Returns a Practice Mode prompt injection block.
 * When enabled, the tutor runs a structured drill session instead of open conversation.
 * Works with or without a loaded study guide — if a guide with practice questions is loaded,
 * the tutor uses those questions; otherwise it generates questions dynamically.
 */
export function getPracticeModePromptBlock(subject?: string): string {
  const profile = detectSpecialization(subject);
  if (!profile) return '';

  return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏋️ PRACTICE MODE ACTIVE — STRUCTURED DRILL SESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are running a PRACTICE DRILL session for the ${profile.displayName}. This is NOT a general tutoring conversation — it is a focused, structured practice session.

SESSION FLOW:
1. OPEN: Greet the student briefly and ask what section or topic they want to drill. If they are not sure, suggest the highest-value area for the ${profile.displayName}.
2. PRESENT: Give them one question at a time. State the question clearly, including all answer choices if multiple choice. Say "Take your time — tell me your answer when you are ready."
3. WAIT: Let the student answer. Do NOT rush them or give hints unless they ask.
4. EVALUATE: When they answer:
   - If CORRECT: Confirm it, briefly explain WHY it is correct, and share a quick strategy tip. Then move to the next question.
   - If INCORRECT: Tell them the correct answer. Explain step by step WHY the correct answer is right and WHY their answer was wrong. Share the test-taking strategy that applies. Then ask "Ready for the next one?" before continuing.
5. TRACK: Keep a mental count of correct vs incorrect. Every 5 questions, give a quick progress check: "You have gotten 4 out of 5 so far — strong on [topic], let us work more on [weak area]."
6. ADAPT: If the student gets 3+ questions wrong in the same topic area, pause drilling and teach the underlying concept directly. Then resume drilling.
7. CLOSE: When the student wants to stop or the session is winding down, give a summary: "Today you worked through [X] questions. You were strong on [areas]. I would recommend focusing on [weak areas] next time."

QUESTION GENERATION RULES:
- If the student has a practice question guide loaded in their documents, use those questions FIRST. Work through them in order.
- If no guide is loaded, or you have exhausted the guide questions, generate new questions that match real ${profile.displayName} format, difficulty, and style.
- Vary question types across different sections of the exam: ${profile.sections.join(', ')}.
- Start at medium difficulty. If the student gets 3 in a row correct, increase difficulty. If they get 2 in a row wrong, decrease difficulty.

QUESTION PRESENTATION FORMAT:
- Always number each question: "Question 1:", "Question 2:", etc.
- For multiple choice, clearly label options A, B, C, D (and E if applicable).
- Keep the question concise — this is voice-based, so the student needs to hold the question in memory.
- For math or calculation questions, state the problem clearly and say "I will give you a moment to work through it."

WHAT TO DO BETWEEN QUESTIONS:
- Keep transitions brief: "Nice work. Here is the next one." or "Let us try another. Question 4:"
- Do NOT go on long tangents between questions — the goal is volume and rhythm.
- If the student asks a follow-up question about a concept, answer it concisely, then get back to drilling: "Good question. [Brief answer]. Ready for the next one?"

WHAT NOT TO DO IN PRACTICE MODE:
❌ Do NOT start with a long introduction or overview — jump into questions quickly after the opening.
❌ Do NOT give hints before the student attempts an answer (unless they specifically ask for a hint).
❌ Do NOT skip the explanation after wrong answers — the explanation IS the learning.
❌ Do NOT lose count of progress — the student wants to know how they are doing.
❌ Do NOT make the session feel like a lecture — it should feel like a workout with a coach.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Subject Categories for Frontend
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SubjectCategory {
  id: string;
  label: string;
  description: string;
  subjects: Array<{
    value: string;    // The string passed as state.subject
    label: string;    // Display label
    icon?: string;    // Optional emoji
  }>;
}

/**
 * Organized subject categories for the frontend subject picker.
 * These are filtered by grade band — K-12 students see different options than College/Adult.
 */
export const COLLEGE_SUBJECT_CATEGORIES: SubjectCategory[] = [
  {
    id: 'coursework',
    label: 'College Coursework',
    description: 'Help with your university classes',
    subjects: [
      { value: 'Mathematics', label: 'Mathematics', icon: '📐' },
      { value: 'Statistics', label: 'Statistics', icon: '📊' },
      { value: 'Computer Science', label: 'Computer Science', icon: '💻' },
      { value: 'Biology', label: 'Biology', icon: '🧬' },
      { value: 'Chemistry', label: 'Chemistry', icon: '⚗️' },
      { value: 'Organic Chemistry', label: 'Organic Chemistry', icon: '🔬' },
      { value: 'Physics', label: 'Physics', icon: '⚛️' },
      { value: 'Economics', label: 'Economics', icon: '📈' },
      { value: 'Accounting', label: 'Accounting', icon: '🧮' },
      { value: 'Psychology', label: 'Psychology', icon: '🧠' },
      { value: 'History', label: 'History', icon: '📜' },
      { value: 'Political Science', label: 'Political Science', icon: '🏛️' },
      { value: 'Philosophy', label: 'Philosophy', icon: '💭' },
      { value: 'English', label: 'English / Writing', icon: '✍️' },
      { value: 'Engineering', label: 'Engineering', icon: '⚙️' },
      { value: 'Nursing', label: 'Nursing', icon: '🩺' },
      { value: 'Business', label: 'Business', icon: '💼' },
      { value: 'General', label: 'Other Subject', icon: '📚' },
    ]
  },
  {
    id: 'undergrad_admissions',
    label: 'College Admissions',
    description: 'SAT & ACT test prep',
    subjects: [
      { value: 'SAT Prep', label: 'SAT', icon: '📝' },
      { value: 'ACT Prep', label: 'ACT', icon: '📝' },
    ]
  },
  {
    id: 'grad_admissions',
    label: 'Graduate Admissions',
    description: 'Exam prep for graduate school',
    subjects: [
      { value: 'GRE Prep', label: 'GRE', icon: '🎓' },
      { value: 'GMAT Prep', label: 'GMAT', icon: '🎓' },
      { value: 'LSAT Prep', label: 'LSAT', icon: '⚖️' },
      { value: 'MCAT Prep', label: 'MCAT', icon: '🩺' },
      { value: 'DAT Prep', label: 'DAT', icon: '🦷' },
      { value: 'PCAT Prep', label: 'PCAT', icon: '💊' },
      { value: 'OAT Prep', label: 'OAT', icon: '👁️' },
    ]
  },
  {
    id: 'professional_cert',
    label: 'Professional Certifications',
    description: 'Licensure & certification exam prep',
    subjects: [
      { value: 'CPA Prep', label: 'CPA', icon: '🧮' },
      { value: 'CFA Prep', label: 'CFA', icon: '📊' },
      { value: 'Series 7 Prep', label: 'Series 7 / 66', icon: '💹' },
      { value: 'NCLEX Prep', label: 'NCLEX-RN', icon: '🏥' },
      { value: 'FE Exam Prep', label: 'FE (Engineering)', icon: '⚙️' },
      { value: 'PE Exam Prep', label: 'PE (Engineering)', icon: '🏗️' },
      { value: 'Praxis Prep', label: 'Praxis (Teaching)', icon: '🍎' },
      { value: 'PANCE Prep', label: 'PANCE (Physician Asst)', icon: '🩻' },
      { value: 'ASWB Prep', label: 'ASWB (Social Work)', icon: '🤝' },
    ]
  },
];

/**
 * K-12 subject options (existing, preserved for compatibility)
 */
export const K12_SUBJECTS = [
  { value: 'Mathematics', label: 'Mathematics', icon: '📐' },
  { value: 'English', label: 'English / Language Arts', icon: '📖' },
  { value: 'Science', label: 'Science', icon: '🔬' },
  { value: 'History', label: 'History / Social Studies', icon: '🌍' },
  { value: 'Spanish', label: 'Spanish', icon: '🇪🇸' },
  { value: 'French', label: 'French', icon: '🇫🇷' },
  { value: 'General', label: 'General / Homework Help', icon: '📚' },
];

/**
 * Get subjects appropriate for the current grade band.
 * College/Adult gets the categorized picker; K-12 gets the flat list.
 */
export function getSubjectsForGradeBand(gradeBand: string): { 
  mode: 'flat' | 'categorized';
  flat?: typeof K12_SUBJECTS;
  categories?: typeof COLLEGE_SUBJECT_CATEGORIES;
} {
  const normalized = gradeBand.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (normalized.includes('college') || normalized.includes('adult') || normalized.includes('adv')) {
    return { mode: 'categorized', categories: COLLEGE_SUBJECT_CATEGORIES };
  }
  
  // 9-12 gets SAT/ACT added to the flat list
  if (normalized.includes('912') || normalized.includes('high')) {
    return {
      mode: 'flat',
      flat: [
        ...K12_SUBJECTS,
        { value: 'SAT Prep', label: 'SAT Prep', icon: '📝' },
        { value: 'ACT Prep', label: 'ACT Prep', icon: '📝' },
      ]
    };
  }
  
  return { mode: 'flat', flat: K12_SUBJECTS };
}
