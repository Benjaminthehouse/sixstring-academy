/**
 * The drill registry, the ladder (drills in the order a beginner meets them) and the curriculum
 * path: every level of every drill interleaved into one course, so "Continue" always has an answer.
 */
import type { DrillDef, DrillId, LevelDef } from '../types';
import { bassDrill } from './bass';
import { chordsDrill } from './chords';
import { degreesDrill } from './degrees';
import { dictationDrill } from './dictation';
import { compoundDrill, intervalsDownDrill, intervalsTogetherDrill, intervalsUpDrill } from './intervals';
import { melodyDrill } from './melody';
import { modesDrill } from './modes';
import { pitchDrill } from './pitch';
import { progressionsDrill } from './progressions';
import { scalesDrill } from './scales';
import { tuningDrill } from './tuning';

const ALL: DrillDef[] = [
  pitchDrill,
  intervalsUpDrill,
  chordsDrill,
  tuningDrill,
  degreesDrill,
  melodyDrill,
  dictationDrill,
  scalesDrill,
  progressionsDrill,
  bassDrill,
  modesDrill,
  intervalsDownDrill,
  intervalsTogetherDrill,
  compoundDrill,
];

/** One step of the course: a level of a drill. */
export interface PathStep {
  drill: DrillId;
  level: number;
}

/** Every level of every drill as one course, interleaved by where each drill starts and how fast it climbs. */
export const PATH: readonly PathStep[] = ALL.flatMap((d) => d.levels.map((l) => ({ drill: d.id, level: l.n, rank: d.path.start + (l.n - 1) * d.path.pace })))
  .sort((a, b) => a.rank - b.rank || ALL.findIndex((d) => d.id === a.drill) - ALL.findIndex((d) => d.id === b.drill))
  .map(({ drill, level }) => ({ drill, level }));

/** The drills bottom rung first: in the order the path first reaches them. */
export const LADDER: readonly DrillDef[] = [...ALL].sort((a, b) => PATH.findIndex((s) => s.drill === a.id) - PATH.findIndex((s) => s.drill === b.id));

/** Drills by id. */
export const DRILLS: Readonly<Record<DrillId, DrillDef>> = Object.fromEntries(ALL.map((d) => [d.id, d])) as Record<DrillId, DrillDef>;

/** A drill by route param, or null. */
export function drillById(id: string | undefined): DrillDef | null {
  return id && Object.prototype.hasOwnProperty.call(DRILLS, id) ? DRILLS[id as DrillId] : null;
}

/** A level of a drill by its number (as a route param), or null. */
export function levelOf(drill: DrillDef, n: string | number | undefined): LevelDef | null {
  const num = typeof n === 'number' ? n : Number(n);
  return drill.levels.find((l) => l.n === num) ?? null;
}

/** Answer ids that a level adds to the one before it. */
export function newInLevel(drill: DrillDef, n: number): string[] {
  const level = levelOf(drill, n);
  const before = levelOf(drill, n - 1);
  if (!level) return [];
  if (!before) return [];
  return level.pool.filter((id) => !before.pool.includes(id));
}
