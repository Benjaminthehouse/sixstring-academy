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
  /** The dot was seen only as a grey blob, not as a clean component (to be re-checked against what else is there). */
  dotSoft?: boolean;
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
    if (st.bottom - st.top < 1.9 * s) return;
    heads.forEach((hd, hi) => {
      // A stem that spans the staff is sometimes reported as a bar line: only a convincing head that touches it makes it a stem again.
      if (st.barline && (hd.score < 0.75 || hd.y < st.top - 0.35 * s || hd.y > st.bottom + 0.35 * s)) return;
      // The stem normally touches the head; in a faint capture its first stretch may be missing.
      if (hd.y < st.top - 1.3 * s || hd.y > st.bottom + 1.3 * s) return;
      // A wide whole-note shape that looks nothing like a half note takes no stem.
      if (hd.kind === 'whole' && hd.feat.zWhole > 0.7 && hd.feat.zWhole - hd.feat.zOpen >= 0.25) return;
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
      // A convincing head where the stem should run free means this is no stem at all (the walls
      // of stacked whole notes line up into a stroke).
      if (normal.some((hi) => free(hi) < 1.7 * s && heads[hi].score >= 0.75 && heads[hi].kind !== 'filled')) continue;
      normal = normal.filter((hi) => free(hi) >= 1.7 * s);
      // (The closing head itself may have been missed in a fused chord: allow a head's height more.)
      if (!normal.length || Math.min(...normal.map(near)) > 1.3 * s) continue;
      const other = list.filter((a) => a.side !== side && free(a.head) >= 1.7 * s).map((a) => a.head);
      // A stroke that looks like a bar line needs a convincing head to be a stem.
      if (st.staffSpan && Math.max(...normal.map((hi) => heads[hi].score)) < 0.7) continue;
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
  // How well a stroke fits a head: a stroke that reaches the head beats one that stops short of
  // it, whatever the sideways distance (one space of vertical gap counts like a whole head width).
  const dist = (hi: number, si: number, side: number): number => {
    const st = strokes[si];
    const gap = Math.max(0, st.top - heads[hi].y - 0.35 * s, heads[hi].y - st.bottom - 0.35 * s);
    return Math.abs(st.x - (heads[hi].x + (side * (heads[hi].w / 2 - inset)))) + 1.5 * gap;
  };
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
  const lost = new Set<Head>();
  for (const [si, list] of members) {
    const hy = bestByStroke.get(si) as StemHyp;
    const st = strokes[si];
    for (const hi of list) {
      heads[hi].stem = si;
      heads[hi].side = ownerSide[hi] as 1 | -1;
    }
    const hs = list.map((i) => heads[i]).sort((p, q) => p.pos - q.pos);
    // On a stem every head is of one kind (whole-note shapes on a stem are half notes): the kind
    // with the stronger evidence wins, weak heads of the other kind are not heads at all.
    const weight = (filled: boolean): number => hs.filter((hd) => (hd.kind === 'filled') === filled).reduce((q, hd) => q + hd.score, 0);
    const kind = weight(true) >= weight(false) ? 'filled' : 'open';
    const hs2 = hs.filter((hd) => (hd.kind === 'filled') === (kind === 'filled') || hd.score >= 0.7);
    for (const hd of hs2) {
      if ((hd.kind === 'filled') !== (kind === 'filled')) hd.kindScore = Math.min(hd.kindScore, 0.3);
      if (hd.kind !== kind) hd.kind = kind;
    }
    for (const hd of hs) if (!hs2.includes(hd)) { hd.stem = undefined; hd.side = undefined; lost.add(hd); }
    hs.length = 0;
    hs.push(...hs2);
    chords.push(makeChord(strip, hs, st, hy.dir));
  }
  // Stemless heads: whole notes (stacked ones form a chord).
  const loose = heads.filter((hd, hi) => owner[hi] < 0 && !lost.has(hd)).sort((a, b) => a.x - b.x);
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

/** Pixels of `nl` that lie in a long horizontal run: beams (and, thinner, ledger lines and line remnants). */
function longRunMask(strip: Strip): Uint8Array {
  const { w, h, nl, s } = strip;
  const out = new Uint8Array(w * h);
  const min = Math.round(1.2 * s);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let x = 0;
    while (x < w) {
      if (!nl[o + x]) { x++; continue; }
      const a = x;
      while (x < w && nl[o + x]) x++;
      if (x - a >= min) out.fill(1, o + a, o + x);
    }
  }
  return out;
}

/**
 * The beam that meets a stem tip on one side (-1 left, +1 right): its outer edge at the stem, or
 * null. The stem need not reach into the beam (a hair of paper between them is common in soft
 * captures), nor stop at its edge.
 */
function beamAtTip(strip: Strip, mask: Uint8Array, c: Chord, side: -1 | 1): number | null {
  const { w, h, s, nl, rowWeight, thick } = strip;
  const st = c.stem as Stroke;
  const inward = c.dir === 'up' ? 1 : -1;
  for (const off of [0.45 * s, 0.7 * s]) {
    const x = Math.round(st.x + side * off);
    if (x < 0 || x >= w) continue;
    const ya = Math.max(0, Math.round(c.tipY - 0.9 * s));
    const yb = Math.min(h - 1, Math.round(c.tipY + 0.9 * s));
    // Every vertical ink run of this column near the tip that holds long horizontal runs (near
    // the end of a slanted beam only part of its thickness does); the outermost one counts.
    let found: number | null = null;
    let y = ya;
    while (y <= yb) {
      if (!nl[y * w + x]) { y++; continue; }
      let a = y;
      while (a > 0 && nl[(a - 1) * w + x]) a--;
      let b = y;
      while (b < h - 1 && nl[(b + 1) * w + x]) b++;
      y = b + 1;
      let long = 0;
      for (let yy = a; yy <= b; yy++) long += mask[yy * w + x];
      if (long < 3) continue;
      const thickness = b - a + 1;
      // Thinner than a beam: a ledger line, or what is left of a staff line.
      if (thickness < 0.3 * s) continue;
      if (thickness <= thick + 3.5 && rowWeight[Math.round((a + b) / 2)] < 1) continue;
      const outer = inward > 0 ? a : b;
      // The stem ends at the beam, give or take.
      if (Math.abs(outer - c.tipY) > 0.9 * s) continue;
      const inner = inward > 0 ? b : a;
      if ((inner - c.tipY) * inward < -0.35 * s) continue; // the whole beam lies beyond the tip: not this stem's
      if (found === null || (outer - found) * inward < 0) found = outer;
    }
    if (found !== null) return found;
  }
  return null;
}

/** Count the beams at a stem on one side (-1 left, +1 right), starting from the outer edge of the first. */
function countBeams(strip: Strip, c: Chord, side: -1 | 1, outer: number): number {
  const { s, rowWeight, thick } = strip;
  const st = c.stem as Stroke;
  const inward = c.dir === 'up' ? 1 : -1;
  // Never look further than the nearest head.
  const innerHead = c.dir === 'up' ? Math.min(...c.heads.map((hd) => hd.y)) : Math.max(...c.heads.map((hd) => hd.y));
  const reach = Math.min(2.4 * s, Math.abs(innerHead - outer) - 0.7 * s);
  if (reach < 0.3 * s) return 1;
  let best = 0;
  for (const off of [0.4 * s, 0.6 * s]) {
    const x = st.x + side * off;
    const runs = columnRuns(strip, x, outer - inward * 0.3 * s, outer + inward * reach);
    if (inward < 0) runs.reverse();
    let count = 0;
    let last = -1;
    for (const r of runs) {
      const start = inward > 0 ? r.a : r.b;
      const thickness = r.b - r.a + 1;
      if (thickness < 0.25 * s) continue;
      // What is left of a staff line is not a beam.
      if (thickness <= thick + 3.5 && rowWeight[Math.round((r.a + r.b) / 2)] < 1) continue;
      if (count === 0 && Math.abs(start - outer) > 0.5 * s) break;
      if (count > 0 && Math.abs(start - last) > 0.75 * s) break;
      count += thickness < 0.95 * s ? 1 : thickness < 1.7 * s ? 2 : 3;
      last = inward > 0 ? r.b : r.a;
    }
    // A soft beam swells where it meets the stem: believe the thinner of the two readings.
    best = best === 0 || count === 0 ? Math.max(best, count) : Math.min(best, count);
  }
  return Math.max(1, Math.min(4, best));
}

/** Find beams between neighbouring stems and flags on single stems. */
export function readTails(strip: Strip, chords: Chord[]): void {
  const { s } = strip;
  const stemmed = chords.filter((c) => c.stem && c.heads[0].kind === 'filled').sort((a, b) => (a.stem as Stroke).x - (b.stem as Stroke).x);
  const mask = longRunMask(strip);
  const edges = new Map<Chord, { left: number | null; right: number | null }>();
  for (const c of stemmed) edges.set(c, { left: beamAtTip(strip, mask, c, -1), right: beamAtTip(strip, mask, c, 1) });
  // A beam joins two stems: a long run that leaves one stem must arrive at a neighbour.
  for (let i = 0; i < stemmed.length; i++) {
    const c = stemmed[i];
    const e = edges.get(c) as { left: number | null; right: number | null };
    const prev = i > 0 ? stemmed[i - 1] : null;
    const next = i + 1 < stemmed.length ? stemmed[i + 1] : null;
    const near = (o: Chord | null): boolean => !!o && o.dir === c.dir && Math.abs((o.stem as Stroke).x - (c.stem as Stroke).x) <= 9 * s;
    if (e.left !== null && near(prev) && (edges.get(prev as Chord) as { right: number | null }).right !== null) c.beamLeft = true;
    if (e.right !== null && near(next) && (edges.get(next as Chord) as { left: number | null }).left !== null) c.beamRight = true;
    // Steep beams have no long horizontal runs: fall back on the straight line between the tips.
    if (!c.beamRight && next && (next.stem as Stroke).x - (c.stem as Stroke).x <= 9 * s && beamBetween(strip, c, next)) {
      c.beamRight = true;
      next.beamLeft = true;
    }
  }
  for (const c of stemmed) {
    if (c.beamLeft || c.beamRight) {
      const e = edges.get(c) as { left: number | null; right: number | null };
      const l = c.beamLeft ? countBeams(strip, c, -1, e.left ?? c.tipY) : 0;
      const r = c.beamRight ? countBeams(strip, c, 1, e.right ?? c.tipY) : 0;
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
      if (cc.x0[id] < fromX - 1 || Math.abs(cy - y) > 0.32 * s) continue;
      if (ch < 0.2 * s || ch > 0.78 * s || cw < 0.2 * s) continue;
      // Two dots that a soft capture fused into one short bar.
      if (cw >= 0.75 * s && cw <= 1.35 * s && ch <= 0.6 * s && cc.area[id] >= 0.5 * cw * ch) {
        const mid = (cc.x0[id] + cc.x1[id] + 1) / 2;
        out.push({ x0: cc.x0[id], y0: cc.y0[id], x1: mid, y1: cc.y1[id] + 1 }, { x0: mid, y0: cc.y0[id], x1: cc.x1[id] + 1, y1: cc.y1[id] + 1 });
        break;
      }
      if (cw > 0.78 * s || cc.area[id] < 0.55 * cw * ch || cw > 1.6 * ch || ch > 1.6 * cw) continue;
      out.push({ x0: cc.x0[id], y0: cc.y0[id], x1: cc.x1[id] + 1, y1: cc.y1[id] + 1 });
      // A second dot follows within half a space.
      xEnd = Math.min(xEnd + 0, Math.min(w - 1, Math.round(cc.x1[id] + 1 + 0.75 * s)));
      break;
    }
  }
  return out;
}

/**
 * Grey-level evidence for a dot right of `fromX` at height `y`: the best contrast between a small
 * disc and the paper around it (0 = nothing, about 0.9 = a crisp dot). Works where a dot is too
 * faint or too blurred to survive as a component of its own.
 */
export function dotContrast(strip: Strip, fromX: number, y: number, reach: number): { contrast: number; x: number; y: number } {
  const { w, h, ink, s } = strip;
  const r1 = 0.17 * s;
  const r2 = 0.36 * s;
  const r3 = 0.54 * s;
  const R = Math.ceil(r3);
  let best = { contrast: 0, x: fromX, y };
  for (let cy = Math.round(y - 0.2 * s); cy <= Math.round(y + 0.2 * s); cy += 2) {
    for (let cx = Math.round(fromX + 0.3 * s); cx <= Math.round(fromX + reach); cx += 2) {
      if (cx - R < 0 || cy - R < 0 || cx + R >= w || cy + R >= h) continue;
      let inner = 0;
      let innerN = 0;
      // The paper around a dot, in three sectors (above, right, below); the side facing the head
      // is left out because the head is only a few pixels away. Every sector must be clear:
      // the edge of the next note has ink on one side.
      const sum = [0, 0, 0];
      const cnt = [0, 0, 0];
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 <= r1 * r1) {
            inner += ink[(cy + dy) * w + cx + dx];
            innerN++;
          } else if (d2 >= r2 * r2 && d2 <= r3 * r3 && dx > -0.6 * Math.abs(dy)) {
            const k = dx >= Math.abs(dy) ? 1 : dy < 0 ? 0 : 2;
            sum[k] += ink[(cy + dy) * w + cx + dx];
            cnt[k]++;
          }
        }
      }
      const around = Math.max(sum[0] / Math.max(1, cnt[0]), sum[1] / Math.max(1, cnt[1]), sum[2] / Math.max(1, cnt[2]));
      const c = (inner / Math.max(1, innerN) - around) / 255;
      if (c > best.contrast) best = { contrast: c, x: cx, y: cy };
    }
  }
  return best;
}

/** Read the augmentation dots of every chord. */
export function readDots(strip: Strip, chords: Chord[]): void {
  const { s } = strip;
  for (const c of chords) {
    const right = Math.max(...c.heads.map((hd) => hd.x + hd.w / 2));
    let best: SBox[] = [];
    let contrast = 0;
    let at = { x: 0, y: 0 };
    let reach = 1.15 * s;
    // A flag on an up-stem pushes the dot right.
    if (c.flags && c.dir === 'up') reach += 0.6 * s;
    for (const hd of c.heads) {
      // A dot sits in a space: beside a head in a space, one step up from a head on a line.
      const y = posY(strip, hd.pos % 2 === 0 ? hd.pos + 1 : hd.pos);
      const found = dotsAt(strip, right + 0.08 * s, y, reach);
      if (found.length > best.length) best = found;
      const g = dotContrast(strip, right, y, reach - 0.25 * s);
      if (g.contrast > contrast) {
        contrast = g.contrast;
        at = g;
      }
    }
    if (!best.length && contrast >= 0.55) {
      // No clean blob, but the grey image shows one (fused with the head or broken up).
      const r = 0.2 * s;
      best = [{ x0: at.x - r, y0: at.y - r, x1: at.x + r, y1: at.y + r }];
      c.dotSoft = true;
    }
    c.dots = best.length;
    c.dotBoxes = best;
    c.dotScore = Math.max(0, Math.min(1, contrast / 0.5));
    for (const d of best) c.box.x1 = Math.max(c.box.x1, d.x1);
  }
}
