import { describe, expect, it } from 'vitest';
import type { FlowResult, WaitRecord } from '@/core/song';
import { activityFor, bestLine, heatLevel, isBetter, practiceStretches, readSongData, runStars, suggestedTempo, summarizeFlow, summarizeListen, summarizeWait, withRun } from './results';

function flowResult(bars: Array<[bar: number, targets: number, perfect: number, missed: number]>): FlowResult {
  const rows = bars.map(([bar, targets, perfect, missed]) => ({ bar, targets, perfect, good: 0, early: 0, late: 0, missed, wrong: 0, accuracy: (100 * perfect) / targets, mistakes: missed }));
  const perfect = rows.reduce((s, r) => s + r.perfect, 0);
  const missed = rows.reduce((s, r) => s + r.missed, 0);
  const judged = perfect + missed;
  return {
    score: perfect * 100, maxScore: judged * 100, combo: 0, maxCombo: 12, accuracy: (100 * perfect) / judged,
    counts: { perfect, good: 0, early: 0, late: 0, missed, wrong: 0 }, bars: rows, weakBars: rows.filter((r) => r.missed).map((r) => r.bar), judged, total: judged,
  };
}

const CTX = { tempo: 100, fullSong: true, durationSec: 95, barCount: 16 };

describe('results', () => {
  it('grades bars for the heat strip by mistakes per note', () => {
    expect(heatLevel(0, 8)).toBe(0);
    expect(heatLevel(1, 8)).toBe(1);
    expect(heatLevel(2, 8)).toBe(2);
    expect(heatLevel(5, 8)).toBe(3);
  });

  it('gives stars by accuracy, capped by the tempo, and none for part of the song', () => {
    expect(runStars(0.97, 100, true)).toBe(3);
    expect(runStars(0.97, 85, true)).toBe(2);
    expect(runStars(0.97, 60, true)).toBe(1);
    expect(runStars(0.7, 100, true)).toBe(1);
    expect(runStars(0.5, 100, true)).toBe(0);
    expect(runStars(1, 100, false)).toBe(0);
  });

  it('groups weak bars into stretches worth looping, worst first', () => {
    const heat = [
      { bar: 2, targets: 8, mistakes: 1, level: 1 as const },
      { bar: 8, targets: 8, mistakes: 4, level: 2 as const },
      { bar: 9, targets: 8, mistakes: 0, level: 0 as const },
      { bar: 10, targets: 8, mistakes: 5, level: 3 as const },
      { bar: 15, targets: 4, mistakes: 1, level: 1 as const },
    ];
    // 8 and 10 join across the clean bar 9; bar 2 alone takes bar 3; the last bar takes the one before.
    expect(practiceStretches(heat, 16)).toEqual([
      { from: 8, to: 10 },
      { from: 14, to: 15 },
      { from: 2, to: 3 },
    ]);
  });

  it('slows the suggested tempo the worse it went', () => {
    expect(suggestedTempo(0.95, 100)).toBe(90);
    expect(suggestedTempo(0.8, 100)).toBe(80);
    expect(suggestedTempo(0.6, 100)).toBe(70);
    expect(suggestedTempo(0.3, 100)).toBe(60);
    expect(suggestedTempo(0.3, 50)).toBe(40);
  });

  it('suggests looping the weakest bars at a slower tempo', () => {
    const s = summarizeFlow(flowResult([[7, 8, 8, 0], [8, 8, 4, 4], [9, 8, 4, 4], [10, 8, 8, 0], [11, 8, 3, 5]]), 'flow', CTX);
    expect(s.accuracy).toBeCloseTo(27 / 40, 5);
    expect(s.heat.map((h) => h.level)).toEqual([0, 2, 2, 0, 3]);
    expect(s.weak[0]).toEqual({ from: 8, to: 11 });
    expect(s.suggestion).toMatchObject({ text: 'Loop bars 9 to 12 at 70 %', loop: { from: 8, to: 11 }, tempo: 70, mode: 'flow' });
    expect(s.stars).toBe(1);
    expect(s.headline).toBe('Getting there');
  });

  it('suggests a faster tempo after a clean slow run, and nothing more after a perfect one', () => {
    const clean = flowResult([[0, 8, 8, 0], [1, 8, 8, 0]]);
    expect(summarizeFlow(clean, 'flow', { ...CTX, tempo: 80 }).suggestion).toMatchObject({ text: 'Try it at 90 %', tempo: 90, loop: null });
    expect(summarizeFlow(clean, 'flow', CTX).suggestion).toBeNull();
    expect(summarizeFlow(clean, 'flow', { ...CTX, fullSong: false }).suggestion?.text).toBe('Now play the whole song');
    expect(summarizeFlow(clean, 'tap', CTX)).toMatchObject({ mode: 'tap', stars: 3, headline: 'A clean run' });
  });

  it('scores wait mode by notes right at the first try', () => {
    const rec = (index: number, bar: number, wrong: number, hints = 0, skipped = false): WaitRecord => ({ index, bar, attempts: wrong + 1, wrong, hints, skipped, matched: !skipped });
    const s = summarizeWait([rec(0, 0, 0), rec(1, 0, 0), rec(2, 1, 2), rec(3, 1, 0, 1), rec(4, 2, 0, 0, true), rec(5, 2, 0)], { ...CTX, barCount: 3 });
    expect(s.accuracy).toBeCloseTo(3 / 6, 5);
    expect(s).toMatchObject({ played: 5, total: 6, firstTry: 3, hints: 1, skipped: 1, stars: 0 });
    expect(s.heat.map((h) => [h.bar, h.mistakes])).toEqual([[0, 0], [1, 2], [2, 1]]);
    expect(s.suggestion?.text).toBe('Loop bars 2 to 3 at 70 %');
    expect(s.suggestion?.mode).toBe('flow');
    const clean = summarizeWait([rec(0, 0, 0), rec(1, 1, 0)], { ...CTX, barCount: 2 });
    expect(clean).toMatchObject({ stars: 1, accuracy: 1 });
    expect(clean.suggestion).toMatchObject({ text: 'Now try it in time, with Flow', mode: 'flow', tempo: 80 });
  });

  it('suggests wait mode after just listening', () => {
    const s = summarizeListen(CTX);
    expect(s).toMatchObject({ accuracy: null, stars: 0, headline: 'You heard the whole song' });
    expect(s.suggestion?.mode).toBe('wait');
  });

  it('keeps personal bests per mode, and only whole runs count', () => {
    expect(isBetter({ accuracy: 90, tempo: 100 }, undefined)).toBe(true);
    expect(isBetter({ accuracy: 91, tempo: 100 }, { accuracy: 90, tempo: 100, stars: 2, combo: 0, at: 0 })).toBe(true);
    expect(isBetter({ accuracy: 86, tempo: 110 }, { accuracy: 90, tempo: 100, stars: 2, combo: 0, at: 0 })).toBe(true);
    expect(isBetter({ accuracy: 95, tempo: 80 }, { accuracy: 90, tempo: 100, stars: 2, combo: 0, at: 0 })).toBe(false);
    const run = summarizeFlow(flowResult([[0, 10, 9, 1]]), 'flow', CTX);
    const first = withRun({ best: {} }, run, 1000);
    expect(first.newBest).toBe(true);
    expect(first.data.best.flow).toMatchObject({ accuracy: 90, tempo: 100, at: 1000 });
    expect(bestLine(first.newBest, first.previous, run)).toBe('Your first whole run of this song');
    const again = withRun(first.data, summarizeFlow(flowResult([[0, 10, 8, 2]]), 'flow', CTX), 2000);
    expect(again.newBest).toBe(false);
    expect(bestLine(again.newBest, again.previous, run)).toBe('Your best: 90 % at 100 % speed');
    const part = withRun(first.data, summarizeFlow(flowResult([[0, 10, 10, 0]]), 'flow', { ...CTX, fullSong: false }), 3000);
    expect(part.newBest).toBe(false);
    expect(part.data.best.flow?.accuracy).toBe(90);
  });

  it('reads stored song data defensively', () => {
    expect(readSongData(null)).toEqual({ best: {} });
    expect(readSongData({ best: { flow: { accuracy: 80, tempo: 90 }, wait: 'x' }, lastTempo: 90 })).toEqual({ best: { flow: { accuracy: 80, tempo: 90, stars: 0, combo: 0, at: 0 } }, lastTempo: 90 });
  });

  it('builds the one recordActivity call with the song skill id', () => {
    const s = summarizeFlow(flowResult([[0, 10, 9, 1]]), 'flow', CTX);
    const input = activityFor(s, { id: 'greensleeves-fingerstyle', title: 'Greensleeves' }, { progress: 1, data: { best: {} }, reachedEnd: true });
    expect(input).toMatchObject({ kind: 'song', id: 'song:greensleeves-fingerstyle', title: 'Greensleeves', completed: true, progress: 1, route: 'play', params: ['greensleeves-fingerstyle'], accuracy: 0.9, stars: 2, mistakes: 1, count: 10, durationSec: 95 });
    const left = activityFor({ ...s, fullSong: true }, { id: 'x', title: 'X' }, { progress: 0.4, data: { best: {} }, reachedEnd: false });
    expect(left).toMatchObject({ completed: false, progress: 0.4 });
    expect(left.stars).toBeUndefined();
    const listen = activityFor(summarizeListen(CTX), { id: 'x', title: 'X' }, { progress: 1, data: { best: {} }, reachedEnd: true });
    // A slower stretch in the run caps the stars.
    expect(summarizeFlow(flowResult([[0, 10, 10, 0]]), 'flow', { ...CTX, starsTempo: 80 }).stars).toBe(2);
    expect(listen.accuracy).toBeUndefined();
    expect(listen.completed).toBe(false);
    expect(listen.progress).toBe(1);
  });
});
