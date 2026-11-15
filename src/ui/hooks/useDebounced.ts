import { useEffect, useMemo, useRef, useState } from 'react';
import { useLatest } from './useLatest';

/** The value, but only after it has stopped changing for `delayMs` (search boxes, expensive filters). */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return delayMs <= 0 ? value : debounced;
}

/** A debounced function with `cancel()` and `flush()`. */
export interface DebouncedFn<A extends unknown[]> {
  (...args: A): void;
  /** Drop the pending call. */
  cancel(): void;
  /** Run the pending call now, if there is one. */
  flush(): void;
}

/**
 * A stable debounced wrapper around `fn` (the latest `fn` is always the one called).
 * The pending call is cancelled on unmount.
 */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delayMs = 250): DebouncedFn<A> {
  const latest = useLatest(fn);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<A | null>(null);

  const debounced = useMemo(() => {
    const run = () => {
      timer.current = null;
      const args = pending.current;
      pending.current = null;
      if (args) latest.current(...args);
    };
    const call = ((...args: A) => {
      pending.current = args;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, delayMs);
    }) as DebouncedFn<A>;
    call.cancel = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
    };
    call.flush = () => {
      if (timer.current) clearTimeout(timer.current);
      run();
    };
    return call;
  }, [delayMs, latest]);

  useEffect(() => () => debounced.cancel(), [debounced]);
  return debounced;
}
