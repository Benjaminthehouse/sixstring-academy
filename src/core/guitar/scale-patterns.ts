/**
 * Scales on the neck: every position of a scale, and the playable patterns guitarists learn it
 * in. All of it is computed from the theory catalog, for any tuning and capo:
 *
 *  - `caged`          the five CAGED positions (tunings with standard intervals)
 *  - `box`            two notes per string: the five pentatonic boxes
 *  - `3nps`           three notes per string, one pattern per scale degree
 *  - `position`       hand positions of at most five frets, for any scale in any tuning
 *  - `single-string`  the scale along one string
 *  - `two-string`     one octave on a pair of neighbouring strings
 *  - `diagonal`       the same octave shape repeated across string pairs, climbing the neck
 *
 * A position pattern is simply every scale note inside a five-fret window. The window that suits
 * a shape is found by cost: notes outside the four-fret core of the position cost a little,
 * strings that need a five-fret stretch cost more. For the major scale and its modes this
 * reproduces the textbook CAGED fingerings exactly.
 *
 * Every pattern is an unbroken run of the scale. Where two strings are tuned more than a fourth
 * apart (drop D, DADGAD, open tunings) five frets cannot hold all of it, so the lower string
 * carries on up the neck to meet the next one, marked as a shift.
 */
import { getScale, note as parseTheoryNote, scaleToneMap, toneAt, type ChordToneRole, type ScaleType, type ToneMap } from '@/core/theory';
import { fingerLine, type FingerLineOptions } from './fingering';
import { DEFAULT_FRETS, type FretRangeOptions } from './fretboard';
import { hasStandardIntervals, tuning, tuningIntervals, type Tuning, type TuningInput } from './tunings';
import { CAGED_ORDER, type CagedShape, type Finger, type FretPosition } from './types';

/** A scale or chord tone at a place on the neck. */
export interface NeckTone extends FretPosition {
  midi: number;
  /** Spelled name without octave, as the scale or chord spells it (`E#` in F# major). */
  note: string;
  /** Degree label against the root: `1`, `b3`, `#4`. */
  degree: string;
  /** Index among the scale's (or chord's) tones, 0 = the root. */
  degreeIndex: number;
  isRoot: boolean;
  /** For chord tones (arpeggios): the job the note does in the chord. */
  role?: ChordToneRole;
}

/** A note of a pattern with its suggested fingering. */
export interface PatternNote extends NeckTone {
  /** Fretting finger 1–4; 0 for an open string. */
  finger: Finger;
  /** The finger reaches outside one-finger-per-fret while the hand stays in position. */
  stretch: boolean;
  /** The hand moves to a new position for this note. */
  shift: boolean;
}

/** The ways a scale is laid out on the neck. */
export type PatternSystem = 'caged' | 'box' | '3nps' | 'position' | 'single-string' | 'two-string' | 'diagonal';

/** Every pattern system, in teaching order. */
export const PATTERN_SYSTEMS: readonly PatternSystem[] = ['caged', 'box', '3nps', 'position', 'single-string', 'two-string', 'diagonal'];

/** One playable pattern of a scale (or arpeggio). */
export interface ScalePattern {
  /** Unique within one call: `caged-e`, `box-1`, `3nps-4`, `position-2`, `string-3`, `strings-6-5`, `diagonal-1`; repeats an octave up end in `-8va`. */
  id: string;
  system: PatternSystem;
  /** 0-based number within its system (box 1 is index 0). */
  index: number;
  /** Short name: `E shape`, `Box 1`, `3NPS pattern 2`, `String 3`. */
  name: string;
  /** Where it sits: `Open position`, `5th position`, `frets 3–12`. */
  positionName: string;
  /** Spelled tonic (or chord root for arpeggios). */
  tonic: string;
  /** Scale id from the theory catalog, or the chord symbol for arpeggios. */
  scale: string;
  /** Tuning id. */
  tuning: string;
  capo: number;
  /** The CAGED shape this pattern belongs to, when the tuning has standard intervals and the roots say so. */
  shape: CagedShape | null;
  /** Fret under the index finger for most of the pattern (1 in open position). */
  position: number;
  /** Lowest and highest fret used (open strings count as fret 0). */
  minFret: number;
  maxFret: number;
  /** Frets spanned by the fretted notes, inclusive (a box at frets 5–8 has span 4). */
  span: number;
  /** String numbers used, lowest string first. */
  strings: number[];
  /** The notes in playing order, ascending in pitch (string by string, except where a re-entrant string cuts in), each with degree, spelled note and finger. */
  notes: PatternNote[];
  /** Where the roots are. */
  roots: FretPosition[];
  hasStretch: boolean;
  hasShift: boolean;
}

/** Options shared by the pattern builders. */
export interface PatternOptions extends FretRangeOptions {
  /** Also return the repeats of each pattern twelve frets higher that still fit below `maxFret`. */
  allOctaves?: boolean;
  /**
   * Lay the patterns out as one climb up the neck: pattern 1 at its lowest place and every next
   * one above the one before (A minor pentatonic boxes at frets 5, 7, 9, 12 and 14) instead of
   * each at its own lowest place (boxes 4 and 5 in open and 2nd position). A pattern the neck has
   * no room for above stays at its lowest place. For the `box`, `3nps`, `position` and `diagonal` systems.
   */
  upTheNeck?: boolean;
}

interface Ctx {
  t: Tuning;
  capo: number;
  map: ToneMap;
  min: number;
  max: number;
  roles: Map<number, ChordToneRole> | null;
  label: string;
}

function makeCtx(map: ToneMap, label: string, opts: FretRangeOptions, roles: Map<number, ChordToneRole> | null = null): Ctx {
  const t = tuning(opts.tuning);
  const capo = opts.capo ?? 0;
  return {
    t, capo, map, roles, label,
    min: Math.max(0, Math.round(opts.minFret ?? 0)),
    max: Math.round(opts.maxFret ?? DEFAULT_FRETS - capo),
  };
}

function toneOn(ctx: Ctx, index: number, fret: number): NeckTone | null {
  const midi = ctx.t.midi[index] + ctx.capo + fret;
  const info = toneAt(ctx.map, midi);
  if (!info.member) return null;
  const tone: NeckTone = {
    string: ctx.t.stringCount - index, fret, midi, note: info.note, degree: info.degree, degreeIndex: info.index, isRoot: info.index === 0,
  };
  const role = ctx.roles?.get(info.pc);
  if (role) tone.role = role;
  return tone;
}

/**
 * Every position of the members of a tone map (scale or chord) within the fret range, string by
 * string from the lowest, frets ascending.
 */
export function tonePositions(map: ToneMap, opts: FretRangeOptions = {}, roles: Map<number, ChordToneRole> | null = null): NeckTone[] {
  const ctx = makeCtx(map, '', opts, roles);
  const out: NeckTone[] = [];
  for (let index = 0; index < ctx.t.stringCount; index++) {
    for (let fret = ctx.min; fret <= ctx.max; fret++) {
      const tone = toneOn(ctx, index, fret);
      if (tone) out.push(tone);
    }
  }
  return out;
}

function requireScale(scale: string | ScaleType): ScaleType {
  const found = getScale(scale);
  if (!found) throw new RangeError(`Unknown scale: "${String(scale)}"`);
  return found;
}

/**
 * Every position of a scale on the neck with its degree and spelled note:
 * `scalePositions('A', 'minor-pentatonic', { maxFret: 12 })`.
 */
export function scalePositions(tonic: string, scale: string | ScaleType = 'major', opts: FretRangeOptions = {}): NeckTone[] {
  return tonePositions(scaleToneMap(tonic, requireScale(scale)), opts);
}

// ── Finishing a pattern ────────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

const SHAPE_BY_ROOT_STRINGS: Record<string, CagedShape> = { '6,4,1': 'E', '4,2': 'D', '5,2': 'C', '5,3': 'A', '6,3,1': 'G' };

/**
 * The CAGED shape a set of root positions belongs to, read off the strings the roots are on
 * (string numbers of a six-string: 6-4-1 is the E shape, 5-3 the A shape …). Null when the roots
 * fit no shape.
 */
export function cagedShapeOfRoots(roots: readonly FretPosition[]): CagedShape | null {
  const strings = [...new Set(roots.map((r) => r.string))].filter((s) => s <= 6).sort((a, b) => b - a);
  return SHAPE_BY_ROOT_STRINGS[strings.join(',')] ?? null;
}

interface PatternMeta {
  id: string;
  system: PatternSystem;
  index: number;
  name: string;
  shape?: CagedShape | null;
  /** Position-playing patterns say where the hand lives; the rest are named by their fret range. */
  home?: number;
}

function finish(ctx: Ctx, meta: PatternMeta, tones: NeckTone[], fingering: FingerLineOptions): ScalePattern {
  const fingers = fingerLine(tones, fingering);
  const notes: PatternNote[] = tones.map((tone, i) => ({ ...tone, ...fingers[i] }));
  const frets = notes.map((n) => n.fret);
  const fretted = frets.filter((f) => f > 0);
  const minFret = Math.min(...frets);
  const maxFret = Math.max(...frets);
  const roots = notes.filter((n) => n.isRoot).map((n) => ({ string: n.string, fret: n.fret }));
  const firstFretted = notes.find((n) => n.fret > 0);
  const position = meta.home ?? (firstFretted ? firstFretted.fret - firstFretted.finger + 1 : 1);
  // Position patterns that were not handed a shape (boxes, generic positions) get it from where their roots are.
  const shape = meta.shape !== undefined ? meta.shape : hasStandardIntervals(ctx.t) ? cagedShapeOfRoots(roots) : null;
  let positionName: string;
  if (meta.home !== undefined) positionName = minFret === 0 ? 'Open position' : `${ordinal(position)} position`;
  else positionName = minFret === maxFret ? `fret ${minFret}` : `frets ${minFret}–${maxFret}`;
  return {
    id: meta.id, system: meta.system, index: meta.index, name: meta.name, positionName,
    tonic: ctx.map.root, scale: ctx.label, tuning: ctx.t.id, capo: ctx.capo,
    shape, position, minFret, maxFret,
    span: fretted.length ? Math.max(...fretted) - Math.min(...fretted) + 1 : 0,
    strings: [...new Set(notes.map((n) => n.string))],
    notes, roots,
    hasStretch: notes.some((n) => n.stretch),
    hasShift: notes.some((n) => n.shift),
  };
}

/** The same pattern twelve frets higher, when it still fits; fingering is recomputed (no open strings up there). */
function octaveRepeats<T>(ctx: Ctx, lowest: number, build: (shift: number) => T | null): T[] {
  const out: T[] = [];
  for (let shift = 12; lowest + shift <= ctx.max; shift += 12) {
    const made = build(shift);
    if (!made) break;
    out.push(made);
  }
  return out;
}

// ── Position windows ───────────────────────────────────────────────────────────────────────

interface Window {
  /** First fret of the five-fret window. */
  start: number;
  /** First fret of the four-fret core, where the index finger lives. */
  core: number;
  cost: number;
  tones: NeckTone[];
}

/**
 * Fill the holes a five-fret window leaves between two strings tuned more than a fourth apart
 * (the low strings of drop D, DADGAD, open tunings): the lower string carries on up the neck until
 * it meets the first note of the next one, so the pattern is the whole scale and not most of it.
 * Works on `tones` in place (string by string, frets ascending) and returns how many notes it added.
 */
function bridgeGaps(ctx: Ctx, tones: NeckTone[]): number {
  let added = 0;
  for (let i = tones.length - 1; i > 0; i--) {
    const below = tones[i - 1];
    const above = tones[i];
    if (below.string === above.string || above.midi - below.midi < 2) continue;
    const index = ctx.t.stringCount - below.string;
    const extra: NeckTone[] = [];
    for (let fret = below.fret + 1; ctx.t.midi[index] + ctx.capo + fret < above.midi && fret <= ctx.max; fret++) {
      const tone = toneOn(ctx, index, fret);
      if (tone) extra.push(tone);
    }
    tones.splice(i, 0, ...extra);
    added += extra.length;
  }
  return added;
}

/**
 * Every scale note in frets `start`…`start + 4`, each pitch once. `start` 0 is open position:
 * open strings plus frets 1–4, which is free of stretches by definition.
 */
function windowAt(ctx: Ctx, start: number): Window | null {
  if (start < 0 || start + 3 > ctx.max) return null;
  const end = Math.min(ctx.max, start + 4);
  const all: NeckTone[] = [];
  for (let index = 0; index < ctx.t.stringCount; index++) {
    for (let fret = start; fret <= end; fret++) {
      const tone = toneOn(ctx, index, fret);
      if (tone) all.push(tone);
    }
  }
  if (!all.length) return null;
  let best: Window | null = null;
  let bestOnCore = -1;
  for (const core of start === 0 ? [1] : [start, start + 1]) {
    const inCore = (fret: number) => (start === 0 && fret === 0) || (fret >= core && fret <= core + 3);
    // One place per pitch: an open string first, then the core, then the higher string.
    const byMidi = new Map<number, NeckTone>();
    for (const tone of all) {
      const held = byMidi.get(tone.midi);
      if (!held) {
        byMidi.set(tone.midi, tone);
        continue;
      }
      const rank = (x: NeckTone) => (x.fret === 0 ? 0 : inCore(x.fret) ? 1 : 2) * 100 + x.fret;
      if (rank(tone) < rank(held)) byMidi.set(tone.midi, tone);
    }
    // The extra fret beyond the core is only a bridge between strings. Past the outer string it
    // leads nowhere: drop it there (below the core on the lowest string, above it on the highest).
    const edge = core === start ? { string: 1, fret: start + 4 } : { string: ctx.t.stringCount, fret: start };
    let tones = all.filter((tone) => byMidi.get(tone.midi) === tone && !(start > 0 && tone.string === edge.string && tone.fret === edge.fret));
    const bridged = ctx.t.reentrant ? 0 : bridgeGaps(ctx, tones);
    // Where a string is tuned below its lower neighbour (ukulele), playing order is pitch order, not string order.
    if (ctx.t.reentrant) tones = [...tones].sort((a, b) => a.midi - b.midi);
    const outside = tones.filter((tone) => !inCore(tone.fret)).length - bridged;
    let stretched = 0;
    for (let index = 0; index < ctx.t.stringCount; index++) {
      const frets = tones.filter((tone) => tone.string === ctx.t.stringCount - index && tone.fret > 0).map((tone) => tone.fret);
      if (frets.length && Math.max(...frets) - Math.min(...frets) >= 4) stretched++;
    }
    const cost = (start === 0 ? 0 : 10 * outside + 15 * stretched) + 4 * bridged;
    const onCore = tones.filter((tone) => tone.fret === core).length;
    if (!best || cost < best.cost || (cost === best.cost && onCore > bestOnCore)) {
      best = { start, core, cost, tones };
      bestOnCore = onCore;
    }
  }
  return best;
}

function sameTones(a: NeckTone[], b: NeckTone[]): boolean {
  return a.length === b.length && a.every((tone, i) => tone.string === b[i].string && tone.fret === b[i].fret);
}

function windowPattern(ctx: Ctx, meta: PatternMeta, w: Window): ScalePattern {
  return finish(ctx, { ...meta, home: w.core }, w.tones, { home: w.core });
}

interface ShapeAnchor {
  shape: CagedShape;
  /** Index (from the lowest of the six standard strings) of the string that carries the anchoring root. */
  string: number;
  /** Window starts to try, relative to the root's fret: index-finger shapes sit on the root, little-finger shapes below it. */
  offsets: number[];
}

const SHAPE_ANCHORS: ShapeAnchor[] = [
  { shape: 'E', string: 0, offsets: [-1, 0] },
  { shape: 'D', string: 2, offsets: [-1, 0] },
  { shape: 'C', string: 1, offsets: [-4, -3] },
  { shape: 'A', string: 1, offsets: [-1, 0] },
  { shape: 'G', string: 0, offsets: [-4, -3] },
];

/** The window of each CAGED shape at its lowest place on the neck (plus `extra` octaves). Needs standard intervals. */
function cagedWindows(ctx: Ctx, extraOctave = 0): Array<{ shape: CagedShape; window: Window }> {
  const base = ctx.t.stringCount - 6;
  const out: Array<{ shape: CagedShape; window: Window }> = [];
  for (const anchor of SHAPE_ANCHORS) {
    const open = ctx.t.midi[base + anchor.string] + ctx.capo;
    const rootFret = (((ctx.map.rootPc - open) % 12) + 12) % 12;
    let found: Window | null = null;
    let skip = extraOctave;
    for (let octave = 0; octave <= 2 + extraOctave && !found; octave++) {
      const candidates = anchor.offsets
        .map((offset) => rootFret + 12 * octave + offset)
        .filter((start) => start >= ctx.min)
        .map((start) => windowAt(ctx, start))
        .filter((w): w is Window => w !== null);
      if (!candidates.length) continue;
      if (skip > 0) {
        skip--;
        continue;
      }
      found = candidates.reduce((a, b) => (b.cost < a.cost ? b : a));
    }
    if (found) out.push({ shape: anchor.shape, window: found });
  }
  return out;
}

/**
 * Hand positions for any tuning: the cheapest five-fret windows, at least two frets apart, until
 * every fret of an octave of the neck is inside one of them.
 */
function genericWindows(ctx: Ctx): Window[] {
  const candidates: Window[] = [];
  for (let start = ctx.min; start < ctx.min + 12; start++) {
    const w = windowAt(ctx, start);
    if (w) candidates.push(w);
  }
  const ranked = [...candidates].sort((a, b) => a.cost - b.cost || a.start - b.start);
  const chosen: Window[] = [];
  const covered = new Set<number>();
  const far = (a: number, b: number) => {
    const d = Math.abs(a - b) % 12;
    return Math.min(d, 12 - d) >= 2;
  };
  for (const w of ranked) {
    if (covered.size >= 12) break;
    if (!chosen.every((c) => far(c.start, w.start))) continue;
    if (chosen.some((c) => sameTones(c.tones, w.tones))) continue;
    chosen.push(w);
    for (let fret = w.start; fret <= w.start + 4; fret++) covered.add(fret % 12);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

function positionWindows(ctx: Ctx): Array<{ shape: CagedShape | null; window: Window }> {
  if (hasStandardIntervals(ctx.t)) {
    // In the order of the pentatonic boxes: the root-position (E) shape first, then up the neck.
    const caged = cagedWindows(ctx);
    // Two shapes landing on the same notes (sparse scales) are one position, not two.
    return caged.filter((entry, i) => caged.findIndex((other) => sameTones(other.window.tones, entry.window.tones)) === i);
  }
  return genericWindows(ctx).map((window) => ({ shape: null, window }));
}

function buildCaged(ctx: Ctx, opts: PatternOptions): ScalePattern[] {
  if (!hasStandardIntervals(ctx.t)) return buildPositions(ctx, opts);
  const out: ScalePattern[] = [];
  for (let octave = 0; octave <= (opts.allOctaves ? 2 : 0); octave++) {
    for (const { shape, window } of cagedWindows(ctx, octave)) {
      const suffix = octave > 0 ? '-8va'.repeat(octave) : '';
      out.push(windowPattern(ctx, {
        id: `caged-${shape.toLowerCase()}${suffix}`, system: 'caged', index: CAGED_ORDER.indexOf(shape), name: `${shape} shape`, shape,
      }, window));
    }
  }
  return out.sort((a, b) => a.position - b.position || a.minFret - b.minFret);
}

function buildPositions(ctx: Ctx, opts: PatternOptions): ScalePattern[] {
  const windows = positionWindows(ctx);
  if (opts.upTheNeck) {
    // Each position above the one before; one the neck has no room for stays where it is.
    for (let i = 1; i < windows.length; i++) {
      if (windows[i].window.start > windows[i - 1].window.start) continue;
      const higher = windowAt(ctx, windows[i].window.start + 12);
      if (higher && higher.start + 4 <= ctx.max) windows[i] = { shape: windows[i].shape, window: higher };
    }
  }
  const out = windows.map(({ shape, window }, index) => windowPattern(ctx, {
    id: `position-${index + 1}`, system: 'position', index, name: `Position ${index + 1}`, shape,
  }, window));
  if (opts.allOctaves) {
    windows.forEach(({ shape, window }, index) => {
      out.push(...octaveRepeats(ctx, window.start + 4, (shift) => {
        const w = windowAt(ctx, window.start + shift);
        return w ? windowPattern(ctx, {
          id: `position-${index + 1}${'-8va'.repeat(shift / 12)}`, system: 'position', index, name: `Position ${index + 1}`, shape,
        }, w) : null;
      }));
    });
  }
  return out;
}

// ── Notes-per-string patterns ──────────────────────────────────────────────────────────────

/** Semitones up from tone `from` to tone `to` of the map (a full octave when they are the same tone). */
function stepUp(ctx: Ctx, from: number, to: number): number {
  const tones = ctx.map.tones;
  return ((tones[to % tones.length].pc - tones[from % tones.length].pc + 12) % 12) || 12;
}

/** Lowest fret at or above `min` where string `index` sounds tone number `degree`. */
function lowestFretOf(ctx: Ctx, index: number, degree: number, min: number): number {
  const pc = ctx.map.tones[degree % ctx.map.tones.length].pc;
  let fret = (((pc - ctx.t.midi[index] - ctx.capo) % 12) + 12) % 12;
  while (fret < min) fret += 12;
  return fret;
}

/**
 * Fret of the next tone when a line crosses from one string to the next. Normally the pitch simply
 * continues upward. Where the next string is tuned lower (re-entrant tunings) the shape continues
 * instead: the nearest fret to where the hand already is.
 */
function crossTo(ctx: Ctx, fromIndex: number, lastFret: number, step: number, toIndex: number, near: number): number {
  const interval = ctx.t.midi[toIndex] - ctx.t.midi[fromIndex];
  if (interval > 0) return lastFret + step - interval;
  let fret = (((lastFret + step - interval) % 12) + 12) % 12;
  while (fret + 6 < near) fret += 12;
  return fret;
}

/**
 * Walk the scale upward from tone `startDegree`, giving each listed string its number of notes.
 * Returns null when the walk leaves the neck (the caller then tries twelve frets higher).
 */
function walkStrings(ctx: Ctx, startDegree: number, startFret: number, plan: Array<{ index: number; count: number }>): NeckTone[] | null {
  const tones: NeckTone[] = [];
  let degree = startDegree;
  let fret = startFret;
  for (let p = 0; p < plan.length; p++) {
    const { index, count } = plan[p];
    if (p > 0) {
      const prev = plan[p - 1];
      const segment = tones.filter((tone) => tone.string === ctx.t.stringCount - prev.index);
      const middle = (segment[0].fret + segment[segment.length - 1].fret) / 2;
      fret = crossTo(ctx, prev.index, fret, stepUp(ctx, degree - 1, degree), index, middle);
    }
    for (let k = 0; k < count; k++) {
      if (k > 0) fret += stepUp(ctx, degree - 1, degree);
      if (fret < ctx.min || fret > ctx.max) return null;
      const tone = toneOn(ctx, index, fret);
      /* c8 ignore next */
      if (!tone) return null;
      tones.push(tone);
      degree++;
    }
  }
  return tones;
}

/**
 * A walk at its lowest place on the neck, plus octave repeats when asked for. `above` (for
 * `upTheNeck`) asks for the first note to sit above that fret; when the neck has no room for that,
 * the walk falls back to its lowest place.
 */
function placeWalk(
  ctx: Ctx, opts: PatternOptions, startDegree: number, plan: Array<{ index: number; count: number }>,
  make: (tones: NeckTone[], octave: number) => ScalePattern, above = -1,
): ScalePattern[] {
  const out: ScalePattern[] = [];
  const first = lowestFretOf(ctx, plan[0].index, startDegree, ctx.min);
  const walks: Array<{ fret: number; tones: NeckTone[] }> = [];
  for (let tries = 0, fret = first; tries < 4 && fret <= ctx.max; tries++, fret += 12) {
    const tones = walkStrings(ctx, startDegree, fret, plan);
    if (tones) walks.push({ fret, tones });
  }
  const from = Math.max(0, walks.findIndex((w) => w.fret > above));
  walks.slice(from).forEach((w, octave) => {
    if (octave === 0 || opts.allOctaves) out.push(make(w.tones, octave));
  });
  return out;
}

function everyString(ctx: Ctx, count: number): Array<{ index: number; count: number }> {
  return Array.from({ length: ctx.t.stringCount }, (_unused, index) => ({ index, count }));
}

function buildPerString(ctx: Ctx, opts: PatternOptions, perString: 2 | 3): ScalePattern[] {
  const out: ScalePattern[] = [];
  const size = ctx.map.tones.length;
  // Patterns are numbered by the note they start with on string 6, as every method does. A seven-string
  // keeps those numbers: its extra low string only extends each pattern downward.
  const extra = hasStandardIntervals(ctx.t) ? ctx.t.stringCount - 6 : 0;
  const shift = (((perString * extra) % size) + size) % size;
  let above = -1;
  for (let number = 0; number < size; number++) {
    // The degree the walk starts on, on the lowest string.
    const start = (((number - shift) % size) + size) % size;
    const degree = number;
    const placed = placeWalk(ctx, opts, start, everyString(ctx, perString), (tones, octave) => {
      const suffix = '-8va'.repeat(octave);
      if (perString === 2) {
        // A box is played in position: the hand lives where most strings start.
        const frets = tones.filter((t) => t.fret > 0).map((t) => t.fret);
        const low = frets.length ? Math.min(...frets) : 1;
        const high = frets.length ? Math.max(...frets) : 1;
        let home = low;
        let best = Infinity;
        // With open strings in play the hand is in first position: finger = fret.
        const openPosition = tones.some((t) => t.fret === 0) && high <= 4;
        for (let h = openPosition ? 1 : low; h <= (openPosition ? 1 : Math.max(low, high - 3)); h++) {
          const outside = frets.filter((f) => f < h || f > h + 3).length;
          const score = outside * 100 - frets.filter((f) => f === h).length;
          if (score < best) {
            best = score;
            home = h;
          }
        }
        return finish(ctx, { id: `box-${degree + 1}${suffix}`, system: 'box', index: degree, name: `Box ${degree + 1}`, home }, tones, { home });
      }
      return finish(ctx, { id: `3nps-${degree + 1}${suffix}`, system: '3nps', index: degree, name: `3NPS pattern ${degree + 1}`, shape: null }, tones, { wide: true });
    }, above);
    if (opts.upTheNeck && placed.length) above = placed[0].notes[0].fret;
    out.push(...placed);
  }
  return out;
}

function buildSingleString(ctx: Ctx): ScalePattern[] {
  const out: ScalePattern[] = [];
  for (let index = 0; index < ctx.t.stringCount; index++) {
    const string = ctx.t.stringCount - index;
    const tones: NeckTone[] = [];
    let first = -1;
    for (let fret = ctx.min; fret <= ctx.max; fret++) {
      const tone = toneOn(ctx, index, fret);
      if (!tone) continue;
      if (first < 0) first = fret;
      // One octave from the first note, closing on its octave.
      if (fret > first + 12) break;
      tones.push(tone);
    }
    if (tones.length < 2) continue;
    out.push(finish(ctx, { id: `string-${string}`, system: 'single-string', index, name: `String ${string}`, shape: null }, tones, {}));
  }
  return out;
}

function buildTwoString(ctx: Ctx, opts: PatternOptions): ScalePattern[] {
  const out: ScalePattern[] = [];
  const size = ctx.map.tones.length;
  // One octave closing on the root: the lower string takes the first half, the higher string the rest.
  const lower = Math.ceil((size + 1) / 2);
  for (let index = 0; index + 1 < ctx.t.stringCount; index++) {
    const a = ctx.t.stringCount - index;
    const plan = [{ index, count: lower }, { index: index + 1, count: size + 1 - lower }];
    out.push(...placeWalk(ctx, opts, 0, plan, (tones, octave) => finish(ctx, {
      id: `strings-${a}-${a - 1}${'-8va'.repeat(octave)}`, system: 'two-string', index, name: `Strings ${a}–${a - 1}`, shape: null,
    }, tones, { reach: size >= 7 ? 4 : 3 })));
  }
  return out;
}

function buildDiagonal(ctx: Ctx, opts: PatternOptions): ScalePattern[] {
  const out: ScalePattern[] = [];
  const size = ctx.map.tones.length;
  // One octave per string pair, always the same shape: the smaller half below, the larger above.
  const lower = Math.floor(size / 2);
  const plan = Array.from({ length: ctx.t.stringCount }, (_unused, index) => ({ index, count: index % 2 === 0 ? lower : size - lower }));
  let above = -1;
  for (let degree = 0; degree < size; degree++) {
    const placed = placeWalk(ctx, opts, degree, plan, (tones, octave) => {
      // Close the run on the octave of its first note when the neck allows.
      const last = tones[tones.length - 1];
      const consumed = plan.reduce((sum, p) => sum + p.count, 0);
      const closingFret = last.fret + stepUp(ctx, degree + consumed - 1, degree + consumed);
      const closing = closingFret <= ctx.max ? toneOn(ctx, ctx.t.stringCount - last.string, closingFret) : null;
      return finish(ctx, {
        id: `diagonal-${degree + 1}${'-8va'.repeat(octave)}`, system: 'diagonal', index: degree, name: `Diagonal ${degree + 1}`, shape: null,
      }, closing ? [...tones, closing] : tones, { reach: size >= 7 ? 4 : 3 });
    }, above);
    if (opts.upTheNeck && placed.length) above = placed[0].notes[0].fret;
    out.push(...placed);
  }
  return out;
}

function buildSystem(ctx: Ctx, system: PatternSystem, opts: PatternOptions): ScalePattern[] {
  switch (system) {
    case 'caged': return buildCaged(ctx, opts);
    case 'box': return buildPerString(ctx, opts, 2);
    case '3nps': return buildPerString(ctx, opts, 3);
    case 'position': return buildPositions(ctx, opts);
    case 'single-string': return buildSingleString(ctx);
    case 'two-string': return buildTwoString(ctx, opts);
    case 'diagonal': return buildDiagonal(ctx, opts);
    /* c8 ignore next 2 */
    default: throw new RangeError(`Unknown pattern system: "${String(system)}"`);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────────────────

/**
 * The pattern systems that suit a scale in a tuning, the usual one first: pentatonic scales get
 * boxes (positions first in open and drop tunings, where boxes sprawl), seven-note scales CAGED
 * (or plain positions when the tuning has no CAGED shapes), every other size positions.
 */
export function patternSystemsFor(scale: string | ScaleType, tuningInput: TuningInput = 'standard'): PatternSystem[] {
  const type = requireScale(scale);
  const standard = hasStandardIntervals(tuningInput);
  const runs: PatternSystem[] = ['single-string', 'two-string', 'diagonal'];
  // Three notes per string only pays off from seven notes up: with fewer it runs off the neck
  // (pentatonics) or is the diagonal pattern under another name (six-note scales).
  // Two notes per string only make compact boxes when the strings are a fourth or a third apart.
  const fourths = tuningIntervals(tuningInput).every((step) => step === 4 || step === 5);
  if (type.size === 5) return fourths ? ['box', ...runs] : ['position', 'box', ...runs];
  if (type.size === 6) return ['position', ...runs];
  if (type.size === 7) return [standard ? 'caged' : 'position', '3nps', ...runs];
  return ['position', '3nps', ...runs];
}

/** Options for `scalePatterns`. */
export interface ScalePatternOptions extends PatternOptions {
  /** Which layout to build (default: the first of `patternSystemsFor`). */
  system?: PatternSystem;
}

/**
 * The playable patterns of a scale in one system, lowest on the neck first:
 * `scalePatterns('A', 'minor-pentatonic')` gives the five boxes, `scalePatterns('C', 'major')` the
 * five CAGED positions, `scalePatterns('G', 'major', { system: '3nps' })` the seven
 * three-notes-per-string patterns. `caged` in a tuning without CAGED shapes gives `position` patterns.
 */
export function scalePatterns(tonic: string, scale: string | ScaleType = 'major', opts: ScalePatternOptions = {}): ScalePattern[] {
  const type = requireScale(scale);
  const ctx = makeCtx(scaleToneMap(tonic, type), type.id, opts);
  const system = opts.system ?? patternSystemsFor(type, ctx.t)[0];
  return buildSystem(ctx, system, opts);
}

/** Patterns of a scale in several systems at once (default: every system that suits it), keyed by system. */
export function allScalePatterns(
  tonic: string, scale: string | ScaleType = 'major', opts: PatternOptions & { systems?: PatternSystem[] } = {},
): Partial<Record<PatternSystem, ScalePattern[]>> {
  const type = requireScale(scale);
  const ctx = makeCtx(scaleToneMap(tonic, type), type.id, opts);
  const out: Partial<Record<PatternSystem, ScalePattern[]>> = {};
  for (const system of opts.systems ?? patternSystemsFor(type, ctx.t)) out[system] = buildSystem(ctx, system, opts);
  return out;
}

/** One pattern by system and 0-based index (box 1 is index 0; CAGED indices follow C A G E D). Null when there is none. */
export function scalePattern(
  tonic: string, scale: string | ScaleType, system: PatternSystem, index: number, opts: PatternOptions = {},
): ScalePattern | null {
  return scalePatterns(tonic, scale, { ...opts, system }).find((p) => p.index === index) ?? null;
}

/**
 * The hand position at a fret: every scale note the hand reaches with the index finger at (or one
 * fret either side of) `fret`. Used to show "the notes under your hand" wherever the hand is.
 */
export function positionPatternAt(tonic: string, scale: string | ScaleType, fret: number, opts: FretRangeOptions = {}): ScalePattern | null {
  const type = requireScale(scale);
  const ctx = makeCtx(scaleToneMap(tonic, type), type.id, opts);
  const at = Math.max(0, Math.round(fret));
  const candidates = [at - 1, at]
    .map((start) => windowAt(ctx, start))
    .filter((w): w is Window => w !== null && (w.core === at || (at <= 1 && w.start === 0)));
  const window = candidates.sort((a, b) => a.cost - b.cost)[0] ?? windowAt(ctx, Math.max(0, at));
  if (!window) return null;
  return windowPattern(ctx, { id: `position-at-${at}`, system: 'position', index: 0, name: at === 0 ? 'Open position' : `${ordinal(window.core)} position` }, window);
}

/**
 * Patterns for any tone map (scale or chord): the engine behind `scalePatterns` and the arpeggio
 * patterns. `label` is stored as the pattern's `scale` field.
 */
export function tonePatterns(
  map: ToneMap, label: string, system: PatternSystem, opts: PatternOptions = {}, roles: Map<number, ChordToneRole> | null = null,
): ScalePattern[] {
  return buildSystem(makeCtx(map, label, opts, roles), system, opts);
}

/** The pattern (of those given) whose notes include a position, or null. */
export function patternContaining(patterns: readonly ScalePattern[], pos: FretPosition): ScalePattern | null {
  return patterns.find((p) => p.notes.some((n) => n.string === pos.string && n.fret === pos.fret)) ?? null;
}

/** Spelled tonic of a pattern as a pitch class 0–11, for callers that colour roots. */
export function patternRootPc(pattern: ScalePattern): number {
  return parseTheoryNote(pattern.tonic).chroma;
}
