/**
 * Debug dumps (Node only: uses `node:fs` and `pngjs`). Write a frame, optionally with a pose drawn
 * on it (board outline, fret wires with numbers, strings, numbered note markers) and a detector's
 * diagnostic features, to a PNG you can open or view with the Read tool. Never import this from app code.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import { boardOutline, projectFretWire, projectMarker, projectString } from '../geometry';
import type { DiagnosticFeature, Frame, FretPosition, FretboardPose, Point } from '../types';

/** 8-bit sRGB colour. */
export type Color = readonly [number, number, number];

/** What to draw over a frame. */
export interface OverlayOptions {
  /** The pose under test: drawn in yellow with green markers. */
  pose?: FretboardPose | null;
  /** A reference pose (ground truth): drawn thin in cyan underneath. */
  truth?: FretboardPose | null;
  /** Note markers to draw with `pose` (default: one per visible fret, walking across the strings). */
  markers?: FretPosition[];
  /** Detector diagnostics: 1 point = dot, 2+ points = polyline. */
  features?: DiagnosticFeature[];
  /** Text printed in the top-left corner. */
  label?: string;
  /** Integer magnification applied before drawing, so thin overlays do not hide thin strings (default 1). */
  scale?: number;
}

const FONT: Record<string, string> = {
  '0': '01110100011001110101110011000101110',
  '1': '00100011000010000100001000010001110',
  '2': '01110100010000100010001000100011111',
  '3': '11110000010000101110000010000111110',
  '4': '00010001100101010010111110001000010',
  '5': '11111100001111000001000011000101110',
  '6': '00110010001000011110100011000101110',
  '7': '11111000010001000100010000100001000',
  '8': '01110100011000101110100011000101110',
  '9': '01110100011000101111000010001001100',
  A: '01110100011000111111100011000110001',
  B: '11110100011000111110100011000111110',
  C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110',
  E: '11111100001000011110100001000011111',
  F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111',
  H: '10001100011000111111100011000110001',
  I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100',
  K: '10001100101010011000101001001010001',
  L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001',
  N: '10001110011010110011100011000110001',
  O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000',
  Q: '01110100011000110001101011001001101',
  R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110',
  T: '11111001000010000100001000010000100',
  U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100',
  W: '10001100011000110101101011010101010',
  X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100',
  Z: '11111000010001000100010001000011111',
  '.': '00000000000000000000000000110001100',
  '-': '00000000000000011111000000000000000',
  '#': '01010010101111101010111110101001010',
  '/': '00001000010001000100010001000010000',
  ':': '00000011000110000000011000110000000',
  '%': '11000110010001000100010001001100011',
  '+': '00000001000010011111001000010000000',
  '@': '01110100011011110101101111000001110',
  '=': '00000000001111100000111110000000000',
  '(': '00010001000100001000010000010000010',
  ')': '01000001000001000010000100010001000',
  ',': '00000000000000000000011000010001000',
  _: '00000000000000000000000000000011111',
  '?': '01110100010000100010001000000000100',
  '!': '00100001000010000100001000000000100',
  '<': '00010001000100010000010000010000010',
  '>': '01000001000001000001000100010001000',
  "'": '00100001000000000000000000000000000',
  '*': '00000101010111011111011101010100000',
  '|': '00100001000010000100001000010000100',
};

function blend(frame: Frame, x: number, y: number, c: Color, a: number): void {
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height || a <= 0) return;
  const i = (y * frame.width + x) * 4;
  const k = a > 1 ? 1 : a;
  frame.data[i] += (c[0] - frame.data[i]) * k;
  frame.data[i + 1] += (c[1] - frame.data[i + 1]) * k;
  frame.data[i + 2] += (c[2] - frame.data[i + 2]) * k;
  frame.data[i + 3] = 255;
}

/** Anti-aliased line segment of the given thickness (pixels). */
export function drawLine(frame: Frame, a: Point, b: Point, color: Color, thickness = 1, alpha = 1): void {
  if (!Number.isFinite(a.x + a.y + b.x + b.y)) return;
  const r = thickness / 2;
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r - 1));
  const x1 = Math.min(frame.width - 1, Math.ceil(Math.max(a.x, b.x) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r - 1));
  const y1 = Math.min(frame.height - 1, Math.ceil(Math.max(a.y, b.y) + r + 1));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-9;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let h = ((x + 0.5 - a.x) * dx + (y + 0.5 - a.y) * dy) / len2;
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const d = Math.hypot(x + 0.5 - a.x - h * dx, y + 0.5 - a.y - h * dy) - r;
      blend(frame, x, y, color, (0.5 - d) * alpha);
    }
  }
}

/** Anti-aliased disc, optionally with a contrasting ring. */
export function drawDot(frame: Frame, p: Point, radius: number, color: Color, ring?: Color, alpha = 1): void {
  if (!Number.isFinite(p.x + p.y)) return;
  const r = radius + (ring ? 1.2 : 0);
  for (let y = Math.max(0, Math.floor(p.y - r - 1)); y <= Math.min(frame.height - 1, Math.ceil(p.y + r + 1)); y++) {
    for (let x = Math.max(0, Math.floor(p.x - r - 1)); x <= Math.min(frame.width - 1, Math.ceil(p.x + r + 1)); x++) {
      const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
      if (ring) blend(frame, x, y, ring, (0.5 - (d - r)) * alpha);
      blend(frame, x, y, color, (0.5 - (d - radius)) * alpha);
    }
  }
}

/** Width in pixels of a string drawn by `drawText`. */
export function textWidth(text: string, size = 1): number {
  return text.length * 6 * size - size;
}

/** 5x7 bitmap text with a dark outline so it reads on any background. (x, y) is the top-left corner. */
export function drawText(frame: Frame, text: string, x: number, y: number, color: Color, size = 1): void {
  const up = text.toUpperCase();
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < up.length; k++) {
      const glyph = FONT[up[k]];
      if (!glyph) continue;
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (glyph[gy * 5 + gx] !== '1') continue;
          for (let sy = 0; sy < size; sy++) {
            for (let sx = 0; sx < size; sx++) {
              const px = x0 + (k * 6 + gx) * size + sx;
              const py = y0 + gy * size + sy;
              if (pass === 0) {
                for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) blend(frame, px + ox, py + oy, [0, 0, 0], 0.85);
              } else {
                blend(frame, px, py, color, 1);
              }
            }
          }
        }
      }
    }
  }
}

/** A copy of a frame magnified by an integer factor (nearest neighbour). */
export function magnify(frame: Frame, factor: number): Frame {
  const f = Math.max(1, Math.round(factor));
  if (f === 1) return { data: new Uint8ClampedArray(frame.data), width: frame.width, height: frame.height };
  const w = frame.width * f;
  const h = frame.height * f;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.floor(y / f);
    for (let x = 0; x < w; x++) {
      const s = (sy * frame.width + Math.floor(x / f)) * 4;
      const o = (y * w + x) * 4;
      out[o] = frame.data[s];
      out[o + 1] = frame.data[s + 1];
      out[o + 2] = frame.data[s + 2];
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

function scaled(p: Point, s: number): Point {
  return { x: p.x * s, y: p.y * s };
}

function drawPose(frame: Frame, pose: FretboardPose, s: number, main: boolean, markers?: FretPosition[]): void {
  const line: Color = main ? [255, 224, 40] : [40, 220, 255];
  const thin = main ? 1.2 : 1;
  const alpha = main ? 0.9 : 0.75;
  const m = pose.model;
  const vis = pose.visibleFrets;
  const lo = Math.max(0, vis.min);
  const hi = vis.max >= vis.min ? vis.max : -1;
  const outline = boardOutline(pose, { min: Math.max(0, lo), max: Math.max(lo, hi) });
  for (let i = 0; i < outline.length; i++) drawLine(frame, scaled(outline[i], s), scaled(outline[(i + 1) % outline.length], s), line, thin + 0.6, alpha);
  for (let f = lo; f <= hi; f++) {
    const [a, b] = projectFretWire(pose, f);
    drawLine(frame, scaled(a, s), scaled(b, s), line, f === 0 ? thin + 1.2 : thin, alpha);
    if (main) {
      // Fret numbers just outside the bass edge.
      const out = { x: a.x + (a.x - b.x) * 0.28, y: a.y + (a.y - b.y) * 0.28 };
      const txt = String(f);
      drawText(frame, txt, out.x * s - textWidth(txt) / 2, out.y * s - 4, [255, 255, 255]);
    }
  }
  if (!main || hi < lo) return;
  for (let st = 1; st <= m.stringCount; st++) {
    const [a, b] = projectString(pose, st, lo, hi);
    drawLine(frame, scaled(a, s), scaled(b, s), [255, 150, 40], 0.8, 0.55);
  }
  const list = markers ?? defaultMarkers(pose);
  for (const mk of list) {
    const p = scaled(projectMarker(pose, mk.string, mk.fret), s);
    drawDot(frame, p, Math.max(3, 2.2 * s), [40, 230, 90], [0, 0, 0], 0.9);
    const txt = String(mk.fret);
    drawText(frame, txt, p.x - textWidth(txt) / 2, p.y - 3.5, [255, 255, 255]);
  }
}

function defaultMarkers(pose: FretboardPose): FretPosition[] {
  const out: FretPosition[] = [];
  const vis = pose.visibleFrets;
  for (let f = Math.max(1, vis.min + 1); f <= vis.max; f++) out.push({ string: ((f - 1) % pose.model.stringCount) + 1, fret: f });
  if (vis.min === 0 && vis.max >= 0) out.push({ string: pose.model.stringCount, fret: 0 });
  return out;
}

const FEATURE_COLORS: readonly Color[] = [[255, 60, 200], [80, 255, 120], [255, 140, 30], [120, 160, 255], [255, 255, 255], [255, 60, 60]];

/** A copy of the frame with the overlay drawn on it. */
export function drawOverlay(frame: Frame, options: OverlayOptions = {}): Frame {
  const s = Math.max(1, Math.round(options.scale ?? 1));
  const out = magnify(frame, s);
  if (options.truth) drawPose(out, options.truth, s, false);
  if (options.features) {
    const kinds: string[] = [];
    for (const f of options.features) {
      if (!kinds.includes(f.kind)) kinds.push(f.kind);
      const color = FEATURE_COLORS[kinds.indexOf(f.kind) % FEATURE_COLORS.length];
      if (f.points.length === 1) drawDot(out, scaled(f.points[0], s), 1.6 * s, color);
      for (let i = 0; i + 1 < f.points.length; i++) drawLine(out, scaled(f.points[i], s), scaled(f.points[i + 1], s), color, 1, 0.9);
      if (f.closed && f.points.length > 2) drawLine(out, scaled(f.points[f.points.length - 1], s), scaled(f.points[0], s), color, 1, 0.9);
      if (f.label && f.points.length > 0) drawText(out, f.label, f.points[0].x * s + 3, f.points[0].y * s - 9, color);
    }
    kinds.forEach((k, i) => drawText(out, k, 4, out.height - 10 * (i + 1), FEATURE_COLORS[i % FEATURE_COLORS.length]));
  }
  if (options.pose) drawPose(out, options.pose, s, true, options.markers);
  if (options.label) drawText(out, options.label, 4, 4, [255, 255, 255]);
  return out;
}

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

/** Write a frame (with an optional overlay) to a PNG file, creating directories as needed. */
export function writeFramePng(path: string, frame: Frame, overlay?: OverlayOptions): void {
  const image = overlay ? drawOverlay(frame, overlay) : frame;
  const png = new PNG({ width: image.width, height: image.height });
  png.data.set(image.data);
  ensureDir(path);
  // Fast, light compression: these files are looked at once and thrown away.
  writeFileSync(path, PNG.sync.write(png, { colorType: 2, inputHasAlpha: true, deflateLevel: 3 }));
}

/** One cell of a contact sheet. */
export interface SheetCell {
  frame: Frame;
  label?: string;
  overlay?: OverlayOptions;
}

/**
 * Tile several frames into one PNG with a caption above each. Frames are resized to `cellWidth`
 * (default: the widest frame, capped at 640) keeping their aspect ratio.
 */
export function writeContactSheet(path: string, cells: readonly SheetCell[], options: { columns?: number; cellWidth?: number } = {}): void {
  if (cells.length === 0) return;
  const columns = Math.max(1, options.columns ?? Math.min(3, cells.length));
  const cellW = options.cellWidth ?? Math.min(640, Math.max(...cells.map((c) => c.frame.width)));
  const cellH = Math.round((cellW * 9) / 16);
  const caption = 11;
  const rows = Math.ceil(cells.length / columns);
  const sheet: Frame = { width: columns * (cellW + 2), height: rows * (cellH + caption + 2), data: new Uint8ClampedArray(columns * (cellW + 2) * rows * (cellH + caption + 2) * 4) };
  for (let i = 3; i < sheet.data.length; i += 4) sheet.data[i] = 255;
  cells.forEach((cell, idx) => {
    const src = cell.overlay ? drawOverlay(cell.frame, cell.overlay) : cell.frame;
    const ox = (idx % columns) * (cellW + 2);
    const oy = Math.floor(idx / columns) * (cellH + caption + 2);
    const h = Math.min(cellH, Math.round((cellW * src.height) / src.width));
    const sx = src.width / cellW;
    const sy = src.height / h;
    // Area-average when shrinking, nearest when enlarging.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < cellW; x++) {
        const x0 = Math.floor(x * sx);
        const y0 = Math.floor(y * sy);
        const x1 = Math.max(x0 + 1, Math.min(src.width, Math.floor((x + 1) * sx)));
        const y1 = Math.max(y0 + 1, Math.min(src.height, Math.floor((y + 1) * sy)));
        let r = 0;
        let g = 0;
        let b = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const s = (yy * src.width + xx) * 4;
            r += src.data[s];
            g += src.data[s + 1];
            b += src.data[s + 2];
          }
        }
        const cnt = (x1 - x0) * (y1 - y0);
        const o = ((oy + caption + y) * sheet.width + ox + x) * 4;
        sheet.data[o] = r / cnt;
        sheet.data[o + 1] = g / cnt;
        sheet.data[o + 2] = b / cnt;
      }
    }
    if (cell.label) drawText(sheet, cell.label.slice(0, Math.floor(cellW / 6)), ox + 2, oy + 2, [255, 255, 255]);
  });
  writeFramePng(path, sheet);
}
