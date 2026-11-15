/**
 * Screen-wide keyboard shortcuts that never steal a key from the control that has focus: typing
 * in a field, Space and Enter on a button or link, arrows inside tabs, chips, sliders and boards.
 */
import { useEffect } from 'react';
import { useLatest } from '@/ui';

const TEXT = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const COMPOSITE = '[role="tablist"], [role="radiogroup"], [role="slider"], [role="listbox"], [role="menu"], [role="grid"], [role="toolbar"], [role="spinbutton"], [data-own-arrows]';
const ACTIVATES = 'button, a[href], [role="button"], [role="radio"], [role="tab"], [role="checkbox"], [role="switch"], summary';

/** True when the focused element should keep this key for itself. */
export function keyBelongsToFocus(target: EventTarget | null, key: string): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  if (el.closest(TEXT)) return true;
  if (el.closest('[role="dialog"]')) return true;
  if ((key === ' ' || key === 'Enter') && el.closest(ACTIVATES)) return true;
  if (key.startsWith('Arrow') && el.closest(COMPOSITE)) return true;
  return false;
}

/** Shortcut map: key name (`' '`, `'Enter'`, `'ArrowLeft'` …) to handler. */
export type Shortcuts = Partial<Record<string, () => void>>;

/** Listen for shortcuts on the window while `active`. */
export function useShortcuts(shortcuts: Shortcuts, active = true): void {
  const latest = useLatest(shortcuts);
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const fn = latest.current[e.key];
      if (!fn || keyBelongsToFocus(e.target, e.key)) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, latest]);
}
