/**
 * Synthetic tab strips for unit tests: a `StaffInput` drawn in memory from the glyph templates
 * (so the tests need no picture files and can vary one thing at a time: the face, the size, the
 * gap between digits, a line struck through the numbers, blur, a bar line in the way).
 *
 * The strip is put through the real staff-line removal, so the reader sees what the pipeline
 * would give it for the same picture.
 */
import { type GrayImage, createGray, gaussianBlur } from '../../image/gray';
import type { StaffGeom } from '../../staff/model';
import { removeStaffLines } from '../../staff/removal';
import type { BarlineType, StaffInput } from '../../types';
import { GLYPH_H, TEMPLATE_FAMILY_NAMES, type GlyphTemplate, loadTemplates, resampleBox } from '../templates';

/** One thing to print on the staff. */
export interface SynthItem {
  /** String line, 0 = top. */
  line: number;
  /** Left edge of the text in strip px. */
  x: number;
  /** Characters to print: digits and the marks the templates know ("12", "x", "(5)", "5h7"). */
  text: string;
}

/** Options of {@link synthStaff}. */
export interface SynthOptions {
  items: SynthItem[];
  /** Font family and weight of the templates to print with (default Liberation Sans 400). */
  family?: string;
  weight?: number;
  /** Digit height in px (default 19) and space between two characters as a share of it (default 0.12). */
  digitHeight?: number;
  spacing?: number;
  /** The staff lines run through the numbers instead of being blanked behind them. */
  lineThrough?: boolean;
  /** Line thickness in px (default 3). */
  lineThickness?: number;
  /** Optical blur, sigma in px (default 0). */
  blur?: number;
  /** Bar lines at these x (the staff always starts and ends with one). */
  bars?: number[];
  width?: number;
  lines?: number;
  /** Draw extra ink before the strip is binarised (stems, arcs, anything a test needs). */
  draw?: (ink: (x: number, y: number, value?: number) => void, g: { lineYs: number[]; space: number }) => void;
}

/** A synthetic strip and where everything was printed. */
export interface SynthStaff {
  input: StaffInput;
  /** Box of every printed character run: x0, y0, x1, y1. */
  boxes: { item: SynthItem; box: [number, number, number, number] }[];
}

/** The template of a character in a face (the nearest weight when the exact one was merged away). */
export function templateFor(ch: string, family: string, weight: number): GlyphTemplate {
  const fam = TEMPLATE_FAMILY_NAMES.indexOf(family);
  const all = loadTemplates().filter((t) => t.label === ch);
  if (!all.length) throw new Error(`no template for "${ch}"`);
  const own = all.filter((t) => t.family === fam);
  const pool = own.length ? own : all;
  return pool.slice().sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0];
}

/** Draw a staff strip. */
export function synthStaff(opts: SynthOptions): SynthStaff {
  const space = 24;
  const n = opts.lines ?? 6;
  const width = opts.width ?? 900;
  const top = 84;
  const height = top + (n - 1) * space + 144;
  const hd = opts.digitHeight ?? 19;
  const thick = opts.lineThickness ?? 3;
  const family = opts.family ?? 'Liberation Sans';
  const weight = opts.weight ?? 400;
  const lineYs = Array.from({ length: n }, (_, l) => top + l * space);
  const x0 = 24;
  const x1 = width - 24;
  const ink = new Float32Array(width * height);
  const put = (x: number, y: number, v = 1): void => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= width || yi >= height) return;
    if (v > ink[yi * width + xi]) ink[yi * width + xi] = v;
  };
  // Staff lines and bar lines.
  for (const ly of lineYs) for (let x = x0; x < x1; x++) for (let d = 0; d < thick; d++) put(x, Math.round(ly - thick / 2) + d);
  const bars = [x0 + 2, ...(opts.bars ?? []), x1 - 2];
  for (const bx of bars) for (let y = lineYs[0] - 1; y <= lineYs[n - 1] + 1; y++) for (let d = -1; d <= 2; d++) put(bx + d, y);
  // Numbers.
  const boxes: SynthStaff['boxes'] = [];
  const blank: [number, number, number, number][] = [];
  const glyphs: { px: Float32Array; w: number; h: number; x: number; y: number }[] = [];
  for (const item of opts.items) {
    let x = item.x;
    const ly = lineYs[item.line];
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    for (const ch of item.text) {
      const t = templateFor(ch, family, weight);
      const h = Math.max(3, Math.round(hd * t.relH));
      const w = Math.max(2, Math.round((t.w * h) / GLYPH_H));
      const px = resampleBox(t.px, t.w, GLYPH_H, { x0: 0, y0: 0, x1: t.w, y1: GLYPH_H }, w, h);
      const y = Math.round(ly + t.relY * hd - h / 2);
      glyphs.push({ px, w, h, x, y });
      bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x + w); by0 = Math.min(by0, y); by1 = Math.max(by1, y + h);
      x += w + Math.round(hd * (opts.spacing ?? 0.12));
    }
    boxes.push({ item, box: [bx0, by0, bx1, by1] });
    blank.push([bx0 - 3, ly - thick, bx1 + 3, ly + thick]);
  }
  if (!opts.lineThrough) for (const [a, b, c, d] of blank) for (let y = Math.floor(b); y <= Math.ceil(d); y++) for (let x = a; x < c; x++) if (x >= 0 && x < width) ink[y * width + x] = 0;
  for (const g of glyphs) for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) put(g.x + x, g.y + y, g.px[y * g.w + x]);
  opts.draw?.(put, { lineYs, space });
  let gray: GrayImage = createGray(width, height);
  for (let i = 0; i < ink.length; i++) gray.data[i] = Math.round(255 * (1 - Math.min(1, ink[i])));
  if (opts.blur) gray = gaussianBlur(gray, opts.blur);
  const binary = { width, height, data: new Uint8Array(width * height) };
  // A fixed threshold a little on the light side, as an adaptive one behaves on soft strokes.
  for (let i = 0; i < ink.length; i++) binary.data[i] = gray.data[i] < 150 ? 1 : 0;
  const geom: StaffGeom = {
    lineCount: n,
    xs: Float32Array.from([x0, x1]),
    ys: lineYs.map((y) => Float32Array.from([y, y])),
    x0,
    x1,
    space,
    thickness: thick,
    coverage: 1,
    confidence: 1,
  };
  const removal = removeStaffLines(binary, [geom]);
  const barlines = bars.map((bx) => ({ x: bx + 0.5, x0: bx - 1, x1: bx + 3, type: 'single' as BarlineType, confidence: 1 }));
  const measures = barlines.slice(0, -1).map((b, i) => ({ index: i, x0: b.x, x1: barlines[i + 1].x }));
  const input: StaffInput = {
    index: 0,
    staffId: 's0.st0',
    kind: 'tab',
    kindConfidence: 0.95,
    lineCount: n,
    gray,
    binary,
    noLines: removal.image,
    lineMask: removal.mask,
    space,
    lineThickness: thick,
    lineYs,
    x0,
    x1,
    barlines,
    measures,
    scale: 1.8,
    sourceSpace: space / 1.8,
    toPage: (x, y) => ({ x, y }),
    toPageBox: (x, y, w, h) => ({ x, y, w, h }),
    fromPage: (x, y) => ({ x, y }),
    page: { gray, width, height },
  };
  return { input, boxes };
}
