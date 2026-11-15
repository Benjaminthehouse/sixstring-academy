import { useMemo, useRef, useState } from 'react';
import { explainMediaFailure } from '@/core/platform/media';
import { useProfile, useProgress, useQuests, useRecents, useReviewCounts } from '@/core/progress';
import { Badge, Banner, Button, Card, EmptyState, Icon, Kbd, List, ListItem, Page, ProgressBar, SearchField, Section, Tag, cx, useEventListener } from '@/ui';
import { navigate } from '../router';
import { ROUTE_BY_NAME, type RouteDef } from '../routes';
import { mediaAvailability, type MediaAvailability } from '../shell/media';
import { destinationFor, hubRoutes, searchableRoutes } from '../shell/nav';
import { arrangeGroups, unavailableDevices, type HubGroup } from './groups';
import { recommend, type Recommendation } from './recommend';
import { searchRoutes } from './search';
import styles from './Hub.module.css';

/** Props for `<Hub>`. */
export interface HubProps {
  section: 'learn' | 'play' | 'tools';
  title: string;
  subtitle: string;
  /**
   * How to group the section's screens. Screens of the section that no group names are appended
   * under "More", so a route added to the registry later still shows up.
   */
  groups?: readonly HubGroup[];
  /** Heading for the screens when there is a single group. */
  allTitle: string;
}

function MediaBadges({ route, media }: { route: RouteDef; media: MediaAvailability }) {
  const missing = unavailableDevices(route, media);
  if (missing.length === 0) return null;
  return (
    <span className={styles.badges}>
      {missing.map((device) => (
        <Badge key={device} tone="warn" icon={device === 'camera' ? 'CameraOff' : 'MicOff'}>
          {device === 'camera' ? 'No camera here' : 'No microphone here'}
        </Badge>
      ))}
    </span>
  );
}

function FeaturedCard({ item, lead }: { item: Recommendation; lead: boolean }) {
  return (
    <Card to={item.route} params={item.params} variant={lead ? 'raised' : 'plain'} className={cx(styles.featured, lead && styles.featuredLead)}>
      <span className={styles.featuredIcon} aria-hidden="true">
        <Icon name={item.icon} size={22} />
      </span>
      <span className={styles.reason}>{item.reason}</span>
      <span className={styles.featuredTitle}>{item.title}</span>
      <span className={styles.featuredDetail}>
        {item.detail}
        {item.progress !== undefined && <ProgressBar className={styles.featuredProgress} aria-label="Progress" value={Math.round(item.progress * 100)} max={100} size="sm" valueText={false} />}
      </span>
      {lead ? (
        <span className={styles.cta} aria-hidden="true">
          {item.progress !== undefined ? 'Continue' : 'Start'}
          <Icon name="ArrowRight" size={18} strokeWidth={2.25} />
        </span>
      ) : (
        <span className={styles.go} aria-hidden="true">
          <Icon name="ArrowRight" size={18} />
        </span>
      )}
    </Card>
  );
}

function RouteCard({ route, media }: { route: RouteDef; media: MediaAvailability }) {
  return (
    <Card to={route.name} className={styles.route} padding="sm">
      <span className={styles.routeIcon} aria-hidden="true">
        <Icon name={route.icon} size={22} />
      </span>
      <span className={styles.routeText}>
        <span className={styles.routeTitle}>{route.title}</span>
        <span className={styles.routeBlurb}>{route.blurb}</span>
        <MediaBadges route={route} media={media} />
      </span>
    </Card>
  );
}

/**
 * A section hub: a search box over every screen of the app, a featured row chosen from the
 * learner's level and recent activity, then a card for each screen of the section. Screens that
 * need a microphone or camera this host cannot provide are marked.
 */
export function Hub({ section, title, subtitle, groups, allTitle }: HubProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const profile = useProfile();
  const recents = useRecents();
  const quests = useQuests();
  const reviews = useReviewCounts();
  const tunedToday = useProgress((s) => s.days[s.meta.today]?.kinds.tuner !== undefined);
  const media = useMemo(() => mediaAvailability(), []);

  const routes = useMemo(() => hubRoutes(section), [section]);
  const arranged = useMemo(() => arrangeGroups(routes, groups, allTitle), [routes, groups, allTitle]);
  const featured = useMemo(() => {
    const picks = recommend(section, { experience: profile.experience, teacher: profile.teacher, recents, quests: quests.daily, dueReviews: reviews.due, tunedToday });
    // Do not lead with a screen that cannot hear or see the guitar on this host.
    const limited = (item: Recommendation) => (ROUTE_BY_NAME[item.route] ? unavailableDevices(ROUTE_BY_NAME[item.route], media).length > 0 : false);
    return [...picks.filter((item) => !limited(item)), ...picks.filter(limited)];
  }, [section, profile.experience, profile.teacher, recents, quests.daily, reviews.due, tunedToday, media]);
  const hits = useMemo(() => searchRoutes(query, searchableRoutes()), [query]);
  const searching = query.trim().length > 0;
  const blockedHere = routes.some((r) => unavailableDevices(r, media).length > 0);

  // "/" jumps to the search box, as it does on most sites.
  useEventListener(typeof window !== 'undefined' ? window : null, 'keydown', (event: KeyboardEvent) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    event.preventDefault();
    searchRef.current?.focus();
  });

  return (
    <Page title={title} subtitle={subtitle}>
      <div className={styles.search}>
        <SearchField
          ref={searchRef}
          value={query}
          onChange={setQuery}
          label="Search every screen"
          placeholder="Search: tune, pentatonic, PDF…"
          size="lg"
          onSubmit={() => {
            if (hits[0]) navigate(hits[0].route.name);
          }}
        />
        <span className={styles.searchHint} aria-hidden="true">
          <Kbd>/</Kbd>
        </span>
      </div>

      {searching ? (
        <Section title={hits.length === 0 ? 'Nothing found' : hits.length === 1 ? '1 screen' : `${hits.length} screens`} aria-live="polite">
          {hits.length === 0 ? (
            <EmptyState
              icon="Search"
              title={`No screen matches “${query.trim()}”`}
              actions={
                <Button iconLeft="X" onClick={() => setQuery('')}>
                  Clear the search
                </Button>
              }
            >
              Try a plainer word, such as “chords”, “tuner” or “scan”. Songs, scales and lessons have their own search inside their screens.
            </EmptyState>
          ) : (
            <List variant="card">
              {hits.map(({ route }) => (
                <ListItem key={route.name} icon={route.icon} title={route.title} subtitle={route.blurb} to={route.name} wrap trailing={<Tag>{destinationFor(route.name).label}</Tag>} />
              ))}
            </List>
          )}
        </Section>
      ) : (
        <>
          {blockedHere && media.reason && (
            <Banner tone="info" title={media.reason === 'blocked-by-host' ? 'The microphone and camera are off in this viewer' : explainMediaFailure(media.reason, 'microphone').title}>
              {media.reason === 'blocked-by-host'
                ? 'The marked screens still work by tapping the notes yourself. Open the app at its own address, or install it, and they can listen to and watch your guitar.'
                : `${explainMediaFailure(media.reason, 'microphone').fix} Until then the marked screens work by tapping.`}
            </Banner>
          )}

          {featured.length > 0 && (
            <Section title="For you" description="Picked from what you played last, today's quests and your level.">
              <div className={styles.featuredGrid} data-count={featured.length}>
                {featured.map((item, i) => (
                  <FeaturedCard key={item.key} item={item} lead={i === 0} />
                ))}
              </div>
            </Section>
          )}

          {arranged.map((group) => (
            <Section key={group.title} title={group.title} description={group.description}>
              <div className={styles.routes} data-count={group.routes.length}>
                {group.routes.map((route) => (
                  <RouteCard key={route.name} route={route} media={media} />
                ))}
              </div>
            </Section>
          ))}
        </>
      )}
    </Page>
  );
}
