/**
 * Notes and spelling: parsing, formatting, MIDI conversion and enharmonics.
 *
 * A note name is plain ASCII in data: a letter A–G, any number of `#` or `b`, and an optional
 * scientific octave (`C`, `F#`, `Bb3`, `F##4`, `Cb`). Everything here is spelling-aware: `E#` and
 * `F` are different notes with the same pitch class. Display strings (♯ ♭ 𝄪 𝄫, solfège, German
 * names) are produced by `formatNote` only; never store them.
 *
 * Spelling is driven by the line of fifths (… Bb F C G D A E B F# C# …, C = 0): a key or scale is
 * a window on that line, which is what lets every spelling here be derived instead of typed.
 */
import { octaveOf, pitchClass } from '@/core/math/pitch-math';

/** The seven note letters in staff order starting from C. */
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
/** A natural note letter. */
export type Letter = (typeof LETTERS)[number];
/** How note names are written for the reader. */
export type NoteNaming = 'letters' | 'solfege' | 'german';
/** Which accidental to use when a pitch has no spelling context. */
export type AccidentalPreference = 'sharps' | 'flats' | 'auto';

/** Semitones above C of the seven natural notes C D E F G A B (also the major scale). */
export const NATURAL_SEMITONES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
const LETTER_SEMITONES = NATURAL_SEMITONES;
/** Line-of-fifths position of each natural letter (C D E F G A B): F is -1, C 0, G 1 … B 5. */
const LETTER_FIFTHS = LETTER_SEMITONES.map((semis) => {
  const position = (semis * 7) % 12;
  return position > 5 ? position - 12 : position;
});
/** Letter step for each of the seven naturals in fifths order F C G D A E B. */
const FIFTHS_ORDER_STEPS = Array.from({ length: 7 }, (_unused, i) => LETTER_FIFTHS.indexOf(i - 1));
const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
// Four covers every note a doubly diminished or augmented interval can reach from a single accidental.
const MAX_ALTERATION = 4;

/** The sharp sign, U+266F. */
export const SHARP = '♯';
/** The flat sign, U+266D. */
export const FLAT = '♭';
/** The natural sign, U+266E. */
export const NATURAL = '♮';
/** The double-sharp sign, U+1D12A. */
export const DOUBLE_SHARP = '𝄪';
/** The double-flat sign, U+1D12B. */
export const DOUBLE_FLAT = '𝄫';

/** A parsed, spelled note. */
export interface Note {
  /** Canonical ASCII name, with the octave when one was given: `F##4`, `Bb`. */
  name: string;
  /** Canonical name without the octave: `F##`. */
  pcName: string;
  letter: Letter;
  /** Letter index, C = 0 … B = 6. */
  step: number;
  /** Alteration in semitones: -2 = double flat … +2 = double sharp. */
  alt: number;
  /** ASCII accidental text: `''`, `#`, `bb` … */
  accidental: string;
  /** Scientific octave (C4 = middle C), or null for a bare pitch class. */
  octave: number | null;
  /** Pitch class 0–11 with C = 0. */
  chroma: number;
  /** MIDI number (C4 = 60), or null when there is no octave. */
  midi: number | null;
  /** Position on the line of fifths (C = 0, G = 1, F = -1, F# = 6, Bb = -2). */
  fifths: number;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function accidentalText(alt: number): string {
  return alt >= 0 ? '#'.repeat(alt) : 'b'.repeat(-alt);
}

/** Build a canonical note name from a letter step (C = 0), an alteration and an optional octave. */
export function noteName(step: number, alt: number, octave: number | null = null): string {
  return `${LETTERS[mod(step, 7)]}${accidentalText(alt)}${octave === null ? '' : octave}`;
}

const NOTE_RE = /^([A-Ga-g])((?:#|b|x|♯|♭|♮|𝄪|𝄫)*)(-?\d+)?$/u;

/** Parse a note name (`C`, `f#`, `B♭3`, `Fx4`, `Cb`); null when it is not one. */
export function parseNote(input: string): Note | null {
  if (typeof input !== 'string') return null;
  const m = NOTE_RE.exec(input.trim());
  if (!m) return null;
  const step = LETTERS.indexOf(m[1].toUpperCase() as Letter);
  let alt = 0;
  let kinds = 0;
  for (const ch of m[2]) {
    if (ch === '#' || ch === SHARP) alt += 1;
    else if (ch === 'b' || ch === FLAT) alt -= 1;
    else if (ch === 'x' || ch === DOUBLE_SHARP) alt += 2;
    else if (ch === DOUBLE_FLAT) alt -= 2;
    kinds |= ch === NATURAL ? 4 : ch === 'b' || ch === FLAT || ch === DOUBLE_FLAT ? 2 : 1;
  }
  // "C#b" and "C♮#" are typing accidents, not notes: sharps, flats and naturals never mix.
  if (kinds !== 0 && kinds !== 1 && kinds !== 2 && kinds !== 4) return null;
  if (Math.abs(alt) > MAX_ALTERATION) return null;
  const octave = m[3] === undefined ? null : parseInt(m[3], 10);
  const pcName = noteName(step, alt);
  return {
    name: octave === null ? pcName : `${pcName}${octave}`,
    pcName,
    letter: LETTERS[step],
    step,
    alt,
    accidental: accidentalText(alt),
    octave,
    chroma: mod(LETTER_SEMITONES[step] + alt, 12),
    midi: octave === null ? null : (octave + 1) * 12 + LETTER_SEMITONES[step] + alt,
    fifths: LETTER_FIFTHS[step] + 7 * alt,
  };
}

/** Parse a note name, throwing a RangeError when it is invalid. Use for trusted input. */
export function note(input: string): Note {
  const n = parseNote(input);
  if (!n) throw new RangeError(`Not a note name: "${input}"`);
  return n;
}

/** True when the string is a valid note name. */
export function isNote(input: string): boolean {
  return parseNote(input) !== null;
}

/** The note name without its octave: `F#4` -> `F#`. */
export function pcName(input: string): string {
  return note(input).pcName;
}

/** Pitch class 0–11 of a note name or MIDI number. */
export function chroma(input: string | number): number {
  return typeof input === 'number' ? pitchClass(input) : note(input).chroma;
}

/** MIDI number of a note name; names without an octave use `defaultOctave`. */
export function noteToMidi(input: string, defaultOctave = 4): number {
  const n = note(input);
  if (n.midi !== null) return n.midi;
  return (defaultOctave + 1) * 12 + LETTER_SEMITONES[n.step] + n.alt;
}

/** The spelled note at a line-of-fifths position (0 = C, 1 = G, -1 = F, 6 = F#, -2 = Bb). */
export function noteFromFifths(fifths: number): string {
  const index = mod(fifths + 1, 7);
  const alt = Math.floor((fifths + 1) / 7);
  return noteName(FIFTHS_ORDER_STEPS[index], alt);
}

/** Line-of-fifths position of a note name. */
export function fifthsOf(input: string): number {
  return note(input).fifths;
}

/**
 * Spell a pitch class inside the twelve-note window of the line of fifths centred on `center`
 * (five steps flatward, six sharpward). With the tonic as centre this is the harmonic chromatic
 * scale `1 b2 2 b3 3 4 #4 5 b6 6 b7 7`, the conventional spelling of every note against a tonic.
 */
export function spellPc(pc: number, center = 0): string {
  const target = mod(Math.round(pc), 12);
  for (let f = center - 5; f <= center + 6; f++) {
    if (mod(f * 7, 12) === target) return noteFromFifths(f);
  }
  /* c8 ignore next */
  throw new RangeError(`Cannot spell pitch class ${pc}`);
}

/**
 * Context-free name of a pitch class. `sharps`: C C# D D# …; `flats`: C Db D Eb …;
 * `auto`: the most common names, C Db D Eb E F F# G Ab A Bb B.
 */
export function pcToNote(pc: number, prefer: AccidentalPreference = 'auto'): string {
  return spellPc(pc, prefer === 'sharps' ? 4 : prefer === 'flats' ? -1 : 0);
}

/** Give a spelled pitch class the octave that makes it sound at `midi`: (`B#`, 60) -> `B#3`. */
export function withOctaveFor(pcNameInput: string, midi: number): string {
  const n = note(pcNameInput);
  const rounded = Math.round(midi);
  if (n.chroma !== pitchClass(rounded)) {
    throw new RangeError(`${n.pcName} is not the pitch class of MIDI ${midi}`);
  }
  const octave = (rounded - LETTER_SEMITONES[n.step] - n.alt) / 12 - 1;
  return `${n.pcName}${octave}`;
}

/** Options for `midiToNote`. */
export interface MidiToNoteOptions {
  prefer?: AccidentalPreference;
  /** Include the octave number (default true). */
  octave?: boolean;
}

/** Context-free spelled name of a MIDI number (61 -> `Db4`). For a key context use `spellInKey`. */
export function midiToNote(midi: number, opts: MidiToNoteOptions = {}): string {
  const rounded = Math.round(midi);
  const name = pcToNote(pitchClass(rounded), opts.prefer ?? 'auto');
  return opts.octave === false ? name : `${name}${octaveOf(rounded)}`;
}

/** Other spellings of the same pitch with at most a double accidental, simplest first. */
export function enharmonics(input: string): string[] {
  const n = note(input);
  const out: Array<{ name: string; alt: number }> = [];
  for (let step = 0; step < 7; step++) {
    let alt = mod(n.chroma - LETTER_SEMITONES[step], 12);
    if (alt > 6) alt -= 12;
    if (Math.abs(alt) > 2 || (step === n.step && alt === n.alt)) continue;
    const name = noteName(step, alt);
    out.push({ name: n.midi === null ? name : withOctaveFor(name, n.midi), alt });
  }
  return out.sort((a, b) => Math.abs(a.alt) - Math.abs(b.alt) || b.alt - a.alt).map((o) => o.name);
}

/**
 * The most readable spelling of the same pitch: double accidentals and E#/B#/Cb/Fb are respelled
 * (`F##` -> `G`, `Cb4` -> `B3`); ordinary sharps and flats are kept as they are.
 */
export function simplifyNote(input: string): string {
  const n = note(input);
  const isNaturalPitch = LETTER_SEMITONES.includes(n.chroma);
  if (n.alt === 0 || (Math.abs(n.alt) === 1 && !isNaturalPitch)) return n.name;
  const name = isNaturalPitch
    ? noteName(LETTER_SEMITONES.indexOf(n.chroma), 0)
    : pcToNote(n.chroma, n.alt > 0 ? 'sharps' : 'flats');
  return n.midi === null ? name : withOctaveFor(name, n.midi);
}

/** True when two names are the same pitch class (and the same pitch, if both carry an octave). */
export function enharmonicEqual(a: string, b: string): boolean {
  const x = note(a);
  const y = note(b);
  if (x.midi !== null && y.midi !== null) return x.midi === y.midi;
  return x.chroma === y.chroma;
}

/** Options shared by the display formatters. */
export interface FormatNoteOptions {
  /** Naming system (default `letters`). German writes B natural as H and B flat as B. */
  system?: NoteNaming;
  /** Keep ASCII accidentals (`#`, `b`) instead of music symbols. */
  ascii?: boolean;
  /** Show the octave number when the note has one (default true). */
  octave?: boolean;
  /** Write an explicit ♮ on unaltered notes. */
  natural?: boolean;
  /** `repeat` writes ♯♯ / ♭♭ for fonts that lack the 𝄪 𝄫 glyphs (default `glyph`). */
  doubles?: 'glyph' | 'repeat';
}

/** Display text for an alteration: 1 -> ♯, -1 -> ♭, 2 -> 𝄪, -2 -> 𝄫, 0 -> '' (or ♮ on request). */
export function formatAccidental(alt: number, opts: FormatNoteOptions = {}): string {
  if (alt === 0) return opts.natural ? (opts.ascii ? 'n' : NATURAL) : '';
  if (opts.ascii) return accidentalText(alt);
  const single = alt > 0 ? SHARP : FLAT;
  const double = alt > 0 ? DOUBLE_SHARP : DOUBLE_FLAT;
  const count = Math.abs(alt);
  if (opts.doubles === 'repeat') return single.repeat(count);
  // Odd counts lead with the single sign, the way a triple sharp is engraved (♯𝄪).
  return (count % 2 ? single : '') + double.repeat(Math.floor(count / 2));
}

/**
 * Display name of a note: `formatNote('F#4')` -> `F♯4`; with `{ system: 'solfege' }` -> `Fa♯4`;
 * German names B natural `H` and B flat `B`.
 */
export function formatNote(input: string, opts: FormatNoteOptions = {}): string {
  const n = note(input);
  const system = opts.system ?? 'letters';
  let base: string = n.letter;
  let alt = n.alt;
  if (system === 'solfege') {
    base = SOLFEGE[n.step];
  } else if (system === 'german' && n.letter === 'B') {
    if (alt === -1) {
      base = 'B';
      alt = 0;
    } else {
      base = 'H';
    }
  }
  const showNatural = opts.natural && n.alt === 0;
  const accidental = alt === 0 && !showNatural ? '' : formatAccidental(alt, { ...opts, natural: showNatural });
  const octave = n.octave !== null && opts.octave !== false ? String(n.octave) : '';
  return `${base}${accidental}${octave}`;
}

/** Display names for a list of notes (a scale, a chord, a tuning) in the chosen naming system. */
export function formatNotes(names: readonly string[], opts: FormatNoteOptions = {}): string[] {
  return names.map((name) => formatNote(name, opts));
}

/**
 * Twelve-bit pitch-class mask of notes given as names or MIDI numbers: bit 0 = C … bit 11 = B.
 * Membership is then one AND: `mask & (1 << (midi % 12))`. Unreadable names are skipped.
 */
export function pitchClassMask(items: ReadonlyArray<string | number>): number {
  let mask = 0;
  for (const item of items) {
    if (typeof item === 'number') {
      if (Number.isFinite(item)) mask |= 1 << pitchClass(item);
    } else {
      const parsed = parseNote(item);
      if (parsed) mask |= 1 << parsed.chroma;
    }
  }
  return mask;
}

/**
 * Traditional German note name with suffixes instead of symbols: `F#` -> `Fis`, `Eb` -> `Es`,
 * `Bb` -> `B`, `B` -> `H`, `Bbb` -> `Heses`, `Ab` -> `As`.
 */
export function germanNoteName(input: string): string {
  const n = note(input);
  const base = n.letter === 'B' ? 'H' : n.letter;
  const octave = n.octave === null ? '' : String(n.octave);
  if (n.alt === 0) return `${base}${octave}`;
  if (n.alt > 0) return `${base}${'is'.repeat(n.alt)}${octave}`;
  const flats = -n.alt;
  let name: string;
  if (n.letter === 'B') name = flats === 1 ? 'B' : `H${'es'.repeat(flats)}`;
  else if (n.letter === 'E') name = `E${'s'}${'es'.repeat(flats - 1)}`;
  else if (n.letter === 'A') name = flats === 1 ? 'As' : `As${'as'.repeat(flats - 1)}`;
  else name = `${base}${'es'.repeat(flats)}`;
  return `${name}${octave}`;
}

/**
 * Turn the ASCII accidentals of degree and alteration text into music symbols: `b3` -> `♭3`,
 * `Lydian #2 #6` -> `Lydian ♯2 ♯6`, `m7b5` -> `m7♭5`. Only accidentals directly in front of a
 * digit are touched, so ordinary words are safe. Note names and chord symbols have their own
 * formatters (`formatNote`, `formatChord`).
 */
export function prettyAccidentals(text: string, opts: Pick<FormatNoteOptions, 'doubles'> = {}): string {
  return text.replace(/(^|[^A-Za-z#b])(#+|b+)(?=\d)/g, (_m, lead: string, acc: string) => {
    const alt = acc[0] === '#' ? acc.length : -acc.length;
    return `${lead}${formatAccidental(alt, opts)}`;
  });
}

/** Display text for a degree label or a row of them: `b3` -> `♭3`, `1 b3 5 bb7` -> `1 ♭3 5 𝄫7`. */
export function formatDegree(label: string, opts: Pick<FormatNoteOptions, 'ascii' | 'doubles'> = {}): string {
  return opts.ascii ? label : prettyAccidentals(label, opts);
}

/** Route-safe id for a note, matching the router's `slug()`: `F#` -> `f-sharp`, `Bb` -> `bb`. */
export function noteSlug(input: string): string {
  const n = note(input);
  const body = n.letter.toLowerCase() + (n.alt >= 0 ? '-sharp'.repeat(n.alt) : 'b'.repeat(-n.alt));
  return n.octave === null ? body : `${body}${n.octave}`;
}

/** Inverse of `noteSlug`; also accepts `b-flat` style. Null when the slug is not a note. */
export function noteFromSlug(slugText: string): string | null {
  const m = /^([a-g])((?:-sharp|-flat|b)*)(\d+)?$/.exec(slugText.trim().toLowerCase());
  if (!m) return null;
  const sharps = (m[2].match(/-sharp/g) ?? []).length;
  const rest = m[2].replace(/-sharp/g, '');
  const flats = (rest.match(/-flat|b/g) ?? []).length;
  const parsed = parseNote(`${m[1].toUpperCase()}${'#'.repeat(sharps)}${'b'.repeat(flats)}${m[3] ?? ''}`);
  return parsed ? parsed.name : null;
}
