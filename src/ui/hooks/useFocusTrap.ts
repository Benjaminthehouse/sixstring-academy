import { useEffect, type RefObject } from 'react';
import { initialFocusTarget, trapTabTarget } from './focus';

/** Options for `useFocusTrap`. */
export interface FocusTrapOptions {
  /** Focus the first control (or `[data-autofocus]`) when the trap turns on. Default true. */
  autoFocus?: boolean;
  /** Put focus back where it was when the trap turns off. Default true. */
  restoreFocus?: boolean;
}

/**
 * Keep keyboard focus inside `ref` while `active` is true: Tab and Shift+Tab wrap at the ends, and
 * focus returns to the previously focused element afterwards. The container needs `tabIndex={-1}`
 * so it can take focus when it has no controls.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, options: FocusTrapOptions = {}): void {
  const { autoFocus = true, restoreFocus = true } = options;
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (autoFocus && !root.contains(document.activeElement)) {
      initialFocusTarget(root).focus({ preventScroll: true });
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      // Only the top-most trap handles the key (nested dialogs each register one).
      if (!isTopTrap(root)) return;
      // A popover or menu opened from inside the dialog is portalled outside it and manages Tab itself.
      const focused = document.activeElement;
      if (focused instanceof Element && !root.contains(focused) && focused.closest('[data-ui-layer]')) return;
      const target = trapTabTarget(root, document.activeElement, event.shiftKey);
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };
    traps.push(root);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const at = traps.lastIndexOf(root);
      if (at >= 0) traps.splice(at, 1);
      if (restoreFocus && previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ref, active, autoFocus, restoreFocus]);
}

const traps: HTMLElement[] = [];
function isTopTrap(root: HTMLElement): boolean {
  return traps[traps.length - 1] === root;
}
