import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

export interface DeepgramConnection {
  send: (audioData: Buffer) => void;
  close: () => void;
}

export async function startDeepgramStream(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (error: Error) => void
): Promise<DeepgramConnection> {
  
  const connection = deepgram.listen.live({
    model: "nova-2",
    language: "en-US",
    smart_format: true,
    interim_results: true,
    utterance_end_ms: 1000,
    vad_events: true,
    encoding: "linear16",
    sample_rate: 16000,
  });

  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log("[Deepgram] ✅ Connection opened");
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    const isFinal = data.is_final;
    
    if (transcript && transcript.length > 0) {
      console.log(`[Deepgram] ${isFinal ? '📝 FINAL' : '⏳ interim'}: ${transcript}`);
      onTranscript(transcript, isFinal);
    }
  });

  connection.on(LiveTranscriptionEvents.Error, (error) => {
    console.error("[Deepgram] ❌ Error:", error);
    onError(error);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log("[Deepgram] 🔌 Connection closed");
  });

  // Wait for connection to open
  await new Promise((resolve) => {
    connection.on(LiveTranscriptionEvents.Open, resolve);
  });

  return {
    send: (audioData: Buffer) => {
      if (connection) {
        connection.send(audioData);
      }
    },
    close: () => {
      if (connection) {
        connection.finish();
      }
    },
  };
}
