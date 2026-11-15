/**
 * The trainer's own practice settings (fret range, strings, which notes, how "find" and "play it"
 * work). Spelling, handedness and tuning are the learner's app-wide preferences and live in the
 * progress store; these are a screen preference kept with `useLocalState`.
 */
import type { NoteSet, Scope, Spelling } from './types';

/** Practice settings of the free drills. */
export interface TrainerSettings {
  v: 1;
  /** First and last fret practised, inclusive. */
  frets: [number, number];
  strings: number[];
  notes: Exclude<NoteSet, 'accidentals'>;
  /** "Find the note": on a named string, or anywhere in the range. */
  findWhere: 'string' | 'anywhere';
  /** "Play it": the exact pitch of that place, or the note in any octave. */
  playOctaves: 'exact' | 'any';
}

/** Storage key (platform storage, through `useLocalState`). */
export const SETTINGS_KEY = 'fretboard.settings';

/** Defaults: the first twelve frets, every string, natural notes. */
export function defaultSettings(stringCount = 6): TrainerSettings {
  return { v: 1, frets: [0, 12], strings: Array.from({ length: stringCount }, (_, i) => i + 1), notes: 'naturals', findWhere: 'string', playOctaves: 'exact' };
}

/** Make stored settings safe: clamp the range to the neck, keep at least one string. */
export function cleanSettings(raw: unknown, stringCount = 6, maxFret = 24): TrainerSettings {
  const d = defaultSettings(stringCount);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<TrainerSettings>;
  let [a, b] = Array.isArray(r.frets) && r.frets.length === 2 ? r.frets.map((x) => Math.round(Number(x))) : d.frets;
  if (!Number.isFinite(a)) a = d.frets[0];
  if (!Number.isFinite(b)) b = d.frets[1];
  a = Math.max(0, Math.min(maxFret, a));
  b = Math.max(0, Math.min(maxFret, b));
  if (a > b) [a, b] = [b, a];
  const strings = Array.isArray(r.strings) ? [...new Set(r.strings.map((s) => Math.round(Number(s))).filter((s) => s >= 1 && s <= stringCount))].sort((x, y) => x - y) : d.strings;
  return {
    v: 1,
    frets: [a, b],
    strings: strings.length ? strings : d.strings,
    notes: r.notes === 'all' ? 'all' : 'naturals',
    findWhere: r.findWhere === 'anywhere' ? 'anywhere' : 'string',
    playOctaves: r.playOctaves === 'any' ? 'any' : 'exact',
  };
}

/** The scope the free drills practise. */
export function settingsScope(s: TrainerSettings): Scope {
  return { strings: [...s.strings], frets: [s.frets[0], s.frets[1]], notes: s.notes };
}

/** The app-wide accidental preference as the trainer's spelling (`auto` asks both names). */
export function spellingFromPref(pref: 'auto' | 'sharps' | 'flats'): Spelling {
  return pref === 'sharps' ? 'sharps' : pref === 'flats' ? 'flats' : 'both';
}

/** The preference to store for a spelling. */
export function prefFromSpelling(s: Spelling): 'auto' | 'sharps' | 'flats' {
  return s === 'both' ? 'auto' : s;
}

/** Quick fret ranges offered as chips. */
export function fretPresets(maxFret: number): Array<{ id: string; label: string; frets: [number, number] }> {
  const out: Array<{ id: string; label: string; frets: [number, number] }> = [
    { id: 'first', label: 'Frets 0–5', frets: [0, 5] },
    { id: 'twelve', label: 'Frets 0–12', frets: [0, 12] },
  ];
  if (maxFret > 12) out.push({ id: 'upper', label: `Frets 12–${maxFret}`, frets: [12, maxFret] }, { id: 'all', label: `Whole neck (0–${maxFret})`, frets: [0, maxFret] });
  return out;
}

/** "Frets 0–12 · all strings · natural notes": the scope in one line. */
export function describeSettings(s: TrainerSettings, stringCount = 6): string {
  const frets = s.frets[0] === s.frets[1] ? `Fret ${s.frets[0]}` : `Frets ${s.frets[0]}–${s.frets[1]}`;
  const strings = s.strings.length === stringCount ? 'all strings' : s.strings.length === 1 ? `string ${s.strings[0]}` : `strings ${s.strings.join(', ')}`;
  return `${frets} · ${strings} · ${s.notes === 'naturals' ? 'natural notes' : 'all 12 notes'}`;
}
