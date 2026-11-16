/**
 * The techniques of a tab phrase as things to draw and to say: a bend's arrow and its size
 * ("full", "½"), the H or P over a hammer-on or pull-off, a slide's line, vibrato's wave. Pure, so
 * the figure and its spoken label agree and both are tested in Node.
 */
import type { TabTechnique } from '../../types';

/** One note of a resolved tab, as the marks need it. */
export interface TabMarkNote {
  rest: boolean;
  string: number | null;
  fret: number | null;
  technique: TabTechnique | null;
}

/** What to draw for one note's techniques. Indexes point into the phrase's notes. */
export interface TabMarks {
  /** A bend arrow from the note, with its size as tab writes it (`full`, `½`) and whether it comes back down. */
  bend: { label: string; release: boolean } | null;
  /** A hammer-on, pull-off or legato slide from note `from`: `H`/`P` over an arc, or a slide line rising or falling. */
  legato: { from: number; kind: 'hammer' | 'pull' | 'slide'; label: string; rising: boolean } | null;
  /** A short line into the note: rising from below, or falling from above. */
  slideIn: 'below' | 'above' | null;
  /** A short line off the note: falling or rising. */
  slideOut: 'down' | 'up' | null;
  vibrato: boolean;
}

/** A bend's size as tab prints it: 2 semitones is `full`, 1 is `½`. */
export function bendLabel(semitones: number): string {
  const labels: Record<string, string> = { '0.5': '¼', '1': '½', '1.5': '¾', '2': 'full', '2.5': '1¼', '3': '1½' };
  return labels[String(semitones)] ?? `${semitones / 2}`;
}

/** A bend's size in words: "a whole step", "a half step". */
export function bendWords(semitones: number): string {
  const words: Record<string, string> = {
    '0.5': 'a quarter tone',
    '1': 'a half step',
    '1.5': 'three quarters of a step',
    '2': 'a whole step',
    '2.5': 'a step and a quarter',
    '3': 'a step and a half',
  };
  return words[String(semitones)] ?? `${semitones} half steps`;
}

/** The marks of every note (null for a rest or a plain note). */
export function tabMarks(notes: readonly TabMarkNote[]): Array<TabMarks | null> {
  return notes.map((n, i) => {
    const t = n.technique;
    if (n.rest || !t || n.fret === null) return null;
    const prevIndex = i - 1;
    const prev = prevIndex >= 0 ? notes[prevIndex] : null;
    const legato =
      t.legato && prev && !prev.rest && prev.string === n.string && prev.fret !== null
        ? { from: prevIndex, kind: t.legato, label: t.legato === 'hammer' ? 'H' : t.legato === 'pull' ? 'P' : '', rising: n.fret > prev.fret }
        : null;
    return {
      bend: t.bend !== undefined ? { label: bendLabel(t.bend), release: t.release === true } : null,
      legato,
      slideIn: t.slideIn ?? null,
      slideOut: t.slideOut ?? null,
      vibrato: t.vibrato === true,
    };
  });
}

/** True when any note has a mark drawn above its string (the figure then needs room on top). */
export function marksNeedHeadroom(marks: ReadonlyArray<TabMarks | null>): boolean {
  return marks.some((m) => m !== null && (m.bend !== null || m.vibrato || (m.legato !== null && m.legato.kind !== 'slide')));
}

/** One note in words for a screen reader: "string 3 fret 7, hammered on, bent up a whole step". */
export function tabNoteWords(n: TabMarkNote): string {
  if (n.rest || n.string === null || n.fret === null) return 'rest';
  const parts = [n.fret === 0 ? `string ${n.string} open` : `string ${n.string} fret ${n.fret}`];
  const t = n.technique;
  if (t) {
    if (t.legato === 'hammer') parts.push('hammered on');
    else if (t.legato === 'pull') parts.push('pulled off');
    else if (t.legato === 'slide') parts.push('slid to');
    if (t.slideIn) parts.push(`slid into from ${t.slideIn}`);
    if (t.bend !== undefined) parts.push(`bent up ${bendWords(t.bend)}${t.release ? ' and released' : ''}`);
    if (t.vibrato) parts.push('with vibrato');
    if (t.slideOut) parts.push(`sliding off ${t.slideOut}`);
  }
  return parts.join(', ');
}

/**
 * Where each note of a tab sits across the staff: longer notes get more room, but never in
 * proportion (an eighth beside a whole note would be crushed), and never less than `minGap`, so
 * two eighths with a pull-off between them still have room for the P. Returns the x of every note
 * from `start` and the x just past the last one, with `tail` room for its marks (a bend's arrow).
 */
export function tabNoteXs(notes: ReadonlyArray<{ ticks: number }>, opts: { start: number; step: number; minGap?: number; tail?: number }): { xs: number[]; end: number } {
  const minGap = opts.minGap ?? opts.step * 0.75;
  const xs: number[] = [];
  let x = opts.start;
  for (const n of notes) {
    xs.push(x);
    // sqrt spacing, as engravers do: a quarter gets one step, a half 1.4, a whole 2, an eighth 0.7.
    x += Math.max(minGap, opts.step * Math.sqrt(Math.max(1, n.ticks) / 960));
  }
  const last = xs.length > 0 ? xs[xs.length - 1] : opts.start;
  return { xs, end: last + (opts.tail ?? opts.step) };
}
