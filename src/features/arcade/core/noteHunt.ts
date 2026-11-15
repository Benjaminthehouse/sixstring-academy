/**
 * Note Hunt: notes of the scale are called one at a time inside the shape; the learner plays or
 * taps each one. Early levels light the very dot to play (eyes to fingers); later levels only name
 * the note, then hide the shape, so the box has to live in the learner's head.
 */
import type { PatternNote, ScalePattern } from '@/core/guitar';
import { makeRng, rotation } from './rng';
import { regionOf } from './focus';

/** One level of Note Hunt. */
export interface NoteHuntLevel {
  n: number;
  title: string;
  goal: string;
  /** `lit`: the dot to play pulses. `named`: only its name is called; any place it sits in the shape counts. */
  mode: 'lit' | 'named';
  /** Note names written in the shape's dots. */
  labels: boolean;
  /** Whether the shape's dots are drawn at all (hidden: only the box around it). */
  shape: 'shown' | 'hidden';
  /** Notes in a round. */
  targets: number;
  /** A clock for the round, in seconds (rush levels). */
  seconds?: number;
}

/** The levels, easiest first. */
export const NOTE_HUNT_LEVELS: readonly NoteHuntLevel[] = [
  { n: 1, title: 'Follow the light', goal: 'A dot lights up. Play it or tap it.', mode: 'lit', labels: true, shape: 'shown', targets: 10 },
  { n: 2, title: 'Lights only', goal: 'The names are gone; the light shows the way.', mode: 'lit', labels: false, shape: 'shown', targets: 12 },
  { n: 3, title: 'Name hunt', goal: 'A note is named. Find it in the shape.', mode: 'named', labels: false, shape: 'shown', targets: 12 },
  { n: 4, title: 'From memory', goal: 'The shape is hidden. Find each note from memory.', mode: 'named', labels: false, shape: 'hidden', targets: 12 },
  { n: 5, title: 'Hunt rush', goal: 'From memory, against a 75-second clock.', mode: 'named', labels: false, shape: 'hidden', targets: 40, seconds: 75 },
];

/** One note to find. */
export interface HuntTarget {
  index: number;
  /** The spelled note name, no octave (`D`, `F#`). */
  note: string;
  /** The scale degree of that note. */
  degree: string;
  /** For `lit` targets: the one dot that lights. */
  lit: PatternNote | null;
  /** Every position that counts as the answer (one for lit targets, every place in the shape for named ones). */
  answers: PatternNote[];
}

/** A round of Note Hunt. */
export interface NoteHuntRound {
  level: NoteHuntLevel;
  pattern: ScalePattern;
  /** Frets drawn. */
  frets: [number, number];
  targets: HuntTarget[];
  seed: number;
}

/** Build a round: a fair rotation through the shape's notes (or note names), never the same one twice in a row. */
export function makeNoteHuntRound(pattern: ScalePattern, level: NoteHuntLevel, seed: number, size?: number): NoteHuntRound {
  const rng = makeRng(seed);
  const count = Math.max(1, size ?? level.targets);
  let targets: HuntTarget[];
  if (level.mode === 'lit') {
    // Consecutive dots on the same string and fret are excluded by the rotation; also avoid the
    // same note name twice running (two As an octave apart feel like a repeat).
    const order = rotation(rng, pattern.notes, count, (a, b) => a.note === b.note);
    targets = order.map((n, index) => ({ index, note: n.note, degree: n.degree, lit: n, answers: [n] }));
  } else {
    const names = [...new Set(pattern.notes.map((n) => n.note))];
    const order = rotation(rng, names, count);
    targets = order.map((note, index) => {
      const answers = pattern.notes.filter((n) => n.note === note);
      return { index, note, degree: answers[0].degree, lit: null, answers };
    });
  }
  return { level, pattern, frets: regionOf(pattern), targets, seed };
}

/** Whether a tapped or played position answers a target. */
export function answersTarget(target: HuntTarget, pos: { string: number; fret: number }): boolean {
  return target.answers.some((a) => a.string === pos.string && a.fret === pos.fret);
}

/** MIDI numbers that answer a target when it is played on the guitar. */
export function targetMidis(target: HuntTarget): number[] {
  return [...new Set(target.answers.map((a) => a.midi))];
}
