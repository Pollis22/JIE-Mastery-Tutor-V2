import { pool } from '../db';

const PROHIBITED_TERMS = [
  'dyslexia', 'dyscalculia', 'adhd', 'autism', 'dyspraxia', 'apd',
  'learning disability', 'learning disorder', 'developmental',
  'may have', 'shows signs', 'could indicate', 'suggests a',
  'abnormal', 'concerning', 'worrying', 'atypical', 'below average',
  'diagnosis', 'disorder', 'condition', 'impairment', 'deficit',
  'special needs', 'special education', 'iep', '504'
];

export function sanitizeObservationText(text: string): { safe: boolean; text: string } {
  const lower = text.toLowerCase();
  const found = PROHIBITED_TERMS.find(term => lower.includes(term));
  if (found) {
    console.error(`[ObservationLayer] PROHIBITED TERM DETECTED: "${found}" in text: ${text.substring(0, 100)}`);
    return { safe: false, text: '' };
  }
  return { safe: true, text };
}

export interface SessionMetrics {
  userId: string;
  studentName: string;
  subject: string;
  gradeLevel: string;
  durationMinutes: number;
  transcript: Array<{ role: string; text: string; timestamp?: number }>;
  avgResponseLatencyMs: number;
  avgPromptsPerConcept: number;
  engagementScore: number;
  shortAnswerFrequency: number;
  oneWordAnswerCount: number;
  earlyDropoff: boolean;
  completedNaturally: boolean;
}

export interface ObservationFlag {
  id: string;
  category: 'processing_speed' | 'subject_gap' | 'engagement' | 'attention';
  title: string;
  observation: string;
  suggestion: string;
  severity: 'informational' | 'notable';
  detectedAtSession: number;
  dataPoints: number;
  firstDetectedAt: string;
  lastConfirmedAt: string;
  confirmedCount: number;
}

export function calculateSessionMetrics(
  transcript: Array<{ role: string; text: string; timestamp?: number }>,
  sessionEndReason: string
): Omit<SessionMetrics, 'userId' | 'studentName' | 'subject' | 'gradeLevel' | 'durationMinutes' | 'transcript'> {

  const tutorTurns = transcript.filter(t => t.role === 'assistant');
  const studentTurns = transcript.filter(t => t.role === 'user');

  const latencies: number[] = [];
  for (let i = 0; i < transcript.length - 1; i++) {
    if (transcript[i].role === 'assistant' && transcript[i + 1].role === 'user') {
      const t1 = transcript[i].timestamp;
      const t2 = transcript[i + 1].timestamp;
      if (t1 && t2) {
        const latency = t2 - t1;
        if (latency > 0 && latency < 60000) latencies.push(latency);
      }
    }
  }
  const avgResponseLatencyMs = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  // Prompts per concept
  // 500-char cap prevents end-of-session praise monologues
  // from being miscounted as concept boundaries.
  const breakthroughMarkers = ['exactly', 'correct', 'right', "that's it", 'you got it', 'great job', 'perfect', 'well done'];
  let conceptCount = 0, promptsInConcept = 0, totalPrompts = 0;
  for (const turn of tutorTurns) {
    const isShortEnough = turn.text.length < 500;
    const isBreakthrough = isShortEnough &&
      breakthroughMarkers.some(m => turn.text.toLowerCase().includes(m));
    if (isBreakthrough) {
      conceptCount++;
      totalPrompts += promptsInConcept;
      promptsInConcept = 0;
    } else {
      promptsInConcept++;
    }
  }
  const avgPromptsPerConcept = conceptCount > 0 ? totalPrompts / conceptCount : tutorTurns.length;

  const studentWords = studentTurns.reduce((acc, t) => acc + t.text.split(/\s+/).length, 0);
  const tutorWords = tutorTurns.reduce((acc, t) => acc + t.text.split(/\s+/).length, 0);
  const engagementScore = tutorWords > 0 ? Math.min((studentWords / tutorWords) * 5, 5) : 2.5;

  const shortAnswers = studentTurns.filter(t => t.text.trim().split(/\s+/).length <= 3);
  const shortAnswerFrequency = studentTurns.length > 0
    ? shortAnswers.length / studentTurns.length : 0;
  const oneWordAnswerCount = studentTurns.filter(t => t.text.trim().split(/\s+/).length === 1).length;

  const splitPoint = Math.floor(transcript.length * 2 / 3);
  const earlyStudentWords = transcript
    .slice(0, splitPoint)
    .filter(t => t.role === 'user')
    .reduce((acc, t) => acc + t.text.split(/\s+/).length, 0);
  const lateStudentWords = transcript
    .slice(splitPoint)
    .filter(t => t.role === 'user')
    .reduce((acc, t) => acc + t.text.split(/\s+/).length, 0);
  const earlyDropoff = earlyStudentWords > 10 && (lateStudentWords / earlyStudentWords) < 0.5;

  const naturalEndReasons = ['goodbye', 'timeout_natural', 'student_ended', 'session_complete', 'normal'];
  const completedNaturally = naturalEndReasons.includes(sessionEndReason);

  return {
    avgResponseLatencyMs,
    avgPromptsPerConcept,
    engagementScore,
    shortAnswerFrequency,
    oneWordAnswerCount,
    earlyDropoff,
    completedNaturally
  };
}

function evaluateRawFlagIds(obs: any): string[] {
  const ids: string[] = [];
  const sessions = obs.total_sessions;
  if (sessions < 5) return ids;

  const subjectLatency = obs.subject_latency || {};
  const subjectCounts = obs.subject_session_counts || {};
  const subjectPrompts = obs.subject_prompts || {};

  const qualifiedLatency = Object.entries(subjectLatency)
    .filter(([s]) => (subjectCounts[s] || 0) >= 3);
  if (qualifiedLatency.length >= 2 && sessions >= 8) {
    const sorted = qualifiedLatency.sort((a, b) => (b[1] as number) - (a[1] as number));
    if ((sorted[0][1] as number) / (sorted[sorted.length - 1][1] as number) >= 2.0)
      ids.push('latency_subject_gap');
  }

  const qualifiedPrompts = Object.entries(subjectPrompts)
    .filter(([s]) => (subjectCounts[s] || 0) >= 3);
  if (qualifiedPrompts.length >= 2 && sessions >= 10) {
    const sorted = qualifiedPrompts.sort((a, b) => (b[1] as number) - (a[1] as number));
    if ((sorted[0][1] as number) - (sorted[sorted.length - 1][1] as number) >= 2.5)
      ids.push('prompts_subject_gap');
  }

  if (obs.avg_engagement_score < 1.5 && sessions >= 7) ids.push('low_engagement');
  if (obs.early_dropoff_count / sessions >= 0.5 && sessions >= 8) ids.push('attention_dropoff');
  if (obs.short_answer_frequency >= 0.6 && sessions >= 6) ids.push('minimal_verbalization');
  if (obs.session_completion_rate < 0.5 && sessions >= 8) ids.push('low_completion');

  return ids;
}

function evaluateObservationFlags(obs: any): ObservationFlag[] {
  const flags: ObservationFlag[] = [];
  const sessions = obs.total_sessions;
  const now = new Date().toISOString();

  if (sessions < 5) return [];

  const recentFlagIds: string[] = obs.recentFlagIds || [];
  const flagIdCount = (id: string) => recentFlagIds.filter(f => f === id).length;

  const existingFlags: ObservationFlag[] = obs.active_flags || [];
  const getExisting = (id: string) => existingFlags.find(f => f.id === id);

  const buildFlag = (
    partial: Omit<ObservationFlag, 'firstDetectedAt' | 'lastConfirmedAt' | 'confirmedCount'>
  ): ObservationFlag => {
    const existing = getExisting(partial.id);
    return {
      ...partial,
      firstDetectedAt: existing?.firstDetectedAt || now,
      lastConfirmedAt: now,
      confirmedCount: (existing?.confirmedCount || 0) + 1
    };
  };

  const subjectLatency: Record<string, number> = obs.subject_latency || {};
  const subjectPrompts: Record<string, number> = obs.subject_prompts || {};
  const subjectCounts: Record<string, number> = obs.subject_session_counts || {};
  const name = obs.student_name || 'Your child';

  // FLAG 1: Response latency gap across subjects
  const qualifiedLatency = Object.entries(subjectLatency)
    .filter(([subj]) => (subjectCounts[subj] || 0) >= 3);

  if (qualifiedLatency.length >= 2 && sessions >= 8) {
    const sorted = qualifiedLatency.sort((a, b) => (b[1] as number) - (a[1] as number));
    const [slowSubj, slowMs] = sorted[0];
    const [fastSubj, fastMs] = sorted[sorted.length - 1];
    const ratio = (slowMs as number) / (fastMs as number);

    if (ratio >= 2.0) {
      const rawObs = `${name} tends to respond more quickly in ${fastSubj} (avg ${((fastMs as number) / 1000).toFixed(1)}s) than in ${slowSubj} (avg ${((slowMs as number) / 1000).toFixed(1)}s), observed across ${sessions} sessions.`;
      const rawSugg = `Short daily practice in ${slowSubj} — even 5-10 minutes — can help build fluency and confidence over time.`;

      const obsCheck = sanitizeObservationText(rawObs);
      const suggCheck = sanitizeObservationText(rawSugg);

      if (obsCheck.safe && suggCheck.safe && flagIdCount('latency_subject_gap') >= 2) {
        flags.push(buildFlag({
          id: 'latency_subject_gap',
          category: 'processing_speed',
          title: 'Response Time Varies by Subject',
          observation: obsCheck.text,
          suggestion: suggCheck.text,
          severity: 'informational',
          detectedAtSession: sessions,
          dataPoints: sessions
        }));
      }
    }
  }

  // FLAG 2: Prompts-per-concept gap
  const qualifiedPrompts2 = Object.entries(subjectPrompts)
    .filter(([subj]) => (subjectCounts[subj] || 0) >= 3);

  if (qualifiedPrompts2.length >= 2 && sessions >= 10) {
    const sorted = qualifiedPrompts2.sort((a, b) => (b[1] as number) - (a[1] as number));
    const [hardSubj, hardVal] = sorted[0];
    const [easySubj, easyVal] = sorted[sorted.length - 1];
    const diff = (hardVal as number) - (easyVal as number);

    if (diff >= 2.5) {
      const rawObs = `In ${easySubj}, ${name} typically reaches understanding in about ${(easyVal as number).toFixed(1)} guided prompts. In ${hardSubj}, it averages ${(hardVal as number).toFixed(1)} prompts per concept — observed across ${sessions} sessions.`;
      const rawSugg = `Additional time with ${hardSubj} concepts outside of sessions may help. Try brief review activities or ask ${name} to explain ${hardSubj} concepts back to you in their own words.`;

      const obsCheck = sanitizeObservationText(rawObs);
      const suggCheck = sanitizeObservationText(rawSugg);

      if (obsCheck.safe && suggCheck.safe && flagIdCount('prompts_subject_gap') >= 2) {
        flags.push(buildFlag({
          id: 'prompts_subject_gap',
          category: 'subject_gap',
          title: 'Concept Grasp Varies by Subject',
          observation: obsCheck.text,
          suggestion: suggCheck.text,
          severity: sessions >= 15 ? 'notable' : 'informational',
          detectedAtSession: sessions,
          dataPoints: sessions
        }));
      }
    }
  }

  // FLAG 3: Consistently brief engagement
  if (obs.avg_engagement_score < 1.5 && sessions >= 7) {
    const rawObs = `${name}'s average engagement score across ${sessions} sessions is ${obs.avg_engagement_score.toFixed(1)} out of 5. This score reflects how much ${name} elaborates in responses relative to tutor prompts within JIE Mastery sessions.`;
    const rawSugg = `Starting sessions with a subject or topic ${name} feels most confident in may help build momentum. Shorter sessions (10-15 minutes) with a clear, achievable goal can also encourage fuller participation over time.`;

    const obsCheck = sanitizeObservationText(rawObs);
    const suggCheck = sanitizeObservationText(rawSugg);

    if (obsCheck.safe && suggCheck.safe && flagIdCount('low_engagement') >= 2) {
      flags.push(buildFlag({
        id: 'low_engagement',
        category: 'engagement',
        title: 'Session Responses Are Consistently Brief',
        observation: obsCheck.text,
        suggestion: suggCheck.text,
        severity: 'informational',
        detectedAtSession: sessions,
        dataPoints: sessions
      }));
    }
  }

  // FLAG 4: Attention dropoff in majority of sessions
  const dropoffRate = obs.early_dropoff_count / sessions;
  if (dropoffRate >= 0.5 && sessions >= 8) {
    const rawObs = `In ${obs.early_dropoff_count} of ${sessions} sessions, ${name}'s participation noticeably decreased in the final portion of the session.`;
    const rawSugg = `Shorter sessions with a clear endpoint ("we'll work through 3 problems then stop") tend to help with sustained engagement. Ending on a topic ${name} enjoys can also make a difference.`;

    const obsCheck = sanitizeObservationText(rawObs);
    const suggCheck = sanitizeObservationText(rawSugg);

    if (obsCheck.safe && suggCheck.safe && flagIdCount('attention_dropoff') >= 2) {
      flags.push(buildFlag({
        id: 'attention_dropoff',
        category: 'attention',
        title: 'Engagement Often Decreases Toward End of Sessions',
        observation: obsCheck.text,
        suggestion: suggCheck.text,
        severity: 'informational',
        detectedAtSession: sessions,
        dataPoints: sessions
      }));
    }
  }

  // FLAG 5: High short-answer rate
  if (obs.short_answer_frequency >= 0.6 && sessions >= 6) {
    const rawObs = `About ${Math.round(obs.short_answer_frequency * 100)}% of ${name}'s responses across ${sessions} sessions have been 3 words or fewer. Many students become more expansive in their responses over time.`;
    const rawSugg = `At home, try asking ${name} to explain their thinking out loud — during games, meals, or daily activities. Questions like "how did you figure that out?" or "can you tell me more?" encourage elaboration naturally.`;

    const obsCheck = sanitizeObservationText(rawObs);
    const suggCheck = sanitizeObservationText(rawSugg);

    if (obsCheck.safe && suggCheck.safe && flagIdCount('minimal_verbalization') >= 2) {
      flags.push(buildFlag({
        id: 'minimal_verbalization',
        category: 'engagement',
        title: 'Student Frequently Gives Very Brief Responses',
        observation: obsCheck.text,
        suggestion: suggCheck.text,
        severity: 'informational',
        detectedAtSession: sessions,
        dataPoints: sessions
      }));
    }
  }

  // FLAG 6: Low session completion rate
  if (obs.session_completion_rate < 0.5 && sessions >= 8) {
    const rawObs = `${name} reaches a natural session endpoint in about ${Math.round(obs.session_completion_rate * 100)}% of sessions across ${sessions} total sessions.`;
    const rawSugg = `Setting a clear, achievable goal before each session — and keeping sessions shorter until that feels comfortable — can help build session stamina gradually.`;

    const obsCheck = sanitizeObservationText(rawObs);
    const suggCheck = sanitizeObservationText(rawSugg);

    if (obsCheck.safe && suggCheck.safe && flagIdCount('low_completion') >= 2) {
      flags.push(buildFlag({
        id: 'low_completion',
        category: 'attention',
        title: 'Sessions Often End Before Natural Completion',
        observation: obsCheck.text,
        suggestion: suggCheck.text,
        severity: 'informational',
        detectedAtSession: sessions,
        dataPoints: sessions
      }));
    }
  }

  return flags;
}

export async function updateLearningObservations(metrics: SessionMetrics): Promise<void> {
  await pool.query(`
    INSERT INTO learning_observations (user_id, student_name)
    VALUES ($1, $2)
    ON CONFLICT (user_id, student_name) DO NOTHING
  `, [metrics.userId, metrics.studentName]);

  const result = await pool.query(
    `SELECT * FROM learning_observations WHERE user_id = $1 AND student_name = $2`,
    [metrics.userId, metrics.studentName]
  );
  const current = result.rows[0];
  const n = current.total_sessions;

  const rollingAvg = (old: number, newVal: number) =>
    n === 0 ? newVal : (old * n + newVal) / (n + 1);

  const subjectLatency = { ...(current.subject_latency || {}) };
  const subjectPrompts = { ...(current.subject_prompts || {}) };
  const subjectEngagement = { ...(current.subject_engagement || {}) };
  const subjectSessionCounts = { ...(current.subject_session_counts || {}) };

  const subjectN = subjectSessionCounts[metrics.subject] || 0;
  subjectLatency[metrics.subject] = subjectN === 0
    ? metrics.avgResponseLatencyMs
    : (subjectLatency[metrics.subject] * subjectN + metrics.avgResponseLatencyMs) / (subjectN + 1);
  subjectPrompts[metrics.subject] = subjectN === 0
    ? metrics.avgPromptsPerConcept
    : (subjectPrompts[metrics.subject] * subjectN + metrics.avgPromptsPerConcept) / (subjectN + 1);
  subjectEngagement[metrics.subject] = subjectN === 0
    ? metrics.engagementScore
    : (subjectEngagement[metrics.subject] * subjectN + metrics.engagementScore) / (subjectN + 1);
  subjectSessionCounts[metrics.subject] = subjectN + 1;

  const qualifiedSubjects = Object.entries(subjectPrompts)
    .filter(([subj]) => (subjectSessionCounts[subj] || 0) >= 3);

  const sortedByPrompts = qualifiedSubjects.sort((a, b) => (a[1] as number) - (b[1] as number));
  const strongestSubject = sortedByPrompts[0]?.[0] || current.strongest_subject;
  const attentionSubject = sortedByPrompts[sortedByPrompts.length - 1]?.[0] || current.subject_requiring_attention;

  const updatedObs: any = {
    student_name: metrics.studentName,
    total_sessions: n + 1,
    avg_response_latency_ms: rollingAvg(current.avg_response_latency_ms, metrics.avgResponseLatencyMs),
    subject_latency: subjectLatency,
    subject_session_counts: subjectSessionCounts,
    avg_prompts_per_concept: rollingAvg(current.avg_prompts_per_concept, metrics.avgPromptsPerConcept),
    subject_prompts: subjectPrompts,
    avg_engagement_score: rollingAvg(current.avg_engagement_score, metrics.engagementScore),
    subject_engagement: subjectEngagement,
    short_answer_frequency: rollingAvg(current.short_answer_frequency, metrics.shortAnswerFrequency),
    one_word_answer_count: current.one_word_answer_count + metrics.oneWordAnswerCount,
    early_dropoff_count: current.early_dropoff_count + (metrics.earlyDropoff ? 1 : 0),
    session_completion_rate: rollingAvg(current.session_completion_rate, metrics.completedNaturally ? 1 : 0),
    strongest_subject: strongestSubject,
    subject_requiring_attention: attentionSubject,
  };

  const recentFlagWindow: string[][] = current.recent_flag_window || [];
  const rawFlagsThisSession = evaluateRawFlagIds(updatedObs);
  recentFlagWindow.push(rawFlagsThisSession);
  if (recentFlagWindow.length > 3) recentFlagWindow.shift();
  const recentFlagIds = recentFlagWindow.flat();
  updatedObs.recentFlagIds = recentFlagIds;
  updatedObs.active_flags = current.active_flags || [];

  const newFlags = evaluateObservationFlags(updatedObs);

  await pool.query(`
    UPDATE learning_observations SET
      total_sessions = $1,
      total_session_minutes = total_session_minutes + $2,
      avg_response_latency_ms = $3,
      subject_latency = $4,
      subject_session_counts = $5,
      avg_prompts_per_concept = $6,
      subject_prompts = $7,
      avg_engagement_score = $8,
      subject_engagement = $9,
      short_answer_frequency = $10,
      one_word_answer_count = $11,
      early_dropoff_count = $12,
      session_completion_rate = $13,
      strongest_subject = $14,
      subject_requiring_attention = $15,
      active_flags = $16,
      recent_flag_window = $17,
      last_updated = NOW()
    WHERE user_id = $18 AND student_name = $19
  `, [
    updatedObs.total_sessions,
    metrics.durationMinutes,
    updatedObs.avg_response_latency_ms,
    JSON.stringify(subjectLatency),
    JSON.stringify(subjectSessionCounts),
    updatedObs.avg_prompts_per_concept,
    JSON.stringify(subjectPrompts),
    updatedObs.avg_engagement_score,
    JSON.stringify(subjectEngagement),
    updatedObs.short_answer_frequency,
    updatedObs.one_word_answer_count,
    updatedObs.early_dropoff_count,
    updatedObs.session_completion_rate,
    strongestSubject,
    attentionSubject,
    JSON.stringify(newFlags),
    JSON.stringify(recentFlagWindow),
    metrics.userId,
    metrics.studentName
  ]);
}

export function renderObservationFlags(flags: ObservationFlag[], studentName: string, sessionCount: number): string {
  if (flags.length === 0) return '';

  const iconMap: Record<string, string> = {
    processing_speed: '⏱️',
    subject_gap: '📊',
    engagement: '💬',
    attention: '🎯'
  };

  const flagHTML = flags.map(flag => {
    const icon = iconMap[flag.category] || '📝';
    return `
      <div style="margin-bottom:12px; padding:12px; background:white; border-radius:6px; border:1px solid #e0e7ff;">
        <p style="margin:0 0 6px; font-weight:600; color:#3730a3;">${icon} ${flag.title}</p>
        <p style="margin:0 0 8px; color:#374151; font-size:14px;">${flag.observation}</p>
        <p style="margin:0; color:#6B7280; font-size:13px;"><strong>What you can do:</strong> ${flag.suggestion}</p>
      </div>
    `;
  }).join('');

  return `
    <div style="background:#f0f4ff; border-left:4px solid #4F46E5; padding:16px; margin:24px 0; border-radius:4px;">
      <p style="margin:0 0 12px; color:#374151; font-size:14px; font-style:normal;">
        Every student develops differently across subjects. These patterns are designed
        to support home reinforcement — not to define your child's abilities.
      </p>
      <h3 style="margin:0 0 4px; color:#4F46E5;">📊 Learning Pattern Observations</h3>
      <p style="margin:0 0 4px; color:#6B7280; font-size:12px; font-style:italic;">
        Based on ${sessionCount} sessions with ${studentName}. Behavioral patterns only — not clinical assessments.
      </p>
      <p style="margin:0 0 16px; color:#6B7280; font-size:11px;">
        These observations are generated algorithmically and have not been reviewed by licensed educational, 
        psychological, or medical professionals. Consult a qualified educator or specialist for formal evaluation.
      </p>
      ${flagHTML}
    </div>
  `;
}

export function calculateEmailMetrics(
  transcript: Array<{ role: string; text: string; timestamp?: number }>,
  gradeLevel: string
): {
  avgPromptsPerConcept: string;
  avgResponseLatencySeconds: string;
  conceptsReached: number;
  engagementRating: string;
} {
  const tutorTurns = transcript.filter(t => t.role === 'assistant');
  const studentTurns = transcript.filter(t => t.role === 'user');

  // avgPromptsPerConcept
  // 500-char cap prevents end-of-session praise monologues
  // from being miscounted as concept boundaries.
  const breakthroughMarkers = ['exactly', 'correct', 'right', "that's it", 'you got it', 'great job', 'perfect'];
  let conceptCount = 0, promptsInConcept = 0, totalPrompts = 0;
  for (const turn of tutorTurns) {
    const isShortEnough = turn.text.length < 500;
    const isBreakthrough = isShortEnough &&
      breakthroughMarkers.some(m => turn.text.toLowerCase().includes(m));
    if (isBreakthrough) { conceptCount++; totalPrompts += promptsInConcept; promptsInConcept = 0; }
    else promptsInConcept++;
  }
  const avgPromptsPerConcept = conceptCount > 0 ? (totalPrompts / conceptCount).toFixed(1) : String(tutorTurns.length);

  // avgResponseLatencyMs
  const latencies: number[] = [];
  for (let i = 0; i < transcript.length - 1; i++) {
    if (transcript[i].role === 'assistant' && transcript[i + 1].role === 'user') {
      const t1 = transcript[i].timestamp;
      const t2 = transcript[i + 1].timestamp;
      if (t1 && t2) {
        latencies.push(t2 - t1);
      }
    }
  }
  const avgResponseLatencyMs = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const avgResponseLatencySeconds = (avgResponseLatencyMs / 1000).toFixed(1);

  const conceptsReached = conceptCount;

  // engagementRating with grade-level adjustment coefficient
  const gradeLevelCoefficients: Record<string, number> = {
    'K-2': 1.65, '3-5': 1.25, '6-8': 1.0, '9-12': 0.9, 'college': 0.85
  };
  const gradeKey = ['K-2', '3-5', '6-8', '9-12', 'college'].find(k =>
    (gradeLevel || '').toLowerCase().includes(k.replace('-', '').toLowerCase())
  ) || '6-8';
  const gradeFactor = gradeLevelCoefficients[gradeKey] || 1.0;
  const studentWords = studentTurns.reduce((acc, t) => acc + t.text.split(/\s+/).length, 0);
  const tutorWords = tutorTurns.reduce((acc, t) => acc + t.text.split(/\s+/).length, 0);
  const engagementRating = tutorWords > 0
    ? Math.min((studentWords / tutorWords) * 5 * gradeFactor, 5).toFixed(1) : '2.5';

  return { avgPromptsPerConcept, avgResponseLatencySeconds, conceptsReached, engagementRating };
}
