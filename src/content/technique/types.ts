/**
 * The shape of a technique exercise. The plan (`src/content/plan/repertoire.json`, list
 * "technique") says what each exercise is; this module writes it out as playable material
 * (SixTab), learner-facing copy, the tempo ladder, health warnings and how the microphone can
 * check it. `technique.test.ts` keeps the two in step.
 */

/** Which hand the exercise trains most (the plan's `hand`). */
export type Hand = 'fretting' | 'picking' | 'both';

/** The skill an exercise belongs to; the screen groups by it. */
export type SkillGroup =
  | 'health'
  | 'setup'
  | 'shapes'
  | 'alternate-picking'
  | 'sweep'
  | 'strumming'
  | 'muting'
  | 'fingerstyle'
  | 'tone'
  | 'independence'
  | 'legato'
  | 'bends'
  | 'vibrato'
  | 'shifts'
  | 'chords'
  | 'time';

/**
 * How the screen runs it:
 * - `ladder`: tab, play it, a tempo ladder with the click, an optional microphone take.
 * - `changes`: one-minute chord changes, counted by the learner, best count per pair.
 * - `routine`: a timed sequence of short steps (warm-up, cool-down).
 * - `guide`: a checklist with a short playing check (posture, playing without pain).
 */
export type ExerciseMode = 'ladder' | 'changes' | 'routine' | 'guide';

/**
 * Which beats the metronome sounds while the exercise runs (the count-in always clicks every beat):
 * every quarter (`beats`), only beats 2 and 4 (`backbeat`), only the "and" of each beat (`offbeat`),
 * or every `unit` with an accent at the start of each group (odd meters: 3+2, 2+2+3).
 */
export type ClickPattern = 'beats' | 'backbeat' | 'offbeat' | { unit: 'quarter' | 'eighth'; groups: number[] };

/** The tempo ladder in quarter-note beats per minute: start, add `step` per clean pass, stop at `goal`. */
export interface TempoLadder {
  start: number;
  step: number;
  goal: number;
}

/**
 * What the microphone can check in one take.
 * - `notes`: the notes of the part, in order, and the evenness of their timing.
 * - `onsets`: only the timing of every pluck or strum (chords, ringing arpeggios, strums).
 * - `bend`: a bend from `string`/`fret` up `semitones`, held: the held pitch against the target.
 * - `prebend`: a pre-bent note released: it must start on the bent pitch and end on the fret's own.
 * - `vibrato`: a held note with vibrato: speed against the beat, width, and (for `bend` style) that it never dips below the note.
 * - `level`: the input level bar by bar (dynamics).
 * - `none`: no check, with the reason shown to the learner.
 */
export type CheckSpec =
  | { kind: 'notes'; intonation?: boolean }
  | { kind: 'onsets' }
  | { kind: 'bend'; string: number; fret: number; semitones: number; toleranceCents: number; alone?: string }
  | { kind: 'prebend'; string: number; fret: number; semitones: number; toleranceCents: number }
  | { kind: 'vibrato'; string: number; fret: number; style: 'bend' | 'classical'; wavesPerBeat: number }
  | { kind: 'level'; shape: 'steps' | 'swell' }
  | { kind: 'none'; why: string };

/** One playable piece of an exercise (a pattern, a variation, a key). */
export interface ExercisePart {
  /** Slug-safe, unique within the exercise. */
  id: string;
  /** Short name shown on the part picker ("Eighths", "Strings 3 and 2"). */
  name: string;
  /** One line under the tab: what changes in this part. */
  note?: string;
  /** SixTab body: music lines and directives, no header (the header is added by `partSixTab`). */
  tab: string;
  /** Time signature of the first bar (default 4/4). */
  time?: string;
  /** Key for spelling notation and note names (SixTab `key:`), e.g. `F# major`, `C# minor`. */
  key?: string;
  /** Capo fret (chord symbols then name what sounds; the tab shows the shapes). */
  capo?: number;
  /** What one step of the ladder counts: quarter notes (default) or eighth notes (7/8, played at half the number in quarters). */
  pulse?: 'quarter' | 'eighth';
  /** Play this part at this fraction of the ladder tempo (thirty-seconds at half the ladder tempo). */
  tempoScale?: number;
  /** What the microphone can check. */
  check: CheckSpec;
  /** Which beats click (default every beat). */
  click?: ClickPattern;
}

/** A common mistake from the plan with what to do about it. */
export interface Mistake {
  /** The plan's "watch for" wording. */
  watch: string;
  /** How to fix it, for a learner with no teacher in the room. */
  fix: string;
}

/** A pair of chords for one-minute changes. */
export interface ChordPair {
  /** Slug-safe id, also the progress skill `chord-change:<id>`. */
  id: string;
  a: { symbol: string; shape: string };
  b: { symbol: string; shape: string };
  /** What helps this change (an anchor finger, a guide finger). */
  tip: string;
  /** One word that tells two pairs with the same chords apart, said before the second chord ("small", "barre"). */
  variant?: string;
}

/** One timed step of a routine. */
export interface RoutineStep {
  id: string;
  title: string;
  /** Seconds the step lasts. */
  seconds: number;
  /** What to do, one or two sentences. */
  text: string;
  /** Index into the exercise's `parts` for the material of this step (none for a rest step). */
  part?: number;
  /** A related exercise to open for the full version. */
  link?: string;
  /** Ask the learner to note one thing (the cool-down's "what felt tense today"). */
  reflect?: boolean;
}

/** A warning for exercises that can strain the hand. */
export interface StrainWarning {
  /** Shown beside the exercise and before it starts. */
  text: string;
  /** After this many minutes on the exercise in one visit, suggest a break or a change. */
  maxMinutes: number;
}

/** A technique exercise, written out. */
export interface TechniqueExercise {
  /** The plan's id (`tech-spider`); the route is `#technique--<id>`. */
  id: string;
  title: string;
  hand: Hand;
  /** 1 (first week) to 10 (concert level), as in the plan. */
  level: number;
  skill: SkillGroup;
  mode: ExerciseMode;
  tempo: TempoLadder;
  /** The plan's `teaches` tags. */
  teaches: string[];
  /** One line: what this trains and why it matters. */
  summary: string;
  /** How to play it, step by step. */
  steps: string[];
  /** What it should feel and sound like when it is right. */
  feel: string;
  mistakes: Mistake[];
  strain?: StrainWarning;
  /** Playable material; at least one part except in `guide` mode, where it may be the short check. */
  parts: ExercisePart[];
  /** `changes` mode: the chord pairs. */
  pairs?: ChordPair[];
  /** `routine` mode: the timed steps. */
  routine?: RoutineStep[];
  /** `guide` mode: the points to check. */
  checklist?: string[];
  /** A reference tone the learner can play (tuning by ear: the low E). */
  reference?: { midi: number; label: string };
  /** Other screens that help with this exercise (the tuner for tuning and the capo). */
  tools?: Array<{ route: string; label: string; icon: string }>;
}
