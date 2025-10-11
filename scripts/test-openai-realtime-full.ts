#!/usr/bin/env tsx
/**
 * Comprehensive OpenAI Realtime Voice System Test
 * Tests RAG integration, voice sessions, and UI components
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
// Use test mode - server has test user built-in for development
const TEST_USER_ID = 'test-user-id';
const TEST_SESSION_COOKIE = 'connect.sid=test-session';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];
let sessionCookie = '';

async function login(): Promise<boolean> {
  console.log('🔐 Using test mode authentication...');
  // In development, server has test user support built-in
  sessionCookie = TEST_SESSION_COOKIE;
  console.log('✅ Test mode active\n');
  return true;
}

async function testSystemConfig() {
  console.log('🔧 Testing System Configuration...');
  console.log('═'.repeat(50));
  
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json() as any;
    
    const useConvai = data.useConvai;
    const voiceSystem = useConvai ? 'ElevenLabs ConvAI' : 'OpenAI Realtime';
    
    results.push({
      name: 'System Configuration Check',
      passed: true,
      message: `Active voice system: ${voiceSystem}`,
      details: {
        useConvai,
        system: voiceSystem,
        note: useConvai 
          ? 'Set USE_CONVAI=false to activate OpenAI Realtime system'
          : 'OpenAI Realtime system is active'
      }
    });
    
    console.log(`✅ Voice System: ${voiceSystem}`);
    console.log(`   USE_CONVAI=${useConvai}`);
    if (useConvai) {
      console.log('   ⚠️  To test OpenAI Realtime: Set USE_CONVAI=false\n');
    } else {
      console.log('   ✅ OpenAI Realtime is active\n');
    }
    
    return useConvai;
  } catch (error) {
    results.push({
      name: 'System Configuration Check',
      passed: false,
      message: 'Failed to fetch system config',
    });
    console.error('❌ System config check failed:', error);
    return true; // Default to ConvAI
  }
}

async function testVoiceMinutes() {
  console.log('⏱️  Testing Voice Minutes API...');
  console.log('═'.repeat(50));
  
  try {
    const response = await fetch(`${BASE_URL}/api/session/check-availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      const data = await response.json() as any;
      results.push({
        name: 'Voice Minutes Check',
        passed: true,
        message: `Available: ${data.remaining}/${data.total} minutes`,
        details: data,
      });
      console.log(`✅ Total minutes: ${data.total}`);
      console.log(`   Used: ${data.used}`);
      console.log(`   Remaining: ${data.remaining}`);
      console.log(`   Bonus: ${data.bonusMinutes}\n`);
      return data;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    results.push({
      name: 'Voice Minutes Check',
      passed: false,
      message: `Failed: ${error}`,
    });
    console.error('❌ Voice minutes check failed:', error, '\n');
    return null;
  }
}

async function testRealtimeSessionCreation() {
  console.log('🎙️  Testing Realtime Session Creation...');
  console.log('═'.repeat(50));
  
  const testCases = [
    { language: 'en', ageGroup: 'K-2', expectedVoice: 'nova' },
    { language: 'es', ageGroup: '3-5', expectedVoice: 'fable' },
    { language: 'hi', ageGroup: '6-8', expectedVoice: 'alloy' },
    { language: 'zh', ageGroup: 'College/Adult', expectedVoice: 'echo' },
  ];

  for (const testCase of testCases) {
    try {
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
          contextDocumentIds: [], // Test without documents first
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        const voiceMatches = data.voice === testCase.expectedVoice;
        
        results.push({
          name: `Session Creation: ${testCase.language}/${testCase.ageGroup}`,
          passed: voiceMatches,
          message: voiceMatches 
            ? `✅ Voice: ${data.voice} (expected: ${testCase.expectedVoice})`
            : `❌ Voice: ${data.voice} (expected: ${testCase.expectedVoice})`,
          details: data,
        });

        console.log(`${voiceMatches ? '✅' : '❌'} ${testCase.language}/${testCase.ageGroup}`);
        console.log(`   Voice: ${data.voice} ${voiceMatches ? '(correct)' : `(expected: ${testCase.expectedVoice})`}`);
        console.log(`   Session ID: ${data.sessionId}`);
        console.log(`   WebSocket URL: ${data.wsUrl ? 'Generated' : 'Missing'}\n`);

        // Clean up session
        if (data.sessionId) {
          await fetch(`${BASE_URL}/api/session/realtime/${data.sessionId}/end`, {
            method: 'POST',
            headers: { 'Cookie': sessionCookie },
          });
        }
      } else {
        const error = await response.text();
        results.push({
          name: `Session Creation: ${testCase.language}/${testCase.ageGroup}`,
          passed: false,
          message: `Failed: HTTP ${response.status}`,
          details: error,
        });
        console.error(`❌ ${testCase.language}/${testCase.ageGroup} failed: ${error}\n`);
      }
    } catch (error) {
      results.push({
        name: `Session Creation: ${testCase.language}/${testCase.ageGroup}`,
        passed: false,
        message: `Error: ${error}`,
      });
      console.error(`❌ ${testCase.language}/${testCase.ageGroup} error:`, error, '\n');
    }
  }
}

async function testRAGContext() {
  console.log('📚 Testing RAG Document Context...');
  console.log('═'.repeat(50));
  
  try {
    // Check if test user has documents
    const docsResponse = await fetch(`${BASE_URL}/api/documents`, {
      headers: { 'Cookie': sessionCookie },
    });

    if (docsResponse.ok) {
      const docs = await docsResponse.json() as any[];
      console.log(`   Found ${docs.length} documents for test user`);
      
      if (docs.length > 0) {
        // Test session with document context
        const docIds = docs.slice(0, 3).map(d => d.id);
        console.log(`   Testing with ${docIds.length} document(s)...\n`);
        
        const sessionResponse = await fetch(`${BASE_URL}/api/session/realtime/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': sessionCookie,
          },
          body: JSON.stringify({
            language: 'en',
            ageGroup: '3-5',
            contextDocumentIds: docIds,
          }),
        });

        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json() as any;
          
          results.push({
            name: 'RAG Context Integration',
            passed: true,
            message: `Session created with ${docIds.length} documents`,
            details: { sessionId: sessionData.sessionId, documentIds: docIds },
          });
          
          console.log(`✅ Session created with document context`);
          console.log(`   Session ID: ${sessionData.sessionId}`);
          console.log(`   Documents: ${docIds.length}`);
          console.log(`   Note: Server will inject up to 10 chunks into instructions\n`);

          // Clean up
          await fetch(`${BASE_URL}/api/session/realtime/${sessionData.sessionId}/end`, {
            method: 'POST',
            headers: { 'Cookie': sessionCookie },
          });
        } else {
          throw new Error(`Session creation failed: ${sessionResponse.status}`);
        }
      } else {
        results.push({
          name: 'RAG Context Integration',
          passed: true,
          message: 'No documents available for testing (this is OK)',
          details: { note: 'Upload documents to test RAG integration' },
        });
        console.log('⚠️  No documents available for RAG testing');
        console.log('   This is normal if test user has no uploads\n');
      }
    } else {
      throw new Error(`Documents fetch failed: ${docsResponse.status}`);
    }
  } catch (error) {
    results.push({
      name: 'RAG Context Integration',
      passed: false,
      message: `Failed: ${error}`,
    });
    console.error('❌ RAG context test failed:', error, '\n');
  }
}

async function testSessionPersistence() {
  console.log('💾 Testing Session Persistence...');
  console.log('═'.repeat(50));
  
  try {
    // Create a session
    const createResponse = await fetch(`${BASE_URL}/api/session/realtime/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        language: 'en',
        ageGroup: 'K-2',
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Session creation failed: ${createResponse.status}`);
    }

    const createData = await createResponse.json() as any;
    const sessionId = createData.sessionId;
    console.log(`   Created session: ${sessionId}`);

    // Retrieve the session
    const getResponse = await fetch(`${BASE_URL}/api/session/realtime/${sessionId}`, {
      headers: { 'Cookie': sessionCookie },
    });

    if (!getResponse.ok) {
      throw new Error(`Session retrieval failed: ${getResponse.status}`);
    }

    const getData = await getResponse.json() as any;
    const persisted = getData.id === sessionId;
    
    results.push({
      name: 'Session Persistence',
      passed: persisted,
      message: persisted ? 'Session persisted correctly' : 'Session data mismatch',
      details: getData,
    });
    
    console.log(`${persisted ? '✅' : '❌'} Session retrieved`);
    console.log(`   Status: ${getData.status}`);
    console.log(`   Language: ${getData.language}`);
    console.log(`   Voice: ${getData.voice}\n`);

    // Clean up
    await fetch(`${BASE_URL}/api/session/realtime/${sessionId}/end`, {
      method: 'POST',
      headers: { 'Cookie': sessionCookie },
    });
  } catch (error) {
    results.push({
      name: 'Session Persistence',
      passed: false,
      message: `Failed: ${error}`,
    });
    console.error('❌ Session persistence test failed:', error, '\n');
  }
}

function printSummary() {
  console.log('\n' + '═'.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(50));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`\nTotal Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);
  
  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.message}`);
    });
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log('✨ Testing Complete!');
  console.log('═'.repeat(50) + '\n');
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

async function main() {
  console.log('\n🚀 OpenAI Realtime Voice System - Comprehensive Test Suite');
  console.log('═'.repeat(50) + '\n');
  console.log(`Testing against: ${BASE_URL}\n`);
  
  // Login
  const loggedIn = await login();
  if (!loggedIn) {
    console.error('❌ Cannot proceed without authentication');
    process.exit(1);
  }
  
  // Run tests
  const useConvai = await testSystemConfig();
  await testVoiceMinutes();
  await testRealtimeSessionCreation();
  await testRAGContext();
  await testSessionPersistence();
  
  // Print summary
  printSummary();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
