import { describe, expect, it } from 'vitest';
import { midiAt, tuning } from '@/core/guitar';
import { formatNote } from '@/core/theory';
import { explainFindMiss, explainNameMiss, anchorSentence } from './explain';
import { gradeName, gradePlayed, gradeTap, remaining, settle } from './grade';
import { midiAtPos, octaveShape, pcAt, placesInScope, scopePositions } from './neck';
import { pcForKey, pcOfName, spell } from './notes';
import { recordAnswer } from './stats';
import type { EveryQuestion, FindQuestion, NameQuestion, NeckContext, OctaveQuestion, PlayQuestion } from './types';

const ctx: NeckContext = { tuning: tuning('standard').midi, spelling: 'sharps' };
const fmt = (n: string) => formatNote(n);

const nameQ = (string: number, fret: number, spelling = ctx.spelling): NameQuestion => {
  const pos = { string, fret };
  const pc = pcAt(ctx, pos);
  return { kind: 'name', index: 0, item: `${string}:${fret}`, pc, name: spell(pc, spelling), pos, midi: midiAtPos(ctx, pos) };
};

describe('the neck agrees with the guitar engine', () => {
  it('every position up to fret 24 sounds what core/guitar says, in several tunings', () => {
    for (const id of ['standard', 'drop-d', 'dadgad', 'open-g', 'standard-7']) {
      const t = tuning(id);
      const c: NeckContext = { tuning: t.midi, spelling: 'sharps' };
      for (let s = 1; s <= t.stringCount; s++) for (let f = 0; f <= 24; f++) expect(midiAtPos(c, { string: s, fret: f })).toBe(midiAt({ string: s, fret: f }, { tuning: t }));
    }
  });

  it('a scope covers exactly its strings, frets and note set', () => {
    const naturals = scopePositions({ strings: [6], frets: [0, 12], notes: 'naturals' }, ctx).map((p) => p.fret);
    expect(naturals).toEqual([0, 1, 3, 5, 7, 8, 10, 12]);
    const accidentals = scopePositions({ strings: [5], frets: [0, 12], notes: 'accidentals' }, ctx).map((p) => p.fret);
    expect(accidentals).toEqual([1, 4, 6, 9, 11]);
    // Every C between the nut and fret 12: one per string.
    expect(placesInScope({ strings: [1, 2, 3, 4, 5, 6], frets: [0, 12], notes: 'all' }, ctx, 0).map((p) => `${p.string}:${p.fret}`)).toEqual(['1:8', '2:1', '3:5', '4:10', '5:3', '6:8']);
  });

  it('octave shapes are the ones guitarists use in standard tuning', () => {
    expect(octaveShape(ctx, 6, 4)).toMatchObject({ shift: 2, octaves: 1 });
    expect(octaveShape(ctx, 5, 3)).toMatchObject({ shift: 2, octaves: 1 });
    expect(octaveShape(ctx, 4, 2)).toMatchObject({ shift: 3, octaves: 1 });
    expect(octaveShape(ctx, 3, 1)).toMatchObject({ shift: 3, octaves: 1 });
    expect(octaveShape(ctx, 6, 1)).toMatchObject({ shift: 0, octaves: 2 });
    expect(octaveShape(ctx, 5, 2)).toMatchObject({ shift: -2, octaves: 1 });
    expect(octaveShape(ctx, 6, 5)).toBeNull();
    // Each shape lands on the same note an octave (or two) up.
    for (const [a, b] of [[6, 4], [5, 3], [4, 2], [3, 1], [6, 1]] as const) {
      const shape = octaveShape(ctx, a, b)!;
      for (let f = 0; f <= 9; f++) {
        if (f + shape.shift < 0) continue;
        expect(midiAtPos(ctx, { string: b, fret: f + shape.shift }) - midiAtPos(ctx, { string: a, fret: f })).toBe(12 * shape.octaves);
      }
    }
  });
});

describe('grading', () => {
  it('a name is right by sound: C# and Db are the same answer', () => {
    const q = nameQ(6, 9, 'both'); // C#2 / Db2
    expect(gradeName(q, pcOfName('C#')!, ctx).right).toBe(true);
    expect(gradeName(q, pcOfName('Db')!, ctx).right).toBe(true);
    expect(gradeName(q, pcOfName('D')!, ctx).right).toBe(false);
  });

  it('a wrong name says where the named note really is on that string', () => {
    const q = nameQ(5, 3); // C on the A string
    const g = gradeName(q, pcOfName('B')!, ctx);
    expect(g.right).toBe(false);
    expect(g.givenAt).toEqual({ string: 5, fret: 2 });
    const lines = explainNameMiss(q, pcOfName('B')!, g.givenAt, ctx, fmt);
    expect(lines[0]).toBe('This is C.');
    expect(lines).toContain('It sits on the dot at fret 3.');
    expect(lines).toContain('B is at fret 2 on this string.');
  });

  it('explains a note from the nearest landmark', () => {
    expect(anchorSentence(ctx, { string: 5, fret: 7 }, 'E', fmt)).toBe('The dot at fret 5 is D; two frets up is E.');
    expect(anchorSentence(ctx, { string: 6, fret: 8 }, 'C', fmt)).toBe('The dot at fret 7 is B; one fret up is C.');
    // Fret 10 on the low E: the double dot (E) is two frets away and a natural; fret 9 is C#.
    expect(anchorSentence(ctx, { string: 6, fret: 10 }, 'D', fmt)).toBe('The double dot at fret 12 is E; two frets down is D.');
    expect(anchorSentence(ctx, { string: 3, fret: 2 }, 'A', fmt)).toBe('The open string is G; two frets up is A.');
  });

  it('every anchor sentence is musically true: the anchor note plus the distance is the note', () => {
    for (let s = 1; s <= 6; s++) {
      for (let f = 1; f <= 15; f++) {
        const p = { string: s, fret: f };
        const name = spell(pcAt(ctx, p), 'sharps');
        const text = anchorSentence(ctx, p, name, (n) => n);
        if (!text) continue;
        const m = /(?:fret (\d+)|open string) is ([A-G]#?); (\w+) frets? (up|down) is ([A-G]#?)\./.exec(text);
        expect(m, text).not.toBeNull();
        const anchorFret = m![1] ? Number(m![1]) : 0;
        const words = ['zero', 'one', 'two', 'three', 'four'];
        const d = words.indexOf(m![3]) * (m![4] === 'up' ? 1 : -1);
        expect(anchorFret + d).toBe(f);
        expect(pcAt(ctx, { string: s, fret: anchorFret })).toBe(pcOfName(m![2]));
        expect(pcOfName(m![5])).toBe(pcAt(ctx, p));
      }
    }
  });

  it('find: the right note on the right string, the wrong string is a nudge, not a miss', () => {
    const pos = { string: 5, fret: 3 };
    const q: FindQuestion = { kind: 'find', index: 0, item: '5:3', pc: 0, name: 'C', pos, string: 5, targets: [pos] };
    expect(gradeTap(q, { string: 5, fret: 3 }, ctx)).toBe('right');
    expect(gradeTap(q, { string: 5, fret: 15 }, ctx)).toBe('right');
    expect(gradeTap(q, { string: 5, fret: 5 }, ctx)).toBe('wrong');
    expect(gradeTap(q, { string: 2, fret: 1 }, ctx)).toBe('other-string');
    const lines = explainFindMiss(q, { string: 5, fret: 5 }, ctx, fmt);
    expect(lines[0]).toBe('That one is D (fret 5).');
    expect(lines[1]).toBe('C on this string: fret 3.');
  });

  it('find every: each new place counts once, repeats are ignored', () => {
    const targets = placesInScope({ strings: [1, 2, 3, 4, 5, 6], frets: [0, 12], notes: 'all' }, ctx, 7);
    const q: EveryQuestion = { kind: 'every', index: 0, item: 'pc:7', pc: 7, name: 'G', targets };
    expect(gradeTap(q, { string: 6, fret: 3 }, ctx, [])).toBe('found');
    expect(gradeTap(q, { string: 6, fret: 3 }, ctx, [{ string: 6, fret: 3 }])).toBe('again');
    expect(gradeTap(q, { string: 6, fret: 4 }, ctx, [])).toBe('wrong');
    expect(remaining(q, [{ string: 6, fret: 3 }]).length).toBe(targets.length - 1);
  });

  it('octave: any place of that note on the target string counts', () => {
    const q: OctaveQuestion = { kind: 'octave', index: 0, item: '4:5', pc: 7, name: 'G', from: { string: 6, fret: 3 }, string: 4, pos: { string: 4, fret: 5 }, targets: [{ string: 4, fret: 5 }], shift: 2, octaves: 1 };
    expect(gradeTap(q, { string: 4, fret: 5 }, ctx)).toBe('right');
    expect(gradeTap(q, { string: 4, fret: 7 }, ctx)).toBe('wrong');
    expect(gradeTap(q, { string: 6, fret: 3 }, ctx)).toBe('other-string');
    expect(explainFindMiss(q, { string: 4, fret: 7 }, ctx, fmt)[1]).toBe('The shape is two strings up, two frets up: fret 3 on string 6 goes to fret 5 on string 4.');
  });

  it('play it: exact pitch by default, any octave when asked', () => {
    const q: PlayQuestion = { kind: 'play', index: 0, item: '3:5', pc: 0, name: 'C', pos: { string: 3, fret: 5 }, string: 3, midis: [60] };
    expect(gradePlayed(q, 60, 'exact')).toBe(true);
    expect(gradePlayed(q, 60.3, 'exact')).toBe(true);
    expect(gradePlayed(q, 48, 'exact')).toBe(false);
    expect(gradePlayed(q, 48, 'any')).toBe(true);
    expect(gradePlayed(q, 62, 'any')).toBe(false);
  });

  it('settles a question into the stats: misses count against the place asked', () => {
    const q = nameQ(6, 5);
    const right = settle(q, { right: true, ms: 1300, wrongTaps: [], found: [] }, {}, ctx);
    expect(right.result).toMatchObject({ score: 1, right: true, ms: 1300 });
    expect(right.stats['6:5']).toEqual({ n: 1, ok: 1, ms: 1300 });
    const wrong = settle(q, { right: false, ms: null, wrongTaps: [], found: [] }, right.stats, ctx);
    expect(wrong.result).toMatchObject({ score: 0, right: false, missed: [{ string: 6, fret: 5 }] });
    expect(wrong.stats['6:5']).toEqual({ n: 2, ok: 1, ms: 1300 });
  });

  it('settles "find every" by places found against places plus wrong taps', () => {
    const targets = [{ string: 6, fret: 3 }, { string: 4, fret: 5 }, { string: 1, fret: 3 }];
    const q: EveryQuestion = { kind: 'every', index: 0, item: 'pc:7', pc: 7, name: 'G', targets };
    const { result, stats } = settle(q, { right: false, ms: null, wrongTaps: [{ string: 5, fret: 5 }], found: targets.slice(0, 2), gaveUp: true }, {}, ctx);
    expect(result.score).toBeCloseTo(2 / 4);
    expect(stats['6:3']).toMatchObject({ n: 1, ok: 1 });
    expect(stats['5:5']).toMatchObject({ n: 1, ok: 0 });
    expect(stats['1:3']).toMatchObject({ n: 1, ok: 0 });
  });

  it('find credits the place actually tapped', () => {
    const pos = { string: 5, fret: 3 };
    const q: FindQuestion = { kind: 'find', index: 0, item: '5:3', pc: 0, name: 'C', pos, string: 5, targets: [pos, { string: 5, fret: 15 }] };
    const { stats } = settle(q, { right: true, ms: 900, wrongTaps: [], found: [], tapped: { string: 5, fret: 15 } }, recordAnswer({}, pos, true, 1000), ctx);
    expect(stats['5:15']).toMatchObject({ n: 1, ok: 1 });
    expect(stats['5:3']).toMatchObject({ n: 1, ok: 1 });
  });
});

describe('note names and keys', () => {
  it('spells both ways and reads names back', () => {
    expect(spell(1, 'sharps')).toBe('C#');
    expect(spell(1, 'flats')).toBe('Db');
    expect(spell(1, 'both', true)).toBe('Db');
    expect(spell(4, 'flats')).toBe('E');
    expect(pcOfName('E#')).toBe(5);
    expect(pcOfName('Cb')).toBe(11);
    expect(pcOfName('H')).toBeNull();
  });

  it('keys A–G answer naturals; Shift raises (or lowers, with flats)', () => {
    expect(pcForKey('c', false, 'sharps')).toBe(0);
    expect(pcForKey('C', true, 'sharps')).toBe(1);
    expect(pcForKey('D', true, 'flats')).toBe(1);
    expect(pcForKey('x', false, 'sharps')).toBeNull();
    expect(pcForKey('h', false, 'sharps', true)).toBe(11);
    expect(pcForKey('b', false, 'sharps', true)).toBe(10);
    expect(pcForKey('B', true, 'flats', true)).toBe(10);
    expect(pcForKey('h', false, 'sharps', false)).toBeNull();
  });
});
