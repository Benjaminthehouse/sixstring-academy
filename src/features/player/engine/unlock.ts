/**
 * "Run this once audio can play", with a way to take it back. The audio module's
 * `onAudioUnlocked` keeps every hook for the life of the page, so a player engine registering
 * itself there would stay in memory after its screen is gone (every song opened before the first
 * tap). One hook is registered instead, and engines join and leave a queue it empties.
 */
import { onAudioUnlocked } from '@/core/audio';

/** A queue of callbacks for the next unlock, on top of a register-forever hook. */
export function createUnlockQueue(register: (fn: () => void) => void): (fn: () => void) => () => void {
  const waiting = new Set<() => void>();
  let hooked = false;
  return (fn) => {
    waiting.add(fn);
    if (!hooked) {
      hooked = true;
      register(() => {
        const due = [...waiting];
        waiting.clear();
        for (const f of due) f();
      });
    }
    return () => {
      waiting.delete(fn);
    };
  };
}

/** Run `fn` when audio is first unlocked; the returned function cancels it (call it on dispose). */
export const whenAudioUnlocked = createUnlockQueue(onAudioUnlocked);
