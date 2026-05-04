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
  // Silent sink: keeps the audio graph "live" so the analyser actually receives
  // frequency data. Without this, Chrome optimizes away source→analyser chains
  // that don't terminate at destination, and getByteFrequencyData() returns all
  // zeros (which maps to VISEMES.sil → 'rest' forever). gain=0 keeps it silent.
  private silentSink: GainNode | null = null;
  // Analyser-side playback queue tail. When ElevenLabs sends a long audio chunk
  // (e.g. 7s) and we play it through the analyser source-node-style, the source
  // node finishes its 7s of "playback" and then the analyser goes silent for
  // the rest of the time the user is hearing audio. We need to schedule each
  // analyser source so it ENDS when the previous one ends + its duration —
  // mirroring the way use-custom-voice.ts schedules speaker chunks. Otherwise
  // the analyser blasts through the entire queued audio in real-time-of-arrival
  // (a few hundred ms) and the rest of the speech plays with no visemes.
  private analyserQueueEndTime = 0;
  // Wall-clock ms timestamp until which we know analyser-side audio is still
  // playing. Used by tick() to suppress the rest-hold timeout when chunks are
  // queued ahead of real time.
  private lastChunkUntil = 0;

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

    // Diagnostic: confirm we got the private fields the rest of this class assumes.
    console.log('[VisemeDiag] VisemeController constructed:', {
      hasAudioContext: !!this.internal.audioContext,
      ctxState: this.internal.audioContext?.state,
      ctxSampleRate: this.internal.audioContext?.sampleRate,
      hasAnalyser: !!this.internal.analyser,
      analyserFftSize: this.internal.analyser?.fftSize,
      analyserFreqBinCount: this.internal.analyser?.frequencyBinCount,
      lipsyncKeys: Object.keys(this.lipsync as unknown as Record<string, unknown>),
    });

    // Wire the analyser to a muted sink that DOES reach destination. This
    // keeps Chrome's audio graph from optimizing the disconnected branch
    // away. The analyser still taps the PCM upstream; gain=0 ensures zero
    // audible output. The brief's "one audible path" rule is preserved
    // because this branch contributes nothing audible.
    try {
      const ctx = this.internal.audioContext;
      if (ctx) {
        this.silentSink = ctx.createGain();
        this.silentSink.gain.value = 0;
        this.silentSink.connect(ctx.destination);
        this.internal.analyser.connect(this.silentSink);
      }
    } catch {
      // Best-effort. If wiring fails the analyser may still produce data on
      // some browsers; we fall back to whatever we get rather than crashing.
    }
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
    if (!ctx) {
      // Diagnostic: should never happen if Lipsync constructed
      if (!(this as any)._loggedNoCtx) {
        (this as any)._loggedNoCtx = true;
        console.warn('[VisemeDiag] pushPcm16: no audioContext on Lipsync');
      }
      return;
    }

    // Diagnostic: log the very first push so we know the bus → controller bridge works
    if (!(this as any)._loggedFirstPush) {
      (this as any)._loggedFirstPush = true;
      console.log('[VisemeDiag] FIRST pushPcm16:', {
        pcmLength: pcm.length,
        ctxState: ctx.state,
        ctxSampleRate: ctx.sampleRate,
        sourceSampleRate: this.opts.sourceSampleRate,
        analyserFftSize: this.internal.analyser?.fftSize,
        hasSilentSink: !!this.silentSink,
      });
    }

    // Some browsers boot the AudioContext suspended until a user gesture.
    // We resume on first push — the user has already interacted with the
    // page to start a tutor session, so this won't be blocked.
    if (ctx.state === 'suspended' && !this.suspendedForResume) {
      this.suspendedForResume = true;
      console.log('[VisemeDiag] AudioContext was suspended, resuming...');
      void ctx.resume().then(
        () => console.log('[VisemeDiag] AudioContext resumed, state:', ctx.state),
        (err) => console.warn('[VisemeDiag] AudioContext resume failed:', err)
      );
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

    // Schedule sequentially. If the previous queued source has already ended
    // (or we have no queue), start at "now". Otherwise, start exactly when the
    // previous source ends — the analyser thus gets a contiguous stream of
    // samples that mirrors the speaker's playback timeline. This is what makes
    // visemes track the audible speech instead of stopping after a fraction of
    // a second.
    const now = ctx.currentTime;
    const startAt = Math.max(now, this.analyserQueueEndTime);
    const duration = buffer.duration;
    this.analyserQueueEndTime = startAt + duration;

    try {
      source.start(startAt);
    } catch {
      // best-effort — duplicate start() throws but we always create new nodes
    }
    this.lastChunkAt = performance.now();
    // Extend the rest-hold window so tick() doesn't force 'rest' before this
    // chunk finishes playing through the analyser. Without this, a short
    // gap of <120ms between source-end and the next chunk arrival would
    // collapse to rest mid-utterance.
    this.lastChunkUntil = performance.now() + duration * 1000;
    if (this.timer === null) this.start();
  }

  /** Force the controller back to the rest pose (used on barge-in / cancel). */
  reset(): void {
    this.lastChunkAt = 0;
    this.lastChunkUntil = 0;
    // Drop the queue. Future arrivals will start at "now" instead of waiting
    // for stale future-scheduled chunks the user just bargein'd over.
    this.analyserQueueEndTime = 0;
    this.emit('rest');
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.listeners.clear();
    try {
      this.internal.analyser?.disconnect();
    } catch {
      // best-effort
    }
    try {
      this.silentSink?.disconnect();
    } catch {
      // best-effort
    }
    this.silentSink = null;
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
    let processError: unknown = null;
    try {
      this.lipsync.processAudio();
    } catch (err) {
      processError = err;
      this.emit('rest');
    }

    // Diagnostic: sample 1 in 20 ticks (~once per second at 50ms interval) to
    // see what wawa is actually reporting. Logs frequency-domain proof of life
    // by reading the analyser directly, plus the viseme symbol wawa picked.
    const tickCount = ((this as any)._tickCount ?? 0) + 1;
    (this as any)._tickCount = tickCount;
    if (tickCount % 20 === 0 && this.lastChunkAt > 0) {
      const an = this.internal.analyser;
      let energy = 0;
      let nonZero = 0;
      try {
        if (an) {
          const data = new Uint8Array(an.frequencyBinCount);
          an.getByteFrequencyData(data);
          for (let i = 0; i < data.length; i++) {
            energy += data[i];
            if (data[i] > 0) nonZero++;
          }
        }
      } catch {
        // best-effort diag
      }
      console.log('[VisemeDiag] tick', tickCount, {
        wawaViseme: this.internal.viseme,
        analyserEnergy: energy,
        nonZeroBins: nonZero,
        ctxState: this.internal.audioContext?.state,
        msSinceLastChunk: Math.round(performance.now() - this.lastChunkAt),
        processError: processError ? String(processError) : null,
      });
    }

    if (processError) return;

    // We're still in active playback if either:
    //   (a) a chunk is queued to keep playing in the future (lastChunkUntil),
    //   (b) the most recent chunk arrived less than restHoldMs ago.
    // Without (a), big chunks stop animating mid-sentence because
    // performance.now() - lastChunkAt exceeds restHoldMs while the source
    // node is still actively pushing samples through the analyser.
    const nowMs = performance.now();
    const stillPlayingQueue = nowMs < this.lastChunkUntil;
    const sinceChunk = nowMs - this.lastChunkAt;
    if (!stillPlayingQueue && sinceChunk > this.opts.restHoldMs) {
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
