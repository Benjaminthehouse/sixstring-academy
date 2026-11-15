import { describe, expect, it } from 'vitest';
import { greetingFor, greetingLine, standingLine, timeAgo } from './greeting';

describe('greeting', () => {
  it('follows the clock', () => {
    expect(greetingFor(5)).toBe('Good morning');
    expect(greetingFor(11)).toBe('Good morning');
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(17)).toBe('Good afternoon');
    expect(greetingFor(18)).toBe('Good evening');
    expect(greetingFor(2)).toBe('Good evening');
  });
  it('uses the name when there is one', () => {
    expect(greetingLine(9, ' Sam ')).toBe('Good morning, Sam');
    expect(greetingLine(9, '')).toBe('Good morning');
  });
});

describe('standingLine', () => {
  const base = { xp: 0, goal: 20, met: false, remaining: 20, streak: 0, planLeft: 4, goalMinutes: 10 };
  it('invites a brand-new learner in without pressure', () => {
    expect(standingLine(base)).toBe('About 10 minutes is all today needs. Start with the first step below.');
  });
  it('mentions the streak that is waiting', () => {
    expect(standingLine({ ...base, streak: 3 })).toContain('Day 4');
  });
  it('counts down once the day has started', () => {
    expect(standingLine({ ...base, xp: 12, remaining: 8 })).toContain('8 XP to go');
  });
  it('lets go once the goal is met', () => {
    expect(standingLine({ ...base, xp: 25, met: true, remaining: 0 })).toContain('bonus');
    expect(standingLine({ ...base, xp: 25, met: true, remaining: 0, planLeft: 0 })).toContain('plan finished');
  });
});

describe('timeAgo', () => {
  const now = 1_000_000_000_000;
  const minute = 60_000;
  it('reads naturally at every distance', () => {
    expect(timeAgo(now - 20_000, now)).toBe('just now');
    expect(timeAgo(now - 12 * minute, now)).toBe('12 min ago');
    expect(timeAgo(now - 3 * 60 * minute, now)).toBe('3 h ago');
    expect(timeAgo(now - 26 * 60 * minute, now)).toBe('yesterday');
    expect(timeAgo(now - 4 * 24 * 60 * minute, now)).toBe('4 days ago');
    expect(timeAgo(now - 70 * 24 * 60 * minute, now)).toBe('2 months ago');
  });
  it('never goes negative when clocks disagree', () => {
    expect(timeAgo(now + 5000, now)).toBe('just now');
  });
});
