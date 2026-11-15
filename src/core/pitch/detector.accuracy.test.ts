/**
 * Accuracy sweep of the pitch detector: every MIDI note from 28 (E1) to 88 (E6), detuned from -45
 * to +45 cents, under each degradation a real microphone signal has. Each case is analysed at four
 * frame positions with no memory between frames (the worst case: the live tracker adds a hint and
 * a median filter on top). A summary table is printed at the end.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { PitchDetector } from './detector';
import { addHum, addNoise, harmonicTone, mix, pluckedString, rmsOf } from './signals';

const DETUNES = [-45, -30, -15, 0, 15, 30, 45];
const FRAME_TIMES = [0.2, 0.26, 0.32, 0.38];
const DURATION = 0.4;
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];
/** A phone or laptop capsule: steep roll-off below about 220 Hz. */
const MIC = { highpassHz: 220, highpassOrder: 4 } as const;

interface Ctx {
  freq: number;
  sr: number;
  seed: number;
  midi: number;
}

interface Condition {
  name: string;
  make: (c: Ctx) => Float32Array;
  /** Hard limits from the module's accuracy targets (cents, percent). */
  median: number;
  max?: number;
  grossPct: number;
}

function ringingString(c: Ctx, gain: number, extra: object = {}): Float32Array {
  const other = OPEN_STRINGS[(c.midi + c.seed) % OPEN_STRINGS.length];
  return pluckedString({
    freq: midiToFreq(other) * 1.002,
    sampleRate: c.sr,
    duration: DURATION,
    seed: c.seed + 9,
    attackMs: 40,
    decay: 0.8,
    amplitude: gain,
    ...extra,
  });
}

const CLEAN: Condition[] = [
  {
    name: 'steady harmonic tone',
    make: (c) => harmonicTone({ freq: c.freq, sampleRate: c.sr, duration: DURATION, harmonics: 10, seed: c.seed }),
    median: 0.5,
    max: 2,
    grossPct: 0,
  },
  {
    name: 'clean plucked string',
    make: (c) => pluckedString({ freq: c.freq, sampleRate: c.sr, duration: DURATION, seed: c.seed }),
    median: 0.5,
    max: 2,
    grossPct: 0,
  },
];

const DEGRADED: Condition[] = [
  {
    name: 'weak fundamental (small mic)',
    make: (c) => pluckedString({ freq: c.freq, sampleRate: c.sr, duration: DURATION, seed: c.seed, ...MIC, fundamentalGain: 0.3 }),
    median: 3,
    grossPct: 1,
  },
  {
    name: 'no fundamental at all',
    make: (c) => pluckedString({ freq: c.freq, sampleRate: c.sr, duration: DURATION, seed: c.seed, fundamentalGain: 0 }),
    median: 3,
    grossPct: 1,
  },
  {
    name: 'noise, 20 dB SNR',
    make: (c) => addNoise(pluckedString({ freq: c.freq, sampleRate: c.sr, duration: DURATION, seed: c.seed }), 20, c.seed + 5),
    median: 3,
    grossPct: 1,
  },
  {
    name: 'inharmonic string, B = 1e-4',
    make: (c) => pluckedString({ freq: c.freq, sampleRate: c.sr, duration: DURATION, seed: c.seed, inharmonicity: 1e-4 }),
    median: 3,
    grossPct: 1,
  },
  {
    name: 'mains hum, 20 dB below the note',
    make: (c) => {
      const x = pluckedString({ freq: c.freq, sampleRate: c.sr, duration: DURATION, seed: c.seed });
      return addHum(x, c.sr, { freq: c.sr === 48000 ? 60 : 50, rms: rmsOf(x) * 0.1 });
    },
    median: 3,
    grossPct: 1,
  },
  {
    name: 'pick noise + pitch settling',
    make: (c) =>
      pluckedString({ freq: c.freq, sampleRate: c.sr, duration: DURATION, seed: c.seed, attackNoise: 0.4, driftCents: 12, driftMs: 35 }),
    median: 3,
    grossPct: 1,
  },
  {
    name: 'another string ringing, -12 dB',
    make: (c) => {
      const x = pluckedString({ freq: c.freq, sampleRate: c.sr, duration: DURATION, seed: c.seed });
      const y = ringingString(c, 0.5);
      return mix(x, y, 0, (rmsOf(x) / rmsOf(y)) * 0.25);
    },
    median: 3,
    grossPct: 1,
  },
  {
    name: 'laptop mic: all of the above',
    make: (c) => {
      const x = pluckedString({
        freq: c.freq,
        sampleRate: c.sr,
        duration: DURATION,
        seed: c.seed,
        ...MIC,
        fundamentalGain: 0.3,
        inharmonicity: 8e-5,
        driftCents: 8,
        driftMs: 40,
        attackNoise: 0.3,
      });
      const y = ringingString(c, 0.5, MIC);
      const level = rmsOf(x);
      const withString = mix(x, y, 0, (level / rmsOf(y)) * 0.1);
      return addNoise(addHum(withString, c.sr, { freq: 50, rms: level * 0.05 }), 20, c.seed + 5);
    },
    median: 3,
    grossPct: 1,
  },
];

interface Run {
  label: string;
  sr: number;
  minFreq: number | undefined;
  lo: number;
  hi: number;
  hint: boolean;
}

const RUNS: Run[] = [
  { label: '44.1k bass range E1-E6', sr: 44100, minFreq: 30, lo: 28, hi: 88, hint: false },
  { label: '48k guitar range C2-E6', sr: 48000, minFreq: undefined, lo: 36, hi: 88, hint: false },
];

interface Stats {
  n: number;
  median: number;
  p95: number;
  max: number;
  grossPct: number;
  octavePct: number;
  missPct: number;
}

function sweep(cond: Condition, run: Run): Stats {
  const det = new PitchDetector({ sampleRate: run.sr, minFreq: run.minFreq });
  const errs: number[] = [];
  let n = 0;
  let gross = 0;
  let octave = 0;
  let miss = 0;
  let seed = 1;
  for (let midi = run.lo; midi <= run.hi; midi++) {
    for (const cents of DETUNES) {
      const freq = midiToFreq(midi) * Math.pow(2, cents / 1200);
      const x = cond.make({ freq, sr: run.sr, seed: seed++, midi });
      let hint = 0;
      for (const t of FRAME_TIMES) {
        const est = det.detect(x, run.hint ? hint : 0, Math.round(t * run.sr));
        n++;
        if (!(est.freq > 0) || est.clarity < 0.75) {
          miss++;
          hint = 0;
          continue;
        }
        hint = est.freq;
        const err = Math.abs(1200 * Math.log2(est.freq / freq));
        if (err > 50) {
          gross++;
          const octaves = err / 1200;
          if (Math.round(octaves) >= 1 && Math.abs(octaves - Math.round(octaves)) < 0.05) octave++;
        } else {
          errs.push(err);
        }
      }
    }
  }
  errs.sort((a, b) => a - b);
  const at = (p: number): number => (errs.length ? errs[Math.min(errs.length - 1, Math.floor(p * errs.length))] : Number.NaN);
  return {
    n,
    median: at(0.5),
    p95: at(0.95),
    max: errs.length ? errs[errs.length - 1] : Number.NaN,
    grossPct: (100 * gross) / n,
    octavePct: (100 * octave) / n,
    missPct: (100 * miss) / n,
  };
}

const table: string[] = [];

function record(cond: Condition, run: Run, s: Stats): void {
  table.push(
    `${cond.name.padEnd(33)} ${run.label.padEnd(24)} ${String(s.n).padStart(5)}  ${s.median.toFixed(3).padStart(7)} ${s.p95.toFixed(3).padStart(7)} ${s.max.toFixed(3).padStart(7)}  ${s.grossPct.toFixed(2).padStart(6)} ${s.octavePct.toFixed(2).padStart(6)} ${s.missPct.toFixed(2).padStart(6)}`,
  );
}

function check(cond: Condition, run: Run): Stats {
  const s = sweep(cond, run);
  record(cond, run, s);
  expect(s.median, `${cond.name} / ${run.label}: median error`).toBeLessThan(cond.median);
  if (cond.max !== undefined) expect(s.max, `${cond.name} / ${run.label}: max error`).toBeLessThan(cond.max);
  expect(s.grossPct, `${cond.name} / ${run.label}: gross (octave) errors`).toBeLessThanOrEqual(cond.grossPct);
  expect(s.missPct, `${cond.name} / ${run.label}: missed frames`).toBeLessThan(1);
  return s;
}

afterAll(() => {
  const head = `${'condition'.padEnd(33)} ${'sweep'.padEnd(24)} ${'n'.padStart(5)}  ${'median'.padStart(7)} ${'p95'.padStart(7)} ${'max'.padStart(7)}  ${'gross%'.padStart(6)} ${'oct%'.padStart(6)} ${'miss%'.padStart(6)}`;
  process.stdout.write(
    `\nPitch detector accuracy (errors in cents; every MIDI note x 7 detunings x 4 frames, no smoothing)\n${head}\n${'-'.repeat(head.length)}\n${table.join('\n')}\n\n`,
  );
});

describe('pitch detector accuracy: clean tones', () => {
  for (const cond of CLEAN) {
    it(`${cond.name}: median < 0.5 cent, max < 2 cents, over the whole range`, () => {
      for (const run of RUNS) {
        const s = check(cond, run);
        // Regression guard well inside the target: the method itself is far more precise than 2 cents.
        expect(s.p95).toBeLessThan(0.1);
        expect(s.max).toBeLessThan(0.8);
      }
    }, 120_000);
  }

  it('is just as accurate at other sample rates', () => {
    for (const sr of [22050, 32000, 88200, 96000]) {
      const det = new PitchDetector({ sampleRate: sr });
      let worst = 0;
      for (const midi of [40, 45, 52, 59, 64, 76, 88]) {
        const freq = midiToFreq(midi) * Math.pow(2, 17 / 1200);
        const x = harmonicTone({ freq, sampleRate: sr, duration: 0.4, harmonics: 8, seed: midi });
        const est = det.detect(x);
        worst = Math.max(worst, Math.abs(1200 * Math.log2(est.freq / freq)));
      }
      expect(worst, `sample rate ${sr}`).toBeLessThan(0.3);
    }
  });
});

describe('pitch detector accuracy: realistic degradation', () => {
  for (const cond of DEGRADED) {
    it(`${cond.name}: median < 3 cents, gross errors < 1 %`, () => {
      for (const run of RUNS) check(cond, run);
    }, 120_000);
  }

  it('with the hint from the previous frame (as the live tracker runs it) nothing gets worse', () => {
    const cond = DEGRADED[DEGRADED.length - 1];
    const run: Run = { label: '44.1k guitar, hinted', sr: 44100, minFreq: undefined, lo: 36, hi: 88, hint: true };
    const s = check(cond, run);
    expect(s.grossPct).toBeLessThan(0.5);
  }, 120_000);
});
