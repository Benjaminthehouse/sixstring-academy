/**
 * Measurement tools for audio buffers: precise pitch, envelope, decay, spectrum, onsets.
 * They exist so the synth can be verified numerically (unit tests, the browser smoke test) and so
 * other modules have a trustworthy reference when they generate fixtures. Pure, no Web Audio.
 */
import { centsBetween, midiToFreq } from '@/core/math/pitch-math';
import { TWO_PI, fft, magnitudeSpectrum } from './dsp';

/** Result of {@link estimatePitch}. */
export interface PitchEstimate {
  /** Fundamental frequency in Hz. */
  hz: number;
  /** Height of the chosen autocorrelation peak, 0..1 (1 = perfectly periodic). */
  clarity: number;
}

/** Options for {@link estimatePitch}. */
export interface PitchOptions {
  /** First sample of the analysis window (default 0). */
  start?: number;
  /** Number of samples to analyse (default: 8192 or what is left). */
  length?: number;
  /** Lowest and highest fundamental considered (default 30..2500 Hz). */
  minHz?: number;
  maxHz?: number;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function parabolicPeak(y0: number, y1: number, y2: number): { offset: number; value: number } {
  const d = y0 - 2 * y1 + y2;
  if (Math.abs(d) < 1e-20) return { offset: 0, value: y1 };
  const offset = (0.5 * (y0 - y2)) / d;
  return { offset, value: y1 - 0.25 * (y0 - y2) * offset };
}

/**
 * Fundamental by normalised autocorrelation (McLeod's NSDF with a multi-period refinement).
 * This is what a good tuner "hears": it weighs every harmonic, so it also reveals inharmonicity.
 * Accurate to a few hundredths of a cent on a clean periodic signal. Returns null for silence.
 */
export function estimatePitch(x: ArrayLike<number>, sampleRate: number, opts: PitchOptions = {}): PitchEstimate | null {
  const start = Math.max(0, opts.start ?? 0);
  const W = Math.min(opts.length ?? 8192, x.length - start);
  const minHz = opts.minHz ?? 30;
  const maxHz = opts.maxHz ?? 2500;
  if (W < 64) return null;
  const maxLag = Math.min(W - 16, Math.ceil(sampleRate / minHz) + 2);
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz) - 1);
  // Autocorrelation through the power spectrum.
  const N = nextPow2(2 * W);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let energy = 0;
  for (let i = 0; i < W; i++) {
    const v = x[start + i];
    re[i] = v;
    energy += v * v;
  }
  if (energy < 1e-12) return null;
  fft(re, im);
  for (let i = 0; i < N; i++) {
    re[i] = re[i] * re[i] + im[i] * im[i];
    im[i] = 0;
  }
  fft(re, im); // forward again: for a real even spectrum this is N * autocorrelation
  const lagCount = Math.min(W - 1, Math.floor(W * 0.85));
  const nsdf = new Float64Array(lagCount + 1);
  // m(tau) = sum over the overlap of x[j]^2 + x[j+tau]^2, updated incrementally.
  let m = 2 * energy;
  for (let tau = 0; tau <= lagCount; tau++) {
    nsdf[tau] = m > 1e-20 ? (2 * re[tau]) / N / m : 0;
    const a = x[start + tau];
    const b = x[start + W - 1 - tau];
    m -= a * a + b * b;
  }
  // Key maxima between positive-going zero crossings (McLeod & Wyvill).
  let best = -1;
  let bestVal = 0;
  const maxima: Array<{ lag: number; value: number }> = [];
  let tau = 1;
  while (tau < maxLag && nsdf[tau] > 0) tau++; // leave the lag-0 lobe
  for (; tau < maxLag; tau++) {
    if (nsdf[tau] <= 0) continue;
    let localBest = tau;
    while (tau < maxLag && nsdf[tau] > 0) {
      if (nsdf[tau] > nsdf[localBest]) localBest = tau;
      tau++;
    }
    if (localBest >= minLag && localBest < lagCount) {
      maxima.push({ lag: localBest, value: nsdf[localBest] });
      if (nsdf[localBest] > bestVal) bestVal = nsdf[localBest];
    }
  }
  if (!maxima.length || bestVal < 0.2) return null;
  for (const mx of maxima) {
    if (mx.value >= 0.93 * bestVal) {
      best = mx.lag;
      break;
    }
  }
  if (best < 0) return null;
  const p1 = parabolicPeak(nsdf[best - 1], nsdf[best], nsdf[best + 1]);
  let period = best + p1.offset;
  // Refine on a peak several periods out: the interpolation error is divided by the multiple.
  const multiple = Math.floor((lagCount * 0.6) / period);
  if (multiple >= 2) {
    const centre = Math.round(multiple * period);
    let peak = centre;
    const reach = Math.max(2, Math.ceil(period * 0.08));
    for (let l = Math.max(2, centre - reach); l <= Math.min(lagCount - 1, centre + reach); l++) {
      if (nsdf[l] > nsdf[peak]) peak = l;
    }
    if (peak > 1 && peak < lagCount && nsdf[peak] > 0.5 * p1.value) {
      const pm = parabolicPeak(nsdf[peak - 1], nsdf[peak], nsdf[peak + 1]);
      period = (peak + pm.offset) / multiple;
    }
  }
  return { hz: sampleRate / period, clarity: Math.min(1, p1.value) };
}

/** Options for {@link measureFundamental}. */
export interface FundamentalOptions {
  /** First sample of the first analysis frame (default 0). */
  start?: number;
  /** Frame length in periods of the fundamental (default 16). */
  periods?: number;
  /** Distance between the two frames, in periods (default 24). */
  hopPeriods?: number;
}

/**
 * Frequency of the fundamental partial alone, from the phase advance of a single DFT bin between
 * two Hann-windowed frames (the phase-vocoder estimate). Needs a rough `approxHz` (within a few
 * percent). Precise to about a thousandth of a cent on a steady partial; decay does not bias it.
 */
export function measureFundamental(x: ArrayLike<number>, sampleRate: number, approxHz: number, opts: FundamentalOptions = {}): number {
  const start = Math.max(0, opts.start ?? 0);
  let f = approxHz;
  for (let pass = 0; pass < 3; pass++) {
    const period = sampleRate / f;
    const W = Math.max(64, Math.round((opts.periods ?? 16) * period));
    let hop = Math.max(8, Math.round((opts.hopPeriods ?? 24) * period));
    if (start + hop + W > x.length) hop = Math.max(8, x.length - W - start);
    if (hop < 8 || start + W > x.length) return f;
    const w = (TWO_PI * f) / sampleRate;
    const bin = (offset: number): [number, number] => {
      let sr = 0, si = 0;
      for (let n = 0; n < W; n++) {
        const win = 0.5 - 0.5 * Math.cos((TWO_PI * (n + 0.5)) / W);
        const v = x[offset + n] * win;
        // Phase is referenced to absolute time so the two frames are directly comparable.
        const ph = w * (offset + n);
        sr += v * Math.cos(ph);
        si -= v * Math.sin(ph);
      }
      return [sr, si];
    };
    const [ar, ai] = bin(start);
    const [br, bi] = bin(start + hop);
    // Residual rotation between the frames = (true - assumed) angular frequency * hop.
    const dphi = Math.atan2(bi * ar - br * ai, br * ar + bi * ai);
    f += (dphi * sampleRate) / (TWO_PI * hop);
  }
  return f;
}

/** Cents between a measured frequency and an equal-tempered MIDI note (positive = sharp). */
export function centsFromMidi(hz: number, midi: number, a4 = 440): number {
  return centsBetween(hz, midiToFreq(midi, a4));
}

/** RMS envelope with a sliding window; one value every `hopMs`. */
export function envelope(x: ArrayLike<number>, sampleRate: number, windowMs = 10, hopMs = 2): Float32Array {
  const win = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const hop = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
  const frames = Math.max(0, Math.floor((x.length - win) / hop) + 1);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    const o = f * hop;
    for (let i = 0; i < win; i++) s += x[o + i] * x[o + i];
    out[f] = Math.sqrt(s / win);
  }
  return out;
}

/** Seconds from the first audible sample to the loudest point of the 3 ms RMS envelope. */
export function attackTime(x: ArrayLike<number>, sampleRate: number): number {
  const hopMs = 0.5;
  const env = envelope(x, sampleRate, 3, hopMs);
  let peak = 0, at = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > peak) { peak = env[i]; at = i; }
  if (peak <= 0) return 0;
  let first = 0;
  while (first < at && env[first] < peak * 0.05) first++;
  // Time to reach 90 % of the peak: robust against a late, barely higher maximum.
  let reach = first;
  while (reach < at && env[reach] < peak * 0.9) reach++;
  return ((reach - first) * hopMs) / 1000;
}

/**
 * Seconds until the 30 ms RMS envelope has fallen `dropDb` below its maximum and stays there.
 * Returns the buffer length when it never gets that quiet.
 */
export function decayTime(x: ArrayLike<number>, sampleRate: number, dropDb = 20): number {
  const hopMs = 5;
  const env = envelope(x, sampleRate, 30, hopMs);
  let peak = 0, at = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > peak) { peak = env[i]; at = i; }
  const target = peak * Math.pow(10, -dropDb / 20);
  let last = env.length;
  for (let i = env.length - 1; i >= at; i--) {
    if (env[i] > target) break;
    last = i;
  }
  return ((last - at) * hopMs) / 1000;
}

/** Decay rate in dB per second, by a straight-line fit to the dB envelope between two times. */
export function decaySlopeDb(x: ArrayLike<number>, sampleRate: number, fromSec: number, toSec: number): number {
  const hopMs = 10;
  const env = envelope(x, sampleRate, 40, hopMs);
  const i0 = Math.max(0, Math.floor((fromSec * 1000) / hopMs));
  const i1 = Math.min(env.length, Math.ceil((toSec * 1000) / hopMs));
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = i0; i < i1; i++) {
    if (env[i] < 1e-7) continue;
    const t = (i * hopMs) / 1000;
    const y = 20 * Math.log10(env[i]);
    n++; sx += t; sy += y; sxx += t * t; sxy += t * y;
  }
  if (n < 3) return 0;
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

/** Spectral centroid in Hz of a Hann-windowed frame (`size` must be a power of two). */
export function spectralCentroid(x: ArrayLike<number>, sampleRate: number, startSec: number, size = 4096): number {
  const mag = magnitudeSpectrum(x, Math.round(startSec * sampleRate), size);
  let num = 0, den = 0;
  for (let i = 1; i < mag.length; i++) {
    const p = mag[i] * mag[i];
    num += p * i;
    den += p;
  }
  return den > 0 ? ((num / den) * sampleRate) / size : 0;
}

/** Amplitude (linear) of harmonics 1..count of `f0`, measured in one Hann-windowed frame. */
export function harmonicAmplitudes(x: ArrayLike<number>, sampleRate: number, f0: number, count: number, startSec = 0, frameSec = 0.1): number[] {
  const start = Math.round(startSec * sampleRate);
  const W = Math.min(Math.round(frameSec * sampleRate), x.length - start);
  const out: number[] = [];
  for (let k = 1; k <= count; k++) {
    const w = (TWO_PI * f0 * k) / sampleRate;
    if (w >= Math.PI) { out.push(0); continue; }
    let sr = 0, si = 0, wsum = 0;
    for (let n = 0; n < W; n++) {
      const win = 0.5 - 0.5 * Math.cos((TWO_PI * (n + 0.5)) / W);
      const v = x[start + n] * win;
      sr += v * Math.cos(w * n);
      si -= v * Math.sin(w * n);
      wsum += win;
    }
    out.push((2 * Math.hypot(sr, si)) / wsum);
  }
  return out;
}

/**
 * Sample indices where sound starts after silence: |x| rises above `threshold` having stayed below
 * it for at least `gapSec`. Used to check that scheduled events land where they were asked to.
 */
export function findOnsets(x: ArrayLike<number>, sampleRate: number, threshold = 0.02, gapSec = 0.03): number[] {
  const gap = Math.max(1, Math.round(gapSec * sampleRate));
  const onsets: number[] = [];
  let quiet = gap;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a >= threshold) {
      if (quiet >= gap) onsets.push(i);
      quiet = 0;
    } else {
      quiet++;
    }
  }
  return onsets;
}

/** True when a buffer contains NaN, Infinity, or float32 denormals. */
export function hasBadSamples(x: Float32Array): boolean {
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (v !== v || v === Infinity || v === -Infinity) return true;
    if (v !== 0 && Math.abs(v) < 1.1754944e-38) return true;
  }
  return false;
}
