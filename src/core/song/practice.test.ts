import { describe, expect, it } from 'vitest';
import { ODE_TO_JOY, TECHNIQUE_SAMPLER } from './examples';
import { FlowMode, WaitMode, chromaMatches, chromaScore, flowTargets, matchNote, pitchClassScore, practiceTargets, weakBarRanges } from './practice';
import { sixTab } from './sixtab-parse';
import { flattenSong } from './timeline';

const hz = (midi: number, cents = 0) => 440 * 2 ** ((midi - 69 + cents / 100) / 12);
const odeTargets = () => practiceTargets(flattenSong(sixTab(ODE_TO_JOY)), 'guitar');
const chordSong = () => sixTab('title: Em strum\ntempo: 60\n| q (3:0 2:0 1:0){dn} 3:0 (4:2 3:0 2:0) r ||\n');

describe('pitch matching', () => {
  it('matches within cents, with optional octave leniency', () => {
    expect(matchNote(64, { time: 0, midi: 64, freq: hz(64, 20) })).toBeCloseTo(20, 6);
    expect(matchNote(64, { time: 0, midi: 64, freq: hz(64, 60) })).toBeNull();
    expect(matchNote(64, { time: 0, midi: 64, cents: -10 })).toBe(-10);
    expect(matchNote(64, { time: 0, midi: 52 })).toBeNull();
    expect(matchNote(64, { time: 0, midi: 52 }, 50, true)).toBe(0);
    expect(matchNote(64, { time: 0, midi: 53 }, 50, true)).toBeNull();
  });

  it('scores chords by pitch classes and by chroma', () => {
    const em = [4, 7, 11];
    expect(pitchClassScore([52, 55, 59], em)).toBe(1);
    expect(pitchClassScore([52, 55], em)).toBeCloseTo(2 / 3, 6);
    expect(pitchClassScore([52, 55, 59, 60], em)).toBeCloseTo(1 - 0.5 / 3, 6);
    const chroma = new Array(12).fill(0.02);
    chroma[4] = 1;
    chroma[7] = 0.7;
    chroma[11] = 0.6;
    expect(chromaScore(chroma, em).coverage).toBe(1);
    expect(chromaMatches(chroma, em)).toBe(true);
    const cMajor = new Array(12).fill(0.02);
    cMajor[0] = 1;
    cMajor[4] = 0.8;
    cMajor[7] = 0.7;
    expect(chromaMatches(cMajor, em)).toBe(false);
    expect(chromaScore(new Array(12).fill(0), em).score).toBe(0);
  });
});

describe('practice targets', () => {
  it('lists struck, pitched beats with positions', () => {
    const t = odeTargets();
    expect(t).toHaveLength(30);
    expect(t[0]).toMatchObject({ index: 0, tick: 0, bar: 0, midis: [64], pcs: [4], chord: false, positions: [{ string: 1, fret: 0 }] });
    const sampler = practiceTargets(flattenSong(sixTab(TECHNIQUE_SAMPLER)), 'guitar');
    // A natural harmonic at fret 12 sounds at its pitch; the dead note on bar 3 is no target; ties are not struck again.
    const bar3 = sampler.filter((x) => x.bar === 2);
    expect(bar3.map((x) => x.midis[0])).toEqual([76, 71, 74]);
    expect(sampler.some((x) => x.bar === 4 && x.tick === 4 * 3840 + 1920)).toBe(false);
  });
});

describe('wait mode', () => {
  it('waits for the right note, ignores wrong ones, and moves on', () => {
    const w = new WaitMode(odeTargets());
    expect(w.current!.midis).toEqual([64]);
    expect(w.hear({ time: 1, midi: 65, freq: hz(65) }).kind).toBe('wrong');
    const r = w.hear({ time: 2, midi: 64, freq: hz(64, -15) });
    expect(r).toMatchObject({ kind: 'match', cents: -15 });
    expect(r.next!.index).toBe(1);
    expect(w.index).toBe(1);
    expect(w.hear({ time: 3, midi: 52 }).kind).toBe('wrong');
    const lenient = new WaitMode(odeTargets(), { octaveLenient: true });
    expect(lenient.hear({ time: 0, midi: 52 }).kind).toBe('match');
  });

  it('gives hints, skips, jumps and summarises', () => {
    const w = new WaitMode(odeTargets());
    expect(w.hint()).toEqual({ positions: [{ string: 1, fret: 0 }], midis: [64] });
    w.hear({ time: 0, midi: 60 });
    w.hear({ time: 1, midi: 64 });
    expect(w.skip()!.index).toBe(2);
    w.goTo(29);
    w.hear({ time: 5, midi: 60 });
    expect(w.done).toBe(true);
    expect(w.hear({ time: 6, midi: 60 }).kind).toBe('done');
    const s = w.summary();
    expect(s).toMatchObject({ matched: 2, skipped: 1, wrong: 1, hints: 1, firstTry: 1 });
    expect(s.records[0]).toMatchObject({ attempts: 2, wrong: 1, hints: 1, took: 1 });
    w.reset();
    expect(w.index).toBe(0);
    expect(w.summary().wrong).toBe(0);
  });

  it('matches chords from note-ons (all tones) or from a chroma frame', () => {
    const targets = practiceTargets(flattenSong(chordSong()), 'guitar');
    expect(targets.map((t) => t.chord)).toEqual([true, false, true]);
    const w = new WaitMode(targets);
    expect(w.hear({ time: 0, midi: 55 }).kind).toBe('partial');
    expect(w.hear({ time: 0.05, midi: 60 }).kind).toBe('wrong');
    expect(w.hear({ time: 0.1, midi: 59 }).kind).toBe('partial');
    // C is still in the window: the set is not clean until it drops out.
    expect(w.hear({ time: 0.12, midi: 64 }).kind).toBe('partial');
    expect(w.hear({ time: 1.7, midi: 64 }).kind).toBe('partial');
    expect(w.hear({ time: 1.75, midi: 55 }).kind).toBe('partial');
    expect(w.hear({ time: 1.8, midi: 59 }).kind).toBe('match');
    expect(w.hearChroma({ time: 2, chroma: new Array(12).fill(0) }).kind).toBe('ignored');
    expect(w.hear({ time: 2.1, midi: 55 }).kind).toBe('match');
    const chroma = new Array(12).fill(0.01);
    chroma[4] = 1;
    chroma[7] = 0.8;
    chroma[11] = 0.5;
    expect(w.hearChroma({ time: 3, chroma }).kind).toBe('match');
    expect(w.done).toBe(true);
  });
});

describe('flow mode', () => {
  it('judges timing, keeps the combo, scores and maps mistakes per bar', () => {
    const targets = flowTargets(odeTargets());
    expect(targets[1].time).toBeCloseTo(0.6, 9);
    const f = new FlowMode(targets);
    expect(f.hear({ time: 0.01, midi: 64 })!.grade).toBe('perfect');
    expect(f.hear({ time: 0.6 + 0.07, midi: 64 })!.grade).toBe('good');
    expect(f.hear({ time: 1.2 + 0.15, midi: 65 })!.grade).toBe('late');
    expect(f.hear({ time: 1.8 - 0.12, midi: 67 })!.grade).toBe('early');
    expect(f.result().combo).toBe(4);
    // Nothing for target 4 (2.4 s): missed once its window has passed; the combo breaks.
    const missed = f.advance(2.4 + 0.2);
    expect(missed.map((j) => j.grade)).toEqual(['missed']);
    expect(f.result().combo).toBe(0);
    expect(f.hear({ time: 3.0, midi: 70 })!.grade).toBe('wrong');
    expect(f.hear({ time: 3.02, midi: 65 })!.grade).toBe('perfect');
    expect(f.hear({ time: 10.5, midi: 40 })).toBeNull();
    const r = f.finish();
    expect(r.counts).toMatchObject({ perfect: 2, good: 1, late: 1, early: 1, wrong: 1 });
    expect(r.counts.missed).toBe(30 - 5);
    expect(r.maxCombo).toBe(4);
    expect(r.judged).toBe(30);
    expect(r.accuracy).toBeCloseTo((100 * (2 + 0.8 + 0.5 + 0.5)) / 30, 1);
    // Points: 100, 70 x1.02, 40 x1.04, 40 x1.06, then 100 after the break.
    expect(r.score).toBe(100 + Math.round(70 * 1.02) + Math.round(40 * 1.04) + Math.round(40 * 1.06) + 100);
    expect(r.bars[0]).toMatchObject({ bar: 0, targets: 4, perfect: 1, good: 1, late: 1, early: 1, mistakes: 2 });
    expect(r.bars[1]).toMatchObject({ bar: 1, missed: 3, wrong: 1, perfect: 1 });
    expect(r.weakBars[0]).not.toBe(0);
    expect(r.weakBars).toContain(0);
    // Every bar has mistakes, so they merge into one range (bars 3 and 7 hold three notes, the others four).
    expect(weakBarRanges(r)).toEqual([{ from: 0, to: 7, mistakes: 2 + 4 + 4 + 3 + 4 + 4 + 4 + 3, targets: 30 }]);
    const gappy = { ...r, bars: r.bars.map((b) => (b.bar === 3 ? { ...b, mistakes: 0 } : b)) };
    expect(weakBarRanges(gappy).map((x) => [x.from, x.to])).toEqual([[4, 7], [0, 2]]);
  });

  it('judges chords by the first note of the strum or by chroma', () => {
    const targets = flowTargets(practiceTargets(flattenSong(chordSong()), 'guitar'));
    const f = new FlowMode(targets);
    expect(f.hear({ time: 0.02, midi: 52 })).toBeNull();
    expect(f.hear({ time: 0.04, midi: 55 })!).toMatchObject({ grade: 'perfect', offset: 0.02 });
    const chroma = new Array(12).fill(0.01);
    chroma[4] = 1;
    chroma[7] = 0.9;
    chroma[11] = 0.6;
    expect(f.hear({ time: 1.0, midi: 55 })!.grade).toBe('perfect');
    expect(f.hearChroma({ time: 2.1, chroma })!.grade).toBe('late');
    expect(f.finish().counts.perfect).toBe(2);
  });

  it('adds up passes of a loop in the heat map', () => {
    const targets = flowTargets(odeTargets().slice(0, 4));
    const f = new FlowMode(targets);
    f.hear({ time: 0, midi: 64 });
    f.nextPass();
    f.hear({ time: 0, midi: 64 });
    f.hear({ time: 0.6, midi: 64 });
    const r = f.finish();
    expect(r.total).toBe(8);
    expect(r.bars[0]).toMatchObject({ targets: 8, perfect: 3, missed: 5 });
  });
});
