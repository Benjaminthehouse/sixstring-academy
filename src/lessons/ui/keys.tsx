/**
 * Keyboard play inside a lesson. The player owns the one keydown listener (Enter checks and
 * continues, Escape asks to leave); the step on screen registers what number keys, letters,
 * Space and Backspace do for it. Only one step is registered at a time: the newest one wins.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

/** What a step does with keys. Each handler returns true when it used the key. */
export interface StepKeyHandlers {
  /** 1–9 pressed (0-based display position). */
  digit?: (position: number) => boolean | void;
  /** A printable key other than a digit or space (letters, '#', '-'). */
  char?: (key: string) => boolean | void;
  space?: () => boolean | void;
  backspace?: () => boolean | void;
  /** Arrow keys (for nudging a note on the staff). */
  arrow?: (key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => boolean | void;
  /** Enter, before the player's own Enter (return true to keep it). */
  enter?: () => boolean | void;
}

interface KeysRegistry {
  current: StepKeyHandlers | null;
}

const KeysContext = createContext<KeysRegistry | null>(null);

/** Gives the steps inside a place to register their keys. */
export function StepKeysProvider({ registry, children }: { registry: KeysRegistry; children: ReactNode }) {
  return <KeysContext.Provider value={registry}>{children}</KeysContext.Provider>;
}

/** Create the registry a player reads from (stable for the player's lifetime). */
export function useKeysRegistry(): KeysRegistry {
  return useRef<StepKeyHandlers | null>(null) as KeysRegistry;
}

/**
 * Register a step's key handlers while it is mounted and `active`. Handlers may change on every
 * render; the newest are always used.
 */
export function useStepKeys(handlers: StepKeyHandlers, active = true): void {
  const registry = useContext(KeysContext);
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!registry || !active) return;
    const proxy: StepKeyHandlers = {
      digit: (p) => latest.current.digit?.(p),
      char: (k) => latest.current.char?.(k),
      space: () => latest.current.space?.(),
      backspace: () => latest.current.backspace?.(),
      arrow: (k) => latest.current.arrow?.(k),
      enter: () => latest.current.enter?.(),
    };
    registry.current = proxy;
    return () => {
      if (registry.current === proxy) registry.current = null;
    };
  }, [registry, active]);
}

/** True when a key event belongs to a text field or an open dialog, not to the lesson. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (el.isContentEditable) return true;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
  return !!el.closest('[role="dialog"], [role="alertdialog"]');
}
