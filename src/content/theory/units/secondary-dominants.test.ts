/**
 * Unit 32 of the Theory Path, cross-checked against the engines: every chord shape written next
 * to a chord name, every numeral and the chord it stands for (`romanToChord`, `chordToRoman`,
 * `secondaryDominants`), the outside note of each secondary dominant, every resolution and chain
 * a fifth down, the leading-tone chords and their rootless dominants, what each listening question
 * plays, and that every lesson still teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import {
  chordNotes, chordPcs, chordToRoman, circleOfFifths, diatonicChords, intervalBetween, parseChord, romanToChord, scaleNotes,
  secondaryDominants, transpose,
} from '@/core/theory';
import { buildVoicing, tryBuildVoicing } from '@/core/guitar';
import {
  formatProblems, grade, isGenerated, plainText, resolveFigure, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type ChordBuildExercise, type Exercise, type Figure, type FillBlanksExercise, type Lesson, type ListenChoiceExercise,
  type MatchPairsExercise, type OrderExercise, type PlayChordExercise, type RichText, type Step, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './secondary-dominants';

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

/** Every string in the unit (texts, captions, options, facts). */
function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) texts(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) texts(v, out);
  return out;
}
/** The values of the tags of one kind in a text: `{c:Am7}` -> 'Am7'. */
function tagged(text: RichText, type: 'chord' | 'roman' | 'note' | 'key'): string[] {
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
const pcSet = (symbol: string): string => [...new Set(chordPcs(symbol))].sort((a, b) => a - b).join('.');
const rootOf = (symbol: string): string => parseChord(symbol)!.root;
/** The key a prompt names, as `{k:G major}`. */
const keyIn = (text: RichText): string => tagged(text, 'key')[0];

describe('secondary-dominants: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^secondary-/);
  });
});

describe('secondary-dominants: every shape written in the text', () => {
  // "{c:D7} (xx0212)" and "x02020" -> "{c:A7}" in a match-pairs.
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

  it('builds every chord figure, chord-build, play-chord and matched shape as its chord', () => {
    const figures = chordFigures(unit);
    expect(figures.length).toBeGreaterThanOrEqual(8);
    for (const f of figures) expect(buildVoicing(f.symbol, f.frets).chord, `${f.symbol} ${f.frets}`).toBe(f.symbol);
    const shaped: Array<ChordBuildExercise | PlayChordExercise> = [
      ...ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers'),
      ...ofType<PlayChordExercise>('play-chord'),
    ];
    expect(shaped.length).toBe(8); // four play-chord steps and their chord-build alternatives
    for (const e of shaped) expect(buildVoicing(e.chord, e.frets!).chord, `${e.chord} ${String(e.frets)}`).toBe(e.chord);
    const matched = ofType<MatchPairsExercise>('match-pairs').flatMap((e) => e.pairs).filter((p) => /^[x0-9]{6}$/.test(plainText(p.left)));
    expect(matched.length).toBe(8);
    for (const p of matched) expect(buildVoicing(tagged(p.right, 'chord')[0], plainText(p.left)).chord).toBe(tagged(p.right, 'chord')[0]);
  });

  it('marks the notes the captions point at', () => {
    expect(buildVoicing('D7', 'xx0212').notes.find((n) => n.string === 1)!.note).toBe('F#');
    expect(buildVoicing('E7', '020100').notes.find((n) => n.string === 3)!.note).toBe('G#');
    expect(buildVoicing('C7', 'x32310').notes.find((n) => n.string === 3)!.note).toBe('Bb');
    expect(buildVoicing('F#dim7', '2x121x').notes[0].note).toBe('F#');
    // Am x02210 to A7 x02020: C rises to C#, the open G adds the 7th.
    expect(buildVoicing('Am', 'x02210').notes.find((n) => n.string === 2)!.note).toBe('C');
    expect(buildVoicing('A7', 'x02020').notes.find((n) => n.string === 2)!.note).toBe('C#');
    expect(buildVoicing('A7', 'x02020').notes.find((n) => n.string === 3)!.degree).toBe('b7');
    // Em 022000 to E7 020100: string 3 G to G#, string 4 opens to D, the 7th.
    expect(buildVoicing('Em', '022000').notes.find((n) => n.string === 3)!.note).toBe('G');
    expect(buildVoicing('E7', '020100').notes.find((n) => n.string === 4)!.note).toBe('D');
  });
});

describe('secondary-dominants: numerals and the chords they stand for', () => {
  it('matches every chord with its secondary numeral in C major', () => {
    const jobs = ofType<MatchPairsExercise>('match-pairs').filter((e) => /job in/.test(plainText(e.prompt)));
    expect(jobs.length).toBe(3);
    for (const p of jobs.flatMap((e) => e.pairs)) {
      const symbol = tagged(p.left, 'chord')[0];
      const numeral = tagged(p.right, 'roman')[0];
      expect(romanToChord(numeral, 'C'), numeral).toBe(symbol);
      expect(chordToRoman(symbol, 'C').roman, symbol).toBe(numeral);
    }
  });

  it('lists the five secondary dominants of C major, and none for vii°', () => {
    const five = secondaryDominants('C');
    expect(five.map((s) => `${s.symbol} ${s.roman}`)).toEqual(['A7 V7/ii', 'B7 V7/iii', 'C7 V7/IV', 'D7 V7/V', 'E7 V7/vi']);
    const fact = lesson('the-five-in-c').facts!.find((f) => f.id === 'secondary-five-in-c')!;
    expect(tagged(fact.back, 'chord')).toEqual(five.map((s) => s.symbol));
    expect(tagged(fact.back, 'roman')).toEqual(five.map((s) => s.roman));
    expect(five.some((s) => s.target.startsWith('vii'))).toBe(false);
    expect(diatonicChords('C major')[6].symbol).toBe('Bdim');
  });

  it('answers each "which chord is V7/x" question from the engine', () => {
    const asked = ofType<ChoiceExercise>('choice').filter((e) => /which chord is \{r:V7\/|what is \{r:V7\//i.test(String(e.prompt)));
    expect(asked.length).toBe(3);
    for (const e of asked) {
      const numeral = tagged(e.prompt, 'roman')[0];
      const key = keyIn(e.prompt);
      expect(tagged(correctOption(e), 'chord')[0], `${numeral} in ${key}`).toBe(romanToChord(numeral, key));
    }
    // The first numeral question names D7 by its numeral.
    const named = exercises(lesson('what-a-secondary-dominant-is').steps).find((e) => e.type === 'choice' && /What do we call/.test(plainText(e.prompt))) as ChoiceExercise;
    expect(tagged(correctOption(named), 'roman')[0]).toBe(chordToRoman('D7', 'C').roman);
  });

  it('types the chords the engine gives', () => {
    const typed = ofType<TypeAnswerExercise>('type-answer');
    expect(typed.length).toBe(3);
    for (const e of typed) {
      if (e.answer.kind !== 'chord') throw new Error('expected a chord answer');
      const key = keyIn(e.prompt);
      const numeral = tagged(e.prompt, 'roman')[0];
      const expected = numeral ? romanToChord(numeral, key) : chordToRoman(tagged(e.prompt, 'chord')[0], key).targetChord;
      expect(e.answer.value, plainText(e.prompt)).toBe(expected);
    }
  });

  it('builds the ragtime progression and the chains from the engine\'s numerals', () => {
    expect(['III7', 'VI7', 'II7', 'V7', 'I'].map((r) => romanToChord(r, 'C'))).toEqual(['E7', 'A7', 'D7', 'G7', 'C']);
    expect(romanToChord('III7', 'G')).toBe('B7');
    const q = exercises(unit.checkpoint!.steps!).find((e) => e.type === 'choice' && /ragtime/.test(plainText(e.prompt))) as ChoiceExercise;
    expect(tagged(correctOption(q), 'chord')[0]).toBe(romanToChord('III7', 'G'));
    const fill = ofType<FillBlanksExercise>('fill-blanks').find((e) => /ragtime/.test(plainText(e.prompt)))!;
    expect(fill.blanks.map((b) => tagged(b, 'chord')[0])).toEqual([romanToChord('VI7', 'C'), romanToChord('V7', 'C')]);
  });
});

describe('secondary-dominants: outside notes and resolutions', () => {
  const cMajor = scaleNotes('C', 'major');
  const outside = (symbol: string, scale = cMajor): string[] => chordNotes(symbol).filter((n) => !scale.includes(n));

  it('brings the outside notes the text names, usually the leading tone of the target', () => {
    expect(outside('A7')).toEqual(['C#']);
    expect(outside('B7')).toEqual(['D#', 'F#']);
    expect(outside('C7')).toEqual(['Bb']);
    expect(outside('D7')).toEqual(['F#']);
    expect(outside('E7')).toEqual(['G#']);
    for (const [chord, target] of [['A7', 'D'], ['B7', 'E'], ['D7', 'G'], ['E7', 'A']]) expect(outside(chord).map((n) => transpose(n, 'm2')), chord).toContain(target);
    // The C7 is the odd one: its outside note is the b7, not a leading tone.
    expect(transpose('Bb', 'm2')).not.toBe('F');
    const q = exercises(lesson('the-five-in-c').steps).find((e) => e.type === 'choice' && /outside the key/.test(plainText(e.prompt))) as ChoiceExercise;
    expect(tagged(correctOption(q), 'note')).toEqual(outside('E7'));
    const cp = exercises(unit.checkpoint!.steps!).find((e) => e.type === 'choice' && /outside/.test(plainText(e.prompt))) as ChoiceExercise;
    expect(tagged(correctOption(cp), 'note')).toEqual(outside('A7'));
    // F major: the D7 brings F#.
    expect(outside('D7', scaleNotes('F', 'major'))).toEqual(['F#']);
  });

  it('resolves each one down a fifth to its target', () => {
    for (const [chord, key] of [['E7', 'G'], ['B7', 'G'], ['F#7', 'D'], ['E7', 'C'], ['A7', 'C'], ['D7', 'F']]) {
      const a = chordToRoman(chord, key);
      expect(a.relation, `${chord} in ${key}`).toBe('secondary-dominant');
      expect(intervalBetween(rootOf(chord), rootOf(a.targetChord!)), `${chord} -> ${a.targetChord}`).toBe('P4');
    }
    expect(chordToRoman('B7', 'G').targetChord).toBe('Em');
    expect(chordToRoman('F#7', 'D').targetChord).toBe('Bm');
    expect(chordToRoman('D7', 'F').targetChord).toBe('Gm');
    // C7 in C: the dominant of F before F, the blues home chord otherwise.
    expect(chordToRoman('C7', 'C', { next: 'F' }).roman).toBe('V7/IV');
    expect(chordToRoman('C7', 'C', { next: null }).roman).toBe('I7');
  });

  it('spots the strangers in the eight-bar chart in G, and the key\'s own V7', () => {
    const chart = ['G', 'E7', 'Am', 'D7', 'G', 'B7', 'Em', 'D7'];
    const card = lesson('spotting-and-resolving').steps[0];
    if (isGenerated(card) || card.type !== 'card') throw new Error('expected a card');
    expect(tagged(card.body, 'chord').slice(0, 8)).toEqual(chart);
    const relations = chart.map((c, i) => chordToRoman(c, 'G', { next: chart[i + 1] ?? null }).relation);
    expect(chart.filter((_c, i) => relations[i] === 'secondary-dominant')).toEqual(['E7', 'B7']);
    expect(chordToRoman('D7', 'G').roman).toBe('V7');
    expect([diatonicChords('G major')[5].symbol, diatonicChords('G major')[2].symbol]).toEqual(['Em', 'Bm']);
    // Each stranger resolves to the chord after it.
    expect(chart[chart.indexOf('E7') + 1]).toBe(chordToRoman('E7', 'G').targetChord);
    expect(chart[chart.indexOf('B7') + 1]).toBe(chordToRoman('B7', 'G').targetChord);
  });

  it('marks only true strangers as secondary dominants in the spotting questions', () => {
    const spot = ofType<ChoiceExercise>('choice').filter((e) => /most likely a secondary dominant|is a secondary dominant/.test(plainText(e.prompt)));
    expect(spot.length).toBe(3);
    for (const e of spot) {
      const key = keyIn(e.prompt);
      for (const o of e.options) {
        const chord = tagged(o.text ?? '', 'chord')[0];
        const isSecondary = chordToRoman(chord, key).relation === 'secondary-dominant';
        expect(isSecondary, `${chord} in ${key}`).toBe(!!o.correct);
      }
    }
  });
});

describe('secondary-dominants: chains of dominants', () => {
  it('falls a fifth at every link, anticlockwise round the circle', () => {
    const chain = ['E7', 'A7', 'D7', 'G7', 'C'];
    for (let i = 0; i + 1 < chain.length; i++) expect(intervalBetween(rootOf(chain[i]), rootOf(chain[i + 1]))).toBe('P4');
    const index = (root: string): number => circleOfFifths().findIndex((s) => s.major.some((k) => k.tonic === root));
    const steps = chain.map((c) => index(rootOf(c)));
    expect(steps).toEqual([4, 3, 2, 1, 0]); // clockwise counts up from C, so this walks back anticlockwise
    expect(index('B')).toBe(5); // the link before E7
    // The circle figure highlights the chain's roots.
    const card = lesson('chains-of-dominants').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'circle') throw new Error('expected a circle');
    expect(card.figure.highlight).toEqual(chain.slice(0, 4).map((c) => `${rootOf(c)} major`));
  });

  it('orders every chain so that each dominant resolves to the next', () => {
    const orders = ofType<OrderExercise>('order');
    expect(orders.length).toBe(3);
    for (const e of orders) {
      const chords = e.tiles.map((t) => tagged(t, 'chord')[0]);
      const goal = tagged(e.prompt, 'chord')[0];
      [...chords, goal].forEach((c, i, all) => {
        if (i + 1 < all.length) expect(intervalBetween(rootOf(c), rootOf(all[i + 1])), `${c} -> ${all[i + 1]}`).toBe('P4');
      });
    }
  });

  it('answers the chain questions', () => {
    const before = exercises(lesson('chains-of-dominants').steps).find((e) => e.type === 'choice' && /just before/.test(plainText(e.prompt))) as ChoiceExercise;
    expect(intervalBetween(rootOf(tagged(correctOption(before), 'chord')[0]), 'E')).toBe('P4');
    const gap = exercises(lesson('chains-of-dominants').steps).find((e) => e.type === 'choice' && /ends on/.test(plainText(e.prompt))) as ChoiceExercise;
    const answer = tagged(correctOption(gap), 'chord')[0];
    expect(intervalBetween('A', rootOf(answer))).toBe('P4');
    expect(intervalBetween(rootOf(answer), 'G')).toBe('P4');
  });
});

describe('secondary-dominants: leading-tone chords', () => {
  it('names each leading-tone chord and its target as the engine does', () => {
    expect(chordToRoman('F#dim7', 'C').roman).toBe('vii°7/V');
    expect(chordToRoman('G#dim7', 'C').roman).toBe('vii°7/vi');
    expect(chordToRoman('C#dim7', 'C').roman).toBe('vii°7/ii');
    expect(romanToChord('vii°7/V', 'C')).toBe('F#dim7');
    for (const [dim, target] of [['F#dim7', 'G'], ['G#dim7', 'A'], ['C#dim7', 'D']]) expect(intervalBetween(rootOf(dim), target)).toBe('m2');
  });

  it('is a dominant 7 flat 9 without its root', () => {
    expect(chordNotes('F#dim7')).toEqual(['F#', 'A', 'C', 'Eb']);
    expect(chordNotes('D7b9')).toEqual(['D', 'F#', 'A', 'C', 'Eb']);
    expect(chordNotes('D7b9').slice(1)).toEqual(chordNotes('F#dim7'));
    expect(chordNotes('G#dim7')).toEqual(['G#', 'B', 'D', 'F']);
    for (const e of ofType<FillBlanksExercise>('fill-blanks').filter((x) => /dim7/.test(String(x.prompt)))) {
      const symbol = tagged(e.prompt, 'chord')[0];
      expect([...tagged(e.text, 'note'), ...e.blanks.map((b) => tagged(b, 'note')[0])], symbol).toEqual(chordNotes(symbol));
    }
  });

  it('offers one diminished 7th from each of the three pitch sets, with the right one correct', () => {
    const dims = ofType<ChoiceExercise>('choice').filter((e) => e.options.every((o) => /dim7/.test(String(o.text))));
    expect(dims.length).toBe(4);
    for (const e of dims) {
      const symbols = e.options.map((o) => tagged(o.text ?? '', 'chord')[0]);
      expect(new Set(symbols.map(pcSet)).size, symbols.join(' ')).toBe(symbols.length);
      const key = keyIn(e.prompt);
      const target = tagged(e.prompt, 'chord')[0] ?? romanToChord(tagged(e.prompt, 'roman')[0].split('/')[1], key);
      const right = tagged(correctOption(e), 'chord')[0];
      expect(intervalBetween(rootOf(right), rootOf(target)), `${right} -> ${target}`).toBe('m2');
    }
  });
});

describe('secondary-dominants: what each listening question plays', () => {
  const chordsOf = (q: ListenChoiceExercise): string[] => {
    if (q.sound.kind !== 'progression') throw new Error('expected a progression');
    return q.sound.chords;
  };

  it('what-a-secondary-dominant-is: the plain ii before G', () => {
    const [q] = listens(lesson('what-a-secondary-dominant-is'));
    expect(chordsOf(q)[1]).toBe(romanToChord('ii', 'C'));
    expect(chordsOf(q)[2]).toBe('G');
    expect(plainText(correctOption(q))).toMatch(/^Plain/);
  });

  it('spotting-and-resolving: E7 goes to its target', () => {
    const [q] = listens(lesson('spotting-and-resolving'));
    const chords = chordsOf(q);
    expect(chords[chords.indexOf('E7') + 1]).toBe(chordToRoman('E7', 'C').targetChord);
  });

  it('secondary-leading-tone-chords: the bass climbs a half step into the target', () => {
    const [q] = listens(lesson('secondary-leading-tone-chords'));
    const plan = soundPlan(q.sound);
    const bass = plan.events.map((e) => Math.min(...e.midi));
    const chords = chordsOf(q);
    const at = chords.indexOf('C#dim7');
    expect(chordToRoman('C#dim7', 'C').targetChord).toBe(chords[at + 1]);
    expect(bass[at + 1] - bass[at]).toBe(1);
    // The card's climb, F# to G.
    const card = lesson('secondary-leading-tone-chords').steps[1];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'audio') throw new Error('expected an audio card');
    const cardBass = soundPlan(card.figure.sound).events.map((e) => Math.min(...e.midi));
    expect(cardBass[2] - cardBass[1]).toBe(1);
    expect(cardBass[1] % 12).toBe(6); // F#
  });

  it('hearing-secondary-dominants: VI7 versus vi, and the 2nd chord in G', () => {
    const [vi7, inG] = listens(lesson('hearing-secondary-dominants'));
    expect(chordsOf(vi7)).toEqual(['I', 'VI7', 'ii', 'V7'].map((r) => romanToChord(r, 'C')));
    expect(tagged(correctOption(vi7), 'roman')).toEqual(['I', 'VI7', 'ii', 'V7']);
    const g = chordsOf(inG);
    const secondary = g.map((c) => chordToRoman(c, 'G').relation === 'secondary-dominant');
    expect(secondary).toEqual([false, true, false, false]);
    expect(plainText(correctOption(inG))).toBe('The 2nd');
    const cp = exercises(unit.checkpoint!.steps!).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(chordsOf(cp)).toEqual(['I', 'vi', 'ii', 'V'].map((r) => romanToChord(r, 'C')));
    expect(tagged(correctOption(cp), 'roman')).toEqual(['I', 'vi', 'ii', 'V']);
  });
});

describe('secondary-dominants: teaching order and hedges', () => {
  it('shows the slash numeral on a card before any question asks for one', () => {
    const slashed = (step: unknown): boolean => texts(step).some((t) => tagged(t, 'roman').some((r) => r.includes('/')));
    let taught = false;
    let asked = 0;
    for (const l of unit.lessons) {
      for (const s of l.steps) {
        if (isGenerated(s)) continue;
        if (s.type === 'card') {
          if (slashed(s)) taught = true;
          continue;
        }
        if (slashed(s)) {
          asked++;
          expect(taught, `${l.id}: "${plainText(('prompt' in s ? s.prompt : undefined) ?? '')}" asks for a slash numeral no card has shown`).toBe(true);
        }
      }
    }
    expect(asked).toBeGreaterThan(5);
  });

  // An interactive piano takes 34 px a white key: nine fit a 390 px phone; at 360 px the ninth
  // scrolls inside the piano's own frame (allowed), a tenth would be cut off at 390 px too.
  it('keeps every keyboard figure within nine white keys, so none is cropped on a 390 px phone', () => {
    const boards: Figure[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        if ((v as { kind?: string }).kind === 'keyboard') boards.push(v as Figure);
        Object.values(v).forEach(walk);
      }
    };
    walk(unit);
    expect(boards.length).toBeGreaterThan(0);
    for (const f of boards) {
      const r = resolveFigure(f);
      if (!r || r.kind !== 'keyboard') throw new Error('expected a keyboard');
      const whites = Array.from({ length: r.to - r.from + 1 }, (_x, i) => r.from + i).filter((m) => ![1, 3, 6, 8, 10].includes(m % 12)).length;
      expect(whites).toBeLessThanOrEqual(9);
      for (const k of r.keys) expect(k.midi >= r.from && k.midi <= r.to, k.note).toBe(true);
    }
  });

  it('accepts the target chord as a triad or as the key\'s own seventh chord', () => {
    const q = ofType<TypeAnswerExercise>('type-answer').find((e) => /target chord of/.test(plainText(e.prompt)))!;
    const key = keyIn(q.prompt);
    const target = chordToRoman('F#7', key).targetChord!;
    const seventh = diatonicChords(key, { sevenths: true }).find((c) => rootOf(c.symbol) === rootOf(target))!.symbol;
    expect([target, seventh]).toEqual(['Bm', 'Bm7']);
    for (const text of [target, seventh]) expect(grade(q, { type: 'type-answer', text }).correct, text).toBe(true);
    for (const text of ['B', 'B7', 'F#m']) expect(grade(q, { type: 'type-answer', text }).correct, text).toBe(false);
  });

  it('says "usually" where spotting is a rule of thumb', () => {
    const spotting = lesson('spotting-and-resolving').facts!.find((f) => f.id === 'secondary-spotting')!;
    expect(plainText(spotting.back)).toMatch(/usually/);
    expect(plainText(lesson('spotting-and-resolving').teaches ?? '')).toMatch(/usually/);
  });
});

describe('secondary-dominants: on the go', () => {
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
