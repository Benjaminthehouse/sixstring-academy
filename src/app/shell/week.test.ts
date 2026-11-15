import { describe, expect, it } from 'vitest';
import { WEEK_DAY_TEXT, minutesText, weekDayState } from './week';

const day = { met: false, frozen: false, active: false, xp: 0, isToday: false, isFuture: false };

describe('weekDayState', () => {
  it('reads each kind of day', () => {
    expect(weekDayState({ ...day, met: true, xp: 25, active: true })).toBe('met');
    expect(weekDayState({ ...day, frozen: true })).toBe('frozen');
    expect(weekDayState({ ...day, active: true, xp: 4 })).toBe('partial');
    expect(weekDayState({ ...day, isToday: true })).toBe('today');
    expect(weekDayState(day)).toBe('missed');
    expect(weekDayState({ ...day, isFuture: true })).toBe('future');
  });
  it('lets a met goal win over everything, and some practice win over "today"', () => {
    expect(weekDayState({ ...day, met: true, frozen: true, isToday: true })).toBe('met');
    expect(weekDayState({ ...day, isToday: true, xp: 3 })).toBe('partial');
  });
  it('has words for every state', () => {
    for (const state of ['met', 'frozen', 'partial', 'today', 'missed', 'future'] as const) expect(WEEK_DAY_TEXT[state].length).toBeGreaterThan(3);
  });
});

describe('minutesText', () => {
  it('rounds up, so a heart is never promised too early', () => {
    expect(minutesText(20 * 60_000)).toBe('20 min');
    expect(minutesText(61_000)).toBe('2 min');
    expect(minutesText(1)).toBe('1 min');
    expect(minutesText(0)).toBe('under a minute');
  });
});
