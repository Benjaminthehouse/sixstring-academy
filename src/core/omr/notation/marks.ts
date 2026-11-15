/**
 * Marks that modify notes: accidentals in front of heads, ties between heads of the same pitch,
 * and tuplet numbers over groups.
 */
import type { AccidentalType } from '../types';
import { classifyBox } from './header';
import { type Match, matchAt, searchMatch } from './match';
import type { Chord, SBox } from './notes';
import { CLAIM, type Strip, inkIn, posY } from './strip';
import { templatesOf } from './templates';

/** An accidental found in front of a head. */
export interface AccidentalMark {
  type: AccidentalType;
  box: SBox;
  score: number;
  alternatives: { type: AccidentalType; score: number }[];
}

const ACCIDENTALS: { type: AccidentalType; glyph: string }[] = [
  { type: 'sharp', glyph: 'accidentalSharp' },
  { type: 'flat', glyph: 'accidentalFlat' },
  { type: 'natural', glyph: 'accidentalNatural' },
];

/** Give the unowned components under a box to a symbol kind. */
export function ownBox(strip: Strip, b: SBox, code: number, minOverlap = 0.5): void {
  const { w, h, cc, owner } = strip;
  const count = new Map<number, number>();
  for (let y = Math.max(0, Math.floor(b.y0)); y < Math.min(h, Math.ceil(b.y1)); y++) {
    for (let x = Math.max(0, Math.floor(b.x0)); x < Math.min(w, Math.ceil(b.x1)); x++) {
      const id = cc.labels[y * w + x];
      if (id && !owner[id]) count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  for (const [id, n] of count) if (n >= minOverlap * cc.area[id]) owner[id] = code;
}

const boxOf = (m: Match): SBox => {
  const t = m.template;
  const x0 = m.x - t.ox + t.pad;
  const y0 = m.y - t.oy + t.pad;
  return { x0, y0, x1: x0 + t.glyphWidth, y1: y0 + t.glyphHeight };
};

/**
 * Look for a sharp, flat or natural in front of every head. `limitX(chord)` is the leftmost column
 * the accidentals of a chord may reach (the previous symbol).
 */
export function readAccidentals(strip: Strip, chords: Chord[], limitX: (c: Chord) => number): Map<Chord, (AccidentalMark | null)[]> {
  const { s } = strip;
  const out = new Map<Chord, (AccidentalMark | null)[]>();
  for (const c of chords) {
    const left = Math.min(...c.heads.map((hd) => hd.x - hd.w / 2));
    const floor = Math.max(limitX(c), left - (c.heads.length > 1 ? 3.6 : 2.2) * s);
    const marks: (AccidentalMark | null)[] = [];
    for (const hd of c.heads) {
      const y = posY(strip, hd.pos);
      // Is there anything unexplained in front of the head at all?
      if (inkIn(strip, Math.max(floor, left - 1.6 * s), y - 0.8 * s, left - 0.12 * s, y + 0.8 * s) < 0.12 * s * s) {
        marks.push(null);
        continue;
      }
      const found: { type: AccidentalType; m: Match }[] = [];
      const gapMax = (c.heads.length > 1 ? 3.4 : 1.4) * s;
      for (const a of ACCIDENTALS) {
        let best: Match | null = null;
        for (const t of templatesOf(a.glyph)) {
          // The glyph origin is its left edge; its right edge stops a little before the head.
          const hi = left - 0.1 * s - t.glyphWidth;
          const lo = Math.max(floor, left - gapMax - t.glyphWidth);
          if (hi < lo) continue;
          let coarse: Match | null = null;
          for (let x = hi; x >= lo; x -= 2) {
            for (let dy = -2; dy <= 2; dy += 2) {
              const sc = matchAt(strip, t, x, y + dy);
              if (!coarse || sc > coarse.score) coarse = { score: sc, x, y: y + dy, template: t };
            }
          }
          if (!coarse) continue;
          const fine = searchMatch(strip, t, coarse.x, coarse.y, 1, 1);
          const m = fine.score > coarse.score ? fine : coarse;
          if (!best || m.score > best.score) best = m;
        }
        if (best) found.push({ type: a.type, m: best });
      }
      found.sort((p, q) => q.m.score - p.m.score);
      const best = found[0];
      if (!best || best.m.score < 0.55) {
        marks.push(null);
        continue;
      }
      const b = boxOf(best.m);
      // It must stand clear of the head it belongs to and right of the previous symbol.
      if (b.x1 > left + 0.1 * s || b.x0 < floor - 0.3 * s) {
        marks.push(null);
        continue;
      }
      marks.push({ type: best.type, box: b, score: best.m.score, alternatives: found.slice(1).filter((f) => f.m.score > 0.4).map((f) => ({ type: f.type, score: f.m.score })) });
      ownBox(strip, b, CLAIM.accidental);
      c.box.x0 = Math.min(c.box.x0, b.x0);
      c.box.y0 = Math.min(c.box.y0, b.y0);
      c.box.y1 = Math.max(c.box.y1, b.y1);
    }
    out.set(c, marks);
  }
  return out;
}

/**
 * Is there a tie between two heads at the same staff position? A tie is a thin arc that leaves
 * the first head near its right edge and reaches the second near its left edge, bulging gently
 * above or below. Where the arc runs along a staff line it was erased with the line, so columns
 * inside a line band count as "hidden", not as missing.
 */
export function tieBetween(strip: Strip, xa: number, xb: number, y: number): { found: boolean; score: number; box: SBox | null } {
  const { w, h, nl, s, rowWeight, cc, owner } = strip;
  const x0 = Math.round(xa);
  const x1 = Math.round(xb);
  const span = x1 - x0;
  if (span < 0.5 * s) return { found: false, score: 0, box: null };
  let bestScore = 0;
  let bestBox: SBox | null = null;
  // Try the arc below and above the heads.
  for (const dir of [1, -1]) {
    let seen = 0;
    let hidden = 0;
    let total = 0;
    let prev = -1;
    let yMin = Infinity;
    let yMax = -Infinity;
    let jumps = 0;
    for (let x = x0; x <= x1; x++) {
      total++;
      // Thin run nearest to the expected arc height in this column.
      const ya = Math.round(dir > 0 ? y + 0.1 * s : y - 1.5 * s);
      const yb = Math.round(dir > 0 ? y + 1.5 * s : y - 0.1 * s);
      let hit = -1;
      let hitD = Infinity;
      let yy = Math.max(0, ya);
      const end = Math.min(h - 1, yb);
      while (yy <= end) {
        if (!nl[yy * w + x]) { yy++; continue; }
        const a = yy;
        while (yy <= end && nl[yy * w + x]) yy++;
        const b = yy - 1;
        const id = cc.labels[a * w + x];
        if (b - a + 1 > 0.4 * s) continue;
        if (id && owner[id] && owner[id] !== CLAIM.tie) continue;
        const mid = (a + b) / 2;
        const d = prev >= 0 ? Math.abs(mid - prev) : Math.abs(mid - (y + dir * 0.6 * s));
        if (d < hitD) { hitD = d; hit = mid; }
      }
      if (hit >= 0 && (prev < 0 || Math.abs(hit - prev) <= 0.25 * s)) {
        seen++;
        if (prev >= 0 && Math.abs(hit - prev) > 2.5) jumps++;
        prev = hit;
        yMin = Math.min(yMin, hit);
        yMax = Math.max(yMax, hit);
      } else if (prev >= 0 && rowWeight[Math.max(0, Math.min(h - 1, Math.round(prev)))] < 1) {
        hidden++;
      } else if (prev < 0) {
        // Not started yet: the arc may begin inside a line band.
        const guess = Math.round(y + dir * 0.5 * s);
        if (rowWeight[Math.max(0, Math.min(h - 1, guess))] < 1) hidden++;
      }
    }
    const cover = (seen + hidden) / total;
    const score = seen >= 0.45 * total && jumps <= 0.15 * total ? cover : 0;
    if (score > bestScore) {
      bestScore = score;
      bestBox = { x0, y0: yMin - 2, x1: x1 + 1, y1: yMax + 3 };
    }
  }
  return { found: bestScore >= 0.8, score: bestScore, box: bestBox };
}

/**
 * Look for a tuplet number (a small 3) above or below a group of chords. Returns the digit read
 * and its box, or null.
 */
export function tupletNumber(strip: Strip, group: Chord[]): { value: number; box: SBox; score: number } | null {
  const { w, h, s, cc, owner } = strip;
  if (!group.length) return null;
  const x0 = Math.min(...group.map((c) => c.box.x0));
  const x1 = Math.max(...group.map((c) => c.box.x1));
  const top = Math.min(...group.map((c) => c.box.y0));
  const bottom = Math.max(...group.map((c) => c.box.y1));
  const mid = (x0 + x1) / 2;
  let best: { value: number; box: SBox; score: number } | null = null;
  for (const [ya, yb] of [[top - 2.6 * s, top - 0.05 * s], [bottom + 0.05 * s, bottom + 2.6 * s]]) {
    const seen = new Set<number>();
    for (let y = Math.max(0, Math.round(ya)); y < Math.min(h, Math.round(yb)); y++) {
      for (let x = Math.max(0, Math.round(mid - 1.2 * s)); x < Math.min(w, Math.round(mid + 1.2 * s)); x++) {
        const id = cc.labels[y * w + x];
        if (!id || owner[id] || seen.has(id)) continue;
        seen.add(id);
        const cw = cc.x1[id] - cc.x0[id] + 1;
        const ch = cc.y1[id] - cc.y0[id] + 1;
        if (ch < 0.7 * s || ch > 1.9 * s || cw < 0.4 * s || cw > 1.4 * s) continue;
        const g = classifyBox(strip, cc.x0[id], cc.y0[id], cc.x1[id] + 1, cc.y1[id] + 1, ['timeSig2', 'timeSig3', 'timeSig5', 'timeSig6', 'timeSig7', 'timeSig8', 'timeSig9']);
        if (!g.length || g[0].score < 0.5) continue;
        const value = Number(g[0].glyph.slice(-1));
        if (!best || g[0].score > best.score) best = { value, score: g[0].score, box: { x0: cc.x0[id], y0: cc.y0[id], x1: cc.x1[id] + 1, y1: cc.y1[id] + 1 } };
      }
    }
  }
  return best;
}
