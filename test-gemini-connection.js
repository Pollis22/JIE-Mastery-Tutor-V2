const fetch = require('node-fetch');

async function testGeminiConnection() {
  console.log('1. Logging in...');
  const loginRes = await fetch('http://localhost:5000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'pollis@mfhfoods.com',
      password: 'Crenshaw22$$'
    })
  });
  
  const cookie = loginRes.headers.get('set-cookie');
  console.log('2. Got cookie');
  
  console.log('3. Creating Gemini session...');
  const sessionRes = await fetch('http://localhost:5000/api/session/gemini', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': cookie
    },
    body: JSON.stringify({
      studentAge: 12,
      gradeLevel: '6-8',
      subject: 'General',
      language: 'english',
      documentIds: []
    })
  });
  
  const sessionData = await sessionRes.json();
  console.log('4. Session response:', sessionData);
  
  if (sessionData.success) {
    console.log('5. Connecting WebSocket to test setup message...');
    const WebSocket = require('ws');
    const ws = new WebSocket('ws://localhost:5000/api/gemini-ws');
    
    ws.on('open', () => {
      console.log('6. WebSocket connected, sending init message...');
      ws.send(JSON.stringify({
        type: 'init',
        apiKey: 'AIzaSyBzzBQYFvDVlstJBkqxRAJ1TbHcOwN8PkQ',
        model: 'models/gemini-2.0-flash-exp',
        config: {
          systemInstruction: {
            parts: [{ text: 'You are Dr. Morgan, a friendly AI tutor.' }]
          },
          generationConfig: {
            responseModalities: 'audio',
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
            }
          }
        }
      }));
    });
    
    ws.on('message', (data) => {
      console.log('7. Received:', data.toString());
    });
    
    ws.on('close', (code, reason) => {
      console.log('8. WebSocket closed:', code, reason.toString());
    });
    
    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  }
}

testGeminiConnection().catch(console.error);