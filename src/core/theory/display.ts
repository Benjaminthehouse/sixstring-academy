/**
 * Display text for whole scales, chords and keys. `formatNote` and `formatChord` handle one name;
 * these apply the same options (the reader's naming system: letters, solfège or German; music
 * symbols or ASCII) to the things screens actually show: a scale's title and notes, a chord's
 * tones, a key name, a row of chord symbols.
 */
import { chord, chordNotes, formatChord, isNoChord, NO_CHORD, type Chord, type FormatChordOptions } from './chord';
import { key, type KeyInput } from './key';
import { formatDegree, formatNote, formatNotes, note, prettyAccidentals, type FormatNoteOptions } from './note';
import { getScale, scaleNotes, type ScaleType } from './scale';

function requireScale(scale: string | ScaleType): ScaleType {
  const found = getScale(scale);
  if (!found) throw new RangeError(`Unknown scale: "${String(scale)}"`);
  return found;
}

/** Title of a scale on a tonic: (`F#`, `dorian`) -> `F♯ Dorian`; (`Bb`, `lydian-sharp-2`) -> `B♭ Lydian ♯2`. */
export function formatScaleName(tonic: string, scale: string | ScaleType = 'major', opts: FormatNoteOptions = {}): string {
  const type = requireScale(scale);
  const name = opts.ascii ? type.name : prettyAccidentals(type.name, opts);
  return `${formatNote(note(tonic).pcName, { ...opts, natural: false })} ${name}`;
}

/** The notes of a scale as display text: (`F#`, `major`) -> `F♯ G♯ A♯ B C♯ D♯ E♯`, or `Fa♯ Sol♯ …` in solfège. */
export function formatScaleNotes(tonic: string, scale: string | ScaleType = 'major', opts: FormatNoteOptions & { closed?: boolean } = {}): string[] {
  return formatNotes(scaleNotes(tonic, requireScale(scale), { closed: opts.closed }), opts);
}

/** The degree labels of a scale as display text: `1 2 ♭3 4 5 6 ♭7`. */
export function formatScaleDegrees(scale: string | ScaleType, opts: Pick<FormatNoteOptions, 'ascii' | 'doubles'> = {}): string[] {
  return requireScale(scale).degrees.map((d) => formatDegree(d, opts));
}

/** The tones of a chord as display text: `Bbm7b5` -> `B♭ D♭ F♭ A♭`; `withBass` puts a slash bass first. */
export function formatChordNotes(input: string | Chord, opts: FormatNoteOptions & { withBass?: boolean } = {}): string[] {
  return formatNotes(chordNotes(input, { withBass: opts.withBass }), opts);
}

/** The degree labels of a chord as display text: `C7#9` -> `1 3 5 ♭7 ♯9`. */
export function formatChordDegrees(input: string | Chord, opts: Pick<FormatNoteOptions, 'ascii' | 'doubles'> = {}): string[] {
  return chord(input).type.degrees.map((d) => formatDegree(d, opts));
}

/** Options for `formatKey`. */
export interface FormatKeyOptions extends FormatNoteOptions {
  /** Chord-style short form: `B♭m` instead of `B♭ minor`. */
  short?: boolean;
}

/**
 * Display name of a key: `Bb minor` -> `B♭ minor`, short `B♭m`. Follows the naming system:
 * solfège `Si♭ minor`; German writes B flat as `B` and B natural as `H` (`H minor`).
 */
export function formatKey(input: KeyInput, opts: FormatKeyOptions = {}): string {
  const k = key(input);
  const tonic = formatNote(k.tonic, { ...opts, natural: false, octave: false });
  if (opts.short) return k.mode === 'minor' ? `${tonic}m` : tonic;
  return `${tonic} ${k.mode}`;
}

/** The accidentals of a key signature as display text: A major -> `F♯ C♯ G♯`. */
export function formatKeySignature(input: KeyInput, opts: FormatNoteOptions = {}): string[] {
  return formatNotes(key(input).signature.accidentals, opts);
}

/**
 * A row of chord symbols as display text. Unlike `formatChord` it never throws: `N.C.` stays
 * `N.C.` and text that is not a chord is passed through unchanged, as a chart would show it.
 */
export function formatChords(symbols: ReadonlyArray<string | Chord>, opts: FormatChordOptions = {}): string[] {
  return symbols.map((symbol) => {
    if (typeof symbol !== 'string') return formatChord(symbol, opts);
    if (isNoChord(symbol)) return NO_CHORD;
    try {
      return formatChord(symbol, opts);
    } catch {
      return symbol;
    }
  });
}
