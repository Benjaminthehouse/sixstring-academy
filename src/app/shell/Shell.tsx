import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { cx, useMediaQuery } from '@/ui';
import { redirect, useRoute } from '../router';
import { routeDef } from '../routes';
import { useImmersion } from './immersive';
import { WIDE_LAYOUT_QUERY } from './layout';
import { documentTitleFor, isKnownRoute } from './nav';
import { Outlet } from './Outlet';
import { LessonReturn } from './LessonReturn';
import { useResolvedScreenTitle } from './screenTitle';
import { useScrollRestoration } from './scroll';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';
import styles from './Shell.module.css';

const NO_PARAMS: string[] = [];

/** Tells screen readers which screen a navigation landed on (focus stays where the learner left it). */
function RouteAnnouncer({ title }: { title: string }) {
  // Nothing to announce on first load: the browser reads the document title itself.
  const announced = useRef(title);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (announced.current === title) return;
    announced.current = title;
    if (ref.current) ref.current.textContent = title;
  }, [title]);
  return <div ref={ref} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />;
}

/** A control the learner can reach right now: on screen, enabled, not hidden from them. */
function usable(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false;
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return false;
  return !el.closest('[aria-hidden="true"], [inert]');
}

/**
 * The screen's main action: the primary (last) control of its ActionBar, or else the first primary
 * button (or the PlayButton) in `<main>`. The kit marks those with `data-ui-primary`.
 */
export function findMainAction(): HTMLElement | null {
  const bars = Array.from(document.querySelectorAll<HTMLElement>('#main [data-ui-action-bar]')).filter((b) => b.getClientRects().length > 0);
  const bar = bars[bars.length - 1];
  if (bar) {
    const controls = Array.from(bar.querySelectorAll<HTMLElement>('button, a[href], input, select')).filter(usable);
    if (controls.length > 0) return controls[controls.length - 1];
  }
  return Array.from(document.querySelectorAll<HTMLElement>('#main [data-ui-primary]')).find(usable) ?? null;
}

/** Focus the screen's main action ("Jump to …"). Returns false when the screen has none. */
export function focusMainAction(): boolean {
  const target = findMainAction();
  if (!target) return false;
  target.focus();
  return document.activeElement === target;
}

/** The skip link's words for the main action: its own label when it is short. */
function mainActionLabel(): string {
  const target = findMainAction();
  const name = (target?.getAttribute('aria-label') || target?.textContent || '').replace(/\s+/g, ' ').trim();
  return name && name.length <= 32 ? `Jump to “${name}”` : 'Jump to the main action';
}

/**
 * The frame around every screen: phone top bar and tab bar, or the wide-screen sidebar, and the
 * `<main>` the current screen renders into. Also owns the document title, scroll position and the
 * redirect for unknown addresses.
 */
export function Shell() {
  const route = useRoute();
  const known = isKnownRoute(route.name);
  const def = routeDef(route.name);
  const params = known ? route.params : NO_PARAMS;
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const immersion = useImmersion(def.name, params);
  const title = useResolvedScreenTitle(def.title);
  const routeKey = `${def.name}/${params.join('/')}`;

  // An address that names no screen shows Today; make the address bar say so too.
  useEffect(() => {
    if (!known) redirect('home');
  }, [known]);

  useEffect(() => {
    document.title = documentTitleFor(title);
  }, [title]);

  useScrollRestoration(routeKey);

  // The tab bar slides back in after an immersive screen, but simply is there on first load.
  const wasImmersive = useRef(false);
  const tabsReturning = wasImmersive.current && immersion === 'none';
  useEffect(() => {
    wasImmersive.current = immersion !== 'none';
  }, [immersion]);

  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    // A plain "#main" link would be read as a route by the hash router.
    event.preventDefault();
    document.getElementById('main')?.focus();
  };
  const skipToAction = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    focusMainAction();
  };
  // Named after the action itself ("Jump to “Start session”") when the link gets focus.
  const [actionLabel, setActionLabel] = useState('Jump to the main action');

  return (
    <div className={cx(styles.shell, wide ? styles.wide : styles.phone)} data-layout={wide ? 'wide' : 'phone'} data-immersive={immersion}>
      {/* Worded "Jump", not "Skip": the first-run flow has a "Skip for now" button, and scripts that click by text should find that one. */}
      <a className={styles.skip} href="#main" onClick={skipToContent}>
        Jump to content
      </a>
      {/* Only there while the screen has a main action (CSS :has): the primary button the screen is for. */}
      <a className={cx(styles.skip, styles.skipAction)} href="#main" onClick={skipToAction} onFocus={() => setActionLabel(mainActionLabel())} data-skip="action">
        {actionLabel}
      </a>
      {wide ? <Sidebar def={def} rail={immersion !== 'none'} /> : immersion !== 'bare' && <TopBar def={def} params={params} title={title} immersion={immersion} />}
      <main id="main" data-route={def.name} tabIndex={-1} className={styles.main}>
        <LessonReturn route={def.name} params={params} />
        <Outlet def={def} params={params} />
      </main>
      {!wide && immersion === 'none' && <TabBar def={def} entering={tabsReturning} />}
      <RouteAnnouncer title={title} />
    </div>
  );
}
