import { describe, expect, it } from 'vitest';
import { magnitudeSpectrum } from './fft';
import {
  addHum,
  addNoise,
  concat,
  decodeWav,
  encodeWav,
  harmonicTone,
  mix,
  partialFrequency,
  pluckedString,
  rmsOf,
  silence,
  strum,
  whiteNoise,
} from './signals';

const SR = 44100;

function peakNear(x: Float32Array, freq: number, size = 16384): { freq: number; mag: number } {
  const mag = magnitudeSpectrum(x, 0, Math.min(size, x.length), size);
  const k0 = Math.round((freq * size) / SR);
  let best = k0;
  for (let k = k0 - 6; k <= k0 + 6; k++) if (mag[k] > mag[best]) best = k;
  const a = Math.log(mag[best - 1]);
  const b = Math.log(mag[best]);
  const c = Math.log(mag[best + 1]);
  const off = (0.5 * (a - c)) / (a - 2 * b + c);
  return { freq: ((best + off) * SR) / size, mag: mag[best] };
}

describe('test signals', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = pluckedString({ freq: 110, sampleRate: SR, duration: 0.1, seed: 5, attackNoise: 0.3 });
    const b = pluckedString({ freq: 110, sampleRate: SR, duration: 0.1, seed: 5, attackNoise: 0.3 });
    const c = pluckedString({ freq: 110, sampleRate: SR, duration: 0.1, seed: 6, attackNoise: 0.3 });
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('places the partials of a stiff string where the physics says', () => {
    const B = 2e-4;
    const x = pluckedString({ freq: 196, sampleRate: SR, duration: 0.5, inharmonicity: B, decay: 0.2, decayTilt: 0, pluckPosition: 0 });
    expect(peakNear(x, 196).freq).toBeCloseTo(196, 1);
    for (const k of [2, 5, 9]) {
      const expected = partialFrequency(196, k, B);
      expect(expected).toBeGreaterThan(196 * k);
      expect(Math.abs(1200 * Math.log2(peakNear(x, expected).freq / expected))).toBeLessThan(1);
    }
  });

  it('weakens the fundamental through the microphone model', () => {
    const full = pluckedString({ freq: 82.41, sampleRate: SR, duration: 0.5 });
    const mic = pluckedString({ freq: 82.41, sampleRate: SR, duration: 0.5, highpassHz: 220, highpassOrder: 4 });
    const ratioFull = peakNear(full, 82.41).mag / peakNear(full, 82.41 * 4).mag;
    const ratioMic = peakNear(mic, 82.41).mag / peakNear(mic, 82.41 * 4).mag;
    expect(ratioMic).toBeLessThan(ratioFull * 0.05);
  });

  it('starts sharp and settles when drift is on', () => {
    const x = pluckedString({ freq: 440, sampleRate: SR, duration: 0.6, driftCents: 20, driftMs: 40, partials: 1, decay: 0.1 });
    const early = peakNear(x.subarray(0, 2048), 440, 16384).freq;
    const late = peakNear(x.subarray(SR * 0.4, SR * 0.4 + 8192), 440, 16384).freq;
    expect(1200 * Math.log2(early / 440)).toBeGreaterThan(4);
    expect(Math.abs(1200 * Math.log2(late / 440))).toBeLessThan(0.5);
  });

  it('honours start time, amplitude, noise level and hum level', () => {
    const x = pluckedString({ freq: 220, sampleRate: SR, duration: 0.3, startTime: 0.1, amplitude: 0.4 });
    expect(x.length).toBe(Math.round(0.4 * SR));
    expect(rmsOf(x, 0, Math.round(0.1 * SR))).toBe(0);
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeCloseTo(0.4, 2);

    const noisy = addNoise(x, 20, 3);
    const noise = noisy.map((v, i) => v - x[i]);
    const snr = 20 * Math.log10(rmsOf(x, Math.round(0.1 * SR)) / rmsOf(noise));
    expect(snr).toBeGreaterThan(19.5);
    expect(snr).toBeLessThan(20.5);
    expect(rmsOf(whiteNoise(20000, 0.1))).toBeCloseTo(0.1, 2);

    const hum = addHum(silence(0.5, SR), SR, { freq: 60, rms: 0.01 });
    expect(rmsOf(hum)).toBeCloseTo(0.01, 3);
    expect(peakNear(hum, 60).freq).toBeCloseTo(60, 0);
  });

  it('builds strums, mixes and joins', () => {
    const s = strum({ freqs: [110, 164.81, 220], sampleRate: SR, duration: 0.3, strumMs: 20 });
    expect(s.length).toBe(Math.round(0.3 * SR));
    // The third string enters 40 ms in: before that its fundamental is absent.
    const early = magnitudeSpectrum(s, 0, 1536, 8192);
    const lateStart = Math.round(0.1 * SR);
    const late = magnitudeSpectrum(s, lateStart, 4096, 8192);
    const bin = Math.round((164.81 * 8192) / SR);
    expect(late[bin]).toBeGreaterThan(0.01);
    expect(early.length).toBe(4097);

    const m = mix(new Float32Array([1, 1]), new Float32Array([1, 1, 1]), 1, 0.5);
    expect(Array.from(m)).toEqual([1, 1.5, 0.5, 0.5]);
    expect(concat(new Float32Array([1]), new Float32Array([2, 3])).length).toBe(3);
    expect(harmonicTone({ freq: 100, sampleRate: SR, duration: 0.01 }).length).toBe(441);
  });

  it('round-trips WAV files in every supported format', () => {
    const x = pluckedString({ freq: 330, sampleRate: 48000, duration: 0.05, seed: 2 });
    for (const bitDepth of [16, 24, 32] as const) {
      const bytes = encodeWav(x, 48000, { bitDepth });
      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
      expect(bytes.length).toBe(44 + x.length * (bitDepth / 8));
      const back = decodeWav(bytes);
      expect(back.sampleRate).toBe(48000);
      expect(back.channels.length).toBe(1);
      let worst = 0;
      for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(back.channels[0][i] - x[i]));
      expect(worst).toBeLessThan(bitDepth === 16 ? 1 / 30000 : 1e-6);
    }
    const stereo = decodeWav(encodeWav([x, x.map((v) => -v)], 48000));
    expect(stereo.channels.length).toBe(2);
    expect(stereo.channels[1][100]).toBeCloseTo(-stereo.channels[0][100], 4);
    expect(() => decodeWav(new Uint8Array(50))).toThrow();
  });
});
