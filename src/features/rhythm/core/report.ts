/**
 * What a rhythm round reports to the progress store. Pure, so the rule ("a round left early still
 * counts once enough of it was played") is tested apart from the screen that applies it.
 */
import type { ActivityInput } from '@/core/progress';
import type { SessionResult } from '../engine/session';

/** The part of a round's description the report needs. */
export interface ReportSpec {
  skill: string;
  title: string;
  params: string[];
  /** False for rounds that are not scored (listening, calibration). */
  record?: boolean;
}

/** Notes that must have come due, and been hit, before a round stopped early says anything. */
export const MIN_DUE = 4;
export const MIN_HITS = 3;

/**
 * The activity to record for a finished (or stopped) round, or null when there is nothing to
 * record: an unscored round, or one stopped before anything much was due.
 */
export function activityFor(spec: ReportSpec, res: SessionResult, bpm: number): ActivityInput | null {
  if (spec.record === false) return null;
  const { stats } = res;
  if (!res.completed && (res.due < MIN_DUE || stats.hits < MIN_HITS)) return null;
  return {
    kind: 'rhythm',
    id: spec.skill,
    title: spec.title,
    accuracy: stats.accuracy,
    stars: res.completed ? stats.stars : 0,
    score: Math.round(stats.accuracy * 100),
    mistakes: stats.miss + stats.extra + stats.ok + stats.wrongDirection,
    combo: stats.bestRun,
    count: stats.total,
    durationSec: Math.round(res.durationSec),
    completed: res.completed,
    route: 'rhythm',
    params: spec.params,
    meta: { bpm, meanMs: Math.round(stats.meanMs), sdMs: Math.round(stats.sdMs) },
    // The tempo the learner chose is where they pick up next time.
    data: { bpm },
  };
}
