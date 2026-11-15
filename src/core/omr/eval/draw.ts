/**
 * A tiny RGBA drawing surface for annotated debug pictures: lines, boxes, polylines and labels in
 * a built-in 5x7 font. Pure typed-array code (no canvas), so dumps work in Node tests and workers.
 */
import type { BinaryImage, GrayImage, Point } from '../image/gray';

/** A colour as [red, green, blue], 0..255. */
export type Rgb = [number, number, number];

/** Distinct colours for overlays. */
export const COLORS: Record<string, Rgb> = {
  red: [220, 38, 38],
  green: [22, 163, 74],
  blue: [37, 99, 235],
  orange: [234, 120, 12],
  purple: [147, 51, 234],
  cyan: [8, 145, 178],
  magenta: [219, 39, 119],
  yellow: [202, 138, 4],
  grey: [120, 120, 120],
  black: [0, 0, 0],
};

// 5x7 glyphs, one string of 35 cells per character ('#' = on), rows top to bottom.
const FONT_ROWS: Record<string, string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '~': ['.....', '.....', '.#...', '#.#.#', '...#.', '.....', '.....'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
};

/** RGBA drawing surface. */
export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number, fill: Rgb = [255, 255, 255]) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = fill[0];
      this.data[i + 1] = fill[1];
      this.data[i + 2] = fill[2];
      this.data[i + 3] = 255;
    }
  }

  /** Start from a grey page; `fade` (0..1) lightens it so overlays stand out. */
  static fromGray(img: GrayImage, fade = 0.35): Canvas {
    const c = new Canvas(img.width, img.height);
    const d = img.data;
    for (let i = 0, j = 0; i < d.length; i++, j += 4) {
      const v = d[i] + (255 - d[i]) * fade;
      c.data[j] = c.data[j + 1] = c.data[j + 2] = v;
    }
    return c;
  }

  /** Start from a binary image (ink drawn in grey). */
  static fromBinary(bin: BinaryImage, ink = 90): Canvas {
    const c = new Canvas(bin.width, bin.height);
    const d = bin.data;
    for (let i = 0, j = 0; i < d.length; i++, j += 4) {
      if (d[i]) c.data[j] = c.data[j + 1] = c.data[j + 2] = ink;
    }
    return c;
  }

  /** Blend one pixel. */
  plot(x: number, y: number, color: Rgb, alpha = 1): void {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return;
    const i = (yi * this.width + xi) * 4;
    this.data[i] += (color[0] - this.data[i]) * alpha;
    this.data[i + 1] += (color[1] - this.data[i + 1]) * alpha;
    this.data[i + 2] += (color[2] - this.data[i + 2]) * alpha;
  }

  /** Straight line between two points (continuous coordinates). */
  line(x0: number, y0: number, x1: number, y1: number, color: Rgb, thickness = 1, alpha = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const r = (thickness - 1) / 2;
    for (let s = 0; s <= steps; s++) {
      const x = x0 + (dx * s) / steps;
      const y = y0 + (dy * s) / steps;
      if (thickness <= 1) this.plot(x, y, color, alpha);
      else for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) this.plot(x + ox, y + oy, color, alpha);
    }
  }

  /** Polyline through points. */
  polyline(points: Point[], color: Rgb, thickness = 1, alpha = 1): void {
    for (let i = 0; i + 1 < points.length; i++) this.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, color, thickness, alpha);
  }

  /** Outline of a box given as x, y, w, h. */
  rect(x: number, y: number, w: number, h: number, color: Rgb, thickness = 1, alpha = 1): void {
    this.line(x, y, x + w, y, color, thickness, alpha);
    this.line(x, y + h, x + w, y + h, color, thickness, alpha);
    this.line(x, y, x, y + h, color, thickness, alpha);
    this.line(x + w, y, x + w, y + h, color, thickness, alpha);
  }

  /** Translucent filled box. */
  fillRect(x: number, y: number, w: number, h: number, color: Rgb, alpha = 0.25): void {
    for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) this.plot(xx, yy, color, alpha);
  }

  /** Text in the built-in font; `scale` multiplies the 5x7 cell. Returns the width drawn. */
  text(x: number, y: number, str: string, color: Rgb, scale = 1, background: Rgb | null = [255, 255, 255]): number {
    const s = String(str).toUpperCase();
    const w = s.length * 6 * scale;
    if (background) this.fillRect(x - 1, y - 1, w + 1, 7 * scale + 2, background, 0.8);
    let cx = Math.floor(x);
    for (const ch of s) {
      const rows = FONT_ROWS[ch];
      if (rows) {
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 5; c++) {
            if (rows[r][c] !== '#') continue;
            for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) this.plot(cx + c * scale + sx, Math.floor(y) + r * scale + sy, color);
          }
        }
      }
      cx += 6 * scale;
    }
    return w;
  }

  /** The picture as a plain RGBA record (for writePng). */
  image(): { width: number; height: number; data: Uint8ClampedArray } {
    return { width: this.width, height: this.height, data: this.data };
  }
}
