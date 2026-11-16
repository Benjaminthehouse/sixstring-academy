/**
 * Explanations after an answer, in plain words. A miss is never just "wrong": it says what the
 * note is, how to work it out from a landmark the learner can see (the open string, a dot, the
 * double dot at 12), and where the note they named actually lives.
 */
import { spell } from './notes';
import { anchorFor, describeShape, landmarkName, numberWord, pcAt, type Anchor } from './neck';
import type { NeckContext, Pos, Question } from './types';

/** Frets the learner can see (the board's range): explanations only lean on landmarks inside it. */
export type FretRange = readonly [number, number];
const WHOLE_NECK: FretRange = [0, 24];

/** Turns an ASCII note name into display text in the reader's naming (`C#` → `C♯`, `Do♯`). */
export type NoteFormatter = (ascii: string) => string;

/** How to reach a position from its nearest landmark: "The dot at fret 5 is A; two frets up is B." */
export function anchorSentence(ctx: NeckContext, p: Pos, name: string, fmt: NoteFormatter, range: FretRange = WHOLE_NECK): string | null {
  if (p.fret === 0) return `The open string is ${fmt(name)}.`;
  const a = anchorFor(ctx, p, range);
  if (!a) return null;
  const anchorName = fmt(spell(a.pc, ctx.spelling === 'flats' ? 'flats' : 'sharps'));
  const n = Math.abs(a.distance);
  const where = landmarkName(a.fret);
  const lead = a.fret === 0 ? `The open string is ${anchorName}` : `${capital(where)} is ${anchorName}`;
  return `${lead}; ${numberWord(n)} fret${n === 1 ? '' : 's'} ${a.distance > 0 ? 'up' : 'down'} is ${fmt(name)}.`;
}

/** When the asked note sits right on a landmark, say so: "It sits on the dot at fret 5." */
export function onLandmarkSentence(p: Pos): string | null {
  if (p.fret === 0) return 'It is the open string.';
  if ([3, 5, 7, 9, 15, 17, 19, 21].includes(p.fret)) return `It sits on the dot at fret ${p.fret}.`;
  if (p.fret === 12 || p.fret === 24) return `It sits on the double dot at fret ${p.fret}.`;
  return null;
}

/**
 * The landmark an explanation of `p` leans on, for drawing it on the board: none when `p` sits on
 * a landmark itself (the explanation then names that one), so the picture never shows a landmark
 * the words do not mention.
 */
export function explanationAnchor(ctx: NeckContext, p: Pos, range: FretRange = WHOLE_NECK): Anchor | null {
  return onLandmarkSentence(p) ? null : anchorFor(ctx, p, range);
}

/** How to work out where `p` is: on a landmark, or from the nearest one. Null when none is near. */
export function howToFind(ctx: NeckContext, p: Pos, name: string, fmt: NoteFormatter, range: FretRange = WHOLE_NECK): string | null {
  return onLandmarkSentence(p) ?? anchorSentence(ctx, p, name, fmt, range);
}

/** "fret 7" or "the open string". */
export function fretWords(fret: number): string {
  return fret === 0 ? 'open' : `fret ${fret}`;
}

/** The lines shown after a wrong "name it" answer. */
export function explainNameMiss(q: Extract<Question, { kind: 'name' }>, givenPc: number, givenAt: Pos | null, ctx: NeckContext, fmt: NoteFormatter, range: FretRange = WHOLE_NECK): string[] {
  const lines = [`This is ${fmt(q.name)}.`];
  const how = howToFind(ctx, q.pos, q.name, fmt, range);
  if (how) lines.push(how);
  const given = fmt(spell(givenPc, ctx.spelling === 'flats' ? 'flats' : 'sharps'));
  if (givenAt) lines.push(givenAt.fret === 0 ? `${given} is the open string here.` : `${given} is at fret ${givenAt.fret} on this string.`);
  return lines;
}

/** The lines shown after a wrong tap in a find, octave or play question. */
export function explainFindMiss(q: Question, tapped: Pos | null, ctx: NeckContext, fmt: NoteFormatter, range: FretRange = WHOLE_NECK): string[] {
  const lines: string[] = [];
  if (tapped) {
    const was = fmt(spell(pcAt(ctx, tapped), ctx.spelling === 'flats' ? 'flats' : 'sharps'));
    lines.push(`That one is ${was} (${fretWords(tapped.fret)}).`);
  }
  if (q.kind === 'find' || q.kind === 'play') {
    const places = q.kind === 'find' && q.targets.length ? q.targets : [q.pos];
    const t = places[0];
    const list = places.map((p) => fretWords(p.fret));
    lines.push(`${fmt(q.name)} on this string: ${list.join(' and ')}.`);
    const how = howToFind(ctx, t, q.name, fmt, range);
    if (how) lines.push(how);
  } else if (q.kind === 'octave') {
    lines.push(`The shape is ${describeShape({ from: q.from.string, to: q.string, shift: q.shift, octaves: q.octaves })}: ${fretWords(q.from.fret)} on string ${q.from.string} goes to ${fretWords(q.pos.fret)} on string ${q.string}.`);
  } else if (q.kind === 'find-any' || q.kind === 'every') {
    lines.push(`${fmt(q.name)} is marked everywhere it sits.`);
  }
  return lines;
}

function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
