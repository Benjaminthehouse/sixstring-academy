/**
 * Scroll handling for a one-page hash router: a new screen starts at the top, and going back or
 * forward returns to where that screen was left.
 *
 * Each history entry is tagged with a small index in `history.state`. An entry without one is new
 * (a link or `navigate()`): it gets the next index and the page jumps to the top. An entry that
 * already has one is a revisit, and its remembered position is restored once the lazy screen is
 * tall enough again.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

const STATE_KEY = 'ssaEntry';
/** How long a restore keeps trying while the lazy screen is still loading. */
const RESTORE_FRAMES = 45;

function readEntry(): number | null {
  try {
    const state = window.history.state as Record<string, unknown> | null;
    const value = state && typeof state === 'object' ? state[STATE_KEY] : null;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function tagEntry(index: number): void {
  try {
    const state = window.history.state as Record<string, unknown> | null;
    window.history.replaceState({ ...(state && typeof state === 'object' ? state : {}), [STATE_KEY]: index }, '');
  } catch {
    // Sandboxed frames may refuse replaceState; scrolling to the top still works without the tag.
  }
}

function jumpTo(y: number): void {
  try {
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  } catch {
    // jsdom and very old browsers: nothing to scroll.
  }
}

/** Decide what a navigation does to the scroll position. Exported for tests. */
export function scrollPlan(entry: number | null, positions: ReadonlyMap<number, number>, lastIndex: number): { index: number; top: number; revisit: boolean } {
  if (entry !== null) return { index: entry, top: positions.get(entry) ?? 0, revisit: true };
  return { index: lastIndex + 1, top: 0, revisit: false };
}

/**
 * Keep the scroll position right across navigations. Call once in the shell with a key that
 * changes whenever the route (name or params) changes.
 */
export function useScrollRestoration(routeKey: string): void {
  const positions = useRef(new Map<number, number>());
  const currentEntry = useRef(0);
  const lastIndex = useRef(0);
  const first = useRef(true);
  const stopRestore = useRef<(() => void) | null>(null);

  useEffect(() => {
    let previous: ScrollRestoration | null = null;
    try {
      previous = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
    } catch {
      previous = null;
    }
    const onScroll = () => {
      positions.current.set(currentEntry.current, window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      stopRestore.current?.();
      if (previous) {
        try {
          window.history.scrollRestoration = previous;
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  useLayoutEffect(() => {
    stopRestore.current?.();
    stopRestore.current = null;
    const plan = scrollPlan(readEntry(), positions.current, lastIndex.current);
    currentEntry.current = plan.index;
    lastIndex.current = Math.max(lastIndex.current, plan.index);
    if (!plan.revisit) tagEntry(plan.index);

    if (first.current) {
      // First paint: leave the position alone (a reload keeps its place only if the browser does).
      first.current = false;
      return;
    }
    jumpTo(plan.top);
    if (!plan.revisit || plan.top <= 0) return;

    // The screen is lazy: until it has rendered the page is too short to reach the old position.
    let frames = 0;
    let handle = 0;
    const cancel = () => {
      cancelAnimationFrame(handle);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('keydown', cancel);
    };
    const step = () => {
      frames++;
      if (Math.abs(window.scrollY - plan.top) > 2) jumpTo(plan.top);
      if (Math.abs(window.scrollY - plan.top) <= 2 || frames >= RESTORE_FRAMES) cancel();
      else handle = requestAnimationFrame(step);
    };
    // The learner's own scrolling always wins over the restore.
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    window.addEventListener('keydown', cancel);
    handle = requestAnimationFrame(step);
    stopRestore.current = cancel;
  }, [routeKey]);
}

/**
 * True when the entry before this one in the tab's history is also a screen of the app, so
 * "back" can simply go back. False on the first entry (a fresh tab or a link from elsewhere).
 */
export function hasAppHistory(): boolean {
  if (typeof window === 'undefined') return false;
  const entry = readEntry();
  return entry !== null && entry > 1;
}
