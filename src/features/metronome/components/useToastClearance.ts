/**
 * Keeps toasts off the metronome's thumb-zone controls.
 *
 * On phones and narrow windows the tempo buttons and Start sit at the bottom of the screen, right
 * where toasts appear, so "Speed trainer off" or "Waltz 3/4 is set. Press Start" used to cover the
 * very button it talked about. The kit's `ActionBar` solves this by publishing its height as
 * `--action-bar-h` on `<html>`, which toasts add to their offset; these controls are not an
 * ActionBar (they are part of a one-screen layout), so this hook publishes the same variable for
 * them while they are on screen, and puts back whatever was there when the screen goes.
 */
import { useEffect, type RefObject } from 'react';

/**
 * The space to keep free above the bottom bar: from the top of the controls down to the top of the
 * shell's tab bar (`navPx`, 0 where there is none), never negative (controls scrolled away) and
 * never more than 60% of the screen (controls scrolled to the top, as with very large text).
 */
export function clearanceFor(viewportPx: number, navPx: number, controlsTopPx: number): number {
  if (![viewportPx, navPx, controlsTopPx].every(Number.isFinite) || viewportPx <= 0) return 0;
  const free = viewportPx - Math.max(0, navPx) - controlsTopPx;
  return Math.round(Math.max(0, Math.min(viewportPx * 0.6, free)));
}

/**
 * While `active`, publish the room the controls in `ref` take at the bottom of the screen as
 * `--action-bar-h`. `navProbe` is an element whose height is the tab bar's (`--sticky-bottom`).
 */
export function useToastClearance(ref: RefObject<HTMLElement | null>, navProbe: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const before = root.style.getPropertyValue('--action-bar-h');
    let frame = 0;
    const measure = () => {
      frame = 0;
      const px = clearanceFor(window.innerHeight, navProbe.current?.getBoundingClientRect().height ?? 0, el.getBoundingClientRect().top);
      root.style.setProperty('--action-bar-h', `${px}px`);
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
    ro?.observe(el);
    window.addEventListener('resize', later);
    window.addEventListener('scroll', later, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener('resize', later);
      window.removeEventListener('scroll', later);
      if (before) root.style.setProperty('--action-bar-h', before);
      else root.style.removeProperty('--action-bar-h');
    };
  }, [ref, navProbe, active]);
}
