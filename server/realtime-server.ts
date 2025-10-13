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
  private eventBuffer = new Map<string, any[]>(); // Ring buffer for debugging
  private readonly REALTIME_TRANSPORT = process.env.REALTIME_TRANSPORT || 'websocket'; // 'webrtc' | 'websocket'
  private readonly REALTIME_ENABLED = process.env.REALTIME_ENABLED !== 'false';

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

    console.log(`[RealtimeWS] Initialized - Transport: ${this.REALTIME_TRANSPORT}, Enabled: ${this.REALTIME_ENABLED}`);
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', async (clientWs: WebSocket, req) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const sessionId = url.pathname.split('/').pop()!;

      console.log(`[RealtimeWS] Client attempting connection for session ${sessionId}`);

      // Check if Realtime is enabled
      if (!this.REALTIME_ENABLED) {
        console.log(`[RealtimeWS] Realtime disabled - rejecting connection`);
        clientWs.close(1013, 'Realtime service is disabled');
        return;
      }

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
      // Initialize event buffer for this session
      this.eventBuffer.set(session.sessionId, []);
      
      // Use correct model version
      const model = 'gpt-4o-realtime-preview';
      const wsUrl = `wss://api.openai.com/v1/realtime?model=${model}`;

      console.log(`[RealtimeWS] Connecting to OpenAI Realtime API for session ${session.sessionId}`);
      console.log(`[RealtimeWS] Transport mode: ${this.REALTIME_TRANSPORT}`);

      const openaiWs = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      session.openaiWs = openaiWs;

      openaiWs.on('open', () => {
        console.log(`[RealtimeWS] WebSocket OPEN - sending config IMMEDIATELY`);
        
        // Use concise instructions that work
        const instructions = `You are a concise, upbeat tutor. Speak short sentences. Wait for the user to finish before replying. If the user is silent, say: 'I'm here when you're ready.'`;
        const selectedVoice = session.voiceName || 'alloy';
        
        // Build session configuration
        const sessionConfig: any = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            voice: selectedVoice,
            instructions: instructions,
            input_audio_transcription: {
              model: 'whisper-1'
            },
            temperature: 0.8
          }
        };
        
        // CRITICAL: Only add audio format for WebSocket, NOT for WebRTC
        if (this.REALTIME_TRANSPORT === 'websocket') {
          sessionConfig.session.input_audio_format = 'pcm16';
          sessionConfig.session.output_audio_format = 'pcm16';
          console.log(`[RealtimeWS] WebSocket transport - using PCM16 audio format`);
        } else {
          console.log(`[RealtimeWS] WebRTC transport - Opus flows over media track (no output_audio_format)`);
        }
        
        // Start without VAD for initial testing
        // Will add after hello probe works
        
        console.log(`[RealtimeWS] Sending session.update`);
        this.logOutboundEvent(session.sessionId, sessionConfig);
        this.sendToOpenAI(session, sessionConfig);
        
        // Send hello probe after a short delay
        setTimeout(() => {
          console.log(`[RealtimeWS] HELLO_PROBE_SENT`);
          const helloProbe = {
            type: 'response.create',
            response: {
              modalities: ['audio'],
              instructions: `Say 'hello' clearly once.`,
              voice: selectedVoice
            }
          };
          this.logOutboundEvent(session.sessionId, helloProbe);
          this.sendToOpenAI(session, helloProbe);
        }, 500);
      });

      openaiWs.on('message', async (data: Buffer) => {
        if (Buffer.isBuffer(data)) {
          const dataStr = data.toString();
          if (dataStr.startsWith('{')) {
            try {
              const msg = JSON.parse(dataStr);
              
              // Log important events
              if (['error', 'response.error', 'session.created', 'session.updated', 'response.completed'].includes(msg.type)) {
                console.log(`[RealtimeWS] Event: ${msg.type}`, msg.type === 'error' ? msg : '');
              }
              
              // Handle session.created
              if (msg.type === 'session.created') {
                console.log(`[RealtimeWS] ✅ Session created by OpenAI: ${msg.session?.id}`);
                
                // Notify client that connection is ready
                this.sendToClient(session, {
                  type: 'session.ready',
                  sessionId: session.sessionId,
                });
              } else if (msg.type === 'session.updated') {
                console.log(`[RealtimeWS] ✅ Session updated successfully`);
                
                // After successful update, enable VAD if not already enabled
                if (!msg.session?.turn_detection) {
                  setTimeout(() => {
                    console.log(`[RealtimeWS] Enabling VAD for turn detection`);
                    const vadConfig = {
                      type: 'session.update',
                      session: {
                        turn_detection: {
                          type: 'server_vad',
                          threshold: 0.5
                        }
                      }
                    };
                    this.logOutboundEvent(session.sessionId, vadConfig);
                    this.sendToOpenAI(session, vadConfig);
                  }, 1000); // Enable VAD after hello probe has a chance to play
                }
              } else if (msg.type === 'response.created') {
                console.log(`[RealtimeWS] Response created`);
              } else if (msg.type === 'response.completed') {
                console.log(`[RealtimeWS] ✅ Response completed - hello probe success!`);
              } else if (msg.type === 'error') {
                console.error(`[RealtimeWS] ❌ ERROR:`, msg);
                
                // Log last 10 outbound events for debugging
                const events = this.eventBuffer.get(session.sessionId) || [];
                console.error(`[RealtimeWS] Last ${Math.min(10, events.length)} outbound events:`, 
                  events.slice(-10).map(e => e.type).join(', '));
                  
                if (msg.error?.type === 'server_error') {
                  console.error(`[RealtimeWS] Server error - Session ID for support: ${msg.error?.message?.match(/sess_[a-zA-Z0-9]+/)?.[0]}`);
                }
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
          // Binary audio frame - append to buffer then commit
          const audioChunk = {
            type: 'input_audio_buffer.append',
            audio: data.toString('base64')
          };
          this.sendToOpenAI(session, audioChunk);
          
          // CRITICAL: Must commit the buffer for audio to be processed
          const commitMsg = { type: 'input_audio_buffer.commit' };
          this.sendToOpenAI(session, commitMsg);
          this.logOutboundEvent(session.sessionId, commitMsg);
        } else if (typeof data === 'string') {
          // Text message - parse and handle
          try {
            const msg = JSON.parse(data);
            this.logOutboundEvent(session.sessionId, msg);
            session.openaiWs.send(data);
          } catch (e) {
            // Not JSON, forward as-is
            session.openaiWs.send(data);
          }
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

  private logOutboundEvent(sessionId: string, event: any) {
    const buffer = this.eventBuffer.get(sessionId) || [];
    buffer.push({ type: event.type, timestamp: new Date().toISOString() });
    // Keep only last 20 events
    if (buffer.length > 20) {
      buffer.shift();
    }
    this.eventBuffer.set(sessionId, buffer);
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
      
      if (!dbSession) {
        console.error(`[RealtimeWS] Session not found in database: ${session.sessionId}`);
        // Return fallback instructions
        return {
          instructions: `You are an expert AI tutor having a real-time voice conversation with a student.

YOUR ROLE: You are a warm, patient, and encouraging tutor who makes learning enjoyable. Keep responses natural and conversational.

TEACHING APPROACH: Use the Socratic method to guide discovery. Break complex concepts into manageable steps. Provide examples and analogies. Check understanding frequently. Give hints before direct answers. Celebrate effort and progress.

CONVERSATION STYLE: Speak naturally as if sitting together. Keep responses concise (30-60 seconds). Be enthusiastic and positive. Use phrases like "Great thinking!" and "You're on the right track!" Encourage questions and thinking aloud.

Remember: Build understanding and confidence in learning.`
        };
      }

      // Fetch user profile for personalization
      const user = await storage.getUser(session.userId);
      if (!user) {
        console.error(`[RealtimeWS] User not found for session ${session.sessionId}`);
        // Return fallback instructions
        return {
          instructions: `You are an expert AI tutor having a real-time voice conversation with a student.

YOUR ROLE: You are a warm, patient, and encouraging tutor who makes learning enjoyable. Keep responses natural and conversational.

TEACHING APPROACH: Use the Socratic method to guide discovery. Break complex concepts into manageable steps. Provide examples and analogies. Check understanding frequently. Give hints before direct answers. Celebrate effort and progress.

CONVERSATION STYLE: Speak naturally as if sitting together. Keep responses concise (30-60 seconds). Be enthusiastic and positive. Use phrases like "Great thinking!" and "You're on the right track!" Encourage questions and thinking aloud.

Remember: Build understanding and confidence in learning.`
        };
      }

      // Use session's ageGroup (not user's gradeLevel) and subject
      const studentName = user.studentName || user.firstName || 'there';
      const ageGroup = dbSession.ageGroup || 'General';
      const subject = dbSession.subject || user.primarySubject || 'learning';
      
      console.log(`[RealtimeWS] Building instructions with session data:`, {
        studentName,
        ageGroup,
        subject,
        sessionId: session.sessionId
      });

      // Build comprehensive instructions (500+ chars required by OpenAI Realtime API)
      const instructions = `You are an expert tutor having a real-time voice conversation with ${studentName}, a ${ageGroup} student who needs help with ${subject}.

YOUR ROLE:
You are a warm, patient, and encouraging tutor who makes learning enjoyable and accessible. You're speaking directly with ${studentName} through voice, so keep your responses natural and conversational.

PERSONALITY AND STYLE:
- Be enthusiastic and positive - celebrate every effort ${studentName} makes
- Use age-appropriate language suitable for ${ageGroup} students
- Speak naturally as if you're sitting together in person, not reading from a script
- Keep responses concise (30-60 seconds of speaking) to maintain engagement
- Use a friendly, supportive tone that builds confidence

TEACHING APPROACH:
1. Guide ${studentName} to discover answers through the Socratic method rather than just providing solutions
2. Break complex concepts into smaller, manageable steps appropriate for ${ageGroup} level
3. Use real-world examples, analogies, and stories that resonate with ${ageGroup} students
4. Check understanding frequently by asking simple follow-up questions
5. If ${studentName} is stuck, provide hints and scaffolding before giving direct answers
6. Adapt your explanations based on ${studentName}'s responses and comprehension level

CONVERSATION FLOW:
- Start by greeting ${studentName} warmly and asking what they need help with
- Ask clarifying questions to assess current knowledge
- Explain concepts step-by-step, checking understanding along the way
- Encourage ${studentName} to think aloud and explain their reasoning
- Provide positive reinforcement for effort, not just correct answers
- Use phrases like "Great thinking!", "You're on the right track!", "That's a good question!"

IMPORTANT REMINDERS:
- This is a voice conversation, so speak naturally and conversationally
- Avoid overly long explanations - keep it interactive
- Encourage ${studentName} to ask questions and share their thought process
- Be patient if ${studentName} needs something repeated or explained differently
- Your goal is deep understanding, not just getting the right answer

Remember: You're not just teaching ${subject}, you're building ${studentName}'s confidence and love of learning.`;

      // Instructions are ready to use - no minimum length required
      console.log(`[RealtimeWS] Instructions prepared: ${instructions.length} chars`);

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

      console.log(`[RealtimeWS] ✅ Instructions built successfully with correct session data`);
      return {instructions, documentContext};

    } catch (error) {
      console.error(`[RealtimeWS] Error building context:`, error);
      // Return fallback instructions
      return {
        instructions: `You are an expert AI tutor having a real-time voice conversation with a student.

YOUR ROLE:
You are a warm, patient, and encouraging tutor who makes learning enjoyable and accessible. Keep your responses natural and conversational.

TEACHING APPROACH:
- Use the Socratic method to guide students to discover answers
- Break complex concepts into smaller, manageable steps
- Provide examples and analogies to help explain concepts
- Check understanding frequently with follow-up questions
- Give hints and scaffolding before direct answers
- Celebrate effort and progress, not just correct answers

CONVERSATION STYLE:
- Speak naturally as if sitting together in person
- Keep responses concise (30-60 seconds) to maintain engagement
- Be enthusiastic and positive about learning
- Use phrases like "Great thinking!" and "You're on the right track!"
- Encourage students to ask questions and think aloud

Remember: Your goal is to build understanding and confidence in learning.`
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
