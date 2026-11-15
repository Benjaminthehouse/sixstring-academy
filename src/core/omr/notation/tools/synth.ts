/**
 * Synthetic staff strips for unit tests: a blank strip with five lines on which glyph templates,
 * stems and beams are drawn at chosen places. Gives a `StaffInput` without going through the page
 * pipeline, so each stage of the recognizer can be tested on exactly known ink.
 */
import type { StaffInput } from '../../types';
import { type Template, templatesOf } from '../templates';

/** Drawing surface of a synthetic strip. */
export class SynthStrip {
  readonly space = 20;
  readonly width: number;
  readonly height = 360;
  readonly lineYs = [140, 160, 180, 200, 220];
  readonly thickness = 3;
  /** Symbol ink (1 = ink), without the staff lines. */
  readonly symbols: Uint8Array;
  readonly barlines: { x: number }[] = [];

  constructor(width = 800, readonly font = 'Bravura') {
    this.width = width;
    this.symbols = new Uint8Array(width * this.height);
  }

  /** y of a staff position. */
  y(pos: number): number {
    return this.lineYs[4] - pos * 10;
  }

  private template(glyph: string): Template {
    const t = templatesOf(glyph).find((q) => q.font === this.font);
    if (!t) throw new Error(`no template ${glyph} in ${this.font}`);
    return t;
  }

  /** Draw a glyph with its origin (left edge, staff position) at (x, y). Returns its box. */
  glyph(glyph: string, x: number, y: number): { x0: number; y0: number; x1: number; y1: number } {
    const t = this.template(glyph);
    const left = Math.round(x - t.ox);
    const top = Math.round(y - t.oy);
    for (let ty = 0; ty < t.height; ty++) {
      for (let tx = 0; tx < t.width; tx++) {
        if (t.ink[ty * t.width + tx] < 128) continue;
        const px = left + tx;
        const py = top + ty;
        if (px >= 0 && py >= 0 && px < this.width && py < this.height) this.symbols[py * this.width + px] = 1;
      }
    }
    return { x0: left + t.pad, y0: top + t.pad, x1: left + t.pad + t.glyphWidth, y1: top + t.pad + t.glyphHeight };
  }

  /** Fill a rectangle with ink. */
  rect(x0: number, y0: number, x1: number, y1: number): void {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(this.height, Math.round(y1)); y++) {
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(this.width, Math.round(x1)); x++) this.symbols[y * this.width + x] = 1;
    }
  }

  /**
   * A note: head of the given glyph centred at x on a staff position, with a stem (3 px wide,
   * 3.5 spaces long) unless `stem` is null. Returns the x of the stem and the y of its tip.
   */
  note(x: number, pos: number, opts: { head?: string; stem?: 'up' | 'down' | null; length?: number } = {}): { stemX: number; tipY: number } {
    const head = opts.head ?? 'noteheadBlack';
    const t = this.template(head);
    const y = this.y(pos);
    this.glyph(head, x - t.glyphWidth / 2, y);
    const dir = opts.stem === undefined ? 'up' : opts.stem;
    if (!dir) return { stemX: x, tipY: y };
    const len = (opts.length ?? 3.5) * this.space;
    const stemX = dir === 'up' ? x + t.glyphWidth / 2 - 1.5 : x - t.glyphWidth / 2 + 1.5;
    const tipY = dir === 'up' ? y - len : y + len;
    this.rect(stemX - 1.5, Math.min(y, tipY), stemX + 1.5, Math.max(y, tipY));
    // Ledger lines.
    for (let p = 10; p <= pos; p += 2) this.rect(x - t.glyphWidth / 2 - 6, this.y(p) - 2, x + t.glyphWidth / 2 + 6, this.y(p) + 2);
    for (let p = -2; p >= pos; p -= 2) this.rect(x - t.glyphWidth / 2 - 6, this.y(p) - 2, x + t.glyphWidth / 2 + 6, this.y(p) + 2);
    return { stemX, tipY };
  }

  /** A straight beam (half a space thick) between two stem tips; `level` 1 is the second beam. */
  beam(a: { stemX: number; tipY: number }, b: { stemX: number; tipY: number }, dir: 'up' | 'down', level = 0): void {
    const inward = dir === 'up' ? 1 : -1;
    for (let x = Math.round(a.stemX - 1.5); x < Math.round(b.stemX + 1.5); x++) {
      const t = (x - a.stemX) / Math.max(1, b.stemX - a.stemX);
      const y = a.tipY + (b.tipY - a.tipY) * t + inward * level * 15;
      this.rect(x, inward > 0 ? y : y - 10, x + 1, inward > 0 ? y + 10 : y);
    }
  }

  /** A bar line across the staff. */
  barline(x: number): void {
    this.rect(x - 1, this.lineYs[0], x + 2, this.lineYs[4] + 1);
    this.barlines.push({ x: x + 0.5 });
  }

  /** The strip as a recognizer input (staff from x = 20 to width - 20). */
  input(): StaffInput {
    const w = this.width;
    const h = this.height;
    const x0 = 20;
    const x1 = w - 20;
    const binary = this.symbols.slice();
    const lineMask = new Uint8Array(w * h);
    for (const ly of this.lineYs) {
      for (let y = Math.round(ly - this.thickness / 2); y < Math.round(ly + this.thickness / 2); y++) {
        for (let x = x0; x < x1; x++) {
          binary[y * w + x] = 1;
          if (!this.symbols[y * w + x]) lineMask[y * w + x] = 1;
        }
      }
    }
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) gray[i] = binary[i] ? 0 : 255;
    const bars = this.barlines.map((b) => ({ x: b.x, x0: b.x - 1.5, x1: b.x + 1.5, type: 'single' as const, confidence: 1 }));
    const edges = [x0, ...bars.map((b) => b.x), x1];
    const measures = edges.slice(0, -1).map((e, i) => ({ index: i, x0: e, x1: edges[i + 1] }));
    return {
      index: 0,
      staffId: 's0.st0',
      kind: 'notation',
      kindConfidence: 1,
      lineCount: 5,
      gray: { width: w, height: h, data: gray },
      binary: { width: w, height: h, data: binary },
      noLines: { width: w, height: h, data: this.symbols.slice() },
      lineMask: { width: w, height: h, data: lineMask },
      space: this.space,
      lineThickness: this.thickness,
      lineYs: this.lineYs.slice(),
      x0,
      x1,
      barlines: bars,
      measures,
      scale: 1,
      sourceSpace: this.space,
      toPage: (x, y) => ({ x, y }),
      toPageBox: (x, y, bw, bh) => ({ x, y, w: bw, h: bh }),
      fromPage: (x, y) => ({ x, y }),
      page: { gray: { width: w, height: h, data: gray }, width: w, height: h },
    };
  }
}
