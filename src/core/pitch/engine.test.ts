/**
 * Tracker logic end to end, on simulated streams: synthetic audio goes through the same engine
 * the live pipeline runs (rumble filter, onset detector, pitch detector, note tracker).
 */
import { describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { analyze, PitchEngine } from './engine';
import { addHum, addNoise, harmonicTone, mix, pluckedString, type PluckOptions, seededRandom, silence, whiteNoise } from './signals';
import type { LevelEvent, NoteOffEvent, NoteOnEvent, PitchEvent, PitchReading } from './types';

const SR = 44100;

const of = <T extends PitchEvent['type']>(events: PitchEvent[], type: T): Extract<PitchEvent, { type: T }>[] =>
  events.filter((e): e is Extract<PitchEvent, { type: T }> => e.type === type);

interface Played {
  midi: number;
  at: number;
  /** Seconds the string sounds before it is damped; omit to let it ring. */
  dur?: number;
  cents?: number;
  amplitude?: number;
}

/** Lay plucked notes on a timeline. Damped notes get a short fade so the cut is not a click. */
function timeline(notes: Played[], total: number, extra: Partial<PluckOptions> = {}, sr = SR): Float32Array {
  let x = silence(total, sr);
  notes.forEach((n, i) => {
    const freq = midiToFreq(n.midi) * Math.pow(2, (n.cents ?? 0) / 1200);
    const p = pluckedString({
      freq,
      sampleRate: sr,
      duration: Math.min(n.dur ?? total - n.at, total - n.at),
      amplitude: n.amplitude ?? 0.4,
      attackNoise: 0.3,
      driftCents: 8,
      seed: 10 + i,
      ...extra,
    });
    if (n.dur !== undefined) {
      const fade = Math.min(p.length, Math.round(0.025 * sr));
      for (let k = 0; k < fade; k++) p[p.length - 1 - k] *= k / fade;
    }
    x = mix(x, p, Math.round(n.at * sr)).subarray(0, Math.round(total * sr));
  });
  return x;
}

const OPEN = [40, 45, 50, 55, 59, 64];

describe('PitchEngine: notes on and off', () => {
  it('follows a sequence of damped notes: one note-on and one note-off each, timed to the pluck', () => {
    const notes = OPEN.map((midi, i) => ({ midi, at: 0.3 + i * 0.6, dur: 0.5, cents: i * 3 - 6 }));
    const x = addNoise(timeline(notes, 4.2), 45, 2, Math.round(0.3 * SR));
    const ev = analyze(x, SR);
    const ons = of(ev, 'noteon');
    const offs = of(ev, 'noteoff');
    expect(ons.map((e) => e.midi)).toEqual(OPEN);
    expect(offs.map((e) => e.midi)).toEqual(OPEN);
    ons.forEach((on, i) => {
      expect(Math.abs(on.time - notes[i].at), `start of note ${i}`).toBeLessThan(0.012);
      expect(on.detectedAt - notes[i].at, `latency of note ${i}`).toBeLessThan(i === 0 ? 0.09 : 0.065);
      expect(on.retrigger).toBe(false);
      // The note ends when the string is damped (0.5 s after the pluck), give or take the release time.
      expect(Math.abs(offs[i].time - (notes[i].at + 0.5))).toBeLessThan(0.06);
      expect(offs[i].duration).toBeCloseTo(offs[i].time - on.time, 6);
    });
    // Settled readings sit on the true pitch.
    notes.forEach((n) => {
      const settled = of(ev, 'pitch').filter((p) => p.midi === n.midi && p.noteAge > 0.2 && p.noteAge < 0.45);
      expect(settled.length).toBeGreaterThan(15);
      for (const p of settled) expect(Math.abs(p.cents - n.cents)).toBeLessThan(1.5);
    });
    // Events come out in time order per type and every reading belongs to a sounding note.
    const times = of(ev, 'pitch').map((p) => p.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('follows notes that are left ringing into each other', () => {
    // Nothing is damped: each new pluck lands on top of the previous strings (a scale across open strings and frets).
    const seq = [40, 43, 45, 47, 48, 50, 52, 55, 57, 59, 60, 64];
    const notes = seq.map((midi, i) => ({ midi, at: 0.3 + i * 0.4 }));
    const x = addNoise(timeline(notes, 5.6, { decay: 2.5 }), 40, 4, Math.round(0.3 * SR));
    const ev = analyze(x, SR);
    expect(of(ev, 'noteon').map((e) => e.midi)).toEqual(seq);
    of(ev, 'noteon').forEach((on, i) => expect(Math.abs(on.time - notes[i].at)).toBeLessThan(0.015));
  });

  it('restarts a note that is plucked again while it rings', () => {
    const notes = [0, 1, 2, 3, 4].map((i) => ({ midi: 55, at: 0.3 + i * 0.35 }));
    const ev = analyze(timeline(notes, 2.4), SR);
    const ons = of(ev, 'noteon');
    expect(ons.map((e) => e.midi)).toEqual([55, 55, 55, 55, 55]);
    expect(ons.map((e) => e.retrigger)).toEqual([false, true, true, true, true]);
    ons.forEach((on, i) => expect(Math.abs(on.time - notes[i].at)).toBeLessThan(0.012));
    // Each restart closes the previous note first.
    const order = ev.filter((e) => e.type === 'noteon' || e.type === 'noteoff').map((e) => e.type);
    expect(order.slice(0, 9)).toEqual(['noteon', 'noteoff', 'noteon', 'noteoff', 'noteon', 'noteoff', 'noteon', 'noteoff', 'noteon']);
    // With retrigger off the five plucks are one long note.
    const merged = analyze(timeline(notes, 2.4), SR, { tracker: { retrigger: false } });
    expect(of(merged, 'noteon').length).toBe(1);
  });

  it('follows a legato change (hammer-on) with no pluck', () => {
    // A3 sounding, then the pitch simply becomes B3: no pick noise, no level jump.
    const a = harmonicTone({ freq: midiToFreq(57), sampleRate: SR, duration: 0.6, harmonics: 6, amplitude: 0.3, seed: 1 });
    const b = harmonicTone({ freq: midiToFreq(59), sampleRate: SR, duration: 0.6, harmonics: 6, amplitude: 0.3, seed: 2 });
    // Crossfade over 8 ms so there is no click to trigger the onset detector.
    const fade = Math.round(0.008 * SR);
    const x = new Float32Array(a.length + b.length - fade);
    x.set(a.subarray(0, a.length - fade));
    for (let i = 0; i < fade; i++) x[a.length - fade + i] = a[a.length - fade + i] * (1 - i / fade) + b[i] * (i / fade);
    x.set(b.subarray(fade), a.length);
    const ev = analyze(mix(silence(1.6, SR), x, Math.round(0.2 * SR)), SR);
    const ons = of(ev, 'noteon');
    expect(ons.map((e) => e.midi)).toEqual([57, 59]);
    expect(ons[1].retrigger).toBe(false);
    const change = 0.2 + 0.6;
    expect(Math.abs(ons[1].time - change)).toBeLessThan(0.04);
    expect(ons[1].detectedAt - change).toBeLessThan(0.09);
    expect(of(ev, 'noteoff')[0].midi).toBe(57);
  });

  it('tracks a slide through the semitones it passes', () => {
    // A glide from A3 up a whole tone over 300 ms, then held.
    const n = Math.round(1.2 * SR);
    const x = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const semis = Math.min(2, Math.max(0, (t - 0.4) / 0.3) * 2);
      const f = midiToFreq(57) * Math.pow(2, semis / 12);
      phase += (2 * Math.PI * f) / SR;
      x[i] = 0.25 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase)) * Math.min(1, i / 400);
    }
    const ev = analyze(x, SR);
    const mids = of(ev, 'noteon').map((e) => e.midi);
    expect(mids[0]).toBe(57);
    expect(mids[mids.length - 1]).toBe(59);
    expect(mids.every((m) => m >= 57 && m <= 59)).toBe(true);
    const last = of(ev, 'pitch').filter((p) => p.time > 1.0);
    for (const p of last) expect(Math.abs(p.cents)).toBeLessThan(1);
  });

  it('keeps the needle still through a hard pick attack', () => {
    for (const midi of [40, 52, 64, 76]) {
      const x = timeline([{ midi, at: 0.3, cents: 5 }], 1.3, { attackNoise: 0.9, attackNoiseMs: 12, driftCents: 10 });
      const ev = analyze(x, SR);
      expect(of(ev, 'noteon').map((e) => e.midi), `midi ${midi}`).toEqual([midi]);
      const readings = of(ev, 'pitch');
      // From the very first reading the pitch is within the pluck's own initial sharpness of the final value.
      for (const p of readings) expect(Math.abs(p.cents - 5), `midi ${midi} at age ${p.noteAge}`).toBeLessThan(11);
      for (const p of readings.filter((r) => r.noteAge > 0.15)) expect(Math.abs(p.cents - 5)).toBeLessThan(2);
    }
  });

  it('does not change note when a detector frame slips an octave', () => {
    // E2 whose odd partials fade faster than the even ones: late in the note single frames can read E3.
    const dur = 2.0;
    const odd = pluckedString({ freq: midiToFreq(40), sampleRate: SR, duration: dur, amplitude: 0.3, decay: 2.6, decayTilt: 0, pluckPosition: 0.5, seed: 3 });
    const even = pluckedString({ freq: midiToFreq(52), sampleRate: SR, duration: dur, amplitude: 0.3, decay: 0.9, decayTilt: 0, seed: 4 });
    const ev = analyze(mix(silence(dur + 0.4, SR), mix(odd, even), Math.round(0.2 * SR)), SR);
    const ons = of(ev, 'noteon');
    expect(ons[0].midi).toBe(40);
    // It stays E2 for at least the first second, while the odd partials are still audible.
    expect(ons.filter((e) => e.time < 1.2).length).toBe(1);
    expect(of(ev, 'pitch').filter((p) => p.time < 1.2).every((p) => p.midi === 40)).toBe(true);
  });
});

describe('PitchEngine: playing styles', () => {
  it('keeps up with a fast run (ten notes a second)', () => {
    const run = [57, 59, 60, 62, 64, 62, 60, 59, 57, 55, 57, 59, 60, 62, 64, 65];
    const notes = run.map((midi, i) => ({ midi, at: 0.3 + i * 0.1, dur: 0.095 }));
    const ev = analyze(timeline(notes, 2.3), SR);
    const ons = of(ev, 'noteon');
    expect(ons.map((e) => e.midi)).toEqual(run);
    ons.forEach((on, i) => expect(Math.abs(on.time - notes[i].at)).toBeLessThan(0.012));
  });

  it('follows vibrato as one note', () => {
    // A4 with +/-25 cents of vibrato at 5.5 Hz.
    const n = Math.round(2 * SR);
    const x = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = 440 * Math.pow(2, (25 * Math.sin(2 * Math.PI * 5.5 * t)) / 1200);
      phase += (2 * Math.PI * f) / SR;
      const env = Math.min(1, i / 300) * Math.exp(-0.8 * t);
      x[i] = 0.3 * env * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
    }
    const ev = analyze(x, SR);
    expect(of(ev, 'noteon').map((e) => e.midi)).toEqual([69]);
    const readings = of(ev, 'pitch').filter((p) => p.time > 0.3);
    const cents = readings.map((p) => p.cents);
    // The reading swings with the vibrato (a window averages a little of it away) and stays centred.
    expect(Math.max(...cents)).toBeGreaterThan(17);
    expect(Math.max(...cents)).toBeLessThan(27);
    expect(Math.min(...cents)).toBeLessThan(-17);
    expect(Math.abs(cents.reduce((a, b) => a + b, 0) / cents.length)).toBeLessThan(2);
  });

  it('reads a low E that is plucked again and again through a small microphone as E2 every time', () => {
    // The tuner scenario: the open sixth string, a phone microphone, the learner plucking repeatedly.
    for (const seed of [1, 2, 3]) {
      const notes = [0, 1, 2, 3, 4, 5].map((i) => ({ midi: 40, at: 0.3 + i * 0.7, cents: -18 }));
      let x = timeline(notes, 4.8, { highpassHz: 220, highpassOrder: 4, inharmonicity: 6e-5, seed, pluckPosition: 0.1 + 0.05 * seed });
      x = addNoise(x, 30, seed, Math.round(0.3 * SR));
      const ev = analyze(x, SR);
      const ons = of(ev, 'noteon');
      expect(ons.map((e) => e.midi), `take ${seed}`).toEqual([40, 40, 40, 40, 40, 40]);
      expect(of(ev, 'pitch').every((p) => p.midi === 40)).toBe(true);
      for (const p of of(ev, 'pitch').filter((r) => r.noteAge > 0.25)) expect(Math.abs(p.cents + 18)).toBeLessThan(2.5);
    }
  });

  it('copes with a bend up a whole tone and back', () => {
    const n = Math.round(2.4 * SR);
    const x = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      // Up over 0.4 s, hold, down over 0.4 s.
      const up = Math.min(1, Math.max(0, (t - 0.5) / 0.4));
      const down = Math.min(1, Math.max(0, (t - 1.4) / 0.4));
      const f = midiToFreq(62) * Math.pow(2, (2 * (up - down)) / 12);
      phase += (2 * Math.PI * f) / SR;
      x[i] = 0.3 * Math.min(1, i / 300) * (Math.sin(phase) + 0.6 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase) + 0.2 * Math.sin(4 * phase));
    }
    const ev = analyze(x, SR);
    const mids = of(ev, 'noteon').map((e) => e.midi);
    expect(mids[0]).toBe(62);
    expect(mids).toContain(64);
    expect(mids[mids.length - 1]).toBe(62);
    expect(mids.every((m) => m >= 62 && m <= 64)).toBe(true);
    // No reading ever leaves the range the string actually covered.
    for (const p of of(ev, 'pitch')) {
      const semis = p.midi + p.cents / 100;
      expect(semis).toBeGreaterThan(61.8);
      expect(semis).toBeLessThan(64.2);
    }
  });
});

describe('PitchEngine: silence, noise, hum and level', () => {
  it('reports silence once per quiet stretch and no notes in room noise', () => {
    const x = mix(whiteNoise(Math.round(3 * SR), 0.003, 5), timeline([{ midi: 57, at: 1.0, dur: 0.5 }], 3));
    const ev = analyze(x, SR);
    expect(of(ev, 'noteon').map((e) => e.midi)).toEqual([57]);
    const sil = of(ev, 'silence');
    expect(sil.length).toBe(2);
    expect(sil[0].time).toBeLessThan(0.5);
    expect(sil[1].time).toBeGreaterThan(1.5);
    expect(sil[1].time).toBeLessThan(2.1);
  });

  it('never invents notes from noise alone, quiet or loud', () => {
    for (const rms of [0.001, 0.02, 0.2]) {
      const ev = analyze(whiteNoise(Math.round(4 * SR), rms, 8), SR);
      expect(of(ev, 'noteon').length, `noise rms ${rms}`).toBe(0);
      expect(of(ev, 'pitch').length).toBe(0);
    }
  });

  it('adapts the gate to the room and still hears a note above it', () => {
    const noise = whiteNoise(Math.round(4 * SR), 0.004, 3); // about -48 dBFS
    const x = mix(noise, timeline([{ midi: 45, at: 3.0, dur: 0.6, amplitude: 0.2 }], 4));
    const ev = analyze(x, SR);
    const levels = of(ev, 'level');
    const late = levels.filter((l) => l.time > 2 && l.time < 2.9);
    for (const l of late) {
      expect(l.noiseFloorDb).toBeGreaterThan(-52);
      expect(l.noiseFloorDb).toBeLessThan(-45);
      expect(l.gateDb).toBeCloseTo(Math.min(-38, l.noiseFloorDb + 8), 5);
    }
    expect(of(ev, 'noteon').map((e) => e.midi)).toEqual([45]);
  });

  it('ignores mains hum that is there from the start', () => {
    for (const mains of [50, 60]) {
      const hum = addHum(silence(4, SR), SR, { freq: mains, rms: 0.004 });
      const x = mix(hum, timeline([{ midi: 43, at: 2.5, dur: 0.8 }], 4));
      const ev = analyze(x, SR);
      expect(of(ev, 'noteon').map((e) => e.midi), `${mains} Hz`).toEqual([43]);
      const settled = of(ev, 'pitch').filter((p) => p.noteAge > 0.2 && p.noteAge < 0.6);
      for (const p of settled) expect(Math.abs(p.cents)).toBeLessThan(2);
    }
  });

  it('recognises hum that starts later as hum, flags it, and keeps hearing the guitar', () => {
    // Rectifier buzz: a clean 100 Hz series, which on its own looks exactly like a slightly sharp G2.
    const hum = addHum(silence(8, SR), SR, { freq: 100, rms: 0.003, harmonics: [1, 0.5, 0.3] });
    const x = new Float32Array(Math.round(8.5 * SR));
    x.set(hum, Math.round(0.5 * SR));
    const ev = analyze(mix(x, timeline([{ midi: 52, at: 6.5, dur: 0.8 }], 8.5)), SR);
    const ons = of(ev, 'noteon');
    // The hum is taken for a note at first, but only once, and it is dropped within about 3 s.
    const humNotes = ons.filter((e) => e.time < 6);
    expect(humNotes.map((e) => e.midi)).toEqual([43]);
    const humOff = of(ev, 'noteoff').filter((e) => e.time < 6);
    expect(humOff.length).toBe(1);
    expect(humOff[0].time).toBeLessThan(3.8);
    const levels = of(ev, 'level');
    expect(levels.filter((l) => l.time > 4 && l.time < 6.4).every((l) => l.hum)).toBe(true);
    expect(levels.filter((l) => l.time < 0.4).some((l) => l.hum)).toBe(false);
    // From then on the gate sits above the hum...
    for (const l of levels.filter((v) => v.time > 4 && v.time < 6.4)) expect(l.gateDb).toBeGreaterThan(l.db + 4);
    // ...and the real note is still found, in tune.
    expect(ons.filter((e) => e.time > 6).map((e) => e.midi)).toEqual([52]);
    for (const p of of(ev, 'pitch').filter((r) => r.midi === 52 && r.noteAge > 0.2 && r.noteAge < 0.6)) {
      expect(Math.abs(p.cents)).toBeLessThan(2);
    }
  });

  it('never takes ordinary 50 Hz hum for a note, and learns its level as the floor', () => {
    const hum = addHum(silence(6, SR), SR, { freq: 50, rms: 0.003, harmonics: [0.3, 1, 0.4] });
    const x = new Float32Array(Math.round(6.5 * SR));
    x.set(hum, Math.round(0.5 * SR));
    const ev = analyze(x, SR);
    expect(of(ev, 'noteon').length).toBe(0);
    const late = of(ev, 'level').filter((l) => l.time > 4);
    for (const l of late) expect(Math.abs(l.noiseFloorDb - l.db)).toBeLessThan(3);
  });

  it('meters the level about 30 times a second and warns about clipping', () => {
    const tone = harmonicTone({ freq: 220, sampleRate: SR, duration: 2, amplitude: 0.5, harmonics: 3 });
    const ev = analyze(tone, SR);
    const levels = of(ev, 'level');
    expect(levels.length).toBeGreaterThan(55);
    expect(levels.length).toBeLessThan(75);
    const mid: LevelEvent = levels[30];
    expect(mid.peak).toBeGreaterThan(0.45);
    expect(mid.peak).toBeLessThanOrEqual(0.5001);
    expect(mid.db).toBeGreaterThan(-12);
    expect(mid.db).toBeLessThan(-6);
    expect(levels.some((l) => l.clipping)).toBe(false);

    const hot = tone.map((v) => Math.max(-1, Math.min(1, v * 4)));
    const clipped = of(analyze(hot, SR), 'level');
    expect(clipped.filter((l) => l.time > 0.2).every((l) => l.clipping)).toBe(true);
  });
});

describe('PitchEngine: configuration and streaming', () => {
  it('gives identical events however the audio is chunked', () => {
    const notes = [{ midi: 40, at: 0.2, dur: 0.5 }, { midi: 59, at: 0.8, dur: 0.4 }, { midi: 59, at: 1.3 }];
    const x = addNoise(timeline(notes, 2.2), 40, 9, Math.round(0.2 * SR));
    const summary = (ev: PitchEvent[]): string =>
      JSON.stringify(ev.filter((e) => e.type !== 'level').map((e) => [e.type, e.time.toFixed(6), 'midi' in e ? e.midi : 0, 'cents' in e ? e.cents.toFixed(4) : '']));
    const base = summary(analyze(x, SR, { chunk: 256 }));
    for (const chunk of [128, 441, 1000, 4096]) expect(summary(analyze(x, SR, { chunk })), `chunk ${chunk}`).toBe(base);
    // Irregular delivery (buffer jitter): chunks of random size.
    const rand = seededRandom(4);
    const engine = new PitchEngine({ sampleRate: SR });
    const out: PitchEvent[] = [];
    for (let i = 0; i < x.length; ) {
      const size = 1 + Math.floor(rand() * 3000);
      out.push(...engine.process(x.subarray(i, Math.min(x.length, i + size))));
      i += size;
    }
    expect(summary(out)).toBe(base);
  });

  it('stamps events on the caller clock and restarts cleanly after a gap', () => {
    const x = timeline([{ midi: 50, at: 0.1 }], 0.7);
    const engine = new PitchEngine({ sampleRate: SR });
    const out: PitchEvent[] = [];
    const t0 = 100;
    for (let i = 0; i < x.length; i += 256) out.push(...engine.process(x.subarray(i, i + 256), t0 + i / SR));
    const on = of(out, 'noteon')[0];
    expect(on.midi).toBe(50);
    expect(on.time).toBeCloseTo(100.1, 1);
    expect(engine.time).toBeCloseTo(100.7, 3);
    // Half a second of audio went missing: the sounding note is closed and analysis starts afresh at the new time.
    const y = timeline([{ midi: 57, at: 0.1 }], 0.6);
    const after: PitchEvent[] = [];
    for (let i = 0; i < y.length; i += 256) after.push(...engine.process(y.subarray(i, i + 256), 101.2 + i / SR));
    expect(after[0].type).toBe('noteoff');
    const on2 = of(after, 'noteon')[0];
    expect(on2.midi).toBe(57);
    expect(on2.time).toBeCloseTo(101.3, 1);
    // A glitch of a few samples only moves the clock: the note keeps sounding.
    const steady = new PitchEngine({ sampleRate: SR });
    const w = timeline([{ midi: 57, at: 0.1 }], 1.2);
    const half = 256 * 100;
    const heard: PitchEvent[] = [];
    for (let i = 0; i < w.length; i += 256) {
      heard.push(...steady.process(w.subarray(i, i + 256), 50 + i / SR + (i >= half ? 0.002 : 0)));
    }
    expect(of(heard, 'noteon').length).toBe(1);
    expect(of(heard, 'noteoff').length).toBe(0);
    expect(steady.time).toBeCloseTo(50 + 1.2 + 0.002, 3);
    // reset() closes a sounding note too.
    const closing = engine.reset();
    expect(closing.map((e) => e.type)).toEqual(['noteoff']);
    expect(engine.time).toBe(0);
  });

  it('honours the A4 reference, live', () => {
    const tone = harmonicTone({ freq: 442, sampleRate: SR, duration: 0.6, harmonics: 4, amplitude: 0.3 });
    const engine = new PitchEngine({ sampleRate: SR, a4: 442 });
    const first = of(engine.process(tone), 'pitch');
    expect(first[first.length - 1].midi).toBe(69);
    expect(Math.abs(first[first.length - 1].cents)).toBeLessThan(0.1);
    engine.configure({ a4: 440 });
    const second = of(engine.process(tone), 'pitch');
    // The phase jumps where the buffer repeats, so look at the settled end.
    const last: PitchReading = second[second.length - 1];
    expect(last.cents).toBeCloseTo(1200 * Math.log2(442 / 440), 0);
  });

  it('tracks a bass when the range is opened, and switching range restarts cleanly', () => {
    const x = timeline([{ midi: 28, at: 0.2, dur: 0.9 }, { midi: 33, at: 1.2 }], 2.2, { decay: 0.8 });
    const bass = analyze(x, SR, { minFreq: 30 });
    expect(of(bass, 'noteon').map((e) => e.midi)).toEqual([28, 33]);
    for (const p of of(bass, 'pitch').filter((r) => r.noteAge > 0.25)) expect(Math.abs(p.cents)).toBeLessThan(2);
    // Left ringing, the low E does not get a false restart when the A is plucked over it.
    const ringing = analyze(timeline([{ midi: 28, at: 0.2 }, { midi: 33, at: 1.2 }], 2.2, { decay: 0.8 }), SR, { minFreq: 30 });
    expect(of(ringing, 'noteon').map((e) => e.midi)).toEqual([28, 33]);
    const engine = new PitchEngine({ sampleRate: SR });
    engine.process(timeline([{ midi: 45, at: 0.05 }], 0.4));
    const closed = engine.configure({ minFreq: 30 });
    expect(closed.map((e) => e.type)).toEqual(['noteoff']);
    const again = of(engine.process(x), 'noteon');
    expect(again.map((e) => e.midi)).toEqual([28, 33]);
  });

  it('works at 48 kHz, 22.05 kHz and 96 kHz', () => {
    for (const sr of [48000, 22050, 96000]) {
      const notes: Played[] = [{ midi: 40, at: 0.2, dur: 0.5 }, { midi: 64, at: 0.9, dur: 0.5, cents: -12 }];
      const ev = analyze(timeline(notes, 1.6, {}, sr), sr);
      const ons: NoteOnEvent[] = of(ev, 'noteon');
      const offs: NoteOffEvent[] = of(ev, 'noteoff');
      expect(ons.map((e) => e.midi), `sr ${sr}`).toEqual([40, 64]);
      expect(offs.length).toBe(2);
      const settled = of(ev, 'pitch').filter((p) => p.midi === 64 && p.noteAge > 0.2);
      for (const p of settled) expect(Math.abs(p.cents + 12)).toBeLessThan(1.5);
    }
  });

  it('survives a realistic phone-microphone scale run', () => {
    // C major up and down in first position, strings ringing, small-mic roll-off, room noise and hum.
    const scale = [48, 50, 52, 53, 55, 57, 59, 60, 59, 57, 55, 53, 52, 50, 48];
    const notes = scale.map((midi, i) => ({ midi, at: 0.4 + i * 0.33 }));
    const total = 0.4 + scale.length * 0.33 + 0.6;
    let x = timeline(notes, total, { highpassHz: 200, highpassOrder: 3, inharmonicity: 6e-5, decay: 3 });
    x = addHum(addNoise(x, 30, 12, Math.round(0.4 * SR)), SR, { freq: 50, rms: 0.002 });
    const ev = analyze(x, SR);
    expect(of(ev, 'noteon').map((e) => e.midi)).toEqual(scale);
  });
});
