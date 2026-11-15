/**
 * Segmentation for the tab reader: from the line-free strip to candidate glyph boxes sitting on
 * string lines, and the pure geometry used to cut touching digits apart and to group digits into
 * numbers and numbers into columns (chords).
 */
import type { Components } from '../image/cc';
import type { BinaryImage, GrayImage } from '../image/gray';
import type { Box } from './glyph';

/** The part of a staff strip the segmentation needs (a `StaffInput` satisfies it). */
export interface StripGeometry {
  space: number;
  lineThickness: number;
  lineYs: number[];
  x0: number;
  x1: number;
  barlines: { x: number; x0: number; x1: number }[];
}

/** Ink on a string line: a glyph, a piece of one, or several touching ones. */
export interface LineBlob {
  /** Tight box (integers; x1 / y1 exclusive). */
  box: Box;
  /** Index of the string line it sits on (0 = top). */
  line: number;
  /** Vertical centre minus the line, in staff spaces (+ = below the line). */
  offset: number;
  /** Ink pixels. */
  area: number;
  /**
   * The ink is joined to the staff line in the picture (the line strikes through the glyph, or
   * blur closed the gap around it). False: the glyph stands free and is complete as it is.
   */
  fused: boolean;
}

/** Index of the line nearest to y, and the signed distance from it in spaces. */
export function nearestLine(g: Pick<StripGeometry, 'lineYs' | 'space'>, y: number): { line: number; offset: number } {
  let line = Math.round((y - g.lineYs[0]) / g.space);
  if (line < 0) line = 0;
  if (line > g.lineYs.length - 1) line = g.lineYs.length - 1;
  return { line, offset: (y - g.lineYs[line]) / g.space };
}

/** True when [x0, x1) comes within `slack` px of a bar line's ink. */
export function nearBarline(g: Pick<StripGeometry, 'barlines'>, x0: number, x1: number, slack: number): boolean {
  for (const b of g.barlines) if (x1 > b.x0 - slack && x0 < b.x1 + slack) return true;
  return false;
}

/** Tallest and widest a piece of a fret number can be, in staff spaces. */
const MAX_GLYPH_H = 1.4;
const MAX_GLYPH_W = 3.2;

/**
 * Collect the ink that sits on the string lines and could be (part of) a fret number.
 *
 * Two sources, because engravers print numbers in two ways. Where the staff line is blanked
 * behind a number, the number is a small free-standing component of the strip `withLines` and is
 * taken whole from there: nothing has been cut out of it. Where the line strikes through the
 * number (or blur has closed the gap), the number hangs on the line and only the line-free image
 * `noLines` separates it; such pieces are marked `fused`, and pieces stacked on one line (the two
 * halves of a digit whose middle stroke went with the line) are joined again.
 *
 * `dy` is the row of the strip that row 0 of the two component images corresponds to.
 */
export function findLineBlobs(noLines: Components, g: StripGeometry, withLines?: Components | null, dy = 0): LineBlob[] {
  const sp = g.space;
  const n = g.lineYs.length;
  const minArea = Math.max(4, 0.012 * sp * sp);
  const maxH = MAX_GLYPH_H * sp;
  const maxW = MAX_GLYPH_W * sp;
  const perLine: LineBlob[][] = Array.from({ length: n }, () => []);
  const take = (cc: Components, c: number, fused: boolean): void => {
    if (cc.area[c] < minArea) return;
    const h = cc.y1[c] - cc.y0[c] + 1;
    const w = cc.x1[c] - cc.x0[c] + 1;
    if (h > maxH || w > maxW) return;
    const y0 = cc.y0[c] + dy;
    const y1 = cc.y1[c] + 1 + dy;
    const cy = (y0 + y1) / 2;
    if (cy < g.lineYs[0] - 0.62 * sp || cy > g.lineYs[n - 1] + 0.62 * sp) return;
    const { line, offset } = nearestLine(g, cy);
    if (Math.abs(offset) > 0.45) return;
    // A piece must reach the neighbourhood of its line: the two halves of a cut digit both do,
    // a repeat dot in the middle of a space does not.
    const ly = g.lineYs[line];
    const reach = g.lineThickness / 2 + 0.16 * sp;
    if (y0 > ly + reach || y1 < ly - reach) return;
    // A short stretch of the staff line left standing between two blanked numbers is not a glyph.
    if (h <= g.lineThickness + 2.5 && w >= 1.5 * h && Math.abs(cy - ly) <= 2) return;
    perLine[line].push({ box: { x0: cc.x0[c], y0, x1: cc.x1[c] + 1, y1 }, line, offset, area: cc.area[c], fused });
  };
  // Free-standing components of the picture with its lines: small ones that do not touch the crop's edge.
  const free = withLines ? new Uint8Array(withLines.count + 1) : null;
  if (withLines && free) {
    for (let c = 1; c <= withLines.count; c++) {
      const h = withLines.y1[c] - withLines.y0[c] + 1;
      const w = withLines.x1[c] - withLines.x0[c] + 1;
      if (h > maxH || w > maxW || withLines.y0[c] === 0 || withLines.y1[c] === withLines.height - 1) continue;
      free[c] = 1;
      take(withLines, c, false);
    }
  }
  for (let c = 1; c <= noLines.count; c++) {
    if (withLines && free) {
      // Which component of the full picture does this piece belong to? Look at one of its pixels.
      const row = noLines.y0[c] * noLines.width;
      let x = noLines.x0[c];
      while (x <= noLines.x1[c] && noLines.labels[row + x] !== c) x++;
      if (free[withLines.labels[row + x]]) continue;
    }
    take(noLines, c, true);
  }
  const out: LineBlob[] = [];
  for (let l = 0; l < n; l++) {
    const parts = perLine[l].sort((a, b) => a.box.x0 - b.box.x0);
    const merged: LineBlob[] = [];
    for (const p of parts) {
      let host: LineBlob | null = null;
      for (let k = merged.length - 1; k >= 0 && k >= merged.length - 4; k--) {
        const m = merged[k];
        const overlap = Math.min(m.box.x1, p.box.x1) - Math.max(m.box.x0, p.box.x0);
        const narrow = Math.min(m.box.x1 - m.box.x0, p.box.x1 - p.box.x0);
        const unionH = Math.max(m.box.y1, p.box.y1) - Math.min(m.box.y0, p.box.y0);
        if (overlap >= 0.4 * narrow && unionH <= maxH) {
          host = m;
          break;
        }
      }
      if (!host) {
        merged.push({ ...p, box: { ...p.box } });
        continue;
      }
      host.box.x0 = Math.min(host.box.x0, p.box.x0);
      host.box.y0 = Math.min(host.box.y0, p.box.y0);
      host.box.x1 = Math.max(host.box.x1, p.box.x1);
      host.box.y1 = Math.max(host.box.y1, p.box.y1);
      host.area += p.area;
      host.fused = host.fused || p.fused;
    }
    merged.sort((a, b) => a.box.x0 - b.box.x0);
    for (const m of merged) {
      m.offset = ((m.box.y0 + m.box.y1) / 2 - g.lineYs[l]) / sp;
      out.push(m);
    }
  }
  return out;
}

/**
 * Typical height of a fret digit on this staff, in strip px: the median height of the blobs that
 * are centred on a line and digit-sized. All numbers of a staff are set in one size, so this one
 * value scales every later test. Falls back to 0.8 space when the staff is nearly empty.
 */
export function estimateDigitHeight(blobs: LineBlob[], g: StripGeometry): number {
  const sp = g.space;
  const hs: number[] = [];
  for (const b of blobs) {
    const h = b.box.y1 - b.box.y0;
    const w = b.box.x1 - b.box.x0;
    if (Math.abs(b.offset) > 0.2 || h < 0.5 * sp || h > 1.25 * sp || w > 1.9 * sp || w < 0.12 * sp) continue;
    if (nearBarline(g, b.box.x0, b.box.x1, 1)) continue;
    hs.push(h);
  }
  if (hs.length < 3) return hs.length ? hs.sort((a, b) => a - b)[hs.length >> 1] : 0.8 * sp;
  hs.sort((a, b) => a - b);
  return hs[hs.length >> 1];
}

/**
 * Ink per column of a box of the grey strip (0..1 per pixel, summed over the rows). With `skip`,
 * the rows within `band` px of a staff line are left out, so that a line running through two
 * digits does not hide the valley between them.
 */
export function columnProfile(gray: GrayImage, box: Box, skip?: { lineY: number; band: number } | null): Float32Array {
  const x0 = Math.max(0, Math.floor(box.x0));
  const x1 = Math.min(gray.width, Math.ceil(box.x1));
  const y0 = Math.max(0, Math.floor(box.y0));
  const y1 = Math.min(gray.height, Math.ceil(box.y1));
  const out = new Float32Array(Math.max(0, x1 - x0));
  for (let y = y0; y < y1; y++) {
    if (skip && Math.abs(y + 0.5 - skip.lineY) <= skip.band) continue;
    const o = y * gray.width;
    for (let x = x0; x < x1; x++) out[x - x0] += (255 - gray.data[o + x]) / 255;
  }
  return out;
}

/**
 * Candidate cut columns of a profile: its local minima at least `margin` px from either end,
 * deepest first (at most `count`). A cut at index i separates columns [0, i) from [i, n).
 */
export function profileValleys(profile: Float32Array, margin: number, count = 3): number[] {
  const n = profile.length;
  const lo = Math.max(1, Math.ceil(margin));
  const hi = Math.min(n - 1, Math.floor(n - margin));
  const cands: { i: number; v: number }[] = [];
  for (let i = lo; i <= hi; i++) {
    // Value of a cut between columns i - 1 and i: the lighter the two columns, the better.
    const v = Math.min(profile[i - 1], profile[i]);
    const left = i - 2 >= 0 ? Math.min(profile[i - 2], profile[i - 1]) : Infinity;
    const right = i + 1 < n ? Math.min(profile[i], profile[i + 1]) : Infinity;
    if (v <= left && v <= right) cands.push({ i: profile[i - 1] <= profile[i] ? i - 1 : i, v });
  }
  cands.sort((a, b) => a.v - b.v);
  const out: number[] = [];
  for (const c of cands) {
    if (c.i < lo || c.i > hi) continue;
    if (out.some((o) => Math.abs(o - c.i) < 2)) continue;
    out.push(c.i);
    if (out.length >= count) break;
  }
  return out;
}

/** Shrink a box to the ink of a binary image inside it (null when there is none). */
export function tightBox(bin: BinaryImage, box: Box): Box | null {
  const xa = Math.max(0, Math.floor(box.x0));
  const xb = Math.min(bin.width, Math.ceil(box.x1));
  const ya = Math.max(0, Math.floor(box.y0));
  const yb = Math.min(bin.height, Math.ceil(box.y1));
  let x0 = xb, x1 = xa - 1, y0 = yb, y1 = ya - 1;
  for (let y = ya; y < yb; y++) {
    const o = y * bin.width;
    for (let x = xa; x < xb; x++) {
      if (!bin.data[o + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < x0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * Horizontal extent of the ink of a box that lies off the staff line (rows farther than `band`
 * px from `lineY`). Leftovers of the line stick out of a glyph only inside that band, so this is
 * the glyph's true width whenever it differs from the box.
 */
export function offLineExtent(bin: BinaryImage, box: Box, lineY: number, band: number): { x0: number; x1: number } | null {
  const xa = Math.max(0, Math.floor(box.x0));
  const xb = Math.min(bin.width, Math.ceil(box.x1));
  const ya = Math.max(0, Math.floor(box.y0));
  const yb = Math.min(bin.height, Math.ceil(box.y1));
  let x0 = xb;
  let x1 = xa - 1;
  for (let y = ya; y < yb; y++) {
    if (Math.abs(y + 0.5 - lineY) <= band) continue;
    const o = y * bin.width;
    for (let x = xa; x < xb; x++) {
      if (!bin.data[o + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  }
  return x1 < x0 ? null : { x0, x1: x1 + 1 };
}

/** Something with a horizontal extent on one string line. */
export interface Span {
  x0: number;
  x1: number;
}

/**
 * Group glyphs of one line (sorted by x) into numbers: neighbours closer than `maxGap` px belong
 * to the same number. Returns index groups.
 */
export function groupAdjacent(spans: Span[], maxGap: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < spans.length; i++) {
    const last = out[out.length - 1];
    if (last && spans[i].x0 - spans[last[last.length - 1]].x1 <= maxGap) last.push(i);
    else out.push([i]);
  }
  return out;
}

/**
 * Group numbers into columns (events): two numbers on different lines sound together when they
 * are printed above one another, i.e. their centres are closer than `tolerance` px or one covers
 * most of the other. `items` need not be sorted; the result is ordered left to right.
 */
export function groupColumns<T extends Span & { line: number }>(items: T[], tolerance: number): T[][] {
  const order = items.slice().sort((a, b) => (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2);
  const cols: { items: T[]; cx: number }[] = [];
  for (const it of order) {
    const cx = (it.x0 + it.x1) / 2;
    let host: { items: T[]; cx: number } | null = null;
    for (let k = cols.length - 1; k >= 0 && k >= cols.length - 3; k--) {
      const c = cols[k];
      if (c.items.some((o) => o.line === it.line)) continue;
      const covers = c.items.some((o) => {
        const overlap = Math.min(o.x1, it.x1) - Math.max(o.x0, it.x0);
        return overlap >= 0.6 * Math.min(o.x1 - o.x0, it.x1 - it.x0);
      });
      if (Math.abs(c.cx - cx) <= tolerance || covers) {
        host = c;
        break;
      }
    }
    if (host) {
      host.items.push(it);
      host.cx = host.items.reduce((a, o) => a + (o.x0 + o.x1) / 2, 0) / host.items.length;
    } else {
      cols.push({ items: [it], cx });
    }
  }
  cols.sort((a, b) => a.cx - b.cx);
  return cols.map((c) => c.items.sort((a, b) => a.line - b.line));
}
