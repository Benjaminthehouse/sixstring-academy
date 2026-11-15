import { useEffect, useState } from 'react';
import { IconButton, cx } from '@/ui';
import { Brand, BrandMark } from '../brand/Brand';
import { href, navigate } from '../router';
import type { RouteDef } from '../routes';
import type { ImmersiveLevel } from './immersive';
import { TOPBAR_HEIGHT } from './layout';
import { APP_NAME, upTarget } from './nav';
import { hasAppHistory } from './scroll';
import { StatChips } from './StatChips';
import styles from './Shell.module.css';

/**
 * True once the screen's own heading has scrolled out from under the bar (or the screen has no
 * visible heading). The bar only repeats the title then, so a page never shows its name twice.
 */
function useHeadingOutOfView(routeKey: string, barHeight: number): boolean {
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
    // The lazy screen replaces the loading skeleton after the route has already changed.
    const main = document.getElementById('main');
    const observer = main && typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    if (main && observer) observer.observe(main, { childList: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [routeKey, barHeight]);
  return out;
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

  const goBack = () => {
    if (hasAppHistory()) window.history.back();
    else navigate(upTarget(def.name, params));
  };

  return (
    <header className={cx(styles.topbar, focus && styles.topbarFocus)}>
      {focus ? (
        <IconButton className={styles.topbarBack} icon="ArrowLeft" label="Back" noTooltip onClick={goBack} />
      ) : (
        <a className={styles.topbarBrand} href={href('home')} aria-label={isHome ? APP_NAME : `${APP_NAME}: go to Today`}>
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
      {!focus && <StatChips variant="bar" />}
    </header>
  );
}
