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
 *
 * A third detector covers what neither envelope can: a light, quick stroke while the previous strum
 * still rings (the upstroke a sixteenth after a downstroke). It adds little energy, but its pick
 * noise and the restarted strings put new energy into many bins between 1 and 8 kHz at once. That
 * is measured as spectral flux: the mean rise, in log magnitude, of those bins from one ~11 ms
 * frame to the next (every two blocks). Ringing strings, hum, beating strings and room noise move
 * those bins little or slowly; magnitudes below a floor (15 dB under `minLevelDb`) do not count.
 */
import { fftPlan, hannWindow, nextPow2 } from './fft';
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
  /**
   * Spectral flux between 1 and 8 kHz (mean rise in natural-log magnitude per bin) that counts as a
   * stroke on its own (default 0.75; 0 switches this detector off). Room noise sits near 0.5.
   */
  fluxThreshold?: number;
}

const HISTORY = 128;
/** Blocks between two flux frames. */
const FLUX_EVERY = 2;
/**
 * A flux trigger waits this many blocks for the envelopes to confirm the same attack (their timing
 * is better) before it is reported on its own.
 */
const FLUX_WAIT = 3;
/** Share of the earlier level the blocks after a flux trigger must keep (-1.5 dB). */
const FLUX_KEEP = 0.3;
/** Where in a flux frame the attack sits when the frame first shows it, as a fraction of the frame from its end. */
const FLUX_LAG = 0.42;

/** The rising part of the onset detector that works on spectra; see the file comment. */
class HighBandFlux {
  readonly size: number;
  private readonly ring: Float32Array;
  private pos = 0;
  private readonly k0: number;
  private readonly k1: number;
  private readonly floor: number;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private prev: Float64Array;
  private cur: Float64Array;
  private havePrev = false;

  constructor(sampleRate: number, minLevelDb: number) {
    // About 11 ms: short enough to place the attack, long enough to resolve the 1 kHz edge.
    this.size = nextPow2(Math.round(sampleRate * 0.0105));
    this.ring = new Float32Array(this.size);
    this.k0 = Math.ceil((1000 * this.size) / sampleRate);
    this.k1 = Math.max(this.k0, Math.min(this.size / 2 - 1, Math.floor((Math.min(8000, 0.45 * sampleRate) * this.size) / sampleRate)));
    // White noise at this RMS gives bins of about this magnitude (Hann window: sum of w^2 = 3N/8).
    this.floor = Math.pow(10, (minLevelDb - 15) / 20) * Math.sqrt((3 * this.size) / 8);
    this.re = new Float64Array(this.size);
    this.im = new Float64Array(this.size);
    this.prev = new Float64Array(this.k1 - this.k0 + 1);
    this.cur = new Float64Array(this.k1 - this.k0 + 1);
  }

  reset(): void {
    this.ring.fill(0);
    this.pos = 0;
    this.havePrev = false;
  }

  push(x: number): void {
    this.ring[this.pos] = x;
    this.pos = (this.pos + 1) & (this.size - 1);
  }

  /** Flux of the newest frame against the one before it (0 for the first frame). */
  frame(): number {
    const n = this.size;
    const w = hannWindow(n);
    const re = this.re;
    const im = this.im;
    for (let i = 0; i < n; i++) {
      re[i] = this.ring[(this.pos + i) & (n - 1)] * w[i];
      im[i] = 0;
    }
    fftPlan(n).forward(re, im);
    const cur = this.cur;
    const prev = this.prev;
    const floor = this.floor;
    let sum = 0;
    for (let k = this.k0, j = 0; k <= this.k1; k++, j++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      cur[j] = m;
      if (this.havePrev && m > prev[j]) sum += Math.log((floor + m) / (floor + prev[j]));
    }
    const flux = this.havePrev ? sum / cur.length : 0;
    this.cur = prev;
    this.prev = cur;
    this.havePrev = true;
    return flux;
  }
}

/** An attack found but not reported yet (it waits for look-ahead). */
interface Pending {
  block: number;
  treble: boolean;
  strength: number;
  /** Set when only the high-band flux heard it: its time, already placed. */
  fluxTime?: number;
  /** Mean block energy before that attack (flux triggers only). */
  before?: number;
}

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
  private pending: Pending | null = null;
  private readonly flux: HighBandFlux | null;
  private readonly fluxThr: number;

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
    this.fluxThr = opts.fluxThreshold ?? 0.75;
    // Below 16 kHz there is too little room above 1 kHz to tell a pick from a ringing string.
    this.flux = this.fluxThr > 0 && this.sr >= 16000 ? new HighBandFlux(this.sr, opts.minLevelDb ?? -55) : null;
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
    this.flux?.reset();
  }

  /** Move the stream clock by `seconds` without disturbing the analysis (the caller re-synchronised its clock). */
  shiftOrigin(seconds: number): void {
    this.origin += seconds;
  }

  /**
   * Process the next chunk and return the onsets confirmed in it (each is reported ~3-6 ms after it
   * happened, ~12 ms when only the high-band flux heard it).
   */
  process(samples: ArrayLike<number>, out: OnsetEvent[] = []): OnsetEvent[] {
    const n = samples.length;
    const block = this.block;
    const flux = this.flux;
    let prev = this.prev;
    let accF = this.accFull;
    let accT = this.accTreble;
    let fill = this.fill;
    for (let i = 0; i < n; i++) {
      const x = samples[i];
      flux?.push(x);
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
    // It follows the level down at no more than 1 dB per block: a few milliseconds of dead input
    // (a dropped buffer) must not erase what was learned about the room.
    this.floorFull = b === 0 ? wf : Math.min(Math.max(wf, this.floorFull * 0.8), this.floorFull * 1.004 + 1e-13);
    this.floorTreble = b === 0 ? wt : Math.min(Math.max(wt, this.floorTreble * 0.8), this.floorTreble * 1.004 + 1e-13);

    let riseF = 0;
    let riseT = 0;
    // Nothing is judged until the reference window is complete: a stream that opens in the middle
    // of a sound (a hum, a ringing string) starts with a partial block, not with a pluck.
    if (b >= 2 * this.kFull) {
      const refF = this.wFull[(b - this.kFull) % HISTORY];
      const epsF = 3 * this.floorFull + 1e-10;
      riseF = 10 * Math.log10((wf + epsF) / (refF + epsF));
      const refT = this.wTreble[(b - this.kTreble) % HISTORY];
      const epsT = 3 * this.floorTreble + 1e-11;
      riseT = 10 * Math.log10((wt + epsT) / (refT + epsT));
    }

    let fluxHit = false;
    if (this.flux && b % FLUX_EVERY === FLUX_EVERY - 1) {
      const f = this.flux.frame();
      fluxHit = b >= 2 * this.kFull && f >= this.fluxThr;
    }

    const p = this.pending;
    if (p && b > p.block + (p.fluxTime === undefined ? 0 : FLUX_WAIT)) {
      // The look-ahead is in: place the onset and report it. A flux trigger also has to leave
      // the sound at least as loud as before: a sudden stop (a hand on the strings, the end of a
      // recording) clicks across the high band too, but what follows it is quieter.
      if (p.fluxTime === undefined || this.meanBlocks(this.eFull, b - 1, FLUX_WAIT) >= FLUX_KEEP * (p.before ?? 0)) this.emit(p, out);
      this.pending = null;
    }

    const loudEnough = wf >= this.minEnergy;
    const free = b - this.lastOnsetBlock >= this.minBlocks;
    if (loudEnough) {
      const hitF = riseF >= this.thr + 2 * this.restFull;
      const hitT = riseT >= this.thrTreble + 2 * this.restTreble;
      // An envelope that confirms a flux trigger still waiting takes it over: its timing is better.
      const fluxWaiting = this.pending !== null && this.pending.fluxTime !== undefined;
      if ((hitF || hitT) && ((!this.pending && free) || fluxWaiting)) {
        this.pending = { block: b, treble: hitT && (!hitF || riseT > riseF), strength: Math.max(riseF, riseT) };
        if (!fluxWaiting) this.lastOnsetBlock = b;
      } else if (fluxHit && !this.pending && free) {
        const end = (b + 1) * this.block;
        const at = this.origin + (end - FLUX_LAG * this.flux!.size) / this.sr;
        // The level well before the frame that heard the attack.
        const before = this.meanBlocks(this.eFull, b - Math.ceil(this.flux!.size / this.block) - 1, 4);
        this.pending = { block: b, treble: false, strength: Math.max(0, riseF, riseT), fluxTime: at, before };
        this.lastOnsetBlock = b;
      }
    }

    // How restless each envelope has been lately (mean positive rise, ~200 ms memory).
    const a = 0.014;
    this.restFull += a * (Math.min(6, Math.max(0, riseF)) - this.restFull);
    this.restTreble += a * (Math.min(6, Math.max(0, riseT)) - this.restTreble);
    this.blockIndex = b + 1;
  }

  /** Mean of `e` over the `k` blocks ending at block `last` (0 before the stream began). */
  private meanBlocks(e: Float64Array, last: number, k: number): number {
    let s = 0;
    let n = 0;
    for (let j = 0; j < k && last - j >= 0; j++, n++) s += e[(last - j) % HISTORY];
    return n ? s / n : 0;
  }

  private windowMean(e: Float64Array, b: number, k: number): number {
    let s = 0;
    const n = Math.min(k, b + 1);
    for (let j = 0; j < n; j++) s += e[(b - j) % HISTORY];
    return s / n;
  }

  private emit(p: Pending, out: OnsetEvent[]): void {
    if (p.fluxTime !== undefined) {
      out.push({ time: p.fluxTime, strength: p.strength, levelDb: 10 * Math.log10(Math.max(this.wFull[this.blockIndex % HISTORY], 1e-12)) });
      return;
    }
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
