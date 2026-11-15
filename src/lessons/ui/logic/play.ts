/**
 * Play exercises: what counts as "nothing heard yet". Silence (or a listening that timed out with
 * no note at all) is never a wrong answer; the player keeps listening instead.
 */
import type { Answer } from '../../types';

/** True when a listening ended with nothing heard at all (silence or a timeout), which is not a wrong answer. */
export function heardNothing(answer: Answer): boolean {
  if (answer.type === 'play-note') return answer.midi === null;
  if (answer.type === 'play-phrase') return answer.played.length === 0;
  if (answer.type === 'play-chord') return !answer.matched && answer.score === 0 && (answer.missing ?? []).length === 0 && (answer.extra ?? []).length === 0;
  return false;
}
