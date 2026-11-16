/**
 * Keyboard play inside a lesson. The player owns the one keydown listener (Enter checks and
 * continues, Escape asks to leave); the step on screen registers what number keys, letters,
 * Space and Backspace do for it. A step may register from more than one component (a listening
 * step registers Space for its play button, its options register the number keys): for each key
 * the newest registration that handles it wins, so nested parts of one step do not shadow each
 * other.
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

/** The registrations behind a registry, newest last (kept beside it, so the registry's shape stays the same). */
const STACKS = new WeakMap<KeysRegistry, Array<{ current: StepKeyHandlers }>>();

const KEY_NAMES = ['digit', 'char', 'space', 'backspace', 'arrow', 'enter'] as const;

/**
 * One set of handlers made of several registrations: each key goes to the newest registration
 * that has a handler for it (that handler's answer is final). Pure: exported for tests.
 */
export function combineStepKeys(stack: ReadonlyArray<{ current: StepKeyHandlers }>): StepKeyHandlers | null {
  if (stack.length === 0) return null;
  const owner = (name: (typeof KEY_NAMES)[number]): StepKeyHandlers | null => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].current[name]) return stack[i].current;
    return null;
  };
  return {
    digit: (p) => owner('digit')?.digit?.(p),
    char: (k) => owner('char')?.char?.(k),
    space: () => owner('space')?.space?.(),
    backspace: () => owner('backspace')?.backspace?.(),
    arrow: (k) => owner('arrow')?.arrow?.(k),
    enter: () => owner('enter')?.enter?.(),
  };
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

/** Add a registration (the newest) to a registry; returns the function that takes it out. Exported for tests. */
export function registerStepKeys(registry: KeysRegistry, entry: { current: StepKeyHandlers }): () => void {
  const stack = STACKS.get(registry) ?? [];
  STACKS.set(registry, stack);
  stack.push(entry);
  registry.current = combineStepKeys(stack);
  return () => {
    const at = stack.indexOf(entry);
    if (at >= 0) stack.splice(at, 1);
    registry.current = combineStepKeys(stack);
  };
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
    return registerStepKeys(registry, latest);
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
