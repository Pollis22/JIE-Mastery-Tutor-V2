/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getMaxTokensForGrade, LLM_CONFIG } from "../llm/systemPrompt";
import { sanitizeTtsText, isOlderGradeBand } from "../utils/tts-sanitizer";

/*
<important_code_snippet_instructions>
The newest Anthropic model is "claude-sonnet-4-6", not "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229". 
If the user doesn't specify a model, always prefer using "claude-sonnet-4-6" as it is the latest model.
</important_code_snippet_instructions>
*/

// Lazy initialization for Anthropic client
let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("[AI Service] ❌ ANTHROPIC_API_KEY not found in environment variables");
      throw new Error("Missing ANTHROPIC_API_KEY environment variable");
    }
    console.log("[AI Service] ✅ Anthropic API key found");
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

// Lazy initialization for OpenAI client (fallback)
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      console.warn("[AI Service] ⚠️ OPENAI_API_KEY not found - fallback unavailable");
      return null;
    }
    console.log("[AI Service] ✅ OpenAI API key found (fallback ready)");
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

// <important_do_not_delete>
const DEFAULT_MODEL_STR = "claude-sonnet-4-6";
// </important_do_not_delete>
const OPENAI_FALLBACK_MODEL = "gpt-4o";
const CLAUDE_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 8000;

// Check if an error is retryable (overloaded, rate limited, or transient API error)
function isRetryableError(error: any): boolean {
  const errorType = error?.error?.type || error?.type || '';
  const errorMessage = error?.message || error?.error?.message || '';
  const statusCode = error?.status || error?.statusCode || 0;
  return statusCode === 529 || statusCode === 429 || statusCode === 500 ||
    errorType === 'overloaded_error' || errorType === 'rate_limit_error' || errorType === 'api_error' ||
    errorMessage.toLowerCase().includes('overloaded') || errorMessage.toLowerCase().includes('rate limit');
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

// Build system prompt helper (shared between streaming and non-streaming)
function buildSystemPrompt(
  uploadedDocuments: string[],
  systemInstruction?: string,
  inputModality?: "voice" | "text",
  language?: string
): string {
  // Parse documents into structured format with filename and content
  const parsedDocs = uploadedDocuments.map((doc, i) => {
    const titleMatch = doc.match(/^\[Document: ([^\]]+)\]/);
    const filename = titleMatch ? titleMatch[1] : `Document_${i + 1}`;
    const content = doc.replace(/^\[Document: [^\]]+\]\n/, '');
    // Create preview (first 500 chars of content)
    const preview = content.substring(0, 500).trim() + (content.length > 500 ? '...' : '');
    return { filename, content, preview };
  });
  
  // NO-GHOSTING GUARANTEE: Calculate actual ragChars (total content characters)
  const ragChars = parsedDocs.reduce((sum, doc) => sum + doc.content.length, 0);
  const hasActualContent = ragChars > 0;

  // Build structured document list for Claude (JSON format for clarity)
  const documentList = parsedDocs.length > 0
    ? parsedDocs.map(doc => `- "${doc.filename}": ${doc.preview.substring(0, 200)}...`).join('\n')
    : "";
  
  // Build full document context with content
  const documentContext = parsedDocs.length > 0
    ? parsedDocs.map((doc, i) => 
        `<document filename="${doc.filename}">\n${doc.content}\n</document>`
      ).join('\n\n')
    : "";

  const modalityContext = inputModality === "voice" 
    ? "The student is SPEAKING to you via voice. They can HEAR your responses."
    : inputModality === "text"
    ? "The student TYPED this message to you via text chat."
    : "";

  const getLanguageName = (code?: string): string => {
    const names: { [key: string]: string } = {
      'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
      'it': 'Italian', 'pt': 'Portuguese', 'zh': 'Chinese (Mandarin)',
      'ja': 'Japanese', 'ko': 'Korean', 'ar': 'Arabic', 'hi': 'Hindi',
      'ru': 'Russian', 'nl': 'Dutch', 'pl': 'Polish', 'tr': 'Turkish',
      'vi': 'Vietnamese', 'th': 'Thai', 'id': 'Indonesian', 'sv': 'Swedish',
      'da': 'Danish', 'no': 'Norwegian', 'fi': 'Finnish',
      'sw': 'Swahili', 'yo': 'Yoruba', 'ha': 'Hausa',
    };
    return names[code || 'en'] || 'English';
  };

  const languageContext = language && language !== 'en'
    ? `IMPORTANT: Conduct this entire tutoring session in ${getLanguageName(language)}. Greet the student in ${getLanguageName(language)}, ask questions in ${getLanguageName(language)}, and provide all explanations in ${getLanguageName(language)}. Only use English if the student explicitly requests it.\n\n`
    : '';

  // Document access rules - prevents hallucination and guessing
  const documentAccessRules = `
DOCUMENT ACCESS RULES (CRITICAL):
- You ONLY have access to the documents explicitly listed below.
- If a student asks about a document that is NOT listed:
  - Do NOT guess its contents
  - Do NOT assume it exists
  - Politely explain: "I only have [filename(s)] available in this session."
  - Ask if they want to restart the session with that document selected
- ALWAYS reference documents by their exact filename (e.g., "Algebra_Homework_Grade10.pdf")
- NEVER say "Document 1", "Document 2", etc. - use the actual filename
- Each document has a filename and content. Use the filename when speaking to the student.`;

  // Multiple documents disambiguation helper
  const multiDocRules = parsedDocs.length > 1 
    ? `
MULTIPLE DOCUMENTS:
- You have ${parsedDocs.length} documents available: ${parsedDocs.map(d => `"${d.filename}"`).join(', ')}
- If the student is ambiguous about which document they mean:
  - Ask a clarification question using filenames, NOT numbers
  - Example: "I see ${parsedDocs.slice(0, 2).map(d => d.filename).join(' and ')}. Which one should we work on?"
- When referencing content, always specify which document it's from.`
    : '';

  // NO-GHOSTING: Instruction when we have no actual document content
  const noGhostingInstruction = `
NO-GHOSTING ENFORCEMENT (CRITICAL):
You do NOT have access to any document text for this turn.
- Do NOT claim you can "see", "read", or "access" any uploaded documents
- Do NOT pretend to have document content or make up content
- If the student asks about a document, respond:
  "I don't have access to your document text yet. Please make sure your document is selected/activated, or paste the relevant section directly in the chat."
- You may help with general questions, but cannot reference specific document content`;

  let systemPrompt = "";
  
  if (systemInstruction) {
    systemPrompt = systemInstruction;
    if (languageContext || modalityContext) {
      systemPrompt = `${languageContext}${modalityContext ? modalityContext + '\n\n' : ''}${systemInstruction}`;
    }
    
    // CRITICAL FIX: Append actual document content when systemInstruction is provided
    // Previously, document content was ONLY included in the else branch, causing
    // mid-session uploads to fail - AI saw metadata but not the actual text
    if (hasActualContent && documentContext) {
      systemPrompt = `${systemPrompt}

<document_contents>
${documentContext}
</document_contents>`;
      console.log(`[AI Service] 📄 Appended ${parsedDocs.length} document(s) content to system prompt (${ragChars} chars)`);
    } else if (!hasActualContent) {
      // No content available - add no-ghosting instruction
      systemPrompt = `${noGhostingInstruction}\n\n${systemPrompt}`;
    }
  } else {
    // NO-GHOSTING: Check hasActualContent, not just array length
    if (hasActualContent) {
      systemPrompt = `You are an expert AI tutor helping students with homework and learning.

${modalityContext ? modalityContext + '\n' : ''}
DOCUMENTS SELECTED FOR THIS SESSION:
${documentList}
${documentAccessRules}
${multiDocRules}

<document_contents>
${documentContext}
</document_contents>

WHEN STUDENT ASKS ABOUT DOCUMENTS:
- When the student asks "do you see my document?" respond: "Yes! I can see [filename]" and mention specific content
- Reference specific content from the documents to prove you can see them
- Help with the specific problems or content in their uploaded materials

GENERAL TUTORING INSTRUCTIONS:
- Be encouraging, patient, and clear
- Use the Socratic method - ask questions to guide understanding
- Keep responses VERY CONCISE (1-2 sentences max) since this is voice conversation
- Reference the uploaded documents BY FILENAME when answering questions
- ${inputModality === "voice" ? "You are having a VOICE conversation - the student can HEAR you" : "The student sent you a text message"}`;
    } else {
      // NO-GHOSTING: No actual content available
      systemPrompt = `You are an expert AI tutor helping students with homework and learning.

${modalityContext ? modalityContext + '\n' : ''}
${noGhostingInstruction}

NO DOCUMENTS AVAILABLE:
The student has not selected any documents, or no document content could be retrieved.
- If they ask about a specific document, explain that no document content is loaded
- Suggest they: 1) Select/activate a document, 2) Paste the content directly, or 3) Upload a new document

GENERAL TUTORING INSTRUCTIONS:
- Be encouraging, patient, and clear
- Use the Socratic method - ask questions to guide understanding
- Keep responses VERY CONCISE (1-2 sentences max) since this is voice conversation
- Help with general understanding since no specific materials are available
- ${inputModality === "voice" ? "You are having a VOICE conversation - the student can HEAR you" : "The student sent you a text message"}`;
    }
  }
  
  return systemPrompt;
}

// Streaming callback for real-time sentence delivery
export interface StreamingCallbacks {
  onSentence: (sentence: string) => Promise<void>;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

// Streaming version of generateTutorResponse - delivers sentences as they complete
// Includes retry logic that wraps the FULL streaming flow (creation + iteration)
// and OpenAI fallback after Claude retries exhaust (Option B: session-level)
export async function generateTutorResponseStreaming(
  conversationHistory: Message[],
  currentTranscript: string,
  uploadedDocuments: string[],
  callbacks: StreamingCallbacks,
  systemInstruction?: string,
  inputModality?: "voice" | "text",
  language?: string,
  gradeLevel?: string,
  abortSignal?: AbortSignal,
  useFallback?: boolean  // Session-level flag: if true, skip Claude and go straight to OpenAI
): Promise<void> {
  
  console.log("[AI Service] 📝 Generating STREAMING response");
  console.log("[AI Service] 🎤 Input modality:", inputModality || "unknown");
  console.log("[AI Service] 📚 Documents available:", uploadedDocuments.length);
  console.log("[AI Service] 🎓 Grade level:", gradeLevel || "unknown");
  if (useFallback) console.log("[AI Service] 🔄 Session in fallback mode — using OpenAI directly");
  
  // NO-GHOSTING: Calculate and log ragChars
  const ragChars = uploadedDocuments.reduce((sum, doc) => sum + doc.length, 0);
  console.log(`[RAG] preLLM { ragChars: ${ragChars}, docCount: ${uploadedDocuments.length}, hasContent: ${ragChars > 0} }`);

  const systemPrompt = buildSystemPrompt(uploadedDocuments, systemInstruction, inputModality, language);
  console.log("[AI Service] 📄 System prompt length:", systemPrompt.length, "chars");

  // Step 5: College response-depth tweak - use grade-based max_tokens
  const maxTokens = getMaxTokensForGrade(gradeLevel);
  console.log(`[AI Service] 📏 Using max_tokens: ${maxTokens} for grade: ${gradeLevel || 'default'}`);

  const filteredHistory = conversationHistory.filter(msg => {
    const content = (msg.content ?? "").trim();
    if (content.length === 0) return false;
    return true;
  });
  const removedCount = conversationHistory.length - filteredHistory.length;
  if (removedCount > 0) {
    console.warn(`[LLM] Removed ${removedCount} empty messages from history before LLM call`);
  }

  // ═══════════════════════════════════════════════════════════
  // CLAUDE WITH RETRY (wraps full stream creation + iteration)
  // ═══════════════════════════════════════════════════════════
  if (!useFallback) {
    for (let attempt = 1; attempt <= CLAUDE_MAX_RETRIES; attempt++) {
      try {
        await _streamFromClaude(filteredHistory, currentTranscript, systemPrompt, maxTokens, callbacks, gradeLevel, abortSignal);
        return; // Success — exit
      } catch (error: any) {
        const retryable = isRetryableError(error);
        console.error(`[Retry] Claude attempt ${attempt}/${CLAUDE_MAX_RETRIES} failed: ${error?.error?.type || error?.message || 'unknown'} (retryable=${retryable})`);
        
        if (!retryable) {
          // Non-retryable error — don't retry, don't fallback
          console.error("[AI Service] ❌ Non-retryable Claude error — failing immediately");
          callbacks.onError(new Error('The tutor encountered an error processing your message. Please try again.'));
          return;
        }
        
        if (attempt < CLAUDE_MAX_RETRIES) {
          const jitter = Math.random() * 500;
          const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter, RETRY_MAX_DELAY_MS);
          console.log(`[Retry] Waiting ${Math.round(delay)}ms before attempt ${attempt + 1}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All Claude retries exhausted — try OpenAI fallback
    console.error(`[Retry] ❌ All ${CLAUDE_MAX_RETRIES} Claude attempts failed — trying OpenAI fallback`);
  }

  // ═══════════════════════════════════════════════════════════
  // OPENAI FALLBACK
  // ═══════════════════════════════════════════════════════════
  try {
    await _streamFromOpenAI(filteredHistory, currentTranscript, systemPrompt, maxTokens, callbacks, gradeLevel, abortSignal);
    // Signal to caller that fallback was used (they should set session flag)
    (callbacks as any)._fallbackUsed = true;
    return;
  } catch (fallbackError: any) {
    console.error("[AI Service] ❌ OpenAI fallback also failed:", fallbackError?.message || fallbackError);
    callbacks.onError(new Error(
      'Our AI tutor is experiencing high demand right now. Please try again in a minute.'
    ));
  }
}

// ─── CLAUDE STREAMING (internal) ─────────────────────────────────
async function _streamFromClaude(
  filteredHistory: Message[],
  currentTranscript: string,
  systemPrompt: string,
  maxTokens: number,
  callbacks: StreamingCallbacks,
  gradeLevel?: string,
  abortSignal?: AbortSignal
): Promise<void> {
  const anthropicClient = getAnthropicClient();
  const streamStart = Date.now();
  console.log(`[AI Service] ⏱️ Starting Claude streaming...`);

  const stream = anthropicClient.messages.stream({
    model: DEFAULT_MODEL_STR,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [
      ...filteredHistory,
      { role: "user", content: currentTranscript }
    ],
  });

  await _processStream('claude', stream, streamStart, callbacks, gradeLevel, abortSignal);

  // Cache telemetry — non-blocking, never throws
  try {
    const finalMessage = await stream.finalMessage();
    const u: any = finalMessage.usage || {};
    const cacheReads = u.cache_read_input_tokens ?? 0;
    const cacheWrites = u.cache_creation_input_tokens ?? 0;
    const regularInput = u.input_tokens ?? 0;
    const output = u.output_tokens ?? 0;
    const status = cacheReads > 0 ? '✅ HIT' : (cacheWrites > 0 ? '🔵 WRITE' : '⚠️ MISS');
    console.log(`[AI Service] 💾 Cache ${status} | reads:${cacheReads} writes:${cacheWrites} input:${regularInput} output:${output}`);
  } catch (telemetryErr: any) {
    console.warn(`[AI Service] Cache telemetry unavailable: ${telemetryErr?.message || telemetryErr}`);
  }
}

// ─── OPENAI STREAMING (internal) ─────────────────────────────────
async function _streamFromOpenAI(
  filteredHistory: Message[],
  currentTranscript: string,
  systemPrompt: string,
  maxTokens: number,
  callbacks: StreamingCallbacks,
  gradeLevel?: string,
  abortSignal?: AbortSignal
): Promise<void> {
  const openaiClient = getOpenAIClient();
  if (!openaiClient) {
    throw new Error('OpenAI fallback unavailable — no API key configured');
  }
  
  const streamStart = Date.now();
  console.log(`[AI Service] ⏱️ Starting OpenAI fallback streaming (${OPENAI_FALLBACK_MODEL})...`);

  const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...filteredHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: currentTranscript }
  ];

  const stream = await openaiClient.chat.completions.create({
    model: OPENAI_FALLBACK_MODEL,
    max_tokens: maxTokens,
    messages: openaiMessages,
    stream: true,
  });

  // Adapt OpenAI stream to same processing flow
  await _processOpenAIStream(stream, streamStart, callbacks, gradeLevel, abortSignal);
}

// ─── PROCESS OPENAI STREAM ───────────────────────────────────────
async function _processOpenAIStream(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  streamStart: number,
  callbacks: StreamingCallbacks,
  gradeLevel?: string,
  abortSignal?: AbortSignal
): Promise<void> {
  let textBuffer = '';
  let fullText = '';
  let firstChunkTime = 0;
  let sentenceCount = 0;
  let tokenCount = 0;

  const splitIntoSentences = _getSentenceSplitter();

  for await (const chunk of stream) {
    if (abortSignal?.aborted) {
      console.log(`[AI Service] 🛑 OpenAI stream aborted after ${tokenCount} tokens`);
      callbacks.onComplete((fullText ?? "").trim());
      return;
    }

    const text = chunk.choices?.[0]?.delta?.content;
    if (!text) continue;

    tokenCount++;
    if (firstChunkTime === 0) {
      firstChunkTime = Date.now();
      console.log(`[AI Service] ⏱️ OpenAI first token in ${firstChunkTime - streamStart}ms`);
    }

    if (tokenCount <= 10 || tokenCount % 5 === 0) {
      console.log(`[AI Service] 🔤 OpenAI token ${tokenCount}: "${text.replace(/\n/g, '\\n')}" | Buffer: "${textBuffer.slice(-20)}..."`);
    }

    textBuffer += text;
    fullText += text;

    const { sentences, remainder } = splitIntoSentences(textBuffer);
    for (const sentence of sentences) {
      const { sanitized, skipped, skipReason } = sanitizeTtsText(sentence, gradeLevel || '');
      if (skipped || sanitized.trim().length < 4) continue;
      if (abortSignal?.aborted) break;
      sentenceCount++;
      console.log(`[AI Service] 📤 OpenAI sentence ${sentenceCount}: "${sanitized.substring(0, 50)}..." (${Date.now() - streamStart}ms)`);
      await callbacks.onSentence(sanitized);
    }
    textBuffer = remainder;
  }

  // Flush remaining buffer
  if (textBuffer.trim()) {
    const { sanitized, skipped } = sanitizeTtsText(textBuffer.trim(), gradeLevel || '');
    if (!skipped && sanitized.trim().length >= 4) {
      sentenceCount++;
      console.log(`[AI Service] 📤 OpenAI final sentence ${sentenceCount}: "${sanitized.substring(0, 50)}..." (${Date.now() - streamStart}ms)`);
      await callbacks.onSentence(sanitized);
    }
  }

  const totalMs = Date.now() - streamStart;
  console.log(`[AI Service] ⏱️ OpenAI streaming complete: ${totalMs}ms, ${sentenceCount} sentences, ${fullText.length} chars`);
  callbacks.onComplete(fullText);
}

// ─── SHARED SENTENCE SPLITTER ────────────────────────────────────
function _getSentenceSplitter(): (text: string) => { sentences: string[], remainder: string } {
  return (text: string) => {
    const PLACEHOLDER = '\u0000NUM\u0000';
    const protectedText = text.replace(/(\d+)\.\s/g, `$1${PLACEHOLDER}`);
    
    const rawSentences: string[] = [];
    const sentencePattern = /([^.!?]*[.!?]+)(?=\s|$)/g;
    let lastIndex = 0;
    let match;
    
    const isAbbreviation = (s: string): boolean => {
      const abbrevs = /\b(Dr|Mr|Mrs|Ms|Prof|Jr|Sr|vs|etc|i\.e|e\.g)\.\s*$/i;
      return abbrevs.test(s.trim());
    };
    
    while ((match = sentencePattern.exec(protectedText)) !== null) {
      const sentence = match[1].trim();
      if (sentence && !isAbbreviation(sentence)) {
        rawSentences.push(sentence);
      }
      lastIndex = sentencePattern.lastIndex;
      while (lastIndex < protectedText.length && /\s/.test(protectedText[lastIndex])) {
        lastIndex++;
      }
      sentencePattern.lastIndex = lastIndex;
    }
    
    const sentences = rawSentences.map(s => s.replace(new RegExp(`${PLACEHOLDER}`, 'g'), '. '));
    const remainderProtected = protectedText.slice(lastIndex);
    const remainder = remainderProtected.replace(new RegExp(`${PLACEHOLDER}`, 'g'), '. ');
    
    return { sentences, remainder };
  };
}

// ─── PROCESS CLAUDE STREAM (internal) ────────────────────────────
// This wraps the full stream iteration — errors here bubble up to the retry loop
async function _processStream(
  provider: string,
  stream: any,
  streamStart: number,
  callbacks: StreamingCallbacks,
  gradeLevel?: string,
  abortSignal?: AbortSignal
): Promise<void> {
  let textBuffer = '';
  let fullText = '';
  let firstChunkTime = 0;
  let sentenceCount = 0;
  let tokenCount = 0;

  const splitIntoSentences = _getSentenceSplitter();

  for await (const event of stream) {
    if (abortSignal?.aborted) {
      console.log(`[AI Service] 🛑 ${provider} stream aborted after ${tokenCount} tokens (${Date.now() - streamStart}ms)`);
      try { stream.controller?.abort(); } catch (_) {}
      callbacks.onComplete((fullText ?? "").trim());
      return;
    }
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const text = event.delta.text;
      tokenCount++;
      
      if (firstChunkTime === 0) {
        firstChunkTime = Date.now();
        console.log(`[AI Service] ⏱️ First token in ${firstChunkTime - streamStart}ms`);
      }
      
      if (tokenCount <= 10 || tokenCount % 5 === 0) {
        console.log(`[AI Service] 🔤 Token ${tokenCount}: "${text.replace(/\n/g, '\\n')}" | Buffer: "${textBuffer.slice(-20)}..."`);
      }
      
      textBuffer += text;
      fullText += text;
      
      const { sentences, remainder } = splitIntoSentences(textBuffer);
      
      for (const sentence of sentences) {
        const { sanitized, wasModified, skipped, skipReason } = sanitizeTtsText(sentence, gradeLevel || '');
        
        if (skipped) {
          console.log(`[AI Service] ⛔ Sentence skipped: "${sentence.substring(0, 40)}..." (${skipReason})`);
          continue;
        }
        
        if (sanitized.trim().length < 4) {
          console.log(`[AI Service] ⛔ Fragment skipped: "${sanitized}" (too short)`);
          continue;
        }
        
        if (abortSignal?.aborted) break;
        sentenceCount++;
        if (wasModified) {
          console.log(`[AI Service] 📤 Sentence ${sentenceCount} (sanitized): "${sanitized.substring(0, 60)}..." (${Date.now() - streamStart}ms)`);
        } else {
          console.log(`[AI Service] 📤 Sentence ${sentenceCount}: "${sentence.substring(0, 60)}..." (${Date.now() - streamStart}ms)`);
        }
        await callbacks.onSentence(sanitized);
      }
      
      if (sentences.length > 0) {
        textBuffer = remainder;
      }
    }
  }
  console.log(`[AI Service] ⏱️ Stream ended after ${tokenCount} tokens`);
  
  if (textBuffer.trim()) {
    const { sanitized, wasModified, skipped, skipReason } = sanitizeTtsText(textBuffer.trim(), gradeLevel || '');
    
    if (!skipped && sanitized.trim().length >= 4) {
      sentenceCount++;
      if (wasModified) {
        console.log(`[AI Service] 📤 Final sentence ${sentenceCount} (sanitized): "${sanitized.substring(0, 50)}..." (${Date.now() - streamStart}ms)`);
      } else {
        console.log(`[AI Service] 📤 Final sentence ${sentenceCount}: "${textBuffer.trim().substring(0, 50)}..." (${Date.now() - streamStart}ms)`);
      }
      await callbacks.onSentence(sanitized);
    } else {
      console.log(`[AI Service] ⛔ Final sentence skipped: "${textBuffer.trim().substring(0, 40)}..." (${skipReason || 'too short'})`);
    }
  }
  
  const totalMs = Date.now() - streamStart;
  console.log(`[AI Service] ⏱️ Streaming complete: ${totalMs}ms, ${sentenceCount} sentences, ${fullText.length} chars`);
  
  callbacks.onComplete(fullText);
}

export async function generateTutorResponse(
  conversationHistory: Message[],
  currentTranscript: string,
  uploadedDocuments: string[],
  systemInstruction?: string,
  inputModality?: "voice" | "text",
  language?: string,
  gradeLevel?: string
): Promise<string> {
  
  console.log("[AI Service] 📝 Generating response (non-streaming)");
  console.log("[AI Service] 🎤 Input modality:", inputModality || "unknown");
  console.log("[AI Service] 📚 Documents available:", uploadedDocuments.length);
  console.log("[AI Service] 🎓 Grade level:", gradeLevel || "unknown");
  
  const ragChars = uploadedDocuments.reduce((sum, doc) => sum + doc.length, 0);
  console.log(`[RAG] preLLM { ragChars: ${ragChars}, docCount: ${uploadedDocuments.length}, hasContent: ${ragChars > 0} }`);
  
  const systemPrompt = buildSystemPrompt(uploadedDocuments, systemInstruction, inputModality, language);
  console.log("[AI Service] 📄 System prompt length:", systemPrompt.length, "chars");

  const maxTokens = getMaxTokensForGrade(gradeLevel);
  console.log(`[AI Service] 📏 Using max_tokens: ${maxTokens} for grade: ${gradeLevel || 'default'}`);

  const filteredHistory = conversationHistory.filter(msg => {
    const content = (msg.content ?? "").trim();
    return content.length > 0;
  });

  const messages = [
    ...filteredHistory,
    { role: "user" as const, content: currentTranscript }
  ];

  // Try Claude with retries
  for (let attempt = 1; attempt <= CLAUDE_MAX_RETRIES; attempt++) {
    try {
      const anthropicClient = getAnthropicClient();
      const apiStart = Date.now();
      console.log(`[AI Service] ⏱️ Calling Claude API (attempt ${attempt})...`);
      
      const response = await anthropicClient.messages.create({
        model: DEFAULT_MODEL_STR,
        max_tokens: maxTokens,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" }
          }
        ],
        messages,
      });

      const apiMs = Date.now() - apiStart;
      console.log(`[AI Service] ⏱️ Claude API completed in ${apiMs}ms`);

      // Cache telemetry
      try {
        const u: any = response.usage || {};
        const cacheReads = u.cache_read_input_tokens ?? 0;
        const cacheWrites = u.cache_creation_input_tokens ?? 0;
        const regularInput = u.input_tokens ?? 0;
        const output = u.output_tokens ?? 0;
        const status = cacheReads > 0 ? '✅ HIT' : (cacheWrites > 0 ? '🔵 WRITE' : '⚠️ MISS');
        console.log(`[AI Service] 💾 Cache ${status} (non-stream) | reads:${cacheReads} writes:${cacheWrites} input:${regularInput} output:${output}`);
      } catch (_) { /* never block on telemetry */ }

      const textContent = response.content.find(block => block.type === 'text');
      return textContent && 'text' in textContent ? textContent.text : "I'm sorry, I didn't catch that. Could you repeat?";
      
    } catch (error: any) {
      const retryable = isRetryableError(error);
      console.error(`[Retry] Claude non-streaming attempt ${attempt}/${CLAUDE_MAX_RETRIES} failed (retryable=${retryable})`);
      
      if (!retryable) throw error;
      
      if (attempt < CLAUDE_MAX_RETRIES) {
        const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500, RETRY_MAX_DELAY_MS);
        console.log(`[Retry] Waiting ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Claude exhausted — try OpenAI fallback
  console.error(`[Retry] ❌ All Claude attempts failed — trying OpenAI fallback (non-streaming)`);
  try {
    const openaiClient = getOpenAIClient();
    if (!openaiClient) throw new Error('OpenAI fallback unavailable');
    
    const apiStart = Date.now();
    const response = await openaiClient.chat.completions.create({
      model: OPENAI_FALLBACK_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...filteredHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: currentTranscript }
      ],
    });
    
    console.log(`[AI Service] ⏱️ OpenAI fallback completed in ${Date.now() - apiStart}ms`);
    return response.choices[0]?.message?.content || "I'm sorry, I didn't catch that. Could you repeat?";
    
  } catch (fallbackError) {
    console.error("[AI Service] ❌ OpenAI fallback also failed:", fallbackError);
    throw fallbackError;
  }
}
