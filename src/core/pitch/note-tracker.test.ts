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
