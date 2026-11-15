/**
 * Staff scale from run lengths: on a page of music the most common "ink run + paper run" pair
 * along a column is one staff line plus the gap to the next line, i.e. the staff space. This
 * needs no knowledge of where the staves are and tolerates rotation, curl and symbols.
 */
import type { BinaryImage } from '../image/gray';

/** Result of {@link estimateStaffScale}. */
export interface StaffScale {
  /** Staff-line thickness in px (0 when no staff was seen). */
  lineThickness: number;
  /** Distance between adjacent staff lines in px (0 when no staff was seen). */
  staffSpace: number;
  /** A second staff space on the page (tab staves are usually wider than notation staves), or 0. */
  secondSpace: number;
  /** 0..1: share of the run pairs that agree with `staffSpace`. Low on pages without staves. */
  confidence: number;
}

const MAX_BLACK = 40;

/** Estimate line thickness and staff space of a binary page. */
export function estimateStaffScale(bin: BinaryImage, opts: { minSpace?: number; maxSpace?: number } = {}): StaffScale {
  const { width: w, height: h, data } = bin;
  const maxSpace = Math.min(opts.maxSpace ?? 120, Math.floor(h / 6));
  const minSpace = opts.minSpace ?? 4;
  if (maxSpace <= minSpace) return { lineThickness: 0, staffSpace: 0, secondSpace: 0, confidence: 0 };
  const step = w > 1600 ? 2 : 1;
  // joint[b * (maxSpace + 1) + s] counts ink runs of length b followed by paper so that b + paper = s.
  const S = maxSpace + 1;
  const joint = new Uint32Array((MAX_BLACK + 1) * S);
  const run = new Int32Array(w);
  const ink = new Uint8Array(w);
  const prev = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x += step) {
      const v = data[o + x];
      if (v === ink[x]) {
        run[x]++;
        continue;
      }
      const len = run[x];
      if (ink[x]) {
        prev[x] = len;
      } else if (prev[x] > 0 && prev[x] <= MAX_BLACK) {
        const s = len + prev[x];
        // A staff line is much thinner than the gap: ignore pairs that are mostly ink.
        if (s <= maxSpace && prev[x] * 2.2 <= s) joint[prev[x] * S + s]++;
      }
      ink[x] = v;
      run[x] = 1;
    }
  }
  const pair = new Float64Array(S);
  let total = 0;
  for (let b = 1; b <= MAX_BLACK; b++) {
    for (let s = minSpace; s < S; s++) {
      pair[s] += joint[b * S + s];
      total += joint[b * S + s];
    }
  }
  if (total < 50) return { lineThickness: 0, staffSpace: 0, secondSpace: 0, confidence: 0 };
  // Smooth [1 2 1] and find the main peak.
  const sm = new Float64Array(S);
  for (let s = minSpace; s < S; s++) sm[s] = (pair[s - 1] || 0) + 2 * pair[s] + (s + 1 < S ? pair[s + 1] : 0);
  let best = minSpace;
  for (let s = minSpace; s < S; s++) if (sm[s] > sm[best]) best = s;
  const centroid = (c: number): number => {
    let a = 0;
    let m = 0;
    for (let s = Math.max(minSpace, c - 1); s <= Math.min(S - 1, c + 1); s++) {
      a += pair[s] * s;
      m += pair[s];
    }
    return m > 0 ? a / m : c;
  };
  const space = centroid(best);
  // Thickness: the ink part of the pairs that sum to the staff space.
  let tb = 1;
  let tbest = -1;
  let ta = 0;
  let tm = 0;
  const thick = new Float64Array(MAX_BLACK + 1);
  for (let b = 1; b <= MAX_BLACK; b++) {
    for (let s = Math.max(minSpace, best - 1); s <= Math.min(S - 1, best + 1); s++) thick[b] += joint[b * S + s];
    if (thick[b] > tbest) {
      tbest = thick[b];
      tb = b;
    }
  }
  for (let b = Math.max(1, tb - 1); b <= Math.min(MAX_BLACK, tb + 1); b++) {
    ta += thick[b] * b;
    tm += thick[b];
  }
  const thickness = tm > 0 ? ta / tm : tb;
  // A second, clearly separate peak (tab vs notation staff size).
  let second = 0;
  let secondVal = 0;
  for (let s = minSpace + 1; s < S - 1; s++) {
    const ratio = s / best;
    const plausible = (ratio >= 1.2 && ratio <= 1.9) || (ratio >= 0.52 && ratio <= 0.84);
    if (!plausible) continue;
    if (sm[s] >= sm[s - 1] && sm[s] >= sm[s + 1] && sm[s] > secondVal) {
      secondVal = sm[s];
      second = s;
    }
  }
  const secondSpace = second && secondVal >= 0.12 * sm[best] ? centroid(second) : 0;
  let inPeak = 0;
  for (let s = Math.max(minSpace, best - 1); s <= Math.min(S - 1, best + 1); s++) inPeak += pair[s];
  return { lineThickness: thickness, staffSpace: space, secondSpace, confidence: Math.min(1, (inPeak / total) * 1.5) };
}
