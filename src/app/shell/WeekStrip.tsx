import type { WeekDayView } from '@/core/progress';
import { Icon, cx } from '@/ui';
import styles from './Stats.module.css';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

type DayState = 'met' | 'frozen' | 'partial' | 'today' | 'missed' | 'future';

/** How one day of the week reads. Exported for tests. */
export function weekDayState(day: Pick<WeekDayView, 'met' | 'frozen' | 'active' | 'xp' | 'isToday' | 'isFuture'>): DayState {
  if (day.met) return 'met';
  if (day.frozen) return 'frozen';
  if (day.isFuture) return 'future';
  if (day.active || day.xp > 0) return 'partial';
  return day.isToday ? 'today' : 'missed';
}

const STATE_TEXT: Record<DayState, string> = {
  met: 'goal met',
  frozen: 'covered by a streak freeze',
  partial: 'some practice',
  today: 'today, nothing yet',
  missed: 'no practice',
  future: 'still to come',
};

/** Props for `<WeekStrip>`. */
export interface WeekStripProps {
  /** The seven days from `useWeek()`. */
  days: readonly WeekDayView[];
  /** sm for the top-bar sheet and tight spots, md for Today. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * This week at a glance: one mark per day. A met goal shows a check, a frozen day a snowflake,
 * a day with some practice a dot; today is ringed. Each mark is also described in words.
 */
export function WeekStrip({ days, size = 'md', className }: WeekStripProps) {
  return (
    <ol className={cx(styles.week, size === 'sm' && styles.weekSm, className)} aria-label="This week">
      {days.map((day) => {
        const state = weekDayState(day);
        return (
          <li key={day.day} className={cx(styles.day, styles[`day-${state}`], day.isToday && styles.dayToday)}>
            <span className={styles.dayMark} aria-hidden="true">
              {state === 'met' && <Icon name="Check" size={size === 'sm' ? 12 : 14} strokeWidth={3} />}
              {state === 'frozen' && <Icon name="Snowflake" size={size === 'sm' ? 12 : 14} strokeWidth={2.25} />}
              {state === 'partial' && <span className={styles.dayDot} />}
            </span>
            <span className={styles.dayLabel} aria-hidden="true">
              {day.label.slice(0, 2)}
            </span>
            <span className="sr-only">
              {DAY_NAMES[day.weekday] ?? day.label}: {STATE_TEXT[state]}
              {day.xp > 0 ? `, ${day.xp} XP` : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
