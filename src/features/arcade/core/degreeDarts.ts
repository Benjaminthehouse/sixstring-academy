/**
 * Degree Darts: a scale degree is called ("the ♭3", "the 5th") and the learner hits it anywhere in
 * the current shape. It teaches what each note does, not just where it is.
 */
import type { PatternNote, ScalePattern } from '@/core/guitar';
import { formatDegree } from '@/core/theory';
import { makeRng, rotation } from './rng';
import { regionOf } from './focus';

/** One level of Degree Darts. */
export interface DartsLevel {
  n: number;
  title: string;
  goal: string;
  /** Which degrees are called. */
  pool: 'root-fifth' | 'triad' | 'all';
  /** Dots of the shape on the board, or only the box around it. */
  shape: 'shown' | 'hidden';
  darts: number;
  /** A clock for the round, in seconds. */
  seconds?: number;
}

/** The levels, easiest first. */
export const DARTS_LEVELS: readonly DartsLevel[] = [
  { n: 1, title: 'Root and fifth', goal: 'Hit the root or the 5th: the frame of every scale.', pool: 'root-fifth', shape: 'shown', darts: 10 },
  { n: 2, title: 'Add the third', goal: 'Root, third and fifth: the chord inside the scale.', pool: 'triad', shape: 'shown', darts: 12 },
  { n: 3, title: 'Every degree', goal: 'Any note of the scale, called by its number.', pool: 'all', shape: 'shown', darts: 12 },
  { n: 4, title: 'No dots', goal: 'Every degree, with the shape hidden.', pool: 'all', shape: 'hidden', darts: 12 },
  { n: 5, title: 'Quick darts', goal: 'Every degree, shape hidden, 45 seconds on the clock.', pool: 'all', shape: 'hidden', darts: 30, seconds: 45 },
];

/** What each degree is and does, in a line. Degrees are as the theory engine writes them. */
export const DEGREE_INFO: Readonly<Record<string, { name: string; role: string }>> = {
  '1': { name: 'the root', role: 'Home: the note the scale is named after and comes to rest on.' },
  b2: { name: 'the ♭2', role: 'A half step above the root: dark and tense.' },
  '2': { name: 'the 2nd', role: 'A whole step above the root: open, not yet settled.' },
  '#2': { name: 'the ♯2', role: 'Three half steps above the root, spelled as a 2nd: an exotic leap.' },
  bb3: { name: 'the 𝄫3', role: 'A whole step above the root, spelled as a third.' },
  b3: { name: 'the ♭3', role: 'The minor third: the note that makes the sound minor.' },
  '3': { name: 'the 3rd', role: 'The major third: the note that makes the sound major.' },
  b4: { name: 'the ♭4', role: 'Four half steps up, spelled as a 4th: sounds like a major third.' },
  '4': { name: 'the 4th', role: 'Leans toward the 3rd below it.' },
  '#4': { name: 'the ♯4', role: 'Half way to the octave: the bright lift of Lydian.' },
  b5: { name: 'the ♭5', role: 'The blue note: tense, wants to slide to the 4th or the 5th.' },
  '5': { name: 'the 5th', role: 'Strong and stable: the root’s closest partner.' },
  '#5': { name: 'the ♯5', role: 'The augmented 5th: restless, pushes upward.' },
  b6: { name: 'the ♭6', role: 'The minor 6th: a dark, sad colour that leans on the 5th.' },
  '6': { name: 'the 6th', role: 'The major 6th: sweet; in a minor scale it is the Dorian colour.' },
  '#6': { name: 'the ♯6', role: 'Ten half steps up, spelled as a 6th: sounds like a ♭7.' },
  bb7: { name: 'the 𝄫7', role: 'The diminished 7th: sounds like a 6th, belongs to diminished sounds.' },
  b7: { name: 'the ♭7', role: 'The minor 7th: bluesy and relaxed, the sound of a dominant chord.' },
  '7': { name: 'the 7th', role: 'The major 7th: a half step under the root, pulling home.' },
};

/** The name of a degree for a prompt ("the ♭3"). */
export function degreeCall(degree: string): string {
  return DEGREE_INFO[degree]?.name ?? `degree ${degreeShort(degree)}`;
}

/** A degree as a dot label: `1` → `R`, `b3` → `♭3`, `bb7` → `𝄫7` (every accidental, not just the first). */
export function degreeShort(degree: string): string {
  return degree === '1' ? 'R' : formatDegree(degree);
}

/** The tip after a round of darts: the degree to work on, what it does, and where it is in this scale. */
export function dartsTip(degree: string, note: string): string {
  const role = DEGREE_INFO[degree]?.role;
  return `Work on ${degreeCall(degree)}.${role ? ` ${role}` : ''} In this scale it is ${note}.`;
}

const FIFTHS = ['5', 'b5', '#5'];
const THIRDS = ['3', 'b3', 'b4', 'bb3', '4', '2'];

/** The degrees a level calls, from the scale's own degrees (a scale without a 5th uses its ♭5 or ♯5). */
export function degreePool(scaleDegrees: readonly string[], pool: DartsLevel['pool']): string[] {
  const has = (d: string) => scaleDegrees.includes(d);
  const fifth = FIFTHS.find(has);
  const third = THIRDS.find(has);
  if (pool === 'root-fifth') return ['1', ...(fifth ? [fifth] : third ? [third] : [])];
  if (pool === 'triad') return ['1', ...(third ? [third] : []), ...(fifth ? [fifth] : [])].filter((d, i, a) => a.indexOf(d) === i);
  return [...scaleDegrees];
}

/** One dart: the degree called and every place it can be hit in the shape. */
export interface Dart {
  index: number;
  degree: string;
  note: string;
  answers: PatternNote[];
}

/** A round of Degree Darts. */
export interface DartsRound {
  level: DartsLevel;
  pattern: ScalePattern;
  frets: [number, number];
  darts: Dart[];
  seed: number;
}

/** Build a round: degrees in a fair rotation, never the same twice running, each with every place it sits in the shape. */
export function makeDartsRound(pattern: ScalePattern, scaleDegrees: readonly string[], level: DartsLevel, seed: number, size?: number): DartsRound {
  const rng = makeRng(seed);
  // Only degrees that the shape actually contains (every shape has every degree, but be sure).
  const inShape = new Set(pattern.notes.map((n) => n.degree));
  const pool = degreePool(scaleDegrees, level.pool).filter((d) => inShape.has(d));
  const order = rotation(rng, pool, Math.max(1, size ?? level.darts));
  const darts = order.map((degree, index) => {
    const answers = pattern.notes.filter((n) => n.degree === degree);
    return { index, degree, note: answers[0].note, answers };
  });
  return { level, pattern, frets: regionOf(pattern), darts, seed };
}
