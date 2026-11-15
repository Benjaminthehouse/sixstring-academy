/**
 * Play exercises and the microphone. `listenFor(source, exercise)` wires a play-note, play-chord
 * or play-phrase exercise to the pitch helpers (`waitForNote`, `waitForChord`, `NoteRecorder`) and
 * resolves with an `Answer` ready for the session reducer.
 *
 * It depends only on a `PitchSource`, so it runs on the live `PitchTracker` and on replayed events
 * in tests alike. It never rejects and never dead-ends: a learner gets a few tries, then the
 * answer resolves as wrong with what was heard, so the feedback can say "that was an F".
 */
import {
  NoteRecorder, compareNotes, waitForChord, waitForNote, type ChordSpec, type PitchSource, type WaitForChordOptions, type WaitForNoteOptions,
} from '@/core/pitch';
import { chordPcs, parallelChord, parseChord, parseNote, relativeChord } from '@/core/theory';
import { PLAY_CHORD_THRESHOLD, phraseMidi, playNoteTarget } from './grade';
import type { Answer, CourseLevel, PlayChordExercise, PlayExercise, PlayNoteExercise } from './types';

/** Cents either side that still count as the note, per level (an exercise may set its own). */
export const PLAY_TOLERANCE_CENTS: Readonly<Record<CourseLevel, number>> = { beginner: 45, intermediate: 35, expert: 25 };

/** Wrong notes or failed strums allowed before the answer resolves as wrong. */
export const PLAY_TRIES = 3;

/** Options for listening. */
export interface ListenOptions {
  /** Give up after this long, in ms of audio time. Default 20 000 (30 000 for a phrase). */
  timeoutMs?: number;
  /** Aborting resolves with "nothing heard". */
  signal?: AbortSignal;
  /** Reference pitch in Hz; use the tracker's. Default 440. */
  a4?: number;
  /** Course level, for the tolerance. Default `beginner`. */
  level?: CourseLevel;
  /** Wrong notes or failed strums allowed. Default `PLAY_TRIES`. */
  tries?: number;
  /** Called for every wrong note (play-note) or note heard (play-phrase), with its MIDI number. */
  onNote?: (midi: number, right: boolean) => void;
  /** Called after a strum that was not the chord: pitch classes missing and extra. */
  onAttempt?: (attempt: { missing: number[]; extra: number[]; score: number }) => void;
}

/** A listening in progress. Resolves, never rejects. */
export interface Listening extends Promise<Answer> {
  /** Stop and resolve with "nothing heard" (the learner left, or tapped "I can't play right now"). */
  cancel(): void;
  /** Stop and resolve with what has been heard so far (the learner tapped "Done"). */
  finish(): void;
}

/** What the tracker must be started with for an exercise: chords need chroma frames. */
export function trackerOptionsFor(exercise: PlayExercise): { chroma: boolean } {
  return { chroma: exercise.type === 'play-chord' };
}

/** `waitForNote` arguments for a play-note exercise. */
export function noteWaitArgs(exercise: PlayNoteExercise, opts: ListenOptions = {}): { midi: number; options: WaitForNoteOptions } {
  return {
    midi: playNoteTarget(exercise) ?? 0,
    options: {
      toleranceCents: exercise.toleranceCents ?? PLAY_TOLERANCE_CENTS[opts.level ?? 'beginner'],
      octaves: exercise.octave,
      minHoldMs: 80,
      timeoutMs: opts.timeoutMs ?? 20_000,
      a4: opts.a4,
    },
  };
}

/** `waitForChord` arguments for a play-chord exercise: the chord and the look-alikes it must beat. */
export function chordWaitArgs(exercise: PlayChordExercise, opts: ListenOptions = {}): { chord: ChordSpec; options: WaitForChordOptions } {
  const chord = parseChord(exercise.chord);
  const spec = (symbol: string): ChordSpec | null => {
    const c = parseChord(symbol);
    return c ? { name: c.symbol, pcs: chordPcs(c), bass: parseNote(c.bass ?? c.root)?.chroma } : null;
  };
  const target: ChordSpec = spec(exercise.chord) ?? { pcs: [] };
  const rivals: ChordSpec[] = [];
  if (chord) {
    for (const symbol of [parallelChord(chord), relativeChord(chord)]) {
      const rival = symbol ? spec(symbol) : null;
      if (rival) rivals.push(rival);
    }
  }
  return { chord: target, options: { threshold: PLAY_CHORD_THRESHOLD, timeoutMs: opts.timeoutMs ?? 20_000, rivals } };
}

function listening(run: (resolve: (answer: Answer) => void) => { cancel: () => void; finish: () => void }): Listening {
  let settle!: (answer: Answer) => void;
  let done = false;
  const promise = new Promise<Answer>((resolve) => {
    settle = (answer) => {
      if (done) return;
      done = true;
      resolve(answer);
    };
  }) as Listening;
  const controls = run(settle);
  promise.cancel = controls.cancel;
  promise.finish = controls.finish;
  return promise;
}

/**
 * Listen for a play exercise and resolve with its answer:
 *
 *   play-note    the right note -> right; `tries` other notes -> wrong, with the last note heard
 *   play-chord   a strum that matches -> right; `tries` strums that do not -> wrong, with what was missing
 *   play-phrase  resolves when every note has been played, when clearly too many were, or on `finish()`
 *
 * The source must be running (and, for chords, started with `chroma: true`).
 */
export function listenFor(source: PitchSource, exercise: PlayExercise, opts: ListenOptions = {}): Listening {
  const tries = Math.max(1, opts.tries ?? PLAY_TRIES);
  const abort = (cancel: () => void): void => {
    if (!opts.signal) return;
    if (opts.signal.aborted) cancel();
    else opts.signal.addEventListener('abort', cancel, { once: true });
  };

  if (exercise.type === 'play-note') {
    return listening((resolve) => {
      const { midi, options } = noteWaitArgs(exercise, opts);
      let lastWrong: number | null = null;
      let wrongCount = 0;
      const nothing = (): void => resolve({ type: 'play-note', midi: null });
      const wait = waitForNote(source, midi, {
        ...options,
        onWrongNote: (n) => {
          lastWrong = n.midi;
          wrongCount++;
          opts.onNote?.(n.midi, false);
          if (wrongCount >= tries) {
            resolve({ type: 'play-note', midi: n.midi });
            wait.cancel();
          }
        },
      });
      void wait.then((r) => {
        if (r.ok) {
          opts.onNote?.(r.playedMidi, true);
          resolve({ type: 'play-note', midi: r.playedMidi, cents: r.cents });
        } else {
          resolve({ type: 'play-note', midi: r.reason === 'timeout' ? lastWrong : null });
        }
      });
      const cancel = (): void => {
        nothing();
        wait.cancel();
      };
      abort(cancel);
      return { cancel, finish: () => { resolve({ type: 'play-note', midi: lastWrong }); wait.cancel(); } };
    });
  }

  if (exercise.type === 'play-chord') {
    return listening((resolve) => {
      const { chord, options } = chordWaitArgs(exercise, opts);
      let last: { missing: number[]; extra: number[]; score: number } | null = null;
      let failed = 0;
      const wrong = (): Answer => ({ type: 'play-chord', matched: false, score: last?.score ?? 0, missing: last?.missing ?? [], extra: last?.extra ?? [] });
      const wait = waitForChord(source, chord, {
        ...options,
        onAttempt: (m) => {
          last = { missing: [...m.missing], extra: [...m.extra], score: m.score };
          failed++;
          opts.onAttempt?.(last);
          if (failed >= tries) {
            resolve(wrong());
            wait.cancel();
          }
        },
      });
      void wait.then((r) => {
        if (r.ok) resolve({ type: 'play-chord', matched: true, score: r.match.score, missing: [...r.match.missing], extra: [...r.match.extra] });
        else {
          if (r.lastAttempt && !last) last = { missing: [...r.lastAttempt.missing], extra: [...r.lastAttempt.extra], score: r.lastAttempt.score };
          resolve(wrong());
        }
      });
      const cancel = (): void => {
        resolve({ type: 'play-chord', matched: false, score: 0, missing: [], extra: [] });
        wait.cancel();
      };
      abort(cancel);
      return { cancel, finish: () => { resolve(wrong()); wait.cancel(); } };
    });
  }

  return listening((resolve) => {
    const expected = phraseMidi(exercise);
    const timeoutMs = opts.timeoutMs ?? 30_000;
    let startTime = Number.NaN;
    const offs: Array<() => void> = [];
    const played = (): number[] => recorder.notes.map((n) => n.midi);
    const stop = (answer: Answer): void => {
      for (const off of offs.splice(0)) off();
      if (recorder.recording) recorder.stop();
      resolve(answer);
    };
    const recorder = new NoteRecorder(source, {
      minDurationMs: 60,
      onNote: (note, all) => {
        const midis = all.map((n) => n.midi);
        const comparison = compareNotes(midis, expected, { octaves: exercise.octave });
        // The row of the note just played (rows after it are the notes still to come).
        const row = comparison.alignment.find((r) => r.played === midis.length - 1);
        opts.onNote?.(note.midi, row?.kind === 'match');
        // Done when every note was found, or when the take is clearly longer than the phrase.
        if (comparison.correct === expected.length || midis.length >= expected.length + tries) stop({ type: 'play-phrase', played: midis });
      },
    });
    recorder.start();
    const tick = (time: number): void => {
      if (Number.isNaN(startTime)) startTime = time;
      if ((time - startTime) * 1000 >= timeoutMs) stop({ type: 'play-phrase', played: played() });
    };
    offs.push(source.on('level', (e) => tick(e.time)), source.on('pitch', (e) => tick(e.time)));
    const finish = (): void => {
      // Stopping the recorder closes the note that is still sounding, so it is counted.
      const take = recorder.recording ? recorder.stop().map((n) => n.midi) : played();
      stop({ type: 'play-phrase', played: take });
    };
    const cancel = (): void => stop({ type: 'play-phrase', played: [] });
    abort(cancel);
    return { cancel, finish };
  });
}
