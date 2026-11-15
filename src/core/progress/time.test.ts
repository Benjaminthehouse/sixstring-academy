import { describe, expect, it } from 'vitest';
import { addDays, dayKey, dayNumber, dayRange, diffDays, fromDayNumber, isDayKey, localHour, weekStartOf, weekday } from './time';
import { at } from './testkit';

describe('dayKey', () => {
  it('uses the calendar of the given zone, not UTC', () => {
    const instant = at('2026-03-01T23:30:00Z');
    expect(dayKey(instant, 'UTC')).toBe('2026-03-01');
    expect(dayKey(instant, 'Europe/Berlin')).toBe('2026-03-02'); // 00:30 next day
    expect(dayKey(instant, 'America/Los_Angeles')).toBe('2026-03-01'); // 15:30 same day
    expect(dayKey(instant, 'Pacific/Kiritimati')).toBe('2026-03-02'); // UTC+14
    expect(dayKey(instant, 'Pacific/Pago_Pago')).toBe('2026-03-01'); // UTC-11
  });

  it('handles zones with unusual offsets', () => {
    // Kathmandu is UTC+5:45: 18:14Z is 23:59, 18:15Z is midnight.
    expect(dayKey(at('2026-06-10T18:14:00Z'), 'Asia/Kathmandu')).toBe('2026-06-10');
    expect(dayKey(at('2026-06-10T18:15:00Z'), 'Asia/Kathmandu')).toBe('2026-06-11');
  });

  it('gives one key per local day across a spring-forward change (23-hour day)', () => {
    // Berlin: 2026-03-29 has 23 hours (02:00 -> 03:00).
    const zone = 'Europe/Berlin';
    expect(dayKey(at('2026-03-28T23:00:00Z'), zone)).toBe('2026-03-29'); // 00:00 CET
    expect(dayKey(at('2026-03-29T21:59:59Z'), zone)).toBe('2026-03-29'); // 23:59:59 CEST
    expect(dayKey(at('2026-03-29T22:00:00Z'), zone)).toBe('2026-03-30'); // 00:00 CEST
  });

  it('gives one key per local day across a fall-back change (25-hour day)', () => {
    // New York: 2026-11-01 has 25 hours.
    const zone = 'America/New_York';
    expect(dayKey(at('2026-11-01T04:00:00Z'), zone)).toBe('2026-11-01'); // 00:00 EDT
    expect(dayKey(at('2026-11-02T04:59:59Z'), zone)).toBe('2026-11-01'); // 23:59:59 EST
    expect(dayKey(at('2026-11-02T05:00:00Z'), zone)).toBe('2026-11-02');
  });

  it('falls back to the device zone for an unknown zone name instead of throwing', () => {
    expect(isDayKey(dayKey(at('2026-03-01T12:00:00Z'), 'Not/AZone'))).toBe(true);
    expect(isDayKey(dayKey(Number.NaN, 'UTC'))).toBe(true);
  });

  it('pads years and months', () => {
    expect(dayKey(at('2026-01-05T12:00:00Z'), 'UTC')).toBe('2026-01-05');
  });
});

describe('localHour', () => {
  it('is the hour on the wall clock of the zone', () => {
    const instant = at('2026-07-01T21:15:00Z');
    expect(localHour(instant, 'UTC')).toBe(21);
    expect(localHour(instant, 'Europe/Berlin')).toBe(23);
    expect(localHour(instant, 'Asia/Tokyo')).toBe(6);
    expect(localHour(at('2026-07-01T00:00:00Z'), 'UTC')).toBe(0); // midnight is 0, never 24
  });
});

describe('day arithmetic', () => {
  it('adds and subtracts days across months, years and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-10', 0)).toBe('2026-03-10');
  });

  it('counts whole days regardless of daylight saving', () => {
    // These spans cross DST changes in most zones; civil-date maths does not care.
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365);
    expect(diffDays('2028-01-01', '2029-01-01')).toBe(366);
    expect(diffDays('2026-03-30', '2026-03-28')).toBe(-2);
  });

  it('round-trips day numbers', () => {
    for (const key of ['1970-01-01', '1999-12-31', '2026-03-29', '2028-02-29', '2040-07-04']) {
      expect(fromDayNumber(dayNumber(key))).toBe(key);
    }
    expect(dayNumber('1970-01-01')).toBe(0);
  });

  it('knows weekdays', () => {
    expect(weekday('2026-03-01')).toBe(0); // a Sunday
    expect(weekday('2026-03-02')).toBe(1);
    expect(weekday('2026-03-07')).toBe(6);
    expect(weekday('1970-01-01')).toBe(4); // a Thursday
  });

  it('finds the start of the week for Monday and Sunday weeks', () => {
    expect(weekStartOf('2026-03-04', 1)).toBe('2026-03-02'); // Wednesday -> Monday
    expect(weekStartOf('2026-03-02', 1)).toBe('2026-03-02');
    expect(weekStartOf('2026-03-01', 1)).toBe('2026-02-23'); // Sunday belongs to the week before
    expect(weekStartOf('2026-03-04', 0)).toBe('2026-03-01');
    expect(weekStartOf('2026-03-01', 0)).toBe('2026-03-01');
  });

  it('lists ranges inclusively', () => {
    expect(dayRange('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(dayRange('2026-03-02', '2026-03-01')).toEqual([]);
  });
});

describe('isDayKey', () => {
  it('accepts real dates only', () => {
    expect(isDayKey('2026-03-01')).toBe(true);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('2026-3-1')).toBe(false);
    expect(isDayKey('yesterday')).toBe(false);
    expect(isDayKey(20260301)).toBe(false);
    expect(isDayKey(null)).toBe(false);
  });
});
