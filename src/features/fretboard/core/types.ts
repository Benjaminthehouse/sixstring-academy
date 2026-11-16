/**
 * Shared types of the fretboard trainer. Positions follow the app's conventions: string 1 is the
 * thinnest, fret 0 is the open string, pitch is sounding MIDI, pitch classes run 0–11 from C.
 */

/** A place on the neck. */
export interface Pos {
  string: number;
  fret: number;
}

/** Which notes a question may use. */
export type NoteSet = 'naturals' | 'all' | 'accidentals';

/** How sharps and flats are spelled: one way, or both (each question picks one, answers accept either). */
export type Spelling = 'sharps' | 'flats' | 'both';

/** The part of the neck a round practises. */
export interface Scope {
  /** Strings included (1 = thinnest). */
  strings: number[];
  /** First and last fret, inclusive. */
  frets: [number, number];
  notes: NoteSet;
  /** When set, only these frets (the first step uses the open strings and fret 12). */
  onlyFrets?: number[];
  /** When set, only these positions (`string:fret` keys): the learner's blind spots. */
  only?: string[];
  /** When set, only these pitch classes (a drill on one note: "find every C"); overrides `notes`. */
  pcs?: number[];
}

/** What the trainer needs to know about the guitar and the reader. */
export interface NeckContext {
  /** Open-string MIDI numbers, low to high (index 0 = the lowest string). */
  tuning: readonly number[];
  spelling: Spelling;
}

/** Kinds of question. */
export type QuestionKind = 'name' | 'find' | 'find-any' | 'every' | 'octave' | 'play';

/** Fields every question has. */
interface QuestionBase {
  /** Question number in the round, from 0. */
  index: number;
  /** What the adaptive picker chose: a position key (`6:5`) or a pitch-class key (`pc:9`). */
  item: string;
  /** The note asked about (pitch class). */
  pc: number;
  /** Its spelling in this question (ASCII: `C#`, `Db`, `A`). */
  name: string;
}

/** A marker lights up: name it. */
export interface NameQuestion extends QuestionBase {
  kind: 'name';
  pos: Pos;
  midi: number;
}

/** Tap a named note on one string. */
export interface FindQuestion extends QuestionBase {
  kind: 'find';
  string: number;
  /** Every correct place (one or two, depending on the range). */
  targets: Pos[];
  /** The position the picker meant. */
  pos: Pos;
  /** Extra framing ("the root of a G barre chord, E shape"). */
  flavor?: 'barre-root';
}

/** Tap a named note anywhere in the range. */
export interface FindAnyQuestion extends QuestionBase {
  kind: 'find-any';
  targets: Pos[];
}

/** Tap every place a note lives in the range. */
export interface EveryQuestion extends QuestionBase {
  kind: 'every';
  targets: Pos[];
}

/** A note is shown on one string: find the same note an octave (or two) higher on another. */
export interface OctaveQuestion extends QuestionBase {
  kind: 'octave';
  from: Pos;
  string: number;
  /** The place the octave shape leads to. */
  pos: Pos;
  /** Every place on the target string with that note (any of them counts). */
  targets: Pos[];
  /** Frets from the shown note to the octave (negative = back toward the nut). */
  shift: number;
  /** Octaves between the two notes (1, or 2 for string 6 to string 1). */
  octaves: number;
}

/** Play a named note on one string, heard through the microphone. */
export interface PlayQuestion extends QuestionBase {
  kind: 'play';
  string: number;
  pos: Pos;
  /** Pitches that count: the note on that string at every place in range (exact octaves). */
  midis: number[];
}

/** Any question. */
export type Question = NameQuestion | FindQuestion | FindAnyQuestion | EveryQuestion | OctaveQuestion | PlayQuestion;

/** Questions that are answered by tapping the neck. */
export type TapQuestion = FindQuestion | FindAnyQuestion | EveryQuestion | OctaveQuestion;

/** What one question earned, for the summary and the stats. */
export interface QuestionResult {
  kind: QuestionKind;
  item: string;
  pc: number;
  name: string;
  /** 0..1: 1 = right first time; for "find every", found ÷ (places + wrong taps). */
  score: number;
  /** Right at the first try. */
  right: boolean;
  /** Time to the right answer in ms (first try only), else null. */
  ms: number | null;
  /** The positions the question was about (for the round's map). */
  positions: Pos[];
  /** Positions the learner got wrong in this question. */
  missed: Pos[];
}
