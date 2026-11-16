/**
 * Normalisers and comparers for typed answers. A learner writes "c sharp", "C♯", "db" or "Do#";
 * these functions turn that into the canonical form (`C#`, `Db`) and compare it with the expected
 * answer under the exercise's policy (does the spelling matter, or only the pitch?).
 *
 * Everything is forgiving about case, spaces and symbols, and strict about music: nothing is
 * accepted that the theory engine would not call the same thing.
 */
import {
  enharmonicIntervals, isDegree, parseChord, parseInterval, parseNote, parseRoman, type NoteNaming,
} from '@/core/theory';
import { degreeSemitones } from './figures';
import type { AnswerSpec, SpellingPolicy, TextVerdict } from './types';

/** Replace typeset music signs with their ASCII spellings and tidy whitespace. */
function ascii(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\u{1D12A}/gu, '##')
    .replace(/\u{1D12B}/gu, 'bb')
    .replace(/[♯＃]/g, '#')
    .replace(/♭/g, 'b')
    .replace(/♮/g, '')
    .replace(/[°º]/g, '°')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Turn "sharp" / "flat" words into signs: "c sharp" -> "c#", "b double flat" -> "bbb". */
function accidentalWordsToSigns(text: string): string {
  return text
    .replace(/[\s-]*double[\s-]*sharps?\b/gi, '##')
    .replace(/[\s-]*double[\s-]*flats?\b/gi, 'bb')
    .replace(/[\s-]*sharps?\b/gi, '#')
    .replace(/[\s-]*flats?\b/gi, 'b')
    .replace(/[\s-]*naturals?\b/gi, '');
}

const SOLFEGE: Record<string, string> = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', so: 'G', la: 'A', si: 'B', ti: 'B' };

/**
 * Canonical note name of whatever the learner typed, or null: `c#` `C♯` `c sharp` `Do#` -> `C#`;
 * `bb` `B flat` -> `Bb`; an octave is kept when given (`e2` -> `E2`). With `naming: 'german'`,
 * `H` is B and `B` is B flat.
 */
export function normalizeNote(raw: string, naming: NoteNaming = 'letters'): string | null {
  let text = accidentalWordsToSigns(ascii(raw)).replace(/\s+/g, '');
  if (!text) return null;
  const solfege = /^(do|re|mi|fa|sol|so|la|si|ti)([#b]{0,2})(-?\d)?$/i.exec(text);
  if (solfege) text = `${SOLFEGE[solfege[1].toLowerCase()]}${solfege[2]}${solfege[3] ?? ''}`;
  if (naming === 'german') {
    const german = /^([a-h])(is|es|s)?([#b]{0,2})(-?\d)?$/i.exec(text);
    if (german) {
      const letter = german[1].toUpperCase();
      const suffix = (german[2] ?? '').toLowerCase();
      const alt = suffix === 'is' ? '#' : suffix ? 'b' : '';
      text = letter === 'H' ? `B${alt}${german[3]}${german[4] ?? ''}` : letter === 'B' && !alt && !german[3] ? `Bb${german[4] ?? ''}` : `${letter}${alt}${german[3]}${german[4] ?? ''}`;
    }
  }
  // A leading lower-case letter is the note letter; what follows are accidentals ("bb" = B flat).
  const shaped = /^([a-gA-G])([#b]{0,3})(-?\d)?$/.exec(text);
  if (!shaped) return null;
  return parseNote(`${shaped[1].toUpperCase()}${shaped[2]}${shaped[3] ?? ''}`)?.name ?? null;
}

const INTERVAL_QUALITY_WORDS: Array<[RegExp, string]> = [
  [/^(perfect|perf|per|p)$/i, 'P'],
  [/^(major|maj)$/i, 'M'],
  [/^(minor|min)$/i, 'm'],
  [/^(augmented|aug|a)$/i, 'A'],
  [/^(diminished|dim|d)$/i, 'd'],
];

const INTERVAL_NUMBER_WORDS: Record<string, number> = {
  unison: 1, prime: 1, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, octave: 8, eighth: 8,
  ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
};

const INTERVAL_ALIASES: Record<string, string> = {
  unison: 'P1', octave: 'P8', 'half step': 'm2', semitone: 'm2', 'half tone': 'm2', 'whole step': 'M2', 'whole tone': 'M2', tone: 'M2',
  tritone: 'A4',
};

/**
 * Canonical interval of whatever the learner typed, or null: `m3` `minor third` `min 3rd` -> `m3`;
 * `P5` `perfect fifth` `fifth` -> `P5`; `tritone` -> `A4`. A single-letter quality is read as
 * written (`M3` major, `m3` minor), which is how the app writes intervals everywhere.
 */
export function normalizeInterval(raw: string): string | null {
  const text = ascii(raw);
  if (!text) return null;
  const direct = parseInterval(text.replace(/\s+/g, ''));
  if (direct) return direct.name;
  const lower = text.toLowerCase().replace(/[.,]/g, '');
  if (INTERVAL_ALIASES[lower]) return INTERVAL_ALIASES[lower];
  // "min3" and "maj 7th" are read like "min 3" and "maj 7".
  const words = text.replace(/[.,]/g, '').replace(/([A-Za-z])(\d)/g, '$1 $2').split(/[\s-]+/).filter(Boolean);
  if (words.length > 1 && /^an?$/i.test(words[0])) words.shift();
  if (words.length === 0 || words.length > 2) return null;
  const numberText = words[words.length - 1].toLowerCase().replace(/^(\d{1,2})(?:st|nd|rd|th)$/, '$1');
  const number = /^\d+$/.test(numberText) ? parseInt(numberText, 10) : INTERVAL_NUMBER_WORDS[numberText];
  if (!number) return null;
  let quality: string | null = null;
  if (words.length === 2) {
    // Whole words are case-insensitive; a single letter keeps its case (M = major, m = minor).
    const word = words[0];
    if (word.length === 1) quality = 'PMmAd'.includes(word) ? word : null;
    else quality = INTERVAL_QUALITY_WORDS.find(([pattern]) => pattern.test(word))?.[1] ?? null;
    if (!quality) return null;
  } else {
    // "fifth", "octave", "4th": a bare perfect interval is perfect; a bare second, third, sixth or seventh is ambiguous.
    const simple = ((number - 1) % 7) + 1;
    if (simple !== 1 && simple !== 4 && simple !== 5) return null;
    quality = 'P';
  }
  return parseInterval(`${quality}${number}`)?.name ?? null;
}

const CHORD_WORDS: Array<[RegExp, string]> = [
  [/\s*half[\s-]*diminished(\s*(seventh|7(th)?))?/i, 'm7b5'],
  [/\s*diminished\s*(seventh|7(th)?)/i, 'dim7'],
  [/\s*dominant\s*(seventh|7(th)?)/i, '7'],
  [/\s*dominant\s*(ninth|9(th)?)/i, '9'],
  [/\s*major\s*(seventh|7(th)?)/i, 'maj7'],
  [/\s*minor\s*(seventh|7(th)?)/i, 'm7'],
  [/\s*major\s*(ninth|9(th)?)/i, 'maj9'],
  [/\s*minor\s*(ninth|9(th)?)/i, 'm9'],
  [/\s*major\s*(sixth|6(th)?)/i, '6'],
  [/\s*minor\s*(sixth|6(th)?)/i, 'm6'],
  [/\s*suspended\s*(fourth|4(th)?)/i, 'sus4'],
  [/\s*suspended\s*(second|2(nd)?)/i, 'sus2'],
  [/\s*power(\s*chord)?/i, '5'],
  [/\s*diminished/i, 'dim'],
  [/\s*augmented/i, 'aug'],
  [/\s*seventh/i, '7'],
  [/\s*major/i, ''],
  [/\s*minor/i, 'm'],
  [/\s*chord$/i, ''],
];

/**
 * Canonical chord symbol of whatever the learner typed, or null: `am` `A minor` `Amin` `a-` -> `Am`;
 * `c major 7` `CM7` `CΔ` -> `Cmaj7`; `g7` -> `G7`. A lower-case first letter is taken as the root.
 */
export function normalizeChord(raw: string): string | null {
  let text = accidentalWordsToSigns(ascii(raw));
  if (!text) return null;
  const head = /^([a-gA-G])([#b]?)(.*)$/.exec(text);
  if (!head) return null;
  let rest = head[3];
  // "bb" is B flat and "bm" is B minor: the pattern above only takes a "#" or "b" right after
  // the root letter as its accidental, so "bm" keeps its "m" as the quality.
  const accidental = head[2];
  for (const [pattern, symbol] of CHORD_WORDS) {
    if (pattern.test(rest)) {
      rest = rest.replace(pattern, symbol);
      break;
    }
  }
  // Slash bass may be typed in lower case: "c/e".
  rest = rest.replace(/\s+/g, '').replace(/\/([a-g])([#b]?)$/, (_m, letter: string, alt: string) => `/${letter.toUpperCase()}${alt}`);
  text = `${head[1].toUpperCase()}${accidental}${rest}`;
  return parseChord(text)?.symbol ?? null;
}

const DEGREE_NUMBER_WORDS: Record<string, string> = {
  one: '1', first: '1', root: '1', tonic: '1', two: '2', second: '2', three: '3', third: '3', four: '4', fourth: '4',
  five: '5', fifth: '5', six: '6', sixth: '6', seven: '7', seventh: '7',
};

/** Canonical degree label of whatever the learner typed, or null: `b3` `♭3` `flat 3` `flat third` -> `b3`; `5th` `fifth` -> `5`. */
export function normalizeDegree(raw: string): string | null {
  const text = ascii(raw).toLowerCase();
  if (!text) return null;
  const match = /^(double flat|double sharp|flat|sharp|bb|##|b|#)?\s*(\d{1,2}|[a-z]+)(?:st|nd|rd|th)?$/.exec(text);
  if (!match) return null;
  const number = /^\d+$/.test(match[2]) ? match[2] : DEGREE_NUMBER_WORDS[match[2]];
  if (!number) return null;
  const alt = match[1] === undefined ? '' : match[1] === 'flat' ? 'b' : match[1] === 'sharp' ? '#' : match[1] === 'double flat' ? 'bb' : match[1] === 'double sharp' ? '##' : match[1];
  const label = `${alt}${number}`;
  return isDegree(label) ? label : null;
}

/** Canonical roman numeral of whatever the learner typed, or null. Case is kept: it carries the quality. */
export function normalizeRoman(raw: string): string | null {
  const text = ascii(raw).replace(/\s+/g, '').replace(/^flat/i, 'b').replace(/^sharp/i, '#').replace(/o(?=7|$)/, '°');
  if (!text) return null;
  return parseRoman(text)?.text ?? null;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, open: 0, none: 0, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, half: 0.5, 'a half': 0.5,
};

/**
 * The number in whatever the learner typed, or null: `5` `5th` `fret 5` `five` -> 5; `1.5` `1½` -> 1.5.
 * Text with two different numbers is refused rather than guessed.
 */
export function normalizeNumber(raw: string): number | null {
  // Fractions first: Unicode normalisation would turn "1½" into "11/2".
  const text = ascii(String(raw ?? '').replace(/½/g, '.5').replace(/¼/g, '.25').replace(/¾/g, '.75')).toLowerCase().replace(/,/g, '.');
  if (!text) return null;
  const digits = text.match(/-?\d+(?:\.\d+)?|(?<!\d)\.\d+/g);
  if (digits) {
    const values = [...new Set(digits.map((d) => parseFloat(d)))];
    return values.length === 1 && Number.isFinite(values[0]) ? values[0] : null;
  }
  const words = text.replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w in NUMBER_WORDS);
  const values = [...new Set(words.map((w) => NUMBER_WORDS[w]))];
  return values.length === 1 ? values[0] : null;
}

/**
 * A comparison key for free text: lower case, no accents, no punctuation, single spaces. A minus
 * right after a number is kept, because it is part of the answer: "6-" is the Nashville number of
 * a minor chord on 6, and "6" alone is a major one. Every other dash separates words.
 */
export function normalizeText(raw: string): string {
  return ascii(raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/(\d)\s*-(?![\da-z])/g, '$1\u0000')
    .replace(/[^a-z0-9#°+/\u0000 ]+/g, ' ')
    .replace(/\u0000/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compare two note names: exact spelling, or pitch only. Octaves count when both names carry one. */
export function compareNoteNames(given: string, expected: string, spelling: SpellingPolicy): TextVerdict {
  const a = parseNote(given);
  const b = parseNote(expected);
  if (!a || !b) return 'invalid';
  const samePitch = a.midi !== null && b.midi !== null ? a.midi === b.midi : a.chroma === b.chroma;
  if (!samePitch) return 'wrong';
  const sameName = a.step === b.step && a.alt === b.alt;
  return sameName || spelling === 'any' ? 'correct' : 'enharmonic';
}

function compareIntervalNames(given: string, expected: string, spelling: SpellingPolicy): TextVerdict {
  const a = parseInterval(given);
  const b = parseInterval(expected);
  if (!a || !b) return 'invalid';
  if (a.name === b.name) return 'correct';
  if (!enharmonicIntervals(a.name, b.name)) return 'wrong';
  return spelling === 'any' ? 'correct' : 'enharmonic';
}

function compareChordSymbols(given: string, expected: string, spelling: SpellingPolicy): TextVerdict {
  const a = parseChord(given);
  const b = parseChord(expected);
  if (!a || !b) return 'invalid';
  if (a.symbol === b.symbol) return 'correct';
  const sameType = a.type.id === b.type.id || (a.type.semitones.length === b.type.semitones.length && a.type.semitones.every((s, i) => s === b.type.semitones[i]));
  const pc = (name: string | null): number | null => (name === null ? null : (parseNote(name)?.chroma ?? null));
  const sameRootPitch = pc(a.root) === pc(b.root);
  const sameBassPitch = pc(a.bass ?? a.root) === pc(b.bass ?? b.root);
  if (!sameType || !sameRootPitch || !sameBassPitch) return 'wrong';
  return spelling === 'any' ? 'correct' : 'enharmonic';
}

function compareDegrees(given: string, expected: string, spelling: SpellingPolicy): TextVerdict {
  if (!isDegree(given) || !isDegree(expected)) return 'invalid';
  if (given === expected) return 'correct';
  if (degreeSemitones(given) !== degreeSemitones(expected)) return 'wrong';
  return spelling === 'any' ? 'correct' : 'enharmonic';
}

/** How a typed answer compared, with its canonical form. */
export interface TextCheck {
  verdict: TextVerdict;
  /** The canonical form of what was typed (`C#`), or null when it could not be read. */
  given: string | null;
  /** True when it was right apart from upper/lower case in a roman numeral (IV for iv). */
  caseOnly?: boolean;
}

/** The canonical display form of an answer spec's value (`F#`, `m3`, `Am7`, `5`). */
export function specValue(spec: AnswerSpec): string {
  switch (spec.kind) {
    case 'note':
      return parseNote(spec.value)?.name ?? spec.value;
    case 'interval':
      return parseInterval(spec.value)?.name ?? spec.value;
    case 'chord':
      return parseChord(spec.value)?.symbol ?? spec.value;
    case 'roman':
      return parseRoman(spec.value)?.text ?? spec.value;
    case 'number':
      return String(spec.value);
    default:
      return spec.value;
  }
}

/** Every value a spec accepts in canonical form: the value first, then `accept`. */
export function specAccepted(spec: AnswerSpec): string[] {
  const extra = (spec.accept ?? []).map((v) => specValue({ ...spec, value: v, accept: undefined } as AnswerSpec));
  return [specValue(spec), ...extra];
}

/** Why an answer spec cannot be graded, or an empty list. */
export function specProblems(spec: AnswerSpec): string[] {
  const problems: string[] = [];
  const all: Array<string | number> = [spec.value, ...((spec.accept ?? []) as Array<string | number>)];
  const bad = (what: string, example: string): void => {
    problems.push(`The answer "${String(spec.value)}" (or one of its "accept" values) is not ${what}. Write it like ${example}.`);
  };
  const needsPolicy = spec.kind === 'note' || spec.kind === 'interval' || spec.kind === 'chord' || spec.kind === 'degree';
  if (needsPolicy && (spec as { spelling?: string }).spelling !== 'exact' && (spec as { spelling?: string }).spelling !== 'any') {
    problems.push(`The answer needs an enharmonic policy. Add spelling: 'exact' when the name matters (a key-signature question) or spelling: 'any' when only the pitch does.`);
  }
  switch (spec.kind) {
    case 'note':
      if (all.some((v) => typeof v !== 'string' || !parseNote(v))) bad('a note name', 'F# or Bb');
      break;
    case 'interval':
      if (all.some((v) => typeof v !== 'string' || !parseInterval(v))) bad('an interval', 'm3 or P5');
      break;
    case 'chord':
      if (all.some((v) => typeof v !== 'string' || !parseChord(v))) bad('a chord symbol', 'Am or G7');
      break;
    case 'degree':
      if (all.some((v) => typeof v !== 'string' || !isDegree(v))) bad('a scale degree', '3 or b7');
      break;
    case 'roman':
      if (all.some((v) => typeof v !== 'string' || !parseRoman(v))) bad('a roman numeral', 'IV or vi');
      break;
    case 'number':
      if (all.some((v) => typeof v !== 'number' || !Number.isFinite(v))) bad('a number', '5');
      break;
    case 'text':
      if (all.some((v) => typeof v !== 'string' || normalizeText(v) === '')) bad('text', '"barre"');
      break;
    default:
      problems.push(`"${String((spec as { kind?: unknown }).kind)}" is not an answer kind. Use note, interval, chord, degree, roman, number or text.`);
  }
  return problems;
}

/** Check a typed answer against a spec. */
export function checkText(raw: string, spec: AnswerSpec, naming: NoteNaming = 'letters'): TextCheck {
  const input = typeof raw === 'string' ? raw : '';
  const best = (given: string | null, verdicts: TextVerdict[]): TextCheck => {
    if (given === null) return { verdict: 'invalid', given: null };
    const verdict: TextVerdict = verdicts.includes('correct') ? 'correct' : verdicts.includes('enharmonic') ? 'enharmonic' : 'wrong';
    return { verdict, given };
  };
  switch (spec.kind) {
    case 'note': {
      const given = normalizeNote(input, naming);
      return best(given, given === null ? [] : [spec.value, ...(spec.accept ?? [])].map((e) => compareNoteNames(given, e, spec.spelling)));
    }
    case 'interval': {
      const given = normalizeInterval(input);
      // "tritone" names the size, not a spelling: it is right for either tritone.
      if (given === 'A4' && /triton/i.test(input) && [spec.value, ...(spec.accept ?? [])].some((e) => enharmonicIntervals(e, 'A4'))) return { verdict: 'correct', given: 'A4' };
      return best(given, given === null ? [] : [spec.value, ...(spec.accept ?? [])].map((e) => compareIntervalNames(given, e, spec.spelling)));
    }
    case 'chord': {
      const given = normalizeChord(input);
      return best(given, given === null ? [] : [spec.value, ...(spec.accept ?? [])].map((e) => compareChordSymbols(given, e, spec.spelling)));
    }
    case 'degree': {
      const given = normalizeDegree(input);
      return best(given, given === null ? [] : [spec.value, ...(spec.accept ?? [])].map((e) => compareDegrees(given, e, spec.spelling)));
    }
    case 'roman': {
      const given = normalizeRoman(input);
      if (given === null) return { verdict: 'invalid', given: null };
      const accepted = specAccepted(spec);
      if (accepted.includes(given)) return { verdict: 'correct', given };
      const caseOnly = accepted.some((e) => e.toLowerCase() === given.toLowerCase());
      return caseOnly ? { verdict: 'wrong', given, caseOnly: true } : { verdict: 'wrong', given };
    }
    case 'number': {
      const given = normalizeNumber(input);
      if (given === null) return { verdict: 'invalid', given: null };
      const ok = [spec.value, ...(spec.accept ?? [])].some((e) => Math.abs(e - given) < 1e-9);
      return { verdict: ok ? 'correct' : 'wrong', given: String(given) };
    }
    case 'text': {
      const given = normalizeText(input);
      if (!given) return { verdict: 'invalid', given: null };
      const ok = [spec.value, ...(spec.accept ?? [])].some((e) => normalizeText(e) === given);
      return { verdict: ok ? 'correct' : 'wrong', given };
    }
  }
}

/** Rich-text markup that shows an answer spec's value (`{n:F#}`, `{i:m3}`, `{c:Am7}`, `5`). */
export function specMarkup(spec: AnswerSpec): string {
  const value = specValue(spec);
  switch (spec.kind) {
    case 'note':
      return `{n:${value}}`;
    case 'interval':
      return `{i:${value}}`;
    case 'chord':
      return `{c:${value}}`;
    case 'degree':
      return `{d:${value}}`;
    case 'roman':
      return `{r:${value}}`;
    default:
      return value;
  }
}
