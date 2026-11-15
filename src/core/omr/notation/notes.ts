/**
 * From heads and strokes to notes: which heads hang on which stem (chords, displaced seconds),
 * which way the stem points, how many beams or flags its free end carries, and the augmentation
 * dots. The result is a list of chords with a base note value, left to right.
 */
import type { DurationValue } from '../types';
import type { Head } from './heads';
import { coarseToFine } from './match';
import type { Stroke } from './stems';
import { type Strip, posY } from './strip';
import { templatesOf } from './templates';

/** A box in strip px (x1 / y1 exclusive). */
export interface SBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One note or chord read from the strip. */
export interface Chord {
  /** Low to high. */
  heads: Head[];
  /** Mean x of the heads. */
  x: number;
  stem: Stroke | null;
  dir: 'up' | 'down' | null;
  /** Free end of the stem. */
  tipY: number;
  /** Connected by a beam to the previous / next chord. */
  beamLeft: boolean;
  beamRight: boolean;
  /** Number of beams (when beamed) or flags (when flagged). */
  beams: number;
  flags: number;
  /** How sure the beam / flag count is, 0..1. */
  tailScore: number;
  dots: number;
  dotBoxes: SBox[];
  dotScore: number;
  /** Tuplet ratio, when a tuplet number was found over the group. */
  tuplet?: { actual: number; normal: number };
  /** Voice: 1 = upper / only voice, 2 = lower voice of two. */
  voice: number;
  /** Everything drawn for the chord. */
  box: SBox;
  /** Detection confidence 0..1. */
  score: number;
}

/** Note value of a chord from its head kind and tail count. */
export function baseValue(chord: Chord): DurationValue {
  const kind = chord.heads[0].kind;
  if (kind === 'whole') return 'whole';
  if (kind === 'open') return 'half';
  const n = Math.max(chord.beams, chord.flags);
  return n <= 0 ? 'quarter' : n === 1 ? 'eighth' : n === 2 ? '16th' : '32nd';
}

interface Attach {
  head: number;
  stroke: number;
  /** +1: the stroke runs along the right edge of the head, -1: along the left edge. */
  side: 1 | -1;
}

/** Group heads into chords along their stems. Heads without a stem become stemless chords. */
export function buildChords(strip: Strip, heads: Head[], strokes: Stroke[]): Chord[] {
  const { s } = strip;
  const tol = 0.24 * s;
  const inset = 0.075 * s; // a stem overlaps the head's edge by about half its width
  const attaches: Attach[] = [];
  strokes.forEach((st, si) => {
    if (st.barline || st.bottom - st.top < 1.9 * s) return;
    heads.forEach((hd, hi) => {
      if (hd.y < st.top - 0.35 * s || hd.y > st.bottom + 0.35 * s) return;
      const right = hd.x + hd.w / 2 - inset;
      const left = hd.x - hd.w / 2 + inset;
      if (Math.abs(st.x - right) <= tol) attaches.push({ head: hi, stroke: si, side: 1 });
      else if (Math.abs(st.x - left) <= tol) attaches.push({ head: hi, stroke: si, side: -1 });
    });
  });
  // Per stroke: is it a stem going up from heads at its lower end, or down from heads at its upper end?
  interface StemHyp { stroke: number; dir: 'up' | 'down'; normal: number[]; other: number[]; free: number; score: number }
  const hyps: StemHyp[] = [];
  const byStroke = new Map<number, Attach[]>();
  for (const a of attaches) {
    const l = byStroke.get(a.stroke);
    if (l) l.push(a); else byStroke.set(a.stroke, [a]);
  }
  for (const [si, list] of byStroke) {
    const st = strokes[si];
    for (const dir of ['up', 'down'] as const) {
      const side = dir === 'up' ? 1 : -1;
      let normal = list.filter((a) => a.side === side).map((a) => a.head);
      if (!normal.length) continue;
      // The outermost head closes the stem; beyond the innermost head the stem runs on for two
      // spaces or more. Head-like shapes near the free end (inside a flag) are not on this stem.
      const near = (hi: number): number => (dir === 'up' ? st.bottom - heads[hi].y : heads[hi].y - st.top);
      const free = (hi: number): number => (dir === 'up' ? heads[hi].y - st.top : st.bottom - heads[hi].y);
      normal = normal.filter((hi) => free(hi) >= 1.7 * s);
      if (!normal.length || Math.min(...normal.map(near)) > 0.75 * s) continue;
      const other = list.filter((a) => a.side !== side && free(a.head) >= 1.7 * s).map((a) => a.head);
      hyps.push({ stroke: si, dir, normal, other, free: Math.min(...normal.map(free)), score: normal.reduce((q, hi) => q + heads[hi].score, 0) });
    }
  }
  // A stroke keeps its better hypothesis.
  const bestByStroke = new Map<number, StemHyp>();
  for (const hy of hyps) {
    const cur = bestByStroke.get(hy.stroke);
    if (!cur || hy.score > cur.score) bestByStroke.set(hy.stroke, hy);
  }
  // A head belongs to the stem it sits on the normal side of (the nearest, if several).
  const owner = new Int32Array(heads.length).fill(-1);
  const ownerSide = new Int8Array(heads.length);
  const dist = (hi: number, si: number, side: number): number => Math.abs(strokes[si].x - (heads[hi].x + (side * (heads[hi].w / 2 - inset))));
  for (const hy of bestByStroke.values()) {
    for (const hi of hy.normal) {
      const side = hy.dir === 'up' ? 1 : -1;
      if (owner[hi] < 0 || dist(hi, hy.stroke, side) < dist(hi, owner[hi], ownerSide[hi])) {
        owner[hi] = hy.stroke;
        ownerSide[hi] = side;
      }
    }
  }
  // Displaced heads (the other note of a second): only next to a normal head of the same stem.
  for (const hy of bestByStroke.values()) {
    for (const hi of hy.other) {
      if (owner[hi] >= 0) continue;
      const neighbour = hy.normal.some((ni) => owner[ni] === hy.stroke && Math.abs(heads[ni].pos - heads[hi].pos) === 1);
      if (!neighbour) continue;
      owner[hi] = hy.stroke;
      ownerSide[hi] = hy.dir === 'up' ? -1 : 1;
    }
  }
  const chords: Chord[] = [];
  const members = new Map<number, number[]>();
  owner.forEach((si, hi) => {
    if (si < 0) return;
    const l = members.get(si);
    if (l) l.push(hi); else members.set(si, [hi]);
  });
  for (const [si, list] of members) {
    const hy = bestByStroke.get(si) as StemHyp;
    const st = strokes[si];
    for (const hi of list) {
      heads[hi].stem = si;
      heads[hi].side = ownerSide[hi] as 1 | -1;
    }
    const hs = list.map((i) => heads[i]).sort((p, q) => p.pos - q.pos);
    // On a stem every head is of one kind; whole-note shapes on a stem are half notes.
    const open = hs.filter((hd) => hd.kind !== 'filled').length;
    const kind = open * 2 > hs.length ? 'open' : 'filled';
    for (const hd of hs) if (hd.kind !== kind) { hd.kind = kind; hd.kindScore = Math.min(hd.kindScore, 0.4); }
    chords.push(makeChord(strip, hs, st, hy.dir));
  }
  // Stemless heads: whole notes (stacked ones form a chord).
  const loose = heads.filter((_, hi) => owner[hi] < 0).sort((a, b) => a.x - b.x);
  const groups: Head[][] = [];
  for (const hd of loose) {
    const g = groups.find((gr) => Math.abs(gr[0].x - hd.x) < 0.9 * s && gr.every((o) => Math.abs(o.pos - hd.pos) >= 1));
    if (g) g.push(hd); else groups.push([hd]);
  }
  for (const g of groups) {
    g.sort((a, b) => a.pos - b.pos);
    chords.push(makeChord(strip, g, null, null));
  }
  chords.sort((a, b) => a.x - b.x);
  return chords;
}

function makeChord(strip: Strip, hs: Head[], stem: Stroke | null, dir: 'up' | 'down' | null): Chord {
  const x = hs.reduce((a, hd) => a + hd.x, 0) / hs.length;
  const box: SBox = {
    x0: Math.min(...hs.map((hd) => hd.x - hd.w / 2)),
    y0: Math.min(...hs.map((hd) => hd.y - hd.h / 2)),
    x1: Math.max(...hs.map((hd) => hd.x + hd.w / 2)),
    y1: Math.max(...hs.map((hd) => hd.y + hd.h / 2)),
  };
  if (stem) {
    box.x0 = Math.min(box.x0, stem.xa);
    box.x1 = Math.max(box.x1, stem.xb + 1);
    box.y0 = Math.min(box.y0, stem.top);
    box.y1 = Math.max(box.y1, stem.bottom + 1);
  }
  void strip;
  return {
    heads: hs, x, stem, dir,
    tipY: stem ? (dir === 'up' ? stem.top : stem.bottom) : 0,
    beamLeft: false, beamRight: false, beams: 0, flags: 0, tailScore: 1,
    dots: 0, dotBoxes: [], dotScore: 1, voice: 1, box,
    score: Math.min(...hs.map((hd) => hd.score)),
  };
}

/** Vertical ink runs of `nl` in column x between rows ya and yb (inclusive, any order). */
function columnRuns(strip: Strip, x: number, ya: number, yb: number): { a: number; b: number }[] {
  const { w, h, nl } = strip;
  const xi = Math.round(x);
  const out: { a: number; b: number }[] = [];
  if (xi < 0 || xi >= w) return out;
  const lo = Math.max(0, Math.round(Math.min(ya, yb)));
  const hi = Math.min(h - 1, Math.round(Math.max(ya, yb)));
  let y = lo;
  while (y <= hi) {
    if (!nl[y * w + xi]) { y++; continue; }
    const a = y;
    while (y <= hi && nl[y * w + xi]) y++;
    out.push({ a, b: y - 1 });
  }
  return out;
}

/** Is the stretch between two stem tips filled by a beam? */
function beamBetween(strip: Strip, a: Chord, b: Chord): boolean {
  const { w, h, nl, s } = strip;
  if (!a.stem || !b.stem || a.dir !== b.dir) return false;
  if (b.stem.x - a.stem.x < 0.8 * s) return false;
  const inward = a.dir === 'up' ? 1 : -1;
  const xa = a.stem.x;
  const xb = b.stem.x;
  const ya = a.tipY + inward * 0.25 * s;
  const yb = b.tipY + inward * 0.25 * s;
  const n = Math.max(4, Math.round((xb - xa) / 2));
  let hit = 0;
  for (let k = 0; k <= n; k++) {
    const x = Math.round(xa + ((xb - xa) * k) / n);
    const y = Math.round(ya + ((yb - ya) * k) / n);
    let ink = false;
    for (let dy = -2; dy <= 2 && !ink; dy++) {
      const yy = y + dy;
      if (yy >= 0 && yy < h && x >= 0 && x < w && nl[yy * w + x]) ink = true;
    }
    if (ink) hit++;
  }
  return hit >= 0.88 * (n + 1);
}

/** Count the beams that leave a stem tip on one side (-1 left, +1 right). */
function countBeams(strip: Strip, c: Chord, side: -1 | 1): number {
  const { s } = strip;
  const st = c.stem as Stroke;
  const inward = c.dir === 'up' ? 1 : -1;
  // Never look further than the nearest head.
  const innerHead = c.dir === 'up' ? Math.min(...c.heads.map((hd) => hd.y)) : Math.max(...c.heads.map((hd) => hd.y));
  const reach = Math.min(2.4 * s, Math.abs(innerHead - c.tipY) - 0.7 * s);
  if (reach < 0.3 * s) return 0;
  let best = 0;
  for (const off of [0.4 * s, 0.6 * s]) {
    const x = st.x + side * off;
    const runs = columnRuns(strip, x, c.tipY - inward * 0.5 * s, c.tipY + inward * reach);
    if (inward < 0) runs.reverse();
    let count = 0;
    let last = -1;
    for (const r of runs) {
      const start = inward > 0 ? r.a : r.b;
      const thickness = r.b - r.a + 1;
      const fromTip = Math.abs(start - c.tipY);
      if (thickness < 0.22 * s) continue;
      if (count === 0 && fromTip > 0.6 * s) break;
      if (count > 0 && Math.abs(start - last) > 0.75 * s) break;
      count += thickness < 0.95 * s ? 1 : thickness < 1.7 * s ? 2 : 3;
      last = inward > 0 ? r.b : r.a;
    }
    best = Math.max(best, count);
  }
  return Math.min(4, best);
}

/** Find beams between neighbouring stems and flags on single stems. */
export function readTails(strip: Strip, chords: Chord[]): void {
  const { s } = strip;
  const stemmed = chords.filter((c) => c.stem && c.heads[0].kind === 'filled').sort((a, b) => (a.stem as Stroke).x - (b.stem as Stroke).x);
  for (let i = 0; i + 1 < stemmed.length; i++) {
    const a = stemmed[i];
    const b = stemmed[i + 1];
    if ((b.stem as Stroke).x - (a.stem as Stroke).x > 9 * s) continue;
    if (beamBetween(strip, a, b)) {
      a.beamRight = true;
      b.beamLeft = true;
    }
  }
  for (const c of stemmed) {
    if (c.beamLeft || c.beamRight) {
      const l = c.beamLeft ? countBeams(strip, c, -1) : 0;
      const r = c.beamRight ? countBeams(strip, c, 1) : 0;
      c.beams = Math.max(1, l, r);
      c.tailScore = 0.9;
      continue;
    }
    // Flags: always on the right of the stem, hanging from its tip.
    const st = c.stem as Stroke;
    const up = c.dir === 'up';
    const names = up ? ['flag8thUp', 'flag16thUp', 'flag32ndUp'] : ['flag8thDown', 'flag16thDown', 'flag32ndDown'];
    const scores = names.map((g) => coarseToFine(strip, templatesOf(g), st.x - 0.075 * s, c.tipY, 3, 5, 2)?.score ?? 0);
    let k = 0;
    for (let j = 1; j < scores.length; j++) if (scores[j] > scores[k]) k = j;
    if (scores[k] >= 0.5) {
      c.flags = k + 1;
      const rival = Math.max(...scores.filter((_, j) => j !== k));
      c.tailScore = Math.max(0.3, Math.min(1, 0.5 + 2.5 * (scores[k] - rival)));
      const t = templatesOf(names[k])[0];
      c.box.x1 = Math.max(c.box.x1, st.x + t.glyphWidth);
    } else {
      c.tailScore = Math.max(0.3, Math.min(1, (0.5 - scores[k]) / 0.2));
    }
  }
}

/**
 * Small round blobs right of a point at a given height: augmentation dots. Returns their boxes,
 * left to right (at most two).
 */
export function dotsAt(strip: Strip, fromX: number, y: number, reach: number): SBox[] {
  const { w, h, s, cc } = strip;
  const out: SBox[] = [];
  const ya = Math.max(0, Math.round(y - 0.3 * s));
  const yb = Math.min(h - 1, Math.round(y + 0.3 * s));
  let xEnd = Math.min(w - 1, Math.round(fromX + reach));
  const used = new Set<number>();
  for (let x = Math.max(0, Math.round(fromX)); x <= xEnd && out.length < 2; x++) {
    for (let yy = ya; yy <= yb; yy++) {
      const id = cc.labels[yy * w + x];
      if (!id || used.has(id)) continue;
      used.add(id);
      const cw = cc.x1[id] - cc.x0[id] + 1;
      const ch = cc.y1[id] - cc.y0[id] + 1;
      const cy = (cc.y0[id] + cc.y1[id] + 1) / 2;
      if (cw < 0.2 * s || ch < 0.2 * s || cw > 0.65 * s || ch > 0.65 * s) continue;
      if (cc.area[id] < 0.55 * cw * ch || Math.abs(cy - y) > 0.32 * s || cw > 1.6 * ch || ch > 1.6 * cw) continue;
      if (cc.x0[id] < fromX - 1) continue;
      out.push({ x0: cc.x0[id], y0: cc.y0[id], x1: cc.x1[id] + 1, y1: cc.y1[id] + 1 });
      // A second dot follows within half a space.
      xEnd = Math.min(xEnd + 0, Math.min(w - 1, Math.round(cc.x1[id] + 1 + 0.75 * s)));
      break;
    }
  }
  return out;
}

/** Read the augmentation dots of every chord. */
export function readDots(strip: Strip, chords: Chord[]): void {
  const { s } = strip;
  for (const c of chords) {
    const right = Math.max(...c.heads.map((hd) => hd.x + hd.w / 2));
    let best: SBox[] = [];
    for (const hd of c.heads) {
      // A dot sits in a space: beside a head in a space, one step up from a head on a line.
      const y = posY(strip, hd.pos % 2 === 0 ? hd.pos + 1 : hd.pos);
      let reach = 1.15 * s;
      // Do not read into the next symbol: a flag on an up-stem pushes the dot right.
      if (c.flags && c.dir === 'up') reach += 0.6 * s;
      const found = dotsAt(strip, right + 0.08 * s, y, reach);
      if (found.length > best.length) best = found;
    }
    c.dots = best.length;
    c.dotBoxes = best;
    for (const d of best) c.box.x1 = Math.max(c.box.x1, d.x1);
  }
}
