/**
 * Matching played note times to the times the exercise asks for, without knowing the offset
 * between the two clocks. A microphone adds its own delay and the learner may start a beat late,
 * so a take is judged note to note: how far each note sits from a perfectly even line through all
 * of them (evenness), and how the line's slope compares with the click (rushing or dragging).
 */

/** One expected note matched to one played note. */
export interface TimingMatch {
  /** Index into the expected times. */
  expected: number;
  /** Index into the played times. */
  played: number;
  /** Played minus the fitted line, in seconds (positive = late). */
  error: number;
}

/** The result of aligning played times with expected times. */
export interface TimingFit {
  matches: TimingMatch[];
  /** Played seconds per expected second: above 1 is slower than asked (dragging). */
  slope: number;
  /** Where the fitted line puts expected time 0, on the played clock. */
  offset: number;
  /** Expected indexes with no played note near them. */
  missed: number[];
  /** Played indexes that match nothing. */
  extra: number[];
  /** Root-mean-square of the errors, in milliseconds. */
  rmsMs: number;
  /** Largest absolute error, in milliseconds. */
  maxMs: number;
  /** Expected index of the largest error, or -1. */
  worst: number;
}

/** The slope is kept within this range: further out the learner is playing something else. */
const MIN_SLOPE = 0.75;
const MAX_SLOPE = 1.33;

/** Least-squares line through (x, y) points; slope clamped. With one point the slope is 1. */
export function fitLine(xs: readonly number[], ys: readonly number[]): { slope: number; offset: number } {
  const n = xs.length;
  if (n === 0) return { slope: 1, offset: 0 };
  if (n === 1) return { slope: 1, offset: ys[0] - xs[0] };
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  let slope = sxx > 1e-9 ? sxy / sxx : 1;
  slope = Math.min(MAX_SLOPE, Math.max(MIN_SLOPE, slope));
  return { slope, offset: my - slope * mx };
}

/** The smallest gap between neighbouring expected times (seconds), ignoring notes struck together. */
export function smallestGap(times: readonly number[]): number {
  let gap = Infinity;
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 1e-4 && d < gap) gap = d;
  }
  return Number.isFinite(gap) ? gap : 0.5;
}

/** The median gap between neighbouring expected times (seconds). */
export function medianGap(times: readonly number[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 1e-4) gaps.push(d);
  }
  if (!gaps.length) return 0.5;
  gaps.sort((a, b) => a - b);
  return gaps[gaps.length >> 1];
}

interface Attempt {
  pairs: Array<[number, number]>;
  slope: number;
  offset: number;
  cost: number;
}

/** Greedy in-order matching from one anchor, refitting the line as matches accumulate. */
function attempt(expected: readonly number[], played: readonly number[], offset0: number, window: number): Attempt {
  let slope = 1;
  let offset = offset0;
  const pairs: Array<[number, number]> = [];
  let from = 0;
  let cost = 0;
  for (let k = 0; k < expected.length; k++) {
    const pred = offset + slope * expected[k];
    let best = -1;
    let bestErr = Infinity;
    for (let q = from; q < played.length; q++) {
      const err = played[q] - pred;
      if (err > window) break;
      if (Math.abs(err) <= window && Math.abs(err) < bestErr) {
        best = q;
        bestErr = Math.abs(err);
      }
    }
    if (best < 0) continue;
    pairs.push([k, best]);
    cost += bestErr / window;
    from = best + 1;
    if (pairs.length >= 3) {
      const fit = fitLine(pairs.map(([e]) => expected[e]), pairs.map(([, p]) => played[p]));
      slope = fit.slope;
      offset = fit.offset;
    } else {
      // Until there are three points, keep the click's slope and centre the line on what we have.
      offset = pairs.reduce((s, [e, p]) => s + played[p] - expected[e], 0) / pairs.length;
    }
  }
  return { pairs, slope, offset, cost };
}

/**
 * Align played times (any clock, ascending) with expected times (seconds, ascending, from the
 * first note). Tries the first few played notes against the first few expected ones as anchors
 * and keeps the alignment that matches most notes most closely.
 */
export function alignTimes(expected: readonly number[], played: readonly number[], opts: { window?: number } = {}): TimingFit {
  const empty: TimingFit = { matches: [], slope: 1, offset: 0, missed: expected.map((_, i) => i), extra: played.map((_, i) => i), rmsMs: 0, maxMs: 0, worst: -1 };
  if (!expected.length || !played.length) return empty;
  const window = opts.window ?? Math.min(0.25, Math.max(0.03, 0.45 * smallestGap(expected)));
  let best: Attempt | null = null;
  for (let i = 0; i < Math.min(4, expected.length); i++) {
    for (let j = 0; j < Math.min(6, played.length); j++) {
      const a = attempt(expected, played, played[j] - expected[i], window);
      const score = a.pairs.length - 0.5 * a.cost;
      const bestScore = best ? best.pairs.length - 0.5 * best.cost : -Infinity;
      if (score > bestScore) best = a;
    }
  }
  if (!best || !best.pairs.length) return empty;
  const fit = fitLine(best.pairs.map(([e]) => expected[e]), best.pairs.map(([, p]) => played[p]));
  const matches: TimingMatch[] = best.pairs.map(([e, p]) => ({ expected: e, played: p, error: played[p] - (fit.offset + fit.slope * expected[e]) }));
  const usedE = new Set(matches.map((m) => m.expected));
  const usedP = new Set(matches.map((m) => m.played));
  let sq = 0;
  let maxAbs = 0;
  let worst = -1;
  for (const m of matches) {
    sq += m.error * m.error;
    if (Math.abs(m.error) > maxAbs) {
      maxAbs = Math.abs(m.error);
      worst = m.expected;
    }
  }
  return {
    matches,
    slope: fit.slope,
    offset: fit.offset,
    missed: expected.map((_, i) => i).filter((i) => !usedE.has(i)),
    extra: played.map((_, i) => i).filter((i) => !usedP.has(i)),
    rmsMs: Math.sqrt(sq / matches.length) * 1000,
    maxMs: maxAbs * 1000,
    worst,
  };
}
