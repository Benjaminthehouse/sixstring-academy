import { useEffect, type RefObject } from 'react';
import { useLatest } from './useLatest';

/** Options for `useDismiss`. */
export interface DismissOptions {
  /** Close on Escape. Default true. */
  escape?: boolean;
  /** Close on a press outside every ref. Default true. */
  outside?: boolean;
}

/**
 * Call `onDismiss` when the person presses Escape or presses outside all of `refs`
 * (popovers, menus, tooltips). Inactive while `active` is false.
 */
export function useDismiss(refs: Array<RefObject<HTMLElement | null>>, active: boolean, onDismiss: (reason: 'escape' | 'outside') => void, options: DismissOptions = {}): void {
  const { escape = true, outside = true } = options;
  const latest = useLatest(onDismiss);
  const refsRef = useLatest(refs);
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!outside) return;
      const target = event.target as Node | null;
      if (target && refsRef.current.some((r) => r.current?.contains(target))) return;
      latest.current('outside');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (escape && event.key === 'Escape') {
        event.stopPropagation();
        latest.current('escape');
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [active, escape, outside, latest, refsRef]);
}
