/**
 * How the ear class reads and names its progress. Skill ids: `ear:<drill>:<level>` for each level
 * (one `recordActivity` of kind `ear` per finished round), and `ear:<drill>` for the drill's
 * confusion record (`setSkillData`). A catalog progression by its link is `ear:progression:<id>`,
 * with one record for all of them, `ear:progression`. Pure functions over the progress store's `skills` map.
 */
import { PASS_ACCURACY } from './round';
import { LADDER, PATH, type PathStep } from './drills';
import type { DrillDef, DrillId, LevelDef } from './types';

/** The part of a progress skill record this module reads. */
export interface SkillLike {
  bestAccuracy?: number;
  stars?: number;
  attempts?: number;
  completions?: number;
  data?: unknown;
}

/** Skills by id, as in the progress store. */
export type SkillMap = Readonly<Record<string, SkillLike | undefined>>;

/** Skill id of one level. */
export const levelSkillId = (drill: DrillId, n: number): string => `ear:${drill}:${n}`;
/** Skill id that holds a drill's confusion record. */
export const drillSkillId = (drill: DrillId): string => `ear:${drill}`;
/** Skill id of the confusion record a round of `level` reads and adds to: the drill's, or a special round's own. */
export const recordSkillId = (drill: DrillDef, level: LevelDef): string => level.special?.recordId ?? drillSkillId(drill.id);

/** What the screens show about a level. */
export interface LevelStatus {
  n: number;
  /** Best accuracy of a finished round, 0..1. */
  best: number;
  stars: number;
  attempts: number;
  /** Rounds played to the end. Until there is one, `best` and `stars` say nothing (a left round has no score). */
  completions: number;
  /** Passed directly, or implied by passing a later level. */
  passed: boolean;
  unlocked: boolean;
}

/** The status of every level of a drill. A level opens when the one before it is passed. */
export function levelStatuses(drill: DrillDef, skills: SkillMap): LevelStatus[] {
  const raw = drill.levels.map((l) => {
    const s = skills[levelSkillId(drill.id, l.n)];
    const best = s?.bestAccuracy ?? 0;
    return { n: l.n, best, stars: s?.stars ?? 0, attempts: s?.attempts ?? 0, completions: s?.completions ?? 0, direct: best >= PASS_ACCURACY - 1e-9 };
  });
  const passed = raw.map((_, i) => raw.slice(i).some((r) => r.direct));
  return raw.map((r, i) => ({ n: r.n, best: r.best, stars: r.stars, attempts: r.attempts, completions: r.completions, passed: passed[i], unlocked: i === 0 || passed[i - 1] || passed[i] }));
}

/** The level to play next in a drill: the first open one not yet passed, else the top level. */
export function currentLevel(drill: DrillDef, skills: SkillMap): number {
  const list = levelStatuses(drill, skills);
  return (list.find((s) => s.unlocked && !s.passed) ?? list[list.length - 1]).n;
}

/** Passed levels of a drill. */
export function passedCount(drill: DrillDef, skills: SkillMap): number {
  return levelStatuses(drill, skills).filter((s) => s.passed).length;
}

/** The next step of the course and whether the whole course is done. */
export function continueStep(skills: SkillMap): PathStep & { done: boolean; index: number } {
  const passed = new Map<DrillId, LevelStatus[]>();
  for (const d of LADDER) passed.set(d.id, levelStatuses(d, skills));
  const index = PATH.findIndex((step) => !passed.get(step.drill)![step.level - 1].passed);
  if (index < 0) return { ...PATH[PATH.length - 1], done: true, index: PATH.length };
  return { ...PATH[index], done: false, index };
}

/** The step after a given level on the course (for "next" at the end of a round). */
export function stepAfter(drill: DrillId, level: number, skills: SkillMap): PathStep | null {
  const own = LADDER.find((d) => d.id === drill);
  if (own && own.levels.some((l) => l.n === level + 1)) return { drill, level: level + 1 };
  const next = continueStep(skills);
  if (next.done || (next.drill === drill && next.level === level)) return null;
  return { drill: next.drill, level: next.level };
}
