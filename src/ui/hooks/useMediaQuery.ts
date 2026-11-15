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

/** True when the person asked the system for reduced motion. Updates live. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** True when the primary pointer is coarse (a finger). */
export function useIsTouch(): boolean {
  return useMediaQuery('(pointer: coarse)');
}
