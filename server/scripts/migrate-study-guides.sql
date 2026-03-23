-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Study Guide Library — Table Creation + Seed Data
-- Run via Beekeeper Studio on dev first, then prod and UW
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. Create the study_guides table
CREATE TABLE IF NOT EXISTS study_guides (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,         -- 'test_prep', 'professional_cert', 'college_coursework', 'k12'
  subcategory TEXT,               -- 'LSAT', 'CPA', 'Organic Chemistry', etc.
  grade_bands JSONB NOT NULL,     -- ['College/Adult', '9-12']
  subject TEXT,                   -- Maps to session subject for auto-suggest
  content_text TEXT NOT NULL,     -- The actual guide content
  content_tokens INTEGER,         -- Estimated token count
  file_type TEXT DEFAULT 'guide', -- 'guide' for text-based, 'pdf' if file-backed
  file_path TEXT,                 -- Optional: path to downloadable file
  icon_emoji TEXT DEFAULT '📘',
  sort_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_guides_category ON study_guides(category);
CREATE INDEX IF NOT EXISTS idx_study_guides_published ON study_guides(is_published);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Seed Data — Starter guides for testing
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO study_guides (title, description, category, subcategory, grade_bands, subject, icon_emoji, sort_order, content_text, content_tokens) VALUES

-- LSAT Quick-Start Guide
(
  'LSAT Quick-Start Strategy Guide',
  'Essential test-taking strategies, section breakdowns, and scoring insights for the LSAT.',
  'test_prep',
  'LSAT',
  '["College/Adult"]',
  'LSAT Prep',
  '⚖️',
  1,
  'LSAT QUICK-START STRATEGY GUIDE
Prepared by JIE Mastery

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAM OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The LSAT (Law School Admission Test) is scored on a 120-180 scale. The median score is approximately 151. Top-14 law schools typically expect scores of 170+.

The test consists of:
- Logical Reasoning (1 scored section, 35 minutes, ~25 questions)
- Analytical Reasoning / Logic Games (1 scored section, 35 minutes, ~23 questions)
- Reading Comprehension (1 scored section, 35 minutes, ~27 questions)
- 1 Unscored Experimental Section (could be any type)
- LSAT Writing (completed separately online)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1: LOGICAL REASONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This section tests your ability to analyze and evaluate arguments. Key question types:

STRENGTHEN / WEAKEN questions: Identify which answer choice makes the argument more or less convincing. Focus on the gap between the premises and the conclusion.

SUFFICIENT ASSUMPTION vs NECESSARY ASSUMPTION: A sufficient assumption is one that, if true, guarantees the conclusion. A necessary assumption is one that must be true for the conclusion to hold. Use the Negation Test for necessary assumptions: negate the answer choice — if the argument falls apart, it is necessary.

FLAW questions: Identify the logical error in the reasoning. Common flaws include:
- Confusing correlation with causation
- Part-to-whole fallacy
- Appeal to authority
- Equivocation (using a word in two different senses)
- Sampling bias

PARALLEL REASONING: Match the logical structure, not the topic. Diagram the original argument abstractly, then find the answer with the same structure.

Strategy tip: Spend approximately 1 minute 20 seconds per question. If a question is taking over 2 minutes, flag it and move on.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2: ANALYTICAL REASONING (LOGIC GAMES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is the most learnable section. Most students can improve dramatically with practice.

Game types:
1. SEQUENCING — Arrange elements in order. Draw a number line and use notation: A > B means A comes before B.
2. GROUPING — Assign elements to groups. Create a grid with groups as columns.
3. MATCHING — Assign multiple attributes. Create a matrix.
4. HYBRID — Combines two types. Identify which types and use both diagrams.

Universal strategy:
1. Read the setup paragraph and list all elements
2. Write out every rule using clear notation
3. Make all possible inferences before looking at questions
4. Look for the most constrained elements — they drive the game
5. Use "if" questions to test scenarios quickly

Key inference types:
- Contrapositive: If A → B, then Not B → Not A
- Chain logic: If A → B and B → C, then A → C
- Split scenarios: When a highly constrained element has only 2-3 possible positions, diagram each scenario

Strategy tip: Do the easiest game first. Difficulty order varies — scan all four games before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3: READING COMPREHENSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Four passages, approximately 6-8 questions each. One passage is a Comparative Reading set (two shorter passages).

Reading strategy:
1. Read for STRUCTURE, not details. Note: What is the main point? What is the author''s attitude? How is the passage organized?
2. Paragraph-map: After each paragraph, write a 3-5 word summary in the margin
3. Identify the author''s opinion — this is tested heavily
4. For Comparative Reading, focus on: How do the passages relate? Where do they agree/disagree?

Common question types:
- Main point / primary purpose
- Author''s attitude
- Specific detail (go back to the passage — don''t rely on memory)
- Inference (what must be true based on the passage)
- Strengthen/weaken the author''s argument

Strategy tip: Allocate approximately 8.5 minutes per passage. If you are consistently running out of time, consider doing 3 passages thoroughly and strategically guessing on the 4th.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERAL TEST-DAY STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. There is no penalty for wrong answers — never leave a question blank
2. Eliminate wrong answers before selecting — process of elimination is more reliable than picking the "best" answer
3. Flag and return — difficult questions at the end of a section earn the same points as easy ones
4. Practice under timed conditions starting at least 4 weeks before test day
5. Take at least 3 full practice tests before the real exam
6. Sleep and nutrition matter — your brain performs measurably worse when tired

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STUDY TIMELINE (12-WEEK PLAN)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Weeks 1-3: Learn the fundamentals of each section. Focus on understanding question types.
Weeks 4-6: Drill individual sections. Do timed section practice daily.
Weeks 7-9: Take full practice tests weekly. Review every missed question.
Weeks 10-11: Focus on your weakest section. Refine timing strategy.
Week 12: Light review only. Rest before test day.

Recommended daily study time: 2-3 hours (10-15 hours per week).

This guide is a starting point. During your tutoring sessions, ask your tutor to drill specific question types, work through logic games together, or review practice test results.',
  2500
),

-- SAT Quick-Start Guide
(
  'SAT Quick-Start Strategy Guide',
  'Digital SAT format overview, section strategies, and score-boosting tips.',
  'test_prep',
  'SAT',
  '["9-12", "College/Adult"]',
  'SAT Prep',
  '📝',
  2,
  'SAT QUICK-START STRATEGY GUIDE
Prepared by JIE Mastery

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAM OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The Digital SAT is scored on a 400-1600 scale (200-800 per section). The test is section-adaptive: your performance on Module 1 determines the difficulty of Module 2.

Format:
- Reading and Writing: 2 modules × 32 minutes (54 questions total)
- Math: 2 modules × 35 minutes (44 questions total)
- Total test time: 2 hours 14 minutes

Key change from old SAT: Passages are shorter (most are a single paragraph). Each question has its own passage. A calculator is allowed on the entire Math section.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
READING AND WRITING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Question categories:
1. CRAFT AND STRUCTURE — Vocabulary in context, text purpose, text structure
2. INFORMATION AND IDEAS — Central ideas, inferences, command of evidence
3. STANDARD ENGLISH CONVENTIONS — Grammar, punctuation, sentence structure
4. EXPRESSION OF IDEAS — Transitions, rhetorical synthesis

Strategies:
- Read the question FIRST, then the passage. Many questions can be answered by reading strategically.
- For vocabulary-in-context: Substitute each answer and check if the sentence meaning stays the same.
- For grammar questions: If it sounds wrong, trust your ear — then verify with the rule.
- For evidence questions: The correct answer must be directly supported by the text, not just plausible.

Pacing: ~71 seconds per question. Mark and move if stuck.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MATH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Topics tested:
1. ALGEBRA — Linear equations, systems, inequalities (~35% of questions)
2. ADVANCED MATH — Quadratics, polynomials, exponentials (~35%)
3. PROBLEM-SOLVING AND DATA — Ratios, percentages, statistics (~15%)
4. GEOMETRY AND TRIGONOMETRY — Area, volume, triangles, trig (~15%)

Strategies:
- Desmos graphing calculator is built into the test. Use it to check algebra, graph functions, and solve systems visually.
- For word problems: Underline what the question is actually asking. Many errors come from solving for the wrong variable.
- Backsolve: Plug answer choices into the problem. This works well when the algebra is complex.
- On student-produced response questions: Check if your answer is reasonable. Extreme values are usually wrong.

Pacing: ~95 seconds per question. The last few questions in Module 2 (hard route) are significantly harder — budget extra time.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE ADAPTIVE SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Module 1 is medium difficulty for everyone. If you perform well, Module 2 is harder (and higher-scoring potential). If you struggle, Module 2 is easier (but score ceiling is lower).

What this means for strategy:
- Module 1 accuracy is critical. Take your time and double-check.
- It is better to get 22 out of 27 right in Module 1 than to rush through and get 25 out of 27 with careless errors.
- On Module 2, the difficulty tells you how you did. If questions feel hard, you are on the high-scoring path.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORE GOALS BY COLLEGE TIER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1500+ : Ivy League, Stanford, MIT, top-10 competitive
1400-1490 : Top-25 schools, strong merit scholarship range
1300-1390 : Competitive at most state universities
1200-1290 : Meets minimum for many four-year schools

Strategy tip: Know your target score range and focus your study time on the sections that can move the needle most. For most students, Math improvement is faster than Reading/Writing improvement.

During your tutoring sessions, ask your tutor to practice specific question types, review Desmos strategies, or work through timed mini-sections together.',
  1800
),

-- CPA Exam Overview Guide
(
  'CPA Exam Overview & Study Strategy',
  'Four-section breakdown, study order strategy, and high-yield topic guide for the CPA exam.',
  'professional_cert',
  'CPA',
  '["College/Adult"]',
  'CPA Prep',
  '🧮',
  3,
  'CPA EXAM OVERVIEW & STUDY STRATEGY
Prepared by JIE Mastery

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAM OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The CPA Exam consists of four sections. You must pass all four within an 18-month rolling window. Each section is scored on a 0-99 scale with 75 required to pass.

Sections:
1. AUD (Auditing and Attestation) — 4 hours
2. BEC (Business Environment and Concepts) — 4 hours
3. FAR (Financial Accounting and Reporting) — 4 hours
4. REG (Regulation) — 4 hours

Each section contains Multiple-Choice Questions (MCQs) and Task-Based Simulations (TBS). BEC also includes Written Communication tasks.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RECOMMENDED STUDY ORDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Most successful candidates follow this order:

1. FAR first — It is the broadest and hardest section. Tackle it while your motivation is highest. FAR content overlaps with AUD and BEC, so studying it first creates a foundation.

2. AUD second — Builds directly on FAR knowledge (financial statement assertions, internal controls). The content is more conceptual and less calculation-heavy.

3. REG third — Tax law is unique content that does not overlap heavily with other sections. Use current-year materials only — tax law changes frequently.

4. BEC last — Generally considered the easiest section. Covers corporate governance, economics, IT, and cost accounting. The Written Communication tasks are scored by AI and are manageable with practice.

Time investment: Most candidates study 300-400 total hours across all four sections (~80-100 hours each). Working full-time, plan for 3-4 months per section.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HIGH-YIELD TOPICS BY SECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FAR:
- Governmental accounting (heavily tested, commonly weak area)
- Not-for-profit accounting
- Consolidations and business combinations
- Revenue recognition (ASC 606)
- Leases (ASC 842)
- Bonds and long-term liabilities

AUD:
- Audit evidence and procedures
- Internal controls (COSO framework)
- Audit reports and modifications
- Sampling and analytical procedures
- Ethics and independence

REG:
- Individual taxation (basis, deductions, credits)
- Corporate taxation (formation, distributions, liquidation)
- Partnership taxation (basis calculations, special allocations)
- Business law (contracts, agency, debtor-creditor)
- Ethics and professional responsibilities

BEC:
- Cost accounting (job order, process, standard costing)
- Economic concepts (supply/demand, monetary/fiscal policy)
- IT governance and controls
- Corporate governance
- Financial management (capital budgeting, WACC)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STUDY STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. MCQs are your primary study tool. The exam is ~50% MCQ by weight, but more importantly, MCQ practice builds the pattern recognition you need for TBS.

2. Do NOT just read the textbook. Active practice (answering questions, reviewing explanations for wrong answers) is 3-5x more effective than passive reading.

3. Track your MCQ accuracy by topic. When you consistently score 75%+ on a topic, move on. Spend your time on weak areas.

4. Practice TBS starting at the halfway point of your study for each section. TBS questions are multi-step and test application, not just recall.

5. For BEC Written Communications: Structure matters more than technical perfection. Use a clear format: introduction, body paragraphs with topic sentences, conclusion. The AI grader evaluates organization and writing quality alongside content.

6. Take at least one full practice exam per section under timed conditions before your real exam.

During your tutoring sessions, ask your tutor to quiz you on specific topics, work through TBS-style problems, or explain concepts you are struggling with.',
  2000
)

ON CONFLICT DO NOTHING;
