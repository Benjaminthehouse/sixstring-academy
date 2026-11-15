/**
 * Capo and key helpers: where to put the capo so a song's chords become easy open shapes, and how
 * hard a set of chords is in each key.
 */
import { isNoChord, parseChord, transposeChordBySemitones, type Chord } from '@/core/theory';
import { chordVoicings } from './chord-generator';
import { hasStandardIntervals, tuning, type TuningInput } from './tunings';
import { type Voicing } from './voicing';

/** One chord of a song with the shape that plays it. */
export interface ChordShape {
  /** The chord that sounds: `Bb`. */
  chord: string;
  /** The shape to finger, named as if there were no capo: `G` (with the capo on fret 3). */
  shape: string;
  /** The easiest good voicing, built for the tuning and capo (its frets count from the capo). Null when none was found. */
  voicing: Voicing | null;
  /** Difficulty of that voicing, 1–10 (10 when there is none). */
  difficulty: number;
  /** True when it is one of the library's open-position shapes that a beginner can hold: no full barre, difficulty at most 4.5. */
  easy: boolean;
  /** How many times the chord appears in the list given. */
  count: number;
}

/** What a capo position does to a list of chords. */
export interface CapoSuggestion {
  /** Fret to put the capo on; 0 = no capo. */
  capo: number;
  /** The distinct chords, in order of first appearance, with their shapes at this capo position. */
  shapes: ChordShape[];
  /** How many of the chord occurrences are easy open shapes. */
  easyCount: number;
  /** The same as a fraction of all occurrences, 0–1. */
  easyShare: number;
  /** Mean difficulty over all occurrences, 1–10. */
  difficulty: number;
  /** Ranking score: higher is better. */
  score: number;
}

/** Options for the capo and key helpers. */
export interface CapoOptions {
  tuning?: TuningInput;
  /** Highest capo fret to consider (default 7). */
  maxCapo?: number;
}

function readChords(chords: ReadonlyArray<string | Chord>): Array<{ chord: Chord; count: number }> {
  const seen = new Map<string, { chord: Chord; count: number }>();
  for (const item of chords) {
    const c = typeof item === 'string' ? (isNoChord(item) ? null : parseChord(item)) : item;
    if (!c) continue;
    const held = seen.get(c.symbol);
    if (held) held.count++;
    else seen.set(c.symbol, { chord: c, count: 1 });
  }
  return [...seen.values()];
}

/**
 * An easy open shape: one of the library's open-position chords, without a full barre, that a
 * beginner can hold. Tunings the library does not cover have no such list, so there any simple
 * shape with open strings near the nut counts.
 */
function isEasy(v: Voicing | null): boolean {
  if (!v) return false;
  const fullBarre = v.barres.some((b) => b.fromString - b.toString >= 4);
  if (v.category === 'open') return !fullBarre && v.difficulty <= 4.5;
  const curated = hasStandardIntervals(tuning(v.tuning));
  return !curated && !v.movable && v.baseFret <= 3 && !fullBarre && v.difficulty <= 3.5;
}

/** The voicing a player would reach for first at this capo position: the top-ranked one near the capo. */
function pickVoicing(c: Chord, tuningInput: TuningInput | undefined, capo: number): Voicing | null {
  return chordVoicings(c, { tuning: tuningInput, capo, maxResults: 1, maxFret: 12 - Math.min(capo, 7) })[0] ?? null;
}

/**
 * The shapes that play a list of chords with the capo on a given fret: `capoShapes(['Bb', 'Eb', 'F'], 3)`
 * -> shapes G, C, D. Unreadable symbols and `N.C.` are skipped; repeats are counted, not listed twice.
 */
export function capoShapes(chords: ReadonlyArray<string | Chord>, capo: number, opts: CapoOptions = {}): ChordShape[] {
  return readChords(chords).map(({ chord, count }) => {
    const voicing = pickVoicing(chord, opts.tuning, capo);
    return {
      chord: chord.symbol,
      shape: capo === 0 ? chord.symbol : transposeChordBySemitones(chord, -capo),
      voicing,
      difficulty: voicing?.difficulty ?? 10,
      easy: isEasy(voicing),
      count,
    };
  });
}

function summarise(capo: number, shapes: ChordShape[]): CapoSuggestion {
  const total = shapes.reduce((sum, s) => sum + s.count, 0) || 1;
  const easyCount = shapes.reduce((sum, s) => sum + (s.easy ? s.count : 0), 0);
  const difficulty = shapes.reduce((sum, s) => sum + s.difficulty * s.count, 0) / total;
  // Easy shapes first, then overall ease; a capo is a small nuisance that grows up the neck.
  const score = 100 * (easyCount / total) - 6 * difficulty - 1.2 * capo - (capo > 0 ? 2 : 0);
  return { capo, shapes, easyCount, easyShare: easyCount / total, difficulty: Math.round(difficulty * 10) / 10, score: Math.round(score * 10) / 10 };
}

/**
 * Every capo position from 0 to `maxCapo`, best first: the one that turns the most chords into
 * easy open shapes wins, ties going to the easier shapes and the lower fret. Pass the chords as
 * they occur in the song (repeats included) so that frequent chords weigh more.
 * `suggestCapo(['Bb', 'Eb', 'F', 'Gm'])[0]` -> capo 3 with shapes G, C, D, Em.
 */
export function suggestCapo(chords: ReadonlyArray<string | Chord>, opts: CapoOptions = {}): CapoSuggestion[] {
  const max = Math.max(0, Math.min(12, Math.round(opts.maxCapo ?? 7)));
  const out: CapoSuggestion[] = [];
  for (let capo = 0; capo <= max; capo++) out.push(summarise(capo, capoShapes(chords, capo, opts)));
  return out.sort((a, b) => b.score - a.score || a.capo - b.capo);
}

/** The best capo position for a list of chords (possibly 0: no capo needed). */
export function bestCapo(chords: ReadonlyArray<string | Chord>, opts: CapoOptions = {}): CapoSuggestion {
  return suggestCapo(chords, opts)[0];
}

/** How hard a list of chords is to play as written. */
export interface ProgressionDifficulty {
  /** Mean difficulty over all occurrences, 1–10. */
  difficulty: number;
  /** The hardest chord, or null for an empty list. */
  hardest: string | null;
  /** Share of occurrences that are easy open shapes, 0–1. */
  easyShare: number;
  shapes: ChordShape[];
}

/** Difficulty of a list of chords without a capo: mean, hardest chord and the share of easy open shapes. */
export function progressionDifficulty(chords: ReadonlyArray<string | Chord>, opts: CapoOptions = {}): ProgressionDifficulty {
  const s = summarise(0, capoShapes(chords, 0, opts));
  const hardest = s.shapes.reduce<ChordShape | null>((a, b) => (!a || b.difficulty > a.difficulty ? b : a), null);
  return { difficulty: s.difficulty, hardest: hardest?.chord ?? null, easyShare: s.easyShare, shapes: s.shapes };
}

/** A list of chords moved to another key, with how hard it is there. */
export interface TranspositionOption {
  /** Semitones up from the original, 0–11. */
  semitones: number;
  /** The transposed chord symbols, one per distinct chord in order of first appearance. */
  chords: string[];
  /** Mean difficulty over all occurrences, 1–10. */
  difficulty: number;
  /** Share of occurrences that are easy open shapes, 0–1. */
  easyShare: number;
}

/** Mean difficulty (1–10) of a list of chords after transposing it up by `semitones`. */
export function transpositionDifficulty(chords: ReadonlyArray<string | Chord>, semitones: number, opts: CapoOptions = {}): number {
  const moved = readChords(chords).flatMap(({ chord, count }) => new Array<string>(count).fill(transposeChordBySemitones(chord, semitones)));
  return progressionDifficulty(moved, opts).difficulty;
}

/**
 * The twelve transpositions of a list of chords, easiest first: which key suits the guitar best.
 * `rankTranspositions(['Eb', 'Ab', 'Bb'])[0]` moves the song to open chords such as D, G, A.
 */
export function rankTranspositions(chords: ReadonlyArray<string | Chord>, opts: CapoOptions = {}): TranspositionOption[] {
  const parsed = readChords(chords);
  const out: TranspositionOption[] = [];
  for (let semitones = 0; semitones < 12; semitones++) {
    const moved = parsed.map(({ chord, count }) => ({ symbol: transposeChordBySemitones(chord, semitones), count }));
    const d = progressionDifficulty(moved.flatMap((m) => new Array<string>(m.count).fill(m.symbol)), opts);
    out.push({ semitones, chords: moved.map((m) => m.symbol), difficulty: d.difficulty, easyShare: d.easyShare });
  }
  return out.sort((a, b) => a.difficulty - b.difficulty || b.easyShare - a.easyShare || a.semitones - b.semitones);
}
