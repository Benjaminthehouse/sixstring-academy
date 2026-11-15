/**
 * Polyphonic analysis for chords: which of the twelve pitch classes are sounding.
 *
 * A plain "fold the spectrum onto 12 bins" chroma is badly polluted on guitar: every string's
 * third partial lands on the fifth and its fifth partial on the MAJOR third, which is exactly the
 * note that separates E from Em. So this extractor first explains the spectrum as a sum of whole
 * notes:
 *  1. Spectral peaks (the partials) are picked from a long Hann-windowed FFT, limited to the
 *     guitar's range, and laid on a third-of-a-semitone pitch axis anchored to the A4 reference.
 *  2. A dictionary holds, for every note from the lowest string to the top fret, where its
 *     partials fall and roughly how strong they are. A non-negative least-squares fit finds the
 *     note strengths that best rebuild the measured peaks; a partial is charged to the note below
 *     it that predicts it instead of being counted as a note of its own.
 *  3. The note strengths are folded to pitch classes.
 *
 * Limits are documented in API.md: this tells chords apart reliably, it does not transcribe.
 */
import { DEFAULT_A4 } from '@/core/math/pitch-math';
import { fftPlan, hannWindow, nextPow2 } from './fft';

/** Options for {@link ChromaExtractor}. */
export interface ChromaOptions {
  sampleRate: number;
  /** Reference pitch in Hz (default 440). The pitch axis is anchored to it. */
  a4?: number;
  /** Analysis window in ms (default 180; rounded up to a power of two in samples). Shorter = faster, blurrier in the bass. */
  windowMs?: number;
  /** Lowest note considered, MIDI (default 38 = D2, for drop D). */
  minMidi?: number;
  /** Highest note considered, MIDI (default 88 = E6). */
  maxMidi?: number;
}

/** Result of one polyphonic analysis. */
export interface ChromaFrame {
  /** Energy per pitch class, C = 0 ... B = 11, scaled so the strongest is 1 (all 0 when nothing is sounding). */
  chroma: number[];
  /** Strength of every candidate note, index 0 = `minMidi`; same scale as `chroma`. */
  notes: number[];
  /** MIDI number of `notes[0]`. */
  minMidi: number;
  /** Pitch class of the lowest clearly sounding note, or -1. */
  bass: number;
  /** MIDI number of that note, or -1. */
  bassMidi: number;
  /** RMS level of the analysed window in dBFS. */
  levelDb: number;
}

const BINS_PER_SEMITONE = 3;
const MAX_PARTIALS = 10;
const MAX_PEAK_HZ = 5000;
/** Amplitudes are compressed before the fit so one loud string does not drown the others. */
const COMPRESSION = 0.5;
/** Modelled strength of partial h in the compressed domain: h^-PARTIAL_DECAY. */
const PARTIAL_DECAY = 0.4;
const NNLS_ITERATIONS = 80;
/** Semitones from a note up to its 3rd, 5th and 7th partial, and the share of its strength discounted there. */
const GHOST_OFFSETS = [19, 28, 34];
const GHOST_SHARE = [0.25, 0.2, 0.15];

/** Reusable chroma extractor for one sample rate (holds the FFT buffers and the note dictionary). */
export class ChromaExtractor {
  /** Samples analysed per frame. */
  readonly windowSize: number;
  /** Lowest candidate note. */
  readonly minMidi: number;
  /** Highest candidate note. */
  readonly maxMidi: number;
  private readonly sr: number;
  private a4: number;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly mag: Float64Array;
  private readonly axisLow: number;
  private readonly nBins: number;
  private readonly nNotes: number;
  private readonly dict: Float64Array;
  private readonly gram: Float64Array;
  private readonly norm: Float64Array;
  private readonly obs: Float64Array;
  private readonly act: Float64Array;
  private readonly dty: Float64Array;

  constructor(opts: ChromaOptions) {
    this.sr = opts.sampleRate;
    this.a4 = opts.a4 ?? DEFAULT_A4;
    this.windowSize = nextPow2(Math.round(((opts.windowMs ?? 180) / 1000) * this.sr * 0.75));
    this.minMidi = opts.minMidi ?? 38;
    this.maxMidi = opts.maxMidi ?? 88;
    const n = this.windowSize;
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.mag = new Float64Array(n / 2 + 1);

    this.axisLow = this.minMidi - 1;
    const axisHigh = 69 + 12 * Math.log2(MAX_PEAK_HZ / 440) + 1;
    this.nBins = Math.ceil((axisHigh - this.axisLow) * BINS_PER_SEMITONE) + 2;
    this.nNotes = this.maxMidi - this.minMidi + 1;
    this.dict = new Float64Array(this.nNotes * this.nBins);
    this.norm = new Float64Array(this.nNotes);
    for (let i = 0; i < this.nNotes; i++) {
      const row = this.dict.subarray(i * this.nBins, (i + 1) * this.nBins);
      for (let h = 1; h <= MAX_PARTIALS; h++) {
        this.deposit(row, this.minMidi + i + 12 * Math.log2(h), Math.pow(h, -PARTIAL_DECAY));
      }
      let s = 0;
      for (let b = 0; b < this.nBins; b++) s += row[b];
      this.norm[i] = s;
    }
    this.gram = new Float64Array(this.nNotes * this.nNotes);
    for (let i = 0; i < this.nNotes; i++) {
      for (let j = i; j < this.nNotes; j++) {
        let s = 0;
        const a = i * this.nBins;
        const c = j * this.nBins;
        for (let b = 0; b < this.nBins; b++) s += this.dict[a + b] * this.dict[c + b];
        this.gram[i * this.nNotes + j] = s;
        this.gram[j * this.nNotes + i] = s;
      }
    }
    this.obs = new Float64Array(this.nBins);
    this.act = new Float64Array(this.nNotes);
    this.dty = new Float64Array(this.nNotes);
  }

  /** Change the reference pitch. The dictionary is relative to the axis, so nothing is rebuilt. */
  setA4(a4: number): void {
    this.a4 = a4;
  }

  /** Spread `amp` over the pitch axis around `midi` with a triangle about +/-50 cents wide. */
  private deposit(target: Float64Array, midi: number, amp: number): void {
    const p = (midi - this.axisLow) * BINS_PER_SEMITONE;
    const lo = Math.ceil(p - 1.5);
    const hi = Math.floor(p + 1.5);
    for (let b = lo; b <= hi; b++) {
      if (b < 0 || b >= target.length) continue;
      target[b] += amp * (1 - Math.abs(b - p) / 1.5);
    }
  }

  /** Analyse the `windowSize` samples ending at `end` (default: the end of `buf`). */
  analyze(buf: ArrayLike<number>, end: number = buf.length): ChromaFrame {
    const n = this.windowSize;
    const have = Math.min(n, end);
    const frame: ChromaFrame = {
      chroma: new Array<number>(12).fill(0),
      notes: new Array<number>(this.nNotes).fill(0),
      minMidi: this.minMidi,
      bass: -1,
      bassMidi: -1,
      levelDb: -120,
    };
    if (have < n / 4) return frame;

    const { re, im, mag } = this;
    const w = hannWindow(have);
    let energy = 0;
    const start = end - have;
    for (let i = 0; i < have; i++) {
      const x = buf[start + i];
      energy += x * x;
      re[i] = x * w[i];
    }
    re.fill(0, have);
    im.fill(0);
    const rms = Math.sqrt(energy / have);
    frame.levelDb = rms > 1e-6 ? 20 * Math.log10(rms) : -120;
    if (rms < 1e-5) return frame;
    fftPlan(n).forward(re, im);

    const binHz = this.sr / n;
    const kLo = Math.max(2, Math.floor((this.a4 * Math.pow(2, (this.minMidi - 69.6) / 12)) / binHz));
    const kHi = Math.min(n / 2 - 2, Math.ceil(MAX_PEAK_HZ / binHz));
    let maxMag = 0;
    for (let k = kLo - 1; k <= kHi + 1; k++) {
      const m = Math.hypot(re[k], im[k]);
      mag[k] = m;
      if (m > maxMag) maxMag = m;
    }
    if (maxMag <= 0) return frame;

    // Noise level of the band: the mean of the lower half of the magnitudes is a cheap stand-in for a median.
    let mean = 0;
    for (let k = kLo; k <= kHi; k++) mean += mag[k];
    mean /= kHi - kLo + 1;
    let lowSum = 0;
    let lowCount = 0;
    for (let k = kLo; k <= kHi; k++) {
      if (mag[k] <= mean) {
        lowSum += mag[k];
        lowCount++;
      }
    }
    const noise = lowCount > 0 ? lowSum / lowCount : 0;
    const floor = Math.max(maxMag * 0.004, noise * 4);

    const obs = this.obs;
    obs.fill(0);
    let peakCount = 0;
    for (let k = kLo; k <= kHi; k++) {
      const m = mag[k];
      if (m < floor || m <= mag[k - 1] || m < mag[k + 1]) continue;
      // Parabolic interpolation on the log magnitudes: accurate for a Hann-windowed partial.
      const a = Math.log(mag[k - 1] + 1e-30);
      const b = Math.log(m);
      const c = Math.log(mag[k + 1] + 1e-30);
      const d = a - 2 * b + c;
      const off = d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d)) : 0;
      const freq = (k + off) * binHz;
      const amp = Math.exp(b - 0.25 * (a - c) * off);
      const midi = 69 + 12 * Math.log2(freq / this.a4);
      this.deposit(obs, midi, Math.pow(amp / maxMag, COMPRESSION));
      peakCount++;
    }
    if (peakCount === 0) return frame;

    // Non-negative least squares by multiplicative updates: act <- act * (D'y) / (D'D act).
    const { nNotes, nBins, dict, gram, act, dty, norm } = this;
    let dtyMax = 0;
    for (let i = 0; i < nNotes; i++) {
      let s = 0;
      const row = i * nBins;
      for (let b = 0; b < nBins; b++) s += dict[row + b] * obs[b];
      dty[i] = s;
      if (s > dtyMax) dtyMax = s;
      act[i] = s / gram[i * nNotes + i];
    }
    if (dtyMax <= 0) return frame;
    // A small constant in the denominator is an L1 penalty: it starves weak "ghost" notes.
    const sparsity = dtyMax * 0.02;
    for (let it = 0; it < NNLS_ITERATIONS; it++) {
      for (let i = 0; i < nNotes; i++) {
        if (act[i] === 0) continue;
        let den = sparsity;
        const row = i * nNotes;
        for (let j = 0; j < nNotes; j++) den += gram[row + j] * act[j];
        const next = (act[i] * dty[i]) / den;
        act[i] = next < 1e-9 ? 0 : next;
      }
    }

    let best = 0;
    const strength = frame.notes;
    for (let i = 0; i < nNotes; i++) {
      strength[i] = act[i] * norm[i];
      if (strength[i] > best) best = strength[i];
    }
    if (best <= 0) return frame;
    const chroma = frame.chroma;
    for (let i = 0; i < nNotes; i++) strength[i] /= best;
    // Whatever the fit left at the 3rd, 5th or 7th partial of a strong lower note is most likely
    // still that note's overtone (real strings are brighter than the model): discount it.
    for (let i = nNotes - 1; i >= 0; i--) {
      let ghost = 0;
      for (let g = 0; g < GHOST_OFFSETS.length; g++) {
        const parent = i - GHOST_OFFSETS[g];
        if (parent >= 0) ghost += GHOST_SHARE[g] * strength[parent];
      }
      const kept = strength[i] - ghost;
      chroma[(this.minMidi + i) % 12] += kept > 0 ? kept : 0;
    }
    let cmax = 0;
    for (let pc = 0; pc < 12; pc++) if (chroma[pc] > cmax) cmax = chroma[pc];
    for (let pc = 0; pc < 12; pc++) chroma[pc] /= cmax;
    for (let i = 0; i < nNotes; i++) {
      if (strength[i] >= 0.35) {
        frame.bassMidi = this.minMidi + i;
        frame.bass = frame.bassMidi % 12;
        break;
      }
    }
    return frame;
  }
}

const extractorCache = new Map<string, ChromaExtractor>();

/** One-off chroma of the newest samples in `samples` (extractors are cached per option set). */
export function computeChroma(
  samples: ArrayLike<number>,
  sampleRate: number,
  opts: Omit<ChromaOptions, 'sampleRate'> = {},
): ChromaFrame {
  const key = [sampleRate, opts.windowMs, opts.minMidi, opts.maxMidi].join('|');
  let ex = extractorCache.get(key);
  if (!ex) {
    ex = new ChromaExtractor({ sampleRate, ...opts });
    extractorCache.set(key, ex);
  }
  ex.setA4(opts.a4 ?? DEFAULT_A4);
  return ex.analyze(samples);
}
