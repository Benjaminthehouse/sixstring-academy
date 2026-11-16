/**
 * The progression browser (`#progressions`): search, a style filter, a level filter, the learner's
 * own progressions, a "start here" row for first-timers, and every style as a short shelf with a
 * "See all" that turns into the filter. Every card plays a preview when its round button is tapped.
 */
import { useMemo, useState } from 'react';
import { href } from '@/app/router';
import { PROGRESSIONS, getProgression, type Progression } from '@/content/progressions';
import { Button, ChipGroup, EmptyState, Icon, LinkButton, Page, SearchField, Section, Text, useDebounced, useLocalState } from '@/ui';
import { LEVEL_BANDS, STYLE_GROUPS, bandOf, filterProgressions, inGroup, primaryGroup, styleGroup } from '../model/browse';
import { draftProgression } from '../model/builder';
import { draftFromSaved, useSavedProgressions } from '../model/saved';
import { ProgressionCard, keyName, noteName } from './shared';
import { useMusicSettings } from '@/ui/music';
import { homeKey } from '@/content/progressions';
import styles from './Progressions.module.css';

const START_HERE = ['pop-axis', 'rock-i-iv-v', 'blues-12-bar-triads', 'flamenco-andalusian'];
const SHELF = 4;

type Band = 'all' | 'beginner' | 'intermediate' | 'advanced';

/** Meta line of a card: style, level and key. */
function Meta({ p, showStyle = true }: { p: Progression; showStyle?: boolean }) {
  const { naming } = useMusicSettings();
  const parts = [showStyle ? primaryGroup(p).name : null, `Level ${p.level}`, keyName(homeKey(p, p.keys[0]), naming)].filter(Boolean);
  return <>{parts.join(' · ')}</>;
}

/** The browser. */
export function Browse() {
  const [group, setGroup] = useLocalState<string>('progressions.group', 'all');
  const [band, setBand] = useLocalState<Band>('progressions.band', 'all');
  const [query, setQuery] = useState('');
  const q = useDebounced(query, 150);
  const saved = useSavedProgressions();
  const { naming } = useMusicSettings();
  const activeGroup = styleGroup(group);
  const filtering = !!activeGroup || band !== 'all' || q.trim().length > 0;

  const results = useMemo(
    () => (filtering ? filterProgressions({ group: activeGroup?.id ?? null, band: band === 'all' ? null : band, query: q }) : []),
    [filtering, activeGroup, band, q],
  );

  const groupOptions = useMemo(
    () => [{ value: 'all', label: 'All styles' }, ...STYLE_GROUPS.map((g) => ({ value: g.id, label: g.name, icon: g.icon }))],
    [],
  );
  const bandOptions = [{ value: 'all', label: 'Any level' }, ...LEVEL_BANDS.map((b) => ({ value: b.id, label: `${b.name} ${b.min}–${b.max}` }))];

  const clear = () => {
    setGroup('all');
    setBand('all');
    setQuery('');
  };

  return (
    <Page
      title="Progressions"
      subtitle="The chord loops behind every style. Press play on a card to hear it, open it to see the chords, then jam with the band."
      actions={
        <LinkButton to="progressions" params={['builder']} variant="primary" iconLeft="Plus">
          Build your own
        </LinkButton>
      }
      data-progressions="browse"
    >
      <div className={styles.filters}>
        <div className={styles.filterRow}>
          <SearchField className={styles.search} value={query} onChange={setQuery} label="Search progressions" placeholder="Search: blues, I–V–vi–IV, Andalusian, a song…" />
        </div>
        <ChipGroup aria-label="Style" options={groupOptions} value={group} onChange={setGroup} bleed />
        <ChipGroup aria-label="Level" options={bandOptions} value={band} onChange={(v) => setBand(v as Band)} bleed />
      </div>

      {filtering ? (
        <Section
          title={activeGroup ? activeGroup.name : q ? 'Search results' : 'Progressions'}
          description={activeGroup?.blurb}
          actions={<Button variant="ghost" size="sm" iconLeft="X" onClick={clear}>Clear filters</Button>}
        >
          <Text className={styles.count} aria-live="polite">
            {results.length === 1 ? '1 progression' : `${results.length} progressions`}
          </Text>
          {results.length ? (
            <div className={styles.cards}>
              {results.map((p) => (
                <ProgressionCard key={p.id} progression={p} href={href('progressions', p.id)} meta={<Meta p={p} showStyle={!activeGroup} />} />
              ))}
            </div>
          ) : (
            <EmptyState icon="Search" title="Nothing matches yet" actions={<Button onClick={clear}>Show every progression</Button>}>
              Try a style (blues, jazz), a numeral line like I–IV–V, or a famous song.
            </EmptyState>
          )}
        </Section>
      ) : (
        <>
          {saved.length > 0 && (
            <Section title="Yours" description="Progressions you built and saved on this device." actions={<LinkButton to="progressions" params={['builder']} variant="ghost" size="sm" iconLeft="Plus">New</LinkButton>}>
              <div className={styles.cards}>
                {saved.slice(0, 6).map((s) => {
                  const p = draftProgression(draftFromSaved(s));
                  if (!p) return null;
                  return (
                    <ProgressionCard
                      key={s.id}
                      progression={p}
                      tonic={s.tonic}
                      title={s.name}
                      href={href('progressions', 'builder', s.id)}
                      meta={`${keyName({ tonic: s.tonic, tonality: s.mode }, naming)} · ${s.slots.length} chords`}
                    />
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Start here" description="Four progressions that open every door. Press play, then open one and jam.">
            <div className={styles.cards}>
              {START_HERE.map((id) => getProgression(id)).filter((p): p is Progression => !!p).map((p) => (
                <ProgressionCard key={p.id} progression={p} href={href('progressions', p.id)} meta={<Meta p={p} />} />
              ))}
            </div>
          </Section>

          {STYLE_GROUPS.map((g) => {
            const all = PROGRESSIONS.filter((p) => inGroup(p, g)).sort((a, b) => a.level - b.level);
            return (
              <Section
                key={g.id}
                title={
                  <span className={styles.groupHead}>
                    <span className={styles.groupIcon} aria-hidden="true"><Icon name={g.icon} size="sm" /></span>
                    {g.name}
                  </span>
                }
                description={g.blurb}
                actions={
                  all.length > SHELF ? (
                    <Button variant="ghost" size="sm" iconRight="ArrowRight" onClick={() => { setGroup(g.id); window.scrollTo({ top: 0 }); }} aria-label={`See all ${all.length} ${g.name} progressions`}>
                      See all {all.length}
                    </Button>
                  ) : undefined
                }
              >
                <div className={styles.cards}>
                  {all.slice(0, SHELF).map((p) => (
                    <ProgressionCard key={p.id} progression={p} href={href('progressions', p.id)} meta={`Level ${p.level} · ${bandOf(p.level).name} · ${noteName(p.keys[0], naming)}`} />
                  ))}
                </div>
              </Section>
            );
          })}
        </>
      )}

      <div className={styles.earCard}>
        <Icon name="Ear" size="lg" />
        <div className={styles.earText}>
          <Text weight="semibold">Can you hear it?</Text>
          <Text tone="muted" size="sm">Name a progression from its sound alone: the ear-training drill plays one, you pick which.</Text>
        </div>
        <LinkButton to="ear" params={['progressions']} iconRight="ArrowRight">Train your ear</LinkButton>
      </div>
    </Page>
  );
}
