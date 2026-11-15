/**
 * Display text and colour names for notes, degrees, intervals and fingers. Pure functions: every
 * music component labels notes through these, so the naming setting (letters / solfege / German)
 * and the degree colours mean the same thing everywhere.
 */
import { degreeNumber } from '@/core/guitar';
import { formatDegree, formatNote, intervalName, isDegree, parseInterval, type NoteNaming } from '@/core/theory';
import type { DegreeColor, FingerColor, MusicColor } from './types';

/** Every colour name a component accepts, for checks and galleries. */
export const MUSIC_COLORS: readonly MusicColor[] = [
  'deg-1', 'deg-2', 'deg-3', 'deg-4', 'deg-5', 'deg-6', 'deg-7', 'deg-x',
  'finger-1', 'finger-2', 'finger-3', 'finger-4', 'finger-t',
  'neutral', 'accent', 'ok', 'bad', 'info',
];

/** Options for `noteText`. */
export interface NoteTextOptions {
  /** Show the octave number when the note has one (default false: fretboards and badges name pitch classes). */
  octave?: boolean;
  /** ASCII accidentals (`#`, `b`) instead of ♯ ♭. */
  ascii?: boolean;
}

/**
 * A note name for display in the reader's naming system: `noteText('F#4', 'solfege')` -> `Fa♯`.
 * Text that is not a note comes back unchanged, so a label never crashes a drawing.
 */
export function noteText(name: string, naming: NoteNaming = 'letters', opts: NoteTextOptions = {}): string {
  try {
    return formatNote(name, { system: naming, octave: opts.octave ?? false, ascii: opts.ascii });
  } catch {
    return name;
  }
}

/** Options for `degreeText`. */
export interface DegreeTextOptions {
  /** How the root is written: `R` (default, as on most neck diagrams) or `1`. */
  root?: 'R' | '1';
}

/** A degree label for display: `b3` -> `♭3`, `1` -> `R` (or `1`). Unknown text comes back unchanged. */
export function degreeText(degree: string, opts: DegreeTextOptions = {}): string {
  if (degree === '1') return opts.root ?? 'R';
  return isDegree(degree) ? formatDegree(degree) : degree;
}

/** An interval label for display: `m3` stays `m3`, `-P5` becomes `↓P5`. */
export function intervalText(name: string): string {
  return name.startsWith('-') ? `↓${name.slice(1)}` : name;
}

/** The spoken name of an interval for screen readers and captions: `m3` -> `minor third`. Unknown text comes back unchanged. */
export function intervalLongName(name: string): string {
  return parseInterval(name) ? intervalName(name) : name;
}

/**
 * The degree colour of a degree label: `b3` -> `deg-3`, `#11` -> `deg-4`, `1` -> `deg-1`.
 * Pass `outside: true` for a note that is not in the scale (it gets the neutral `deg-x`).
 */
export function degreeColor(degree: string, outside = false): DegreeColor {
  if (outside) return 'deg-x';
  if (!/\d/.test(degree)) return 'deg-x';
  return `deg-${degreeNumber(degree)}` as DegreeColor;
}

/** The colour of a fretting finger: 1–4 -> `finger-1` … `finger-4`, `T`/`t`/5 -> thumb, 0/null (open, none) -> neutral. */
export function fingerColor(finger: number | string | null | undefined): FingerColor | 'neutral' {
  if (finger === 't' || finger === 'T' || finger === 5) return 'finger-t';
  const n = typeof finger === 'string' ? Number(finger) : finger;
  if (n === 1 || n === 2 || n === 3 || n === 4) return `finger-${n}` as FingerColor;
  return 'neutral';
}

/** True when the text is a known colour name. */
export function isMusicColor(value: unknown): value is MusicColor {
  return typeof value === 'string' && (MUSIC_COLORS as readonly string[]).includes(value);
}

/** The text of a finger for a label: 1–4 as digits, the thumb as `T`, nothing for open strings. */
export function fingerText(finger: number | string | null | undefined): string {
  if (finger === 't' || finger === 'T' || finger === 5) return 'T';
  const n = typeof finger === 'string' ? Number(finger) : finger;
  return n === 1 || n === 2 || n === 3 || n === 4 ? String(n) : '';
}

/**
 * A font size that fits `text` inside a round marker of radius `r`: about one radius for one or
 * two characters, smaller for longer labels (`Sol♯`, `F♯4`). Musical signs count as narrow.
 */
export function labelFontSize(text: string, r: number): number {
  const chars = [...text].reduce((sum, ch) => sum + (/[♯♭𝄪𝄫#]/.test(ch) ? 0.6 : /[ilI1.]/.test(ch) ? 0.55 : 1), 0);
  if (chars <= 1.6) return r * 1.08;
  if (chars <= 2.2) return r * 0.98;
  return Math.max(r * 0.5, (r * 2 * 0.9) / (chars * 0.62));
}
