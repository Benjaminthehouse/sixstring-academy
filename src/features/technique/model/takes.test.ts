import { describe, expect, it } from 'vitest';
import { getExercise, partSong } from '@/content/technique';
import { EventHub, NoteRecorder, addNoise, analyze, concat, pluckedString, silence, type RecordedNote } from '@/core/pitch';
import { analyzeTake, evennessOf, expectedFromSong, tempoOf } from './takes';

const perm = getExercise('tech-permutations-1')!;
/** The first 16 notes (1-2-3-4 four times on string 3) of the one-string part, at 60 BPM. */
const EXPECTED = expectedFromSong(partSong(perm, perm.parts[0], 60)).slice(0, 16);

const note = (midi: number, start: number, dur = 0.4, cents = 0): RecordedNote => ({ midi, start, end: start + dur, duration: dur, cents, levelDb: -20 });
const jitter = (i: number): number => Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 78.233) * 0.5;

describe('expectedFromSong', () => {
  it('lists the struck notes with their times at the part’s tempo', () => {
    expect(EXPECTED.map((e) => e.midi).slice(0, 4)).toEqual([60, 61, 62, 63]);
    expect(EXPECTED[1].time).toBeCloseTo(0.5, 6);
    expect(EXPECTED[15].time).toBeCloseTo(7.5, 6);
    expect(EXPECTED[8]).toMatchObject({ bar: 1, beat: 0, key: '1:0' });
  });

  it('turns strums into timed strokes without a pitch', () => {
    const strum = getExercise('tech-strum-constant')!;
    const ex = expectedFromSong(partSong(strum, strum.parts[0], 60));
    expect(ex.length).toBe(16 * 6);
    expect(ex.every((e) => e.midi === null)).toBe(true);
    // D - D U - U D U: strokes at eighths 0, 2, 3, 5, 6, 7.
    expect(ex.slice(0, 6).map((e) => e.time * 2)).toEqual([0, 2, 3, 5, 6, 7]);
  });
});

describe('classifiers', () => {
  it('calls timing even within about 6% of the gap (12 to 35 ms)', () => {
    expect(evennessOf(20, 0.5)).toBe('even');
    expect(evennessOf(55, 0.5)).toBe('a-bit-uneven');
    expect(evennessOf(64, 0.5)).toBe('uneven');
    expect(evennessOf(11, 0.1)).toBe('even');
    expect(evennessOf(14, 0.1)).toBe('a-bit-uneven');
  });
  it('reads rushing and dragging beyond 5%', () => {
    expect(tempoOf(1)).toBe('steady');
    expect(tempoOf(1 / 1.1)).toBe('rushing');
    expect(tempoOf(1 / 0.9)).toBe('dragging');
  });
});

describe('analyzeTake on recorded notes', () => {
  it('passes an even, correct take as clean', () => {
    const take = EXPECTED.map((e, i) => note(e.midi!, 20 + e.time + (i % 2 ? 0.004 : -0.004)));
    const r = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: take });
    expect(r.verdict).toBe('clean');
    expect(r.accuracy).toBe(1);
    expect(r.timing.evenness).toBe('even');
    expect(r.timing.tempo).toBe('steady');
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.messages[0]).toBe('Clean and even.');
    expect(Object.values(r.noteStates).every((s) => s === 'hit')).toBe(true);
  });

  it('fails an uneven take and says where the worst note was', () => {
    const take = EXPECTED.map((e, i) => note(e.midi!, 5 + e.time + 0.12 * jitter(i)));
    const r = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: take });
    expect(r.accuracy).toBe(1);
    expect(r.timing.evenness).not.toBe('even');
    expect(r.verdict).not.toBe('clean');
    expect(r.worst).not.toBeNull();
    expect(r.messages.some((m) => /furthest was bar \d, note \d/.test(m))).toBe(true);
  });

  it('notices wrong notes and rushing', () => {
    const take = EXPECTED.map((e, i) => note(i === 5 ? e.midi! + 2 : e.midi!, e.time / 1.12));
    const r = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: take });
    expect(r.missed).toEqual([5]);
    expect(r.noteStates['0:5']).toBe('miss');
    expect(r.timing.tempo).toBe('rushing');
    expect(r.timing.playedBpm).toBe(67);
    expect(r.verdict).not.toBe('clean');
    expect(r.messages.some((m) => m.includes('rushing: about 67 BPM'))).toBe(true);
  });

  it('never calls a take with a wrong note clean, even with perfect timing', () => {
    // Found with a real-time take: E played as E flat, everything else perfect, was "Clean" and climbed the ladder.
    const take = EXPECTED.map((e, i) => note(i === 9 ? e.midi! - 1 : e.midi!, 3 + e.time));
    const r = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: take });
    expect(r.accuracy).toBeGreaterThanOrEqual(0.9);
    expect(r.timing.evenness).toBe('even');
    expect(r.verdict).toBe('close');
    expect(r.messages[0]).toBe('Nearly there.');
    expect(r.messages).toContain('1 of 16 notes was a different note: bar 2, note 2 should be C♯4.');
  });

  it('forgives a note the microphone did not catch, and says so', () => {
    const take = EXPECTED.filter((_, i) => i !== 9).map((e) => note(e.midi!, 3 + e.time));
    const r = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: take });
    expect(r.verdict).toBe('clean');
    expect(r.messages).toContain('1 of 16 notes did not come through; the first at bar 2, note 2 (C♯4).');
  });

  it('reports intonation when asked', () => {
    const take = EXPECTED.map((e) => note(e.midi!, e.time, 0.4, 18));
    const r = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: take, intonation: true });
    expect(r.intonation?.medianCents).toBe(18);
    expect(r.messages.some((m) => m.includes('18 cents sharp'))).toBe(true);
  });

  it('says so when nothing was heard', () => {
    const r = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: [] });
    expect(r.empty).toBe(true);
    expect(r.verdict).toBe('not-yet');
    expect(r.score).toBe(0);
  });

  it('judges a strum take on its strokes', () => {
    const strum = getExercise('tech-strum-constant')!;
    const ex = expectedFromSong(partSong(strum, strum.parts[0], 80)).slice(0, 24);
    const even = analyzeTake({ kind: 'onsets', expected: ex, bpm: 80, onsets: ex.map((e) => 2 + e.time) });
    expect(even.verdict).toBe('clean');
    const some = analyzeTake({ kind: 'onsets', expected: ex, bpm: 80, onsets: ex.filter((_, i) => i % 3).map((e) => 2 + e.time) });
    expect(some.accuracy).toBeCloseTo(16 / 24, 6);
    expect(some.verdict).toBe('not-yet');
  });
});

describe('analyzeTake through the real pitch pipeline', () => {
  const SR = 48000;
  /** Render the notes at their times (with a timing error per note), analyse, record. */
  function record(errors: (i: number) => number): RecordedNote[] {
    const lead = 0.6;
    const total = lead + EXPECTED[EXPECTED.length - 1].time + 1;
    const x = new Float32Array(Math.round(total * SR));
    EXPECTED.forEach((e, i) => {
      const freq = 440 * 2 ** ((e.midi! - 69) / 12);
      const n = pluckedString({ freq, sampleRate: SR, duration: 0.42, amplitude: 0.4, seed: 7 + i, attackNoise: 0.3 });
      const at = Math.round((lead + e.time + errors(i)) * SR);
      for (let k = 0; k < n.length && at + k < x.length; k++) x[at + k] += n[k];
    });
    const audio = addNoise(concat(x, silence(0.3, SR)), 40, 3);
    const hub = new EventHub();
    const rec = new NoteRecorder(hub);
    rec.start();
    hub.emitAll(analyze(audio, SR));
    return rec.stop();
  }

  it('hears an even take as clean and a jittered one as uneven', () => {
    const even = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: record(() => 0) });
    expect(even.accuracy).toBeGreaterThanOrEqual(0.9);
    expect(even.timing.evenness).toBe('even');
    expect(even.verdict).toBe('clean');

    const uneven = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: record((i) => 0.11 * jitter(i)) });
    expect(uneven.accuracy).toBeGreaterThanOrEqual(0.9);
    expect(uneven.timing.evenness).not.toBe('even');
    expect(uneven.verdict).not.toBe('clean');
  }, 30000);
});

describe('analyzeTake against the click (pass 2)', () => {
  // The click's first beat at audio time 30 s; the microphone stamps a note 80 ms after the click it
  // was played with. Part 1 starts on its first beat (songTime of note 0 is 0).
  const click = { zero: 30, latency: 0.08, calibrated: true };
  const onTime = (shiftMs: number) => EXPECTED.map((e, i) => note(e.midi!, click.zero + click.latency + e.songTime + shiftMs / 1000 + (i % 2 ? 0.004 : -0.004)));

  it('an even take on the click is clean, and says so', () => {
    const r = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: onTime(0), click });
    expect(r.verdict).toBe('clean');
    expect(r.timing.click).toMatchObject({ keeping: 'with' });
    expect(Math.abs(r.timing.click!.offsetMs)).toBeLessThanOrEqual(5);
    expect(r.messages.join(' ')).toMatch(/With the click: right on it/);
  });

  it('an even take a steady 120 ms behind the click is not clean: evenness alone used to pass it', () => {
    const late = onTime(120);
    const judged = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: late, click });
    expect(judged.timing.evenness).toBe('even');
    expect(judged.timing.click!.keeping).toBe('behind');
    expect(Math.abs(judged.timing.click!.offsetMs - 120)).toBeLessThanOrEqual(5);
    expect(judged.verdict).toBe('close');
    expect(judged.messages.join(' ')).toMatch(/about 12\d ms behind the click/);
    // Without the click's position (the old judging) the same take is clean.
    expect(analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: late }).verdict).toBe('clean');
    expect(judged.score).toBeLessThan(analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: onTime(0), click }).score);
  });

  it('ahead of the click, and the wider allowance when the delay is only what the browser reports', () => {
    const early = analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: onTime(-80), click });
    expect(early.timing.click!.keeping).toBe('ahead');
    expect(early.messages.join(' ')).toMatch(/ahead of the click/);
    // 45 ms late: outside a calibrated allowance (30 ms at this tempo), inside an uncalibrated one.
    expect(analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: onTime(45), click }).timing.click!.keeping).toBe('behind');
    expect(analyzeTake({ kind: 'notes', expected: EXPECTED, bpm: 60, notes: onTime(45), click: { ...click, calibrated: false } }).timing.click!.keeping).toBe('with');
  });

  it('strokes of a strum are judged against the click too', () => {
    const strum = getExercise('tech-strum-constant')!;
    const ex = expectedFromSong(partSong(strum, strum.parts[0], 60)).slice(0, 24);
    const onsets = ex.map((e) => click.zero + click.latency + e.songTime + 0.15);
    const r = analyzeTake({ kind: 'onsets', expected: ex, bpm: 60, onsets, click });
    expect(r.timing.click!.keeping).toBe('behind');
    expect(r.verdict).not.toBe('clean');
  });
});
