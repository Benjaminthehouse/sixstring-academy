import { useEffect } from 'react';

let locks = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

/** Take one scroll lock on the page. Returns the release function. Locks are counted, so nested overlays work. */
export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  const root = document.documentElement;
  if (locks === 0) {
    saved = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
    // Keep the layout from jumping when a classic scrollbar disappears.
    const scrollbar = window.innerWidth - root.clientWidth;
    root.style.overflow = 'hidden';
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0 && saved) {
      root.style.overflow = saved.overflow;
      root.style.paddingRight = saved.paddingRight;
      saved = null;
    }
  };
}

/** Stop the page behind an overlay from scrolling while `active` is true. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return lockScroll();
  }, [active]);
}
