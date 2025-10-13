import WebSocket from 'ws';

const sessionId = 'eaa415e1-86b1-4453-a304-404990e3b575';
const token = 'ce620b5e938ed29629663eca2ebe6ffb120ffb84ed2006d030cd6f4224193eea';
const wsUrl = `ws://localhost:5000/ws/realtime/${sessionId}?token=${token}`;

console.log('🔗 Connecting to:', wsUrl);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ WebSocket connected');
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    console.log('📥 Message received:', msg.type);
    
    if (msg.type === 'session.ready') {
      console.log('✅ Session ready!');
    } else if (msg.type === 'session.updated') {
      console.log('✅ Session configured successfully');
    } else if (msg.type === 'error' || msg.type === 'server_error') {
      console.error('❌ Error from server:', msg);
    }
  } catch (e) {
    console.log('📥 Non-JSON message (likely audio)');
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('🔚 WebSocket closed');
  process.exit(0);
});

// Keep connection open for 10 seconds
setTimeout(() => {
  console.log('⏰ Test timeout - closing');
  ws.close();
}, 10000);
