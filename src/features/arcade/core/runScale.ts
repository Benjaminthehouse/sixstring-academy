/**
 * Run the Scale: play the shape up (and down) in time with a click or a drum groove. Each note is
 * judged early, on time or late against its beat; a clean run raises the tempo for the next one
 * (a speed ladder). The judge here is pure and takes notes from either input: taps on the screen,
 * or the microphone through `waitForNote` (which says which expected note was heard and when).
 */
import { practiceSequence, type PatternNote, type ScalePattern, type SequenceKind } from '@/core/guitar';
import { judgeTiming, onTimeWindow, timingCredit, timingPoints, type Timing } from './scoring';
import { regionOf } from './focus';

/** One level of Run the Scale. */
export interface RunLevel {
  n: number;
  title: string;
  goal: string;
  sequence: Extract<SequenceKind, 'ascending' | 'up-down' | 'thirds'>;
  /** Notes per beat: 1 = quarter notes, 2 = eighths. */
  perBeat: 1 | 2;
  startBpm: number;
  /** Tempo added after a clean run. */
  stepBpm: number;
  /** Runs in a round (the rungs of the ladder). */
  runs: number;
  /** A click, or a drum groove under the run. */
  backing: 'click' | 'groove';
}

/** The levels, easiest first. */
export const RUN_LEVELS: readonly RunLevel[] = [
  { n: 1, title: 'Up the shape', goal: 'Low to high, one note a beat.', sequence: 'ascending', perBeat: 1, startBpm: 60, stepBpm: 6, runs: 3, backing: 'click' },
  { n: 2, title: 'Up and back', goal: 'Up to the top and back down, one note a beat.', sequence: 'up-down', perBeat: 1, startBpm: 66, stepBpm: 6, runs: 3, backing: 'click' },
  { n: 3, title: 'With the drums', goal: 'Up and back over a drum groove.', sequence: 'up-down', perBeat: 1, startBpm: 76, stepBpm: 8, runs: 3, backing: 'groove' },
  { n: 4, title: 'Eighth notes', goal: 'Two notes a beat, up and back.', sequence: 'up-down', perBeat: 2, startBpm: 60, stepBpm: 6, runs: 3, backing: 'click' },
  { n: 5, title: 'In thirds', goal: 'Skip a note, step back: 1 3 2 4 3 5 …', sequence: 'thirds', perBeat: 2, startBpm: 56, stepBpm: 6, runs: 3, backing: 'groove' },
  { n: 6, title: 'Speed ladder', goal: 'Eighths, up and back, climbing 8 BPM a clean run.', sequence: 'up-down', perBeat: 2, startBpm: 72, stepBpm: 8, runs: 4, backing: 'groove' },
];

/** Beats of count-in before the first note. */
export const COUNT_IN_BEATS = 4;

/** The notes of a run, in order. */
export function runNotes(pattern: ScalePattern, level: Pick<RunLevel, 'sequence'>): PatternNote[] {
  return practiceSequence(pattern, level.sequence);
}

/** The frets to draw. */
export function runFrets(pattern: ScalePattern): [number, number] {
  return regionOf(pattern);
}

/** Seconds between notes at a tempo. */
export function noteSeconds(bpm: number, perBeat: number): number {
  return 60 / bpm / perBeat;
}

/** Where every click and note of a run falls, from the first count-in click at `start` (seconds). */
export interface RunTimeline {
  /** Click times with their level (the first of each bar is the accent). */
  clicks: Array<{ time: number; accent: boolean; countIn: boolean }>;
  /** When each note is due. */
  noteTimes: number[];
  /** When the run is over (one beat after the last note). */
  end: number;
  beat: number;
  noteSec: number;
}

/** Lay a run out in time. */
export function runTimeline(noteCount: number, bpm: number, perBeat: 1 | 2, start: number, countIn = COUNT_IN_BEATS): RunTimeline {
  const beat = 60 / bpm;
  const noteSec = beat / perBeat;
  const first = start + countIn * beat;
  const noteTimes = Array.from({ length: noteCount }, (_, i) => first + i * noteSec);
  const runBeats = Math.ceil(noteCount / perBeat);
  const clicks = Array.from({ length: countIn + runBeats }, (_, i) => ({ time: start + i * beat, accent: i % 4 === 0, countIn: i < countIn }));
  return { clicks, noteTimes, end: first + runBeats * beat, beat, noteSec };
}

/** How long after its beat a note may still arrive before it counts as missed. */
export function lateLimit(noteSec: number): number {
  return Math.max(0.6, noteSec * 1.5);
}

/** The verdict on one note of a run. */
export interface NoteJudgement {
  index: number;
  kind: Timing | 'missed';
  /** Seconds from the beat (negative = early); null when missed. */
  deviation: number | null;
  /** Wrong notes played while this one was due. */
  wrong: number;
  points: number;
}

/** What one input did, for feedback on screen. */
export type RunEvent =
  | { kind: 'judged'; judgement: NoteJudgement; skipped: NoteJudgement[] }
  | { kind: 'wrong'; index: number; midi: number }
  | { kind: 'ignored' };

/**
 * Judges a run as notes come in. `play(midi, time)` with the pitch heard (or tapped) and its
 * pluck time on the same clock as `noteTimes`; `tick(time)` as time passes, so silent notes become
 * misses. A note that matches the one after the expected note means the expected one was skipped.
 */
export class RunJudge {
  readonly midis: readonly number[];
  readonly times: readonly number[];
  readonly window: number;
  readonly late: number;
  private readonly anyOctave: boolean;
  private next = 0;
  private wrongHere = 0;
  private combo = 0;
  readonly results: NoteJudgement[] = [];
  bestCombo = 0;
  score = 0;

  constructor(midis: readonly number[], times: readonly number[], noteSec: number, opts: { octaves?: 'exact' | 'any' } = {}) {
    this.midis = midis;
    this.times = times;
    this.window = onTimeWindow(noteSec);
    this.late = lateLimit(noteSec);
    this.anyOctave = opts.octaves === 'any';
  }

  /** Index of the note due now (equal to the length when the run is over). */
  get current(): number {
    return this.next;
  }

  /** True once every note is judged. */
  get done(): boolean {
    return this.next >= this.midis.length;
  }

  /** The combo running now. */
  get comboNow(): number {
    return this.combo;
  }

  /** The earliest pluck time that can still count for the note due now (anything before is left over). */
  earliest(): number {
    return this.done ? Infinity : this.times[this.next] - Math.max(0.5, this.late);
  }

  /** The notes that would be accepted now: the one due and the one after it. */
  accepting(): number[] {
    const out: number[] = [];
    if (this.next < this.midis.length) out.push(this.midis[this.next]);
    if (this.next + 1 < this.midis.length && !this.same(this.midis[this.next + 1], this.midis[this.next])) out.push(this.midis[this.next + 1]);
    return out;
  }

  private same(a: number, b: number): boolean {
    return this.anyOctave ? (((a - b) % 12) + 12) % 12 === 0 : a === b;
  }

  private judge(index: number, time: number): NoteJudgement {
    const deviation = time - this.times[index];
    const kind = judgeTiming(deviation, this.window);
    const points = timingPoints(kind, this.combo);
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.score += points;
    const j: NoteJudgement = { index, kind, deviation, wrong: this.wrongHere, points };
    this.results.push(j);
    this.wrongHere = 0;
    this.next = index + 1;
    return j;
  }

  private miss(index: number): NoteJudgement {
    const j: NoteJudgement = { index, kind: 'missed', deviation: null, wrong: this.wrongHere, points: 0 };
    this.results.push(j);
    this.combo = 0;
    this.wrongHere = 0;
    this.next = index + 1;
    return j;
  }

  /** A note was played (or tapped) at `time`. */
  play(midi: number, time: number): RunEvent {
    if (this.done) return { kind: 'ignored' };
    // Too early to be meant for this note (still ringing from before the run, a stray pluck).
    if (time < this.earliest()) return { kind: 'ignored' };
    if (this.same(midi, this.midis[this.next])) return { kind: 'judged', judgement: this.judge(this.next, time), skipped: [] };
    const after = this.next + 1;
    if (after < this.midis.length && this.same(midi, this.midis[after]) && time >= this.times[after] - this.late) {
      const skipped = [this.miss(this.next)];
      return { kind: 'judged', judgement: this.judge(after, time), skipped };
    }
    this.wrongHere++;
    this.combo = 0;
    return { kind: 'wrong', index: this.next, midi };
  }

  /** A wrong note heard by the microphone helper (it never names the wrong note as a target). */
  wrongNote(midi: number): RunEvent {
    if (this.done) return { kind: 'ignored' };
    this.wrongHere++;
    this.combo = 0;
    return { kind: 'wrong', index: this.next, midi };
  }

  /** Time has reached `time`: notes whose last chance has passed become misses. */
  tick(time: number): NoteJudgement[] {
    const out: NoteJudgement[] = [];
    while (!this.done && time > this.times[this.next] + this.late) out.push(this.miss(this.next));
    return out;
  }
}

/** Summary of a judged run. */
export interface RunOutcome {
  notes: number;
  onTime: number;
  early: number;
  late: number;
  missed: number;
  wrong: number;
  /** Credit / notes: 1 on time, 0.5 early or late. */
  accuracy: number;
  /** Every note played and at least three quarters of them on time: the tempo goes up. */
  clean: boolean;
  /** Mean deviation of the notes played, in seconds (positive = behind the beat). */
  meanDeviation: number | null;
}

/** Add up a run. */
export function runOutcome(results: readonly NoteJudgement[]): RunOutcome {
  const count = (k: NoteJudgement['kind']) => results.filter((r) => r.kind === k).length;
  const played = results.filter((r) => r.deviation !== null);
  const credit = played.reduce((s, r) => s + timingCredit(r.kind as Timing), 0);
  const onTime = count('on-time');
  const missed = count('missed');
  const wrong = results.reduce((s, r) => s + r.wrong, 0);
  return {
    notes: results.length,
    onTime,
    early: count('early'),
    late: count('late'),
    missed,
    wrong,
    accuracy: results.length ? credit / results.length : 0,
    clean: results.length > 0 && missed === 0 && wrong === 0 && onTime >= 0.75 * results.length,
    meanDeviation: played.length ? played.reduce((s, r) => s + (r.deviation as number), 0) / played.length : null,
  };
}

/** The tempo of the next run: up a step after a clean run, otherwise the same. */
export function nextTempo(level: Pick<RunLevel, 'stepBpm'>, bpm: number, clean: boolean): number {
  return Math.min(240, clean ? bpm + level.stepBpm : bpm);
}

/** A tip for the learner after a run, from where the notes landed. */
export function runTip(o: RunOutcome): string {
  if (o.notes === 0) return 'Start on the count of one, after the four clicks.';
  if (o.missed > o.notes / 3) return 'Lots of notes went by. Try it slower, or tap Start and play along with the light.';
  if (o.clean) return 'Clean run. The tempo goes up.';
  if (o.wrong > 0 && o.wrong >= o.late + o.early) return 'A few wrong notes: keep one finger per fret and look one note ahead.';
  if (o.meanDeviation !== null && o.meanDeviation > 0.04) return 'You are behind the click. Feel the click land on your note, not after it.';
  if (o.meanDeviation !== null && o.meanDeviation < -0.04) return 'You are rushing. Let the click lead; land on it.';
  return 'Nearly there. Same tempo once more.';
}
