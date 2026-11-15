import { useEffect, useState } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function wakeLockApi(): WakeLockLike | null {
  if (typeof navigator === 'undefined') return null;
  const api = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  return api && typeof api.request === 'function' ? api : null;
}

/** State reported by `useWakeLock`. */
export interface WakeLockState {
  /** The browser has the Screen Wake Lock API at all. */
  supported: boolean;
  /** The screen is currently being kept awake. */
  held: boolean;
}

/**
 * Keep the screen on while `active` is true (tuner, player, practice timer). Tolerant by design:
 * unsupported browsers, denied requests and the artifact viewer all just report `held: false`.
 * The lock is re-acquired when the tab becomes visible again and released on unmount.
 */
export function useWakeLock(active: boolean): WakeLockState {
  const [held, setHeld] = useState(false);
  const supported = wakeLockApi() !== null;

  useEffect(() => {
    const api = wakeLockApi();
    if (!active || !api) {
      setHeld(false);
      return;
    }
    let cancelled = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const acquire = async () => {
      if (cancelled || (sentinel && !sentinel.released)) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const lock = await api.request('screen');
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        setHeld(true);
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null;
          if (!cancelled) setHeld(false);
        });
      } catch {
        // Denied by policy, low battery, or not allowed in this frame: carry on without it.
        if (!cancelled) setHeld(false);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      const lock = sentinel;
      sentinel = null;
      if (lock && !lock.released) void lock.release().catch(() => {});
      setHeld(false);
    };
  }, [active]);

  return { supported, held };
}
