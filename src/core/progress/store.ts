/**
 * The progress store: holds the state, runs actions through the pure reducer, announces events,
 * saves (debounced) and follows changes made in other tabs. Framework-free; the React bindings
 * live in `react.ts`.
 *
 *   const store = createProgressStore();               // real clock, platform storage
 *   const store = createProgressStore({ clock, storage: memoryStorage() });   // tests
 */
import { readRaw, remove, writeRaw } from '@/core/platform/storage';
import { randomDeviceId } from './defaults';
import { ProgressEmitter, type ProgressEvent, type ProgressEventOf, type ProgressEventType } from './events';
import { mergeStates } from './merge';
import { STORAGE_KEY, buildExport, changeStamp, decodeState, encodeState, loadState, type LoadReport, type ProgressExport, type StorageAdapter } from './persist';
import { reduce, type ProgressAction, type ResultOf } from './reducer';
import { applyAppearance } from './theme';
import { systemClock, type Clock } from './time';
import type { ImportResult, MergeStrategy, ProgressState } from './types';

/** The platform storage layer as a `StorageAdapter`. */
export const platformStorage: StorageAdapter = { read: readRaw, write: writeRaw, remove };

/** Timer functions, injectable so tests can drive the save debounce. */
export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Options of `createProgressStore`. Everything is optional. */
export interface ProgressStoreOptions {
  /** Source of time and time zone. Default: the device clock and zone. */
  clock?: Clock;
  /** Where to save. Default: the platform storage layer. Pass null to keep everything in memory. */
  storage?: StorageAdapter | null;
  /** Storage key. Default `progress`. */
  key?: string;
  /** Quiet time before a change is written. Default 400 ms. */
  saveDelayMs?: number;
  timers?: Timers;
  /** Install id for a brand-new state. Default: random. */
  deviceId?: string;
}

/** The store. */
export interface ProgressStore {
  /** The current state. A new object after every change; unchanged slices keep their identity. */
  getState(): ProgressState;
  /** Call `listener` after every state change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Run an action and return its result. Listeners and event handlers run before this returns. */
  dispatch<A extends ProgressAction>(action: A): ResultOf<A>;
  /** Listen for one event type. Returns the unsubscribe function. */
  on<T extends ProgressEventType>(type: T, handler: (event: ProgressEventOf<T>) => void): () => void;
  /** Listen for every event. Returns the unsubscribe function. */
  onAny(handler: (event: ProgressEvent) => void): () => void;
  /** The store's current time (from its clock). */
  now(): number;
  /** The store's time zone, undefined for the device zone. */
  timeZone(): string | undefined;
  /** Roll over to the current day if it changed (streak check, fresh quests). Cheap when nothing changed. */
  tick(): void;
  /** Write a pending save right now (call when the page is being hidden). */
  flush(): void;
  /** True while a change is waiting to be written. */
  hasPendingSave(): boolean;
  /** Re-read storage and take over what another tab saved. Returns true when the state changed. */
  syncFromStorage(): boolean;
  /** A compact stamp that changes with every state change, for sync layers. */
  changeStamp(): string;
  /** Everything as one JSON-serialisable object. */
  exportData(): ProgressExport;
  /** Import an export (object or JSON text). `replace` overwrites; `newest-wins` merges per item. */
  importData(data: unknown, strategy?: MergeStrategy): ImportResult;
  /** What happened when the state was loaded. */
  readonly loadReport: LoadReport;
  /** Hook the store up to the page: cross-tab sync, save on hide, day rollover, theme. Returns the disconnect function. */
  connect(): () => void;
  /** Flush, drop every listener and timer. */
  destroy(): void;
}

/** Create a store. Loading never throws: unreadable data falls back to a backup or a fresh state. */
export function createProgressStore(options: ProgressStoreOptions = {}): ProgressStore {
  const clock = options.clock ?? systemClock;
  const storage = options.storage === undefined ? platformStorage : options.storage;
  const key = options.key ?? STORAGE_KEY;
  const saveDelay = options.saveDelayMs ?? 400;
  const timers = options.timers ?? realTimers;
  const emitter = new ProgressEmitter(() => clock.now());
  const listeners = new Set<() => void>();

  const env = () => ({ now: clock.now(), timeZone: clock.timeZone });
  const loaded = loadState(storage, key, { ...env(), deviceId: options.deviceId ?? randomDeviceId() });
  let state = loaded.state;
  let saveHandle: unknown = null;
  let pending = false;
  /** The day of the last write, to refresh the backup once per day. */
  let lastSavedDay: string | null = null;
  /** What storage held when we last looked (loaded, adopted or wrote): anything else is another tab's write. */
  let knownRaw: string | null = readStored();
  let destroyed = false;
  let saveFailing = false;

  function notify(): void {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One broken subscriber must not stop the others.
      }
    }
  }

  function readStored(): string | null {
    if (!storage) return null;
    try {
      return storage.read(key);
    } catch {
      return null;
    }
  }

  function save(): void {
    saveHandle = null;
    if (!pending) return;
    pending = false;
    if (!storage) return;
    let merged = false;
    try {
      const stored = storage.read(key);
      const theirs = stored !== null && stored !== knownRaw ? decodeState(stored, env(), { allowNewer: true }) : null;
      if (theirs?.ok) {
        // Another tab wrote and we never heard of it (a frozen background tab gets no storage
        // event). Merge rather than overwrite its work.
        state = mergeStates(state, theirs.state, clock.now());
        merged = true;
      }
      // Once per day and session, keep the previous good save as the fallback for a corrupted one.
      if (lastSavedDay !== state.meta.today) {
        if (stored !== null && (theirs ? theirs.ok : decodeState(stored, env(), { allowNewer: true }).ok)) storage.write(`${key}.bak`, stored);
        lastSavedDay = state.meta.today;
      }
      const text = encodeState(state, clock.now());
      knownRaw = text;
      reportSave(storage.write(key, text));
    } catch {
      reportSave(false);
    }
    if (merged) notify();
  }

  /** Announce a failed save once, not on every write, until saving works again. */
  function reportSave(ok: boolean): void {
    if (ok) saveFailing = false;
    else if (!saveFailing) {
      saveFailing = true;
      emitter.emit([{ type: 'save-failed', at: clock.now() }]);
    }
  }

  function scheduleSave(): void {
    pending = true;
    if (saveHandle !== null || destroyed) return;
    saveHandle = timers.set(save, saveDelay);
  }

  function flush(): void {
    if (saveHandle !== null) {
      timers.clear(saveHandle);
      saveHandle = null;
    }
    save();
  }

  function commit(next: ProgressState, events: readonly ProgressEvent[]): void {
    if (next !== state) {
      state = next;
      scheduleSave();
      notify();
    }
    if (events.length > 0) emitter.emit(events);
  }

  function dispatch<A extends ProgressAction>(action: A): ResultOf<A> {
    const out = reduce(state, action, env());
    commit(out.state, out.events);
    return out.result;
  }

  function syncFromStorage(): boolean {
    const raw = readStored();
    if (raw === null || raw === knownRaw) return false;
    const decoded = decodeState(raw, env(), { allowNewer: true });
    if (!decoded.ok) return false;
    const theirs = decoded.state;
    if (pending) {
      // Both tabs changed something: merge per item and write the result back.
      state = mergeStates(state, theirs, clock.now());
      knownRaw = raw;
      scheduleSave();
    } else {
      // Only the other tab changed: take its state as is. Nothing to save; it is already stored.
      knownRaw = raw;
      if (theirs.meta.rev === state.meta.rev && theirs.meta.updatedAt === state.meta.updatedAt) return false;
      state = theirs;
    }
    notify();
    return true;
  }

  function importData(data: unknown, strategy: MergeStrategy = 'replace'): ImportResult {
    const decoded = decodeState(data, { ...env(), deviceId: state.meta.deviceId });
    if (!decoded.ok) return { ok: false, reason: decoded.reason, detail: decoded.detail };
    dispatch({ type: 'import', state: decoded.state, strategy });
    return { ok: true, strategy, schema: decoded.version };
  }

  function connect(): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const cleanups: Array<() => void> = [];
    const listen = (target: EventTarget, type: string, handler: EventListener): void => {
      target.addEventListener(type, handler);
      cleanups.push(() => target.removeEventListener(type, handler));
    };

    // Another tab saved. The platform layer prefixes keys, so match on the end of the key.
    listen(window, 'storage', ((event: StorageEvent) => {
      if (event.key === null || event.key.endsWith(key)) syncFromStorage();
    }) as EventListener);

    listen(window, 'pagehide', () => flush());
    if (typeof document !== 'undefined') {
      listen(document, 'visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          flush();
        } else {
          // A tab that was frozen in the background may have missed another tab's writes.
          syncFromStorage();
          dispatch({ type: 'tick' });
        }
      });
    }

    // Notice midnight (and expired boosts) while the app stays open.
    const interval = setInterval(() => dispatch({ type: 'tick' }), 60_000);
    cleanups.push(() => clearInterval(interval));

    let appearance = '';
    const paint = (): void => {
      const prefs = state.prefs;
      const signature = `${prefs.theme}|${prefs.motion}|${prefs.accent}`;
      if (signature === appearance) return;
      appearance = signature;
      applyAppearance(prefs);
    };
    paint();
    cleanups.push(subscribe(paint));

    dispatch({ type: 'tick' });
    return () => {
      for (const cleanup of cleanups.splice(0)) cleanup();
    };
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getState: () => state,
    subscribe,
    dispatch,
    on: (type, handler) => emitter.on(type, handler),
    onAny: (handler) => emitter.onAny(handler),
    now: () => clock.now(),
    timeZone: () => clock.timeZone,
    tick: () => {
      dispatch({ type: 'tick' });
    },
    flush,
    hasPendingSave: () => pending,
    syncFromStorage,
    changeStamp: () => changeStamp(state),
    exportData: () => buildExport(state, clock.now()),
    importData,
    loadReport: loaded.report,
    connect,
    destroy: () => {
      flush();
      destroyed = true;
      listeners.clear();
      emitter.clear();
    },
  };
}

/**
 * Subscribe to one slice of the state: `listener` runs only when `selector`'s result changes
 * (by `isEqual`, default `Object.is`). Returns the unsubscribe function.
 */
export function subscribeSelector<T>(
  store: Pick<ProgressStore, 'getState' | 'subscribe'>,
  selector: (state: ProgressState) => T,
  listener: (value: T, previous: T) => void,
  isEqual: (a: T, b: T) => boolean = Object.is,
): () => void {
  let current = selector(store.getState());
  return store.subscribe(() => {
    const next = selector(store.getState());
    if (isEqual(current, next)) return;
    const previous = current;
    current = next;
    listener(next, previous);
  });
}

/** Shallow equality for selector results that are fresh objects or arrays of stable values. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}
