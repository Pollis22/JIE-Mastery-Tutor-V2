// =============================================================================
// JIE Mastery — Viseme controller
// -----------------------------------------------------------------------------
// Owns a single `wawa-lipsync` Lipsync instance and the current viseme symbol.
// Subscribers receive coarse mouth-shape symbols (A-I + 'rest') that the
// VisemeAvatar component swaps PNGs for.
//
// We DO NOT use Lipsync.connectAudio() — that helper internally connects the
// analyser to AudioContext.destination, which would produce a second audible
// audio path (the existing speaker path in use-custom-voice.ts is the only
// audible path the brief allows). Instead we reach in for the private
// `analyser` + `audioContext` and feed PCM16 chunks via AudioBufferSourceNodes
// that connect ONLY to the analyser. The analyser stays silent.
// =============================================================================

import { Lipsync, VISEMES } from 'wawa-lipsync';

export type VisemeSymbol = 'rest' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export type VisemeListener = (symbol: VisemeSymbol) => void;

// wawa-lipsync emits one of 15 fine-grained visemes; we collapse to the 9
// rendered PNGs + a 'rest' fallback that maps to {persona}-base.png.
const WAWA_TO_SYMBOL: Record<string, VisemeSymbol> = {
  [VISEMES.sil]: 'rest',
  [VISEMES.PP]: 'A',
  [VISEMES.FF]: 'B',
  [VISEMES.TH]: 'C',
  [VISEMES.DD]: 'D',
  [VISEMES.nn]: 'D',
  [VISEMES.kk]: 'E',
  [VISEMES.CH]: 'F',
  [VISEMES.SS]: 'F',
  [VISEMES.RR]: 'G',
  [VISEMES.aa]: 'H',
  [VISEMES.E]: 'H',
  [VISEMES.I]: 'H',
  [VISEMES.O]: 'I',
  [VISEMES.U]: 'I',
};

interface InternalLipsync {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  viseme: string;
}

export interface VisemeControllerOptions {
  /** Source PCM sample rate (the audio bus emits 16 kHz mono Int16). */
  sourceSampleRate?: number;
  /** ms between processAudio() polls — brief default 50 ms. */
  intervalMs?: number;
  /** ms of silence after the last chunk before we force a 'rest' viseme. */
  restHoldMs?: number;
}

export class VisemeController {
  private lipsync: Lipsync;
  private internal: InternalLipsync;
  private listeners = new Set<VisemeListener>();
  private currentSymbol: VisemeSymbol = 'rest';
  private timer: number | null = null;
  private lastChunkAt = 0;
  private destroyed = false;
  private opts: Required<VisemeControllerOptions>;
  private suspendedForResume = false;

  constructor(opts: VisemeControllerOptions = {}) {
    this.opts = {
      sourceSampleRate: opts.sourceSampleRate ?? 16000,
      intervalMs: opts.intervalMs ?? 50,
      restHoldMs: opts.restHoldMs ?? 120,
    };
    this.lipsync = new Lipsync({ fftSize: 1024, historySize: 8 });
    // Reach in for the private fields so we can feed PCM directly into the
    // analyser without ever connecting to destination.
    this.internal = this.lipsync as unknown as InternalLipsync;
  }

  subscribe(fn: VisemeListener): () => void {
    this.listeners.add(fn);
    fn(this.currentSymbol);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Start the polling timer. Idempotent. */
  start(): void {
    if (this.destroyed || this.timer !== null) return;
    this.timer = window.setInterval(() => this.tick(), this.opts.intervalMs);
  }

  /** Stop the polling timer but keep the audio context alive. */
  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.emit('rest');
  }

  /**
   * Push a PCM16 mono chunk (typically 16 kHz from the audio bus) into the
   * analyser. We construct an AudioBuffer at the source sample rate so the
   * browser handles resampling internally.
   */
  pushPcm16(pcm: Int16Array): void {
    if (this.destroyed) return;
    const ctx = this.internal.audioContext;
    if (!ctx) return;

    // Some browsers boot the AudioContext suspended until a user gesture.
    // We resume on first push — the user has already interacted with the
    // page to start a tutor session, so this won't be blocked.
    if (ctx.state === 'suspended' && !this.suspendedForResume) {
      this.suspendedForResume = true;
      void ctx.resume().catch(() => {
        /* no-op — falls back to rest viseme */
      });
    }

    let buffer: AudioBuffer;
    try {
      buffer = ctx.createBuffer(1, pcm.length, this.opts.sourceSampleRate);
    } catch {
      // Some implementations reject sample rates outside their accepted range.
      // Fall back to the context's native rate; the analyser still gets data.
      buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    }
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) {
      channel[i] = pcm[i] / 32768;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.internal.analyser);
    // CRITICAL: do NOT connect to ctx.destination — analyser must stay silent.
    try {
      source.start();
    } catch {
      // best-effort — duplicate start() throws but we always create new nodes
    }
    this.lastChunkAt = performance.now();
    if (this.timer === null) this.start();
  }

  /** Force the controller back to the rest pose (used on barge-in / cancel). */
  reset(): void {
    this.lastChunkAt = 0;
    this.emit('rest');
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.listeners.clear();
    try {
      void this.internal.audioContext?.close();
    } catch {
      // best-effort
    }
  }

  getCurrent(): VisemeSymbol {
    return this.currentSymbol;
  }

  private tick(): void {
    if (this.destroyed) return;
    try {
      this.lipsync.processAudio();
    } catch {
      // Library threw — emit rest and stay running.
      this.emit('rest');
      return;
    }
    const sinceChunk = performance.now() - this.lastChunkAt;
    if (sinceChunk > this.opts.restHoldMs) {
      this.emit('rest');
      return;
    }
    const wawaViseme = this.internal.viseme;
    const symbol = WAWA_TO_SYMBOL[wawaViseme] ?? 'rest';
    this.emit(symbol);
  }

  private emit(symbol: VisemeSymbol): void {
    if (symbol === this.currentSymbol) return;
    this.currentSymbol = symbol;
    for (const fn of Array.from(this.listeners)) {
      try {
        fn(symbol);
      } catch {
        // never let a bad subscriber kill the controller
      }
    }
  }
}
