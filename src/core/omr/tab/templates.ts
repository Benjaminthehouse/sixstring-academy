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
  /** Drawn by a music font (time-signature numerals, rests) rather than a text face. */
  music: boolean;
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
  /** Sum of the ink and of its squares (kept so that a correlation is one dot product). */
  s1: number;
  s2: number;
}

/** Sum and sum of squares of a raster. */
export function sumsOf(px: Float32Array): { s1: number; s2: number } {
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < px.length; i++) {
    s1 += px[i];
    s2 += px[i] * px[i];
  }
  return { s1, s2 };
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
    out.push({ cls, label: TEMPLATE_CLASSES[cls], family, weight, music: TEMPLATE_FAMILIES[family].endsWith('(music)'), w, relH, relY, px, faces, ...sumsOf(px) });
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
 * The outline of a glyph in a raster of ink (0..1): the box inside which the ink exceeds half of
 * the glyph's typical stroke darkness, with sub-pixel edges (linear interpolation of the row and
 * column maxima). Samples and templates are both cut by this rule, so a soft glyph and a sharp
 * one end up at the same scale. `skipRow` leaves rows out of the horizontal extent (rows under a
 * staff line). Null when the raster is empty.
 */
export function halfMaxBox(px: Float32Array, w: number, h: number, skipRow?: (y: number) => boolean): { x0: number; y0: number; x1: number; y1: number } | null {
  const rowMax = new Float32Array(h);
  const colMax = new Float32Array(w);
  let top = 0;
  for (let y = 0; y < h; y++) {
    const skip = skipRow ? skipRow(y) : false;
    for (let x = 0; x < w; x++) {
      const v = px[y * w + x];
      if (v > rowMax[y]) rowMax[y] = v;
      if (!skip && v > colMax[x]) colMax[x] = v;
    }
    if (rowMax[y] > top) top = rowMax[y];
  }
  if (top <= 0.02) return null;
  // Typical stroke darkness: the upper quartile of the rows that carry ink.
  const inked = Array.from(rowMax).filter((v) => v > 0.2 * top).sort((a, b) => a - b);
  const level = 0.5 * inked[Math.min(inked.length - 1, Math.floor(inked.length * 0.75))];
  const edge = (profile: Float32Array, n: number, forward: boolean): number => {
    for (let k = 0; k < n; k++) {
      const i = forward ? k : n - 1 - k;
      if (profile[i] < level) continue;
      const before = forward ? (i > 0 ? profile[i - 1] : 0) : i < n - 1 ? profile[i + 1] : 0;
      const t = Math.max(0, Math.min(1, (level - before) / Math.max(1e-6, profile[i] - before)));
      return forward ? Math.max(0, i - 0.5 + t) : Math.min(n, i + 1.5 - t);
    }
    return forward ? 0 : n;
  };
  const y0 = edge(rowMax, h, true);
  const y1 = edge(rowMax, h, false);
  const x0 = edge(colMax, w, true);
  const x1 = edge(colMax, w, false);
  if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return null;
  return { x0, y0, x1, y1 };
}

/** Area-average the box [x0, x1) x [y0, y1) (fractional) of a raster to `w2` x `h2`. */
export function resampleBox(px: Float32Array, w: number, h: number, box: { x0: number; y0: number; x1: number; y1: number }, w2: number, h2: number): Float32Array {
  const out = new Float32Array(w2 * h2);
  const sx = (box.x1 - box.x0) / w2;
  const sy = (box.y1 - box.y0) / h2;
  for (let y = 0; y < h2; y++) {
    const ya = box.y0 + y * sy;
    const yb = ya + sy;
    for (let x = 0; x < w2; x++) {
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
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) sum += px[yy * w + xx] * wx * wy;
        }
      }
      out[y * w2 + x] = area > 0 ? sum / area : 0;
    }
  }
  return out;
}

/** How a blurred template was cut out of its padded canvas. */
interface BlurGeometry {
  pad: number;
  /** The crop (fractional, in canvas px): the half-maximum outline of the blurred glyph. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Width of the result at GLYPH_H rows. */
  w: number;
}

/** Blur a (possibly line-struck) template on a padded canvas; with `geom`, cut it the way the whole glyph was cut. */
function render(t: GlyphTemplate, sigma: number, maxWidth: number, geom: BlurGeometry | null, erase: { centre: number; thickness: number } | null): { px: Float32Array; geom: BlurGeometry } {
  const pad = geom ? geom.pad : sigma < 0.15 ? 1 : Math.ceil(sigma * 2) + 1;
  const W = t.w + 2 * pad;
  const Hh = GLYPH_H + 2 * pad;
  const big = new Float32Array(W * Hh);
  for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < t.w; x++) big[(y + pad) * W + x + pad] = t.px[y * t.w + x];
  if (erase && geom && erase.thickness > 0) {
    // The line in canvas rows: where it lies in the finished template, mapped back through the crop.
    const ch = geom.y1 - geom.y0;
    const yl = geom.y0 + (erase.centre * ch) / GLYPH_H;
    const half = (erase.thickness * ch) / GLYPH_H / 2;
    for (let y = 0; y < Hh; y++) {
      const cover = Math.max(0, Math.min(y + 1, yl + half) - Math.max(y, yl - half));
      if (cover <= 0) continue;
      const keep = 1 - Math.min(1, cover);
      for (let x = 0; x < W; x++) big[y * W + x] *= keep;
    }
  }
  const soft = blurGlyph(big, W, Hh, sigma);
  let g = geom;
  if (!g) {
    const box = halfMaxBox(soft, W, Hh) ?? { x0: pad, y0: pad, x1: pad + t.w, y1: pad + GLYPH_H };
    g = { pad, ...box, w: Math.max(2, Math.min(maxWidth, Math.round(((box.x1 - box.x0) * GLYPH_H) / (box.y1 - box.y0)))) };
  }
  return { px: resampleBox(soft, W, Hh, g, g.w, GLYPH_H), geom: g };
}

/**
 * What erasing the rows under a line takes away from a blurred template: the erased ink alone,
 * blurred and cut like the whole glyph (`geom`). Blur and resampling are linear, so the struck
 * template is the plain one minus this, and only the few rows of the line need blurring.
 */
function struckDelta(t: GlyphTemplate, sigma: number, geom: BlurGeometry, erase: { centre: number; thickness: number }): Float32Array {
  const pad = geom.pad;
  const W = t.w + 2 * pad;
  const Hh = GLYPH_H + 2 * pad;
  const ch = geom.y1 - geom.y0;
  const yl = geom.y0 + (erase.centre * ch) / GLYPH_H;
  const half = (erase.thickness * ch) / GLYPH_H / 2;
  const band = new Float32Array(W * Hh);
  let ya = Hh;
  let yb = -1;
  for (let y = pad; y < pad + GLYPH_H; y++) {
    const cover = Math.min(1, Math.max(0, Math.min(y + 1, yl + half) - Math.max(y, yl - half)));
    if (cover <= 0) continue;
    if (y < ya) ya = y;
    yb = y;
    for (let x = 0; x < t.w; x++) band[y * W + x + pad] = t.px[(y - pad) * t.w + x] * cover;
  }
  if (yb < 0) return new Float32Array(geom.w * GLYPH_H);
  if (sigma < 0.15) return resampleBox(band, W, Hh, geom, geom.w, GLYPH_H);
  // The same kernel as blurGlyph, applied to the band rows only.
  const r = Math.max(1, Math.ceil(sigma * 2.5));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += k[i + r];
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(W * Hh);
  for (let y = ya; y <= yb; y++) {
    for (let x = 0; x < W; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i;
        if (xx >= 0 && xx < W) a += k[i + r] * band[y * W + xx];
      }
      tmp[y * W + x] = a;
    }
  }
  const soft = new Float32Array(W * Hh);
  for (let y = Math.max(0, ya - r); y <= Math.min(Hh - 1, yb + r); y++) {
    for (let x = 0; x < W; x++) {
      let a = 0;
      for (let yy = Math.max(ya, y - r); yy <= Math.min(yb, y + r); yy++) a += k[yy - y + r] * tmp[yy * W + x];
      soft[y * W + x] = a;
    }
  }
  return resampleBox(soft, W, Hh, geom, geom.w, GLYPH_H);
}

/**
 * A template as it looks after an optical blur of `sigma` px (at {@link GLYPH_H} rows) and the
 * reader's own cropping: the glyph is blurred on a padded canvas, cut to the outline a threshold
 * would find (blur makes a glyph's box grow) and brought back to {@link GLYPH_H} rows.
 */
export function blurTemplate(t: GlyphTemplate, sigma: number, maxWidth = 28): GlyphTemplate {
  const r = render(t, sigma, maxWidth, null, null);
  return { ...t, w: r.geom.w, px: r.px, ...sumsOf(r.px) };
}

/**
 * A struck template drawn the slow, direct way (erase, then blur the whole glyph): the reference
 * the fast path of {@link struckTemplates} is tested against.
 */
export function struckTemplateDirect(level: number, index: number, centre: number, thickness: number): Float32Array {
  const { geom } = levelSet(level);
  return render(loadTemplates()[index], BLUR_LEVELS[level] ?? 0, 28, geom[index], { centre, thickness }).px;
}

/** Blur levels (sigma in px at {@link GLYPH_H} rows) the templates are kept at. */
export const BLUR_LEVELS: readonly number[] = [0, 0.7, 1.2, 1.8, 2.5];

const blurred = new Map<number, { set: GlyphTemplate[]; geom: BlurGeometry[] }>();

function levelSet(level: number): { set: GlyphTemplate[]; geom: BlurGeometry[] } {
  let hit = blurred.get(level);
  if (!hit) {
    const sigma = BLUR_LEVELS[level] ?? 0;
    const set: GlyphTemplate[] = [];
    const geom: BlurGeometry[] = [];
    for (const t of loadTemplates()) {
      const r = render(t, sigma, 28, null, null);
      set.push({ ...t, w: r.geom.w, px: r.px, ...sumsOf(r.px) });
      geom.push(r.geom);
    }
    hit = { set, geom };
    blurred.set(level, hit);
  }
  return hit;
}

/** The template set at one of the {@link BLUR_LEVELS} (index). */
export function templatesAtBlur(level: number): GlyphTemplate[] {
  return levelSet(level).set;
}

const struck = new Map<string, GlyphTemplate[]>();
/**
 * Struck sets kept (least recently used dropped first). Each is a few hundred KB; a page needs a
 * handful, and an evicted one is rebuilt exactly (8-18 ms), so a reading never depends on what
 * was read before it.
 */
const MAX_STRUCK_SETS = 32;

/**
 * The template set for glyphs a staff line strikes through, as they look once the bare line has
 * been subtracted from the picture: each glyph has the rows under the line erased BEFORE it is
 * blurred, so a stroke hidden inside the line is gone (as it is in the picture) while the ink
 * that blur carries from above and below into those rows is kept (as it is in the picture).
 *
 * `centre` and `thickness` place the sharp line in rows of the finished template (0..GLYPH_H);
 * both are rounded to half rows (the search over one-pixel shifts absorbs the rest) and the sets
 * are cached. Indices match {@link templatesAtBlur}.
 */
export function struckTemplates(level: number, centre: number, thickness: number): GlyphTemplate[] {
  const c = Math.round(centre * 2) / 2;
  const th = Math.max(0.5, Math.round(thickness * 2) / 2);
  const key = `${level}|${c}|${th}`;
  let hit = struck.get(key);
  if (hit) {
    struck.delete(key);
    struck.set(key, hit);
    return hit;
  }
  const { set, geom } = levelSet(level);
  const sigma = BLUR_LEVELS[level] ?? 0;
  const base = loadTemplates();
  hit = base.map((t, i) => {
    // Rests and time-signature numerals are never read this way: keep their plain drawing.
    if (t.music) return set[i];
    // Drawn on first use: a glyph is only compared with templates of about its width and height,
    // so most of a set is never needed.
    const plain = set[i];
    let px: Float32Array | null = null;
    let s1 = 0;
    let s2 = 0;
    const draw = (): Float32Array => {
      const delta = struckDelta(t, sigma, geom[i], { centre: c, thickness: th });
      const out = new Float32Array(plain.px.length);
      for (let j = 0; j < out.length; j++) out[j] = Math.max(0, plain.px[j] - delta[j]);
      ({ s1, s2 } = sumsOf(out));
      return (px = out);
    };
    return {
      cls: plain.cls, label: plain.label, family: plain.family, weight: plain.weight, music: plain.music, w: plain.w, relH: plain.relH, relY: plain.relY, faces: plain.faces,
      get px(): Float32Array { return px ?? draw(); },
      get s1(): number { if (!px) draw(); return s1; },
      get s2(): number { if (!px) draw(); return s2; },
    };
  });
  struck.set(key, hit);
  if (struck.size > MAX_STRUCK_SETS) struck.delete(struck.keys().next().value as string);
  return hit;
}
