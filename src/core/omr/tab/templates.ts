/**
 * Glyph templates of the tab reader: the ten digits and the marks that share a string line with
 * them, as drawn by many text faces (see scripts/omr-digit-templates.cjs). Decoded once, on first
 * use, and kept at a few blur levels so that a soft scan is compared with equally soft templates.
 */
import { TEMPLATE_CLASSES, TEMPLATE_DATA, TEMPLATE_FACES, TEMPLATE_FAMILIES, TEMPLATE_HEIGHT } from './digit-templates.data';

/** Rows of a normalised glyph. */
export const GLYPH_H = TEMPLATE_HEIGHT;

/** One reference drawing of a glyph. */
export interface GlyphTemplate {
  /** Class index into {@link GLYPH_LABELS}; 0-9 are the digits. */
  cls: number;
  label: string;
  /** Font family index (see {@link TEMPLATE_FAMILY_NAMES}) and CSS weight. */
  family: number;
  weight: number;
  /** Width in px at {@link GLYPH_H} rows. */
  w: number;
  /** Height of the glyph relative to the digits of its face (an x is about 0.7). */
  relH: number;
  /** Offset of the glyph centre below the digit centre, in digit heights. */
  relY: number;
  /** Ink 0..1, row-major, w x GLYPH_H. */
  px: Float32Array;
  /** The faces (indices into {@link TEMPLATE_FACE_LIST}) that draw this glyph this way. */
  faces: number[];
}

/** Label of each class index. */
export const GLYPH_LABELS: readonly string[] = TEMPLATE_CLASSES;

/** The faces the templates were drawn from: [family index, CSS weight]. */
export const TEMPLATE_FACE_LIST: readonly (readonly [number, number])[] = TEMPLATE_FACES;

/** Names of the font families the templates were drawn from. */
export const TEMPLATE_FAMILY_NAMES: readonly string[] = TEMPLATE_FAMILIES;

/** Class index of a label (-1 when unknown). */
export function glyphClass(label: string): number {
  return TEMPLATE_CLASSES.indexOf(label);
}

function decodeBase64(text: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Very old Node without atob.
  const B = (globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
  if (!B) throw new Error('no base64 decoder available');
  return new Uint8Array(B.from(text, 'base64'));
}

let cache: GlyphTemplate[] | null = null;

/** Every template, sharp (as drawn). Decoded on first call. */
export function loadTemplates(): GlyphTemplate[] {
  if (cache) return cache;
  const bytes = decodeBase64(TEMPLATE_DATA);
  const out: GlyphTemplate[] = [];
  const maskBytes = Math.ceil(TEMPLATE_FACES.length / 8);
  let p = 0;
  while (p + 6 <= bytes.length) {
    const cls = bytes[p];
    const family = bytes[p + 1];
    const weight = bytes[p + 2] * 100;
    const w = bytes[p + 3];
    const relH = bytes[p + 4] / 64;
    const relY = (bytes[p + 5] - 128) / 64;
    p += 6;
    const faces: number[] = [];
    for (let f = 0; f < TEMPLATE_FACES.length; f++) if (bytes[p + (f >> 3)] & (1 << (f & 7))) faces.push(f);
    p += maskBytes;
    const n = w * GLYPH_H;
    const px = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const b = bytes[p + (i >> 1)];
      px[i] = ((i & 1) === 0 ? b >> 4 : b & 15) / 15;
    }
    p += (n + 1) >> 1;
    out.push({ cls, label: TEMPLATE_CLASSES[cls], family, weight, w, relH, relY, px, faces });
  }
  cache = out;
  return out;
}

/**
 * Gaussian blur of a glyph inside its own box (ink that spills over the edge is cut off, as it is
 * when a blurred glyph is cropped to its thresholded outline).
 */
export function blurGlyph(px: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.15) return px;
  const r = Math.max(1, Math.ceil(sigma * 2.5));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += k[i + r];
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i;
        if (xx >= 0 && xx < w) a += k[i + r] * px[y * w + xx];
      }
      tmp[y * w + x] = a;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i;
        if (yy >= 0 && yy < h) a += k[i + r] * tmp[yy * w + x];
      }
      out[y * w + x] = a;
    }
  }
  return out;
}

/** Area-average a w x h raster to `w2` x `h2`. */
export function resampleInk(px: Float32Array, w: number, h: number, w2: number, h2: number): Float32Array {
  const out = new Float32Array(w2 * h2);
  const sx = w / w2;
  const sy = h / h2;
  for (let y = 0; y < h2; y++) {
    const ya = y * sy;
    const yb = ya + sy;
    for (let x = 0; x < w2; x++) {
      const xa = x * sx;
      const xb = xa + sx;
      let sum = 0;
      let area = 0;
      for (let yy = Math.floor(ya); yy < Math.ceil(yb) && yy < h; yy++) {
        const wy = Math.min(yb, yy + 1) - Math.max(ya, yy);
        if (wy <= 0) continue;
        for (let xx = Math.floor(xa); xx < Math.ceil(xb) && xx < w; xx++) {
          const wx = Math.min(xb, xx + 1) - Math.max(xa, xx);
          if (wx <= 0) continue;
          sum += px[yy * w + xx] * wx * wy;
          area += wx * wy;
        }
      }
      out[y * w2 + x] = area > 0 ? sum / area : 0;
    }
  }
  return out;
}

/**
 * A template as it looks after an optical blur of `sigma` px (at {@link GLYPH_H} rows) and the
 * reader's own cropping: the glyph is blurred on a padded canvas, cut to the outline a threshold
 * would find (blur makes a glyph's box grow) and brought back to {@link GLYPH_H} rows.
 */
export function blurTemplate(t: GlyphTemplate, sigma: number, maxWidth = 28): GlyphTemplate {
  if (sigma < 0.15) return t;
  const pad = Math.ceil(sigma * 2);
  const W = t.w + 2 * pad;
  const Hh = GLYPH_H + 2 * pad;
  const big = new Float32Array(W * Hh);
  for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < t.w; x++) big[(y + pad) * W + x + pad] = t.px[y * t.w + x];
  const soft = blurGlyph(big, W, Hh, sigma);
  let peak = 0;
  for (let i = 0; i < soft.length; i++) if (soft[i] > peak) peak = soft[i];
  const level = 0.42 * Math.min(1, peak);
  let x0 = W, y0 = Hh, x1 = -1, y1 = -1;
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      if (soft[y * W + x] < level) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) return t;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const crop = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) crop[y * cw + x] = soft[(y + y0) * W + x + x0];
  const w = Math.max(2, Math.min(maxWidth, Math.round((cw * GLYPH_H) / ch)));
  return { ...t, w, px: resampleInk(crop, cw, ch, w, GLYPH_H) };
}

/** Blur levels (sigma in px at {@link GLYPH_H} rows) the templates are kept at. */
export const BLUR_LEVELS: readonly number[] = [0, 0.7, 1.2, 1.8, 2.5];

const blurred = new Map<number, GlyphTemplate[]>();

/** The template set at one of the {@link BLUR_LEVELS} (index). */
export function templatesAtBlur(level: number): GlyphTemplate[] {
  const hit = blurred.get(level);
  if (hit) return hit;
  const sigma = BLUR_LEVELS[level] ?? 0;
  const set = loadTemplates().map((t) => blurTemplate(t, sigma));
  blurred.set(level, set);
  return set;
}
