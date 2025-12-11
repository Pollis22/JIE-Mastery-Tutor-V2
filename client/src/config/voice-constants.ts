export const VOICE_TIMING = {
  SILENCE_DEBOUNCE_MS: 1200,
  POST_INTERRUPTION_BUFFER_MS: 2000,
  
  ACCUMULATION_DELAY_MS: 2500,
  PARTIAL_TRANSCRIPT_TIMEOUT_MS: 3000,
  
  KEEPALIVE_INTERVAL_MS: 5000,
  RECONNECT_DELAY_MS: 1000,
  RECONNECT_MAX_DELAY_MS: 10000,
  RECONNECT_MAX_ATTEMPTS: 5,
  
  AUDIO_CHUNK_MS: 100,
  AUDIO_QUEUE_MAX_CHUNKS: 50,
  
  MIC_RECOVERY_STAGE1_DELAY_MS: 500,
  MIC_RECOVERY_STAGE2_DELAY_MS: 1000,
  MIC_RECOVERY_STAGE3_DELAY_MS: 1500,
  MIC_RECOVERY_MAX_ATTEMPTS: 3,
  
  INACTIVITY_WARNING_MS: 240000,
  INACTIVITY_TIMEOUT_MS: 300000,
  
  DEEPGRAM_UTTERANCE_END_MS: 2000,
  DEEPGRAM_ENDPOINTING_MS: 1200,
} as const;

export const VOICE_THRESHOLDS = {
  SILENCE_RMS_THRESHOLD: 0.01,
  SPEECH_RMS_THRESHOLD: 0.02,
  
  MAX_TRANSCRIPT_MESSAGES: 200,
  TRANSCRIPT_TRIM_THRESHOLD: 250,
  
  MIC_GAIN_MULTIPLIER: 100,
} as const;

export const VOICE_MESSAGES = {
  MIC_PERMISSION_DENIED: 'Microphone access denied. Please allow microphone access in your browser settings.',
  MIC_NOT_FOUND: 'No microphone found. Please connect a microphone and try again.',
  MIC_RECOVERY_FAILED: 'Could not recover microphone. Please check your audio device and refresh the page.',
  CONNECTION_LOST: 'Connection lost. Attempting to reconnect...',
  CONNECTION_RESTORED: 'Connection restored.',
  SESSION_TIMEOUT_WARNING: 'Session will end in 1 minute due to inactivity.',
  SESSION_TIMEOUT: 'Session ended due to inactivity.',
  BROWSER_NOT_SUPPORTED: 'Your browser does not support voice recording. Please use Chrome, Firefox, or Edge.',
} as const;

export const EXCLUDED_DEVICE_PATTERNS = [
  'stereo mix',
  'what u hear',
  'wave out',
  'loopback',
  'virtual',
  'cable',
] as const;
