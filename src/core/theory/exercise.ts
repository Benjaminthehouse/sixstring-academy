/**
 * Building blocks for generated exercises: every interval from a note, marking a spelled answer
 * (right, right pitch but wrong name, or wrong), and plausible wrong answers for multiple choice.
 *
 * Nothing here is random. Lists come back in a fixed order, the most tempting wrong answer first,
 * so a generator can seed its own shuffle and a test can pin the result.
 */
import { CHORD_TYPES, getChordType, type ChordType } from './chord';
import {
  interval, intervalName, intervalToDegree, invertInterval, semitonesToInterval, SIMPLE_INTERVALS, transpose,
} from './interval';
import {
  enharmonics, note, noteName, parseNote, pcToNote, withOctaveFor, type AccidentalPreference, type Note,
} from './note';

// ── Intervals from a note ──────────────────────────────────────────────────────────────────

/** One interval measured from a starting note. */
export interface IntervalFromNote {
  /** Interval name: `m3`; descending ones carry a minus sign (`-m3`). */
  interval: string;
  /** English name: `minor third`. */
  name: string;
  /** The note that interval lands on, correctly spelled; it keeps an octave if the start had one. */
  note: string;
  /** Signed size in semitones. */
  semitones: number;
  /** Degree label against the start as tonic (`b3`); null for descending intervals. */
  degree: string | null;
}

/**
 * Every interval from a note, with the note it reaches: `intervalsFrom('F#')` -> P1 F#, m2 G,
 * M2 G#, … A4 B#, d5 C, … P8 F#. By default the fourteen simple intervals (both tritones);
 * pass your own list for compound ones, and `descending` to measure downwards. Spellings are
 * exact (a minor second above Gb is Abb), because that is the thing being taught.
 */
export function intervalsFrom(start: string, opts: { intervals?: readonly string[]; descending?: boolean } = {}): IntervalFromNote[] {
  const from = note(start).name;
  return (opts.intervals ?? SIMPLE_INTERVALS).map((given) => {
    const ivl = interval(given);
    const up = ivl.direction > 0 ? ivl.name : ivl.name.slice(1);
    const name = opts.descending ? `-${up}` : ivl.name;
    // Canonical name: a "descending unison" is just P1.
    const parsed = interval(name);
    return {
      interval: parsed.name,
      name: intervalName(parsed.name),
      note: transpose(from, parsed.name),
      semitones: parsed.semitones,
      degree: opts.descending || parsed.direction < 0 ? null : intervalToDegree(parsed.name),
    };
  });
}

// ── Marking spelled answers ────────────────────────────────────────────────────────────────

/**
 * How an answered note compares with the expected one. `enharmonic` is the right pitch under the
 * wrong name (F where E# was wanted): worth a different message than a plain `wrong`.
 */
export type SpellingVerdict = 'correct' | 'enharmonic' | 'wrong' | 'invalid';

function samePitch(a: Note, b: Note): boolean {
  return a.midi !== null && b.midi !== null ? a.midi === b.midi : a.chroma === b.chroma;
}

/**
 * Mark one note name against the expected spelling: (`E#`, `E#`) -> `correct`, (`F`, `E#`) ->
 * `enharmonic`, (`E`, `E#`) -> `wrong`, (`H`, `E#`) -> `invalid`. Input may be lower case or use
 * music symbols. Octaves are compared only when both names carry one.
 */
export function checkSpelling(answer: string, expected: string): SpellingVerdict {
  const want = note(expected);
  const got = parseNote(answer);
  if (!got) return 'invalid';
  if (!samePitch(got, want)) return 'wrong';
  return got.step === want.step && got.alt === want.alt ? 'correct' : 'enharmonic';
}

/** The marking of a list of answered notes. */
export interface SpellingReport {
  /** One verdict per answer, in the order given. */
  verdicts: SpellingVerdict[];
  /** True when every expected note was given with exactly the right name and nothing else was. */
  correct: boolean;
  /** True when the pitches are all right even if some names are not. */
  pitchesCorrect: boolean;
  /** Expected notes that no answer matched, even enharmonically. */
  missing: string[];
  /** Answers that matched no expected note. */
  extra: string[];
}

/**
 * Mark a spelled scale or chord. With `ordered` (the default) the answers are compared position
 * by position, as when writing a scale out; without it they may come in any order, as when
 * naming the notes of a chord.
 */
export function checkSpellings(answers: readonly string[], expected: readonly string[], opts: { ordered?: boolean } = {}): SpellingReport {
  const verdicts: SpellingVerdict[] = [];
  const matched = new Array<boolean>(expected.length).fill(false);
  const extra: string[] = [];
  answers.forEach((answer, index) => {
    let verdict: SpellingVerdict;
    if (opts.ordered === false) {
      const got = parseNote(answer);
      let hit = -1;
      if (got) {
        hit = expected.findIndex((e, i) => !matched[i] && checkSpelling(answer, e) === 'correct');
        if (hit < 0) hit = expected.findIndex((e, i) => !matched[i] && checkSpelling(answer, e) === 'enharmonic');
      }
      verdict = !got ? 'invalid' : hit < 0 ? 'wrong' : checkSpelling(answer, expected[hit]);
      if (hit >= 0) matched[hit] = true;
    } else if (index < expected.length) {
      verdict = checkSpelling(answer, expected[index]);
      matched[index] = verdict === 'correct' || verdict === 'enharmonic';
    } else {
      verdict = parseNote(answer) ? 'wrong' : 'invalid';
    }
    if (verdict === 'wrong' || verdict === 'invalid') extra.push(answer);
    verdicts.push(verdict);
  });
  const missing = expected.filter((_e, i) => !matched[i]);
  const complete = missing.length === 0 && extra.length === 0 && answers.length === expected.length;
  return {
    verdicts,
    correct: complete && verdicts.every((v) => v === 'correct'),
    pitchesCorrect: complete,
    missing,
    extra,
  };
}

// ── Wrong answers worth offering ───────────────────────────────────────────────────────────

/** Options for `distractorNotes`. */
export interface DistractorNoteOptions {
  /** How many to return (default 3). Fewer come back when the pool runs dry. */
  count?: number;
  /** Names that must not be offered: other correct answers, or notes already on screen. */
  exclude?: readonly string[];
  /**
   * Also offer notes that sound like the answer under another name (F for E#), first in the list.
   * That is the classic trap of a spelling question and exactly wrong for a pitch question, where
   * it would mark a right answer as an error. Default false.
   */
  enharmonic?: boolean;
  /** Draw only from these notes (a scale, the seven naturals), nearest in pitch first. */
  pool?: readonly string[];
}

const WHITE_KEY_PCS = [0, 2, 4, 5, 7, 9, 11];
// Semitone offsets in the order learners confuse them: neighbours first, then the fifth and
// fourth, then thirds, then the rest.
const NEIGHBOUR_OFFSETS = [1, -1, 2, -2, 7, -7, 5, -5, 3, -3, 4, -4, 6];

/**
 * Plausible wrong answers for a question whose answer is a note, most tempting first: the same
 * letter with another accidental (E for E#), then the notes a half step and a whole step away,
 * then the fifth and fourth. `distractorNotes('F#')` -> `['F', 'G', 'G#']`. Results never sound
 * like the answer unless `enharmonic` is set, and they keep an octave if the answer has one.
 */
export function distractorNotes(correct: string, opts: DistractorNoteOptions = {}): string[] {
  const answer = note(correct);
  const count = opts.count ?? 3;
  const excludedNames = new Set((opts.exclude ?? []).map((n) => parseNote(n)?.name ?? n));
  const excludedPcs = new Set((opts.exclude ?? []).map((n) => parseNote(n)?.chroma).filter((pc): pc is number => pc !== undefined));
  const prefer: AccidentalPreference = answer.alt > 0 ? 'sharps' : answer.alt < 0 ? 'flats' : 'auto';
  const candidates: string[] = [];
  const at = (offset: number): string => {
    const name = pcToNote((((answer.chroma + offset) % 12) + 12) % 12, prefer);
    return answer.midi === null ? name : withOctaveFor(name, answer.midi + offset);
  };

  if (opts.pool) {
    const distance = (name: string) => {
      const d = Math.abs(note(name).chroma - answer.chroma);
      return Math.min(d, 12 - d);
    };
    candidates.push(...[...opts.pool].filter((n) => parseNote(n) !== null).sort((a, b) => distance(a) - distance(b)));
  } else {
    // Only the everyday twins: F for E#, never Gbb.
    if (opts.enharmonic) candidates.push(...enharmonics(answer.name).filter((n) => Math.abs(note(n).alt) <= 1));
    // Same letter, other accidental. E#/B#/Cb/Fb are only worth offering when spelling is the point.
    for (const alt of [0, 1, -1]) {
      if (alt === answer.alt) continue;
      const name = noteName(answer.step, alt, answer.octave);
      const isAlias = alt !== 0 && WHITE_KEY_PCS.includes(note(name).chroma);
      if (!isAlias || opts.enharmonic) candidates.push(name);
    }
    for (const offset of NEIGHBOUR_OFFSETS) candidates.push(at(offset));
  }

  const out: string[] = [];
  const usedPcs = new Set<number>();
  for (const candidate of candidates) {
    if (out.length >= count) break;
    const n = note(candidate);
    if (n.name === answer.name || excludedNames.has(n.name) || out.includes(n.name)) continue;
    if (!opts.enharmonic && (n.chroma === answer.chroma || usedPcs.has(n.chroma) || excludedPcs.has(n.chroma))) continue;
    usedPcs.add(n.chroma);
    out.push(n.name);
  }
  return out;
}

/** Options for `distractorIntervals`. */
export interface DistractorIntervalOptions {
  /** How many to return (default 3). */
  count?: number;
  exclude?: readonly string[];
  /** Also offer the interval of the same size under its other name (d5 for A4). Default false. */
  enharmonic?: boolean;
}

/**
 * Plausible wrong answers for a question whose answer is an interval, most tempting first: a half
 * step smaller and larger, the inversion, then a whole step either way.
 * `distractorIntervals('M3')` -> `['m3', 'P4', 'm6']`.
 */
export function distractorIntervals(correct: string, opts: DistractorIntervalOptions = {}): string[] {
  const answer = interval(correct);
  const size = Math.abs(answer.semitones);
  const sign = answer.direction < 0 ? '-' : '';
  const count = opts.count ?? 3;
  const excluded = new Set((opts.exclude ?? []).map((i) => interval(i).name));
  const tritone = answer.simple === 'd5' ? 'd5' : 'A4';
  const candidates: string[] = [];
  const bySize = (semis: number) => {
    if (semis >= 0) candidates.push(`${sign}${semitonesToInterval(semis, { tritone })}`);
  };
  if (opts.enharmonic && size % 12 === 6) candidates.push(`${sign}${semitonesToInterval(size, { tritone: tritone === 'A4' ? 'd5' : 'A4' })}`);
  bySize(size - 1);
  bySize(size + 1);
  if (!answer.compound) candidates.push(`${sign}${invertInterval(answer.name)}`);
  bySize(size - 2);
  bySize(size + 2);
  bySize(size + 3);
  bySize(size - 3);

  const out: string[] = [];
  const usedSizes = new Set<number>();
  for (const candidate of candidates) {
    if (out.length >= count) break;
    const ivl = interval(candidate);
    if (ivl.name === answer.name || excluded.has(ivl.name) || out.includes(ivl.name)) continue;
    const semis = Math.abs(ivl.semitones);
    if (!opts.enharmonic && (semis === size || usedSizes.has(semis))) continue;
    usedSizes.add(semis);
    out.push(ivl.name);
  }
  return out;
}

/** Options for `similarChordTypes`. */
export interface SimilarChordTypesOptions {
  /** Maximum number of results (default 6). */
  limit?: number;
  maxTier?: number;
  /** Only chord types with the same number of notes (default false). */
  sameSize?: boolean;
}

function pcMaskOf(type: ChordType): number {
  return type.semitones.reduce((mask, s) => mask | (1 << (s % 12)), 0);
}

/**
 * The chord types closest to a chord type on the same root, nearest first: those that differ by
 * the fewest notes. `similarChordTypes('maj7', { sameSize: true })` starts with 7, 6, mMaj7 …
 * Made for "which chord is this?" questions, where the near misses are the good wrong answers.
 */
export function similarChordTypes(type: string | ChordType, opts: SimilarChordTypesOptions = {}): ChordType[] {
  const resolved = typeof type === 'string' ? getChordType(type) : type;
  if (!resolved) throw new RangeError(`Unknown chord type: "${String(type)}"`);
  const mask = pcMaskOf(resolved);
  const bits = (n: number) => {
    let total = 0;
    for (let v = n; v; v &= v - 1) total++;
    return total;
  };
  const ranked: Array<{ type: ChordType; distance: number; order: number }> = [];
  CHORD_TYPES.forEach((other, order) => {
    const otherMask = pcMaskOf(other);
    if (other.id === resolved.id || otherMask === mask) return;
    if (opts.maxTier !== undefined && other.tier > opts.maxTier) return;
    if (opts.sameSize && other.intervals.length !== resolved.intervals.length) return;
    const distance = bits(otherMask ^ mask);
    if (distance <= 4) ranked.push({ type: other, distance, order });
  });
  ranked.sort((a, b) => a.distance - b.distance || Math.abs(a.type.tier - resolved.tier) - Math.abs(b.type.tier - resolved.tier) || a.type.tier - b.type.tier || a.order - b.order);
  return ranked.slice(0, opts.limit ?? 6).map((r) => r.type);
}
