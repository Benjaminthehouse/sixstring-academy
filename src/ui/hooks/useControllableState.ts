import { useCallback, useRef, useState } from 'react';
import { useLatest } from './useLatest';

/**
 * State that is controlled when `value` is provided and internal otherwise, so a component works
 * both as `<Tabs value onChange>` and as `<Tabs defaultValue>`.
 */
export function useControllableState<T>(value: T | undefined, defaultValue: T, onChange?: (next: T) => void): [T, (next: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? (value as T) : inner;
  const currentRef = useRef(current);
  currentRef.current = current;
  const onChangeRef = useLatest(onChange);
  const controlledRef = useLatest(controlled);

  const set = useCallback(
    (next: T) => {
      if (Object.is(next, currentRef.current)) return;
      if (!controlledRef.current) setInner(next);
      onChangeRef.current?.(next);
    },
    [controlledRef, onChangeRef],
  );
  return [current, set];
}
