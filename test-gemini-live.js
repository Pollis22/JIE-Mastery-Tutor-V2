#!/usr/bin/env node

const WebSocket = require('ws');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment');
  process.exit(1);
}

console.log('🔑 Testing Gemini Live API with key:', GEMINI_API_KEY.substring(0, 10) + '...');

const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

console.log('🌐 Connecting to WebSocket...');
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ WebSocket OPENED successfully!');
  console.log('📤 Sending setup message...');
  
  const setupMessage = {
    setup: {
      model: 'models/gemini-2.0-flash-live',
      generation_config: {
        response_modalities: ['AUDIO'],
        temperature: 0.8
      },
      system_instruction: {
        parts: [{ text: 'You are a helpful assistant. Say hello.' }]
      },
      tools: []
    }
  };
  
  ws.send(JSON.stringify(setupMessage));
  console.log('✅ Setup message sent');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📨 Received message:', JSON.stringify(message, null, 2).substring(0, 500));
  
  if (message.setupComplete) {
    console.log('✅ Setup complete! Sending test message...');
    
    const testMessage = {
      client_content: {
        turn_complete: true,
        turns: [{
          role: 'user',
          parts: [{ text: 'Say hello in one sentence.' }]
        }]
      }
    };
    
    ws.send(JSON.stringify(testMessage));
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', (code, reason) => {
  console.log('🔌 WebSocket closed:', {
    code,
    reason: reason.toString(),
    meaning: {
      1000: 'Normal closure',
      1001: 'Going away',
      1006: 'Abnormal closure (connection rejected)',
      1011: 'Server error'
    }[code] || 'Unknown'
  });
  
  if (code === 1006) {
    console.error('\n⚠️ Error 1006 means one of:');
    console.error('1. API key is invalid or doesn\'t exist');
    console.error('2. API key doesn\'t have access to Gemini Live API');
    console.error('3. The API endpoint URL is wrong');
    console.error('4. Network/firewall is blocking WebSocket connections');
    console.error('\nTo fix:');
    console.error('1. Go to https://aistudio.google.com/apikey');
    console.error('2. Create a new API key or verify your existing one');
    console.error('3. Make sure "Gemini 2.0 Flash" is enabled for your key');
  }
  
  process.exit(code === 1000 ? 0 : 1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏱️ Test timed out after 10 seconds');
  ws.close();
  process.exit(1);
}, 10000);