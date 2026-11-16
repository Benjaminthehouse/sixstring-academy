import { useEffect, useSyncExternalStore } from 'react';
import { getWakeLockState, isWakeLockSupported, keepAwake, subscribeWakeLock } from '@/core/platform/wake-lock';

/** State reported by `useWakeLock`. */
export interface WakeLockState {
  /** The browser has the Screen Wake Lock API at all. */
  supported: boolean;
  /** The screen is currently being kept awake. */
  held: boolean;
}

/**
 * Keep the screen on while `active` is true (tuner, player, practice timer). A thin hook over the
 * platform's wake-lock service (`@/core/platform/wake-lock`), which counts holders, so several
 * screens and bars share one lock, takes it again when the tab comes back, and treats a refusal
 * (unsupported browser, battery saver, the artifact viewer) as `held: false`, never an error.
 */
export function useWakeLock(active: boolean): WakeLockState {
  useEffect(() => (active ? keepAwake() : undefined), [active]);
  const state = useSyncExternalStore(subscribeWakeLock, getWakeLockState, getWakeLockState);
  return { supported: isWakeLockSupported(), held: active && state.active };
}
