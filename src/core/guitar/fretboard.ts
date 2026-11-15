/**
 * Fretboard mapping: the pitch and the spelled note at a position, every position of a pitch,
 * and the conversions between string numbers (1 = thinnest) and low-to-high array indices.
 *
 * With a capo, frets count from the capo (fret 0 = the capoed open string), the way tab is written.
 */
import { DEFAULT_A4, midiToFreq } from '@/core/math/pitch-math';
import {
  chordToneMap, key as theoryKey, midiToNote, parseNote, pcToNote, scaleToneMap, spellInKey, toneAt, withOctaveFor,
  type Chord, type KeyInput, type ScaleType, type ToneMap,
} from '@/core/theory';
import { tuning, type Tuning, type TuningInput } from './tunings';
import type { FretPosition } from './types';

/** Frets assumed when a function is not told how long the neck is. */
export const DEFAULT_FRETS = 22;

/** Which instrument set-up a mapping function works on. */
export interface NeckOptions {
  /** Tuning id, name, object or open-string MIDI numbers (default standard). */
  tuning?: TuningInput;
  /** Fret the capo sits on (default 0 = none). Frets are then counted from the capo. */
  capo?: number;
}

/** A neck set-up plus the stretch of frets to look at. */
export interface FretRangeOptions extends NeckOptions {
  /** Lowest fret to include (default 0). */
  minFret?: number;
  /** Highest fret to include, counted from the capo like every fret (default: fret 22 of the wood). */
  maxFret?: number;
}

/**
 * How to name a pitch. A key, a scale on a tonic, a chord, or a ready `ToneMap` give the spelling
 * that context uses (E# in F# major); `prefer` gives context-free sharps or flats.
 */
export type SpellContext =
  | ToneMap
  | { key: KeyInput }
  | { tonic: string; scale?: string | ScaleType }
  | { chord: string | Chord }
  | { prefer: 'sharps' | 'flats' | 'auto' };

function isToneMap(ctx: SpellContext): ctx is ToneMap {
  return 'byPc' in ctx;
}

function mod12(n: number): number {
  return ((Math.round(n) % 12) + 12) % 12;
}

/** Array index (low to high) of a string number: on a six-string, string 6 -> 0 and string 1 -> 5. */
export function stringIndex(string: number, stringCount = 6): number {
  return stringCount - string;
}

/** String number (1 = thinnest) of a low-to-high array index: on a six-string, index 0 -> string 6. */
export function stringNumber(index: number, stringCount = 6): number {
  return stringCount - index;
}

/** True when the position exists: a real string, and a fret from 0 to `maxFret` (default 24 minus the capo). */
export function isValidPosition(pos: FretPosition, opts: FretRangeOptions = {}): boolean {
  const t = tuning(opts.tuning);
  const max = opts.maxFret ?? 24 - (opts.capo ?? 0);
  return Number.isInteger(pos.string) && Number.isInteger(pos.fret) && pos.string >= 1 && pos.string <= t.stringCount && pos.fret >= 0 && pos.fret <= max;
}

function requireString(t: Tuning, string: number): number {
  const index = t.stringCount - string;
  if (!Number.isInteger(string) || index < 0 || index >= t.stringCount) {
    throw new RangeError(`String ${string} does not exist in ${t.name} (${t.stringCount} strings)`);
  }
  return index;
}

/** Fret on the wood for a fret counted from the capo. */
export function physicalFret(fret: number, capo = 0): number {
  return fret + capo;
}

/** Sounding MIDI of an open string (with the capo on, of the capoed string). */
export function openStringMidi(string: number, opts: NeckOptions = {}): number {
  const t = tuning(opts.tuning);
  return t.midi[requireString(t, string)] + (opts.capo ?? 0);
}

/** Sounding MIDI at a position: `midiAt({ string: 5, fret: 3 })` -> 48 (C3). */
export function midiAt(pos: FretPosition, opts: NeckOptions = {}): number {
  return openStringMidi(pos.string, opts) + pos.fret;
}

/** Pitch class (0–11, C = 0) at a position. */
export function pitchClassAt(pos: FretPosition, opts: NeckOptions = {}): number {
  return mod12(midiAt(pos, opts));
}

/** Frequency in Hz at a position for a concert pitch (default A4 = 440 Hz). */
export function frequencyAt(pos: FretPosition, opts: NeckOptions & { a4?: number } = {}): number {
  return midiToFreq(midiAt(pos, opts), opts.a4 ?? DEFAULT_A4);
}

/** The `ToneMap` behind a spelling context, or null for a plain sharps/flats preference. */
export function toneMapFor(ctx: SpellContext): ToneMap | null {
  if (isToneMap(ctx)) return ctx;
  if ('chord' in ctx) return chordToneMap(ctx.chord);
  if ('tonic' in ctx) return scaleToneMap(ctx.tonic, ctx.scale ?? 'major');
  return null;
}

/**
 * Name a MIDI note in a context: `spellMidi(65, { tonic: 'F#', scale: 'major' })` -> `E#4`;
 * `spellMidi(61, { key: 'Ab major' })` -> `Db4`; with no context -> the commonest name (`Db4`).
 * `octave: false` drops the octave number.
 */
export function spellMidi(midi: number, context?: SpellContext, opts: { octave?: boolean } = {}): string {
  const rounded = Math.round(midi);
  let name: string;
  if (!context) name = pcToNote(mod12(rounded), 'auto');
  else if ('key' in context && !isToneMap(context)) name = spellInKey(mod12(rounded), theoryKey(context.key), { octave: false });
  else if ('prefer' in context && !isToneMap(context)) return midiToNote(rounded, { prefer: context.prefer, octave: opts.octave });
  else name = toneAt(toneMapFor(context)!, rounded).note;
  return opts.octave === false ? name : withOctaveFor(name, rounded);
}

/** Options for `noteAt`. */
export interface NoteAtOptions extends NeckOptions {
  /** Key, scale or chord that decides the spelling. Without one the commonest name is used. */
  context?: SpellContext;
  /** Include the octave number (default true). */
  octave?: boolean;
}

/**
 * The spelled note at a position: `noteAt({ string: 1, fret: 1 }, { context: { tonic: 'F#', scale: 'major' } })`
 * -> `E#4`. The context decides the spelling; the pitch is always the sounding one.
 */
export function noteAt(pos: FretPosition, opts: NoteAtOptions = {}): string {
  return spellMidi(midiAt(pos, opts), opts.context, { octave: opts.octave });
}

function fretLimit(opts: FretRangeOptions): { min: number; max: number } {
  const min = Math.max(0, Math.round(opts.minFret ?? 0));
  const max = Math.round(opts.maxFret ?? DEFAULT_FRETS - (opts.capo ?? 0));
  return { min, max };
}

/** Every position that sounds a MIDI note within the fret range, from the lowest string (highest fret) upwards. */
export function positionsForMidi(midi: number, opts: FretRangeOptions = {}): FretPosition[] {
  const t = tuning(opts.tuning);
  const { min, max } = fretLimit(opts);
  const out: FretPosition[] = [];
  t.midi.forEach((open, index) => {
    const fret = Math.round(midi) - open - (opts.capo ?? 0);
    if (fret >= min && fret <= max) out.push({ string: t.stringCount - index, fret });
  });
  return out;
}

/**
 * Every position of a pitch class (0–11) or note name without octave within the fret range,
 * string by string from the lowest, frets ascending.
 */
export function positionsForPitchClass(pc: number | string, opts: FretRangeOptions = {}): FretPosition[] {
  const t = tuning(opts.tuning);
  const { min, max } = fretLimit(opts);
  let target: number;
  if (typeof pc === 'number') target = mod12(pc);
  else {
    const parsed = parseNote(pc);
    if (!parsed) throw new RangeError(`Not a note name: "${pc}"`);
    target = parsed.chroma;
  }
  const out: FretPosition[] = [];
  t.midi.forEach((open, index) => {
    const first = mod12(target - open - (opts.capo ?? 0));
    for (let fret = first; fret <= max; fret += 12) if (fret >= min) out.push({ string: t.stringCount - index, fret });
  });
  return out;
}

/**
 * Every position of a note: a name with an octave (`E4`) or a MIDI number means that exact pitch,
 * a bare name (`E`) every octave of it.
 */
export function positionsForNote(noteOrMidi: string | number, opts: FretRangeOptions = {}): FretPosition[] {
  if (typeof noteOrMidi === 'number') return positionsForMidi(noteOrMidi, opts);
  const parsed = parseNote(noteOrMidi);
  if (!parsed) throw new RangeError(`Not a note name: "${noteOrMidi}"`);
  return parsed.midi === null ? positionsForPitchClass(parsed.chroma, opts) : positionsForMidi(parsed.midi, opts);
}

/** One fret of one string with its pitch and name. */
export interface FretboardCell extends FretPosition {
  midi: number;
  /** Spelled name without octave, in the requested context. */
  note: string;
}

/**
 * The whole fretboard as rows of cells: one row per string, low to high, each from `minFret` to
 * `maxFret`. For labelling a neck diagram in one call.
 */
export function fretboardNotes(opts: FretRangeOptions & { context?: SpellContext } = {}): FretboardCell[][] {
  const t = tuning(opts.tuning);
  const { min, max } = fretLimit(opts);
  return t.midi.map((open, index) => {
    const row: FretboardCell[] = [];
    for (let fret = min; fret <= max; fret++) {
      const midi = open + (opts.capo ?? 0) + fret;
      row.push({ string: t.stringCount - index, fret, midi, note: spellMidi(midi, opts.context, { octave: false }) });
    }
    return row;
  });
}

/** Lowest and highest sounding MIDI notes of a neck (`frets` on the wood, default 22). */
export function neckRange(opts: NeckOptions & { frets?: number } = {}): { low: number; high: number } {
  const t = tuning(opts.tuning);
  const capo = opts.capo ?? 0;
  return { low: Math.min(...t.midi) + capo, high: Math.max(...t.midi) + (opts.frets ?? DEFAULT_FRETS) };
}

/**
 * The scale step 1–7 behind a degree label, for the fixed degree colours (`--deg-1` … `--deg-7`):
 * `b3` -> 3, `#4` -> 4, `bb7` -> 7, and the compound degrees fold back (`9` -> 2, `#11` -> 4, `b13` -> 6).
 * Anything that is not a degree gives 1.
 */
export function degreeNumber(degree: string): number {
  const n = Number(/\d+/.exec(degree)?.[0] ?? 1);
  return n >= 1 ? ((n - 1) % 7) + 1 : 1;
}

/** Stable text key of a position, for sets and maps: `{ string: 5, fret: 3 }` -> `5:3`. */
export function positionKey(pos: FretPosition): string {
  return `${pos.string}:${pos.fret}`;
}

/** True when two positions are the same string and fret. */
export function samePosition(a: FretPosition, b: FretPosition): boolean {
  return a.string === b.string && a.fret === b.fret;
}
