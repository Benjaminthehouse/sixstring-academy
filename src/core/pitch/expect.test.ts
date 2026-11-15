/**
 * Game helpers on replayed analysis events: audio is analysed offline and the events are pushed
 * through an EventHub, exactly as the live tracker would deliver them (only faster).
 */
import { describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { type ChordSpec, pitchClassesOf } from './chords';
import { analyze } from './engine';
import { compareNotes, NoteRecorder, type RecordedNote, waitForChord, waitForNote } from './expect';
import { mix, pluckedString, silence, strum, whiteNoise } from './signals';
import { EventHub, type PitchEvent } from './types';

const SR = 44100;

interface Played {
  midi: number;
  at: number;
  dur?: number;
  cents?: number;
}

function melody(notes: Played[], total: number): Float32Array {
  let x = mix(silence(total, SR), whiteNoise(Math.round(total * SR), 0.0004, 3));
  notes.forEach((n, i) => {
    const p = pluckedString({
      freq: midiToFreq(n.midi) * Math.pow(2, (n.cents ?? 0) / 1200),
      sampleRate: SR,
      duration: Math.min(n.dur ?? 0.45, total - n.at),
      amplitude: 0.4,
      attackNoise: 0.3,
      seed: i + 1,
    });
    const fade = Math.min(p.length, 900);
    for (let k = 0; k < fade; k++) p[p.length - 1 - k] *= k / fade;
    x = mix(x, p, Math.round(n.at * SR)).subarray(0, Math.round(total * SR));
  });
  return x;
}

const events = (x: Float32Array, chroma = false): PitchEvent[] => analyze(x, SR, { chroma });

describe('waitForNote', () => {
  it('resolves when the note is played, and remembers the wrong ones before it', async () => {
    const hub = new EventHub();
    const wrong: number[] = [];
    const wait = waitForNote(hub, 55, { onWrongNote: (n) => wrong.push(n.midi) });
    hub.emitAll(events(melody([{ midi: 52, at: 0.3 }, { midi: 57, at: 0.9 }, { midi: 55, at: 1.5, cents: 6 }], 2.3)));
    const r = await wait;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.midi).toBe(55);
    expect(r.playedMidi).toBe(55);
    expect(r.wrongNotes).toEqual([52, 57]);
    expect(wrong).toEqual([52, 57]);
    expect(Math.abs(r.time - 1.5)).toBeLessThan(0.015);
    expect(Math.abs(r.cents - 6)).toBeLessThan(4);
    expect(r.heldMs).toBeGreaterThanOrEqual(60);
    expect(r.heldMs).toBeLessThan(200);
    // Everything is unsubscribed once it has resolved.
    expect(hub.has('pitch') || hub.has('noteon') || hub.has('level') || hub.has('noteoff')).toBe(false);
  });

  it('accepts any of several targets', async () => {
    const hub = new EventHub();
    const wait = waitForNote(hub, [60, 64, 67]);
    hub.emitAll(events(melody([{ midi: 62, at: 0.2 }, { midi: 64, at: 0.8 }], 1.5)));
    const r = await wait;
    expect(r).toMatchObject({ ok: true, midi: 64, wrongNotes: [62] });
  });

  it('is strict about the octave unless told otherwise', async () => {
    const audio = events(melody([{ midi: 52, at: 0.2, dur: 0.6 }], 1.2));
    const strictHub = new EventHub();
    const strict = waitForNote(strictHub, 64, { timeoutMs: 900 });
    strictHub.emitAll(audio);
    expect(await strict).toMatchObject({ ok: false, reason: 'timeout', wrongNotes: [52] });

    const lenientHub = new EventHub();
    const lenient = waitForNote(lenientHub, 64, { octaves: 'any', timeoutMs: 900 });
    lenientHub.emitAll(audio);
    expect(await lenient).toMatchObject({ ok: true, midi: 64, playedMidi: 52, wrongNotes: [] });
  });

  it('applies the cents tolerance', async () => {
    const audio = events(melody([{ midi: 57, at: 0.2, dur: 0.6, cents: -30 }], 1.2));
    const tightHub = new EventHub();
    const tight = waitForNote(tightHub, 57, { toleranceCents: 20, timeoutMs: 900 });
    tightHub.emitAll(audio);
    const t = await tight;
    expect(t).toMatchObject({ ok: false, reason: 'timeout' });
    // Out of tune is not a wrong note.
    expect(t.wrongNotes).toEqual([]);

    const looseHub = new EventHub();
    const loose = waitForNote(looseHub, 57, { toleranceCents: 40 });
    looseHub.emitAll(audio);
    const l = await loose;
    expect(l.ok).toBe(true);
    if (l.ok) expect(Math.abs(l.cents + 30)).toBeLessThan(4);
  });

  it('wants the note held for the minimum time', async () => {
    const hub = new EventHub();
    const wait = waitForNote(hub, 60, { minHoldMs: 300, timeoutMs: 2500 });
    // A 120 ms stab is not enough; the sustained note that follows is.
    hub.emitAll(events(melody([{ midi: 60, at: 0.2, dur: 0.12 }, { midi: 60, at: 1.0, dur: 0.8 }], 2.2)));
    const r = await wait;
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Math.abs(r.time - 1.0)).toBeLessThan(0.02);
      expect(r.heldMs).toBeGreaterThanOrEqual(300);
    }
  });

  it('times out on the audio clock when nothing is played', async () => {
    const hub = new EventHub();
    const wait = waitForNote(hub, 60, { timeoutMs: 800 });
    hub.emitAll(events(melody([], 2)));
    const r = await wait;
    expect(r).toMatchObject({ ok: false, reason: 'timeout', wrongNotes: [] });
    // 0.8 s after the first event, to the resolution of the level meter (about 33 ms).
    expect(r.time).toBeGreaterThan(0.8);
    expect(r.time).toBeLessThan(0.9);
    expect(hub.has('level')).toBe(false);
  });

  it('can be cancelled by call or by abort signal', async () => {
    const hub = new EventHub();
    const wait = waitForNote(hub, 60);
    wait.cancel();
    expect(await wait).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(hub.has('pitch')).toBe(false);

    const controller = new AbortController();
    const aborted = waitForNote(hub, 60, { signal: controller.signal });
    controller.abort();
    expect(await aborted).toMatchObject({ ok: false, reason: 'cancelled' });

    const already = waitForNote(hub, 60, { signal: controller.signal });
    expect(await already).toMatchObject({ ok: false, reason: 'cancelled' });
    // Cancelling after the fact is harmless.
    already.cancel();
  });
});

describe('waitForChord', () => {
  const C: ChordSpec = { name: 'C', pcs: [0, 4, 7], bass: 0 };
  const AM: ChordSpec = { name: 'Am', pcs: [9, 0, 4], bass: 9 };
  const chord = (midis: number[], seed: number): Float32Array =>
    strum({ freqs: midis.map((m) => midiToFreq(m)), sampleRate: SR, duration: 0.9, strumMs: 10, seed, attackNoise: 0.25, decay: 4 });
  const song = (parts: Array<{ midis: number[]; at: number }>, total: number): Float32Array => {
    let x = mix(silence(total, SR), whiteNoise(Math.round(total * SR), 0.0004, 5));
    parts.forEach((p, i) => {
      x = mix(x, chord(p.midis, i + 1), Math.round(p.at * SR)).subarray(0, Math.round(total * SR));
    });
    return x;
  };
  const C_SHAPE = [48, 52, 55, 60, 64];
  const AM_SHAPE = [45, 52, 57, 60, 64];

  it('resolves on the right chord and reports the strum time', async () => {
    const hub = new EventHub();
    const wait = waitForChord(hub, C);
    hub.emitAll(events(song([{ midis: C_SHAPE, at: 0.5 }], 1.6), true));
    const r = await wait;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.abs(r.time - 0.5)).toBeLessThan(0.02);
    expect(r.match.score).toBeGreaterThan(0.6);
    expect(r.match.missing).toEqual([]);
    expect(r.failedAttempts).toBe(0);
    expect(hub.has('chroma') || hub.has('onset') || hub.has('level')).toBe(false);
  });

  it('gives feedback on a wrong chord, then accepts the right one', async () => {
    const hub = new EventHub();
    const attempts: Array<{ missing: number[]; extra: number[]; score: number }> = [];
    const wait = waitForChord(hub, C, { rivals: [AM], onAttempt: (m) => attempts.push({ missing: m.missing, extra: m.extra, score: m.score }) });
    hub.emitAll(events(song([{ midis: AM_SHAPE, at: 0.4 }, { midis: C_SHAPE, at: 1.6 }], 2.8), true));
    const r = await wait;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.failedAttempts).toBe(1);
    expect(Math.abs(r.time - 1.6)).toBeLessThan(0.02);
    expect(attempts.length).toBe(1);
    // The A minor that was played has no G and has an A that C major does not.
    expect(attempts[0].missing).toEqual([7]);
    expect(attempts[0].extra).toEqual([9]);
    expect(attempts[0].score).toBeLessThan(0.6);
  });

  it('times out with the analysis of the last attempt', async () => {
    const hub = new EventHub();
    const wait = waitForChord(hub, C, { timeoutMs: 1800 });
    hub.emitAll(events(song([{ midis: AM_SHAPE, at: 0.4 }], 2.5), true));
    const r = await wait;
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('timeout');
    expect(r.failedAttempts).toBe(1);
    expect(r.lastAttempt?.missing).toEqual([7]);
    expect(pitchClassesOf(AM_SHAPE)).toEqual([0, 4, 9]);
  });

  it('can judge a chord that is already ringing, without waiting for a strum', async () => {
    const audio = events(song([{ midis: C_SHAPE, at: 0.1 }], 1.2), true).filter((e) => e.time > 0.6);
    const strictHub = new EventHub();
    const strict = waitForChord(strictHub, C, { timeoutMs: 400 });
    strictHub.emitAll(audio);
    expect(await strict).toMatchObject({ ok: false, reason: 'timeout' });

    const openHub = new EventHub();
    const open = waitForChord(openHub, C, { requireOnset: false });
    openHub.emitAll(audio);
    expect((await open).ok).toBe(true);
    const cancelled = waitForChord(openHub, C);
    cancelled.cancel();
    expect(await cancelled).toMatchObject({ ok: false, reason: 'cancelled', lastAttempt: null });
  });
});

describe('NoteRecorder', () => {
  it('records what was played, with timing and intonation, and drops blips', () => {
    const hub = new EventHub();
    const heard: number[] = [];
    const rec = new NoteRecorder(hub, { onNote: (n) => heard.push(n.midi) });
    expect(rec.recording).toBe(false);
    rec.start();
    expect(rec.recording).toBe(true);
    const tune: Played[] = [
      { midi: 60, at: 0.3, dur: 0.35 },
      { midi: 62, at: 0.75, dur: 0.35, cents: 12 },
      { midi: 64, at: 1.2, dur: 0.02 }, // a 20 ms accident: too short to count
      { midi: 65, at: 1.5, dur: 0.6 },
    ];
    hub.emitAll(events(melody(tune, 2.0)).filter((e) => e.time < 1.9));
    // The last note is still sounding when the take is stopped.
    expect(rec.notes.map((n) => n.midi)).toEqual([60, 62]);
    const take: RecordedNote[] = rec.stop();
    expect(rec.recording).toBe(false);
    expect(take.map((n) => n.midi)).toEqual([60, 62, 65]);
    expect(heard).toEqual([60, 62, 65]);
    expect(Math.abs(take[0].start - 0.3)).toBeLessThan(0.015);
    expect(Math.abs(take[0].duration - 0.35)).toBeLessThan(0.07);
    expect(Math.abs(take[1].cents - 12)).toBeLessThan(2);
    expect(take[2].end).toBeGreaterThan(1.85);
    expect(take[0].levelDb).toBeLessThan(0);
    // Nothing is recorded after stop; start() begins a fresh take.
    hub.emitAll(events(melody([{ midi: 67, at: 0.2 }], 0.8)));
    expect(rec.notes.length).toBe(3);
    rec.start();
    expect(rec.notes.length).toBe(0);
    rec.stop();
  });

  it('checks a scale run end to end', () => {
    const scale = [57, 59, 60, 62, 64, 65, 67, 69];
    const hub = new EventHub();
    const rec = new NoteRecorder(hub);
    rec.start();
    // The learner plays A minor but slips to F sharp instead of F.
    const playedNotes = scale.map((m) => (m === 65 ? 66 : m));
    hub.emitAll(events(melody(playedNotes.map((midi, i) => ({ midi, at: 0.3 + i * 0.4, dur: 0.33 })), 3.8)));
    const result = compareNotes(rec.stop(), scale);
    expect(result.correct).toBe(7);
    expect(result.missed).toEqual([5]);
    expect(result.extra).toEqual([5]);
    expect(result.perfect).toBe(false);
    expect(result.accuracy).toBeCloseTo(7 / 8, 6);
    expect(result.alignment[5]).toEqual({ expected: 5, played: 5, kind: 'wrong' });
  });
});

describe('compareNotes', () => {
  const expected = [60, 62, 64, 65, 67];

  it('recognises a perfect run', () => {
    const r = compareNotes(expected, expected);
    expect(r).toMatchObject({ correct: 5, missed: [], extra: [], accuracy: 1, perfect: true });
    expect(r.alignment.every((a) => a.kind === 'match')).toBe(true);
  });

  it('keeps everything after a skipped note aligned', () => {
    const r = compareNotes([60, 62, 65, 67], expected);
    expect(r).toMatchObject({ correct: 4, missed: [2], extra: [], perfect: false });
    expect(r.accuracy).toBeCloseTo(0.8, 6);
  });

  it('keeps everything after an added note aligned', () => {
    const r = compareNotes([60, 62, 63, 64, 65, 67], expected);
    expect(r).toMatchObject({ correct: 5, missed: [], extra: [2], perfect: false, accuracy: 1 });
  });

  it('can ignore the octave', () => {
    const lower = expected.map((m) => m - 12);
    expect(compareNotes(lower, expected).correct).toBe(0);
    expect(compareNotes(lower, expected, { octaves: 'any' }).perfect).toBe(true);
  });

  it('handles empty sequences', () => {
    expect(compareNotes([], [])).toMatchObject({ correct: 0, accuracy: 1, perfect: true });
    expect(compareNotes([], expected)).toMatchObject({ correct: 0, missed: [0, 1, 2, 3, 4], accuracy: 0 });
    expect(compareNotes([60], [])).toMatchObject({ extra: [0], accuracy: 0, perfect: false });
  });
});
