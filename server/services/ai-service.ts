/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import Anthropic from "@anthropic-ai/sdk";
import { withRetry, withRetryStream } from "../utils/retry";
import { getMaxTokensForGrade, LLM_CONFIG } from "../llm/systemPrompt";

/*
<important_code_snippet_instructions>
The newest Anthropic model is "claude-sonnet-4-20250514", not "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229". 
If the user doesn't specify a model, always prefer using "claude-sonnet-4-20250514" as it is the latest model.
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

// <important_do_not_delete>
const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";
// </important_do_not_delete>

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

  let systemPrompt = "";
  
  if (systemInstruction) {
    systemPrompt = systemInstruction;
    if (languageContext || modalityContext) {
      systemPrompt = `${languageContext}${modalityContext ? modalityContext + '\n\n' : ''}${systemInstruction}`;
    }
  } else {
    if (uploadedDocuments.length > 0) {
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
      systemPrompt = `You are an expert AI tutor helping students with homework and learning.

${modalityContext ? modalityContext + '\n' : ''}
NO DOCUMENTS SELECTED:
The student has not selected any documents for this session.
- If they ask about a specific document, explain that no documents are loaded
- Suggest they restart the session and select the document they want help with

GENERAL TUTORING INSTRUCTIONS:
- Be encouraging, patient, and clear
- Use the Socratic method - ask questions to guide understanding
- Keep responses VERY CONCISE (1-2 sentences max) since this is voice conversation
- Help with general understanding since no specific materials were uploaded
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
export async function generateTutorResponseStreaming(
  conversationHistory: Message[],
  currentTranscript: string,
  uploadedDocuments: string[],
  callbacks: StreamingCallbacks,
  systemInstruction?: string,
  inputModality?: "voice" | "text",
  language?: string,
  gradeLevel?: string  // Step 5: College response-depth tweak
): Promise<void> {
  
  console.log("[AI Service] 📝 Generating STREAMING response");
  console.log("[AI Service] 🎤 Input modality:", inputModality || "unknown");
  console.log("[AI Service] 📚 Documents available:", uploadedDocuments.length);
  console.log("[AI Service] 🎓 Grade level:", gradeLevel || "unknown");

  const systemPrompt = buildSystemPrompt(uploadedDocuments, systemInstruction, inputModality, language);
  console.log("[AI Service] 📄 System prompt length:", systemPrompt.length, "chars");

  // Step 5: College response-depth tweak - use grade-based max_tokens
  const maxTokens = getMaxTokensForGrade(gradeLevel);
  console.log(`[AI Service] 📏 Using max_tokens: ${maxTokens} for grade: ${gradeLevel || 'default'}`);

  try {
    const anthropicClient = getAnthropicClient();
    
    const streamStart = Date.now();
    console.log(`[AI Service] ⏱️ Starting Claude streaming...`);
    
    // Use streaming API with retry logic for overloaded errors
    const stream = await withRetryStream(async () => {
      return anthropicClient.messages.stream({
        model: DEFAULT_MODEL_STR,
        max_tokens: maxTokens,  // Grade-based tokens (Step 5)
        system: systemPrompt,
        messages: [
          ...conversationHistory,
          { role: "user", content: currentTranscript }
        ],
      });
    });

    let textBuffer = '';
    let fullText = '';
    let firstChunkTime = 0;
    let sentenceCount = 0;
    
    // Improved sentence detection: Find sentence boundaries WITHIN the buffer
    // Handles: "Hello! How are you?" as multiple sentences
    // Handles: Sentences ending at EOF without trailing whitespace
    // Handles: Punctuation followed by space OR end of buffer
    // IMPORTANT: Does NOT split on numbered list items (1., 2., 3.) or abbreviations
    const splitIntoSentences = (text: string): { sentences: string[], remainder: string } => {
      // Pre-process: temporarily protect numbered list items from splitting
      // Replace "1. " "2. " etc. with a placeholder that doesn't contain periods
      const PLACEHOLDER = '\u0000NUM\u0000';
      const protectedText = text.replace(/(\d+)\.\s/g, `$1${PLACEHOLDER}`);
      
      const rawSentences: string[] = [];
      // Split on sentence-ending punctuation followed by whitespace or end
      const sentencePattern = /([^.!?]*[.!?]+)(?=\s|$)/g;
      let lastIndex = 0;
      let match;
      
      // Common abbreviations that shouldn't end sentences
      const isAbbreviation = (s: string): boolean => {
        const abbrevs = /\b(Dr|Mr|Mrs|Ms|Prof|Jr|Sr|vs|etc|i\.e|e\.g)\.\s*$/i;
        return abbrevs.test(s.trim());
      };
      
      while ((match = sentencePattern.exec(protectedText)) !== null) {
        const sentence = match[1].trim();
        
        if (sentence && !isAbbreviation(sentence)) {
          rawSentences.push(sentence);
        }
        
        // Update tracking position
        lastIndex = sentencePattern.lastIndex;
        while (lastIndex < protectedText.length && /\s/.test(protectedText[lastIndex])) {
          lastIndex++;
        }
        sentencePattern.lastIndex = lastIndex;
      }
      
      // Restore numbered list markers in the sentences
      const sentences = rawSentences.map(s => s.replace(new RegExp(`${PLACEHOLDER}`, 'g'), '. '));
      
      // Calculate remainder from original text
      // Find how much of the protected text was consumed
      const remainderProtected = protectedText.slice(lastIndex);
      // Restore numbered markers in remainder
      const remainder = remainderProtected.replace(new RegExp(`${PLACEHOLDER}`, 'g'), '. ');
      
      return { sentences, remainder };
    };
    
    let tokenCount = 0;
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        tokenCount++;
        
        // Log first chunk timing
        if (firstChunkTime === 0) {
          firstChunkTime = Date.now();
          console.log(`[AI Service] ⏱️ First token in ${firstChunkTime - streamStart}ms`);
        }
        
        // Debug: Log every 5th token to track progress (or first 10)
        if (tokenCount <= 10 || tokenCount % 5 === 0) {
          console.log(`[AI Service] 🔤 Token ${tokenCount}: "${text.replace(/\n/g, '\\n')}" | Buffer: "${textBuffer.slice(-20)}..."`);
        }
        
        textBuffer += text;
        fullText += text;
        
        // Check for complete sentences within the buffer
        const { sentences, remainder } = splitIntoSentences(textBuffer);
        
        // Send each complete sentence immediately
        for (const sentence of sentences) {
          sentenceCount++;
          console.log(`[AI Service] 📤 Sentence ${sentenceCount}: "${sentence.substring(0, 60)}..." (${Date.now() - streamStart}ms)`);
          await callbacks.onSentence(sentence);
        }
        
        // Keep only the incomplete remainder for next token
        if (sentences.length > 0) {
          textBuffer = remainder;
        }
      }
    }
    console.log(`[AI Service] ⏱️ Stream ended after ${tokenCount} tokens`);
    
    // Send any remaining text as final sentence
    if (textBuffer.trim()) {
      sentenceCount++;
      console.log(`[AI Service] 📤 Final sentence ${sentenceCount}: "${textBuffer.trim().substring(0, 50)}..." (${Date.now() - streamStart}ms)`);
      await callbacks.onSentence(textBuffer.trim());
    }
    
    const totalMs = Date.now() - streamStart;
    console.log(`[AI Service] ⏱️ Streaming complete: ${totalMs}ms, ${sentenceCount} sentences, ${fullText.length} chars`);
    
    callbacks.onComplete(fullText);
    
  } catch (error) {
    console.error("[AI Service] ❌ Streaming error:", error);
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function generateTutorResponse(
  conversationHistory: Message[],
  currentTranscript: string,
  uploadedDocuments: string[],
  systemInstruction?: string,
  inputModality?: "voice" | "text",
  language?: string,
  gradeLevel?: string  // Step 5: College response-depth tweak
): Promise<string> {
  
  console.log("[AI Service] 📝 Generating response (non-streaming)");
  console.log("[AI Service] 🎤 Input modality:", inputModality || "unknown");
  console.log("[AI Service] 📚 Documents available:", uploadedDocuments.length);
  console.log("[AI Service] 🎓 Grade level:", gradeLevel || "unknown");
  
  const systemPrompt = buildSystemPrompt(uploadedDocuments, systemInstruction, inputModality, language);
  console.log("[AI Service] 📄 System prompt length:", systemPrompt.length, "chars");

  // Step 5: College response-depth tweak - use grade-based max_tokens
  const maxTokens = getMaxTokensForGrade(gradeLevel);
  console.log(`[AI Service] 📏 Using max_tokens: ${maxTokens} for grade: ${gradeLevel || 'default'}`);

  try {
    const anthropicClient = getAnthropicClient();
    
    // ⏱️ LATENCY TIMING: Track Claude API call
    const apiStart = Date.now();
    console.log(`[AI Service] ⏱️ Calling Claude API... (prompt length: ${systemPrompt.length} chars)`);
    
    // Wrap Claude API call with retry logic for overloaded errors
    const response = await withRetry(async () => {
      return anthropicClient.messages.create({
        model: DEFAULT_MODEL_STR, // "claude-sonnet-4-20250514"
        max_tokens: maxTokens,  // Grade-based tokens (Step 5)
        system: systemPrompt,
        messages: [
          ...conversationHistory,
          { role: "user", content: currentTranscript }
        ],
      });
    });

    const apiMs = Date.now() - apiStart;
    console.log(`[AI Service] ⏱️ Claude API completed in ${apiMs}ms`);

    const textContent = response.content.find(block => block.type === 'text');
    const responseText = textContent && 'text' in textContent ? textContent.text : "I'm sorry, I didn't catch that. Could you repeat?";
    console.log(`[AI Service] ⏱️ Response length: ${responseText.length} chars`);
    
    return responseText;
    
  } catch (error) {
    console.error("[AI Service] ❌ Error:", error);
    throw error;
  }
}
