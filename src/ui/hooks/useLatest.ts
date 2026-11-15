import { useRef, type MutableRefObject } from 'react';

/**
 * A ref that always holds the latest value. Read `.current` inside timers, listeners and animation
 * loops so they see fresh props without being torn down and re-created on every render.
 */
export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
