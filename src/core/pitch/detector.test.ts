import { describe, expect, it } from 'vitest';
import { centsBetween, midiToFreq } from '@/core/math/pitch-math';
import { detectPitch, PitchDetector } from './detector';
import { harmonicTone, mix, pluckedString, rmsOf, silence, whiteNoise } from './signals';

const SR = 44100;
const cents = (est: number, truth: number): number => centsBetween(est, truth);

describe('PitchDetector behaviour', () => {
  it('reports nothing for silence and for input below the gate', () => {
    const det = new PitchDetector({ sampleRate: SR });
    expect(det.detect(silence(0.3, SR)).freq).toBe(0);
    const quiet = harmonicTone({ freq: 220, sampleRate: SR, duration: 0.3, amplitude: 0.0002 });
    const est = det.detect(quiet);
    expect(est.freq).toBe(0);
    expect(est.rms).toBeGreaterThan(0);
    expect(est.rms).toBeLessThan(0.0004);
  });

  it('gives noise a low clarity', () => {
    const det = new PitchDetector({ sampleRate: SR });
    let worst = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const est = det.detect(whiteNoise(SR * 0.3, 0.1, seed));
      worst = Math.max(worst, est.clarity);
    }
    expect(worst).toBeLessThan(0.6);
  });

  it('gives a clean tone a clarity near 1 and reports its level', () => {
    const x = harmonicTone({ freq: 196, sampleRate: SR, duration: 0.3, amplitude: 0.5, harmonics: 1 });
    const est = detectPitch(x, SR);
    expect(est.clarity).toBeGreaterThan(0.995);
    expect(est.rms).toBeCloseTo(0.5 / Math.SQRT2, 2);
    expect(Math.abs(cents(est.freq, 196))).toBeLessThan(0.05);
  });

  it('is independent of level, down to very quiet input', () => {
    for (const amplitude of [0.9, 0.05, 0.003]) {
      const x = pluckedString({ freq: 146.83, sampleRate: SR, duration: 0.3, amplitude, decay: 0.5 });
      const est = detectPitch(x, SR);
      expect(Math.abs(cents(est.freq, 146.83)), `amplitude ${amplitude}`).toBeLessThan(0.2);
    }
  });

  it('finds the low E from its harmonics alone', () => {
    // Partials 2..7 only: what a small microphone delivers for the open sixth string.
    const e2 = midiToFreq(40);
    const x = harmonicTone({ freq: e2, sampleRate: SR, duration: 0.3, amplitudes: [0, 0.5, 1, 0.7, 0.4, 0.3, 0.2], seed: 4 });
    const est = detectPitch(x, SR);
    expect(Math.abs(cents(est.freq, e2))).toBeLessThan(0.1);
    expect(est.clarity).toBeGreaterThan(0.98);
  });

  it('uses a short window for high notes and a longer one only for low notes', () => {
    const det = new PitchDetector({ sampleRate: SR });
    const high = det.detect(harmonicTone({ freq: midiToFreq(76), sampleRate: SR, duration: 0.3 }));
    const low = det.detect(harmonicTone({ freq: midiToFreq(40), sampleRate: SR, duration: 0.3 }));
    expect(high.window).toBe(det.minWindow);
    expect(low.window).toBe(det.maxWindow);
    expect(det.minWindow / SR).toBeLessThan(0.03);
    expect(det.maxWindow / SR).toBeLessThan(0.05);
  });

  it('hears bass notes only when asked to, without slowing the guitar range down', () => {
    const e1 = midiToFreq(28);
    const x = pluckedString({ freq: e1, sampleRate: SR, duration: 0.5, decay: 0.6 });
    const bass = new PitchDetector({ sampleRate: SR, minFreq: 30 });
    const guitar = new PitchDetector({ sampleRate: SR });
    expect(Math.abs(cents(bass.detect(x).freq, e1))).toBeLessThan(0.3);
    expect(bass.maxWindow).toBeGreaterThan(guitar.maxWindow);
    expect(bass.minWindow).toBe(guitar.minWindow);
    // Five-string bass low B.
    const b0 = midiToFreq(23);
    const five = new PitchDetector({ sampleRate: SR, minFreq: 23 });
    const y = pluckedString({ freq: b0, sampleRate: SR, duration: 0.8, decay: 0.4 });
    expect(Math.abs(cents(five.detect(y).freq, b0))).toBeLessThan(0.5);
  });

  it('works with exactly one short window of audio, and returns nothing with less', () => {
    const det = new PitchDetector({ sampleRate: SR });
    const a4 = harmonicTone({ freq: 440, sampleRate: SR, duration: 0.3, harmonics: 5 });
    const est = det.detect(a4.subarray(0, det.minWindow));
    expect(Math.abs(cents(est.freq, 440))).toBeLessThan(1);
    expect(det.detect(a4.subarray(0, det.minWindow - 1)).freq).toBe(0);
  });

  it('is not thrown by a DC offset', () => {
    for (const midi of [40, 57, 76]) {
      const freq = midiToFreq(midi);
      const x = pluckedString({ freq, sampleRate: SR, duration: 0.3, amplitude: 0.3, decay: 0.5 }).map((v) => v + 0.2);
      const est = detectPitch(x, SR);
      expect(Math.abs(cents(est.freq, freq)), `midi ${midi}`).toBeLessThan(1);
    }
  });

  describe('a new note over a string that is still ringing', () => {
    // Every new/old pair in the first positions at the intervals that share a sub-harmonic.
    const INTERVALS = [-24, -19, -12, -7, -5, -4, -3, 3, 4, 5, 7, 12, 19, 24];
    const run = (db: number, stale: boolean, intervals: number[]): { wrong: number; n: number } => {
      const det = new PitchDetector({ sampleRate: SR });
      let wrong = 0;
      let n = 0;
      for (let fresh = 40; fresh <= 69; fresh++) {
        for (const iv of intervals) {
          const old = fresh + iv;
          if (old < 40 || old > 76) continue;
          for (const seed of [1, 2]) {
            const a = pluckedString({ freq: midiToFreq(fresh), sampleRate: SR, duration: 0.3, seed });
            const b = pluckedString({ freq: midiToFreq(old) * 1.003, sampleRate: SR, duration: 0.3, seed: seed + 20, decay: 0.8 });
            const x = mix(a, b, 0, (rmsOf(a) / rmsOf(b)) * Math.pow(10, db / 20));
            const est = det.detect(x, 0, x.length, stale ? midiToFreq(old) : 0);
            n++;
            if (!(Math.abs(cents(est.freq, midiToFreq(fresh))) < 30) || est.clarity < 0.7) wrong++;
          }
        }
      }
      return { wrong, n };
    };

    it('finds the new note when the old one is 10 dB down, at any interval', () => {
      const r = run(-10, false, INTERVALS);
      expect(r.n).toBeGreaterThan(500);
      expect(r.wrong / r.n).toBeLessThan(0.01);
    });

    it('is not fooled by the phantom sub-harmonic of a fourth or fifth at -8 dB', () => {
      // E4 over a ringing B3 repeats exactly at the period of E2; the spectrum test tells them apart.
      const r = run(-8, false, [-7, -5, 5, 7]);
      expect(r.wrong).toBeLessThanOrEqual(2);
    });

    it('needs to be told about the old note when it rings an octave or two below', () => {
      // Alone, the frame honestly reads as the lower note (its odd partials are there)...
      const alone = run(-8, false, [-24, -12]);
      expect(alone.wrong).toBeGreaterThan(0);
      // ...but the tracker knows what was sounding before the pluck and passes it in.
      const told = run(-8, true, [-24, -19, -12]);
      expect(told.wrong / told.n).toBeLessThan(0.02);
      const all = run(-8, true, INTERVALS);
      expect(all.wrong / all.n).toBeLessThan(0.03);
    });
  });

  it('holds the octave of a sustained note through the hint, but lets go when the note really changes', () => {
    const det = new PitchDetector({ sampleRate: SR });
    // A 110 Hz tone whose odd partials carry only about 8 % of the energy: on its own it reads as 220.
    const thin = harmonicTone({ freq: 110, sampleRate: SR, duration: 0.3, amplitudes: [0.25, 1, 0.2, 0.5, 0.1, 0.3], seed: 2 });
    expect(Math.abs(cents(det.detect(thin).freq, 220))).toBeLessThan(5);
    // A tracker that was already following 110 Hz stays there.
    expect(Math.abs(cents(det.detect(thin, 110).freq, 110))).toBeLessThan(5);
    // A real octave jump (no odd partials left at all) is followed despite the hint.
    const upper = harmonicTone({ freq: 220, sampleRate: SR, duration: 0.3, harmonics: 6, seed: 3 });
    expect(Math.abs(cents(det.detect(upper, 110).freq, 220))).toBeLessThan(1);
    // And a stale hint from a higher note does not stop a low note being found.
    const low = pluckedString({ freq: 82.41, sampleRate: SR, duration: 0.3 });
    expect(Math.abs(cents(det.detect(low, 329.63).freq, 82.41))).toBeLessThan(1);
    expect(Math.abs(cents(det.detect(low, 164.81).freq, 82.41))).toBeLessThan(1);
  });

  it('respects the configured frequency range', () => {
    const det = new PitchDetector({ sampleRate: SR, minFreq: 150, maxFreq: 500 });
    expect(det.minFreq).toBe(150);
    const inRange = det.detect(harmonicTone({ freq: 300, sampleRate: SR, duration: 0.2 }));
    expect(Math.abs(cents(inRange.freq, 300))).toBeLessThan(0.5);
    // A 1 kHz tone is above the range: whatever is reported must lie inside it (a sub-harmonic), never above.
    const above = det.detect(harmonicTone({ freq: 1000, sampleRate: SR, duration: 0.2, harmonics: 3 }));
    expect(above.freq).toBeLessThanOrEqual(510);
    expect(() => new PitchDetector({ sampleRate: 0 })).toThrow();
  });

  it('the cached convenience function agrees with a detector instance', () => {
    const x = pluckedString({ freq: 246.94, sampleRate: 48000, duration: 0.3 });
    const a = detectPitch(x, 48000);
    const b = new PitchDetector({ sampleRate: 48000 }).detect(x);
    expect(a.freq).toBe(b.freq);
    expect(detectPitch(x, 48000, { hintFreq: 246.94 }).freq).toBeCloseTo(a.freq, 6);
  });
});
