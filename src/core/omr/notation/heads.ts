/**
 * Note-head detection on a staff strip.
 *
 * Candidates come from two cheap, font-independent detectors:
 *  - filled heads: peaks of the distance transform of the line-free ink (a solid blob about one
 *    staff space high; stems, beams, flags and line remnants are far too thin to qualify);
 *  - open heads (half, whole): places where the ink has two thick walls a head-width apart and
 *    paper between them.
 * Every candidate is then compared with the note-head glyphs of several music fonts (weighted
 * ZNCC on the symbol ink) and its hole is measured on the grey strip, which decides between
 * filled / half / whole and gives the confidence.
 */
import { type Match, matchAt } from './match';
import { type Strip, inkFraction, posAt, posY } from './strip';
import { type Template, templatesOf } from './templates';

/** Kinds of note head the recognizer tells apart. */
export type HeadKind = 'filled' | 'open' | 'whole';

/** A detected note head. */
export interface Head {
  /** Centre, strip px. */
  x: number;
  y: number;
  /** Staff position (half spaces above the bottom line). */
  pos: number;
  kind: HeadKind;
  /** Detection confidence 0..1. */
  score: number;
  /** Confidence of `kind` against the runner-up, 0..1. */
  kindScore: number;
  /** Width / height of the matched glyph, px. */
  w: number;
  h: number;
  /** Raw features (for the rhythm solver and for debugging). */
  feat: HeadFeatures;
  /** Index of the stem it hangs on (set by the note builder), and the side of the stem it is on. */
  stem?: number;
  side?: -1 | 1;
}

/** Measurements of a head candidate. */
export interface HeadFeatures {
  /** Best correlation with the filled, half and whole note-head glyphs. */
  zFilled: number;
  zOpen: number;
  zWhole: number;
  /** Darkness of the hole relative to the ring under the best half / whole glyph (1 = solid, 0 = clean hole). */
  holeOpen: number;
  holeWhole: number;
  /** Largest inscribed radius of the ink at the centre, in staff spaces. */
  core: number;
}

/**
 * Best placement of the glyphs of one kind around a centre (cx, cy), searching +-rx / +-ry px:
 * every font on a 2 px grid first, then the best font pixel by pixel around its best placement.
 */
function bestHeadMatch(strip: Strip, templates: Template[], cx: number, cy: number, rx: number, ry: number): Match | null {
  let best: Match | null = null;
  for (const t of templates) {
    const ox = cx - t.glyphWidth / 2;
    for (let dy = -ry; dy <= ry; dy += 2) {
      for (let dx = -rx; dx <= rx; dx += 2) {
        const sc = matchAt(strip, t, ox + dx, cy + dy);
        if (!best || sc > best.score) best = { score: sc, x: ox + dx, y: cy + dy, template: t };
      }
    }
  }
  if (!best) return null;
  const coarse = best;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const sc = matchAt(strip, coarse.template, coarse.x + dx, coarse.y + dy);
      if (sc > best.score) best = { score: sc, x: coarse.x + dx, y: coarse.y + dy, template: coarse.template };
    }
  }
  return best;
}

/**
 * Darkness inside the hole of an open-head glyph relative to the darkness of its ring, measured on
 * the grey strip with the glyph placed as matched. Rows inside staff-line bands are skipped (the
 * line fills the hole there) unless nothing else is left.
 */
export function holeDarkness(strip: Strip, m: Match): number {
  const t = m.template;
  const { w, h, rowWeight } = strip;
  const gray = strip.input.gray.data;
  const left = Math.round(m.x - t.ox);
  const top = Math.round(m.y - t.oy);
  for (const skipBands of [true, false]) {
    let hole = 0;
    let holeN = 0;
    let ring = 0;
    let ringN = 0;
    for (let ty = 0; ty < t.height; ty++) {
      const y = top + ty;
      if (y < 0 || y >= h) continue;
      if (skipBands && rowWeight[y] < 1) continue;
      for (let tx = 0; tx < t.width; tx++) {
        const x = left + tx;
        if (x < 0 || x >= w) continue;
        const q = ty * t.width + tx;
        const v = 255 - gray[y * w + x];
        if (t.hole[q]) {
          hole += v;
          holeN++;
        } else if (t.ink[q] >= 250) {
          ring += v;
          ringN++;
        }
      }
    }
    if (holeN >= Math.max(4, 0.3 * t.holeArea) && ringN > 0 && ring > 0) return Math.min(1.5, hole / holeN / (ring / ringN));
  }
  return 1;
}

const HEAD_GLYPHS: Record<HeadKind, string> = { filled: 'noteheadBlack', open: 'noteheadHalf', whole: 'noteheadWhole' };

/** Measure a head candidate centred near (cx, cy) and return the features with the refined centre per kind. */
export function measureHead(strip: Strip, cx: number, cy: number, rx = 2, ry = 2, withFilled = true): { feat: HeadFeatures; matches: Record<HeadKind, Match | null> } {
  const matches: Record<HeadKind, Match | null> = {
    filled: withFilled ? bestHeadMatch(strip, templatesOf(HEAD_GLYPHS.filled), cx, cy, rx, ry) : null,
    open: bestHeadMatch(strip, templatesOf(HEAD_GLYPHS.open), cx, cy, rx, ry),
    whole: bestHeadMatch(strip, templatesOf(HEAD_GLYPHS.whole), cx, cy, rx, ry),
  };
  const xi = Math.max(0, Math.min(strip.w - 1, Math.round(cx)));
  const yi = Math.max(0, Math.min(strip.h - 1, Math.round(cy)));
  let core = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = xi + dx;
      const y = yi + dy;
      if (x >= 0 && y >= 0 && x < strip.w && y < strip.h) core = Math.max(core, strip.dt[y * strip.w + x]);
    }
  }
  const feat: HeadFeatures = {
    zFilled: matches.filled?.score ?? 0,
    zOpen: matches.open?.score ?? 0,
    zWhole: matches.whole?.score ?? 0,
    holeOpen: matches.open ? holeDarkness(strip, matches.open) : 1,
    holeWhole: matches.whole ? holeDarkness(strip, matches.whole) : 1,
    core: core / strip.s,
  };
  return { feat, matches };
}

/** A candidate centre. */
interface Seed {
  x: number;
  y: number;
  /** 'core' = distance-transform peak, 'ring' = two walls with paper between. */
  from: 'core' | 'ring';
  strength: number;
}

/** Peaks of the distance transform that have the size of a filled note head. */
function coreSeeds(strip: Strip, xFrom: number, xTo: number): Seed[] {
  const { w, h, dt, nl, s } = strip;
  const thr = 0.3 * s;
  const R = Math.round(0.4 * s);
  const xa = Math.max(R, Math.floor(xFrom));
  const xb = Math.min(w - 1 - R, Math.ceil(xTo));
  const out: Seed[] = [];
  const runAt = (x: number, y: number): number => {
    if (y < 0 || y >= h || !nl[y * w + x]) return 0;
    let a = x;
    while (a > 0 && nl[y * w + a - 1]) a--;
    let b = x;
    while (b < w - 1 && nl[y * w + b + 1]) b++;
    return b - a + 1;
  };
  for (let y = R; y < h - R; y++) {
    for (let x = xa; x <= xb; x++) {
      const v = dt[y * w + x];
      if (v < thr) continue;
      let peak = true;
      for (let dy = -R; dy <= R && peak; dy++) {
        const o = (y + dy) * w + x;
        for (let dx = -R; dx <= R; dx++) {
          const u = dt[o + dx];
          // Strict on the pixels scanned earlier so a plateau yields one peak.
          if (u > v || (u === v && (dy < 0 || (dy === 0 && dx < 0)))) { peak = false; break; }
        }
      }
      if (!peak) continue;
      // Centre of the core (the ridge of a tilted ellipse is a few px long).
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const u = dt[(y + dy) * w + x + dx];
          if (u >= 0.8 * v) {
            sx += (x + dx + 0.5) * u;
            sy += (y + dy + 0.5) * u;
            sw += u;
          }
        }
      }
      const cx = sx / sw;
      const cy = sy / sw;
      // A head is about 1.2 spaces wide; a pair of fused beams runs on. Measured off-centre so a
      // ledger line through the head does not count.
      const off = Math.round(0.22 * s);
      const xi = Math.round(cx - 0.5);
      const yi = Math.round(cy - 0.5);
      const run = Math.min(runAt(xi, yi - off) || Infinity, runAt(xi, yi + off) || Infinity);
      if (run > 1.75 * s || run < 0.55 * s) continue;
      if (v > 0.75 * s) continue;
      out.push({ x: cx, y: cy, from: 'core', strength: v / s });
    }
  }
  return out;
}

/** Places on staff positions where two thick walls stand a head-width apart with paper between. */
function ringSeeds(strip: Strip, xFrom: number, xTo: number): Seed[] {
  const { s, w, h } = strip;
  const out: Seed[] = [];
  const u = s / 20;
  const xa = Math.max(Math.round(0.9 * s), Math.floor(xFrom));
  const xb = Math.min(w - 1 - Math.round(0.9 * s), Math.ceil(xTo));
  const lo = Math.ceil(posAt(strip, h - 0.6 * s));
  const hi = Math.floor(posAt(strip, 0.6 * s));
  for (let pos = lo; pos <= hi; pos++) {
    const y = posY(strip, pos);
    // On a staff line too: the line fills a narrow hole, and is not removed where it touches the ring.
    const ledger = pos % 2 === 0;
    let runStart = -1;
    let runEnd = -1;
    let bestV = -1;
    const flush = (): void => {
      // The walls are symmetric about the centre of the head: take the middle of the stretch.
      if (runStart >= 0 && bestV >= 0) out.push({ x: (runStart + runEnd) / 2 + 0.5, y, from: 'ring', strength: bestV });
      runStart = -1;
      bestV = -1;
    };
    for (let x = xa; x <= xb; x++) {
      // A ledger line runs through the hole of a head on it: only the walls can be tested there.
      const centre = ledger ? 0 : inkFraction(strip, x - 3 * u, y - 2.5 * u, x + 3 * u, y + 2.5 * u);
      let ok = centre <= 0.5;
      let v = 0;
      if (ok) {
        // The walls of a half note stand 8-13 px from the centre, those of a whole note further out.
        let left = 0;
        let right = 0;
        for (const d of [7, 9, 11]) {
          left = Math.max(left, inkFraction(strip, x - (d + 4) * u, y - 3 * u, x - d * u, y + 3 * u));
          right = Math.max(right, inkFraction(strip, x + d * u, y - 3 * u, x + (d + 4) * u, y + 3 * u));
        }
        ok = left >= 0.5 && right >= 0.5;
        v = left + right - centre;
      }
      if (ok) {
        if (runStart < 0) runStart = x;
        runEnd = x;
        if (v > bestV) bestV = v;
      } else {
        flush();
      }
    }
    flush();
  }
  return out;
}



/** Hole darkness below which a head is open: filled heads measure >= 1.0, open ones <= 0.8 up to mild photo blur. */
export const HOLE_SPLIT = 0.9;

/** Solid core (largest inscribed radius, staff spaces) below which a filled head is too small for a real one. */
export const MIN_HEAD_CORE = 0.38;
/** The same for cue-size notes (about two thirds of the normal size), read on a staff printed in them. */
export const MIN_CUE_CORE = 0.26;

/** Decide the kind of a measured candidate; null when it is not a note head. */
export function classifyHead(feat: HeadFeatures, from: 'core' | 'ring', minScore: number, minCore = MIN_HEAD_CORE): { kind: HeadKind; score: number; kindScore: number } | null {
  const { zFilled, zOpen, zWhole, holeOpen, holeWhole } = feat;
  const hole = Math.min(holeOpen, holeWhole, 1.2);
  const margin = Math.min(1, Math.abs(hole - HOLE_SPLIT) / 0.25);
  if (hole >= HOLE_SPLIT) {
    // Solid: only a blob found by its core can be a filled head (the thick wall of a whole note
    // has a core too, but does not look like a head).
    if (from === 'ring' || zFilled < Math.max(minScore, 0.62)) return null;
    // A grace note is two thirds the size: its solid core is too small for a real head.
    if (feat.core < minCore) return null;
    return { kind: 'filled', score: zFilled, kindScore: margin };
  }
  const whole = zWhole > zOpen + 0.04;
  const z = whole ? zWhole : zOpen;
  // Ring-like shapes are everywhere (flag loops, the eye of a sharp, digits): ask more of them.
  if (z < (from === 'ring' ? Math.max(minScore, 0.55) : minScore)) {
    // A solid-looking blob whose "hole" is only a light spot: still a filled head if it matches one.
    if (from === 'core' && zFilled >= Math.max(minScore, 0.7) && hole > 0.7) return { kind: 'filled', score: zFilled, kindScore: 0.2 };
    return null;
  }
  return { kind: whole ? 'whole' : 'open', score: z, kindScore: margin };
}

/** Options for {@link findHeads}. */
export interface HeadOptions {
  /** Lowest correlation accepted for any kind. Default 0.45. */
  minScore?: number;
  /** Thin vertical strokes: solid ink beside one, on a staff position, is tried as a head of a chord. */
  strokes?: { x: number; top: number; bottom: number; barline: boolean }[];
  /** Accept cue-size heads (two thirds of the normal size) as notes: a staff printed in small notes. */
  cue?: boolean;
  /** Filled in: candidates turned down only for being too small (grace or cue notes). */
  stats?: { small: number };
}

/**
 * Solid places beside a stem, one per staff position: the heads of a chord fuse into one blob
 * whose distance transform has fewer peaks than heads.
 */
function stemSeeds(strip: Strip, strokes: NonNullable<HeadOptions['strokes']>, xFrom: number, xTo: number): Seed[] {
  const { w, h, dt, s } = strip;
  const out: Seed[] = [];
  for (const st of strokes) {
    if (st.barline || st.x < xFrom || st.x > xTo || st.bottom - st.top < 1.9 * s) continue;
    const lo = Math.ceil(posAt(strip, st.bottom + 0.3 * s));
    const hi = Math.floor(posAt(strip, st.top - 0.3 * s));
    for (let pos = lo; pos <= hi; pos++) {
      const y = posY(strip, pos);
      for (const side of [-1, 1]) {
        const x = st.x + side * 0.55 * s;
        const xi = Math.round(x);
        const yi = Math.round(y);
        if (xi < 2 || yi < 2 || xi >= w - 2 || yi >= h - 2) continue;
        let v = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) v = Math.max(v, dt[(yi + dy) * w + xi + dx]);
        if (v >= 0.3 * s && v <= 0.75 * s) out.push({ x, y, from: 'core', strength: v / s });
        else if (v < 0.3 * s) {
          // Not solid, but about a ring's worth of ink: an open head (the displaced one of a
          // second is found here; the wall test is thrown off by its neighbour).
          const f = inkFraction(strip, x - 0.6 * s, y - 0.45 * s, x + 0.6 * s, y + 0.45 * s);
          if (f >= 0.25 && f <= 0.92) out.push({ x, y, from: 'ring', strength: f });
        }
      }
    }
  }
  return out;
}

/** Find the note heads between columns `xFrom` and `xTo`. Heads are returned left to right. */
export function findHeads(strip: Strip, xFrom: number, xTo: number, opts: HeadOptions = {}): Head[] {
  const minScore = opts.minScore ?? 0.45;
  const { s } = strip;
  const seeds = coreSeeds(strip, xFrom, xTo);
  const anchored: Seed[] = [];
  if (opts.strokes) {
    const peaks = seeds.length;
    for (const r of stemSeeds(strip, opts.strokes, xFrom, xTo)) {
      if (r.from === 'ring') {
        anchored.push(r);
        continue;
      }
      let dup = false;
      // Only a peak that snaps to the same staff position is the same head (the peak of two fused heads lies between them).
      for (let i = 0; i < peaks && !dup; i++) dup = Math.abs(seeds[i].x - r.x) < 0.45 * s && Math.round(posAt(strip, seeds[i].y)) === Math.round(posAt(strip, r.y));
      if (!dup) seeds.push(r);
    }
  }
  const cores = seeds.length;
  for (const r of ringSeeds(strip, xFrom, xTo)) {
    let dup = false;
    // The same place as a solid blob (a filled head on a line passes the ring test too).
    for (let i = 0; i < cores && !dup; i++) dup = Math.abs(seeds[i].x - r.x) < 0.3 * s && Math.round(posAt(strip, seeds[i].y)) === Math.round(posAt(strip, r.y));
    if (!dup) seeds.push(r);
  }
  for (const r of anchored) {
    let dup = false;
    for (let i = 0; i < seeds.length && !dup; i++) dup = Math.abs(seeds[i].x - r.x) < 0.3 * s && Math.round(posAt(strip, seeds[i].y)) === Math.round(posAt(strip, r.y));
    if (!dup) seeds.push(r);
  }
  const heads: Head[] = [];
  for (const seed of seeds) {
    // Heads sit on staff positions: snap the centre before matching.
    const pos0 = Math.round(posAt(strip, seed.y)) + 0; // (+ 0: no negative zero)
    let best: Head | null = null;
    const tries = seed.from === 'core' ? [pos0] : [pos0];
    for (const pos of tries) {
      const { feat, matches } = measureHead(strip, seed.x, posY(strip, pos), seed.from === 'core' ? 2 : 4, 2, seed.from === 'core');
      const c = classifyHead(feat, seed.from, minScore, opts.cue ? MIN_CUE_CORE : MIN_HEAD_CORE);
      if (!c) {
        if (opts.stats && !opts.cue && classifyHead(feat, seed.from, minScore, MIN_CUE_CORE)) opts.stats.small++;
        continue;
      }
      const m = matches[c.kind] as Match;
      const t = m.template;
      const head: Head = { x: m.x + t.glyphWidth / 2, y: m.y, pos, kind: c.kind, score: c.score, kindScore: c.kindScore, w: t.glyphWidth, h: t.glyphHeight, feat };
      if (!best || head.score > best.score) best = head;
    }
    if (best) heads.push(best);
  }
  // Non-maximum suppression: two heads cannot overlap (seconds sit side by side, thirds stack).
  heads.sort((a, b) => b.score - a.score);
  const kept: Head[] = [];
  for (const hd of heads) {
    let clash = false;
    for (const k of kept) {
      const dx = Math.abs(k.x - hd.x);
      const dp = Math.abs(k.pos - hd.pos);
      if ((dp === 0 && dx < 0.9 * Math.min(k.w, hd.w)) || (dp === 1 && dx < 0.55 * s) || (dp >= 2 && dp < 2 && dx < 0.5 * s)) { clash = true; break; }
    }
    if (!clash) kept.push(hd);
  }
  kept.sort((a, b) => a.x - b.x || a.y - b.y);
  return kept;
}

/** Every seed with its measurements and verdict (development aid). */
export function debugSeeds(strip: Strip, xFrom: number, xTo: number): string[] {
  const out: string[] = [];
  for (const seed of [...coreSeeds(strip, xFrom, xTo), ...ringSeeds(strip, xFrom, xTo)]) {
    const pos = Math.round(posAt(strip, seed.y));
    const { feat } = measureHead(strip, seed.x, posY(strip, pos), seed.from === 'core' ? 2 : 4, 2, seed.from === 'core');
    const c = classifyHead(feat, seed.from, 0.45);
    out.push(`seed ${seed.from} x ${seed.x.toFixed(1)} y ${seed.y.toFixed(1)} pos ${pos} strength ${seed.strength.toFixed(2)} zF ${feat.zFilled.toFixed(2)} zO ${feat.zOpen.toFixed(2)} zW ${feat.zWhole.toFixed(2)} hole ${feat.holeOpen.toFixed(2)}/${feat.holeWhole.toFixed(2)} core ${feat.core.toFixed(2)} -> ${c ? `${c.kind} ${c.score.toFixed(2)}` : 'rejected'}`);
  }
  return out;
}
