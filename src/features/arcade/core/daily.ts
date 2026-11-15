/**
 * Today's challenge: three short rounds of three different games on the scale being practised,
 * chosen by the date, so it changes every day and is the same all day. At least one of the three
 * works the fingers or eyes on the shape itself.
 */
import { focusSlug, type Focus } from './focus';
import type { GameId } from './games';
import { hashSeed, makeRng, shuffle } from './rng';

/** One stage of the challenge. */
export interface DailyStage {
  game: GameId;
  level: number;
  /** Prompts in the short round (targets, darts, questions, licks, runs, sprints). */
  size: number;
  /** Seed of the stage's round. */
  seed: number;
}

/** Prompts per game in a challenge round: about a minute each. */
export const DAILY_SIZE: Readonly<Record<GameId, number>> = {
  'note-hunt': 8,
  'shape-builder': 1,
  'run-the-scale': 1,
  'degree-darts': 8,
  'mode-match': 5,
  'lick-echo': 3,
  'fretboard-sprint': 1,
};

const SHAPE_GAMES: readonly GameId[] = ['note-hunt', 'shape-builder', 'degree-darts', 'fretboard-sprint'];
const ALL: readonly GameId[] = ['note-hunt', 'shape-builder', 'run-the-scale', 'degree-darts', 'mode-match', 'lick-echo', 'fretboard-sprint'];

/** The local date as `YYYY-MM-DD`. */
export function localDateKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The three stages for a day and focus. `levelFor` gives the level to play in each game (the learner's frontier). */
export function dailyChallenge(date: string, focus: Focus, levelFor: (game: GameId) => number): DailyStage[] {
  const seed = hashSeed(`${date}:${focusSlug(focus)}:${focus.shape}`);
  const rng = makeRng(seed);
  let games = shuffle(rng, ALL).slice(0, 3);
  if (!games.some((g) => SHAPE_GAMES.includes(g))) {
    const swap = shuffle(rng, SHAPE_GAMES)[0];
    games = [swap, ...games.slice(0, 2)];
  }
  return games.map((game, i) => ({ game, level: Math.max(1, levelFor(game)), size: DAILY_SIZE[game], seed: hashSeed(`${seed}:${i}:${game}`) }));
}

/** The challenge's stars: the stars of its weakest stage, so all three count. */
export function dailyStars(stageStars: readonly number[]): 0 | 1 | 2 | 3 {
  if (stageStars.length === 0) return 0;
  return Math.max(0, Math.min(3, Math.min(...stageStars))) as 0 | 1 | 2 | 3;
}
