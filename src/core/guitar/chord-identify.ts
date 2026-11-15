/**
 * From the fretboard back to a name: which chord a set of fretted positions makes.
 */
import {
  buildChord, chord as parseChord, chordToneMap, chordTones, identifyChords, note as parseNote, spellInKey, toneAt,
  type ChordMatch, type ChordToneRole, type KeyInput,
} from '@/core/theory';
import type { NeckOptions } from './fretboard';
import { tuning } from './tunings';
import type { FretPosition } from './types';
import { parseFrets, tryBuildVoicing, type Frets, type Voicing } from './voicing';

/** A shape as a fret string (`'x32010'`), frets per string low to high (null = muted), or a list of positions. */
export type FrettedInput = string | Frets | readonly FretPosition[];

/** One sounding note of an identified shape. */
export interface FrettedNote extends FretPosition {
  midi: number;
  /** Spelled as the best chord match spells it (or by the key when nothing matches). */
  note: string;
  /** Degree in the best match (`1`, `b3` …), or null when no chord was found. */
  degree: string | null;
  role: ChordToneRole | 'bass' | null;
}

/** What a set of fretted positions sounds like. */
export interface FrettedChord {
  /** Frets per string, low to high; null = not played. */
  frets: Array<number | null>;
  /** The sounding notes, lowest string first. */
  notes: FrettedNote[];
  /** Candidate names, most likely first (see `identifyChords` in the theory module). */
  matches: ChordMatch[];
  /** The most likely chord symbol, or null when the notes make no chord the catalog knows. */
  symbol: string | null;
}

/** Options for identifying a shape. */
export interface IdentifyFrettedOptions extends NeckOptions {
  /** Key of the music, so roots are spelled for it (Gb rather than F# in D flat major). */
  key?: KeyInput;
  /** Maximum number of candidates (default 8). */
  limit?: number;
}

function isPositions(input: Frets | readonly FretPosition[]): input is readonly FretPosition[] {
  return input.length > 0 && input.every((x) => x !== null && typeof x === 'object');
}

/** Frets per string (low to high) for any way of writing a shape. On a string named twice the higher fret sounds. */
export function toFrets(input: FrettedInput, stringCount = 6): Array<number | null> {
  if (typeof input === 'string') return parseFrets(input);
  if (!isPositions(input)) return [...(input as Frets)];
  const frets: Array<number | null> = new Array(stringCount).fill(null);
  for (const pos of input) {
    const index = stringCount - pos.string;
    if (index < 0 || index >= stringCount) throw new RangeError(`String ${pos.string} does not exist on a ${stringCount}-string instrument`);
    frets[index] = Math.max(frets[index] ?? 0, pos.fret);
  }
  return frets;
}

/**
 * Name the chord a shape makes: `identifyFretted('x32010').symbol` -> `C`;
 * `identifyFretted([{ string: 6, fret: 3 }, { string: 5, fret: 2 }, { string: 1, fret: 3 }, …])`.
 * Works for any tuning and capo. With fewer than two different notes there is nothing to name.
 */
export function identifyFretted(input: FrettedInput, opts: IdentifyFrettedOptions = {}): FrettedChord {
  const t = tuning(opts.tuning);
  const capo = opts.capo ?? 0;
  const frets = toFrets(input, t.stringCount);
  if (frets.length !== t.stringCount) throw new RangeError(`${frets.length} frets for a ${t.stringCount}-string tuning`);
  const sounding = frets
    .map((fret, index) => (fret === null ? null : { string: t.stringCount - index, fret, midi: t.midi[index] + capo + fret }))
    .filter((x): x is { string: number; fret: number; midi: number } => x !== null);
  const key = opts.key;
  const matches = identifyChords(sounding.map((n) => n.midi), {
    limit: opts.limit ?? 8,
    spell: key === undefined ? undefined : (pc) => spellInKey(pc, key, { octave: false }),
  });
  const best = matches[0] ?? null;
  const map = best ? chordToneMap(best.chord) : null;
  const roles = new Map<number, ChordToneRole>();
  if (best) for (const tone of chordTones(best.chord)) roles.set(parseNote(tone.note).chroma, tone.role);
  const notes: FrettedNote[] = sounding.map((n) => {
    if (!map) return { ...n, note: spellInKey(n.midi % 12, key ?? 'C', { octave: false }), degree: null, role: null };
    const info = toneAt(map, n.midi);
    const isBass = !info.member && map.bassPc === info.pc;
    return { ...n, note: isBass ? best!.chord.bass! : info.note, degree: info.degree, role: roles.get(info.pc) ?? (isBass ? 'bass' : null) };
  });
  return { frets, notes, matches, symbol: best?.symbol ?? null };
}

/**
 * A full voicing (notes with roles, fingers, barres, difficulty) for a shape the player made up,
 * named by the theory engine. Null when the notes make no known chord or no hand can hold the shape.
 * Pass `as` to read the shape as a particular chord instead of the most likely one.
 */
export function voicingFromFrets(input: FrettedInput, opts: IdentifyFrettedOptions & { as?: string } = {}): Voicing | null {
  const found = identifyFretted(input, opts);
  const symbol = opts.as ?? found.symbol;
  if (!symbol) return null;
  const c = parseChord(symbol);
  // The voicing names its own inversion from the lowest note: hand it the chord without the bass, unless the bass is foreign.
  const base = c.bass && c.inversion !== null ? buildChord(c.root, c.type) : c;
  return tryBuildVoicing(base, found.frets, { tuning: opts.tuning, capo: opts.capo });
}
