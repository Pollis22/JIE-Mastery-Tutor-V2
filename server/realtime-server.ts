import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import OpenAI from 'openai';
import type { RealtimeSession } from '@shared/schema';

interface ActiveSession {
  sessionId: string;
  userId: string;
  studentId?: string;
  clientWs: WebSocket;
  openaiWs: WebSocket | null;
  transcript: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  startTime: Date;
  voiceName?: string; // OpenAI Realtime voice (alloy, echo, fable, nova, shimmer, onyx)
}

export class RealtimeServer {
  private wss: WebSocketServer;
  private activeSessions = new Map<string, ActiveSession>();
  private openai: OpenAI;

  constructor(server: HTTPServer) {
    // Create WebSocket server - no path restriction to allow /ws/realtime/:sessionId
    this.wss = new WebSocketServer({ 
      server,
      verifyClient: (info: any) => {
        // Only accept WebSocket requests starting with /ws/realtime/
        const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
        return url.pathname.startsWith('/ws/realtime/');
      }
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', async (clientWs: WebSocket, req) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const sessionId = url.pathname.split('/').pop()!;

      console.log(`[RealtimeWS] Client attempting connection for session ${sessionId}`);

      // Validate session token to prevent hijacking
      const token = url.searchParams.get('token');
      if (!token) {
        console.error(`[RealtimeWS] Missing token for session ${sessionId}`);
        clientWs.close(1008, 'Missing authentication token');
        return;
      }

      // Import storage dynamically to validate session
      const { storage } = await import('./storage');
      const { db } = await import('./db');
      const { realtimeSessions } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      // Find the session and validate token
      let dbSession;
      try {
        const sessions = await db.select().from(realtimeSessions)
          .where(eq(realtimeSessions.id, sessionId));
        dbSession = sessions[0];
      } catch (error) {
        console.error(`[RealtimeWS] Database error:`, error);
        clientWs.close(1011, 'Internal server error');
        return;
      }

      if (!dbSession || dbSession.errorMessage !== token) {
        console.error(`[RealtimeWS] Invalid token for session ${sessionId}`);
        clientWs.close(1008, 'Invalid authentication token');
        return;
      }

      console.log(`[RealtimeWS] Client authenticated for session ${sessionId}`);
      console.log(`[RealtimeWS] Session config: language=${dbSession.language}, ageGroup=${dbSession.ageGroup}`);

      // Determine voice configuration based on language and age group
      let voiceName = 'alloy'; // default
      try {
        const { getRealtimeVoice } = await import('./config/realtimeVoiceMapping');
        const { isValidLanguage, isValidAgeGroup } = await import('./config/multiLanguageVoices');
        
        if (dbSession.language && isValidLanguage(dbSession.language) && 
            dbSession.ageGroup && isValidAgeGroup(dbSession.ageGroup)) {
          const voiceConfig = getRealtimeVoice(dbSession.language, dbSession.ageGroup);
          voiceName = voiceConfig.openaiVoice;
          console.log(`[RealtimeWS] Voice selected: ${voiceName} - ${voiceConfig.description}`);
        }
      } catch (error) {
        console.error(`[RealtimeWS] Voice config error, using default:`, error);
      }

      // Initialize session with voice configuration
      const session: ActiveSession = {
        sessionId,
        userId: dbSession.userId,
        studentId: dbSession.studentId || undefined,
        clientWs,
        openaiWs: null,
        transcript: [],
        startTime: new Date(),
        voiceName, // Store voice for OpenAI configuration
      };

      this.activeSessions.set(sessionId, session);

      // Clear token after use (security)
      await storage.updateRealtimeSession(sessionId, dbSession.userId, {
        status: 'active',
        errorMessage: null,
      });

      // Connect to OpenAI Realtime API
      this.connectToOpenAI(session);

      // Handle client messages
      clientWs.on('message', (data: Buffer) => {
        this.handleClientMessage(session, data);
      });

      // Handle client disconnect
      clientWs.on('close', () => {
        console.log(`[RealtimeWS] Client disconnected for session ${sessionId}`);
        this.cleanupSession(sessionId);
      });

      // Handle client errors
      clientWs.on('error', (error) => {
        console.error(`[RealtimeWS] Client error for session ${sessionId}:`, error);
        this.cleanupSession(sessionId);
      });
    });
  }

  private async connectToOpenAI(session: ActiveSession) {
    try {
      // Use the latest model version
      const model = 'gpt-4o-realtime-preview-2024-12-17';
      const wsUrl = `wss://api.openai.com/v1/realtime?model=${model}`;

      console.log(`[RealtimeWS] Connecting to OpenAI Realtime API for session ${session.sessionId}`);

      const openaiWs = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      session.openaiWs = openaiWs;

      openaiWs.on('open', async () => {
        console.log(`[RealtimeWS] Connected to OpenAI for session ${session.sessionId}`);
        
        // BUILD AND SEND COMPLETE CONFIG AS FIRST MESSAGE (don't wait for session.created!)
        const { instructions, documentContext } = await this.buildInstructionsWithContext(session);
        const selectedVoice = session.voiceName || 'alloy';
        
        console.log(`[RealtimeWS] Built instructions for ${session.studentName} (${instructions.length} chars)`);
        console.log(`[RealtimeWS] Sending COMPLETE session config as FIRST message`);
        
        // Send COMPLETE configuration as FIRST message (critical!)
        const sessionConfig = {
          type: 'session.update',
          session: {
            // Voice configuration
            voice: selectedVoice,
            
            // System instructions (CRITICAL - must be here!)
            instructions: instructions,
            
            // Audio configuration
            modalities: ['text', 'audio'],
            
            // Response behavior
            temperature: 0.8,
            max_response_output_tokens: 4096,
            
            // Turn detection
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            
            // Input/output audio format
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
            },
          },
        };
        
        console.log(`[RealtimeWS] Complete session configuration sent`);
        this.sendToOpenAI(session, sessionConfig);
      });

      openaiWs.on('message', async (data: Buffer) => {
        // Log first message from OpenAI for debugging
        if (Buffer.isBuffer(data)) {
          const dataStr = data.toString();
          if (dataStr.startsWith('{')) {
            try {
              const msg = JSON.parse(dataStr);
              
              // Handle session.created confirmation (config already sent on connection)
              if (msg.type === 'session.created') {
                console.log(`[RealtimeWS] Session created confirmation: ${msg.session?.id}`);
                
                // Notify client that connection is ready
                this.sendToClient(session, {
                  type: 'session.ready',
                  sessionId: session.sessionId,
                });
                
                // Get document context for injection
                const { documentContext } = await this.buildInstructionsWithContext(session);
                
                // If there's document context, inject it as a conversation item
                if (documentContext) {
                  setTimeout(() => {
                    this.sendToOpenAI(session, {
                      type: 'conversation.item.create',
                      item: {
                        type: 'message',
                        role: 'system',
                        content: [
                          {
                            type: 'input_text',
                            text: documentContext
                          }
                        ]
                      }
                    });
                    console.log(`[RealtimeWS] Injected document context for session ${session.sessionId}`);
                  }, 100);
                }
                
                // Trigger initial greeting from AI tutor
                setTimeout(() => {
                  this.sendToOpenAI(session, {
                    type: 'response.create',
                    response: {
                      modalities: ['audio', 'text'],
                    }
                  });
                  console.log(`[RealtimeWS] Triggered initial greeting for session ${session.sessionId}`);
                }, documentContext ? 600 : 500);
                
              } else if (msg.type === 'session.updated') {
                console.log(`[RealtimeWS] Session configured successfully for ${session.sessionId}`);
              } else if (msg.type === 'error' || msg.type === 'server_error') {
                console.error(`[RealtimeWS] OpenAI error response:`, msg);
              }
            } catch (e) {
              // Not JSON, likely audio data
            }
          }
        }
        this.handleOpenAIMessage(session, data);
      });

      openaiWs.on('close', () => {
        console.log(`[RealtimeWS] OpenAI disconnected for session ${session.sessionId}`);
        session.openaiWs = null;
      });

      openaiWs.on('error', (error: any) => {
        console.error(`[RealtimeWS] OpenAI error for session ${session.sessionId}:`, error);
        console.error(`[RealtimeWS] Error details:`, error.message || 'No message');
        console.error(`[RealtimeWS] Error code:`, error.code || 'No code');
        this.sendToClient(session, {
          type: 'error',
          error: `OpenAI connection error: ${error.message || 'Unknown error'}`,
        });
      });

    } catch (error) {
      console.error(`[RealtimeWS] Failed to connect to OpenAI:`, error);
      this.sendToClient(session, {
        type: 'error',
        error: 'Failed to initialize voice session',
      });
    }
  }

  private handleClientMessage(session: ActiveSession, data: Buffer | string) {
    try {
      // Forward message directly to OpenAI - handles both JSON and binary frames
      if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
        // Check if it's binary audio data or text JSON
        if (Buffer.isBuffer(data)) {
          // Binary audio frame - forward as-is
          session.openaiWs.send(data);
        } else if (typeof data === 'string') {
          // Text message - forward as-is
          session.openaiWs.send(data);
        } else {
          // ArrayBuffer or other format - convert to Buffer
          session.openaiWs.send(Buffer.from(data));
        }
      }
    } catch (error) {
      console.error(`[RealtimeWS] Error handling client message:`, error);
    }
  }

  private handleOpenAIMessage(session: ActiveSession, data: Buffer | string) {
    try {
      // Check if it's binary audio data or text JSON
      if (Buffer.isBuffer(data) || typeof data !== 'string') {
        // Binary audio frame - forward directly to client
        if (session.clientWs.readyState === WebSocket.OPEN) {
          session.clientWs.send(data);
        }
        return;
      }

      // Text JSON message - parse and handle
      const message = JSON.parse(data.toString());

      // Track transcript
      if (message.type === 'conversation.item.created') {
        const item = message.item;
        if (item.type === 'message') {
          session.transcript.push({
            role: item.role,
            content: item.content?.[0]?.transcript || '',
            timestamp: new Date(),
          });
        }
      }

      // Forward JSON messages to client
      this.sendToClient(session, message);

    } catch (error) {
      console.error(`[RealtimeWS] Error handling OpenAI message:`, error);
    }
  }

  private sendToClient(session: ActiveSession, message: any) {
    if (session.clientWs.readyState === WebSocket.OPEN) {
      session.clientWs.send(JSON.stringify(message));
    }
  }

  private sendToOpenAI(session: ActiveSession, message: any) {
    if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
      session.openaiWs.send(JSON.stringify(message));
    }
  }

  private async buildInstructionsWithContext(session: ActiveSession): Promise<{instructions: string, documentContext?: string}> {
    try {
      // Retrieve session and user data from database
      const { storage } = await import('./storage');
      const { db } = await import('./db');
      const { realtimeSessions } = await import('@shared/schema');
      const { eq, desc } = await import('drizzle-orm');

      const [dbSession] = await db.select().from(realtimeSessions)
        .where(eq(realtimeSessions.id, session.sessionId));

      // Fetch user profile for personalization
      const user = await storage.getUser(session.userId);
      if (!user) {
        console.error(`[RealtimeWS] User not found for session ${session.sessionId}`);
        return {instructions: 'You are a friendly, patient AI tutor. Use the Socratic teaching method to guide students.'};
      }

      const studentName = user.studentName || user.firstName || 'there';
      const gradeLevel = user.gradeLevel || 'general';
      const primarySubject = user.primarySubject || 'learning';
      
      // Map grade levels to friendly names
      const gradeLevelMap: Record<string, string> = {
        'kindergarten-2': 'K-2',
        'grades-3-5': 'Grades 3-5',
        'grades-6-8': 'Grades 6-8',
        'grades-9-12': 'Grades 9-12',
        'college-adult': 'College/Adult'
      };
      const gradeName = gradeLevelMap[gradeLevel] || gradeLevel;

      // Base instructions - KEEP SHORT to stay under 16k token limit
      const instructions = `You are a friendly, patient AI tutor for ${studentName}, a ${gradeName} student interested in ${primarySubject}.

IMPORTANT: Greet ${studentName} by name and ask what they'd like to learn. Use Socratic teaching - guide with questions rather than direct answers. Keep responses age-appropriate for ${gradeName} level.`;

      // Handle document context separately
      let documentContext: string | undefined;
      const contextDocIds = (dbSession?.contextDocuments as string[]) || [];
      if (contextDocIds.length > 0) {
        // Retrieve document context
        const docData = await storage.getDocumentContext(session.userId, contextDocIds);
        
        if (docData.chunks.length > 0) {
          // Build context section from chunks - will be sent via conversation.item.create
          const contextTexts = docData.chunks.slice(0, 5).map((chunk, idx) => {
            const doc = docData.documents.find(d => d.id === chunk.documentId);
            return `[Source: ${doc?.title || 'Unknown'}]\n${chunk.content.substring(0, 800)}`;
          }).join('\n\n');

          documentContext = `${studentName}'s Study Materials:\n\n${contextTexts}`;
          console.log(`[RealtimeWS] Prepared ${docData.chunks.length} document chunks for context injection`);
        }
      }

      console.log(`[RealtimeWS] Built compact instructions for ${studentName} (${gradeName}, ${primarySubject})`);
      return {instructions, documentContext};

    } catch (error) {
      console.error(`[RealtimeWS] Error building context:`, error);
      return {
        instructions: 'You are a friendly, patient AI tutor. Use the Socratic teaching method to guide students. Be encouraging and age-appropriate.'
      };
    }
  }

  private async cleanupSession(sessionId: string) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    // Close OpenAI connection
    if (session.openaiWs) {
      session.openaiWs.close();
    }

    // Calculate minutes used
    const durationMs = Date.now() - session.startTime.getTime();
    const minutesUsed = Math.ceil(durationMs / 60000);

    console.log(`[RealtimeWS] Session ${sessionId} ended. Duration: ${minutesUsed} minutes`);

    // Save transcript and update voice usage
    try {
      const { storage } = await import('./storage');
      await storage.endRealtimeSession(sessionId, session.userId, session.transcript, minutesUsed);
      console.log(`[RealtimeWS] Session ${sessionId} saved to database`);
    } catch (error) {
      console.error(`[RealtimeWS] Error saving session ${sessionId}:`, error);
    }

    this.activeSessions.delete(sessionId);
  }

  public getActiveSessionCount(): number {
    return this.activeSessions.size;
  }
}
