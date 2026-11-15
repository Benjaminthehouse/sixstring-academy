/**
 * What the tuner aims at: one target per string of the chosen tuning, shifted by the capo and
 * scaled by the reference pitch, plus the words used to point a learner at a string.
 */
import { midiToFreq } from '@/core/math/pitch-math';
import type { Tuning } from '@/core/guitar';
import { formatNote, midiToNote, parseNote } from '@/core/theory';

/** Highest capo position offered. */
export const MAX_CAPO = 12;
/** Range of the reference pitch in Hz. */
export const A4_MIN = 415;
export const A4_MAX = 466;
export const A4_DEFAULT = 440;
/** Reference pitches offered as one-tap presets. */
export const A4_PRESETS: readonly number[] = [432, 440, 442];

/** One string as the tuner sees it. */
export interface StringTarget {
  /** Index in the tuning's arrays: 0 is the highest-numbered string (the thickest on a guitar). */
  index: number;
  /** String number the way players count: 1 = thinnest. */
  string: number;
  /** Sounding MIDI note to tune to, capo included. */
  midi: number;
  /** The open string without a capo. */
  openMidi: number;
  /** ASCII note name with octave, e.g. `E2`, `Eb2`, `F#2`. */
  note: string;
  /** Target frequency in Hz at the chosen reference pitch. */
  freq: number;
  /** 0 (thinnest) to 1 (thickest): how heavy to draw the string. */
  gauge: number;
  /** Drawn as a wound string. */
  wound: boolean;
}

/** Options for {@link buildTargets}. */
export interface TargetOptions {
  /** Fret the capo sits on, 0 = none. */
  capo?: number;
  /** Reference pitch of A4 in Hz. */
  a4?: number;
}

/** Keep a capo setting inside 0..12 whole frets. */
export function clampCapo(capo: number | undefined): number {
  if (!Number.isFinite(capo)) return 0;
  return Math.min(MAX_CAPO, Math.max(0, Math.round(capo as number)));
}

/** Keep a reference pitch inside 415..466 Hz (one decimal). */
export function clampA4(a4: number | undefined): number {
  if (!Number.isFinite(a4)) return A4_DEFAULT;
  return Math.round(Math.min(A4_MAX, Math.max(A4_MIN, a4 as number)) * 10) / 10;
}

/** True when a tuning spells its strings with flats (E flat standard), so shifted notes follow suit. */
function prefersFlats(tuning: Tuning): boolean {
  let flats = 0;
  let sharps = 0;
  for (const n of tuning.notes) {
    const alt = parseNote(n)?.alt ?? 0;
    if (alt < 0) flats++;
    else if (alt > 0) sharps++;
  }
  return flats > sharps;
}

/** The tuner's targets for a tuning, low string first, with the capo and reference pitch applied. */
export function buildTargets(tuning: Tuning, opts: TargetOptions = {}): StringTarget[] {
  const capo = clampCapo(opts.capo);
  const a4 = clampA4(opts.a4);
  const flats = prefersFlats(tuning);
  const lowest = Math.min(...tuning.midi);
  const highest = Math.max(...tuning.midi);
  const span = Math.max(1, highest - lowest);
  return tuning.midi.map((openMidi, index) => {
    const midi = openMidi + capo;
    return {
      index,
      string: tuning.stringCount - index,
      midi,
      openMidi,
      note: capo === 0 ? tuning.notes[index] : midiToNote(midi, { prefer: flats ? 'flats' : 'sharps' }),
      freq: midiToFreq(midi, a4),
      gauge: (highest - openMidi) / span,
      // Steel sets wind everything below roughly G3; nylon and bass differ, but as a drawing this reads right.
      wound: openMidi < 55,
    };
  });
}

/** How note names are shown (the learner's setting). */
export type NoteNaming = 'letters' | 'solfege' | 'german';

/** A note name split for display: the letter, its accidental sign and the octave digit. */
export interface NoteParts {
  letter: string;
  accidental: string;
  octave: string;
  /** The whole name as one string for labels and screen readers: `E♭2`. */
  text: string;
  /** The name without its octave: `E♭`. */
  short: string;
}

/** Split an ASCII note name (`Eb2`) into the pieces the big readout draws at different sizes. */
export function noteParts(note: string, naming: NoteNaming = 'letters'): NoteParts {
  const parsed = parseNote(note);
  if (!parsed) return { letter: note, accidental: '', octave: '', text: note, short: note };
  const short = formatNote(parsed.pcName, { system: naming, octave: false });
  const bare = formatNote(parsed.letter, { system: naming, octave: false });
  // German B flat is written "B" and B natural "H": the formatter has already folded the sign in.
  const accidental = short.startsWith(bare) ? short.slice(bare.length) : '';
  const letter = accidental ? bare : short;
  const octave = parsed.octave === null ? '' : String(parsed.octave);
  return { letter, accidental, octave, text: `${short}${octave}`, short };
}

/** `1st`, `2nd`, `3rd`, `4th` … */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const unit = n % 10;
  return `${n}${unit === 1 ? 'st' : unit === 2 ? 'nd' : unit === 3 ? 'rd' : 'th'}`;
}

/** Words that point at one string. */
export interface StringWords {
  /** `thickest string`, `5th string`, `thinnest string`. */
  name: string;
  /** `Pluck the thickest string`. */
  pluck: string;
  /** Where to find it, for someone who does not know string numbers yet. */
  where: string;
}

/**
 * Plain words for a string. On a re-entrant instrument (ukulele, Nashville) the highest-numbered
 * string is not the thickest, so those are named by number and by where they sit.
 */
export function stringWords(index: number, count: number, reentrant = false): StringWords {
  const number = count - index;
  const first = index === 0;
  const last = index === count - 1;
  let name: string;
  let where: string;
  if (reentrant) {
    name = `${ordinal(number)} string`;
    where = first ? 'the one nearest your chin' : last ? 'the one nearest the floor' : `count ${number} up from the floor`;
  } else if (first) {
    name = 'thickest string';
    where = `string ${number}, the one nearest your chin`;
  } else if (last) {
    name = 'thinnest string';
    where = `string ${number}, the one nearest the floor`;
  } else {
    name = `${ordinal(number)} string`;
    where = index === 1 ? 'the one next to the thickest' : index === count - 2 ? 'the one next to the thinnest' : `count ${number} from the thinnest`;
  }
  return { name, pluck: `Pluck the ${name}`, where };
}

/** Pitch range the microphone pipeline should track for a set of targets. */
export interface TrackerRange {
  minFreq: number;
  maxFreq: number;
}

/**
 * How low the detector has to listen: a fourth below the lowest target (a slack string still has
 * to be heard), never above the default 60 Hz and never below 23 Hz (a five-string bass's low B).
 */
export function trackerRange(targets: readonly StringTarget[]): TrackerRange {
  const lowest = targets.length ? Math.min(...targets.map((t) => t.freq)) : 82.4;
  const highest = targets.length ? Math.max(...targets.map((t) => t.freq)) : 330;
  const minFreq = Math.round(Math.min(60, Math.max(23, lowest * Math.pow(2, -5 / 12))) * 10) / 10;
  // The default ceiling covers every fretted note; only an unusually high custom tuning lifts it.
  const maxFreq = Math.max(1760, Math.round(highest * 2.5));
  return { minFreq, maxFreq };
}

/** `E A D G B E` for a row of targets, in the learner's note naming. */
export function targetsLabel(targets: readonly StringTarget[], naming: NoteNaming = 'letters'): string {
  return targets.map((t) => noteParts(t.note, naming).short).join(' ');
}
