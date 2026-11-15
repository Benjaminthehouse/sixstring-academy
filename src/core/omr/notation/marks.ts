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
      // It must stand clear of the head it belongs to and right of the previous symbol, and there
      // must be about a glyph's worth of ink (the stub of a ledger line is not a flat).
      if (b.x1 > left + 0.1 * s || b.x0 < floor - 0.3 * s || inkIn(strip, b.x0, b.y0, b.x1, b.y1) < 0.6 * best.m.template.area) {
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
 * above or below. It is followed column by column as a thin vertical run that moves smoothly.
 * Where the arc runs into a staff line it was erased with the line or fused with it, so such
 * columns count as "hidden", not as missing; stems and bar lines that cross it are skipped.
 */
export function tieBetween(strip: Strip, xa: number, xb: number, y: number, minSeen = 0.3): { found: boolean; score: number; box: SBox | null } {
  const { w, h, nl, s, rowWeight } = strip;
  const x0 = Math.max(0, Math.round(xa));
  const x1 = Math.min(w - 1, Math.round(xb));
  const span = x1 - x0;
  if (span < 0.5 * s) return { found: false, score: 0, box: null };
  const inBand = (yy: number): boolean => {
    for (let d = -2; d <= 2; d++) {
      const r = Math.round(yy) + d;
      if (r >= 0 && r < h && rowWeight[r] < 1) return true;
    }
    return false;
  };
  let bestScore = 0;
  let bestBox: SBox | null = null;
  for (const dir of [1, -1]) {
    let seen = 0;
    let hidden = 0;
    let total = 0;
    let prev = -1;
    let yMin = Infinity;
    let yMax = -Infinity;
    const ya = Math.max(0, Math.round(dir > 0 ? y + 0.1 * s : y - 1.6 * s));
    const yb = Math.min(h - 1, Math.round(dir > 0 ? y + 1.6 * s : y - 0.1 * s));
    for (let x = x0; x <= x1; x++) {
      const guess = prev >= 0 ? prev : y + dir * 0.55 * s;
      // The run of this column nearest to where the arc should be.
      let best: { a: number; b: number; d: number } | null = null;
      let yy = ya;
      while (yy <= yb) {
        if (!nl[yy * w + x]) { yy++; continue; }
        let a = yy;
        while (a > 0 && nl[(a - 1) * w + x]) a--;
        let b = yy;
        while (b < h - 1 && nl[(b + 1) * w + x]) b++;
        const d = guess < a ? a - guess : guess > b ? guess - b : 0;
        if (!best || d < best.d) best = { a, b, d };
        yy = b + 1;
      }
      if (best && best.d <= (prev >= 0 ? 0.25 : 0.7) * s) {
        const thickness = best.b - best.a + 1;
        const mid = (best.a + best.b) / 2;
        if (thickness > 1.6 * s) continue; // a stem or bar line crossing: says nothing
        total++;
        if (thickness <= 0.36 * s && !(rowWeight[Math.round(mid)] < 1 && thickness <= strip.thick + 2)) {
          seen++;
          prev = mid;
          yMin = Math.min(yMin, mid);
          yMax = Math.max(yMax, mid);
        } else if (thickness <= 1.0 * s && (inBand(best.a) || inBand(best.b) || inBand(mid))) {
          hidden++;
        }
        continue;
      }
      total++;
      if (inBand(guess)) hidden++;
    }
    if (total < 0.5 * span) continue;
    const cover = (seen + hidden) / total;
    const score = seen >= minSeen * total && yMax - yMin <= 0.9 * s ? cover : 0;
    if (score > bestScore) {
      bestScore = score;
      bestBox = { x0, y0: yMin - 2, x1: x1 + 1, y1: yMax + 3 };
    }
  }
  return { found: bestScore >= 0.82, score: bestScore, box: bestBox };
}

/** A tuplet number found near the notes, with the stretch of staff it governs. */
export interface TupletMark {
  value: number;
  /** Box of the digit. */
  box: SBox;
  /** Columns covered: the bracket when there is one, else just the digit. */
  x0: number;
  x1: number;
  bracket: boolean;
  score: number;
}

/**
 * Find tuplet numbers: a small "3" above or below the notes, alone or in the gap of a bracket.
 * Only unexplained components are looked at, so call this after notes, rests, accidentals and
 * dots are known. The components of each mark are claimed.
 */
export function findTuplets(strip: Strip, xFrom: number, xTo: number, noteBoxes: SBox[]): TupletMark[] {
  const { s, cc, owner } = strip;
  const out: TupletMark[] = [];
  for (let id = 1; id <= cc.count; id++) {
    if (owner[id]) continue;
    const cw = cc.x1[id] - cc.x0[id] + 1;
    const ch = cc.y1[id] - cc.y0[id] + 1;
    if (cc.x0[id] < xFrom || cc.x1[id] > xTo) continue;
    if (ch < 0.7 * s || ch > 2.4 * s || cw < 0.4 * s || cw > 1.7 * s || cw > 1.2 * ch) continue;
    const b: SBox = { x0: cc.x0[id], y0: cc.y0[id], x1: cc.x1[id] + 1, y1: cc.y1[id] + 1 };
    // A tuplet number stands clear of the notes.
    if (noteBoxes.some((n) => b.x0 < n.x1 && b.x1 > n.x0 && b.y0 < n.y1 && b.y1 > n.y0)) continue;
    const g = classifyBox(strip, b.x0, b.y0, b.x1, b.y1, ['timeSig1', 'timeSig2', 'timeSig3', 'timeSig4', 'timeSig5', 'timeSig6', 'timeSig7', 'timeSig8', 'timeSig9']);
    if (!g.length || g[0].glyph !== 'timeSig3' || g[0].score < 0.6) continue;
    // Bracket arms: thin, wide components level with the digit on either side.
    const cy = (b.y0 + b.y1) / 2;
    let x0 = b.x0;
    let x1 = b.x1;
    const arms: number[] = [];
    for (let a = 1; a <= cc.count; a++) {
      if (a === id || owner[a]) continue;
      const aw = cc.x1[a] - cc.x0[a] + 1;
      const ah = cc.y1[a] - cc.y0[a] + 1;
      if (aw < 0.8 * s || ah > 1.4 * s || aw < 2 * ah) continue;
      const ay = (cc.y0[a] + cc.y1[a] + 1) / 2;
      if (Math.abs(ay - cy) > 1.0 * s) continue;
      const gapLeft = b.x0 - (cc.x1[a] + 1);
      const gapRight = cc.x0[a] - b.x1;
      if ((gapLeft >= -2 && gapLeft <= 1.5 * s) || (gapRight >= -2 && gapRight <= 1.5 * s)) {
        arms.push(a);
        x0 = Math.min(x0, cc.x0[a]);
        x1 = Math.max(x1, cc.x1[a] + 1);
      }
    }
    owner[id] = CLAIM.tuplet;
    for (const a of arms) owner[a] = CLAIM.tuplet;
    out.push({ value: 3, box: b, x0, x1, bracket: arms.length > 0, score: g[0].score });
  }
  return out;
}

