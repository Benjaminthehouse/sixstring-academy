/**
 * Explanations after an answer, in plain words. A miss is never just "wrong": it says what the
 * note is, how to work it out from a landmark the learner can see (the open string, a dot, the
 * double dot at 12), and where the note they named actually lives.
 */
import { spell } from './notes';
import { anchorFor, describeShape, landmarkName, numberWord, pcAt } from './neck';
import type { NeckContext, Pos, Question } from './types';

/** Turns an ASCII note name into display text in the reader's naming (`C#` → `C♯`, `Do♯`). */
export type NoteFormatter = (ascii: string) => string;

/** How to reach a position from its nearest landmark: "The dot at fret 5 is A; two frets up is B." */
export function anchorSentence(ctx: NeckContext, p: Pos, name: string, fmt: NoteFormatter, maxFret = 24): string | null {
  if (p.fret === 0) return `The open string is ${fmt(name)}.`;
  const a = anchorFor(ctx, p, maxFret);
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

/** "fret 7" or "the open string". */
export function fretWords(fret: number): string {
  return fret === 0 ? 'open' : `fret ${fret}`;
}

/** The lines shown after a wrong "name it" answer. */
export function explainNameMiss(q: Extract<Question, { kind: 'name' }>, givenPc: number, givenAt: Pos | null, ctx: NeckContext, fmt: NoteFormatter): string[] {
  const lines = [`This is ${fmt(q.name)}.`];
  const how = onLandmarkSentence(q.pos) ?? anchorSentence(ctx, q.pos, q.name, fmt);
  if (how) lines.push(how);
  const given = fmt(spell(givenPc, ctx.spelling === 'flats' ? 'flats' : 'sharps'));
  if (givenAt) lines.push(givenAt.fret === 0 ? `${given} is the open string here.` : `${given} is at fret ${givenAt.fret} on this string.`);
  return lines;
}

/** The lines shown after a wrong tap in a find, octave or play question. */
export function explainFindMiss(q: Question, tapped: Pos | null, ctx: NeckContext, fmt: NoteFormatter): string[] {
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
    const how = onLandmarkSentence(t) ?? anchorSentence(ctx, t, q.name, fmt);
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
