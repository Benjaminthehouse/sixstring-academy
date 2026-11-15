/**
 * The tuning picker's data: the catalog grouped the way a player looks for a tuning, search,
 * the learner's own saved tunings, and "how do I get there from standard" in plain words.
 */
import { TUNINGS, STANDARD_TUNING, getTuning, identifyTuning, retuneSteps, tuningFromMidi, type Instrument, type Tuning } from '@/core/guitar';
import { noteParts, type NoteNaming } from './targets';

/** A custom tuning the learner saved, kept in the screen's own storage. */
export interface SavedTuning {
  id: string;
  name: string;
  /** Open strings as MIDI numbers, low string first. */
  midi: number[];
  instrument: Instrument;
}

/** One titled block of the picker. */
export interface TuningGroup {
  id: string;
  title: string;
  /** A short line under the title, where the group needs explaining. */
  hint?: string;
  tunings: Tuning[];
}

const GROUP_ORDER: ReadonlyArray<{ id: string; title: string; hint?: string; match: (t: Tuning) => boolean }> = [
  { id: 'standard', title: 'Standard', match: (t) => t.instrument === 'guitar' && t.category === 'standard' },
  { id: 'lowered', title: 'Tuned down', hint: 'Every string lower by the same amount. Chord shapes stay the same.', match: (t) => t.instrument === 'guitar' && t.category === 'lowered' },
  { id: 'drop', title: 'Drop tunings', hint: 'The thickest string dropped for one-finger power chords.', match: (t) => t.instrument === 'guitar' && t.category === 'drop' },
  { id: 'open', title: 'Open and modal', hint: 'The open strings already sound a chord.', match: (t) => t.instrument === 'guitar' && (t.category === 'open' || t.category === 'modal') },
  { id: 'other', title: 'Other six-string tunings', match: (t) => t.instrument === 'guitar' && t.category === 'other' && !t.custom },
  { id: 'extended', title: 'Seven-string and baritone', match: (t) => t.instrument === 'guitar' && t.category === 'extended' },
  { id: 'bass', title: 'Bass', match: (t) => t.instrument === 'bass' && !t.custom },
  { id: 'ukulele', title: 'Ukulele', match: (t) => t.instrument === 'ukulele' && !t.custom },
];

/** Rebuild a saved tuning as a `Tuning` (also registers its id with the guitar module for this session). */
export function tuningFromSaved(saved: SavedTuning): Tuning | null {
  try {
    return tuningFromMidi(saved.midi, { name: saved.name, instrument: saved.instrument });
  } catch {
    return null;
  }
}

/** Lower-case, signs as ASCII, punctuation and spaces dropped: `D A D G A D` and `dadgad` compare equal. */
function squash(text: string): string {
  return text.toLowerCase().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[^a-z0-9#]+/g, '');
}

/** True when a tuning answers a search by name, id, its open strings (`dadgad`, `d a d g a d`), instrument or a known alias. */
export function tuningMatches(tuning: Tuning, query: string): boolean {
  const q = squash(query);
  if (!q) return true;
  if (squash(tuning.name).includes(q) || squash(tuning.id).includes(q)) return true;
  if (squash(tuning.label).includes(q) || squash(tuning.notes.join('')).includes(q)) return true;
  // A single letter would match "guitar" or "bass" by accident: ask for a real word.
  if (q.length >= 3 && squash(tuning.instrument).includes(q)) return true;
  // A known alias ("spanish", "vestapol", "uke", "eb standard") resolves through the catalog itself.
  return getTuning(query.trim())?.id === tuning.id;
}

/** True when a tuning's description speaks of every word searched for ("slide", "celtic fingerstyle"). */
export function tuningIsAbout(tuning: Tuning, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = tuning.description.toLowerCase();
  return words.length > 0 && words.every((w) => w.length >= 3 && text.includes(w));
}

/**
 * The picker's groups for a search, the learner's own tunings first. Empty groups are left out.
 * Names and notes are tried first; only when nothing is called that does the search look at what
 * the tunings are for, so "bass" lists the basses and not every guitar tuning with a deep bass.
 */
export function tuningGroups(query = '', saved: readonly SavedTuning[] = []): TuningGroup[] {
  const own = saved.map(tuningFromSaved).filter((t): t is Tuning => t !== null);
  const build = (match: (t: Tuning) => boolean): TuningGroup[] => {
    const groups: TuningGroup[] = [];
    const mine = own.filter(match);
    if (mine.length) groups.push({ id: 'yours', title: 'Your tunings', tunings: mine });
    for (const g of GROUP_ORDER) {
      const tunings = TUNINGS.filter((t) => g.match(t) && match(t));
      if (tunings.length) groups.push({ id: g.id, title: g.title, hint: g.hint, tunings });
    }
    return groups;
  };
  const named = build((t) => tuningMatches(t, query));
  return named.length > 0 ? named : build((t) => tuningIsAbout(t, query));
}

/** The tuning a stored id names: a catalog tuning, one of the learner's own, or standard when it is unknown. */
export function resolveTuning(id: string | null | undefined, saved: readonly SavedTuning[] = []): Tuning {
  if (id) {
    const mine = saved.find((s) => s.id === id);
    if (mine) {
      const built = tuningFromSaved(mine);
      if (built) return built;
    }
    const known = getTuning(id);
    if (known) return known;
  }
  return STANDARD_TUNING;
}

/** Lowest and highest note a custom string may be set to (B0 .. C6): the range a pitch tracker and a string can take. */
export const CUSTOM_MIDI_MIN = 23;
export const CUSTOM_MIDI_MAX = 84;
export const CUSTOM_MIN_STRINGS = 3;
export const CUSTOM_MAX_STRINGS = 8;

/** Result of saving the editor's strings. */
export interface CustomResult {
  tuning: Tuning;
  /** Null when the strings turned out to be a catalog tuning: nothing needs saving then. */
  saved: SavedTuning | null;
}

/**
 * Turn the editor's strings into a tuning. When they equal a catalog tuning that one is returned
 * (so "my" DADGAD is simply DADGAD); otherwise a saveable custom tuning is built.
 */
export function makeCustomTuning(midi: readonly number[], name: string, instrument: Instrument): CustomResult | null {
  if (midi.length < CUSTOM_MIN_STRINGS || midi.length > CUSTOM_MAX_STRINGS) return null;
  const clean = midi.map((m) => Math.min(CUSTOM_MIDI_MAX, Math.max(CUSTOM_MIDI_MIN, Math.round(m))));
  const known = identifyTuning(clean);
  if (known) return { tuning: known, saved: null };
  try {
    const trimmed = name.trim().slice(0, 40);
    const tuning = tuningFromMidi(clean, trimmed ? { name: trimmed, instrument } : { instrument });
    return { tuning, saved: { id: tuning.id, name: tuning.name, midi: clean, instrument } };
  } catch {
    return null;
  }
}

/** Strings a new custom tuning starts from when the string count changes: keep what is there, extend by fourths. */
export function resizeStrings(midi: readonly number[], count: number): number[] {
  const n = Math.min(CUSTOM_MAX_STRINGS, Math.max(CUSTOM_MIN_STRINGS, Math.round(count)));
  const out = [...midi];
  // Strings are added and removed at the low end, the way a seven-string adds a low B.
  while (out.length < n) out.unshift(Math.max(CUSTOM_MIDI_MIN, out[0] - 5));
  while (out.length > n) out.shift();
  return out;
}

/** The everyday tuning an alternate tuning is reached from, or null when there is none with the same strings. */
export function baseTuningFor(tuning: Tuning): Tuning | null {
  const baseId =
    tuning.instrument === 'guitar' ? (tuning.stringCount === 6 ? 'standard' : tuning.stringCount === 7 ? 'standard-7' : null)
    : tuning.instrument === 'bass' ? (tuning.stringCount === 4 ? 'bass' : tuning.stringCount === 5 ? 'bass-5' : null)
    : tuning.stringCount === 4 ? 'ukulele' : null;
  const base = baseId ? getTuning(baseId) : null;
  return base && base.stringCount === tuning.stringCount ? base : null;
}

/** One string's move, ready to show. */
export interface RetuneLine {
  string: number;
  index: number;
  from: string;
  to: string;
  semitones: number;
  /** `Lower string 6 from E to D: a whole step (2 frets lower).` */
  text: string;
}

/** How to reach a tuning from the usual one. */
export interface RetunePlan {
  /** Name of the tuning the steps start from: `Standard`. */
  from: string;
  /** Only the strings that change, thickest first. */
  lines: RetuneLine[];
  /** True when any string goes up: worth a word of caution. */
  raises: boolean;
  /** Total number of strings. */
  strings: number;
}

/** `a half step (1 fret)`, `a whole step (2 frets)`, `an octave (12 frets)`. */
export function stepWords(semitones: number): string {
  const n = Math.abs(Math.round(semitones));
  const frets = `${n} ${n === 1 ? 'fret' : 'frets'}`;
  if (n === 1) return `a half step (${frets})`;
  if (n === 2) return `a whole step (${frets})`;
  if (n === 12) return `an octave (${frets})`;
  return `${n} half steps (${frets})`;
}

/**
 * The strings to change to get from the instrument's usual tuning to this one, or null when the
 * tuning is the usual one, has a different number of strings, or (Nashville) needs other strings.
 */
export function retunePlan(tuning: Tuning, naming: NoteNaming = 'letters'): RetunePlan | null {
  const base = baseTuningFor(tuning);
  if (!base || base.id === tuning.id) return null;
  let steps;
  try {
    steps = retuneSteps(tuning, base);
  } catch {
    return null;
  }
  // More than an octave is a different set of strings, not a turn of the peg.
  if (steps.some((s) => Math.abs(s.semitones) > 7)) return null;
  const lines = steps
    .filter((s) => s.semitones !== 0)
    .map((s): RetuneLine => {
      const from = noteParts(s.from, naming).short;
      const to = noteParts(s.to, naming).short;
      const verb = s.semitones < 0 ? 'Lower' : 'Raise';
      return { string: s.string, index: s.index, from: s.from, to: s.to, semitones: s.semitones, text: `${verb} string ${s.string} from ${from} to ${to}: ${stepWords(s.semitones)}.` };
    });
  if (lines.length === 0) return null;
  return { from: base.name, lines, raises: lines.some((l) => l.semitones > 0), strings: tuning.stringCount };
}
