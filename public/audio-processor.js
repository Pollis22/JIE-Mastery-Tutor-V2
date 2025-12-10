// Audio Worklet Processor for universal microphone handling
// Processes audio at 16kHz regardless of input format
// Enhanced with AGGRESSIVE Voice Activity Detection (VAD) for instant barge-in

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Smaller buffer for faster audio transmission (~32ms at 16kHz)
    this.bufferSize = 512;
    this.buffer = [];

    // AGGRESSIVE VAD for instant barge-in
    this.speechActive = false;
    this.silenceFrames = 0;
    // Very short silence threshold - only 10 frames (~25ms) before speech_end
    this.silenceThreshold = 10;
    // AGGRESSIVE: Very low RMS threshold to catch any voice activity
    this.vadThreshold = 0.003;
    // Track consecutive speech frames to avoid single-frame false positives
    this.speechFrames = 0;
    this.minSpeechFrames = 2; // Require 2 consecutive frames (~5ms) to trigger
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    // Get audio data (already resampled to 16kHz by AudioContext)
    const audioData = input[0]; // Float32Array

    // Convert to mono if stereo
    let monoData;
    if (input.length > 1 && input[1]) {
      // Mix stereo to mono
      monoData = new Float32Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        monoData[i] = (input[0][i] + input[1][i]) / 2;
      }
    } else {
      // Already mono
      monoData = audioData;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // AGGRESSIVE VAD: Check for speech on every audio frame (~2.6ms)
    // Uses very low threshold for instant barge-in detection
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const rms = Math.sqrt(
      monoData.reduce((sum, sample) => sum + sample * sample, 0) / monoData.length
    );

    // Also check peak amplitude for transients (catches plosives like "p", "t", "k")
    let maxAmp = 0;
    for (let i = 0; i < monoData.length; i++) {
      const amp = Math.abs(monoData[i]);
      if (amp > maxAmp) maxAmp = amp;
    }

    // Speech detected if RMS OR peak amplitude exceeds threshold
    const isSpeech = rms > this.vadThreshold || maxAmp > 0.02;

    if (isSpeech) {
      this.speechFrames++;
      this.silenceFrames = 0;

      // Trigger speech_start after minimum consecutive frames (avoids false positives)
      if (!this.speechActive && this.speechFrames >= this.minSpeechFrames) {
        this.speechActive = true;
        this.port.postMessage({ type: 'speech_start', rms: rms, peak: maxAmp });
      }
    } else {
      this.speechFrames = 0;

      if (this.speechActive) {
        this.silenceFrames++;
        if (this.silenceFrames >= this.silenceThreshold) {
          this.speechActive = false;
          this.port.postMessage({ type: 'speech_end' });
        }
      }
    }
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Buffer audio data
    this.buffer.push(...monoData);

    // Send chunks of audio when buffer is full
    if (this.buffer.length >= this.bufferSize) {
      const chunk = new Float32Array(this.buffer.splice(0, this.bufferSize));

      // ALWAYS send audio to Deepgram - it needs continuous stream for accurate transcription
      // Deepgram handles silence detection internally, so don't filter here
      this.port.postMessage({
        type: 'audio',
        data: chunk
      });
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);