import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

export function setupGeminiWebSocketProxy(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/api/gemini-ws'
  });

  console.log('[WS Proxy] Gemini WebSocket proxy initialized on /api/gemini-ws');

  wss.on('connection', (clientWs: WebSocket) => {
    console.log('[WS Proxy] ✅ Browser client connected');
    
    let geminiWs: WebSocket | null = null;
    let isSetup = false;

    clientWs.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('[WS Proxy] 📨 Client message type:', message.type);
        
        // Initialize connection to Gemini
        if (message.type === 'init' && !isSetup) {
          const { apiKey, model, config } = message;
          
          console.log('[WS Proxy] 🔑 Initializing with API key');
          console.log('[WS Proxy] 📦 Model:', model);
          console.log('[WS Proxy] 🌐 Connecting to Gemini Live API...');
          
          // Connect to Gemini with API key (use v1beta for better stability)
          const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
          
          geminiWs = new WebSocket(geminiUrl);
          
          geminiWs.on('open', () => {
            console.log('[WS Proxy] ✅ Connected to Gemini Live API!');
            isSetup = true;
            
            // Send setup message to Gemini (EXACT format from official docs!)
            const setupMessage = {
              setup: {
                model: model,
                generationConfig: {
                  responseModalities: ["audio"],  // MUST be lowercase "audio" in array
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: {
                        voiceName: "Aoede"  // One of: Aoede, Puck, Charon, Kore, Fenrir
                      }
                    }
                  }
                },
                systemInstruction: config.systemInstruction
              }
            };
            
            console.log('[WS Proxy] 📤 Sending setup to Gemini (full JSON):', JSON.stringify(setupMessage, null, 2));
            console.log('[WS Proxy] 📋 Config received from client:', JSON.stringify(config, null, 2));
            console.log('[WS Proxy] 📋 Model:', model);
            
            geminiWs!.send(JSON.stringify(setupMessage));
            
            // Notify client that proxy connection is established
            clientWs.send(JSON.stringify({ 
              type: 'proxyReady',
              message: 'Proxy connected to Gemini'
            }));
          });
          
          geminiWs.on('message', (geminiData: Buffer) => {
            // Forward all messages from Gemini to browser client
            if (clientWs.readyState === WebSocket.OPEN) {
              const parsed = JSON.parse(geminiData.toString());
              console.log('[WS Proxy] 📥 From Gemini:', Object.keys(parsed)[0]);
              clientWs.send(geminiData);
            }
          });
          
          geminiWs.on('error', (error) => {
            console.error('[WS Proxy] ❌ Gemini error:', error);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'error',
                error: { message: 'Gemini connection failed' }
              }));
            }
          });
          
          geminiWs.on('close', (code, reason) => {
            console.log('[WS Proxy] 🔌 Gemini closed:', { code, reason: reason.toString() });
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close(code, reason.toString());
            }
          });
          
        } else if (message.type === 'audio' && isSetup && geminiWs) {
          // Forward audio to Gemini (EXACT format from official docs!)
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  mimeType: 'audio/pcm;rate=16000',  // MUST include sample rate!
                  data: message.data
                }]
              }
            }));
          }
          
        } else if (message.type === 'text' && isSetup && geminiWs) {
          // Forward text to Gemini
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
              clientContent: {
                turns: [{ parts: [{ text: message.text }] }],
                turnComplete: true
              }
            }));
          }
          
        } else {
          console.warn('[WS Proxy] ⚠️ Unexpected message or not ready:', {
            type: message.type,
            isSetup,
            hasGeminiWs: !!geminiWs
          });
        }
        
      } catch (error) {
        console.error('[WS Proxy] ❌ Parse error:', error);
      }
    });

    clientWs.on('close', () => {
      console.log('[WS Proxy] 🔌 Browser client disconnected');
      if (geminiWs) {
        geminiWs.close();
      }
    });

    clientWs.on('error', (error) => {
      console.error('[WS Proxy] ❌ Client error:', error);
      if (geminiWs) {
        geminiWs.close();
      }
    });
  });

  return wss;
}
