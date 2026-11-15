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
  subscribe(listener: () => void): () => void;
  getSnapshot(): ToastItem[];
}

/** Default lifetime for a toast with these options. */
export function toastDuration(options: ToastOptions): number {
  if (options.duration != null) return Math.max(0, options.duration);
  if (options.action) return 8000;
  return options.tone === 'warn' || options.tone === 'bad' ? 6000 : 4000;
}

/** Create an independent toast store. `max` is how many toasts may be on screen at once. */
export function createToastStore(config: { max?: number; now?: () => number } = {}): ToastStore {
  const max = config.max ?? 4;
  const now = config.now ?? (() => Date.now());
  let items: ToastItem[] = [];
  let paused = false;
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

  const arm = (id: string, ms: number) => {
    stopTimer(id);
    if (ms <= 0) return;
    const timer: Timer = { handle: null, remaining: ms, startedAt: now() };
    if (!paused) timer.handle = setTimeout(() => dismiss(id), ms);
    timers.set(id, timer);
  };

  function remove(id: string) {
    stopTimer(id);
    const exit = exits.get(id);
    if (exit) clearTimeout(exit);
    exits.delete(id);
    if (items.some((t) => t.id === id)) set(items.filter((t) => t.id !== id));
  }

  function dismiss(id: string) {
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
      const existing = items.findIndex((t) => t.id === id);
      if (existing >= 0) {
        const exit = exits.get(id);
        if (exit) clearTimeout(exit);
        exits.delete(id);
        const next = items.slice();
        next[existing] = item;
        set(next);
      } else {
        set([...items, item]);
        // Over the limit: retire the oldest toasts that are not already on their way out.
        const live = items.filter((t) => !t.leaving);
        for (let i = 0; i < live.length - max; i++) dismiss(live[i].id);
      }
      arm(id, toastDuration(options));
      return id;
    },
    dismiss,
    clear() {
      timers.forEach((t) => t.handle && clearTimeout(t.handle));
      timers.clear();
      exits.forEach((t) => clearTimeout(t));
      exits.clear();
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
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => items,
  };
}
