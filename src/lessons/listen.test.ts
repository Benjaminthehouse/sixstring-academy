/**
 * Play exercises against real (synthetic) guitar audio: plucked strings and strums are analysed by
 * the pitch engine, replayed through an EventHub, and `listenFor` must turn what was heard into an
 * answer the graders accept or reject correctly.
 */
import { describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { analyze, EventHub, mix, pluckedString, silence, strum, type PitchSource } from '@/core/pitch';
import { chordVoicings } from '@/core/guitar';
import { chordPcs } from '@/core/theory';
import { grade } from './grade';
import { PLAY_TOLERANCE_CENTS, chordWaitArgs, listenFor, noteWaitArgs, trackerOptionsFor } from './listen';
import type { Exercise, PlayChordExercise, PlayNoteExercise, PlayPhraseExercise } from './types';

const SR = 44100;
const alternative: Exercise = { type: 'true-false', statement: 's', answer: true, explain: 'e' };

function replay(samples: Float32Array, chroma = false): { source: PitchSource; run: () => void } {
  const hub = new EventHub();
  return { source: hub, run: () => hub.emitAll(analyze(samples, SR, { chroma })) };
}

/** Notes plucked one after another, each cleanly ended, on a bed of silence. */
function melody(midis: readonly number[], gap = 0.5): Float32Array {
  let x = silence(0.4 + midis.length * gap + 0.8, SR);
  midis.forEach((midi, i) => {
    const p = pluckedString({ freq: midiToFreq(midi), sampleRate: SR, duration: gap * 0.8, attackNoise: 0.3, seed: i + 1 });
    for (let k = 0; k < 800; k++) p[p.length - 1 - k] *= k / 800;
    x = mix(x, p, Math.round((0.2 + i * gap) * SR)).subarray(0, x.length);
  });
  return x;
}

function strummed(midis: readonly number[]): Float32Array {
  return mix(silence(1.6, SR), strum({ freqs: midis.map((m) => midiToFreq(m)), sampleRate: SR, duration: 1.1, attackNoise: 0.2 }), Math.round(0.3 * SR));
}

describe('listen plans', () => {
  it('chords need chroma frames, notes do not', () => {
    expect(trackerOptionsFor({ type: 'play-chord', prompt: 'p', chord: 'G', explain: 'e', alternative })).toEqual({ chroma: true });
    expect(trackerOptionsFor({ type: 'play-note', prompt: 'p', note: 'E2', octave: 'exact', explain: 'e', alternative })).toEqual({ chroma: false });
  });

  it('note arguments follow the exercise and the level', () => {
    const ex: PlayNoteExercise = { type: 'play-note', prompt: 'p', note: 'A2', octave: 'any', explain: 'e', alternative };
    expect(noteWaitArgs(ex)).toMatchObject({ midi: 45, options: { octaves: 'any', toleranceCents: PLAY_TOLERANCE_CENTS.beginner } });
    expect(noteWaitArgs(ex, { level: 'expert' }).options.toleranceCents).toBe(PLAY_TOLERANCE_CENTS.expert);
    expect(noteWaitArgs({ ...ex, toleranceCents: 20 }, { level: 'beginner' }).options.toleranceCents).toBe(20);
  });

  it('chord arguments name the chord and the look-alikes it must beat', () => {
    const args = chordWaitArgs({ type: 'play-chord', prompt: 'p', chord: 'G', explain: 'e', alternative });
    expect(args.chord).toEqual({ name: 'G', pcs: chordPcs('G'), bass: 7 });
    expect(args.options.rivals!.map((r) => r.name)).toEqual(['Gm', 'Em']);
    expect(args.options.threshold).toBe(0.6);
  });
});

describe('play-note', () => {
  const ex: PlayNoteExercise = { type: 'play-note', prompt: 'Play {n:E}.', note: 'E4', octave: 'exact', explain: 'e', alternative };

  it('the right note resolves as a correct answer', async () => {
    const { source, run } = replay(melody([64]));
    const listening = listenFor(source, ex);
    run();
    const answer = await listening;
    expect(answer).toMatchObject({ type: 'play-note', midi: 64 });
    expect(grade(ex, answer).correct).toBe(true);
  });

  it('wrong notes are reported, and the right one after them still counts', async () => {
    const heard: Array<[number, boolean]> = [];
    const { source, run } = replay(melody([62, 64]));
    const listening = listenFor(source, ex, { onNote: (midi, right) => heard.push([midi, right]) });
    run();
    const answer = await listening;
    expect(heard).toEqual([[62, false], [64, true]]);
    expect(grade(ex, answer).correct).toBe(true);
  });

  it('after the allowed tries the answer resolves as wrong, with the last note heard', async () => {
    const { source, run } = replay(melody([60, 62, 65]));
    const listening = listenFor(source, ex, { tries: 3 });
    run();
    const answer = await listening;
    expect(answer).toEqual({ type: 'play-note', midi: 65 });
    const result = grade(ex, answer);
    expect(result.correct).toBe(false);
    expect(result.feedback.detail).toMatchObject({ type: 'play-note', expected: 64, played: 65 });
  });

  it('an octave away is a near miss under the exact policy and right under any', async () => {
    const run1 = replay(melody([52]));
    const strict = listenFor(run1.source, ex, { tries: 1 });
    run1.run();
    expect(grade(ex, await strict)).toMatchObject({ correct: false, near: 'octave' });
    const loose: PlayNoteExercise = { ...ex, octave: 'any' };
    const run2 = replay(melody([52]));
    const any = listenFor(run2.source, loose);
    run2.run();
    expect(grade(loose, await any).correct).toBe(true);
  });

  it('silence times out as "nothing heard"; cancel and finish resolve at once', async () => {
    const { source, run } = replay(silence(1.5, SR));
    const listening = listenFor(source, ex, { timeoutMs: 800 });
    run();
    expect(await listening).toEqual({ type: 'play-note', midi: null });

    const cancelled = listenFor(new EventHub(), ex);
    cancelled.cancel();
    expect(await cancelled).toEqual({ type: 'play-note', midi: null });

    const controller = new AbortController();
    const aborted = listenFor(new EventHub(), ex, { signal: controller.signal });
    controller.abort();
    expect(await aborted).toEqual({ type: 'play-note', midi: null });

    const finished = listenFor(new EventHub(), ex);
    finished.finish();
    expect(grade(ex, await finished).correct).toBe(false);
  });
});

describe('play-chord', () => {
  const ex: PlayChordExercise = { type: 'play-chord', prompt: 'Strum {c:G}.', chord: 'G', explain: 'e', alternative };

  it('the chord, strummed in its library voicing, is accepted', async () => {
    const { source, run } = replay(strummed(chordVoicings('G')[0].midi), true);
    const listening = listenFor(source, ex);
    run();
    const answer = await listening;
    expect(answer).toMatchObject({ type: 'play-chord', matched: true });
    expect(grade(ex, answer).correct).toBe(true);
  });

  it('a different chord is rejected, with what was missing', async () => {
    const attempts: number[] = [];
    const { source, run } = replay(strummed(chordVoicings('Am')[0].midi), true);
    const listening = listenFor(source, ex, { tries: 1, onAttempt: (a) => attempts.push(a.missing.length) });
    run();
    const answer = await listening;
    expect(answer).toMatchObject({ type: 'play-chord', matched: false });
    expect(attempts).toHaveLength(1);
    const result = grade(ex, answer);
    expect(result.correct).toBe(false);
    if (result.feedback.detail.type !== 'play-chord') throw new Error('detail');
    expect(result.feedback.detail.missing.length + result.feedback.detail.extra.length).toBeGreaterThan(0);
  });

  it('cancel resolves as not matched', async () => {
    const listening = listenFor(new EventHub(), ex);
    listening.cancel();
    expect(await listening).toEqual({ type: 'play-chord', matched: false, score: 0, missing: [], extra: [] });
  });
});

describe('play-phrase', () => {
  const ex: PlayPhraseExercise = {
    type: 'play-phrase', prompt: 'Play {n:E} {n:F} {n:G}.', octave: 'exact', explain: 'e', alternative,
    notes: [{ string: 4, fret: 2, duration: 'q' }, { string: 4, fret: 3, duration: 'q' }, { string: 3, fret: 0, duration: 'q' }],
  };

  it('the phrase played right resolves as soon as its last note is in', async () => {
    const heard: boolean[] = [];
    const { source, run } = replay(melody([52, 53, 55]));
    const listening = listenFor(source, ex, { onNote: (_m, right) => heard.push(right) });
    run();
    const answer = await listening;
    expect(answer).toEqual({ type: 'play-phrase', played: [52, 53, 55] });
    expect(heard).toEqual([true, true, true]);
    expect(grade(ex, answer).correct).toBe(true);
  });

  it('a wrong phrase stops after a few notes too many and fails', async () => {
    const { source, run } = replay(melody([60, 62, 64, 65, 67, 69]));
    const listening = listenFor(source, ex, { tries: 2 });
    run();
    const answer = await listening;
    if (answer.type !== 'play-phrase') throw new Error('answer');
    expect(answer.played).toHaveLength(5);
    expect(grade(ex, answer).correct).toBe(false);
  });

  it('finish hands in what was played so far; cancel hands in nothing', async () => {
    const { source, run } = replay(melody([52, 53]));
    const listening = listenFor(source, ex);
    run();
    listening.finish();
    const answer = await listening;
    expect(answer).toEqual({ type: 'play-phrase', played: [52, 53] });
    expect(grade(ex, answer)).toMatchObject({ correct: false, near: 'incomplete' });

    const cancelled = listenFor(new EventHub(), ex);
    cancelled.cancel();
    expect(await cancelled).toEqual({ type: 'play-phrase', played: [] });
  });

  it('times out on the audio clock', async () => {
    const { source, run } = replay(melody([52]));
    const listening = listenFor(source, ex, { timeoutMs: 1200 });
    run();
    expect(await listening).toEqual({ type: 'play-phrase', played: [52] });
  });
});
