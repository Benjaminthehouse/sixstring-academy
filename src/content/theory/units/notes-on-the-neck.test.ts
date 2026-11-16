/**
 * Unit 6 of the Theory Path, cross-checked against the guitar engine: the natural notes of strings
 * 6 and 5, every "string N, fret F is X" the text states, every "same pitch on the next string"
 * answer, the dot frets and their notes, the octave shapes (two frets from strings 6 and 5, three
 * from 4 and 3, because of the tuning gap between strings 3 and 2), and every fretboard question's
 * answer.
 */
import { describe, expect, it } from 'vitest';
import { DOUBLE_INLAY_FRETS, INLAY_FRETS, midiAt, noteAt, tuningIntervals } from '@/core/guitar';
import { pcName } from '@/core/theory';
import {
  findTargets, formatProblems, generateExercise, plainText, soundPlan, validateCourse,
  type CardStep, type ChoiceExercise, type Exercise, type FretboardFigure, type FretboardFindExercise, type FretboardNameExercise,
  type GeneratedStep, type Lesson, type ListenChoiceExercise, type Step,
} from '@/lessons';
import { assembleTheory } from '../index';
import unit from './notes-on-the-neck';

/** Visible text with ASCII accidentals (F#, Db), to compare with the engine's spellings. */
const plain = (t: Parameters<typeof plainText>[0]): string => plainText(t, { format: { ascii: true } });

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const cards = (l: Lesson): CardStep[] => l.steps.filter((s: Step): s is CardStep => !('generate' in s) && s.type === 'card');
const exercises = (l: Lesson): Exercise[] => l.steps.filter((s: Step): s is Exercise => !('generate' in s) && s.type !== 'card');
const everyExercise = (): Exercise[] => [
  ...unit.lessons.flatMap((l) => {
    const own = exercises(l);
    const alts = own.flatMap((e) => ('alternative' in e && !('generate' in e.alternative) ? [e.alternative as Exercise] : []));
    const asks = (l.facts ?? []).flatMap((f) => (f.ask && !('generate' in f.ask) ? [f.ask as Exercise] : []));
    return [...own, ...alts, ...asks];
  }),
  ...(unit.checkpoint?.steps ?? []).filter((s): s is Exercise => !('generate' in s)),
];
const nameAt = (string: number, fret: number): string => pcName(noteAt({ string, fret }, { context: { prefer: 'sharps' } }));
const pos = (list: Array<{ string: number; fret: number }>) => list.map(({ string, fret }) => ({ string, fret })).sort((a, b) => a.string - b.string || a.fret - b.fret);
const NATURAL = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
const naturalsOn = (string: number) => Array.from({ length: 13 }, (_u, fret) => fret).filter((fret) => NATURAL.has(nameAt(string, fret)));
const correctText = (e: ChoiceExercise): string => plainText(e.options.find((o) => o.correct)!.text!);

/** This unit alone, as the registry assembles it; prerequisites outside it are theory.test.ts's to check. */
function unitCourse() {
  const course = assembleTheory([unit]).course;
  const ids = new Set(unit.lessons.map((l) => l.id));
  const units = course.units
    .filter((u) => u.id === unit.id)
    .map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, requires: (l.requires ?? []).filter((r) => ids.has(r)) })) }));
  return { ...course, units };
}

describe('notes-on-the-neck: the engine accepts the unit on its own', () => {
  it('has no errors and no warnings', () => {
    const problems = validateCourse(unitCourse());
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word "neck"', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^neck-/);
  });
});

describe('notes-on-the-neck: the natural notes of strings 6 and 5', () => {
  const listing = (text: string) => [...text.matchAll(/([A-G]) \((open|\d+)\)/g)].map((m) => [m[1], m[2] === 'open' ? 0 : Number(m[2])] as const);

  it('string 6: E 0, F 1, G 3, A 5, B 7, C 8, D 10, E 12', () => {
    expect(naturalsOn(6)).toEqual([0, 1, 3, 5, 7, 8, 10, 12]);
    const said = listing(lesson('string-6-naturals').teaches);
    expect(said).toEqual(naturalsOn(6).map((f) => [nameAt(6, f), f]));
    const fig = cards(lesson('string-6-naturals'))[0].figure as FretboardFigure;
    expect(fig.dots!.map((d) => [d.note, d.fret])).toEqual(said);
  });

  it('string 5: A 0, B 2, C 3, D 5, E 7, F 8, G 10, A 12', () => {
    expect(naturalsOn(5)).toEqual([0, 2, 3, 5, 7, 8, 10, 12]);
    const said = listing(lesson('string-5-naturals').teaches);
    expect(said).toEqual(naturalsOn(5).map((f) => [nameAt(5, f), f]));
    const fig = cards(lesson('string-5-naturals'))[0].figure as FretboardFigure;
    expect(fig.dots!.map((d) => [d.note, d.fret])).toEqual(said);
    // The card body lists them too: "{n:A} (open), {n:B} (2), ..."
    expect(listing(plainText(cards(lesson('string-5-naturals'))[0].body))).toEqual(said);
  });

  it('the review cards list the same frets', () => {
    for (const [id, string] of [['neck-string-6-naturals', 6], ['neck-string-5-naturals', 5]] as const) {
      const fact = unit.lessons.flatMap((l) => l.facts ?? []).find((f) => f.id === id)!;
      expect(listing(plainText(fact.back))).toEqual(naturalsOn(string).map((f) => [nameAt(string, f), f]));
    }
  });

  it('the string 6 card walks "F at 1, G at 3, A at 5, B at 7, C at 8, D at 10 and E at 12", and its audio plays them', () => {
    const card = cards(lesson('string-6-naturals'))[1];
    const walk = [...plainText(card.body).matchAll(/([A-G]) at (\d+)/g)].map((m) => [m[1], Number(m[2])]);
    expect(walk).toEqual(naturalsOn(6).slice(1).map((f) => [nameAt(6, f), f]));
    const audio = card.figure!;
    expect(audio.kind).toBe('audio');
    const played = audio.kind === 'audio' ? soundPlan(audio.sound).events.flatMap((e) => e.midi) : [];
    expect(played).toEqual(naturalsOn(6).map((fret) => midiAt({ string: 6, fret })));
  });

  it('only E-F and B-C are one fret apart', () => {
    for (const string of [6, 5]) {
      const frets = naturalsOn(string);
      for (let i = 1; i < frets.length; i++) {
        const pair = `${nameAt(string, frets[i - 1])}${nameAt(string, frets[i])}`;
        expect(frets[i] - frets[i - 1]).toBe(pair === 'EF' || pair === 'BC' ? 1 : 2);
      }
    }
  });

  it('string 1 has the same note names as string 6, two octaves up', () => {
    for (let fret = 0; fret <= 12; fret++) {
      expect(nameAt(1, fret)).toBe(nameAt(6, fret));
      expect(midiAt({ string: 1, fret }) - midiAt({ string: 6, fret })).toBe(24);
    }
  });
});

describe('notes-on-the-neck: every "string N, fret F is X" in a prompt or option is right', () => {
  const texts = [
    ...everyExercise().map((e) => [e.type === 'true-false' ? e.statement : 'prompt' in e ? e.prompt : '', 'explain' in e ? e.explain : ''].map((t) => (t ? plain(t) : '')).join(' ')),
    ...unit.lessons.flatMap((l) => cards(l).map((c) => [c.body, c.tip ?? '', c.figure && 'caption' in c.figure ? c.figure.caption ?? '' : ''].map((t) => plain(t)).join(' '))),
    ...unit.lessons.flatMap((l) => (l.facts ?? []).map((f) => `${plain(f.front)} ${plain(f.back)}`)),
  ];
  const claims = texts.flatMap((text) =>
    [...text.matchAll(/[Ss]tring (\d), fret (\d+),? is (?:the very same |the same |a )?([A-G]#?)\b/g)].map((m) => ({ string: Number(m[1]), fret: Number(m[2]), note: m[3], where: text.slice(0, 50) })),
  );

  it('finds claims to check', () => {
    expect(claims.length).toBeGreaterThan(20);
  });

  for (const c of claims) {
    it(`string ${c.string}, fret ${c.fret} is ${c.note}  (${c.where})`, () => {
      expect(nameAt(c.string, c.fret)).toBe(c.note);
    });
  }
});

describe('notes-on-the-neck: same pitch, next string', () => {
  const sameOn = (string: number, fret: number, to: number) => midiAt({ string, fret }) - midiAt({ string: to, fret: 0 });

  it('the tuning gaps are 5 5 5 4 5 (strings 6 to 1): the B string is one fret closer', () => {
    expect(tuningIntervals('standard')).toEqual([5, 5, 5, 4, 5]);
  });

  it('answers each "which fret on string N plays the same pitch" question', () => {
    const qs = everyExercise().filter((e): e is ChoiceExercise => e.type === 'choice' && /Which fret on string \d plays the same/.test(plainText(e.prompt)));
    expect(qs.length).toBeGreaterThanOrEqual(5);
    for (const q of qs) {
      const m = /String (\d), fret (\d+) is .*Which fret on string (\d) plays the same/.exec(plainText(q.prompt))!;
      const answer = sameOn(Number(m[1]), Number(m[2]), Number(m[3]));
      expect(correctText(q), plainText(q.prompt)).toBe(`Fret ${answer}`);
    }
  });

  it('D3 lives at string 6 fret 10, string 5 fret 5 and the open string 4; A2 at string 6 fret 5 and the open string 5', () => {
    const allD = everyExercise().find((e): e is FretboardFindExercise => e.type === 'fretboard-find' && e.mode === 'all' && 'note' in e.find && e.find.note === 'D3')!;
    expect(pos(findTargets(allD))).toEqual(pos([{ string: 4, fret: 0 }, { string: 5, fret: 5 }, { string: 6, fret: 10 }]));
    const allA = everyExercise().find((e): e is FretboardFindExercise => e.type === 'fretboard-find' && e.mode === 'all' && 'note' in e.find && e.find.note === 'A2')!;
    expect(pos(findTargets(allA))).toEqual(pos([{ string: 5, fret: 0 }, { string: 6, fret: 5 }]));
    const allG = everyExercise().find((e): e is FretboardFindExercise => e.type === 'fretboard-find' && e.mode === 'all' && 'note' in e.find && e.find.note === 'G3')!;
    expect(pos(findTargets(allG))).toEqual(pos([{ string: 3, fret: 0 }, { string: 4, fret: 5 }, { string: 5, fret: 10 }]));
  });

  it('string 5 fret 3 is string 6 fret 8; string 3 fret 4 is the open string 2', () => {
    expect(midiAt({ string: 5, fret: 3 })).toBe(midiAt({ string: 6, fret: 8 }));
    expect(midiAt({ string: 3, fret: 4 })).toBe(midiAt({ string: 2, fret: 0 }));
  });
});

describe('notes-on-the-neck: the repeat at fret 12 and the dots', () => {
  it('fret n + 12 has the name of fret n, an octave higher, on every string', () => {
    for (let string = 1; string <= 6; string++) {
      for (let fret = 0; fret <= 10; fret++) {
        expect(nameAt(string, fret + 12)).toBe(nameAt(string, fret));
        expect(midiAt({ string, fret: fret + 12 }) - midiAt({ string, fret })).toBe(12);
      }
    }
  });

  it('answers the fret-17 and fret-19 questions', () => {
    const q17 = exercises(lesson('the-neck-repeats')).find((e): e is ChoiceExercise => e.type === 'choice')!;
    expect(correctText(q17)).toBe('Fret 5');
    expect(nameAt(6, 17)).toBe(nameAt(6, 5));
    const q19 = lesson('the-neck-repeats').facts!.find((f) => f.id === 'neck-repeats-at-12')!.ask as ChoiceExercise;
    expect(correctText(q19)).toBe('Fret 7');
    expect(nameAt(5, 19)).toBe('E');
  });

  it('marks dots at 3 5 7 9 12 (double), 15 17 19 21 and 24 (double)', () => {
    expect([...INLAY_FRETS]).toEqual([3, 5, 7, 9, 12, 15, 17, 19, 21, 24]);
    expect([...DOUBLE_INLAY_FRETS]).toEqual([12, 24]);
  });

  it('the dot notes are G A B C# on string 6 and C D E F# on string 5', () => {
    expect([3, 5, 7, 9].map((f) => nameAt(6, f))).toEqual(['G', 'A', 'B', 'C#']);
    expect([3, 5, 7, 9].map((f) => nameAt(5, f))).toEqual(['C', 'D', 'E', 'F#']);
    const fig = cards(lesson('dots-as-landmarks'))[0].figure as FretboardFigure;
    for (const d of fig.dots!) expect(nameAt(d.string, d.fret)).toBe(d.note);
    expect(new Set(fig.dots!.map((d) => d.fret))).toEqual(new Set([3, 5, 7, 9]));
  });
});

describe('notes-on-the-neck: octave shapes', () => {
  /** Where the shape the lessons teach puts the octave of a note. */
  const shape = (string: number, fret: number) => ({ string: string - 2, fret: fret + (string >= 5 ? 2 : 3) });

  it('the shape always lands on the octave', () => {
    for (const string of [6, 5, 4, 3]) {
      for (let fret = 0; fret <= 12; fret++) {
        const up = shape(string, fret);
        expect(midiAt(up) - midiAt({ string, fret }), `string ${string} fret ${fret}`).toBe(12);
      }
    }
  });

  it('every authored octave question has exactly one answer in view: the shape', () => {
    const finds = everyExercise().filter((e): e is FretboardFindExercise => e.type === 'fretboard-find' && 'interval' in e.find);
    expect(finds.length).toBeGreaterThanOrEqual(10);
    for (const f of finds) {
      if (!('interval' in f.find)) continue;
      expect(f.find.interval).toBe('P8');
      const from = f.find.from;
      expect(pos(findTargets(f)), plainText(f.prompt)).toEqual([shape(from.string, from.fret)]);
      // The prompt names the root note it shows.
      expect(plain(f.prompt)).toContain(`is ${nameAt(from.string, from.fret)}.`);
    }
  });

  it('the shape figures pair a note with its octave', () => {
    for (const id of ['octave-shapes-6-and-5', 'octave-shapes-4-and-3']) {
      for (const c of cards(lesson(id))) {
        const dots = (c.figure as FretboardFigure | undefined)?.dots ?? [];
        for (const d of dots) expect(nameAt(d.string, d.fret)).toBe(pcName(d.note!));
      }
    }
    expect(nameAt(4, 7)).toBe('A');
    expect(nameAt(2, 5)).toBe('E');
    expect(midiAt({ string: 2, fret: 5 })).toBe(midiAt({ string: 1, fret: 0 }));
  });

  it('the multiple-choice octave question picks the shape', () => {
    const q = exercises(lesson('octave-shapes-6-and-5')).find((e): e is ChoiceExercise => e.type === 'choice')!;
    const s = shape(5, 7);
    expect(correctText(q)).toBe(`String ${s.string}, fret ${s.fret}`);
  });

  /** The same pitch one string thinner: five frets lower, four from string 3 to string 2. */
  const nextThinner = (p: { string: number; fret: number }) => ({ string: p.string - 1, fret: p.fret - (p.string === 3 ? 4 : 5) });
  const same = (a: { string: number; fret: number }, b: { string: number; fret: number }) => a.string === b.string && a.fret === b.fret;

  it('the "off the edge" card is right: C at 6:8, its shape at 4:10, the same C at 3:5', () => {
    const card = cards(lesson('octave-shapes-6-and-5')).find((c) => /off the edge/.test(c.title ?? ''))!;
    const dots = (card.figure as FretboardFigure).dots!;
    expect(dots.map((d) => midiAt(d))).toEqual([48, 60, 60]);
    expect(shape(6, 8)).toEqual({ string: 4, fret: 10 });
    expect(nextThinner(shape(6, 8))).toEqual({ string: 3, fret: 5 });
    expect(midiAt(nextThinner({ string: 3, fret: 9 }))).toBe(midiAt({ string: 3, fret: 9 })); // four frets across the B string
    // The 4-and-3 lesson reminds the learner of the same rule.
    expect(JSON.stringify(lesson('octave-shapes-4-and-3').steps)).toMatch(/off the edge/);
  });

  it('every octave drill draw can be answered with what the lessons teach, on a neck a phone shows whole', () => {
    const drills = unit.lessons.flatMap((l) => l.steps.filter((s): s is GeneratedStep => 'generate' in s && s.generate === 'interval-on-neck'));
    expect(drills.length).toBe(3);
    let offShape = 0;
    for (const step of drills) {
      const [lo, hi] = step.params!.frets as [number, number];
      expect(hi - lo, 'frets a phone shows at once').toBeLessThanOrEqual(8);
      for (let seed = 1; seed <= 300; seed++) {
        const ex = generateExercise(step, { seed, difficulty: (seed % 11) / 10, level: 'beginner' }) as FretboardFindExercise;
        if (!('interval' in ex.find)) throw new Error('not an interval find');
        const from = ex.find.from;
        const targets = findTargets(ex);
        const s = shape(from.string, from.fret);
        // Either the shape itself, or (when it runs off the picture) its note one string thinner.
        const reachable = targets.some((t) => same(t, s)) || targets.some((t) => same(t, nextThinner(s)));
        expect(reachable, `${JSON.stringify(step.params)} seed ${seed}: R at ${from.string}:${from.fret}`).toBe(true);
        if (!targets.some((t) => same(t, s))) offShape++;
      }
    }
    // The off-edge case is the exception, not the rule.
    expect(offShape / 900).toBeLessThan(0.3);
  });

  it('strings 6 and 1 at one fret are two octaves apart', () => {
    const q = exercises(lesson('octave-shapes-4-and-3')).find((e): e is ChoiceExercise => e.type === 'choice' && /string 1, fret 5/.test(plainText(e.prompt)))!;
    expect(correctText(q)).toBe('A, two octaves higher');
    expect(midiAt({ string: 1, fret: 5 }) - midiAt({ string: 6, fret: 5 })).toBe(24);
  });
});

describe('notes-on-the-neck: answers on the neck', () => {
  it('every fretboard-name answer is the note at its position, and is among its buttons', () => {
    const names = everyExercise().filter((e): e is FretboardNameExercise => e.type === 'fretboard-name');
    expect(names.length).toBeGreaterThanOrEqual(10);
    for (const e of names) {
      const note = nameAt(e.position.string, e.position.fret);
      if (e.options) expect(e.options, plainText(e.prompt)).toContain(note);
      expect(plain(e.explain), plainText(e.prompt)).toContain(note);
    }
  });

  it('every single-note find has the place its explanation names', () => {
    const finds = everyExercise().filter((e): e is FretboardFindExercise => e.type === 'fretboard-find' && e.mode === 'one' && 'note' in e.find);
    for (const f of finds) {
      const targets = findTargets(f);
      expect(targets, plainText(f.prompt)).toHaveLength(1);
      const [t] = targets;
      expect(plainText(f.explain), plainText(f.prompt)).toMatch(new RegExp(`(?:fret ${t.fret}\\b|\\b${t.fret}th-fret|\\b${t.fret}\\b)`));
    }
  });

  it('the type-answer frets are right: G is fret 3 and D is fret 10 on string 6', () => {
    expect(nameAt(6, 3)).toBe('G');
    expect(nameAt(6, 10)).toBe('D');
    const answers = everyExercise().flatMap((e) => (e.type === 'type-answer' && e.answer.kind === 'number' ? [e.answer.value] : []));
    expect(answers).toEqual([3, 10]);
  });
});

describe('notes-on-the-neck: what the listening questions play', () => {
  const heard = (e: ListenChoiceExercise) => soundPlan(e.sound).events.flatMap((ev) => ev.midi);
  const answer = (e: ListenChoiceExercise) => plainText(e.options.find((o) => o.correct)!.text!);

  it('same pitch, an octave, and the common wrong octave shape', () => {
    const [same, octave] = exercises(lesson('same-note-many-places')).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
    expect(heard(same)).toEqual([50, 50]);
    expect(answer(same)).toBe('The same pitch');
    const [a, b] = heard(octave);
    expect(b - a).toBe(12);
    expect(answer(octave)).toBe('An octave apart');
    const [wrong] = exercises(lesson('octave-shapes-6-and-5')).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
    const [c, d] = heard(wrong);
    expect(d - c).toBe(10); // A2 to G3: same fret two strings over is a minor seventh, not an octave
    expect(answer(wrong)).toMatch(/^No/);
  });
});

describe('notes-on-the-neck: on the go (Sound off, Guitar off)', () => {
  const EAR_DRILLS = new Set(['higher-lower', 'interval-ear', 'chord-quality-ear', 'scale-ear', 'cadence-ear', 'rhythm-ear', 'rhythm-tap']);
  const listening = (s: Step): boolean =>
    'generate' in s
      ? EAR_DRILLS.has(String(s.generate))
      : s.type === 'listen-choice' || s.type === 'tap-rhythm' || (s.type !== 'card' && 'figure' in s && s.figure?.kind === 'audio');
  /** The questions left when listening steps are dropped and play steps become their tapping versions. */
  const quiet = (l: Lesson): Step[] =>
    l.steps.flatMap((s): Step[] => {
      if (!('generate' in s) && s.type === 'card') return [];
      if ('generate' in s && s.generate === 'play-note') return [{ generate: 'note-on-string', params: { ask: 'find' } }];
      const tap = !('generate' in s) && (s.type === 'play-note' || s.type === 'play-chord' || s.type === 'play-phrase') ? s.alternative : s;
      return listening(tap) ? [] : [tap];
    });

  it('every lesson keeps at least four questions, and every play step has a tapping version that does not need sound', () => {
    for (const l of unit.lessons) {
      expect(quiet(l).length, l.id).toBeGreaterThanOrEqual(4);
      for (const s of l.steps) {
        if (!('generate' in s) && (s.type === 'play-note' || s.type === 'play-chord' || s.type === 'play-phrase')) expect(listening(s.alternative), l.id).toBe(false);
      }
    }
  });
});
