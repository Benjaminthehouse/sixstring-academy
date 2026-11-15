/**
 * Practice sequences: ways to walk a scale pattern. Each one is an ordered list of the pattern's
 * own notes (positions with degree, note and finger), so a game can light them up one by one and
 * the player can sound them in order.
 */
import type { PatternNote, ScalePattern } from './scale-patterns';

/** The built-in ways to walk a pattern. */
export type SequenceKind =
  | 'ascending' | 'descending' | 'up-down' | 'down-up'
  | 'thirds' | 'fourths' | 'fifths' | 'sixths'
  | 'groups-3' | 'groups-4' | 'triads' | 'string-skip';

/** What a sequence is called and how it goes. */
export interface SequenceInfo {
  id: SequenceKind;
  name: string;
  /** One line a learner can follow. */
  description: string;
  /** The same in scale-step numbers, for the first few notes going up. */
  example: string;
  /** 1 beginner … 4 advanced. */
  tier: 1 | 2 | 3 | 4;
}

/** Every sequence, easiest first. */
export const SEQUENCES: readonly SequenceInfo[] = [
  { id: 'ascending', name: 'Ascending', description: 'From the lowest note to the highest, one note after another.', example: '1 2 3 4 5 …', tier: 1 },
  { id: 'descending', name: 'Descending', description: 'From the highest note down to the lowest.', example: '… 5 4 3 2 1', tier: 1 },
  { id: 'up-down', name: 'Up and down', description: 'Up to the top note and straight back down, without repeating the top.', example: '1 2 3 … 3 2 1', tier: 1 },
  { id: 'down-up', name: 'Down and up', description: 'Down from the top note and back up again.', example: '… 3 2 1 2 3 …', tier: 1 },
  { id: 'groups-3', name: 'Groups of three', description: 'Three notes up, then start again one note higher.', example: '1 2 3, 2 3 4, 3 4 5 …', tier: 2 },
  { id: 'groups-4', name: 'Groups of four', description: 'Four notes up, then start again one note higher.', example: '1 2 3 4, 2 3 4 5 …', tier: 2 },
  { id: 'thirds', name: 'In thirds', description: 'Skip a note each time: play a note, then the one two steps above it, then move up one.', example: '1 3, 2 4, 3 5 …', tier: 2 },
  { id: 'fourths', name: 'In fourths', description: 'Play a note, then the one three steps above it, then move up one.', example: '1 4, 2 5, 3 6 …', tier: 3 },
  { id: 'fifths', name: 'In fifths', description: 'Play a note, then the one four steps above it, then move up one.', example: '1 5, 2 6, 3 7 …', tier: 3 },
  { id: 'sixths', name: 'In sixths', description: 'Play a note, then the one five steps above it, then move up one.', example: '1 6, 2 7, 3 8 …', tier: 3 },
  { id: 'triads', name: 'Stacked thirds', description: 'Three notes a third apart, then the same from the next note up.', example: '1 3 5, 2 4 6, 3 5 7 …', tier: 3 },
  { id: 'string-skip', name: 'String skipping', description: 'Play the notes of one string, jump over the next string, then come back for the one you skipped.', example: 'string 6, 4, 5, 3, 4, 2 …', tier: 4 },
];

/** Options for `practiceSequence`. */
export interface SequenceOptions {
  /**
   * For the interval, group and string-skipping sequences: go `up` (default), `down`, or
   * `up-down` (up, then the same idea coming back down).
   */
  direction?: 'up' | 'down' | 'up-down';
}

function notesOf(pattern: ScalePattern | readonly PatternNote[]): readonly PatternNote[] {
  return 'notes' in pattern ? pattern.notes : pattern;
}

function cells(notes: readonly PatternNote[], offsets: number[]): PatternNote[] {
  const reach = Math.max(...offsets);
  const out: PatternNote[] = [];
  for (let i = 0; i + reach < notes.length; i++) for (const o of offsets) out.push(notes[i + o]);
  return out;
}

function cellsDown(notes: readonly PatternNote[], offsets: number[]): PatternNote[] {
  const reach = Math.max(...offsets);
  const out: PatternNote[] = [];
  for (let i = notes.length - 1; i - reach >= 0; i--) for (const o of offsets) out.push(notes[i - o]);
  return out;
}

function byString(notes: readonly PatternNote[]): PatternNote[][] {
  const groups: PatternNote[][] = [];
  for (const n of notes) {
    const last = groups[groups.length - 1];
    if (last && last[0].string === n.string) last.push(n);
    else groups.push([n]);
  }
  return groups;
}

function stringSkip(notes: readonly PatternNote[]): PatternNote[] {
  const groups = byString(notes);
  if (groups.length < 3) return [...notes];
  // 0, 2, 1, 3, 2, 4 …: skip a string going up, step back for the one skipped, and end on the top string.
  const order: number[] = [0];
  for (let i = 0; i + 2 < groups.length; i++) {
    order.push(i + 2);
    if (i + 3 < groups.length) order.push(i + 1);
  }
  // With only three strings the middle one is still waiting.
  for (let g = 0; g < groups.length; g++) if (!order.includes(g)) order.push(g);
  return order.flatMap((g) => groups[g]);
}

/**
 * The notes of a pattern in the order a practice sequence plays them. Accepts a pattern or a plain
 * list of pattern notes in ascending order. Sequences that need more notes (or strings) than the
 * pattern has fall back to the plain run, so the result is never empty for a non-empty pattern.
 */
export function practiceSequence(pattern: ScalePattern | readonly PatternNote[], kind: SequenceKind = 'ascending', opts: SequenceOptions = {}): PatternNote[] {
  const notes = notesOf(pattern);
  const up = [...notes];
  const down = [...notes].reverse();
  const direction = opts.direction ?? 'up';
  const shaped = (ascending: PatternNote[], descending: PatternNote[], plain: PatternNote[]): PatternNote[] => {
    if (!ascending.length) return direction === 'down' ? [...plain].reverse() : plain;
    if (direction === 'down') return descending;
    return direction === 'up-down' ? [...ascending, ...descending] : ascending;
  };
  switch (kind) {
    case 'ascending': return up;
    case 'descending': return down;
    case 'up-down': return [...up, ...down.slice(1)];
    case 'down-up': return [...down, ...up.slice(1)];
    case 'thirds': return shaped(cells(notes, [0, 2]), cellsDown(notes, [0, 2]), up);
    case 'fourths': return shaped(cells(notes, [0, 3]), cellsDown(notes, [0, 3]), up);
    case 'fifths': return shaped(cells(notes, [0, 4]), cellsDown(notes, [0, 4]), up);
    case 'sixths': return shaped(cells(notes, [0, 5]), cellsDown(notes, [0, 5]), up);
    case 'groups-3': return shaped(cells(notes, [0, 1, 2]), cellsDown(notes, [0, 1, 2]), up);
    case 'groups-4': return shaped(cells(notes, [0, 1, 2, 3]), cellsDown(notes, [0, 1, 2, 3]), up);
    case 'triads': return shaped(cells(notes, [0, 2, 4]), cellsDown(notes, [0, 2, 4]), up);
    case 'string-skip': {
      const walk = stringSkip(notes);
      const back = [...walk].reverse();
      return direction === 'down' ? back : direction === 'up-down' ? [...walk, ...back.slice(1)] : walk;
    }
    /* c8 ignore next 2 */
    default: throw new RangeError(`Unknown sequence: "${String(kind)}"`);
  }
}

/**
 * The stretch of a pattern from its lowest root up to its highest root: the scale as it is first
 * practised, starting and ending on the tonic. `octaves` stops after that many octaves instead.
 * A pattern with a single root runs from that root to its top note; one with no root comes back whole.
 */
export function rootToRoot(pattern: ScalePattern | readonly PatternNote[], opts: { octaves?: number } = {}): PatternNote[] {
  const notes = notesOf(pattern);
  const first = notes.findIndex((n) => n.isRoot);
  if (first < 0) return [...notes];
  let last = -1;
  for (let i = notes.length - 1; i > first && last < 0; i--) {
    if (notes[i].isRoot && (opts.octaves === undefined || notes[i].midi - notes[first].midi <= 12 * opts.octaves)) last = i;
  }
  return notes.slice(first, last < 0 ? notes.length : last + 1);
}

/** The sequences that make sense for a pattern: string skipping needs three strings, wide intervals enough notes. */
export function sequencesFor(pattern: ScalePattern | readonly PatternNote[]): SequenceInfo[] {
  const notes = notesOf(pattern);
  const strings = new Set(notes.map((n) => n.string)).size;
  const need: Partial<Record<SequenceKind, number>> = { thirds: 4, fourths: 5, fifths: 6, sixths: 7, 'groups-3': 4, 'groups-4': 5, triads: 6 };
  return SEQUENCES.filter((s) => (s.id === 'string-skip' ? strings >= 3 : notes.length >= (need[s.id] ?? 2)));
}

/** MIDI numbers of a sequence, for playback. */
export function sequenceMidi(sequence: readonly PatternNote[]): number[] {
  return sequence.map((n) => n.midi);
}
