/**
 * Unit 41 of the Theory Path, cross-checked against the engines: every shape written beside a
 * chord, the song map's sections in G, the letters each form sound plays, the period (every melody
 * note against its bar's chord, the half and authentic cadences), the two guitars' registers and
 * the capo arithmetic, the "Ode to Joy" chord melody (tune, top notes, frets), the bass lines
 * (roots, 5ths, half-step approaches), the borrowed and secondary chords, what each listening
 * question plays, and that every lesson still teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import {
  chordNotes, chordPcs, chordToRoman, classifyCadence, diatonicChords, intervalBetween, transpose, transposeChordBySemitones,
} from '@/core/theory';
import { buildVoicing, midiAt, tryBuildVoicing } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, tokenize, validateCourse,
  type ChoiceExercise, type ChordBuildExercise, type Exercise, type Lesson, type ListenChoiceExercise, type PlayChordExercise,
  type PlayPhraseExercise, type RichText, type Step, type TabNote, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './song-form-and-arranging';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (steps: readonly unknown[]): Exercise[] =>
  (steps as Step[]).filter((s): s is Exercise => !!s && typeof s === 'object' && !isGenerated(s) && s.type !== 'card');
const allExercises = (): Exercise[] => {
  const top = [
    ...unit.lessons.flatMap((l) => [...exercises(l.steps), ...exercises((l.facts ?? []).map((f) => f.ask))]),
    ...exercises(unit.checkpoint?.steps ?? []),
  ];
  return [...top, ...exercises(top.flatMap((e) => ('alternative' in e ? [e.alternative] : [])))];
};
const plain = (t: RichText): string => plainText(t, { format: { ascii: true } });
const correct = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): string => plain(e.options.find((o) => o.correct)?.text ?? '');
const inLesson = (id: string): Exercise[] => [...exercises(lesson(id).steps), ...exercises((lesson(id).facts ?? []).map((f) => f.ask))];
const listens = (steps: readonly unknown[]): ListenChoiceExercise[] => exercises(steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const findIn = <T extends Exercise>(pool: Exercise[], type: T['type'], text: RegExp): T => {
  const found = pool.find((e) => e.type === type && text.test(plain(('prompt' in e ? e.prompt : undefined) ?? '')));
  if (!found) throw new Error(`no ${type} matching ${text}`);
  return found as T;
};
function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) texts(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) texts(v, out);
  return out;
}
function tagged(text: RichText, type: 'chord' | 'note' | 'roman' | 'key'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}
const pc = (note: string): number => chordPcs(note)[0];
const notesOf = (tab: readonly TabNote[]): number[] => tab.flatMap((x) => ('rest' in x ? [] : [midiAt(x)]));
const chordsOf = (e: ListenChoiceExercise): string[] => (e.sound.kind === 'progression' ? e.sound.chords : []);
const tabOf = (e: ListenChoiceExercise): TabNote[] => (e.sound.kind === 'tab' ? e.sound.notes : []);
const audioOf = (step: Step): { chords: string[]; tab: TabNote[] } => {
  if (isGenerated(step) || step.type !== 'card' || step.figure?.kind !== 'audio') throw new Error('expected an audio card');
  const s = step.figure.sound;
  return { chords: s.kind === 'progression' ? s.chords : [], tab: s.kind === 'tab' ? s.notes : [] };
};
const BEATS: Record<string, number> = { w: 4, h: 2, 'q.': 1.5, q: 1, e: 0.5 };
/** The notes of a 4/4 tab, grouped by bar, each with its beat (0-based). */
function bars(tab: readonly TabNote[]): Array<Array<{ midi: number; beat: number }>> {
  const out: Array<Array<{ midi: number; beat: number }>> = [[]];
  let t = 0;
  for (const x of tab) {
    if (!('rest' in x)) out[out.length - 1].push({ midi: midiAt(x), beat: t });
    t += BEATS[x.duration];
    if (t === 4) {
      out.push([]);
      t = 0;
    }
    expect(t, 'no note crosses a bar line').toBeLessThan(4);
  }
  if (out[out.length - 1].length === 0) out.pop();
  expect(t, 'the last bar is full').toBe(0);
  return out;
}
const G_CHORDS = diatonicChords('G major').map((c) => c.symbol);

describe('song-form-and-arranging: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^form-/);
  });

  it('keeps every play step short and evenly spaced, so its tab fits a phone screen', () => {
    for (const e of allExercises().filter((x): x is PlayPhraseExercise => x.type === 'play-phrase')) {
      expect(e.notes.length, plain(e.prompt)).toBeLessThanOrEqual(6);
      const total = e.notes.reduce((t, x) => t + BEATS[x.duration], 0);
      const shortest = Math.min(...e.notes.map((x) => BEATS[x.duration]));
      // The tab spreads notes by time over about 34 px a note: keep every gap at 18 px or more.
      expect((shortest / total) * (Math.max(4, e.notes.length) * 34 - 18), plain(e.prompt)).toBeGreaterThanOrEqual(18);
    }
  });

  it('sounds exactly the chord written beside each shape, and builds every play and build shape', () => {
    const pairs: Array<[string, string]> = [];
    for (const text of texts(unit)) for (const m of text.matchAll(/\{c:([^}]+)\}\s*\(([x0-9]{6})\)/g)) pairs.push([m[1], m[2]]);
    expect(pairs.length).toBeGreaterThan(15);
    for (const [symbol, shape] of pairs) expect(tryBuildVoicing(symbol, shape)?.chord, `${symbol} ${shape}`).toBe(symbol);
    const shaped = [
      ...allExercises().filter((e): e is PlayChordExercise => e.type === 'play-chord'),
      ...allExercises().filter((e): e is ChordBuildExercise => e.type === 'chord-build' && e.task === 'fingers'),
    ];
    expect(shaped.length).toBeGreaterThanOrEqual(5);
    for (const e of shaped) {
      const v = buildVoicing(e.chord, e.frets!);
      expect([...chordPcs(v.chord)].sort(), `${e.chord} ${String(e.frets)}`).toEqual([...chordPcs(e.chord)].sort());
    }
  });
});

describe('song-form-and-arranging: the song map', () => {
  const [map, roles] = lesson('song-sections').steps;

  it('uses only chords of G major, as written on the cards', () => {
    expect(tagged(!isGenerated(roles) && roles.type === 'card' ? roles.body : '', 'chord')).toEqual(['G', 'Em', 'C', 'D', 'G', 'D', 'Em', 'C', 'Em', 'D', 'C', 'D']);
    for (const c of [...audioOf(map).chords, ...audioOf(roles).chords, ...audioOf(lesson('song-sections').steps[6]).chords]) expect(G_CHORDS, c).toContain(c);
    expect(audioOf(map).chords).toEqual(['G', 'D', 'Em', 'C']); // the chorus
    expect(audioOf(roles).chords).toEqual(['G', 'Em', 'C', 'D']); // the verse
  });

  it('keeps the pre-chorus and the bridge away from the home chord', () => {
    const pre = audioOf(lesson('song-sections').steps[6]).chords;
    expect(pre.slice(0, 4)).toEqual(['C', 'D', 'C', 'D']);
    expect(pre.slice(0, 4)).not.toContain('G');
    const bridge = tagged(findIn<ChoiceExercise>(inLesson('song-sections'), 'choice', /the bridge is/).prompt, 'chord');
    expect(bridge).toEqual(['Em', 'D', 'C', 'D']);
    expect(bridge).not.toContain('G');
    for (const c of bridge) expect(G_CHORDS).toContain(c);
  });

  it('plays the chorus in the verse-or-chorus question, told apart by its second chord', () => {
    const [q] = listens(lesson('song-sections').steps);
    expect(tagged(q.prompt, 'chord')).toEqual(['G', 'Em', 'C', 'D', 'G', 'D', 'Em', 'C']);
    expect(chordsOf(q)).toEqual(['G', 'D', 'Em', 'C']);
    expect(correct(q)).toBe('The chorus');
    expect(chordsOf(q)[1]).not.toBe('Em');
  });
});

describe('song-form-and-arranging: forms by letter', () => {
  it('plays A A B A, with A = G C and B = Em D', () => {
    const [q] = listens(lesson('common-forms').steps);
    const A = ['G', 'C'];
    const B = ['Em', 'D'];
    expect(chordsOf(q)).toEqual([...A, ...A, ...B, ...A]);
    expect(correct(q)).toBe('AABA');
    expect(audioOf(lesson('common-forms').steps[0]).chords).toEqual([...A, ...B]);
    expect(4 * 8).toBe(Number(correct(findIn<ChoiceExercise>(inLesson('common-forms'), 'choice', /How many bars/))));
  });
});

describe('song-form-and-arranging: phrases and periods', () => {
  const chords = ['G', 'C', 'G', 'D', 'G', 'C', 'D7', 'G'];
  const play = findIn<PlayPhraseExercise>(inLesson('phrases-and-periods'), 'play-phrase', /antecedent/);
  const period = audioOf(lesson('phrases-and-periods').steps[2]).tab;

  it('puts every melody note on a tone of its bar\'s chord, in eight full bars', () => {
    const b = bars(period);
    expect(b).toHaveLength(8);
    b.forEach((bar, i) => {
      for (const x of bar) expect(chordPcs(chords[i]), `bar ${i + 1}`).toContain(x.midi % 12);
    });
    // Strings 1 to 3, first position.
    for (const x of period) if (!('rest' in x)) expect(x.string <= 3 && x.fret <= 3, `${x.string}:${x.fret}`).toBe(true);
  });

  it('ends the antecedent on A over D, and the consequent on G after D7', () => {
    const ante = notesOf(period).slice(0, 11);
    expect(notesOf(play.notes)).toEqual(ante.slice(6)); // bars 3 and 4
    expect(play.notes.length).toBeLessThanOrEqual(6);
    expect(ante.at(-1)).toBe(57); // A3
    expect(intervalBetween('D', 'A')).toBe('P5');
    expect(notesOf(period).at(-1)).toBe(55); // G3
    expect(classifyCadence(['C', 'G', 'D'], 'G')?.type).toBe('half');
    expect(classifyCadence(['C', 'D7', 'G'], 'G')?.type).toBe('authentic');
    const staff = lesson('phrases-and-periods').steps[0];
    if (isGenerated(staff) || staff.type !== 'card' || staff.figure?.kind !== 'staff') throw new Error('expected the staff');
    const staffNotes = staff.figure.notes.map((x) => (typeof x === 'string' ? x : x.note));
    expect(staffNotes.map((x) => midiAt({ string: 6, fret: 0 }) - 40 + noteMidi(x))).toEqual(ante);
    expect(play.alternative).toMatchObject({ type: 'staff-read', note: 'A3' });
  });

  it('plays an authentic cadence in the lesson and a half cadence in the checkpoint', () => {
    const [q] = listens(lesson('phrases-and-periods').steps);
    expect(chordsOf(q)).toEqual(chords.slice(4));
    expect(classifyCadence(chordsOf(q).slice(-2), 'G')?.type).toBe('authentic');
    expect(correct(q)).toMatch(/authentic/);
    const half = listens(unit.checkpoint!.steps!).find((e) => /half cadence or an authentic/.test(plain(e.prompt)))!;
    expect(chordsOf(half)).toEqual(chords.slice(0, 4));
    expect(classifyCadence(chordsOf(half).slice(-2), 'G')?.type).toBe('half');
    expect(correct(half)).toMatch(/half/);
  });
});

/** MIDI of a note name with octave (C4 = 60). */
function noteMidi(name: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name)!;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  return 12 * (Number(m[3]) + 1) + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

describe('song-form-and-arranging: the guitar in a band', () => {
  const openG = buildVoicing('G', '320003').midi;

  it('puts guitar 2\'s triads on strings 3-2-1 at the frets the card gives', () => {
    const card = lesson('the-guitar-in-a-band').steps[2];
    if (isGenerated(card) || card.type !== 'card') throw new Error('expected the card');
    const frets = [...String(card.body).split('at frets')[1].matchAll(/(\d+)-(\d+)-(\d+)/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
    expect(frets).toHaveLength(4);
    const symbols = tagged(card.body, 'chord').slice(0, 4);
    expect(symbols).toEqual(['G', 'D', 'Em', 'C']);
    frets.forEach(([f3, f2, f1], i) => {
      const v = buildVoicing(symbols[i], [null, null, null, f3, f2, f1]);
      expect([...chordPcs(v.chord)].sort(), symbols[i]).toEqual([...chordPcs(symbols[i])].sort());
      expect(Math.min(...v.midi), symbols[i]).toBeGreaterThanOrEqual(Math.max(...openG) - 1); // above guitar 1's open chords
    });
    // Capo 5: the D, A, Bm and G shapes sound as G, D, Em and C.
    expect(['D', 'A', 'Bm', 'G'].map((c) => transposeChordBySemitones(c, 5))).toEqual(symbols);
    expect(transposeChordBySemitones('C', 5)).toBe('F');
    expect(transposeChordBySemitones('E', 5)).toBe('A');
    expect(correct(findIn<ChoiceExercise>(inLesson('the-guitar-in-a-band'), 'choice', /capo at fret 5/))).toBe('The D shape');
  });

  it('plays guitar 2 above guitar 1 in one question and inside it in the other', () => {
    const [higher, same] = listens(lesson('the-guitar-in-a-band').steps);
    const g1 = notesOf(tabOf(higher)).slice(0, 6);
    expect(g1).toEqual(openG);
    const g2High = notesOf(tabOf(higher)).slice(6);
    expect(g2High.every((m) => m >= Math.max(...g1))).toBe(true);
    expect([...new Set(g2High.map((m) => m % 12))].sort()).toEqual([...chordPcs('G')].sort());
    expect(correct(higher)).toMatch(/^Different/);
    const g2Same = notesOf(tabOf(same)).slice(6);
    expect(g2Same.every((m) => m >= Math.min(...g1) && m <= Math.max(...g1))).toBe(true);
    expect(Math.max(...g2Same)).toBe(Math.max(...g1)); // the same top G
    expect(correct(same)).toBe('The same register');
  });
});

describe('song-form-and-arranging: chord melody', () => {
  const tabCard = lesson('chord-melody').steps[0];
  if (isGenerated(tabCard) || tabCard.type !== 'card' || tabCard.figure?.kind !== 'tab') throw new Error('expected the tune');
  const ode = tabCard.figure.notes;

  it('plays the first phrase of "Ode to Joy" in C on strings 1 and 2', () => {
    const names = ['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'E4', 'D4', 'D4'];
    expect(notesOf(ode)).toEqual(names.map(noteMidi));
    expect(ode.every((x) => 'rest' in x || x.string <= 2)).toBe(true);
    expect(bars(ode)).toHaveLength(4);
    // The play step: the opening, E E F G, landing on the G of bar 2 (short enough for a phone).
    const opening = findIn<PlayPhraseExercise>(inLesson('chord-melody'), 'play-phrase', /opening of the tune/).notes;
    expect(notesOf(opening)).toEqual(notesOf(ode).slice(0, 5));
    expect(opening.every((x) => 'rest' in x || x.string === 1)).toBe(true);
  });

  it('builds each beat-1 chord with the melody note on top', () => {
    const beat1 = bars(ode).map((b) => b[0].midi);
    const shapes: Array<[string, string]> = [['C', 'x32010'], ['G', '320003'], ['C', 'x3201x'], ['C', 'x32010']];
    shapes.forEach(([c, s], i) => {
      const v = buildVoicing(c, s);
      expect(Math.max(...v.midi), `bar ${i + 1}`).toBe(beat1[i]);
      expect(chordPcs(c)).toContain(beat1[i] % 12);
    });
    const card = lesson('chord-melody').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'tab') throw new Error('expected the tab');
    expect(tagged(card.figure.caption!, 'chord')).toEqual(shapes.map(([c]) => c));
    expect(Math.max(...buildVoicing('C', 'x35553').midi)).toBeGreaterThan(noteMidi('E4'));
    const q = findIn<ChoiceExercise>(inLesson('chord-melody'), 'choice', /keeps E on top/);
    for (const o of q.options) {
      const shape = /\(([x0-9]{6})\)/.exec(plain(o.text!))![1];
      expect(Math.max(...buildVoicing('C', shape).midi) === noteMidi('E4'), shape).toBe(!!o.correct);
    }
    expect(midiAt({ string: 2, fret: 1 })).toBe(noteMidi('C4'));
    expect(correct(findIn<ChoiceExercise>(allExercises(), 'choice', /Which string-1 frets/))).toBe(['E4', 'E4', 'F4', 'G4'].map((x) => noteMidi(x) - 64).join(' '));
  });

  it('rolls x32010 up to E (on top) and x35553 past it (inside)', () => {
    const [top, inside] = listens(lesson('chord-melody').steps);
    for (const [q, shape, answer] of [[top, 'x32010', /^On top/], [inside, 'x35553', /^Hidden/]] as const) {
      expect(q.sound).toMatchObject({ kind: 'chord', chord: 'C', frets: shape, style: 'arpeggio' });
      expect(q.figure).toMatchObject({ kind: 'audio', sound: { kind: 'notes', notes: ['E4', 'E4'] } });
      expect(correct(q)).toMatch(answer);
    }
  });
});

describe('song-form-and-arranging: bass lines', () => {
  const card = lesson('bass-lines').steps[0];
  if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'tab') throw new Error('expected the tab');
  const figure = card.figure;
  const rootFifth = figure.notes;
  const walking = audioOf(lesson('bass-lines').steps[3]).tab;
  const roots = ['G', 'C', 'D', 'G'];

  it('plays root then 5th under G C D G, on strings 6 to 4', () => {
    const b = bars(rootFifth);
    expect(b).toHaveLength(4);
    b.forEach((bar, i) => {
      expect(bar[0].midi % 12, `bar ${i + 1} root`).toBe(pc(roots[i]));
      if (bar[1]) expect(bar[1].midi % 12, `bar ${i + 1} 5th`).toBe(pc(transpose(roots[i], 'P5')));
    });
    expect(rootFifth.every((x) => 'rest' in x || x.string >= 4)).toBe(true);
    const caption = tagged(figure.caption!, 'note');
    expect(caption.map(pc)).toEqual(notesOf(rootFifth).map((m) => m % 12));
    const play = findIn<PlayPhraseExercise>(inLesson('bass-lines'), 'play-phrase', /root-fifth bass line under G and C/);
    expect(play.notes.every((x) => 'rest' in x || x.string >= 5)).toBe(true);
    expect(notesOf(play.notes)).toEqual(notesOf(rootFifth).slice(0, 4));
  });

  it('walks a note a beat, roots on beat 1 and a half step into each next root on beat 4', () => {
    const b = bars(walking);
    expect(b).toHaveLength(4);
    b.forEach((bar, i) => {
      expect(bar[0].midi % 12, `bar ${i + 1}`).toBe(pc(roots[i]));
      if (i < 3) {
        expect(bar).toHaveLength(4);
        // Review: bar 1 used to drop from C# to C; every approach now rises from a half step below.
        expect(b[i + 1][0].midi - bar[3].midi, `bar ${i + 1} beat 4`).toBe(1);
      }
    });
    // The card and the listening answer name exactly those approach notes: B, C# and F#.
    const approaches = b.slice(0, 3).map((bar) => bar[3].midi % 12);
    const card = lesson('bass-lines').steps[3];
    if (isGenerated(card) || card.type !== 'card') throw new Error('expected the walking card');
    const named = tagged(String(card.body).split('below the next root:')[1], 'note');
    expect(named.filter((_x, i) => i % 2 === 0).map(pc)).toEqual(approaches);
    expect(named.filter((_x, i) => i % 2 === 0).map((x) => transpose(x, 'm2'))).toEqual(named.filter((_x, i) => i % 2 === 1));
    const [, walkQ] = listens(lesson('bass-lines').steps);
    expect(tagged(walkQ.explain, 'note').map(pc)).toEqual(approaches);
    const steps = notesOf(walking).slice(1).map((m, i) => Math.abs(m - notesOf(walking)[i]));
    expect(steps.filter((s) => s <= 2).length).toBeGreaterThan(steps.length / 2); // mostly by step
    expect(correct(findIn<ChoiceExercise>(inLesson('bass-lines'), 'choice', /which beat carries/))).toBe('Beat 4');
    const [rf, walk] = listens(lesson('bass-lines').steps);
    expect(notesOf(tabOf(rf))).toEqual(notesOf(rootFifth));
    expect(correct(rf)).toBe('Root-fifth');
    expect(notesOf(tabOf(walk))).toEqual(notesOf(walking));
    expect(correct(walk)).toBe('Walking');
  });

  it('spells each half step below a root', () => {
    for (const e of allExercises().filter((x): x is TypeAnswerExercise => x.type === 'type-answer' && /half-step approach note from below/.test(plain(x.prompt)))) {
      expect(e.answer.value, plain(e.prompt)).toBe(transpose(tagged(e.prompt, 'note')[0], '-m2'));
    }
    expect(midiAt({ string: 6, fret: 2 }) % 12).toBe(pc('F#'));
  });
});

describe('song-form-and-arranging: writing a progression', () => {
  it('names the functions, the borrowed iv and the secondary dominant the engine finds', () => {
    expect(['G', 'C', 'D', 'G'].map((c) => diatonicChords('G major').find((x) => x.symbol === c)!.function)).toEqual(['tonic', 'subdominant', 'dominant', 'tonic']);
    expect(chordToRoman('Cm', 'G').relation).toBe('borrowed');
    expect(chordToRoman('Cm', 'G').roman).toBe('iv');
    expect(chordToRoman('E7', 'G').roman).toBe('V7/ii');
    expect(chordToRoman('Fm', 'C').relation).toBe('borrowed');
    for (const c of ['Em', 'Am']) expect(G_CHORDS).toContain(c);
    for (const c of ['Dm', 'Am']) expect(diatonicChords('C major').map((x) => x.symbol)).toContain(c);
    expect(findIn<TypeAnswerExercise>(inLesson('writing-a-progression'), 'type-answer', /borrowed iv/).answer.value).toBe('Cm');
    expect(chordNotes('Cm')).toEqual(['C', 'Eb', 'G']);
    expect(chordNotes('E7')).toContain('G#');
  });

  it('plays plain C in the listening question, and the borrowed Cm on the card', () => {
    const [q] = listens(lesson('writing-a-progression').steps);
    expect(chordsOf(q)[1]).toBe('C');
    expect(correct(q)).toBe('Plain C');
    expect(audioOf(lesson('writing-a-progression').steps[2]).chords).toEqual(['G', 'Cm', 'D7', 'G']);
  });

  it('marks only a chord tone of C as safe to hold', () => {
    const q = findIn<ChoiceExercise>(inLesson('writing-a-progression'), 'choice', /safe to hold/);
    for (const o of q.options) expect(chordPcs('C').includes(pc(tagged(o.text!, 'note')[0])), plain(o.text!)).toBe(!!o.correct);
  });
});

describe('song-form-and-arranging: every "not in" claim', () => {
  /** "{n:X} is not in {k:K}" / "{n:X} is foreign to {k:K}" / "{n:X} is not in {c:C}": the nearest note before. */
  function outsideClaims(text: string): Array<[string, 'key' | 'chord', string]> {
    const out: Array<[string, 'key' | 'chord', string]> = [];
    for (const sentence of text.split(/(?<=[.;:?])\s/)) {
      for (const m of sentence.matchAll(/(?:is not in|outside|foreign to) \{([kc]):([^}]+)\}/g)) {
        const notes = [...sentence.slice(0, m.index).matchAll(/\{n:([A-G][#b]*)\}/g)];
        if (notes.length) out.push([notes.at(-1)![1], m[1] === 'k' ? 'key' : 'chord', m[2]]);
      }
    }
    return out;
  }
  const keyPcs = (key: string): number[] => {
    const [tonic, mode] = key.split(' ');
    return diatonicChords(`${tonic} ${mode}`).map((c) => pc(c.root));
  };

  it('names only notes that really lie outside that key or chord', () => {
    const claims = texts(unit).flatMap(outsideClaims);
    expect(claims.length).toBeGreaterThanOrEqual(5);
    for (const [note, kind, where] of claims) {
      const pcs = kind === 'key' ? keyPcs(where) : chordPcs(where);
      expect(pcs.includes(pc(note)), `${note} in ${where}`).toBe(false);
    }
  });
});

describe('song-form-and-arranging: the checkpoint', () => {
  const steps = exercises(unit.checkpoint!.steps!);

  // Review: the checkpoint line lists "rhythm, lead, riff and fill roles"; no step asked about them.
  it('asks about the guitar\'s jobs in a band, with a fill as the answer to the singer', () => {
    const q = findIn<ChoiceExercise>(steps, 'choice', /Which job is that/);
    expect(correct(q)).toBe('A fill');
    expect(q.options.map((o) => plain(o.text!)).sort()).toEqual(['A fill', 'A riff', 'Lead', 'Rhythm']);
    const g = THEORY_GLOSSARY.find((t) => t.id === 'fill')!;
    expect(g.definition).toMatch(/between two vocal lines/);
  });

  it('keeps within the 20-step limit and covers every lesson of the unit', () => {
    expect(unit.checkpoint!.steps!.length).toBeLessThanOrEqual(20);
    const all = steps.map((e) => plain(('prompt' in e && e.prompt) || ('statement' in e && e.statement) || '')).join(' | ');
    for (const word of [/verse|chorus|bridge/i, /AABA|rondo|ternary/i, /phrase|period/i, /guitars?|job/i, /chord-melody/i, /bass line|approach/i, /progression|borrowed/i]) {
      expect(all).toMatch(word);
    }
  });
});

describe('song-form-and-arranging: on the go', () => {
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
