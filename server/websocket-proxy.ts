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
    let geminiApiKey: string | null = null;
    let isSetup = false;

    clientWs.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        // First message from client should contain API key
        if (!isSetup && message.apiKey) {
          geminiApiKey = message.apiKey;
          const setupMessage = message.setup;
          
          console.log('[WS Proxy] 🔑 Received API key from client');
          console.log('[WS Proxy] 🌐 Connecting to Gemini Live API...');
          
          // Connect to Gemini with API key
          const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${geminiApiKey}`;
          
          geminiWs = new WebSocket(geminiUrl);
          
          geminiWs.on('open', () => {
            console.log('[WS Proxy] ✅ Connected to Gemini Live API');
            isSetup = true;
            
            // Send setup message to Gemini
            if (setupMessage) {
              console.log('[WS Proxy] 📤 Forwarding setup message to Gemini');
              geminiWs!.send(JSON.stringify({ setup: setupMessage }));
            }
            
            // Notify client that connection is established
            clientWs.send(JSON.stringify({ 
              type: 'proxyConnected',
              message: 'Connected to Gemini via proxy'
            }));
          });
          
          geminiWs.on('message', (geminiData: Buffer) => {
            // Forward messages from Gemini to browser client
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(geminiData);
            }
          });
          
          geminiWs.on('error', (error) => {
            console.error('[WS Proxy] ❌ Gemini WebSocket error:', error);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'error',
                error: 'Gemini connection failed'
              }));
            }
          });
          
          geminiWs.on('close', (code, reason) => {
            console.log('[WS Proxy] 🔌 Gemini connection closed:', {
              code,
              reason: reason.toString()
            });
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close(code, reason.toString());
            }
          });
          
        } else if (isSetup && geminiWs && geminiWs.readyState === WebSocket.OPEN) {
          // Forward all other messages to Gemini
          geminiWs.send(JSON.stringify(message));
        } else {
          console.warn('[WS Proxy] ⚠️ Received message before setup or Gemini not connected');
        }
        
      } catch (error) {
        console.error('[WS Proxy] Parse error:', error);
      }
    });

    clientWs.on('close', () => {
      console.log('[WS Proxy] 🔌 Browser client disconnected');
      if (geminiWs) {
        geminiWs.close();
      }
    });

    clientWs.on('error', (error) => {
      console.error('[WS Proxy] Client WebSocket error:', error);
      if (geminiWs) {
        geminiWs.close();
      }
    });
  });

  return wss;
}
