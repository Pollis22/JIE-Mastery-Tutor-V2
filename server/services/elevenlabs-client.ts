/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

if (!ELEVENLABS_API_KEY) {
  console.warn('Warning: ELEVENLABS_API_KEY not set in environment');
}

interface CreateAgentConfig {
  name: string;
  prompt: string;
  firstMessage: string;
  language?: string;
  conversationConfig?: any;
}

interface UploadDocumentFile {
  name: string;
  content: Buffer;
  mimeType: string;
}

export class ElevenLabsClient {
  
  // Create a new agent (cloned from template)
  async createAgent(config: CreateAgentConfig) {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/agents/create`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: config.name,
        prompt: {
          prompt: config.prompt,
        },
        first_message: config.firstMessage,
        language: config.language || 'en',
        conversation_config: config.conversationConfig || {},
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create agent: ${response.status} - ${error}`);
    }

    return await response.json();
  }

  // Upload document to knowledge base
  async uploadDocument(file: UploadDocumentFile) {
    // Use global FormData (available in Node 18+)
    const formData = new (globalThis as any).FormData();
    const blob = new Blob([file.content], { type: file.mimeType });
    formData.append('name', file.name);
    formData.append('file', blob, file.name);

    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/knowledge-base`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY!,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload document: ${response.status} - ${error}`);
    }

    const result = await response.json();
    // ElevenLabs returns { document_id: "..." } not { id: "..." }
    return { id: result.document_id || result.id };
  }

  // Update agent to include knowledge base documents
  async updateAgentKnowledgeBase(agentId: string, documentIds: string[]) {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/agents/${agentId}`, {
      method: 'PATCH',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        knowledge_base: documentIds,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update agent knowledge base: ${response.status} - ${error}`);
    }

    return await response.json();
  }

  // Delete agent (for cleanup)
  async deleteAgent(agentId: string) {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/agents/${agentId}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY!,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to delete agent ${agentId}:`, error);
    }
  }

  // Delete knowledge base document
  async deleteDocument(documentId: string) {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/knowledge-base/${documentId}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY!,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to delete document ${documentId}:`, error);
    }
  }
}

export const elevenLabsClient = new ElevenLabsClient();
