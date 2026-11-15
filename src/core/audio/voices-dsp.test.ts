import { describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { centsFromMidi, decayTime, estimatePitch, findOnsets, hasBadSamples, measureFundamental, spectralCentroid } from './analysis';
import { biquadCoeffs, biquadFilter, biquadMagnitude, fft, limiterCurve, peakOf, rmsOf, Rng, hashSeed } from './dsp';
import { makeRoomImpulse } from './engine';
import { VOICE_PARTIALS, droneLayers, renderDrone, renderTone } from './keys';
import { CLICK_SETS, DRUM_LEVEL, DRUM_NAMES, renderClick, renderDrum } from './percussion';
import { UI_SOUNDS, renderUiSound } from './ui-sounds';
import { decodeWav, encodeWav } from './wav';

describe('dsp primitives', () => {
  it('rng is deterministic and uniform enough', () => {
    const a = new Rng(42), b = new Rng(42);
    const xs = Array.from({ length: 2000 }, () => a.next());
    expect(xs.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.47);
    expect(mean).toBeLessThan(0.53);
    expect(hashSeed('a', 1)).not.toBe(hashSeed('a', 2));
    expect(hashSeed('a', 1)).toBe(hashSeed('a', 1));
  });

  it('biquads have the response they claim', () => {
    const fs = 48000;
    const lp = biquadCoeffs({ type: 'lowpass', freq: 1000, q: Math.SQRT1_2 }, fs);
    expect(biquadMagnitude(lp, 50, fs)).toBeCloseTo(1, 3);
    expect(20 * Math.log10(biquadMagnitude(lp, 1000, fs))).toBeCloseTo(-3.01, 1);
    expect(20 * Math.log10(biquadMagnitude(lp, 8000, fs))).toBeLessThan(-34);
    const pk = biquadCoeffs({ type: 'peaking', freq: 200, q: 4, gain: 6 }, fs);
    expect(20 * Math.log10(biquadMagnitude(pk, 200, fs))).toBeCloseTo(6, 2);
    expect(20 * Math.log10(biquadMagnitude(pk, 4000, fs))).toBeCloseTo(0, 1);
    const hs = biquadCoeffs({ type: 'highshelf', freq: 2000, gain: -6 }, fs);
    expect(20 * Math.log10(biquadMagnitude(hs, 16000, fs))).toBeCloseTo(-6, 0);
    // The time-domain filter agrees with the formula.
    const n = 4800;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 1000 * i) / fs);
    biquadFilter(x, lp);
    expect(rmsOf(x, 2400, n) * Math.SQRT2).toBeCloseTo(Math.SQRT1_2, 2);
    // Frequencies above Nyquist are clamped, not exploded.
    const wild = biquadCoeffs({ type: 'lowpass', freq: 30000 }, 22050);
    expect(Number.isFinite(wild.b0 + wild.a1 + wild.a2)).toBe(true);
  });

  it('fft finds a sine', () => {
    const N = 1024;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = Math.cos((2 * Math.PI * 37 * i) / N);
    fft(re, im);
    let best = 0;
    for (let k = 1; k < N / 2; k++) if (Math.hypot(re[k], im[k]) > Math.hypot(re[best], im[best])) best = k;
    expect(best).toBe(37);
    expect(Math.hypot(re[37], im[37])).toBeCloseTo(N / 2, 6);
  });

  it('the limiter curve is transparent below the knee and never exceeds its ceiling', () => {
    expect(limiterCurve(0.5)).toBe(0.5);
    expect(limiterCurve(-0.69)).toBe(-0.69);
    for (const x of [0.71, 1, 2, 10, 1000]) {
      expect(limiterCurve(x)).toBeLessThanOrEqual(0.98);
      expect(limiterCurve(-x)).toBeGreaterThanOrEqual(-0.98);
      expect(limiterCurve(x)).toBeGreaterThan(0.7);
    }
    // Continuous and monotonic through the knee.
    let prev = 0;
    for (let x = 0; x < 3; x += 0.001) {
      const y = limiterCurve(x);
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(y - prev).toBeLessThan(0.0011);
      prev = y;
    }
  });
});

describe('analysis tools', () => {
  it('measure pitch to a fraction of a cent', () => {
    const fs = 44100;
    for (const f of [41.2, 82.41, 196, 329.63, 987.77, 1318.5]) {
      const n = Math.round(fs * 0.8);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / fs;
        x[i] = Math.exp(-2 * t) * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * 2 * f * t + 1) + 0.3 * Math.sin(2 * Math.PI * 3 * f * t + 2));
      }
      const est = estimatePitch(x, fs, { length: 16384 });
      expect(est).not.toBeNull();
      expect(Math.abs(1200 * Math.log2(est!.hz / f))).toBeLessThan(0.2);
      expect(est!.clarity).toBeGreaterThan(0.9);
      expect(Math.abs(1200 * Math.log2(measureFundamental(x, fs, f * 1.01) / f))).toBeLessThan(0.01);
    }
    expect(estimatePitch(new Float32Array(8192), fs)).toBeNull();
  });

  it('finds onsets', () => {
    const fs = 48000;
    const x = new Float32Array(fs);
    for (const at of [4800, 24000, 40000]) for (let i = 0; i < 2000; i++) x[at + i] = 0.5 * Math.sin(i * 0.3) * Math.exp(-i / 400);
    const onsets = findOnsets(x, fs, 0.05);
    expect(onsets.length).toBe(3);
    expect(Math.abs(onsets[0] - 4800)).toBeLessThan(3);
    expect(Math.abs(onsets[2] - 40000)).toBeLessThan(3);
  });
});

describe('wav', () => {
  it('round-trips 16-bit, 24-bit and float', () => {
    const x = new Float32Array(1000);
    for (let i = 0; i < x.length; i++) x[i] = 0.8 * Math.sin(i * 0.1);
    for (const bitDepth of [16, 24, 32] as const) {
      const bytes = encodeWav(x, 44100, { bitDepth });
      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
      expect(bytes.length).toBe(44 + x.length * (bitDepth / 8));
      const back = decodeWav(bytes);
      expect(back.sampleRate).toBe(44100);
      expect(back.channels.length).toBe(1);
      let worst = 0;
      for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(back.channels[0][i] - x[i]));
      expect(worst).toBeLessThan(bitDepth === 16 ? 1 / 16000 : 1e-6);
    }
  });

  it('clips out-of-range samples and writes stereo', () => {
    const l = new Float32Array([2, -2, NaN, 0.5]);
    const r = new Float32Array([0, 0.25, -0.25, 1]);
    const back = decodeWav(encodeWav(l, 48000, { channels: [l, r] }));
    expect(back.channels.length).toBe(2);
    expect(back.channels[0][0]).toBeCloseTo(1, 3);
    expect(back.channels[0][1]).toBeCloseTo(-1, 3);
    expect(back.channels[0][2]).toBe(0);
    expect(back.channels[1][3]).toBeCloseTo(1, 3);
    expect(() => decodeWav(new Uint8Array(10))).toThrow();
  });
});

describe('drum kit', () => {
  for (const fs of [44100, 48000]) {
    it(`renders every drum cleanly at ${fs} Hz`, () => {
      for (const name of DRUM_NAMES) {
        const x = renderDrum(name, fs);
        expect(hasBadSamples(x), name).toBe(false);
        expect(peakOf(x), name).toBeCloseTo(DRUM_LEVEL[name], 2);
        expect(x.length / fs, name).toBeLessThan(2.5);
        expect(Math.abs(x[x.length - 1]), name).toBeLessThan(1e-3);
        // The hit starts immediately: nothing may delay a drum behind the beat.
        const onset = findOnsets(x, fs, DRUM_LEVEL[name] * 0.1)[0];
        expect(onset / fs, name).toBeLessThan(name === 'shaker' ? 0.02 : 0.006);
      }
    });
  }

  it('is deterministic, and variants differ', () => {
    expect(Array.from(renderDrum('snare', 44100).subarray(0, 500))).toEqual(Array.from(renderDrum('snare', 44100).subarray(0, 500)));
    const a = renderDrum('hihatClosed', 44100, 0), b = renderDrum('hihatClosed', 44100, 1);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    expect(diff).toBeGreaterThan(1);
  });

  it('each drum sits in its own register and lasts as long as it should', () => {
    const fs = 48000;
    const centroid = (n: Parameters<typeof renderDrum>[0]) => spectralCentroid(renderDrum(n, fs), fs, 0, 4096);
    expect(centroid('kick')).toBeLessThan(400);
    expect(centroid('tomLow')).toBeLessThan(centroid('tomHigh'));
    expect(centroid('snare')).toBeGreaterThan(centroid('tomHigh'));
    expect(centroid('hihatClosed')).toBeGreaterThan(6000);
    expect(centroid('crash')).toBeGreaterThan(3000);
    expect(decayTime(renderDrum('hihatOpen', fs), fs, 30)).toBeGreaterThan(decayTime(renderDrum('hihatClosed', fs), fs, 30) * 3);
    expect(decayTime(renderDrum('crash', fs), fs, 30)).toBeGreaterThan(0.8);
    expect(decayTime(renderDrum('sidestick', fs), fs, 30)).toBeLessThan(0.12);
  });
});

describe('metronome clicks', () => {
  it('every set has four clean levels, accent loudest', () => {
    for (const set of CLICK_SETS) {
      const levels = (['accent', 'medium', 'beat', 'sub'] as const).map((l) => renderClick(set, l, 48000));
      for (const x of levels) {
        expect(hasBadSamples(x), set).toBe(false);
        expect(x.length / 48000, set).toBeLessThan(0.5);
        expect(findOnsets(x, 48000, peakOf(x) * 0.2)[0] / 48000, set).toBeLessThan(0.003);
      }
      const peaks = levels.map((x) => peakOf(x));
      expect(peaks[0], set).toBeGreaterThan(peaks[2]);
      expect(peaks[2], set).toBeGreaterThan(peaks[3]);
      expect(peaks[0], set).toBeLessThan(0.7);
    }
  });

  it('the accent of the pitched sets is higher than the beat', () => {
    for (const set of ['beep', 'woodblock', 'clave'] as const) {
      const hi = spectralCentroid(renderClick(set, 'accent', 48000), 48000, 0, 1024);
      const lo = spectralCentroid(renderClick(set, 'beat', 48000), 48000, 0, 1024);
      expect(hi, set).toBeGreaterThan(lo);
    }
  });
});

describe('tone generator', () => {
  it('every voice is exactly in tune across the range', () => {
    for (const voice of ['sine', 'reference', 'epiano', 'organ'] as const) {
      let worst = 0;
      for (const midi of [28, 40, 45, 57, 64, 69, 76, 88]) {
        const x = renderTone({ midi, sampleRate: 48000, seconds: 1.2, voice });
        expect(hasBadSamples(x)).toBe(false);
        expect(peakOf(x)).toBeLessThan(0.9);
        const c = centsFromMidi(measureFundamental(x, 48000, midiToFreq(midi), { start: 2400 }), midi);
        worst = Math.max(worst, Math.abs(c));
      }
      expect(worst, voice).toBeLessThan(0.05);
    }
  });

  it('honours A4, cents and explicit frequencies', () => {
    const x = renderTone({ midi: 69, a4: 432, sampleRate: 44100, seconds: 1, voice: 'sine' });
    expect(measureFundamental(x, 44100, 432, { start: 2000 })).toBeCloseTo(432, 3);
    const y = renderTone({ freq: 300, cents: -50, sampleRate: 44100, seconds: 1, voice: 'reference' });
    expect(measureFundamental(y, 44100, 290, { start: 2000 })).toBeCloseTo(300 * Math.pow(2, -50 / 1200), 3);
  });

  it('starts and ends without clicks, and the electric piano decays', () => {
    const x = renderTone({ midi: 60, sampleRate: 48000, seconds: 0.5, voice: 'organ' });
    expect(Math.abs(x[0])).toBeLessThan(1e-3);
    expect(Math.abs(x[x.length - 1])).toBeLessThan(2e-3);
    const ep = renderTone({ midi: 60, sampleRate: 48000, seconds: 3, voice: 'epiano' });
    expect(rmsOf(ep, 0, 4800)).toBeGreaterThan(rmsOf(ep, 96000, 100800) * 1.5);
    expect(VOICE_PARTIALS.reference[0]).toBe(1);
  });

  it('the drone averages exactly on pitch, with or without the fifth', () => {
    const layers = droneLayers({ root: 57, fifth: true });
    // Pairs are detuned symmetrically in cents.
    for (let i = 0; i < layers.length; i += 2) {
      const mid = Math.sqrt(layers[i].freq * layers[i + 1].freq);
      const semis = 12 * Math.log2(mid / 440) + 69;
      expect(Math.abs(semis - Math.round(semis))).toBeLessThan(1e-9);
    }
    expect(droneLayers({ root: 57 }).length).toBe(4);
    expect(layers.length).toBe(6);
    // Any octave of A folds to the same comfortable register.
    expect(droneLayers({ root: 81 })[0].freq).toBeCloseTo(droneLayers({ root: 45 })[0].freq, 9);
    const x = renderDrone({ root: 45, sampleRate: 44100, seconds: 2 });
    expect(hasBadSamples(x)).toBe(false);
    expect(peakOf(x)).toBeLessThan(0.8);
    const est = estimatePitch(x, 44100, { start: 22050, length: 32768 });
    expect(Math.abs(centsFromMidi(est!.hz, 45))).toBeLessThan(1);
  });
});

describe('interface sounds', () => {
  it('are short, quiet and clean', () => {
    for (const name of UI_SOUNDS) {
      const x = renderUiSound(name, 48000);
      expect(hasBadSamples(x), name).toBe(false);
      expect(peakOf(x), name).toBeLessThanOrEqual(0.31);
      expect(peakOf(x), name).toBeGreaterThan(0.08);
      expect(x.length / 48000, name).toBeLessThan(2.7);
      expect(Math.abs(x[x.length - 1]), name).toBeLessThan(1e-3);
    }
  });

  it('combo climbs with its step, and "correct" rises while "wrong" falls', () => {
    const pitch = (x: Float32Array, at: number) => estimatePitch(x, 48000, { start: Math.round(at * 48000), length: 2048, minHz: 150, maxHz: 3000 })!.hz;
    expect(pitch(renderUiSound('combo', 48000, 3), 0.01)).toBeGreaterThan(pitch(renderUiSound('combo', 48000, 0), 0.01));
    const correct = renderUiSound('correct', 48000);
    expect(pitch(correct, 0.12)).toBeGreaterThan(pitch(correct, 0.01));
    const wrong = renderUiSound('wrong', 48000);
    expect(pitch(wrong, 0.14)).toBeLessThan(pitch(wrong, 0.01));
  });
});

describe('room impulse', () => {
  it('is a decaying, decorrelated stereo pair with unit energy', () => {
    const [l, r] = makeRoomImpulse(48000);
    expect(l.length).toBe(r.length);
    const energy = (x: Float32Array) => x.reduce((s, v) => s + v * v, 0);
    expect(energy(l)).toBeCloseTo(1, 3);
    expect(rmsOf(l, 2400, 7200)).toBeGreaterThan(rmsOf(l, 40000, 44800) * 4);
    let corr = 0;
    for (let i = 0; i < l.length; i++) corr += l[i] * r[i];
    expect(Math.abs(corr)).toBeLessThan(0.2);
    expect(peakOf(l, 0, 500)).toBe(0); // pre-delay
  });
});
