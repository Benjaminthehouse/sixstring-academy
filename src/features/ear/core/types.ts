/**
 * The data every ear-training drill shares. A question carries its sound as plain data (a
 * `SoundPlan`), and every answer option carries the plan of what that option would have sounded
 * like. The screen only ever plays these plans, so what is heard is exactly what is graded.
 */
import type { ToneName } from '@/core/audio';
import type { Rng } from './rng';

/** The drills, in no particular order (the ladder order lives in `drills/index.ts`). */
export type DrillId =
  | 'pitch'
  | 'intervals-up'
  | 'intervals-down'
  | 'intervals-together'
  | 'compound'
  | 'chords'
  | 'scales'
  | 'degrees'
  | 'progressions'
  | 'melody'
  | 'dictation'
  | 'bass'
  | 'modes'
  | 'tuning';

/** How the notes of one event are struck. */
export type Strike = 'pluck' | 'strum' | 'together';

/** One moment in a plan: a single note, or several notes struck at once. */
export interface SoundEvent {
  /** Seconds from the start of the plan. */
  at: number;
  /** Sounding MIDI notes. For a strum: low string to high string. */
  midis: number[];
  /** Guitar string per note (1 = thinnest), where the shape is known. */
  strings?: Array<number | null>;
  /** Seconds the notes ring before they are damped. */
  dur: number;
  strike: Strike;
  /** Detune of every note in the event, in cents (the tuning drill). */
  cents?: number;
  /** Playing strength 0..1. */
  velocity?: number;
  /** Strum direction. */
  direction?: 'down' | 'up';
  /** `subject`: what the question is about. `context`: what sets it up (a cadence, a reference). */
  role: 'subject' | 'context';
  /** An instrument of its own for these notes (the bass-line drill plays a bass); default: the learner's guitar. */
  tone?: Extract<ToneName, 'bass-finger' | 'bass-pick' | 'bass-upright'>;
}

/** A chord for the backing band: pitch classes, C = 0. */
export interface BandChord {
  root: number;
  tones: number[];
  symbol: string;
}

/** The band's version of a progression (played instead of the guitar events when chosen). */
export interface BandPart {
  /** One chord per bar. */
  bars: BandChord[];
  style: 'pop-rock' | 'blues-shuffle' | 'jazz-swing' | 'ballad';
  /** Tempo in the style's felt beats per minute. */
  tempo: number;
}

/** Everything one hearing of a question (or of an answer option) plays. */
export interface SoundPlan {
  events: SoundEvent[];
  /** Seconds until the plan has finished sounding enough to move on. */
  length: number;
  /** A tonic drone under part of the plan (key setting for scale degrees). */
  drone?: { midi: number; from: number; to: number };
  /** A backing-band rendering of the same chords. */
  band?: BandPart;
}

/** What the screen shows for an answer. */
export interface OptionInfo {
  /** Stable id within the drill (`M3`, `maj7`, `dorian`, `higher`). */
  id: string;
  /** Short label on the answer button (`M3`, `Major`). */
  label: string;
  /** Name used in sentences ("a major 3rd"), without an article. */
  name: string;
  /** Second line on the button (`major 3rd`, `1 3 5`). */
  detail?: string;
  /** A well-known traditional tune that begins with this sound (intervals only). */
  aid?: string;
  /** Lucide icon for the button, where a picture helps (arrows for higher / lower). */
  icon?: string;
}

/** An answer option of one question, with what it would sound like. */
export interface QuestionOption extends OptionInfo {
  plan: SoundPlan;
}

/** What the generator knows about the sound, for the checks that re-derive the answer. */
export type Truth = Readonly<Record<string, number | string | boolean | readonly number[] | readonly string[]>>;

interface QuestionBase {
  /** Unique within a round. */
  id: string;
  drill: DrillId;
  level: number;
  index: number;
  seed: number;
  /** The question in words. */
  prompt: string;
  /** What plays: context (if any) then the subject. */
  plan: SoundPlan;
  /** Sounding MIDI notes of the subject events, in the order they sound. */
  subject: number[];
  /** First subject note, for "show the first note". */
  firstNote: number | null;
  /** Spelled key or root shown with "show the first note" (`G major`). */
  keyName?: string;
  /** "Slower" makes sense (melodic material). */
  canSlow: boolean;
  /** "Notes one at a time" makes sense (notes sounding together). */
  canSpread: boolean;
  truth: Truth;
}

/** Pick one of several answers. */
export interface ChoiceQuestion extends QuestionBase {
  kind: 'choice';
  options: QuestionOption[];
  /** Id of the right option. */
  answer: string;
}

/** A key of the note row (melody playback), or a pitch on the neck (dictation). */
export interface RowKey {
  id: string;
  midi: number;
  /** Scale degree (`1`, `b3`, `1'` for the octave), or the note's name on the neck. */
  label: string;
  /** Movable-do syllable, or the degree on the neck. */
  sub: string;
}

/** The part of the neck a dictation is played back on. */
export interface NeckArea {
  /** First and last fret shown (0 = with the open strings). */
  frets: [number, number];
}

/** Rebuild a melody note by note. */
export interface SequenceQuestion extends QuestionBase {
  kind: 'sequence';
  keys: RowKey[];
  /** Row-key ids of the melody, in order. */
  target: string[];
  /** How many of the first notes are given (shown and filled in). */
  given: number;
  /** Seconds between notes when a sequence is played back. */
  noteGap: number;
  /** How the learner enters it: the note row (default) or a guitar neck. */
  input?: 'row' | 'neck';
  /** With `input: 'neck'`: where on the neck; `keys` are then every pitch in that area. */
  neck?: NeckArea;
  /** The tone the sequence is played in when it is played back (the bass line). */
  tone?: SoundEvent['tone'];
}

export type Question = ChoiceQuestion | SequenceQuestion;

/** The learner's sound choices (screen preferences). */
export interface EarSettings {
  /** Random root / key each question, or always the same one. */
  root: 'random' | 'fixed';
  /** Pitch class of the fixed root, C = 0. */
  fixedRoot: number;
  /** Guitar voice. */
  tone: 'steel' | 'nylon' | 'clean';
  /** Show the name of the first note (or the key). */
  showFirstNote: boolean;
  /** Show memory-aid tunes for intervals. */
  aids: boolean;
  /** Chords strummed or played one note at a time. */
  chordStyle: 'strum' | 'arpeggio';
  /** Progressions on a strummed guitar or the backing band. */
  progressionSound: 'guitar' | 'band';
  /** How the key is set before a scale-degree question. */
  keySetter: 'cadence' | 'drone';
}

/** Everything a generator needs for one question. */
export interface GenContext {
  rng: Rng;
  /** The answer to build (chosen by the adaptive picker from the level's pool). */
  answer: string;
  settings: EarSettings;
  /** 0 = make it as easy as the level allows, 1 = as hard as it allows. */
  difficulty: number;
  index: number;
  seed: number;
}

/** One level of a drill. */
export interface LevelDef {
  n: number;
  title: string;
  /** What is in play, in a few words. */
  blurb: string;
  /** Answer ids in play (the choices shown). */
  pool: string[];
  /** Questions per round. */
  questions: number;
  /** Build a question. */
  make(ctx: GenContext): Question;
}

/** One drill: a rung of the ladder. */
export interface DrillDef {
  id: DrillId;
  title: string;
  /** What it trains, one line. */
  trains: string;
  /** Lucide icon. */
  icon: string;
  /** The question asked, in general. */
  prompt: string;
  levels: LevelDef[];
  /** Label and name of any answer id of this drill. */
  info(id: string): OptionInfo;
  /** A sentence for "you often hear A as B". */
  mixSentence(answer: OptionInfo, chosen: OptionInfo): string;
  /** Where the drill sits on the curriculum path: first step and spacing of its levels. */
  path: { start: number; pace: number };
}
