/**
 * Calendar-day maths that is safe across time zones and daylight-saving changes.
 *
 * The only zone-dependent step is turning an instant (epoch ms) into a civil date. Everything
 * after that (differences, adding days, weekdays) runs on the civil date itself through UTC, so a
 * 23-hour or 25-hour day is still exactly one day.
 */
import type { DayKey } from './types';

/** Source of "now". Injected into the store so tests control time and zone. */
export interface Clock {
  /** Current time in epoch milliseconds. */
  now(): number;
  /** IANA zone for calendar-day maths (`Europe/Berlin`). Undefined uses the device's zone. */
  timeZone?: string;
}

/** The real clock in the device's time zone. */
export const systemClock: Clock = { now: () => Date.now() };

const MS_PER_DAY = 86_400_000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  let f = formatters.get(timeZone);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      // Unknown zone name: fall back to the device's zone rather than failing.
      f = null;
    }
    formatters.set(timeZone, f);
  }
  return f;
}

interface Civil {
  y: number;
  m: number;
  d: number;
  h: number;
}

function civil(ms: number, timeZone?: string): Civil {
  const f = timeZone ? formatterFor(timeZone) : null;
  if (f) {
    const out: Civil = { y: 1970, m: 1, d: 1, h: 0 };
    for (const part of f.formatToParts(ms)) {
      if (part.type === 'year') out.y = Number(part.value);
      else if (part.type === 'month') out.m = Number(part.value);
      else if (part.type === 'day') out.d = Number(part.value);
      else if (part.type === 'hour') out.h = Number(part.value) % 24;
    }
    return out;
  }
  const date = new Date(ms);
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate(), h: date.getHours() };
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

function format(y: number, m: number, d: number): DayKey {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** The local calendar day an instant falls on. */
export function dayKey(ms: number, timeZone?: string): DayKey {
  const c = civil(Number.isFinite(ms) ? ms : 0, timeZone);
  return format(c.y, c.m, c.d);
}

/** The local hour (0 to 23) of an instant. */
export function localHour(ms: number, timeZone?: string): number {
  return civil(Number.isFinite(ms) ? ms : 0, timeZone).h;
}

/** True for a well-formed day key that names a real date. */
export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string') return false;
  const match = DAY_KEY.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

/** Days since 1970-01-01 for a day key (the civil date, independent of any zone). */
export function dayNumber(key: DayKey): number {
  const match = DAY_KEY.exec(key);
  if (!match) return 0;
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / MS_PER_DAY);
}

/** Inverse of `dayNumber`. */
export function fromDayNumber(n: number): DayKey {
  const date = new Date(n * MS_PER_DAY);
  return format(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** The day `n` days after `key` (negative goes back). */
export function addDays(key: DayKey, n: number): DayKey {
  return fromDayNumber(dayNumber(key) + n);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: DayKey, to: DayKey): number {
  return dayNumber(to) - dayNumber(from);
}

/** Day of the week of a day key: 0 = Sunday ... 6 = Saturday. */
export function weekday(key: DayKey): number {
  // 1970-01-01 was a Thursday (4).
  return (((dayNumber(key) + 4) % 7) + 7) % 7;
}

/** First day of the week containing `key`. `startsOn`: 1 = Monday (default), 0 = Sunday. */
export function weekStartOf(key: DayKey, startsOn: 0 | 1 = 1): DayKey {
  const back = (weekday(key) - startsOn + 7) % 7;
  return addDays(key, -back);
}

/** Every day from `from` to `to`, both included. Empty when `to` is before `from`. */
export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const start = dayNumber(from);
  const end = dayNumber(to);
  const out: DayKey[] = [];
  for (let n = start; n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

/** The later of two day keys (ISO day keys sort as strings). */
export function maxDay(a: DayKey, b: DayKey): DayKey {
  return a >= b ? a : b;
}
