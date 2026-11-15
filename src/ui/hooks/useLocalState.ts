import { useCallback, useEffect, useRef, useState } from 'react';
import { readJSON, remove, writeJSON } from '@/core/platform/storage';

type Listener = (value: unknown) => void;
const channels = new Map<string, Set<Listener>>();

function publish(key: string, value: unknown, except?: Listener): void {
  channels.get(key)?.forEach((listener) => {
    if (listener !== except) listener(value);
  });
}

/**
 * `useState` that survives reloads, stored through the platform storage layer (never localStorage
 * directly). For small per-screen preferences such as a chosen tab or filter; app progress belongs
 * in `core/progress`. Every hook instance using the same key stays in sync.
 *
 *   const [key, setKey, resetKey] = useLocalState('scales.key', 'C');
 */
export function useLocalState<T>(key: string, initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const initialRef = useRef(initial);
  const resolveInitial = useCallback((): T => {
    const init = initialRef.current;
    return typeof init === 'function' ? (init as () => T)() : init;
  }, []);

  const [value, setValue] = useState<T>(() => readJSON<T>(key, resolveInitial()));
  const valueRef = useRef(value);
  valueRef.current = value;

  // Re-read when the key changes, and follow writes made by other instances of the same key.
  const listenerRef = useRef<Listener | null>(null);
  const firstKey = useRef(key);
  useEffect(() => {
    if (firstKey.current !== key) {
      firstKey.current = key;
      setValue(readJSON<T>(key, resolveInitial()));
    }
    const listener: Listener = (next) => setValue(next as T);
    listenerRef.current = listener;
    let group = channels.get(key);
    if (!group) channels.set(key, (group = new Set()));
    const joined = group;
    joined.add(listener);
    return () => {
      joined.delete(listener);
      if (joined.size === 0) channels.delete(key);
    };
  }, [key, resolveInitial]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(valueRef.current) : next;
      valueRef.current = resolved;
      setValue(resolved);
      writeJSON(key, resolved);
      publish(key, resolved, listenerRef.current ?? undefined);
    },
    [key],
  );

  const reset = useCallback(() => {
    const fresh = resolveInitial();
    valueRef.current = fresh;
    setValue(fresh);
    remove(key);
    publish(key, fresh, listenerRef.current ?? undefined);
  }, [key, resolveInitial]);

  return [value, set, reset];
}
