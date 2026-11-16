import { describe, expect, it } from 'vitest';
import {
  MAX_NAME_LENGTH,
  calendarDaysBetween,
  cleanLabel,
  cleanName,
  comparisonFor,
  extensionFor,
  formatDuration,
  formatTakeDate,
  matchGains,
  nameFromLabel,
  newTakeId,
  nextTakeName,
  pickMimeType,
  relativeAge,
  sanitizeTake,
  sanitizeTakes,
  sortTakes,
  spokenDuration,
  takeFileName,
  totalBytes,
  type Take,
} from './takes';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 16, 15, 30).getTime(); // Monday 16 Nov 2026, 15:30 local

function take(patch: Partial<Take> & { id: string }): Take {
  return { name: 'Take', label: null, createdAt: NOW, durationMs: 30_000, mimeType: 'audio/webm;codecs=opus', bytes: 1000, peaks: [], bpm: null, ...patch };
}

describe('names', () => {
  it('turns an address label into a name', () => {
    expect(nameFromLabel('week-1-first-section')).toBe('Week 1 first section');
    expect(nameFromLabel('blues-in-a')).toBe('Blues in A');
    expect(nameFromLabel('a-minor-pentatonic')).toBe('A minor pentatonic');
    expect(nameFromLabel('play-a-scale')).toBe('Play a scale');
    expect(nameFromLabel('strum-in-g-and-c')).toBe('Strum in G and C');
    expect(nameFromLabel('pick-near-the-bridge')).toBe('Pick near the bridge');
  });

  it('cleans what the learner types and what the address carries', () => {
    expect(cleanName('  My   best\ttake  ')).toBe('My best take');
    expect(cleanName('x'.repeat(200))).toHaveLength(MAX_NAME_LENGTH);
    expect(cleanLabel('Week 1!  first')).toBe('week-1-first');
    expect(cleanLabel('--')).toBeNull();
    expect(cleanLabel(undefined)).toBeNull();
  });

  it('numbers takes without a label from the highest in use', () => {
    expect(nextTakeName([], null)).toBe('Take 1');
    expect(nextTakeName([{ name: 'Take 1' }, { name: 'Take 4' }, { name: 'Something else' }], null)).toBe('Take 5');
  });

  it('names the first take of a task after it, then numbers the rest', () => {
    expect(nextTakeName([{ name: 'Take 2' }], 'week-1')).toBe('Week 1');
    expect(nextTakeName([{ name: 'Week 1' }], 'week-1')).toBe('Week 1, take 2');
    expect(nextTakeName([{ name: 'Week 1' }, { name: 'week 1, take 3' }], 'week-1')).toBe('Week 1, take 4');
  });

  it('makes slug-safe ids', () => {
    const id = newTakeId(NOW, () => 0.5);
    expect(id).toMatch(/^take-[a-z0-9]+-[a-z0-9]{4}$/);
    expect(newTakeId(NOW, () => 0)).not.toBe(newTakeId(NOW, () => 0.99));
  });
});

describe('stored takes', () => {
  it('keeps a good take as it is', () => {
    const t = take({ id: 'take-1', name: 'Week 1', label: 'week-1', peaks: [0, 0.5, 1], bpm: 80 });
    expect(sanitizeTake(t)).toEqual(t);
  });

  it('repairs what it can and drops what it cannot', () => {
    expect(sanitizeTake(null)).toBeNull();
    expect(sanitizeTake({ id: 'Bad Id', createdAt: NOW })).toBeNull();
    expect(sanitizeTake({ id: 'take-2', createdAt: 'yesterday' })).toBeNull();
    const repaired = sanitizeTake({ id: 'take-3', createdAt: NOW, name: '', peaks: [2, -1, 'x', 0.5], bpm: 1000, mimeType: 'text/html', durationMs: -5 });
    expect(repaired).toMatchObject({ name: 'Take', peaks: [1, 0, 0.5], bpm: null, mimeType: 'audio/webm', durationMs: 0, label: null });
  });

  it('reads a stored list newest first, without duplicates or junk', () => {
    const list = sanitizeTakes([take({ id: 'a', createdAt: NOW - DAY }), 'junk', take({ id: 'b', createdAt: NOW }), take({ id: 'a', createdAt: NOW - 5 })]);
    expect(list.map((t) => t.id)).toEqual(['b', 'a']);
    expect(list[1].createdAt).toBe(NOW - DAY);
    expect(sanitizeTakes({ not: 'a list' })).toEqual([]);
  });

  it('sorts newest first and is stable on ties', () => {
    expect(sortTakes([take({ id: 'b' }), take({ id: 'a' }), take({ id: 'c', createdAt: NOW + 1 })]).map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('adds up the space takes use', () => {
    expect(totalBytes([take({ id: 'a', bytes: 1000 }), take({ id: 'b', bytes: 2500 })])).toBe(3500);
  });
});

describe('time', () => {
  it('formats lengths as minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7_900)).toBe('0:07');
    expect(formatDuration(90_000)).toBe('1:30');
    expect(formatDuration(725_000)).toBe('12:05');
    expect(formatDuration(Number.NaN)).toBe('0:00');
    expect(spokenDuration(90_000)).toBe('1 minute 30 seconds');
    expect(spokenDuration(1_000)).toBe('1 second');
    expect(spokenDuration(120_000)).toBe('2 minutes');
  });

  it('says when a take was made the way a person would', () => {
    const time = () => '9:00';
    expect(formatTakeDate(NOW - 60_000, NOW, time)).toBe('Today, 9:00');
    expect(formatTakeDate(NOW - DAY, NOW, time)).toBe('Yesterday, 9:00');
    expect(formatTakeDate(NOW - 3 * DAY, NOW, time)).toBe('Friday, 9:00');
    expect(formatTakeDate(NOW - 10 * DAY, NOW, time)).toBe('6 Nov');
    expect(formatTakeDate(new Date(2025, 0, 2).getTime(), NOW, time)).toBe('2 Jan 2025');
  });

  it('counts calendar days, not 24-hour periods', () => {
    const lateLastNight = new Date(2026, 10, 15, 23, 50).getTime();
    expect(calendarDaysBetween(lateLastNight, new Date(2026, 10, 16, 0, 10).getTime())).toBe(1);
    expect(calendarDaysBetween(NOW, NOW - 7 * DAY)).toBe(-7);
  });
});

describe('compare with last week', () => {
  const thisWeek = take({ id: 'now', name: 'Week 1, take 2', label: 'week-1', createdAt: NOW });
  const lastWeek = take({ id: 'week', name: 'Week 1', label: 'week-1', createdAt: NOW - 7 * DAY });
  const twoWeeks = take({ id: 'fortnight', name: 'Week 1', label: 'week-1', createdAt: NOW - 15 * DAY });
  const yesterday = take({ id: 'yesterday', name: 'Week 1', label: 'week-1', createdAt: NOW - DAY });
  const otherPiece = take({ id: 'other', name: 'Scales', label: 'scales', createdAt: NOW - 7 * DAY });

  it('picks the take of the same task nearest to a week before', () => {
    expect(comparisonFor([thisWeek, yesterday, lastWeek, twoWeeks, otherPiece], thisWeek)?.id).toBe('week');
  });

  it('falls back to the latest earlier take of the same task', () => {
    expect(comparisonFor([thisWeek, yesterday, otherPiece], thisWeek)?.id).toBe('yesterday');
  });

  it('matches takes without a label by their name', () => {
    const a = take({ id: 'a', name: 'Greensleeves, take 3', createdAt: NOW });
    const b = take({ id: 'b', name: 'Greensleeves', createdAt: NOW - 8 * DAY });
    const c = take({ id: 'c', name: 'Take 2', createdAt: NOW - 7 * DAY });
    expect(comparisonFor([a, b, c], a)?.id).toBe('b');
  });

  it('uses any other take when none is of the same piece, and a later one for the oldest', () => {
    expect(comparisonFor([thisWeek, otherPiece], thisWeek)?.id).toBe('other');
    expect(comparisonFor([lastWeek, thisWeek], lastWeek)?.id).toBe('now');
    expect(comparisonFor([thisWeek], thisWeek)).toBeNull();
  });

  it('says how far apart two takes are', () => {
    expect(relativeAge(thisWeek, lastWeek)).toBe('a week earlier');
    expect(relativeAge(thisWeek, twoWeeks)).toBe('15 days earlier');
    expect(relativeAge(thisWeek, take({ id: 'x', createdAt: NOW - 14 * DAY }))).toBe('2 weeks earlier');
    expect(relativeAge(thisWeek, yesterday)).toBe('the day before');
    expect(relativeAge(lastWeek, thisWeek)).toBe('a week later');
    expect(relativeAge(thisWeek, take({ id: 'y', createdAt: NOW - 3_600_000 }))).toBe('earlier today');
  });

  it('turns the louder take down so an A/B is fair', () => {
    expect(matchGains(0.2, 0.1)).toEqual([0.5, 1]);
    expect(matchGains(0.1, 0.1)).toEqual([1, 1]);
    expect(matchGains(0, 0.1)).toEqual([1, 1]);
    const [a, b] = matchGains(0.3, 0.05);
    expect(0.3 * a).toBeCloseTo(0.05 * b);
  });
});

describe('formats and files', () => {
  it('asks for the best format the browser records', () => {
    expect(pickMimeType((t) => t === 'audio/webm;codecs=opus' || t === 'audio/mp4')).toBe('audio/webm;codecs=opus');
    expect(pickMimeType((t) => t.startsWith('audio/mp4'))).toBe('audio/mp4;codecs=mp4a.40.2');
    expect(pickMimeType(() => false)).toBeNull();
    expect(pickMimeType(null)).toBeNull();
    expect(
      pickMimeType((t) => {
        if (t.includes('webm')) throw new Error('nope');
        return t === 'audio/ogg;codecs=opus';
      }),
    ).toBe('audio/ogg;codecs=opus');
  });

  it('names the file after the take and its day, with the right extension', () => {
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionFor('audio/ogg;codecs=opus')).toBe('ogg');
    expect(extensionFor('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
    expect(extensionFor('audio/wav')).toBe('wav');
    expect(takeFileName({ name: 'Week 1, take 2', createdAt: NOW }, 'webm')).toBe('week-1-take-2-2026-11-16.webm');
    expect(takeFileName({ name: 'Étude für Élise', createdAt: NOW }, '.wav')).toBe('etude-fur-elise-2026-11-16.wav');
    expect(takeFileName({ name: '!!!', createdAt: NOW }, 'ogg')).toBe('take-2026-11-16.ogg');
  });
});
