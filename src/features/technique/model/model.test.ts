import { describe, expect, it } from 'vitest';
import { getExercise, type TempoLadder } from '@/content/technique';
import { createInitialState } from '@/core/progress';
import { addPairMinute, addSession, localDay, readPair, readRecord, starsFor, MAX_LOG } from './history';
import { BREAK_AFTER_SEC, BREAK_RESET_MS, SNOOZE_SEC, TENSION_EVERY_SEC, newHealth, reminderDue, snoozeBreak, strainDue, tensionLine, tensionSeen, tickHealth, tookBreak } from './health';
import { afterPass, clampTempo, climbs, ladderFraction, nudge, rungCount, rungOf, startTempo } from './ladder';
import { analyzeLevels, barLevels } from './levels';
import { atGoal, recommend } from './recommend';
import { bestClean, masteryFor, newVisit, visitActivity, worthRecording } from './session';

const L: TempoLadder = { start: 60, step: 4, goal: 80 };
const FIXED: TempoLadder = { start: 60, step: 0, goal: 60 };

describe('ladder', () => {
  it('knows which ladders climb and where a tempo sits', () => {
    expect(climbs(L)).toBe(true);
    expect(climbs(FIXED)).toBe(false);
    expect(rungCount(L)).toBe(6);
    expect(rungOf(L, 60)).toBe(0);
    expect(rungOf(L, 66)).toBe(1);
    expect(rungOf(L, 90)).toBe(5);
    expect(rungOf(L, 50)).toBe(-1);
    expect(ladderFraction(L, 70)).toBeCloseTo(0.5);
    expect(ladderFraction(L, null)).toBe(0);
  });

  it('starts a visit one rung under the best, inside the ladder', () => {
    expect(startTempo(L, null)).toBe(60);
    expect(startTempo(L, 72)).toBe(68);
    expect(startTempo(L, 60)).toBe(60);
    expect(startTempo(L, 120)).toBe(80);
    expect(startTempo(FIXED, 60)).toBe(60);
  });

  it('climbs on clean, stays on close, steps back after two misses, stops at the goal', () => {
    let s = { tempo: 60, missesHere: 0 };
    let r = afterPass(s, 'clean', L);
    expect(r).toEqual({ state: { tempo: 64, missesHere: 0 }, move: 'up' });
    s = r.state;
    expect(afterPass(s, 'close', L).move).toBe('stay');
    r = afterPass(s, 'not-yet', L);
    expect(r.move).toBe('stay');
    r = afterPass(r.state, 'not-yet', L);
    expect(r).toEqual({ state: { tempo: 60, missesHere: 0 }, move: 'down' });
    expect(afterPass({ tempo: 76, missesHere: 0 }, 'clean', L).move).toBe('goal');
    expect(afterPass({ tempo: 80, missesHere: 0 }, 'clean', L)).toEqual({ state: { tempo: 80, missesHere: 0 }, move: 'goal' });
    // An in-between tempo set by hand goes to the next rung.
    expect(afterPass({ tempo: 61, missesHere: 0 }, 'clean', L).state.tempo).toBe(64);
    expect(afterPass({ tempo: 50, missesHere: 0 }, 'clean', L).state.tempo).toBe(60);
    // Never below the start.
    expect(afterPass({ tempo: 60, missesHere: 1 }, 'not-yet', L).state.tempo).toBe(60);
    expect(afterPass({ tempo: 60, missesHere: 0 }, 'clean', FIXED).move).toBe('fixed');
  });

  it('nudges by a rung, or finely, and keeps eighth-pulse tempos even', () => {
    expect(nudge(60, 1, L)).toBe(64);
    expect(nudge(60, -1, L, true)).toBe(59);
    expect(nudge(60, 1, FIXED)).toBe(64);
    expect(nudge(60, 1, L, true, true)).toBe(62);
    expect(clampTempo(500)).toBe(240);
    expect(clampTempo(Number.NaN)).toBe(30);
    expect(clampTempo(61, true)).toBe(62);
  });
});

describe('history', () => {
  it('reads anything without throwing and repairs it', () => {
    expect(readRecord(undefined)).toEqual({ v: 1, best: null, log: [] });
    expect(readRecord({ best: 'x', log: [{ d: 'bad' }, { d: '2026-11-15', t: 64, l: 68, s: 140 }] })).toEqual({ v: 1, best: null, log: [{ d: '2026-11-15', t: 64, l: 68, s: 100 }] });
  });

  it('keeps the best, merges a day, caps the log and keeps cool-down notes', () => {
    let r = readRecord(null);
    r = addSession(r, { day: '2026-11-14', bestClean: 64, lastTempo: 68 });
    r = addSession(r, { day: '2026-11-15', bestClean: null, lastTempo: 60, score: 70 });
    r = addSession(r, { day: '2026-11-15', bestClean: 72, lastTempo: 72, score: 55, note: 'thumb squeezing' });
    expect(r.best).toBe(72);
    expect(r.bestDay).toBe('2026-11-15');
    expect(r.log).toEqual([{ d: '2026-11-14', t: 64, l: 68 }, { d: '2026-11-15', t: 72, l: 72, s: 70 }]);
    expect(r.notes).toEqual([{ d: '2026-11-15', text: 'thumb squeezing' }]);
    for (let i = 0; i < 60; i++) r = addSession(r, { day: `2027-01-${String((i % 28) + 1).padStart(2, '0')}`, bestClean: 60, lastTempo: 60 });
    expect(r.log.length).toBeLessThanOrEqual(MAX_LOG);
    expect(JSON.stringify(r).length).toBeLessThan(4000);
  });

  it('gives stars for the first clean pass, halfway and the goal', () => {
    expect(starsFor(L, null)).toBe(0);
    expect(starsFor(L, 60)).toBe(1);
    expect(starsFor(L, 72)).toBe(2);
    expect(starsFor(L, 80)).toBe(3);
    expect(starsFor(FIXED, 60)).toBe(3);
  });

  it('keeps the best count per chord pair', () => {
    let p = readPair(undefined);
    p = addPairMinute(p, { day: '2026-11-15', count: 31, tempo: 40 });
    p = addPairMinute(p, { day: '2026-11-15', count: 28, tempo: 44 });
    expect(p.best).toBe(31);
    expect(p.log.length).toBe(2);
    expect(readPair(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('names local days', () => {
    expect(localDay(new Date(2026, 10, 5, 23, 30).getTime())).toBe('2026-11-05');
  });
});

describe('a visit becomes one activity', () => {
  const spider = getExercise('tech-spider')!;
  it('records nothing for a glance', () => {
    const v = newVisit(spider.id, 50, 0);
    expect(worthRecording(v)).toBe(false);
    expect(visitActivity(spider, v, readRecord(null), '2026-11-15')).toBeNull();
  });

  it('records the passes, the best clean tempo, stars, crowns and the history', () => {
    const v = newVisit(spider.id, 50, 0);
    v.activeSec = 240;
    v.passes.push({ tempo: 50, verdict: 'clean', source: 'self', partId: 'fifth-position' }, { tempo: 55, verdict: 'clean', source: 'mic', score: 92, partId: 'fifth-position' }, { tempo: 60, verdict: 'not-yet', source: 'mic', score: 61, partId: 'fifth-position' });
    v.tempo = 60;
    expect(bestClean(v)).toBe(55);
    const out = visitActivity(spider, v, readRecord(null), '2026-11-15')!;
    expect(out.input).toMatchObject({ kind: 'technique', id: 'technique:tech-spider', title: 'Chromatic Spider (1-2-3-4)', durationSec: 240, completed: true, route: 'technique', params: ['tech-spider'], score: 55, stars: 1, count: 3, masteryAtLeast: 1 });
    expect(out.input.accuracy).toBeCloseTo(2 / 3);
    expect(out.record.best).toBe(55);
    expect(out.record.log).toEqual([{ d: '2026-11-15', t: 55, l: 60, s: 92 }]);
  });

  it('gives crowns by how far up the ladder the best tempo is', () => {
    expect(masteryFor(spider.tempo, null)).toBe(0);
    expect(masteryFor(spider.tempo, 50)).toBe(1);
    expect(masteryFor(spider.tempo, 70)).toBe(2);
    expect(masteryFor(spider.tempo, 85)).toBe(3);
    expect(masteryFor(spider.tempo, 105)).toBe(4);
    expect(masteryFor(spider.tempo, 120)).toBe(5);
  });
});

describe('health', () => {
  it('asks for a tension check every few minutes and a break after a long stretch', () => {
    let h = newHealth();
    let now = 1_000_000;
    for (let i = 0; i < TENSION_EVERY_SEC; i++) h = tickHealth(h, (now += 1000), 1, true);
    expect(reminderDue(h)).toBe('tension');
    h = tensionSeen(h);
    expect(reminderDue(h)).toBeNull();
    for (let i = 0; i < BREAK_AFTER_SEC; i++) h = tickHealth(h, (now += 1000), 1, true);
    expect(reminderDue(h)).toBe('break');
    h = snoozeBreak(h);
    expect(reminderDue(h)).toBe('tension');
    h = tensionSeen(h);
    for (let i = 0; i < SNOOZE_SEC; i++) h = tickHealth(h, (now += 1000), 1, true);
    expect(reminderDue(h)).toBe('break');
    expect(tookBreak(h).playedSec).toBe(0);
  });

  it('counts only playing time, and a long pause is a break', () => {
    let h = tickHealth(newHealth(), 1000, 30, true);
    h = tickHealth(h, 2000, 30, false);
    expect(h.playedSec).toBe(30);
    h = tickHealth(h, 2000 + BREAK_RESET_MS + 1, 1, true);
    expect(h.playedSec).toBe(1);
  });

  it('knows when a strain limit is up and rotates the tension lines', () => {
    expect(strainDue(299, 5)).toBe(false);
    expect(strainDue(300, 5)).toBe(true);
    expect(strainDue(10_000, undefined)).toBe(false);
    expect(tensionLine(0)).not.toBe(tensionLine(1));
    expect(tensionLine(4)).toBe(tensionLine(0));
  });
});

describe('levels', () => {
  /** Level readings 30 times a second: `dbAt(bar)` while playing, with quieter gaps between notes. */
  function take(dbAt: (bar: number) => number, bars: number, barSec = 2): { levels: { time: number; db: number }[]; onsets: number[] } {
    const levels: { time: number; db: number }[] = [];
    for (let t = 0; t < bars * barSec; t += 1 / 30) levels.push({ time: 10 + t, db: dbAt(Math.floor(t / barSec)) - ((t * 4) % 1 > 0.7 ? 12 : 0) });
    return { levels, onsets: [10, 10.5, 11] };
  }
  it('measures each bar from the first stroke', () => {
    const { levels } = take((b) => -40 + b * 5, 3);
    const bars = barLevels(levels, 10, 2, 3);
    expect(bars[0]).toBeCloseTo(-40, 0);
    expect(bars[2]).toBeCloseTo(-30, 0);
  });
  it('passes five clear steps and flags a flat one', () => {
    const ok = take((b) => -45 + b * 4, 5);
    expect(analyzeLevels(ok.levels, ok.onsets, { barSec: 2, shape: 'steps' }).verdict).toBe('clean');
    const flat = take((b) => -45 + (b >= 2 ? 4 * (b - 1) : 4 * b), 5);
    const r = analyzeLevels(flat.levels, flat.onsets, { barSec: 2, shape: 'steps' });
    expect(r.verdict).not.toBe('clean');
    expect(r.messages.some((m) => m.startsWith('mf was not louder than p'))).toBe(true);
  });
  it('passes a smooth swell', () => {
    const swell = take((b) => (b < 4 ? -45 + b * 3 : -36 - (b - 4) * 3), 8);
    expect(analyzeLevels(swell.levels, swell.onsets, { barSec: 2, shape: 'swell' }).verdict).toBe('clean');
  });
});

describe('recommend', () => {
  it('suggests an unfinished exercise inside the learner’s band', () => {
    const s = createInitialState({ now: 0 });
    const first = recommend(s);
    expect(first.level).toBeLessThanOrEqual(3);
    expect(['ladder', 'changes']).toContain(first.mode);
    const expert = { ...s, profile: { ...s.profile, experience: 'expert' as const } };
    expect(recommend(expert).level).toBeGreaterThanOrEqual(6);
  });
  it('prefers what the learner already started', () => {
    const s = createInitialState({ now: 0 });
    const started = { ...s, skills: { 'technique:tech-alternate-chromatic': { data: { v: 1, best: 72, log: [] } } } } as unknown as typeof s;
    expect(recommend(started).id).toBe('tech-alternate-chromatic');
    expect(atGoal(getExercise('tech-alternate-chromatic')!, 120)).toBe(true);
  });
});
