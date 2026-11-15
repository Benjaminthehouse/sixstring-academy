import { useEffect } from 'react';
import { useLatest } from './useLatest';

/**
 * Call `callback` every `delayMs`. Pass `null` to pause. The callback may change every render
 * without restarting the timer. Cleared on unmount. (Not for musical timing: use the audio clock.)
 */
export function useInterval(callback: () => void, delayMs: number | null): void {
  const latest = useLatest(callback);
  useEffect(() => {
    if (delayMs == null || !(delayMs >= 0)) return;
    const id = setInterval(() => latest.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs, latest]);
}

/** Call `callback` once after `delayMs`. Pass `null` to cancel. Restarts when the delay changes. */
export function useTimeout(callback: () => void, delayMs: number | null): void {
  const latest = useLatest(callback);
  useEffect(() => {
    if (delayMs == null || !(delayMs >= 0)) return;
    const id = setTimeout(() => latest.current(), delayMs);
    return () => clearTimeout(id);
  }, [delayMs, latest]);
}
