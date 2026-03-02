/**
 * LSIS - Longitudinal Student Intelligence System
 * server/services/lsis-service.ts
 * 
 * Post-session processing pipeline that transforms conversation transcripts
 * into structured learning intelligence. Hooks into the existing memory_jobs
 * pipeline - triggered after session_summary generation completes.
 * 
 * Pipeline: session ends → memory_jobs creates summary → LSIS extracts concepts
 *           → maps to standards → updates student knowledge profile
 */

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db';

const anthropic = new Anthropic();

// ── Types ────────────────────────────────────────────────────────

interface ConceptExtraction {
  concept_key: string;
  subject: string;
  mastery_level: number;
  evidence_type: 'correct_answer' | 'explanation' | 'misconception' | 'self_correction' | 'partial_understanding' | 'no_understanding';
  evidence_summary: string;
  misconceptions_observed: string[];
  teaching_strategy_used: string;
  strategy_effectiveness: number;
}

interface LearningStyleObservation {
  visual_preference: number;
  analogy_effectiveness: number;
  humor_responsiveness: number;
  preferred_explanation_length: 'brief' | 'moderate' | 'detailed';
  optimal_challenge_level: 'easy' | 'moderate' | 'challenging';
}

interface EmotionalPatternObservation {
  frustration_detected: boolean;
  frustration_trigger?: string;
  confidence_moments: string[];
  engagement_level: number;
  recovery_strategy_effective?: string;
}

interface ExtractionResult {
  concepts: ConceptExtraction[];
  learning_style_observations: Partial<LearningStyleObservation>;
  emotional_patterns: EmotionalPatternObservation;
  effective_strategies: Array<{ strategy: string; context: string; effectiveness: number }>;
  misconception_updates: Array<{ misconception: string; concept_key: string; resolved: boolean }>;
  next_session_recommendations: {
    priority_topics: string[];
    suggested_approach: string;
    avoid: string[];
  };
  session_quality_score: number;
}

// ── Extraction Prompt ────────────────────────────────────────────

function buildExtractionPrompt(
  transcript: any[],
  sessionSummary: string,
  existingProfile: any | null,
  gradeBand: string,
  subject: string | null
): string {
  const profileContext = existingProfile
    ? `
## EXISTING STUDENT PROFILE
This student has been tracked across ${existingProfile.total_sessions_analyzed} previous sessions.

Known strengths: ${JSON.stringify(existingProfile.strengths)}
Known growth areas: ${JSON.stringify(existingProfile.growth_areas)}
Known misconceptions: ${JSON.stringify(existingProfile.misconception_catalog)}
Effective strategies: ${JSON.stringify(existingProfile.effective_strategies)}
Learning style: ${JSON.stringify(existingProfile.learning_style_profile)}
Emotional patterns: ${JSON.stringify(existingProfile.emotional_patterns)}
Last session recommendations: ${JSON.stringify(existingProfile.next_session_recommendations)}

IMPORTANT: Compare this session's observations against the existing profile.
- If a previously identified misconception was NOT observed, note if it appears resolved.
- If mastery improved on a known growth area, reflect that in your scores.
- Reuse existing concept_keys when the same concept is discussed.
`
    : `
## NO EXISTING PROFILE
This is the first analyzed session for this student. Establish baseline observations.
`;

  return `You are an expert educational analyst specializing in formative assessment and learning science. Your task is to analyze a tutoring session transcript and extract structured learning intelligence.

## GRADE BAND
${gradeBand}

## SESSION SUBJECT
${subject || 'Not specified - infer from conversation'}

## SESSION SUMMARY (from prior analysis)
${sessionSummary}

${profileContext}

## CONCEPT KEY FORMAT
Use hierarchical dot-notation: "subject.domain.specific_concept"
Examples:
- math.fractions.unlike_denominators
- math.algebra.linear_equations.slope_intercept  
- science.physics.forces.newtons_third_law
- english.grammar.subject_verb_agreement
- history.us.civil_war.causes

## MASTERY SCALE
0.00-0.20: Not Started (no understanding demonstrated)
0.21-0.40: Introduced (recognizes concept, cannot apply)
0.41-0.60: Developing (sometimes applies with guidance, inconsistent)
0.61-0.80: Proficient (applies correctly most of the time, can explain)
0.81-1.00: Mastered (deep understanding, can teach it, applies in novel contexts)

## TRANSCRIPT
${JSON.stringify(transcript)}

## YOUR TASK
Analyze this transcript and return ONLY a JSON object (no markdown, no backticks, no preamble) with this exact structure:

{
  "concepts": [
    {
      "concept_key": "math.fractions.unlike_denominators",
      "subject": "math",
      "mastery_level": 0.45,
      "evidence_type": "partial_understanding",
      "evidence_summary": "Student attempted to add 2/3 + 1/4 but forgot to find common denominator on first try. Self-corrected after tutor prompt.",
      "misconceptions_observed": ["initially tried to add numerators directly"],
      "teaching_strategy_used": "socratic_questioning",
      "strategy_effectiveness": 0.80
    }
  ],
  "learning_style_observations": {
    "visual_preference": 0.7,
    "analogy_effectiveness": 0.85,
    "humor_responsiveness": 0.5,
    "preferred_explanation_length": "moderate",
    "optimal_challenge_level": "moderate"
  },
  "emotional_patterns": {
    "frustration_detected": false,
    "frustration_trigger": null,
    "confidence_moments": ["correctly solved the final problem independently"],
    "engagement_level": 0.8,
    "recovery_strategy_effective": null
  },
  "effective_strategies": [
    {
      "strategy": "pizza_slice_analogy",
      "context": "explaining fraction addition",
      "effectiveness": 0.9
    }
  ],
  "misconception_updates": [
    {
      "misconception": "adding fractions means adding numerators and denominators separately",
      "concept_key": "math.fractions.unlike_denominators",
      "resolved": false
    }
  ],
  "next_session_recommendations": {
    "priority_topics": ["math.fractions.unlike_denominators", "math.fractions.mixed_numbers"],
    "suggested_approach": "Start with visual fraction models before moving to abstract notation. Build on the pizza analogy that worked well.",
    "avoid": ["Jumping straight to abstract notation without visual support"]
  },
  "session_quality_score": 0.75
}

RULES:
- Extract ALL concepts discussed, even briefly mentioned ones (with lower mastery scores)
- Be precise with mastery_level - use the full 0-1 range, don't cluster everything at 0.5
- evidence_summary should be specific and reference actual student statements/behaviors
- If no misconceptions were observed for a concept, use an empty array
- learning_style_observations should only include dimensions you have evidence for
- session_quality_score reflects overall learning productivity (0=no learning, 1=exceptional)
- Return ONLY valid JSON, nothing else`;
}

// ── Core Processing Functions ────────────────────────────────────

/**
 * Main entry point: called after a memory_job completes for a session.
 * Creates LSIS processing jobs for the concept extraction pipeline.
 */
export async function triggerLSISProcessing(sessionId: string): Promise<void> {
  try {
    // Check if LSIS jobs already exist for this session (idempotency)
    const existing = await pool.query(
      `SELECT id FROM lsis_processing_jobs WHERE session_id = $1 AND stage = 'concept_extraction'`,
      [sessionId]
    );

    if (existing.rows.length > 0) {
      console.log(`[LSIS] Jobs already exist for session ${sessionId}, skipping`);
      return;
    }

    // Get session info to find/create the student profile
    const sessionResult = await pool.query(
      `SELECT rs.id, rs.user_id, rs.student_id, rs.transcript, rs.subject, rs.minutes_used,
              s.grade_band, s.student_name,
              ss.summary_text, ss.topics_covered, ss.concepts_mastered, ss.concepts_struggled
       FROM realtime_sessions rs
       LEFT JOIN students s ON rs.student_id = s.id
       LEFT JOIN session_summaries ss ON ss.session_id = rs.id
       WHERE rs.id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      console.log(`[LSIS] Session ${sessionId} not found, skipping`);
      return;
    }

    const session = sessionResult.rows[0];

    // Skip sessions with no meaningful transcript
    const transcript = session.transcript || [];
    if (transcript.length < 4) {
      console.log(`[LSIS] Session ${sessionId} has < 4 messages, skipping`);
      return;
    }

    // Skip if no student linked
    if (!session.student_id) {
      console.log(`[LSIS] Session ${sessionId} has no student_id, skipping`);
      return;
    }

    // Find or create knowledge profile
    let profileId = await getOrCreateProfile(session.student_id, session.user_id);

    // Create the concept extraction job
    await pool.query(
      `INSERT INTO lsis_processing_jobs (session_id, profile_id, stage, status, input_data)
       VALUES ($1, $2, 'concept_extraction', 'pending', $3)`,
      [
        sessionId,
        profileId,
        JSON.stringify({
          transcript: transcript,
          session_summary: session.summary_text || '',
          grade_band: session.grade_band || 'ADV',
          subject: session.subject,
          minutes_used: session.minutes_used,
          topics_covered: session.topics_covered || [],
          concepts_mastered: session.concepts_mastered || [],
          concepts_struggled: session.concepts_struggled || [],
        }),
      ]
    );

    console.log(`[LSIS] Created concept_extraction job for session ${sessionId}, profile ${profileId}`);

    // Process immediately (or could be deferred to a cron)
    await processNextLSISJob();
  } catch (error) {
    console.error(`[LSIS] Error triggering processing for session ${sessionId}:`, error);
  }
}

/**
 * Find existing knowledge profile or create a new one for the student.
 */
async function getOrCreateProfile(studentId: string, userId: string): Promise<string> {
  const existing = await pool.query(
    `SELECT id FROM student_knowledge_profiles WHERE student_id = $1`,
    [studentId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const result = await pool.query(
    `INSERT INTO student_knowledge_profiles (student_id, user_id)
     VALUES ($1, $2)
     RETURNING id`,
    [studentId, userId]
  );

  console.log(`[LSIS] Created new knowledge profile for student ${studentId}`);
  return result.rows[0].id;
}

/**
 * Process the next pending LSIS job. Called after job creation
 * and also by the opportunistic processor.
 */
export async function processNextLSISJob(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Grab the next pending job (FIFO, with retry backoff)
    const jobResult = await client.query(
      `SELECT * FROM lsis_processing_jobs
       WHERE status = 'pending' AND run_after <= NOW() AND attempts < 3
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      []
    );

    if (jobResult.rows.length === 0) {
      await client.query('COMMIT');
      return false;
    }

    const job = jobResult.rows[0];

    // Mark as processing
    await client.query(
      `UPDATE lsis_processing_jobs SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [job.id]
    );
    await client.query('COMMIT');

    const startTime = Date.now();

    try {
      let result: any;

      switch (job.stage) {
        case 'concept_extraction':
          result = await runConceptExtraction(job);
          break;
        case 'profile_update':
          result = await runProfileUpdate(job);
          break;
        default:
          throw new Error(`Unknown LSIS stage: ${job.stage}`);
      }

      const processingTime = Date.now() - startTime;

      // Mark completed and store output
      await pool.query(
        `UPDATE lsis_processing_jobs 
         SET status = 'completed', output_data = $1, processing_time_ms = $2, updated_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(result), processingTime, job.id]
      );

      console.log(`[LSIS] Completed ${job.stage} for session ${job.session_id} in ${processingTime}ms`);

      // Chain to next stage if needed
      if (job.stage === 'concept_extraction') {
        await pool.query(
          `INSERT INTO lsis_processing_jobs (session_id, profile_id, stage, status, input_data)
           VALUES ($1, $2, 'profile_update', 'pending', $3)`,
          [job.session_id, job.profile_id, JSON.stringify(result)]
        );
        // Process the next job immediately
        await processNextLSISJob();
      }

      return true;
    } catch (error: any) {
      const processingTime = Date.now() - startTime;

      // Increment attempts and schedule retry
      await pool.query(
        `UPDATE lsis_processing_jobs 
         SET status = 'pending', attempts = attempts + 1, last_error = $1,
             processing_time_ms = $2, run_after = NOW() + INTERVAL '30 seconds' * attempts,
             updated_at = NOW()
         WHERE id = $3`,
        [error.message || 'Unknown error', processingTime, job.id]
      );

      console.error(`[LSIS] Error processing ${job.stage} for session ${job.session_id}:`, error.message);
      return false;
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[LSIS] Job processing transaction error:', error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Stage 1: Concept Extraction
 * Calls Claude to analyze the session transcript and extract structured learning data.
 */
async function runConceptExtraction(job: any): Promise<ExtractionResult> {
  const input = job.input_data;

  // Fetch existing profile for context
  let existingProfile = null;
  if (job.profile_id) {
    const profileResult = await pool.query(
      `SELECT * FROM student_knowledge_profiles WHERE id = $1`,
      [job.profile_id]
    );
    if (profileResult.rows.length > 0) {
      existingProfile = profileResult.rows[0];
    }
  }

  const prompt = buildExtractionPrompt(
    input.transcript,
    input.session_summary,
    existingProfile,
    input.grade_band,
    input.subject
  );

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  // Parse the JSON response
  const text = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
  const result: ExtractionResult = JSON.parse(cleaned);

  // Validate the result has required fields
  if (!result.concepts || !Array.isArray(result.concepts)) {
    throw new Error('Extraction result missing concepts array');
  }

  return result;
}

/**
 * Stage 2: Profile Update
 * Writes extracted concepts to concept_mastery_records and updates
 * the student_knowledge_profiles aggregate.
 */
async function runProfileUpdate(job: any): Promise<{ concepts_written: number; profile_updated: boolean }> {
  const extraction: ExtractionResult = job.input_data;
  const profileId = job.profile_id;
  const sessionId = job.session_id;

  let conceptsWritten = 0;

  // 1. Write concept mastery records
  for (const concept of extraction.concepts) {
    // Get prior mastery for this concept
    const priorResult = await pool.query(
      `SELECT mastery_level FROM concept_mastery_records
       WHERE profile_id = $1 AND concept_key = $2
       ORDER BY assessed_at DESC LIMIT 1`,
      [profileId, concept.concept_key]
    );
    const priorMastery = priorResult.rows.length > 0 ? priorResult.rows[0].mastery_level : null;

    await pool.query(
      `INSERT INTO concept_mastery_records
       (profile_id, session_id, concept_key, subject, mastery_level, prior_mastery_level,
        evidence_type, evidence_summary, misconceptions_observed,
        teaching_strategy_used, strategy_effectiveness)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        profileId,
        sessionId,
        concept.concept_key,
        concept.subject,
        concept.mastery_level,
        priorMastery,
        concept.evidence_type,
        concept.evidence_summary,
        JSON.stringify(concept.misconceptions_observed),
        concept.teaching_strategy_used,
        concept.strategy_effectiveness,
      ]
    );
    conceptsWritten++;
  }

  // 2. Update the aggregate profile
  // Compute strengths (concepts with mastery >= 0.7 across recent sessions)
  const strengthsResult = await pool.query(
    `SELECT concept_key, AVG(mastery_level) as avg_mastery, COUNT(*) as evidence_sessions
     FROM concept_mastery_records
     WHERE profile_id = $1
     GROUP BY concept_key
     HAVING AVG(mastery_level) >= 0.70
     ORDER BY avg_mastery DESC
     LIMIT 20`,
    [profileId]
  );

  const strengths = strengthsResult.rows.map((r: any) => ({
    concept: r.concept_key,
    score: parseFloat(r.avg_mastery),
    evidence_sessions: parseInt(r.evidence_sessions),
  }));

  // Compute growth areas (concepts with mastery < 0.60)
  const growthResult = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (concept_key) concept_key, mastery_level, prior_mastery_level, assessed_at
       FROM concept_mastery_records
       WHERE profile_id = $1
       ORDER BY concept_key, assessed_at DESC
     )
     SELECT l.concept_key, l.mastery_level, l.prior_mastery_level,
            COUNT(c.id) as sessions_tracked
     FROM latest l
     JOIN concept_mastery_records c ON c.profile_id = $1 AND c.concept_key = l.concept_key
     WHERE l.mastery_level < 0.60
     GROUP BY l.concept_key, l.mastery_level, l.prior_mastery_level
     ORDER BY l.mastery_level ASC
     LIMIT 20`,
    [profileId]
  );

  const growthAreas = growthResult.rows.map((r: any) => {
    const current = parseFloat(r.mastery_level);
    const prior = r.prior_mastery_level ? parseFloat(r.prior_mastery_level) : null;
    let trend = 'stable';
    if (prior !== null) {
      if (current > prior + 0.05) trend = 'improving';
      else if (current < prior - 0.05) trend = 'declining';
    }
    return {
      concept: r.concept_key,
      score: current,
      trend,
      sessions_tracked: parseInt(r.sessions_tracked),
    };
  });

  // Build misconception catalog from extraction
  const existingProfile = await pool.query(
    `SELECT misconception_catalog FROM student_knowledge_profiles WHERE id = $1`,
    [profileId]
  );
  let misconceptions = existingProfile.rows[0]?.misconception_catalog || [];

  // Update misconceptions from this session
  for (const update of extraction.misconception_updates) {
    const existingIdx = misconceptions.findIndex(
      (m: any) => m.misconception === update.misconception
    );
    if (existingIdx >= 0) {
      misconceptions[existingIdx].occurrences = (misconceptions[existingIdx].occurrences || 1) + 1;
      misconceptions[existingIdx].resolved = update.resolved;
      misconceptions[existingIdx].last_seen = new Date().toISOString().split('T')[0];
    } else if (!update.resolved) {
      misconceptions.push({
        misconception: update.misconception,
        concept_key: update.concept_key,
        first_seen: new Date().toISOString().split('T')[0],
        last_seen: new Date().toISOString().split('T')[0],
        occurrences: 1,
        resolved: false,
      });
    }
  }

  // Merge effective strategies
  const existingStrategies = existingProfile.rows[0]?.effective_strategies || [];
  const mergedStrategies = [...existingStrategies];
  for (const strat of extraction.effective_strategies) {
    const existingIdx = mergedStrategies.findIndex(
      (s: any) => s.strategy === strat.strategy && s.context === strat.context
    );
    if (existingIdx >= 0) {
      // Weighted average of effectiveness
      const existing = mergedStrategies[existingIdx];
      existing.effectiveness = (existing.effectiveness * 0.7) + (strat.effectiveness * 0.3);
    } else {
      mergedStrategies.push(strat);
    }
  }

  // Merge learning style (weighted average with existing)
  const existingStyle = existingProfile.rows[0]?.learning_style_profile || {};
  const newStyle = extraction.learning_style_observations;
  const mergedStyle: any = { ...existingStyle };
  for (const [key, value] of Object.entries(newStyle)) {
    if (typeof value === 'number' && typeof existingStyle[key] === 'number') {
      mergedStyle[key] = existingStyle[key] * 0.7 + value * 0.3; // Weighted toward history
    } else {
      mergedStyle[key] = value;
    }
  }

  // Get session count and total minutes
  const statsResult = await pool.query(
    `SELECT COUNT(DISTINCT session_id) as session_count
     FROM concept_mastery_records WHERE profile_id = $1`,
    [profileId]
  );

  // Get session minutes
  const minutesResult = await pool.query(
    `SELECT COALESCE(SUM(rs.minutes_used), 0) as total_minutes
     FROM realtime_sessions rs
     JOIN concept_mastery_records cmr ON cmr.session_id = rs.id
     WHERE cmr.profile_id = $1`,
    [profileId]
  );

  // Update the master profile
  await pool.query(
    `UPDATE student_knowledge_profiles SET
       total_sessions_analyzed = $2,
       total_minutes_analyzed = $3,
       strengths = $4,
       growth_areas = $5,
       misconception_catalog = $6,
       effective_strategies = $7,
       learning_style_profile = $8,
       emotional_patterns = $9,
       next_session_recommendations = $10,
       last_session_at = NOW(),
       first_session_at = COALESCE(first_session_at, NOW()),
       updated_at = NOW()
     WHERE id = $1`,
    [
      profileId,
      parseInt(statsResult.rows[0].session_count),
      parseInt(minutesResult.rows[0].total_minutes),
      JSON.stringify(strengths),
      JSON.stringify(growthAreas),
      JSON.stringify(misconceptions),
      JSON.stringify(mergedStrategies.slice(0, 30)), // Cap at 30 strategies
      JSON.stringify(mergedStyle),
      JSON.stringify(extraction.emotional_patterns),
      JSON.stringify(extraction.next_session_recommendations),
    ]
  );

  console.log(`[LSIS] Profile ${profileId} updated: ${conceptsWritten} concepts, ${strengths.length} strengths, ${growthAreas.length} growth areas`);

  return { concepts_written: conceptsWritten, profile_updated: true };
}

/**
 * Opportunistic processor: call this periodically (e.g., from memory job processor)
 * to drain any pending LSIS jobs.
 */
export async function processAllPendingLSISJobs(): Promise<number> {
  let processed = 0;
  let hasMore = true;

  while (hasMore && processed < 10) { // Cap at 10 per run to avoid blocking
    hasMore = await processNextLSISJob();
    if (hasMore) processed++;
  }

  if (processed > 0) {
    console.log(`[LSIS] Processed ${processed} pending jobs`);
  }
  return processed;
}

/**
 * Build the profile injection text for the tutor system prompt.
 * Called at session start in custom-voice-ws.ts.
 */
export async function getProfileForSystemPrompt(studentId: string): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT * FROM student_knowledge_profiles WHERE student_id = $1`,
      [studentId]
    );

    if (result.rows.length === 0) return null;

    const profile = result.rows[0];

    // Skip if no sessions analyzed yet
    if (profile.total_sessions_analyzed === 0) return null;

    // Get recent concept mastery for specificity
    const recentConcepts = await pool.query(
      `SELECT concept_key, mastery_level, evidence_type, assessed_at
       FROM concept_mastery_records
       WHERE profile_id = $1
       ORDER BY assessed_at DESC
       LIMIT 15`,
      [profile.id]
    );

    const strengths = profile.strengths || [];
    const growthAreas = profile.growth_areas || [];
    const misconceptions = (profile.misconception_catalog || []).filter((m: any) => !m.resolved);
    const strategies = profile.effective_strategies || [];
    const style = profile.learning_style_profile || {};
    const recs = profile.next_session_recommendations || {};

    let promptSection = `\n## STUDENT LEARNING PROFILE (${profile.total_sessions_analyzed} sessions analyzed, ${profile.total_minutes_analyzed} minutes total)\n`;

    if (strengths.length > 0) {
      const topStrengths = strengths.slice(0, 5).map((s: any) => `${s.concept} (${Math.round(s.score * 100)}%)`);
      promptSection += `\nStrengths: ${topStrengths.join(', ')}`;
    }

    if (growthAreas.length > 0) {
      const topGrowth = growthAreas.slice(0, 5).map((g: any) => {
        const trend = g.trend === 'improving' ? ' ↑' : g.trend === 'declining' ? ' ↓' : '';
        return `${g.concept} (${Math.round(g.score * 100)}%${trend})`;
      });
      promptSection += `\nNeeds work: ${topGrowth.join(', ')}`;
    }

    if (misconceptions.length > 0) {
      const activeMisconceptions = misconceptions.slice(0, 3).map((m: any) => m.misconception);
      promptSection += `\nWatch for these misconceptions: ${activeMisconceptions.join('; ')}`;
    }

    if (strategies.length > 0) {
      const topStrategies = strategies
        .sort((a: any, b: any) => b.effectiveness - a.effectiveness)
        .slice(0, 3)
        .map((s: any) => `${s.strategy} for ${s.context}`);
      promptSection += `\nEffective teaching strategies: ${topStrategies.join('; ')}`;
    }

    if (style.preferred_explanation_length) {
      promptSection += `\nPrefers ${style.preferred_explanation_length} explanations`;
    }
    if (style.optimal_challenge_level) {
      promptSection += ` at ${style.optimal_challenge_level} difficulty.`;
    }

    if (recs.priority_topics && recs.priority_topics.length > 0) {
      promptSection += `\nRecommended focus: ${recs.priority_topics.join(', ')}`;
    }
    if (recs.suggested_approach) {
      promptSection += `\nSuggested approach: ${recs.suggested_approach}`;
    }
    if (recs.avoid && recs.avoid.length > 0) {
      promptSection += `\nAvoid: ${recs.avoid.join('; ')}`;
    }

    promptSection += '\n';

    return promptSection;
  } catch (error) {
    console.error('[LSIS] Error building profile for system prompt:', error);
    return null; // Fail silently — never block the tutor
  }
}
