/**
 * The start of a staff: clef, key signature and time signature.
 *
 * - Clef: the G clef (or F / C clef) glyph is searched at the left end of the staff.
 * - Key signature: sharps or flats are matched one after the other at the staff positions the
 *   convention prescribes (F C G D A E B / B E A D G C F), so a stray accidental cannot pass.
 * - Time signature: the next block of ink that fills the staff height is split into its two
 *   stacked numbers (or kept whole for C / cut C) and each number is compared with the digit
 *   glyphs scaled to its size, because engravers print time signatures in very different sizes.
 */
import type { ClefType } from '../types';
import { type Match, coarseToFine, matchAt } from './match';
import { type Strip, posY } from './strip';
import { type Template, scaleTemplate, templatesOf } from './templates';

/** A symbol of the staff header with its box in strip px. */
export interface HeaderItem<T> {
  value: T;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
  alternatives?: { value: T; confidence: number }[];
}

/** What {@link readHeader} found. */
export interface Header {
  clef: HeaderItem<ClefType> | null;
  /** Fifths: sharps positive, flats negative. */
  key: HeaderItem<number> | null;
  time: HeaderItem<{ beats: number; beatValue: number; symbol?: 'common' | 'cut' }> | null;
  /** First column of the music (right of everything read here). */
  endX: number;
}

/** Staff positions of the sharps / flats of a key signature in treble clef, in order. */
export const SHARP_POSITIONS = [8, 5, 9, 6, 3, 7, 4];
export const FLAT_POSITIONS = [4, 7, 3, 6, 2, 5, 1];

const box = (m: Match): { x0: number; y0: number; x1: number; y1: number } => {
  const t = m.template;
  const x0 = m.x - t.ox + t.pad;
  const y0 = m.y - t.oy + t.pad;
  return { x0, y0, x1: x0 + t.glyphWidth, y1: y0 + t.glyphHeight };
};

function readClef(strip: Strip): HeaderItem<ClefType> | null {
  const { s } = strip;
  const candidates: { type: ClefType; glyph: string; pos: number }[] = [
    { type: 'treble-8vb', glyph: 'gClef', pos: 2 },
    { type: 'bass', glyph: 'fClef', pos: 6 },
  ];
  const found: { type: ClefType; m: Match }[] = [];
  for (const c of candidates) {
    // The clef starts within the first two spaces of the staff (after an opening bar line, if any).
    const m = coarseToFine(strip, templatesOf(c.glyph), strip.x0 + 1.2 * s, posY(strip, c.pos), Math.round(1.4 * s), 4, 3);
    if (m) found.push({ type: c.type, m });
  }
  found.sort((a, b) => b.m.score - a.m.score);
  const best = found[0];
  if (!best || best.m.score < 0.35) return null;
  const second = found[1]?.m.score ?? 0;
  const b = box(best.m);
  return {
    value: best.type,
    ...b,
    confidence: Math.max(0.05, Math.min(1, (best.m.score - 0.3) / 0.4)) * (best.m.score - second > 0.1 ? 1 : 0.6),
    alternatives: found.slice(1).filter((f) => f.m.score > 0.3).map((f) => ({ value: f.type, confidence: Math.max(0, Math.min(1, (f.m.score - 0.3) / 0.4)) * 0.5 })),
  };
}

/** Columns [from, to) of `nl` that hold ink within the rows [ya, yb). */
function columnInk(strip: Strip, from: number, to: number, ya: number, yb: number): Uint16Array {
  const { w, h, nl } = strip;
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(w, Math.ceil(to));
  const out = new Uint16Array(Math.max(0, b - a));
  for (let y = Math.max(0, Math.floor(ya)); y < Math.min(h, Math.ceil(yb)); y++) {
    const o = y * w;
    for (let x = a; x < b; x++) if (nl[o + x]) out[x - a]++;
  }
  return out;
}

function readKey(strip: Strip, fromX: number, clefShift: number): { item: HeaderItem<number> | null; endX: number } {
  const { s } = strip;
  const chains: { fifths: number; x1: number; x0: number; y0: number; y1: number; score: number; scores: number[] }[] = [];
  for (const kind of ['sharp', 'flat'] as const) {
    const templates = templatesOf(kind === 'sharp' ? 'accidentalSharp' : 'accidentalFlat');
    const positions = kind === 'sharp' ? SHARP_POSITIONS : FLAT_POSITIONS;
    let x = fromX;
    let count = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const scores: number[] = [];
    for (let k = 0; k < 7; k++) {
      // The first accidental follows the clef after a small gap; the next ones are packed.
      const reach = k === 0 ? 1.6 * s : 0.8 * s;
      const m = coarseToFine(strip, templates, x + reach / 2, posY(strip, positions[k] + clefShift), Math.ceil(reach / 2), 2, 2);
      if (!m || m.score < 0.55) break;
      const b = box(m);
      scores.push(m.score);
      count++;
      x0 = Math.min(x0, b.x0);
      y0 = Math.min(y0, b.y0);
      y1 = Math.max(y1, b.y1);
      x = b.x1 - 0.1 * s;
    }
    if (count) chains.push({ fifths: kind === 'sharp' ? count : -count, x0, x1: x + 0.1 * s, y0, y1, score: scores.reduce((a, b) => a + b, 0) / count, scores });
  }
  if (!chains.length) return { item: null, endX: fromX };
  chains.sort((a, b) => Math.abs(b.fifths) * b.score - Math.abs(a.fifths) * a.score);
  const best = chains[0];
  const alt = chains[1];
  const alternatives: { value: number; confidence: number }[] = [];
  if (alt) alternatives.push({ value: alt.fifths, confidence: 0.3 * alt.score });
  const weakest = Math.min(...best.scores);
  if (Math.abs(best.fifths) > 1 && weakest < 0.7) alternatives.push({ value: best.fifths - Math.sign(best.fifths), confidence: 0.3 });
  return {
    item: { value: best.fifths, x0: best.x0, y0: best.y0, x1: best.x1, y1: best.y1, confidence: Math.max(0.3, Math.min(1, (weakest - 0.45) / 0.3)), alternatives },
    endX: best.x1,
  };
}

const scaledCache = new Map<string, Template>();

function scaled(t: Template, scale: number): Template {
  const q = Math.round(scale * 20) / 20;
  if (q === 1) return t;
  const key = `${t.font}|${t.glyph}|${q}`;
  let v = scaledCache.get(key);
  if (!v) {
    v = scaleTemplate(t, q);
    scaledCache.set(key, v);
  }
  return v;
}

/** One reading of a blob as a glyph. */
export interface GlyphGuess {
  glyph: string;
  score: number;
}

/**
 * Compare the ink in a box with glyphs scaled to the height of the box (digits, C, cut C).
 * Returns the guesses, best first.
 */
export function classifyBox(strip: Strip, x0: number, y0: number, x1: number, y1: number, glyphs: string[]): GlyphGuess[] {
  const bw = x1 - x0;
  const bh = y1 - y0;
  const out: GlyphGuess[] = [];
  for (const glyph of glyphs) {
    let best = -1;
    for (const t0 of templatesOf(glyph)) {
      const scale = bh / t0.glyphHeight;
      if (scale < 0.3 || scale > 2.6) continue;
      const tw = t0.glyphWidth * scale;
      if (tw < 0.6 * bw || tw > 1.5 * bw) continue;
      const t = scaled(t0, scale);
      // Align the glyph box with the ink box (centred horizontally), then wiggle.
      const ox = x0 + (bw - t.glyphWidth) / 2 + (t.ox - t.pad);
      const oy = y0 + (t.oy - t.pad);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const sc = matchAt(strip, t, ox + dx, oy + dy);
          if (sc > best) best = sc;
        }
      }
    }
    if (best > -1) out.push({ glyph, score: best });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

const DIGITS = ['timeSig0', 'timeSig1', 'timeSig2', 'timeSig3', 'timeSig4', 'timeSig5', 'timeSig6', 'timeSig7', 'timeSig8', 'timeSig9'];

/** Tight box of the ink of `nl` inside a box, or null when there is none. */
export function inkBox(strip: Strip, x0: number, y0: number, x1: number, y1: number): { x0: number; y0: number; x1: number; y1: number; area: number } | null {
  const { w, h, nl } = strip;
  let ax = Infinity;
  let ay = Infinity;
  let bx = -1;
  let by = -1;
  let area = 0;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) {
      if (!nl[y * w + x]) continue;
      area++;
      if (x < ax) ax = x;
      if (x > bx) bx = x;
      if (y < ay) ay = y;
      if (y > by) by = y;
    }
  }
  return area ? { x0: ax, y0: ay, x1: bx + 1, y1: by + 1, area } : null;
}

/** Read a number (one or two digits) from the ink in a box. */
function readNumber(strip: Strip, x0: number, y0: number, x1: number, y1: number): { value: number; score: number; alternatives: { value: number; score: number }[] } | null {
  const b = inkBox(strip, x0, y0, x1, y1);
  if (!b) return null;
  const single = classifyBox(strip, b.x0, b.y0, b.x1, b.y1, DIGITS);
  const digit = (g: GlyphGuess): number => Number(g.glyph.slice(-1));
  let best = single.length ? { value: digit(single[0]), score: single[0].score, alternatives: single.slice(1, 3).map((g) => ({ value: digit(g), score: g.score })) } : null;
  // Two digits side by side ("12"): split at the emptiest column near the middle.
  if ((b.x1 - b.x0) > 0.9 * (b.y1 - b.y0)) {
    const cols = columnInk(strip, b.x0, b.x1, b.y0, b.y1);
    let cut = -1;
    let least = Infinity;
    for (let i = Math.floor(cols.length * 0.3); i < cols.length * 0.7; i++) {
      if (cols[i] < least) { least = cols[i]; cut = i; }
    }
    if (cut > 0 && least <= 0.1 * (b.y1 - b.y0)) {
      const l = inkBox(strip, b.x0, b.y0, b.x0 + cut, b.y1);
      const r = inkBox(strip, b.x0 + cut, b.y0, b.x1, b.y1);
      if (l && r) {
        const gl = classifyBox(strip, l.x0, l.y0, l.x1, l.y1, DIGITS)[0];
        const gr = classifyBox(strip, r.x0, r.y0, r.x1, r.y1, DIGITS)[0];
        if (gl && gr) {
          const sc = Math.min(gl.score, gr.score);
          if (!best || sc > best.score) best = { value: digit(gl) * 10 + digit(gr), score: sc, alternatives: best ? [{ value: best.value, score: best.score }] : [] };
        }
      }
    }
  }
  return best;
}

function readTime(strip: Strip, fromX: number): { item: Header['time']; endX: number } {
  const { s } = strip;
  const mid = posY(strip, 4);
  // Blocks of ink (separated by blank columns) in the stretch after the key signature. A time
  // signature is the first block that reaches into both halves of the staff and is 1-3 spaces wide.
  const span = Math.round(5.5 * s);
  const cols = columnInk(strip, fromX, fromX + span, strip.top - 2.2 * s, strip.bottom + 2.2 * s);
  let i = 0;
  const gapMax = Math.round(0.25 * s);
  while (i < cols.length) {
    while (i < cols.length && cols[i] === 0) i++;
    if (i >= cols.length) break;
    let j = i;
    let gap = 0;
    let end = i;
    while (j < cols.length && gap <= gapMax) {
      if (cols[j] > 0) { end = j; gap = 0; } else gap++;
      j++;
    }
    const xa = fromX + i;
    const xb = fromX + end + 1;
    i = end + 1;
    const b = inkBox(strip, xa, strip.top - 2.2 * s, xb, strip.bottom + 2.2 * s);
    if (!b) continue;
    const width = b.x1 - b.x0;
    if (width < 0.9 * s) continue; // specks, a bar line
    if (width > 3.6 * s) break; // music
    const upper = inkBox(strip, b.x0, b.y0, b.x1, mid);
    const lower = inkBox(strip, b.x0, mid, b.x1, b.y1);
    if (!upper || !lower || upper.y1 - upper.y0 < 0.8 * s || lower.y1 - lower.y0 < 0.8 * s) break;
    // Two stacked numbers meet near the middle line: cut at the emptiest row there.
    let split = Math.round(mid);
    {
      const { w, nl } = strip;
      let least = Infinity;
      for (let y = Math.round(mid - 0.6 * s); y <= Math.round(mid + 0.6 * s); y++) {
        let n = 0;
        for (let x = b.x0; x < b.x1; x++) n += nl[y * w + x];
        // Prefer the middle line itself among equally empty rows.
        const cost = n + 0.02 * Math.abs(y - mid);
        if (cost < least) { least = cost; split = y; }
      }
    }
    const top = readNumber(strip, b.x0, b.y0, b.x1, split);
    const bottom = readNumber(strip, b.x0, split, b.x1, b.y1);
    const digitScore = top && bottom ? Math.min(top.score, bottom.score) : -1;
    const g = classifyBox(strip, b.x0, b.y0, b.x1, b.y1, ['timeSigCommon', 'timeSigCutCommon']);
    const symbolScore = g.length ? g[0].score : -1;
    if (top && bottom && digitScore >= 0.4 && digitScore >= symbolScore) {
      const validBottom = [1, 2, 4, 8, 16, 32].includes(bottom.value);
      const conf = Math.max(0.1, Math.min(1, (digitScore - 0.4) / 0.3)) * (validBottom && top.value > 0 ? 1 : 0.3);
      const alternatives: { value: { beats: number; beatValue: number }; confidence: number }[] = [];
      for (const a of top.alternatives) if (a.value > 0) alternatives.push({ value: { beats: a.value, beatValue: bottom.value }, confidence: 0.4 * Math.max(0, a.score) });
      for (const a of bottom.alternatives) if ([2, 4, 8, 16].includes(a.value)) alternatives.push({ value: { beats: top.value, beatValue: a.value }, confidence: 0.4 * Math.max(0, a.score) });
      alternatives.sort((p, q) => q.confidence - p.confidence);
      return { item: { value: { beats: top.value, beatValue: bottom.value }, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, confidence: conf, alternatives: alternatives.slice(0, 3) }, endX: b.x1 };
    }
    if (g.length && symbolScore >= 0.5) {
      const cut = g[0].glyph === 'timeSigCutCommon';
      return {
        item: { value: cut ? { beats: 2, beatValue: 2, symbol: 'cut' } : { beats: 4, beatValue: 4, symbol: 'common' }, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, confidence: Math.min(1, (symbolScore - 0.4) / 0.3) },
        endX: b.x1,
      };
    }
    break;
  }
  return { item: null, endX: fromX };
}

/** Read clef, key signature and time signature at the start of the staff. */
export function readHeader(strip: Strip): Header {
  const clef = readClef(strip);
  let x = clef ? clef.x1 : strip.x0;
  // In bass clef the whole key-signature pattern sits one line lower.
  const key = readKey(strip, x - 0.1 * strip.s, clef?.value === 'bass' ? -2 : 0);
  x = Math.max(x, key.endX);
  const time = readTime(strip, x);
  x = Math.max(x, time.endX);
  return { clef, key: key.item, time: time.item, endX: x };
}
