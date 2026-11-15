/**
 * How one day of the week strip reads, decided in one place so the mark, its colour and its
 * spoken description never disagree.
 */
import type { WeekDayView } from '@/core/progress';

/** The states a day can show. */
export type WeekDayState = 'met' | 'frozen' | 'partial' | 'today' | 'missed' | 'future';

/** The state of a day: a met goal beats a freeze, which beats "some practice". */
export function weekDayState(day: Pick<WeekDayView, 'met' | 'frozen' | 'active' | 'xp' | 'isToday' | 'isFuture'>): WeekDayState {
  if (day.met) return 'met';
  if (day.frozen) return 'frozen';
  if (day.isFuture) return 'future';
  if (day.active || day.xp > 0) return 'partial';
  return day.isToday ? 'today' : 'missed';
}

/** What a screen reader says for each state. */
export const WEEK_DAY_TEXT: Readonly<Record<WeekDayState, string>> = {
  met: 'goal met',
  frozen: 'covered by a streak freeze',
  partial: 'some practice',
  today: 'today, nothing yet',
  missed: 'no practice',
  future: 'still to come',
};

/** "12 min", "1 min", "under a minute": a wait, rounded up so it never promises too soon. */
export function minutesText(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 0) return 'under a minute';
  return `${minutes} min`;
}
