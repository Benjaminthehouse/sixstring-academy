import { useEffect } from 'react';
import { useLatest } from './useLatest';

/** Longest frame delta reported, so a backgrounded tab does not produce one giant step on return. */
export const MAX_FRAME_MS = 100;

/**
 * Run `callback(deltaMs, timeMs)` on every animation frame while `running` is true.
 * Draw to a canvas or mutate refs inside it; do not set React state per frame.
 * The loop is cancelled on unmount and whenever `running` turns false.
 */
export function useRafLoop(callback: (deltaMs: number, timeMs: number) => void, running = true): void {
  const latest = useLatest(callback);
  useEffect(() => {
    if (!running || typeof requestAnimationFrame === 'undefined') return;
    let id = 0;
    let last = -1;
    const frame = (time: number) => {
      const delta = last < 0 ? 0 : Math.min(time - last, MAX_FRAME_MS);
      last = time;
      latest.current(delta, time);
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [running, latest]);
}
