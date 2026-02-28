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
  // Wellbeing signals (per-session)
  frustrationSignals: number;
  negativeSelfTalkCount: number;
  avoidanceSignals: number;
  flatAffectScore: number; // 0-1, how monotone/disengaged responses seem
  // Learning difficulty signals (per-session)
  repeatedConfusionCount: number; // times student said variants of "I don't get it" on same concept
  selfCorrectionCount: number; // "wait no", "I mean", reversal patterns
  conceptRevisitCount: number; // tutor had to re-explain same concept
}

export interface ObservationFlag {
  id: string;
  category: 'processing_speed' | 'subject_gap' | 'engagement' | 'attention' | 'wellbeing' | 'learning_difficulty';
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // WELLBEING SIGNALS — detect frustration, negative self-talk, avoidance
  // These are NOT diagnoses. They are behavioral patterns parents should know about.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const frustrationPatterns = [
    /\bi\s+can'?t\s+do\s+(this|it|anything)/i,
    /\bthis\s+is\s+(too\s+hard|impossible|stupid|pointless|dumb)/i,
    /\bi\s+give\s+up/i,
    /\bwhy\s+is\s+this\s+so\s+hard/i,
    /\bi'?m\s+so\s+(frustrated|confused|lost|stuck)/i,
    /\bforget\s+it/i,
    /\bi\s+don'?t\s+care\s+anymore/i,
    /\bthis\s+is\s+(useless|a\s+waste)/i,
  ];
  
  const negativeSelfTalkPatterns = [
    /\bi'?m\s+(so\s+)?(stupid|dumb|an?\s+idiot|slow|bad\s+at|terrible|hopeless|worthless)/i,
    /\bi\s+(can\s+never|never\s+get|always\s+get\s+it\s+wrong|always\s+fail|always\s+mess)/i,
    /\beveryone\s+(else\s+)?(gets?\s+it|knows?|understands?|is\s+better)/i,
    /\bi'?m\s+not\s+(smart|good|capable)\s+enough/i,
    /\bi\s+hate\s+(myself|my\s+brain|how\s+stupid\s+i\s+am)/i,
    /\bwhat'?s\s+wrong\s+with\s+me/i,
    /\bno\s+one\s+(likes|cares\s+about)\s+me/i,
    /\bi\s+don'?t\s+(matter|belong)/i,
  ];

  const avoidancePatterns = [
    /\bi\s+don'?t\s+want\s+to\s+(do|learn|study|try|think\s+about)/i,
    /\bcan\s+we\s+(skip|stop|not\s+do|do\s+something\s+else)/i,
    /\bi\s+don'?t\s+(feel\s+like|wanna|want\s+to)/i,
    /\bthis\s+is\s+boring/i,
    /\bwhy\s+do\s+i\s+(have|need)\s+to/i,
    /\bi'?d\s+rather\s+(not|do\s+anything\s+else)/i,
  ];

  let frustrationSignals = 0;
  let negativeSelfTalkCount = 0;
  let avoidanceSignals = 0;

  for (const turn of studentTurns) {
    const text = turn.text;
    for (const p of frustrationPatterns) { if (p.test(text)) { frustrationSignals++; break; } }
    for (const p of negativeSelfTalkPatterns) { if (p.test(text)) { negativeSelfTalkCount++; break; } }
    for (const p of avoidancePatterns) { if (p.test(text)) { avoidanceSignals++; break; } }
  }

  // Flat affect: high ratio of very short, low-effort responses suggests disengagement/low mood
  const veryShortResponses = studentTurns.filter(t => {
    const words = t.text.trim().split(/\s+/);
    return words.length <= 2 && !/\?/.test(t.text); // "ok", "yes", "no", "idk" but not questions
  }).length;
  const flatAffectScore = studentTurns.length >= 5
    ? Math.min(veryShortResponses / studentTurns.length, 1) : 0;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LEARNING DIFFICULTY SIGNALS — detect patterns, NOT diagnose
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const confusionPatterns = [
    /\bi\s+(still\s+)?don'?t\s+(get|understand|know)/i,
    /\bwait\s+(what|i'?m\s+confused)/i,
    /\bcan\s+you\s+(explain|say)\s+(that|it)\s+again/i,
    /\bi'?m\s+(still\s+)?confused/i,
    /\bhuh\??$/i,
    /\bwhat\s+do\s+you\s+mean/i,
  ];

  const selfCorrectionPatterns = [
    /\bwait\s+(no|actually|never\s*mind)/i,
    /\bi\s+mean\b/i,
    /\bno\s+(wait|that'?s\s+not\s+right)/i,
    /\bsorry\s+(i\s+meant|let\s+me)/i,
    /\bactually\s+(it'?s|i\s+think|no)/i,
  ];

  let repeatedConfusionCount = 0;
  let selfCorrectionCount = 0;

  for (const turn of studentTurns) {
    for (const p of confusionPatterns) { if (p.test(turn.text)) { repeatedConfusionCount++; break; } }
    for (const p of selfCorrectionPatterns) { if (p.test(turn.text)) { selfCorrectionCount++; break; } }
  }

  // Concept revisit: tutor re-explains something it already covered
  const conceptRevisitPatterns = [
    /\b(like\s+)?i\s+(said|mentioned|explained)\s+(before|earlier)/i,
    /\blet'?s\s+(go\s+back|revisit|try\s+again)/i,
    /\bremember\s+when\s+(we|i)/i,
    /\bso\s+again\b/i,
  ];
  let conceptRevisitCount = 0;
  for (const turn of tutorTurns) {
    for (const p of conceptRevisitPatterns) { if (p.test(turn.text)) { conceptRevisitCount++; break; } }
  }

  return {
    avgResponseLatencyMs,
    avgPromptsPerConcept,
    engagementScore,
    shortAnswerFrequency,
    oneWordAnswerCount,
    earlyDropoff,
    completedNaturally,
    frustrationSignals,
    negativeSelfTalkCount,
    avoidanceSignals,
    flatAffectScore,
    repeatedConfusionCount,
    selfCorrectionCount,
    conceptRevisitCount
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

  // Wellbeing flags — require consistent patterns across sessions
  if (obs.avg_frustration_signals >= 1.5 && sessions >= 5) ids.push('persistent_frustration');
  if (obs.avg_negative_self_talk >= 1.0 && sessions >= 5) ids.push('negative_self_image');
  if (obs.avg_avoidance_signals >= 1.5 && sessions >= 5) ids.push('consistent_avoidance');
  if (obs.avg_flat_affect_score >= 0.6 && sessions >= 6) ids.push('emotional_withdrawal');

  // Learning difficulty flags — require sustained patterns
  if (obs.avg_repeated_confusion >= 2.0 && sessions >= 6) ids.push('persistent_comprehension_difficulty');
  if (obs.avg_self_correction >= 2.0 && sessions >= 6) ids.push('frequent_self_correction');
  if (obs.avg_concept_revisit >= 1.5 && sessions >= 6) ids.push('concept_retention_difficulty');

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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // WELLBEING FLAGS — emotional patterns parents should know about
  // These are NOT clinical assessments. Language is deliberately gentle.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // FLAG 7: Persistent frustration across sessions
  if (obs.avg_frustration_signals >= 1.5 && sessions >= 5) {
    const rawObs = `Across ${sessions} sessions, ${name} has expressed frustration an average of ${obs.avg_frustration_signals.toFixed(1)} times per session — using phrases like "I can't do this" or "this is too hard." This may reflect the difficulty of the material or how ${name} is feeling about learning right now.`;
    const rawSugg = `Try checking in with ${name} before sessions to gauge their mood. Starting with easier warm-up material can build confidence. If frustration persists across subjects, a conversation about what's making learning feel hard could be helpful.`;

    const obsCheck = sanitizeObservationText(rawObs);
    const suggCheck = sanitizeObservationText(rawSugg);

    if (obsCheck.safe && suggCheck.safe && flagIdCount('persistent_frustration') >= 2) {
      flags.push(buildFlag({
        id: 'persistent_frustration',
        category: 'wellbeing',
        title: 'Frequent Expressions of Frustration During Sessions',
        observation: obsCheck.text,
        suggestion: suggCheck.text,
        severity: sessions >= 8 ? 'notable' : 'informational',
        detectedAtSession: sessions,
        dataPoints: sessions
      }));
    }
  }

  // FLAG 8: Negative self-talk pattern
  if (obs.avg_negative_self_talk >= 1.0 && sessions >= 5) {
    const rawObs = `${name} has used self-critical language in multiple sessions — statements like "I'm stupid" or "I never get anything right." Over ${sessions} sessions, this has averaged ${obs.avg_negative_self_talk.toFixed(1)} instances per session.`;
    const rawSugg = `Consistent self-critical language during learning can sometimes reflect how a student feels about themselves more broadly. Positive reinforcement at home — celebrating effort over results — can make a real difference. If this pattern concerns you, a school counselor can offer additional perspective.`;

    const obsCheck = sanitizeObservationText(rawObs);
    const suggCheck = sanitizeObservationText(rawSugg);

    if (obsCheck.safe && suggCheck.safe && flagIdCount('negative_self_image') >= 2) {
      flags.push(buildFlag({
        id: 'negative_self_image',
        category: 'wellbeing',
        title: 'Pattern of Self-Critical Language During Learning',
        observation: obsCheck.text,
        suggestion: suggCheck.text,
        severity: 'notable',
        detectedAtSession: sessions,
        dataPoints: sessions
      }));
    }
  }

  // FLAG 9: Consistent avoidance behavior
  if (obs.avg_avoidance_signals >= 1.5 && sessions >= 5) {
    const rawObs = `${name} has frequently expressed reluctance to engage with material — phrases like "I don't want to do this" or "can we skip this" — averaging ${obs.avg_avoidance_signals.toFixed(1)} times per session over ${sessions} sessions.`;
    const rawSugg = `Avoidance can stem from many things: difficulty with the subject, feeling overwhelmed, or simply not connecting with the topic. Giving ${name} some choice in what they study, or breaking work into smaller pieces, may help. If avoidance seems to extend beyond academics, checking in about how they're feeling overall could be valuable.`;

    const obsCheck = sanitizeObservationText(rawObs);
    const suggCheck = sanitizeObservationText(rawSugg);

    if (obsCheck.safe && suggCheck.safe && flagIdCount('consistent_avoidance') >= 2) {
      flags.push(buildFlag({
        id: 'consistent_avoidance',
        category: 'wellbeing',
        title: 'Frequent Avoidance or Reluctance to Engage',
        observation: obsCheck.text,
        suggestion: suggCheck.text,
        severity: sessions >= 8 ? 'notable' : 'informational',
        detectedAtSession: sessions,
        dataPoints: sessions
      }));
    }
  }

  // FLAG 10: Emotional withdrawal (flat affect)
  if (obs.avg_flat_affect_score >= 0.6 && sessions >= 6) {
    const rawObs = `In recent sessions, approximately ${Math.round(obs.avg_flat_affect_score * 100)}% of ${name}'s responses have been minimal (one or two words like "ok", "yes", "no"). While some students are naturally concise, a consistently flat response pattern across ${sessions} sessions can sometimes indicate low energy or disengagement.`;
    const rawSugg = `If this doesn't match how ${name} usually communicates, it may be worth checking in about how they're feeling — about school, friends, or life in general. Sometimes low engagement in tutoring reflects something bigger going on. A school counselor or pediatrician can help if you have concerns.`;

    const obsCheck = sanitizeObservationText(rawObs);
    const suggCheck = sanitizeObservationText(rawSugg);

    if (obsCheck.safe && suggCheck.safe && flagIdCount('emotional_withdrawal') >= 2) {
      flags.push(buildFlag({
        id: 'emotional_withdrawal',
        category: 'wellbeing',
        title: 'Consistently Minimal Responses May Indicate Low Engagement',
        observation: obsCheck.text,
        suggestion: suggCheck.text,
        severity: 'notable',
        detectedAtSession: sessions,
        dataPoints: sessions
      }));
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LEARNING DIFFICULTY FLAGS — patterns that may warrant professional evaluation
  // NOT diagnoses. Framed as observations with actionable suggestions.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // FLAG 11: Persistent comprehension difficulty
  if (obs.avg_repeated_confusion >= 2.0 && sessions >= 6) {
    const rawObs = `${name} frequently expresses confusion or asks for re-explanation — an average of ${obs.avg_repeated_confusion.toFixed(1)} times per session across ${sessions} sessions. This is higher than typical for ${name}'s grade level.`;
    const rawSugg = `Some students benefit from material being presented in different ways — visual aids, hands-on examples, or breaking concepts into smaller steps. If ${name} consistently struggles to retain explanations across sessions, discussing this with their teacher could help identify whether a different instructional approach might help.`;

    const obsCheck = sanitizeObservationText(rawObs);
    const suggCheck = sanitizeObservationText(rawSugg);

    if (obsCheck.safe && suggCheck.safe && flagIdCount('persistent_comprehension_difficulty') >= 2) {
      flags.push(buildFlag({
        id: 'persistent_comprehension_difficulty',
        category: 'learning_difficulty',
        title: 'Frequent Requests for Re-Explanation',
        observation: obsCheck.text,
        suggestion: suggCheck.text,
        severity: sessions >= 10 ? 'notable' : 'informational',
        detectedAtSession: sessions,
        dataPoints: sessions
      }));
    }
  }

  // FLAG 12: Frequent self-correction pattern
  if (obs.avg_self_correction >= 2.0 && sessions >= 6) {
    const rawObs = `${name} frequently corrects themselves mid-response — "wait, no" or "I mean" — averaging ${obs.avg_self_correction.toFixed(1)} times per session across ${sessions} sessions. Self-correction shows active thinking, but a high frequency may indicate processing challenges.`;
    const rawSugg = `Self-correction is actually a positive sign of metacognition — ${name} recognizes errors. To support this, encourage ${name} to slow down and think before answering. If you notice similar patterns in homework or daily tasks, their teacher may have helpful strategies.`;

    const obsCheck = sanitizeObservationText(rawObs);
    const suggCheck = sanitizeObservationText(rawSugg);

    if (obsCheck.safe && suggCheck.safe && flagIdCount('frequent_self_correction') >= 2) {
      flags.push(buildFlag({
        id: 'frequent_self_correction',
        category: 'learning_difficulty',
        title: 'Frequent Mid-Response Self-Corrections',
        observation: obsCheck.text,
        suggestion: suggCheck.text,
        severity: 'informational',
        detectedAtSession: sessions,
        dataPoints: sessions
      }));
    }
  }

  // FLAG 13: Concept retention difficulty
  if (obs.avg_concept_revisit >= 1.5 && sessions >= 6) {
    const rawObs = `The tutor has needed to revisit or re-explain concepts an average of ${obs.avg_concept_revisit.toFixed(1)} times per session with ${name} across ${sessions} sessions. This suggests ${name} may benefit from additional reinforcement between sessions.`;
    const rawSugg = `Spaced repetition — briefly reviewing previously covered material at the start of each session or at home — can significantly improve retention. If ${name} consistently struggles to recall concepts from prior sessions, their teacher or a school learning specialist may be able to suggest targeted support.`;

    const obsCheck = sanitizeObservationText(rawObs);
    const suggCheck = sanitizeObservationText(rawSugg);

    if (obsCheck.safe && suggCheck.safe && flagIdCount('concept_retention_difficulty') >= 2) {
      flags.push(buildFlag({
        id: 'concept_retention_difficulty',
        category: 'learning_difficulty',
        title: 'Concepts Often Need to Be Revisited Across Sessions',
        observation: obsCheck.text,
        suggestion: suggCheck.text,
        severity: sessions >= 10 ? 'notable' : 'informational',
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
    // Wellbeing metrics (rolling averages)
    avg_frustration_signals: rollingAvg(current.avg_frustration_signals || 0, metrics.frustrationSignals),
    avg_negative_self_talk: rollingAvg(current.avg_negative_self_talk || 0, metrics.negativeSelfTalkCount),
    avg_avoidance_signals: rollingAvg(current.avg_avoidance_signals || 0, metrics.avoidanceSignals),
    avg_flat_affect_score: rollingAvg(current.avg_flat_affect_score || 0, metrics.flatAffectScore),
    // Learning difficulty metrics (rolling averages)
    avg_repeated_confusion: rollingAvg(current.avg_repeated_confusion || 0, metrics.repeatedConfusionCount),
    avg_self_correction: rollingAvg(current.avg_self_correction || 0, metrics.selfCorrectionCount),
    avg_concept_revisit: rollingAvg(current.avg_concept_revisit || 0, metrics.conceptRevisitCount),
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
      avg_frustration_signals = $18,
      avg_negative_self_talk = $19,
      avg_avoidance_signals = $20,
      avg_flat_affect_score = $21,
      avg_repeated_confusion = $22,
      avg_self_correction = $23,
      avg_concept_revisit = $24,
      last_updated = NOW()
    WHERE user_id = $25 AND student_name = $26
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
    updatedObs.avg_frustration_signals,
    updatedObs.avg_negative_self_talk,
    updatedObs.avg_avoidance_signals,
    updatedObs.avg_flat_affect_score,
    updatedObs.avg_repeated_confusion,
    updatedObs.avg_self_correction,
    updatedObs.avg_concept_revisit,
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
    attention: '🎯',
    wellbeing: '💛',
    learning_difficulty: '📖'
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
