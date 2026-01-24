/**
 * D-ID STT Routes
 * 
 * Speech-to-text endpoints for the D-ID avatar conversation loop.
 * Supports both WebSocket streaming and blob upload modes.
 * 
 * Uses AssemblyAI as primary STT provider (Deepgram as fallback).
 */

import { Router, Request, Response } from 'express';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { Server as HttpServer, IncomingMessage } from 'http';
import { Socket } from 'net';

const router = Router();

const STT_PROVIDER = process.env.STT_PROVIDER !== 'deepgram' ? 'assemblyai' : 'deepgram';
console.log('[D-ID STT] Provider:', STT_PROVIDER);

let assemblyAIToken: string | null = null;
let assemblyAITokenExpiry: number = 0;

async function getAssemblyAIToken(): Promise<string> {
  if (assemblyAIToken && Date.now() < assemblyAITokenExpiry - 300000) {
    console.log('[D-ID STT] Using cached AssemblyAI token');
    return assemblyAIToken;
  }
  
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ASSEMBLYAI_API_KEY');
  }
  
  console.log('[D-ID STT] Fetching new AssemblyAI streaming token...');
  
  const response = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=3600', {
    method: 'GET',
    headers: { 'Authorization': apiKey },
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token fetch failed: ${response.status} ${text}`);
  }
  
  const data = await response.json() as { token: string; expires_in_seconds: number };
  console.log('[D-ID STT] Token obtained, expires in', data.expires_in_seconds, 'seconds');
  
  assemblyAIToken = data.token;
  assemblyAITokenExpiry = Date.now() + (data.expires_in_seconds * 1000);
  
  return data.token;
}

interface AssemblyAIMessage {
  message_type?: string;
  type?: string;
  session_id?: string;
  transcript?: string;
  turn_order?: number;
  end_of_turn?: boolean;
  end_of_turn_confidence?: number;
  error?: string;
}

router.get('/status', async (req: Request, res: Response) => {
  console.log('[D-ID STT] Status check');
  
  const assemblyAIKeyPresent = !!process.env.ASSEMBLYAI_API_KEY;
  const deepgramKeyPresent = !!process.env.DEEPGRAM_API_KEY;
  
  return res.json({
    ok: true,
    provider: STT_PROVIDER,
    assemblyAIKeyPresent,
    deepgramKeyPresent,
    timestamp: new Date().toISOString()
  });
});

router.post('/transcribe', async (req: Request, res: Response) => {
  console.log('[D-ID STT] Blob transcription request');
  console.log('[D-ID STT] Content-Type:', req.headers['content-type']);
  console.log('[D-ID STT] Body size:', req.body?.length || 'unknown');
  
  const startTime = Date.now();
  
  try {
    const contentType = req.headers['content-type'] || '';
    
    if (!req.body || !Buffer.isBuffer(req.body)) {
      console.log('[D-ID STT] Request body:', typeof req.body, req.body?.constructor?.name);
      return res.status(400).json({
        ok: false,
        message: 'Expected audio buffer in request body',
        hint: 'Send raw audio as application/octet-stream or audio/* content type'
      });
    }
    
    const audioBuffer = req.body;
    console.log('[D-ID STT] Audio buffer size:', audioBuffer.length, 'bytes');
    
    if (audioBuffer.length < 1000) {
      return res.status(400).json({
        ok: false,
        message: 'Audio too short for transcription',
        bytes: audioBuffer.length
      });
    }
    
    const estimatedDurationMs = (audioBuffer.length / 32000) * 1000;
    console.log('[D-ID STT] Estimated audio duration:', estimatedDurationMs.toFixed(0), 'ms');
    
    if (STT_PROVIDER === 'assemblyai') {
      const apiKey = process.env.ASSEMBLYAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ ok: false, message: 'AssemblyAI API key not configured' });
      }
      
      console.log('[D-ID STT] Uploading to AssemblyAI...');
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/octet-stream'
        },
        body: audioBuffer
      });
      
      if (!uploadResponse.ok) {
        const text = await uploadResponse.text();
        console.error('[D-ID STT] Upload failed:', uploadResponse.status, text);
        return res.status(500).json({ ok: false, message: 'Audio upload failed', error: text });
      }
      
      const uploadData = await uploadResponse.json() as { upload_url: string };
      console.log('[D-ID STT] Upload complete, URL:', uploadData.upload_url);
      
      console.log('[D-ID STT] Starting transcription...');
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: uploadData.upload_url,
          speech_model: 'universal'
        })
      });
      
      if (!transcriptResponse.ok) {
        const text = await transcriptResponse.text();
        console.error('[D-ID STT] Transcription request failed:', transcriptResponse.status, text);
        return res.status(500).json({ ok: false, message: 'Transcription failed', error: text });
      }
      
      const transcriptData = await transcriptResponse.json() as { id: string; status: string };
      console.log('[D-ID STT] Transcription started, ID:', transcriptData.id);
      
      let attempts = 0;
      const maxAttempts = 60;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptData.id}`, {
          headers: { 'Authorization': apiKey }
        });
        
        const pollData = await pollResponse.json() as { status: string; text?: string; error?: string };
        
        if (pollData.status === 'completed') {
          const responseTime = Date.now() - startTime;
          console.log('[D-ID STT] Transcription complete in', responseTime, 'ms');
          console.log('[D-ID STT] Transcript:', pollData.text?.slice(0, 100));
          
          return res.json({
            ok: true,
            transcript: pollData.text || '',
            isFinal: true,
            provider: 'assemblyai',
            responseTimeMs: responseTime
          });
        }
        
        if (pollData.status === 'error') {
          console.error('[D-ID STT] Transcription error:', pollData.error);
          return res.status(500).json({ ok: false, message: pollData.error });
        }
        
        attempts++;
      }
      
      return res.status(504).json({ ok: false, message: 'Transcription timeout' });
      
    } else {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ ok: false, message: 'Deepgram API key not configured' });
      }
      
      console.log('[D-ID STT] Sending to Deepgram...');
      const dgResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'audio/raw;encoding=signed-integer;bits=16;sample-rate=16000;channels=1'
        },
        body: audioBuffer
      });
      
      if (!dgResponse.ok) {
        const text = await dgResponse.text();
        console.error('[D-ID STT] Deepgram failed:', dgResponse.status, text);
        return res.status(500).json({ ok: false, message: 'Deepgram transcription failed', error: text });
      }
      
      const dgData = await dgResponse.json() as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }> } };
      const transcript = dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      const confidence = dgData.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;
      
      const responseTime = Date.now() - startTime;
      console.log('[D-ID STT] Deepgram complete in', responseTime, 'ms');
      console.log('[D-ID STT] Transcript:', transcript.slice(0, 100));
      
      return res.json({
        ok: true,
        transcript,
        isFinal: true,
        confidence,
        provider: 'deepgram',
        responseTimeMs: responseTime
      });
    }
    
  } catch (error) {
    console.error('[D-ID STT] Error:', error);
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Transcription failed'
    });
  }
});

export function setupDidSttWebSocket(httpServer: HttpServer): void {
  console.log('[D-ID STT] Setting up WebSocket server...');
  
  const wss = new WebSocketServer({ noServer: true });
  
  // Set up connection handler
  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    console.log('[D-ID STT] ws connected');
    handleSttConnection(ws, request);
  });
  
  httpServer.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = request.url || '';
    
    if (url.startsWith('/api/did-api/stt/ws')) {
      console.log('[D-ID STT] upgrade matched', url);
      
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
      return; // Prevent other upgrade handlers from running
    }
  });
  
  console.log('[D-ID STT] WebSocket server ready at /api/did-api/stt/ws');
}

function handleSttConnection(clientWs: WebSocket, request: IncomingMessage): void {
  const clientIp = request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown';
  const userAgent = request.headers['user-agent'] || 'unknown';
  console.log('[D-ID STT] Client IP:', clientIp);
  console.log('[D-ID STT] User-Agent:', userAgent.slice(0, 80));
  
  // Client WebSocket close/error handlers for definitive logging
  clientWs.on('close', (code, reason) => {
    console.log('[D-ID STT] ws closed', code, reason?.toString() || '');
  });
  
  clientWs.on('error', (err) => {
    console.error('[D-ID STT] ws error', err);
  });
  
  let assemblyWs: WebSocket | null = null;
  let isOpen = false;
  let audioBuffer: Buffer[] = [];
  let totalBytesSent = 0;
  let totalFramesReceived = 0;
  
  const language = 'en';
  const speechModel = 'universal-streaming-english';
  
  const urlParams = new URLSearchParams({
    sample_rate: '16000',
    encoding: 'pcm_s16le',
    speech_model: speechModel,
    format_turns: 'true',
    end_of_turn_confidence_threshold: '0.65',
    min_end_of_turn_silence_when_confident: '800',
    max_turn_silence: '4000',
  });
  
  const wsUrl = `wss://streaming.assemblyai.com/v3/ws?${urlParams.toString()}`;
  console.log('[D-ID STT] Connecting to AssemblyAI:', wsUrl);
  
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    console.error('[D-ID STT] Missing ASSEMBLYAI_API_KEY');
    clientWs.send(JSON.stringify({ type: 'error', message: 'STT not configured' }));
    clientWs.close();
    return;
  }
  
  try {
    assemblyWs = new WebSocket(wsUrl, {
      headers: { 'Authorization': apiKey },
      handshakeTimeout: 10000,
    });
  } catch (err) {
    console.error('[D-ID STT] Failed to create AssemblyAI WebSocket:', err);
    clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to connect to STT' }));
    clientWs.close();
    return;
  }
  
  const handshakeTimeout = setTimeout(() => {
    if (!isOpen && assemblyWs) {
      console.error('[D-ID STT] AssemblyAI handshake timeout');
      clientWs.send(JSON.stringify({ type: 'error', message: 'STT handshake timeout' }));
      assemblyWs.terminate();
    }
  }, 10000);
  
  assemblyWs.on('open', () => {
    clearTimeout(handshakeTimeout);
    console.log('[D-ID STT] AssemblyAI WebSocket open');
    isOpen = true;
    
    clientWs.send(JSON.stringify({ type: 'ready', provider: 'assemblyai' }));
    
    if (audioBuffer.length > 0) {
      console.log('[D-ID STT] Flushing', audioBuffer.length, 'buffered chunks');
      for (const chunk of audioBuffer) {
        assemblyWs!.send(chunk);
        totalBytesSent += chunk.length;
      }
      audioBuffer = [];
    }
  });
  
  assemblyWs.on('message', (data: RawData) => {
    const msgStr = data.toString();
    
    try {
      const msg: AssemblyAIMessage = JSON.parse(msgStr);
      
      if (msg.error) {
        console.error('[D-ID STT] AssemblyAI error:', msg.error);
        clientWs.send(JSON.stringify({ type: 'error', message: msg.error }));
        return;
      }
      
      const msgType = msg.message_type || msg.type;
      
      if (msgType === 'Begin' || msgType === 'session_begins') {
        console.log('[D-ID STT] Session started:', msg.session_id);
        clientWs.send(JSON.stringify({ type: 'session_start', sessionId: msg.session_id }));
      }
      
      if (msgType === 'Turn' || (msg.transcript !== undefined)) {
        const transcript = msg.transcript || '';
        const endOfTurn = msg.end_of_turn || false;
        const confidence = msg.end_of_turn_confidence || 0;
        
        console.log('[D-ID STT] Transcript:', transcript.slice(0, 50), 'endOfTurn:', endOfTurn, 'conf:', confidence.toFixed(2));
        
        clientWs.send(JSON.stringify({
          type: 'transcript',
          transcript,
          isFinal: endOfTurn,
          confidence,
          turnOrder: msg.turn_order
        }));
      }
      
      if (msgType === 'Termination' || msgType === 'session_terminated') {
        console.log('[D-ID STT] Session terminated');
        clientWs.send(JSON.stringify({ type: 'terminated' }));
      }
      
    } catch (err) {
      console.error('[D-ID STT] Failed to parse message:', msgStr.slice(0, 100));
    }
  });
  
  assemblyWs.on('error', (err) => {
    console.error('[D-ID STT] AssemblyAI WebSocket error:', err);
    clientWs.send(JSON.stringify({ type: 'error', message: 'STT connection error' }));
  });
  
  assemblyWs.on('close', (code, reason) => {
    console.log('[D-ID STT] AssemblyAI WebSocket closed:', code, reason.toString());
    isOpen = false;
    
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'closed', code }));
    }
  });
  
  clientWs.on('message', (data: RawData) => {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        
        if (msg.type === 'stop') {
          console.log('[D-ID STT] Stop command received, total bytes sent:', totalBytesSent);
          if (assemblyWs && isOpen) {
            assemblyWs.send(JSON.stringify({ terminate_session: true }));
          }
        }
        
      } catch (err) {
        console.error('[D-ID STT] Invalid JSON from client');
      }
    } else {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      totalFramesReceived++;
      
      if (totalFramesReceived === 1) {
        console.log('[D-ID STT] Received first audio frame from client, bytes:', buffer.length);
      }
      
      if (isOpen && assemblyWs && assemblyWs.readyState === WebSocket.OPEN) {
        assemblyWs.send(buffer);
        totalBytesSent += buffer.length;
      } else {
        audioBuffer.push(buffer);
        if (audioBuffer.length > 100) {
          audioBuffer.shift();
        }
      }
    }
  });
  
  clientWs.on('close', () => {
    console.log('[D-ID STT] Client WebSocket closed');
    console.log('[D-ID STT] Session stats - frames received:', totalFramesReceived, 'bytes sent to AssemblyAI:', totalBytesSent);
    
    if (assemblyWs) {
      if (isOpen && assemblyWs.readyState === WebSocket.OPEN) {
        try {
          assemblyWs.send(JSON.stringify({ terminate_session: true }));
        } catch (e) {
        }
      }
      assemblyWs.close();
    }
  });
  
  clientWs.on('error', (err) => {
    console.error('[D-ID STT] Client WebSocket error:', err);
    if (assemblyWs) {
      assemblyWs.close();
    }
  });
}

export default router;
