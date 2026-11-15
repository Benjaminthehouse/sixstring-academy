import { describe, expect, it } from 'vitest';
import { dateText, dateTimeText, dayLabel, dayLabelLong, durationText, fileDate, hoursNumber, listText, monthKey, monthLong, monthShort, plural, relativeDay, thousands, timeAgo } from './format';

describe('wording helpers', () => {
  it('counts things', () => {
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(0, 'day')).toBe('0 days');
    expect(plural(3, 'more gem')).toBe('3 more gems');
    expect(plural(2, 'XP', 'XP')).toBe('2 XP');
  });

  it('groups thousands without depending on the locale', () => {
    expect(thousands(0)).toBe('0');
    expect(thousands(999)).toBe('999');
    expect(thousands(4166)).toBe('4,166');
    expect(thousands(1234567)).toBe('1,234,567');
    expect(thousands(-1500)).toBe('-1,500');
    expect(thousands(Number.NaN)).toBe('0');
  });

  it('writes practice time in minutes and hours', () => {
    expect(durationText(0)).toBe('0 min');
    expect(durationText(29)).toBe('0 min');
    expect(durationText(30)).toBe('1 min');
    expect(durationText(45 * 60)).toBe('45 min');
    expect(durationText(3600)).toBe('1 h');
    expect(durationText(80 * 60)).toBe('1 h 20 min');
    expect(durationText(-5)).toBe('0 min');
    expect(durationText(Number.NaN)).toBe('0 min');
  });

  it('writes hours as a headline number', () => {
    expect(hoursNumber(0)).toBe('0');
    expect(hoursNumber(1800)).toBe('0.5');
    expect(hoursNumber(3600 * 3.24)).toBe('3.2');
    expect(hoursNumber(3600 * 23.4)).toBe('23');
  });

  it('names days and months from a day key, whatever the time zone', () => {
    expect(dayLabel('2026-11-03')).toBe('Tue 3 Nov');
    expect(dayLabelLong('2026-11-15')).toBe('Sunday 15 November 2026');
    expect(dayLabel('2024-02-29')).toBe('Thu 29 Feb');
    expect(monthShort('2026-01-31')).toBe('Jan');
    expect(monthLong('2026-12-01')).toBe('December 2026');
    expect(monthKey('2026-12-01')).toBe('2026-12');
  });

  it('says how long ago a day was', () => {
    expect(relativeDay('2026-11-15', '2026-11-15')).toBe('today');
    expect(relativeDay('2026-11-14', '2026-11-15')).toBe('yesterday');
    expect(relativeDay('2026-11-01', '2026-11-15')).toBe('14 days ago');
    expect(relativeDay('2026-11-16', '2026-11-15')).toBe('tomorrow');
    expect(relativeDay('2026-11-18', '2026-11-15')).toBe('in 3 days');
  });

  it('says how long ago an instant was', () => {
    const now = new Date(2026, 10, 15, 12, 0, 0).getTime();
    expect(timeAgo(now - 20_000, now)).toBe('just now');
    expect(timeAgo(now - 12 * 60_000, now)).toBe('12 min ago');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(timeAgo(now - 26 * 3_600_000, now)).toBe('yesterday');
    expect(timeAgo(now - 5 * 86_400_000, now)).toBe('5 days ago');
    expect(timeAgo(new Date(2026, 6, 20, 9).getTime(), now)).toBe('20 Jul 2026');
    // A clock that jumped never yields a negative age.
    expect(timeAgo(now + 60_000, now)).toBe('just now');
  });

  it('writes dates for the screen and for a file name', () => {
    const at = new Date(2026, 10, 3, 14, 5).getTime();
    expect(dateText(at)).toBe('3 Nov 2026');
    expect(dateTimeText(at)).toBe('3 Nov 2026, 14:05');
    expect(fileDate(at)).toBe('2026-11-03');
    expect(dateText(Number.NaN)).toBe('');
  });

  it('joins a list as a sentence would', () => {
    expect(listText([])).toBe('');
    expect(listText(['a'])).toBe('a');
    expect(listText(['a', 'b'])).toBe('a and b');
    expect(listText(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
