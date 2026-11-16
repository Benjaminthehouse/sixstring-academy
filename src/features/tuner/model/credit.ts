/**
 * What a tuning session is worth to the progress store. All strings in tune is a finished tuning;
 * a guided run that ended with strings skipped, or was stopped or left part of the way, still
 * counts for the strings that were tuned: half credit (`completed: false`), the share of strings
 * tuned as its accuracy. So a lesson that sent the learner here sees the work, and nobody who
 * tuned four strings of six leaves with nothing.
 */
import type { ActivityInput } from '@/core/progress';

/** The longest visit credited, in seconds. */
export const MAX_CREDIT_SEC = 1800;

/** The tuner activity for the strings tuned so far, or null when none is. */
export function tuneActivity(confirmed: readonly boolean[], opts: { seconds: number; tuningName: string }): ActivityInput | null {
  const total = confirmed.length;
  const done = confirmed.filter(Boolean).length;
  if (total === 0 || done === 0) return null;
  const durationSec = Math.min(MAX_CREDIT_SEC, Math.max(1, Math.round(opts.seconds)));
  if (done === total) return { kind: 'tuner', durationSec, route: 'tuner', title: `Tuned to ${opts.tuningName}` };
  return {
    kind: 'tuner',
    durationSec,
    route: 'tuner',
    completed: false,
    accuracy: done / total,
    count: done,
    title: `Tuned ${done} of ${total} strings (${opts.tuningName})`,
  };
}
