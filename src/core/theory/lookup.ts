/**
 * Fast lookups for drawing. A fretboard asks the same question for every string and fret: "is
 * this pitch in the scale (or chord), what is it called here, and which degree is it?" A
 * `ToneMap` answers all three for the twelve pitch classes at once; it is computed once per
 * root and scale (or chord symbol), cached, and read with a single array index.
 */
import { chord, type Chord } from './chord';
import { CHROMATIC_DEGREES, degreeToInterval, transpose } from './interval';
import { note, simplifyNote, withOctaveFor } from './note';
import { getScale, scaleNotes, type ScaleType } from './scale';

/** What one pitch class is in the context of a scale or chord. */
export interface ToneInfo {
  /** Pitch class 0–11, C = 0. */
  pc: number;
  /** Spelled name in this context, without an octave: `E#` in F# major, `Bb` in C7. */
  note: string;
  /** Degree label against the root: `1`, `b3`, `#4`, and `9`, `#11`, `13` for chord tensions. */
  degree: string;
  /** The same as an interval above the root: `m3`, `A4`, `M9`. */
  interval: string;
  /** Semitones above the root, 0–11. */
  semitones: number;
  /** True when the scale or chord contains this pitch class. */
  member: boolean;
  /** Position among the members (0 = the root), or -1 for an outside note. */
  index: number;
}

/** A scale or chord on a root, laid out for constant-time lookup by pitch class. */
export interface ToneMap {
  kind: 'scale' | 'chord';
  /** Spelled root: the tonic of the scale or the root of the chord. */
  root: string;
  rootPc: number;
  /** Twelve-bit mask of the member pitch classes, absolute: bit 0 = C … bit 11 = B. */
  mask: number;
  /** The members in scale or chord order, root first. */
  tones: readonly ToneInfo[];
  /** All twelve pitch classes, indexed by pitch class (C = 0). Outside notes are spelled chromatically against the root. */
  byPc: readonly ToneInfo[];
  /** Pitch class of a chord's slash bass, or null. It is a member only if it is also a chord tone. */
  bassPc: number | null;
}

function pcOf(pitch: number): number {
  return ((Math.round(pitch) % 12) + 12) % 12;
}

function buildMap(
  kind: ToneMap['kind'], rootName: string, memberNotes: string[], memberIntervals: string[], memberDegrees: string[], bassPc: number | null,
): ToneMap {
  const root = note(rootName);
  const byPc: ToneInfo[] = [];
  const tones: ToneInfo[] = [];
  let mask = 0;
  memberNotes.forEach((name, index) => {
    const pc = note(name).chroma;
    // A pitch class can only hold one role; the first (lowest) one wins.
    if (byPc[pc]) return;
    const info: ToneInfo = Object.freeze({
      pc, note: name, degree: memberDegrees[index], interval: memberIntervals[index],
      semitones: (pc - root.chroma + 12) % 12, member: true, index: tones.length,
    });
    byPc[pc] = info;
    tones.push(info);
    mask |= 1 << pc;
  });
  for (let semitones = 0; semitones < 12; semitones++) {
    const pc = (root.chroma + semitones) % 12;
    if (byPc[pc]) continue;
    // Outside notes take the conventional chromatic degree (b2 b3 #4 b6 b7) and its spelling,
    // minus any double accidental, which helps nobody read a fretboard.
    const degree = CHROMATIC_DEGREES[semitones];
    const interval = degreeToInterval(degree);
    const exact = transpose(root.pcName, interval);
    const name = Math.abs(note(exact).alt) >= 2 ? simplifyNote(exact) : exact;
    byPc[pc] = Object.freeze({ pc, note: name, degree, interval, semitones, member: false, index: -1 });
  }
  return Object.freeze({
    kind, root: root.pcName, rootPc: root.chroma, mask, tones: Object.freeze(tones), byPc: Object.freeze(byPc), bassPc,
  });
}

const CACHE = new Map<string, ToneMap>();
const CACHE_LIMIT = 4000;

function cached(key: string, build: () => ToneMap): ToneMap {
  const hit = CACHE.get(key);
  if (hit) return hit;
  // Custom chord symbols are unbounded; start over rather than grow without limit.
  if (CACHE.size >= CACHE_LIMIT) CACHE.clear();
  const made = build();
  CACHE.set(key, made);
  return made;
}

/**
 * The lookup table for a scale on a tonic. The result is cached and frozen: call it as often as
 * you like, and never write to it. `scaleToneMap('A', 'minor-pentatonic').byPc[midi % 12]` tells
 * a fret whether it belongs, what to call it and which degree it is.
 */
export function scaleToneMap(tonic: string, scale: string | ScaleType = 'major'): ToneMap {
  const type = getScale(scale);
  if (!type) throw new RangeError(`Unknown scale: "${String(scale)}"`);
  const root = note(tonic).pcName;
  return cached(`s|${root}|${type.id}`, () => buildMap('scale', root, scaleNotes(root, type), type.intervals, type.degrees, null));
}

/**
 * The lookup table for a chord: chord tones with their degrees (`1 3 5 b7 9`), every other pitch
 * class spelled against the root, and the slash bass if there is one. Cached and frozen.
 */
export function chordToneMap(input: string | Chord): ToneMap {
  // A symbol seen before skips the parser altogether.
  const bySymbol = typeof input === 'string' ? CACHE.get(`t|${input}`) : undefined;
  if (bySymbol) return bySymbol;
  const c = chord(input);
  const map = cached(`c|${c.symbol}|${c.type.intervals.join(' ')}`, () =>
    buildMap('chord', c.root, c.notes, c.type.intervals, c.type.degrees, c.bass ? note(c.bass).chroma : null));
  if (typeof input === 'string') CACHE.set(`t|${input}`, map);
  return map;
}

/** What a pitch (MIDI number or pitch class) is in a tone map. Never null: outside notes come back with `member: false`. */
export function toneAt(map: ToneMap, pitch: number): ToneInfo {
  return map.byPc[pcOf(pitch)];
}

/** True when the pitch (MIDI number or pitch class) belongs to the scale or chord of the map. */
export function hasTone(map: ToneMap, pitch: number): boolean {
  return (map.mask & (1 << pcOf(pitch))) !== 0;
}

/**
 * Name a MIDI note the way the map's scale or chord spells it, octave included:
 * `spellWith(scaleToneMap('F#', 'major'), 65)` -> `E#4`. Pass `{ octave: false }` for the bare name.
 */
export function spellWith(map: ToneMap, midi: number, opts: { octave?: boolean } = {}): string {
  const name = toneAt(map, midi).note;
  return opts.octave === false ? name : withOctaveFor(name, Math.round(midi));
}
