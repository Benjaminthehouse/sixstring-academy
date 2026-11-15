/**
 * Adversarial measurements of the synthesised sound. The estimators in this file are written here,
 * independently of `analysis.ts`, so the synth is not judged by its own ruler:
 *
 *  - `phaseFreq`: frequency of one partial from the phase advance of a DFT bin between two frames.
 *    Exact for an exponentially decaying sinusoid (both frames see the same decay), so it is the right
 *    tool for the fundamental of a plucked string, including one that is over in a third of a second.
 *  - `periodFreq`: the repetition period, by long normalised autocorrelation over many periods. This is
 *    what a tuner hears, and the only meaningful pitch for the driven tone, where distortion keeps
 *    moving energy (and phase) between the harmonics while the period stays put.
 *  - `fftPeak`: zero-padded FFT with a Blackman-Harris window and parabolic interpolation on the log
 *    magnitude, used to cross-check the other two.
 */
import { describe, expect, it } from 'vitest';
import { fft } from './dsp';
import { renderDrone, renderTone, TONE_VOICES } from './keys';
import { CLICK_SETS, DRUM_NAMES, DRUM_VARIANTS, renderClick, renderDrum } from './percussion';
import { renderPluck, renderRawPluck, renderSequence } from './pluck';
import { TONE_NAMES, type ToneName } from './tones';
import { UI_SOUNDS, renderUiSound } from './ui-sounds';

const m2f = (midi: number, a4 = 440): number => a4 * Math.pow(2, (midi - 69) / 12);
const cents = (hz: number, ref: number): number => 1200 * Math.log2(hz / ref);
const dB = (g: number): number => 20 * Math.log10(Math.max(g, 1e-12));

function rms(x: ArrayLike<number>, a = 0, b = x.length): number {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}

function peak(x: ArrayLike<number>, a = 0, b = x.length): number {
  let p = 0;
  for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}

/** Frequency of the partial near `approx` from the phase advance between two Hann-windowed frames. */
function phaseFreq(x: ArrayLike<number>, fs: number, approx: number, start: number, periods = 16, hopPeriods = 24): number {
  let f = approx;
  for (let pass = 0; pass < 4; pass++) {
    const P = fs / f;
    const W = Math.round(periods * P), hop = Math.round(hopPeriods * P);
    if (start + hop + W > x.length) return NaN;
    const w = (2 * Math.PI * f) / fs;
    const bin = (o: number): [number, number] => {
      let sr = 0, si = 0;
      for (let n = 0; n < W; n++) {
        const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * (n + 0.5)) / W);
        const v = x[o + n] * win, ph = w * (o + n);
        sr += v * Math.cos(ph);
        si -= v * Math.sin(ph);
      }
      return [sr, si];
    };
    const [ar, ai] = bin(start), [br, bi] = bin(start + hop);
    f += (Math.atan2(bi * ar - br * ai, br * ar + bi * ai) * fs) / (2 * Math.PI * hop);
  }
  return f;
}

/** Repetition frequency by normalised autocorrelation at a lag of many periods. */
function periodFreq(x: ArrayLike<number>, fs: number, approx: number, start: number, len: number): number {
  const p0 = fs / approx;
  const mult = Math.max(1, Math.floor((len * 0.5) / p0));
  const reach = Math.max(2, Math.min(Math.ceil(p0 * 0.03 * mult), Math.floor(p0 * 0.35)));
  const W = len - Math.ceil(mult * p0) - reach - 2;
  if (W < p0 * 2) return NaN;
  const corr = (lag: number): number => {
    let s = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < W; i++) {
      const a = x[start + i], b = x[start + i + lag];
      s += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    return s / Math.sqrt(e1 * e2 + 1e-300);
  };
  const centre = Math.round(mult * p0);
  let best = centre, bv = -2;
  // Coarse search on every other lag, then the neighbours of the best.
  for (let l = centre - reach; l <= centre + reach; l += 2) {
    const v = corr(l);
    if (v > bv) { bv = v; best = l; }
  }
  for (const l of [best - 1, best + 1]) {
    const v = corr(l);
    if (v > bv) { bv = v; best = l; }
  }
  const y0 = corr(best - 1), y2 = corr(best + 1);
  const d = y0 - 2 * bv + y2;
  const off = Math.abs(d) < 1e-30 ? 0 : (0.5 * (y0 - y2)) / d;
  return (fs * mult) / (best + off);
}

/** Frequency of the spectral peak near `approx`: Blackman-Harris window, zero padding (8x by default), parabolic interpolation. */
function fftPeak(x: ArrayLike<number>, fs: number, approx: number, start: number, len: number, tol = 0.03, pad = 8): number {
  let N = 1;
  while (N < len * pad) N <<= 1;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < len; i++) {
    const t = (2 * Math.PI * i) / (len - 1);
    re[i] = (x[start + i] || 0) * (0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t));
  }
  fft(re, im);
  const lo = Math.max(1, Math.floor((approx * (1 - tol) * N) / fs)), hi = Math.min(N / 2 - 2, Math.ceil((approx * (1 + tol) * N) / fs));
  let best = lo, bestM = -1;
  for (let k = lo; k <= hi; k++) {
    const m = re[k] * re[k] + im[k] * im[k];
    if (m > bestM) { bestM = m; best = k; }
  }
  const lm = (k: number): number => 0.5 * Math.log(re[k] * re[k] + im[k] * im[k] + 1e-300);
  const a = lm(best - 1), b = lm(best), c = lm(best + 1);
  const d = a - 2 * b + c;
  return ((best + (Math.abs(d) < 1e-30 ? 0 : (0.5 * (a - c)) / d)) * fs) / N;
}

/** Power spectrum of a Blackman-Harris-windowed frame (length rounded up to a power of two). */
function powerSpectrum(x: ArrayLike<number>, fs: number, start: number, len: number): { p: Float64Array; binHz: number } {
  let N = 1;
  while (N < len) N <<= 1;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < len; i++) {
    const t = (2 * Math.PI * i) / (len - 1);
    re[i] = (x[start + i] || 0) * (0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t));
  }
  fft(re, im);
  const p = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  return { p, binHz: fs / N };
}

/** Milliseconds from the first audible sample until the 5 ms peak envelope is within `frac` of its maximum. */
function attackMs(x: ArrayLike<number>, fs: number, frac: number): number {
  const n = Math.min(x.length, Math.round(0.2 * fs));
  const win = Math.round(0.005 * fs), hop = Math.max(1, Math.round(0.00025 * fs));
  const env: number[] = [];
  for (let o = 0; o + win <= n; o += hop) env.push(peak(x, o, o + win));
  const mx = Math.max(...env);
  let first = 0;
  while (first < n && Math.abs(x[first]) < 0.02 * mx) first++;
  for (let i = 0; i < env.length; i++) if (env[i] >= frac * mx) return Math.max(0, ((i * hop - first) / fs) * 1000);
  return Infinity;
}

/** Seconds for the 30 ms rms envelope to fall `drop` dB below its maximum. */
function decayTime(x: ArrayLike<number>, fs: number, drop: number): number {
  const win = Math.round(0.03 * fs), hop = Math.round(0.005 * fs);
  const env: number[] = [];
  for (let o = 0; o + win <= x.length; o += hop) env.push(rms(x, o, o + win));
  let at = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > env[at]) at = i;
  const target = env[at] * Math.pow(10, -drop / 20);
  for (let i = at; i < env.length; i++) if (env[i] < target) return (i - at) * 0.005;
  return NaN;
}

function centroid(x: ArrayLike<number>, fs: number, startSec: number, size = 4096): number {
  const { p, binHz } = powerSpectrum(x, fs, Math.round(startSec * fs), size);
  let num = 0, den = 0;
  for (let k = 1; k < p.length; k++) { num += p[k] * k; den += p[k]; }
  return den > 0 ? (num / den) * binHz : 0;
}

const SUSTAINED: ToneName[] = ['steel', 'nylon', 'clean', 'harmonic', 'bass-finger', 'bass-pick', 'bass-upright'];

interface Worst { value: number; where: string }
const worse = (w: Worst, value: number, where: string): void => {
  if (Math.abs(value) > Math.abs(w.value)) { w.value = value; w.where = where; }
};

/** Everything measured on one tone at one sample rate: one pass over MIDI 28..88 at each velocity. */
interface Survey {
  notes: number;
  pitch: Worst; drift: Worst; dc: Worst; first: Worst; last: Worst; cross: Worst;
  /** Worst attack times in ms: until within 3 dB of the peak, and within 1 dB, over the instrument's own range. */
  attack3: Worst; attack1: Worst;
  /** Per note at the loudest velocity: seconds to fall 20 dB, and the spectral centroid early and after a second. */
  perNote: Array<{ midi: number; t20: number; early: number; late: number | null }>;
}

const surveys = new Map<string, Survey>();

function survey(fs: number, tone: ToneName, velocities: readonly number[]): Survey {
  const key = `${fs}:${tone}`;
  const hit = surveys.get(key);
  if (hit) return hit;
  const w = (): Worst => ({ value: 0, where: '' });
  const out: Survey = { notes: 0, pitch: w(), drift: w(), dc: w(), first: w(), last: w(), cross: w(), attack3: w(), attack1: w(), perNote: [] };
  const bass = tone.startsWith('bass');
  const top = velocities[velocities.length - 1];
  for (let midi = 28; midi <= 88; midi++) {
    for (const velocity of velocities) {
      const x = renderPluck({ midi, sampleRate: fs, tone, velocity });
      const where = `MIDI ${midi} v${velocity}`;
      const f0 = m2f(midi);
      const P = fs / f0;
      out.notes++;
      let c: number;
      if (tone === 'driven') {
        // The waveform's period: early in the note and late in it.
        const win = Math.round(0.4 * fs);
        c = cents(periodFreq(x, fs, f0, Math.round(0.1 * fs), win), f0);
        const late = Math.min(x.length - win - 4, Math.round(x.length * 0.55));
        worse(out.drift, cents(periodFreq(x, fs, f0, late, win), f0) - c, where);
      } else if (tone === 'muted') {
        // Over in a fraction of a second: measured as soon as the body's own resonances (which
        // ring for a few periods at their own pitch) have died away.
        const per = Math.max(4, Math.min(12, Math.floor((x.length - 0.04 * fs) / P / 2.2)));
        c = cents(phaseFreq(x, fs, f0, Math.round(0.04 * fs), per, per), f0);
      } else {
        c = cents(phaseFreq(x, fs, f0, Math.round(0.12 * fs)), f0);
        // The same partial late in the note: a string that drifts would show here.
        const lateStart = Math.round(x.length * 0.55);
        if (lateStart + 41 * P < x.length && rms(x, lateStart, lateStart + Math.round(16 * P)) > 2e-4) {
          worse(out.drift, cents(phaseFreq(x, fs, f0, lateStart), f0) - c, where);
        }
        // Cross-check with a completely different estimator on a few notes.
        if (midi % 6 === 4 && velocity === top) worse(out.cross, cents(fftPeak(x, fs, f0, Math.round(0.1 * fs), Math.round(0.6 * fs)), f0) - c, where);
      }
      if (!Number.isFinite(c)) c = 9999;
      worse(out.pitch, c, where);
      let mean = 0;
      for (let i = 0; i < x.length; i++) mean += x[i];
      worse(out.dc, Math.abs(mean / x.length) / (rms(x) || 1), where);
      const pk = peak(x);
      worse(out.first, Math.abs(x[0]) / pk, where);
      worse(out.last, Math.abs(x[x.length - 1]) / pk, where);
      // Attack and decay are judged on the range the instrument is really played in.
      if (bass ? midi <= 60 : midi >= 40) {
        worse(out.attack3, attackMs(x, fs, Math.SQRT1_2), where);
        worse(out.attack1, attackMs(x, fs, 0.9), where);
        if (velocity === top) {
          out.perNote.push({ midi, t20: decayTime(x, fs, 20), early: centroid(x, fs, 0.01), late: x.length > 1.4 * fs ? centroid(x, fs, 1.0) : null });
        }
      }
    }
  }
  surveys.set(key, out);
  return out;
}

const RUNS: ReadonlyArray<readonly [number, readonly number[]]> = [[48000, [0.3, 1]], [44100, [0.8]]];

describe('tuning, note by note: MIDI 28..88, every tone, several velocities, both sample rates', () => {
  const lines: string[] = [];

  for (const [fs, velocities] of RUNS) {
    for (const tone of TONE_NAMES) {
      it(`${tone} at ${fs} Hz: within 2 cents, no drift, no DC, clean edges`, () => {
        const { notes, pitch, drift, dc, first, last, cross } = survey(fs, tone, velocities);
        lines.push(
          `${String(fs).padEnd(6)}${tone.padEnd(13)}${String(notes).padStart(4)} notes  pitch ${pitch.value.toFixed(3).padStart(7)} c (${pitch.where})` +
          `  drift ${drift.value.toFixed(3).padStart(7)} c  dc ${(dc.value * 100).toExponential(1)} %  first ${(first.value * 100).toFixed(1)} %  last ${(last.value * 100).toExponential(1)} %` +
          (cross.where ? `  fft-vs-phase ${cross.value.toFixed(3)} c` : ''),
        );
        expect(Math.abs(pitch.value), `${tone} worst at ${pitch.where}`).toBeLessThan(2);
        expect(Math.abs(drift.value), `${tone} drift worst at ${drift.where}`).toBeLessThan(1);
        expect(dc.value, `${tone} DC at ${dc.where}`).toBeLessThan(1e-3);
        expect(first.value, `${tone} first sample at ${first.where}`).toBeLessThan(0.2);
        expect(last.value, `${tone} last sample at ${last.where}`).toBeLessThan(1e-3);
        expect(Math.abs(cross.value)).toBeLessThan(0.5);
        // The requirement is 2 cents; the string model does far better, and should keep doing so.
        if (SUSTAINED.includes(tone)) {
          expect(Math.abs(pitch.value)).toBeLessThan(0.25);
          expect(Math.abs(drift.value)).toBeLessThan(0.3);
        }
        if (tone === 'driven') expect(Math.abs(pitch.value)).toBeLessThan(0.5);
      }, 120_000);
    }
  }

  it('prints the survey', () => {
    console.log(`\nIndependent tuning survey (worst case per tone):\n  ${lines.join('\n  ')}\n`);
    expect(lines.length).toBe(TONE_NAMES.length * 2);
  });

  it('the driven tone: its strong harmonics sit on multiples of the pitch even while the fundamental bin wanders', () => {
    // Distortion regenerates the fundamental from the upper harmonics; while the note settles the
    // phase of that one bin rotates, which reads as a few cents of offset on a fundamental-only
    // meter. The harmonics that carry the sound do not move, and neither does the period.
    for (const midi of [40, 45, 52, 64]) {
      const x = renderPluck({ midi, sampleRate: 48000, tone: 'driven', velocity: 0.8 });
      const f0 = m2f(midi);
      for (const k of [2, 3, 4, 5]) {
        const hz = fftPeak(x, 48000, k * f0, Math.round(0.1 * 48000), Math.round(0.6 * 48000), 0.01);
        expect(Math.abs(cents(hz, k * f0)), `MIDI ${midi} harmonic ${k}`).toBeLessThan(1);
      }
    }
  });

  it('a palm mute on every guitar, and on the dry string, is in tune', () => {
    for (const base of ['steel', 'nylon', 'clean'] as const) {
      let worst = 0;
      for (let midi = 40; midi <= 88; midi += 2) {
        const x = renderPluck({ midi, sampleRate: 48000, tone: 'muted', baseTone: base });
        const P = 48000 / m2f(midi);
        const per = Math.max(4, Math.min(12, Math.floor((x.length - 0.04 * 48000) / P / 2.2)));
        worst = Math.max(worst, Math.abs(cents(phaseFreq(x, 48000, m2f(midi), Math.round(0.04 * 48000), per, per), m2f(midi))));
        const raw = renderRawPluck({ midi, sampleRate: 48000, tone: 'muted', baseTone: base }).samples;
        expect(Math.abs(cents(phaseFreq(raw, 48000, m2f(midi), 384, 6, 6), m2f(midi))), `dry ${base} ${midi}`).toBeLessThan(0.5);
      }
      expect(worst, `muted ${base}`).toBeLessThan(2);
    }
    // Palm-muted chugs on the driven guitar (the metal style): judged by their period.
    for (let midi = 40; midi <= 64; midi += 3) {
      const x = renderPluck({ midi, sampleRate: 48000, tone: 'driven', articulation: 'palm-mute' });
      const win = Math.min(x.length - 600, Math.round(0.2 * 48000));
      expect(Math.abs(cents(periodFreq(x, 48000, m2f(midi), 480, win), m2f(midi))), `driven chug ${midi}`).toBeLessThan(2);
    }
  });

  it('follows A4 and a cents offset at every dynamic', () => {
    for (const velocity of [0.2, 0.6, 1]) {
      const x = renderPluck({ midi: 52, sampleRate: 44100, a4: 432, velocity });
      expect(Math.abs(cents(phaseFreq(x, 44100, m2f(52, 432), 5000), m2f(52, 432)))).toBeLessThan(0.1);
      const y = renderPluck({ midi: 76, sampleRate: 44100, cents: -37, velocity, tone: 'nylon' });
      // (The phase method needs a starting guess within a fraction of a percent.)
      const guess = fftPeak(y, 44100, m2f(76), 5000, 16384, 0.06);
      expect(Math.abs(cents(phaseFreq(y, 44100, guess, 5000), m2f(76)) + 37)).toBeLessThan(0.1);
    }
  });

  it('tones and the drone are on pitch and stay there, at both sample rates', () => {
    for (const fs of [44100, 48000]) {
      for (const voice of TONE_VOICES) {
        let worst = 0, drift = 0;
        for (let midi = 28; midi <= 88; midi += 3) {
          for (const velocity of [0.3, 1]) {
            const x = renderTone({ midi, sampleRate: fs, voice, seconds: 1.4, velocity });
            const f0 = m2f(midi);
            const early = phaseFreq(x, fs, f0, Math.round(0.08 * fs), 8, 12);
            const late = phaseFreq(x, fs, f0, Math.round(0.7 * fs), 8, 12);
            worst = Math.max(worst, Math.abs(cents(early, f0)));
            drift = Math.max(drift, Math.abs(cents(late, early)));
          }
        }
        expect(worst, `${voice} @${fs}`).toBeLessThan(0.05);
        expect(drift, `${voice} drift @${fs}`).toBeLessThan(0.05);
      }
      for (const [root, fifth] of [[28, false], [45, true], [64, true]] as const) {
        const x = renderDrone({ root, fifth, sampleRate: fs, seconds: 3.4 });
        let r: number = root;
        while (r < 36) r += 12;
        while (r > 52) r -= 12;
        // Each pitch of the drone is a pair of oscillators a hair apart: a long window sees their average.
        const hz = fftPeak(x, fs, m2f(r), Math.round(0.5 * fs), Math.round(2.5 * fs), 0.03, 2);
        expect(Math.abs(cents(hz, m2f(r))), `drone ${root} fifth ${fifth} @${fs}`).toBeLessThan(0.5);
        if (fifth) expect(Math.abs(cents(fftPeak(x, fs, m2f(r + 7), Math.round(0.5 * fs), Math.round(2.5 * fs), 0.03, 2), m2f(r + 7)))).toBeLessThan(0.5);
      }
    }
  });
});

describe('the sound, by numbers', () => {
  const fs = 48000;
  const guitars: ToneName[] = ['steel', 'nylon', 'clean', 'driven'];

  it('speaks at once: within 3 dB of its loudest inside 10 ms, for every tone, pitch and dynamic', () => {
    const report: string[] = [];
    for (const tone of TONE_NAMES) {
      const { attack3, attack1 } = survey(48000, tone, RUNS[0][1]);
      report.push(`${tone.padEnd(13)} within 3 dB of the peak after ${attack3.value.toFixed(1)} ms (${attack3.where || 'at once everywhere'}); within 1 dB after ${attack1.value.toFixed(1)} ms (${attack1.where || 'at once everywhere'})`);
      expect(attack3.value, `${tone} at ${attack3.where}`).toBeLessThan(10);
      // The last decibel can take a little longer where the note sits on a body resonance, which
      // swells for a few periods as it does on a real guitar: never as long as a soft attack would.
      expect(attack1.value, `${tone} at ${attack1.where}`).toBeLessThan(26);
      if (tone === 'clean' || tone === 'driven' || tone === 'muted') expect(attack1.value, `${tone} at ${attack1.where}`).toBeLessThan(10);
    }
    console.log(`\nAttack times (MIDI 40..88, basses 28..60):\n  ${report.join('\n  ')}\n`);
  }, 120_000);

  it('rings shorter the higher the note: decay times fall with pitch for every instrument', () => {
    for (const tone of [...guitars, 'harmonic', 'bass-finger', 'bass-pick', 'bass-upright'] as ToneName[]) {
      const notes = survey(48000, tone, RUNS[0][1]).perNote;
      const lo = notes[0].midi, hi = notes[notes.length - 1].midi;
      const bands: number[] = [];
      for (let m = lo; m < hi; m += 6) {
        const inBand = notes.filter((n) => n.midi >= m && n.midi < m + 6 && Number.isFinite(n.t20));
        bands.push(inBand.reduce((a, n) => a + n.t20, 0) / Math.max(1, inBand.length));
      }
      for (let i = 1; i < bands.length; i++) expect(bands[i], `${tone}: band ${i} (${bands.map((b) => b.toFixed(2)).join(' ')})`).toBeLessThan(bands[i - 1] * 1.02);
      expect(bands[bands.length - 1]).toBeLessThan(bands[0] * 0.65);
    }
  }, 120_000);

  it('gets darker as it rings: the spectral centroid falls over time on every note', () => {
    for (const tone of [...guitars, 'bass-finger', 'bass-pick'] as ToneName[]) {
      const notes = survey(48000, tone, RUNS[0][1]).perNote.filter((n) => n.late !== null);
      expect(notes.length).toBeGreaterThan(20);
      const rising = notes.filter((n) => !(n.late! < n.early));
      expect(rising.map((n) => n.midi), `${tone}: notes whose centroid does not fall`).toEqual([]);
    }
  }, 120_000);

  it('is neither thin nor buzzy: low strings keep their fundamental, highs roll off', () => {
    const levels = (tone: ToneName, midi: number): number[] => {
      const x = renderPluck({ midi, sampleRate: fs, tone, velocity: 0.8 });
      const { p, binHz } = powerSpectrum(x, fs, Math.round(0.05 * fs), 16384);
      const f0 = m2f(midi);
      const out: number[] = [];
      for (let k = 1; k <= 16; k++) {
        let e = 0;
        for (let b = Math.round((k * f0 - 12) / binHz); b <= Math.round((k * f0 + 12) / binHz); b++) e += p[b] || 0;
        out.push(e);
      }
      const mx = Math.max(...out);
      return out.map((e) => 10 * Math.log10(e / mx + 1e-12));
    };
    for (const tone of ['steel', 'nylon', 'clean'] as ToneName[]) {
      for (const midi of [40, 45, 50, 55, 59, 64]) {
        const h = levels(tone, midi);
        // Not thin: the fundamental is within 8 dB of the strongest partial on every open string.
        expect(h[0], `${tone} ${midi} fundamental`).toBeGreaterThan(-8);
        // Not buzzy: partials 9..16 lie well below the first four.
        const low = Math.max(...h.slice(0, 4)), high = Math.max(...h.slice(8));
        expect(high, `${tone} ${midi} upper partials`).toBeLessThan(low - 6);
      }
    }
    // Nylon is the mellow one, on every string.
    for (const midi of [40, 50, 59, 64]) expect(centroid(renderPluck({ midi, sampleRate: fs, tone: 'nylon' }), fs, 0.02)).toBeLessThan(centroid(renderPluck({ midi, sampleRate: fs, tone: 'steel' }), fs, 0.02));
  });

  it('the driven tone does not alias: power chords high on the neck stay on their harmonic grid', () => {
    // Three strings in exact 2:3:4 ratios make a periodic signal, so every legitimate product of
    // the distortion lies on a multiple of half the root. Anything else has folded back from above
    // the Nyquist frequency.
    const just = 1200 * Math.log2(1.5) - 700;
    for (const sampleRate of [44100, 48000]) {
      for (const root of [64, 71, 76]) {
        const notes = [
          { time: 0, midi: root, velocity: 1, tone: 'driven' as const, string: 3 },
          { time: 0, midi: root + 7, cents: just, velocity: 1, tone: 'driven' as const, string: 2 },
          { time: 0, midi: root + 12, velocity: 1, tone: 'driven' as const, string: 1 },
        ];
        // Each note three times over drives the clipper 10 dB harder than any real chord does.
        for (const [label, list, gain] of [['as played', notes, 0.8], ['driven 10 dB harder', [...notes, ...notes, ...notes], 0.3]] as const) {
          const x = renderSequence(list, { sampleRate, seconds: 1.2, gain });
          const len = Math.round(0.7 * sampleRate);
          const { p, binHz } = powerSpectrum(x, sampleRate, Math.round(0.1 * sampleRate), len);
          const base = m2f(root) / 2;
          const half = Math.max(6 * (sampleRate / len), 14);
          let on = 0, off = 0;
          for (let k = Math.ceil(60 / binHz); k < Math.min(p.length, 16000 / binHz); k++) {
            const f = k * binHz;
            if (Math.abs(f - Math.round(f / base) * base) <= half) on += p[k]; else off += p[k];
          }
          expect(10 * Math.log10((off + 1e-30) / (on + off)), `root ${root} @${sampleRate} ${label}`).toBeLessThan(-55);
        }
      }
    }
  });

  it('drums, clicks and interface sounds: no DC, clean edges, nothing above full scale, at both rates', () => {
    for (const rate of [44100, 48000]) {
      const all: Array<[string, Float32Array]> = [];
      for (const d of DRUM_NAMES) for (let variant = 0; variant < (DRUM_VARIANTS[d] ?? 1); variant++) all.push([`drum ${d}/${variant}`, renderDrum(d, rate, variant)]);
      for (const set of CLICK_SETS) for (const level of ['accent', 'medium', 'beat', 'sub'] as const) all.push([`click ${set}/${level}`, renderClick(set, level, rate)]);
      for (const u of UI_SOUNDS) all.push([`ui ${u}`, renderUiSound(u, rate)]);
      for (const [name, x] of all) {
        const pk = peak(x);
        expect(pk, name).toBeLessThanOrEqual(0.95);
        expect(pk, name).toBeGreaterThan(0.02);
        let mean = 0, bad = 0;
        for (let i = 0; i < x.length; i++) {
          mean += x[i];
          if (!Number.isFinite(x[i])) bad++;
        }
        expect(bad, `${name}: samples that are not numbers`).toBe(0);
        expect(Math.abs(mean / x.length) / rms(x), `${name} DC`).toBeLessThan(0.03);
        // (A drum may start with a bang, noise has no zero crossing to start on; it must not start on a plateau.)
        expect(Math.abs(x[0]) / pk, `${name} first sample`).toBeLessThan(0.35);
        expect(Math.abs(x[x.length - 1]) / pk, `${name} last sample`).toBeLessThan(2e-3);
      }
    }
  });

  it('a note replaced on its string, or stopped, leaves no step in the waveform', () => {
    // The offline sequencer applies the same 4 ms take-over the live synth does. A click would be a
    // jump between neighbouring samples far larger than the notes themselves ever make.
    for (const tone of guitars) {
      const steal = renderSequence([{ time: 0, midi: 52, string: 4, tone }, { time: 0.3037, midi: 55, string: 4, tone }], { sampleRate: fs, seconds: 1 });
      const alone = renderSequence([{ time: 0.3037, midi: 55, string: 4, tone }], { sampleRate: fs, seconds: 1 });
      const stopped = renderPluck({ midi: 52, sampleRate: fs, tone, duration: 0.2513 });
      const ring = renderPluck({ midi: 52, sampleRate: fs, tone });
      const step = (x: Float32Array, a: number, b: number): number => {
        let s = 0;
        for (let i = Math.max(1, Math.round(a * fs)); i < Math.min(x.length, Math.round(b * fs)); i++) s = Math.max(s, Math.abs(x[i] - x[i - 1]));
        return s;
      };
      // Around the take-over: no bigger step than the new note's own attack plus what the old note was doing.
      expect(step(steal, 0.3, 0.32), `${tone} steal`).toBeLessThan(step(alone, 0.3, 0.32) + step(steal, 0.25, 0.3) * 1.5 + 1e-4);
      // Around the stop: no bigger step than the ringing note has there anyway.
      expect(step(stopped, 0.25, 0.3), `${tone} stop`).toBeLessThan(step(ring, 0.22, 0.25) * 1.5 + 1e-4);
      expect(dB(rms(stopped, Math.round(0.45 * fs), stopped.length) / rms(ring, Math.round(0.45 * fs), Math.round(0.6 * fs)))).toBeLessThan(-40);
    }
  });
});
