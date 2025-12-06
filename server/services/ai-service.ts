/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import Anthropic from "@anthropic-ai/sdk";

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
  // Build context with uploaded documents
  const documentContext = uploadedDocuments.length > 0
    ? uploadedDocuments.map((doc, i) => {
        const titleMatch = doc.match(/^\[Document: ([^\]]+)\]/);
        const title = titleMatch ? titleMatch[1] : `Document ${i + 1}`;
        const content = doc.replace(/^\[Document: [^\]]+\]\n/, '');
        return `<document index="${i + 1}" title="${title}">\n${content}\n</document>`;
      }).join('\n\n')
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
<uploaded_documents>
The student has uploaded ${uploadedDocuments.length} document(s) for this tutoring session. You MUST acknowledge these documents when asked about them.

${documentContext}
</uploaded_documents>

CRITICAL INSTRUCTIONS FOR DOCUMENTS:
- When the student asks "do you see my document?" or similar, ALWAYS respond affirmatively
- Start with "Yes! I can see your document" and mention specific details from it
- Reference specific content from the documents to prove you can see them
- Help the student with the specific problems or content in their uploaded materials

GENERAL TUTORING INSTRUCTIONS:
- Be encouraging, patient, and clear
- Use the Socratic method - ask questions to guide understanding
- Keep responses VERY CONCISE (1-2 sentences max) since this is voice conversation
- Reference the uploaded documents frequently when answering questions
- ${inputModality === "voice" ? "You are having a VOICE conversation - the student can HEAR you" : "The student sent you a text message"}`;
    } else {
      systemPrompt = `You are an expert AI tutor helping students with homework and learning.

${modalityContext ? modalityContext + '\n' : ''}
IMPORTANT INSTRUCTIONS:
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
  language?: string
): Promise<void> {
  
  console.log("[AI Service] 📝 Generating STREAMING response");
  console.log("[AI Service] 🎤 Input modality:", inputModality || "unknown");
  console.log("[AI Service] 📚 Documents available:", uploadedDocuments.length);

  const systemPrompt = buildSystemPrompt(uploadedDocuments, systemInstruction, inputModality, language);
  console.log("[AI Service] 📄 System prompt length:", systemPrompt.length, "chars");

  try {
    const anthropicClient = getAnthropicClient();
    
    const streamStart = Date.now();
    console.log(`[AI Service] ⏱️ Starting Claude streaming...`);
    
    // Use streaming API
    const stream = await anthropicClient.messages.stream({
      model: DEFAULT_MODEL_STR,
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: currentTranscript }
      ],
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
  language?: string
): Promise<string> {
  
  console.log("[AI Service] 📝 Generating response (non-streaming)");
  console.log("[AI Service] 🎤 Input modality:", inputModality || "unknown");
  console.log("[AI Service] 📚 Documents available:", uploadedDocuments.length);
  
  const systemPrompt = buildSystemPrompt(uploadedDocuments, systemInstruction, inputModality, language);
  console.log("[AI Service] 📄 System prompt length:", systemPrompt.length, "chars");

  try {
    const anthropicClient = getAnthropicClient();
    
    // ⏱️ LATENCY TIMING: Track Claude API call
    const apiStart = Date.now();
    console.log(`[AI Service] ⏱️ Calling Claude API... (prompt length: ${systemPrompt.length} chars)`);
    
    const response = await anthropicClient.messages.create({
      model: DEFAULT_MODEL_STR, // "claude-sonnet-4-20250514"
      max_tokens: 300, // Keep voice responses concise
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: currentTranscript }
      ],
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
