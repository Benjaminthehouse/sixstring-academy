/**
 * Keep the screen awake while the learner is practising (tuner, song player, practice timer):
 * hands are on the guitar, nobody is touching the screen, and a dimmed display breaks the flow.
 *
 * The browser's Screen Wake Lock is given up whenever the tab is hidden, can be refused at any
 * time (battery saver, a frame that is not allowed to hold one), and does not exist in every
 * browser. All of that is absorbed here: holders say they want the screen on, the lock is taken
 * when it can be and taken again when the tab comes back, and a refusal is never an error.
 */

interface SentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}
interface WakeLockApi {
  request(type: 'screen'): Promise<SentinelLike>;
}
interface VisibilitySource {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** What the service needs from its surroundings; tests swap these for fakes. */
export interface WakeLockDeps {
  /** `navigator.wakeLock`, or null where the browser has none. */
  api: () => WakeLockApi | null;
  /** `document`, or null outside a page. */
  doc: () => VisibilitySource | null;
}

/** A snapshot of the wake lock, for a "screen stays on" indicator. */
export interface WakeLockState {
  /** The browser has the Screen Wake Lock API at all. */
  supported: boolean;
  /** Someone currently wants the screen kept on. */
  wanted: boolean;
  /** The screen is being kept on right now. */
  active: boolean;
}

/** The wake-lock service. Use the module-level functions unless you are testing. */
export interface WakeLock {
  /** Want the screen on (counted). Resolves true when the lock is actually held. */
  request(): Promise<boolean>;
  /** Give back one `request()`. The lock is dropped when nobody wants it any more. */
  release(): void;
  /** `request()` now, and get the function that releases it: made for effect cleanups. */
  keepAwake(): () => void;
  state(): WakeLockState;
  subscribe(listener: () => void): () => void;
}

function browserApi(): WakeLockApi | null {
  if (typeof navigator === 'undefined') return null;
  const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
  return api && typeof api.request === 'function' ? api : null;
}

/** Create a wake-lock service. Production code uses the shared instance behind `keepAwake`. */
export function createWakeLock(overrides: Partial<WakeLockDeps> = {}): WakeLock {
  const deps: WakeLockDeps = {
    api: browserApi,
    doc: () => (typeof document !== 'undefined' ? (document as unknown as VisibilitySource) : null),
    ...overrides,
  };

  let holders = 0;
  let sentinel: SentinelLike | null = null;
  let acquiring: Promise<boolean> | null = null;
  let watching = false;
  let snapshot: WakeLockState = { supported: deps.api() !== null, wanted: false, active: false };
  const listeners = new Set<() => void>();

  const publish = (): void => {
    const next: WakeLockState = { supported: deps.api() !== null, wanted: holders > 0, active: sentinel !== null && !sentinel.released };
    if (next.supported === snapshot.supported && next.wanted === snapshot.wanted && next.active === snapshot.active) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  const drop = (): void => {
    const held = sentinel;
    sentinel = null;
    if (held && !held.released) void held.release().catch(() => undefined);
  };

  function acquire(): Promise<boolean> {
    if (sentinel && !sentinel.released) return Promise.resolve(true);
    if (acquiring) return acquiring;
    const api = deps.api();
    const doc = deps.doc();
    // A hidden page is refused anyway; the visibility listener asks again when it comes back.
    if (!api || holders === 0 || (doc && doc.visibilityState !== 'visible')) return Promise.resolve(false);
    acquiring = (async () => {
      try {
        const lock = await api.request('screen');
        if (holders === 0) {
          // Everyone let go while the request was on its way.
          void lock.release().catch(() => undefined);
          return false;
        }
        sentinel = lock;
        lock.addEventListener('release', () => {
          // The system took it back (tab hidden, power saving). Remember that it is gone.
          if (sentinel === lock) sentinel = null;
          publish();
        });
        return true;
      } catch {
        // Refused: not allowed in this frame, battery saver, no user activation. Carry on without.
        return false;
      } finally {
        acquiring = null;
        publish();
      }
    })();
    return acquiring;
  }

  const onVisibility = (): void => {
    if (deps.doc()?.visibilityState === 'visible' && holders > 0) void acquire();
  };

  const watch = (on: boolean): void => {
    if (on === watching) return;
    const doc = deps.doc();
    if (!doc) return;
    if (on) doc.addEventListener('visibilitychange', onVisibility);
    else doc.removeEventListener('visibilitychange', onVisibility);
    watching = on;
  };

  function request(): Promise<boolean> {
    holders += 1;
    watch(true);
    publish();
    return acquire();
  }

  function release(): void {
    if (holders === 0) return;
    holders -= 1;
    if (holders === 0) {
      watch(false);
      drop();
    }
    publish();
  }

  return {
    request,
    release,
    keepAwake() {
      void request();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        release();
      };
    },
    state: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The shared instance
// ---------------------------------------------------------------------------------------------

let shared: WakeLock | null = null;
const instance = (): WakeLock => (shared ??= createWakeLock());

/**
 * Keep the screen on until the returned function is called. Counted, so several screens or
 * hooks can hold it at once: `useEffect(() => keepAwake(), [])`.
 */
export function keepAwake(): () => void {
  return instance().keepAwake();
}

/** Want the screen on. Resolves true when the lock is held, false when the browser said no. */
export function requestWakeLock(): Promise<boolean> {
  return instance().request();
}

/** Give back one `requestWakeLock()`. */
export function releaseWakeLock(): void {
  instance().release();
}

/** True when the browser has the Screen Wake Lock API. */
export function isWakeLockSupported(): boolean {
  return browserApi() !== null;
}

/** The current snapshot (stable until it changes), for `useSyncExternalStore`. */
export function getWakeLockState(): WakeLockState {
  return instance().state();
}

/** Be told when the snapshot changes. Returns the unsubscribe function. */
export function subscribeWakeLock(listener: () => void): () => void {
  return instance().subscribe(listener);
}
