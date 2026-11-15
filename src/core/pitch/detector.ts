/**
 * Monophonic pitch detection for guitar (and bass when asked).
 *
 * Method, in the McLeod/YIN family:
 *  1. COARSE. The newest samples are band-limited (rumble out, hiss out) and the normalised square
 *     difference function (NSDF) is computed exactly through an FFT autocorrelation. Because the
 *     NSDF measures periodicity, a note whose fundamental the microphone barely passes is still
 *     found from its harmonics. The period is the first NSDF peak within `peakThreshold` of the
 *     highest one; that rule is the octave-error protection (a sub-multiple of the period is only
 *     accepted if it is nearly as periodic as the period itself), and a hint from the previous
 *     frame adds hysteresis in both directions so a decaying note does not flip octaves.
 *  2. ADAPTIVE WINDOW. Analysis starts with a short window (fast response for high notes) and only
 *     escalates to 2x and 4x longer windows when the short one finds nothing convincing, so low
 *     notes get the periods they need without slowing the high ones down.
 *  3. FINE. The frame is low-passed to its first few partials (on a stiff string those are the
 *     ones closest to true multiples) and the NSDF peak is followed out to the longest lag that
 *     holds a whole number of periods; dividing that lag by the period count shrinks the
 *     interpolation error by the same factor.
 *
 * Pure: the result depends only on the samples and options passed in.
 */
import { type FFT, fftPlan, nextPow2 } from './fft';
import { type Biquad, BUTTERWORTH4_Q, filterCascade, highpass, lowpass } from './filters';

/** Options for {@link PitchDetector}. */
export interface PitchDetectorOptions {
  sampleRate: number;
  /**
   * Lowest frequency to look for, in Hz. Default 60 (C2 with room below, for drop tunings and a
   * 7-string low B). Use about 30 for a 4-string bass (E1 = 41.2 Hz) or 23 for a 5-string.
   * Lower values need longer windows for low notes only; high notes stay fast.
   */
  minFreq?: number;
  /** Highest frequency to look for, in Hz. Default 1760 (the 24th fret of the high E string is 1319). */
  maxFreq?: number;
  /**
   * A shorter lag is preferred over the best one when its NSDF peak is at least this fraction of
   * the best (default 0.93). Higher = fewer octave-up errors, more octave-down errors.
   */
  peakThreshold?: number;
  /** A short analysis window is trusted when its clarity reaches this (default 0.93); else a longer one is tried. */
  acceptClarity?: number;
  /** Frames quieter than this RMS (linear, full scale 1) are not analysed. Default 0.0004 (-68 dBFS). */
  gateRms?: number;
  /** The fine stage keeps partials up to about this multiple of the fundamental (default 4.2). */
  fineHarmonics?: number;
}

/** One pitch measurement. */
export interface PitchEstimate {
  /** Fundamental in Hz, or 0 when nothing periodic was found. */
  freq: number;
  /** 0..1: how periodic the frame is at that pitch (1 = perfectly). Readings below about 0.85 are not notes. */
  clarity: number;
  /** RMS of the newest ~24 ms of the input (linear, full scale 1). */
  rms: number;
  /** Length in samples of the window the estimate came from (0 when there is none). */
  window: number;
}

interface Stage {
  window: number;
  tauMax: number;
  fft: FFT;
  re: Float64Array;
  im: Float64Array;
  y: Float64Array;
  prefix: Float64Array;
  nsdf: Float64Array;
}

interface Candidate {
  stage: Stage;
  tau: number;
  clarity: number;
}

/** Shortest analysis window in seconds; each further stage doubles it. */
const BASE_WINDOW_S = 0.024;
/** A stage searches lags up to window / PERIODS_IN_WINDOW, so at least this many periods are in view. */
const PERIODS_IN_WINDOW = 2.6;
/** With a hint, the hinted (longer) lag wins unless a shorter one is this close to it. */
const HINT_KEEP_LOWER = 0.985;
/** With a hint, the hinted (shorter) lag survives while it is at least this fraction of the best peak. */
const HINT_KEEP_UPPER = 0.85;

function parabolaOffset(a: number, b: number, c: number): number {
  const d = a - 2 * b + c;
  if (d >= 0) return 0;
  const off = (0.5 * (a - c)) / d;
  return off > 1 ? 1 : off < -1 ? -1 : off;
}

/**
 * Reusable detector for one sample rate and frequency range. Holds only scratch buffers and
 * tables; `detect` has no memory of earlier calls.
 */
export class PitchDetector {
  /** Sample rate in Hz. */
  readonly sampleRate: number;
  /** Lowest detectable frequency. */
  readonly minFreq: number;
  /** Highest detectable frequency. */
  readonly maxFreq: number;
  /** Samples of the longest analysis window. Passing fewer simply limits how low it can hear. */
  readonly maxWindow: number;
  /** Samples of the shortest analysis window (the fast path for high notes). */
  readonly minWindow: number;
  /** Extra samples before the window that the filters use to settle. */
  readonly warmup: number;
  /** maxWindow + warmup: give `detect` at least this much audio for full accuracy on the lowest notes. */
  readonly historyNeeded: number;

  private readonly stages: Stage[] = [];
  private readonly tauMin: number;
  private readonly k: number;
  private readonly accept: number;
  private readonly gate: number;
  private readonly fineHarmonics: number;
  private readonly hp: Biquad;
  private readonly coarseFilters: Biquad[];
  private readonly fineBuf: Float64Array;
  private readonly finePrefix: Float64Array;
  private readonly peakIdx: Int32Array;

  constructor(opts: PitchDetectorOptions) {
    const sr = opts.sampleRate;
    if (!(sr > 0)) throw new Error('PitchDetector needs a sample rate');
    this.sampleRate = sr;
    this.minFreq = opts.minFreq ?? 60;
    this.maxFreq = Math.min(opts.maxFreq ?? 1760, sr / 5);
    this.k = opts.peakThreshold ?? 0.93;
    this.accept = opts.acceptClarity ?? 0.93;
    this.gate = opts.gateRms ?? 0.0004;
    this.fineHarmonics = opts.fineHarmonics ?? 4.2;
    this.tauMin = Math.max(2, Math.floor(sr / this.maxFreq));

    const tauNeeded = Math.ceil((sr / this.minFreq) * 1.03) + 1;
    let window = Math.round(BASE_WINDOW_S * sr);
    for (;;) {
      let tauMax = Math.floor(window / PERIODS_IN_WINDOW);
      // Stretch this stage a little rather than add a nearly identical next one.
      if (tauMax < tauNeeded && tauNeeded <= tauMax * 1.25) {
        tauMax = tauNeeded;
        window = Math.ceil(tauMax * PERIODS_IN_WINDOW);
      }
      const last = tauMax >= tauNeeded;
      if (last && tauNeeded < tauMax && this.stages.length > 0) {
        tauMax = tauNeeded;
        window = Math.ceil(tauMax * PERIODS_IN_WINDOW);
      }
      const size = nextPow2(window + tauMax + 2);
      this.stages.push({
        window,
        tauMax,
        fft: fftPlan(size),
        re: new Float64Array(size),
        im: new Float64Array(size),
        y: new Float64Array(window),
        prefix: new Float64Array(window + 1),
        nsdf: new Float64Array(tauMax + 2),
      });
      if (last) break;
      window *= 2;
    }
    this.minWindow = this.stages[0].window;
    this.maxWindow = this.stages[this.stages.length - 1].window;

    const hpFreq = this.minFreq * 0.55;
    this.hp = highpass(hpFreq, sr);
    const lpFreq = Math.min(Math.max(2500, this.maxFreq * 1.8), sr * 0.45);
    this.coarseFilters = [this.hp, lowpass(lpFreq, sr)];
    // Three time constants of the high-pass (the slowest filter in the chain).
    this.warmup = Math.ceil((3 * 0.225 * sr) / hpFreq);
    this.historyNeeded = this.maxWindow + this.warmup;
    this.fineBuf = new Float64Array(this.maxWindow);
    this.finePrefix = new Float64Array(this.maxWindow + 1);
    this.peakIdx = new Int32Array((this.stages[this.stages.length - 1].tauMax >> 1) + 2);
  }

  /**
   * Estimate the pitch at the end of `buf` (the newest samples last).
   * @param buf      audio, ideally `historyNeeded` samples or more; shorter buffers still work for higher notes
   * @param hintFreq pitch of the previous frame in Hz (0 = none): adds octave hysteresis
   * @param end      analyse the samples ending at this index (default: the whole buffer)
   */
  detect(buf: ArrayLike<number>, hintFreq: number = 0, end: number = buf.length): PitchEstimate {
    const first = this.stages[0];
    const levelN = Math.min(end, first.window);
    let sum = 0;
    for (let i = end - levelN; i < end; i++) sum += buf[i] * buf[i];
    const rms = levelN > 0 ? Math.sqrt(sum / levelN) : 0;
    if (!(rms >= this.gate) || end < first.window) return { freq: 0, clarity: 0, rms, window: 0 };

    const tauHint = hintFreq > 0 ? this.sampleRate / hintFreq : 0;
    let hinted = -1;
    if (tauHint > 0) {
      hinted = this.stages.length - 1;
      for (let i = 0; i < this.stages.length; i++) {
        if (this.stages[i].tauMax >= tauHint * 1.06) {
          hinted = i;
          break;
        }
      }
    }

    let best: Candidate | null = null;
    // The stage that can see the hinted period goes first: in steady state that is the only one run.
    if (hinted > 0 && end >= this.stages[hinted].window) {
      best = this.coarse(this.stages[hinted], buf, end, tauHint);
    } else {
      hinted = -1;
    }
    if (!best || best.clarity < this.accept) {
      for (let i = 0; i < this.stages.length; i++) {
        if (i === hinted) continue;
        const st = this.stages[i];
        if (end < st.window) break;
        const cand = this.coarse(st, buf, end, tauHint);
        if (!cand) continue;
        // Longer windows see more lags, so on a near tie their answer is the safer one.
        if (!best || cand.clarity > best.clarity + (st.window > best.stage.window ? -0.03 : 0.03)) best = cand;
        if (cand.clarity >= this.accept) break;
      }
    }
    if (!best) return { freq: 0, clarity: 0, rms, window: 0 };
    const tau = this.refine(best, buf, end);
    return { freq: this.sampleRate / tau, clarity: best.clarity, rms, window: best.stage.window };
  }

  /** NSDF of the band-limited window and the octave-safe choice of period (in samples, interpolated). */
  private coarse(st: Stage, buf: ArrayLike<number>, end: number, tauHint: number): Candidate | null {
    const W = st.window;
    const warm = Math.min(this.warmup, end - W);
    const y = st.y;
    filterCascade(this.coarseFilters, buf, end - W - warm, W + warm, y, W);

    const { re, im, prefix, nsdf } = st;
    const N = st.fft.size;
    let acc = 0;
    prefix[0] = 0;
    for (let i = 0; i < W; i++) {
      const v = y[i];
      re[i] = v;
      acc += v * v;
      prefix[i + 1] = acc;
    }
    if (!(acc > 0)) return null;
    re.fill(0, W);
    im.fill(0);
    st.fft.forward(re, im);
    for (let i = 0; i < N; i++) {
      re[i] = re[i] * re[i] + im[i] * im[i];
      im[i] = 0;
    }
    // The power spectrum is real and even, so a forward transform gives N x the autocorrelation.
    st.fft.forward(re, im);

    const tauMax = st.tauMax;
    const scale = 2 / N;
    for (let t = 0; t <= tauMax + 1; t++) {
      const m = prefix[W - t] + acc - prefix[t];
      nsdf[t] = m > 0 ? (re[t] * scale) / m : 0;
    }

    // Skip the lobe around lag 0: candidates start after the first zero crossing.
    let t0 = 1;
    while (t0 <= tauMax && nsdf[t0] > 0) t0++;
    if (t0 > tauMax) return null;
    if (t0 < this.tauMin) t0 = this.tauMin;

    const peaks = this.peakIdx;
    let count = 0;
    let nmax = 0;
    for (let t = t0; t <= tauMax; t++) {
      const v = nsdf[t];
      if (v > 0 && v > nsdf[t - 1] && v >= nsdf[t + 1]) {
        if (count < peaks.length) peaks[count++] = t;
        if (v > nmax) nmax = v;
      }
    }
    if (count === 0) return null;

    const thr = this.k * nmax;
    let ci = 0;
    while (ci < count && nsdf[peaks[ci]] < thr) ci++;
    if (ci >= count) ci = count - 1;

    if (tauHint > 0) {
      // Strongest peak near the previous period, if there is one.
      let hi = -1;
      const tol = tauHint * 0.04 + 1;
      for (let i = 0; i < count; i++) {
        const d = peaks[i] - tauHint;
        if (d > tol) break;
        if (d >= -tol && (hi < 0 || nsdf[peaks[i]] > nsdf[peaks[hi]])) hi = i;
      }
      if (hi >= 0 && hi !== ci) {
        const vh = nsdf[peaks[hi]];
        const vc = nsdf[peaks[ci]];
        if (peaks[hi] > peaks[ci] * 1.04) {
          // The usual rule wants to jump up (shorter period). Stay unless the shorter lag is
          // essentially as periodic, i.e. the odd partials of the held note are really gone.
          if (vh >= thr && vc < HINT_KEEP_LOWER * vh) ci = hi;
        } else if (peaks[hi] < peaks[ci] * 0.96) {
          // The usual rule wants to drop down (longer period). Stay while the held period is still strong.
          if (vh >= HINT_KEEP_UPPER * nmax) ci = hi;
        }
      }
    }

    // The first peak over the threshold can be a ripple on the flank of the real one: climb to the top.
    const limit = peaks[ci] * 1.06 + 1;
    for (let i = ci + 1; i < count && peaks[i] <= limit; i++) {
      if (nsdf[peaks[i]] > nsdf[peaks[ci]]) ci = i;
    }

    const t = peaks[ci];
    const a = nsdf[t - 1];
    const b = nsdf[t];
    const c = nsdf[t + 1];
    const off = parabolaOffset(a, b, c);
    const value = b - 0.25 * (a - c) * off;
    return { stage: st, tau: t + off, clarity: value > 1 ? 1 : value };
  }

  /** Refine a coarse period on the low-passed frame, following the peak out over several periods. */
  private refine(cand: Candidate, buf: ArrayLike<number>, end: number): number {
    const sr = this.sampleRate;
    const W = cand.stage.window;
    const f0 = sr / cand.tau;
    const fc = Math.min(this.fineHarmonics * f0, sr * 0.45);
    const filters = [this.hp, lowpass(fc, sr, BUTTERWORTH4_Q[0]), lowpass(fc, sr, BUTTERWORTH4_Q[1])];
    const lpSettle = Math.ceil((2.5 * sr) / fc);
    const want = Math.max(this.warmup, lpSettle);
    const warm = Math.min(want, end - W);
    const z = this.fineBuf;
    filterCascade(filters, buf, end - W - warm, W + warm, z, W);
    // Without history the left edge still carries the low-pass start-up: leave it out.
    const skip = Math.min(Math.max(0, lpSettle - warm), W >> 2);
    const L = W - skip;

    const prefix = this.finePrefix;
    let acc = 0;
    prefix[0] = 0;
    for (let i = 0; i < L; i++) {
      const v = z[skip + i];
      acc += v * v;
      prefix[i + 1] = acc;
    }
    if (!(acc > 0)) return cand.tau;

    const nz = (t: number): number => {
      const n = L - t;
      let r = 0;
      for (let j = skip, e = skip + n; j < e; j++) r += z[j] * z[j + t];
      const m = prefix[n] + acc - prefix[t];
      return m > 0 ? (2 * r) / m : 0;
    };

    // Scratch for the handful of lags evaluated around each expected peak.
    const vals: number[] = [];
    const peakNear = (center: number, half: number): { tau: number; value: number } | null => {
      const c = Math.round(center);
      let lo = Math.max(1, c - half);
      let hi = Math.min(L - 8, c + half);
      if (hi - lo < 2) return null;
      vals.length = 0;
      for (let t = lo; t <= hi; t++) vals.push(nz(t));
      for (let pass = 0; pass < 2; pass++) {
        let bi = 0;
        for (let i = 1; i < vals.length; i++) if (vals[i] > vals[bi]) bi = i;
        if (bi > 0 && bi < vals.length - 1) {
          const off = parabolaOffset(vals[bi - 1], vals[bi], vals[bi + 1]);
          return { tau: lo + bi + off, value: vals[bi] - 0.25 * (vals[bi - 1] - vals[bi + 1]) * off };
        }
        // Peak on the edge of the search range: widen once in that direction.
        if (bi === 0) {
          const newLo = Math.max(1, lo - half);
          if (newLo === lo) return null;
          const add: number[] = [];
          for (let t = newLo; t < lo; t++) add.push(nz(t));
          vals.unshift(...add);
          lo = newLo;
        } else {
          const newHi = Math.min(L - 8, hi + half);
          if (newHi === hi) return null;
          for (let t = hi + 1; t <= newHi; t++) vals.push(nz(t));
          hi = newHi;
        }
      }
      return null;
    };

    let T = cand.tau;
    const p1 = peakNear(T, Math.max(2, Math.ceil(T * 0.03)));
    if (!p1) return T;
    T = p1.tau;
    const v1 = p1.value;
    const maxLag = Math.floor(L * 0.6);
    let m = 1;
    for (;;) {
      const m2 = Math.min(m * 2, Math.floor(maxLag / T));
      if (m2 <= m) break;
      const center = m2 * T;
      const p = peakNear(center, 2 + Math.ceil(center * 0.002));
      // A much weaker peak at the long lag means the note is changing: keep the shorter-lag estimate.
      if (!p || p.value < v1 - 0.1) break;
      T = p.tau / m2;
      m = m2;
    }
    return T;
  }
}

const detectorCache = new Map<string, PitchDetector>();

/**
 * One-off pitch estimate of the newest samples in `samples` (see {@link PitchDetector.detect}).
 * Detectors are cached per option set, so calling this every frame is fine.
 */
export function detectPitch(
  samples: ArrayLike<number>,
  sampleRate: number,
  opts: Omit<PitchDetectorOptions, 'sampleRate'> & { hintFreq?: number } = {},
): PitchEstimate {
  const { hintFreq, ...rest } = opts;
  const key = `${sampleRate}|${rest.minFreq ?? ''}|${rest.maxFreq ?? ''}|${rest.peakThreshold ?? ''}|${rest.acceptClarity ?? ''}|${rest.gateRms ?? ''}|${rest.fineHarmonics ?? ''}`;
  let det = detectorCache.get(key);
  if (!det) {
    det = new PitchDetector({ sampleRate, ...rest });
    detectorCache.set(key, det);
  }
  return det.detect(samples, hintFreq ?? 0);
}
