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

export async function generateTutorResponse(
  conversationHistory: Message[],
  currentTranscript: string,
  uploadedDocuments: string[],
  systemInstruction?: string
): Promise<string> {
  
  console.log("[AI Service] 📝 Generating response");
  console.log("[AI Service] 📚 Documents available:", uploadedDocuments.length);
  
  // Build context with uploaded documents
  const documentContext = uploadedDocuments.length > 0
    ? `\n\nSTUDENT'S UPLOADED DOCUMENTS:\n────────────────────────\n${uploadedDocuments.map((doc, i) => 
        `${doc}`
      ).join('\n────────────────────────\n')}\n────────────────────────`
    : "";

  console.log("[AI Service] 📄 Document context length:", documentContext.length, "chars");

  const systemPrompt = systemInstruction || 
    `You are an expert AI tutor helping students with homework and learning. 

IMPORTANT INSTRUCTIONS:
- Be encouraging, patient, and clear
- Use the Socratic method - ask questions to guide understanding
- Keep responses VERY CONCISE (1-2 sentences max) since this is voice conversation
${uploadedDocuments.length > 0 ? 
`- The student has uploaded documents for this session - ALWAYS reference them specifically
- Use phrases like "Looking at your document..." or "In the problem you uploaded..." or "Based on what you've shared..."
- Make it clear you can see their materials and are helping with their specific homework` 
: '- Help with general understanding since no specific materials were uploaded'}
- Wait for the student to FINISH speaking before responding
- Don't interrupt or rush to respond${documentContext}`;

  try {
    const anthropicClient = getAnthropicClient();
    const response = await anthropicClient.messages.create({
      model: DEFAULT_MODEL_STR, // "claude-sonnet-4-20250514"
      max_tokens: 300, // Keep voice responses concise
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: currentTranscript }
      ],
    });

    const textContent = response.content.find(block => block.type === 'text');
    return textContent && 'text' in textContent ? textContent.text : "I'm sorry, I didn't catch that. Could you repeat?";
    
  } catch (error) {
    console.error("[AI Service] ❌ Error:", error);
    throw error;
  }
}
