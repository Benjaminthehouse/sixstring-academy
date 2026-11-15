/**
 * The title of the current screen, as the phone top bar and the browser tab show it.
 *
 * By default it is the route's `title` from the registry. A screen that shows one particular
 * thing (a song, a lesson, a scale) names it with `useScreenTitle('Greensleeves')`.
 */
import { useEffect, useSyncExternalStore } from 'react';

const titles = new Map<symbol, string>();
const listeners = new Set<() => void>();
let current: string | null = null;

function recompute(): void {
  // The most recently mounted screen wins (Map keeps insertion order).
  let next: string | null = null;
  for (const title of titles.values()) next = title;
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The title a screen asked for, or null when the registry title applies. */
export function screenTitleOverride(): string | null {
  return current;
}

/**
 * Name the current screen while this component is mounted. Pass null or an empty string to fall
 * back to the route's registry title (for example while the item is still loading).
 */
export function useScreenTitle(title: string | null | undefined): void {
  const clean = typeof title === 'string' ? title.trim() : '';
  useEffect(() => {
    if (!clean) return undefined;
    const token = Symbol('title');
    titles.set(token, clean);
    recompute();
    return () => {
      if (titles.delete(token)) recompute();
    };
  }, [clean]);
}

/** Shell side: the title in effect, given the registry title of the current route. */
export function useResolvedScreenTitle(routeTitle: string): string {
  const override = useSyncExternalStore(subscribe, screenTitleOverride, () => null);
  return override ?? routeTitle;
}
