/**
 * Short interface sounds: feedback for answers, rewards, streaks. Original little motifs played on
 * soft bell and mallet voices, mixed quiet on purpose: they sit under a guitar, not over it.
 * Pure rendering; the live engine caches the buffers.
 */
import { midiToFreq } from '@/core/math/pitch-math';
import { Rng, TWO_PI, biquadCoeffs, biquadFilter, fadeOut, hashSeed, peakOf, sanitize } from './dsp';

/** Every interface sound. */
export type UiSound =
  | 'correct'
  | 'wrong'
  | 'levelUp'
  | 'gem'
  | 'streak'
  | 'heartLost'
  | 'lessonComplete'
  | 'achievement'
  | 'tap'
  | 'perfect'
  | 'good'
  | 'miss'
  | 'countdown'
  | 'go'
  | 'combo';

/** All interface sound names. */
export const UI_SOUNDS: readonly UiSound[] = [
  'correct', 'wrong', 'levelUp', 'gem', 'streak', 'heartLost', 'lessonComplete', 'achievement', 'tap',
  'perfect', 'good', 'miss', 'countdown', 'go', 'combo',
];

/** Peak level of each sound. Rewards are a little louder than routine feedback; nothing is loud. */
const UI_LEVEL: Record<UiSound, number> = {
  correct: 0.26, wrong: 0.22, levelUp: 0.3, gem: 0.22, streak: 0.26, heartLost: 0.22, lessonComplete: 0.3,
  achievement: 0.28, tap: 0.12, perfect: 0.24, good: 0.2, miss: 0.16, countdown: 0.2, go: 0.24, combo: 0.22,
};

type Timbre = 'bell' | 'mallet' | 'soft' | 'glass';

/** Partials (ratio, gain, decay scale) per timbre. Slightly stretched upper partials = bell-like. */
const TIMBRES: Record<Timbre, ReadonlyArray<readonly [number, number, number]>> = {
  bell: [[1, 1, 1], [2, 0.32, 0.6], [3.01, 0.12, 0.4], [4.2, 0.06, 0.25]],
  mallet: [[1, 1, 1], [3.9, 0.22, 0.18], [9.2, 0.06, 0.08]],
  soft: [[1, 1, 1], [2, 0.14, 0.7]],
  glass: [[1, 1, 1], [2.76, 0.35, 0.5], [5.4, 0.16, 0.3], [8.9, 0.06, 0.2]],
};

/** Add one struck note: instant-ish attack, exponential ring. `glide` bends the pitch (semitones). */
function strike(out: Float32Array, fs: number, at: number, midi: number, ring: number, gain: number, timbre: Timbre, glide = 0): void {
  const start = Math.round(at * fs);
  const f0 = midiToFreq(midi);
  const len = Math.min(out.length - start, Math.round(ring * 6 * fs));
  for (const [ratio, g, decay] of TIMBRES[timbre]) {
    const f = f0 * ratio;
    if (f > fs * 0.45) continue;
    let phase = 0;
    const tau = ring * decay * fs;
    for (let i = 0; i < len; i++) {
      const t = i / fs;
      const bend = glide ? Math.pow(2, (glide * Math.min(1, t / ring)) / 12) : 1;
      phase += (TWO_PI * f * bend) / fs;
      const attack = t < 0.004 ? t / 0.004 : 1;
      out[start + i] += Math.sin(phase) * Math.exp(-i / tau) * g * gain * attack;
    }
  }
}

/** A breath of filtered noise that swells and fades: the "whoosh" under a few of the rewards. */
function shimmer(out: Float32Array, fs: number, at: number, seconds: number, freq: number, gain: number, seed: number): void {
  const rng = new Rng(seed);
  const len = Math.min(out.length - Math.round(at * fs), Math.round(seconds * fs));
  const n = new Float32Array(Math.max(1, len));
  for (let i = 0; i < len; i++) n[i] = rng.bipolar();
  biquadFilter(n, biquadCoeffs({ type: 'bandpass', freq, q: 1.4 }, fs));
  const start = Math.round(at * fs);
  for (let i = 0; i < len; i++) out[start + i] += n[i] * gain * Math.sin((Math.PI * i) / len) ** 2;
}

/**
 * Render an interface sound. `step` (0, 1, 2 ...) raises the pitch of `combo` along a pentatonic
 * scale so a run of hits climbs.
 */
export function renderUiSound(name: UiSound, sampleRate: number, step = 0): Float32Array {
  const fs = sampleRate;
  const make = (seconds: number) => new Float32Array(Math.round(seconds * fs));
  let x: Float32Array;
  switch (name) {
    case 'correct':
      x = make(0.7);
      strike(x, fs, 0, 79, 0.09, 0.8, 'bell'); // G5
      strike(x, fs, 0.085, 84, 0.16, 1, 'bell'); // C6
      break;
    case 'wrong':
      x = make(0.5);
      strike(x, fs, 0, 58, 0.07, 1, 'soft', -0.5); // Bb3, sagging
      strike(x, fs, 0.12, 54, 0.1, 0.9, 'soft', -0.7); // F#3
      break;
    case 'levelUp':
      x = make(1.9);
      [72, 76, 79, 84].forEach((m, i) => strike(x, fs, i * 0.075, m, 0.12, 0.7, 'bell'));
      [72, 79, 84, 88].forEach((m) => strike(x, fs, 0.36, m, 0.38, 0.55, 'bell'));
      strike(x, fs, 0.36, 96, 0.2, 0.2, 'glass');
      shimmer(x, fs, 0.3, 0.7, 7000, 0.05, hashSeed('levelUp'));
      break;
    case 'gem':
      x = make(0.6);
      strike(x, fs, 0, 83, 0.05, 0.7, 'glass'); // B5
      strike(x, fs, 0.06, 88, 0.14, 1, 'glass'); // E6
      break;
    case 'streak':
      x = make(1.1);
      shimmer(x, fs, 0, 0.45, 2400, 0.12, hashSeed('streak'));
      [74, 78, 81].forEach((m, i) => strike(x, fs, 0.1 + i * 0.07, m, 0.09, 0.7, 'mallet'));
      strike(x, fs, 0.33, 86, 0.22, 1, 'bell'); // D6
      break;
    case 'heartLost':
      x = make(0.7);
      strike(x, fs, 0, 64, 0.11, 1, 'soft', -3); // E4 falling a minor third
      strike(x, fs, 0.16, 57, 0.14, 0.7, 'soft', -1);
      break;
    case 'lessonComplete':
      x = make(2.6);
      [67, 72, 76, 79].forEach((m, i) => strike(x, fs, i * 0.11, m, 0.16, 0.7, 'mallet'));
      [65, 69, 72, 77].forEach((m) => strike(x, fs, 0.5, m, 0.2, 0.4, 'bell')); // IV
      [67, 71, 74, 79].forEach((m) => strike(x, fs, 0.78, m, 0.2, 0.42, 'bell')); // V
      [60, 67, 72, 76, 84].forEach((m) => strike(x, fs, 1.08, m, 0.5, 0.5, 'bell')); // I
      shimmer(x, fs, 1.0, 0.9, 6500, 0.04, hashSeed('lessonComplete'));
      break;
    case 'achievement':
      x = make(1.6);
      [76, 79, 83, 86, 91].forEach((m, i) => strike(x, fs, i * 0.055, m, 0.1, 0.6, 'glass'));
      [79, 83, 86, 91].forEach((m) => strike(x, fs, 0.32, m, 0.34, 0.45, 'bell'));
      shimmer(x, fs, 0.25, 0.8, 8000, 0.05, hashSeed('achievement'));
      break;
    case 'tap':
      x = make(0.08);
      strike(x, fs, 0, 81, 0.012, 1, 'mallet');
      break;
    case 'perfect':
      x = make(0.6);
      strike(x, fs, 0, 88, 0.06, 0.7, 'glass');
      strike(x, fs, 0.05, 91, 0.06, 0.8, 'glass');
      strike(x, fs, 0.1, 96, 0.16, 1, 'glass');
      break;
    case 'good':
      x = make(0.4);
      strike(x, fs, 0, 84, 0.1, 1, 'bell');
      break;
    case 'miss':
      x = make(0.3);
      strike(x, fs, 0, 55, 0.05, 1, 'soft', -1);
      break;
    case 'countdown':
      x = make(0.25);
      strike(x, fs, 0, 76, 0.045, 1, 'mallet');
      break;
    case 'go':
      x = make(0.6);
      strike(x, fs, 0, 81, 0.13, 1, 'mallet');
      strike(x, fs, 0, 88, 0.13, 0.5, 'bell');
      break;
    case 'combo': {
      x = make(0.45);
      const pentatonic = [0, 2, 4, 7, 9];
      const s = Math.max(0, Math.min(14, Math.floor(step)));
      const midi = 76 + pentatonic[s % 5] + 12 * Math.floor(s / 5);
      strike(x, fs, 0, midi, 0.09, 1, 'bell');
      break;
    }
  }
  const p = peakOf(x);
  if (p > 0) {
    const g = UI_LEVEL[name] / p;
    for (let i = 0; i < x.length; i++) x[i] *= g;
  }
  fadeOut(x, Math.round(0.02 * fs));
  sanitize(x);
  return x;
}
