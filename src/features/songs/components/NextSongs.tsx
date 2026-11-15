/**
 * "Good next songs for you": the three songs that fit the learner now, each a card that opens the
 * Player, with the reason it was picked and a thumbnail of how it starts.
 */
import { useRef } from 'react';
import { href } from '@/app/router';
import { Icon, Skeleton, cx } from '@/ui';
import { useSongSummary, type Recommendation } from '@/core/library';
import { useSongActions } from '../actions';
import { featureItems, lengthLabel } from '../format';
import { useSeen } from '../hooks';
import { MiniTab } from './MiniTab';
import styles from './NextSongs.module.css';

const FIT_ICON = { easy: 'Feather', right: 'Target', stretch: 'TrendingUp', hard: 'Mountain' } as const;

function NextCard({ rec, previewed }: { rec: Recommendation; previewed: boolean }) {
  const actions = useSongActions();
  const ref = useRef<HTMLAnchorElement | null>(null);
  const seen = useSeen(ref);
  const { summary } = useSongSummary(rec.listing, seen);
  const s = rec.listing;
  const length = summary ? lengthLabel(summary.seconds) : null;
  return (
    <a
      ref={ref}
      href={href('play', s.id)}
      className={cx(styles.card, previewed && styles.previewed)}
      onMouseEnter={() => actions.hover(s, 'pointer')}
      onFocus={() => actions.hover(s, 'focus')}
      data-next-song={s.id}
    >
      <span className={styles.reason}>
        <Icon name={FIT_ICON[rec.fit]} size="xs" />
        {rec.reason}
      </span>
      <span className={styles.title}>{s.title}</span>
      <span className={styles.by}>{[s.composer, `Level ${s.level}`].filter(Boolean).join(' · ')}</span>
      <span className={styles.thumb}>{summary ? <MiniTab thumb={summary.thumb} /> : <Skeleton variant="block" height="3.25rem" />}</span>
      <span className={styles.foot}>
        {length && (
          <span className={styles.item}>
            <Icon name="Clock" size="xs" />
            <span aria-hidden="true">{length.short}</span>
            <span className="sr-only">{length.spoken}</span>
          </span>
        )}
        {featureItems(summary).map((f) => (
          <span key={f.key} className={styles.item}>
            <Icon name={f.icon} size="xs" />
            {f.label}
          </span>
        ))}
        <span className={styles.go} aria-hidden="true">
          <Icon name="Play" size="sm" />
        </span>
      </span>
    </a>
  );
}

/** The suggestions strip: swipeable on phones, three columns on wide screens. */
export function NextSongs({ picks, previewId }: { picks: Recommendation[]; previewId?: string | null }) {
  if (!picks.length) return null;
  return (
    <ul className={styles.strip} aria-label="Good next songs for you">
      {picks.map((rec) => (
        <li key={rec.listing.id} className={styles.cell}>
          <NextCard rec={rec} previewed={previewId === rec.listing.id} />
        </li>
      ))}
    </ul>
  );
}
