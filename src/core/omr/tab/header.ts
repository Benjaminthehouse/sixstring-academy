/**
 * The big glyphs of a tab staff that are not fret numbers: the numerals of a time signature after
 * the clef, and rests standing among the numbers. Several staff lines cross them, so they are
 * read from the line-free binary strip, against the music-font templates.
 */
import type { Components } from '../image/cc';
import type { BinaryImage } from '../image/gray';
import type { DurationValue } from '../types';
import { type Box, classifyPatch, patchFromBinary } from './glyph';
import { type StripGeometry, nearBarline } from './segment';
import type { GlyphTemplate } from './templates';

/** A time signature read from the staff. */
export interface TimeSignatureReading {
  beats: number;
  beatValue: number;
  box: Box;
  confidence: number;
}

/** A rest printed in the staff. */
export interface RestReading {
  value: DurationValue;
  box: Box;
  x: number;
  confidence: number;
}

interface Tall {
  box: Box;
  cy: number;
}

/** Components taller than a fret number inside the staff, between `xa` and `xb`. */
function tallComponents(cc: Components, dy: number, g: StripGeometry, xa: number, xb: number, minH: number, maxH: number): Tall[] {
  const sp = g.space;
  const top = g.lineYs[0];
  const bottom = g.lineYs[g.lineYs.length - 1];
  const out: Tall[] = [];
  for (let c = 1; c <= cc.count; c++) {
    const h = cc.y1[c] - cc.y0[c] + 1;
    const w = cc.x1[c] - cc.x0[c] + 1;
    if (h < minH * sp || h > maxH * sp || w < 0.4 * sp || w > 2.2 * sp) continue;
    const cx = (cc.x0[c] + cc.x1[c] + 1) / 2;
    if (cx < xa || cx > xb) continue;
    const y0 = cc.y0[c] + dy;
    const y1 = cc.y1[c] + 1 + dy;
    if (y0 < top - 0.6 * sp || y1 > bottom + 0.6 * sp) continue;
    // A solid shape, not a thin arc or a stray stroke.
    if (cc.area[c] < 0.12 * w * h) continue;
    out.push({ box: { x0: cc.x0[c], y0, x1: cc.x1[c] + 1, y1 }, cy: (y0 + y1) / 2 });
  }
  return out;
}

const BEAT_VALUES = new Set([1, 2, 4, 8, 16]);

/**
 * Read a time signature printed in the tab staff: two numerals (or groups of numerals), one
 * above the other, each about two spaces tall, within a few spaces of the clef. `templates` is a
 * sharp or lightly blurred template set (the music-font numerals are among the digit classes).
 */
export function readTimeSignature(noLines: BinaryImage, cc: Components, dy: number, g: StripGeometry, clefEnd: number, templates: GlyphTemplate[]): TimeSignatureReading | null {
  const sp = g.space;
  const mid = (g.lineYs[0] + g.lineYs[g.lineYs.length - 1]) / 2;
  const from = Math.max(clefEnd, g.x0);
  const cands = tallComponents(cc, dy, g, from, from + 5.5 * sp, 1.3, 2.9).filter((t) => !nearBarline(g, t.box.x0, t.box.x1, 0.2 * sp)).sort((a, b) => a.box.x0 - b.box.x0);
  if (cands.length < 2) return null;
  const read = (list: Tall[]): { value: number; score: number } | null => {
    if (!list.length || list.length > 2) return null;
    let value = 0;
    let score = 1;
    for (const t of list) {
      const r = classifyPatch(patchFromBinary(noLines, t.box), templates, { allow: (q) => q.cls < 10 && (q.music || q.weight >= 600) })[0];
      if (!r) return null;
      value = value * 10 + r.cls;
      score = Math.min(score, r.score);
    }
    return { value, score };
  };
  for (const first of cands) {
    if (first.cy >= mid) continue;
    // Everything stacked with it: same column, within one glyph width.
    const span = { x0: first.box.x0 - 1.3 * sp, x1: first.box.x1 + 1.3 * sp };
    const group = cands.filter((t) => t.box.x1 > span.x0 && t.box.x0 < span.x1);
    const upper = group.filter((t) => t.cy < mid);
    const lower = group.filter((t) => t.cy >= mid);
    const a = read(upper);
    const b = read(lower);
    if (!a || !b || a.value < 1 || a.value > 16 || !BEAT_VALUES.has(b.value)) continue;
    const score = Math.min(a.score, b.score);
    if (score < 0.6) continue;
    const box: Box = {
      x0: Math.min(...group.map((t) => t.box.x0)),
      y0: Math.min(...group.map((t) => t.box.y0)),
      x1: Math.max(...group.map((t) => t.box.x1)),
      y1: Math.max(...group.map((t) => t.box.y1)),
    };
    return { beats: a.value, beatValue: b.value, box, confidence: Math.max(0.3, Math.min(0.95, (score - 0.45) / 0.4)) };
  }
  return null;
}

const REST_VALUE: Record<string, DurationValue> = { rq: 'quarter', r8: 'eighth', r16: '16th' };
/** Height of each rest in staff spaces, as engraved (generous bounds). */
const REST_HEIGHT: Record<string, [number, number]> = { rq: [2.0, 3.6], r8: [1.2, 2.4], r16: [1.9, 3.3] };

/**
 * Find rests printed among the numbers: tall solid shapes inside the staff, away from the bar
 * lines and the header, that correlate with a rest template of a matching height.
 */
export function findRests(noLines: BinaryImage, cc: Components, dy: number, g: StripGeometry, fromX: number, templates: GlyphTemplate[]): RestReading[] {
  const sp = g.space;
  const out: RestReading[] = [];
  for (const t of tallComponents(cc, dy, g, fromX, g.x1 - 0.4 * sp, 1.2, 3.7)) {
    if (nearBarline(g, t.box.x0, t.box.x1, 0.25 * sp)) continue;
    const ranked = classifyPatch(patchFromBinary(noLines, t.box), templates, { allow: (q) => q.label in REST_VALUE });
    const r = ranked[0];
    if (!r || r.score < 0.55) continue;
    const h = (t.box.y1 - t.box.y0) / sp;
    const [lo, hi] = REST_HEIGHT[r.label];
    if (h < lo || h > hi) continue;
    const lead = r.score - (ranked[1]?.score ?? 0);
    out.push({ value: REST_VALUE[r.label], box: t.box, x: (t.box.x0 + t.box.x1) / 2, confidence: Math.max(0.2, Math.min(0.9, (r.score - 0.45) / 0.4)) * (lead < 0.05 ? 0.7 : 1) });
  }
  return out.sort((a, b) => a.x - b.x);
}
