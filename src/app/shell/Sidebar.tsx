import { useId, useMemo } from 'react';
import { useLevel } from '@/core/progress';
import { Icon, LevelBadge, ProgressBar, Tooltip, cx, useElementSize, useIsTouch, useLocalState } from '@/ui';
import { Brand, BrandMark } from '../brand/Brand';
import { href } from '../router';
import type { RouteDef, Section } from '../routes';
import { APP_NAME, DESTINATIONS, hubRoutes, sectionsThatFit } from './nav';
import { StatChips } from './StatChips';
import styles from './Shell.module.css';

/** Props for `<Sidebar>`. */
export interface SidebarProps {
  /** The current route. */
  def: RouteDef;
  /** Fold to an icon rail (immersive screens). */
  rail?: boolean;
}

/** Row heights in px; the CSS uses the same numbers. Touch screens get taller rows. */
const ROWS = { fine: { destination: 44, sub: 32 }, coarse: { destination: 48, sub: 42 } } as const;

/**
 * The wide-screen sidebar: brand, the five destinations with the screens of each section beneath,
 * and the learner's level and progress chips at the foot. Sections whose screens do not fit the
 * window height start folded (the current section never does); each can be opened by hand.
 */
export function Sidebar({ def, rail = false }: SidebarProps) {
  const [navRef, navSize] = useElementSize<HTMLElement>();
  const coarse = useIsTouch();
  const level = useLevel();
  const baseId = useId();
  // What the learner opened or folded by hand; it wins over the automatic fit.
  const [manual, setManual] = useLocalState<Partial<Record<Section, boolean>>>('shell.nav-open', {});

  const groups = useMemo(() => DESTINATIONS.map((d) => ({ destination: d, routes: hubRoutes(d.section) })), []);
  const counts = useMemo(() => {
    const out: Partial<Record<Section, number>> = {};
    for (const g of groups) out[g.destination.section] = g.routes.length;
    return out;
  }, [groups]);

  const rows = coarse ? ROWS.coarse : ROWS.fine;
  // Before the first measurement, estimate from the window so the groups do not flicker open.
  const height = navSize.height > 0 ? navSize.height : typeof window !== 'undefined' ? Math.max(0, window.innerHeight - 220) : 600;
  const budget = Math.floor((height - 24 - groups.length * rows.destination) / rows.sub);
  const fits = sectionsThatFit(budget, def.section, counts);
  const isOpen = (section: Section): boolean => manual[section] ?? fits.includes(section);

  if (rail) {
    return (
      <aside className={cx(styles.sidebar, styles.rail)}>
        <a className={styles.railBrand} href={href('home')} aria-label={`${APP_NAME}: go to Today`}>
          <BrandMark size={32} />
        </a>
        <nav className={styles.railNav} aria-label="Main">
          {DESTINATIONS.map((d) => {
            const active = d.section === def.section;
            return (
              <Tooltip key={d.route} content={d.label} placement="right">
                <a className={styles.railLink} href={href(d.route)} aria-label={d.label} aria-current={active ? (def.name === d.route ? 'page' : 'true') : undefined}>
                  <Icon name={d.icon} size={22} strokeWidth={active ? 2.1 : 1.75} />
                </a>
              </Tooltip>
            );
          })}
        </nav>
      </aside>
    );
  }

  return (
    <aside className={styles.sidebar}>
      <a className={styles.sideBrand} href={href('home')} aria-label={`${APP_NAME}: go to Today`}>
        <Brand size={32} />
      </a>

      <nav ref={navRef} className={styles.sideNav} aria-label="Main">
        <ul className={styles.sideList}>
          {groups.map(({ destination: d, routes }) => {
            const inSection = d.section === def.section;
            const open = routes.length > 0 && isOpen(d.section);
            const listId = `${baseId}-${d.section}`;
            return (
              <li key={d.route}>
                <div className={styles.destRow}>
                  <a className={styles.dest} href={href(d.route)} aria-current={def.name === d.route ? 'page' : inSection ? 'true' : undefined}>
                    <Icon name={d.icon} size={20} strokeWidth={inSection ? 2.1 : 1.75} />
                    <span className={styles.destLabel}>{d.label}</span>
                  </a>
                  {routes.length > 0 && (
                    <button
                      type="button"
                      className={styles.destToggle}
                      aria-expanded={open}
                      aria-controls={listId}
                      aria-label={`${open ? 'Hide' : 'Show'} the screens in ${d.label}`}
                      onClick={() => setManual((previous) => ({ ...previous, [d.section]: !open }))}
                    >
                      <Icon name="ChevronDown" size={16} className={cx(styles.chevron, open && styles.chevronOpen)} />
                    </button>
                  )}
                </div>
                {routes.length > 0 && (
                  <ul id={listId} className={styles.sub} hidden={!open}>
                    {routes.map((r) => (
                      <li key={r.name}>
                        <a className={styles.subLink} href={href(r.name)} aria-current={def.name === r.name ? 'page' : undefined}>
                          <Icon name={r.icon} size={16} />
                          <span className={styles.subLabel}>{r.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={styles.sideFoot}>
        <a className={styles.levelLink} href={href('profile')} aria-label={`Level ${level.level}, ${level.title}. ${level.xpRemaining} XP to the next level. Open Me`}>
          <LevelBadge level={level.level} size={38} />
          <span className={styles.levelText}>
            <span className={styles.levelTitle}>{level.title}</span>
            <ProgressBar aria-label="Progress to the next level" value={level.xpIntoLevel} max={level.xpForNext} tone="xp" size="sm" valueText={false} />
            <span className={styles.levelNote}>
              {level.xpIntoLevel} / {level.xpForNext} XP
            </span>
          </span>
        </a>
        <StatChips variant="side" />
      </div>
    </aside>
  );
}
