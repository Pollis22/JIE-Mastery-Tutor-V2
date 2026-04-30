// =============================================================================
// JIE Mastery — Avatar Audio Bus
// -----------------------------------------------------------------------------
// A *tiny* publish/subscribe bridge for the existing voice pipeline to hand
// off ElevenLabs PCM16 16kHz audio chunks to the avatar layer WITHOUT
// modifying anything in the pipeline beyond a single dispatch call.
//
// Design rules (per brief, Section 5):
//   - Pipeline stays bit-identical when AVATAR_ENABLED=false → the dispatcher
//     is a no-op when there are no subscribers.
//   - Read-only — subscribers get a copy of the audio bytes; they cannot
//     interfere with playback through the existing speaker path.
//   - Zero throw guarantee — bus never throws; subscriber errors are caught
//     and logged so a buggy avatar can never crash the voice session.
//
// Format contract (matches the server's existing audio messages exactly):
//   - Encoding: PCM signed Int16, little-endian
//   - Sample rate: 16000 Hz
//   - Channels: 1 (mono)
//   - Chunked per-sentence, ~hundreds of ms each
// =============================================================================

export type AvatarAudioEvent =
  | { kind: 'chunk'; pcm16: Int16Array; chunkIndex: number; genId?: number }
  | { kind: 'speaking_start' }
  | { kind: 'speaking_end' }
  | { kind: 'cancel'; reason: string };

type Listener = (e: AvatarAudioEvent) => void;

const listeners = new Set<Listener>();

export function subscribeAvatarAudio(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function dispatchAvatarAudio(e: AvatarAudioEvent): void {
  if (listeners.size === 0) return; // hot path no-op when avatar layer is dormant
  // Copy iteration set so an unsubscribe during dispatch doesn't break iteration.
  for (const fn of Array.from(listeners)) {
    try {
      fn(e);
    } catch (err) {
      // Never let a buggy subscriber bubble up into the voice pipeline.
      // eslint-disable-next-line no-console
      console.error('[AvatarAudioBus] subscriber threw:', err);
    }
  }
}

/**
 * Decode a base64 PCM16 16kHz mono buffer into an Int16Array suitable for
 * Simli's sendAudioData(). Mirrors what the speaker path already does, but
 * stays in Int16 form (Simli wants Int16, not Float32).
 *
 * Returns null if the input is malformed — caller treats null as "skip".
 */
export function base64PcmToInt16(b64: string): Int16Array | null {
  if (!b64 || typeof b64 !== 'string') return null;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // Ensure even length — PCM16 is 2 bytes per sample.
    const usableLen = bytes.byteLength - (bytes.byteLength % 2);
    return new Int16Array(bytes.buffer, bytes.byteOffset, usableLen / 2);
  } catch {
    return null;
  }
}

// Test-only escape hatch (never used in production, useful for unit tests).
export function _resetAvatarAudioBusForTests(): void {
  listeners.clear();
}
