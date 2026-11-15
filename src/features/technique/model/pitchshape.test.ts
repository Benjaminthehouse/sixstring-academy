import { describe, expect, it } from 'vitest';
import { EventHub, analyze } from '@/core/pitch';
import { mixInto, pitchWarp, renderNote } from '@/core/pitch/adversarial-kit';
import { analyzeBend, analyzePrebend, analyzeVibrato, midiFreq, type PitchSample } from './pitchshape';

/** Readings every 10 ms following a pitch curve in cents against a MIDI note. */
function readings(midi: number, from: number, to: number, centsAt: (t: number) => number): PitchSample[] {
  const out: PitchSample[] = [];
  for (let t = from; t < to; t += 0.01) out.push({ time: t, freq: midiFreq(midi) * 2 ** (centsAt(t - from) / 1200), clarity: 0.95 });
  return out;
}

/** A bend of a whole step from D4 (62) toward E4 (64) that rises over 0.3 s and holds at `reach` cents of the bend. */
const bendCurve = (reach: number, opts: { overshoot?: number; sink?: number } = {}) => (t: number): number => {
  if (t < 0.15) return 0;
  if (t < 0.45) return ((t - 0.15) / 0.3) * (reach + (opts.overshoot ?? 0));
  if (t < 0.6) return reach + (opts.overshoot ?? 0) * (1 - (t - 0.45) / 0.15);
  return reach - (opts.sink ?? 0) * ((t - 0.6) / 1.4);
};

const SPEC = { fromMidi: 62, toMidi: 64, toleranceCents: 10 };

describe('analyzeBend', () => {
  it('passes a bend held on the target', () => {
    const r = analyzeBend(readings(62, 1, 3, bendCurve(198)), [1], SPEC);
    expect(r.found).toBe(true);
    expect(r.reachedCents).toBeCloseTo(-2, 0);
    expect(r.heldMs).toBeGreaterThan(1200);
    expect(r.verdict).toBe('clean');
    expect(r.messages[0]).toBe('In tune: your bend held 2 cents from E.');
  });

  it('says how far short a bend stopped', () => {
    const r = analyzeBend(readings(62, 1, 3, bendCurve(160)), [1], SPEC);
    expect(r.reachedCents).toBeCloseTo(-40, 0);
    expect(r.verdict).toBe('not-yet');
    expect(r.messages[0]).toBe('Your bend stopped 40 cents short of E: push a little further.');
  });

  it('ignores the target note played first and judges the bend after it', () => {
    const target = readings(64, 0, 1.5, () => 0);
    const bend = readings(62, 2, 4, bendCurve(182));
    const r = analyzeBend([...target, ...bend], [0, 2], SPEC);
    expect(r.reachedCents).toBeCloseTo(-18, 0);
    expect(r.verdict).toBe('close');
  });

  it('notices an overshoot and a sinking hold', () => {
    const r = analyzeBend(readings(62, 1, 3, bendCurve(200, { overshoot: 45 })), [1], SPEC);
    expect(r.overshootCents).toBeGreaterThan(30);
    expect(r.messages.some((m) => m.includes('overshot'))).toBe(true);
    const s = analyzeBend(readings(62, 1, 3, bendCurve(200, { sink: 30 })), [1], SPEC);
    expect(s.sinkingCents).toBeGreaterThan(12);
    expect(s.messages.some((m) => m.includes('sank'))).toBe(true);
  });

  it('says so when only the target, or nothing, was played', () => {
    expect(analyzeBend(readings(64, 0, 1.5, () => 0), [0], SPEC).found).toBe(false);
    expect(analyzeBend([], [], SPEC).found).toBe(false);
  });
});

describe('analyzePrebend', () => {
  const spec = { fretMidi: 62, bentMidi: 64, toleranceCents: 15, beatSec: 1 };
  const curve = (start: number, end: number, releaseSec: number) => (t: number): number => {
    if (t < 0.3) return start;
    if (t < 0.3 + releaseSec) return start + ((end - start) * (t - 0.3)) / releaseSec;
    return end;
  };
  it('passes a pre-bend that starts on E and falls smoothly to D', () => {
    const r = analyzePrebend(readings(62, 1, 3, curve(200, 2, 0.8)), [1], spec);
    expect(r.verdict).toBe('clean');
    expect(r.releaseMs).toBeGreaterThan(400);
  });
  it('flags a pre-bend that starts flat and a release that drops', () => {
    const flat = analyzePrebend(readings(62, 1, 3, curve(160, 0, 0.8)), [1], spec);
    expect(flat.startCents).toBeCloseTo(-40, 0);
    expect(flat.verdict).not.toBe('clean');
    const drop = analyzePrebend(readings(62, 1, 3, curve(200, 0, 0.08)), [1], spec);
    expect(drop.messages.some((m) => m.includes('let it fall over the whole beat'))).toBe(true);
  });
});

describe('analyzeVibrato', () => {
  const wave = (hz: number, width: number, centre: number) => (t: number): number => centre + (width / 2) * Math.sin(2 * Math.PI * hz * t);
  it('passes bending vibrato in time that stays at or above the note', () => {
    // 2 waves per beat at 60 BPM = 2 Hz, 40 cents wide, from 0 to +40.
    const r = analyzeVibrato(readings(67, 0, 4, wave(2, 40, 20)), { midi: 67, style: 'bend', wavesPerBeat: 2, bpm: 60 });
    expect(r.perBeat).toBeCloseTo(2, 1);
    expect(r.widthCents).toBeGreaterThan(30);
    expect(r.verdict).toBe('clean');
  });
  it('flags bending vibrato that dips below the note, and vibrato out of time', () => {
    const dip = analyzeVibrato(readings(67, 0, 4, wave(2, 40, 0)), { midi: 67, style: 'bend', wavesPerBeat: 2, bpm: 60 });
    expect(dip.messages.some((m) => m.includes('below G'))).toBe(true);
    const fast = analyzeVibrato(readings(67, 0, 4, wave(3.5, 40, 20)), { midi: 67, style: 'bend', wavesPerBeat: 2, bpm: 60 });
    expect(fast.verdict).not.toBe('clean');
    expect(fast.messages[0]).toContain('slow the waves down');
  });
  it('wants classical vibrato centred on the note', () => {
    const ok = analyzeVibrato(readings(71, 0, 3, wave(4, 20, 0)), { midi: 71, style: 'classical', wavesPerBeat: 4, bpm: 60 });
    expect(ok.verdict).toBe('clean');
    const high = analyzeVibrato(readings(71, 0, 3, wave(4, 20, 25)), { midi: 71, style: 'classical', wavesPerBeat: 4, bpm: 60 });
    expect(high.verdict).not.toBe('clean');
  });
  it('says so when the note was held without vibrato', () => {
    const r = analyzeVibrato(readings(67, 0, 3, () => 0), { midi: 67, style: 'bend', wavesPerBeat: 2, bpm: 60 });
    expect(r.verdict).toBe('not-yet');
  });
});

describe('bends through the real pitch pipeline (audio-engine guitar, bent by resampling)', () => {
  const SR = 44100;
  function take(reachCents: number): { samples: PitchSample[]; onsets: number[] } {
    // Target E4 first (string 3 fret 9), a rest, then string 3 fret 7 bent toward E4 and held.
    const target = renderNote({ string: 3, fret: 9, tone: 'steel', velocity: 0.7, cents: 0, sampleRate: SR }, 1.2);
    const plain = renderNote({ string: 3, fret: 7, tone: 'steel', velocity: 0.7, cents: 0, sampleRate: SR }, 3.5);
    const bent = pitchWarp(plain, SR, 3, (t) => (t < 0.15 ? 0 : t < 0.5 ? ((t - 0.15) / 0.35) * reachCents : reachCents));
    let x: Float32Array = new Float32Array(Math.round(5.5 * SR));
    x = mixInto(x, target.subarray(0, Math.round(1.0 * SR)), 1, Math.round(0.3 * SR));
    x = mixInto(x, bent, 1, Math.round(2.2 * SR));
    const hub = new EventHub();
    const samples: PitchSample[] = [];
    const onsets: number[] = [];
    hub.on('pitch', (r) => samples.push({ time: r.time, freq: r.freq, clarity: r.clarity }));
    hub.on('onset', (o) => onsets.push(o.time));
    hub.emitAll(analyze(x, SR));
    return { samples, onsets };
  }
  it('passes a whole-step bend in tune and catches one that stops short', () => {
    const good = take(200);
    const r = analyzeBend(good.samples, good.onsets, SPEC);
    expect(r.found).toBe(true);
    expect(Math.abs(r.reachedCents)).toBeLessThanOrEqual(10);
    expect(r.verdict).toBe('clean');
    const short = take(150);
    const s = analyzeBend(short.samples, short.onsets, SPEC);
    expect(s.reachedCents).toBeLessThan(-35);
    expect(s.reachedCents).toBeGreaterThan(-65);
    expect(s.verdict).toBe('not-yet');
  }, 60000);
});
