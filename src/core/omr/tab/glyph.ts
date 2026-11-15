/**
 * Glyph classification for the tab reader: a candidate box of the staff strip is cut by the
 * same rule as the templates (half-maximum outline), resampled to a fixed height and compared,
 * by normalised correlation on grey levels, with every template of compatible width.
 *
 * Correlating grey levels (instead of matching binarised shapes) keeps working when a small digit
 * has been blown up from a few source pixels. A staff line that strikes through a glyph is taken
 * out of the picture first, and the glyph is then compared with templates struck the same way.
 */
import type { GrayImage } from '../image/gray';
import { GLYPH_H, type GlyphTemplate, halfMaxBox, sumsOf } from './templates';

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
  /** Sum of the ink and of its squares (kept so that a correlation is one dot product). */
  s1: number;
  s2: number;
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

/** Where a staff line runs through a box, in the rows of a normalised glyph: centre and thickness (0 = no line). */
export function lineInBox(line: LineProfile, box: Box): { centre: number; thickness: number } {
  let a = 0;
  let m = 0;
  for (let k = 0; k < line.ink.length; k++) {
    a += line.ink[k];
    m += line.ink[k] * (line.y0 + k + 0.5);
  }
  if (a < 0.3) return { centre: 0, thickness: 0 };
  const scale = GLYPH_H / Math.max(1e-3, box.y1 - box.y0);
  // Blur spreads a line but keeps its total ink, so the sum of the profile is the thickness of the sharp line.
  return { centre: (m / a - box.y0) * scale, thickness: a * scale };
}

/**
 * Bring a box found on the binarised strip to the outline the templates are cut by: the
 * half-maximum contour of the glyph's own ink (see `halfMaxBox`), with sub-pixel edges. A
 * threshold picks up a fringe of faint pixels around a glyph, more of it the softer the picture;
 * left in, it would shrink the glyph inside its box by up to a tenth. Each side may move in by at
 * most `limit` px and out by one. With `line`, the bare line is subtracted first and the rows it
 * covers do not count towards the width.
 */
export function refineBox(gray: GrayImage, box: Box, line?: LineProfile | null, limit = 3.5): Box {
  const xa = Math.max(0, Math.floor(box.x0) - 1);
  const ya = Math.max(0, Math.floor(box.y0) - 1);
  const xb = Math.min(gray.width, Math.ceil(box.x1) + 1);
  const yb = Math.min(gray.height, Math.ceil(box.y1) + 1);
  const w = xb - xa;
  const h = yb - ya;
  if (w < 2 || h < 2) return box;
  const px = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let p = 0;
    if (line) {
      const k = ya + y - line.y0;
      if (k >= 0 && k < line.ink.length) p = line.ink[k];
    }
    const o = (ya + y) * gray.width + xa;
    for (let x = 0; x < w; x++) {
      const v = (255 - gray.data[o + x]) / 255 - p;
      px[y * w + x] = v > 0 ? v : 0;
    }
  }
  const covered = line ? (y: number): boolean => {
    const k = ya + y - line.y0;
    return k >= 0 && k < line.ink.length && line.ink[k] > 0.08;
  } : undefined;
  const b = halfMaxBox(px, w, h, covered);
  if (!b) return box;
  const clamp = (v: number, ref: number, inward: number): number => (inward > 0 ? Math.max(ref - 1, Math.min(ref + limit, v)) : Math.min(ref + 1, Math.max(ref - limit, v)));
  const out = { x0: clamp(xa + b.x0, box.x0, 1), y0: clamp(ya + b.y0, box.y0, 1), x1: clamp(xa + b.x1, box.x1, -1), y1: clamp(ya + b.y1, box.y1, -1) };
  return out.x1 - out.x0 >= 1.5 && out.y1 - out.y0 >= 3 ? out : box;
}

/**
 * Cut a box out of the strip and resample it (area average) to {@link GLYPH_H} rows; the width
 * keeps the aspect ratio.
 *
 * With `line` (the cross-section of the staff line that strikes through the box) the bare line
 * is subtracted row by row, leaving what the glyph adds to it. Strokes hidden inside the line
 * add nothing and vanish with it, which is why such a patch is compared with templates that had
 * the same rows erased before they were blurred (`struckTemplates`), not with whole glyphs.
 */
export function extractPatch(gray: GrayImage, box: Box, line?: LineProfile | null): GlyphPatch {
  const bw = Math.max(1e-3, box.x1 - box.x0);
  const bh = Math.max(1e-3, box.y1 - box.y0);
  const w = Math.max(2, Math.min(GLYPH_MAX_W, Math.round((bw * GLYPH_H) / bh)));
  const ink = new Float32Array(w * GLYPH_H);
  const sx = bw / w;
  const sy = bh / GLYPH_H;
  const { width: gw, height: gh, data } = gray;
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
      for (let yy = yi0; yy < yi1; yy++) {
        const wy = Math.min(yb, yy + 1) - Math.max(ya, yy);
        if (wy <= 0) continue;
        const inY = yy >= 0 && yy < gh;
        let p = 0;
        if (line) {
          const k = yy - line.y0;
          if (k >= 0 && k < line.ink.length) p = line.ink[k];
        }
        for (let xx = xi0; xx < xi1; xx++) {
          const wx = Math.min(xb, xx + 1) - Math.max(xa, xx);
          if (wx <= 0) continue;
          const a = wx * wy;
          area += a;
          if (!inY || xx < 0 || xx >= gw) continue;
          const v = (255 - data[yy * gw + xx]) / 255 - p;
          if (v > 0) sum += v * a;
        }
      }
      ink[y * w + x] = area > 0 ? sum / area : 0;
    }
  }
  return patchFromInk(ink, w);
}

/** A patch from a tight ink raster (0..1) of {@link GLYPH_H} rows. */
export function patchFromInk(px: Float32Array, w: number): GlyphPatch {
  const s = sumsOf(px);
  return { w, ink: px, s1: s.s1, s2: s.s2 };
}

/**
 * Normalised correlation of a patch with a template. Both are centred in the wider of the two
 * boxes, the template is then moved by (dx, dy), and the two are compared over the canvas that
 * holds both whole (blank paper where either has nothing). With the sums of each kept beside its
 * pixels this is one dot product over the overlap.
 */
export function correlate(p: GlyphPatch, t: GlyphTemplate, dx = 0, dy = 0): number {
  const H = GLYPH_H;
  const ws = p.w;
  const wt = t.w;
  const W = ws > wt ? ws : wt;
  const os = (W - ws) >> 1;
  const ot = ((W - wt) >> 1) + dx;
  const c0 = os < ot ? os : ot;
  const c1 = os + ws > ot + wt ? os + ws : ot + wt;
  const n = (c1 - c0) * (H + (dy < 0 ? -dy : dy));
  const xa = os > ot ? os : ot;
  const xb = os + ws < ot + wt ? os + ws : ot + wt;
  const sp = p.ink;
  const tp = t.px;
  let dot = 0;
  const ra = dy > 0 ? dy : 0;
  const rb = dy < 0 ? H + dy : H;
  for (let r = ra; r < rb; r++) {
    const so = r * ws - os;
    const to = (r - dy) * wt - ot;
    for (let c = xa; c < xb; c++) dot += sp[so + c] * tp[to + c];
  }
  const vs = p.s2 - (p.s1 * p.s1) / n;
  const vt = t.s2 - (t.s1 * t.s1) / n;
  if (vs <= 1e-9 || vt <= 1e-9) return 0;
  return (dot - (p.s1 * t.s1) / n) / Math.sqrt(vs * vt);
}

/** Options for {@link classifyPatch}. */
export interface ClassifyOptions {
  /** Only templates passing this test are considered. */
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

/** Score lost per unit of mismatch between the relative height of a glyph and of a template. */
const RELH_WEIGHT = 0.35;

/** Templates narrower or wider than the patch by more than this are not compared. */
export function widthTolerance(patchWidth: number): number {
  return Math.max(3, 0.42 * patchWidth);
}

/**
 * Rank the classes for a patch: best correlation per class, best first. Templates whose width is
 * far from the patch's are skipped (a 1 is never as wide as a 0), then the leading templates are
 * re-scored over one-pixel shifts to absorb errors of the box.
 */
export function classifyPatch(p: GlyphPatch, templates: GlyphTemplate[], opts: ClassifyOptions = {}): ClassScore[] {
  const tol = widthTolerance(p.w);
  const relTol = opts.relHTolerance ?? 0.22;
  const pen = opts.penalty ?? null;
  const offsets = new Float32Array(templates.length);
  const first: { i: number; score: number }[] = [];
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    if (Math.abs(t.w - p.w) > tol) continue;
    if (opts.allow && !opts.allow(t)) continue;
    let off = 0;
    if (opts.relH !== undefined) {
      const d = Math.abs(t.relH - opts.relH);
      if (d > relTol) continue;
      // Within the tolerance a glyph of the wrong size is still the less likely reading: a
      // bracket is a quarter taller than a digit, an x a quarter shorter.
      off = RELH_WEIGHT * Math.max(0, d - 0.06);
    }
    offsets[i] = off + (pen ? pen[i] : 0);
    first.push({ i, score: correlate(p, t) - offsets[i] });
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
      const k = perClass.get(t.cls) ?? 0;
      if (k >= 4) continue;
      perClass.set(t.cls, k + 1);
      let s = f.score;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const v = correlate(p, t, dx, dy) - offsets[f.i];
          if (v > s) s = v;
        }
      }
      put(f.i, s);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** A raster wrapped as a template so that it can be correlated. */
function asTemplate(px: Float32Array, w: number): GlyphTemplate {
  const s = sumsOf(px);
  return { cls: -1, label: '', family: 0, weight: 0, music: false, w, relH: 1, relY: 0, px, faces: [], s1: s.s1, s2: s.s2 };
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
      const s = correlate(p, asTemplate(canvas, w));
      if (s > best) best = s;
      return;
    }
    for (const d of shifts) paste(k + 1, [...chosen, d]);
  };
  paste(0, []);
  return best;
}

/** A raster of `w` columns placed on a canvas `W` px wide (centred, moved by dx / dy). */
function place(px: Float32Array, w: number, W: number, dx: number, dy: number): Float32Array {
  const out = new Float32Array(W * GLYPH_H);
  const off = ((W - w) >> 1) + dx;
  for (let y = 0; y < GLYPH_H; y++) {
    const ty = y - dy;
    if (ty < 0 || ty >= GLYPH_H) continue;
    for (let x = 0; x < w; x++) {
      const cx = off + x;
      if (cx >= 0 && cx < W) out[y * W + cx] = px[ty * w + x];
    }
  }
  return out;
}

/** Best shift of a template against a patch within one pixel, by plain correlation. */
function bestShift(p: GlyphPatch, t: GlyphTemplate): { dx: number; dy: number } {
  let best = -2;
  let at = { dx: 0, dy: 0 };
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const s = correlate(p, t, dx, dy);
      if (s > best) {
        best = s;
        at = { dx, dy };
      }
    }
  }
  return at;
}

/**
 * Which of two templates of ONE face does a patch resemble more? Both are compared with the
 * patch under weights that grow with the difference between the two templates, so the verdict
 * rests on the pixels that tell the two glyphs apart (the gap of a 6 against the closed 0, the
 * waist of an 8) instead of on the many they share. Positive: `a` fits better; the size is the
 * difference of the two weighted correlations.
 */
export function discriminate(p: GlyphPatch, a: GlyphTemplate, b: GlyphTemplate): number {
  const W = Math.max(p.w, a.w, b.w);
  const sa = bestShift(p, a);
  const sb = bestShift(p, b);
  const ca = place(a.px, a.w, W, sa.dx, sa.dy);
  const cb = place(b.px, b.w, W, sb.dx, sb.dy);
  const cs = place(p.ink, p.w, W, 0, 0);
  const n = W * GLYPH_H;
  let sw = 0, ss = 0, s1 = 0, s2 = 0, sss = 0, s11 = 0, s22 = 0, ss1 = 0, ss2 = 0;
  for (let i = 0; i < n; i++) {
    const g = 0.08 + Math.abs(ca[i] - cb[i]);
    const v = cs[i];
    sw += g; ss += g * v; s1 += g * ca[i]; s2 += g * cb[i];
    sss += g * v * v; s11 += g * ca[i] * ca[i]; s22 += g * cb[i] * cb[i];
    ss1 += g * v * ca[i]; ss2 += g * v * cb[i];
  }
  const vs = sss - (ss * ss) / sw;
  const v1 = s11 - (s1 * s1) / sw;
  const v2 = s22 - (s2 * s2) / sw;
  if (vs <= 1e-9 || v1 <= 1e-9 || v2 <= 1e-9) return 0;
  return (ss1 - (ss * s1) / sw) / Math.sqrt(vs * v1) - (ss2 - (ss * s2) / sw) / Math.sqrt(vs * v2);
}

/**
 * A patch from a binary image (1 = ink), for big glyphs that several staff lines cross (time
 * signature numerals, rests): there the line-free binary strip is the cleanest picture.
 */
export function patchFromBinary(bin: { width: number; height: number; data: Uint8Array }, box: Box): GlyphPatch {
  const bw = Math.max(1, box.x1 - box.x0);
  const bh = Math.max(1, box.y1 - box.y0);
  const w = Math.max(2, Math.min(GLYPH_MAX_W, Math.round((bw * GLYPH_H) / bh)));
  const ink = new Float32Array(w * GLYPH_H);
  const sx = bw / w;
  const sy = bh / GLYPH_H;
  for (let y = 0; y < GLYPH_H; y++) {
    const ya = box.y0 + y * sy;
    const yb = ya + sy;
    for (let x = 0; x < w; x++) {
      const xa = box.x0 + x * sx;
      const xb = xa + sx;
      let sum = 0;
      let area = 0;
      for (let yy = Math.floor(ya); yy < Math.ceil(yb); yy++) {
        const wy = Math.min(yb, yy + 1) - Math.max(ya, yy);
        if (wy <= 0) continue;
        for (let xx = Math.floor(xa); xx < Math.ceil(xb); xx++) {
          const wx = Math.min(xb, xx + 1) - Math.max(xa, xx);
          if (wx <= 0) continue;
          area += wx * wy;
          if (yy >= 0 && yy < bin.height && xx >= 0 && xx < bin.width && bin.data[yy * bin.width + xx]) sum += wx * wy;
        }
      }
      ink[y * w + x] = area > 0 ? sum / area : 0;
    }
  }
  return patchFromInk(ink, w);
}
