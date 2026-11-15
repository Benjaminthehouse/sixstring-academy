/**
 * The whole analysis chain as one pure object: audio chunks in, events out. It is the same code
 * in the worker, on the main thread (fallback) and in the Node tests, which is what makes the live
 * pipeline testable without a browser.
 *
 *   chunk -> rumble filter -> ring buffer -+-> onset detector ---------------> onset
 *                                          +-> pitch detector -> note tracker -> pitch / noteon / noteoff / silence
 *                                          +-> level meter -------------------> level
 *                                          +-> chroma extractor (optional) ---> chroma
 */
import { DEFAULT_A4 } from '@/core/math/pitch-math';
import { ChromaExtractor } from './chroma';
import { PitchDetector, type PitchDetectorOptions } from './detector';
import { type Biquad, highpass } from './filters';
import { toDb } from './level';
import { NoteTracker, type NoteTrackerOptions } from './note-tracker';
import { OnsetDetector, type OnsetOptions } from './onset';
import type { OnsetEvent, PitchEvent } from './types';

/** Options for {@link PitchEngine}. Everything but the sample rate has a guitar-friendly default. */
export interface PitchEngineOptions {
  sampleRate: number;
  /** Reference pitch in Hz (default 440). */
  a4?: number;
  /** Lowest pitch to track in Hz (default 60; about 30 for a 4-string bass). */
  minFreq?: number;
  /** Highest pitch to track in Hz (default 1760). */
  maxFreq?: number;
  /** Time between pitch frames in ms (default 10, i.e. about 100 readings a second). */
  hopMs?: number;
  /** Compute chroma frames for chord checking (default false; costs about one extra FFT per chroma frame). */
  chroma?: boolean;
  /** Time between chroma frames in ms (default 50). */
  chromaHopMs?: number;
  /** Chroma analysis window in ms (default 180). */
  chromaWindowMs?: number;
  /** Level events per second (default 30). */
  levelRate?: number;
  /** Fine-tuning of the pitch detector. */
  detector?: Omit<PitchDetectorOptions, 'sampleRate' | 'minFreq' | 'maxFreq'>;
  /** Fine-tuning of note segmentation, smoothing and the noise gate. */
  tracker?: Omit<NoteTrackerOptions, 'a4'>;
  /** Fine-tuning of onset detection. */
  onset?: Omit<OnsetOptions, 'sampleRate'>;
}

/** Settings that can be changed while the engine runs. */
export type EngineConfigPatch = Partial<Pick<PitchEngineOptions, 'a4' | 'minFreq' | 'maxFreq' | 'chroma'>>;

/** Sample count above which the input is considered to be clipping. */
const CLIP_LEVEL = 0.985;

/** The streaming analysis engine. Feed it consecutive chunks of mono audio of any size. */
export class PitchEngine {
  /** Sample rate in Hz. */
  readonly sampleRate: number;
  private opts: PitchEngineOptions;
  private detector!: PitchDetector;
  private tracker!: NoteTracker;
  private onsets!: OnsetDetector;
  private chroma: ChromaExtractor | null = null;
  private hp!: Biquad;
  private hpS1 = 0;
  private hpS2 = 0;

  private buf!: Float32Array;
  private cap = 0;
  private write = 0;
  private scratch = new Float32Array(0);
  private onsetOut: OnsetEvent[] = [];

  private hop = 0;
  private sinceHop = 0;
  private chromaEvery = 0;
  private hopsSinceChroma = 0;
  private levelEvery = 0;
  private hopsSinceLevel = 0;

  private origin = 0;
  private samples = 0;
  private peak = 0;
  private clipCount = 0;
  private clipUntil = -1;
  private pendingOnset: number | undefined;

  constructor(opts: PitchEngineOptions) {
    if (!(opts.sampleRate > 0)) throw new Error('PitchEngine needs a sample rate');
    this.sampleRate = opts.sampleRate;
    this.opts = { ...opts };
    this.build();
  }

  private build(): void {
    const o = this.opts;
    const sr = this.sampleRate;
    this.detector = new PitchDetector({
      // The tracker's adaptive gate decides what is a note; the detector only skips true silence.
      gateRms: 0.00015,
      ...o.detector,
      sampleRate: sr,
      minFreq: o.minFreq,
      maxFreq: o.maxFreq,
    });
    this.tracker = new NoteTracker({ ...o.tracker, a4: o.a4 ?? DEFAULT_A4 });
    this.onsets = new OnsetDetector({ minFreq: this.detector.minFreq, ...o.onset, sampleRate: sr });
    this.chroma = o.chroma
      ? new ChromaExtractor({ sampleRate: sr, a4: o.a4 ?? DEFAULT_A4, windowMs: o.chromaWindowMs })
      : null;
    this.hp = highpass(this.detector.minFreq * 0.5, sr);

    this.hop = Math.max(16, Math.round(((o.hopMs ?? 10) / 1000) * sr));
    this.chromaEvery = Math.max(1, Math.round((o.chromaHopMs ?? 50) / (o.hopMs ?? 10)));
    this.levelEvery = Math.max(1, Math.round(1000 / (o.levelRate ?? 30) / (o.hopMs ?? 10)));
    const need = Math.max(this.detector.historyNeeded, this.chroma ? this.chroma.windowSize : 0);
    this.cap = need + this.hop;
    this.buf = new Float32Array(this.cap * 2);
    this.clearStream(this.origin);
  }

  private clearStream(origin: number): void {
    this.write = 0;
    this.sinceHop = 0;
    this.hopsSinceChroma = 0;
    this.hopsSinceLevel = 0;
    this.origin = origin;
    this.samples = 0;
    this.peak = 0;
    this.clipCount = 0;
    this.clipUntil = -1;
    this.pendingOnset = undefined;
    this.hpS1 = 0;
    this.hpS2 = 0;
    this.onsets.reset(origin);
  }

  /** Audio-clock time of the newest sample processed. */
  get time(): number {
    return this.origin + this.samples / this.sampleRate;
  }

  /** True when chroma frames are being produced. */
  get chromaEnabled(): boolean {
    return this.chroma !== null;
  }

  /** Change settings on the fly. Changing the frequency range or chroma restarts the analysis state. */
  configure(patch: EngineConfigPatch): PitchEvent[] {
    const out: PitchEvent[] = [];
    const rebuild =
      (patch.minFreq !== undefined && patch.minFreq !== this.opts.minFreq) ||
      (patch.maxFreq !== undefined && patch.maxFreq !== this.opts.maxFreq) ||
      (patch.chroma !== undefined && patch.chroma !== !!this.opts.chroma);
    this.opts = { ...this.opts, ...patch };
    if (rebuild) {
      const origin = this.time;
      this.tracker.reset(out);
      this.origin = origin;
      this.build();
    } else if (patch.a4 !== undefined) {
      this.tracker.setA4(patch.a4);
      this.chroma?.setA4(patch.a4);
    }
    return out;
  }

  /** Start a new stream whose first sample is at `originSeconds`. A sounding note is closed in the returned events. */
  reset(originSeconds: number = 0): PitchEvent[] {
    const out: PitchEvent[] = [];
    this.tracker.reset(out);
    this.clearStream(originSeconds);
    return out;
  }

  /**
   * Analyse the next chunk.
   * @param chunk     mono samples in [-1, 1]
   * @param startTime audio-clock time of the chunk's first sample, when known. A gap or overlap of
   *                  more than 4 ms against the expected time (dropped audio) restarts the stream
   *                  state cleanly instead of analysing across the discontinuity; a smaller slip
   *                  only re-synchronises the clock.
   */
  process(chunk: ArrayLike<number>, startTime?: number): PitchEvent[] {
    const out: PitchEvent[] = [];
    if (startTime !== undefined) {
      if (this.samples === 0) {
        this.origin = startTime;
        this.onsets.reset(startTime);
      } else {
        const slip = startTime - this.time;
        if (Math.abs(slip) > 0.004) {
          this.tracker.reset(out);
          this.clearStream(startTime);
        } else if (Math.abs(slip) > 1e-6) {
          // A few dropped samples (an audio glitch): keep analysing, but stay locked to the caller's clock.
          this.origin += slip;
          this.onsets.shiftOrigin(slip);
        }
      }
    }

    const n = chunk.length;
    if (this.scratch.length < this.hop) this.scratch = new Float32Array(this.hop);
    const { b0, b1, b2, a1, a2 } = this.hp;
    let s1 = this.hpS1;
    let s2 = this.hpS2;
    let i = 0;
    while (i < n) {
      const take = Math.min(n - i, this.hop - this.sinceHop);
      if (this.write + take > this.buf.length) {
        // Slide the newest `cap` samples back to the start so the analysis tail stays contiguous.
        this.buf.copyWithin(0, this.write - this.cap, this.write);
        this.write = this.cap;
      }
      const buf = this.buf;
      const seg = this.scratch;
      let w = this.write;
      for (let j = 0; j < take; j++) {
        const x = chunk[i + j];
        const ax = x < 0 ? -x : x;
        if (ax > this.peak) this.peak = ax;
        if (ax >= CLIP_LEVEL) this.clipCount++;
        const y = b0 * x + s1;
        s1 = b1 * x - a1 * y + s2;
        s2 = b2 * x - a2 * y;
        buf[w++] = y;
        seg[j] = y;
      }
      this.write = w;
      this.samples += take;
      this.sinceHop += take;
      i += take;

      this.onsetOut.length = 0;
      this.onsets.process(take === seg.length ? seg : seg.subarray(0, take), this.onsetOut);
      for (const o of this.onsetOut) {
        out.push({ type: 'onset', time: o.time, strength: o.strength, levelDb: o.levelDb });
        this.pendingOnset = o.time;
      }
      if (this.sinceHop >= this.hop) {
        this.sinceHop = 0;
        this.frame(out);
      }
    }
    this.hpS1 = s1;
    this.hpS2 = s2;
    // Denormals would slow the filter to a crawl in long silences.
    if (Math.abs(this.hpS1) < 1e-20) this.hpS1 = 0;
    if (Math.abs(this.hpS2) < 1e-20) this.hpS2 = 0;
    return out;
  }

  private frame(out: PitchEvent[]): void {
    const time = this.time;
    const est = this.detector.detect(this.buf, this.tracker.hintFreq, this.write, this.tracker.staleFreq);
    this.tracker.push(
      {
        time,
        freq: est.freq,
        clarity: est.clarity,
        rms: est.rms,
        window: est.window / this.sampleRate,
        onsetTime: this.pendingOnset,
      },
      out,
    );
    this.pendingOnset = undefined;

    if (++this.hopsSinceLevel >= this.levelEvery) {
      this.hopsSinceLevel = 0;
      if (this.clipCount >= 3) this.clipUntil = time + 0.6;
      out.push({
        type: 'level',
        time,
        rms: est.rms,
        db: toDb(est.rms),
        peak: this.peak,
        clipping: time < this.clipUntil,
        noiseFloorDb: this.tracker.gate.floorDb,
        gateDb: this.tracker.gate.gateDb,
        hum: this.tracker.hum,
      });
      this.peak = 0;
      this.clipCount = 0;
    }

    if (this.chroma && ++this.hopsSinceChroma >= this.chromaEvery) {
      this.hopsSinceChroma = 0;
      const span = Math.min(this.write, this.chroma.windowSize);
      const f = this.chroma.analyze(this.buf, this.write);
      // Below the gate there is nothing to name: report an empty frame rather than amplified noise.
      const quiet = f.levelDb < this.tracker.gate.gateDb - 6;
      out.push({
        type: 'chroma',
        time,
        span: span / this.sampleRate,
        chroma: quiet ? new Array<number>(12).fill(0) : f.chroma,
        bass: quiet ? -1 : f.bass,
        levelDb: f.levelDb,
      });
    }
  }
}

/** Options for {@link analyze}. */
export interface AnalyzeOptions extends Omit<PitchEngineOptions, 'sampleRate'> {
  /** Chunk size in samples used to feed the engine (default 256, like the live capture). */
  chunk?: number;
}

/** Offline analysis of a whole buffer: every event the live pipeline would have produced, in order. */
export function analyze(samples: ArrayLike<number>, sampleRate: number, opts: AnalyzeOptions = {}): PitchEvent[] {
  const { chunk = 256, ...rest } = opts;
  const engine = new PitchEngine({ sampleRate, ...rest });
  const out: PitchEvent[] = [];
  const view = samples instanceof Float32Array ? samples : Float32Array.from(samples as ArrayLike<number>);
  for (let i = 0; i < view.length; i += chunk) {
    const events = engine.process(view.subarray(i, Math.min(view.length, i + chunk)));
    for (const e of events) out.push(e);
  }
  return out;
}
