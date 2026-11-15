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
import { type Match, coarseToFine, matchAt, searchMatch } from './match';
import { classifyHead, measureHead } from './heads';
import { type Strip, posAt, posY } from './strip';
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
    // The clef starts within the first two spaces of the staff; when the staff's left end was
    // found a little late (a photo), part of the clef lies before it.
    const m = coarseToFine(strip, templatesOf(c.glyph), strip.x0 + 0.4 * s, posY(strip, c.pos), Math.round(2.2 * s), 4, 3);
    if (m) found.push({ type: c.type, m });
  }
  found.sort((a, b) => b.m.score - a.m.score);
  const best = found[0];
  // (A weak match is usually something else: the time signature of a staff whose clef is cut off.)
  const second = found[1]?.m.score ?? 0;
  if (!best || best.m.score < 0.42 || (best.m.score < 0.5 && best.m.score - second < 0.1)) return null;
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

function readKey(strip: Strip, fromX: number, clefShift: number, firstReach = 1.4): { item: HeaderItem<number> | null; endX: number } {
  const { s } = strip;
  const chains: { fifths: number; x1: number; x0: number; y0: number; y1: number; score: number; scores: number[]; boxes: { x0: number; y0: number; x1: number; y1: number }[] }[] = [];
  for (const kind of ['sharp', 'flat'] as const) {
    const templates = templatesOf(kind === 'sharp' ? 'accidentalSharp' : 'accidentalFlat');
    const positions = kind === 'sharp' ? SHARP_POSITIONS : FLAT_POSITIONS;
    let x = fromX;
    let count = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const scores: number[] = [];
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let k = 0; k < 7; k++) {
      // The first accidental follows the clef after a small gap; the next ones are packed.
      const reach = k === 0 ? firstReach * s : 0.8 * s;
      const m = coarseToFine(strip, templates, x + reach / 2, posY(strip, positions[k] + clefShift), Math.ceil(reach / 2), 2, 2);
      if (!m || m.score < 0.55) break;
      const b = box(m);
      scores.push(m.score);
      boxes.push(b);
      count++;
      x0 = Math.min(x0, b.x0);
      y0 = Math.min(y0, b.y0);
      y1 = Math.max(y1, b.y1);
      x = b.x1 - 0.1 * s;
    }
    if (count) chains.push({ fifths: kind === 'sharp' ? count : -count, x0, x1: x + 0.1 * s, y0, y1, score: scores.reduce((a, b) => a + b, 0) / count, scores, boxes });
  }
  if (!chains.length) return { item: null, endX: fromX };
  chains.sort((a, b) => Math.abs(b.fifths) * b.score - Math.abs(a.fifths) * a.score);
  const best = chains[0];
  // A lone flat or sharp may be a rest that starts the staff (a sixteenth rest has a flat's outline).
  if (Math.abs(best.fifths) === 1) {
    const b0 = best.boxes[0];
    let rest = 0;
    for (const glyph of ['rest8th', 'rest16th', 'restQuarter']) {
      for (const t of templatesOf(glyph)) {
        const m = searchMatch(strip, t, b0.x0 + (t.ox - t.pad), posY(strip, 4 + clefShift), 6, 3, 2);
        if (m.score > rest) rest = m.score;
      }
    }
    if (rest > best.scores[0]) return { item: null, endX: fromX };
    // A lone flat may also be the stem of the first note: a stem-down note has its head at the top
    // right of the stroke, a stem-up note at the bottom left (a flat's stem with nothing in its bowl).
    const headNear = (cx: number, yFrom: number, yTo: number): boolean => {
      for (let p = Math.floor(posAt(strip, yTo)); p <= Math.ceil(posAt(strip, yFrom)); p++) {
        const { feat } = measureHead(strip, cx, posY(strip, p), 2, 2);
        if (classifyHead(feat, feat.core >= 0.3 ? 'core' : 'ring', 0.6)) return true;
      }
      return false;
    };
    // (Left of the stroke only when there is room for a head after the clef: the clef's own
    // curves are not heads.)
    if (best.fifths === -1 && (headNear(b0.x0 + 0.6 * s, b0.y0 - 1.2 * s, b0.y0 + 0.2 * s) || (b0.x0 - 1.1 * s >= fromX && headNear(b0.x0 - 0.5 * s, b0.y1 - 0.2 * s, b0.y1 + 1.2 * s)))) return { item: null, endX: fromX };
  }
  // An accidental with a note head right behind it at its own height belongs to that note.
  {
    const sharp = best.fifths > 0;
    const n = Math.abs(best.fifths);
    const pos = (sharp ? SHARP_POSITIONS : FLAT_POSITIONS)[n - 1] + clefShift;
    const lastX1 = best.boxes[n - 1].x1;
    let noteBehind = false;
    for (const gap of [0.3 * s, 0.6 * s]) {
      const { feat } = measureHead(strip, lastX1 + gap + 0.6 * s, posY(strip, pos), 2, 2);
      const c = classifyHead(feat, feat.core >= 0.3 ? 'core' : 'ring', 0.6);
      if (c) noteBehind = true;
    }
    if (noteBehind) {
      if (n === 1) return { item: null, endX: fromX };
      best.fifths -= Math.sign(best.fifths);
      best.boxes.pop();
      best.scores.pop();
      best.x1 = best.boxes[n - 2].x1;
    }
  }
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

/** How usual a time signature is (added to the match score when choosing between readings). */
function metrePrior(beats: number, beatValue: number): number {
  // (One beat to the bar is not a metre anyone prints.)
  if (![2, 4, 8, 16].includes(beatValue) || beats < 2 || beats > 16) return -0.3;
  const k = `${beats}/${beatValue}`;
  if (['4/4', '3/4', '2/4', '6/8'].includes(k)) return 0.08;
  if (['3/8', '2/2', '12/8', '9/8', '5/4', '6/4', '3/2'].includes(k)) return 0.04;
  return 0;
}

/** Read the block of ink `b` as a time signature (two stacked numbers, C or cut C), or return null. */
function readTimeBlock(strip: Strip, b: { x0: number; y0: number; x1: number; y1: number }, fromX: number): { item: Header['time']; endX: number } {
  const { s } = strip;
  const mid = posY(strip, 4);
  const width = b.x1 - b.x0;
  const none = { item: null, endX: fromX };
  if (width < 0.9 * s || width > 3.6 * s) return none;
  // It fills the staff: both halves hold a good part of a number.
  if (b.y0 > mid - 0.9 * s || b.y1 < mid + 0.9 * s) return none;
  // Two stacked numbers meet at the middle line.
  let split = Math.round(mid);
  {
    const { w, nl } = strip;
    let least = Infinity;
    for (let y = Math.round(mid - 0.2 * s); y <= Math.round(mid + 0.2 * s); y++) {
      let n = 0;
      for (let x = b.x0; x < b.x1; x++) n += nl[y * w + x];
      const cost = n + 0.02 * Math.abs(y - mid);
      if (cost < least) { least = cost; split = y; }
    }
  }
  // Notes right after the key signature (later systems have no time signature) fill the staff
  // too: when the block looks more like a note head than like numbers, it is music.
  let headScore = 0;
  for (let pos = -2; pos <= 10; pos++) {
    const { feat } = measureHead(strip, (b.x0 + b.x1) / 2, posY(strip, pos), 6, 2);
    const c = classifyHead(feat, feat.core >= 0.3 ? 'core' : 'ring', 0.6);
    if (c && c.score > headScore) headScore = c.score;
  }
  const top = readNumber(strip, b.x0, b.y0, b.x1, split);
  const bottom = readNumber(strip, b.x0, split, b.x1, b.y1);
  const g = classifyBox(strip, b.x0, b.y0, b.x1, b.y1, ['timeSigCommon', 'timeSigCutCommon']);
  const symbolScore = g.length ? g[0].score : -1;
  let restScore = 0;
  for (const glyph of ['rest8th', 'rest16th', 'restQuarter']) {
    for (const t of templatesOf(glyph)) {
      const m = searchMatch(strip, t, b.x0 + (t.ox - t.pad), posY(strip, 4), 6, 3, 2);
      if (m.score > restScore) restScore = m.score;
    }
  }
  if (top && bottom) {
    // Every pairing of the best few readings of each number, weighted by how usual the metre is.
    const tops = [{ value: top.value, score: top.score }, ...top.alternatives];
    const bottoms = [{ value: bottom.value, score: bottom.score }, ...bottom.alternatives];
    // The lower number is one of very few; when it is too blurred to tell, keep them all as weak
    // readings so that the notes can decide later.
    for (const v of [4, 8, 2]) if (!bottoms.some((q) => q.value === v)) bottoms.push({ value: v, score: v === 4 ? 0.33 : 0.3 });
    const combos: { beats: number; beatValue: number; score: number; total: number }[] = [];
    for (const t of tops) for (const q of bottoms) combos.push({ beats: t.value, beatValue: q.value, score: Math.min(t.score, q.score), total: Math.min(t.score, q.score) + metrePrior(t.value, q.value) });
    combos.sort((p, q) => q.total - p.total);
    for (let k = combos.length - 1; k > 0; k--) if (metrePrior(combos[k].beats, combos[k].beatValue) <= -0.2) combos.splice(k, 1);
    const best = combos[0];
    // Both numbers must look like numbers (the lower one may be unreadable, but not absent), and
    // more like numbers than like a note head or a rest: a sixteenth rest or a stack of whole
    // notes right after the clef fills the staff too.
    const weakest = Math.min(top.score, bottom.score);
    const readable = best.score >= 0.4 || (top.score >= 0.6 && bottom.score >= 0.5);
    if (readable && weakest >= 0.4 && weakest >= symbolScore && weakest + 0.08 >= headScore && weakest >= restScore && metrePrior(best.beats, best.beatValue) > -0.2) {
      const second = combos[1]?.total ?? 0;
      const conf = Math.max(0.1, Math.min(1, (best.score - 0.4) / 0.25)) * (best.total - second >= 0.08 ? 1 : 0.6);
      const alternatives = combos.slice(1, 5).filter((c) => metrePrior(c.beats, c.beatValue) > -0.2).map((c) => ({ value: { beats: c.beats, beatValue: c.beatValue }, confidence: Math.max(0.02, Math.min(0.45, 0.5 * c.score)) }));
      return { item: { value: { beats: best.beats, beatValue: best.beatValue }, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, confidence: conf, alternatives }, endX: b.x1 };
    }
  }
  if (g.length && symbolScore >= 0.6 && symbolScore + 0.05 >= headScore && symbolScore >= restScore) {
    const cut = g[0].glyph === 'timeSigCutCommon';
    return {
      item: { value: cut ? { beats: 2, beatValue: 2, symbol: 'cut' } : { beats: 4, beatValue: 4, symbol: 'common' }, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, confidence: Math.min(1, (symbolScore - 0.4) / 0.3) },
      endX: b.x1,
    };
  }
  return none;
}

function readTime(strip: Strip, fromX: number, attempts = 1): { item: Header['time']; endX: number } {
  const { s, cc } = strip;
  // The time signature is the first block of ink inside the staff after the key signature. Its
  // columns are found from the rows of the staff only (text above the staff does not reach into
  // it); its height from the components that live in those columns (numbers taller than the
  // staff, as some engravers print them, are followed out of it).
  const { w, h } = strip;
  const scanX = Math.round(fromX + 0.1 * s);
  const cols = columnInk(strip, scanX, scanX + 5 * s, strip.top + 2, strip.bottom - 2);
  const b = { x0: 0, y0: h, x1: 0, y1: 0 };
  for (let i = 0; i < cols.length;) {
    while (i < cols.length && cols[i] === 0) i++;
    if (i >= cols.length) return { item: null, endX: fromX };
    let end = i;
    for (let j = i, gap = 0; j < cols.length && gap <= 0.25 * s; j++) {
      if (cols[j] > 0) { end = j; gap = 0; } else gap++;
    }
    const xa = scanX + i;
    const xb = scanX + end + 1;
    i = end + 1;
    // The last sliver of the key signature, a speck, an opening bar line.
    if (xb - xa < 0.6 * s) continue;
    b.x0 = xb;
    b.x1 = xa;
    b.y0 = h;
    b.y1 = 0;
    const seen = new Set<number>();
    for (let y = Math.round(strip.top + 2); y < Math.round(strip.bottom - 2); y++) {
      for (let x = xa; x < xb && x < w; x++) {
        const id = cc.labels[y * w + x];
        if (!id || seen.has(id)) continue;
        seen.add(id);
        // A component of the block may stick out a little above or below the staff rows scanned.
        if (cc.x0[id] < xa - 0.5 * s || cc.x1[id] > xb + 0.5 * s) continue;
        b.x0 = Math.min(b.x0, cc.x0[id]);
        b.y0 = Math.min(b.y0, cc.y0[id]);
        b.x1 = Math.max(b.x1, cc.x1[id] + 1);
        b.y1 = Math.max(b.y1, cc.y1[id] + 1);
      }
    }
    const width = b.x1 - b.x0;
    if (width > 3.6 * s) break; // music
    const found = readTimeBlock(strip, b, fromX);
    if (found.item || --attempts <= 0) return found;
  }
  return { item: null, endX: fromX };
}

/** Read clef, key signature and time signature at the start of the staff. */
export function readHeader(strip: Strip): Header {
  const clef = readClef(strip);
  let x = clef ? clef.x1 : strip.x0;
  // In bass clef the whole key-signature pattern sits one line lower. Without a clef (cut off at
  // the edge of the picture, or too damaged) the signatures are still looked for, further afield.
  const key = clef ? readKey(strip, x - 0.1 * strip.s, clef.value === 'bass' ? -2 : 0) : readKey(strip, Math.max(0, strip.x0 - strip.s), 0, 4.5);
  x = Math.max(x, key.endX);
  const time = readTime(strip, x, clef ? 1 : 3);
  x = Math.max(x, time.endX);
  return { clef, key: key.item, time: time.item, endX: x };
}
