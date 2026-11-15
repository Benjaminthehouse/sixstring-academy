import { describe, expect, it } from 'vitest';
import { chord, formatChord, formatNote, intervalName } from '@/core/theory';
import { GLOSSARY, glossaryFor, glossaryTerm } from './glossary';
import { TEXT_LIMITS } from './limits';
import {
  describeSymbol, formatToken, looseSymbols, parseRichText, plainText, sayChord, sayDegree, sayInterval, sayKey, sayNote, sayRoman,
  speakable, textKey, textLength, tokenize,
} from './text';

describe('rich text parser', () => {
  it('parses plain text, bold and emphasis into tokens', () => {
    expect(tokenize('Play it **slowly** and *evenly*.')).toEqual([
      { type: 'text', text: 'Play it ', say: 'Play it ' },
      { type: 'text', text: 'slowly', say: 'slowly', bold: true },
      { type: 'text', text: ' and ', say: ' and ' },
      { type: 'text', text: 'evenly', say: 'evenly', em: true },
      { type: 'text', text: '.', say: '.' },
    ]);
  });

  it('parses every symbol tag with canonical value, display text and spoken words', () => {
    const tokens = tokenize('{n:F#} {c:Am7} {i:m3} {d:b3} {r:bVII} {k:F# minor}').filter((t) => t.type !== 'text');
    expect(tokens).toEqual([
      { type: 'note', value: 'F#', text: 'F♯', say: 'F sharp' },
      { type: 'chord', value: 'Am7', text: 'Am7', say: 'A minor seventh' },
      { type: 'interval', value: 'm3', text: 'm3', say: 'minor third' },
      { type: 'degree', value: 'b3', text: '♭3', say: 'flat 3' },
      { type: 'roman', value: 'bVII', text: '♭VII', say: 'flat seven' },
      { type: 'key', value: 'F# minor', text: 'F♯ minor', say: 'F sharp minor' },
    ]);
  });

  it('display text comes from the theory formatters', () => {
    for (const note of ['C', 'F#', 'Bb', 'F##', 'Ebb', 'E2']) expect(describeSymbol('note', note)!.text).toBe(formatNote(note));
    for (const symbol of ['C', 'Am7', 'F#m7b5/A', 'Bbmaj7', 'G7#9']) {
      expect(describeSymbol('chord', symbol)!.text).toBe(formatChord(symbol));
      expect(describeSymbol('chord', symbol)!.say).toContain(chord(symbol).type.name);
    }
    for (const ivl of ['m2', 'M3', 'P5', 'A4', 'd5', 'M9']) expect(describeSymbol('interval', ivl)!.say).toBe(intervalName(ivl));
  });

  it('canonicalises what authors type', () => {
    expect(describeSymbol('note', 'f#')!.value).toBe('F#');
    expect(describeSymbol('chord', 'C-7')!.value).toBe('Cm7');
    expect(describeSymbol('key', 'F#m')!.value).toBe('F# minor');
    expect(describeSymbol('note', 'H')).toBeNull();
    expect(describeSymbol('interval', 'x9')).toBeNull();
  });

  it('carries bold and emphasis onto symbols', () => {
    expect(tokenize('**{n:C}**')[0]).toMatchObject({ type: 'note', value: 'C', bold: true });
    expect(tokenize('*a {c:G7} chord*')[1]).toMatchObject({ type: 'chord', em: true });
  });

  it('links glossary terms, with an optional label', () => {
    const [a] = tokenize('{t:barre}');
    expect(a).toEqual({ type: 'term', id: 'barre', text: 'barre', say: 'barre', known: true });
    const [b] = tokenize('{t:eighth-note|eighth notes}');
    expect(b).toMatchObject({ type: 'term', id: 'eighth-note', text: 'eighth notes', known: true });
    const parsed = parseRichText('a {t:flux-capacitor}');
    expect(parsed.tokens[1]).toMatchObject({ type: 'term', id: 'flux-capacitor', known: false, text: 'flux-capacitor' });
    expect(parsed.problems[0]).toMatch(/not in the glossary.*course\.glossary/);
  });

  it('uses the course glossary when given', () => {
    const lookup = glossaryFor({ glossary: [{ id: 'travis-picking', term: 'Travis picking', definition: 'A fingerpicking pattern with a steady alternating thumb.' }] });
    const parsed = parseRichText('{t:travis-picking} and {t:barre}', { glossary: lookup });
    expect(parsed.problems).toEqual([]);
    expect(parsed.tokens[0]).toMatchObject({ text: 'Travis picking', known: true });
  });

  it('turns line breaks into break tokens and caps empty lines at one', () => {
    expect(tokenize('one\ntwo').map((t) => t.type)).toEqual(['text', 'break', 'text']);
    expect(tokenize('one\n\n\n\ntwo').map((t) => t.type)).toEqual(['text', 'break', 'break', 'text']);
  });

  it('numbers blanks', () => {
    const parsed = parseRichText('{n:C} ___ {n:E} _____ {n:G}');
    expect(parsed.blanks).toBe(2);
    expect(parsed.tokens.filter((t) => t.type === 'blank')).toEqual([{ type: 'blank', index: 0 }, { type: 'blank', index: 1 }]);
  });

  it('honours the backslash escape', () => {
    expect(plainText('5 \\* 2 and \\{braces\\} and a\\_\\_\\_b')).toBe('5 * 2 and {braces} and a___b');
    expect(parseRichText('5 \\* 2').problems).toEqual([]);
  });

  it('reports markup mistakes with a fix and keeps the text readable', () => {
    expect(parseRichText('a **bold word').problems[0]).toMatch(/"\*\*" is opened but never closed/);
    expect(parseRichText('an *open one').problems[0]).toMatch(/"\*" is opened but never closed/);
    expect(parseRichText('{x:1}').problems[0]).toMatch(/not a known tag.*\{n:note\}/);
    expect(parseRichText('{n:C').problems[0]).toMatch(/never closed/);
    const bad = parseRichText('play {n:H} now');
    expect(bad.problems[0]).toMatch(/does not hold a valid note/);
    expect(plainText('play {n:H} now')).toBe('play H now');
    expect(parseRichText('{c:Xyz}').problems[0]).toMatch(/valid chord/);
  });

  it('never throws on odd input', () => {
    for (const input of ['', '{', '}', '{}', '{:}', '{n:}', '***', '\\', '{t:}', '{t:|x}', '_', '__', '____']) {
      expect(() => parseRichText(input)).not.toThrow();
    }
    expect(() => parseRichText(undefined as unknown as string)).not.toThrow();
  });
});

describe('visible text', () => {
  it('plainText removes markup and typesets symbols', () => {
    expect(plainText('**{c:Em}** is {n:E}, {n:G} and {n:B}.')).toBe('Em is E, G and B.');
    expect(plainText('{n:Bb} to {n:F#}')).toBe('B♭ to F♯');
  });

  it('re-formats notes, chords and keys in the learner\'s naming system', () => {
    expect(plainText('{n:Bb} {c:Bbm} {k:B minor}', { format: { system: 'german' } })).toBe('B Bm H minor');
    expect(plainText('{n:F#}', { format: { system: 'solfege' } })).toBe('Fa♯');
    const [token] = tokenize('{n:B}');
    expect(formatToken(token, { system: 'german' })).toBe('H');
    expect(formatToken(token)).toBe('B');
  });

  it('counts visible characters, not markup', () => {
    expect(textLength('{c:Am7}')).toBe(3);
    expect(textLength('**bold**')).toBe(4);
    expect(textLength('{t:eighth-note|eighth notes}')).toBe(12);
    expect(textLength('{n:F##}')).toBe(2);
    expect(textLength('a ___ b')).toBe(9);
  });

  it('textKey compares what the learner sees', () => {
    expect(textKey('{n:F#}')).toBe(textKey('{n:f#}'));
    expect(textKey('  Major   Third ')).toBe('major third');
    expect(textKey('{n:F#}')).not.toBe(textKey('{n:Gb}'));
  });
});

describe('speakable text', () => {
  it('spells out symbols a speech engine would misread', () => {
    expect(speakable('Play {c:Am7}, then {c:D7}.')).toBe('Play A minor seventh, then D dominant seventh.');
    expect(speakable('{n:F#} is the {d:b3} of {k:Eb minor}')).toBe('F sharp is the flat 3 of E flat minor');
    expect(speakable('{r:ii} {r:V7} {r:I}')).toBe('two minor five seven one');
    expect(speakable('{c:C/E}')).toBe('C major over E');
  });

  it('the say override wins', () => {
    expect(speakable({ text: 'Play Am7.', say: 'Play A minor seven.' })).toBe('Play A minor seven.');
    expect(speakable({ text: '{c:Am7}', say: '  ' })).toBe('A minor seventh');
  });

  it('reads blanks and line breaks sensibly', () => {
    expect(speakable('{n:C} ___ {n:E}')).toBe('C blank E');
    expect(speakable('one\ntwo')).toBe('one\ntwo');
  });

  it('the say helpers', () => {
    expect(sayNote('F##')).toBe('F double sharp');
    expect(sayNote('Bbb3')).toBe('B double flat 3');
    expect(sayNote('E2')).toBe('E 2');
    expect(sayChord('F#m7b5')).toBe('F sharp half-diminished seventh');
    expect(sayInterval('P5')).toBe('perfect fifth');
    expect(sayInterval('-m3')).toBe('descending minor third');
    expect(sayDegree('#4')).toBe('sharp 4');
    expect(sayDegree('bb7')).toBe('double flat 7');
    expect(sayDegree('5')).toBe('5');
    expect(sayRoman('vii°')).toBe('seven diminished');
    expect(sayRoman('V7/ii')).toBe('five seven of two minor');
    expect(sayRoman('iiø7')).toBe('two half diminished seven');
    expect(sayKey('Bb')).toBe('B flat major');
  });
});

describe('loose symbols', () => {
  it('finds symbols typed as plain text and names the tag for each', () => {
    expect(looseSymbols('Play Am7 then G7 and Dsus4.')).toEqual([
      { symbol: 'Am7', tag: '{c:Am7}' },
      { symbol: 'G7', tag: '{c:G7}' },
      { symbol: 'Dsus4', tag: '{c:Dsus4}' },
    ]);
    expect(looseSymbols('a m3 and a P5').map((s) => s.tag)).toEqual(['{i:m3}', '{i:P5}']);
    expect(looseSymbols('the ii and IV chords, then V7 and bVII').map((s) => s.symbol)).toEqual(['ii', 'IV', 'V7', 'bVII']);
    expect(looseSymbols('the b3 and the #4').map((s) => s.tag)).toEqual(['{d:b3}', '{d:#4}']);
    expect(looseSymbols('C# and Bb').map((s) => s.tag)).toEqual(['{n:C#}', '{n:Bb}']);
  });

  it('leaves ordinary words, bare letters and tagged symbols alone', () => {
    for (const fine of [
      'I play A, then E.', 'Add a finger. A B C D E F G.', 'String 6, fret 3 is G.', 'In 4/4 time count 1 & 2 &.', 'The E2 string.', 'V is for victory.',
      'Dim the lights.', 'Be bold. Go on.', '{c:Am7} and {r:IV} and {i:m3} and {n:C#}', 'Frets 5 to 8', 'A4 paper',
    ]) {
      expect(looseSymbols(fine), fine).toEqual([]);
    }
  });
});

describe('glossary', () => {
  it('has unique slug ids and one-line definitions within the limits', () => {
    const ids = new Set<string>();
    for (const term of GLOSSARY) {
      expect(term.id, term.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(ids.has(term.id), term.id).toBe(false);
      ids.add(term.id);
      expect(term.term.length, term.id).toBeLessThanOrEqual(TEXT_LIMITS.glossaryTerm);
      expect(term.definition.length, term.id).toBeLessThanOrEqual(TEXT_LIMITS.glossaryDefinition);
      expect(term.definition, term.id).toMatch(/[.]$/);
      expect(term.definition.includes('\n'), term.id).toBe(false);
      expect(glossaryTerm(term.id)).toBe(term);
    }
    expect(GLOSSARY.length).toBeGreaterThan(70);
    expect(glossaryTerm('nope')).toBeNull();
    expect(glossaryTerm('constructor')).toBeNull();
  });

  it('states facts the theory engine agrees with', async () => {
    const theory = await import('@/core/theory');
    const def = (id: string): string => glossaryTerm(id)!.definition;
    // The step patterns quoted in the scale definitions are the engine's.
    const words = (id: string): string => theory.getScale(id)!.stepPattern.map((s) => (s === 'W' ? 'whole' : 'half')).join(', ');
    expect(def('major-scale')).toContain(words('major'));
    expect(def('minor-scale')).toContain(words('minor'));
    expect(theory.semitones('P8')).toBe(12);
    expect(def('octave')).toContain('twelve half steps');
    expect(theory.semitones('A4')).toBe(6);
    expect(def('tritone')).toContain('six half steps');
    // Relative minor: the sixth note of the major scale.
    expect(theory.relativeKey('C').tonic).toBe(theory.scaleNotes('C', 'major')[5]);
    expect(def('relative-minor')).toContain('sixth note');
    // Standard tuning as quoted.
    const guitar = await import('@/core/guitar');
    expect(def('tuning')).toContain(guitar.STANDARD_TUNING.label);
    // Note values in 4/4.
    expect(theory.noteValue('whole')!.beats).toBe(4);
    expect(def('whole-note')).toContain('four beats');
    expect(theory.noteValue('half')!.beats).toBe(2);
    expect(def('half-note')).toContain('two beats');
    expect(theory.noteValue('eighth')!.beats).toBe(0.5);
    expect(def('eighth-note')).toContain('half a beat');
    expect(theory.noteValue('sixteenth')!.beats).toBe(0.25);
    expect(def('sixteenth-note')).toContain('quarter of a beat');
    expect(theory.dottedTicks(960)).toBe(1440);
    expect(theory.tupletTicks(480, 3) * 3).toBe(960);
  });
});
