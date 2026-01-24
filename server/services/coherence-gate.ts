/**
 * Coherence Gate Service
 * 
 * Feature Flag: COHERENCE_GATE_ENABLED
 * 
 * Filters out background speech that is semantically unrelated to the tutoring conversation.
 * This helps reject transcripts that are ambient speech bleed-through (TV, family conversations, etc.)
 * without calling external ML services.
 * 
 * Uses a lightweight lexical similarity approach:
 * - Builds topic context from recent conversation
 * - Calculates token overlap (Jaccard similarity)
 * - Rejects low-similarity utterances with household chatter indicators
 */

export interface CoherenceGateConfig {
  enabled: boolean;
  threshold: number;       // Similarity threshold (0-1), below this = reject
  windowSize: number;      // Number of student utterances to include in context
  tutorWindow: number;     // Number of tutor utterances to include in context
}

export interface ConversationContext {
  studentUtterances: string[];  // Last N student utterances
  tutorUtterances: string[];    // Last M tutor utterances
  subject?: string;             // Current subject (Math, English, etc.)
}

export interface CoherenceCheckResult {
  isCoherent: boolean;
  similarityScore: number;
  topicKeywords: string[];
  rejectedReason?: string;
  transcript: string;
}

const HOUSEHOLD_CHATTER_INDICATORS = new Set([
  'backyard', 'slider', 'door', 'tv', 'television', 'remote', 'kitchen',
  'microwave', 'dinner', 'lunch', 'breakfast', 'mom', 'dad', 'honey',
  'sweetie', 'babe', 'hun', 'phone', 'doorbell', 'dog', 'cat', 'pet',
  'bathroom', 'shower', 'laundry', 'dishes', 'groceries', 'garbage',
  'trash', 'recycling', 'mail', 'package', 'delivery', 'pizza', 'food',
  'snack', 'drink', 'water', 'juice', 'soda', 'coffee', 'tea',
  'bedroom', 'living room', 'garage', 'car', 'keys', 'wallet', 'purse',
  'upstairs', 'downstairs', 'outside', 'inside', 'neighbor', 'friend',
  'coming over', 'going out', 'be right back', 'hold on', 'one second',
  'just a minute', 'coming', 'leaving', 'drive', 'pick up', 'drop off',
  'game', 'show', 'movie', 'channel', 'volume', 'pause', 'play'
]);

const EDUCATIONAL_CONTEXT_WORDS = new Set([
  'math', 'algebra', 'geometry', 'calculus', 'equation', 'formula', 'solve',
  'english', 'grammar', 'vocabulary', 'sentence', 'paragraph', 'essay', 'write',
  'spanish', 'french', 'language', 'translate', 'word', 'meaning',
  'science', 'biology', 'chemistry', 'physics', 'experiment', 'theory',
  'history', 'geography', 'social studies', 'civilization', 'war', 'president',
  'read', 'book', 'chapter', 'story', 'character', 'plot', 'theme',
  'problem', 'answer', 'question', 'explain', 'understand', 'help',
  'homework', 'test', 'quiz', 'exam', 'study', 'learn', 'practice',
  'number', 'add', 'subtract', 'multiply', 'divide', 'fraction', 'decimal',
  'percent', 'ratio', 'graph', 'chart', 'data', 'table', 'function',
  'variable', 'coefficient', 'exponent', 'polynomial', 'factor',
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
  'subject', 'predicate', 'clause', 'phrase', 'punctuation',
  'reading', 'writing', 'spelling', 'definition', 'example'
]);

/**
 * Get coherence gate configuration from environment
 */
export function getCoherenceGateConfig(): CoherenceGateConfig {
  return {
    enabled: process.env.COHERENCE_GATE_ENABLED === 'true',
    threshold: parseFloat(process.env.COHERENCE_GATE_THRESHOLD || '0.12'),
    windowSize: parseInt(process.env.COHERENCE_GATE_WINDOW || '3', 10),
    tutorWindow: 1,
  };
}

/**
 * Tokenize text into lowercase words, removing punctuation
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1); // Remove single-char tokens
}

/**
 * Calculate Jaccard similarity between two token sets
 */
function jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 && tokens2.length === 0) return 1.0;
  if (tokens1.length === 0 || tokens2.length === 0) return 0.0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let intersection = 0;
  const set1Array = Array.from(set1);
  for (let i = 0; i < set1Array.length; i++) {
    if (set2.has(set1Array[i])) intersection++;
  }

  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Extract top N keywords from tokens (by frequency, excluding stop words)
 */
function extractKeywords(tokens: string[], n: number = 5): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
    'this', 'that', 'these', 'those', 'it', 'its', 'you', 'your', 'me',
    'my', 'we', 'our', 'they', 'their', 'what', 'which', 'who', 'whom',
    'i', 'im', 'ok', 'okay', 'um', 'uh', 'like', 'yeah', 'yes', 'no',
    'dont', 'know', 'think', 'want', 'get', 'got', 'go', 'going'
  ]);

  const freq = new Map<string, number>();
  for (const token of tokens) {
    if (!stopWords.has(token) && token.length > 2) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word]) => word);
}

/**
 * Check if transcript contains household chatter indicators
 */
function hasHouseholdIndicators(tokens: string[]): boolean {
  for (const token of tokens) {
    if (HOUSEHOLD_CHATTER_INDICATORS.has(token)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if transcript contains educational context words
 */
function hasEducationalContext(tokens: string[]): boolean {
  for (const token of tokens) {
    if (EDUCATIONAL_CONTEXT_WORDS.has(token)) {
      return true;
    }
  }
  return false;
}

/**
 * Build topic context string from conversation history
 */
export function buildTopicContext(context: ConversationContext): string[] {
  const allText: string[] = [];

  // Add student utterances
  for (const utterance of context.studentUtterances) {
    allText.push(...tokenize(utterance));
  }

  // Add tutor utterances
  for (const utterance of context.tutorUtterances) {
    allText.push(...tokenize(utterance));
  }

  // Add subject context keywords
  if (context.subject) {
    allText.push(...tokenize(context.subject));
  }

  return allText;
}

/**
 * Check if a transcript is coherent with the conversation context
 */
export function checkCoherence(
  transcript: string,
  context: ConversationContext,
  config: CoherenceGateConfig
): CoherenceCheckResult {
  const transcriptTokens = tokenize(transcript);
  const contextTokens = buildTopicContext(context);
  const topicKeywords = extractKeywords(contextTokens, 5);

  // Calculate similarity
  const similarityScore = jaccardSimilarity(transcriptTokens, contextTokens);

  // Check for educational content in transcript (always allow)
  if (hasEducationalContext(transcriptTokens)) {
    return {
      isCoherent: true,
      similarityScore,
      topicKeywords,
      transcript,
    };
  }

  // Check for household chatter indicators
  const hasHousehold = hasHouseholdIndicators(transcriptTokens);

  // Decision: reject if low similarity AND (has household indicators OR very low similarity)
  const veryLowThreshold = config.threshold * 0.5;
  const shouldReject = 
    (similarityScore < config.threshold && hasHousehold) ||
    (similarityScore < veryLowThreshold && transcriptTokens.length > 3);

  if (shouldReject) {
    return {
      isCoherent: false,
      similarityScore,
      topicKeywords,
      rejectedReason: hasHousehold 
        ? 'household_chatter_detected' 
        : 'off_topic_low_similarity',
      transcript,
    };
  }

  return {
    isCoherent: true,
    similarityScore,
    topicKeywords,
    transcript,
  };
}

/**
 * Log coherence gate rejection event (structured telemetry)
 */
export function logCoherenceGateReject(
  sessionId: string,
  result: CoherenceCheckResult,
  threshold: number
): void {
  const truncatedText = result.transcript.length > 120 
    ? result.transcript.substring(0, 120) + '...' 
    : result.transcript;

  console.log(JSON.stringify({
    event: 'coherence_gate_reject',
    session_id: sessionId,
    transcript_len: result.transcript.length,
    similarity_score: result.similarityScore.toFixed(4),
    threshold: threshold.toFixed(4),
    last_topic_keywords: result.topicKeywords.slice(0, 5),
    rejected_text: truncatedText,
    rejected_reason: result.rejectedReason,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Get the clarification message to send when coherence gate rejects
 */
export function getCoherenceClarifyMessage(): string {
  return "I may have picked up background speech. If a TV, radio, or someone nearby is talking, please lower it. Then repeat your last question.";
}

/**
 * Extract recent conversation context from session state
 */
export function extractConversationContext(
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  subject: string | undefined,
  config: CoherenceGateConfig
): ConversationContext {
  const studentUtterances: string[] = [];
  const tutorUtterances: string[] = [];

  // Walk backwards through history to get recent utterances
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const entry = conversationHistory[i];
    
    if (entry.role === 'user' && studentUtterances.length < config.windowSize) {
      studentUtterances.unshift(entry.content);
    } else if (entry.role === 'assistant' && tutorUtterances.length < config.tutorWindow) {
      tutorUtterances.unshift(entry.content);
    }

    // Stop if we have enough
    if (studentUtterances.length >= config.windowSize && 
        tutorUtterances.length >= config.tutorWindow) {
      break;
    }
  }

  return {
    studentUtterances,
    tutorUtterances,
    subject,
  };
}
