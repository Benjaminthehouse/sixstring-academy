import type { ReactNode } from 'react';
import type { IconSource } from '../icon/Icon';

/** Toast colour/meaning. "bad" and "warn" are announced assertively. */
export type ToastTone = 'neutral' | 'ok' | 'info' | 'warn' | 'bad';

/** What to show in a toast. */
export interface ToastOptions {
  /** The message. One short sentence. */
  title: ReactNode;
  /** Optional second line. */
  description?: ReactNode;
  tone?: ToastTone;
  /** Override the tone's icon. */
  icon?: IconSource;
  /** Milliseconds before it leaves. 0 keeps it until dismissed. Default 4000 (6000 for warn/bad, 8000 with an action). */
  duration?: number;
  /** One inline action, e.g. Undo. */
  action?: { label: string; onClick: () => void };
  /** Reuse an id to replace a toast in place instead of stacking a new one ("Saved" spam). */
  id?: string;
  /**
   * News the learner did not just ask for (rewards, sync results), as opposed to the reply to a tap.
   * News never covers an open Modal or Sheet: it waits and shows when the last one closes. When
   * three toasts are already up it waits its turn instead of pushing an older one off.
   */
  news?: boolean;
}

/** A toast currently on screen. */
export interface ToastItem extends ToastOptions {
  id: string;
  tone: ToastTone;
  /** True during the short exit animation. */
  leaving: boolean;
}

/** How long the exit animation lasts before a toast is removed from the list. */
export const TOAST_EXIT_MS = 180;

/** How many toasts are on screen at most (the shell promises three). */
export const MAX_TOASTS = 3;

/** A news toast taken off screen by a dialog comes back with at least this long to be read. */
export const RESHOW_MIN_MS = 3000;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

/** A toast queue with timers. Framework-free so it can be driven from anywhere and unit-tested. */
export interface ToastStore {
  /** Add (or replace, when `id` matches) a toast. Returns its id. */
  show(options: ToastOptions): string;
  /** Start the exit of one toast. */
  dismiss(id: string): void;
  /** Remove everything at once. */
  clear(): void;
  /** Stop all countdowns (pointer or focus is on the stack). */
  pause(): void;
  /** Restart the countdowns with their remaining time. */
  resume(): void;
  /**
   * While held (a dialog is open), news waits off screen, and news already showing steps aside with
   * the time it had left. Releasing shows what waited, oldest first, as room allows.
   */
  setHeld(held: boolean): void;
  subscribe(listener: () => void): () => void;
  /** The toasts on screen, oldest first. */
  getSnapshot(): ToastItem[];
  /** The news waiting for a dialog to close or for room, in the order it will show. */
  getWaiting(): ToastItem[];
}

/** Default lifetime for a toast with these options. */
export function toastDuration(options: ToastOptions): number {
  if (options.duration != null) return Math.max(0, options.duration);
  if (options.action) return 8000;
  return options.tone === 'warn' || options.tone === 'bad' ? 6000 : 4000;
}

/** Create an independent toast store. `max` is how many toasts may be on screen at once (default 3). */
export function createToastStore(config: { max?: number; now?: () => number } = {}): ToastStore {
  const max = Math.max(1, config.max ?? MAX_TOASTS);
  const now = config.now ?? (() => Date.now());
  let items: ToastItem[] = [];
  /** News that has not been shown yet (or stepped aside), with the time it should stay up once shown. */
  let waiting: Array<{ item: ToastItem; ms: number }> = [];
  let paused = false;
  let held = false;
  let seq = 0;
  const listeners = new Set<() => void>();
  const timers = new Map<string, Timer>();
  const exits = new Map<string, ReturnType<typeof setTimeout>>();

  const emit = () => listeners.forEach((l) => l());
  const set = (next: ToastItem[]) => {
    items = next;
    emit();
  };

  const stopTimer = (id: string) => {
    const t = timers.get(id);
    if (t?.handle) clearTimeout(t.handle);
    timers.delete(id);
  };

  /** Time left on an on-screen toast's countdown (0 for a sticky one). */
  const remainingOf = (id: string): number => {
    const t = timers.get(id);
    if (!t) return 0;
    return t.handle ? Math.max(0, t.remaining - (now() - t.startedAt)) : t.remaining;
  };

  const arm = (id: string, ms: number) => {
    stopTimer(id);
    if (ms <= 0) return;
    const timer: Timer = { handle: null, remaining: ms, startedAt: now() };
    if (!paused) timer.handle = setTimeout(() => dismiss(id), ms);
    timers.set(id, timer);
  };

  /** Put a toast on screen (or revive one with the same id that is on its way out). */
  function present(item: ToastItem, ms: number) {
    const existing = items.findIndex((t) => t.id === item.id);
    if (existing >= 0) {
      const exit = exits.get(item.id);
      if (exit) clearTimeout(exit);
      exits.delete(item.id);
      const next = items.slice();
      next[existing] = item;
      set(next);
    } else {
      set([...items, item]);
    }
    arm(item.id, ms);
  }

  /** Show waiting news while there is room and no dialog holds it back. */
  function pump() {
    let shown = false;
    while (!held && waiting.length > 0 && items.length < max) {
      const next = waiting.shift()!;
      present(next.item, next.ms);
      shown = true;
    }
    return shown;
  }

  /** Take a news toast off screen and back to the front of the line, keeping the time it had left. */
  function stepAside(id: string) {
    const item = items.find((t) => t.id === id);
    if (!item || item.leaving) return;
    const left = timers.has(id) ? Math.max(remainingOf(id), RESHOW_MIN_MS) : 0;
    dismiss(id);
    waiting = [{ item, ms: left }, ...waiting.filter((w) => w.item.id !== id)];
  }

  function remove(id: string) {
    stopTimer(id);
    const exit = exits.get(id);
    if (exit) clearTimeout(exit);
    exits.delete(id);
    if (items.some((t) => t.id === id)) set(items.filter((t) => t.id !== id));
    pump();
  }

  function dismiss(id: string) {
    const queued = waiting.findIndex((w) => w.item.id === id);
    if (queued >= 0) waiting.splice(queued, 1);
    const item = items.find((t) => t.id === id);
    if (!item || item.leaving) return;
    stopTimer(id);
    set(items.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    exits.set(
      id,
      setTimeout(() => remove(id), TOAST_EXIT_MS),
    );
  }

  return {
    show(options) {
      const id = options.id ?? `t${++seq}`;
      const item: ToastItem = { ...options, id, tone: options.tone ?? 'neutral', leaving: false };
      const ms = toastDuration(options);
      // Already waiting: update it where it stands in line.
      const queued = waiting.findIndex((w) => w.item.id === id);
      if (queued >= 0) {
        waiting[queued] = { item, ms };
        pump();
        return id;
      }
      const onScreen = items.some((t) => t.id === id && !t.leaving);
      if (options.news && !onScreen && (held || items.length >= max)) {
        waiting.push({ item, ms });
        return id;
      }
      present(item, ms);
      if (!onScreen) {
        // Over the limit: the oldest toasts make room. News among them waits to come back.
        const live = items.filter((t) => !t.leaving);
        for (const old of live.slice(0, Math.max(0, live.length - max)).reverse()) {
          if (old.news) stepAside(old.id);
          else dismiss(old.id);
        }
      }
      return id;
    },
    dismiss,
    clear() {
      timers.forEach((t) => t.handle && clearTimeout(t.handle));
      timers.clear();
      exits.forEach((t) => clearTimeout(t));
      exits.clear();
      waiting = [];
      if (items.length) set([]);
    },
    pause() {
      if (paused) return;
      paused = true;
      const t = now();
      timers.forEach((timer) => {
        if (timer.handle) clearTimeout(timer.handle);
        timer.handle = null;
        timer.remaining = Math.max(0, timer.remaining - (t - timer.startedAt));
      });
    },
    resume() {
      if (!paused) return;
      paused = false;
      const t = now();
      timers.forEach((timer, id) => {
        timer.startedAt = t;
        // Give at least a second after the pointer leaves so nothing vanishes under the cursor.
        timer.remaining = Math.max(timer.remaining, 1000);
        timer.handle = setTimeout(() => dismiss(id), timer.remaining);
      });
    },
    setHeld(next) {
      if (held === next) return;
      held = next;
      if (held) {
        // Newest first, so the line keeps them in the order they arrived.
        for (const t of items.filter((i) => i.news && !i.leaving).reverse()) stepAside(t.id);
      } else {
        pump();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => items,
    getWaiting: () => waiting.map((w) => w.item),
  };
}
