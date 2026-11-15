/**
 * Small wording helpers shared by the parts of the Me area. Pure, English only, and independent
 * of the device locale so a number reads the same in a screenshot, a test and on a phone.
 */
import { dayNumber, type DayKey } from '@/core/progress';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** "1 day", "3 days". */
export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A whole number with thousands separators: 12345 -> "12,345". */
export function thousands(value: number): string {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  return (n < 0 ? '-' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Practice time in words: "0 min", "45 min", "1 h 20 min", "12 h". Seconds are rounded to minutes. */
export function durationText(seconds: number): string {
  const minutes = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Practice time as hours for a big number: "0.5", "3.2", "12" (one decimal below ten hours). */
export function hoursNumber(seconds: number): string {
  const hours = Math.max(0, Number.isFinite(seconds) ? seconds : 0) / 3600;
  if (hours >= 10) return String(Math.round(hours));
  return (Math.round(hours * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

function parts(day: DayKey): { year: number; month: number; date: number; weekday: number } {
  const utc = new Date(dayNumber(day) * 86_400_000);
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth(), date: utc.getUTCDate(), weekday: utc.getUTCDay() };
}

/** "Tue 3 Nov" for a day key. */
export function dayLabel(day: DayKey): string {
  const p = parts(day);
  return `${WEEKDAYS[p.weekday].slice(0, 3)} ${p.date} ${MONTHS[p.month].slice(0, 3)}`;
}

/** "Tuesday 3 November 2026" for a day key (for screen readers and detail lines). */
export function dayLabelLong(day: DayKey): string {
  const p = parts(day);
  return `${WEEKDAYS[p.weekday]} ${p.date} ${MONTHS[p.month]} ${p.year}`;
}

/** "Nov" for a day key. */
export function monthShort(day: DayKey): string {
  return MONTHS[parts(day).month].slice(0, 3);
}

/** "November 2026" for a day key. */
export function monthLong(day: DayKey): string {
  const p = parts(day);
  return `${MONTHS[p.month]} ${p.year}`;
}

/** `YYYY-MM` of a day key, for grouping by month. */
export function monthKey(day: DayKey): string {
  return day.slice(0, 7);
}

/** "today", "yesterday", "3 days ago", "in 2 days". */
export function relativeDay(day: DayKey, today: DayKey): string {
  const diff = dayNumber(today) - dayNumber(day);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff > 1) return `${diff} days ago`;
  return diff === -1 ? 'tomorrow' : `in ${-diff} days`;
}

/** How long ago an instant was, in words: "just now", "12 min ago", "3 h ago", "yesterday", "5 days ago", "3 Nov 2026". */
export function timeAgo(at: number, now: number): string {
  const seconds = Math.max(0, (now - at) / 1000);
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return dateText(at);
}

/** "3 Nov 2026" for an instant, in the device's time zone. */
export function dateText(at: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

/** "3 Nov 2026, 14:05" for an instant, in the device's time zone. */
export function dateTimeText(at: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return `${dateText(at)}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** A date for a file name: `2026-11-03`. */
export function fileDate(at: number): string {
  const date = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Join words as a sentence list: "a", "a and b", "a, b and c". */
export function listText(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
