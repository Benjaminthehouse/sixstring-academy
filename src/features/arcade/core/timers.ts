/**
 * Time keeping a round needs beyond "now": a stopwatch that stands still while the round is paused
 * (the tab was hidden), and timeouts that can all be cancelled when the round goes away.
 */

/** A stopwatch that only counts while it runs. `set(running, now)`, `seconds(now)`; times in ms. */
export function pausableClock(): { set: (running: boolean, now: number) => void; seconds: (now: number) => number } {
  let total = 0;
  let since: number | null = null;
  return {
    set(running, now) {
      if (running && since === null) since = now;
      else if (!running && since !== null) {
        total += now - since;
        since = null;
      }
    },
    seconds: (now) => (total + (since === null ? 0 : now - since)) / 1000,
  };
}

/**
 * Timeouts that belong to one owner: `later(fn, ms)` schedules, `clear()` cancels every one still
 * pending. A round that ends "in a second" must not report itself after the learner has left.
 */
export function timerBag(): { later: (fn: () => void, ms: number) => void; clear: () => void } {
  const ids = new Set<ReturnType<typeof setTimeout>>();
  return {
    later(fn, ms) {
      const id = setTimeout(() => {
        ids.delete(id);
        fn();
      }, ms);
      ids.add(id);
    },
    clear() {
      for (const id of ids) clearTimeout(id);
      ids.clear();
    },
  };
}
