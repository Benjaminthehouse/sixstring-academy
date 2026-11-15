/**
 * One song in the list: a link that opens the Player (one tap), with the title, who wrote it,
 * level, length, what it has (tab, chords, lyrics) and a thumbnail of its first bars; beside the
 * link (not inside it) a "More" menu. Hover or focus previews it in the pane on wide screens.
 */
import { memo, useId, useRef } from 'react';
import { href } from '@/app/router';
import { Icon, IconButton, Menu, StarRating, Skeleton, cx } from '@/ui';
import { useSongSummary, type SongListing } from '@/core/library';
import { songMenuItems, useSongActions } from '../actions';
import { bandLabel, featureItems, lengthLabel } from '../format';
import { useSeen, useSongSkill } from '../hooks';
import { MiniTab } from './MiniTab';
import styles from './SongRow.module.css';

/** Props of `SongRow`. */
export interface SongRowProps {
  listing: SongListing;
  /** Shown in the preview pane (wide screens). */
  previewed?: boolean;
  /** Briefly marked after arriving from a link (`#songs--<id>`) or an import. */
  flash?: boolean;
  /** Why it is suggested ("Right at your level"), when sorted for the learner. */
  reason?: string;
  /** Mark the learner's own songs (off in the "My songs" view, where every song is theirs). */
  showMine?: boolean;
}

/** A row of the song list. */
export const SongRow = memo(function SongRow({ listing, previewed, flash, reason, showMine = true }: SongRowProps) {
  const actions = useSongActions();
  const uid = useId();
  const ref = useRef<HTMLLIElement | null>(null);
  const seen = useSeen(ref);
  const { summary } = useSongSummary(listing, seen);
  const skill = useSongSkill(listing.id);
  const fav = actions.isFavourite(listing.id);
  const length = summary ? lengthLabel(summary.seconds) : null;
  const features = featureItems(summary);
  const by = [listing.composer, listing.key].filter(Boolean).join(' · ');

  return (
    <li ref={ref} className={cx(styles.row, previewed && styles.previewed, flash && styles.flash)} data-song-row={listing.id}>
      <a
        className={styles.link}
        href={href('play', listing.id)}
        onMouseEnter={() => actions.hover(listing, 'pointer')}
        onFocus={() => actions.hover(listing, 'focus')}
        aria-labelledby={`${uid}-t`}
        aria-describedby={`${uid}-by ${uid}-m`}
      >
        <span className={styles.thumb}>{summary ? <MiniTab thumb={summary.thumb} /> : <Skeleton variant="block" height="3.25rem" />}</span>
        <span className={styles.main}>
          <span className={styles.titleLine}>
            <span className={styles.title} id={`${uid}-t`}>
              {listing.title}
            </span>
            {fav && <Icon name="Heart" size="xs" className={styles.fav} label="Favourite" />}
          </span>
          <span className={styles.by} id={`${uid}-by`}>
            {by || (listing.source === 'mine' ? 'Your song' : '')}
          </span>
          <span className={styles.meta} id={`${uid}-m`}>
            <span className={cx(styles.level, styles[`band-${bandLabel(listing.level).toLowerCase()}`])}>
              Level {listing.level}
              <span className="sr-only"> of 10, {bandLabel(listing.level)}</span>
            </span>
            {length && (
              <span className={styles.item}>
                <Icon name="Clock" size="xs" />
                <span aria-hidden="true">{length.short}</span>
                <span className="sr-only">{length.spoken}</span>
              </span>
            )}
            {features.map((f) => (
              <span key={f.key} className={styles.item}>
                <Icon name={f.icon} size="xs" />
                {f.label}
              </span>
            ))}
            {showMine && listing.source === 'mine' && <span className={styles.mine}>Mine</span>}
            {skill && skill.stars > 0 && <StarRating value={skill.stars} size={14} label={`${skill.stars} of 3 stars`} />}
          </span>
          {reason && <span className={styles.reason}>{reason}</span>}
        </span>
      </a>
      <div className={styles.more}>
        <Menu trigger={<IconButton icon="EllipsisVertical" label={`More for ${listing.title}`} />} items={songMenuItems(listing, actions, { withDetails: true, withFavourite: true })} />
      </div>
    </li>
  );
});
