/**
 * Rich text for cards, prompts and explanations: a small, safe inline markup parsed into tokens.
 * There are no HTML strings anywhere; a screen renders the tokens with its own components.
 *
 *   **bold**          strong text
 *   *emphasis*        emphasised text
 *   {n:F#}            a note name            shown F♯          spoken "F sharp"
 *   {c:Am7}           a chord symbol         shown Am7         spoken "A minor seventh"
 *   {i:m3}            an interval            shown m3          spoken "minor third"
 *   {d:b3}            a scale degree         shown ♭3          spoken "flat 3"
 *   {r:bVII}          a roman numeral        shown ♭VII        spoken "flat seven"
 *   {k:F# minor}      a key                  shown F♯ minor    spoken "F sharp minor"
 *   {t:barre}         a glossary term        shown as the term, tappable for its definition
 *   {t:barre|barred}  the same with other words on screen
 *   ___               a blank (fill-blanks exercises only)
 *   a line break      a new line
 *
 * A backslash makes the next character literal (`\*`, `\{`). Every token carries the words a
 * text-to-speech voice should say, because a speech engine reads "Am7" as "am seven": that is the
 * parallel speakable form. `{ text, say }` overrides the spoken words for the whole text.
 */
import {
  formatChord, formatDegree, formatKey, formatNote, formatRoman, getKey, intervalName, isDegree, parseChord,
  parseInterval, parseNote, parseRoman, type FormatNoteOptions, type RomanNumeral,
} from '@/core/theory';
import { glossaryTerm, type GlossaryLookup } from './glossary';
import type { RichText } from './types';

/** The kinds of music symbol the markup knows. */
export type SymbolKind = 'note' | 'chord' | 'interval' | 'degree' | 'roman' | 'key';

/** Emphasis flags shared by the inline tokens. */
interface Marks {
  bold?: true;
  em?: true;
}

/** One piece of parsed text. */
export type TextToken =
  /** Plain words. */
  | ({ type: 'text'; text: string; say: string } & Marks)
  /** A music symbol: `value` is the canonical ASCII form, `text` the default display, `say` the spoken words. */
  | ({ type: SymbolKind; value: string; text: string; say: string } & Marks)
  /** A glossary term: `id` finds the definition, `known` is false when the glossary lacks it. */
  | ({ type: 'term'; id: string; text: string; say: string; known: boolean } & Marks)
  | { type: 'break' }
  /** The n-th blank of a fill-blanks text (0-based). */
  | { type: 'blank'; index: number };

/** The result of parsing: tokens, plus what is wrong with the markup (empty when fine). */
export interface ParsedText {
  tokens: TextToken[];
  /** How many blanks the text holds. */
  blanks: number;
  /** Markup mistakes, each a full sentence that says how to fix it. */
  problems: string[];
}

/** Options for parsing. */
export interface ParseOptions {
  /** Where `{t:id}` terms are looked up. Default: the built-in glossary. */
  glossary?: GlossaryLookup;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

function accidentalWords(alt: number): string {
  if (alt === 0) return '';
  const word = alt > 0 ? 'sharp' : 'flat';
  const count = Math.abs(alt);
  return count === 1 ? ` ${word}` : count === 2 ? ` double ${word}` : ` triple ${word}`;
}

/** The words for a note name: `F#` -> "F sharp", `Bb2` -> "B flat 2". */
export function sayNote(name: string): string {
  const n = parseNote(name);
  if (!n) return name;
  return `${n.letter}${accidentalWords(n.alt)}${n.octave === null ? '' : ` ${n.octave}`}`;
}

/** The words for a chord symbol: `Am7` -> "A minor seventh", `C/E` -> "C major over E". */
export function sayChord(symbol: string): string {
  const c = parseChord(symbol);
  if (!c) return symbol;
  return `${sayNote(c.root)} ${c.type.name}${c.bass ? ` over ${sayNote(c.bass)}` : ''}`;
}

/** The words for an interval: `m3` -> "minor third". */
export function sayInterval(name: string): string {
  const ivl = parseInterval(name);
  if (!ivl) return name;
  return ivl.direction < 0 ? `descending ${intervalName(ivl.name.slice(1))}` : intervalName(ivl.name);
}

/** The words for a degree label: `b3` -> "flat 3". */
export function sayDegree(label: string): string {
  const match = /^(b{1,2}|#{1,2})?(\d+)$/.exec(label);
  if (!match) return label;
  const alt = match[1] ? (match[1][0] === 'b' ? -match[1].length : match[1].length) : 0;
  return `${accidentalWords(alt).trim()} ${match[2]}`.trim();
}

const ROMAN_TYPE_WORDS: Record<string, string> = {
  major: '',
  minor: ' minor',
  dim: ' diminished',
  aug: ' augmented',
  '7': ' seven',
  maj7: ' major seven',
  m7: ' minor seven',
  m7b5: ' half diminished seven',
  dim7: ' diminished seven',
};

function romanWords(r: RomanNumeral): string {
  const number = NUMBER_WORDS[r.degree] ?? String(r.degree);
  const quality = ROMAN_TYPE_WORDS[r.type.id] ?? ` ${r.type.name}`;
  const head = `${r.substitute ? 'sub ' : ''}${accidentalWords(r.alt).trim()} ${number}${quality}`.trim();
  return r.target ? `${head} of ${romanWords(r.target)}` : head;
}

/** The words for a roman numeral: `bVII` -> "flat seven", `ii` -> "two minor", `V7/ii` -> "five seven of two minor". */
export function sayRoman(numeral: string): string {
  const r = parseRoman(numeral);
  return r ? romanWords(r) : numeral;
}

/** The words for a key: `F# minor` -> "F sharp minor". */
export function sayKey(name: string): string {
  const k = getKey(name);
  return k ? `${sayNote(k.tonic)} ${k.mode}` : name;
}

const TAGS: Record<string, SymbolKind | 'term'> = { n: 'note', c: 'chord', i: 'interval', d: 'degree', r: 'roman', k: 'key', t: 'term' };

/** A slug-safe glossary id. */
const TERM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface SymbolParts {
  value: string;
  text: string;
  say: string;
}

/** Canonical value, display text and spoken words of a symbol, or null when it does not parse. */
export function describeSymbol(kind: SymbolKind, raw: string, format: FormatNoteOptions = {}): SymbolParts | null {
  const input = raw.trim();
  switch (kind) {
    case 'note': {
      const n = parseNote(input);
      return n ? { value: n.name, text: formatNote(n.name, format), say: sayNote(n.name) } : null;
    }
    case 'chord': {
      const c = parseChord(input);
      return c ? { value: c.symbol, text: formatChord(c, format), say: sayChord(c.symbol) } : null;
    }
    case 'interval': {
      const ivl = parseInterval(input);
      return ivl ? { value: ivl.name, text: ivl.name, say: sayInterval(ivl.name) } : null;
    }
    case 'degree':
      return isDegree(input) ? { value: input, text: formatDegree(input), say: sayDegree(input) } : null;
    case 'roman': {
      const r = parseRoman(input);
      return r ? { value: r.text, text: formatRoman(r), say: romanWords(r) } : null;
    }
    case 'key': {
      const k = getKey(input);
      return k ? { value: k.name, text: formatKey(k, format), say: sayKey(k.name) } : null;
    }
  }
}

/** The markup string and spoken override of a rich text. */
function parts(input: RichText): { text: string; say: string | undefined } {
  if (typeof input === 'string') return { text: input, say: undefined };
  // Content is data and may be malformed: anything that is not text reads as empty.
  if (typeof input !== 'object' || input === null) return { text: '', say: undefined };
  return { text: typeof input.text === 'string' ? input.text : '', say: typeof input.say === 'string' ? input.say : undefined };
}

/**
 * Parse rich text into tokens. Never throws: markup that cannot be read stays on screen as
 * written and is reported in `problems`, which is what `validateCourse` shows the author.
 */
export function parseRichText(input: RichText, opts: ParseOptions = {}): ParsedText {
  const source = parts(input).text ?? '';
  const lookup = opts.glossary ?? glossaryTerm;
  const tokens: TextToken[] = [];
  const problems: string[] = [];
  let bold = false;
  let em = false;
  let buffer = '';
  let blanks = 0;

  const marks = (): Marks => ({ ...(bold ? { bold: true as const } : {}), ...(em ? { em: true as const } : {}) });
  const flush = (): void => {
    if (!buffer) return;
    tokens.push({ type: 'text', text: buffer, say: buffer, ...marks() });
    buffer = '';
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\\' && i + 1 < source.length) {
      buffer += source[++i];
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      flush();
      // At most one empty line: two breaks in a row are a paragraph gap, more add nothing.
      const last = tokens[tokens.length - 1];
      const beforeLast = tokens[tokens.length - 2];
      if (!(last?.type === 'break' && beforeLast?.type === 'break')) tokens.push({ type: 'break' });
      continue;
    }
    if (ch === '*') {
      flush();
      if (source[i + 1] === '*') {
        bold = !bold;
        i++;
      } else {
        em = !em;
      }
      continue;
    }
    if (ch === '_' && source.startsWith('___', i)) {
      flush();
      while (source[i + 1] === '_') i++;
      tokens.push({ type: 'blank', index: blanks++ });
      continue;
    }
    if (ch === '{') {
      const close = source.indexOf('}', i);
      const body = close < 0 ? '' : source.slice(i + 1, close);
      const kind = body[1] === ':' ? TAGS[body[0]] : undefined;
      if (close < 0 || !kind) {
        problems.push(
          close < 0
            ? `"{" at character ${i + 1} is never closed. Close the tag with "}" or write "\\{" for a literal brace.`
            : `"{${body}}" is not a known tag. Use {n:note} {c:chord} {i:interval} {d:degree} {r:numeral} {k:key} {t:term}, or write "\\{" for a literal brace.`,
        );
        buffer += ch;
        continue;
      }
      flush();
      const content = body.slice(2);
      if (kind === 'term') {
        const [idPart, labelPart] = content.split('|');
        const id = idPart.trim();
        const term = TERM_ID.test(id) ? lookup(id) : null;
        const label = (labelPart ?? '').trim() || term?.term || id;
        if (!term) {
          problems.push(`{t:${id}} is not in the glossary. Use an id from GLOSSARY (glossary.ts) or add the term to course.glossary.`);
        }
        tokens.push({ type: 'term', id, text: label, say: label, known: term !== null, ...marks() });
      } else {
        const described = describeSymbol(kind, content);
        if (described) {
          tokens.push({ type: kind, ...described, ...marks() });
        } else {
          problems.push(`{${body}} does not hold a valid ${kind}. Check the spelling ("${content.trim()}"): notes are written F#, Bb; chords Am7, C/E; intervals m3, P5; degrees b3; numerals bVII; keys "A minor".`);
          tokens.push({ type: 'text', text: content, say: content, ...marks() });
        }
      }
      i = close;
      continue;
    }
    buffer += ch;
  }
  flush();
  if (bold) problems.push('"**" is opened but never closed. Add the closing "**", or write "\\*" for a literal asterisk.');
  if (em) problems.push('"*" is opened but never closed. Add the closing "*", or write "\\*" for a literal asterisk.');
  return { tokens, blanks, problems };
}

/** The tokens of a rich text (markup mistakes stay visible as plain text). */
export function tokenize(input: RichText, opts: ParseOptions = {}): TextToken[] {
  return parseRichText(input, opts).tokens;
}

/**
 * Display text of one token in the learner's naming system (letters, solfege or German). Symbols
 * are re-formatted from their canonical value; everything else keeps its text.
 */
export function formatToken(token: TextToken, format: FormatNoteOptions = {}): string {
  switch (token.type) {
    case 'break':
      return '\n';
    case 'blank':
      return '___';
    case 'note':
    case 'chord':
    case 'key':
      return describeSymbol(token.type, token.value, format)?.text ?? token.text;
    default:
      return token.text;
  }
}

/** The visible text without any markup: what the learner reads. */
export function plainText(input: RichText, opts: ParseOptions & { format?: FormatNoteOptions } = {}): string {
  return tokenize(input, opts)
    .map((token) => formatToken(token, opts.format))
    .join('');
}

/** Number of visible characters (a blank counts as five, the width it takes on screen). */
export function textLength(input: RichText, opts: ParseOptions = {}): number {
  let length = 0;
  for (const token of tokenize(input, opts)) {
    length += token.type === 'break' ? 1 : token.type === 'blank' ? 5 : [...token.text].length;
  }
  return length;
}

/**
 * The words a text-to-speech voice should say. The `say` override wins; otherwise every symbol is
 * spelled out ("A minor seventh", "F sharp", "flat seven") and blanks become "blank".
 */
export function speakable(input: RichText, opts: ParseOptions = {}): string {
  const override = parts(input).say;
  if (override !== undefined && override.trim()) return override.trim();
  return tokenize(input, opts)
    .map((token) => (token.type === 'break' ? '\n' : token.type === 'blank' ? ' blank ' : token.say))
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}

/** A comparison key for tiles, options and bank words: visible text, lower case, single spaces. */
export function textKey(input: RichText): string {
  return plainText(input).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Symbols written as plain words that a speech engine would misread. Chord symbols need a suffix
// with letters or a 7/9/11/13 (a bare letter is fine, "E2" is a note with its octave).
const CHORD_IN_TEXT = /(?<![A-Za-z0-9#])[A-G](?:#|b)?(?:maj|min|dim|aug|sus|add|m)(?:\d{0,2})(?:[b#]\d{1,2})*(?:\/[A-G](?:#|b)?)?(?![A-Za-z0-9#])|(?<![A-Za-z0-9#])[A-G](?:#|b)?(?:7|9|11|13)(?:[b#]\d{1,2})*(?![A-Za-z0-9#])/g;
const INTERVAL_IN_TEXT = /(?<![A-Za-z0-9#])[mMPd](?:[1-9]|1[0-3])(?![A-Za-z0-9])/g;
const ROMAN_IN_TEXT = /(?<![A-Za-z0-9#])(?:[b#](?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)|(?:VII|VI|IV|III|II|vii|vi|iv|iii|ii)|V7|I7|(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(?:°|ø|\+|maj7|7)+)(?![A-Za-z0-9])/g;
const DEGREE_IN_TEXT = /(?<![A-Za-z0-9#])(?:bb?|#)[1-7](?![A-Za-z0-9])/g;
const ACCIDENTAL_NOTE_IN_TEXT = /(?<![A-Za-z0-9#])[A-G](?:##?|bb?)(?![A-Za-z0-9#])/g;

/** A symbol found in plain text, with the tag that should wrap it. */
export interface LooseSymbol {
  symbol: string;
  tag: string;
}

/**
 * Music symbols typed as plain text instead of tags ("Play Am7" rather than "Play {c:Am7}").
 * They would be mispronounced by text-to-speech and are not typeset; `validateCourse` asks for
 * the tag unless the text carries a `say` override.
 */
export function looseSymbols(input: RichText, opts: ParseOptions = {}): LooseSymbol[] {
  const found: LooseSymbol[] = [];
  const seen = new Set<string>();
  const add = (symbol: string, letter: string): void => {
    if (seen.has(symbol)) return;
    seen.add(symbol);
    found.push({ symbol, tag: `{${letter}:${symbol}}` });
  };
  for (const token of tokenize(input, opts)) {
    if (token.type !== 'text') continue;
    let text = token.text;
    const take = (pattern: RegExp, letter: string, valid: (s: string) => boolean): void => {
      text = text.replace(pattern, (match) => {
        if (!valid(match)) return match;
        add(match, letter);
        return ' '.repeat(match.length);
      });
    };
    take(CHORD_IN_TEXT, 'c', (s) => parseChord(s) !== null);
    take(ROMAN_IN_TEXT, 'r', (s) => parseRoman(s) !== null);
    take(INTERVAL_IN_TEXT, 'i', (s) => parseInterval(s) !== null);
    take(DEGREE_IN_TEXT, 'd', (s) => isDegree(s));
    take(ACCIDENTAL_NOTE_IN_TEXT, 'n', (s) => parseNote(s) !== null);
  }
  return found;
}
