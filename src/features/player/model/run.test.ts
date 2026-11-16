import { describe, expect, it } from 'vitest';
import { flattenSong, practiceTargets, sixTab } from '@/core/song';
import { FlowRun, mergeResults } from './run';

// 120 bpm: a quarter is 0.5 s. Bar 1: B A G A; bar 2: B B B, rest. Seven notes.
const SONG = sixTab(`title: Run test
tempo: 120
| q 3:4 3:2 3:0 3:2 | 3:4 3:4 3:4 r |
`);
const T = flattenSong(SONG);
const TARGETS = practiceTargets(T, SONG.tracks[0].id);
const START = 10; // audio time of tick 0
const midiOf = (i: number) => TARGETS[i].midis[0];

function onTime(run: FlowRun, from: number, percent = 100, shift = 0, passStart = START) {
  for (let i = from; i < TARGETS.length; i++) run.hear({ audio: passStart + TARGETS[i].sec / (percent / 100) + shift, midi: midiOf(i) });
}

describe('flow run', () => {
  it('has the seven targets of the test song', () => {
    expect(TARGETS.map((t) => t.midis[0])).toEqual([59, 57, 55, 57, 59, 59, 59]);
  });

  it('scores a clean run as all perfect, with a full combo', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 100 });
    onTime(run, 0);
    const r = run.finish();
    expect(r.counts).toMatchObject({ perfect: 7, missed: 0, wrong: 0 });
    expect(r.accuracy).toBe(100);
    expect(run.maxCombo).toBe(7);
    expect(r.maxCombo).toBe(7);
  });

  it('calls notes 120 ms ahead "early", and keeps the combo going', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 100 });
    onTime(run, 0, 100, -0.12);
    const r = run.finish();
    expect(r.counts.early).toBe(7);
    expect(run.log.every((j) => j.grade === 'early' && Math.abs((j.offset ?? 0) + 0.12) < 0.002)).toBe(true);
    expect(r.accuracy).toBe(50);
    expect(run.maxCombo).toBe(7);
  });

  it('judges a note played during the count-in against the first target', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 100 });
    const j = run.hear({ audio: START - 0.1, midi: 59 });
    expect(j?.grade).toBe('early');
    expect(j?.offset).toBeCloseTo(-0.1, 3);
  });

  it('counts targets as missed once their window has passed, judged a little behind now', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 100 }, { lag: 0.12 });
    run.hear({ audio: START, midi: 59 });
    // At 0.6 s the second target (0.5 s) is only 0.1 s old: the lag keeps it open.
    expect(run.advance(START + 0.6)).toEqual([]);
    const missed = run.advance(START + 0.5 + 0.17 + 0.12 + 0.01);
    expect(missed.map((m) => [m.grade, m.target])).toEqual([['missed', 1]]);
    expect(run.combo).toBe(0);
  });

  it('runs at the practice tempo: at 50 % every note is twice as far apart', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 50 });
    onTime(run, 0, 50);
    expect(run.finish().counts.perfect).toBe(7);
  });

  it('follows a tempo change in the middle of a pass', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 100 });
    // Bar 1 at 100 %, then at 2.0 s (written) the learner slows to 80 %.
    for (let i = 0; i < 4; i++) run.hear({ audio: START + TARGETS[i].sec, midi: midiOf(i) });
    run.setTempo(80, START + 2.0, 2.0);
    for (let i = 4; i < 7; i++) run.hear({ audio: START + 2.0 + (TARGETS[i].sec - 2.0) / 0.8, midi: midiOf(i) });
    expect(run.finish().counts.perfect).toBe(7);
  });

  it('starts a new pass at the loop wrap and routes notes across it', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 100 });
    onTime(run, 0, 100, 0);
    // The loop is the whole 4 s song; the second pass starts at 14 s and is 5 % faster.
    const loopLen = T.totalSeconds;
    const wrap = START + loopLen;
    const before = run.newPass(wrap, 0, 105);
    expect(before.perfect).toBe(7);
    // The first note of pass 2, 60 ms early, arrives before the wrap: it belongs to pass 2.
    const j = run.hear({ audio: wrap - 0.06, midi: 59 });
    expect(j).toMatchObject({ pass: 1, target: 0, grade: 'good' });
    for (let i = 1; i < TARGETS.length; i++) run.hear({ audio: wrap + TARGETS[i].sec / 1.05, midi: midiOf(i) });
    const r = run.finish();
    expect(r.total).toBe(14);
    expect(r.counts).toMatchObject({ perfect: 13, good: 1, missed: 0, wrong: 0 });
    expect(run.passCount).toBe(2);
    expect(run.maxCombo).toBe(14);
  });

  it('gives a late last note of a pass to that pass, not to the next one', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 100 });
    for (let i = 0; i < 6; i++) run.hear({ audio: START + TARGETS[i].sec, midi: midiOf(i) });
    const wrap = START + 3.5; // a loop that ends right after the last note
    run.newPass(wrap, 0, 100);
    // The last note (3.0 s) played 140 ms late is heard after nothing of pass 2 is due.
    const j = run.hear({ audio: START + 3.0 + 0.14, midi: 59 });
    expect(j).toMatchObject({ pass: 0, target: 6, grade: 'late' });
  });

  it('closes an old pass once its last window is over, marking what was never played', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 100 }, { lag: 0 });
    for (let i = 0; i < 5; i++) run.hear({ audio: START + TARGETS[i].sec, midi: midiOf(i) });
    const wrap = START + 4;
    run.newPass(wrap, 0, 100);
    const out = run.advance(wrap + 0.2);
    expect(out.filter((j) => j.pass === 0).map((j) => j.grade)).toEqual(['missed', 'missed']);
    expect(run.passCounts(0).missed).toBe(2);
  });

  it('calls a wrong pitch near a target wrong, and breaks the combo', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 100 });
    run.hear({ audio: START, midi: 59 });
    const j = run.hear({ audio: START + 0.5, midi: 62 });
    expect(j?.grade).toBe('wrong');
    expect(run.combo).toBe(0);
  });

  it('times taps in tap-along mode (the pitch is taken as right)', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 100 });
    expect(run.tap(START + 0.02)?.grade).toBe('perfect');
    expect(run.tap(START + 0.5 + 0.1)?.grade).toBe('late');
    expect(run.tap(START + 1.3)).toBeNull(); // 0.3 s from anything
    expect(run.tap(START + 1.0 - 0.07)?.grade).toBe('good');
  });

  it('times taps on chords too', () => {
    const song = sixTab(`title: Strum
tempo: 120
| "G=320003" q D D D D |
`);
    const targets = practiceTargets(flattenSong(song), song.tracks[0].id);
    expect(targets[0].chord).toBe(true);
    const run = new FlowRun(targets, { audio: 0, writtenSec: 0, percent: 100 });
    expect(run.tap(0.01)?.grade).toBe('perfect');
    expect(run.tap(0.5)?.grade).toBe('perfect');
    expect(run.finish().counts).toMatchObject({ perfect: 2, missed: 2 });
  });

  it('adds results of several passes into one heat map', () => {
    const run = new FlowRun(TARGETS, { audio: START, writtenSec: 0, percent: 100 });
    onTime(run, 0);
    run.newPass(START + 4, 0, 100);
    for (let i = 0; i < 4; i++) run.hear({ audio: START + 4 + TARGETS[i].sec, midi: midiOf(i) });
    const r = run.finish();
    expect(r.bars.map((b) => [b.bar, b.targets, b.mistakes])).toEqual([
      [0, 8, 0],
      [1, 6, 3],
    ]);
    expect(r.weakBars).toEqual([1]);
    const merged = mergeResults([], 0, 0);
    expect(merged.accuracy).toBe(100);
  });
});
