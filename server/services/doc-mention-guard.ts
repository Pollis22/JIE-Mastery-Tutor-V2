/**
 * Document Mention Guard
 * 
 * Filters AI responses to prevent unprompted document acknowledgments.
 * If the AI says "I see you uploaded..." without the student asking about documents,
 * we strip or neutralize that portion of the response.
 * 
 * This is a conservative guard - we only filter clear violations.
 */

// Patterns that indicate unprompted document acknowledgment
const UNPROMPTED_DOC_PATTERNS = [
  /i (?:can )?see (?:that )?you(?:'ve| have)? uploaded/i,
  /i (?:notice|noticed) you(?:'ve| have)? (?:just )?uploaded/i,
  /you(?:'ve| have)? (?:uploaded|provided|shared) (?:\d+ )?(?:the following )?(?:documents?|files?|materials?)/i,
  /i have access to (?:your |the )?(?:following )?(?:documents?|files?)/i,
  /looking at (?:your |the )?(?:uploaded |provided )?(?:documents?|files?|materials?)/i,
  /(?:the |your )?documents? (?:you(?:'ve| have)? )?(?:uploaded|provided|shared)/i,
  /i(?:'ll| will) (?:use|reference|consult) (?:your |the )?(?:uploaded |provided )?(?:documents?|files?)/i,
  /based on (?:your |the )?uploaded (?:documents?|files?|materials?)/i,
  /here(?:'s| is) (?:a list of |what i see in )?your (?:documents?|files?|materials?)/i,
  /you have \d+ (?:documents?|files?) (?:uploaded|available)/i,
  /i (?:can )?see you(?:'ve| have)? brought (?:some |your )?(?:documents?|files?|materials?)/i,
];

// Patterns that indicate student DID ask about documents
const STUDENT_ASKED_PATTERNS = [
  /what (?:documents?|files?) (?:do )?(?:you |i )?have/i,
  /(?:use|search|look at|check) (?:my |the )?(?:documents?|files?|uploaded)/i,
  /which (?:documents?|files?) (?:are )?(?:active|available)/i,
  /(?:list|show)(?: me)? (?:my |the )?(?:documents?|files?)/i,
  /(?:what's|what is) in (?:my |the )?(?:documents?|files?)/i,
  /(?:can you )?(?:see|access|read) (?:my |the )?(?:documents?|files?|pdf|word)/i,
  /(?:use|reference) (?:my |the )?(?:uploaded|pdf|document)/i,
];

/**
 * Check if the student's message explicitly asks about documents
 */
export function didStudentAskAboutDocs(studentMessage: string): boolean {
  const normalizedMessage = studentMessage.toLowerCase().trim();
  return STUDENT_ASKED_PATTERNS.some(pattern => pattern.test(normalizedMessage));
}

/**
 * Check if AI response contains unprompted document acknowledgment
 */
export function containsUnpromptedDocMention(aiResponse: string): { 
  hasViolation: boolean; 
  matchedPattern?: string;
  matchedText?: string;
} {
  const normalizedResponse = aiResponse.toLowerCase();
  
  for (const pattern of UNPROMPTED_DOC_PATTERNS) {
    const match = normalizedResponse.match(pattern);
    if (match) {
      return {
        hasViolation: true,
        matchedPattern: pattern.toString(),
        matchedText: match[0],
      };
    }
  }
  
  return { hasViolation: false };
}

/**
 * Filter AI response to remove unprompted document mentions
 * This is a conservative approach - only modifies if clearly violating
 */
export function filterDocMentions(
  aiResponse: string, 
  studentMessage: string,
  sessionContext?: { sessionId?: string; userId?: string }
): {
  filteredResponse: string;
  wasFiltered: boolean;
  filterReason?: string;
} {
  // If student asked about documents, don't filter
  if (didStudentAskAboutDocs(studentMessage)) {
    return {
      filteredResponse: aiResponse,
      wasFiltered: false,
    };
  }
  
  const violation = containsUnpromptedDocMention(aiResponse);
  
  if (!violation.hasViolation) {
    return {
      filteredResponse: aiResponse,
      wasFiltered: false,
    };
  }
  
  // Log the violation
  console.log('[DocMentionGuard] Unprompted doc mention blocked:', JSON.stringify({
    timestamp: new Date().toISOString(),
    sessionId: sessionContext?.sessionId || 'unknown',
    userId: sessionContext?.userId || 'unknown',
    matchedPattern: violation.matchedPattern,
    matchedText: violation.matchedText,
  }));
  
  // Strategy: Try to remove the problematic sentence without breaking the response
  // This is conservative - we only remove the specific offending part
  let filtered = aiResponse;
  
  // Replace common patterns with neutral alternatives
  const replacements: [RegExp, string][] = [
    [/i (?:can )?see (?:that )?you(?:'ve| have)? uploaded[^.!?]*[.!?]?\s*/gi, ''],
    [/i (?:notice|noticed) you(?:'ve| have)? uploaded[^.!?]*[.!?]?\s*/gi, ''],
    [/you(?:'ve| have)? (?:uploaded|provided|shared) (?:the following )?(?:documents?|files?|materials?)[^.!?]*[.!?]?\s*/gi, ''],
    [/i have access to (?:your |the )?(?:following )?(?:documents?|files?)[^.!?]*[.!?]?\s*/gi, ''],
    [/looking at (?:your |the )?(?:uploaded |provided )?(?:documents?|files?|materials?)[^.!?]*[.!?]?\s*/gi, ''],
    [/based on (?:your |the )?uploaded (?:documents?|files?|materials?)[^.!?]*[.!?]?\s*/gi, ''],
    [/here(?:'s| is) (?:a list of |what i see in )?your (?:documents?|files?|materials?)[^.!?]*[.!?]?\s*/gi, ''],
    [/you have \d+ (?:documents?|files?) (?:uploaded|available)[^.!?]*[.!?]?\s*/gi, ''],
  ];
  
  for (const [pattern, replacement] of replacements) {
    filtered = filtered.replace(pattern, replacement);
  }
  
  // Clean up extra whitespace
  filtered = filtered.replace(/\s+/g, ' ').trim();
  
  // If filtering removed too much content, return a safe fallback
  if (filtered.length < 10) {
    filtered = "I'm ready to help you learn today. What would you like to work on?";
  }
  
  return {
    filteredResponse: filtered,
    wasFiltered: true,
    filterReason: `Removed unprompted document mention: "${violation.matchedText}"`,
  };
}

/**
 * Structured logging for document acknowledgment policy violations
 */
export function logDocAckBlocked(params: {
  sessionId: string;
  userId: string;
  originalResponse: string;
  filteredResponse: string;
  filterReason: string;
}): void {
  console.log('[DocMentionGuard] doc_ack_blocked_unprompted:', JSON.stringify({
    timestamp: new Date().toISOString(),
    sessionId: params.sessionId,
    userId: params.userId,
    originalLength: params.originalResponse.length,
    filteredLength: params.filteredResponse.length,
    filterReason: params.filterReason,
  }));
}
