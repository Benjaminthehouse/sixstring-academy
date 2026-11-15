/**
 * Small IIR filters used around the pitch detector: rumble/DC removal and the band limiting that
 * keeps the autocorrelation smooth (accurate interpolation) and dominated by the low partials
 * (which a stiff string keeps closest to true multiples of the fundamental).
 */

/** Normalised biquad coefficients (a0 = 1). */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function clampCutoff(fc: number, sampleRate: number): number {
  return Math.min(Math.max(fc, 1), sampleRate * 0.45);
}

/** Second-order low-pass (RBJ cookbook). Q = 1/sqrt(2) gives a Butterworth response. */
export function lowpass(fc: number, sampleRate: number, q: number = Math.SQRT1_2): Biquad {
  const w = (2 * Math.PI * clampCutoff(fc, sampleRate)) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cos) / 2 / a0,
    b1: (1 - cos) / a0,
    b2: (1 - cos) / 2 / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

/** Second-order high-pass (RBJ cookbook). */
export function highpass(fc: number, sampleRate: number, q: number = Math.SQRT1_2): Biquad {
  const w = (2 * Math.PI * clampCutoff(fc, sampleRate)) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: (1 + cos) / 2 / a0,
    b1: -(1 + cos) / a0,
    b2: (1 + cos) / 2 / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

/** The two Q values that make two cascaded biquads a 4th-order Butterworth filter. */
export const BUTTERWORTH4_Q: readonly [number, number] = [0.5411961, 1.3065630];

/**
 * Run a cascade of biquads over `input[start .. start+n)` and write the last `keep` outputs to
 * `out[0 .. keep)`. The first `n - keep` samples only warm the filters up.
 *
 * The state starts at the steady state for a constant input equal to the first sample, so a frame
 * cut out of a longer signal does not ring from an artificial step at its left edge.
 */
export function filterCascade(
  stages: readonly Biquad[],
  input: ArrayLike<number>,
  start: number,
  n: number,
  out: Float64Array,
  keep: number = n,
): void {
  const skip = n - keep;
  if (stages.length === 0) {
    for (let i = 0; i < keep; i++) out[i] = input[start + skip + i];
    return;
  }
  // Fast paths for the two cascade lengths the detector uses, with state held in locals.
  const x0 = n > 0 ? input[start] : 0;
  const s = stages[0];
  let y0 = (x0 * (s.b0 + s.b1 + s.b2)) / (1 + s.a1 + s.a2);
  let s1a = y0 - s.b0 * x0;
  let s2a = s.b2 * x0 - s.a2 * y0;
  if (stages.length === 1) {
    for (let i = 0; i < n; i++) {
      const x = input[start + i];
      const y = s.b0 * x + s1a;
      s1a = s.b1 * x - s.a1 * y + s2a;
      s2a = s.b2 * x - s.a2 * y;
      if (i >= skip) out[i - skip] = y;
    }
    return;
  }
  const t = stages[1];
  let y1 = (y0 * (t.b0 + t.b1 + t.b2)) / (1 + t.a1 + t.a2);
  let s1b = y1 - t.b0 * y0;
  let s2b = t.b2 * y0 - t.a2 * y1;
  if (stages.length === 2) {
    for (let i = 0; i < n; i++) {
      const x = input[start + i];
      const y = s.b0 * x + s1a;
      s1a = s.b1 * x - s.a1 * y + s2a;
      s2a = s.b2 * x - s.a2 * y;
      const z = t.b0 * y + s1b;
      s1b = t.b1 * y - t.a1 * z + s2b;
      s2b = t.b2 * y - t.a2 * z;
      if (i >= skip) out[i - skip] = z;
    }
    return;
  }
  // General case: first two stages inline, the rest from per-stage state arrays.
  const extra = stages.length - 2;
  const e1 = new Float64Array(extra);
  const e2 = new Float64Array(extra);
  let prev = y1;
  for (let k = 0; k < extra; k++) {
    const c = stages[k + 2];
    const yk = (prev * (c.b0 + c.b1 + c.b2)) / (1 + c.a1 + c.a2);
    e1[k] = yk - c.b0 * prev;
    e2[k] = c.b2 * prev - c.a2 * yk;
    prev = yk;
  }
  y0 = 0;
  y1 = 0;
  for (let i = 0; i < n; i++) {
    const x = input[start + i];
    const y = s.b0 * x + s1a;
    s1a = s.b1 * x - s.a1 * y + s2a;
    s2a = s.b2 * x - s.a2 * y;
    let z = t.b0 * y + s1b;
    s1b = t.b1 * y - t.a1 * z + s2b;
    s2b = t.b2 * y - t.a2 * z;
    for (let k = 0; k < extra; k++) {
      const c = stages[k + 2];
      const v = c.b0 * z + e1[k];
      e1[k] = c.b1 * z - c.a1 * v + e2[k];
      e2[k] = c.b2 * z - c.a2 * v;
      z = v;
    }
    if (i >= skip) out[i - skip] = z;
  }
}
