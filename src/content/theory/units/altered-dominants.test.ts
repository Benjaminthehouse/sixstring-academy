/**
 * Unit 35 of the Theory Path, cross-checked against the engines: every shape written beside a
 * chord, every altered tension and its spelling (`chordTones`, `transpose`), the half-step
 * resolutions, the altered scale and its melodic-minor parent (`scaleNotes`, `scaleModes`), every
 * tritone substitute and the tritone it shares (`tritoneSubstitute`), the backdoor dominant
 * (`romanToChord`), each diminished seventh as a rootless dominant 7 flat 9, what each listening
 * question plays, and that every lesson still teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import {
  chordNotes, chordPcs, chordTones, chordToRoman, enharmonicEqual, getScale, intervalBetween, parseChord, romanToChord, scaleModes,
  scaleNotes, scalePcs, transpose, tritoneSubstitute,
} from '@/core/theory';
import { buildVoicing, midiAt, moveVoicing, tryBuildVoicing } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type ChordBuildExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise,
  type MatchPairsExercise, type PlayChordExercise, type RichText, type Step, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './altered-dominants';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (steps: readonly unknown[]): Exercise[] =>
  (steps as Step[]).filter((s): s is Exercise => !!s && typeof s === 'object' && !isGenerated(s) && s.type !== 'card');
/** Every literal exercise: lesson steps, play alternatives, fact asks and the checkpoint. */
const allExercises = (): Exercise[] => {
  const top = [
    ...unit.lessons.flatMap((l) => [...exercises(l.steps), ...exercises((l.facts ?? []).map((f) => f.ask))]),
    ...exercises(unit.checkpoint?.steps ?? []),
  ];
  return [...top, ...exercises(top.flatMap((e) => ('alternative' in e ? [e.alternative] : [])))];
};
const ofType = <T extends Exercise>(type: T['type']): T[] => allExercises().filter((e): e is T => e.type === type);
const correctOption = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): RichText => e.options.find((o) => o.correct)?.text ?? '';
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const inLesson = (id: string): Exercise[] => [...exercises(lesson(id).steps), ...exercises((lesson(id).facts ?? []).map((f) => f.ask))];
const findIn = <T extends Exercise>(pool: Exercise[], type: T['type'], text: RegExp): T => {
  const found = pool.find((e) => e.type === type && text.test(plainText('prompt' in e ? e.prompt : '')));
  if (!found) throw new Error(`no ${type} matching ${text}`);
  return found as T;
};

/** Every string in the unit (texts, captions, options, facts). */
function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) texts(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) texts(v, out);
  return out;
}
/** The values of the tags of one kind in a text: `{c:Am7}` -> 'Am7'. */
function tagged(text: RichText, type: 'chord' | 'roman' | 'note' | 'key' | 'degree'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}
/** Every chord figure in the unit that names both a symbol and a shape. */
function chordFigures(value: unknown, out: Array<{ symbol: string; frets: string }> = []): Array<{ symbol: string; frets: string }> {
  if (Array.isArray(value)) for (const v of value) chordFigures(v, out);
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o.kind === 'chord' && typeof o.symbol === 'string' && typeof o.frets === 'string') out.push({ symbol: o.symbol, frets: o.frets });
    for (const v of Object.values(o)) chordFigures(v, out);
  }
  return out;
}
const pcOf = (note: string): number => scalePcs(note, 'major')[0];
const pcSet = (notes: readonly string[]): string => [...new Set(notes.map(pcOf))].sort((a, b) => a - b).join('.');
const rootOf = (symbol: string): string => parseChord(symbol)!.root;
/** The tension of a dominant 7th: its note for a degree label (b9, #9, #11, b13). */
const TENSION_INTERVALS: Record<string, string> = { b9: 'm9', '#9': 'A9', '#11': 'A11', b13: 'm13' };
const tension = (root: string, degree: string): string => transpose(root, TENSION_INTERVALS[degree]);
/** The rootless dominant 7 flat 9: what is left when the root goes. */
const rootless = (symbol: string): string[] => chordNotes(symbol).slice(1);

describe('altered-dominants: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^altered-/);
  });
});

describe('altered-dominants: every shape written in the text', () => {
  const pairs: Array<[string, string]> = [];
  for (const text of texts(unit)) for (const m of text.matchAll(/\{c:([^}]+)\}\s*\(([x0-9]{6})\)/g)) pairs.push([m[1], m[2]]);

  it('finds the shapes', () => {
    expect(pairs.length).toBeGreaterThan(20);
  });

  it('sounds exactly the chord it is written beside', () => {
    for (const [symbol, shape] of pairs) {
      const v = tryBuildVoicing(symbol, shape);
      expect(v, `${symbol} ${shape}`).not.toBeNull();
      expect(v!.chord, `${symbol} ${shape}`).toBe(symbol);
    }
  });

  it('builds every chord figure, chord-build and play-chord shape as its chord', () => {
    const figures = chordFigures(unit);
    expect(figures.length).toBeGreaterThanOrEqual(2);
    for (const f of figures) expect(buildVoicing(f.symbol, f.frets).chord, `${f.symbol} ${f.frets}`).toBe(f.symbol);
    const shaped: Array<ChordBuildExercise | PlayChordExercise> = [
      ...ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers'),
      ...ofType<PlayChordExercise>('play-chord'),
    ];
    expect(shaped.length).toBe(11); // five play-chord steps, their five alternatives, the E7#9 shape
    for (const e of shaped) expect(buildVoicing(e.chord, e.frets!).chord, `${e.chord} ${String(e.frets)}`).toBe(e.chord);
    // The shapes offered as choices are named by the chord the "why" gives them.
    expect(buildVoicing('E9', 'x7677x').chord).toBe('E9');
    expect(buildVoicing('E7', 'x7675x').chord).toBe('E7');
  });
});

describe('altered-dominants: altered tensions', () => {
  it('names the tensions of G7 and C7 as the engine spells them', () => {
    expect(['b9', '#9', '#11', 'b13'].map((d) => tension('G', d))).toEqual(['Ab', 'A#', 'C#', 'Eb']);
    expect(['b9', '#9', '#11', 'b13'].map((d) => tension('C', d))).toEqual(['Db', 'D#', 'F#', 'Ab']);
    for (const e of ofType<MatchPairsExercise>('match-pairs').filter((x) => /altered tension with its note/.test(plainText(x.prompt)))) {
      const root = rootOf(tagged(e.prompt, 'chord')[0]);
      for (const p of e.pairs) expect(tagged(p.right, 'note')[0], `${root} ${plainText(p.left)}`).toBe(tension(root, tagged(p.left, 'degree')[0]));
    }
    // The catalogue's own spelling of the altered chord agrees.
    const alt = chordTones('G7alt');
    for (const d of ['b9', '#9', '#11', 'b13']) expect(alt.find((t) => t.degree === d)!.note, d).toBe(tension('G', d));
  });

  it('spells the 7 flat 9 and 7 sharp 9 chords, and the b13 and #9 typed answers', () => {
    expect(chordNotes('G7b9')).toEqual(['G', 'B', 'D', 'F', 'Ab']);
    expect(chordNotes('G7#9')).toEqual(['G', 'B', 'D', 'F', 'A#']);
    for (const e of ofType<FillBlanksExercise>('fill-blanks').filter((x) => /Spell \{c:G7/.test(String(x.prompt)))) {
      const symbol = tagged(e.prompt, 'chord')[0];
      expect([...tagged(e.text, 'note'), ...e.blanks.map((b) => tagged(b, 'note')[0])], symbol).toEqual(chordNotes(symbol));
      // The bank's enharmonic twin is the trap: same pitch, wrong letter.
      expect(e.spelling).toBe('exact');
    }
    for (const e of ofType<TypeAnswerExercise>('type-answer').filter((x) => x.answer.kind === 'note' && /\{d:/.test(String(x.prompt)))) {
      const symbol = tagged(e.prompt, 'chord')[0];
      const degree = tagged(e.prompt, 'degree')[0];
      expect(e.answer.value, plainText(e.prompt)).toBe(chordTones(symbol.replace(/7.*/, `7${degree}`)).find((t) => t.degree === degree)?.note ?? tension(rootOf(symbol), degree));
      expect(e.answer.value, plainText(e.prompt)).toBe(tension(rootOf(symbol), degree));
    }
    // The #11 is the b5 by sound, the b13 the #5.
    expect(enharmonicEqual(tension('G', '#11'), transpose('G', 'd5'))).toBe(true);
    expect(enharmonicEqual(tension('G', 'b13'), transpose('G', 'A5'))).toBe(true);
  });

  it('slides the flat 9 of 3231xx down a half step into Cmaj7', () => {
    const g7b9 = buildVoicing('G7b9', '3231xx');
    const ab = g7b9.notes.find((n) => n.string === 3)!;
    expect(ab.note).toBe('Ab');
    expect(ab.degree).toBe('b9');
    const cmaj7 = buildVoicing('Cmaj7', 'x3545x');
    expect(cmaj7.midi).toContain(ab.midi - 1); // G3, the 5th of C
    expect(chordTones('C').find((t) => t.role === 'fifth')!.note).toBe('G');
    const card = lesson('altered-tensions').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected a fretboard card');
    expect(card.figure.dots!.map((d) => `${d.string}:${d.fret}`)).toEqual(g7b9.notes.map((n) => `${n.string}:${n.fret}`));
  });
});

describe('altered-dominants: the sharp-nine chord', () => {
  it('builds E7#9 as x7678x with F## on string 2, and D7#9 two frets down', () => {
    const e = buildVoicing('E7#9', 'x7678x');
    expect(e.notes.map((n) => `${n.note} ${n.degree}`)).toEqual(['E 1', 'G# 3', 'D b7', 'F## #9']);
    expect(chordTones('E7#9').find((t) => t.degree === '#9')!.note).toBe('F##');
    expect(enharmonicEqual('F##', 'G')).toBe(true);
    expect(moveVoicing(e, -2)!.frets).toEqual(buildVoicing('D7#9', 'x5456x').frets);
    expect(buildVoicing('D7#9', 'x5456x').notes.find((n) => n.string === 2)!.note).toBe('E#');
    // The #9 sounds a minor 3rd above the root, an octave over the major 3rd.
    const third = e.notes.find((n) => n.degree === '3')!;
    const sharp9 = e.notes.find((n) => n.degree === '#9')!;
    expect((sharp9.midi - e.notes[0].midi) % 12).toBe(3);
    expect(sharp9.midi - third.midi).toBe(11);
    const card = lesson('the-sharp-nine-chord').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected a fretboard card');
    expect(card.figure.dots!.map((d) => d.note)).toEqual(e.notes.map((n) => n.note));
  });

  it('types the sharp 9 of C7#9 and F7#9', () => {
    expect(chordTones('C7#9').find((t) => t.degree === '#9')!.note).toBe('D#');
    expect(chordTones('F7#9').find((t) => t.degree === '#9')!.note).toBe('G#');
  });
});

describe('altered-dominants: the altered scale', () => {
  const G_ALT = ['G', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'];

  it('spells G altered and finds it as the 7th mode of Ab melodic minor', () => {
    expect(scaleNotes('G', 'altered')).toEqual(G_ALT);
    const ab = scaleNotes('Ab', 'melodic-minor');
    expect([...ab.slice(6), ...ab.slice(0, 6)]).toEqual(G_ALT);
    expect(scaleModes('melodic-minor')[6].scale?.id).toBe('altered');
    expect(getScale('altered')!.size).toBe(7);
    // E altered is F melodic minor from its 7th note; A altered is Bb melodic minor.
    const f = scaleNotes('F', 'melodic-minor');
    expect([...f.slice(6), ...f.slice(0, 6)]).toEqual(scaleNotes('E', 'altered'));
    const bb = scaleNotes('Bb', 'melodic-minor');
    expect([...bb.slice(6), ...bb.slice(0, 6)]).toEqual(scaleNotes('A', 'altered'));
    const typed = findIn<TypeAnswerExercise>(inLesson('seven-alt-and-the-altered-scale'), 'type-answer', /E altered/);
    expect(typed.answer.value).toBe('F');
    const choice = findIn<ChoiceExercise>(inLesson('seven-alt-and-the-altered-scale'), 'choice', /same notes as G altered/);
    expect(tagged(correctOption(choice), 'note')[0]).toBe('Ab');
    // The distractor parents really hold other notes.
    for (const t of ['G', 'F', 'Db']) expect(pcSet(scaleNotes(t, 'melodic-minor')), t).not.toBe(pcSet(G_ALT));
  });

  it('fills the altered scales with the right letters', () => {
    for (const e of ofType<FillBlanksExercise>('fill-blanks').filter((x) => /altered\.$/.test(plainText(x.prompt)))) {
      const tonic = tagged(e.prompt, 'note')[0];
      const filled: string[] = [];
      let b = 0;
      for (const token of String(e.text).split(/\s+/)) filled.push(token === '___' ? tagged(e.blanks[b++], 'note')[0] : tagged(token, 'note')[0]);
      expect(filled, plainText(e.prompt)).toEqual(scaleNotes(tonic, 'altered'));
    }
  });

  it('labels every note of G altered around fret 3 with its job over G7', () => {
    const JOBS: Record<string, string> = { G: '1', Ab: 'b9', Bb: '#9', Cb: '3', Db: '#11', Eb: 'b13', F: 'b7' };
    const card = lesson('seven-alt-and-the-altered-scale').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected a fretboard card');
    const dots = card.figure.dots!;
    // Every place in frets 1 to 4 where a note of the scale sounds, and nothing else.
    const scale = new Set(G_ALT.map(pcOf));
    const expected = [6, 5, 4, 3, 2, 1].flatMap((s) => [1, 2, 3, 4].filter((f) => scale.has(midiAt({ string: s, fret: f }) % 12)).map((f) => `${s}:${f}`));
    expect(dots.map((d) => `${d.string}:${d.fret}`)).toEqual(expected);
    for (const d of dots) {
      expect(pcOf(d.note!), `${d.string}:${d.fret}`).toBe(midiAt({ string: d.string, fret: d.fret }) % 12);
      expect(d.degree, d.note).toBe(JOBS[d.note!]);
    }
    // The jobs agree with the altered chord: 3 is B (spelled Cb), #9 is A# (spelled Bb), #11 is C# (spelled Db).
    const alt = chordTones('G7alt');
    for (const [note, job] of Object.entries(JOBS)) {
      const t = alt.find((x) => x.degree === job);
      if (t) expect(pcOf(t.note), job).toBe(pcOf(note));
    }
  });
});

describe('altered-dominants: tritone substitution', () => {
  const guide = (symbol: string): string[] => chordTones(symbol).filter((t) => t.role === 'third' || t.role === 'seventh').map((t) => t.note);

  it('pairs each dominant with the substitute the engine gives, sharing its 3rd and 7th', () => {
    for (const e of ofType<MatchPairsExercise>('match-pairs').filter((x) => /tritone substitute/.test(plainText(x.prompt)))) {
      for (const p of e.pairs) {
        const v = tagged(p.left, 'chord')[0];
        const sub = tagged(p.right, 'chord')[0];
        expect(tritoneSubstitute(v), v).toBe(sub);
        expect(pcSet(guide(v)), v).toBe(pcSet(guide(sub)));
        expect(['A4', 'd5']).toContain(intervalBetween(rootOf(v), rootOf(sub)));
      }
    }
    for (const e of ofType<TypeAnswerExercise>('type-answer').filter((x) => /tritone substitute of/.test(plainText(x.prompt)))) {
      expect(e.answer.value, plainText(e.prompt)).toBe(tritoneSubstitute(tagged(e.prompt, 'chord')[0]));
    }
    expect(chordNotes('Db7')).toEqual(['Db', 'F', 'Ab', 'Cb']);
    expect(chordToRoman('Db7', 'C').relation).toBe('tritone-substitute');
  });

  it('answers the shared-notes choices by sound', () => {
    for (const e of ofType<ChoiceExercise>('choice').filter((x) => /share in sound/.test(plainText(x.prompt)))) {
      const [a, b] = tagged(e.prompt, 'chord');
      const shared = pcSet(chordNotes(a).filter((n) => chordNotes(b).some((m) => pcOf(m) === pcOf(n))));
      for (const o of e.options) expect(pcSet(tagged(o.text!, 'note')) === shared, `${a}/${b}: ${plainText(o.text!)}`).toBe(!!o.correct);
    }
  });

  it('slides the bass D Db C on string 5 and puts the shared B on string 3', () => {
    const shells = [buildVoicing('Dm7', 'x5x56x'), buildVoicing('Db7', 'x4x46x'), buildVoicing('Cmaj7', 'x3x45x')];
    expect(shells.map((v) => v.notes[0].midi)).toEqual([50, 49, 48]);
    expect(shells.map((v) => v.notes[0].string)).toEqual([5, 5, 5]);
    const g7 = buildVoicing('G7', '3x34xx');
    expect(g7.notes.find((n) => n.string === 3)!.midi).toBe(shells[1].notes.find((n) => n.string === 3)!.midi); // B3 = Cb4
    expect(shells[1].notes.find((n) => n.string === 3)!.note).toBe('Cb');
    // In G major the swap is D7 -> Ab7, with the bass A Ab G.
    expect(romanToChord('V7', 'G')).toBe('D7');
    const fill = findIn<FillBlanksExercise>(inLesson('tritone-substitution'), 'fill-blanks', /G major/);
    expect(tagged(fill.blanks[0], 'chord')[0]).toBe(tritoneSubstitute('D7'));
    expect([rootOf('Am7'), rootOf('Ab7'), rootOf('Gmaj7')].map(pcOf)).toEqual([9, 8, 7]);
  });
});

describe('altered-dominants: the backdoor dominant', () => {
  it('builds the backdoor dominant and two-five of each key it names', () => {
    expect(romanToChord('bVII7', 'C')).toBe('Bb7');
    expect(romanToChord('iv7', 'C')).toBe('Fm7');
    for (const e of ofType<TypeAnswerExercise>('type-answer').filter((x) => /backdoor dominant/.test(plainText(x.prompt)))) {
      const key = tagged(e.prompt, 'key')[0];
      expect(e.answer.value, plainText(e.prompt)).toBe(romanToChord('bVII7', key));
      expect(intervalBetween(rootOf(String(e.answer.value)), key.split(' ')[0]), key).toBe('M2');
    }
    const fill = findIn<FillBlanksExercise>(inLesson('backdoor-dominant'), 'fill-blanks', /backdoor/);
    expect(tagged(fill.blanks[0], 'chord')[0]).toBe(romanToChord('bVII7', 'C'));
    expect(chordToRoman('Bb7', 'C').roman).toBe('bVII7');
  });

  it('shares D, F and Ab with G7b9, and lets the Ab of x13131 fall to G', () => {
    const shared = chordNotes('Bb7').filter((n) => chordNotes('G7b9').includes(n));
    expect(shared).toEqual(['D', 'F', 'Ab']);
    const q = findIn<ChoiceExercise>(inLesson('backdoor-dominant'), 'choice', /share with/);
    expect(tagged(correctOption(q), 'note')).toEqual(shared);
    const ab = buildVoicing('Bb7', 'x13131').notes.find((n) => n.string === 3)!;
    expect(ab.note).toBe('Ab');
    expect(buildVoicing('Cmaj7', 'x3545x').midi).toContain(ab.midi - 1);
  });
});

describe('altered-dominants: the diminished seventh as a dominant', () => {
  it('is G7b9 without its root, and the vii°7 of C', () => {
    expect(chordNotes('Bdim7')).toEqual(rootless('G7b9'));
    expect(romanToChord('vii°7', 'C')).toBe('Bdim7');
    expect(chordNotes('C#dim7')).toEqual(rootless('A7b9'));
    expect(chordNotes('G#dim7')).toEqual(rootless('E7b9'));
  });

  it('offers no other dominant that hides the same diminished chord', () => {
    for (const e of ofType<ChoiceExercise>('choice').filter((x) => /without its root\?/.test(plainText(x.prompt)))) {
      const dim = tagged(e.prompt, 'chord')[0];
      for (const o of e.options) {
        const dom = tagged(o.text!, 'chord')[0];
        const left = dom.endsWith('b9') ? rootless(dom) : rootless(`${dom}b9`).slice(0, 3);
        expect(dom.endsWith('b9') && pcSet(left) === pcSet(chordNotes(dim)), `${dim}: ${dom}`).toBe(!!o.correct);
      }
    }
    // The why texts name the right leftovers.
    expect(pcSet(rootless('C7b9'))).toBe(pcSet(chordNotes('Edim7')));
    expect(pcSet(rootless('A7b9'))).toBe(pcSet(chordNotes('C#dim7')));
    expect(pcSet(rootless('D7b9'))).toBe(pcSet(chordNotes('F#dim7')));
    expect(rootless('G7')).toEqual(['B', 'D', 'F']);
  });

  it('types and fills the diminished 7th a half step below each target', () => {
    for (const e of ofType<TypeAnswerExercise>('type-answer').filter((x) => /diminished 7th chord that leads to/.test(plainText(x.prompt)))) {
      const target = tagged(e.prompt, 'chord')[0];
      expect(intervalBetween(rootOf(String(e.answer.value)), rootOf(target)), plainText(e.prompt)).toBe('m2');
      expect(parseChord(String(e.answer.value))!.type.id).toBe('dim7');
    }
    const fill = findIn<FillBlanksExercise>(inLesson('diminished-as-dominant'), 'fill-blanks', /the rootless/);
    expect([...tagged(fill.text, 'note'), tagged(fill.blanks[0], 'note')[0]]).toEqual(chordNotes('C#dim7'));
    // Every note of Bdim7 is a step from a note of C: B to C, Ab to G.
    expect(buildVoicing('Bdim7', 'x2313x').notes.map((n) => n.note)).toEqual(['B', 'F', 'Ab', 'D']);
    const dist = (x: string, y: string): number => Math.min((pcOf(x) - pcOf(y) + 12) % 12, (pcOf(y) - pcOf(x) + 12) % 12);
    for (const [x, y] of [['B', 'C'], ['Ab', 'G']]) expect(dist(x, y), `${x} to ${y}`).toBe(1);
    for (const n of chordNotes('Bdim7')) expect(Math.min(...chordNotes('C').map((c) => dist(n, c))), n).toBeLessThanOrEqual(2);
  });
});

describe('altered-dominants: what each listening question plays', () => {
  const chordsOf = (q: ListenChoiceExercise): string[] => {
    if (q.sound.kind !== 'progression') throw new Error('expected a progression');
    return q.sound.chords;
  };

  it('plays the altered chords the answers name', () => {
    const [b9] = listens(lesson('altered-tensions'));
    expect(soundPlan(b9.sound).events[0].midi).toEqual(buildVoicing('G7b9', '3231xx').midi);
    expect(tagged(correctOption(b9), 'chord')).toEqual(['G7b9']);
    const [s9] = listens(lesson('the-sharp-nine-chord'));
    expect(soundPlan(s9.sound).events[0].midi).toEqual(buildVoicing('D7#9', 'x5456x').midi);
    expect(tagged(correctOption(s9), 'chord')).toEqual(['D7#9']);
  });

  it('plays G altered, not Mixolydian', () => {
    const [q] = listens(lesson('seven-alt-and-the-altered-scale'));
    const heard = soundPlan(q.sound).events.map((e) => e.midi[0] % 12);
    expect(heard.slice(0, 7)).toEqual(scaleNotes('G', 'altered').map(pcOf));
    expect(plainText(correctOption(q))).toBe('Altered');
  });

  it('plays the ii-subV-I in the lesson and the ii-V-I in the checkpoint', () => {
    const [q] = listens(lesson('tritone-substitution'));
    expect(chordsOf(q)).toEqual(['Dm7', tritoneSubstitute('G7'), 'Cmaj7']);
    expect(tagged(correctOption(q), 'roman')).toContain('subV7');
    const cp = exercises(unit.checkpoint!.steps!).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(chordsOf(cp)).toEqual(['ii7', 'V7', 'Imaj7'].map((r) => romanToChord(r, 'C')));
    expect(tagged(correctOption(cp), 'roman')).toContain('V7');
  });

  it('plays the backdoor two-five', () => {
    const [q] = listens(lesson('backdoor-dominant'));
    expect(chordsOf(q)).toEqual(['iv7', 'bVII7', 'Imaj7'].map((r) => romanToChord(r, 'C')));
    expect(plainText(correctOption(q))).toBe('Backdoor');
  });

  it('climbs a half step in the bass from C#dim7 into Dm7', () => {
    const [q] = listens(lesson('diminished-as-dominant'));
    const bass = soundPlan(q.sound).events.map((e) => Math.min(...e.midi));
    const chords = chordsOf(q);
    const at = chords.indexOf('C#dim7');
    expect(bass[at + 1] - bass[at]).toBe(1);
    expect(intervalBetween(rootOf(chords[at]), rootOf(chords[at + 1]))).toBe('m2');
    expect(plainText(correctOption(q))).toMatch(/^Yes/);
    for (const c of chords) expect(chordPcs(c).length).toBeGreaterThanOrEqual(3);
  });
});

describe('altered-dominants: on the go', () => {
  it('still teaches with the sound off and with the guitar away', () => {
    for (const c of [{ guitar: false, sound: true }, { guitar: false, sound: false }, { guitar: true, sound: false }]) {
      const adapted = adaptUnit(unit, c);
      for (const l of adapted.lessons) {
        const asked = l.steps.filter((s) => isGenerated(s) || s.type !== 'card');
        expect(asked.length, `${l.id} ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(MIN_QUIET_EXERCISES + 2);
        expect(asked.some((s) => !isGenerated(s) && s.type.startsWith('play-')), `${l.id}: a play step is left`).toBe(false);
        if (!c.sound) expect(asked.some((s) => isListeningStep(s)), `${l.id}: a listening step is left`).toBe(false);
      }
      expect(adapted.checkpoint?.steps?.length ?? 0, JSON.stringify(c)).toBeGreaterThanOrEqual(12);
    }
  });
});
