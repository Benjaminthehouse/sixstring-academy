/**
 * Holding the shell's news while a lesson is in progress.
 *
 * Going straight from one lesson's summary to the next lesson used to carry the first lesson's
 * reward card ("+XP", achievements, the daily goal) and its level-up dialog over the new lesson's
 * first card and answer buttons for several seconds. A screen that runs a lesson (or anything the
 * learner should not be interrupted in) holds the rewards while it runs: the moment that is over
 * leaves the screen at once (it was seen on its summary), and news that arrives meanwhile, a dialog
 * nobody has answered included, waits until the hold ends: at the next summary, or when the learner
 * leaves. A lost heart's flash is the lesson's own feedback and still shows at once.
 */
import { useEffect, useSyncExternalStore } from 'react';

let holds = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/** Hold the shell's rewards until the returned function is called (calling it twice is harmless). */
export function holdRewards(): () => void {
  holds += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    emit();
  };
}

/** True while some screen holds the shell's rewards. */
export function rewardsHeld(): boolean {
  return holds > 0;
}

/** Be told when the hold starts or ends. Returns the unsubscribe function. */
export function subscribeRewardHold(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * While `active`, keep the shell's reward card, its dialogs (a new level, a streak milestone) and
 * other news off the screen; they show when it turns false or the component unmounts. Call it with
 * `true` while a lesson's steps are on screen and `false` on its summary:
 *
 *   useRewardHold(state.phase !== 'done');
 */
export function useRewardHold(active = true): void {
  useEffect(() => (active ? holdRewards() : undefined), [active]);
}

/** Whether the rewards are held right now (re-renders on change). */
export function useRewardsHeld(): boolean {
  return useSyncExternalStore(subscribeRewardHold, rewardsHeld, () => false);
}
