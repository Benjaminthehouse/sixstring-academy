import { describe, expect, it } from 'vitest';
import { tuning } from '@/core/guitar';
import { MAX_SKILL_DATA_CHARS } from '@/core/progress';
import { accuracyOf, blindSpots, CAP, decodeStats, encodeStats, heatLevel, heatMap, isLearned, mapSkillId, notesLearnedOn, recordAnswer, stringLearned, totals, type NeckStats } from './stats';
import type { NeckContext } from './types';

const ctx: NeckContext = { tuning: tuning('standard').midi, spelling: 'sharps' };

function answer(stats: NeckStats, s: number, f: number, rights: boolean[], ms = 1200): NeckStats {
  let out = stats;
  for (const r of rights) out = recordAnswer(out, { string: s, fret: f }, r, r ? ms : null);
  return out;
}

describe('position stats', () => {
  it('counts answers and averages the time of right answers only', () => {
    let s = recordAnswer({}, { string: 6, fret: 5 }, true, 2000);
    s = recordAnswer(s, { string: 6, fret: 5 }, false, 9000);
    s = recordAnswer(s, { string: 6, fret: 5 }, true, 1000);
    expect(s['6:5'].n).toBe(3);
    expect(s['6:5'].ok).toBe(2);
    expect(s['6:5'].ms).toBe(Math.round(2000 * 0.65 + 1000 * 0.35));
  });

  it('old evidence fades, so a place that is now known shows it', () => {
    let s = answer({}, 6, 1, Array(CAP).fill(false));
    expect(heatLevel(s['6:1'])).toBe('weak');
    s = answer(s, 6, 1, Array(12).fill(true));
    expect(accuracyOf(s['6:1'])).toBeGreaterThan(0.7);
    expect(heatLevel(s['6:1'])).not.toBe('weak');
    expect(s['6:1'].n).toBeLessThanOrEqual(CAP + 1);
  });

  it('heat levels: new, weak, getting there, known, known and quick', () => {
    expect(heatLevel(undefined)).toBe('new');
    expect(heatLevel({ n: 4, ok: 1, ms: 2000 })).toBe('weak');
    expect(heatLevel({ n: 4, ok: 3, ms: 2000 })).toBe('shaky');
    expect(heatLevel({ n: 6, ok: 6, ms: 4800 })).toBe('shaky');
    expect(heatLevel({ n: 6, ok: 6, ms: 2500 })).toBe('good');
    expect(heatLevel({ n: 6, ok: 6, ms: 1200 })).toBe('fluent');
  });

  it('a string is learned when all twelve of its notes are, at either octave', () => {
    let s: NeckStats = {};
    for (let f = 0; f < 11; f++) s = answer(s, 5, f, [true, true, true]);
    expect(notesLearnedOn(s, 5)).toBe(11);
    expect(stringLearned(s, 5)).toBe(false);
    s = answer(s, 5, 23, [true, true, true]); // fret 11's note, an octave up
    expect(stringLearned(s, 5)).toBe(true);
    expect(stringLearned(s, 6)).toBe(false);
    // Slow answers do not count as learned.
    expect(isLearned({ n: 5, ok: 5, ms: 8000 })).toBe(false);
  });

  it('blind spots are the weakest places tried, weakest first', () => {
    let s = answer({}, 3, 2, [false, false, true]);
    s = answer(s, 2, 1, [false, true, true, true]);
    s = answer(s, 6, 5, [true, true, true, true]);
    s = answer(s, 6, 7, [true]); // right once, quickly: not a blind spot
    s = answer(s, 4, 9, [true, true], 9000); // right but slow: a blind spot of speed
    const spots = blindSpots(s, ctx, [0, 12]);
    expect(spots.map((b) => `${b.string}:${b.fret}`)).toEqual(['3:2', '4:9', '2:1']);
  });

  it('the heat map covers every position of the range', () => {
    const cells = heatMap({}, ctx, [0, 12]);
    expect(cells.length).toBe(6 * 13);
    expect(cells.every((c) => c.level === 'new')).toBe(true);
  });

  it('totals add up', () => {
    let s = answer({}, 6, 0, [true, true]);
    s = answer(s, 6, 1, [false, true]);
    expect(totals(s)).toMatchObject({ answers: 4, right: 3 });
  });
});

describe('storage', () => {
  it('round-trips through the progress store format', () => {
    let s = answer({}, 6, 5, [true, false, true], 1500);
    s = answer(s, 1, 12, [true], 900);
    const back = decodeStats(JSON.parse(JSON.stringify(encodeStats(s))));
    expect(back['6:5']).toEqual({ n: 3, ok: 2, ms: 1500 });
    expect(back['1:12']).toEqual({ n: 1, ok: 1, ms: 900 });
  });

  it('a full seven-string neck, every place tried, fits in a skill', () => {
    let s: NeckStats = {};
    for (let string = 1; string <= 7; string++) for (let f = 0; f <= 24; f++) s = answer(s, string, f, Array(15).fill(true), 14999);
    const text = JSON.stringify(encodeStats(s));
    expect(text.length).toBeLessThan(MAX_SKILL_DATA_CHARS);
  });

  it('ignores damaged data', () => {
    expect(decodeStats(null)).toEqual({});
    expect(decodeStats({ s: { 6: 'x,5:2.1.3,99:1.1.1,3:1.5.2', zz: '1:1.1.1' } })).toEqual({ '6:5': { n: 2, ok: 1, ms: 300 }, '6:3': { n: 1, ok: 1, ms: 200 } });
  });

  it('one map per tuning', () => {
    expect(mapSkillId('standard')).toBe('fretboard:map');
    expect(mapSkillId('drop-d')).toBe('fretboard:map-drop-d');
  });
});
