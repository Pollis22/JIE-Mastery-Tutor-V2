#!/usr/bin/env tsx
/**
 * Test Script for OpenAI Realtime API Voice Integration
 * 
 * Tests:
 * 1. Session creation with language/age group
 * 2. Voice mapping (language + age → OpenAI voice)
 * 3. WebSocket connection and authentication
 * 4. Session persistence and minute tracking
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

interface SessionResponse {
  sessionId: string;
  wsUrl: string;
  token: string;
  language: string;
  ageGroup: string;
  voice: string;
  availableMinutes: number;
  status: string;
}

async function loginAsTestUser() {
  console.log('🔐 Logging in as test user...');
  
  const response = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'TestPass123!',
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.statusText}`);
  }

  const cookies = response.headers.get('set-cookie');
  if (!cookies) {
    throw new Error('No session cookie received');
  }

  console.log('✅ Logged in successfully\n');
  return cookies;
}

async function testVoiceMapping(sessionCookie: string) {
  console.log('🎵 Testing Voice Mapping...');
  console.log('═'.repeat(50));

  const testCases = [
    { language: 'en', ageGroup: 'K-2', expectedVoice: 'nova' },
    { language: 'en', ageGroup: '3-5', expectedVoice: 'fable' },
    { language: 'es', ageGroup: '6-8', expectedVoice: 'alloy' },
    { language: 'hi', ageGroup: '9-12', expectedVoice: 'echo' },
    { language: 'zh', ageGroup: 'College/Adult', expectedVoice: 'echo' },
  ];

  for (const testCase of testCases) {
    const response = await fetch(`${BASE_URL}/api/session/realtime/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        language: testCase.language,
        ageGroup: testCase.ageGroup,
        subject: 'math',
      }),
    });

    if (!response.ok) {
      console.error(`❌ Failed: ${testCase.language}/${testCase.ageGroup}`);
      continue;
    }

    const session = await response.json() as SessionResponse;
    
    const match = session.voice === testCase.expectedVoice ? '✅' : '❌';
    console.log(
      `${match} ${testCase.language}/${testCase.ageGroup} → ` +
      `voice="${session.voice}" (expected: "${testCase.expectedVoice}")`
    );

    // Cleanup: end session
    await fetch(`${BASE_URL}/api/session/realtime/${session.sessionId}/end`, {
      method: 'POST',
      headers: { 'Cookie': sessionCookie },
    });
  }

  console.log('');
}

async function testWebSocketConnection(sessionCookie: string) {
  console.log('🔌 Testing WebSocket Connection...');
  console.log('═'.repeat(50));

  // Create session
  const response = await fetch(`${BASE_URL}/api/session/realtime/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie,
    },
    body: JSON.stringify({
      language: 'en',
      ageGroup: '3-5',
      subject: 'math',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create session');
  }

  const session = await response.json() as SessionResponse;
  console.log(`✅ Session created: ${session.sessionId}`);
  console.log(`   Language: ${session.language}, Age: ${session.ageGroup}, Voice: ${session.voice}`);

  // Connect WebSocket
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(session.wsUrl);
    let connectionEstablished = false;

    ws.on('open', () => {
      console.log('✅ WebSocket connected successfully');
      connectionEstablished = true;
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`📨 Received: ${message.type}`);

        if (message.type === 'session.ready') {
          console.log('✅ Session ready - connection fully established');
          
          // Close connection after successful test
          setTimeout(() => {
            ws.close();
            resolve();
          }, 1000);
        }
      } catch (error) {
        // Binary audio data - ignore for this test
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      reject(error);
    });

    ws.on('close', (code, reason) => {
      if (!connectionEstablished) {
        console.error(`❌ Connection closed before establishment: ${code} - ${reason}`);
        reject(new Error(`WebSocket closed: ${code}`));
      } else {
        console.log('✅ WebSocket closed gracefully');
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!connectionEstablished) {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }
    }, 10000);
  });
}

async function testSessionPersistence(sessionCookie: string) {
  console.log('\n💾 Testing Session Persistence...');
  console.log('═'.repeat(50));

  // Create session
  const response = await fetch(`${BASE_URL}/api/session/realtime/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie,
    },
    body: JSON.stringify({
      language: 'es',
      ageGroup: 'K-2',
      subject: 'spanish',
    }),
  });

  const session = await response.json() as SessionResponse;
  console.log(`✅ Session created: ${session.sessionId}`);

  // Retrieve session
  const getResponse = await fetch(`${BASE_URL}/api/session/realtime/${session.sessionId}`, {
    headers: { 'Cookie': sessionCookie },
  });

  const retrievedSession = await getResponse.json();
  console.log(`✅ Session retrieved: ${retrievedSession.id}`);
  console.log(`   Status: ${retrievedSession.status}`);
  console.log(`   Language: ${retrievedSession.language}`);
  console.log(`   Voice: ${retrievedSession.voice}`);

  // End session
  const endResponse = await fetch(`${BASE_URL}/api/session/realtime/${session.sessionId}/end`, {
    method: 'POST',
    headers: { 'Cookie': sessionCookie },
  });

  const endResult = await endResponse.json();
  console.log(`✅ Session ended: ${endResult.sessionId}`);
  console.log(`   Minutes used: ${endResult.minutesUsed}`);
}

async function main() {
  console.log('\n🚀 OpenAI Realtime Voice API Test Suite');
  console.log('═'.repeat(50));
  console.log(`Testing against: ${BASE_URL}\n`);

  try {
    const sessionCookie = await loginAsTestUser();
    
    await testVoiceMapping(sessionCookie);
    await testWebSocketConnection(sessionCookie);
    await testSessionPersistence(sessionCookie);

    console.log('\n✨ All tests completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
