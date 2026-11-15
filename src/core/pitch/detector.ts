/**
 * Monophonic pitch detection for guitar (and bass when asked).
 *
 * Method, in the McLeod/YIN family:
 *  1. COARSE. The newest samples are low-passed (hiss out) and the normalised square difference
 *     function (NSDF) is computed exactly through an FFT autocorrelation. Because the
 *     NSDF measures periodicity, a note whose fundamental the microphone barely passes is still
 *     found from its harmonics. The period is the first NSDF peak within `peakThreshold` of the
 *     highest one; that rule is the octave-error protection (a sub-multiple of the period is only
 *     accepted if it is nearly as periodic as the period itself), and a hint from the previous
 *     frame adds hysteresis in both directions so a decaying note does not flip octaves. Frames
 *     without a hint (the first of a note) can be held to a stricter fraction (`freshThreshold`),
 *     which keeps a note with a weak fundamental and weak odd partials from starting an octave
 *     high. A sound that is as periodic at a lag shorter than the range allows (a string squeak,
 *     a whistle) is not a note at all and yields no pitch. A second
 *     check guards the other side: when two strings a fourth or fifth apart ring together, their
 *     common sub-harmonic is the most periodic lag of all, and only its spectrum (two interleaved
 *     partial series instead of one complete one) gives it away.
 *  2. ADAPTIVE WINDOW. Analysis starts with a short window (fast response for high notes) and only
 *     escalates to 2x and 4x longer windows when the short one finds nothing convincing, so low
 *     notes get the periods they need without slowing the high ones down.
 *  3. FINE. The frame is low-passed to its first few partials (on a stiff string those are the
 *     ones closest to true multiples), widened to as many as 24 periods while the note is steady
 *     (and back to the short frame the moment it is not, so nothing lags), and the NSDF peak is
 *     followed out to the longest lag that holds a whole number of periods; dividing that lag by
 *     the period count shrinks the interpolation error, the noise and the pull of other sounds
 *     (hum, a ringing string) by the same factor. Finally, when the frame is clean enough to
 *     show it, the stretch of the partials caused by string stiffness is measured and removed,
 *     so the reading is the pitch of the first partial.
 *
 * There is deliberately no high-pass filter in here: its start-up transient inside a short frame
 * costs more accuracy on low notes than it buys. Feed audio that is already free of DC and rumble
 * (the engine runs a continuous high-pass on the stream); a constant offset is still removed.
 *
 * Pure: the result depends only on the samples and options passed in.
 */
import { type FFT, fftPlan, nextPow2 } from './fft';
import { type Biquad, BUTTERWORTH4_Q, filterCascade, lowpass } from './filters';

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
   * A shorter lag is preferred over the most periodic one when its NSDF peak is at least this
   * fraction of it (default 0.8). Lower = more tolerant of another string still ringing under the
   * note; higher = more tolerant of notes whose odd partials are weak.
   */
  peakThreshold?: number;
  /**
   * The same fraction for frames analysed without a hint, i.e. the first frames of a note (default:
   * `peakThreshold`). The live engine raises it to 0.9: it knows from the tracker which note was
   * ringing before the pluck, so the tolerance for an unknown ringing string is not needed there,
   * and the stricter rule keeps a note whose fundamental and odd partials are weak (a reflection
   * off the desk cancelling them, an overdriven amp) from being read an octave or a twelfth high.
   */
  freshThreshold?: number;
  /** A short analysis window is trusted when its clarity reaches this (default 0.9); else a longer one is tried. */
  acceptClarity?: number;
  /** Frames quieter than this RMS (linear, full scale 1) are not analysed. Default 0.0004 (-68 dBFS). */
  gateRms?: number;
  /** The fine stage keeps partials up to about this multiple of the fundamental (default 4.2). */
  fineHarmonics?: number;
  /**
   * Correct for string stiffness by measuring the lowest partials one by one (default true). With
   * it a steady, clean note on a stiff string reads at its first partial; without it (and whenever
   * hum or another string disturbs the measurement) up to half a cent sharp.
   */
  stiffness?: boolean;
  /**
   * The fine stage looks at up to this many periods of a steady note (default 24). More = steadier
   * and less disturbed by other strings; fewer = less CPU and memory. Response time is not affected.
   */
  finePeriods?: number;
}

/** One pitch measurement. */
export interface PitchEstimate {
  /** Fundamental in Hz, or 0 when nothing periodic was found. */
  freq: number;
  /** 0..1: how periodic the frame is at that pitch (1 = perfectly). Below about 0.7 it is not a clear note. */
  clarity: number;
  /** RMS of the newest ~24 ms of the input (linear, full scale 1). */
  rms: number;
  /** Length in samples of the window the note was found in (0 when there is none). */
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
  hann: Float64Array;
}

interface Candidate {
  stage: Stage;
  tau: number;
  clarity: number;
}

interface Peak {
  tau: number;
  value: number;
}

/** Shortest analysis window in seconds; each further stage doubles it. */
const BASE_WINDOW_S = 0.024;
/** A stage searches lags up to window / PERIODS_IN_WINDOW, so at least this many periods are in view. */
const PERIODS_IN_WINDOW = 2.6;
/** With a hint, the hinted (longer) lag wins unless a shorter one reaches this fraction of it. */
const HINT_KEEP_LOWER = 0.93;
/** With a hint, the hinted (shorter) lag survives down to this fraction of the usual threshold. */
const HINT_KEEP_UPPER = 0.875;

/** A period shorter than the range allows, this periodic relative to the best lag inside it, voids the frame. */
const ABOVE_RANGE = 0.9;

/** A shorter lag this strong (relative to the best peak) is examined as "the louder of two notes". */
const TWO_NOTE_MIN = 0.5;
/** ...and accepted when this share of the remaining energy forms a second harmonic series of its own. */
const TWO_NOTE_SHARE = 0.85;
/** Partials of the candidate sub-harmonic that are inspected for that test. */
const TWO_NOTE_PARTIALS = 20;

/** The stiffness correction needs this many periods in view for the partials to stand apart. */
const STIFFNESS_MIN_PERIODS = 10;
/** Partials measured for it (never more than the fine stage lets through). */
const STIFFNESS_PARTIALS = 5;
/** Largest per-partial stretch believed (B = 2 beta; guitar strings stay below B = 5e-4). */
const STIFFNESS_MAX_BETA = 3e-4;
/** Largest weighted scatter of the partials around the fitted line, relative to the frequency (about 0.1 cent). */
const STIFFNESS_MAX_RESIDUAL = 6e-5;

function gcd(a: number, b: number): number {
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

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
  /** Samples of the longest window used to find a note. Passing fewer simply limits how low it can hear. */
  readonly maxWindow: number;
  /** Samples of the shortest window (the fast path for high notes). */
  readonly minWindow: number;
  /** Give `detect` at least this many samples for full accuracy on the lowest notes. */
  readonly historyNeeded: number;

  private readonly stages: Stage[] = [];
  private readonly tauMin: number;
  private readonly k: number;
  private readonly kFresh: number;
  private readonly accept: number;
  private readonly gate: number;
  private readonly fineHarmonics: number;
  private readonly finePeriods: number;
  private readonly stiffness: boolean;
  private readonly zw: Float64Array;
  private readonly coarseFilters: Biquad[];
  private readonly coarseWarm: number;
  private readonly z: Float64Array;
  private readonly zPrefix: Float64Array;
  private readonly peakIdx: Int32Array;
  private readonly vals: number[] = [];
  private readonly partialEnergy = new Float64Array(TWO_NOTE_PARTIALS + 1);
  private readonly partialY = new Float64Array(STIFFNESS_PARTIALS + 1);
  private readonly partialW = new Float64Array(STIFFNESS_PARTIALS + 1);
  // Fine-stage window state, shared by the helpers below.
  private zEnd = 0;
  private tauStale = 0;

  constructor(opts: PitchDetectorOptions) {
    const sr = opts.sampleRate;
    if (!(sr > 0)) throw new Error('PitchDetector needs a sample rate');
    this.sampleRate = sr;
    this.minFreq = opts.minFreq ?? 60;
    this.maxFreq = Math.min(opts.maxFreq ?? 1760, sr / 5);
    this.k = opts.peakThreshold ?? 0.8;
    this.kFresh = opts.freshThreshold ?? this.k;
    this.accept = opts.acceptClarity ?? 0.9;
    this.gate = opts.gateRms ?? 0.0004;
    this.fineHarmonics = opts.fineHarmonics ?? 4.2;
    this.finePeriods = opts.finePeriods ?? 24;
    this.stiffness = opts.stiffness ?? true;
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
      const hann = new Float64Array(window);
      let hsum = 0;
      for (let i = 0; i < window; i++) {
        hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / window);
        hsum += hann[i];
      }
      for (let i = 0; i < window; i++) hann[i] /= hsum;
      this.stages.push({
        window,
        tauMax,
        fft: fftPlan(size),
        re: new Float64Array(size),
        im: new Float64Array(size),
        y: new Float64Array(window),
        prefix: new Float64Array(window + 1),
        nsdf: new Float64Array(tauMax + 2),
        hann,
      });
      if (last) break;
      window *= 2;
    }
    this.minWindow = this.stages[0].window;
    const lastStage = this.stages[this.stages.length - 1];
    this.maxWindow = lastStage.window;

    const lpFreq = Math.min(Math.max(2500, this.maxFreq * 1.8), sr * 0.45);
    this.coarseFilters = [lowpass(lpFreq, sr)];
    this.coarseWarm = Math.ceil((4 * sr) / lpFreq);
    const fineMax = Math.max(this.maxWindow, Math.ceil(this.finePeriods * lastStage.tauMax));
    this.z = new Float64Array(fineMax);
    this.zw = new Float64Array(fineMax);
    this.zPrefix = new Float64Array(fineMax + 1);
    this.historyNeeded = fineMax + Math.ceil((2.5 * lastStage.tauMax) / this.fineHarmonics) + 1;
    this.peakIdx = new Int32Array((lastStage.tauMax >> 1) + 2);
  }

  /**
   * Estimate the pitch at the end of `buf` (the newest samples last).
   * @param buf      audio without DC or rumble, ideally `historyNeeded` samples or more; shorter
   *                 buffers still work, with less precision on low notes
   * @param hintFreq  pitch of the previous frame in Hz (0 = none): adds octave hysteresis
   * @param end       analyse the samples ending at this index (default: the whole buffer)
   * @param staleFreq pitch of a note known to be dying away under a fresh pluck, in Hz (0 = none):
   *                  if the frame still reads as that note (or a sub-harmonic of it) while a
   *                  clearly periodic higher note sits on top, the higher note is reported
   */
  detect(buf: ArrayLike<number>, hintFreq: number = 0, end: number = buf.length, staleFreq: number = 0): PitchEstimate {
    const first = this.stages[0];
    const levelN = Math.min(end, first.window);
    let sum = 0;
    for (let i = end - levelN; i < end; i++) sum += buf[i] * buf[i];
    const rms = levelN > 0 ? Math.sqrt(sum / levelN) : 0;
    if (!(rms >= this.gate) || end < first.window) return { freq: 0, clarity: 0, rms, window: 0 };

    const tauHint = hintFreq > 0 ? this.sampleRate / hintFreq : 0;
    this.tauStale = staleFreq > 0 ? this.sampleRate / staleFreq : 0;
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

  /** NSDF of the low-passed window and the octave-safe choice of period (in samples, interpolated). */
  private coarse(st: Stage, buf: ArrayLike<number>, end: number, tauHint: number): Candidate | null {
    const W = st.window;
    const warm = Math.min(this.coarseWarm, end - W);
    const y = st.y;
    filterCascade(this.coarseFilters, buf, end - W - warm, W + warm, y, W);

    // Remove any constant offset. A Hann-weighted mean is used because the plain mean of a few
    // periods of a tone is not zero, and subtracting it would add the very offset it should remove.
    const hann = st.hann;
    let dc = 0;
    for (let i = 0; i < W; i++) dc += y[i] * hann[i];

    const { re, im, prefix, nsdf } = st;
    const N = st.fft.size;
    let acc = 0;
    prefix[0] = 0;
    for (let i = 0; i < W; i++) {
      const v = y[i] - dc;
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
    // A sound that repeats faster than the highest note looked for (a finger squeaking along a
    // wound string, a whistle) shows its true period before `tauMin`. Remember how periodic it
    // is there: the lags inside the range would only be multiples of that period.
    let above = 0;
    for (let t = t0 + 1; t < this.tauMin; t++) {
      const v = nsdf[t];
      if (v > above && v > nsdf[t - 1] && v >= nsdf[t + 1]) above = v;
    }
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
    // Nearly as periodic above the range as anywhere inside it: not a note this detector should name.
    if (above >= ABOVE_RANGE * nmax) return null;

    // With a hint the held note has hysteresis of its own (below), so the tolerant threshold applies.
    const thr = (tauHint > 0 ? this.k : this.kFresh) * nmax;
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
          // nearly as periodic, i.e. the odd partials of the held note are really gone.
          if (vh >= thr && vc < HINT_KEEP_LOWER * vh) ci = hi;
        } else if (peaks[hi] < peaks[ci] * 0.96) {
          // The usual rule wants to drop down (longer period). Stay while the held period is still strong.
          if (vh >= HINT_KEEP_UPPER * thr) ci = hi;
        }
      }
    }

    // The first peak over the threshold can be a ripple on the flank of the real one: climb to the top.
    const limit = peaks[ci] * 1.06 + 1;
    for (let i = ci + 1; i < count && peaks[i] <= limit; i++) {
      if (nsdf[peaks[i]] > nsdf[peaks[ci]]) ci = i;
    }

    let t = peaks[ci];
    let off = parabolaOffset(nsdf[t - 1], nsdf[t], nsdf[t + 1]);
    let value = nsdf[t] - 0.25 * (nsdf[t - 1] - nsdf[t + 1]) * off;

    // Sub-harmonic check. When a note is plucked while another string still rings a fourth or a
    // fifth away, the two together repeat exactly at a much longer period, and that phantom
    // sub-harmonic is the most periodic lag of all. It is told from a real low note by its
    // spectrum: a real note has partials all along its series, the phantom only has the series
    // of the louder note plus one other regular series. Skipped when the hint put us here.
    const heldByHint = tauHint > 0 && Math.abs(t - tauHint) <= tauHint * 0.04 + 1;
    if (ci > 0 && !heldByHint) {
      const tauC = t + off;
      // The caller knows an older note is still dying away. If this frame reads as that note (or
      // as a whole number of its periods), any clearly periodic shorter lag is the new note.
      const staleTurns = this.tauStale > 0 ? tauC / this.tauStale : 0;
      const onStale = staleTurns > 0.9 && Math.abs(staleTurns - Math.round(staleTurns)) <= 0.04 * Math.round(staleTurns);
      for (let i = 0; i < ci; i++) {
        const ts = peaks[i];
        const vs = nsdf[ts];
        if (vs < TWO_NOTE_MIN * nmax) continue;
        const ratio = tauC / ts;
        const m = Math.round(ratio);
        if (m < 2 || m > 8 || Math.abs(ratio - m) > 0.03 * m) continue;
        if (onStale || (m <= 6 && this.isTwoNotes(st, dc, tauC, m))) {
          // Half credit for the part of the frame that the second note explains.
          const blended = (vs + value) / 2;
          t = ts;
          off = parabolaOffset(nsdf[t - 1], nsdf[t], nsdf[t + 1]);
          value = blended;
          break;
        }
      }
    }
    return { stage: st, tau: t + off, clarity: value > 1 ? 1 : value };
  }

  /**
   * True when the frame, seen on the harmonic grid of the period `tauC`, is two notes: the series
   * of every m-th partial, plus a remainder that is itself concentrated on the multiples of one
   * other number (a second, quieter note) rather than spread over the whole grid (one low note).
   */
  private isTwoNotes(st: Stage, dc: number, tauC: number, m: number): boolean {
    const { re, im, y, hann } = st;
    const W = st.window;
    const N = st.fft.size;
    // The autocorrelation has been read out, so the FFT buffers are free for a Hann spectrum.
    for (let i = 0; i < W; i++) re[i] = (y[i] - dc) * hann[i];
    re.fill(0, W);
    im.fill(0);
    st.fft.forward(re, im);
    const e = this.partialEnergy;
    e.fill(0);
    const binsPerPartial = N / tauC;
    const top = Math.min(TWO_NOTE_PARTIALS, Math.floor((N / 2 - 2) / binsPerPartial));
    const kEnd = Math.min(N / 2 - 1, Math.ceil((top + 0.3) * binsPerPartial));
    for (let k = Math.max(1, Math.floor(0.7 * binsPerPartial)); k <= kEnd; k++) {
      const x = k / binsPerPartial;
      const h = Math.round(x);
      if (h < 1 || h > top || Math.abs(x - h) > 0.3) continue;
      e[h] += re[k] * re[k] + im[k] * im[k];
    }
    let rest = 0;
    let all = 0;
    for (let h = 1; h <= top; h++) {
      all += e[h];
      if (h % m !== 0) rest += e[h];
    }
    if (!(rest > 0.01 * all)) return false;
    for (let q = 2; q <= 7; q++) {
      if (gcd(q, m) !== 1) continue;
      let onQ = 0;
      for (let h = q; h <= top; h += q) if (h % m !== 0) onQ += e[h];
      if (onQ >= TWO_NOTE_SHARE * rest) return true;
    }
    return false;
  }

  /** NSDF at integer lag `t` of the fine buffer restricted to `[a, zEnd)`. */
  private nz(a: number, t: number): number {
    const z = this.z;
    const p = this.zPrefix;
    const e = this.zEnd - t;
    let r = 0;
    for (let j = a; j < e; j++) r += z[j] * z[j + t];
    const m = p[e] - p[a] + p[this.zEnd] - p[a + t];
    return m > 0 ? (2 * r) / m : 0;
  }

  /** Interpolated NSDF maximum of the fine buffer `[a, zEnd)` within `half` lags of `center`. */
  private peakNear(a: number, center: number, half: number): Peak | null {
    const maxT = this.zEnd - a - 8;
    const c = Math.round(center);
    let lo = Math.max(1, c - half);
    let hi = Math.min(maxT, c + half);
    if (hi - lo < 2) return null;
    const vals = this.vals;
    vals.length = 0;
    for (let t = lo; t <= hi; t++) vals.push(this.nz(a, t));
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
        for (let t = newLo; t < lo; t++) add.push(this.nz(a, t));
        vals.unshift(...add);
        lo = newLo;
      } else {
        const newHi = Math.min(maxT, hi + half);
        if (newHi === hi) return null;
        for (let t = hi + 1; t <= newHi; t++) vals.push(this.nz(a, t));
        hi = newHi;
      }
    }
    return null;
  }

  /** Refine a coarse period on the low-passed frame, following the peak out over several periods. */
  private refine(cand: Candidate, buf: ArrayLike<number>, end: number): number {
    const sr = this.sampleRate;
    const W = cand.stage.window;
    const T0 = cand.tau;
    const fc = Math.min((this.fineHarmonics * sr) / T0, sr * 0.45);
    const filters = [lowpass(fc, sr, BUTTERWORTH4_Q[0]), lowpass(fc, sr, BUTTERWORTH4_Q[1])];
    const settle = Math.ceil((2.5 * sr) / fc);
    const z = this.z;
    let L = Math.max(W, Math.min(z.length, Math.ceil(this.finePeriods * T0)));
    if (L > end) L = end;
    const warm = Math.min(settle, end - L);
    filterCascade(filters, buf, end - L - warm, L + warm, z, L);
    // Without history the left edge still carries the low-pass start-up: leave it out.
    const skip = Math.min(Math.max(0, settle - warm), L >> 2);

    // The low-passed frame of a low note is heavily oversampled. Keeping every D-th sample (still
    // 16 or more per cycle of the cut-off) makes everything below D times cheaper at no cost in
    // accuracy. The newest sample is kept, so the frame still ends where it ended.
    const D = Math.max(1, Math.floor(sr / (16 * fc)));
    let n = L - skip;
    if (D > 1) {
      n = Math.floor((L - skip - 1) / D) + 1;
      const first = L - 1 - (n - 1) * D;
      for (let i = 0; i < n; i++) z[i] = z[first + i * D];
    } else if (skip > 0) {
      z.copyWithin(0, skip, L);
    }
    const T0d = T0 / D;
    const Wd = Math.min(n, Math.ceil(W / D));

    // Offset measured over a whole number of periods, where a periodic signal averages to its true mean.
    const span = n >= T0d ? Math.round(Math.floor(n / T0d) * T0d) : n;
    let dc = 0;
    for (let i = n - span; i < n; i++) dc += z[i];
    dc /= span;

    const prefix = this.zPrefix;
    let acc = 0;
    prefix[0] = 0;
    for (let i = 0; i < n; i++) {
      const v = z[i] - dc;
      z[i] = v;
      acc += v * v;
      prefix[i + 1] = acc;
    }
    if (!(acc > 0)) return T0;
    this.zEnd = n;

    // Start on the window the note was found in; it is the one known to hold nothing else.
    let a = n - Wd;
    const p1 = this.peakNear(a, T0d, Math.max(2, Math.ceil(T0d * 0.012)));
    if (!p1) return T0;
    let T = p1.tau;
    let v1 = p1.value;
    if (a > 0) {
      // The longer window is used only if it is just as periodic: right after a note change it
      // still holds the previous note, and while the pitch is moving it would lag behind.
      const pl = this.peakNear(0, T, 2 + Math.ceil(T * 0.004));
      if (pl && pl.value >= v1 - 0.02) {
        a = 0;
        T = pl.tau;
        v1 = pl.value;
      }
    }
    const maxLag = Math.floor((n - a) * 0.6);
    let m = 1;
    for (;;) {
      const m2 = Math.min(m * 2, Math.floor(maxLag / T));
      if (m2 <= m) break;
      const center = m2 * T;
      const p = this.peakNear(a, center, 2 + Math.ceil(center * 0.002));
      // A much weaker peak at the long lag means the pitch is moving: keep the shorter-lag estimate.
      if (!p || p.value < v1 - 0.1) break;
      T = p.tau / m2;
      m = m2;
    }
    if (this.stiffness && (n - a) / T >= STIFFNESS_MIN_PERIODS) T = this.fitPartials(a, n, T);
    return T * D;
  }

  /** Magnitude of the Hann-weighted fine frame (in `zw`) at `nu` cycles per sample. */
  private magnitudeAt(count: number, nu: number): number {
    const zw = this.zw;
    const cr = Math.cos(2 * Math.PI * nu);
    const sn = Math.sin(2 * Math.PI * nu);
    let pc = 1;
    let ps = 0;
    let re = 0;
    let im = 0;
    for (let i = 0; i < count; i++) {
      const v = zw[i];
      re += v * pc;
      im += v * ps;
      const t = pc * cr - ps * sn;
      ps = ps * cr + pc * sn;
      pc = t;
    }
    return Math.hypot(re, im);
  }

  /**
   * Stiffness correction. On a real string partial k lies at k f1 (1 + beta (k^2 - 1)), a little
   * above a true multiple, so an estimate that leans on partials 2 to 4 reads sharp. With many
   * periods in view the lowest partials can be measured one at a time: each one's frequency
   * comes from two points on its Hann-windowed spectral peak, half a bin either side (the ratio
   * of the two magnitudes gives the position exactly), and a weighted line through
   * frequency / k against k^2 - 1 has the first partial as its intercept. The result is only
   * accepted when it stays close to the time-domain period it started from.
   */
  private fitPartials(a: number, n: number, T: number): number {
    const z = this.z;
    const zw = this.zw;
    const partials = Math.min(STIFFNESS_PARTIALS, Math.floor(this.fineHarmonics));
    // Only the partials below the fine cut-off are measured, so every `step`-th sample is plenty
    // (still four samples per cycle of the cut-off). Frequencies below are per stepped sample.
    const step = Math.max(1, Math.floor(T / (4 * this.fineHarmonics)));
    const N = Math.floor((n - a) / step);
    const cw = Math.cos((2 * Math.PI) / N);
    const sw = Math.sin((2 * Math.PI) / N);
    let c = 1;
    let sn = 0;
    for (let i = 0; i < N; i++) {
      zw[i] = z[a + i * step] * (0.5 - 0.5 * c);
      const t = c * cw - sn * sw;
      sn = sn * cw + c * sw;
      c = t;
    }
    const half = 0.5 / N;
    const ys = this.partialY;
    const ws = this.partialW;
    let used = 0;
    for (let k = 1; k <= partials; k++) {
      ys[k] = 0;
      ws[k] = 0;
      const nu = (k * step) / T;
      const lower = this.magnitudeAt(N, nu - half);
      const upper = this.magnitudeAt(N, nu + half);
      if (!(lower > 0)) continue;
      // Hann kernel: with the peak a fraction d of a bin above the lower point, upper / lower = (1 + d) / (2 - d).
      const ratio = upper / lower;
      const d = (2 * ratio - 1) / (ratio + 1);
      if (!(d > -0.8 && d < 1.8)) continue;
      const amp = Math.max(lower, upper);
      ys[k] = (nu - half + d / N) / (k * step);
      ws[k] = amp * amp * k * k;
      used++;
    }
    // Three partials are the minimum: two fix the line, the third says whether to believe it.
    if (used < 3) return T;
    let sw0 = 0;
    let su = 0;
    let suu = 0;
    let sy = 0;
    let suy = 0;
    for (let k = 1; k <= partials; k++) {
      const w = ws[k];
      const u = k * k - 1;
      sw0 += w;
      su += w * u;
      suu += w * u * u;
      sy += w * ys[k];
      suy += w * u * ys[k];
    }
    const det = sw0 * suu - su * su;
    if (!(sw0 > 0) || !(det > 1e-3 * sw0 * sw0)) return T;
    const slope = (sw0 * suy - su * sy) / det;
    const f1 = (sy - slope * su) / sw0;
    const beta = slope / f1;
    if (!(f1 > 0) || beta < -STIFFNESS_MAX_BETA * 0.1 || beta > STIFFNESS_MAX_BETA) return T;
    // The partials must sit on the line. If they do not, something else is in the frame (hum,
    // another string) and the plain time-domain period is the more trustworthy answer.
    let res = 0;
    for (let k = 1; k <= partials; k++) {
      const r = ys[k] - (f1 + slope * (k * k - 1));
      res += ws[k] * r * r;
    }
    if (Math.sqrt(res / sw0) > STIFFNESS_MAX_RESIDUAL * f1) return T;
    const fitted = 1 / f1;
    return Math.abs(fitted / T - 1) <= 0.003 ? fitted : T;
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
  const key = [sampleRate, rest.minFreq, rest.maxFreq, rest.peakThreshold, rest.freshThreshold, rest.acceptClarity, rest.gateRms, rest.fineHarmonics, rest.finePeriods, rest.stiffness].join('|');
  let det = detectorCache.get(key);
  if (!det) {
    det = new PitchDetector({ sampleRate, ...rest });
    detectorCache.set(key, det);
  }
  return det.detect(samples, hintFreq ?? 0);
}
