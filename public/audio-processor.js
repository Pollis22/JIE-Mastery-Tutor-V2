// Audio Worklet Processor for universal microphone handling
// Processes audio at 16kHz regardless of input format

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = [];
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

    // Buffer audio data
    this.buffer.push(...monoData);

    // Send chunks of audio when buffer is full
    if (this.buffer.length >= this.bufferSize) {
      const chunk = new Float32Array(this.buffer.splice(0, this.bufferSize));
      
      // Only send if there's actual audio (not silence)
      const hasAudio = chunk.some(sample => Math.abs(sample) > 0.01);
      
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