// Audio Worklet Processor for universal microphone handling
// Processes audio at 16kHz regardless of input format
// Enhanced with Voice Activity Detection (VAD) for instant barge-in

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Reduced buffer size for lower latency (~128ms at 16kHz instead of ~256ms)
    this.bufferSize = 2048;
    this.buffer = [];

    // VAD (Voice Activity Detection) state for instant barge-in
    this.speechActive = false;
    this.silenceFrames = 0;
    // Balanced sensitivity: ~50ms of silence before considering speech ended
    this.silenceThreshold = 20; // frames (~50ms at 128 samples/frame)
    // RMS threshold for speech detection (balanced sensitivity)
    this.vadThreshold = 0.01;
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
    // INSTANT VAD: Check for speech on every audio frame (~2.6ms)
    // This enables instant barge-in detection without waiting for
    // the full buffer to fill or Deepgram transcription
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const rms = Math.sqrt(
      monoData.reduce((sum, sample) => sum + sample * sample, 0) / monoData.length
    );
    const isSpeech = rms > this.vadThreshold;

    if (isSpeech && !this.speechActive) {
      // Speech just started - send immediate notification for barge-in
      this.speechActive = true;
      this.silenceFrames = 0;
      this.port.postMessage({ type: 'speech_start' });
    } else if (!isSpeech && this.speechActive) {
      // Potential speech end - wait for silence threshold
      this.silenceFrames++;
      if (this.silenceFrames >= this.silenceThreshold) {
        this.speechActive = false;
        this.port.postMessage({ type: 'speech_end' });
      }
    } else if (isSpeech) {
      // Continued speech - reset silence counter
      this.silenceFrames = 0;
    }
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Buffer audio data
    this.buffer.push(...monoData);

    // Send chunks of audio when buffer is full
    if (this.buffer.length >= this.bufferSize) {
      const chunk = new Float32Array(this.buffer.splice(0, this.bufferSize));

      // Lower threshold for detecting audio (catches quieter speech)
      const hasAudio = chunk.some(sample => Math.abs(sample) > 0.005);

      if (hasAudio) {
        // Send to main thread for processing
        this.port.postMessage({
          type: 'audio',
          data: chunk
        });
      }
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);