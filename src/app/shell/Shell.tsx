import { useEffect, useRef, type MouseEvent } from 'react';
import { cx, useMediaQuery } from '@/ui';
import { redirect, useRoute } from '../router';
import { routeDef } from '../routes';
import { useImmersion } from './immersive';
import { WIDE_LAYOUT_QUERY } from './layout';
import { documentTitleFor, isKnownRoute } from './nav';
import { Outlet } from './Outlet';
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

  return (
    <div className={cx(styles.shell, wide ? styles.wide : styles.phone)} data-layout={wide ? 'wide' : 'phone'} data-immersive={immersion}>
      {/* Worded "Jump", not "Skip": the first-run flow has a "Skip for now" button, and scripts that click by text should find that one. */}
      <a className={styles.skip} href="#main" onClick={skipToContent}>
        Jump to content
      </a>
      {wide ? <Sidebar def={def} rail={immersion !== 'none'} /> : immersion !== 'bare' && <TopBar def={def} params={params} title={title} immersion={immersion} />}
      <main id="main" data-route={def.name} tabIndex={-1} className={styles.main}>
        <Outlet def={def} params={params} />
      </main>
      {!wide && immersion === 'none' && <TabBar def={def} entering={tabsReturning} />}
      <RouteAnnouncer title={title} />
    </div>
  );
}
