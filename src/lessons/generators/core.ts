/**
 * Shared machinery of the exercise generators: the definition shape, the difficulty-aware pools,
 * parameter checks and small wording helpers.
 */
import { MAJOR_KEYS, MINOR_KEYS, distractorIntervals, getChordType, getKey, getScale, interval, parseInterval, parseNote, pcToNote, type Key } from '@/core/theory';
import type { Rng } from '../rng';
import type { ChoiceExercise, ChoiceOption, CourseLevel, Exercise, ExerciseType, GeneratorKind } from '../types';
import type { GeneratorParamsMap } from './params';

/** What a generator gets besides its params. */
export interface GenContext {
  rng: Rng;
  /** 0 (easiest) to 1 (hardest): how much of each pool is in play. */
  difficulty: number;
  level: CourseLevel;
}

/** One documented parameter. */
export interface ParamDoc {
  name: string;
  /** Type as an author would write it (`string[]`, `'up' | 'down'`). */
  type: string;
  /** Default, as text. */
  default: string;
  description: string;
}

/** A generator: documentation, a parameter check and the function that makes an exercise. */
export interface GeneratorDef<K extends GeneratorKind = GeneratorKind> {
  kind: K;
  /** One line for the authoring guide. */
  summary: string;
  /** The exercise types it can produce. */
  produces: ExerciseType[];
  /** True when it produces a microphone exercise (with a non-microphone alternative inside). */
  mic?: boolean;
  params: ParamDoc[];
  /** Problems with the params (empty when fine). Each says how to fix it. */
  check(params: GeneratorParamsMap[K]): string[];
  /** Make one exercise. Deterministic for a given `ctx.rng`. */
  make(params: GeneratorParamsMap[K], ctx: GenContext): Exercise;
}

/** Declare a generator with its kind inferred. */
export function defineGenerator<K extends GeneratorKind>(def: GeneratorDef<K>): GeneratorDef<K> {
  return def;
}

// ── Pools ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The part of an easiest-first list that is in play at a difficulty: about a third of it at 0,
 * all of it at 1, and never fewer than `min` items (or the whole list when it is shorter).
 */
export function pool<T>(list: readonly T[], difficulty: number, min = 3): T[] {
  const d = Math.min(1, Math.max(0, Number.isFinite(difficulty) ? difficulty : 0));
  const size = Math.max(Math.min(min, list.length), Math.ceil(list.length * (0.34 + 0.66 * d)));
  return list.slice(0, size);
}

/** Major and/or minor keys with at most `maxAccidentals` sharps or flats, simplest signatures first. */
export function keysUpTo(maxAccidentals: number, modes: ReadonlyArray<'major' | 'minor'> = ['major']): Key[] {
  const limit = Math.min(7, Math.max(0, Math.round(maxAccidentals)));
  const all = [...(modes.includes('major') ? MAJOR_KEYS : []), ...(modes.includes('minor') ? MINOR_KEYS : [])];
  return all
    .filter((k) => Math.abs(k.fifths) <= limit)
    .sort((a, b) => Math.abs(a.fifths) - Math.abs(b.fifths) || b.fifths - a.fifths || (a.mode === b.mode ? 0 : a.mode === 'major' ? -1 : 1));
}

/** The keys of an explicit `keys` parameter (unknown names dropped; `validateCourse` reports them). */
export function keysFromList(names: readonly string[]): Key[] {
  return names.map((name) => getKey(name)).filter((k): k is Key => k !== null);
}

/**
 * The key pool of a generator with `keys`, `modes` and `maxAccidentals` parameters: the explicit
 * list when given, otherwise the simplest signatures first. Either way the start of it at low difficulty.
 */
export function keyPool(p: { keys?: string[]; modes?: ReadonlyArray<'major' | 'minor'>; maxAccidentals?: number }, difficulty: number, fallbackMax = 4): Key[] {
  const all = p.keys ? keysFromList(p.keys) : keysUpTo(p.maxAccidentals ?? fallbackMax, p.modes ?? ['major']);
  return pool(all, difficulty, 4);
}

/**
 * A note name in the spelling a drill uses for black keys: `F#` or `Gb`. Natural notes stay as
 * they are; only a single sharp or flat is respelled.
 */
export function respell(note: string, prefer: 'sharps' | 'flats'): string {
  const n = parseNote(note);
  if (!n || n.alt === 0 || Math.abs(n.alt) > 1 || [0, 2, 4, 5, 7, 9, 11].includes(n.chroma)) return note;
  return pcToNote(n.chroma, prefer);
}

/** Try `make` until `ok` accepts the result, at most `tries` times; then return `fallback()`. */
export function retry<T>(tries: number, make: () => T, ok: (value: T) => boolean, fallback: () => T): T {
  for (let i = 0; i < tries; i++) {
    const value = make();
    if (ok(value)) return value;
  }
  return fallback();
}

// ── Wording ────────────────────────────────────────────────────────────────────────────────────

/** `1st`, `2nd`, `3rd`, `4th` ... */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

/** Upper-case the first letter. */
export function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `a` or `an` for the word that follows. */
export function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

// First words of catalog scale names that are ordinary adjectives; the rest (Dorian, Hungarian ...) are names.
const COMMON_SCALE_WORDS = new Set(['major', 'minor', 'natural', 'melodic', 'harmonic', 'dominant', 'double', 'altered', 'whole', 'diminished', 'augmented', 'chromatic', 'bebop', 'combined', 'six-tone', 'tritone', 'leading']);

/** A catalog scale name as it reads inside a sentence: `natural minor`, `major pentatonic`, but `Dorian`, `bebop Dorian`. */
export function scaleTitle(name: string): string {
  const [first, ...rest] = name.split(' ');
  return COMMON_SCALE_WORDS.has(first.toLowerCase()) ? [first.toLowerCase(), ...rest].join(' ') : name;
}

/** `1 half step`, `3 half steps`. */
export function count(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Markup for a list of notes: `{n:C} {n:E} {n:G}`. */
export function noteList(notes: readonly string[], separator = ' '): string {
  return notes.map((n) => `{n:${n}}`).join(separator);
}

/** True when a spelled note needs a double sharp or double flat (too awkward for a quiz). */
export function awkward(note: string): boolean {
  return Math.abs(parseNote(note)?.alt ?? 9) > 1;
}

// ── Building choice exercises ──────────────────────────────────────────────────────────────────

/**
 * A single-answer choice exercise from a right answer and wrong ones (markup strings). The
 * options are put in a seeded random order so the right one is not always first in the data.
 */
export function choiceOf(
  rng: Rng,
  fields: { prompt: string; explain: string; hint?: string; figure?: ChoiceExercise['figure']; shuffle?: boolean; spelling?: 'exact' },
  right: string,
  wrong: readonly string[],
): ChoiceExercise {
  const options: ChoiceOption[] = [{ text: right, correct: true }, ...wrong.map((text) => ({ text }))];
  const out: ChoiceExercise = { type: 'choice', prompt: fields.prompt, options: fields.shuffle === false ? options : rng.shuffle(options), explain: fields.explain };
  if (fields.hint) out.hint = fields.hint;
  if (fields.figure) out.figure = fields.figure;
  if (fields.shuffle === false) out.shuffle = false;
  if (fields.spelling) out.spelling = fields.spelling;
  return out;
}

/**
 * Wrong interval names for a question whose answer is `answer`: the engine's usual confusions
 * first, then the author's pool, only simple intervals (m2 to P8: no unison or ninth beside an
 * octave, which a learner could argue for) and one name per size.
 */
export function intervalDistractors(rng: Rng, answer: string, poolList: readonly string[], n = 3): string[] {
  const simple = (i: string): boolean => {
    const s = parseInterval(i)?.semitones ?? 0;
    return s >= 1 && s <= 12;
  };
  return distinct([...distractorIntervals(answer, { count: 6 }).filter(simple), ...rng.shuffle(poolList).filter(simple)], (i) => interval(i).semitones, n, [interval(answer).semitones]);
}

/** Keep the first `n` items whose key has not been seen (and is not in `taken`). */
export function distinct<T>(items: readonly T[], key: (item: T) => string | number, n: number, taken: ReadonlyArray<string | number> = []): T[] {
  const seen = new Set<string | number>(taken);
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= n) break;
  }
  return out;
}

// ── Parameter checks ───────────────────────────────────────────────────────────────────────────

/** Collects problems with generator params. */
export class ParamCheck {
  readonly problems: string[] = [];

  /** A list parameter: must be a non-empty array whose items pass `valid`. */
  list<T>(name: string, value: readonly T[] | undefined, valid: (item: T) => boolean, example: string, min = 1): this {
    if (value === undefined) return this;
    if (!Array.isArray(value) || value.length < min) {
      this.problems.push(`"${name}" must be a list of at least ${min} item${min === 1 ? '' : 's'}, like ${example}.`);
      return this;
    }
    const bad = value.filter((item) => !valid(item));
    if (bad.length > 0) this.problems.push(`"${name}" holds ${bad.map((b) => JSON.stringify(b)).join(', ')}, which ${bad.length === 1 ? 'is' : 'are'} not valid. Write it like ${example}.`);
    return this;
  }

  notes(name: string, value: readonly string[] | undefined): this {
    return this.list(name, value, (n) => typeof n === 'string' && parseNote(n) !== null && parseNote(n)!.octave === null, "['C', 'G', 'F#']");
  }

  /** Ascending intervals from m2 to P8, or to P15 (two octaves) when `compound` is set. */
  intervals(name: string, value: readonly string[] | undefined, min = 1, compound = false): this {
    const top = compound ? 24 : 12;
    return this.list(
      name,
      value,
      (i) => {
        const ivl = typeof i === 'string' ? parseInterval(i) : null;
        return ivl !== null && ivl.direction > 0 && ivl.semitones >= 1 && ivl.semitones <= top;
      },
      compound ? "['P5', 'M3', 'M9', 'P11'] (m2 to P15)" : "['P5', 'M3', 'm3'] (m2 to P8)",
      min,
    );
  }

  /** A list of key names (`'A major'`, `'E minor'`) the theory engine knows, each with seven sharps or flats at most. */
  keys(name: string, value: readonly string[] | undefined, modes?: ReadonlyArray<'major' | 'minor'>): this {
    // Modal keys (A Dorian) are not major or minor keys: these drills count their chords and degrees from major and minor scales.
    const ok = (k: unknown): boolean => {
      const key = typeof k === 'string' ? getKey(k) : null;
      return key !== null && !key.theoretical && (key as { modal?: string }).modal === undefined && (!modes || modes.includes(key.mode));
    };
    this.list(name, value, ok, modes && modes.length === 1 ? `['C ${modes[0]}', 'G ${modes[0]}'] (${modes[0]} keys)` : "['C major', 'A major', 'E minor'] (major and minor keys)");
    return this;
  }

  /** `keys` replaces `modes` and `maxAccidentals`: refuse both at once. */
  keysOrSignature(p: { keys?: unknown; modes?: unknown; maxAccidentals?: unknown }): this {
    if (p.keys !== undefined && (p.modes !== undefined || p.maxAccidentals !== undefined)) {
      this.problems.push('"keys" lists the keys itself, so "modes" and "maxAccidentals" have no effect beside it. Remove them, or remove "keys".');
    }
    return this;
  }

  scales(name: string, value: readonly string[] | undefined): this {
    return this.list(name, value, (s) => typeof s === 'string' && getScale(s) !== null, "['major', 'minor-pentatonic']");
  }

  chordTypes(name: string, value: readonly string[] | undefined, min = 1): this {
    return this.list(name, value, (t) => typeof t === 'string' && getChordType(t) !== null, "['major', 'minor', '7']", min);
  }

  oneOf<T extends string>(name: string, value: T | undefined, allowed: readonly T[]): this {
    if (value !== undefined && !allowed.includes(value)) {
      this.problems.push(`"${name}" is ${JSON.stringify(value)}; it must be one of ${allowed.map((a) => `'${a}'`).join(', ')}.`);
    }
    return this;
  }

  /** A whole number within [min, max]. */
  int(name: string, value: number | undefined, min: number, max: number): this {
    if (value !== undefined && (!Number.isInteger(value) || value < min || value > max)) {
      this.problems.push(`"${name}" is ${JSON.stringify(value)}; it must be a whole number from ${min} to ${max}.`);
    }
    return this;
  }

  /** A `[low, high]` pair of whole numbers within [min, max] with low ≤ high. */
  span(name: string, value: readonly number[] | undefined, min: number, max: number, minWidth = 0): this {
    if (value === undefined) return this;
    const ok = Array.isArray(value) && value.length === 2 && value.every((v) => Number.isInteger(v) && v >= min && v <= max) && value[1] - value[0] >= minWidth;
    if (!ok) this.problems.push(`"${name}" is ${JSON.stringify(value)}; it must be [low, high] with whole numbers from ${min} to ${max}${minWidth ? ` at least ${minWidth} apart` : ''}.`);
    return this;
  }

  bool(name: string, value: boolean | undefined): this {
    if (value !== undefined && typeof value !== 'boolean') this.problems.push(`"${name}" must be true or false.`);
    return this;
  }

  /** Add a problem when a condition fails. */
  need(ok: boolean, message: string): this {
    if (!ok) this.problems.push(message);
    return this;
  }
}

/** Start a parameter check. */
export function checkParams(): ParamCheck {
  return new ParamCheck();
}
