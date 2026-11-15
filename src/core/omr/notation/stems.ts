/**
 * Thin vertical strokes of a staff strip: note stems (and, incidentally, bar lines and the
 * uprights of sharps, naturals and flats, which later stages tell apart by what is attached).
 *
 * A stroke is found in the line-free binary as a column cluster of long vertical runs of pixels
 * whose horizontal run is narrow. Where a stem runs along a note head or through a beam it is no
 * longer "narrow", so the thin part is extended afterwards along the ink of its own columns.
 */
import type { Strip } from './strip';

/** A thin vertical stroke. */
export interface Stroke {
  /** Centre column (weighted by run length). */
  x: number;
  /** Column range of the thin part. */
  xa: number;
  xb: number;
  /** Row range of the thin part (inclusive). */
  ya: number;
  yb: number;
  /** Row range of the full vertical ink run through the stroke (inclusive): the thin part plus the stretches inside heads, beams and flags. */
  top: number;
  bottom: number;
  /** Mean width of the thin part, px. */
  width: number;
  /** Lies on a bar line reported by the layout stage. */
  barline: boolean;
}

/** Options for {@link findStrokes}. */
export interface StrokeOptions {
  /** Widest horizontal run that still counts as thin, in staff spaces. Default 0.42. */
  maxWidth?: number;
  /** Shortest thin run kept, in staff spaces. Default 1.1. */
  minLength?: number;
}

/** Find the thin vertical strokes between columns `xFrom` and `xTo`. */
export function findStrokes(strip: Strip, xFrom: number, xTo: number, opts: StrokeOptions = {}): Stroke[] {
  const { w, h, nl, s } = strip;
  const maxW = Math.max(3, Math.round((opts.maxWidth ?? 0.42) * s));
  const minLen = Math.round((opts.minLength ?? 1.1) * s);
  const xa = Math.max(0, Math.floor(xFrom));
  const xb = Math.min(w - 1, Math.ceil(xTo));
  // Pixels whose horizontal ink run is narrow.
  const thin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let x = xa;
    while (x <= xb) {
      if (!nl[o + x]) { x++; continue; }
      let a = x;
      while (a > 0 && nl[o + a - 1]) a--;
      let b = x;
      while (b < w - 1 && nl[o + b + 1]) b++;
      if (b - a + 1 <= maxW) for (let i = Math.max(a, xa); i <= Math.min(b, xb); i++) thin[o + i] = 1;
      x = b + 1;
    }
  }
  // Long vertical runs of thin pixels, per column (gaps of up to 2 px are bridged).
  interface Run { x: number; y0: number; y1: number; group: number }
  const runs: Run[] = [];
  const byCol: number[][] = [];
  for (let x = xa; x <= xb; x++) {
    const list: number[] = [];
    let y = 0;
    while (y < h) {
      if (!thin[y * w + x]) { y++; continue; }
      const y0 = y;
      let y1 = y;
      let gap = 0;
      let yy = y + 1;
      while (yy < h && gap <= 2) {
        if (thin[yy * w + x]) { y1 = yy; gap = 0; } else gap++;
        yy++;
      }
      if (y1 - y0 + 1 >= minLen) {
        list.push(runs.length);
        runs.push({ x, y0, y1, group: runs.length });
      }
      y = y1 + 1;
    }
    byCol.push(list);
  }
  const find = (i: number): number => {
    while (runs[i].group !== i) {
      runs[i].group = runs[runs[i].group].group;
      i = runs[i].group;
    }
    return i;
  };
  for (let c = 1; c < byCol.length; c++) {
    for (const i of byCol[c]) {
      for (const j of byCol[c - 1]) {
        const a = runs[i];
        const b = runs[j];
        // Neighbouring columns of one stroke overlap for most of the shorter run.
        const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1;
        if (overlap >= 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0)) {
          const ra = find(i);
          const rb = find(j);
          if (ra !== rb) runs[ra].group = rb;
        }
      }
    }
  }
  const groups = new Map<number, Run[]>();
  runs.forEach((r, i) => {
    const g = find(i);
    const list = groups.get(g);
    if (list) list.push(r); else groups.set(g, [r]);
  });
  const out: Stroke[] = [];
  for (const list of groups.values()) {
    let gx0 = Infinity;
    let gx1 = -Infinity;
    let ya = Infinity;
    let yb = -Infinity;
    let sum = 0;
    let wsum = 0;
    for (const r of list) {
      gx0 = Math.min(gx0, r.x);
      gx1 = Math.max(gx1, r.x);
      ya = Math.min(ya, r.y0);
      yb = Math.max(yb, r.y1);
      const len = r.y1 - r.y0 + 1;
      sum += (r.x + 0.5) * len;
      wsum += len;
    }
    const len = yb - ya + 1;
    const width = wsum / len;
    // A stroke leans by at most a few degrees after the strip was straightened.
    if (gx1 - gx0 + 1 > maxW + 0.06 * len) continue;
    const x = sum / wsum;
    const xc = Math.min(w - 1, Math.max(0, Math.floor(x)));
    // Follow the ink of the stroke's columns beyond the thin part.
    const inkAt = (yy: number): boolean => {
      if (yy < 0 || yy >= h) return false;
      const o = yy * w;
      return !!(nl[o + xc] || (xc > 0 && nl[o + xc - 1]) || (xc < w - 1 && nl[o + xc + 1]));
    };
    let top = ya;
    for (let gap = 0, yy = ya - 1; yy >= 0 && gap <= 2; yy--) {
      if (inkAt(yy)) { top = yy; gap = 0; } else gap++;
    }
    let bottom = yb;
    for (let gap = 0, yy = yb + 1; yy < h && gap <= 2; yy++) {
      if (inkAt(yy)) { bottom = yy; gap = 0; } else gap++;
    }
    out.push({ x, xa: gx0, xb: gx1, ya, yb, top, bottom, width, barline: false });
  }
  // A stem that passes several heads has several thin stretches: they extend to the same run.
  out.sort((a, b) => a.x - b.x || a.top - b.top);
  const merged: Stroke[] = [];
  for (const st of out) {
    const m = merged.find((q) => Math.abs(q.x - st.x) <= 2.5 && Math.min(q.bottom, st.bottom) - Math.max(q.top, st.top) >= -2);
    if (m) {
      const la = m.yb - m.ya + 1;
      const lb = st.yb - st.ya + 1;
      m.x = (m.x * la + st.x * lb) / (la + lb);
      m.width = (m.width * la + st.width * lb) / (la + lb);
      m.xa = Math.min(m.xa, st.xa);
      m.xb = Math.max(m.xb, st.xb);
      m.ya = Math.min(m.ya, st.ya);
      m.yb = Math.max(m.yb, st.yb);
      m.top = Math.min(m.top, st.top);
      m.bottom = Math.max(m.bottom, st.bottom);
    } else {
      merged.push(st);
    }
  }
  out.length = 0;
  out.push(...merged);
  // Bar lines found by the layout stage.
  for (const st of out) {
    for (const b of strip.input.barlines) {
      if (st.x >= b.x0 - 0.2 * s && st.x <= b.x1 + 0.2 * s && st.ya <= strip.top + 0.6 * s && st.yb >= strip.bottom - 0.6 * s) st.barline = true;
    }
  }
  out.sort((a, b) => a.x - b.x);
  return out;
}
