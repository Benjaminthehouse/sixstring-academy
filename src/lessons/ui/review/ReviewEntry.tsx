/**
 * A compact "cards due" card any screen can drop in: "12 cards due · Review now". It counts the
 * due fact cards of the given courses (spaced repetition in `@/core/progress`) and starts a
 * review session through `onStart`. With nothing due it says when to come back, quietly.
 */
import { useMemo } from 'react';
import { Button, Icon, Text, cx } from '@/ui';
import { useProgress } from '@/core/progress';
import { DEFAULT_REVIEW_SIZE, FACT_CARD_KIND } from '../../session';
import { dueFactCards } from '../../start';
import type { Course } from '../../types';
import styles from './ReviewEntry.module.css';

/** Props of {@link ReviewEntry}. */
export interface ReviewEntryProps {
  /** The courses whose fact cards count. */
  courses: readonly Course[];
  /** Start the review (build it with `reviewSource(courses, progress, now)`). */
  onStart: () => void;
  /** Render nothing when no card is due (default false: a quiet "all caught up" line). */
  hideWhenEmpty?: boolean;
  className?: string;
}

/** A small card that leads into today's review. */
export function ReviewEntry({ courses, onStart, hideWhenEmpty, className }: ReviewEntryProps) {
  const progress = useProgress((s) => s);
  const due = useMemo(() => dueFactCards(courses, progress, Date.now()), [courses, progress]);
  const known = useMemo(() => Object.values(progress.srs.items).filter((i) => i.kind === FACT_CARD_KIND).length, [progress]);
  const count = due.length;
  if (count === 0 && (hideWhenEmpty || known === 0)) return null;
  const session = Math.min(count, DEFAULT_REVIEW_SIZE);
  const minutes = Math.max(1, Math.round((session * 12) / 60));
  return (
    <div className={cx(styles.card, count === 0 && styles.quiet, className)} data-review-entry={count}>
      <span className={styles.icon} aria-hidden="true">
        <Icon name={count > 0 ? 'Layers' : 'CircleCheck'} size="md" />
      </span>
      <div className={styles.text}>
        <Text weight="semibold">{count > 0 ? `${count} ${count === 1 ? 'card' : 'cards'} due` : 'All caught up'}</Text>
        <Text variant="caption" tone="muted">
          {count > 0 ? `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}. Reviews keep what you learned fresh${count > DEFAULT_REVIEW_SIZE ? `; ${DEFAULT_REVIEW_SIZE} at a time` : ''}.` : 'Every card is up to date. New ones arrive as you finish lessons.'}
        </Text>
      </div>
      {count > 0 && (
        <Button variant="primary" iconLeft="RotateCcw" onClick={onStart} className={styles.button} data-review-start="">
          Review now
        </Button>
      )}
    </div>
  );
}
