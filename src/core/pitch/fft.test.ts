import { describe, expect, it } from 'vitest';
import { FFT, hannWindow, magnitudeSpectrum, nextPow2 } from './fft';
import { seededRandom } from './signals';

describe('fft', () => {
  it('matches a direct DFT', () => {
    const n = 64;
    const rand = seededRandom(3);
    const x = Array.from({ length: n }, () => rand() * 2 - 1);
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    new FFT(n).forward(re, im);
    for (const k of [0, 1, 5, 17, 32, 63]) {
      let sr = 0;
      let si = 0;
      for (let j = 0; j < n; j++) {
        sr += x[j] * Math.cos((2 * Math.PI * k * j) / n);
        si -= x[j] * Math.sin((2 * Math.PI * k * j) / n);
      }
      expect(re[k]).toBeCloseTo(sr, 9);
      expect(im[k]).toBeCloseTo(si, 9);
    }
  });

  it('inverse undoes forward', () => {
    const n = 1024;
    const rand = seededRandom(9);
    const re = Float64Array.from({ length: n }, () => rand() - 0.5);
    const im = Float64Array.from({ length: n }, () => rand() - 0.5);
    const re0 = re.slice();
    const im0 = im.slice();
    const fft = new FFT(n);
    fft.forward(re, im);
    fft.inverse(re, im);
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(re[i] - re0[i]), Math.abs(im[i] - im0[i]));
    expect(worst).toBeLessThan(1e-12);
  });

  it('rejects sizes that are not powers of two', () => {
    expect(() => new FFT(1000)).toThrow();
    expect(nextPow2(1000)).toBe(1024);
    expect(nextPow2(1024)).toBe(1024);
  });

  it('reads a sine at its amplitude through the Hann window', () => {
    const sr = 48000;
    const n = 4096;
    const x = Float32Array.from({ length: n }, (_, i) => 0.25 * Math.sin((2 * Math.PI * 1000 * i) / sr));
    const mag = magnitudeSpectrum(x, 0, n, n);
    let peak = 0;
    let at = 0;
    for (let k = 0; k < mag.length; k++) {
      if (mag[k] > peak) {
        peak = mag[k];
        at = k;
      }
    }
    expect((at * sr) / n).toBeCloseTo(1000, -1);
    expect(peak).toBeGreaterThan(0.21);
    expect(peak).toBeLessThan(0.26);
    expect(hannWindow(8)[0]).toBe(0);
  });
});
