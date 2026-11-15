import { useCallback, useEffect, useRef } from 'react';
import { useLatest } from './useLatest';

/** Timing of a press-and-hold repeat. */
export interface HoldTiming {
  /** Wait before the first repeat. */
  initialDelayMs: number;
  /** Interval between repeats at the start. */
  intervalMs: number;
  /** Fastest interval reached after holding for a while. */
  minIntervalMs: number;
  /** Each repeat shortens the interval by this factor until `minIntervalMs`. */
  acceleration: number;
}

/** Default hold timing: a beat of thinking time, then a brisk repeat that speeds up. */
export const DEFAULT_HOLD: HoldTiming = { initialDelayMs: 420, intervalMs: 110, minIntervalMs: 36, acceleration: 0.92 };

/** Delay before repeat number `n` (0-based) for the given timing. Pure, so it can be tested. */
export function holdDelay(n: number, timing: HoldTiming = DEFAULT_HOLD): number {
  if (n <= 0) return timing.initialDelayMs;
  return Math.max(timing.minIntervalMs, timing.intervalMs * Math.pow(timing.acceleration, n - 1));
}

/** Handlers to spread on a button so holding it repeats the action. */
export interface PressHoldHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onClick: (event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

/**
 * Press once to act, hold to repeat with acceleration. Keyboard activation (Enter/Space) goes
 * through the normal click, so the control stays fully operable without a pointer.
 */
export function usePressHold(action: () => void, options: { disabled?: boolean; timing?: HoldTiming } = {}): PressHoldHandlers {
  const { disabled = false, timing = DEFAULT_HOLD } = options;
  const latest = useLatest(action);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledByPointer = useRef(false);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
      handledByPointer.current = true;
      latest.current();
      let n = 0;
      const tick = () => {
        latest.current();
        n += 1;
        timer.current = setTimeout(tick, holdDelay(n, timing));
      };
      stop();
      timer.current = setTimeout(tick, holdDelay(0, timing));
    },
    [disabled, latest, stop, timing],
  );

  const onClick = useCallback(
    (event: React.MouseEvent) => {
      // The pointer path already acted on pointerdown; only keyboard/assistive clicks act here.
      // `detail` is 0 for keyboard activation, so a stale pointer flag can never swallow Enter/Space.
      const fromPointer = event.detail !== 0 && handledByPointer.current;
      handledByPointer.current = false;
      if (fromPointer) return;
      if (!disabled) latest.current();
    },
    [disabled, latest],
  );

  // A long touch would otherwise open the context menu in the middle of a repeat.
  const onContextMenu = useCallback((event: React.MouseEvent) => {
    if (timer.current) event.preventDefault();
  }, []);

  return { onPointerDown, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop, onClick, onContextMenu };
}
