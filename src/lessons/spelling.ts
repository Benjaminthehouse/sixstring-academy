/**
 * How the notes an exercise or figure shows are NAMED. A pitch heard or tapped is a number; its
 * name depends on the music around it: C♯ in A major, D♭ in A♭ major, D♯ in Für Elise (E minor).
 *
 *   exerciseSpelling(exercise)   the spelling context of an exercise: its `key`, else the names its
 *                                own words use ({n:Eb} in the explanation), over the note it asks for,
 *                                the chord or scale it is about, or the key its notes imply
 *   spellPitch(midi, context)    a MIDI number named in that context (`C#4`, or `C#` with octave: false)
 *   inferSpelling(midis)         the key a set of pitches implies, as a context (null when nothing does)
 *   textSpelling(texts)          the note names some lesson text uses, by pitch class
 *
 * A key that is only guessed from the notes never names a white key with an accidental it does not
 * have in its own scale: a C in a lick that looks like C♯ minor stays C, never B♯.
 *
 * Pure; the names come from the theory and guitar engines.
 */
import { midiAt, spellMidi, type SpellContext as EngineSpelling } from '@/core/guitar';
import { detectKeyFromNotes, getKey, parseNote } from '@/core/theory';
import { tokenize } from './text';
import type { Exercise, FretboardFindExercise, RichText, TabNote } from './types';

/**
 * Note names that win for their pitch classes (from the lesson's own words), over an engine
 * context for every other pitch. `guessed` marks a base key inferred from the notes, not written.
 */
export interface NamedSpelling {
  /** Name without octave by pitch class (0 = C), as the lesson's text writes it: `{ 3: 'Eb' }`. */
  names: Readonly<Record<number, string>>;
  /** The context for pitch classes the names leave out. */
  base?: EngineSpelling;
  /** The base is a key guessed from the notes: white keys keep their plain names unless its own scale says otherwise. */
  guessed?: boolean;
}

/** A spelling context: the guitar engine's (a key, a scale, a chord, sharps or flats) or named notes over one. */
export type SpellContext = EngineSpelling | NamedSpelling;

function isNamed(context: SpellContext): context is NamedSpelling {
  return 'names' in context && typeof (context as NamedSpelling).names === 'object';
}

function mod12(n: number): number {
  return ((Math.round(n) % 12) + 12) % 12;
}

/** The most sharps or flats an inferred key may have (beyond that the commonest names read better). */
const MAX_INFERRED_ACCIDENTALS = 6;

/** A key name as a spelling context, or null when it is not a key. */
export function keySpelling(key: string | undefined): EngineSpelling | null {
  if (!key) return null;
  const k = getKey(key);
  return k ? { key: k.name } : null;
}

/** Sharps or flats, as the accidental of a written note suggests (`C#` sharps, `Bb` flats, `C` nothing). */
function preferOf(name: string | undefined): EngineSpelling | null {
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
  if (new Set(pitches.map(mod12)).size < 2) return null;
  const guess = detectKeyFromNotes([...pitches], { limit: 12 }).find((g) => g.key.signature.count <= MAX_INFERRED_ACCIDENTALS && !g.key.theoretical);
  // Only a guess: a white key keeps its plain name unless the key's own scale spells it otherwise.
  return guess ? { names: {}, base: { key: guess.key.name }, guessed: true } : null;
}

/**
 * The note names some lesson text writes (`{n:Eb}`, `{n:C#4}`), by pitch class: what the chips and
 * the feedback must agree with. A pitch class written two ways (`{n:C#}` and `{n:Db}`) is left out,
 * and so is everything that is not a `{n:…}` symbol. Null when the text names no note.
 */
export function textSpelling(texts: ReadonlyArray<RichText | null | undefined>): Record<number, string> | null {
  const names: Record<number, string> = {};
  const clash = new Set<number>();
  for (const text of texts) {
    if (text === null || text === undefined) continue;
    let tokens: ReturnType<typeof tokenize>;
    try {
      tokens = tokenize(text);
    } catch {
      continue;
    }
    for (const t of tokens) {
      if (t.type !== 'note') continue;
      const n = parseNote(t.value);
      if (!n) continue;
      const pc = mod12(n.chroma);
      if (names[pc] !== undefined && names[pc] !== n.pcName) clash.add(pc);
      names[pc] = n.pcName;
    }
  }
  for (const pc of clash) delete names[pc];
  return Object.keys(names).length > 0 ? names : null;
}

/** Every rich text an exercise shows: its prompt, explanation, options, tiles, and those of its tapping version. */
function exerciseTexts(exercise: unknown, out: RichText[] = [], depth = 0): RichText[] {
  if (depth > 6 || exercise === null || typeof exercise !== 'object') return out;
  for (const [field, value] of Object.entries(exercise as Record<string, unknown>)) {
    // Tab notes and sounds are data, not words.
    if (field === 'notes' || field === 'sound' || field === 'rhythm') continue;
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { text?: unknown }).text === 'string' && Object.keys(value).every((k) => k === 'text' || k === 'say')) out.push(value as RichText);
    else if (Array.isArray(value)) for (const item of value) typeof item === 'string' ? out.push(item) : exerciseTexts(item, out, depth + 1);
    else exerciseTexts(value, out, depth + 1);
  }
  return out;
}

/** Names from text over a context: the text's names win for their pitch classes. */
function withNames(names: Record<number, string> | null, context: SpellContext | null | undefined): SpellContext | undefined {
  if (!names) return context ?? undefined;
  if (!context) return { names };
  if (isNamed(context)) return { ...context, names: { ...context.names, ...names } };
  return { names, base: context };
}

function findSpelling(exercise: FretboardFindExercise): EngineSpelling | null {
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
export function spellingOfName(name: string | undefined): EngineSpelling | null {
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
  // The exercise's own words come first: an explanation that says {n:Eb} must not sit under a D♯ chip.
  const named = textSpelling(exerciseTexts(exercise));
  switch (exercise.type) {
    case 'play-note':
      return withNames(named, preferOf(exercise.note));
    case 'play-phrase':
      return withNames(named, inferSpelling(tabMidi(exercise.notes, exercise)));
    case 'fretboard-find':
      return withNames(named, findSpelling(exercise));
    case 'play-chord':
    case 'chord-build':
      return exercise.chord ? { chord: exercise.chord } : undefined;
    default:
      return undefined;
  }
}

/** A figure's spelling: its `key`, else the names its caption writes over the key its notes imply. */
export function figureSpelling(key: string | undefined, caption: RichText | undefined, midis: ReadonlyArray<number>): SpellContext | undefined {
  return keySpelling(key) ?? withNames(textSpelling([caption]), inferSpelling(midis));
}

/** A name without octave with the octave of a MIDI number: `('B#', 60)` -> `B#3`, `('Cb', 59)` -> `Cb4`. */
function withOctave(name: string, midi: number): string {
  const alt = parseNote(name)?.alt ?? 0;
  return `${name}${Math.floor((Math.round(midi) - alt) / 12) - 1}`;
}

const NATURALS: Readonly<Record<number, string>> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

/** A name from a guessed key, with white keys back to their plain names unless the key's own scale has them (E♯ in F♯ major). */
function plainUnlessOwn(name: string, key: string): string {
  const n = parseNote(name);
  if (!n || n.alt === 0) return name;
  const natural = NATURALS[mod12(n.chroma)];
  if (natural === undefined) return name;
  return getKey(key)?.scale.includes(n.pcName) ? name : natural;
}

/** A pitch named in a context: `C#4` (or `C#` with `octave: false`). Never throws. */
export function spellPitch(midi: number, context?: SpellContext | null, opts: { octave?: boolean } = {}): string {
  let base: EngineSpelling | undefined;
  if (context && isNamed(context)) {
    const given = context.names[mod12(midi)];
    if (given !== undefined) return opts.octave === false ? given : withOctave(given, midi);
    base = context.base;
    if (context.guessed && base && 'key' in base && typeof base.key === 'string') {
      const name = plainUnlessOwn(spellPitch(midi, base, { octave: false }), base.key);
      return opts.octave === false ? name : withOctave(name, midi);
    }
  } else {
    base = context ?? undefined;
  }
  try {
    return spellMidi(midi, base, opts);
  } catch {
    return spellMidi(midi, undefined, opts);
  }
}
