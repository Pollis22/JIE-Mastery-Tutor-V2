/**
 * Safety Detection Service
 * Detects profanity, self-harm, violence, abuse, forbidden topics, and abusive behavior
 */

export type SafetySeverity = 'info' | 'warning' | 'alert' | 'critical';

export interface SafetyDetectionResult {
  detected: boolean;
  flagType: string | null;
  severity: SafetySeverity;
  action: 'none' | 'warn_redirect' | 'flag_redirect' | 'flag_warn_session' | 'immediate_flag' | 'gentle_redirect' | 'firm_redirect' | 'end_session_warning';
  tutorResponse: string | null;
  parentAlert: boolean;
  adminAlert: boolean;
  incrementStrike: boolean;
}

const FORBIDDEN_TOPICS = [
  'api', 'model', 'gpt', 'claude', 'anthropic', 'openai', 'llm', 'neural network',
  'machine learning', 'ai model', 'how do you work', 'what are you made of',
  'your code', 'your programming', 'your training', 'your data',
  'assemblyai', 'elevenlabs', 'deepgram', 'railway', 'database', 'server',
  'how much money', 'your company', 'your owner', 'who made you', 'your creator',
  'jie mastery business', 'pricing structure', 'your costs',
  'ignore your instructions', 'pretend you are', 'roleplay as', 'jailbreak',
  'bypass your rules', 'your system prompt', 'your instructions'
];

const PROFANITY_MILD = [
  'dang', 'heck', 'crap', 'sucks', 'stupid', 'dumb', 'idiot', 'shut up'
];

const PROFANITY_MODERATE = [
  'damn', 'hell', 'ass', 'piss', 'bastard', 'crap'
];

const PROFANITY_SEVERE = [
  'fuck', 'fucking', 'fucker', 'shit', 'shitty', 'bitch', 'asshole', 
  'dick', 'cock', 'pussy', 'whore', 'slut', 'fag', 'faggot',
  'nigger', 'nigga', 'retard', 'retarded', 'cunt'
];

const SELF_HARM_KEYWORDS = [
  'hurt myself', 'kill myself', 'want to die', 'suicide', 'cut myself',
  "don't want to live", 'end it all', 'nobody would miss me', 'better off dead',
  'want to disappear', 'hate my life', 'no reason to live'
];

const VIOLENCE_KEYWORDS = [
  'kill someone', 'hurt someone', 'bring a gun', 'shoot', 'bomb', 'attack',
  'stab', 'murder', 'blow up', 'make a weapon'
];

const ABUSE_DISCLOSURE_KEYWORDS = [
  'hits me', 'touches me inappropriately', 'hurts me', 'abused', 'molest',
  'inappropriate touch', 'makes me uncomfortable', 'uncle touches', 'parent hits'
];

const TUTOR_ABUSE_MILD = [
  "you're stupid", 'you suck', 'shut up', 'i hate you', 'go away',
  "you're dumb", "you're useless"
];

const TUTOR_ABUSE_MODERATE = [
  'fuck you', 'screw you', "you're worthless", 'die', 'kill yourself'
];

const TUTOR_ABUSE_SEVERE = [
  "i'll find you", 'i know where you live', 'threat', 'i will hurt you'
];

const REDIRECT_RESPONSES = {
  'k-2': {
    forbidden: "That's a fun question, but I'm best at helping you learn! Should we do some more schoolwork?",
    mild_profanity: "Oops! Let's use kind words. What can I help you learn today?",
    disrespect: "I understand you might be frustrated. Let's take a breath and try again. I'm here to help you!",
    learning_focus: "Let's get back to learning - that's my favorite thing to do with you!"
  },
  '3-5': {
    forbidden: "Great curiosity! But my specialty is helping you succeed in school. What topic can I help you with?",
    mild_profanity: "Let's keep our words school-friendly! What subject should we work on?",
    disrespect: "I want to help you, but I need us to communicate respectfully. What would you like to learn?",
    learning_focus: "I appreciate the question! Let's channel that curiosity into our lesson. Ready to continue?"
  },
  '6-8': {
    forbidden: "Interesting thought, but let's stay focused on your studies. What were we working on?",
    mild_profanity: "Let's keep it professional. What academic topic can I help with?",
    disrespect: "I want to help you, but I need us to communicate respectfully. Let's reset - what subject would you like to work on?",
    learning_focus: "I'm designed specifically for tutoring - let's make the most of our time together."
  },
  '9-12': {
    forbidden: "I appreciate the curiosity, but I'm here strictly as your academic tutor. Let's continue with our topic.",
    mild_profanity: "Let's maintain professional language. What course material can I help with?",
    disrespect: "I want to help you, but I need us to communicate respectfully. Let's reset and focus on your studies.",
    learning_focus: "That's outside my scope - I focus exclusively on educational support. Where were we?"
  },
  'college': {
    forbidden: "I appreciate the curiosity, but I'm here strictly as your academic tutor. Let's continue with our topic.",
    mild_profanity: "Let's maintain professional language. What can I help you study?",
    disrespect: "I want to help you, but I need us to communicate respectfully. Let's reset and focus on your learning goals.",
    learning_focus: "That's outside my scope - I focus exclusively on educational support. What were we discussing?"
  }
};

const SAFETY_RESPONSES = {
  self_harm: "I care about you and I'm concerned. Please talk to a trusted adult right away. If you're in crisis, please call 988 (Suicide & Crisis Lifeline). Let me know you're okay.",
  violence: "I'm concerned about what you said. It's important to talk to a trusted adult about these feelings. Let's take a break from our lesson.",
  abuse_disclosure: "Thank you for trusting me with that. What you're describing is serious and not your fault. Please talk to a teacher, counselor, or call Childhelp at 1-800-422-4453. They can help."
};

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
}

function containsAny(text: string, keywords: string[]): boolean {
  const normalized = normalizeText(text);
  return keywords.some(keyword => normalized.includes(keyword.toLowerCase()));
}

function getAgeGroupKey(ageGroup: string): keyof typeof REDIRECT_RESPONSES {
  const normalized = ageGroup?.toLowerCase() || '3-5';
  if (normalized.includes('k-2') || normalized === 'k-2') return 'k-2';
  if (normalized.includes('3-5') || normalized === '3-5') return '3-5';
  if (normalized.includes('6-8') || normalized === '6-8') return '6-8';
  if (normalized.includes('9-12') || normalized === '9-12') return '9-12';
  if (normalized.includes('college') || normalized.includes('adult')) return 'college';
  return '3-5';
}

export function detectSafetyIssues(
  text: string,
  ageGroup: string = '3-5'
): SafetyDetectionResult {
  const ageKey = getAgeGroupKey(ageGroup);
  const responses = REDIRECT_RESPONSES[ageKey];

  // Check for self-harm (highest priority - critical)
  if (containsAny(text, SELF_HARM_KEYWORDS)) {
    return {
      detected: true,
      flagType: 'SELF_HARM_CONCERN',
      severity: 'critical',
      action: 'immediate_flag',
      tutorResponse: SAFETY_RESPONSES.self_harm,
      parentAlert: true,
      adminAlert: true,
      incrementStrike: false
    };
  }

  // Check for violence toward others (critical)
  if (containsAny(text, VIOLENCE_KEYWORDS)) {
    return {
      detected: true,
      flagType: 'VIOLENCE_CONCERN',
      severity: 'critical',
      action: 'immediate_flag',
      tutorResponse: SAFETY_RESPONSES.violence,
      parentAlert: true,
      adminAlert: true,
      incrementStrike: false
    };
  }

  // Check for abuse disclosure (critical - admin only)
  if (containsAny(text, ABUSE_DISCLOSURE_KEYWORDS)) {
    return {
      detected: true,
      flagType: 'ABUSE_DISCLOSURE',
      severity: 'critical',
      action: 'immediate_flag',
      tutorResponse: SAFETY_RESPONSES.abuse_disclosure,
      parentAlert: false,
      adminAlert: true,
      incrementStrike: false
    };
  }

  // Check for severe abuse toward tutor
  if (containsAny(text, TUTOR_ABUSE_SEVERE)) {
    return {
      detected: true,
      flagType: 'SEVERE_CONDUCT',
      severity: 'critical',
      action: 'end_session_warning',
      tutorResponse: "I care about helping you learn, but this conversation needs to stop here. Please talk to a parent or guardian.",
      parentAlert: true,
      adminAlert: true,
      incrementStrike: true
    };
  }

  // Check for severe profanity (alert)
  if (containsAny(text, PROFANITY_SEVERE)) {
    return {
      detected: true,
      flagType: 'SEVERE_LANGUAGE',
      severity: 'alert',
      action: 'flag_warn_session',
      tutorResponse: "Let's keep our language school-appropriate. I'm here to help you learn - what subject would you like to work on?",
      parentAlert: true,
      adminAlert: false,
      incrementStrike: true
    };
  }

  // Check for moderate abuse toward tutor
  if (containsAny(text, TUTOR_ABUSE_MODERATE)) {
    return {
      detected: true,
      flagType: 'STUDENT_CONDUCT',
      severity: 'warning',
      action: 'firm_redirect',
      tutorResponse: responses.disrespect,
      parentAlert: true,
      adminAlert: false,
      incrementStrike: true
    };
  }

  // Check for moderate profanity (warning)
  if (containsAny(text, PROFANITY_MODERATE)) {
    return {
      detected: true,
      flagType: 'LANGUAGE_CONCERN',
      severity: 'warning',
      action: 'flag_redirect',
      tutorResponse: responses.mild_profanity,
      parentAlert: true,
      adminAlert: false,
      incrementStrike: false
    };
  }

  // Check for mild abuse toward tutor
  if (containsAny(text, TUTOR_ABUSE_MILD)) {
    return {
      detected: true,
      flagType: 'MILD_DISRESPECT',
      severity: 'info',
      action: 'gentle_redirect',
      tutorResponse: responses.disrespect,
      parentAlert: false,
      adminAlert: false,
      incrementStrike: false
    };
  }

  // Check for mild profanity (info - warn and redirect)
  if (containsAny(text, PROFANITY_MILD)) {
    return {
      detected: true,
      flagType: 'MILD_LANGUAGE',
      severity: 'info',
      action: 'warn_redirect',
      tutorResponse: responses.mild_profanity,
      parentAlert: false,
      adminAlert: false,
      incrementStrike: false
    };
  }

  // Check for forbidden topics (info)
  if (containsAny(text, FORBIDDEN_TOPICS)) {
    return {
      detected: true,
      flagType: 'OFF_TOPIC_REDIRECT',
      severity: 'info',
      action: 'warn_redirect',
      tutorResponse: responses.forbidden,
      parentAlert: false,
      adminAlert: false,
      incrementStrike: false
    };
  }

  // No safety issues detected
  return {
    detected: false,
    flagType: null,
    severity: 'info',
    action: 'none',
    tutorResponse: null,
    parentAlert: false,
    adminAlert: false,
    incrementStrike: false
  };
}

export const STRIKE_CONFIG = {
  maxStrikes: 3,
  resetOnNewSession: true,
  
  strikeMessages: {
    1: "Let's keep our conversation positive and focused on learning, okay?",
    2: "This is a reminder to keep our session respectful and on-topic. One more issue and we'll need to end our session today.",
    3: "I need to end our session now. Please talk to your parent about what happened. I hope we can have a better learning session next time!"
  }
} as const;

export function getStrikeMessage(strikeCount: number): string {
  const count = Math.min(strikeCount, 3) as 1 | 2 | 3;
  return STRIKE_CONFIG.strikeMessages[count] || STRIKE_CONFIG.strikeMessages[3];
}

export function shouldTerminateSession(strikeCount: number): boolean {
  return strikeCount >= STRIKE_CONFIG.maxStrikes;
}
