/**
 * Radix-2 FFT with precomputed tables. Dependency-free and allocation-free per call, because the
 * pitch detector runs it 80+ times a second inside a worker (or, as a fallback, on the main thread).
 */

/** Smallest power of two that is >= n (and >= 2). */
export function nextPow2(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

/** In-place complex FFT of a fixed power-of-two size. */
export class FFT {
  /** Transform length. */
  readonly size: number;
  private readonly cosT: Float64Array;
  private readonly sinT: Float64Array;
  private readonly rev: Uint32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${size}`);
    this.size = size;
    const half = size >> 1;
    this.cosT = new Float64Array(half);
    this.sinT = new Float64Array(half);
    for (let i = 0; i < half; i++) {
      const a = (2 * Math.PI * i) / size;
      this.cosT[i] = Math.cos(a);
      this.sinT[i] = Math.sin(a);
    }
    this.rev = new Uint32Array(size);
    let bits = 0;
    while (1 << bits < size) bits++;
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      this.rev[i] = r;
    }
  }

  /** Forward transform, in place: X[k] = sum x[n] e^(-2 pi i k n / N). */
  forward(re: Float64Array, im: Float64Array): void {
    const n = this.size;
    const rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
    // First stage has trivial twiddles: no multiplications.
    for (let i = 0; i < n; i += 2) {
      const ar = re[i];
      const ai = im[i];
      const br = re[i + 1];
      const bi = im[i + 1];
      re[i] = ar + br;
      im[i] = ai + bi;
      re[i + 1] = ar - br;
      im[i + 1] = ai - bi;
    }
    const cosT = this.cosT;
    const sinT = this.sinT;
    for (let len = 4; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = cosT[k];
          const wi = -sinT[k];
          const a = i + j;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }

  /** Inverse transform, in place, including the 1/N scale. */
  inverse(re: Float64Array, im: Float64Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) im[i] = -im[i];
    this.forward(re, im);
    const s = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= s;
      im[i] = -im[i] * s;
    }
  }
}

const hannCache = new Map<number, Float64Array>();

/** Periodic Hann window of length n (cached; treat the result as read-only). */
export function hannWindow(n: number): Float64Array {
  let w = hannCache.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    hannCache.set(n, w);
  }
  return w;
}

const fftCache = new Map<number, FFT>();

/** Shared FFT plan for a size (plans hold only immutable tables, so sharing is safe). */
export function fftPlan(size: number): FFT {
  let f = fftCache.get(size);
  if (!f) {
    f = new FFT(size);
    fftCache.set(size, f);
  }
  return f;
}

/**
 * Magnitude spectrum of a real frame: Hann-windowed, zero-padded to `fftSize`, scaled so that a
 * full-scale sine reads about 1.0 at its peak. Returns `fftSize / 2 + 1` bins.
 */
export function magnitudeSpectrum(
  samples: ArrayLike<number>,
  start: number,
  length: number,
  fftSize: number,
  out?: Float64Array,
): Float64Array {
  const fft = fftPlan(fftSize);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const w = hannWindow(length);
  for (let i = 0; i < length; i++) re[i] = samples[start + i] * w[i];
  fft.forward(re, im);
  const bins = fftSize / 2 + 1;
  const mag = out && out.length >= bins ? out : new Float64Array(bins);
  const scale = 4 / length; // 2/N for a one-sided spectrum, another 2 for the Hann coherent gain of 0.5
  for (let k = 0; k < bins; k++) mag[k] = Math.hypot(re[k], im[k]) * scale;
  return mag;
}
