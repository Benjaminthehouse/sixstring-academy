import { describe, expect, it } from 'vitest';
import { GOAL_CHOICES } from '@/app/onboarding/model';
import { DAILY_GOALS, xpFor, type PracticeSession } from '@/core/progress';
import { GOAL_CHOICES as SETTINGS_GOALS } from '@/features/profile/settings/model';
import { DURATIONS } from './planner';
import { areaSeconds, dayLabel, defaultWeeklyGoal, durationCovering, endSessionText, entryFromSession, formatDuration, groupByDay, minutesForXp, overlapSeconds, parseEntry, spokenDuration, streakNudge, type JournalEntry } from './journal';
import { advance, endSession, startSession } from './session';

const T0 = Date.UTC(2026, 10, 15, 18, 0, 0);

function entry(id: string, day: string, endedAt: number, practisedSec: number, blocks: JournalEntry['blocks'] = []): JournalEntry {
  return { id, startedAt: endedAt - practisedSec * 1000, endedAt, day, title: 'Plan', plannedSec: practisedSec, practisedSec, blocks, xp: 5, feel: null, note: '', endedEarly: false };
}

describe('journal arithmetic', () => {
  it('finds the minutes a planned session needs for the XP left', () => {
    for (let xp = 1; xp <= 45; xp++) {
      const m = minutesForXp(xp);
      expect(xpFor('practice', { durationSec: m * 60 })).toBeGreaterThanOrEqual(xp);
      if (m > 1) expect(xpFor('practice', { durationSec: (m - 1) * 60 })).toBeLessThan(xp);
    }
    expect(minutesForXp(0)).toBe(0);
    expect(minutesForXp(5)).toBe(3);
    expect(minutesForXp(50)).toBe(25);
  });

  it('meets each daily goal in the minutes the app says it takes', () => {
    // Onboarding, Settings and the progress store each say "about N minutes": a planned session of
    // N minutes earns the goal's XP (and Today and the Practice screen size their plans that way).
    const claims = [...GOAL_CHOICES.map((c) => [c.xp, c.minutes]), ...SETTINGS_GOALS.map((c) => [c.value, c.minutes]), ...DAILY_GOALS.map((g) => [g.xp, g.minutes])];
    expect(claims.length).toBe(12);
    for (const [xp, minutes] of claims) expect(minutesForXp(xp), `${xp} XP in about ${minutes} minutes`).toBe(minutes);
    expect(durationCovering(3, DURATIONS)).toBe(5);
    expect(durationCovering(12, DURATIONS)).toBe(15);
    expect(durationCovering(200, DURATIONS)).toBe(60);
  });

  it('words the streak nudge', () => {
    expect(streakNudge({ goal: 20, met: false, remaining: 5 }, { current: 4 })).toEqual({
      tone: 'streak',
      title: '3 more minutes to keep your streak today',
      text: 'A planned session earns the 5 XP left on your daily goal, and your 4-day streak carries on.',
      minutes: 3,
    });
    // The Regular goal is "about 10 minutes", and 10 minutes of planned practice do meet it.
    expect(streakNudge({ goal: 20, met: false, remaining: 20 }, { current: 0 }).title).toBe('10 minutes meets today’s goal');
    expect(streakNudge({ goal: 20, met: false, remaining: 20 }, { current: 0 }).text).toBe('A planned session earns the 20 XP your daily goal asks for, and starts a streak.');
    expect(streakNudge({ goal: 20, met: false, remaining: 18 }, { current: 0 }).text).toBe('A planned session earns the 18 XP left on your daily goal, and starts a streak.');
    expect(streakNudge({ goal: 20, met: true, remaining: 0 }, { current: 9 }).title).toBe('Your 9-day streak is safe today');
    expect(streakNudge({ goal: 20, met: true, remaining: 0 }, { current: 9 }).minutes).toBeNull();
  });

  it('suggests a weekly goal from the daily goal', () => {
    expect([10, 20, 30, 50].map(defaultWeeklyGoal)).toEqual([30, 60, 90, 150]);
  });

  it('subtracts only the overlap of other recorded activities', () => {
    const log: PracticeSession[] = [
      { id: 'a', kind: 'scale-game', title: 'Game', startedAt: T0 + 60_000, durationSec: 120, xp: 8 },
      { id: 'b', kind: 'song', title: 'Song', startedAt: T0 - 60_000, durationSec: 90, xp: 8 }, // 30 s inside
      { id: 'c', kind: 'practice', title: 'Me', startedAt: T0, durationSec: 300, xp: 8, metrics: { blocks: 3, done: 3, plannedMin: 5 } }, // a planned session: ignored
      { id: 'd', kind: 'ear', title: 'Later', startedAt: T0 + 600_000, durationSec: 60, xp: 3 }, // outside
    ];
    expect(overlapSeconds(log, [[T0, T0 + 300_000]])).toBe(150);
    expect(overlapSeconds([], [[T0, T0 + 1]])).toBe(0);
  });

  it('subtracts nothing for an activity done while the session was paused', () => {
    // Ran 0-60 s, paused 60-300 s (a scale game 100-220 s), ran again 300-360 s.
    const runs: Array<[number, number]> = [
      [T0, T0 + 60_000],
      [T0 + 300_000, T0 + 360_000],
    ];
    const game: PracticeSession = { id: 'g', kind: 'scale-game', title: 'Game', startedAt: T0 + 100_000, durationSec: 120, xp: 8 };
    expect(overlapSeconds([game], runs)).toBe(0);
    // Half inside the second stretch: only that half comes off.
    const song: PracticeSession = { id: 's', kind: 'song', title: 'Song', startedAt: T0 + 270_000, durationSec: 60, xp: 8 };
    expect(overlapSeconds([song], runs)).toBe(30);
    // Two activities that overlap each other are taken off once.
    const ear: PracticeSession = { id: 'e', kind: 'ear', title: 'Ear', startedAt: T0 + 10_000, durationSec: 40, xp: 3 };
    const fret: PracticeSession = { id: 'f', kind: 'fretboard', title: 'Neck', startedAt: T0 + 20_000, durationSec: 40, xp: 3 };
    expect(overlapSeconds([ear, fret], runs)).toBe(50);
    // A Theory Path unit drill is logged as kind `practice` too, but it is not a planned session.
    const drill: PracticeSession = { id: 'u', kind: 'practice', title: 'Practice: Intervals', startedAt: T0 + 300_000, durationSec: 30, xp: 2 };
    expect(overlapSeconds([drill], runs)).toBe(30);
  });

  it('groups entries by day, newest first, and adds up area time', () => {
    const list = [
      entry('1', '2026-11-13', T0 - 2 * 86_400_000, 600, [{ area: 'scales', title: 's', plannedSec: 300, spentSec: 300, outcome: 'done' }]),
      entry('2', '2026-11-15', T0, 300, [{ area: 'chords', title: 'c', plannedSec: 300, spentSec: 240, outcome: 'partial' }]),
      entry('3', '2026-11-15', T0 - 3_600_000, 900),
    ];
    const groups = groupByDay(list);
    expect(groups.map((g) => g.day)).toEqual(['2026-11-15', '2026-11-13']);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['2', '3']);
    expect(groups[0].minutes).toBe(20);
    expect(areaSeconds(list, '2026-11-14', '2026-11-15')).toEqual({ chords: 240 });
    expect(areaSeconds(list, '2026-11-09', '2026-11-15')).toEqual({ chords: 240, scales: 300 });
  });

  it('labels days and durations', () => {
    expect(dayLabel('2026-11-15', '2026-11-15', '2026-11-14')).toBe('Today');
    expect(dayLabel('2026-11-14', '2026-11-15', '2026-11-14')).toBe('Yesterday');
    expect(dayLabel('2026-11-09', '2026-11-15', '2026-11-14')).toBe('Mon 9 Nov');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('turns a finished session into an entry and reads entries back safely', () => {
    let s = startSession(
      [
        { id: 'a', area: 'warmup', minutes: 1, title: 'Warm', goal: 'Easy now.', target: null },
        { id: 'b', area: 'chords', minutes: 2, title: 'Changes', goal: 'G to C.', target: null, goalId: 'g1' },
      ],
      T0,
      { id: 's1', title: '3-minute plan' },
    );
    s = advance(s, T0 + 90_000).state;
    s = endSession(s, T0 + 90_000).state;
    const e = entryFromSession(s, { xp: 3, entryId: 's1' }, '2026-11-15');
    expect(e.practisedSec).toBe(90);
    expect(e.plannedSec).toBe(180);
    expect(e.blocks.map((b) => b.outcome)).toEqual(['done', 'partial']);
    expect(e.blocks[1].goalId).toBe('g1');
    expect(e.endedEarly).toBe(true);
    expect(parseEntry(JSON.parse(JSON.stringify(e)))).toEqual(e);
    expect(parseEntry({ id: 'x' })).toBeNull();
    expect(parseEntry({ ...e, feel: 9, note: 'n'.repeat(5000) })?.note.length).toBe(1000);
  });
});

describe('durations in sentences', () => {
  it('says seconds and minutes in words, not as a clock reading', () => {
    // "You have practised 0:40" reads like a time of day.
    expect(spokenDuration(40)).toBe('40 seconds');
    expect(spokenDuration(1)).toBe('1 second');
    expect(spokenDuration(60)).toBe('1 minute');
    expect(spokenDuration(250)).toBe('4 minutes and 10 seconds');
    expect(spokenDuration(Number.NaN)).toBe('0 seconds');
  });

  it('does not promise to save a session that is too short to keep', () => {
    expect(endSessionText(12)).toBe('You have practised 12 seconds. Sessions under half a minute are not saved.');
    expect(endSessionText(40)).toBe('You have practised 40 seconds. That is saved to your journal and counts toward today.');
  });
});
