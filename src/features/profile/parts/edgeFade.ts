import { useEffect, useState, type RefObject } from 'react';

/** Which ends of a sideways-scrolling row have more beyond them. */
export interface EdgeFade {
  start: boolean;
  end: boolean;
}

/**
 * Work out which edge of a scrolling row to fade, the way the kit's ChipGroup does: an edge fades
 * while there is more to scroll to on that side (with a few pixels of slack for rounding).
 */
export function edgeFade(metrics: { scrollLeft: number; scrollWidth: number; clientWidth: number }): EdgeFade {
  const { scrollLeft, scrollWidth, clientWidth } = metrics;
  const scrollable = scrollWidth - clientWidth > 4;
  return { start: scrollable && scrollLeft > 4, end: scrollable && scrollLeft < scrollWidth - clientWidth - 4 };
}

/** Keep `edgeFade` in step with a scrolling element: on scroll, and whenever its size changes. */
export function useEdgeFade(ref: RefObject<HTMLElement | null>): EdgeFade {
  const [fade, setFade] = useState<EdgeFade>({ start: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = (): void => {
      const next = edgeFade(el);
      setFade((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [ref]);
  return fade;
}
