/**
 * Unit 7 of the Theory Path, cross-checked against the engines: A minor pentatonic is A C D E G
 * (`scaleNotes`), box 1 is the guitar engine's first pentatonic box with its fingering
 * (`scalePatterns`), its roots are the three As, the moved boxes are the right minor pentatonics,
 * every phrase stays in the box and ends where the text says, and every answer is what the neck says.
 */
import { describe, expect, it } from 'vitest';
import { midiAt, noteAt, scalePatterns } from '@/core/guitar';
import { pcName, scaleNotes, scalePcs } from '@/core/theory';
import {
  findTargets, formatProblems, plainText, resolveFigure, soundPlan, validateCourse,
  type CardStep, type ChoiceExercise, type Exercise, type FillBlanksExercise, type FretboardFigure, type FretboardFindExercise,
  type Lesson, type ListenChoiceExercise, type OrderExercise, type PlayPhraseExercise, type Step, type TabFigure, type TabNote, type TypeAnswerExercise,
} from '@/lessons';
import { assembleTheory } from '../index';
import unit from './first-scale';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const cards = (l: Lesson): CardStep[] => l.steps.filter((s: Step): s is CardStep => !('generate' in s) && s.type === 'card');
const exercises = (l: Lesson): Exercise[] => l.steps.filter((s: Step): s is Exercise => !('generate' in s) && s.type !== 'card');
const checkpoint = (): Exercise[] => (unit.checkpoint?.steps ?? []).filter((s): s is Exercise => !('generate' in s));
const nameAt = (string: number, fret: number): string => pcName(noteAt({ string, fret }, { context: { tonic: 'A', scale: 'minor-pentatonic' } }));
const played = (notes: TabNote[]) => notes.flatMap((n) => ('rest' in n ? [] : [n]));
const key = (p: { string: number; fret: number }) => `${p.string}:${p.fret}`;
const pos = (list: Array<{ string: number; fret: number }>) => list.map(({ string, fret }) => ({ string, fret })).sort((a, b) => a.string - b.string || a.fret - b.fret);
const correctText = (e: ChoiceExercise): string => plainText(e.options.find((o) => o.correct)!.text!);

const A_PENT = scaleNotes('A', 'minor-pentatonic');
const BOX1 = scalePatterns('A', 'minor-pentatonic')[0];
const BOX_KEYS = new Set(BOX1.notes.map(key));

/** This unit alone, as the registry assembles it; prerequisites outside it are theory.test.ts's to check. */
function unitCourse() {
  const course = assembleTheory([unit]).course;
  const ids = new Set(unit.lessons.map((l) => l.id));
  const units = course.units
    .filter((u) => u.id === unit.id)
    .map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, requires: (l.requires ?? []).filter((r) => ids.has(r)) })) }));
  return { ...course, units };
}

describe('first-scale: the engine accepts the unit on its own', () => {
  it('has no errors and no warnings', () => {
    const problems = validateCourse(unitCourse());
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit id "first-scale"', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^first-scale-/);
  });
});

describe('first-scale: A minor pentatonic', () => {
  it('is A C D E G, as the title, the teaches line and the fact say', () => {
    expect(A_PENT).toEqual(['A', 'C', 'D', 'E', 'G']);
    expect(lesson('a-minor-pentatonic').title).toBe(`Five notes: ${A_PENT.join(' ')}`);
    expect(lesson('a-minor-pentatonic').teaches).toContain(A_PENT.join(' '));
    expect(plainText(lesson('a-minor-pentatonic').facts![0].back)).toBe(A_PENT.join(' '));
  });

  it('sits at frets 0 3 5 7 10 12 on string 5, as the card says and the derived figure draws', () => {
    const frets = Array.from({ length: 13 }, (_u, f) => f).filter((f) => scalePcs('A', 'minor-pentatonic').includes(midiAt({ string: 5, fret: f }) % 12));
    expect(frets).toEqual([0, 3, 5, 7, 10, 12]);
    expect(plainText(cards(lesson('a-minor-pentatonic'))[0].body)).toContain('frets 0, 3, 5, 7, 10 and 12');
    for (const id of ['what-a-scale-is', 'a-minor-pentatonic']) {
      const fig = resolveFigure(cards(lesson(id))[0].figure as FretboardFigure);
      expect(fig.dots.map((d) => d.fret)).toEqual(frets);
      expect(fig.dots.every((d) => d.string === 5)).toBe(true);
    }
    const find = exercises(lesson('a-minor-pentatonic')).find((e): e is FretboardFindExercise => e.type === 'fretboard-find')!;
    expect(pos(findTargets(find)).map((p) => p.fret)).toEqual(frets);
  });

  it('the fill-in and odd-one-out questions agree with the scale', () => {
    const fills = [...exercises(lesson('a-minor-pentatonic')), ...checkpoint()].filter((e): e is FillBlanksExercise => e.type === 'fill-blanks');
    expect(fills).toHaveLength(2);
    for (const f of fills) {
      const shown = [...plainText(f.text, { format: { ascii: true } }).matchAll(/[A-G]#?|_+/g)].map((m) => m[0]);
      let b = 0;
      const filled = shown.map((t) => (t.startsWith('_') ? plainText(f.blanks[b++]) : t));
      expect(filled).toEqual(A_PENT);
      for (const w of f.bank ?? []) expect(A_PENT).not.toContain(plainText(w));
    }
    const odd = [...exercises(lesson('a-minor-pentatonic')), ...checkpoint()].filter((e): e is ChoiceExercise => e.type === 'choice' && /\*\*not\*\*/.test(String(e.prompt)));
    expect(odd).toHaveLength(2);
    for (const q of odd) {
      for (const o of q.options) expect(A_PENT.includes(plainText(o.text!)), plainText(o.text!)).toBe(!o.correct);
    }
  });

  it('the order question lists the scale low to high', () => {
    const order = exercises(lesson('what-a-scale-is')).find((e): e is OrderExercise => e.type === 'order')!;
    expect(order.tiles.map((t) => plainText(t))).toEqual(A_PENT);
  });

  it('the scale sounds are A minor pentatonic and A major, from A2', () => {
    const scaleCards = unit.lessons.flatMap(cards).filter((c) => c.figure?.kind === 'audio' && c.figure.sound.kind === 'scale');
    for (const c of scaleCards) {
      if (c.figure?.kind !== 'audio' || c.figure.sound.kind !== 'scale') continue;
      const midi = soundPlan(c.figure.sound).events.flatMap((e) => e.midi);
      expect(midi[0]).toBe(45);
      const pcs = new Set(scalePcs('A', c.figure.sound.scale));
      expect(midi.every((m) => pcs.has(m % 12))).toBe(true);
    }
    expect(scaleCards.length).toBe(3);
  });
});

describe('first-scale: box 1', () => {
  const box = lesson('the-box-at-fret-5');
  const dots = (cards(box)[0].figure as FretboardFigure).dots!;

  it('is the engine box 1: frets 5 to 8, twelve notes, the same places and order', () => {
    expect(BOX1.id).toBe('box-1');
    expect([BOX1.minFret, BOX1.maxFret]).toEqual([5, 8]);
    expect(BOX1.notes).toHaveLength(12);
    expect(dots.map(key)).toEqual(BOX1.notes.map(key));
    const tab = (cards(box)[1].figure as TabFigure).notes;
    expect(played(tab).map(key)).toEqual(BOX1.notes.map(key));
    const play = exercises(box).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    expect(played(play.notes).map(key)).toEqual(BOX1.notes.map(key));
    // It climbs: every note is higher than the one before.
    const midi = BOX1.notes.map((n) => n.midi);
    for (let i = 1; i < midi.length; i++) expect(midi[i]).toBeGreaterThan(midi[i - 1]);
  });

  it('uses frets 5 and 8 on strings 6, 2 and 1, and 5 and 7 on strings 5, 4 and 3', () => {
    const fretsOn = (s: number) => BOX1.notes.filter((n) => n.string === s).map((n) => n.fret);
    for (const s of [6, 2, 1]) expect(fretsOn(s)).toEqual([5, 8]);
    for (const s of [5, 4, 3]) expect(fretsOn(s)).toEqual([5, 7]);
  });

  it('has the engine fingering: 1 on fret 5, 3 on fret 7, 4 on fret 8', () => {
    expect(dots.map((d) => d.finger)).toEqual(BOX1.notes.map((n) => n.finger));
    for (const n of BOX1.notes) expect(n.finger).toBe({ 5: 1, 7: 3, 8: 4 }[n.fret]);
  });

  it('every dot claims its real note, and its lowest note is the tonic', () => {
    for (const d of dots) expect(nameAt(d.string, d.fret)).toBe(d.note);
    expect(BOX1.notes[0].note).toBe('A');
    expect(BOX1.notes[0].isRoot).toBe(true);
  });

  it('the scale finds over frets 5 to 8 want exactly the box', () => {
    const finds = [...exercises(box), ...checkpoint(), ...(box.facts ?? []).flatMap((f) => (f.ask && !('generate' in f.ask) ? [f.ask as Exercise] : []))].filter(
      (e): e is FretboardFindExercise => e.type === 'fretboard-find' && 'scale' in e.find,
    );
    expect(finds.length).toBe(3);
    for (const f of finds) expect(pos(findTargets(f))).toEqual(pos(BOX1.notes));
  });

  it('the two order questions split the box into its lower and upper half', () => {
    const tile = (n: { string: number; fret: number }) => `String ${n.string}, fret ${n.fret}`;
    const order = exercises(box).find((e): e is OrderExercise => e.type === 'order')!;
    expect(order.tiles).toEqual(BOX1.notes.slice(0, 6).map(tile));
    const play = exercises(box).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    expect((play.alternative as OrderExercise).tiles).toEqual(BOX1.notes.slice(6).map(tile));
  });
});

describe('first-scale: the roots', () => {
  const roots = BOX1.notes.filter((n) => n.note === 'A');

  it('are string 6 fret 5, string 4 fret 7 and string 1 fret 5, an octave apart each', () => {
    expect(pos(roots)).toEqual(pos([{ string: 6, fret: 5 }, { string: 4, fret: 7 }, { string: 1, fret: 5 }]));
    expect(roots.map((r) => r.midi)).toEqual([45, 57, 69]);
    expect(pos(BOX1.roots)).toEqual(pos(roots));
  });

  it('every "tap the three As" asks for exactly them', () => {
    const finds = [...exercises(lesson('roots-in-the-box')), ...checkpoint(), ...(lesson('roots-in-the-box').facts ?? []).flatMap((f) => (f.ask && !('generate' in f.ask) ? [f.ask as Exercise] : []))].filter(
      (e): e is FretboardFindExercise => e.type === 'fretboard-find' && 'note' in e.find && e.find.note === 'A',
    );
    expect(finds.length).toBe(3);
    for (const f of finds) expect(pos(findTargets(f))).toEqual(pos(roots));
  });

  it('the root question picks string 4, fret 7 and its wrong options name the right notes', () => {
    const q = exercises(lesson('roots-in-the-box')).find((e): e is ChoiceExercise => e.type === 'choice' && /is a root/.test(plainText(e.prompt)))!;
    expect(correctText(q)).toBe('String 4, fret 7');
    for (const o of q.options.filter((x) => !x.correct)) {
      const m = /String (\d), fret (\d+)/.exec(plainText(o.text!))!;
      expect(plainText(o.why!)).toContain(`That is ${nameAt(Number(m[1]), Number(m[2]))}.`);
    }
  });

  it('the phrases stay in the box and end where the text says', () => {
    const l = lesson('roots-in-the-box');
    const listen = exercises(l).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    const tab = listen.sound.kind === 'tab' ? listen.sound.notes : [];
    const restAt = tab.findIndex((n) => 'rest' in n);
    const first = played(tab.slice(0, restAt));
    const second = played(tab.slice(restAt + 1));
    for (const n of [...first, ...second]) expect(BOX_KEYS.has(key(n))).toBe(true);
    expect(nameAt(first[first.length - 1].string, first[first.length - 1].fret)).toBe('A');
    expect(nameAt(second[second.length - 1].string, second[second.length - 1].fret)).toBe('D');
    expect(plainText(listen.options.find((o) => o.correct)!.text!)).toBe('The first phrase');
    const play = exercises(l).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    expect(played(play.notes).map((n) => nameAt(n.string, n.fret))).toEqual(['G', 'E', 'G', 'A']);
    expect(key(played(play.notes)[3])).toBe('4:7');
    for (const n of played(play.notes)) expect(BOX_KEYS.has(key(n))).toBe(true);
    expect(pos(findTargets(play.alternative as FretboardFindExercise))).toEqual([{ string: 4, fret: 7 }]);
  });
});

describe('first-scale: moving the box', () => {
  /** Box 1 slid so its string 6 root sits at `fret`. */
  const moved = (fret: number) => BOX1.notes.map((n) => ({ string: n.string, fret: n.fret + fret - 5 }));

  it('at any fret, the moved box is exactly the minor pentatonic of its string 6 note', () => {
    for (const fret of [3, 5, 7, 8, 10, 12]) {
      const tonic = pcName(noteAt({ string: 6, fret }, { context: { prefer: 'sharps' } }));
      const pcs = new Set(scalePcs(tonic, 'minor-pentatonic'));
      for (const p of moved(fret)) expect(pcs.has(midiAt(p) % 12), `${tonic} at ${fret}: ${key(p)}`).toBe(true);
    }
    expect([3, 7, 8, 10, 12].map((f) => pcName(noteAt({ string: 6, fret: f })))).toEqual(['G', 'B', 'C', 'D', 'E']);
  });

  it('the derived pictures at frets 3 and 8 draw exactly the moved box', () => {
    const [atG, atC] = cards(lesson('moving-the-box')).map((c) => resolveFigure(c.figure as FretboardFigure));
    expect(pos(atG.dots)).toEqual(pos(moved(3)));
    expect(pos(atC.dots)).toEqual(pos(moved(8)));
    expect(atG.root).toBe('G');
    expect(atC.root).toBe('C');
  });

  it('answers B at fret 7, D at fret 10, E at fret 12, G at fret 3, C at fret 8 and D at fret 10', () => {
    const l = lesson('moving-the-box');
    const at7 = exercises(l).find((e): e is ChoiceExercise => e.type === 'choice' && /fret 7/.test(plainText(e.prompt)))!;
    expect(correctText(at7)).toBe(`${nameAt(6, 7)} minor pentatonic`);
    const dFind = exercises(l).find((e): e is FretboardFindExercise => e.type === 'fretboard-find')!;
    expect(pos(findTargets(dFind))).toEqual([{ string: 6, fret: 10 }]);
    const typed = [...exercises(l), ...checkpoint()].filter((e): e is TypeAnswerExercise => e.type === 'type-answer');
    for (const t of typed) {
      const fret = Number(/fret (\d+)/.exec(plainText(t.prompt))![1]);
      expect(t.answer.kind === 'note' && t.answer.value).toBe(nameAt(6, fret));
    }
    const cFind = checkpoint().find((e): e is FretboardFindExercise => e.type === 'fretboard-find' && 'note' in e.find && e.find.note === 'C3')!;
    expect(pos(findTargets(cFind))).toEqual([{ string: 6, fret: 8 }]);
  });
});

describe('first-scale: what the tunes and phrases play', () => {
  const lastName = (notes: TabNote[]) => {
    const p = played(notes);
    const n = p[p.length - 1];
    return nameAt(n.string, n.fret);
  };

  it('the two tunes of lesson 1 use only scale notes and end on D, then on A', () => {
    const q = exercises(lesson('what-a-scale-is')).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    const tab = q.sound.kind === 'tab' ? q.sound.notes : [];
    const restAt = tab.findIndex((n) => 'rest' in n);
    expect(lastName(tab.slice(0, restAt))).toBe('D');
    expect(lastName(tab.slice(restAt + 1))).toBe('A');
    for (const n of played(tab)) expect(A_PENT).toContain(nameAt(n.string, n.fret));
    expect(plainText(q.options.find((o) => o.correct)!.text!)).toBe('The second tune');
  });

  it('the two-bar idea stays in box 1, fills two bars of 4/4, and ends on D (string 3, fret 7), then on A (string 4, fret 7)', () => {
    const l = lesson('making-music-with-five-notes');
    const tab = (cards(l)[0].figure as TabFigure).notes;
    const restAt = tab.findIndex((n) => 'rest' in n);
    const [first, second] = [tab.slice(0, restAt), tab.slice(restAt + 1)];
    const beats: Record<string, number> = { q: 1, h: 2 };
    for (const v of [first, second]) {
      expect(v.reduce((sum, n) => sum + beats[n.duration], 0)).toBe(8);
      for (const n of played(v)) expect(BOX_KEYS.has(key(n))).toBe(true);
    }
    expect(key(played(first)[6])).toBe('3:7');
    expect(lastName(first)).toBe('D');
    expect(key(played(second)[6])).toBe('4:7');
    expect(lastName(second)).toBe('A');
    // Only the last note changes.
    expect(first.slice(0, 6)).toEqual(second.slice(0, 6));
    const listen = exercises(l).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(listen.sound.kind === 'tab' && listen.sound.notes).toEqual(tab);
    const play = exercises(l).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    expect(play.notes).toEqual([...first, ...second]);
    expect(pos(findTargets(play.alternative as FretboardFindExercise))).toEqual(pos(BOX1.roots));
  });
});
