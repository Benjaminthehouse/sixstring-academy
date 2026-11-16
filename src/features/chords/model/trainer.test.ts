import { describe, expect, it } from 'vitest';
import { addScore, canonicalOrder, changeDataJson, changeSkillId, changeTitle, judgeStrum, judgeTaps, nextTempo, readChangeData, scoreCheck, scoreInTime, scoreOneMinute, setDifficulty, suggestedPairs, targetPerMinute, trainerParams, trainerSetup, trendWords, TREND_DAYS } from './trainer';
import { viewFromParams } from './symbols';

describe('pairs and skill ids', () => {
  it('match the ids the practice planner already uses', () => {
    expect(changeSkillId(['G', 'C'])).toBe('chord-change:g-c');
    expect(changeSkillId(['C', 'G'])).toBe('chord-change:g-c');
    expect(changeSkillId(['Am', 'Em'])).toBe('chord-change:em-am');
    expect(changeSkillId(['D', 'A'])).toBe('chord-change:d-a');
    expect(changeSkillId(['G7', 'C'])).toBe('chord-change:c-g7');
    expect(changeSkillId(['Dm7', 'Am'])).toBe('chord-change:am-dm7');
    expect(changeSkillId(['F#m', 'Bm'])).toBe('chord-change:bm-f-sharp-m');
    expect(changeSkillId(['G', 'C', 'D'])).toBe('chord-change:g-c-d');
  });

  it('order unknown pairs by the learning path', () => {
    expect(canonicalOrder(['C', 'Em'])).toEqual(['Em', 'C']);
    expect(canonicalOrder(['Ab', 'Cmaj7'])).toEqual(['Cmaj7', 'Ab']);
    expect(canonicalOrder(['Db', 'Ab'])).toEqual(['Ab', 'Db']);
    expect(changeTitle(['C', 'G'])).toBe('G to C');
    expect(changeTitle(['G', 'C', 'D'])).toBe('G, C and D');
  });

  it('suggest distinct classic pairs', () => {
    const pairs = suggestedPairs();
    expect(pairs[0]).toEqual(['Em', 'Am']);
    const keys = pairs.map((p) => [...p].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(['C', 'G'].join('|'));
  });
});

describe('one-minute changes', () => {
  it('set fluent targets from how hard the change is', () => {
    expect(targetPerMinute(1.3)).toBe(60);
    expect(targetPerMinute(5.4)).toBe(30);
    expect(targetPerMinute(9)).toBe(20);
    const easy = targetPerMinute(setDifficulty(['C', 'Am']));
    const hard = targetPerMinute(setDifficulty(['G', 'C']));
    expect(easy).toBeGreaterThan(hard);
    expect(hard).toBe(30);
  });

  it('score a round against the target, with stars and kind words', () => {
    const full = scoreOneMinute({ changes: 30, unclear: 0, seconds: 60, target: 30, mic: false });
    expect(full).toMatchObject({ perMinute: 30, accuracy: 1, stars: 3, clean: null });
    const half = scoreOneMinute({ changes: 15, unclear: 0, seconds: 60, target: 30, mic: false });
    expect(half).toMatchObject({ perMinute: 15, accuracy: 0.5, stars: 1 });
    const zero = scoreOneMinute({ changes: 0, unclear: 0, seconds: 60, target: 30, mic: false });
    expect(zero.stars).toBe(0);
    expect(zero.verdict).toMatch(/No changes/);
  });

  it('report how clean the strums were when the microphone counted', () => {
    const mic = scoreOneMinute({ changes: 18, unclear: 6, seconds: 60, target: 30, mic: true });
    expect(mic.clean).toBeCloseTo(0.75);
    expect(mic.perMinute).toBe(18);
  });

  it('scale a short round to a minute', () => {
    expect(scoreOneMinute({ changes: 10, unclear: 0, seconds: 30, target: 30, mic: false }).perMinute).toBe(20);
  });
});

describe('changes in time', () => {
  const beat = 0.75; // 80 BPM

  it('accept a tap up to a beat early and a little late', () => {
    const changes = [4 * beat, 8 * beat, 12 * beat, 16 * beat];
    const taps = [4 * beat - 0.5, 8 * beat + 0.1, 12 * beat + 0.9];
    expect(judgeTaps(changes, taps, beat, 4)).toEqual(['clean', 'clean', 'late', 'missed']);
  });

  it('use each tap once', () => {
    expect(judgeTaps([3, 6], [3.05], 0.75, 4)).toEqual(['clean', 'missed']);
  });

  it('judge strums the microphone confirmed', () => {
    expect(judgeStrum(3.05, 3, beat, 0)).toBe('clean');
    expect(judgeStrum(3.6, 3, beat, 0)).toBe('late');
    expect(judgeStrum(null, 3, beat, 2)).toBe('wrong');
    expect(judgeStrum(null, 3, beat, 0)).toBe('missed');
  });

  it('add up a round', () => {
    expect(scoreInTime(['clean', 'clean', 'late', 'missed', 'wrong'])).toMatchObject({ clean: 2, late: 1, missed: 1, wrong: 1, total: 5, accuracy: 0.4 });
    expect(scoreInTime([]).accuracy).toBe(0);
  });

  it('speed up after a clean round, hold after a good one, slow down after a hard one', () => {
    expect(nextTempo({ bpm: 60, beatsPerChord: 4 }, 1)).toMatchObject({ bpm: 68, beatsPerChord: 4, change: 'faster' });
    expect(nextTempo({ bpm: 60, beatsPerChord: 4 }, 0.8)).toMatchObject({ bpm: 60, change: 'same' });
    expect(nextTempo({ bpm: 60, beatsPerChord: 4 }, 0.5)).toMatchObject({ bpm: 52, change: 'slower' });
  });

  it('change chords more often once the tempo is high, and give more time at the bottom', () => {
    expect(nextTempo({ bpm: 104, beatsPerChord: 4 }, 0.95)).toMatchObject({ bpm: 70, beatsPerChord: 2, change: 'faster' });
    expect(nextTempo({ bpm: 48, beatsPerChord: 2 }, 0.3)).toMatchObject({ bpm: 60, beatsPerChord: 4, change: 'slower' });
    expect(nextTempo({ bpm: 40, beatsPerChord: 8 }, 0.1).bpm).toBe(40);
  });

  it('converge near 80 % success: a learner who manages up to 76 BPM settles there', () => {
    let s = { bpm: 60, beatsPerChord: 4 };
    const skill = (bpm: number) => (bpm <= 76 ? 0.95 : bpm <= 84 ? 0.75 : 0.5);
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      const n = nextTempo(s, skill(s.bpm));
      s = { bpm: n.bpm, beatsPerChord: n.beatsPerChord };
      seen.push(s.bpm);
    }
    expect(seen.slice(-4).every((b) => b >= 76 && b <= 84)).toBe(true);
  });
});

describe('check mode', () => {
  it('scores speed and first-try accuracy', () => {
    expect(scoreCheck([{ seconds: 2, failedAttempts: 0 }, { seconds: 4, failedAttempts: 2 }])).toEqual({ count: 2, firstTry: 1, accuracy: 0.5, averageSeconds: 3 });
    expect(scoreCheck([]).accuracy).toBe(0);
  });
});

describe('trend over days', () => {
  it('keeps the best score per day and the last 30 days', () => {
    let d = readChangeData(undefined);
    d = addScore(d, '2026-11-01', 12);
    d = addScore(d, '2026-11-01', 10);
    d = addScore(d, '2026-11-02', 15);
    expect(d.trend).toEqual([
      { day: '2026-11-01', best: 12 },
      { day: '2026-11-02', best: 15 },
    ]);
    expect(d.best).toBe(15);
    for (let i = 0; i < 40; i++) d = addScore(d, new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10), i);
    expect(d.trend).toHaveLength(TREND_DAYS);
    expect(d.trend[d.trend.length - 1]).toEqual({ day: '2027-02-09', best: 39 });
  });

  it('survives a round trip through JSON and rejects junk', () => {
    const d = addScore({ trend: [], best: 0, timed: { bpm: 72, beatsPerChord: 2 } }, '2026-11-03', 20);
    expect(readChangeData(JSON.parse(JSON.stringify(changeDataJson(d))))).toEqual(d);
    expect(readChangeData({ trend: [{ day: 'yesterday', best: 3 }, { day: '2026-11-03', best: 'x' }], best: 'lots', timed: { bpm: 'fast' } })).toEqual({ trend: [], best: 0, timed: null });
    expect(readChangeData([1, 2])).toEqual({ trend: [], best: 0, timed: null });
  });

  it('says how it is going in plain words', () => {
    expect(trendWords([{ day: '2026-11-01', best: 10 }])).toBeNull();
    expect(trendWords([{ day: '2026-11-01', best: 10 }, { day: '2026-11-02', best: 14 }])).toMatch(/Up 4/);
    expect(trendWords([{ day: '2026-11-01', best: 14 }, { day: '2026-11-02', best: 10 }])).toMatch(/slower day/);
  });
});

describe('the trainer’s address', () => {
  it('reads the mode, the tempo and the beats per chord', () => {
    expect(trainerSetup([])).toEqual({});
    expect(trainerSetup(['minute'])).toEqual({ mode: 'minute' });
    expect(trainerSetup(['one-minute'])).toEqual({ mode: 'minute' });
    expect(trainerSetup(['check'])).toEqual({ mode: 'check' });
    expect(trainerSetup(['ring-true'])).toEqual({ mode: 'check' });
    expect(trainerSetup(['timed', 't70', 'beats-2'])).toEqual({ mode: 'timed', bpm: 70, beats: 2 });
    expect(trainerSetup(['in-time'])).toEqual({ mode: 'timed' });
    // A tempo or beats alone can only mean changes in time.
    expect(trainerSetup(['t80'])).toEqual({ mode: 'timed', bpm: 80 });
    expect(trainerSetup(['beats-1'])).toEqual({ mode: 'timed', beats: 1 });
    // Kept in the trainer's range; beats it does not offer are left out.
    expect(trainerSetup(['t20'])).toEqual({ mode: 'timed', bpm: 40 });
    expect(trainerSetup(['t300'])).toEqual({ mode: 'timed', bpm: 160 });
    expect(trainerSetup(['minute', 'beats-3'])).toEqual({ mode: 'minute' });
  });

  it('writes params the chord screen reads back', () => {
    const params = trainerParams(['G', 'D7'], { mode: 'timed', bpm: 70, beats: 2 });
    expect(params).toEqual(['trainer', 'g-major', 'd-7', 't70', 'beats-2']);
    for (const p of params) expect(p).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const view = viewFromParams(params);
    expect(view).toEqual({ view: 'trainer', chords: ['G', 'D7'], options: ['t70', 'beats-2'] });
    expect(view.view === 'trainer' && trainerSetup(view.options)).toEqual({ mode: 'timed', bpm: 70, beats: 2 });
    expect(trainerParams(['Em', 'Am'], { mode: 'check' })).toEqual(['trainer', 'e-minor', 'a-minor', 'check']);
    expect(trainerParams(['Em', 'Am'])).toEqual(['trainer', 'e-minor', 'a-minor']);
  });
});
