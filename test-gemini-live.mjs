#!/usr/bin/env node

import WebSocket from 'ws';

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
  console.log('📤 Sending setup message with CORRECT model...');
  
  const setupMessage = {
    setup: {
      model: 'models/gemini-2.0-flash-exp',  // THIS IS THE CORRECT MODEL!
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
  console.log('✅ Setup message sent with model: gemini-2.0-flash-exp');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📨 Received message type:', Object.keys(message)[0]);
  
  if (message.setupComplete) {
    console.log('🎉 SETUP COMPLETE! Connection successful!');
    console.log('✅ The API key works with Gemini Live!');
    ws.close(1000, 'Test successful');
  } else if (message.serverContent) {
    console.log('🤖 Server response received');
    if (message.serverContent.modelTurn?.parts?.length > 0) {
      console.log('   Has audio:', !!message.serverContent.modelTurn.parts[0].inlineData);
    }
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
      1000: 'Normal closure (SUCCESS)',
      1001: 'Going away',
      1006: 'Abnormal closure (connection rejected)',
      1008: 'Policy violation (wrong model)',
      1011: 'Server error'
    }[code] || 'Unknown'
  });
  
  if (code === 1000) {
    console.log('\n✅ ✅ ✅ SUCCESS! Gemini Live is working! ✅ ✅ ✅\n');
  }
  
  process.exit(code === 1000 ? 0 : 1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏱️ Test timed out after 10 seconds');
  ws.close();
  process.exit(1);
}, 10000);