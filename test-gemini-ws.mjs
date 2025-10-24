import WebSocket from 'ws';

const apiKey = process.env.GEMINI_API_KEY;

console.log('Testing with key:', apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING!');

const ws = new WebSocket(
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`
);

ws.on('open', () => {
  console.log('✅✅✅ SUCCESS! WebSocket opened!');
  ws.send(JSON.stringify({
    setup: { model: 'models/gemini-2.0-flash-exp' }
  }));
});

ws.on('error', (e) => console.error('❌ ERROR:', e.message));
ws.on('close', (code) => console.log('Closed:', code));
ws.on('message', (data) => console.log('Message:', data.toString()));

setTimeout(() => {
  console.log('Test timeout - closing');
  ws.close();
  process.exit(0);
}, 10000);
