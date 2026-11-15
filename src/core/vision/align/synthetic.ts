/**
 * A tiny fretboard painter for unit tests: a dark (or light) board with fret wires, a nut, strings
 * and inlay dots, drawn through a homography into an RGBA frame. No lighting, hands or clutter
 * (the benchmark's renderer in `../testing` does those); just enough structure, placed exactly, to
 * test each stage against a known pose. Deterministic; noise comes from a seeded generator.
 */
import { INLAY_FRETS, boardEndX, boardWidthAt, createRng, fretAtX, fretX, invertHomography, stringSpanAt } from '../geometry';
import type { Frame, Mat3, NeckModel } from '../types';

/** What to paint. */
export interface SyntheticBoard {
  width: number;
  height: number;
  /** Neck mm -> pixels of the frame. */
  H: Mat3;
  model: NeckModel;
  /** Light board with dark wires (maple) instead of the default dark board with bright wires. */
  maple?: boolean;
  /** Fret wire width in mm (default 2.4). */
  fretWidth?: number;
  /** Draw strings (default true), inlay dots (default true) and a bone nut (default true). */
  strings?: boolean;
  inlays?: boolean;
  nut?: boolean;
  /** Fret wires to leave out, as if hidden (model fret numbers). */
  hiddenFrets?: readonly number[];
  /** Standard deviation of Gaussian pixel noise in grey levels (default 1.5) and its seed. */
  noise?: number;
  seed?: number;
  /** Background grey level (default 150). */
  background?: number;
  /** Marker mode: 8 mm square stickers of this colour straddling the bass edge, mid-cell at these frets. */
  stickers?: { frets: readonly number[]; rgb: readonly [number, number, number] };
}

/** Fronto-parallel homography: the nut at (nutX, centreY), the neck running toward -x at `pxPerMm`, bass side up, rotated by `rollDeg`. */
export function simpleView(model: NeckModel, nutX: number, centreY: number, pxPerMm: number, rollDeg = 0): Mat3 {
  const a = (rollDeg * Math.PI) / 180;
  const c = Math.cos(a) * pxPerMm;
  const s = Math.sin(a) * pxPerMm;
  const yc = model.nutWidth / 2;
  // u = nutX - c x - s (y - yc);  v = centreY + s x ... (a right-handed player seen in a true image)
  return [-c, s, nutX - s * yc, s, c, centreY - c * yc, 0, 0, 1];
}

/** Paint the board into a new RGBA frame (grey: R = G = B). */
export function paintBoard(spec: SyntheticBoard): Frame {
  const { width, height, H, model } = spec;
  const inv = invertHomography(H);
  if (!inv) throw new Error('singular homography');
  const data = new Uint8ClampedArray(width * height * 4);
  const rng = createRng(spec.seed ?? 7);
  const noise = spec.noise ?? 1.5;
  const bg = spec.background ?? 150;
  const maple = spec.maple ?? false;
  const boardLevel = maple ? 190 : 45;
  const wireLevel = maple ? 95 : 215;
  const half = (spec.fretWidth ?? 2.4) / 2;
  const hidden = new Set(spec.hiddenFrets ?? []);
  const yc = model.nutWidth / 2;
  const xEnd = boardEndX(model);
  const gauss = (): number => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  // 3x3 supersampling keeps thin strings and wires from aliasing.
  const SS = 3;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let sum = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = px + (sx + 0.5) / SS;
          const v = py + (sy + 0.5) / SS;
          const w = inv[6] * u + inv[7] * v + inv[8];
          const x = (inv[0] * u + inv[1] * v + inv[2]) / w;
          const y = (inv[3] * u + inv[4] * v + inv[5]) / w;
          let level = bg;
          const halfWidth = boardWidthAt(model, Math.max(0, x)) / 2;
          const onBoard = x >= 0 && x <= xEnd && Math.abs(y - yc) <= halfWidth;
          if (onBoard) {
            level = boardLevel;
            const n = Math.round(fretAtX(model, x));
            if (n >= 1 && n <= model.fretCount && !hidden.has(n) && Math.abs(x - fretX(model, n)) <= half) level = wireLevel;
            if (spec.inlays !== false) {
              const cell = Math.ceil(fretAtX(model, x));
              if (INLAY_FRETS.includes(cell) && cell <= model.fretCount) {
                const xm = (fretX(model, cell - 1) + fretX(model, cell)) / 2;
                const off = cell === 12 || cell === 24 ? stringSpanAt(model, xm) * 0.3 : 0;
                const d = Math.min(Math.hypot(x - xm, y - yc - off), Math.hypot(x - xm, y - yc + off));
                if (d <= 3.1) level = maple ? 30 : 230;
              }
            }
            if (spec.strings !== false) {
              const span = stringSpanAt(model, x);
              const idx = Math.round(((y - yc) / span + 0.5) * (model.stringCount - 1));
              if (idx >= 0 && idx < model.stringCount && Math.abs(y - yc - (idx / (model.stringCount - 1) - 0.5) * span) <= 0.45) level = maple ? 120 : 200;
            }
          } else if (spec.nut !== false && x < 0 && x >= -5.5 && Math.abs(y - yc) <= model.nutWidth / 2) {
            level = 235;
          } else if (x < (spec.nut !== false ? -5.5 : 0) && x > -150 && Math.abs(y - yc) <= model.nutWidth / 2 + 8) {
            // A plain headstock, so the nut has something to stand out from.
            level = 95;
          }
          sum += level;
        }
      }
      const value = sum / (SS * SS) + (noise > 0 ? noise * gauss() : 0);
      const i = (py * width + px) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
      if (spec.stickers) {
        // Stickers are painted last, at the pixel centre (no anti-aliasing needed for a test).
        const w = inv[6] * (px + 0.5) + inv[7] * (py + 0.5) + inv[8];
        const x = (inv[0] * (px + 0.5) + inv[1] * (py + 0.5) + inv[2]) / w;
        const y = (inv[3] * (px + 0.5) + inv[4] * (py + 0.5) + inv[5]) / w;
        for (const f of spec.stickers.frets) {
          const xm = (fretX(model, f - 1) + fretX(model, f)) / 2;
          const edge = yc - boardWidthAt(model, xm) / 2;
          if (Math.abs(x - xm) <= 4 && Math.abs(y - edge) <= 4) {
            data[i] = spec.stickers.rgb[0];
            data[i + 1] = spec.stickers.rgb[1];
            data[i + 2] = spec.stickers.rgb[2];
          }
        }
      }
    }
  }
  return { data, width, height };
}
