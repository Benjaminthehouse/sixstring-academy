/**
 * The note tracker on hand-made frames: what it does with readings the detector is unsure of.
 */
import { describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { NoteTracker, type NoteTrackerOptions } from './note-tracker';
import type { PitchEvent, PitchReading } from './types';

/**
 * The last quarter second of an E4 tuned 12 cents sharp, ringing out under five other strings in
 * Chromium (`e2e/pitch-live.cjs`, fake microphone through a laptop model): clarity and the
 * detector's own reading, in cents from E4. The unsure frames scatter, and lean flat.
 */
const TAIL: ReadonlyArray<[number, number]> = [
  [0.71, -13.9], [0.74, 11.2], [0.7, 7.94], [0.7, 10.62], [0.58, 10.58], [0.58, 12.73], [0.63, 13.25], [0.68, 4.92],
  [0.61, 11.65], [0.58, -11.1], [0.62, 6.1], [0.6, -2.3], [0.57, -4.8], [0.55, 3.2], [0.6, -6.4], [0.56, -1.9],
  [0.58, 2.6], [0.6, -8.7], [0.54, -5.96], [0.61, -10.28], [0.57, 28.51],
];

function run(opts: NoteTrackerOptions = {}): PitchReading[] {
  const tracker = new NoteTracker(opts);
  const out: PitchEvent[] = [];
  const e4 = (cents: number) => midiToFreq(64 + cents / 100);
  let t = 0;
  // Half a second of a clear, steady string, then the tail; the level fades but stays above the gate.
  for (let i = 0; i < 50; i++) tracker.push({ time: (t += 0.01), freq: e4(12 + ((i % 3) - 1) * 0.3), clarity: 0.95, rms: 0.05, window: 0.03 }, out);
  TAIL.forEach(([clarity, cents], i) => tracker.push({ time: (t += 0.01), freq: e4(cents), clarity, rms: 0.05 * Math.pow(10, -i / 40), window: 0.03 }, out));
  return out.filter((e): e is Extract<PitchEvent, { type: 'pitch' }> => e.type === 'pitch');
}

describe('NoteTracker: unsure readings', () => {
  it('keeps the pitch of a note that fades into the room where it was', () => {
    const readings = run();
    expect(readings.length).toBeGreaterThan(60);
    const tail = readings.slice(-TAIL.length);
    // Every frame of the tail still reports the note (it is alive), at the pitch the string had.
    expect(tail.every((r) => r.midi === 64)).toBe(true);
    for (const r of tail) expect(Math.abs(r.cents - 12), `at clarity ${r.clarity}`).toBeLessThan(2);
    // The raw reading is still there for whoever wants it.
    expect(tail.some((r) => Math.abs(1200 * Math.log2(r.rawFreq / midiToFreq(64)) - 12) > 10)).toBe(true);
  });

  it('used to drift flat with them (every reading admitted to the median)', () => {
    const tail = run({ unsureCents: 1000 }).slice(-TAIL.length);
    expect(Math.min(...tail.map((r) => r.cents))).toBeLessThan(3);
  });

  it('does not hold on to the clear readings alone when they scatter as much as the unsure ones', () => {
    // The last 0.4 s of C#4 on the nylon string (string 3, fret 6) in the adversarial corpus's
    // laptop room, while the open B string rings underneath and takes over: clarity, the reading
    // in cents from the true pitch, and the level in dBFS. Near the end the clear readings
    // scatter by 20 cents, and the unsure ones among them are no worse.
    const LAPTOP: ReadonlyArray<[number, number, number]> = [
      [0.945, -5.77, -34.2], [0.914, -2.86, -35.1], [0.905, -2.09, -36.3], [0.919, -7.29, -35.7], [0.921, -4.7, -35.5],
      [0.909, -2.19, -36.9], [0.905, -6.11, -37.1], [0.906, -6.03, -37.0], [0.875, -4.68, -38.1], [0.902, -3.73, -37.5],
      [0.927, -8.31, -37.0], [0.912, -5.97, -37.7], [0.908, -4.24, -38.9], [0.898, -7.85, -38.3], [0.891, -7.45, -38.3],
      [0.875, -4.78, -39.9], [0.885, -4.96, -39.6], [0.884, -9.31, -38.7], [0.858, -5.33, -39.3], [0.842, -4.05, -40.7],
      [0.841, -9.77, -39.7], [0.854, -8.34, -39.5], [0.834, -5.94, -40.5], [0.85, -7.97, -40.4], [0.874, -27.94, -39.8],
      [0.807, -8.68, -40.6], [0.794, -5.31, -41.2], [0.787, -9.33, -40.8], [0.664, -7.19, -41.1], [0.684, -1199.44, -42.9],
      [0.692, -7.21, -42.6], [0.757, -20.51, -42.2], [0.641, 2.24, -43.4], [0.713, -14.34, -43.8], [0.805, -26.78, -42.3],
      [0.705, -6.98, -42.9], [0.685, -1.68, -42.9], [0.698, -8.16, -42.6], [0.747, -24.06, -41.8], [0.649, -5.7, -42.9],
    ];
    const tracker = new NoteTracker();
    const out: PitchEvent[] = [];
    let t = 0;
    for (let i = 0; i < 30; i++) tracker.push({ time: (t += 0.01), freq: midiToFreq(61 - 0.05), clarity: 0.95, rms: 0.03, window: 0.03 }, out);
    const from = out.length;
    for (const [clarity, cents, db] of LAPTOP) tracker.push({ time: (t += 0.01), freq: midiToFreq(61 + cents / 100), clarity, rms: Math.pow(10, db / 20), window: 0.03 }, out);
    const tail = out.slice(from).filter((e): e is Extract<PitchEvent, { type: 'pitch' }> => e.type === 'pitch');
    expect(tail.length).toBeGreaterThan(30);
    expect(tail.every((r) => r.midi === 61)).toBe(true);
    // Keeping only the clear readings, the last one said 20.5 cents flat; with the unsure ones that
    // lie inside the scatter, never more than the 14.3 that every reading together gives.
    expect(Math.max(...tail.map((r) => Math.abs(r.cents)))).toBeLessThan(15);
  });

  it('still follows a slow drift when the unsure readings agree with it', () => {
    const tracker = new NoteTracker();
    const out: PitchEvent[] = [];
    let t = 0;
    for (let i = 0; i < 30; i++) tracker.push({ time: (t += 0.01), freq: midiToFreq(57), clarity: 0.95, rms: 0.05 }, out);
    // A peg turned at 20 cents a second while the room noise keeps clarity at 0.6.
    for (let i = 0; i < 100; i++) tracker.push({ time: (t += 0.01), freq: midiToFreq(57 + (0.2 * i) / 100), clarity: 0.6, rms: 0.05 }, out);
    const last = out.filter((e): e is Extract<PitchEvent, { type: 'pitch' }> => e.type === 'pitch').pop()!;
    expect(last.cents).toBeGreaterThan(17);
  });
});
