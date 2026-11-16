/**
 * Rhythms and strumming patterns as beat grids. Pure: parsing the compact notations used in lesson
 * content, choosing a grid fine enough for every note, and the counting syllables a teacher says
 * ("1 e & a", "1 & a" in compound time, "1 trip let" for triplets).
 *
 * Rhythm codes (the lesson notation): `w h q e s` + `.` dot + `t` triplet + `r` rest, `~` before a
 * code ties it to the note before, `>` before a code accents it, `|` separates bars:
 *   'q q e e q'      'h q qr | e e e e h'      '>q e e >q q'      'et et et q h'
 * Strumming: one slot per character, `D` down, `U` up, `X` muted, `-` (or `.`) a missed stroke, a
 * `>` after a slot accents it, spaces ignored, `|` between bars: 'D-DU-UDU', 'D>-DU X>UDU'.
 * The app's strumming library format (`s a x -`: strum, accent, mute, ghost) is read too.
 */
import { durationTicks, parseTimeSignature, PPQ, type NoteValueId, type TimeSignature } from '@/core/theory';

/** One note or rest of a rhythm. */
export interface RhythmNote {
  value: NoteValueId;
  dots: number;
  triplet: boolean;
  rest: boolean;
  /** Sounds on from the note before (no new attack). */
  tied: boolean;
  accent: boolean;
  ticks: number;
  /** Ticks from the start of the rhythm. */
  start: number;
}

const VALUE_CODES: Record<string, NoteValueId> = { w: 'whole', h: 'half', q: 'quarter', e: 'eighth', s: 'sixteenth' };

/** Parse a rhythm in the compact notation. Unreadable codes are reported and skipped. */
export function parseRhythm(text: string): { notes: RhythmNote[]; errors: string[] } {
  const notes: RhythmNote[] = [];
  const errors: string[] = [];
  let at = 0;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (token === '|') continue;
    const m = /^(>?)(~?)(>?)([whqes])(\.{0,2})(t?)(r?)$/.exec(token);
    if (!m) {
      errors.push(`Cannot read the rhythm code "${token}". Use w h q e s, with . for a dot, t for a triplet, r for a rest.`);
      continue;
    }
    const value = VALUE_CODES[m[4]];
    const dots = m[5].length;
    const triplet = m[6] === 't';
    const rest = m[7] === 'r';
    const ticks = durationTicks(value, { dots: dots || undefined, tuplet: triplet ? 3 : undefined });
    // A tie needs a sounding note before it: after a rest (or at the start) it means nothing.
    const prev = notes[notes.length - 1];
    const tied = m[2] === '~' && !rest && !!prev && !prev.rest;
    notes.push({ value, dots, triplet, rest, tied, accent: (m[1] === '>' || m[3] === '>') && !rest, ticks, start: at });
    at += ticks;
  }
  return { notes, errors };
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * The grid step (ticks) that every note start and every beat fall on: at least two steps per
 * beat (so there is an "&" to count), no finer than a sixteenth triplet.
 */
export function gridStep(notes: readonly Pick<RhythmNote, 'start' | 'ticks'>[], time: TimeSignature): number {
  const beat = time.beatTicks[0] ?? PPQ;
  let step = time.kind === 'simple' ? beat : time.unitTicks;
  for (const n of notes) step = gcd(step, gcd(n.start, n.ticks) || step);
  // A grid of whole beats has nothing to count between them: show the "&".
  if (time.kind === 'simple' && step >= beat && beat >= PPQ) step = beat / 2;
  return Math.max(PPQ / 6, step);
}

/**
 * The counting syllable of every grid step in a bar. Beats are numbered; the steps between are
 * `&` for halves, `e & a` for quarters of a beat, `& a` in compound time, `trip let` for
 * triplets (with `triplets`); odd meters written in eighths count every eighth. A beat cut in six
 * keeps every name where it belongs: in simple time `1 ta trip & let ta` (an eighth's `&` stays
 * `&` beside triplets), in a compound beat `1 ta & ta a ta`.
 */
export function countSyllables(time: TimeSignature, stepTicks: number, opts: { triplets?: boolean } = {}): string[] {
  const steps = Math.max(1, Math.round(time.barTicks / stepTicks));
  const out: string[] = [];
  if (time.kind === 'odd' && time.denominator === 8 && stepTicks === time.unitTicks) {
    for (let i = 0; i < steps; i++) out.push(String(i + 1));
    return out;
  }
  let tick = 0;
  let beatIndex = 0;
  const beatStarts: number[] = [];
  for (const b of time.beatTicks) {
    beatStarts.push(tick);
    tick += b;
  }
  for (let i = 0; i < steps; i++) {
    const t = i * stepTicks;
    while (beatIndex + 1 < beatStarts.length && t >= beatStarts[beatIndex + 1]) beatIndex++;
    const beatLen = time.beatTicks[beatIndex] ?? time.beatTicks[0];
    const inBeat = t - beatStarts[beatIndex];
    const per = Math.max(1, Math.round(beatLen / stepTicks));
    const k = Math.round(inBeat / stepTicks);
    if (k === 0) {
      out.push(String(beatIndex + 1));
      continue;
    }
    // A beat of three eighths (compound time, the long beat of an odd meter) counts "& a"; a beat of two counts triplets as "trip let".
    const compoundBeat = Math.round(beatLen / (PPQ / 2)) === 3 && beatLen % (PPQ / 2) === 0;
    out.push(subSyllable(per, k, compoundBeat ? 'compound' : opts.triplets ? 'triplet' : 'simple'));
  }
  return out;
}

function subSyllable(per: number, k: number, beat: 'simple' | 'triplet' | 'compound' = 'simple'): string {
  if (per === 2) return '&';
  if (per === 3) return beat === 'triplet' ? (['', 'trip', 'let'][k] ?? '') : (['', '&', 'a'][k] ?? '');
  if (per === 4) return ['', 'e', '&', 'a'][k] ?? '';
  // Six to a beat: in a compound beat the sixteenths between "& a"; in a simple beat the eighth's
  // "&" in the middle and the triplet's "trip let" at the thirds.
  if (per === 6) return (beat === 'compound' ? ['', 'ta', '&', 'ta', 'a', 'ta'] : ['', 'ta', 'trip', '&', 'let', 'ta'])[k] ?? '';
  return '·';
}

/** Triplet counting for a grid of three steps to the beat: "1 trip let" instead of "1 & a". */
export function tripletSyllables(syllables: readonly string[]): string[] {
  return syllables.map((s) => (s === '&' ? 'trip' : s === 'a' ? 'let' : s));
}

/** One step of a rhythm grid. */
export interface RhythmCell {
  step: number;
  bar: number;
  /** Step number inside its bar. */
  inBar: number;
  syllable: string;
  /** True on a beat. */
  beat: boolean;
  /** Index of the note that starts here, or null. */
  onset: number | null;
  /** Index of the note sounding (or resting) through this step, or null past the end. */
  note: number | null;
}

/** A rhythm laid out on a grid. */
export interface RhythmGrid {
  time: TimeSignature;
  stepTicks: number;
  stepsPerBar: number;
  bars: number;
  cells: RhythmCell[];
  notes: RhythmNote[];
}

/** Lay notes out on a grid in a time signature (default 4/4). The last bar is filled out with empty steps. */
export function rhythmGrid(notes: readonly RhythmNote[], timeText = '4/4'): RhythmGrid {
  const time = parseTimeSignature(timeText) ?? parseTimeSignature('4/4')!;
  const stepTicks = gridStep(notes, time);
  const stepsPerBar = Math.max(1, Math.round(time.barTicks / stepTicks));
  const total = notes.reduce((s, n) => Math.max(s, n.start + n.ticks), 0);
  const bars = Math.max(1, Math.ceil(total / time.barTicks - 1e-9));
  const triplets = notes.some((n) => n.triplet) && time.kind !== 'compound';
  const syllables = countSyllables(time, stepTicks, { triplets });
  const cells: RhythmCell[] = [];
  let ni = 0;
  for (let step = 0; step < bars * stepsPerBar; step++) {
    const t = step * stepTicks;
    while (ni < notes.length && notes[ni].start + notes[ni].ticks <= t + 1e-6) ni++;
    const n = notes[ni];
    const sounding = n && n.start <= t + 1e-6 ? ni : null;
    const inBar = step % stepsPerBar;
    cells.push({
      step,
      bar: Math.floor(step / stepsPerBar),
      inBar,
      syllable: syllables[inBar] ?? '',
      beat: /^\d+$/.test(syllables[inBar] ?? ''),
      onset: n && Math.abs(n.start - t) < 1e-6 ? ni : null,
      note: sounding,
    });
  }
  return { time, stepTicks, stepsPerBar, bars, cells, notes: [...notes] };
}

/** The step a tick position falls in (for a moving highlight); null before the start or past the end. */
export function stepAt(grid: Pick<RhythmGrid, 'stepTicks' | 'cells'>, tick: number): number | null {
  if (tick < 0) return null;
  const step = Math.floor(tick / grid.stepTicks + 1e-9);
  return step < grid.cells.length ? step : null;
}

// ── Strumming ────────────────────────────────────────────────────────────────────────────────────

/** What the strumming hand does in one slot. `ghost`: it passes the strings without hitting them. */
export type StrokeKind = 'strum' | 'accent' | 'mute' | 'ghost';

/** One slot of a strumming pattern. */
export interface StrumStep {
  dir: 'down' | 'up';
  kind: StrokeKind;
}

/**
 * Parse a strumming pattern (see the module comment). Directions of `X`, `-` and the library
 * format come from where the slot sits: the hand goes down on even slots and up on odd ones.
 */
export function parseStrum(text: string): { steps: StrumStep[]; bars: number[]; errors: string[] } {
  const steps: StrumStep[] = [];
  const bars: number[] = [];
  const errors: string[] = [];
  const clean = text.replace(/\s+/g, '');
  const library = /^[saSAx\-|]+$/.test(clean) && /[saSA]/.test(clean);
  for (const ch of clean) {
    const parity: 'down' | 'up' = steps.length % 2 === 0 ? 'down' : 'up';
    if (ch === '|') {
      if (steps.length && bars[bars.length - 1] !== steps.length) bars.push(steps.length);
      continue;
    }
    if (ch === '>') {
      const last = steps[steps.length - 1];
      if (last && last.kind === 'strum') last.kind = 'accent';
      else if (last && last.kind === 'mute') last.kind = 'mute';
      else errors.push('An accent mark (>) must follow a stroke.');
      continue;
    }
    if (library) {
      const kind: StrokeKind | undefined = { s: 'strum', a: 'accent', x: 'mute', '-': 'ghost' }[ch.toLowerCase()] as StrokeKind | undefined;
      if (kind) steps.push({ dir: parity, kind });
      else errors.push(`Unknown strum slot "${ch}".`);
      continue;
    }
    switch (ch) {
      case 'D':
      case 'd':
        steps.push({ dir: 'down', kind: 'strum' });
        break;
      case 'U':
      case 'u':
        steps.push({ dir: 'up', kind: 'strum' });
        break;
      case 'X':
      case 'x':
        steps.push({ dir: parity, kind: 'mute' });
        break;
      case '-':
      case '.':
        steps.push({ dir: parity, kind: 'ghost' });
        break;
      default:
        errors.push(`Unknown strum slot "${ch}". Use D, U, X, - and > for an accent.`);
    }
  }
  return { steps, bars, errors };
}

/** The grid a strumming pattern sits on, from its slots per beat. */
export type StrumGridKind = 'eighth' | 'sixteenth' | 'triplet';

/**
 * Slots per beat for a pattern: given, or worked out from the slot count of one bar (8 in 4/4 is
 * eighths, 16 sixteenths, 12 triplets; compound meters count their eighths).
 */
export function strumSlotsPerBeat(slotsPerBar: number, time: TimeSignature, grid?: StrumGridKind): number {
  if (grid === 'eighth') return time.kind === 'compound' ? 3 : 2;
  if (grid === 'sixteenth') return time.kind === 'compound' ? 6 : 4;
  if (grid === 'triplet') return 3;
  const per = slotsPerBar / time.beats;
  return Number.isInteger(per) && per >= 1 ? per : 2;
}

/** Counting syllables for strum slots: the beat number, then `&`, `e & a` or `trip let`. */
export function strumSyllables(count: number, time: TimeSignature, perBeat: number, triplet = false): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const beat = Math.floor(i / perBeat) % time.beats;
    const k = i % perBeat;
    if (k === 0) out.push(String(beat + 1));
    else if (perBeat === 3) out.push(triplet ? ['', 'trip', 'let'][k] : ['', '&', 'a'][k]);
    else out.push(subSyllable(perBeat, k, time.kind === 'compound' ? 'compound' : 'simple'));
  }
  return out;
}
