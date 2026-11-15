/**
 * Glyph classification for the tab reader: a candidate box of the staff strip is resampled to a
 * fixed height and compared, by weighted normalised correlation on grey levels, with every
 * template of compatible width. Correlating grey levels (instead of matching binarised shapes)
 * keeps working when a small digit has been blown up from a few source pixels, and the weights
 * let the staff line that strikes through a digit be ignored pixel by pixel.
 */
import type { GrayImage } from '../image/gray';
import { GLYPH_H, type GlyphTemplate } from './templates';

/** Widest normalised glyph. */
export const GLYPH_MAX_W = 28;

/** A box in strip px; x1 / y1 are exclusive and all four may be fractional. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A candidate glyph resampled to {@link GLYPH_H} rows. */
export interface GlyphPatch {
  /** Width in px. */
  w: number;
  /** Ink 0..1 (1 = black), row-major. */
  ink: Float32Array;
  /** Trust per pixel 0..1 (0 = staff line was here, do not compare); null = all trusted. */
  weight: Float32Array | null;
}

/** How well one class matches a patch. */
export interface ClassScore {
  cls: number;
  label: string;
  /** Best correlation of any template of the class, -1..1. */
  score: number;
  /** Index of that template in the template set used. */
  template: number;
}

/** Cross-section of a bare staff line: its ink (0..1) per strip row, starting at row `y0`. */
export interface LineProfile {
  y0: number;
  ink: Float32Array;
}

/**
 * Measure the cross-section of a staff line near a glyph: for each row within `reach` px of the
 * line, the median ink over the columns xa..xb. Glyphs cover a minority of any stretch of line,
 * so the median is the line alone (and zero where the line is blanked more often than not).
 */
export function lineProfileAt(gray: GrayImage, lineY: number, xa: number, xb: number, reach: number): LineProfile {
  const y0 = Math.max(0, Math.floor(lineY - reach));
  const y1 = Math.min(gray.height, Math.ceil(lineY + reach) + 1);
  const x0 = Math.max(0, Math.floor(xa));
  const x1 = Math.min(gray.width, Math.ceil(xb));
  const ink = new Float32Array(Math.max(0, y1 - y0));
  const hist = new Uint32Array(256);
  const n = x1 - x0;
  if (n <= 0) return { y0, ink };
  for (let y = y0; y < y1; y++) {
    hist.fill(0);
    const o = y * gray.width;
    for (let x = x0; x < x1; x++) hist[gray.data[o + x]]++;
    let acc = 0;
    let med = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc * 2 >= n) {
        med = v;
        break;
      }
    }
    ink[y - y0] = (255 - med) / 255;
  }
  return { y0, ink };
}

/** Rows whose line ink is below this are treated as free of the line. */
const LINE_CLEAR = 0.04;

/**
 * Cut a box out of the strip and resample it (area average) to {@link GLYPH_H} rows; the width
 * keeps the aspect ratio.
 *
 * With `line` (the cross-section of the staff line that strikes through the box) the line is
 * taken out again. Inside the band the line covers, single pixels say little: line and stroke
 * are both dark. What does show is how much MORE ink a column holds across the whole band than
 * the bare line would put there: a stroke that crosses or lies on the line is taller than the
 * line, or darker than its soft edge. That excess, pooled per column over the band, replaces the
 * pixels of the band; its weight follows how much room for excess the line leaves.
 */
export function extractPatch(gray: GrayImage, box: Box, line?: LineProfile | null): GlyphPatch {
  const bw = Math.max(1e-3, box.x1 - box.x0);
  const bh = Math.max(1e-3, box.y1 - box.y0);
  const w = Math.max(2, Math.min(GLYPH_MAX_W, Math.round((bw * GLYPH_H) / bh)));
  const ink = new Float32Array(w * GLYPH_H);
  const sx = bw / w;
  const sy = bh / GLYPH_H;
  const { width: gw, height: gh, data } = gray;
  const weight = line ? new Float32Array(w * GLYPH_H) : null;
  let anyMask = false;
  // Band of the line and the pooled excess per column.
  let bandA = 0;
  let bandB = -1;
  let excess: Float32Array | null = null;
  let bandWeight = 0;
  const ex0 = Math.floor(box.x0);
  if (line) {
    let room = 0;
    for (let k = 0; k < line.ink.length; k++) {
      if (line.ink[k] <= LINE_CLEAR) continue;
      if (bandB < 0) bandA = line.y0 + k;
      bandB = line.y0 + k;
      room += 1 - line.ink[k];
    }
    if (bandB >= bandA) {
      const n = Math.ceil(box.x1) - ex0 + 1;
      excess = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const xx = ex0 + i;
        if (xx < 0 || xx >= gw) continue;
        let e = 0;
        for (let yy = Math.max(0, bandA); yy <= bandB && yy < gh; yy++) {
          const d = (255 - data[yy * gw + xx]) / 255 - line.ink[yy - line.y0];
          if (d > 0) e += d;
        }
        excess[i] = room > 0.2 ? Math.min(1, e / (0.8 * room)) : 0;
      }
      // One pixel of room is little to go on; two or more is as good as it gets.
      bandWeight = Math.max(0, Math.min(0.7, 0.35 * room));
    }
  }
  for (let y = 0; y < GLYPH_H; y++) {
    const ya = box.y0 + y * sy;
    const yb = ya + sy;
    const yi0 = Math.floor(ya);
    const yi1 = Math.ceil(yb);
    for (let x = 0; x < w; x++) {
      const xa = box.x0 + x * sx;
      const xb = xa + sx;
      const xi0 = Math.floor(xa);
      const xi1 = Math.ceil(xb);
      let sum = 0;
      let area = 0;
      let trust = 0;
      for (let yy = yi0; yy < yi1; yy++) {
        const wy = Math.min(yb, yy + 1) - Math.max(ya, yy);
        if (wy <= 0) continue;
        const inY = yy >= 0 && yy < gh;
        const inBand = excess !== null && yy >= bandA && yy <= bandB;
        const t = inBand ? bandWeight : 1;
        for (let xx = xi0; xx < xi1; xx++) {
          const wx = Math.min(xb, xx + 1) - Math.max(xa, xx);
          if (wx <= 0) continue;
          const a = wx * wy;
          area += a;
          if (t <= 0) continue;
          trust += a * t;
          if (!inY || xx < 0 || xx >= gw) continue;
          const v = inBand && excess ? excess[xx - ex0] ?? 0 : (255 - data[yy * gw + xx]) / 255;
          sum += v * a * t;
        }
      }
      ink[y * w + x] = trust > 0 ? sum / trust : 0;
      if (weight) {
        const wv = area > 0 ? trust / area : 1;
        weight[y * w + x] = wv;
        if (wv < 0.999) anyMask = true;
      }
    }
  }
  return { w, ink, weight: anyMask ? weight : null };
}

/** A patch from an ink raster (0..1) that is already tight; used by tests and by template checks. */
export function patchFromInk(px: Float32Array, w: number): GlyphPatch {
  return { w, ink: px, weight: null };
}

/**
 * Weighted normalised correlation of a patch with a template. Both are centred in the wider of
 * the two boxes; the template is then moved by (dx, dy). Outside its own box each is blank paper.
 */
export function correlate(p: GlyphPatch, t: GlyphTemplate, dx = 0, dy = 0): number {
  const H = GLYPH_H;
  const ws = p.w;
  const wt = t.w;
  const W = Math.max(ws, wt);
  const os = (W - ws) >> 1;
  const ot = ((W - wt) >> 1) + dx;
  const c0 = Math.min(os, ot);
  const c1 = Math.max(os + ws, ot + wt);
  const sp = p.ink;
  const wp = p.weight;
  const tp = t.px;
  let sw = 0, ss = 0, st = 0, sss = 0, stt = 0, sst = 0;
  for (let r = 0; r < H; r++) {
    const tr = r - dy;
    const tIn = tr >= 0 && tr < H;
    const so = r * ws - os;
    const to = tr * wt - ot;
    for (let c = c0; c < c1; c++) {
      const inS = c >= os && c < os + ws;
      const s = inS ? sp[so + c] : 0;
      const g = inS && wp ? wp[so + c] : 1;
      if (g <= 0) continue;
      const v = tIn && c >= ot && c < ot + wt ? tp[to + c] : 0;
      sw += g;
      ss += g * s;
      st += g * v;
      sss += g * s * s;
      stt += g * v * v;
      sst += g * s * v;
    }
  }
  if (sw < 8) return 0;
  const cov = sst - (ss * st) / sw;
  const vs = sss - (ss * ss) / sw;
  const vt = stt - (st * st) / sw;
  if (vs <= 1e-9 || vt <= 1e-9) return 0;
  return cov / Math.sqrt(vs * vt);
}

/** Options for {@link classifyPatch}. */
export interface ClassifyOptions {
  /** Only these classes are considered (indexed by class). */
  allow?: (t: GlyphTemplate) => boolean;
  /** Height of the glyph relative to the digits of the staff; templates of another relative height are skipped. */
  relH?: number;
  /** Tolerance on `relH` (default 0.22). */
  relHTolerance?: number;
  /** Skip the search over one-pixel shifts (faster, a little less accurate). */
  coarse?: boolean;
  /**
   * Subtracted from the score of each template (indexed like `templates`): the numbers of one
   * staff are set in one face, so once the staff's face is known, look-alikes from other faces
   * (a dotted zero for an 8, say) count for less.
   */
  penalty?: Float32Array | null;
}

/**
 * Rank the classes for a patch: best correlation per class, best first. Templates whose width is
 * far from the patch's are skipped (a 1 is never as wide as a 0), then the leading templates are
 * re-scored over one-pixel shifts to absorb errors of the box.
 */
export function classifyPatch(p: GlyphPatch, templates: GlyphTemplate[], opts: ClassifyOptions = {}): ClassScore[] {
  const tol = Math.max(3, 0.42 * p.w);
  const relTol = opts.relHTolerance ?? 0.22;
  const pen = opts.penalty ?? null;
  const first: { i: number; score: number }[] = [];
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    if (Math.abs(t.w - p.w) > tol) continue;
    if (opts.allow && !opts.allow(t)) continue;
    if (opts.relH !== undefined && Math.abs(t.relH - opts.relH) > relTol) continue;
    first.push({ i, score: correlate(p, t) - (pen ? pen[i] : 0) });
  }
  first.sort((a, b) => b.score - a.score);
  const best = new Map<number, ClassScore>();
  const perClass = new Map<number, number>();
  const put = (i: number, score: number): void => {
    const t = templates[i];
    const cur = best.get(t.cls);
    if (!cur || score > cur.score) best.set(t.cls, { cls: t.cls, label: t.label, score, template: i });
  };
  for (const f of first) put(f.i, f.score);
  if (!opts.coarse) {
    // Refine: a few templates of each of the leading classes, over the eight neighbouring shifts.
    const lead = [...best.values()].sort((a, b) => b.score - a.score).slice(0, 5).map((c) => c.cls);
    for (const f of first) {
      const t = templates[f.i];
      if (!lead.includes(t.cls)) continue;
      const n = perClass.get(t.cls) ?? 0;
      if (n >= 4) continue;
      perClass.set(t.cls, n + 1);
      let s = f.score;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const v = correlate(p, t, dx, dy) - (pen ? pen[f.i] : 0);
          if (v > s) s = v;
        }
      }
      put(f.i, s);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * Correlation of a patch with several templates laid side by side: the test for "this blob is
 * two touching digits". Each part names a template and the columns [c0, c1) of the patch it is
 * meant to explain; the template is centred there (and tried one pixel left and right). Scoring
 * the pair against the whole blob makes the result comparable with the blob read as one glyph.
 */
export function correlateComposite(p: GlyphPatch, parts: { t: GlyphTemplate; c0: number; c1: number }[]): number {
  const H = GLYPH_H;
  const w = p.w;
  const canvas = new Float32Array(w * H);
  const shifts = parts.length <= 2 ? [-1, 0, 1] : [0];
  let best = -1;
  const paste = (k: number, chosen: number[]): void => {
    if (k === parts.length) {
      canvas.fill(0);
      parts.forEach((part, i) => {
        const t = part.t;
        const off = Math.round(part.c0 + (part.c1 - part.c0 - t.w) / 2) + chosen[i];
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < t.w; x++) {
            const cx = off + x;
            if (cx < 0 || cx >= w) continue;
            const v = t.px[y * t.w + x];
            if (v > canvas[y * w + cx]) canvas[y * w + cx] = v;
          }
        }
      });
      const s = correlate(p, { cls: -1, label: '', family: 0, weight: 0, w, relH: 1, relY: 0, px: canvas, faces: [] });
      if (s > best) best = s;
      return;
    }
    for (const d of shifts) paste(k + 1, [...chosen, d]);
  };
  paste(0, []);
  return best;
}
