/**
 * Lick Echo: a short phrase in the scale is played (shown as tab on the easier levels, by ear only
 * on the harder ones); the learner plays it back. The phrases are built from the shape itself:
 * mostly steps along the scale, the odd skip, ending on the root or the 5th so they sound finished.
 */
import type { PatternNote, ScalePattern } from '@/core/guitar';
import { compareNotes, type NoteComparison } from '@/core/pitch';
import { makeRng, randInt, type Rng } from './rng';
import { regionOf } from './focus';

/** One level of Lick Echo. */
export interface LickLevel {
  n: number;
  title: string;
  goal: string;
  /** Notes in a lick. */
  length: number;
  /** `tab`: the whole lick as tab. `first`: only its first note. `none`: by ear alone. */
  show: 'tab' | 'first' | 'none';
  licks: number;
}

/** The levels, easiest first. */
export const LICK_LEVELS: readonly LickLevel[] = [
  { n: 1, title: 'Three-note echoes', goal: 'Hear three notes, read the tab, play them back.', length: 3, show: 'tab', licks: 6 },
  { n: 2, title: 'Four from the tab', goal: 'Four-note phrases with the tab to help.', length: 4, show: 'tab', licks: 6 },
  { n: 3, title: 'First note given', goal: 'Four notes by ear; you are told where the first one is.', length: 4, show: 'first', licks: 6 },
  { n: 4, title: 'Five by ear', goal: 'Five-note phrases, ear only.', length: 5, show: 'none', licks: 6 },
  { n: 5, title: 'Six by ear', goal: 'Six-note phrases, ear only.', length: 6, show: 'none', licks: 6 },
];

/** One phrase. */
export interface Lick {
  index: number;
  notes: PatternNote[];
  midis: number[];
  /** One bar of SixTab (`| q 6:5 6:8 5:5 q r |`). */
  tab: string;
  /** Tempo the phrase is played (and written) at. */
  bpm: number;
  /** Seconds between its notes. */
  step: number;
}

/** A round of Lick Echo. */
export interface LickRound {
  level: LickLevel;
  pattern: ScalePattern;
  frets: [number, number];
  licks: Lick[];
  seed: number;
}

const RESTING = ['1', '5'];
const START = ['1', '3', 'b3', '5'];

/** One phrase of `length` notes from the shape. */
export function makeLick(pattern: ScalePattern, length: number, rng: Rng, index = 0): Lick {
  const notes = pattern.notes;
  const n = notes.length;
  const starts = notes.map((x, i) => (START.includes(x.degree) && i > 0 && i < n - 1 ? i : -1)).filter((i) => i >= 0);
  let at = starts.length ? starts[randInt(rng, starts.length)] : randInt(rng, n);
  const path = [at];
  let dir = rng() < 0.5 ? -1 : 1;
  while (path.length < length) {
    // Mostly steps; now and then a skip of a third. Turn around at the edges of the shape, and
    // sometimes for no reason at all, as melodies do.
    if (rng() < 0.25) dir = -dir;
    const size = rng() < 0.75 ? 1 : 2;
    let next = at + dir * size;
    if (next < 0 || next >= n) {
      dir = -dir;
      next = at + dir * size;
    }
    next = Math.max(0, Math.min(n - 1, next));
    if (next === at || next === path[path.length - 2]) next = Math.max(0, Math.min(n - 1, at + dir * (size === 1 ? 2 : 1)));
    if (next === at) next = at === 0 ? 1 : at - 1;
    path.push(next);
    at = next;
  }
  // End at rest: move the last note to the nearest root or 5th within two scale steps of the one before.
  const prev = path[path.length - 2] ?? path[0];
  const resting = [-2, -1, 1, 2].map((d) => prev + d).filter((i) => i >= 0 && i < n && RESTING.includes(notes[i].degree) && i !== prev);
  if (length > 1 && resting.length) path[path.length - 1] = resting.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev))[0];
  const chosen = path.map((i) => notes[i]);
  const bpm = length <= 4 ? 100 : 84;
  const step = length <= 4 ? 60 / bpm : 30 / bpm;
  return { index, notes: chosen, midis: chosen.map((x) => x.midi), tab: lickTab(chosen), bpm, step };
}

/** The phrase as one bar of SixTab: quarter notes up to four notes, eighths beyond, rests to fill the bar. */
export function lickTab(notes: readonly { string: number; fret: number }[]): string {
  const pos = notes.map((x) => `${x.string}:${x.fret}`);
  if (notes.length <= 4) {
    const rests = 4 - notes.length;
    return `| q ${pos.join(' ')}${rests ? ` ${Array(rests).fill('r').join(' ')}` : ''} |`;
  }
  // n eighths, then rests: an eighth rest if n is odd, quarter rests for the rest of the bar.
  const eighths = notes.length;
  const parts = [`e ${pos.join(' ')}`];
  let left = 8 - eighths;
  if (left % 2 === 1) {
    parts.push('r');
    left--;
  }
  if (left > 0) parts.push(`q ${Array(left / 2).fill('r').join(' ')}`);
  return `| ${parts.join(' ')} |`;
}

/** Build a round of phrases (no two the same). */
export function makeLickRound(pattern: ScalePattern, level: LickLevel, seed: number, size?: number): LickRound {
  const rng = makeRng(seed);
  const licks: Lick[] = [];
  const seen = new Set<string>();
  const count = Math.max(1, size ?? level.licks);
  for (let tries = 0; licks.length < count && tries < count * 20; tries++) {
    const lick = makeLick(pattern, level.length, rng, licks.length);
    const key = lick.midis.join(',');
    if (seen.has(key) && tries < count * 19) continue;
    seen.add(key);
    licks.push(lick);
  }
  return { level, pattern, frets: regionOf(pattern), licks, seed };
}

/** How a played-back phrase went. */
export interface LickMark {
  comparison: NoteComparison;
  /** Per expected note: right, wrong or missed. */
  perNote: Array<'right' | 'wrong' | 'missed'>;
  points: number;
  perfect: boolean;
}

/** Mark what was played against the phrase (`compareNotes` from the pitch module). */
export function markLick(played: readonly number[], expected: readonly number[], octaves: 'exact' | 'any' = 'exact'): LickMark {
  const comparison = compareNotes(played, expected, { octaves });
  const perNote: LickMark['perNote'] = expected.map(() => 'missed');
  for (const a of comparison.alignment) {
    if (a.expected < 0) continue;
    perNote[a.expected] = a.kind === 'match' ? 'right' : a.kind === 'wrong' ? 'wrong' : 'missed';
  }
  const points = comparison.correct * 50 + (comparison.perfect ? 100 : 0);
  return { comparison, perNote, points, perfect: comparison.perfect };
}
