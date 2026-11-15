/**
 * Onset (pluck / strum) detection for rhythm games and for telling a re-plucked note from one
 * that is still ringing.
 *
 * Two energy envelopes are followed in ~3 ms blocks, each averaged over a little more than one
 * period of the lowest note (so a low E does not pump them): the whole signal, and a
 * treble-emphasised copy (a new pluck over ringing strings barely moves the total energy, but its
 * pick transient is all treble). An onset is a jump of either envelope above a threshold that
 * adapts to how restless the signal has been. The reported time is then walked back to the block
 * where the energy first left its previous level, which keeps the timing error near one block.
 */
import type { OnsetEvent } from './types';

/** Options for {@link OnsetDetector}. */
export interface OnsetOptions {
  sampleRate: number;
  /** Minimum jump of the full-band envelope in dB (default 3.5). */
  thresholdDb?: number;
  /** Minimum jump of the treble envelope in dB (default 5). */
  trebleThresholdDb?: number;
  /** Onsets closer together than this are merged, in ms (default 60: the strings of one strum count once). */
  minIntervalMs?: number;
  /** Attacks quieter than this RMS level in dBFS are ignored (default -55). */
  minLevelDb?: number;
  /** Lowest note expected, in Hz (default 60). The full-band envelope is averaged over at least one period of it. */
  minFreq?: number;
}

const HISTORY = 128;

/** Streaming onset detector. Feed consecutive chunks of any size; times are sample positions / sample rate. */
export class OnsetDetector {
  private readonly sr: number;
  private readonly block: number;
  private readonly kFull: number;
  private readonly kTreble: number;
  private readonly thr: number;
  private readonly thrTreble: number;
  private readonly minBlocks: number;
  private readonly minEnergy: number;

  private readonly eFull = new Float64Array(HISTORY);
  private readonly eTreble = new Float64Array(HISTORY);
  private readonly wFull = new Float64Array(HISTORY);
  private readonly wTreble = new Float64Array(HISTORY);
  private blockIndex = 0;
  private fill = 0;
  private accFull = 0;
  private accTreble = 0;
  private prev = 0;
  private origin = 0;
  private samplesSeen = 0;
  private floorFull = 0;
  private floorTreble = 0;
  private restFull = 0;
  private restTreble = 0;
  private lastOnsetBlock = -1e9;
  private pending: { block: number; treble: boolean; strength: number } | null = null;

  constructor(opts: OnsetOptions) {
    this.sr = opts.sampleRate;
    this.block = Math.max(16, Math.round(this.sr / 350));
    const blockMs = (this.block / this.sr) * 1000;
    // At least 1.25 periods of the lowest note, or its own ripple would look like a string of plucks.
    this.kFull = Math.min(HISTORY / 4, Math.max(2, Math.round(Math.max(16, 1250 / (opts.minFreq ?? 60)) / blockMs)));
    // A bright low note is a train of pulses, one per period: the treble window must span a period too.
    this.kTreble = Math.min(HISTORY / 4, Math.max(1, Math.round(Math.max(6, 1000 / (opts.minFreq ?? 60)) / blockMs)));
    this.thr = opts.thresholdDb ?? 3.5;
    this.thrTreble = opts.trebleThresholdDb ?? 5;
    this.minBlocks = Math.max(1, Math.round((opts.minIntervalMs ?? 60) / blockMs));
    this.minEnergy = Math.pow(10, (opts.minLevelDb ?? -55) / 10);
  }

  /** Forget all state; the next chunk starts a new stream whose first sample is at `originSeconds`. */
  reset(originSeconds: number = 0): void {
    this.eFull.fill(0);
    this.eTreble.fill(0);
    this.wFull.fill(0);
    this.wTreble.fill(0);
    this.blockIndex = 0;
    this.fill = 0;
    this.accFull = 0;
    this.accTreble = 0;
    this.prev = 0;
    this.origin = originSeconds;
    this.samplesSeen = 0;
    this.floorFull = 0;
    this.floorTreble = 0;
    this.restFull = 0;
    this.restTreble = 0;
    this.lastOnsetBlock = -1e9;
    this.pending = null;
  }

  /** Move the stream clock by `seconds` without disturbing the analysis (the caller re-synchronised its clock). */
  shiftOrigin(seconds: number): void {
    this.origin += seconds;
  }

  /** Process the next chunk and return the onsets confirmed in it (each is reported ~3-6 ms after it happened). */
  process(samples: ArrayLike<number>, out: OnsetEvent[] = []): OnsetEvent[] {
    const n = samples.length;
    const block = this.block;
    let prev = this.prev;
    let accF = this.accFull;
    let accT = this.accTreble;
    let fill = this.fill;
    for (let i = 0; i < n; i++) {
      const x = samples[i];
      const d = x - prev;
      prev = x;
      accF += x * x;
      accT += d * d;
      if (++fill === block) {
        this.endBlock(accF / block, accT / block, out);
        accF = 0;
        accT = 0;
        fill = 0;
      }
    }
    this.prev = prev;
    this.accFull = accF;
    this.accTreble = accT;
    this.fill = fill;
    this.samplesSeen += n;
    return out;
  }

  private endBlock(ef: number, et: number, out: OnsetEvent[]): void {
    const b = this.blockIndex;
    const at = b % HISTORY;
    this.eFull[at] = ef;
    this.eTreble[at] = et;

    // Windowed means over the last k blocks.
    const wf = this.windowMean(this.eFull, b, this.kFull);
    const wt = this.windowMean(this.eTreble, b, this.kTreble);
    this.wFull[at] = wf;
    this.wTreble[at] = wt;

    // Slowly rising minimum = noise floor of each envelope; it stops silence from looking jumpy.
    this.floorFull = b === 0 ? wf : Math.min(wf, this.floorFull * 1.004 + 1e-13);
    this.floorTreble = b === 0 ? wt : Math.min(wt, this.floorTreble * 1.004 + 1e-13);

    let riseF = 0;
    let riseT = 0;
    if (b >= this.kFull) {
      const refF = this.wFull[(b - this.kFull) % HISTORY];
      const epsF = 3 * this.floorFull + 1e-10;
      riseF = 10 * Math.log10((wf + epsF) / (refF + epsF));
      const refT = this.wTreble[(b - this.kTreble) % HISTORY];
      const epsT = 3 * this.floorTreble + 1e-11;
      riseT = 10 * Math.log10((wt + epsT) / (refT + epsT));
    }

    if (this.pending && b > this.pending.block) {
      // One block of look-ahead is in: place the onset and report it.
      this.emit(this.pending, out);
      this.pending = null;
    }

    const loudEnough = wf >= this.minEnergy;
    const free = b - this.lastOnsetBlock >= this.minBlocks;
    if (!this.pending && free && loudEnough) {
      const hitF = riseF >= this.thr + 2 * this.restFull;
      const hitT = riseT >= this.thrTreble + 2 * this.restTreble;
      if (hitF || hitT) {
        this.pending = { block: b, treble: hitT && (!hitF || riseT > riseF), strength: Math.max(riseF, riseT) };
        this.lastOnsetBlock = b;
      }
    }

    // How restless each envelope has been lately (mean positive rise, ~200 ms memory).
    const a = 0.014;
    this.restFull += a * (Math.min(6, Math.max(0, riseF)) - this.restFull);
    this.restTreble += a * (Math.min(6, Math.max(0, riseT)) - this.restTreble);
    this.blockIndex = b + 1;
  }

  private windowMean(e: Float64Array, b: number, k: number): number {
    let s = 0;
    const n = Math.min(k, b + 1);
    for (let j = 0; j < n; j++) s += e[(b - j) % HISTORY];
    return s / n;
  }

  private emit(p: { block: number; treble: boolean; strength: number }, out: OnsetEvent[]): void {
    const e = p.treble ? this.eTreble : this.eFull;
    const k = p.treble ? this.kTreble : this.kFull;
    const b = p.block;
    // Level before the attack: the average of a few blocks from just before the analysis window.
    let before = 0;
    let count = 0;
    for (let j = k + 1; j <= k + 4; j++) {
      if (b - j < 0) break;
      before += e[(b - j) % HISTORY];
      count++;
    }
    before = count > 0 ? before / count : 0;
    const floor = p.treble ? this.floorTreble : this.floorFull;
    const level = Math.max(before, floor) * 2 + 1e-12;
    // Walk back from the trigger block while the blocks are still clearly above the old level.
    let first = b;
    for (let j = 1; j <= k; j++) {
      if (b - j < 0 || e[(b - j) % HISTORY] < level) break;
      first = b - j;
    }
    // The attack usually starts inside the first loud block: the less energy it holds compared with
    // the next one, the later in the block the attack began.
    const e0 = e[first % HISTORY];
    const e1 = e[(first + 1) % HISTORY];
    let frac = 0;
    if (e1 > e0 && e1 > 0) frac = Math.min(0.9, Math.max(0, 1 - e0 / e1));
    const time = this.origin + ((first + frac) * this.block) / this.sr;
    const after = this.wFull[this.blockIndex % HISTORY];
    out.push({ time, strength: p.strength, levelDb: 10 * Math.log10(Math.max(after, 1e-12)) });
  }
}

/** Offline convenience: onset times (seconds from the start of `samples`). */
export function detectOnsets(
  samples: ArrayLike<number>,
  sampleRate: number,
  opts: Omit<OnsetOptions, 'sampleRate'> = {},
): OnsetEvent[] {
  const det = new OnsetDetector({ sampleRate, ...opts });
  const out = det.process(samples);
  // Flush the look-ahead with a little silence.
  det.process(new Float32Array(Math.ceil(sampleRate * 0.02)), out);
  return out;
}
