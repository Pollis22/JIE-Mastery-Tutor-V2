// =============================================================================
// JIE Mastery — Viseme client
// -----------------------------------------------------------------------------
// Same role the deleted simli-client wrapper played: own the avatar's
// connection to the voice pipeline. Subscribes to the avatar audio bus,
// forwards PCM chunks into the VisemeController, exposes a status surface
// the AvatarPanel can use to fall back to the orb on failure.
//
// Audio bus contract is sacred — see avatar-audio-bus.ts. We never publish
// back to the bus and never modify the speaker path in use-custom-voice.ts.
// =============================================================================

import {
  subscribeAvatarAudio,
  AvatarAudioEvent,
} from './avatar-audio-bus';
import { VisemeController, VisemeListener, VisemeSymbol } from './viseme-controller';

export type VisemeClientStatus = 'idle' | 'ready' | 'failed' | 'closed';

export interface VisemeClientOptions {
  /** Polling interval for the lipsync analyser (ms). Default 50. */
  intervalMs?: number;
  /** Hold time before forcing rest viseme after last chunk (ms). Default 120. */
  restHoldMs?: number;
  onStatusChange?: (status: VisemeClientStatus) => void;
  onFailed?: (err: unknown) => void;
}

export class VisemeClient {
  private controller: VisemeController | null = null;
  private unsubscribeBus: (() => void) | null = null;
  private status: VisemeClientStatus = 'idle';
  private opts: VisemeClientOptions;

  constructor(opts: VisemeClientOptions = {}) {
    this.opts = opts;
  }

  getStatus(): VisemeClientStatus {
    return this.status;
  }

  /** Boot the controller and subscribe to the audio bus. */
  connect(): boolean {
    if (this.status === 'ready') return true;
    try {
      console.log('[VisemeDiag] VisemeClient.connect() starting...');
      this.controller = new VisemeController({
        intervalMs: this.opts.intervalMs,
        restHoldMs: this.opts.restHoldMs,
      });
      this.unsubscribeBus = subscribeAvatarAudio((e: AvatarAudioEvent) => {
        this.handleBusEvent(e);
      });
      this.setStatus('ready');
      console.log('[VisemeDiag] VisemeClient.connect() succeeded, bus subscribed');
      return true;
    } catch (err) {
      console.warn('[VisemeClient] connect failed:', err);
      console.warn('[VisemeDiag] VisemeClient.connect() FAILED:', err);
      this.setStatus('failed');
      this.opts.onFailed?.(err);
      return false;
    }
  }

  subscribeViseme(fn: VisemeListener): () => void {
    if (!this.controller) {
      // Controller not yet started — return a no-op unsub.
      fn('rest');
      return () => {};
    }
    return this.controller.subscribe(fn);
  }

  getCurrentViseme(): VisemeSymbol {
    return this.controller?.getCurrent() ?? 'rest';
  }

  /** Tear down the audio subscription and the controller. Idempotent. */
  close(): void {
    if (this.unsubscribeBus) {
      try {
        this.unsubscribeBus();
      } catch {
        // best-effort
      }
      this.unsubscribeBus = null;
    }
    if (this.controller) {
      try {
        this.controller.destroy();
      } catch {
        // best-effort
      }
      this.controller = null;
    }
    this.setStatus('closed');
  }

  private handleBusEvent(e: AvatarAudioEvent): void {
    const c = this.controller;
    if (!c) {
      if (!(this as any)._loggedNoController) {
        (this as any)._loggedNoController = true;
        console.warn('[VisemeDiag] handleBusEvent: no controller, dropping event:', e.kind);
      }
      return;
    }

    // Diagnostic: log first event of each kind so we know the bus is wired up
    const seen = ((this as any)._seenKinds ?? new Set<string>()) as Set<string>;
    if (!seen.has(e.kind)) {
      seen.add(e.kind);
      (this as any)._seenKinds = seen;
      console.log('[VisemeDiag] FIRST bus event of kind:', e.kind,
        e.kind === 'chunk' ? { pcmLength: (e as { pcm16: Int16Array }).pcm16.length } : {});
    }

    switch (e.kind) {
      case 'chunk':
        c.pushPcm16(e.pcm16);
        break;
      case 'cancel':
      case 'speaking_end':
        c.reset();
        break;
      case 'speaking_start':
        // analyser is already armed via the polling timer; nothing to do.
        break;
    }
  }

  private setStatus(s: VisemeClientStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.opts.onStatusChange?.(s);
  }
}
