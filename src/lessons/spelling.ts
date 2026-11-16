/**
 * How the notes an exercise or figure shows are NAMED. A pitch heard or tapped is a number; its
 * name depends on the music around it: C♯ in A major, D♭ in A♭ major, D♯ in Für Elise (E minor).
 *
 *   exerciseSpelling(exercise)   the spelling context of an exercise: its `key`, else the note it
 *                                asks for, the chord or scale it is about, or the key its notes imply
 *   spellPitch(midi, context)    a MIDI number named in that context (`C#4`, or `C#` with octave: false)
 *   inferSpelling(midis)         the key a set of pitches implies, as a context (null when nothing does)
 *
 * Pure; the names come from the theory and guitar engines.
 */
import { midiAt, spellMidi, type SpellContext } from '@/core/guitar';
import { detectKeyFromNotes, getKey, parseNote } from '@/core/theory';
import type { Exercise, FretboardFindExercise, TabNote } from './types';

export type { SpellContext };

/** The most sharps or flats an inferred key may have (beyond that the commonest names read better). */
const MAX_INFERRED_ACCIDENTALS = 6;

/** A key name as a spelling context, or null when it is not a key. */
export function keySpelling(key: string | undefined): SpellContext | null {
  if (!key) return null;
  const k = getKey(key);
  return k ? { key: k.name } : null;
}

/** Sharps or flats, as the accidental of a written note suggests (`C#` sharps, `Bb` flats, `C` nothing). */
function preferOf(name: string | undefined): SpellContext | null {
  const n = name ? parseNote(name) : null;
  if (!n || n.alt === 0) return null;
  return { prefer: n.alt > 0 ? 'sharps' : 'flats' };
}

/**
 * The key a set of pitches implies, as a spelling context: an A major phrase names its notes with
 * sharps, an F major one with flats. Null for no pitches, or for a single pitch class (one note
 * implies no key: it is named the common way, or by how it was written).
 */
export function inferSpelling(midis: ReadonlyArray<number>): SpellContext | null {
  const pitches = midis.filter((m) => Number.isFinite(m));
  if (new Set(pitches.map((m) => ((Math.round(m) % 12) + 12) % 12)).size < 2) return null;
  const guess = detectKeyFromNotes([...pitches], { limit: 12 }).find((g) => g.key.signature.count <= MAX_INFERRED_ACCIDENTALS && !g.key.theoretical);
  return guess ? { key: guess.key.name } : null;
}

function findSpelling(exercise: FretboardFindExercise): SpellContext | null {
  const find = exercise.find;
  if (!find || typeof find !== 'object') return null;
  if ('chord' in find) return { chord: find.chord };
  if ('scale' in find) return { tonic: find.tonic, scale: find.scale };
  if ('note' in find) return preferOf(find.note);
  // An interval question: the grader names the target by the interval itself (a major third above
  // D is F#), and other taps after it.
  return null;
}

/** The sounding MIDI notes of tab notes (rests and impossible positions left out). */
export function tabMidi(notes: ReadonlyArray<TabNote> | undefined, opts: { tuning?: string; capo?: number } = {}): number[] {
  const out: number[] = [];
  for (const n of notes ?? []) {
    if (!n || 'rest' in n) continue;
    try {
      out.push(midiAt({ string: n.string, fret: n.fret }, { tuning: opts.tuning, capo: opts.capo }));
    } catch {
      /* reported by validation */
    }
  }
  return out;
}

/** Sharps or flats, as a written note name suggests; null for a natural or no name. */
export function spellingOfName(name: string | undefined): SpellContext | null {
  return preferOf(name);
}

/**
 * The spelling context of an exercise: what decides whether a pitch it shows or hears is called
 * C♯ or D♭. An explicit `key` wins; otherwise the exercise's own material decides (the written note
 * of a play-note, the chord or scale of a fretboard-find, the key a phrase's notes imply). Undefined
 * when nothing does: the commonest names are used then.
 */
export function exerciseSpelling(exercise: Exercise): SpellContext | undefined {
  const explicit = 'key' in exercise ? keySpelling((exercise as { key?: string }).key) : null;
  if (explicit) return explicit;
  switch (exercise.type) {
    case 'play-note':
      return preferOf(exercise.note) ?? undefined;
    case 'play-phrase':
      return inferSpelling(tabMidi(exercise.notes, exercise)) ?? undefined;
    case 'fretboard-find':
      return findSpelling(exercise) ?? undefined;
    case 'play-chord':
    case 'chord-build':
      return exercise.chord ? { chord: exercise.chord } : undefined;
    default:
      return undefined;
  }
}

/** A pitch named in a context: `C#4` (or `C#` with `octave: false`). Never throws. */
export function spellPitch(midi: number, context?: SpellContext | null, opts: { octave?: boolean } = {}): string {
  try {
    return spellMidi(midi, context ?? undefined, opts);
  } catch {
    return spellMidi(midi, undefined, opts);
  }
}
