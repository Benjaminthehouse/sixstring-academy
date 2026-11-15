/**
 * The working view of one notation staff strip: the images every stage reads (binary with and
 * without staff lines, symbol-only ink, distance transform, integral image) and the staff
 * geometry helpers. Built once per staff by {@link buildStrip}.
 *
 * Units: strip px. `s` is the staff space (20 px for the default strip), staff positions count
 * half spaces up from the bottom line (0 = bottom line = written E4, 8 = top line).
 */
import { type Components, labelComponents } from '../image/cc';
import type { StaffInput } from '../types';

/** Derived images and geometry of a staff strip. */
export interface Strip {
  input: StaffInput;
  w: number;
  h: number;
  /** Staff space in px. */
  s: number;
  /** Staff-line thickness in px. */
  thick: number;
  /** Binary with staff lines (1 = ink). */
  bin: Uint8Array;
  /** Binary without staff lines. */
  nl: Uint8Array;
  /** Symbol darkness 0..255: the grey strip inverted, staff lines whitened. */
  ink: Uint8Array;
  /** Weight of each row in template matching: rows inside a staff-line band count less. */
  rowWeight: Float32Array;
  /** Distance of every ink pixel of `nl` to the nearest paper pixel (px); 0 on paper. */
  dt: Float32Array;
  /** Integral image of `nl`, (w + 1) x (h + 1). */
  integral: Int32Array;
  /** y of the staff lines, top first, and of the bottom line. */
  lineYs: number[];
  bottom: number;
  top: number;
  /** First / last column of the staff. */
  x0: number;
  x1: number;
  /** Pixels already explained by a recognised symbol (0 = free). */
  claimed: Uint8Array;
  /** Connected components of `nl`. */
  cc: Components;
  /** Per component of `cc`: what it was recognised as (0 = nothing yet), a {@link CLAIM} code. */
  owner: Uint8Array;
}

/** Codes written into {@link Strip.claimed}. */
export const CLAIM = { header: 1, stem: 2, head: 3, beam: 4, flag: 5, dot: 6, accidental: 7, rest: 8, tie: 9, barline: 10, ledger: 11, tuplet: 12, text: 13 } as const;

/** y of a staff position (half spaces above the bottom line). */
export function posY(strip: Strip, pos: number): number {
  return strip.bottom - (pos * strip.s) / 2;
}

/** Staff position (fractional) of a y. */
export function posAt(strip: Strip, y: number): number {
  return (strip.bottom - y) / (strip.s / 2);
}

/** Number of ink pixels of `nl` in the box [x0, x1) x [y0, y1) (clipped to the strip). */
export function inkIn(strip: Strip, x0: number, y0: number, x1: number, y1: number): number {
  const { w, h, integral } = strip;
  const a = Math.max(0, Math.min(w, Math.round(x0)));
  const b = Math.max(0, Math.min(w, Math.round(x1)));
  const c = Math.max(0, Math.min(h, Math.round(y0)));
  const d = Math.max(0, Math.min(h, Math.round(y1)));
  if (b <= a || d <= c) return 0;
  const W = w + 1;
  return integral[d * W + b] - integral[c * W + b] - integral[d * W + a] + integral[c * W + a];
}

/** Share of ink of `nl` in a box (0 when the box is empty or outside). */
export function inkFraction(strip: Strip, x0: number, y0: number, x1: number, y1: number): number {
  const a = Math.max(0, Math.min(strip.w, Math.round(x0)));
  const b = Math.max(0, Math.min(strip.w, Math.round(x1)));
  const c = Math.max(0, Math.min(strip.h, Math.round(y0)));
  const d = Math.max(0, Math.min(strip.h, Math.round(y1)));
  const area = (b - a) * (d - c);
  return area > 0 ? inkIn(strip, a, c, b, d) / area : 0;
}

const INF = 1e20;

/** 1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher), in place over `f[0..n)`. */
function edt1d(f: Float32Array | Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let p = v[k];
    let s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
    // z[0] is -INF, so the loop always stops at k = 0.
    while (s <= z[k]) {
      k--;
      p = v[k];
      s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}

/**
 * Exact Euclidean distance of every ink pixel to the nearest paper pixel (the strip border counts
 * as paper). Paper pixels get 0.
 */
export function distanceTransform(bin: Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const n = Math.max(w, h) + 2;
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const g = new Float64Array(w * h);
  // Columns: vertical distance to paper (border = paper, hence the two sentinels).
  for (let x = 0; x < w; x++) {
    f[0] = 0;
    for (let y = 0; y < h; y++) f[y + 1] = bin[y * w + x] ? INF : 0;
    f[h + 1] = 0;
    edt1d(f, h + 2, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y + 1];
  }
  for (let y = 0; y < h; y++) {
    f[0] = 0;
    for (let x = 0; x < w; x++) f[x + 1] = g[y * w + x];
    f[w + 1] = 0;
    edt1d(f, w + 2, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x + 1]);
  }
  return out;
}

/** Integral image of a binary image: (w + 1) x (h + 1), `I[y][x]` = ink in [0, x) x [0, y). */
export function integralOf(bin: Uint8Array, w: number, h: number): Int32Array {
  const W = w + 1;
  const out = new Int32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += bin[y * w + x];
      out[(y + 1) * W + x + 1] = out[y * W + x + 1] + row;
    }
  }
  return out;
}

/** Prepare the working view of a staff strip. */
export function buildStrip(input: StaffInput): Strip {
  const w = input.gray.width;
  const h = input.gray.height;
  const s = input.space;
  const bin = input.binary.data;
  const nl = input.noLines.data;
  const mask = input.lineMask.data;
  const gray = input.gray.data;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = mask[i] ? 0 : 255 - gray[i];
  // The soft edge of a removed line is not in the mask: clear the grey fringe above and below it
  // unless a symbol is there.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] || nl[i]) continue;
      if (mask[i - w] || mask[i + w]) ink[i] = 0;
    }
  }
  const thick = Math.max(1, input.lineThickness);
  const rowWeight = new Float32Array(h).fill(1);
  const band = thick / 2 + 1;
  // Staff lines, and the places where ledger lines run above and below the staff: a line through
  // a symbol hides part of it either way.
  const bottomY = input.lineYs[input.lineCount - 1];
  for (let k = -Math.ceil((h - bottomY) / s); k <= Math.ceil(bottomY / s); k++) {
    const ly = bottomY - k * s;
    for (let y = Math.max(0, Math.floor(ly - band)); y <= Math.min(h - 1, Math.ceil(ly + band - 1)); y++) rowWeight[y] = 0.3;
  }
  const cc = labelComponents(input.noLines);
  return {
    input, w, h, s, thick, bin, nl, ink, rowWeight,
    dt: distanceTransform(nl, w, h),
    integral: integralOf(nl, w, h),
    lineYs: input.lineYs,
    bottom: input.lineYs[input.lineCount - 1],
    top: input.lineYs[0],
    x0: input.x0,
    x1: input.x1,
    claimed: new Uint8Array(w * h),
    cc,
    owner: new Uint8Array(cc.count + 1),
  };
}

/** Mark the ink of `nl` inside a box as explained. */
export function claimBox(strip: Strip, x0: number, y0: number, x1: number, y1: number, code: number): void {
  const a = Math.max(0, Math.floor(x0));
  const b = Math.min(strip.w, Math.ceil(x1));
  const c = Math.max(0, Math.floor(y0));
  const d = Math.min(strip.h, Math.ceil(y1));
  for (let y = c; y < d; y++) {
    for (let x = a; x < b; x++) {
      const i = y * strip.w + x;
      if (strip.nl[i] && !strip.claimed[i]) strip.claimed[i] = code;
    }
  }
}

/** Unexplained ink pixels of `nl` in a box. */
export function freeInk(strip: Strip, x0: number, y0: number, x1: number, y1: number): number {
  const a = Math.max(0, Math.floor(x0));
  const b = Math.min(strip.w, Math.ceil(x1));
  const c = Math.max(0, Math.floor(y0));
  const d = Math.min(strip.h, Math.ceil(y1));
  let n = 0;
  for (let y = c; y < d; y++) {
    for (let x = a; x < b; x++) {
      const i = y * strip.w + x;
      if (strip.nl[i] && !strip.claimed[i]) n++;
    }
  }
  return n;
}
