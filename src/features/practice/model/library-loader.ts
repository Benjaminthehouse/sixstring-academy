/**
 * The practice library (`library.ts`: technique exercises, songs, Theory Path unit drills) as a
 * lazily loaded chunk, for screens that should not pay for it up front (Today). The practice
 * screen imports `library.ts` directly.
 *
 *   const library = usePracticeLibrary();   // null until loaded; the load starts on first use
 *   suggestPracticePlan(state, now, 10, data, library ?? undefined);
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { ContentItem } from './content';

let library: readonly ContentItem[] | null = null;
let pending: Promise<readonly ContentItem[]> | null = null;
const listeners = new Set<() => void>();

/** Start loading the library (once); resolves with it, or with an empty list when the chunk cannot load. */
export function loadPracticeLibrary(): Promise<readonly ContentItem[]> {
  if (library) return Promise.resolve(library);
  pending ??= import('./library')
    .then((m) => m.PRACTICE_LIBRARY)
    .catch(() => [] as readonly ContentItem[])
    .then((items) => {
      library = items;
      for (const l of [...listeners]) l();
      return items;
    });
  return pending;
}

/** The library if it has loaded, else null. */
export function practiceLibrary(): readonly ContentItem[] | null {
  return library;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React: the library once loaded (null before); starts the load. */
export function usePracticeLibrary(): readonly ContentItem[] | null {
  const value = useSyncExternalStore(subscribe, practiceLibrary, () => null);
  useEffect(() => {
    if (!value) void loadPracticeLibrary();
  }, [value]);
  return value;
}
