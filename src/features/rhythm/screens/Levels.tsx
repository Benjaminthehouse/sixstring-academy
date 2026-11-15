import { useProgress } from '@/core/progress';
import { List, ListItem, Page, StarRating } from '@/ui';
import { READ_LEVELS } from '../core/generate';
import { BEAT_LEVELS, CLOCK_LEVELS, DRILLS, skillId, type ActivityId } from '../core/ladder';
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

/** The levels of one activity, with the stars earned on each. */
export function LevelList({ activity }: { activity: Exclude<ActivityId, 'strum'> }) {
  const skills = useProgress((s) => s.skills);
  const page = PAGES[activity];
  return (
    <Page title={page.title} subtitle={page.subtitle} back={{ to: 'rhythm', label: 'Rhythm' }} width="prose">
      <List variant="card">
        {page.rows.map((row, i) => (
          <ListItem
            key={row.key}
            leading={<span className={styles.levelNumber}>{i + 1}</span>}
            title={row.title}
            subtitle={`${row.blurb} ${row.detail}`}
            to="rhythm"
            params={[activity, row.key]}
            wrap
            trailing={<StarRating value={skills[skillId(activity, row.key)]?.stars ?? 0} size={14} />}
          />
        ))}
      </List>
    </Page>
  );
}
