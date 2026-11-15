/**
 * The declarative notation format and everything about it that does not need VexFlow: parsing the
 * compact text form, splitting notes into measures by the time signature (tying notes across a
 * barline), choosing which accidentals to print, and breaking measures into lines.
 *
 * Compact text: events separated by spaces, bars by `|`.
 *   E4/q F#4/8 G4/8 A4/h        notes with durations (w h q 8 16 32; also e = 8, s = 16)
 *   (C4 E4 G4)/h                a chord
 *   r/q                         a rest
 *   B3/q. C4/8~ C4/q            a dot; `~` ties into the next note
 *   E4 F4 G4                    a missing duration repeats the previous one (the first is a quarter)
 * Pitches are what sounds (guitar data). The `treble-8vb` clef writes them an octave higher.
 */
import { durationTicks, getKey, note as parseTheoryNote, parseNote, parseTimeSignature, splitDuration, type NoteValueId, type TimeSignature } from '@/core/theory';
import type { MusicColor } from '../types';

/** Note lengths: VexFlow codes, also accepted as words. */
export type NotationDuration = 'w' | 'h' | 'q' | '8' | '16' | '32';

/** One note, chord or rest. */
export interface NotationNote {
  /** Pitch with octave (`E4`) or several for a chord. Omit (or `rest: true`) for a rest. */
  keys?: string | readonly string[];
  rest?: boolean;
  /** Default `q`. Words work too: `quarter`, `eighth`. */
  duration?: NotationDuration | 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'thirty-second' | 'e' | 's';
  /** Augmentation dots (0–2). */
  dots?: number;
  /** Tie into the next note (same pitches). */
  tie?: boolean;
  /** Part of a triplet (three in the time of two); write all three. */
  triplet?: boolean;
  /** Accent mark (>) above or below. */
  accent?: boolean;
  /** Text under the note; overrides the `labels` setting for this note. */
  label?: string;
  /** Notehead colour for every key of this note. */
  color?: MusicColor;
  /** Notehead colour per key (a chord with coloured roots and thirds). */
  colors?: ReadonlyArray<MusicColor | null | undefined>;
}

/** A note after parsing: normalised, with its position in the source list. */
export interface ParsedNote {
  /** Index in the source list (for highlights and labels). */
  index: number;
  keys: string[];
  rest: boolean;
  duration: NotationDuration;
  dots: number;
  tie: boolean;
  triplet: boolean;
  accent: boolean;
  label?: string;
  colors: Array<MusicColor | null>;
  ticks: number;
  /** True for the second half of a note split at a barline (it gets no accidental and no label). */
  continuation?: boolean;
}

/** A source list entry: a note, or the barline marker `'|'`. */
export type NotationItem = NotationNote | '|';

const DURATION_ALIASES: Record<string, NotationDuration> = {
  w: 'w', whole: 'w', '1': 'w',
  h: 'h', half: 'h', '2': 'h',
  q: 'q', quarter: 'q', '4': 'q',
  '8': '8', e: '8', eighth: '8',
  '16': '16', s: '16', sixteenth: '16',
  '32': '32', 'thirty-second': '32',
};

const VALUE_OF: Record<NotationDuration, NoteValueId> = { w: 'whole', h: 'half', q: 'quarter', '8': 'eighth', '16': 'sixteenth', '32': 'thirty-second' };
const CODE_OF: Partial<Record<NoteValueId, NotationDuration>> = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', sixteenth: '16', 'thirty-second': '32' };

/** The duration code of a duration name or code; null when unknown. */
export function durationCode(input: string | undefined): NotationDuration | null {
  if (input === undefined) return null;
  return DURATION_ALIASES[input.trim().toLowerCase()] ?? null;
}

/** Ticks (960 per quarter) of a duration with dots and an optional triplet. */
export function noteTicks(duration: NotationDuration, dots = 0, triplet = false): number {
  return durationTicks(VALUE_OF[duration], { dots: dots || undefined, tuplet: triplet ? 3 : undefined });
}

/**
 * Parse the compact text form (see the module comment) into notes and barlines. Unreadable tokens
 * are reported in `errors` and skipped, so a typo in lesson content shows up without crashing.
 */
export function parseNotation(text: string): { items: NotationItem[]; errors: string[] } {
  const items: NotationItem[] = [];
  const errors: string[] = [];
  let lastDuration: NotationDuration = 'q';
  // Keep a chord's parenthesised notes in one token.
  const tokens = text.replace(/\(([^)]*)\)/g, (_m, inner: string) => `(${inner.trim().split(/\s+/).join(',')})`).split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token === '|') {
      items.push('|');
      continue;
    }
    const m = /^(\([^)]*\)|[A-Ga-g][#bx]*-?\d|r|R)(?:\/([a-z0-9-]+))?(\.{0,2})(~?)$/.exec(token);
    if (!m) {
      errors.push(`Cannot read "${token}". Write a pitch with octave and a duration, like E4/q, (C4 E4 G4)/h or r/8.`);
      continue;
    }
    const [, head, durText, dotText, tieText] = m;
    const duration: NotationDuration | null = durText ? durationCode(durText) : lastDuration;
    if (!duration) {
      errors.push(`Unknown duration "${durText}" in "${token}". Use w, h, q, 8, 16 or 32.`);
      continue;
    }
    lastDuration = duration;
    const dots = dotText.length;
    if (head === 'r' || head === 'R') {
      items.push({ rest: true, duration, dots: dots || undefined });
      continue;
    }
    const keys = head.startsWith('(') ? head.slice(1, -1).split(',').filter(Boolean) : [head];
    const bad = keys.filter((k) => !parseNote(normaliseKey(k))?.octave && parseNote(normaliseKey(k))?.octave !== 0);
    if (bad.length) {
      errors.push(`"${bad.join(', ')}" in "${token}" is not a pitch with an octave (E4, F#3, Bb2).`);
      continue;
    }
    items.push({ keys: keys.map(normaliseKey), duration, dots: dots || undefined, tie: tieText === '~' || undefined });
  }
  return { items, errors };
}

/** Upper-case the letter and turn `x` into `##`: `f#4` -> `F#4`, `Cx4` -> `C##4`. */
function normaliseKey(k: string): string {
  return k.charAt(0).toUpperCase() + k.slice(1).replace(/x/g, '##');
}

/** Normalise a source list (text, or notes and pitch strings) into parsed notes and bar breaks. */
export function normaliseItems(input: string | ReadonlyArray<NotationItem | string>): { notes: ParsedNote[]; bars: number[]; errors: string[] } {
  let items: NotationItem[];
  const errors: string[] = [];
  if (typeof input === 'string') {
    const parsed = parseNotation(input);
    items = parsed.items;
    errors.push(...parsed.errors);
  } else {
    items = input.map((item) => (typeof item === 'string' && item !== '|' ? { keys: item } : item));
  }
  const notes: ParsedNote[] = [];
  const bars: number[] = [];
  let lastDuration: NotationDuration = 'q';
  items.forEach((item) => {
    if (item === '|') {
      if (notes.length && bars[bars.length - 1] !== notes.length) bars.push(notes.length);
      return;
    }
    const keys = (typeof item.keys === 'string' ? [item.keys] : [...(item.keys ?? [])]).map(normaliseKey);
    const rest = item.rest === true || keys.length === 0;
    const duration = durationCode(item.duration) ?? lastDuration;
    lastDuration = duration;
    const validKeys = keys.filter((k) => {
      const n = parseNote(k);
      if (!n || n.octave === null) {
        errors.push(`"${k}" is not a pitch with an octave (E4, F#3, Bb2).`);
        return false;
      }
      return true;
    });
    const dots = Math.max(0, Math.min(2, Math.round(item.dots ?? 0)));
    const triplet = !!item.triplet;
    const colors = validKeys.map((_k, i) => item.colors?.[i] ?? item.color ?? null);
    notes.push({
      index: notes.length,
      keys: rest ? [] : validKeys,
      rest: rest || validKeys.length === 0,
      duration,
      dots,
      tie: !!item.tie && !rest,
      triplet,
      accent: !!item.accent,
      label: item.label,
      colors,
      ticks: noteTicks(duration, dots, triplet),
    });
  });
  return { notes, bars, errors };
}

/** A measure: its notes, and whether it is complete. */
export interface Measure {
  notes: ParsedNote[];
  /** Ticks filled. */
  ticks: number;
}

/**
 * Split notes into measures. Explicit bar breaks win. Otherwise, with a time signature, a bar
 * closes when it is full and a note that crosses the barline is split into tied notes, the way it
 * is engraved. Without a time signature (free notes: a scale, a key-signature drill) the notes are
 * grouped into chunks of about four beats, which are line-break points but get no barlines.
 */
export function splitMeasures(notes: readonly ParsedNote[], bars: readonly number[], time: TimeSignature | null): Measure[] {
  if (notes.length === 0) return [{ notes: [], ticks: 0 }];
  if (bars.length > 0) {
    const out: Measure[] = [];
    let start = 0;
    for (const end of [...bars, notes.length]) {
      if (end <= start) continue;
      const slice = notes.slice(start, end);
      out.push({ notes: slice, ticks: slice.reduce((s, n) => s + n.ticks, 0) });
      start = end;
    }
    return out;
  }
  const capacity = time ? time.barTicks : 4 * 960;
  const out: Measure[] = [];
  let current: ParsedNote[] = [];
  let used = 0;
  const close = () => {
    if (current.length) out.push({ notes: current, ticks: used });
    current = [];
    used = 0;
  };
  for (const n of notes) {
    if (!time) {
      // Free notes: chunk by length, never splitting a note.
      if (used > 0 && (used + n.ticks > capacity || current.length >= 8)) close();
      current.push(n);
      used += n.ticks;
      continue;
    }
    let remaining = n.ticks;
    let first = true;
    while (remaining > 0) {
      const room = capacity - used;
      if (remaining <= room || n.triplet) {
        current.push(first ? n : { ...n, continuation: true, label: undefined, ticks: remaining });
        used += remaining;
        remaining = 0;
      } else {
        // Fill the bar with tied pieces, carry the rest over.
        const pieces = room > 0 ? piecesOf(room) : [];
        pieces.forEach((p, i) => {
          current.push({
            ...n,
            duration: p.duration,
            dots: p.dots,
            ticks: p.ticks,
            tie: n.rest ? false : true,
            continuation: !(first && i === 0) || undefined,
            label: first && i === 0 ? n.label : undefined,
          });
        });
        used += room;
        remaining -= room;
        first = false;
        close();
        // The carried part: as written pieces, the last keeps the note's own tie.
        if (remaining > 0 && remaining <= capacity) {
          const rest = piecesOf(remaining);
          rest.forEach((p, i) => {
            current.push({ ...n, duration: p.duration, dots: p.dots, ticks: p.ticks, continuation: true, label: undefined, tie: i < rest.length - 1 ? !n.rest : n.tie });
          });
          used += remaining;
          remaining = 0;
        }
      }
      if (used >= capacity) close();
    }
  }
  close();
  return out;
}

/** Plain durations (with dots) that add up to `ticks`, longest first. */
function piecesOf(ticks: number): Array<{ duration: NotationDuration; dots: number; ticks: number }> {
  return splitDuration(ticks).flatMap((d) => {
    const code = CODE_OF[d.value];
    if (!code) return [];
    const dots = d.dots ?? 0;
    return [{ duration: code, dots, ticks: noteTicks(code, dots) }];
  });
}

/** The accidental glyph to print: `#`, `b`, `n` (natural), `##`, `bb`, or null for none. */
export type AccidentalGlyph = '#' | 'b' | 'n' | '##' | 'bb' | null;

const GLYPH: Record<number, AccidentalGlyph> = { 0: 'n', 1: '#', [-1]: 'b', 2: '##', [-2]: 'bb' };

/**
 * Which accidentals to print in one measure, per note and key. A key-signature note needs none;
 * an alteration lasts to the end of the bar on that line and octave; a natural cancels it; a note
 * continued by a tie from the bar before is never re-marked.
 */
export function measureAccidentals(notes: ReadonlyArray<{ keys: readonly string[]; continuation?: boolean }>, keyFifths: number): AccidentalGlyph[][] {
  const signature = signatureAlterations(keyFifths);
  const inEffect = new Map<string, number>();
  return notes.map((n) =>
    n.keys.map((k) => {
      const parsed = parseTheoryNote(k);
      const where = `${parsed.letter}${parsed.octave}`;
      const current = inEffect.get(where) ?? signature[parsed.letter] ?? 0;
      if (n.continuation) return null;
      if (parsed.alt === current) return null;
      inEffect.set(where, parsed.alt);
      return GLYPH[parsed.alt] ?? null;
    }),
  );
}

/** The alteration of each letter in a key signature: 2 sharps -> { F: 1, C: 1 }. */
export function signatureAlterations(fifths: number): Record<string, number> {
  const order = fifths >= 0 ? ['F', 'C', 'G', 'D', 'A', 'E', 'B'] : ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  const out: Record<string, number> = {};
  const count = Math.min(7, Math.abs(fifths));
  for (let i = 0; i < count; i++) out[order[i]] = fifths > 0 ? 1 : -1;
  return out;
}

/** The key signature of a key name (`G major`, `Eb`, `F# minor`): its fifths and VexFlow key spec, or none for C. */
export function keySpec(keyName: string | undefined | null): { fifths: number; vex: string; tonic: string | null } {
  if (!keyName) return { fifths: 0, vex: 'C', tonic: null };
  const k = getKey(keyName);
  if (!k) return { fifths: 0, vex: 'C', tonic: null };
  // VexFlow names a signature by its major key.
  const majorTonic = k.mode === 'major' ? k.tonic : getKey(k.relative)?.tonic ?? 'C';
  return { fifths: k.signature.fifths, vex: majorTonic, tonic: k.tonic };
}

/** A VexFlow key (`c#/5`) for a sounding pitch, written `octaveShift` octaves higher. */
export function vexKey(pitch: string, octaveShift = 0): string {
  const n = parseTheoryNote(pitch);
  const accidental = n.accidental.replace(/x/g, '##');
  return `${n.letter.toLowerCase()}${accidental}/${(n.octave ?? 4) + octaveShift}`;
}

/** Parse a time signature text; null for none or unreadable. */
export function timeOf(text: string | undefined | null): TimeSignature | null {
  if (!text) return null;
  return parseTimeSignature(text);
}

/**
 * Break measures into lines that fit a width. `widths` are the measures' natural widths; the first
 * measure of every line also carries the clef and key (`lineStart`), and the first line the time
 * signature (`firstExtra`). Greedy: a line takes measures while they fit; a measure wider than the
 * whole width gets a line of its own.
 */
export function breakLines(widths: readonly number[], available: number, lineStart: number, firstExtra = 0): number[][] {
  const lines: number[][] = [];
  let line: number[] = [];
  let used = 0;
  widths.forEach((w, i) => {
    const extra = line.length === 0 ? lineStart + (lines.length === 0 ? firstExtra : 0) : 0;
    if (line.length > 0 && used + w > available) {
      lines.push(line);
      line = [];
      used = 0;
      used += lineStart;
    } else {
      used += extra;
    }
    line.push(i);
    used += w;
  });
  if (line.length) lines.push(line);
  return lines;
}

/**
 * Widths of the measures of one line, stretched to fill it: each measure keeps its natural share,
 * the leftover is shared in proportion. The last line is only stretched when it is already at
 * least two-thirds full (otherwise it grows by at most a third), so a few notes do not spread
 * across the page.
 */
export function stretchLine(natural: readonly number[], available: number, isLast: boolean): number[] {
  const total = natural.reduce((a, b) => a + b, 0);
  if (total <= 0) return natural.map(() => 0);
  if (total >= available) return natural.map((w) => (w / total) * available);
  // A short last line (or a short piece) breathes a little but does not spread across the page.
  if (isLast && total < available * 0.66) return natural.map((w) => w * Math.min(1.35, available / total));
  return natural.map((w) => (w / total) * available);
}
