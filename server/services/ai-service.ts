import Anthropic from "@anthropic-ai/sdk";

/*
<important_code_snippet_instructions>
The newest Anthropic model is "claude-sonnet-4-20250514", not "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229". 
If the user doesn't specify a model, always prefer using "claude-sonnet-4-20250514" as it is the latest model.
</important_code_snippet_instructions>
*/

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  
  // Build context with uploaded documents
  const documentContext = uploadedDocuments.length > 0
    ? `\n\nSTUDENT'S UPLOADED DOCUMENTS:\n${uploadedDocuments.map((doc, i) => 
        `\n[Document ${i + 1}]\n${doc}`
      ).join('\n\n')}`
    : "";

  const systemPrompt = systemInstruction || 
    `You are an expert AI tutor helping students with homework and learning. 
Be encouraging, patient, and clear. Use the Socratic method - ask questions to guide understanding rather than just giving answers.
Keep responses concise (2-3 sentences max) since this is voice conversation.
If referencing uploaded documents, be specific about which part you're discussing.${documentContext}`;

  try {
    const response = await anthropic.messages.create({
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
