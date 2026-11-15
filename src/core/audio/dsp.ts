/**
 * Pure DSP primitives shared by every synthesised voice. No Web Audio here: everything works on
 * plain typed arrays so it runs (and is unit-tested) in Node.
 */

/** Small deterministic PRNG (mulberry32). Every "random" sound in the engine is seeded. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Uniform in [-1, 1). */
  bipolar(): number {
    return this.next() * 2 - 1;
  }
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** One element of a non-empty array. */
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}

/** Stable 32-bit hash of numbers/strings, used to derive seeds and cache keys. */
export function hashSeed(...parts: Array<number | string>): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = typeof p === 'number' ? p.toFixed(4) : p;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const TWO_PI = Math.PI * 2;

/** Decibels to linear gain. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Linear gain to decibels (floor at -200 dB). */
export function gainToDb(gain: number): number {
  return gain > 1e-10 ? 20 * Math.log10(gain) : -200;
}

/** Clamp x to [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * `x` when it is a finite number, else `fallback`. Everything that reaches an AudioParam or a start
 * time goes through this: Web Audio throws on NaN, and one bad note must never stop a song.
 */
export function finiteOr(x: unknown, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}

// ---------------------------------------------------------------------------------------------
// Biquads (RBJ cookbook). The same coefficients drive IIRFilterNode in the live graph, so the
// offline renderer and the browser produce the same sound.
// ---------------------------------------------------------------------------------------------

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass' | 'peaking' | 'lowshelf' | 'highshelf' | 'notch';

/** A filter described in musical terms; `q` defaults to 0.7071, `gain` (dB) is for peaking/shelves. */
export interface BiquadSpec {
  type: BiquadType;
  freq: number;
  q?: number;
  gain?: number;
}

/** Normalised biquad coefficients (a0 = 1): y = b0 x + b1 x1 + b2 x2 - a1 y1 - a2 y2. */
export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** RBJ cookbook coefficients. The frequency is clamped below Nyquist so any sample rate is safe. */
export function biquadCoeffs(spec: BiquadSpec, sampleRate: number): BiquadCoeffs {
  const f = clamp(spec.freq, 1, sampleRate * 0.49);
  const q = Math.max(0.05, spec.q ?? Math.SQRT1_2);
  const w = (TWO_PI * f) / sampleRate;
  const cs = Math.cos(w);
  const sn = Math.sin(w);
  const alpha = sn / (2 * q);
  const A = Math.pow(10, (spec.gain ?? 0) / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (spec.type) {
    case 'lowpass':
      b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2;
      a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2;
      a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
      break;
    case 'bandpass':
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
      break;
    case 'notch':
      b0 = 1; b1 = -2 * cs; b2 = 1;
      a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
      break;
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A;
      break;
    case 'lowshelf': {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cs + sq); b1 = 2 * A * (A - 1 - (A + 1) * cs); b2 = A * (A + 1 - (A - 1) * cs - sq);
      a0 = A + 1 + (A - 1) * cs + sq; a1 = -2 * (A - 1 + (A + 1) * cs); a2 = A + 1 + (A - 1) * cs - sq;
      break;
    }
    case 'highshelf': {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cs + sq); b1 = -2 * A * (A - 1 + (A + 1) * cs); b2 = A * (A + 1 + (A - 1) * cs - sq);
      a0 = A + 1 - (A - 1) * cs + sq; a1 = 2 * (A - 1 - (A + 1) * cs); a2 = A + 1 - (A - 1) * cs - sq;
      break;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Run one biquad over a buffer (in place unless `out` is given). Returns the output buffer. */
export function biquadFilter(x: Float32Array, c: BiquadCoeffs, out: Float32Array = x): Float32Array {
  const { b0, b1, b2, a1, a2 } = c;
  // Transposed direct form II: two state variables, good numerical behaviour at low frequencies.
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const y = b0 * xi + z1;
    z1 = b1 * xi - a1 * y + z2;
    z2 = b2 * xi - a2 * y;
    out[i] = y;
  }
  return out;
}

/** Run a chain of biquads over a buffer in place. */
export function filterChain(x: Float32Array, specs: readonly BiquadSpec[], sampleRate: number): Float32Array {
  for (const s of specs) biquadFilter(x, biquadCoeffs(s, sampleRate));
  return x;
}

/** Magnitude response of a biquad at `freq`. */
export function biquadMagnitude(c: BiquadCoeffs, freq: number, sampleRate: number): number {
  const w = (TWO_PI * freq) / sampleRate;
  const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * c1 + c.b2 * c2;
  const ni = -(c.b1 * s1 + c.b2 * s2);
  const dr = 1 + c.a1 * c1 + c.a2 * c2;
  const di = -(c.a1 * s1 + c.a2 * s2);
  return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
}

/** Magnitude response of a whole chain at `freq`. */
export function chainMagnitude(specs: readonly BiquadSpec[], freq: number, sampleRate: number): number {
  let m = 1;
  for (const s of specs) m *= biquadMagnitude(biquadCoeffs(s, sampleRate), freq, sampleRate);
  return m;
}

/** One-pole low-pass in place (6 dB/oct). */
export function onePoleLowpass(x: Float32Array, cutoff: number, sampleRate: number): Float32Array {
  const p = Math.exp((-TWO_PI * Math.min(cutoff, sampleRate * 0.49)) / sampleRate);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y = (1 - p) * x[i] + p * y;
    x[i] = y;
  }
  return x;
}

/** One-pole high-pass in place (6 dB/oct). */
export function onePoleHighpass(x: Float32Array, cutoff: number, sampleRate: number): Float32Array {
  const p = Math.exp((-TWO_PI * Math.min(cutoff, sampleRate * 0.49)) / sampleRate);
  let lp = 0;
  for (let i = 0; i < x.length; i++) {
    lp = (1 - p) * x[i] + p * lp;
    x[i] = x[i] - lp;
  }
  return x;
}

// ---------------------------------------------------------------------------------------------
// Buffer helpers
// ---------------------------------------------------------------------------------------------

/** Largest absolute sample value. */
export function peakOf(x: ArrayLike<number>, start = 0, end = x.length): number {
  let p = 0;
  for (let i = start; i < end; i++) {
    const a = Math.abs(x[i]);
    if (a > p) p = a;
  }
  return p;
}

/** Root-mean-square level of a range of samples. */
export function rmsOf(x: ArrayLike<number>, start = 0, end = x.length): number {
  const n = Math.max(1, end - start);
  let s = 0;
  for (let i = start; i < end; i++) s += x[i] * x[i];
  return Math.sqrt(s / n);
}

/** Multiply a buffer by a constant in place. */
export function scaleBuffer(x: Float32Array, gain: number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] *= gain;
  return x;
}

/** Add `src * gain` into `dest` starting at sample `offset` (clipped to dest's length). */
export function mixInto(dest: Float32Array, src: ArrayLike<number>, offset: number, gain = 1): void {
  const start = Math.max(0, -offset);
  const end = Math.min(src.length, dest.length - offset);
  for (let i = start; i < end; i++) dest[offset + i] += src[i] * gain;
}

/** Raised-cosine fade-in over the first `samples` samples, in place. */
export function fadeIn(x: Float32Array, samples: number): Float32Array {
  const n = Math.min(x.length, Math.max(0, Math.floor(samples)));
  for (let i = 0; i < n; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
  return x;
}

/** Raised-cosine fade-out over the last `samples` samples, in place. */
export function fadeOut(x: Float32Array, samples: number): Float32Array {
  const n = Math.min(x.length, Math.max(0, Math.floor(samples)));
  const base = x.length - n;
  for (let i = 0; i < n; i++) x[base + i] *= 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / n);
  return x;
}

/**
 * Replace NaN/Infinity with 0 and flush values too small to matter (float32 denormals are slow on
 * some CPUs and can never be heard). Returns how many non-finite samples were found.
 */
export function sanitize(x: Float32Array): number {
  let bad = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (v > 1e-30 || v < -1e-30) {
      if (v > 3e38 || v < -3e38) {
        x[i] = 0;
        bad++;
      }
    } else if (v !== 0) {
      if (v !== v) bad++;
      x[i] = 0;
    }
  }
  return bad;
}

/** Smooth saturator: linear near 0, approaches +-1. Used for drive stages and safety limiting. */
export function softClip(x: number): number {
  return Math.tanh(x);
}

/**
 * Transparent safety limiter curve: exactly linear below `knee`, then a smooth curve that never
 * exceeds `ceiling`. Shared by the live WaveShaper and the offline mixdown.
 */
export function limiterCurve(x: number, knee = 0.7, ceiling = 0.98): number {
  const a = Math.abs(x);
  if (a <= knee) return x;
  const span = ceiling - knee;
  const y = knee + span * Math.tanh((a - knee) / span);
  return x < 0 ? -y : y;
}

// ---------------------------------------------------------------------------------------------
// FFT (radix-2, in place) for analysis and tests
// ---------------------------------------------------------------------------------------------

/** In-place complex FFT. `re.length` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n & (n - 1)) throw new Error('fft size must be a power of two');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TWO_PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Hann-windowed magnitude spectrum of `size` samples starting at `start` (bins 0..size/2). */
export function magnitudeSpectrum(x: ArrayLike<number>, start: number, size: number): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const v = start + i < x.length && start + i >= 0 ? x[start + i] : 0;
    re[i] = v * (0.5 - 0.5 * Math.cos((TWO_PI * i) / size));
  }
  fft(re, im);
  const mag = new Float64Array(size / 2 + 1);
  for (let i = 0; i <= size / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}
