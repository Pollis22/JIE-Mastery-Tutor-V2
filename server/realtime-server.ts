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

      // Initialize session
      const session: ActiveSession = {
        sessionId,
        userId: dbSession.userId,
        studentId: dbSession.studentId || undefined,
        clientWs,
        openaiWs: null,
        transcript: [],
        startTime: new Date(),
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
      const model = 'gpt-4o-realtime-preview-2024-10-01';
      const wsUrl = `wss://api.openai.com/v1/realtime?model=${model}`;

      console.log(`[RealtimeWS] Connecting to OpenAI Realtime API for session ${session.sessionId}`);

      const openaiWs = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      session.openaiWs = openaiWs;

      openaiWs.on('open', () => {
        console.log(`[RealtimeWS] Connected to OpenAI for session ${session.sessionId}`);
        
        // Send initial session configuration
        this.sendToOpenAI(session, {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: 'You are a helpful AI tutor. Respond in a friendly, encouraging manner.',
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 200,
            },
          },
        });

        // Notify client that connection is ready
        this.sendToClient(session, {
          type: 'session.ready',
          sessionId: session.sessionId,
        });
      });

      openaiWs.on('message', (data: Buffer) => {
        this.handleOpenAIMessage(session, data);
      });

      openaiWs.on('close', () => {
        console.log(`[RealtimeWS] OpenAI disconnected for session ${session.sessionId}`);
        session.openaiWs = null;
      });

      openaiWs.on('error', (error) => {
        console.error(`[RealtimeWS] OpenAI error for session ${session.sessionId}:`, error);
        this.sendToClient(session, {
          type: 'error',
          error: 'OpenAI connection error',
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
