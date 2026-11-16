/**
 * The Nashville number system: chords named by the scale step of their root in a major key
 * (1 4 5 6m), the way session players write charts. Roots come from the theory engine's major
 * scale, chord names from its chord parser.
 */
import { getChordType, parseChord, parseNote, scaleNotes, transpose, type Key } from '@/core/theory';
import type { Rng } from '../rng';
import { checkParams, choiceOf, defineGenerator, distinct, keyPool, keysFromList, noteList, ordinal, pool } from './core';

const NUMBERS_EASY_FIRST = ['1', '4', '5', '6m', '2m', '3m', '7°'];
const KEYS_EASY_FIRST = ['C major', 'G major', 'D major', 'A major', 'E major', 'F major', 'Bb major'];

/** Suffix of a Nashville number -> chord type id, and the words for it. */
const SUFFIXES: Record<string, { type: string; words: string }> = {
  '': { type: 'major', words: 'major chord' },
  m: { type: 'minor', words: 'minor chord' },
  '°': { type: 'dim', words: 'diminished chord' },
  '7': { type: '7', words: 'dominant seventh chord' },
  m7: { type: 'm7', words: 'minor seventh chord' },
  maj7: { type: 'maj7', words: 'major seventh chord' },
  ø7: { type: 'm7b5', words: 'half-diminished chord' },
};

/** A parsed Nashville number: scale step, accidental and chord type. */
export interface NashvilleNumber {
  text: string;
  degree: number;
  alt: number;
  suffix: string;
}

/** Parse `6m`, `b7`, `57`, `1maj7`, `7°`; null when it is not a Nashville number. */
export function parseNashville(text: string): NashvilleNumber | null {
  const m = /^(b|#)?([1-7])(m7|maj7|m|°|ø7|7)?$/.exec(text);
  if (!m) return null;
  return { text, degree: Number(m[2]), alt: m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0, suffix: m[3] ?? '' };
}

/** The chord a Nashville number stands for in a major key: `6m` in G is Em. */
export function nashvilleChord(text: string, key: Key | string): string {
  const n = parseNashville(text);
  if (!n) throw new RangeError(`"${text}" is not a Nashville number`);
  const tonic = typeof key === 'string' ? key.split(' ')[0] : key.tonic;
  const base = scaleNotes(tonic, 'major')[n.degree - 1];
  const root = n.alt === 0 ? base : transpose(base, n.alt < 0 ? '-A1' : 'A1');
  return `${root}${getChordType(SUFFIXES[n.suffix].type)!.symbol}`;
}

/** A number as text: a flat or sharp step is shown and spoken as a degree (♭7), the rest as written. */
export function numberText(text: string): string {
  const n = parseNashville(text);
  return n && n.alt !== 0 ? `{d:${n.alt < 0 ? 'b' : '#'}${n.degree}}${n.suffix}` : text;
}

/** The same number with the other quality (6m <-> 6): the usual slip. */
function flipQuality(n: NashvilleNumber): string {
  const flipped = n.suffix === '' ? 'm' : n.suffix === 'm' ? '' : n.suffix === '7' ? 'm7' : n.suffix === 'm7' ? '7' : n.suffix === 'maj7' ? '7' : '';
  return `${n.alt < 0 ? 'b' : n.alt > 0 ? '#' : ''}${n.degree}${flipped}`;
}

function why(text: string, key: Key): string {
  const n = parseNashville(text)!;
  const scale = scaleNotes(key.tonic, 'major');
  const symbol = nashvilleChord(text, key);
  const step = `the ${ordinal(n.degree)} note of the scale${n.alt ? `, ${n.alt < 0 ? 'lowered' : 'raised'} a half step` : ''}`;
  return `In {k:${key.name}} the scale is ${noteList(scale)}. ${numberText(text)} is the ${SUFFIXES[n.suffix].words} on ${step}: {c:${symbol}}.`;
}

/** A short chart: starts on 1, then three more numbers from the pool, no number twice in a row. */
function chart(rng: Rng, numbers: readonly string[]): string[] {
  const out = ['1'];
  while (out.length < 4) {
    const next = rng.pick(numbers.length > 1 ? numbers.filter((n) => n !== out[out.length - 1]) : numbers);
    out.push(next);
  }
  return out;
}

/** True when some number's root in some key would need a double sharp or flat (b4 in F major is Bbb). */
function spellsBadly(keys: readonly string[], numbers: readonly string[]): boolean {
  return keysFromList(keys).some((key) =>
    numbers.some((n) => parseNashville(n) !== null && Math.abs(parseNote(parseChord(nashvilleChord(n, key))!.root)!.alt) > 1),
  );
}

const pcsKey = (symbols: readonly string[]): string => symbols.map((s) => {
  const c = parseChord(s)!;
  return `${parseNote(c.root)!.chroma}:${c.type.id}`;
}).join(' ');

export const nashville = defineGenerator({
  kind: 'nashville',
  summary: 'The Nashville number system in a major key: which chord a number is, which number a chord is, or a four-chord chart.',
  produces: ['choice'],
  params: [
    { name: 'ask', type: "'to-chord' | 'to-number' | 'chart'", default: "'to-chord'", description: 'Which chord a number is; which number a chord is; or which chords a four-number chart means.' },
    { name: 'keys', type: 'string[]', default: 'C G D A E F Bb major', description: 'Major keys, easiest first.' },
    { name: 'numbers', type: 'string[]', default: "['1', '4', '5', '6m', '2m', '3m', '7°']", description: 'Numbers in play, easiest first. Also b7, 2, 57 (5 with a seventh), 1maj7, 2m7.' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('ask', p.ask, ['to-chord', 'to-number', 'chart'])
      .keys('keys', p.keys, ['major'])
      .list('numbers', p.numbers, (n) => typeof n === 'string' && parseNashville(n) !== null, "['1', '4', '5', '6m']", p.ask === 'chart' ? 2 : 1)
      .need(!spellsBadly(p.keys ?? KEYS_EASY_FIRST, p.numbers ?? NUMBERS_EASY_FIRST), '"numbers" holds a number whose root needs a double sharp or flat in one of the keys. Use simpler keys or numbers.').problems,
  make(p, { rng, difficulty }) {
    const key = rng.pick(keyPool({ keys: p.keys ?? KEYS_EASY_FIRST }, difficulty));
    const numbers = pool(p.numbers ?? NUMBERS_EASY_FIRST, difficulty, 3);
    const all = p.numbers ?? NUMBERS_EASY_FIRST;
    const ask = p.ask ?? 'to-chord';
    if (ask === 'chart') {
      const numbersIn = chart(rng, numbers);
      const right = numbersIn.map((n) => nashvilleChord(n, key));
      const neighbours = keysFromList([`${transpose(key.tonic, 'P5')} major`, `${transpose(key.tonic, 'P4')} major`, `${transpose(key.tonic, 'M2')} major`]).filter((k) => !scaleNotes(k.tonic, 'major').some((n) => Math.abs(parseNote(n)!.alt) > 1));
      const lists: string[][] = [
        // The chart read in a neighbouring key.
        ...neighbours.map((k) => numbersIn.map((n) => nashvilleChord(n, k))),
        // One chord with the other quality.
        ...numbersIn.map((_n, i) => numbersIn.map((n, j) => nashvilleChord(j === i ? flipQuality(parseNashville(n)!) : n, key))),
      ];
      const wrong = distinct(rng.shuffle(lists), pcsKey, 3, [pcsKey(right)]);
      return choiceOf(
        rng,
        {
          prompt: `In {k:${key.name}} the chart reads ${numbersIn.map(numberText).join(' ')}. Which chords do you play?`,
          explain: `In {k:${key.name}} the scale is ${noteList(scaleNotes(key.tonic, 'major'))}. Count up it from 1: ${numbersIn.map((n, i) => `${numberText(n)} is {c:${right[i]}}`).join(', ')}.`,
        },
        right.map((s) => `{c:${s}}`).join(' '),
        wrong.map((list) => list.map((s) => `{c:${s}}`).join(' ')),
      );
    }
    const text = rng.pick(numbers);
    const symbol = nashvilleChord(text, key);
    const n = parseNashville(text)!;
    if (ask === 'to-number') {
      const others = distinct([flipQuality(n), ...rng.shuffle(all.filter((x) => x !== text)), String(n.degree === 7 ? 1 : n.degree + 1), String(n.degree === 1 ? 7 : n.degree - 1)], (x) => pcsKey([nashvilleChord(x, key)]), 3, [pcsKey([symbol])]);
      return choiceOf(rng, { prompt: `In {k:${key.name}}, which number is {c:${symbol}}?`, explain: why(text, key) }, numberText(text), others.map(numberText));
    }
    // The other quality, the neighbours, and the chord counted from the wrong end (1 taken as 0).
    const rivals = [flipQuality(n), ...rng.shuffle(all.filter((x) => x !== text)), `${n.degree === 7 ? 1 : n.degree + 1}`].map((x) => nashvilleChord(x, key));
    return choiceOf(
      rng,
      { prompt: `In {k:${key.name}}, which chord is ${numberText(text)}?`, explain: why(text, key) },
      `{c:${symbol}}`,
      distinct(rivals, (s) => pcsKey([s]), 3, [pcsKey([symbol])]).map((s) => `{c:${s}}`),
    );
  },
});

/** The Nashville generator. */
export const NASHVILLE_GENERATORS = [nashville] as const;
