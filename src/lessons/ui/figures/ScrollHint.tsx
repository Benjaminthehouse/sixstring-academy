/**
 * A visible cue for content that scrolls sideways inside its own box (a long neck, a long tab on a
 * phone): a soft edge and a round arrow on the side where more is hidden. Tapping the arrow
 * scrolls; swiping works as before. The cue finds the scrolling element itself, so it can wrap a
 * music-kit component whose scroller is inside it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, cx } from '@/ui';
import styles from './Figures.module.css';

/** The first element at or under `root` that scrolls sideways and has more to show. */
function findScroller(root: HTMLElement): HTMLElement | null {
  const candidates: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const el of candidates) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const overflow = getComputedStyle(el).overflowX;
    if (overflow === 'auto' || overflow === 'scroll') return el;
  }
  return null;
}

/** Wrap content that may scroll sideways; shows where more is hidden. */
export function ScrollHint({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLElement | null>(null);
  const [more, setMore] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;
    let detach: (() => void) | null = null;
    const measure = (): void => {
      const el = scroller.current;
      if (!el) {
        setMore((m) => (m.left || m.right ? { left: false, right: false } : m));
        return;
      }
      const left = el.scrollLeft > 2;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
    };
    const attach = (): void => {
      const found = findScroller(root);
      if (found !== scroller.current) {
        detach?.();
        scroller.current = found;
        if (found) {
          const onScroll = (): void => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
          };
          found.addEventListener('scroll', onScroll, { passive: true });
          detach = () => found.removeEventListener('scroll', onScroll);
        } else {
          detach = null;
        }
      }
      measure();
    };
    attach();
    // The board measures itself after mount and on resize: look again whenever the size changes.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => attach());
    observer?.observe(root);
    const late = window.setTimeout(attach, 400);
    return () => {
      observer?.disconnect();
      window.clearTimeout(late);
      cancelAnimationFrame(frame);
      detach?.();
    };
  }, []);

  const nudge = (dir: 1 | -1): void => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: 'smooth' });
  };

  return (
    <div ref={ref} className={cx(styles.scrollHint, className)} data-more-left={more.left || undefined} data-more-right={more.right || undefined}>
      {children}
      {more.left && (
        <button type="button" className={cx(styles.scrollArrow, styles.scrollLeft)} onClick={() => nudge(-1)} aria-label="Scroll back" tabIndex={-1} data-scroll-cue="left">
          <Icon name="ChevronLeft" size="sm" />
        </button>
      )}
      {more.right && (
        <button type="button" className={cx(styles.scrollArrow, styles.scrollRight)} onClick={() => nudge(1)} aria-label="Scroll for more" tabIndex={-1} data-scroll-cue="right">
          <Icon name="ChevronRight" size="sm" />
        </button>
      )}
    </div>
  );
}
