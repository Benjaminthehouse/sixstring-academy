/**
 * Response time: how long after a pluck the pipeline knows the note, and how long until a tuner
 * needle driven by it has settled. Measured on the audio clock of an offline run, so it is the
 * latency the analysis itself adds (capture and delivery latency come on top when live).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { centsBetween, midiToFreq, midiToName } from '@/core/math/pitch-math';
import { analyze } from './engine';
import { addNoise, mix, pluckedString, type PluckOptions, silence, whiteNoise } from './signals';
import { Tuner } from './tuner';

const SR = 44100;
const PLUCK_AT = 0.4;
const DETUNE = 7;

interface Timing {
  onsetError: number;
  noteOn: number;
  firstReading: number;
  within5: number;
  tuner2: number;
  tuner1: number;
}

/** One pluck after 0.4 s of room noise; all times in ms after the pluck. */
function measure(midi: number, extra: Partial<PluckOptions>, snrDb: number, seed: number): Timing {
  const truth = midiToFreq(midi) * Math.pow(2, DETUNE / 1200);
  const p = pluckedString({ freq: truth, sampleRate: SR, duration: 1.2, amplitude: 0.4, seed, ...extra });
  let x = mix(mix(silence(1.7, SR), whiteNoise(Math.round(1.7 * SR), 0.0005, seed)), p, Math.round(PLUCK_AT * SR));
  x = addNoise(x, snrDb, seed + 1, Math.round(PLUCK_AT * SR));
  const events = analyze(x, SR);
  const ms = (t: number): number => (t - PLUCK_AT) * 1000;
  const onset = events.find((e) => e.type === 'onset');
  const on = events.find((e) => e.type === 'noteon');
  const readings = events.filter((e) => e.type === 'pitch');
  if (!onset || !on || on.type !== 'noteon' || readings.length === 0) throw new Error(`nothing detected for midi ${midi}`);
  expect(on.midi).toBe(midi);

  const err = (freq: number): number => Math.abs(centsBetween(freq, truth));
  // "Settled within x" = the first reading after which every later reading (for 0.6 s) stays within x cents.
  const settled = (values: Array<{ time: number; err: number }>, limit: number): number => {
    let last = -1;
    values.forEach((v, i) => {
      if (v.time < PLUCK_AT + 0.75 && v.err > limit) last = i;
    });
    return ms(values[Math.min(values.length - 1, last + 1)].time);
  };
  const raw = readings.map((r) => (r.type === 'pitch' ? { time: r.time, err: err(r.freq) } : { time: 0, err: 0 }));
  const tuner = new Tuner({ mode: 'chromatic' });
  const needle = readings.map((r) => {
    const s = r.type === 'pitch' ? tuner.update(r) : tuner.state;
    return { time: r.time, err: Math.abs(s.cents - DETUNE) };
  });
  return {
    onsetError: ms(onset.time),
    noteOn: ms(on.detectedAt),
    firstReading: ms(readings[0].time),
    within5: settled(raw, 5),
    tuner2: settled(needle, 2),
    tuner1: settled(needle, 1),
  };
}

const NOTES = [40, 45, 50, 55, 59, 64, 76, 88];
const table: string[] = [];
afterAll(() => {
  process.stdout.write(
    `\nResponse time, ms after the pluck (median of 5 takes; analysis latency only)\n${'pluck'.padEnd(34)} ${'note'.padEnd(4)} ${'onset err'.padStart(9)} ${'note-on'.padStart(8)} ${'+/-5 c'.padStart(7)} ${'needle +/-2 c'.padStart(14)} ${'needle +/-1 c'.padStart(14)}\n${'-'.repeat(96)}\n${table.join('\n')}\n\n`,
  );
});

function row(label: string, midi: number, extra: Partial<PluckOptions>, snrDb: number): Timing {
  const takes = [1, 2, 3, 4, 5].map((seed) => measure(midi, extra, snrDb, seed));
  const med = (key: keyof Timing): number => takes.map((t) => t[key]).sort((a, b) => a - b)[2];
  const t: Timing = {
    onsetError: med('onsetError'),
    noteOn: med('noteOn'),
    firstReading: med('firstReading'),
    within5: med('within5'),
    tuner2: med('tuner2'),
    tuner1: med('tuner1'),
  };
  table.push(
    `${label.padEnd(34)} ${midiToName(midi).padEnd(4)} ${t.onsetError.toFixed(1).padStart(9)} ${t.noteOn.toFixed(0).padStart(8)} ${t.within5.toFixed(0).padStart(7)} ${t.tuner2.toFixed(0).padStart(14)} ${t.tuner1.toFixed(0).padStart(14)}`,
  );
  return t;
}

describe('response time', () => {
  it('knows the note within 70 ms of a clean pluck (90 ms for the low E), and the needle settles within 150 ms', () => {
    for (const midi of NOTES) {
      const t = row('clean pick, no pitch drift', midi, { attackNoise: 0.3 }, 60);
      expect(Math.abs(t.onsetError), `${midi}: onset`).toBeLessThan(6);
      expect(t.noteOn, `${midi}: note-on`).toBeLessThan(midi <= 40 ? 90 : 70);
      expect(t.within5, `${midi}: reading within 5 cents`).toBeLessThan(midi <= 40 ? 90 : 70);
      expect(t.tuner2, `${midi}: needle within 2 cents`).toBeLessThan(150);
      expect(t.tuner1, `${midi}: needle within 1 cent`).toBeLessThan(150);
    }
  }, 60_000);

  it('follows the string as it settles after a hard pluck', () => {
    // The string really is sharp at first (12 cents, relaxing with a 40 ms time constant). The needle
    // shows that honestly; what matters is that it never overshoots and lands within 250 ms.
    for (const midi of NOTES) {
      const t = row('hard pick, string 12 c sharp at first', midi, { attackNoise: 0.6, driftCents: 12, driftMs: 40 }, 60);
      expect(t.noteOn, `${midi}: note-on`).toBeLessThan(midi <= 40 ? 95 : 75);
      expect(t.tuner2, `${midi}: needle within 2 cents`).toBeLessThan(midi <= 45 ? 250 : 200);
      expect(t.tuner1, `${midi}: needle within 1 cent`).toBeLessThan(midi <= 45 ? 300 : 250);
    }
  }, 60_000);

  it('is barely slower through a small microphone in a noisy room', () => {
    for (const midi of [40, 45, 55, 64, 76]) {
      const t = row('small mic, 25 dB SNR, drift 8 c', midi, { attackNoise: 0.3, driftCents: 8, highpassHz: 200, highpassOrder: 3 }, 25);
      expect(t.noteOn, `${midi}: note-on`).toBeLessThan(midi <= 40 ? 100 : 80);
      expect(t.tuner2, `${midi}: needle within 2 cents`).toBeLessThan(260);
    }
  }, 60_000);
});
