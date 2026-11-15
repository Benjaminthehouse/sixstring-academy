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
  /** Runs exactly from the top staff line to the bottom one: possibly a bar line nobody reported. */
  staffSpan?: boolean;
}

/** Options for {@link findStrokes}. */
export interface StrokeOptions {
  /** Widest horizontal run that still counts as thin, in staff spaces. Default 0.55 (half a note head). */
  maxWidth?: number;
  /** Shortest thin run kept, in staff spaces. Default 1.1. */
  minLength?: number;
}

/** Find the thin vertical strokes between columns `xFrom` and `xTo`. */
export function findStrokes(strip: Strip, xFrom: number, xTo: number, opts: StrokeOptions = {}): Stroke[] {
  const { w, h, nl, s } = strip;
  const maxW = Math.max(3, Math.round((opts.maxWidth ?? 0.55) * s));
  // A soft stem swells where it crosses a staff line; bridge those few rows.
  const maxGap = Math.max(2, Math.round(0.2 * s));
  const bandGap = Math.ceil(strip.thick + 4);
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
  // Long vertical runs of thin pixels, per column (small gaps are bridged).
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
      let band = 0;
      while (yy < h && gap <= maxGap && band <= bandGap) {
        if (thin[yy * w + x]) {
          y1 = yy;
          gap = 0;
          band = 0;
        } else if (strip.rowWeight[yy] < 1) {
          // Where a faint stem crosses a staff line it is often erased with the line: that gap is free.
          band++;
        } else {
          gap++;
        }
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
    // A soft stem may swell to half a space in places, but not along its whole length: the wall
    // of a stack of whole notes is that thick everywhere.
    if (width > 0.42 * s) continue;
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
    // (A stem that a perspective correction left slightly slanted comes in pieces a little apart
    // sideways, one continuing the other.)
    const continues = (q: Stroke): boolean => {
      const overlap = Math.min(q.yb, st.yb) - Math.max(q.ya, st.ya);
      return Math.abs(q.x - st.x) <= 0.18 * s && overlap <= 0.3 * Math.min(q.yb - q.ya, st.yb - st.ya) && overlap >= -s;
    };
    const m = merged.find((q) => (Math.abs(q.x - st.x) <= 2.5 && Math.min(q.bottom, st.bottom) - Math.max(q.top, st.top) >= -2) || continues(q));
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
  // Bar lines found by the layout stage; a stroke that runs exactly from the top line to the bottom
  // line may be one the layout stage missed (a stem rarely ends on both outer lines).
  for (const st of out) {
    for (const b of strip.input.barlines) {
      if (st.x >= b.x0 - 0.2 * s && st.x <= b.x1 + 0.2 * s && st.ya <= strip.top + 0.6 * s && st.yb >= strip.bottom - 0.6 * s) st.barline = true;
    }
    if (Math.abs(st.top - strip.top) <= 0.3 * s && Math.abs(st.bottom - strip.bottom) <= 0.3 * s) st.staffSpan = true;
  }
  out.sort((a, b) => a.x - b.x);
  return out;
}

/**
 * Look for the stem of a note head directly in the grey image: a dark vertical ridge leaving the
 * head at its right edge upwards or at its left edge downwards. Used for heads whose stem did not
 * survive binarisation (blurred or low-contrast captures). Returns a stroke, or null.
 */
export function stemFromHead(strip: Strip, hx: number, hy: number, hw: number): Stroke | null {
  const { w, h, ink, s, rowWeight } = strip;
  // Darkness of the head itself is the yardstick: a blurred stem keeps a fraction of it.
  let ref = 0;
  let n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = Math.round(hx) + dx;
      const y = Math.round(hy) + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) { ref += ink[y * w + x]; n++; }
    }
  }
  ref = n ? ref / n : 0;
  if (ref < 60) return null;
  let best: { frac: number; x: number; dir: 1 | -1; tip: number } | null = null;
  for (const dir of [-1, 1] as const) {
    // dir -1: stem up from the right edge; dir +1: stem down from the left edge.
    const xs = dir < 0 ? hx + hw / 2 - 1.5 : hx - hw / 2 + 1.5;
    for (let dx = -4; dx <= 4; dx++) {
      const x = Math.round(xs + dx);
      if (x < 10 || x >= w - 10) continue;
      const rowOk = (y: number): boolean | null => {
        if (y < 0 || y >= h) return false;
        // On or right next to a staff line (a blurred line is wider than its band): no evidence either way.
        if (rowWeight[y] < 1 || rowWeight[Math.max(0, y - 2)] < 1 || rowWeight[Math.min(h - 1, y + 2)] < 1) return null;
        const o = y * w;
        const centre = Math.max(ink[o + x - 1], ink[o + x], ink[o + x + 1]);
        const left = Math.min(ink[o + x - 7], ink[o + x - 8], ink[o + x - 9]);
        const right = Math.min(ink[o + x + 7], ink[o + x + 8], ink[o + x + 9]);
        return centre >= 0.22 * ref && centre - Math.max(left, right) >= 0.12 * ref;
      };
      let ok = 0;
      let seen = 0;
      for (let d = Math.round(0.6 * s); d <= Math.round(2.6 * s); d++) {
        const r = rowOk(Math.round(hy) + dir * d);
        if (r === null) continue;
        seen++;
        if (r) ok++;
      }
      if (seen < 0.6 * s) continue;
      const frac = ok / seen;
      if (best && frac <= best.frac) continue;
      // Follow the ridge to its end.
      let tip = Math.round(hy) + dir * Math.round(2.6 * s);
      for (let d = Math.round(2.6 * s) + 1, miss = 0; d <= Math.round(6 * s) && miss <= 3; d++) {
        const r = rowOk(Math.round(hy) + dir * d);
        if (r === null) continue;
        if (r) { tip = Math.round(hy) + dir * d; miss = 0; } else miss++;
      }
      best = { frac, x, dir, tip };
    }
  }
  if (!best || best.frac < 0.72) return null;
  const top = Math.max(0, Math.min(best.tip, Math.round(hy)));
  const bottom = Math.min(h - 1, Math.max(best.tip, Math.round(hy)));
  return { x: best.x + 0.5, xa: best.x - 1, xb: best.x + 1, ya: top, yb: bottom, top, bottom, width: 3, barline: false };
}
