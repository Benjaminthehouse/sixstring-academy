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
  it('calls timing even within about 8% of the gap (15 to 45 ms)', () => {
    expect(evennessOf(20, 0.5)).toBe('even');
    expect(evennessOf(60, 0.5)).toBe('a-bit-uneven');
    expect(evennessOf(100, 0.5)).toBe('uneven');
    expect(evennessOf(14, 0.1)).toBe('even');
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
    expect(r.messages.some((m) => /furthest was bar \d, beat \d/.test(m))).toBe(true);
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
