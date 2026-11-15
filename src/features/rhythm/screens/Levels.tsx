import { useMemo } from 'react';
import { useProgress } from '@/core/progress';
import { Card, Heading, LinkButton, List, ListItem, Page, StarRating, Text } from '@/ui';
import { READ_LEVELS, introPhrase } from '../core/generate';
import { BEAT_LEVELS, CLOCK_LEVELS, DRILLS, skillId, type ActivityId } from '../core/ladder';
import { RhythmStaff } from '../notation/RhythmStaff';
import styles from '../ui/Rhythm.module.css';

interface Row {
  key: string;
  title: string;
  blurb: string;
  detail: string;
}

const PAGES: Record<Exclude<ActivityId, 'strum'>, { title: string; subtitle: string; rows: Row[] }> = {
  beat: {
    title: 'Feel the beat',
    subtitle: 'Tap along with a click. A moving line shows where each tap fell: early, late or on it.',
    rows: BEAT_LEVELS.map((l) => ({ key: String(l.id), title: l.title, blurb: l.blurb, detail: `${l.meter} · ${l.bpm} BPM` })),
  },
  read: {
    title: 'Read and tap',
    subtitle: 'Rhythms in standard notation with the count underneath. Each level adds one idea; every round is freshly written.',
    rows: READ_LEVELS.map((l) => ({ key: String(l.id), title: l.title, blurb: l.blurb, detail: `${l.meter} · ${l.bpm} BPM` })),
  },
  drill: {
    title: 'Drills',
    subtitle: 'Change subdivision on cue, clap between the clicks, and find beat one when the accents disappear.',
    rows: DRILLS.map((d) => ({ key: d.id, title: d.title, blurb: d.blurb, detail: d.kind === 'one' ? d.meter : `${d.bpm} BPM` })),
  },
  clock: {
    title: 'Inner clock',
    subtitle: 'The click plays, then drops out for whole bars while you keep tapping. When it comes back you see how far you drifted.',
    rows: CLOCK_LEVELS.map((l) => ({ key: String(l.id), title: l.title, blurb: l.blurb, detail: `${l.bpm} BPM` })),
  },
};

/** The levels of one activity, with the stars earned on each and the one to play next. */
export function LevelList({ activity }: { activity: Exclude<ActivityId, 'strum'> }) {
  const skills = useProgress((s) => s.skills);
  const page = PAGES[activity];
  const starsOf = (key: string) => skills[skillId(activity, key)]?.stars ?? 0;
  const nextIndex = Math.max(0, page.rows.findIndex((row) => starsOf(row.key) < 1));
  const allDone = page.rows.every((row) => starsOf(row.key) >= 1);
  const next = page.rows[nextIndex];
  const preview = useMemo(() => (activity === 'read' ? introPhrase(READ_LEVELS[nextIndex]) : null), [activity, nextIndex]);
  const started = page.rows.some((row) => starsOf(row.key) >= 1);

  return (
    <Page title={page.title} subtitle={page.subtitle} back={{ to: 'rhythm', label: 'Rhythm' }}>
      <div className={styles.levels}>
        <Card variant="raised" padding="lg" className={styles.levelNext} data-level-next={next.key}>
          <Text variant="eyebrow">{allDone ? 'Every level has a star' : started ? 'Next up' : 'Start here'}</Text>
          <Heading level={2} size="lg">
            {nextIndex + 1}. {next.title}
          </Heading>
          <Text tone="muted">{next.blurb}</Text>
          {preview && (
            <div className={styles.levelPreview}>
              <RhythmStaff rhythm={preview} counts maxScale={9} />
            </div>
          )}
          <LinkButton variant="primary" size="lg" fullWidth to="rhythm" params={[activity, next.key]} iconRight="ArrowRight">
            {allDone ? 'Play it again' : `Start level ${nextIndex + 1}`}
          </LinkButton>
        </Card>
        <List variant="card" className={styles.levelList}>
          {page.rows.map((row, i) => (
            <ListItem
              key={row.key}
              leading={<span className={styles.levelNumber}>{i + 1}</span>}
              title={row.title}
              subtitle={`${row.blurb} ${row.detail}`}
              to="rhythm"
              params={[activity, row.key]}
              wrap
              selected={i === nextIndex && !allDone}
              trailing={<StarRating value={starsOf(row.key)} size={14} />}
            />
          ))}
        </List>
      </div>
    </Page>
  );
}
