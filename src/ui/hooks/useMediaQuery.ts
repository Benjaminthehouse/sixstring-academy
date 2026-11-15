import { useCallback, useSyncExternalStore } from 'react';

/** Layout breakpoints (px). Below `mobile` the app shows the bottom tab bar; from `wide` up there is room for side panels. */
export const BREAKPOINTS = { mobile: 720, wide: 1080 } as const;

/** Media query matching phone-sized viewports. */
export const MOBILE_QUERY = `(max-width: ${BREAKPOINTS.mobile - 0.02}px)`;
/** Media query matching wide (desktop) viewports. */
export const WIDE_QUERY = `(min-width: ${BREAKPOINTS.wide}px)`;

/** Subscribe to a CSS media query. Returns false where `matchMedia` is unavailable. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const get = useCallback(() => (typeof window !== 'undefined' && !!window.matchMedia ? window.matchMedia(query).matches : false), [query]);
  return useSyncExternalStore(subscribe, get, () => false);
}

/** True on phone-sized viewports (narrower than 720 px). */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

/** The app's own motion setting, which it keeps on <html> as `data-motion` ("reduce" | "full"; absent = follow the device). */
function rootMotion(): string | null {
  return typeof document !== 'undefined' ? document.documentElement.getAttribute('data-motion') : null;
}

function subscribeRootMotion(onChange: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  return () => observer.disconnect();
}

/**
 * True when motion should be reduced: the learner's own setting in the app if there is one
 * (`data-motion` on <html>), otherwise what they asked their device for. Updates live. Use it for
 * motion driven from JavaScript (canvas, confetti, counting numbers); CSS animations are handled
 * globally.
 */
export function usePrefersReducedMotion(): boolean {
  const device = useMediaQuery('(prefers-reduced-motion: reduce)');
  const own = useSyncExternalStore(subscribeRootMotion, rootMotion, () => null);
  return own === 'reduce' ? true : own === 'full' ? false : device;
}

/** True when the primary pointer is coarse (a finger). */
export function useIsTouch(): boolean {
  return useMediaQuery('(pointer: coarse)');
}
