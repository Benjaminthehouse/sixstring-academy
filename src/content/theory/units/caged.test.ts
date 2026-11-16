/**
 * Unit 19 of the Theory Path, cross-checked against the engines: the open shapes and where their
 * roots lie, every barre and CAGED shape written in the text, the barre roots on strings 6 and 5,
 * the C-A-G-E-D order for C, G and A (from the engine's scale positions), the five positions and
 * the three-notes-per-string pattern of G major, the chord tones inside the E-shape position, what
 * each listening question plays, and that every lesson still teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import { chordNotes, chordPcs, chroma, scaleNotes } from '@/core/theory';
import { buildVoicing, cagedShapeOfRoots, chordVoicings, identifyFretted, libraryVoicings, midiAt, noteAt, parseFrets, rootToRoot, scalePatterns } from '@/core/guitar';
import {
  explainOf, findTargets, formatProblems, grade, isGenerated, plainText, soundPlan, tokenize, validateCourse,
  type ChordBuildExercise, type Exercise, type FretboardFindExercise, type FretDot, type Lesson, type ListenChoiceExercise,
  type MatchPairsExercise, type OrderExercise, type PlayChordExercise, type PlayPhraseExercise, type RichText, type Step, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './caged';

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
const correctText = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): string => plainText(e.options.find((o) => o.correct)?.text ?? '');
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const tagged = (text: RichText, type: 'chord' | 'note'): string[] => tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
const cards = (l: Lesson) => l.steps.filter((s): s is Extract<Step, { type: 'card' }> => !isGenerated(s) && s.type === 'card');
const fact = (l: Lesson, id: string) => l.facts!.find((f) => f.id === id)!;

/** Every string in the unit, the right answers only (wrong options carry wrong shapes on purpose). */
function claims(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) claims(v, out);
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if ('options' in o && Array.isArray(o.options)) {
      for (const [k, v] of Object.entries(o)) if (k !== 'options') claims(v, out);
      for (const opt of o.options as Array<Record<string, unknown>>) if (opt.correct) claims(opt, out);
    } else for (const v of Object.values(o)) claims(v, out);
  }
  return out;
}
const frets = (shape: string | ReadonlyArray<number | null>): Array<number | null> => (typeof shape === 'string' ? parseFrets(shape) : [...shape]);
/** The positions of a shape: string 6 first. */
const positions = (shape: string | Array<number | null>) =>
  frets(shape).flatMap((f, i) => (f === null ? [] : [{ string: 6 - i, fret: f }]));
/** The CAGED shape a voicing is, read from where its roots lie. */
const shapeOf = (symbol: string, shape: string | Array<number | null>) => {
  const root = chroma(chordNotes(symbol)[0]);
  return cagedShapeOfRoots(positions(shape).filter((p) => midiAt(p) % 12 === root));
};
const pos = (p: { string: number; fret: number }): string => `${p.string}:${p.fret}`;

describe('caged: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'intermediate', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^caged-/);
  });
});

describe('caged: the five open shapes', () => {
  const OPEN: Record<string, string> = { C: 'x32010', A: 'x02220', G: '320003', E: '022100', D: 'xx0232' };

  it('reads each open chord as its own CAGED shape, roots where the card says', () => {
    for (const [symbol, shape] of Object.entries(OPEN)) {
      expect(identifyFretted(shape).symbol, shape).toBe(symbol);
      expect(chordVoicings(symbol)[0].frets).toEqual(frets(shape));
      expect(shapeOf(symbol, shape), symbol).toBe(symbol);
    }
    const rootStrings = (symbol: string): number[] =>
      positions(OPEN[symbol]).filter((p) => midiAt(p) % 12 === chroma(symbol)).map((p) => p.string);
    expect(rootStrings('C')).toEqual([5, 2]);
    expect(rootStrings('G')).toEqual([6, 3, 1]);
    expect(rootStrings('E')).toEqual([6, 4, 1]);
    expect(rootStrings('A')).toEqual([5, 3]);
    expect(rootStrings('D')).toEqual([4, 2]);
  });

  it('matches each shape with the string of its lowest root', () => {
    const lowestRoot = (symbol: string): number => Math.max(...positions(OPEN[symbol]).filter((p) => midiAt(p) % 12 === chroma(symbol)).map((p) => p.string));
    const pairs = ofType<MatchPairsExercise>('match-pairs').filter((e) => /lowest root/.test(plainText(e.prompt))).flatMap((e) => e.pairs);
    expect(pairs.length).toBe(6);
    for (const p of pairs) expect(plainText(p.right)).toBe(`String ${lowestRoot(plainText(p.left)[0])}`);
    const choice = exercises(lesson('five-open-shapes').steps).find((e) => e.type === 'choice')!;
    expect(correctText(choice as never)).toBe(`String ${lowestRoot('A')}`);
  });

  it('orders the shapes as the word spells them', () => {
    for (const e of ofType<OrderExercise>('order').filter((x) => /CAGED order/.test(plainText(x.prompt)))) {
      expect(e.tiles.map((t) => plainText(t)[0]).join('')).toBe('CAGED');
    }
  });
});

describe('caged: barre chords', () => {
  it('builds every chord-build and play-chord shape as the chord it names', () => {
    const shaped: Array<ChordBuildExercise | PlayChordExercise> = [
      ...ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers'),
      ...ofType<PlayChordExercise>('play-chord'),
    ];
    expect(shaped.length).toBeGreaterThanOrEqual(15);
    for (const e of shaped) expect(buildVoicing(e.chord, e.frets!).chord, `${e.chord} ${String(e.frets)}`).toBe(e.chord);
  });

  it('quotes only shapes that are the chord beside them', () => {
    const shapes: Record<string, string> = {
      x32010: 'C', x02220: 'A', '320003': 'G', '022100': 'E', xx0232: 'D', x02210: 'Am',
      '133211': 'F', '355433': 'G', '577655': 'A', '133111': 'Fm', '355333': 'Gm', '577555': 'Am',
      x13331: 'Bb', x24442: 'B', x35553: 'C', x24432: 'Bm', x57775: 'D', x79987: 'Em', x35543: 'Cm',
      '8-10-10-9-8-8': 'C', '10-12-12-10-10-10': 'Dm', 'x-10-12-12-12-10': 'G', 'x-10-9-7-8-7': 'G',
    };
    const quoted = claims(unit).flatMap((t) => [
      ...[...t.matchAll(/(?<![\w-])[x0-9]{6}(?![\w-])/g)].map((m) => m[0]),
      ...[...t.matchAll(/(?<![\w-])(?:x|\d{1,2})(?:-(?:x|\d{1,2})){5}(?![\w-])/g)].map((m) => m[0]),
    ]);
    expect(quoted.length).toBeGreaterThan(30);
    for (const q of quoted) expect(Object.keys(shapes), q).toContain(q);
    for (const [shape, symbol] of Object.entries(shapes)) expect(identifyFretted(shape).symbol, shape).toBe(symbol);
  });

  it('names E-shape barres by string 6 and A-shape barres by string 5', () => {
    const at6 = (fret: number) => noteAt({ string: 6, fret }, { octave: false });
    const at5 = (fret: number) => noteAt({ string: 5, fret }, { octave: false });
    expect([1, 3, 5, 7, 8, 10, 12].map(at6)).toEqual(['F', 'G', 'A', 'B', 'C', 'D', 'E']);
    expect([3, 5, 7, 8, 10].map(at5)).toEqual(['C', 'D', 'E', 'F', 'G']);
    expect(at5(1)).toMatch(/^(Bb|A#)$/);
    expect(at5(2)).toBe('B');
    // The E-shape barre at fret n is the open E shape with every fret raised n: 022100 -> 133211.
    const eShape = (n: number, minor = false) => (minor ? [0, 2, 2, 0, 0, 0] : [0, 2, 2, 1, 0, 0]).map((f) => f + n);
    const aShape = (n: number, minor = false) => [null, ...(minor ? [0, 2, 2, 1, 0] : [0, 2, 2, 2, 0])].map((f) => (f === null ? null : f + n));
    expect(identifyFretted(eShape(1)).symbol).toBe('F');
    expect(identifyFretted(eShape(3)).symbol).toBe('G');
    expect(identifyFretted(eShape(5)).symbol).toBe('A');
    expect(identifyFretted(eShape(8)).symbol).toBe('C');
    expect(identifyFretted(eShape(1, true)).symbol).toBe('Fm');
    expect(identifyFretted(eShape(3, true)).symbol).toBe('Gm');
    expect(identifyFretted(eShape(5, true)).symbol).toBe('Am');
    expect(identifyFretted(eShape(10, true)).symbol).toBe('Dm');
    expect(identifyFretted(aShape(1)).symbol).toBe('Bb');
    expect(identifyFretted(aShape(2)).symbol).toBe('B');
    expect(identifyFretted(aShape(3)).symbol).toBe('C');
    expect(identifyFretted(aShape(5)).symbol).toBe('D');
    expect(identifyFretted(aShape(10)).symbol).toBe('G');
    expect(identifyFretted(aShape(2, true)).symbol).toBe('Bm');
    expect(identifyFretted(aShape(3, true)).symbol).toBe('Cm');
    expect(identifyFretted(aShape(7, true)).symbol).toBe('Em');
    // The typed answers.
    const typed = ofType<TypeAnswerExercise>('type-answer').map((e) => [plainText(e.prompt), e.answer.value]);
    expect(typed).toEqual([
      ['An E-minor-shape barre chord with the barre at fret 10. Which chord is it?', 'Dm'],
      ['An A-shape major barre chord with the barre at fret 10. Which chord is it?', 'G'],
      ['An A-shape major barre chord with the barre at fret 3. Which chord is it?', 'C'],
    ]);
  });

  it('says what the barre and the lifted finger do', () => {
    const f = buildVoicing('F', '133211');
    expect(f.barres).toEqual([{ fret: 1, finger: 1, fromString: 6, toString: 1 }]);
    expect(f.notes.filter((n) => n.fret === 1).map((n) => n.string)).toEqual([6, 2, 1]);
    // Those are the strings open E leaves open.
    expect(positions('022100').filter((p) => p.fret === 0).map((p) => p.string)).toEqual([6, 2, 1]);
    // String 3 holds the 3rd: A in F, Ab (the barre) in Fm; Bb in Gm, C in Am.
    expect(noteAt({ string: 3, fret: 2 }, { octave: false, context: { chord: 'F' } })).toBe('A');
    expect(noteAt({ string: 3, fret: 1 }, { octave: false, context: { chord: 'Fm' } })).toBe('Ab');
    expect(noteAt({ string: 3, fret: 3 }, { octave: false, context: { chord: 'Gm' } })).toBe('Bb');
    expect(noteAt({ string: 3, fret: 5 }, { octave: false, context: { chord: 'Am' } })).toBe('C');
    expect(noteAt({ string: 2, fret: 4 }, { octave: false, context: { chord: 'Cm' } })).toBe('Eb');
    // In the A shape string 1 plays the 5th; the root is on string 5.
    expect(noteAt({ string: 1, fret: 1 }, { octave: false, context: { chord: 'Bb' } })).toBe('F');
    expect(chordNotes('Bb')[2]).toBe('F');
  });

  it('marks a chord-build right only for the shape it names', () => {
    // Each prompt names a shape ("the D shape", "as an A-shape barre"), so another voicing of the
    // same chord must not pass: any-voicing would take D/F# (2x0232) or x54232 for "the D shape".
    const builds = ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers');
    expect(builds.length).toBe(13);
    for (const e of builds) {
      expect(e.accept, `${e.chord} ${String(e.frets)}`).toBe('this-shape');
      expect(grade(e, { type: 'chord-build', frets: frets(e.frets!) }).correct, `${e.chord} ${String(e.frets)}`).toBe(true);
      // Every other library shape of the same chord is wrong here.
      const others = chordVoicings(e.chord, { maxResults: 12 }).map((v) => [...v.frets]).filter((f) => f.join() !== frets(e.frets!).join());
      expect(others.length, e.chord).toBeGreaterThan(0);
      for (const f of others) expect(grade(e, { type: 'chord-build', frets: f }).correct, `${e.chord} built as ${f.join()}`).toBe(false);
    }
    const d = builds.find((e) => e.chord === 'D' && frets(e.frets!).join() === frets('xx0232').join())!;
    for (const f of ['2x0232', 'x00232', 'x54232']) expect(grade(d, { type: 'chord-build', frets: frets(f) }).correct, f).toBe(false);
  });

  it('drills only chords whose first library shape is the barre the lesson teaches', () => {
    const drill = (id: string) => lesson(id).steps.find((s) => isGenerated(s) && s.generate === 'chord-shape') as { params: { chords: string[] } };
    for (const c of drill('e-shape-barre').params.chords) expect(chordVoicings(c)[0].label, c).toMatch(/^E-shape barre/);
    for (const c of drill('a-shape-barre').params.chords) expect(chordVoicings(c)[0].label, c).toMatch(/^A-shape barre/);
  });
});

describe('caged: C-A-G-E-D up the neck', () => {
  const order = (tonic: string) => scalePatterns(tonic, 'major').map((p) => p.shape);

  it('climbs C, G and A in CAGED order from the nut', () => {
    expect(order('C')).toEqual(['C', 'A', 'G', 'E', 'D']);
    expect(order('G')).toEqual(['G', 'E', 'D', 'C', 'A']);
    expect(order('A')).toEqual(['A', 'G', 'E', 'D', 'C']);
    // The order exercises.
    const orders = ofType<OrderExercise>('order');
    const of = (re: RegExp) => orders.filter((e) => re.test(plainText(e.prompt))).map((e) => e.tiles.map((t) => plainText(t)[0]).join(''));
    expect(of(/C major/)).toEqual(['CAGED']);
    expect(new Set(of(/G major/))).toEqual(new Set(['GEDCA']));
  });

  it('places the five shapes of C where the lesson says', () => {
    const shapes: Array<[string, string | Array<number | null>]> = [
      ['C', 'x32010'], ['A', 'x35553'], ['G', '875558'], ['E', '8-10-10-9-8-8'], ['D', [null, null, 10, 12, 13, 12]],
    ];
    for (const [shape, f] of shapes) {
      expect(identifyFretted(f).symbol, shape).toBe('C');
      expect(shapeOf('C', f), String(f)).toBe(shape);
    }
    expect(libraryVoicings('C', { categories: ['caged'] }).map((v) => v.frets.join())).toContain([8, 7, 5, 5, 5, 8].join());
    expect(midiAt({ string: 4, fret: 10 }) % 12).toBe(0); // the D shape's root
    // The tab card picks those five shapes, nothing but C, E and G.
    const card = cards(lesson('the-caged-order'))[1] as { figure: { notes: Array<{ string: number; fret: number }> } };
    expect(card.figure.notes.map((n) => midiAt(n) % 12).every((pc) => chordPcs('C').includes(pc))).toBe(true);
    expect(card.figure.notes.map(pos)).toEqual(shapes.flatMap(([, f]) => positions(f).map(pos)));
    // The match-pairs.
    const pairs = Object.fromEntries(ofType<MatchPairsExercise>('match-pairs').find((e) => /shape of \{c:C\}/.test(String(e.prompt)))!.pairs.map((p) => [plainText(p.left), plainText(p.right)]));
    expect(pairs).toEqual({ 'C shape': 'Open position', 'A shape': 'Barre at fret 3', 'E shape': 'Barre at fret 8', 'D shape': 'Root on string 4, fret 10' });
  });

  it('rings the notes the A and G shapes of C share', () => {
    const shared = positions('x35553').map(pos).filter((p) => positions('875558').map(pos).includes(p));
    expect(shared).toEqual(['4:5', '3:5', '2:5']);
    const fig = cards(lesson('the-caged-order'))[2].figure as { dots: FretDot[] };
    expect(fig.dots.filter((d) => d.role === 'target').map(pos)).toEqual(shared);
    const all = new Set([...positions('x35553'), ...positions('875558')].map(pos));
    expect(new Set(fig.dots.map(pos))).toEqual(all);
  });

  it('finds the roots of the A shape at fret 3', () => {
    const e = ofType<FretboardFindExercise>('fretboard-find').find((x) => /A shape of \{c:C\}/.test(String(x.prompt)))!;
    expect(findTargets(e).map(pos)).toEqual(['5:3', '3:5']);
    expect([...(e.shown ?? []).map(pos), ...findTargets(e).map(pos)].sort()).toEqual(positions('x35553').map(pos).sort());
  });
});

describe('caged: one chord in five places', () => {
  it('places the five shapes of G as the lesson says', () => {
    const g: Array<[string, string | Array<number | null>]> = [
      ['G', '320003'], ['E', '355433'], ['D', 'xx5787'], ['C', [null, 10, 9, 7, 8, 7]], ['A', [null, 10, 12, 12, 12, 10]], ['G', [15, 14, 12, 12, 12, 15]],
    ];
    for (const [shape, f] of g) {
      expect(identifyFretted(f).symbol, String(f)).toBe('G');
      expect(shapeOf('G', f), String(f)).toBe(shape);
    }
    const labels = [...chordVoicings('G', { maxResults: 40 }), ...libraryVoicings('G', { categories: ['caged'] })].map((v) => v.frets.join());
    for (const [, f] of g.slice(1)) expect(labels, String(f)).toContain(frets(f).join());
    // The roots that anchor them: G on strings 6, 5 and 4 up to fret 12.
    const find = ofType<FretboardFindExercise>('fretboard-find').filter((x) => /every \{n:G\} on strings 6, 5 and 4/.test(String(x.prompt)));
    expect(find.length).toBe(2);
    for (const e of find) expect(findTargets(e).map(pos)).toEqual(['6:3', '5:10', '4:5']);
    const a = ofType<FretboardFindExercise>('fretboard-find').find((x) => /every \{n:A\}/.test(String(x.prompt)))!;
    expect(findTargets(a).map(pos)).toEqual(['6:5', '5:0', '5:12', '4:7']);
  });

  it('builds A on string 6 at fret 5 as the E shape, and the G shape there reaches toward the nut', () => {
    expect(shapeOf('A', '577655')).toBe('E');
    expect(identifyFretted('542225').symbol).toBe('A');
    expect(shapeOf('A', '542225')).toBe('G');
    expect(Math.min(...positions('542225').map((p) => p.fret))).toBe(2);
    // The A and C shapes root on string 5, E and G on string 6, D on string 4.
    const root = (shape: string, symbol: string, f: string) => Math.max(...positions(f).filter((p) => midiAt(p) % 12 === chroma(symbol)).map((p) => p.string));
    expect([root('A', 'A', 'x02220'), root('C', 'C', 'x32010'), root('E', 'E', '022100'), root('G', 'G', '320003'), root('D', 'D', 'xx0232')]).toEqual([5, 5, 6, 6, 4]);
  });

  it('plays the A shape at fret 10 first, then the E shape at fret 3', () => {
    const [q] = listens(lesson('one-chord-five-places'));
    const notes = (q.sound as { notes: Array<{ string: number; fret: number }> }).notes;
    const first = notes.slice(0, 5).map((n) => midiAt(n));
    const second = notes.slice(5).map((n) => midiAt(n));
    expect(identifyFretted(notes.slice(0, 5)).symbol).toBe('G');
    expect(identifyFretted(notes.slice(5)).symbol).toBe('G');
    expect(Math.min(...first)).toBeGreaterThan(Math.min(...second));
    expect(Math.max(...first)).toBeGreaterThan(Math.max(...second));
    expect(correctText(q)).toBe('The first');
  });
});

describe('caged: the major scale in five positions', () => {
  const patterns = scalePatterns('G', 'major');
  const eShape = patterns.find((p) => p.shape === 'E')!;

  it('gives the five positions of G major the frets the text quotes', () => {
    expect(patterns.map((p) => `${p.shape} ${p.minFret}-${p.maxFret}`)).toEqual(['G 0-4', 'E 2-5', 'D 4-8', 'C 7-10', 'A 9-13']);
    const back = plainText(fact(lesson('major-scale-positions'), 'caged-g-five-positions').back);
    for (const p of patterns) expect(back).toContain(`${p.minFret} to ${p.maxFret} (${p.shape} shape)`);
    expect(eShape.positionName).toBe('2nd position');
    // "Second position, after the fret your first finger covers."
    expect([...new Set(eShape.notes.filter((n) => n.finger === 1).map((n) => n.fret))]).toEqual([2]);
    // Neighbouring positions overlap.
    for (let i = 1; i < patterns.length; i++) expect(patterns[i].minFret).toBeLessThanOrEqual(patterns[i - 1].maxFret);
    // The true-false: the E-shape (2 to 5) and D-shape (4 to 8) positions share the notes at frets 4 and 5.
    const d = patterns.find((p) => p.shape === 'D')!;
    const shared = eShape.notes.filter((n) => d.notes.some((m) => pos(m) === pos(n)));
    expect([...new Set(shared.map((n) => n.fret))].sort()).toEqual([4, 5]);
    expect(eShape.notes.filter((n) => n.fret >= 4).map(pos).sort()).toEqual(shared.map(pos).sort());
    const tf = exercises(lesson('major-scale-positions').steps).find((e) => e.type === 'true-false')!;
    expect(plainText(explainOf(tf) ?? '')).toContain(`(frets ${eShape.minFret} to ${eShape.maxFret}) and the D-shape position (frets ${d.minFret} to ${d.maxFret}) share the notes at frets 4 and 5`);
  });

  it('draws the E-shape position note for note and finger for finger', () => {
    const fig = cards(lesson('major-scale-positions'))[0].figure as { dots: FretDot[] };
    const engine = eShape.notes.map((n) => `${pos(n)} ${n.note} f${n.finger}`).sort();
    expect(fig.dots.map((d) => `${pos(d)} ${d.note} f${d.finger}`).sort()).toEqual(engine);
    // The fact, string by string.
    const byString = [6, 5, 4, 3, 2, 1].map((s) => `String ${s}: ${eShape.notes.filter((n) => n.string === s).map((n) => n.fret).sort((a, b) => a - b).join(', ')}.`);
    expect(plainText(fact(lesson('major-scale-positions'), 'caged-g-e-shape-position').back)).toBe(byString.join(' '));
    // Every G inside it, and the B (the 3rd) the next lesson asks for.
    const find = (re: RegExp) => ofType<FretboardFindExercise>('fretboard-find').filter((x) => re.test(String(x.prompt)));
    for (const e of find(/tap every \{n:G\}/)) expect(findTargets(e).map(pos).sort()).toEqual(eShape.notes.filter((n) => n.note === 'G').map(pos).sort());
    for (const e of find(/tap every \{n:B\}/)) expect(findTargets(e).map(pos).sort()).toEqual(eShape.notes.filter((n) => n.note === 'B').map(pos).sort());
    expect(find(/tap every \{n:B\}/).length).toBe(2);
  });

  it('climbs two octaves from the low G, and back down in the next lesson', () => {
    const up = exercises(lesson('major-scale-positions').steps).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    const climb = rootToRoot(eShape, { octaves: 2 });
    expect(up.notes.map((n) => pos(n as { string: number; fret: number }))).toEqual(climb.map(pos));
    expect(climb.map((n) => n.midi)).toEqual([...climb.map((n) => n.midi)].sort((a, b) => a - b));
    expect(climb[0].midi + 24).toBe(climb[climb.length - 1].midi);
    expect(up.notes.length).toBe(15);
    const down = exercises(lesson('shapes-inside-scales').steps).find((e): e is PlayPhraseExercise => e.type === 'play-phrase')!;
    expect(down.notes.map((n) => pos(n as { string: number; fret: number }))).toEqual([...climb].reverse().map(pos));
    // "Every second or third note is a G chord tone", from the high G down to the low G.
    const toneAt = down.notes.flatMap((n, i) => (chordPcs('G').includes(midiAt(n as { string: number; fret: number }) % 12) ? [i] : []));
    expect(toneAt[0]).toBe(0);
    expect(toneAt[toneAt.length - 1]).toBe(down.notes.length - 1);
    for (let i = 1; i < toneAt.length; i++) expect([2, 3]).toContain(toneAt[i] - toneAt[i - 1]);
    // The tab card shows the same climb.
    const tab = cards(lesson('major-scale-positions'))[1].figure as { notes: Array<{ string: number; fret: number }> };
    expect(tab.notes.map(pos)).toEqual(climb.map(pos));
    // Each note is in G major.
    expect(climb.every((n) => scaleNotes('G', 'major').includes(n.note))).toBe(true);
  });

  it('gives the three-notes-per-string pattern from string 6, fret 3', () => {
    const three = scalePatterns('G', 'major', { system: '3nps' })[0];
    const fig = cards(lesson('major-scale-positions'))[3].figure as { dots: FretDot[] };
    expect(fig.dots.map((d) => `${pos(d)} ${d.note}`).sort()).toEqual(three.notes.map((n) => `${pos(n)} ${n.note}`).sort());
    const frets = (s: number) => three.notes.filter((n) => n.string === s).map((n) => n.fret).join(' ');
    expect([6, 5, 4, 3, 2, 1].map(frets)).toEqual(['3 5 7', '3 5 7', '4 5 7', '4 5 7', '5 7 8', '5 7 8']);
    expect(plainText(fact(lesson('major-scale-positions'), 'caged-three-per-string').back)).toBe(
      `Frets ${frets(6)} on strings 6 and 5, ${frets(4)} on strings 4 and 3, and ${frets(2)} on strings 2 and 1.`,
    );
    // The wrong option's fret 9 on string 2 is G sharp, outside G major.
    expect(midiAt({ string: 2, fret: 9 }) % 12).toBe(chroma('G#'));
    expect(scaleNotes('G', 'major').map(chroma)).not.toContain(chroma('G#'));
  });
});

describe('caged: chord shapes inside scale positions', () => {
  const eShape = scalePatterns('G', 'major').find((p) => p.shape === 'E')!;

  it('colours exactly the G chord tones of the E-shape position', () => {
    const fig = cards(lesson('shapes-inside-scales'))[0].figure as { dots: FretDot[] };
    const tones = fig.dots.filter((d) => d.role !== 'ghost').map(pos).sort();
    expect(tones).toEqual(eShape.notes.filter((n) => chordPcs('G').includes(n.midi % 12)).map(pos).sort());
    // They are the 355433 barre plus the B on string 5, fret 2.
    expect(tones).toEqual([...positions('355433').map(pos), '5:2'].sort());
    for (const d of fig.dots) expect(d.degree, pos(d)).toBe(eShape.notes.find((n) => pos(n) === pos(d))!.degree);
  });

  it('names the roles the questions ask for', () => {
    const role = (string: number, fret: number): string => {
      const pc = midiAt({ string, fret }) % 12;
      return ['Root', 'Third', 'Fifth'][chordNotes('G').findIndex((n) => chroma(n) === pc)] ?? 'Not a chord tone';
    };
    const pairs = ofType<MatchPairsExercise>('match-pairs').find((e) => /role over/.test(plainText(e.prompt)))!.pairs;
    for (const p of pairs) {
      const [, s, f] = plainText(p.left).match(/String (\d), fret (\d+)/)!;
      expect(plainText(p.right)).toBe(role(Number(s), Number(f)));
    }
    expect(role(5, 5)).toBe('Fifth');
    expect(role(1, 3)).toBe('Root');
    expect(noteAt({ string: 1, fret: 2 }, { octave: false, context: { key: 'G major' } })).toBe('F#');
  });
});

describe('caged: what each listening question plays', () => {
  it('e-shape-barre: A minor in the E-minor shape', () => {
    const [q] = listens(lesson('e-shape-barre'));
    const midi = soundPlan(q.sound).events.flatMap((e) => e.midi);
    expect([...new Set(midi.map((m) => m % 12))].sort((a, b) => a - b)).toEqual([...chordPcs('Am')].sort((a, b) => a - b));
    expect(identifyFretted('577555').symbol).toBe('Am');
    expect(correctText(q)).toBe('Minor');
  });

  it('the-barre: the tab card picks the F barre string by string', () => {
    const fig = cards(lesson('the-barre'))[2].figure as { notes: Array<{ string: number; fret: number }> };
    expect(fig.notes.map(pos)).toEqual(positions('133211').map(pos));
  });
});

describe('caged: on the go', () => {
  it('still teaches with the sound off and with the guitar away', () => {
    for (const c of [{ guitar: false, sound: true }, { guitar: false, sound: false }, { guitar: true, sound: false }]) {
      const adapted = adaptUnit(unit, c);
      for (const l of adapted.lessons) {
        const asked = l.steps.filter((s) => isGenerated(s) || s.type !== 'card');
        expect(asked.length, `${l.id} ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(MIN_QUIET_EXERCISES + 2);
        expect(asked.some((s) => !isGenerated(s) && s.type.startsWith('play-')), `${l.id}: a play step is left`).toBe(false);
        if (!c.sound) expect(asked.some((s) => isListeningStep(s)), `${l.id}: a listening step is left`).toBe(false);
      }
      expect(adapted.checkpoint?.steps?.length ?? 0, JSON.stringify(c)).toBeGreaterThanOrEqual(15);
    }
  });

  it('spells the notes the text names', () => {
    expect(tagged('{n:G} {n:B} {n:D}', 'note')).toEqual(chordNotes('G'));
    expect(chordNotes('C')).toEqual(['C', 'E', 'G']);
  });
});
