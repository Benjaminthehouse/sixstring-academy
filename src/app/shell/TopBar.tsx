import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { IconButton, cx } from '@/ui';
import { Brand, BrandMark } from '../brand/Brand';
import { href, navigate } from '../router';
import type { RouteDef } from '../routes';
import type { ImmersiveLevel } from './immersive';
import { TOPBAR_HEIGHT } from './layout';
import { APP_NAME, upTarget } from './nav';
import { hasAppHistory } from './scroll';
import { StatChips } from './StatChips';
import { topBarFit, type TopBarFit } from './topbarFit';
import styles from './Shell.module.css';

/**
 * True once the screen's own heading has scrolled out from under the bar (or the screen has no
 * visible heading). The bar only repeats the title then, so a page never shows its name twice.
 *
 * Re-checked on scroll, resize and any change inside `<main>`: a screen that hides its header
 * part-way (the live camera view turns its `Page` header into a screen-reader-only heading when the
 * camera starts) has to get its title in the bar at scroll 0, without a scroll or a new route.
 */
export function useHeadingOutOfView(routeKey: string, barHeight: number): boolean {
  const [out, setOut] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const heading = document.querySelector('#main h1');
      let next = true;
      if (heading) {
        const rect = heading.getBoundingClientRect();
        // A heading kept only for screen readers is 1 px tall: nothing visible names the screen.
        next = rect.height <= 2 || rect.bottom < barHeight;
      }
      setOut((previous) => (previous === next ? previous : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // The lazy screen replaces the loading skeleton after the route has already changed, and a
    // screen may swap its visible header for a hidden one (or back) at any depth. Checks are
    // coalesced to one per frame, so a busy screen costs one measurement per frame at most.
    const main = document.getElementById('main');
    const observer = main && typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    if (main && observer) observer.observe(main, { childList: true, subtree: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [routeKey, barHeight]);
  return out;
}

/**
 * Keep the bar's row inside the bar: measure what the brand, the title and the chips need and give
 * way in order (see `topbarFit.ts`). Re-measures when the bar, the chips or the text size change.
 */
function useTopBarFit(bar: RefObject<HTMLElement | null>, active: boolean, title: boolean, routeKey: string): TopBarFit {
  const [fit, setFit] = useState<TopBarFit>('all');
  const brandWidth = useRef(44);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!active || !el) return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const style = getComputedStyle(el);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const brand = el.querySelector<HTMLElement>('[data-topbar-brand]');
      // The brand is not measurable while it is hidden: keep the width it had when it showed.
      if (brand && brand.offsetParent !== null) brandWidth.current = brand.getBoundingClientRect().width;
      const chips = Array.from(el.querySelectorAll<HTMLElement>('[data-chip] > :first-child')).map((c) => c.getBoundingClientRect().width);
      const next = topBarFit({ available, gap: parseFloat(style.columnGap) || rem * 0.5, brand: brandWidth.current, titleMin: rem * 5, title, chips, pad: rem * 0.5, tightPad: rem * 0.25, tap: 44 });
      setFit((previous) => (previous === next ? previous : next));
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
    ro?.observe(el);
    el.querySelectorAll('[data-chip] > :first-child').forEach((c) => ro?.observe(c));
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
    };
  }, [bar, active, title, routeKey]);
  return active ? fit : 'all';
}

/** Props for `<TopBar>`. */
export interface TopBarProps {
  def: RouteDef;
  params: readonly string[];
  /** The screen title in effect (registry title or a screen's own). */
  title: string;
  immersion: ImmersiveLevel;
}

/**
 * The slim bar at the top of phone screens. Normally: the brand (the name on Today, the screen
 * title elsewhere once its heading has scrolled away) and the four progress chips. In an immersive
 * screen it shrinks to a back button and the title.
 */
export function TopBar({ def, params, title, immersion }: TopBarProps) {
  const routeKey = `${def.name}/${params.join('/')}`;
  const headingGone = useHeadingOutOfView(routeKey, TOPBAR_HEIGHT);
  const isHome = def.name === 'home';
  const focus = immersion === 'focus';
  const barRef = useRef<HTMLElement | null>(null);
  const titleShown = headingGone && !isHome;
  const fit = useTopBarFit(barRef, !focus, titleShown, routeKey);

  const goBack = () => {
    if (hasAppHistory()) window.history.back();
    else navigate(upTarget(def.name, params));
  };

  return (
    <header ref={barRef} className={cx(styles.topbar, focus && styles.topbarFocus)} data-fit={focus ? undefined : fit}>
      {focus ? (
        <IconButton className={styles.topbarBack} icon="ArrowLeft" label="Back" noTooltip onClick={goBack} />
      ) : (
        <a className={styles.topbarBrand} href={href('home')} aria-label={isHome ? APP_NAME : `${APP_NAME}: go to Today`} data-topbar-brand="">
          {isHome ? <Brand compact size={28} /> : <BrandMark size={28} />}
        </a>
      )}
      {/* Decorative repeat of the page heading: screen readers already have the h1. */}
      {!isHome || focus ? (
        <span className={cx(styles.topbarTitle, headingGone && styles.topbarTitleShown)} aria-hidden="true">
          {title}
        </span>
      ) : (
        <span className={styles.topbarSpacer} />
      )}
      {!focus && <StatChips variant="bar" density={fit === 'core' ? 'core' : fit === 'compact' ? 'compact' : 'normal'} />}
    </header>
  );
}
