// =============================================================================
// JIE Mastery — Simli WebRTC client wrapper
// -----------------------------------------------------------------------------
// Thin lifecycle layer over the official `simli-client` npm package (v3.x).
//
// SDK shape (per node_modules/simli-client/dist/Client.d.ts):
//   1. generateSimliSessionToken({ config: {faceId, handleSilence, ...}, apiKey })
//      → returns { session_token }
//   2. new SimliClient(session_token, videoEl, audioEl, iceServers, ...)
//   3. client.on('start' | 'stop' | 'error' | 'ack' | 'speaking' | 'silent', cb)
//   4. await client.start()                       — opens WebRTC
//   5. client.sendAudioData(Uint8Array)            — PCM16 16kHz mono bytes
//   6. client.ClearBuffer()                        — drain pending lipsync (barge-in)
//   7. await client.stop()                         — tear down
//
// Why a wrapper:
//   - Centralizes connection lifecycle so AvatarPanel.tsx stays declarative.
//   - Makes the Simli SDK an easily-swappable boundary if Buddy-the-bear
//     forces a Lemon Slice fallback later (Section 2.4 of the brief).
//   - Catch-all error handling so any SDK throw degrades to the orb fallback
//     instead of crashing the voice session.
//
// Audio contract:
//   - Pipeline produces PCM Int16 LE @ 16 kHz mono (per ElevenLabs config).
//   - Simli expects Uint8Array of those raw bytes — sendPcm16() converts.
//   - Per Simli docs: send a 6000-byte (3000-sample) silent buffer once on
//     connect to prime the lipsync stream.
// =============================================================================

import {
  SimliClient,
  generateSimliSessionToken,
  LogLevel,
} from 'simli-client';

export type SimliStatus = 'idle' | 'connecting' | 'ready' | 'failed' | 'closed';

export interface SimliClientWrapperOptions {
  apiKey: string;
  faceID: string;
  videoEl: HTMLVideoElement;
  audioEl: HTMLAudioElement;
  /** Server fills silence when no audio is being pushed — keeps the face alive. */
  handleSilence?: boolean;
  /** Max session length in seconds. Default 1 hour matches Simli demo defaults. */
  maxSessionLength?: number;
  /** Idle timeout in seconds. Default 5 minutes. */
  maxIdleTime?: number;
  onStatusChange?: (status: SimliStatus) => void;
  /** Called when Simli reports an unrecoverable failure — caller falls back to orb. */
  onFailed?: (err: unknown) => void;
}

export class SimliClientWrapper {
  private opts: SimliClientWrapperOptions;
  private client: SimliClient | null = null;
  private status: SimliStatus = 'idle';
  private connected = false;
  private hasSentInitialSilence = false;
  private cancelled = false;

  constructor(opts: SimliClientWrapperOptions) {
    this.opts = opts;
  }

  getStatus(): SimliStatus {
    return this.status;
  }

  /**
   * Open the Simli WebRTC session. Returns true on success, false on any
   * failure. Caller should treat failure as "fall back to the orb" — never
   * crash the voice session.
   */
  async connect(): Promise<boolean> {
    if (this.cancelled) return false;
    if (this.status === 'connecting' || this.status === 'ready') return true;
    this.setStatus('connecting');

    try {
      // 1. Mint a session token. We hit Simli's REST endpoint with the apiKey.
      //    NOTE: this exposes the apiKey to the browser. For a pilot in dev
      //    this is acceptable (Simli supports browser keys); for production
      //    Pollis should add a tiny `/api/avatar/token` server route that
      //    proxies generateSimliSessionToken so the key stays server-side.
      const token = await generateSimliSessionToken({
        apiKey: this.opts.apiKey,
        config: {
          faceId: this.opts.faceID,
          handleSilence: this.opts.handleSilence ?? true,
          maxSessionLength: this.opts.maxSessionLength ?? 3600,
          maxIdleTime: this.opts.maxIdleTime ?? 300,
        },
      });
      if (this.cancelled) return false;

      // 2. Construct the client. Pass null for iceServers so the SDK fetches
      //    its defaults; pass LogLevel.ERROR to keep the dev console clean.
      const client = new SimliClient(
        token.session_token,
        this.opts.videoEl,
        this.opts.audioEl,
        null,
        LogLevel.ERROR,
      );
      this.client = client;

      // 3. Wire events.
      client.on('start', () => {
        this.connected = true;
        this.setStatus('ready');
        if (!this.hasSentInitialSilence) {
          this.hasSentInitialSilence = true;
          try {
            client.sendAudioData(new Uint8Array(6000));
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[SimliClient] initial silence send failed:', err);
          }
        }
      });
      client.on('stop', () => {
        this.connected = false;
        this.setStatus('closed');
      });
      client.on('error', (detail: string) => {
        // eslint-disable-next-line no-console
        console.warn('[SimliClient] error event:', detail);
        // Don't immediately mark failed — Simli surfaces transient errors
        // via this channel. We rely on startup_error / promise rejection
        // for terminal failure.
      });
      client.on('startup_error', (msg: string) => {
        this.connected = false;
        this.setStatus('failed');
        this.opts.onFailed?.(new Error(`simli_startup_error: ${msg}`));
      });

      // 4. Start the WebRTC session. The 'start' event fires when the data
      //    channel is up; awaiting this resolves once connection is live.
      await client.start();
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SimliClient] connect threw:', err);
      this.setStatus('failed');
      this.opts.onFailed?.(err);
      return false;
    }
  }

  /**
   * Forward a PCM16 audio chunk from the existing voice pipeline. Simli wants
   * Uint8Array of the raw little-endian bytes; we expose Int16Array on the
   * input side to match what avatar-audio-bus produces.
   */
  sendPcm16(chunk: Int16Array): void {
    if (!this.client || !this.connected) return;
    try {
      // Wrap the same buffer in a Uint8Array view — no copy.
      const u8 = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      this.client.sendAudioData(u8);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[SimliClient] sendAudioData failed:', err);
    }
  }

  /** Drop any in-flight Simli audio buffer (used on barge-in). */
  clearBuffer(): void {
    if (!this.client) return;
    try {
      this.client.ClearBuffer();
    } catch {
      // best-effort
    }
  }

  close(): void {
    this.cancelled = true;
    if (!this.client) {
      this.setStatus('closed');
      return;
    }
    try {
      // .stop() returns a promise; we don't await on teardown.
      void this.client.stop();
    } catch {
      // best-effort
    }
    this.client = null;
    this.connected = false;
    this.hasSentInitialSilence = false;
    this.setStatus('closed');
  }

  private setStatus(s: SimliStatus) {
    if (this.status === s) return;
    this.status = s;
    this.opts.onStatusChange?.(s);
  }
}
