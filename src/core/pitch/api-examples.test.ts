/**
 * The usage examples from API.md, run against replayed audio through the public barrel, so the
 * digest cannot drift away from the code.
 */
import { describe, expect, it } from 'vitest';
import { midiToFreq, midiToName } from '@/core/math/pitch-math';
import {
  analyze,
  attachTuner,
  compareNotes,
  computeChroma,
  detectOnsets,
  detectPitch,
  encodeWav,
  EventHub,
  matchChord,
  mix,
  NoteRecorder,
  type PitchSource,
  PitchTracker,
  pluckedString,
  rankChords,
  requiredTones,
  silence,
  strum,
  Tuner,
  type TunerState,
  tuningFrequencies,
  waitForChord,
  waitForNote,
} from './index';

const SR = 44100;

function replay(x: Float32Array, chroma = false): { source: PitchSource; run: () => void } {
  const hub = new EventHub();
  return { source: hub, run: () => hub.emitAll(analyze(x, SR, { chroma })) };
}

describe('API.md examples', () => {
  it('build a tuner', () => {
    const a4 = 440;
    const tuner = new Tuner({ targets: tuningFrequencies([40, 45, 50, 55, 59, 64], a4) });
    const states: TunerState[] = [];
    const celebrated: number[] = [];
    const x = mix(silence(1.4, SR), pluckedString({ freq: midiToFreq(45) * 1.0006, sampleRate: SR, duration: 1.1, attackNoise: 0.3 }), Math.round(0.2 * SR));
    const { source, run } = replay(x);
    const stop = attachTuner(source, tuner, (s) => states.push(s));
    tuner.onTuned((string) => celebrated.push(string));
    run();
    stop();
    const live = states.filter((s) => s.active);
    expect(live[live.length - 1]).toMatchObject({ string: 1, targetName: 'A2', inTune: true, direction: 'ok' });
    expect(celebrated).toEqual([1]);
    expect(states[states.length - 1].hint.code).toBe('listen');
    tuner.lock(5);
    expect(tuner.state.targetName).toBe('E4');
    tuner.lock(null);
    tuner.setMode('chromatic');
    tuner.setTargets([110, 220], ['low', 'high']);
    tuner.setA4(442);
  });

  it('wait for a note', async () => {
    const said: string[] = [];
    const x = mix(
      mix(silence(1.6, SR), pluckedString({ freq: midiToFreq(62), sampleRate: SR, duration: 0.4, attackNoise: 0.3 }), Math.round(0.2 * SR)),
      pluckedString({ freq: midiToFreq(64), sampleRate: SR, duration: 0.6, attackNoise: 0.3 }),
      Math.round(0.8 * SR),
    );
    const { source, run } = replay(x);
    const wait = waitForNote(source, 64, {
      toleranceCents: 40,
      octaves: 'exact',
      minHoldMs: 60,
      timeoutMs: 8000,
      onWrongNote: (n) => said.push(`That was ${midiToName(n.midi)}`),
    });
    run();
    const r = await wait;
    expect(r).toMatchObject({ ok: true, midi: 64, wrongNotes: [62] });
    expect(said).toEqual(['That was D4']);
    wait.cancel();
  });

  it('check a chord', async () => {
    const g = [43, 47, 50, 55, 59, 67].map((m) => midiToFreq(m));
    const x = mix(silence(1.4, SR), strum({ freqs: g, sampleRate: SR, duration: 1.0, attackNoise: 0.2 }), Math.round(0.3 * SR));
    const { source, run } = replay(x, true);
    const attempts: string[] = [];
    const wait = waitForChord(source, { name: 'G', pcs: [7, 11, 2], bass: 7 }, {
      threshold: 0.6,
      timeoutMs: 10000,
      rivals: [{ pcs: [4, 7, 11] }],
      onAttempt: (m) => attempts.push(`missing ${m.missing}, extra ${m.extra}`),
    });
    run();
    const c = await wait;
    expect(c.ok).toBe(true);
    expect(attempts).toEqual([]);
    const frame = computeChroma(x.subarray(0, Math.round(0.65 * SR)), SR);
    const m = matchChord(frame, { pcs: [7, 11, 2], bass: 7 });
    expect(m.score).toBeGreaterThan(0.6);
    expect(rankChords(frame, [{ name: 'Em', pcs: [4, 7, 11] }, { name: 'G', pcs: [7, 11, 2] }])[0].chord.name).toBe('G');
    // Every tone is required but the fifth above the bass: a G triad is no G7, unless asked leniently.
    expect(requiredTones({ pcs: [7, 11, 2, 5], bass: 7 })).toEqual([5, 7, 11]);
    const g7 = { pcs: [7, 11, 2, 5], bass: 7 };
    expect(matchChord(frame, g7).score).toBeLessThan(0.4);
    expect(matchChord(frame, { ...g7, required: [] }).score).toBeGreaterThan(0.6);
    expect(matchChord(frame, g7, { requiredThreshold: 0.2 }).score).toBeLessThanOrEqual(matchChord(frame, g7).score);
  });

  it('record a phrase', () => {
    const phrase = [57, 59, 60, 62];
    let x = silence(2.2, SR);
    phrase.forEach((midi, i) => {
      const p = pluckedString({ freq: midiToFreq(midi), sampleRate: SR, duration: 0.35, attackNoise: 0.3, seed: i + 1 });
      for (let k = 0; k < 800; k++) p[p.length - 1 - k] *= k / 800;
      x = mix(x, p, Math.round((0.2 + i * 0.45) * SR)).subarray(0, x.length);
    });
    const { source, run } = replay(x);
    const rec = new NoteRecorder(source, { minDurationMs: 50 });
    rec.start();
    run();
    const take = rec.stop();
    const result = compareNotes(take, phrase, { octaves: 'exact' });
    expect(result).toMatchObject({ correct: 4, perfect: true, accuracy: 1 });
  });

  it('one-off analysis and the pieces a screen might use directly', () => {
    const x = pluckedString({ freq: 196, sampleRate: SR, duration: 0.5, startTime: 0.1, attackNoise: 0.3 });
    const est = detectPitch(x, SR, { minFreq: 60 });
    expect(est.freq).toBeCloseTo(196, 0);
    expect(est.clarity).toBeGreaterThan(0.9);
    expect(detectOnsets(x, SR).map((o) => +o.time.toFixed(2))).toEqual([0.1]);
    expect(encodeWav(x, SR, { bitDepth: 16 }).length).toBe(44 + 2 * x.length);
    // The live tracker can be constructed anywhere; it only touches the browser on start().
    const tracker = new PitchTracker({ a4: 440 });
    expect(tracker.status).toBe('idle');
    expect(tracker.info).toBeNull();
    tracker.stop();
    expect(tracker.status).toBe('idle');
  });

  it('start() fails politely where there is no microphone (Node)', async () => {
    const tracker = new PitchTracker();
    const statuses: string[] = [];
    tracker.onStatus((s) => statuses.push(s));
    const res = await tracker.start();
    expect(res.ok).toBe(false);
    expect(statuses[0]).toBe('starting');
    expect(tracker.status).toBe('stopped');
  });
});
