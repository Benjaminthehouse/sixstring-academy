/**
 * Technique marks drawn between or beside fret numbers, in the simple cases an engraver's
 * conventions make recognisable without reading text:
 *
 * - an arc from one number to the next on the same string: a tie when the two frets are equal
 *   (the second note is not struck again), otherwise a slur, i.e. a hammer-on or pull-off;
 * - a straight slanted stroke between two numbers of a string: a slide, up or down;
 * - a stroke that leaves a number and climbs above the staff, ending in an arrow head: a bend.
 *
 * Marks printed as glyphs on the line itself (x, brackets, the letters of typewriter-style tab)
 * are read with the numbers, in `numbers.ts`.
 */
import type { BinaryImage } from '../image/gray';
import type { TabNumber } from './numbers';
import { type StripGeometry, nearBarline } from './segment';

/** A mark found between two numbers (or on one). */
export interface TabMark {
  kind: 'tie' | 'slur' | 'slide-up' | 'slide-down' | 'bend';
  from: TabNumber;
  to?: TabNumber;
  /** Box of the stroke in strip px (x0, y0, x1, y1). */
  box: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

/** Numbers of each string line, left to right. */
function byLine(numbers: TabNumber[], lines: number): TabNumber[][] {
  const out: TabNumber[][] = Array.from({ length: lines }, () => []);
  for (const q of numbers) if (out[q.line]) out[q.line].push(q);
  for (const row of out) row.sort((a, b) => a.x0 - b.x0);
  return out;
}

/**
 * Arcs: between two neighbouring numbers of a string, a thin bowed stroke over them (or under
 * them) whose ends come down on the two numbers. Column by column, the ink above the numbers is
 * reduced to one height; a parabola is fitted through these; it is an arc when it is bowed, the
 * ink follows it closely and spans the stretch between the numbers. Where an arc touches the
 * neighbouring string line it vanished with that line: columns in which the fitted curve runs
 * inside that line count as covered.
 */
export function findArcs(noLines: BinaryImage, g: StripGeometry, numbers: TabNumber[], digitHeight: number): TabMark[] {
  const sp = g.space;
  const out: TabMark[] = [];
  const rows = byLine(numbers, g.lineYs.length);
  const { width: w, height: h, data } = noLines;
  rows.forEach((row, line) => {
    const ly = g.lineYs[line];
    for (let i = 0; i + 1 < row.length; i++) {
      const a = row[i];
      const b = row[i + 1];
      const xa = Math.round((a.x0 + a.x1) / 2);
      const xb = Math.round((b.x0 + b.x1) / 2);
      const span = xb - xa;
      if (span < 1.0 * sp || span > 12 * sp) continue;
      for (const side of [-1, 1]) {
        // The band over (side -1) or under (side +1) the two numbers.
        const near = ly + side * (0.5 * digitHeight - 1);
        const far = ly + side * 1.5 * sp;
        const ya = Math.max(0, Math.round(Math.min(near, far)));
        const yb = Math.min(h - 1, Math.round(Math.max(near, far)));
        if (yb - ya < 0.3 * sp) continue;
        const ys = new Float32Array(span + 1).fill(-1);
        let n = 0, sx2 = 0, sx4 = 0, sy = 0, sx2y = 0;
        const xm = (xa + xb) / 2;
        for (let x = xa; x <= xb; x++) {
          let sum = 0;
          let k = 0;
          for (let y = ya; y <= yb; y++) {
            if (data[y * w + x]) {
              sum += y;
              k++;
            }
          }
          // One thin stroke per column; a column full of ink is something else (a number, a stem).
          if (!k || k > 0.3 * sp) continue;
          const yc = sum / k;
          ys[x - xa] = yc;
          const u = (x - xm) * (x - xm);
          n++;
          sx2 += u; sx4 += u * u; sy += yc; sx2y += u * yc;
        }
        if (n < 0.4 * span) continue;
        // Least squares for y = c + q * (x - xm)^2 (an arc between two numbers is symmetric).
        const den = n * sx4 - sx2 * sx2;
        if (Math.abs(den) < 1e-6) continue;
        const q = (n * sx2y - sx2 * sy) / den;
        const c0 = (sy - q * sx2) / n;
        const bow = side * -q * (span / 2) * (span / 2); // how far the middle stands away from the numbers
        if (bow < 0.1 * sp || bow > 1.3 * sp) continue;
        let res = 0;
        let covered = 0;
        let first = -1;
        let last = -1;
        const other = g.lineYs[line + side];
        for (let x = xa; x <= xb; x++) {
          const fit = c0 + q * (x - xm) * (x - xm);
          const yc = ys[x - xa];
          if (yc >= 0) {
            res += (yc - fit) * (yc - fit);
            if (Math.abs(yc - fit) <= 0.15 * sp) {
              covered++;
              if (first < 0) first = x - xa;
              last = x - xa;
            }
          } else if (other !== undefined && Math.abs(fit - other) <= g.lineThickness / 2 + 2) {
            covered++; // hidden in the neighbouring line
          }
        }
        const rms = Math.sqrt(res / n);
        if (rms > 0.12 * sp || covered < 0.7 * span || first > 0.3 * span || last < 0.7 * span) continue;
        const same = !a.dead && !b.dead && a.fret === b.fret;
        out.push({
          kind: same ? 'tie' : 'slur',
          from: a,
          to: b,
          box: { x0: xa, y0: ya, x1: xb + 1, y1: yb + 1 },
          confidence: Math.max(0.3, Math.min(0.9, 0.45 + bow / sp + covered / span / 4 - rms / sp)),
        });
        break;
      }
    }
  });
  return out;
}

/**
 * Slides: between two neighbouring numbers of a string, a thin straight stroke that crosses the
 * line at a slant. The ink between the two numbers (line-free strip) is fitted with a straight
 * line; it is a slide when it spans most of the gap, is clearly tilted and lies close to the fit.
 */
export function findSlides(noLines: BinaryImage, g: StripGeometry, numbers: TabNumber[]): TabMark[] {
  const sp = g.space;
  const out: TabMark[] = [];
  const rows = byLine(numbers, g.lineYs.length);
  rows.forEach((row, line) => {
    const ly = g.lineYs[line];
    for (let i = 0; i + 1 < row.length; i++) {
      const a = row[i];
      const b = row[i + 1];
      const xa = Math.ceil(a.x1 + 0.08 * sp);
      const xb = Math.floor(b.x0 - 0.08 * sp);
      const gap = xb - xa;
      if (gap < 0.45 * sp || gap > 7 * sp) continue;
      if (nearBarline(g, xa, xb, 0)) continue;
      const ya = Math.max(0, Math.round(ly - 0.46 * sp));
      const yb = Math.min(noLines.height - 1, Math.round(ly + 0.46 * sp));
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      const cols = new Uint8Array(gap + 1);
      for (let x = xa; x <= xb; x++) {
        for (let y = ya; y <= yb; y++) {
          if (!noLines.data[y * noLines.width + x]) continue;
          n++;
          sx += x; sy += y; sxx += x * x; sxy += x * y;
          cols[x - xa] = 1;
        }
      }
      if (n < 0.5 * gap) continue;
      let covered = 0;
      let first = -1;
      let last = -1;
      for (let k = 0; k <= gap; k++) {
        if (!cols[k]) continue;
        covered++;
        if (first < 0) first = k;
        last = k;
      }
      // The stroke runs from number to number; where it passes through the staff line some of it is gone.
      if (last - first < 0.7 * gap || covered < 0.45 * gap) continue;
      const den = n * sxx - sx * sx;
      if (den <= 0) continue;
      const slope = (n * sxy - sx * sy) / den;
      const icept = (sy - slope * sx) / n;
      let res = 0;
      for (let x = xa; x <= xb; x++) {
        for (let y = ya; y <= yb; y++) {
          if (!noLines.data[y * noLines.width + x]) continue;
          const d = y - (icept + slope * x);
          res += d * d;
        }
      }
      const rms = Math.sqrt(res / n);
      const rise = Math.abs(slope) * (last - first);
      // Thin and straight (an arc or a second number would leave a large residue), and tilted.
      if (rms > 0.11 * sp || rise < 0.22 * sp || n > 0.3 * sp * (last - first + 1)) continue;
      out.push({
        kind: slope < 0 ? 'slide-up' : 'slide-down',
        from: a,
        to: b,
        box: { x0: xa + first, y0: ya, x1: xa + last + 1, y1: yb + 1 },
        confidence: Math.max(0.3, Math.min(0.9, 0.5 + rise / sp - rms / sp)),
      });
    }
  });
  return out;
}

/**
 * Bends: right of a number, an upright stroke that climbs from the number's line to well above
 * the staff and ends in an arrow head (the stroke widens at its tip). Looked for in the strip
 * with its lines, so that the stroke is unbroken where it crosses them.
 */
export function findBends(bin: BinaryImage, g: StripGeometry, numbers: TabNumber[]): TabMark[] {
  const sp = g.space;
  const top = g.lineYs[0];
  const { width: w, height: h, data } = bin;
  const out: TabMark[] = [];
  const probe = Math.round(top - 0.9 * sp);
  if (probe < 2) return out;
  for (const q of numbers) {
    if (q.dead) continue;
    const ly = g.lineYs[q.line];
    const xa = Math.round(q.x1 + 0.25 * sp);
    const xb = Math.min(w - 1, Math.round(q.x1 + 2.6 * sp));
    let best: { x: number; y0: number; y1: number } | null = null;
    for (let x = xa; x <= xb; x++) {
      if (!data[probe * w + x]) continue;
      let y0 = probe;
      let y1 = probe;
      while (y0 > 0 && data[(y0 - 1) * w + x]) y0--;
      while (y1 < h - 1 && data[(y1 + 1) * w + x]) y1++;
      // The tip is well above the staff; the shaft comes down towards the number's line, but
      // does not go on through the staff the way a bar line does.
      if (y0 > top - 1.15 * sp || y1 < top - 0.75 * sp || y1 > ly + 0.35 * sp) continue;
      if (!best || y0 < best.y0) best = { x, y0, y1 };
    }
    if (!best || nearBarline(g, best.x - 1, best.x + 2, 0.1 * sp)) continue;
    // The arrow head: near the tip the ink spreads to both sides of the shaft (a flag on a stem
    // spreads to one side only), and below it the shaft is thin again.
    let head = 0;
    let headLeft = 0;
    let headRight = 0;
    let shaft = Infinity;
    for (let y = best.y0; y <= Math.min(best.y1, best.y0 + Math.round(1.3 * sp)); y++) {
      let a = best.x;
      let b = best.x;
      while (a > 0 && data[y * w + a - 1]) a--;
      while (b < w - 1 && data[y * w + b + 1]) b++;
      const run = b - a + 1;
      if (y <= best.y0 + 0.65 * sp) {
        if (run > head) {
          head = run;
          headLeft = best.x - a;
          headRight = b - best.x;
        }
      } else shaft = Math.min(shaft, run);
    }
    if (head < 0.3 * sp || head > 1.2 * sp || headLeft < 0.08 * sp || headRight < 0.08 * sp) continue;
    if (Number.isFinite(shaft) && shaft > 0.55 * head) continue;
    out.push({ kind: 'bend', from: q, box: { x0: best.x - headLeft, y0: best.y0, x1: best.x + headRight + 1, y1: best.y1 + 1 }, confidence: 0.7 });
  }
  // One arrow belongs to one number: the nearest on its left.
  const seen = new Map<number, TabMark>();
  for (const m of out) {
    const key = Math.round(m.box.x0 / (0.5 * sp));
    const cur = seen.get(key);
    if (!cur || m.box.x0 - m.from.x1 < cur.box.x0 - cur.from.x1) seen.set(key, m);
  }
  return [...seen.values()];
}

/**
 * Write the marks onto the numbers: a tie sets `tieStop` on the second number; a slur becomes
 * 'h' (to a higher fret) or 'p' on the first; slides '/' and '\\'; a bend 'b'. A mark already
 * read as a glyph on the line wins over the drawn one.
 */
export function applyMarks(marks: TabMark[]): void {
  for (const m of marks) {
    if (m.kind === 'tie') {
      if (m.to) m.to.tieStop = true;
      continue;
    }
    if (m.from.technique) continue;
    if (m.kind === 'slur' && m.to) m.from.technique = m.to.fret >= m.from.fret ? 'h' : 'p';
    else if (m.kind === 'slide-up') m.from.technique = '/';
    else if (m.kind === 'slide-down') m.from.technique = '\\';
    else if (m.kind === 'bend') m.from.technique = 'b';
  }
}
