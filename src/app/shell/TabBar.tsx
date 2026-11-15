import type { MouseEvent } from 'react';
import { Icon, cx } from '@/ui';
import { href } from '../router';
import type { RouteDef } from '../routes';
import { DESTINATIONS } from './nav';
import styles from './Shell.module.css';

/** Props for `<TabBar>`. */
export interface TabBarProps {
  /** The current route; its section decides the active tab. */
  def: RouteDef;
  /** Slide in from the bottom edge (the bar is coming back after an immersive screen). */
  entering?: boolean;
}

/**
 * The phone's bottom tab bar: Today, Learn, Play, Tools, Me. Real links, so long-press and screen
 * readers work. Tapping the tab you are already on scrolls its screen back to the top.
 */
export function TabBar({ def, entering }: TabBarProps) {
  const onTap = (event: MouseEvent<HTMLAnchorElement>, route: string) => {
    if (def.name !== route || window.location.hash !== href(route)) return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <nav className={cx(styles.tabbar, entering && styles.tabbarEntering)} aria-label="Main">
      {DESTINATIONS.map((d) => {
        const active = d.section === def.section;
        return (
          <a key={d.route} className={styles.tab} href={href(d.route)} aria-current={active ? (def.name === d.route ? 'page' : 'true') : undefined} onClick={(event) => onTap(event, d.route)}>
            <span className={styles.tabIcon}>
              <Icon name={d.icon} size={22} strokeWidth={active ? 2.1 : 1.75} />
            </span>
            <span className={styles.tabLabel}>{d.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
