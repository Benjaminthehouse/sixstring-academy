/**
 * Micro-benchmark: the detector must cost well under 3 ms per frame so it can run 40+ (in fact
 * 100) times a second with room to spare, and the whole engine must run many times faster than
 * real time. Each figure is the best of several passes, measured in CPU time of this thread where
 * Node can report it: that is the cost of the code itself, and it keeps a busy test machine (other
 * suites run in parallel, several of them heavy) from failing the run by accident.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { ChromaExtractor } from './chroma';
import { PitchDetector } from './detector';
import { PitchEngine } from './engine';
import { addNoise, pluckedString, strum, whiteNoise } from './signals';

const SR = 48000;
const lines: string[] = [];
afterAll(() => {
  process.stdout.write(`\nCost per frame (CPU time, best of repeated passes, this machine)\n${lines.join('\n')}\n\n`);
});

function best(values: number[]): number {
  return Math.min(...values);
}

/**
 * Milliseconds of CPU this thread has used so far (the wall clock where Node cannot tell). Waiting
 * for a turn on an overloaded machine costs wall-clock time but no CPU time, and it is not what
 * these tests are about.
 */
function cpuNow(): number {
  const proc = process as unknown as { threadCpuUsage?: () => { user: number; system: number } };
  if (typeof proc.threadCpuUsage === 'function') {
    const used = proc.threadCpuUsage();
    return (used.user + used.system) / 1000;
  }
  return performance.now();
}

/** Time of one detect() call in ms, sliding along `x` in 10 ms hops. */
function detectCost(det: PitchDetector, x: Float32Array, hinted: boolean): number {
  const hop = 480;
  const start = det.historyNeeded;
  const samples: number[] = [];
  for (let pass = 0; pass < 6; pass++) {
    let hint = 0;
    const t0 = cpuNow();
    let n = 0;
    for (let end = start; end <= x.length; end += hop) {
      const est = det.detect(x, hinted ? hint : 0, end);
      hint = est.freq;
      n++;
    }
    // The first pass warms the JIT up and is not counted.
    if (pass > 0) samples.push((cpuNow() - t0) / n);
  }
  return best(samples);
}

describe('performance', () => {
  it('detects a frame in well under 3 ms, whatever is in it', () => {
    const cases: Array<[string, Float32Array]> = [
      ['low E (longest window)', pluckedString({ freq: midiToFreq(40), sampleRate: SR, duration: 1.5 })],
      ['A2', pluckedString({ freq: midiToFreq(45), sampleRate: SR, duration: 1.5 })],
      ['high E', pluckedString({ freq: midiToFreq(64), sampleRate: SR, duration: 1.5 })],
      ['E6', pluckedString({ freq: midiToFreq(88), sampleRate: SR, duration: 1.5 })],
      ['noisy low E', addNoise(pluckedString({ freq: midiToFreq(40), sampleRate: SR, duration: 1.5 }), 15, 3)],
      ['noise (every window tried)', whiteNoise(SR * 1.5, 0.1, 5)],
    ];
    for (const [config, det] of [
      ['guitar', new PitchDetector({ sampleRate: SR })],
      ['bass', new PitchDetector({ sampleRate: SR, minFreq: 30 })],
    ] as const) {
      for (const [name, x] of cases) {
        const cold = detectCost(det, x, false);
        const tracked = detectCost(det, x, true);
        lines.push(`  detect  ${config.padEnd(7)} ${name.padEnd(28)} ${cold.toFixed(3)} ms   with hint ${tracked.toFixed(3)} ms`);
        expect(cold, `${config} / ${name}`).toBeLessThan(3);
        expect(tracked, `${config} / ${name} with hint`).toBeLessThan(3);
      }
    }
  }, 120_000);

  it('runs the whole engine far faster than real time', () => {
    const seconds = 6;
    let x: Float32Array = new Float32Array(seconds * SR);
    [40, 45, 50, 55, 59, 64].forEach((midi, i) => {
      x.set(pluckedString({ freq: midiToFreq(midi), sampleRate: SR, duration: 0.95, attackNoise: 0.3, seed: i + 1 }), i * SR);
    });
    x = addNoise(x, 30, 2);
    const run = (chroma: boolean): number => {
      const times: number[] = [];
      for (let pass = 0; pass < 6; pass++) {
        const engine = new PitchEngine({ sampleRate: SR, chroma });
        const t0 = cpuNow();
        for (let i = 0; i < x.length; i += 256) engine.process(x.subarray(i, i + 256));
        // The first passes run while the JIT is still optimising and are not counted.
        if (pass > 1) times.push(cpuNow() - t0);
      }
      return best(times);
    };
    const plain = run(false);
    const withChroma = run(true);
    const frames = seconds * 100;
    lines.push(`  engine  ${seconds} s of audio, 100 frames/s: ${plain.toFixed(0)} ms (${(plain / frames).toFixed(3)} ms per frame, ${(100 * plain / (seconds * 1000)).toFixed(1)} % of one core)`);
    lines.push(`  engine  the same with chroma at 20 frames/s: ${withChroma.toFixed(0)} ms (${(100 * withChroma / (seconds * 1000)).toFixed(1)} % of one core)`);
    expect(plain / frames).toBeLessThan(3);
    // At least five times faster than real time even with chord analysis switched on.
    expect(withChroma).toBeLessThan((seconds * 1000) / 5);
  }, 120_000);

  it('analyses a chroma frame in a few milliseconds', () => {
    const chord = strum({ freqs: [82.4, 123.5, 164.8, 207.7, 246.9, 329.6], sampleRate: SR, duration: 0.5 });
    const ex = new ChromaExtractor({ sampleRate: SR });
    const times: number[] = [];
    for (let pass = 0; pass < 6; pass++) {
      const t0 = cpuNow();
      for (let i = 0; i < 20; i++) ex.analyze(chord);
      if (pass > 0) times.push((cpuNow() - t0) / 20);
    }
    lines.push(`  chroma  one frame (${ex.windowSize} samples): ${best(times).toFixed(3)} ms`);
    expect(best(times)).toBeLessThan(10);
  });
});
