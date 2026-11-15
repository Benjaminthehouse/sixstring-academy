/**
 * Onset detection: timing accuracy against known pluck times, misses, and false alarms on
 * signals that have no onsets. A summary table is printed.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { detectOnsets, OnsetDetector } from './onset';
import { addHum, addNoise, harmonicTone, mix, pluckedString, seededRandom, silence, strum, whiteNoise } from './signals';
import type { OnsetEvent } from './types';

interface Trial {
  signal: Float32Array;
  at: number;
}

interface Condition {
  name: string;
  make: (rand: () => number, trial: number, sr: number) => Trial;
  /** Largest share of plucks that may go unheard. */
  maxMissRate: number;
}

function pluck(midi: number, sr: number, seed: number, soft: boolean, amplitude = 0.4, duration = 0.6): Float32Array {
  const p = pluckedString({
    freq: midiToFreq(midi),
    sampleRate: sr,
    duration,
    amplitude,
    attackNoise: soft ? 0 : 0.3,
    attackMs: soft ? 6 : 1.5,
    seed,
  });
  // Damp the end like a finger would: an abrupt cut is a click, which is an onset in its own right.
  const fade = Math.round(0.02 * sr);
  for (let k = 0; k < fade; k++) p[p.length - 1 - k] *= k / fade;
  return p;
}

const fromSilence = (soft: boolean, snrDb: number) => (rand: () => number, trial: number, sr: number): Trial => {
  const at = 0.5 + rand() * 0.1;
  const midi = 40 + Math.floor(rand() * 37);
  const x = mix(silence(1.3, sr), pluck(midi, sr, trial + 1, soft, 0.2 + 0.4 * rand()), Math.round(at * sr));
  return { signal: addNoise(x, snrDb, trial, Math.round(at * sr)), at };
};

/** A note plucked while another string, plucked just as hard half a second earlier, is still ringing. */
const overRinging = (soft: boolean) => (rand: () => number, trial: number, sr: number): Trial => {
  const at = 0.5 + rand() * 0.1;
  const midi = 40 + Math.floor(rand() * 37);
  const other = 40 + Math.floor(rand() * 25);
  const old = pluck(other, sr, trial + 99, false, 0.4, 1.3);
  const x = mix(mix(silence(1.3, sr), old), pluck(midi, sr, trial + 1, soft), Math.round(at * sr));
  return { signal: addNoise(x, 45, trial), at };
};

const CONDITIONS: Condition[] = [
  { name: 'pick, from silence', make: fromSilence(false, 45), maxMissRate: 0 },
  { name: 'soft thumb, from silence', make: fromSilence(true, 45), maxMissRate: 0 },
  { name: 'pick, noisy room (25 dB SNR)', make: fromSilence(false, 25), maxMissRate: 0 },
  { name: 'pick, over a ringing string', make: overRinging(false), maxMissRate: 0.02 },
  { name: 'soft thumb, over a ringing string', make: overRinging(true), maxMissRate: 0.2 },
];

const table: string[] = [];
afterAll(() => {
  process.stdout.write(
    `\nOnset timing (ms; 80 plucks per row)\n${'condition'.padEnd(36)} ${'rate'.padStart(6)} ${'missed'.padStart(6)} ${'extra'.padStart(5)} ${'median'.padStart(7)} ${'|p95|'.padStart(6)} ${'|max|'.padStart(6)}\n${'-'.repeat(78)}\n${table.join('\n')}\n\n`,
  );
});

describe('onset timing', () => {
  for (const cond of CONDITIONS) {
    it(`${cond.name}: within 15 ms, typically a few`, () => {
      for (const sr of [44100, 48000]) {
        const rand = seededRandom(sr + cond.name.length);
        const errs: number[] = [];
        let missed = 0;
        let extra = 0;
        const trials = 80;
        for (let trial = 0; trial < trials; trial++) {
          const { signal, at } = cond.make(rand, trial, sr);
          // Ignore the pluck of the older string at the very start of the buffer.
          const onsets = detectOnsets(signal, sr).filter((o) => o.time > 0.1);
          const near = onsets.filter((o) => Math.abs(o.time - at) < 0.05);
          if (near.length === 0) missed++;
          else errs.push((near[0].time - at) * 1000);
          extra += onsets.length - Math.min(1, near.length);
        }
        const abs = errs.map(Math.abs).sort((a, b) => a - b);
        const sorted = [...errs].sort((a, b) => a - b);
        const p95 = abs[Math.floor(abs.length * 0.95)];
        const max = abs[abs.length - 1];
        table.push(
          `${cond.name.padEnd(36)} ${(sr / 1000 + 'k').padStart(6)} ${String(missed).padStart(6)} ${String(extra).padStart(5)} ${sorted[sorted.length >> 1].toFixed(1).padStart(7)} ${p95.toFixed(1).padStart(6)} ${max.toFixed(1).padStart(6)}`,
        );
        expect(missed / trials, `${cond.name} @${sr}: missed`).toBeLessThanOrEqual(cond.maxMissRate);
        expect(extra, `${cond.name} @${sr}: extra onsets`).toBe(0);
        expect(max, `${cond.name} @${sr}: worst timing error`).toBeLessThan(15);
        expect(p95, `${cond.name} @${sr}: 95th percentile timing error`).toBeLessThan(6);
      }
    }, 60_000);
  }

  it('keeps time on a run of eighth and sixteenth notes', () => {
    const sr = 44100;
    for (const gap of [0.25, 0.125]) {
      const count = 16;
      let x = silence(0.3 + count * gap + 0.5, sr);
      const scale = [52, 54, 56, 57, 59, 61, 63, 64];
      // A run on one string: each note ends when the next is fretted.
      for (let i = 0; i < count; i++) {
        x = mix(x, pluck(scale[i % scale.length], sr, i + 1, false, 0.4, gap), Math.round((0.3 + i * gap) * sr)).subarray(0, x.length);
      }
      const onsets = detectOnsets(x, sr);
      expect(onsets.length, `gap ${gap}`).toBe(count);
      onsets.forEach((o, i) => expect(Math.abs(o.time - (0.3 + i * gap))).toBeLessThan(0.006));
    }
  });

  it('counts a strum once, at its first string', () => {
    for (const sr of [44100, 48000]) {
      const chord = [82.41, 123.47, 164.81, 196, 246.94, 329.63];
      for (const strumMs of [4, 8, 10]) {
        const x = strum({ freqs: chord, sampleRate: sr, duration: 1, startTime: 0.4, strumMs, attackNoise: 0.3 });
        const onsets = detectOnsets(x, sr);
        expect(onsets.length, `strum ${strumMs} ms`).toBe(1);
        expect(Math.abs(onsets[0].time - 0.4)).toBeLessThan(0.008);
        expect(onsets[0].strength).toBeGreaterThan(10);
      }
      // A slow, deliberate strum starts to come apart into its strings with a shorter merge interval.
      const slow = strum({ freqs: chord, sampleRate: sr, duration: 1, startTime: 0.4, strumMs: 45, attackNoise: 0.3 });
      expect(detectOnsets(slow, sr, { minIntervalMs: 25 }).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('onset false alarms', () => {
  it('stays quiet through sustained notes, ringing chords, noise and hum', () => {
    const sr = 44100;
    const steady: Array<[string, Float32Array]> = [];
    for (const midi of [40, 43, 45, 50, 55, 59, 64, 69, 76]) {
      for (const seed of [1, 2, 3]) {
        steady.push([
          `sustained ${midi}`,
          pluckedString({ freq: midiToFreq(midi), sampleRate: sr, duration: 3, decay: 0.5 + seed * 0.4, decayTilt: 0.004 * seed, rolloff: 0.5 + 0.25 * seed, seed, attackNoise: 0.3 }),
        ]);
        steady.push([
          `sustained ${midi} through a small mic, noisy`,
          addNoise(pluckedString({ freq: midiToFreq(midi), sampleRate: sr, duration: 3, seed, highpassHz: 200, highpassOrder: 3, attackNoise: 0.3 }), 30, seed),
        ]);
      }
    }
    steady.push(['two strings beating slowly', mix(harmonicTone({ freq: 196, sampleRate: sr, duration: 4, harmonics: 5 }), harmonicTone({ freq: 199, sampleRate: sr, duration: 4, harmonics: 5, seed: 3 }))]);
    steady.push(['loud noise', whiteNoise(4 * sr, 0.05, 3)]);
    steady.push(['quiet noise', whiteNoise(4 * sr, 0.003, 4)]);
    steady.push(['hum', addHum(silence(4, sr), sr, { rms: 0.01 })]);
    steady.push(['open E chord ringing', strum({ freqs: [82.4, 123.5, 164.8, 207.7, 246.9, 329.6], sampleRate: sr, duration: 4, decay: 0.7 })]);
    steady.push(['A minor ringing', strum({ freqs: [110, 164.8, 220, 261.6, 329.6], sampleRate: sr, duration: 4, decay: 0.5, seed: 4 })]);
    for (const [name, x] of steady) {
      // The first 80 ms hold the signal's own start, which is a real onset.
      const later = detectOnsets(x, sr).filter((o) => o.time > 0.08);
      expect(later.length, name).toBe(0);
    }
  });

  it('ignores attacks below the level threshold', () => {
    const sr = 44100;
    const quiet = mix(silence(1, sr), pluck(57, sr, 1, false, 0.0008), Math.round(0.4 * sr));
    expect(detectOnsets(quiet, sr).length).toBe(0);
    expect(detectOnsets(quiet, sr, { minLevelDb: -90 }).length).toBe(1);
  });
});

describe('OnsetDetector streaming', () => {
  it('gives the same onsets however the audio is chunked, and honours the stream origin', () => {
    const sr = 48000;
    let x = silence(2, sr);
    for (const [i, at] of [0.31, 0.74, 1.2, 1.35].entries()) x = mix(x, pluck(50 + i * 5, sr, i + 1, false), Math.round(at * sr)).subarray(0, x.length);
    const whole = detectOnsets(x, sr).map((o) => o.time);
    expect(whole.length).toBe(4);
    for (const chunk of [64, 128, 500, 4096]) {
      const det = new OnsetDetector({ sampleRate: sr });
      det.reset(10);
      const out: OnsetEvent[] = [];
      for (let i = 0; i < x.length; i += chunk) det.process(x.subarray(i, i + chunk), out);
      det.process(new Float32Array(2048), out);
      expect(out.map((o) => +(o.time - 10).toFixed(9)), `chunk ${chunk}`).toEqual(whole.map((t) => +t.toFixed(9)));
    }
  });
});
