/**
 * Glyph templates of the notation recognizer: the packed one-bit bitmaps of `templates.data.ts`
 * unpacked into small grey "ink" images (0 = paper, 255 = ink, lightly blurred so that a one-pixel
 * misalignment or a soft scan does not destroy the correlation), with the glyph origin.
 *
 * All templates are at {@link TEMPLATE_SPACE} px per staff space: the resolution of a notation
 * staff strip, so they can be laid over a strip without any scaling.
 */
import { PACKED_TEMPLATES, TEMPLATE_SPACE } from './templates.data';

export { TEMPLATE_SPACE };

/** A glyph in one music font, ready for matching. */
export interface Template {
  font: string;
  glyph: string;
  /** Size of `ink` (the bitmap plus `pad` px of paper on every side). */
  width: number;
  height: number;
  /** Ink darkness 0..255, row-major. */
  ink: Uint8Array;
  /** Glyph origin (SMuFL: left edge, the staff position the glyph sits on) inside `ink`. */
  ox: number;
  oy: number;
  /** Width / height of the bare glyph and the padding around it. */
  glyphWidth: number;
  glyphHeight: number;
  pad: number;
  /** Number of ink pixels of the bare glyph. */
  area: number;
  /** Per row: sum of `ink` and of `ink` squared (for the weighted correlation). */
  rowSum: Float64Array;
  rowSumSq: Float64Array;
  /** 1 where the template is paper enclosed by ink (the hole of an open note head); same size as `ink`. */
  hole: Uint8Array;
  holeArea: number;
}

/** Paper margin kept around a template: mismatching ink right next to a glyph must count. */
export const TEMPLATE_PAD = 3;

function unpack(b64: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  let bytes: Uint8Array;
  if (typeof atob === 'function') {
    const s = atob(b64);
    bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  } else {
    bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  }
  for (let i = 0; i < n; i++) out[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  return out;
}

/** Build a template from a one-bit bitmap (1 = ink). */
export function makeTemplate(font: string, glyph: string, w: number, h: number, ox: number, oy: number, bits: Uint8Array, pad = TEMPLATE_PAD): Template {
  const W = w + 2 * pad;
  const H = h + 2 * pad;
  const raw = new Uint16Array(W * H);
  let area = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bits[y * w + x]) {
        raw[(y + pad) * W + x + pad] = 255;
        area++;
      }
    }
  }
  // 3x3 binomial blur.
  const tmp = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = x > 0 ? raw[y * W + x - 1] : 0;
      const c = x < W - 1 ? raw[y * W + x + 1] : 0;
      tmp[y * W + x] = a + 2 * raw[y * W + x] + c;
    }
  }
  const ink = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = y > 0 ? tmp[(y - 1) * W + x] : 0;
      const c = y < H - 1 ? tmp[(y + 1) * W + x] : 0;
      ink[y * W + x] = (a + 2 * tmp[y * W + x] + c + 8) >> 4;
    }
  }
  const rowSum = new Float64Array(H);
  const rowSumSq = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let a = 0;
    let b = 0;
    for (let x = 0; x < W; x++) {
      const v = ink[y * W + x];
      a += v;
      b += v * v;
    }
    rowSum[y] = a;
    rowSumSq[y] = b;
  }
  // Enclosed paper: everything a flood fill from the border cannot reach.
  const outside = new Uint8Array(W * H);
  const stack: number[] = [0];
  outside[0] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % W;
    const y = (i - x) / W;
    const visit = (j: number): void => {
      if (!outside[j] && raw[j] === 0) {
        outside[j] = 1;
        stack.push(j);
      }
    };
    if (x > 0) visit(i - 1);
    if (x < W - 1) visit(i + 1);
    if (y > 0) visit(i - W);
    if (y < H - 1) visit(i + W);
  }
  const hole = new Uint8Array(W * H);
  let holeArea = 0;
  for (let i = 0; i < hole.length; i++) {
    if (!outside[i] && raw[i] === 0) {
      hole[i] = 1;
      holeArea++;
    }
  }
  return { font, glyph, width: W, height: H, ink, ox: ox + pad, oy: oy + pad, glyphWidth: w, glyphHeight: h, pad, area, rowSum, rowSumSq, hole, holeArea };
}

let cache: Map<string, Template[]> | null = null;

function load(): Map<string, Template[]> {
  if (cache) return cache;
  cache = new Map();
  for (const [font, glyph, w, h, ox, oy, bits] of PACKED_TEMPLATES) {
    const t = makeTemplate(font, glyph, w, h, ox, oy, unpack(bits, w * h));
    const list = cache.get(glyph);
    if (list) list.push(t); else cache.set(glyph, [t]);
  }
  return cache;
}

/** The templates of one glyph (SMuFL name, e.g. `noteheadHalf`), one per music font. */
export function templatesOf(glyph: string): Template[] {
  return load().get(glyph) ?? [];
}

/** Names of all glyphs that have templates. */
export function templateGlyphs(): string[] {
  return [...load().keys()];
}

/**
 * A template resampled by `scale` (bilinear on the bare bitmap, then padded and blurred again).
 * Used for glyphs that engravers print at other sizes than the staff suggests: tuplet digits,
 * oversized time signatures.
 */
export function scaleTemplate(t: Template, scale: number): Template {
  const w0 = t.glyphWidth;
  const h0 = t.glyphHeight;
  const w = Math.max(2, Math.round(w0 * scale));
  const h = Math.max(2, Math.round(h0 * scale));
  const bits = new Uint8Array(w * h);
  const src = t.ink;
  const W = t.width;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(h0 - 1, ((y + 0.5) * h0) / h - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(h0 - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(w0 - 1, ((x + 0.5) * w0) / w - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(w0 - 1, x0 + 1);
      const fx = sx - x0;
      const a = src[(y0 + t.pad) * W + x0 + t.pad];
      const b = src[(y0 + t.pad) * W + x1 + t.pad];
      const c = src[(y1 + t.pad) * W + x0 + t.pad];
      const d = src[(y1 + t.pad) * W + x1 + t.pad];
      const v = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
      bits[y * w + x] = v >= 128 ? 1 : 0;
    }
  }
  return makeTemplate(t.font, t.glyph, w, h, (t.ox - t.pad) * scale, (t.oy - t.pad) * scale, bits, t.pad);
}
