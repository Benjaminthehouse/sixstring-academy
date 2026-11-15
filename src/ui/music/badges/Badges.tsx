/**
 * Small inline pieces: a note name chip, an interval chip, the degree-colour legend, and a tuning
 * label. All note text follows the naming setting; every colour comes with its text.
 *
 *   <NoteBadge note="F#" degree="3" />          <IntervalBadge interval="m3" long />
 *   <DegreeLegend degrees={['1', 'b3', '4', '5', 'b7']} />      <TuningLabel tuning="drop-d" capo={2} />
 */
import { memo } from 'react';
import { tuning as resolveTuning, type TuningInput } from '@/core/guitar';
import { degreeToInterval, intervalToDegree, isDegree, parseInterval } from '@/core/theory';
import { cx } from '@/ui';
import { degreeColor, degreeText, intervalLongName, intervalText, noteText } from '../format';
import { useMusicSettings } from '../settings';
import tone from '../tone.module.css';
import type { MusicColor, NoteNaming } from '../types';
import styles from './Badges.module.css';

/** Chip sizes. */
export type BadgeSize = 'sm' | 'md' | 'lg';

/** Props of `<NoteBadge>`. */
export interface NoteBadgeProps {
  /** Spelled note, with or without octave: `F#`, `Bb3`. */
  note: string;
  /** Show the octave when the note has one (default false). */
  octave?: boolean;
  /** Colour by this degree (`b3`) and show it beside the name. */
  degree?: string;
  /** Show the degree text too (default true when `degree` is given). */
  showDegree?: boolean;
  /** Colour name; default: the degree's colour, else neutral. */
  color?: MusicColor;
  size?: BadgeSize;
  naming?: NoteNaming;
  className?: string;
}

/** A note name in a coloured chip. */
export const NoteBadge = memo(function NoteBadge({ note, octave = false, degree, showDegree, color, size = 'md', naming, className }: NoteBadgeProps) {
  const settings = useMusicSettings();
  const c = color ?? (degree ? degreeColor(degree) : 'neutral');
  const name = noteText(note, naming ?? settings.naming, { octave });
  const withDegree = degree && (showDegree ?? true);
  return (
    <span className={cx(tone.tone, styles.badge, className)} data-c={c} data-size={size}>
      <span className={styles.main}>{name}</span>
      {withDegree && <span className={styles.sub}>{degreeText(degree, { root: '1' })}</span>}
    </span>
  );
});

/** Props of `<IntervalBadge>`. */
export interface IntervalBadgeProps {
  /** Interval name: `m3`, `P5`, `-M2`, `M9`. */
  interval: string;
  /** Also write it out: "minor third". */
  long?: boolean;
  /** Colour name; default the colour of the degree the interval reaches. */
  color?: MusicColor;
  size?: BadgeSize;
  className?: string;
}

/** An interval in a chip, coloured by the degree it reaches, with its full name for screen readers. */
export const IntervalBadge = memo(function IntervalBadge({ interval, long = false, color, size = 'md', className }: IntervalBadgeProps) {
  const parsed = parseInterval(interval);
  let c: MusicColor = color ?? 'neutral';
  if (!color && parsed) {
    try {
      c = degreeColor(intervalToDegree(interval.replace(/^-/, '')));
    } catch {
      c = 'neutral';
    }
  }
  const longName = intervalLongName(interval);
  return (
    <span className={cx(tone.tone, styles.badge, className)} data-c={c} data-size={size} aria-label={longName !== interval ? `${interval}, ${longName}` : undefined}>
      <span className={styles.main} aria-hidden={longName !== interval || undefined}>
        {intervalText(interval)}
      </span>
      {long && longName !== interval && (
        <span className={styles.sub} aria-hidden="true">
          {longName}
        </span>
      )}
    </span>
  );
});

/** Props of `<DegreeLegend>`. */
export interface DegreeLegendProps {
  /** The degrees to explain (default the seven of the major scale). */
  degrees?: readonly string[];
  /** Heading above the legend (default "Colours show each note's job"); `null` for none. */
  title?: string | null;
  /** One line of chips without words (for a corner of a game screen). */
  compact?: boolean;
  className?: string;
}

/** What one degree is called: `b3` -> "minor third", `1` -> "root". */
export function degreeName(degree: string): string {
  if (degree === '1') return 'root';
  if (!isDegree(degree)) return degree;
  try {
    return intervalLongName(degreeToInterval(degree)).replace(/^perfect /, '');
  } catch {
    return degree;
  }
}

/** Explains the degree colours: the dot, its label, and what that degree is. */
export const DegreeLegend = memo(function DegreeLegend({ degrees = ['1', '2', '3', '4', '5', '6', '7'], title = "Colours show each note's job", compact = false, className }: DegreeLegendProps) {
  return (
    <figure className={cx(styles.legend, compact && styles.compact, className)}>
      {title && !compact && <figcaption className={styles.legendTitle}>{title}</figcaption>}
      <ul className={styles.legendList}>
        {degrees.map((d) => (
          <li key={d} className={styles.legendItem}>
            <span className={cx(tone.tone, styles.legendDot)} data-c={degreeColor(d)} aria-hidden="true">
              {degreeText(d)}
            </span>
            <span className={compact ? styles.srOnly : styles.legendText}>
              {compact ? `${degreeText(d)}: ${degreeName(d)}` : degreeName(d)}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
});

/** Props of `<TuningLabel>`. */
export interface TuningLabelProps {
  tuning?: TuningInput;
  /** A capo fret to mention. */
  capo?: number;
  /** Show the tuning's name before its notes (default true). */
  showName?: boolean;
  /** Notes from the high string down instead of low to high (default false: E A D G B E). */
  highFirst?: boolean;
  naming?: NoteNaming;
  className?: string;
}

/** A tuning in one line: "Drop D · D A D G B E · capo 2". */
export const TuningLabel = memo(function TuningLabel({ tuning, capo = 0, showName = true, highFirst = false, naming, className }: TuningLabelProps) {
  const settings = useMusicSettings();
  const t = resolveTuning(tuning);
  const notes = t.notes.map((n) => noteText(n, naming ?? settings.naming));
  const shown = highFirst ? [...notes].reverse() : notes;
  return (
    <span className={cx(styles.tuning, className)}>
      {showName && <span className={styles.tuningName}>{t.name}</span>}
      <span className={styles.tuningNotes} aria-label={`strings ${highFirst ? 'high to low' : 'low to high'}: ${shown.join(' ')}`}>
        {shown.map((n, i) => (
          <span key={i} className={styles.tuningNote}>
            {n}
          </span>
        ))}
      </span>
      {capo > 0 && <span className={styles.capo}>capo {capo}</span>}
    </span>
  );
});
