import { config } from 'dotenv';
config();

import { createClient } from "@deepgram/sdk";
import { ElevenLabsClient } from "elevenlabs";
import Anthropic from "@anthropic-ai/sdk";

async function testVoiceSystem() {
  console.log("==================================");
  console.log("Testing Voice System Components");
  console.log("==================================\n");

  let testsPasssed = 0;
  let testsFailed = 0;

  // Test 1: Deepgram API Key
  console.log("1️⃣ Testing Deepgram API...");
  try {
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) {
      throw new Error("DEEPGRAM_API_KEY not found");
    }
    console.log("   ✅ API key found:", deepgramKey.substring(0, 15) + "...");
    
    const deepgram = createClient(deepgramKey);
    const connection = deepgram.listen.live({
      model: "nova-2",
      language: "en-US",
      encoding: "linear16",
      sample_rate: 16000,
    });
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 5000);
      
      connection.on("open", () => {
        clearTimeout(timeout);
        console.log("   ✅ Deepgram connection successful!");
        connection.finish();
        resolve(true);
      });
      
      connection.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    
    testsPasssed++;
  } catch (error) {
    console.error("   ❌ Deepgram test failed:", error);
    testsFailed++;
  }

  console.log("");

  // Test 2: Anthropic API Key
  console.log("2️⃣ Testing Anthropic Claude API...");
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY not found");
    }
    console.log("   ✅ API key found:", anthropicKey.substring(0, 15) + "...");
    
    const anthropic = new Anthropic({
      apiKey: anthropicKey,
    });
    
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514", // Using Claude Sonnet 4
      max_tokens: 50,
      messages: [
        { role: "user", content: "Say 'Hello, test successful!' in exactly those words." }
      ],
    });
    
    const textContent = response.content.find(block => block.type === 'text');
    const responseText = textContent && 'text' in textContent ? textContent.text : "";
    console.log("   ✅ Claude response:", responseText);
    testsPasssed++;
  } catch (error) {
    console.error("   ❌ Anthropic test failed:", error);
    testsFailed++;
  }

  console.log("");

  // Test 3: ElevenLabs API Key
  console.log("3️⃣ Testing ElevenLabs TTS API...");
  try {
    const elevenlabsKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenlabsKey) {
      throw new Error("ELEVENLABS_API_KEY not found");
    }
    console.log("   ✅ API key found:", elevenlabsKey.substring(0, 15) + "...");
    
    const elevenlabs = new ElevenLabsClient({
      apiKey: elevenlabsKey,
    });
    
    const audioStream = await elevenlabs.textToSpeech.convert(
      "21m00Tcm4TlvDq8ikWAM", // Rachel voice
      {
        text: "Test successful",
        model_id: "eleven_turbo_v2_5",
        output_format: "pcm_16000",
      }
    );
    
    let totalBytes = 0;
    for await (const chunk of audioStream) {
      totalBytes += chunk.length;
      if (totalBytes > 100) break; // Just check we get some data
    }
    
    console.log("   ✅ ElevenLabs generated", totalBytes, "bytes of audio");
    testsPasssed++;
  } catch (error) {
    console.error("   ❌ ElevenLabs test failed:", error);
    testsFailed++;
  }

  console.log("\n==================================");
  console.log("TEST RESULTS:");
  console.log(`✅ Passed: ${testsPasssed}/3`);
  console.log(`❌ Failed: ${testsFailed}/3`);
  console.log("==================================");

  if (testsFailed === 0) {
    console.log("\n🎉 All voice system components are working correctly!");
    console.log("The custom voice stack is ready for use:");
    console.log("• Deepgram (STT) ✓");
    console.log("• Claude Sonnet (AI) ✓");
    console.log("• ElevenLabs (TTS) ✓");
  } else {
    console.log("\n⚠️ Some components failed. Check the error messages above.");
  }

  process.exit(testsFailed === 0 ? 0 : 1);
}

testVoiceSystem().catch(error => {
  console.error("Test failed with error:", error);
  process.exit(1);
});