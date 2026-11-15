/**
 * A value with subscribers: the smallest possible store, for the few bits of shell state that
 * code outside React must be able to change (which stats panel is open, whether the first-run
 * flow is showing).
 */
import { useSyncExternalStore } from 'react';

/** A subscribable value. */
export interface Signal<T> {
  get(): T;
  set(next: T): void;
  subscribe(listener: () => void): () => void;
}

/** Create a signal holding `initial`. */
export function createSignal<T>(initial: T): Signal<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Read a signal in a component; re-renders when it changes. */
export function useSignal<T>(signal: Signal<T>): T {
  return useSyncExternalStore(signal.subscribe, signal.get, signal.get);
}
