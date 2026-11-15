import { describe, expect, it } from 'vitest';
import { EMPTY_CALIBRATION, detectBleed, estimateOffset, isBleed, normalizeCalibration, offsetFor } from './calibration';
import { LiveJudge, MIC_WINDOWS, TAP_WINDOWS, formatMs, scoreTaps, starsFor, summarise, verdictLabel, type TargetMeta } from './scoring';
import { pickTip } from './tips';

/** Quarter notes at 120 BPM starting at t = 1 s. */
const beats = (n: number, period = 0.5, start = 1) => Array.from({ length: n }, (_, i) => start + i * period);

describe('judging taps', () => {
  it('gives full marks to taps on the beat', () => {
    const t = beats(8);
    const { stats, judgements } = scoreTaps(t, t);
    expect(stats.perfect).toBe(8);
    expect(stats.accuracy).toBe(1);
    expect(stats.stars).toBe(3);
    expect(stats.meanMs).toBeCloseTo(0, 6);
    expect(judgements.map((j) => j.targetId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('grades known distances: on it, a touch off, early or late', () => {
    const t = beats(6);
    const offsetsMs = [0, 20, -34, 50, -74, 110];
    const { judgements, stats } = scoreTaps(t, t.map((x, i) => x + offsetsMs[i] / 1000));
    expect(judgements.filter((j) => j.targetId !== null).map((j) => j.verdict)).toEqual(['perfect', 'perfect', 'perfect', 'good', 'good', 'ok']);
    expect(judgements.map((j) => Math.round(j.errorMs))).toEqual(offsetsMs);
    expect(stats.errors.map(Math.round)).toEqual(offsetsMs);
    expect(stats.accuracy).toBeCloseTo((3 + 2 * 0.75 + 0.45) / 6, 6);
    expect(stats.stars).toBe(2);
  });

  it('applies the latency offset before judging', () => {
    const t = beats(8);
    const late = t.map((x) => x + 0.085);
    const raw = scoreTaps(t, late);
    expect(raw.stats.perfect).toBe(0);
    expect(raw.stats.meanMs).toBeCloseTo(85, 3);
    const corrected = scoreTaps(t, late, { offsetMs: 85 });
    expect(corrected.stats.perfect).toBe(8);
    expect(corrected.stats.meanMs).toBeCloseTo(0, 3);
    // A negative offset (taps that arrive before the click) works the same way.
    expect(scoreTaps(t, t.map((x) => x - 0.04), { offsetMs: -40 }).stats.perfect).toBe(8);
  });

  it('counts missing taps as misses', () => {
    const t = beats(8);
    const taps = t.filter((_, i) => i !== 2 && i !== 5);
    const { stats, judgements } = scoreTaps(t, taps);
    expect(stats.miss).toBe(2);
    expect(stats.hits).toBe(6);
    expect(stats.accuracy).toBeCloseTo(6 / 8, 6);
    expect(judgements.filter((j) => j.verdict === 'miss').map((j) => j.targetId).sort()).toEqual([2, 5]);
    expect(stats.bestRun).toBe(2);
  });

  it('counts extra taps and takes a quarter note off for each', () => {
    const t = beats(8);
    // Two taps in the gaps between beats, far from any note.
    const taps = [...t, t[1] + 0.25, t[4] + 0.25];
    const { stats } = scoreTaps(t, taps);
    expect(stats.extra).toBe(2);
    expect(stats.perfect).toBe(8);
    expect(stats.accuracy).toBeCloseTo((8 - 0.5) / 8, 6);
  });

  it('a double tap scores once and the second is an extra', () => {
    const t = beats(4);
    const { stats } = scoreTaps(t, [t[0], t[0] + 0.02, t[1], t[2], t[3]]);
    expect(stats.perfect).toBe(4);
    expect(stats.extra).toBe(1);
  });

  it('gives each tap to the nearest open note, so a run played late stays in order', () => {
    // Sixteenths at 100 BPM (150 ms apart), every tap 50 ms late.
    const t = beats(8, 0.15);
    const { judgements, stats } = scoreTaps(t, t.map((x) => x + 0.05));
    expect(judgements.filter((j) => j.targetId !== null).map((j) => j.targetId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(stats.miss).toBe(0);
    expect(stats.extra).toBe(0);
  });

  it('narrows the window for dense notes and caps it for sparse ones', () => {
    const dense = new LiveJudge(beats(4, 0.15).map((time, id) => ({ id, time })));
    expect(dense.windowsOf(1)!.okMs).toBeCloseTo(67.5, 3);
    expect(dense.windowsOf(1)!.perfectMs).toBeCloseTo(27, 3);
    const sparse = new LiveJudge(beats(4, 2).map((time, id) => ({ id, time })));
    expect(sparse.windowsOf(1)).toEqual({ perfectMs: 35, goodMs: 75, okMs: 130 });
    // 200 ms from the nearest note is an extra tap, not a very late note.
    expect(sparse.tap(1.2).verdict).toBe('extra');
    expect(new LiveJudge([{ id: 0, time: 1 }], MIC_WINDOWS).windowsOf(0)).toEqual({ perfectMs: 45, goodMs: 90, okMs: 140 });
  });

  it('declares misses as time passes, never before a note can still be hit', () => {
    const judge = new LiveJudge(beats(3).map((time, id) => ({ id, time })), TAP_WINDOWS);
    expect(judge.advance(1.1)).toEqual([]);
    const missed = judge.advance(1.14);
    expect(missed.map((j) => j.targetId)).toEqual([0]);
    expect(judge.tap(1.5).targetId).toBe(1);
    expect(judge.finish().map((j) => j.targetId)).toEqual([2]);
    expect(judge.judgements).toHaveLength(3);
  });

  it('takes refined note times from the audio scheduler', () => {
    const judge = new LiveJudge([{ id: 0, time: 1 }, { id: 1, time: 1.5 }]);
    judge.setTime(1, 1.52);
    expect(judge.timeOf(1)).toBe(1.52);
    expect(Math.round(judge.tap(1.52).errorMs)).toBe(0);
  });

  it('stars and wording', () => {
    expect([0.5, 0.55, 0.78, 0.92, 1].map(starsFor)).toEqual([0, 1, 2, 3, 3]);
    expect(verdictLabel({ verdict: 'perfect', errorMs: 3 })).toBe('On it');
    expect(verdictLabel({ verdict: 'good', errorMs: -50 })).toBe('A touch early');
    expect(verdictLabel({ verdict: 'ok', errorMs: 90 })).toBe('Late');
    expect(verdictLabel({ verdict: 'miss', errorMs: 0 })).toBe('Missed');
    expect(formatMs(-12.4)).toBe('12 ms early');
    expect(formatMs(8)).toBe('8 ms late');
    expect(formatMs(0.2)).toBe('on the beat');
  });
});

describe('round statistics', () => {
  it('separates beats from off-beats and measures drift', () => {
    // Eighth notes: beats on time, every "and" 40 ms early.
    const t = beats(16, 0.3);
    const taps = t.map((x, i) => (i % 2 ? x - 0.04 : x));
    const parts = t.map((_, i) => (i % 2 ? 'and' : 'beat')) as Array<'and' | 'beat'>;
    const { stats } = scoreTaps(t, taps, { parts });
    expect(stats.onBeat.n).toBe(8);
    expect(stats.offBeat.n).toBe(8);
    expect(stats.onBeat.meanMs).toBeCloseTo(0, 3);
    expect(stats.offBeat.meanMs).toBeCloseTo(-40, 3);
    expect(stats.byPart.and!.hits).toBe(8);
    expect(pickTip(stats, { source: 'tap', calibrated: true }).id).toBe('rush-offbeats');
    expect(pickTip(stats, { source: 'tap', calibrated: true }).title).toBe('You rush the off-beats');
  });

  it('reports wrong stroke directions and silent-bar timing', () => {
    const metas: TargetMeta[] = [
      { id: 0, part: 'beat', dir: 'D' },
      { id: 1, part: 'and', dir: 'U' },
      { id: 2, part: 'beat', dir: 'D', silent: true },
      { id: 3, part: 'and', dir: 'U', silent: true },
    ];
    const judge = new LiveJudge(metas.map((m, i) => ({ id: m.id, time: 1 + i * 0.4 })));
    judge.tap(1, 'D');
    judge.tap(1.4, 'D');
    judge.tap(1.83, 'D');
    judge.finish();
    const stats = summarise(metas, judge.judgements);
    expect(stats.wrongDirection).toBe(1);
    expect(stats.silent.n).toBe(2);
    expect(stats.silent.hits).toBe(1);
    expect(stats.silent.misses).toBe(1);
    expect(stats.silent.meanMs).toBeCloseTo(30, 3);
  });

  it('scores a round that was cut short: unjudged notes are misses', () => {
    const metas: TargetMeta[] = [0, 1, 2, 3].map((id) => ({ id, part: 'beat' }));
    const judge = new LiveJudge(metas.map((m) => ({ id: m.id, time: 1 + m.id * 0.5 })));
    judge.tap(1);
    const stats = summarise(metas, judge.judgements);
    expect(stats.miss).toBe(3);
    expect(stats.accuracy).toBeCloseTo(0.25, 6);
  });
});

describe('tips', () => {
  const round = (errorsMs: number[], opts: { period?: number; missing?: number[]; extra?: number } = {}) => {
    const t = beats(errorsMs.length, opts.period ?? 0.5);
    const taps = t.map((x, i) => x + errorsMs[i] / 1000).filter((_, i) => !opts.missing?.includes(i));
    for (let k = 0; k < (opts.extra ?? 0); k++) taps.push(t[k] + 0.25);
    return scoreTaps(t, taps).stats;
  };
  const ctx = { source: 'tap', calibrated: true } as const;

  it('says the single most useful thing', () => {
    expect(pickTip(round([0, 0, 0, 0, 0, 0, 0, 0], { missing: [0, 1, 2, 3, 4, 5, 6, 7] }), ctx).id).toBe('no-taps');
    expect(pickTip(round(Array(10).fill(0), { missing: [0, 2, 4, 6, 8] }), ctx).action).toBe('slower');
    expect(pickTip(round(Array(8).fill(0), { extra: 4 }), ctx).id).toBe('extra-taps');
    expect(pickTip(round(Array(8).fill(0), { extra: 4 }), { source: 'mic', calibrated: true }).action).toBe('headphones');
    expect(pickTip(round(Array(12).fill(-45)), ctx).id).toBe('ahead');
    expect(pickTip(round(Array(12).fill(48)), ctx).id).toBe('behind');
    expect(pickTip(round([60, -60, 55, -62, 58, -50, 61, -59, 50, -55]), ctx).id).toBe('wobble');
    expect(pickTip(round([-30, -25, -20, 0, 5, 10, 25, 30, 35]), ctx).id).toBe('slowing-down');
    expect(pickTip(round(Array(12).fill(4)), ctx).id).toBe('locked-in');
  });

  it('blames the device, not the learner, for a steady offset before calibration', () => {
    const tip = pickTip(round(Array(12).fill(52)), { source: 'tap', calibrated: false });
    expect(tip.id).toBe('device-offset');
    expect(tip.action).toBe('calibrate');
    expect(tip.title).toContain('52 ms');
  });
});

describe('calibration', () => {
  it('measures a steady offset and ignores a stray tap', () => {
    const clicks = beats(16, 0.6);
    const jitter = [3, -4, 6, -2, 0, 5, -6, 2, -3, 4, 1, -5, 2, 0, -1, 3];
    const taps = clicks.map((c, i) => c + 0.042 + jitter[i] / 1000);
    taps[7] = clicks[7] + 0.25; // a slip
    const est = estimateOffset(clicks, taps, { periodSec: 0.6 });
    expect(est.offsetMs).toBeGreaterThan(38);
    expect(est.offsetMs).toBeLessThan(46);
    expect(est.used).toBe(15);
    expect(est.quality).toBe('good');
    expect(est.spreadMs).toBeLessThan(6);
  });

  it('handles taps that come before the click', () => {
    const clicks = beats(16, 0.6);
    const est = estimateOffset(clicks, clicks.map((c) => c - 0.03), { periodSec: 0.6 });
    expect(est.offsetMs).toBeCloseTo(-30, 3);
  });

  it('reads a microphone delay of any size as lateness, never as earliness', () => {
    const clicks = beats(16, 0.6);
    for (const delayMs of [20, 140, 290, 310, 480]) {
      const est = estimateOffset(clicks, clicks.map((c) => c + delayMs / 1000), { periodSec: 0.6, earliestMs: -100 });
      expect(est.offsetMs).toBeCloseTo(delayMs, 3);
      expect(est.quality).toBe('good');
    }
    // The same 310 ms through the symmetric tap window is read as 290 ms early.
    expect(estimateOffset(clicks, clicks.map((c) => c + 0.31), { periodSec: 0.6 }).offsetMs).toBeCloseTo(-290, 3);
  });

  it('asks for another go when the taps are uneven or too few', () => {
    const clicks = beats(16, 0.6);
    const wild = clicks.map((c, i) => c + ((i * 97) % 200) / 1000 - 0.1);
    expect(estimateOffset(clicks, wild, { periodSec: 0.6 }).quality).toBe('uneven');
    expect(estimateOffset(clicks, clicks.slice(0, 3), { periodSec: 0.6 }).quality).toBe('too-few');
    expect(estimateOffset([], [], { periodSec: 0.6 }).quality).toBe('too-few');
  });

  it('cleans stored values and falls back when nothing was measured', () => {
    expect(normalizeCalibration(null)).toEqual(EMPTY_CALIBRATION);
    expect(normalizeCalibration({ tapMs: 'x', micMs: 9999, offered: true }).micMs).toBeNull();
    const cal = normalizeCalibration({ tapMs: 41.5, micMs: 130, offered: true, bleed: { loopMs: 60, db: -30 } });
    expect(cal).toMatchObject({ tapMs: 41.5, micMs: 130, offered: true, bleed: { loopMs: 60, db: -30 } });
    expect(offsetFor(cal, 'tap')).toBe(41.5);
    expect(offsetFor(cal, 'mic')).toBe(130);
    expect(offsetFor(EMPTY_CALIBRATION, 'tap')).toBe(0);
    expect(offsetFor(EMPTY_CALIBRATION, 'mic', 72)).toBe(72);
  });

  it('notices the speakers bleeding into the microphone, and not a learner clapping', () => {
    const probes = [1, 1.23, 1.41, 1.78];
    const echo = probes.map((p) => ({ time: p + 0.064, levelDb: -31 }));
    const bleed = detectBleed(probes, echo);
    expect(bleed!.loopMs).toBeCloseTo(64, 3);
    expect(bleed!.db).toBe(-31);
    // Evenly spaced claps cannot line up with unevenly spaced probes.
    const claps = [0.9, 1.5, 2.1].map((time) => ({ time, levelDb: -12 }));
    expect(detectBleed(probes, claps)).toBeNull();
    expect(detectBleed(probes, [])).toBeNull();
    // Later: an onset at click time + loop delay at the click's level is bleed; a loud strum there is not.
    expect(isBleed({ time: 5.064, levelDb: -30 }, [5], bleed)).toBe(true);
    expect(isBleed({ time: 5.064, levelDb: -12 }, [5], bleed)).toBe(false);
    expect(isBleed({ time: 5.3, levelDb: -30 }, [5], bleed)).toBe(false);
    expect(isBleed({ time: 5.064, levelDb: -30 }, [5], null)).toBe(false);
  });
});
