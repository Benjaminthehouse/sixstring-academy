/**
 * Expectation helpers for games and lessons: wait until the learner plays a given note or chord,
 * and record what was played. They depend only on {@link PitchSource}, so they run against the
 * live microphone and against replayed events in tests alike. Timeouts are measured on the
 * source's own clock (event timestamps), with a wall-clock safety net in case the source stalls.
 */
import { DEFAULT_A4, freqToMidi } from '@/core/math/pitch-math';
import { type ChordMatch, type ChordSpec, matchChord } from './chords';
import type { PitchSource } from './types';

/** A promise that can be abandoned: `cancel()` resolves it with `{ ok: false, reason: 'cancelled' }`. */
export interface Cancelable<T> extends Promise<T> {
  cancel(): void;
}

/** Options shared by the wait helpers. */
export interface WaitOptions {
  /** Give up after this long, in ms of audio time (default: wait for ever). */
  timeoutMs?: number;
  /** Abort signal: aborting cancels the wait. */
  signal?: AbortSignal;
}

/** Why a wait ended without success. */
export type WaitFailure = 'timeout' | 'cancelled';

/** Options for {@link waitForNote}. */
export interface WaitForNoteOptions extends WaitOptions {
  /** How far from the target pitch still counts, in cents (default 40). */
  toleranceCents?: number;
  /** 'exact' = that very note; 'any' = the same note name in any octave (default 'exact'). */
  octaves?: 'exact' | 'any';
  /** The pitch must be held this long, in ms (default 60). */
  minHoldMs?: number;
  /** Reference pitch in Hz (default 440). Use the same value as the tracker. */
  a4?: number;
  /** Called for every note that starts and is none of the targets (for "that was an F sharp" feedback). */
  onWrongNote?: (note: { midi: number; time: number }) => void;
}

/** Outcome of {@link waitForNote}. */
export type NoteWaitResult =
  | {
      ok: true;
      /** The target that was matched. */
      midi: number;
      /** The note actually played (differs from `midi` by octaves when octaves = 'any'). */
      playedMidi: number;
      /** Mean deviation from the target while it was held, in cents. */
      cents: number;
      /** When the matching note began (audio clock, seconds). */
      time: number;
      /** How long it had been held when the wait resolved, in ms. */
      heldMs: number;
      /** Notes played before the right one. */
      wrongNotes: number[];
    }
  | { ok: false; reason: WaitFailure; time: number; wrongNotes: number[] };

interface Settle<T> {
  promise: Cancelable<T>;
  finish: (value: T) => void;
  done: () => boolean;
  /** Feed the source clock; resolves with the timeout value when the time is up. */
  tick: (time: number) => void;
  cleanup: Array<() => void>;
}

/** Shared plumbing: one-shot resolution, cancellation, abort signal and both timeout clocks. */
function settleable<T>(opts: WaitOptions, onFail: (reason: WaitFailure, time: number) => T): Settle<T> {
  let resolve!: (value: T) => void;
  let finished = false;
  let startTime = Number.NaN;
  let lastTime = 0;
  const cleanup: Array<() => void> = [];
  const finish = (value: T): void => {
    if (finished) return;
    finished = true;
    for (const c of cleanup.splice(0)) c();
    resolve(value);
  };
  const promise = new Promise<T>((r) => {
    resolve = r;
  }) as Cancelable<T>;
  promise.cancel = () => finish(onFail('cancelled', lastTime));
  if (opts.signal) {
    const signal = opts.signal;
    if (signal.aborted) {
      // Resolve after the caller has had the chance to attach handlers.
      Promise.resolve().then(() => promise.cancel());
    } else {
      const onAbort = (): void => promise.cancel();
      signal.addEventListener('abort', onAbort, { once: true });
      cleanup.push(() => signal.removeEventListener('abort', onAbort));
    }
  }
  const timeout = opts.timeoutMs;
  if (timeout !== undefined && typeof setTimeout === 'function') {
    // Safety net only: normally the audio clock below gets there first.
    const id = setTimeout(() => finish(onFail('timeout', lastTime)), timeout + 2000);
    cleanup.push(() => clearTimeout(id));
  }
  const tick = (time: number): void => {
    lastTime = time;
    if (Number.isNaN(startTime)) startTime = time;
    if (timeout !== undefined && (time - startTime) * 1000 >= timeout) finish(onFail('timeout', time));
  };
  return { promise, finish, done: () => finished, tick, cleanup };
}

function foldOctaves(semitones: number): number {
  return semitones - 12 * Math.round(semitones / 12);
}

/**
 * Wait until one of the target notes is played and held.
 * @param midi one MIDI note or several (any of them satisfies the wait)
 */
export function waitForNote(
  source: PitchSource,
  midi: number | readonly number[],
  opts: WaitForNoteOptions = {},
): Cancelable<NoteWaitResult> {
  const targets = typeof midi === 'number' ? [midi] : [...midi];
  const tolerance = (opts.toleranceCents ?? 40) / 100;
  const anyOctave = opts.octaves === 'any';
  const minHold = (opts.minHoldMs ?? 60) / 1000;
  const a4 = opts.a4 ?? DEFAULT_A4;
  const wrongNotes: number[] = [];
  const s = settleable<NoteWaitResult>(opts, (reason, time) => ({ ok: false, reason, time, wrongNotes }));

  const offsetTo = (pitch: number, target: number): number => (anyOctave ? foldOctaves(pitch - target) : pitch - target);
  let matchTarget = -1;
  let matchStart = Number.NaN;
  let noteStart = Number.NaN;
  let centsSum = 0;
  let centsCount = 0;
  let misses = 0;

  s.cleanup.push(
    source.on('pitch', (r) => {
      if (s.done()) return;
      const pitch = freqToMidi(r.freq, a4);
      let hit = -1;
      let hitOffset = 0;
      for (const t of targets) {
        const d = offsetTo(pitch, t);
        if (Math.abs(d) <= tolerance && (hit < 0 || Math.abs(d) < Math.abs(hitOffset))) {
          hit = t;
          hitOffset = d;
        }
      }
      if (hit >= 0) {
        if (hit !== matchTarget) {
          matchTarget = hit;
          matchStart = r.time;
          noteStart = r.time - r.noteAge;
          centsSum = 0;
          centsCount = 0;
        }
        misses = 0;
        centsSum += hitOffset * 100;
        centsCount++;
      } else if (matchTarget >= 0 && ++misses >= 2) {
        // One stray frame does not break a hold; two do.
        matchTarget = -1;
      }
      if (matchTarget >= 0 && r.time - matchStart >= minHold) {
        s.finish({
          ok: true,
          midi: matchTarget,
          playedMidi: r.midi,
          cents: centsSum / Math.max(1, centsCount),
          time: noteStart,
          heldMs: (r.time - noteStart) * 1000,
          wrongNotes,
        });
        return;
      }
      s.tick(r.time);
    }),
    source.on('noteon', (e) => {
      if (s.done()) return;
      const wrong = targets.every((t) => Math.abs(offsetTo(e.midi, t)) > 0.5);
      if (wrong) {
        wrongNotes.push(e.midi);
        opts.onWrongNote?.({ midi: e.midi, time: e.time });
      }
    }),
    source.on('noteoff', () => {
      matchTarget = -1;
      matchStart = Number.NaN;
    }),
    source.on('level', (e) => s.tick(e.time)),
  );
  return s.promise;
}

/** Options for {@link waitForChord}. */
export interface WaitForChordOptions extends WaitOptions {
  /** Score from {@link matchChord} that counts as "yes, that chord" (default 0.6). */
  threshold?: number;
  /** Only judge after a strum is heard (default true). With false every chroma frame is judged. */
  requireOnset?: boolean;
  /** Skip this long after the strum so the pick noise and the previous chord are out of the window, in ms (default 110). */
  settleMs?: number;
  /** Keep listening this long after a strum before calling the attempt failed, in ms (default 700). */
  windowMs?: number;
  /** Other chords it must beat (e.g. Am when asking for C). Optional. */
  rivals?: readonly ChordSpec[];
  /** Called once per strum that did not match, with the best analysis of it (what was missing / extra). */
  onAttempt?: (best: ChordMatch) => void;
}

/** Outcome of {@link waitForChord}. */
export type ChordWaitResult =
  | {
      ok: true;
      /** Analysis of the frame that matched. */
      match: ChordMatch;
      /** When the strum began (or the time of the matching frame without `requireOnset`). */
      time: number;
      /** Strums that failed before this one. */
      failedAttempts: number;
    }
  | {
      ok: false;
      reason: WaitFailure;
      time: number;
      /** Best analysis of the most recent strum, if there was one. */
      lastAttempt: ChordMatch | null;
      failedAttempts: number;
    };

/**
 * Wait until the given chord is strummed. The source must be producing `chroma` events
 * (start the tracker with `chroma: true`).
 */
export function waitForChord(
  source: PitchSource,
  chord: ChordSpec,
  opts: WaitForChordOptions = {},
): Cancelable<ChordWaitResult> {
  const threshold = opts.threshold ?? 0.6;
  const requireOnset = opts.requireOnset ?? true;
  const settle = (opts.settleMs ?? 110) / 1000;
  const window = (opts.windowMs ?? 700) / 1000;
  let failedAttempts = 0;
  let lastAttempt: ChordMatch | null = null;
  const s = settleable<ChordWaitResult>(opts, (reason, time) => ({ ok: false, reason, time, lastAttempt, failedAttempts }));

  let strumAt = Number.NaN;
  let best: ChordMatch | null = null;
  const closeAttempt = (): void => {
    if (best) {
      failedAttempts++;
      lastAttempt = best;
      opts.onAttempt?.(best);
    }
    strumAt = Number.NaN;
    best = null;
  };

  s.cleanup.push(
    source.on('onset', (e) => {
      if (s.done()) return;
      // A second onset within the settle time is the same strum still crossing the strings.
      if (!Number.isNaN(strumAt) && e.time - strumAt < settle) return;
      if (!Number.isNaN(strumAt)) closeAttempt();
      strumAt = e.time;
    }),
    source.on('chroma', (e) => {
      if (s.done()) return;
      if (requireOnset) {
        if (Number.isNaN(strumAt)) {
          s.tick(e.time);
          return;
        }
        if (e.time - strumAt > window) {
          closeAttempt();
          s.tick(e.time);
          return;
        }
        if (e.time - strumAt < settle) return;
      }
      const frame = { chroma: e.chroma, notes: [], minMidi: 0, bass: e.bass, bassMidi: -1, levelDb: e.levelDb };
      const m = matchChord(frame, chord);
      if (!best || m.score > best.score) best = m;
      let wins = m.score >= threshold;
      if (wins && opts.rivals) {
        for (const rival of opts.rivals) {
          if (matchChord(frame, rival).score > m.score) {
            wins = false;
            break;
          }
        }
      }
      if (wins) {
        s.finish({ ok: true, match: m, time: requireOnset ? strumAt : e.time, failedAttempts });
        return;
      }
      s.tick(e.time);
    }),
    source.on('level', (e) => s.tick(e.time)),
  );
  return s.promise;
}

/** One note captured by {@link NoteRecorder}. */
export interface RecordedNote {
  midi: number;
  /** When the note began, seconds on the audio clock. */
  start: number;
  /** When it ended. */
  end: number;
  /** Seconds it lasted. */
  duration: number;
  /** Median deviation from the note in cents while it sounded. */
  cents: number;
  /** Level at the start in dBFS. */
  levelDb: number;
}

/** Options for {@link NoteRecorder}. */
export interface NoteRecorderOptions {
  /** Notes shorter than this are dropped as blips, in ms (default 50). */
  minDurationMs?: number;
  /** Called as each note completes. */
  onNote?: (note: RecordedNote, all: readonly RecordedNote[]) => void;
}

/** Records the sequence of notes played, for melodic dictation and scale-run checking. */
export class NoteRecorder {
  private readonly source: PitchSource;
  private readonly minDuration: number;
  private readonly onNote?: (note: RecordedNote, all: readonly RecordedNote[]) => void;
  private offs: Array<() => void> = [];
  private list: RecordedNote[] = [];
  private open: { midi: number; start: number; levelDb: number; cents: number[] } | null = null;
  private lastTime = 0;

  constructor(source: PitchSource, opts: NoteRecorderOptions = {}) {
    this.source = source;
    this.minDuration = (opts.minDurationMs ?? 50) / 1000;
    this.onNote = opts.onNote;
  }

  /** True between `start()` and `stop()`. */
  get recording(): boolean {
    return this.offs.length > 0;
  }

  /** The notes completed so far (the one still sounding is added when it ends or on `stop`). */
  get notes(): readonly RecordedNote[] {
    return this.list;
  }

  /** Begin recording (clears any previous take). */
  start(): void {
    this.stopListening();
    this.list = [];
    this.open = null;
    this.offs = [
      this.source.on('noteon', (e) => {
        this.close(e.time);
        this.open = { midi: e.midi, start: e.time, levelDb: e.levelDb, cents: [] };
        this.lastTime = e.detectedAt;
      }),
      this.source.on('pitch', (r) => {
        this.lastTime = r.time;
        if (this.open && r.midi === this.open.midi) this.open.cents.push(r.cents);
      }),
      this.source.on('noteoff', (e) => {
        this.lastTime = Math.max(this.lastTime, e.time);
        this.close(e.time);
      }),
    ];
  }

  /** Stop and return the take. A note still sounding is closed at the last time heard. */
  stop(): RecordedNote[] {
    this.close(this.lastTime);
    this.stopListening();
    return this.list;
  }

  private stopListening(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }

  private close(time: number): void {
    const o = this.open;
    if (!o) return;
    this.open = null;
    const duration = Math.max(0, time - o.start);
    if (duration < this.minDuration) return;
    const sorted = [...o.cents].sort((a, b) => a - b);
    const note: RecordedNote = {
      midi: o.midi,
      start: o.start,
      end: time,
      duration,
      cents: sorted.length ? sorted[sorted.length >> 1] : 0,
      levelDb: o.levelDb,
    };
    this.list.push(note);
    this.onNote?.(note, this.list);
  }
}

/** One row of the alignment produced by {@link compareNotes}. */
export interface NoteAlignment {
  /** Index into the expected sequence, or -1 for an extra played note. */
  expected: number;
  /** Index into the played sequence, or -1 for a note that was not played. */
  played: number;
  /** 'match' = right note, 'wrong' = a different note was played in its place. */
  kind: 'match' | 'wrong' | 'missed' | 'extra';
}

/** Result of comparing a played sequence with the expected one. */
export interface NoteComparison {
  /** Expected notes that were played, in order. */
  correct: number;
  /** Indexes of expected notes that were skipped or replaced by a wrong note. */
  missed: number[];
  /** Indexes of played notes that are not part of the expected sequence. */
  extra: number[];
  /** correct / expected.length (1 for two empty sequences). */
  accuracy: number;
  /** True when every expected note was played and nothing else. */
  perfect: boolean;
  /** Step-by-step alignment, in order. */
  alignment: NoteAlignment[];
}

/**
 * Compare what was played with what was asked for (a scale run, a dictated melody). Uses the
 * cheapest edit script, so one slipped or added note does not make everything after it "wrong".
 * @param octaves 'any' ignores the octave (default 'exact')
 */
export function compareNotes(
  played: readonly (number | RecordedNote)[],
  expected: readonly number[],
  opts: { octaves?: 'exact' | 'any' } = {},
): NoteComparison {
  const p = played.map((x) => (typeof x === 'number' ? x : x.midi));
  const any = opts.octaves === 'any';
  const same = (a: number, b: number): boolean => (any ? (((a - b) % 12) + 12) % 12 === 0 : a === b);
  const n = expected.length;
  const m = p.length;
  // cost[i][j]: cheapest way to align the first i expected notes with the first j played notes.
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) cost[i][0] = i;
  for (let j = 0; j <= m; j++) cost[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = cost[i - 1][j - 1] + (same(expected[i - 1], p[j - 1]) ? 0 : 1);
      cost[i][j] = Math.min(sub, cost[i - 1][j] + 1, cost[i][j - 1] + 1);
    }
  }
  const alignment: NoteAlignment[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && same(expected[i - 1], p[j - 1]) && cost[i][j] === cost[i - 1][j - 1]) {
      alignment.push({ expected: i - 1, played: j - 1, kind: 'match' });
      i--;
      j--;
    } else if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + 1) {
      alignment.push({ expected: i - 1, played: j - 1, kind: 'wrong' });
      i--;
      j--;
    } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
      alignment.push({ expected: i - 1, played: -1, kind: 'missed' });
      i--;
    } else {
      alignment.push({ expected: -1, played: j - 1, kind: 'extra' });
      j--;
    }
  }
  alignment.reverse();
  const missed: number[] = [];
  const extra: number[] = [];
  let correct = 0;
  for (const a of alignment) {
    if (a.kind === 'match') correct++;
    else if (a.kind === 'missed') missed.push(a.expected);
    else if (a.kind === 'extra') extra.push(a.played);
    else {
      missed.push(a.expected);
      extra.push(a.played);
    }
  }
  return {
    correct,
    missed,
    extra,
    accuracy: n === 0 ? (m === 0 ? 1 : 0) : correct / n,
    perfect: correct === n && extra.length === 0,
    alignment,
  };
}
