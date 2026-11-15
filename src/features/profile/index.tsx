import { Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import { href, redirect } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { useScreenTitle } from '@/app/shell';
import { teacherById } from '@/app/teachers';
import { AVATARS, useAchievements, useGems, useProfile, useProgress } from '@/core/progress';
import { Avatar, GemChip, Icon, Page, Skeleton } from '@/ui';
import pkg from '../../../package.json';
import About from './about/About';
import Achievements from './achievements/Achievements';
import DataScreen from './data/Data';
import Overview from './overview/Overview';
import { dateText, plural } from './format';
import { SECTIONS, locate, paramsFor, type SectionDef, type SectionId } from './sections';
import Shop from './shop/Shop';
import styles from './Profile.module.css';

// Settings pulls in the tuning catalog; it loads when it is opened, not with the overview.
const Settings = lazy(() => import('./settings/Settings'));

/** The strip of links (phone) or the side list (wide) that leads to each part of the Me area. */
function SectionNav({ current }: { current: SectionId }) {
  const listRef = useRef<HTMLUListElement | null>(null);
  // On a phone the strip scrolls sideways: keep the current part in view.
  useEffect(() => {
    const list = listRef.current;
    const link = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !link || list.scrollWidth <= list.clientWidth) return;
    const left = link.offsetLeft - 16;
    const right = link.offsetLeft + link.offsetWidth + 16;
    if (left < list.scrollLeft) list.scrollTo({ left, behavior: 'auto' });
    else if (right > list.scrollLeft + list.clientWidth) list.scrollTo({ left: right - list.clientWidth, behavior: 'auto' });
  }, [current]);
  return (
    <nav className={styles.nav} aria-label="Me">
      <ul className={styles.navList} ref={listRef}>
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <a className={styles.navLink} href={href('profile', ...paramsFor(section.id))} aria-current={section.id === current ? 'page' : undefined}>
              <Icon name={section.icon} size={18} />
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SectionFallback() {
  return (
    <div className={styles.fallback} aria-busy="true">
      <span className="sr-only" role="status">
        Loading
      </span>
      <Skeleton variant="block" height={96} />
      <Skeleton variant="block" height={96} />
      <Skeleton variant="text" lines={3} />
    </div>
  );
}

/** The page header of each part: its title, a line under it and anything that sits beside the title. */
function useHeader(section: SectionDef): { title: ReactNode; subtitle: ReactNode; actions?: ReactNode } {
  const profile = useProfile();
  const gems = useGems();
  const achievements = useAchievements();
  const activeDays = useProgress((s) => s.stats['active.days'] ?? 0);
  switch (section.id) {
    case 'overview': {
      const teacher = teacherById(profile.teacher);
      const avatar = AVATARS.find((a) => a.id === profile.avatar) ?? AVATARS[0];
      return {
        title: (
          <span className={styles.who}>
            <Avatar name={profile.name || 'You'} icon={avatar.icon} size="lg" decorative />
            <span data-profile-name="">{profile.name || 'Me'}</span>
          </span>
        ),
        subtitle: activeDays > 0 ? `Playing since ${dateText(profile.createdAt)}. ${plural(activeDays, 'day')} of practice so far.` : `Your progress collects here as you play. ${teacher.first} is ready when you are.`,
      };
    }
    case 'achievements':
      return {
        title: 'Achievements',
        subtitle:
          achievements.unlocked === 0
            ? `${achievements.total} to earn. Each one pays gems. The first ones come quickly.`
            : `${achievements.unlocked} of ${achievements.total} earned. Each one paid gems when you earned it.`,
      };
    case 'shop':
      return { title: 'Shop', subtitle: 'Spend the gems you earn by playing. Nothing here costs money.', actions: <GemChip value={gems} size="lg" /> };
    case 'settings':
      return { title: 'Settings', subtitle: 'Every change applies straight away. There is nothing to save.' };
    case 'data':
      return { title: 'Your data', subtitle: 'Back up your progress, move it to another device, or start over.' };
    default:
      return { title: 'About', subtitle: `Sixstring Academy ${pkg.version}. A complete guitar school that runs in your browser.` };
  }
}

/**
 * The Me area (`#profile`): overview, achievements, shop, settings, data and about. Each part is
 * its own address (`#profile--shop` ...), so back, forward, reload and links from elsewhere all
 * work. A strip of links stays in reach on a phone; wide screens get a side list beside the part.
 */
export default function Profile({ params }: RouteProps) {
  const location = locate(params);
  const { section, detail } = location;

  // An address that names no part shows the overview: say so in the address bar too.
  useEffect(() => {
    if (!location.known) redirect('profile');
  }, [location.known]);

  useScreenTitle(section.id === 'overview' ? null : section.title);
  const header = useHeader(section);

  return (
    <Page title={header.title} subtitle={header.subtitle} actions={header.actions} data-profile-section={section.id}>
      <div className={styles.layout}>
        <SectionNav current={section.id} />
        <div className={styles.detail}>
          {section.id === 'overview' && <Overview />}
          {section.id === 'achievements' && <Achievements openId={detail} />}
          {section.id === 'shop' && <Shop />}
          {section.id === 'settings' && (
            <Suspense fallback={<SectionFallback />}>
              <Settings focus={detail} />
            </Suspense>
          )}
          {section.id === 'data' && <DataScreen />}
          {section.id === 'about' && <About />}
        </div>
      </div>
    </Page>
  );
}
