export type EndpointingProfile = {
  end_of_turn_confidence_threshold: number;
  min_end_of_turn_silence_when_confident: number;
  max_turn_silence: number;
};

export type BandName = 'K2' | 'ELEMENTARY' | 'MIDDLE' | 'HIGH' | 'COLLEGE';

export const ENDPOINTING_PROFILES: Record<BandName, EndpointingProfile> = {
  K2: {
    end_of_turn_confidence_threshold: 0.70,
    min_end_of_turn_silence_when_confident: 1200,
    max_turn_silence: 8000,
  },
  ELEMENTARY: {
    end_of_turn_confidence_threshold: 0.60,
    min_end_of_turn_silence_when_confident: 1000,
    max_turn_silence: 6000,
  },
  MIDDLE: {
    end_of_turn_confidence_threshold: 0.50,
    min_end_of_turn_silence_when_confident: 900,
    max_turn_silence: 5000,
  },
  HIGH: {
    end_of_turn_confidence_threshold: 0.50,
    min_end_of_turn_silence_when_confident: 900,
    max_turn_silence: 5000,
  },
  COLLEGE: {
    end_of_turn_confidence_threshold: 0.50,
    min_end_of_turn_silence_when_confident: 900,
    max_turn_silence: 5000,
  },
};

const TUTOR_PERSONA_TO_BAND: Record<string, BandName> = {
  'buddy the learning bear': 'K2',
  'buddy': 'K2',
  'ms. sunny': 'ELEMENTARY',
  'ms sunny': 'ELEMENTARY',
  'professor pepper': 'ELEMENTARY',
  'coach alex': 'MIDDLE',
  'dr. nova': 'MIDDLE',
  'dr nova': 'MIDDLE',
  'professor taylor': 'HIGH',
  'professor ace': 'HIGH',
  'dr. morgan': 'COLLEGE',
  'dr morgan': 'COLLEGE',
};

export function getBandFromTutorPersona(persona: string | undefined): BandName | null {
  if (!persona) return null;
  const normalized = persona.toLowerCase().trim();
  return TUTOR_PERSONA_TO_BAND[normalized] || null;
}

export function getBandFromGradeLevel(gradeLevel: string | number | undefined): BandName {
  if (gradeLevel === undefined || gradeLevel === null) return 'MIDDLE';
  
  const normalized = typeof gradeLevel === 'string' 
    ? gradeLevel.toLowerCase().trim() 
    : String(gradeLevel);
  
  if (normalized === 'k' || normalized === 'k-2' || normalized === 'kindergarten') return 'K2';
  if (normalized === '1' || normalized === '2') return 'K2';
  if (normalized === '3-5' || normalized === 'elementary') return 'ELEMENTARY';
  if (['3', '4', '5'].includes(normalized)) return 'ELEMENTARY';
  if (normalized === '6-8' || normalized === 'middle') return 'MIDDLE';
  if (['6', '7', '8'].includes(normalized)) return 'MIDDLE';
  if (normalized === '9-12' || normalized === 'high') return 'HIGH';
  if (['9', '10', '11', '12'].includes(normalized)) return 'HIGH';
  if (normalized === 'college' || normalized === 'adult' || normalized === 'university') return 'COLLEGE';
  
  const numericGrade = parseInt(normalized, 10);
  if (!isNaN(numericGrade)) {
    if (numericGrade <= 2) return 'K2';
    if (numericGrade <= 5) return 'ELEMENTARY';
    if (numericGrade <= 8) return 'MIDDLE';
    if (numericGrade <= 12) return 'HIGH';
    return 'COLLEGE';
  }
  
  return 'MIDDLE';
}

export function getEndpointingProfile(
  tutorPersona?: string,
  gradeLevel?: string | number
): { band: BandName; profile: EndpointingProfile } {
  const bandFromPersona = getBandFromTutorPersona(tutorPersona);
  const band = bandFromPersona || getBandFromGradeLevel(gradeLevel);
  return { band, profile: ENDPOINTING_PROFILES[band] };
}

const MATH_KEYTERMS: string[] = [
  'algebra', 'equation', 'variable', 'fraction', 'denominator', 'numerator',
  'polynomial', 'quadratic', 'exponent', 'coefficient', 'integer', 'decimal',
  'geometry', 'triangle', 'hypotenuse', 'perpendicular', 'parallel', 'circumference',
  'radius', 'diameter', 'perimeter', 'area', 'volume', 'angle', 'degrees',
  'sine', 'cosine', 'tangent', 'calculus', 'derivative', 'integral',
  'probability', 'statistics', 'mean', 'median', 'mode', 'standard deviation',
  'slope', 'intercept', 'linear', 'function', 'graph', 'coordinate',
  'pi', 'squared', 'cubed', 'square root', 'absolute value',
  'greater than', 'less than', 'equal to', 'inequality',
  'multiplication', 'division', 'addition', 'subtraction',
  'plus', 'minus', 'times', 'divided by', 'remainder',
];

const ENGLISH_KEYTERMS: string[] = [
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
  'conjunction', 'article', 'subject', 'predicate', 'clause', 'phrase',
  'paragraph', 'essay', 'thesis', 'topic sentence', 'conclusion',
  'metaphor', 'simile', 'alliteration', 'onomatopoeia', 'personification',
  'hyperbole', 'imagery', 'symbolism', 'irony', 'foreshadowing',
  'protagonist', 'antagonist', 'narrator', 'point of view',
  'vocabulary', 'synonym', 'antonym', 'homophone', 'prefix', 'suffix',
  'syllable', 'consonant', 'vowel', 'punctuation', 'apostrophe',
  'comma', 'semicolon', 'quotation', 'exclamation',
  'reading comprehension', 'inference', 'context clues', 'main idea',
];

const SPANISH_KEYTERMS: string[] = [
  'conjugation', 'conjugar', 'subjunctive', 'subjuntivo',
  'preterite', 'pretérito', 'imperfect', 'imperfecto',
  'indicative', 'indicativo', 'infinitive', 'infinitivo',
  'reflexive', 'reflexivo', 'gerund', 'gerundio',
  'masculine', 'feminine', 'plural', 'singular',
  'ser', 'estar', 'haber', 'tener', 'hacer',
  'sustantivo', 'verbo', 'adjetivo', 'adverbio',
  'acento', 'tilde', 'ñ', 'español',
  'vocabulario', 'gramática', 'oración', 'párrafo',
  'presente', 'pasado', 'futuro', 'condicional',
  'pronunciation', 'pronunciación',
];

const SUBJECT_KEYTERMS: Record<string, string[]> = {
  'math': MATH_KEYTERMS,
  'mathematics': MATH_KEYTERMS,
  'english': ENGLISH_KEYTERMS,
  'reading': ENGLISH_KEYTERMS,
  'writing': ENGLISH_KEYTERMS,
  'language arts': ENGLISH_KEYTERMS,
  'spanish': SPANISH_KEYTERMS,
  'español': SPANISH_KEYTERMS,
};

const COMMON_TUTORING_KEYTERMS: string[] = [
  'correct', 'incorrect', 'answer', 'question', 'explain',
  'example', 'practice', 'homework', 'quiz', 'test',
  'hint', 'help', 'understand', 'confused', 'repeat',
  'step by step', 'show me', 'try again', 'next one',
  'I think', "I don't know", 'is it', 'what about',
];

const MAX_KEYTERM_LENGTH = 50;
const MAX_KEYTERMS_COUNT = 100;

export function sanitizeKeyterms(rawTerms: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of rawTerms) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_KEYTERM_LENGTH) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(trimmed);
    if (result.length >= MAX_KEYTERMS_COUNT) break;
  }
  return result;
}

export function getSessionKeyterms(opts: { subject?: string; gradeBand?: BandName; studentName?: string }): string[] {
  const base = [opts.studentName].filter(Boolean) as string[];
  const normalized = (opts.subject || '').toLowerCase().trim();
  const subjectTerms = SUBJECT_KEYTERMS[normalized] || [];
  return sanitizeKeyterms([...base, ...COMMON_TUTORING_KEYTERMS, ...subjectTerms]);
}

export function getKeytermsPrompt(subject?: string): string | null {
  if (!subject) return null;

  const normalized = subject.toLowerCase().trim();
  const subjectTerms = SUBJECT_KEYTERMS[normalized] || [];
  const allTerms = [...COMMON_TUTORING_KEYTERMS, ...subjectTerms];
  const sanitized = sanitizeKeyterms(allTerms);

  if (sanitized.length === 0) return null;

  return sanitized.join(', ');
}

export function getKeytermsForUrl(opts: { subject?: string; gradeBand?: BandName; studentName?: string }): string | null {
  const terms = getSessionKeyterms(opts);
  if (terms.length === 0) return null;
  return encodeURIComponent(JSON.stringify(terms));
}
