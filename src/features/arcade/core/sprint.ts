/**
 * Fretboard Sprint: one note of the scale is named; find every place it sits on the neck before
 * the clock runs out. It joins the shapes up: the same note appears in every box.
 */
import { positionsForPitchClass, STANDARD_TUNING, type FretPosition, type Tuning } from '@/core/guitar';
import { scaleNotes } from '@/core/theory';
import { makeRng, rotation } from './rng';
import { degreePool } from './degreeDarts';

/** One level of Fretboard Sprint. */
export interface SprintLevel {
  n: number;
  title: string;
  goal: string;
  pool: 'root' | 'root-fifth' | 'triad' | 'others';
  /** Highest fret in play (from the open strings). */
  maxFret: number;
  seconds: number;
  sprints: number;
}

/** The levels, easiest first. */
export const SPRINT_LEVELS: readonly SprintLevel[] = [
  { n: 1, title: 'Root finder', goal: 'Every root from the nut to the 7th fret.', pool: 'root', maxFret: 7, seconds: 40, sprints: 1 },
  { n: 2, title: 'Roots to the octave', goal: 'Every root up to the 12th fret.', pool: 'root', maxFret: 12, seconds: 45, sprints: 1 },
  { n: 3, title: 'Root and fifth', goal: 'All the roots, then all the 5ths, frets 0–12.', pool: 'root-fifth', maxFret: 12, seconds: 40, sprints: 2 },
  { n: 4, title: 'The chord tones', goal: 'Root, third and fifth across the neck.', pool: 'triad', maxFret: 12, seconds: 35, sprints: 3 },
  { n: 5, title: 'Any note', goal: 'Three of the other scale notes, 30 seconds each.', pool: 'others', maxFret: 12, seconds: 30, sprints: 3 },
];

/** One sprint. */
export interface Sprint {
  index: number;
  degree: string;
  note: string;
  /** Every place the note is, frets 0 to `maxFret`. */
  positions: FretPosition[];
}

/** A round of sprints. */
export interface SprintRound {
  level: SprintLevel;
  frets: [number, number];
  sprints: Sprint[];
  seed: number;
}

/** Build a round. */
export function makeSprintRound(
  focus: { tonic: string; scale: string },
  scaleDegrees: readonly string[],
  level: SprintLevel,
  seed: number,
  opts: { size?: number; tuning?: Tuning } = {},
): SprintRound {
  const rng = makeRng(seed);
  const notes = scaleNotes(focus.tonic, focus.scale);
  const byDegree = new Map(scaleDegrees.map((d, i) => [d, notes[i]]));
  let pool: string[];
  if (level.pool === 'root') pool = ['1'];
  else if (level.pool === 'root-fifth') pool = degreePool(scaleDegrees, 'root-fifth');
  else if (level.pool === 'triad') pool = degreePool(scaleDegrees, 'triad');
  else pool = scaleDegrees.filter((d) => d !== '1');
  const count = Math.max(1, opts.size ?? level.sprints);
  // Chord-tone levels run in their natural order (root first); the "any note" level shuffles.
  const order = level.pool === 'others' ? rotation(rng, pool, count) : Array.from({ length: count }, (_, i) => pool[i % pool.length]);
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const sprints = order.map((degree, index) => {
    const note = byDegree.get(degree) ?? notes[0];
    const positions = positionsForPitchClass(note, { minFret: 0, maxFret: level.maxFret, tuning });
    return { index, degree, note, positions };
  });
  return { level, frets: [0, level.maxFret], sprints, seed };
}

/** Score and accuracy of a sprint: 100 per note found, 10 per second left when all were found; wrong taps lower accuracy. */
export function sprintScore(r: { found: number; total: number; wrong: number; secondsLeft: number }): { score: number; accuracy: number } {
  const complete = r.found >= r.total;
  const score = r.found * 100 + (complete ? Math.round(Math.max(0, r.secondsLeft)) * 10 : 0);
  const accuracy = r.total === 0 ? 0 : r.found / (r.total + r.wrong);
  return { score, accuracy };
}
