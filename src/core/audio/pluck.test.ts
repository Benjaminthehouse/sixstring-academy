import { describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { attackTime, centsFromMidi, decaySlopeDb, estimatePitch, hasBadSamples, measureFundamental, spectralCentroid } from './analysis';
import { peakOf, rmsOf } from './dsp';
import { renderPluck, renderRawPluck, renderSequence, renderStrum, strumPlan } from './pluck';
import { designLoop, loopT60 } from './string-model';
import { INSTRUMENTS, locateOnNeck, resolveTone, velocityGain, type ToneName } from './tones';

const LOW = 28;
const HIGH = 88;

/** Worst tuning error in cents over MIDI 28..88, by both measurement methods. */
function tuningSurvey(tone: ToneName, sampleRate: number, raw = false): { phase: number; phaseAt: number; auto: number; autoAt: number } {
  let phase = 0, phaseAt = 0, auto = 0, autoAt = 0;
  for (let midi = LOW; midi <= HIGH; midi++) {
    const x = raw ? renderRawPluck({ midi, sampleRate, tone }).samples : renderPluck({ midi, sampleRate, tone });
    // Skip the attack: the body's own resonances ring for the first tenth of a second.
    const start = Math.round(0.12 * sampleRate);
    const f = measureFundamental(x, sampleRate, midiToFreq(midi), { start });
    const cp = centsFromMidi(f, midi);
    if (Math.abs(cp) > Math.abs(phase)) { phase = cp; phaseAt = midi; }
    const est = estimatePitch(x, sampleRate, { start: Math.round(0.05 * sampleRate), length: 16384 });
    expect(est, `autocorrelation found no pitch for MIDI ${midi} (${tone})`).not.toBeNull();
    const ca = centsFromMidi(est!.hz, midi);
    if (Math.abs(ca) > Math.abs(auto)) { auto = ca; autoAt = midi; }
  }
  return { phase, phaseAt, auto, autoAt };
}

describe('tuning of the rendered pluck (MIDI 28..88)', () => {
  const report: string[] = [];

  for (const sampleRate of [44100, 48000]) {
    it(`steel-string acoustic is within 2 cents at ${sampleRate} Hz (both estimators)`, () => {
      const r = tuningSurvey('steel', sampleRate);
      report.push(`steel @${sampleRate}: fundamental worst ${r.phase.toFixed(4)} c (MIDI ${r.phaseAt}), autocorrelation worst ${r.auto.toFixed(4)} c (MIDI ${r.autoAt})`);
      expect(Math.abs(r.phase)).toBeLessThan(2);
      expect(Math.abs(r.auto)).toBeLessThan(2);
      // In practice it is far better than the requirement.
      expect(Math.abs(r.phase)).toBeLessThan(0.3);
      expect(Math.abs(r.auto)).toBeLessThan(1);
    });
  }

  for (const tone of ['nylon', 'clean', 'harmonic', 'bass-finger', 'bass-pick', 'bass-upright'] as const) {
    it(`${tone} is within 2 cents`, () => {
      const r = tuningSurvey(tone, 48000);
      report.push(`${tone} @48000: fundamental worst ${r.phase.toFixed(4)} c (MIDI ${r.phaseAt}), autocorrelation worst ${r.auto.toFixed(4)} c (MIDI ${r.autoAt})`);
      expect(Math.abs(r.phase)).toBeLessThan(2);
      expect(Math.abs(r.auto)).toBeLessThan(2);
    });
  }

  it('driven electric: the period (what a tuner hears) is within 2 cents', () => {
    // Distortion keeps redistributing energy between harmonics, so the phase of the fundamental
    // alone wanders; the repetition period of the waveform is the meaningful pitch.
    let worst = 0, at = 0;
    for (let midi = LOW; midi <= HIGH; midi++) {
      const x = renderPluck({ midi, sampleRate: 48000, tone: 'driven' });
      const est = estimatePitch(x, 48000, { start: 2400, length: 16384 });
      expect(est).not.toBeNull();
      const c = centsFromMidi(est!.hz, midi);
      if (Math.abs(c) > Math.abs(worst)) { worst = c; at = midi; }
    }
    report.push(`driven @48000: autocorrelation worst ${worst.toFixed(4)} c (MIDI ${at})`);
    expect(Math.abs(worst)).toBeLessThan(2);
    const raw = tuningSurvey('driven', 48000, true);
    report.push(`driven dry string @48000: fundamental worst ${raw.phase.toFixed(4)} c (MIDI ${raw.phaseAt})`);
    expect(Math.abs(raw.phase)).toBeLessThan(0.5);
  });

  it('palm-muted: the string itself is within 2 cents', () => {
    // A muted note is over in a fraction of a second, so it is measured from its first milliseconds
    // on the dry string. (Through the acoustic body, a note this short is coloured by the body's own
    // resonances ringing next to it; that is measured and reported, with a looser bound.)
    let worst = 0, at = 0, worstBody = 0, bodyAt = 0;
    for (let midi = LOW; midi <= HIGH; midi++) {
      const raw = renderRawPluck({ midi, sampleRate: 48000, tone: 'muted' }).samples;
      const c = centsFromMidi(measureFundamental(raw, 48000, midiToFreq(midi), { start: 384, periods: 6, hopPeriods: 6 }), midi);
      if (Math.abs(c) > Math.abs(worst)) { worst = c; at = midi; }
      if (midi >= 40) {
        const fin = renderPluck({ midi, sampleRate: 48000, tone: 'muted' });
        const est = estimatePitch(fin, 48000, { start: 384, length: Math.min(8192, fin.length - 384) });
        expect(est).not.toBeNull();
        const cb = centsFromMidi(est!.hz, midi);
        if (Math.abs(cb) > Math.abs(worstBody)) { worstBody = cb; bodyAt = midi; }
      }
    }
    report.push(`muted dry string @48000: fundamental worst ${worst.toFixed(4)} c (MIDI ${at})`);
    report.push(`muted through the acoustic body @48000 (MIDI 40..88): autocorrelation worst ${worstBody.toFixed(3)} c (MIDI ${bodyAt})`);
    expect(Math.abs(worst)).toBeLessThan(2);
    expect(Math.abs(worstBody)).toBeLessThan(5);
  });

  it('follows the A4 reference and a cents offset exactly', () => {
    const x = renderPluck({ midi: 57, sampleRate: 48000, a4: 442 });
    expect(centsFromMidi(measureFundamental(x, 48000, 221, { start: 6000 }), 57, 442)).toBeCloseTo(0, 1);
    const y = renderPluck({ midi: 64, sampleRate: 48000, cents: 25, tone: 'clean' });
    expect(centsFromMidi(measureFundamental(y, 48000, midiToFreq(64), { start: 6000 }), 64)).toBeCloseTo(25, 1);
  });

  it('prints the worst cases', () => {
    console.log(`\nTuning accuracy of rendered plucks, MIDI ${LOW}..${HIGH}:\n  ${report.join('\n  ')}\n`);
    expect(report.length).toBeGreaterThan(0);
  });
});

describe('loop design', () => {
  it('puts exactly one period of phase delay round the loop at the fundamental', () => {
    for (const fs of [22050, 44100, 48000, 96000]) {
      for (const midi of [28, 40, 52, 64, 76, 88]) {
        const freq = midiToFreq(midi);
        const d = designLoop({ freq, sampleRate: fs, t60: 4, t60High: 0.5 });
        const w = (2 * Math.PI * freq) / fs;
        // Phase of the allpass (C + z^-1) / (1 + C z^-1) at w.
        const C = d.allpass;
        const num = Math.atan2(-Math.sin(w), C + Math.cos(w));
        const den = Math.atan2(-C * Math.sin(w), 1 + C * Math.cos(w));
        const allpassDelay = -(num - den) / w;
        const onePoleDelay = d.onePole > 0 ? Math.atan2(d.onePole * Math.sin(w), 1 - d.onePole * Math.cos(w)) / w : 0;
        expect(d.delay + d.sections + onePoleDelay + allpassDelay).toBeCloseTo(fs / freq, 8);
        expect(d.fraction).toBeGreaterThanOrEqual(0.5);
        expect(d.fraction).toBeLessThan(1.5 + 1e-9);
        expect(Math.abs(C)).toBeLessThan(1);
      }
    }
  });

  it('meets the requested decay times and stays stable', () => {
    const d = designLoop({ freq: 110, sampleRate: 48000, t60: 6, t60High: 0.6 });
    expect(loopT60(d, 110, 48000)).toBeCloseTo(6, 3);
    expect(loopT60(d, 4000, 48000)).toBeCloseTo(0.6, 3);
    expect(d.gain).toBeLessThan(1);
    let sum = 0;
    for (const t of d.taps) sum += t;
    expect(sum).toBeLessThan(1); // DC gain of the loop
    expect(d.onePole).toBe(0);
  });
});

describe('rendered pluck: health', () => {
  const tones: ToneName[] = ['steel', 'nylon', 'clean', 'driven', 'muted', 'harmonic', 'bass-finger', 'bass-pick', 'bass-upright'];

  it('has no NaN, no denormals and a bounded peak for every tone, pitch and dynamic', () => {
    for (const tone of tones) {
      for (const midi of [28, 40, 47, 59, 64, 76, 88]) {
        for (const velocity of [0, 0.3, 0.8, 1]) {
          const x = renderPluck({ midi, sampleRate: 44100, tone, velocity });
          expect(hasBadSamples(x), `${tone} ${midi} v${velocity}`).toBe(false);
          const peak = peakOf(x);
          expect(peak, `${tone} ${midi} v${velocity} peak`).toBeLessThan(0.98);
          if (velocity >= 0.3) expect(peak).toBeGreaterThan(0.02);
          // Ends in silence: no click when the buffer runs out.
          expect(Math.abs(x[x.length - 1])).toBeLessThan(1e-3);
        }
      }
    }
  });

  it('is deterministic', () => {
    const a = renderPluck({ midi: 52, sampleRate: 48000, tone: 'steel', velocity: 0.7, string: 4 });
    const b = renderPluck({ midi: 52, sampleRate: 48000, tone: 'steel', velocity: 0.7, string: 4 });
    expect(a.length).toBe(b.length);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
    expect(diff).toBe(0);
  });

  it('gets louder and brighter with velocity', () => {
    const soft = renderPluck({ midi: 64, sampleRate: 48000, velocity: 0.3 });
    const hard = renderPluck({ midi: 64, sampleRate: 48000, velocity: 1 });
    expect(rmsOf(hard, 0, 9600)).toBeGreaterThan(rmsOf(soft, 0, 9600) * 2.5);
    expect(spectralCentroid(hard, 48000, 0.01)).toBeGreaterThan(spectralCentroid(soft, 48000, 0.01) * 1.05);
    expect(velocityGain(1)).toBeCloseTo(1, 6);
    expect(velocityGain(0.5)).toBeLessThan(0.5);
  });

  it('keeps single notes at a consistent loudness across the neck', () => {
    const levels = [40, 45, 50, 55, 59, 64, 69, 76, 81].map((m) => rmsOf(renderPluck({ midi: m, sampleRate: 48000 }), 0, 9600));
    const max = Math.max(...levels), min = Math.min(...levels);
    expect(20 * Math.log10(max / min)).toBeLessThan(3.5);
  });

  it('an up-stroke is the same note with inverted polarity', () => {
    const down = renderPluck({ midi: 59, sampleRate: 48000, direction: 'down' });
    const up = renderPluck({ midi: 59, sampleRate: 48000, direction: 'up' });
    let worst = 0;
    for (let i = 0; i < down.length; i++) worst = Math.max(worst, Math.abs(down[i] + up[i]));
    expect(worst).toBeLessThan(1e-6);
  });

  it('releases a note with a duration and leaves a ringing one alone', () => {
    const short = renderPluck({ midi: 52, sampleRate: 48000, duration: 0.3 });
    const long = renderPluck({ midi: 52, sampleRate: 48000 });
    expect(short.length).toBeLessThan(long.length / 3);
    expect(rmsOf(short, 14400 + 4800, short.length)).toBeLessThan(rmsOf(long, 14400 + 4800, 14400 + 9600) * 0.1);
  });
});

describe('rendered pluck: it behaves like a guitar', () => {
  const fs = 48000;

  it('has a fast attack', () => {
    for (const tone of ['steel', 'nylon', 'clean'] as const) {
      for (const midi of [40, 52, 64, 76]) {
        expect(attackTime(renderPluck({ midi, sampleRate: fs, tone }), fs), `${tone} ${midi}`).toBeLessThan(0.02);
      }
    }
  });

  it('starts bright and gets darker as it rings', () => {
    for (const tone of ['steel', 'nylon', 'clean'] as const) {
      for (const midi of [40, 47, 55, 64]) {
        const x = renderPluck({ midi, sampleRate: fs, tone });
        const early = spectralCentroid(x, fs, 0.01);
        const late = spectralCentroid(x, fs, 1.2);
        expect(late, `${tone} ${midi}`).toBeLessThan(early * 0.93);
      }
    }
  });

  it('low strings ring longer than high ones', () => {
    for (const tone of ['steel', 'nylon', 'clean'] as const) {
      const slopes = [40, 52, 64, 76, 88].map((m) => decaySlopeDb(renderPluck({ midi: m, sampleRate: fs, tone }), fs, 0.15, 0.7));
      for (let i = 1; i < slopes.length; i++) expect(slopes[i], `${tone} step ${i}`).toBeLessThan(slopes[i - 1]);
      // Top of the neck: clearly fast. Low E, once the attack has passed: slower than 11 dB/s.
      expect(slopes[4]).toBeLessThan(-18);
      expect(decaySlopeDb(renderPluck({ midi: 40, sampleRate: fs, tone }), fs, 1.2, 3)).toBeGreaterThan(-11);
    }
  });

  it('decays in two stages: a percussive front, then a long ring', () => {
    for (const tone of ['steel', 'nylon'] as const) {
      for (const midi of [40, 45, 52, 59]) {
        const x = renderPluck({ midi, sampleRate: fs, tone });
        const early = decaySlopeDb(x, fs, 0.03, 0.3);
        const late = decaySlopeDb(x, fs, 1, 2);
        expect(early, `${tone} ${midi}`).toBeLessThan(late * 1.4);
      }
    }
    // A solid-body electric has much less of it than an acoustic.
    const ratio = (tone: 'steel' | 'clean'): number => {
      const x = renderPluck({ midi: 45, sampleRate: fs, tone });
      return decaySlopeDb(x, fs, 0.03, 0.3) / decaySlopeDb(x, fs, 1, 2);
    };
    expect(ratio('steel')).toBeGreaterThan(ratio('clean'));
  });

  it('nylon is mellower than steel, the bridge pickup brighter than the neck', () => {
    const steel = spectralCentroid(renderPluck({ midi: 52, sampleRate: fs, tone: 'steel' }), fs, 0.01);
    const nylon = spectralCentroid(renderPluck({ midi: 52, sampleRate: fs, tone: 'nylon' }), fs, 0.01);
    expect(nylon).toBeLessThan(steel);
    const clean = spectralCentroid(renderPluck({ midi: 52, sampleRate: fs, tone: 'clean' }), fs, 0.05);
    const driven = spectralCentroid(renderPluck({ midi: 52, sampleRate: fs, tone: 'driven' }), fs, 0.05);
    expect(driven).toBeGreaterThan(clean);
  });

  it('a palm mute is short, a harmonic is pure and long', () => {
    const open = renderPluck({ midi: 45, sampleRate: fs });
    const muted = renderPluck({ midi: 45, sampleRate: fs, tone: 'muted' });
    expect(muted.length).toBeLessThan(open.length / 4);
    expect(decaySlopeDb(muted, fs, 0.02, 0.2)).toBeLessThan(-100);
    const harmonic = renderPluck({ midi: 64, sampleRate: fs, tone: 'harmonic' });
    const normal = renderPluck({ midi: 64, sampleRate: fs });
    expect(spectralCentroid(harmonic, fs, 0.05)).toBeLessThan(spectralCentroid(normal, fs, 0.05));
    expect(decaySlopeDb(harmonic, fs, 0.2, 1)).toBeGreaterThan(decaySlopeDb(normal, fs, 0.2, 1));
  });

  it('the driven tone sustains more than the clean one', () => {
    const clean = renderPluck({ midi: 52, sampleRate: fs, tone: 'clean' });
    const driven = renderPluck({ midi: 52, sampleRate: fs, tone: 'driven' });
    expect(decaySlopeDb(driven, fs, 0.2, 1.5)).toBeGreaterThan(decaySlopeDb(clean, fs, 0.2, 1.5));
  });
});

describe('tones and neck positions', () => {
  it('resolves muted and harmonic to articulations of the base guitar', () => {
    expect(resolveTone('muted')).toEqual({ instrument: 'steel', articulation: 'palm-mute' });
    expect(resolveTone('harmonic', undefined, 'clean')).toEqual({ instrument: 'clean', articulation: 'harmonic' });
    expect(resolveTone('driven', 'palm-mute')).toEqual({ instrument: 'driven', articulation: 'palm-mute' });
    expect(resolveTone()).toEqual({ instrument: 'steel', articulation: 'normal' });
  });

  it('finds string and fret', () => {
    const steel = INSTRUMENTS.steel;
    expect(locateOnNeck(steel, 40)).toEqual({ stringIndex: 0, fret: 0, wound: true });
    expect(locateOnNeck(steel, 64)).toEqual({ stringIndex: 5, fret: 0, wound: false });
    expect(locateOnNeck(steel, 64, 2)).toEqual({ stringIndex: 4, fret: 5, wound: false });
    expect(locateOnNeck(steel, 57, 4)).toEqual({ stringIndex: 2, fret: 7, wound: true });
    expect(locateOnNeck(steel, 36).fret).toBe(0); // below the lowest string: drop tunings
    expect(locateOnNeck(INSTRUMENTS['bass-finger'], 28)).toEqual({ stringIndex: 0, fret: 0, wound: true });
  });

  it('the same pitch sounds different on a thicker string', () => {
    const first = renderPluck({ midi: 64, sampleRate: 48000, string: 1 });
    const third = renderPluck({ midi: 64, sampleRate: 48000, string: 3 });
    let diff = 0;
    for (let i = 0; i < Math.min(first.length, third.length); i++) diff = Math.max(diff, Math.abs(first[i] - third[i]));
    expect(diff).toBeGreaterThan(0.01);
    expect(centsFromMidi(measureFundamental(third, 48000, midiToFreq(64), { start: 6000 }), 64)).toBeCloseTo(0, 1);
  });
});

describe('strums and sequences', () => {
  const fs = 44100;
  const E_MAJOR = [40, 47, 52, 56, 59, 64];

  it('plans a down-strum low to high and an up-strum high to low', () => {
    const down = strumPlan(E_MAJOR, { direction: 'down', spread: 0.03 });
    expect(down.map((n) => n.midi)).toEqual(E_MAJOR);
    expect(down.map((n) => n.string)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(down[0].offset).toBe(0);
    expect(down[5].offset).toBeCloseTo(0.03, 9);
    expect(down[0].velocity).toBeGreaterThan(down[5].velocity);
    const up = strumPlan(E_MAJOR, { direction: 'up', spread: 0.03, align: 'end' });
    expect(up.map((n) => n.midi)).toEqual(E_MAJOR.slice().reverse());
    expect(up[0].offset).toBeCloseTo(-0.03, 9);
    expect(up[5].offset).toBeCloseTo(0, 9);
    expect(strumPlan([50, 57, 62, 66]).map((n) => n.string)).toEqual([4, 3, 2, 1]);
  });

  it('renders a strum that is bounded, staggered and louder than one note', () => {
    const chord = renderStrum(E_MAJOR, { sampleRate: fs, spread: 0.04, seconds: 2 });
    const note = renderPluck({ midi: 40, sampleRate: fs });
    expect(hasBadSamples(chord)).toBe(false);
    expect(peakOf(chord)).toBeLessThanOrEqual(0.98);
    expect(rmsOf(chord, 4410, 22050)).toBeGreaterThan(rmsOf(note, 4410, 22050));
    // Energy keeps arriving during the strum: the last 10 ms of the spread is louder than the first.
    expect(rmsOf(chord, Math.round(0.04 * fs), Math.round(0.06 * fs))).toBeGreaterThan(rmsOf(chord, 0, Math.round(0.01 * fs)));
  });

  it('a new note on a string cuts the previous one; other strings keep ringing', () => {
    const sameString = renderSequence(
      [{ time: 0, midi: 64, string: 1 }, { time: 0.5, midi: 67, string: 1 }],
      { sampleRate: fs, seconds: 1.5 },
    );
    const otherString = renderSequence(
      [{ time: 0, midi: 64, string: 1 }, { time: 0.5, midi: 67, string: 2 }],
      { sampleRate: fs, seconds: 1.5 },
    );
    const start = Math.round(0.7 * fs);
    // After the second note, only the two-string version still contains E4.
    const cut = estimatePitch(sameString, fs, { start, length: 8192 });
    expect(cut).not.toBeNull();
    expect(centsFromMidi(cut!.hz, 67)).toBeCloseTo(0, 0);
    const e4 = (x: Float32Array): number => {
      let sr = 0, si = 0;
      const w = (2 * Math.PI * midiToFreq(64)) / fs;
      for (let n = 0; n < 8192; n++) {
        const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / 8192);
        sr += x[start + n] * win * Math.cos(w * n);
        si += x[start + n] * win * Math.sin(w * n);
      }
      return Math.hypot(sr, si);
    };
    expect(e4(sameString)).toBeLessThan(e4(otherString) * 0.05);
  });

  it('a sequence is deterministic, in tune and never clips', () => {
    const notes = [0, 2, 4, 5, 7, 9, 11, 12].map((s, i) => ({ time: i * 0.25, midi: 60 + s, duration: 0.22 }));
    const a = renderSequence(notes, { sampleRate: fs, tone: 'nylon', tail: 1 });
    const b = renderSequence(notes, { sampleRate: fs, tone: 'nylon', tail: 1 });
    expect(Array.from(a.subarray(0, 2000))).toEqual(Array.from(b.subarray(0, 2000)));
    expect(peakOf(a)).toBeLessThanOrEqual(0.98);
    const est = estimatePitch(a, fs, { start: Math.round(0.26 * fs), length: 4096 });
    expect(centsFromMidi(est!.hz, 62)).toBeCloseTo(0, 0);
  });

  it('a dense driven power-chord sequence stays inside full scale', () => {
    const notes = [];
    for (let i = 0; i < 16; i++) for (const m of [40, 47, 52]) notes.push({ time: i * 0.15, midi: m, velocity: 1, tone: 'driven' as const, string: m === 40 ? 6 : m === 47 ? 5 : 4 });
    const x = renderSequence(notes, { sampleRate: fs, tail: 1, gain: 1.5 });
    expect(hasBadSamples(x)).toBe(false);
    expect(peakOf(x)).toBeLessThanOrEqual(0.98);
  });
});
