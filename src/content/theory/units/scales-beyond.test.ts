/**
 * Unit 37 of the Theory Path, cross-checked against the engines: every scale spelled in the text,
 * the modes of melodic and harmonic minor and the chords they fit, the avoid notes, the beats of the
 * bebop runs, the exotic scales and their augmented seconds, the degrees each superimposed
 * pentatonic gives, every figure, what each listening question plays, and that every lesson still
 * teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import { chordNotes, chordPcs, degreeInScale, getScale, intervalBetween, scaleMidi, scaleNotes, scalePcs, semitonesToDegree } from '@/core/theory';
import { buildVoicing, midiAt } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, resolveFigure, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise, type MatchPairsExercise,
  type OrderExercise, type RichText, type Step, type TabNote, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './scales-beyond';

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
const correct = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): RichText[] => e.options.filter((o) => o.correct).map((o) => o.text ?? '');
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
/** The values of the tags of one kind in a text: `{c:Am7}` -> 'Am7'. */
function tagged(text: RichText, type: 'chord' | 'roman' | 'note' | 'key' | 'degree'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}
const card = (l: Lesson, index: number) => {
  const step = l.steps[index];
  if (isGenerated(step) || step.type !== 'card') throw new Error(`${l.id} step ${index} is not a card`);
  return step;
};
const inScale = (tonic: string, scale: string, chord: string): boolean => chordPcs(chord).every((pc) => scalePcs(tonic, scale).includes(pc));
const pitches = (notes: TabNote[]): number[] => notes.flatMap((n) => ('rest' in n ? [] : [midiAt(n)]));

describe('scales-beyond: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^beyond-/);
  });
});

describe('scales-beyond: chord scales and avoid notes', () => {
  /** Scale notes a half step above a chord tone: the notes that clash when held. */
  const avoid = (tonic: string, scale: string, chord: string): string[] =>
    scaleNotes(tonic, scale).filter((n) => chordPcs(chord).includes((scalePcs(n, 'major')[0] + 11) % 12) && !chordPcs(chord).includes(scalePcs(n, 'major')[0]));

  it('pairs each chord of C major with the mode on its root, which holds the chord', () => {
    const cMajor = [...scalePcs('C', 'major')].sort((a, b) => a - b).join('.');
    const pairs = ofType<MatchPairsExercise>('match-pairs').filter((e) => /\{k:C major\} with its scale/.test(String(e.prompt))).flatMap((e) => e.pairs);
    expect(pairs.length).toBe(12);
    const MODES: Record<string, string> = { Ionian: 'major', Dorian: 'dorian', Mixolydian: 'mixolydian', Locrian: 'locrian', Phrygian: 'phrygian' };
    for (const p of pairs) {
      const chord = tagged(p.left, 'chord')[0];
      const tonic = tagged(p.right, 'note')[0];
      const mode = MODES[plainText(p.right).split(' ')[1]];
      expect(tonic, chord).toBe(chord.match(/^[A-G][#b]?/)![0]);
      expect([...scalePcs(tonic, mode)].sort((a, b) => a - b).join('.'), `${tonic} ${mode}`).toBe(cMajor);
      expect(inScale(tonic, mode, chord), `${chord} in ${tonic} ${mode}`).toBe(true);
    }
    // Em7 in C major: E Phrygian, not Dorian or Aeolian.
    expect([...scalePcs('E', 'phrygian')].sort((a, b) => a - b).join('.')).toBe(cMajor);
    expect(scaleNotes('E', 'dorian')).toEqual(['E', 'F#', 'G', 'A', 'B', 'C#', 'D']);
    expect(scaleNotes('E', 'minor')).toContain('F#');
  });

  it('finds the avoid notes the questions name', () => {
    expect(avoid('C', 'major', 'Cmaj7')).toEqual(['F']);
    expect(avoid('G', 'mixolydian', 'G7')).toEqual(['C']);
    const qs = ofType<ChoiceExercise>('choice').filter((e) => /avoid note/.test(String(e.prompt)));
    expect(qs.length).toBe(3);
    for (const e of qs) {
      const chord = tagged(e.prompt, 'chord')[0];
      const [tonic, scale] = chord === 'G7' ? ['G', 'mixolydian'] : ['C', 'major'];
      expect(tagged(correct(e)[0], 'note'), plainText(e.prompt)).toEqual(avoid(tonic, scale, chord));
    }
  });

  it('marks the Cmaj7 tones bright, the colours pale and the avoid note on the figure', () => {
    const fig = card(lesson('chord-scales'), 0).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    const resolved = resolveFigure(fig);
    if (!resolved || resolved.kind !== 'fretboard') throw new Error('figure does not resolve');
    expect(resolved.dots.length).toBe(17);
    for (const d of resolved.dots) {
      const pc = d.midi % 12;
      expect(scalePcs('C', 'major')).toContain(pc);
      const expected = pc === 5 ? 'target' : chordPcs('Cmaj7').includes(pc) ? 'chord' : 'ghost';
      expect(d.role === 'target' ? 'target' : d.role === 'ghost' ? 'ghost' : 'chord', `${d.string}:${d.fret} ${d.note}`).toBe(expected);
    }
  });

  it('holds the clashing F, then the 9th, over Cmaj7', () => {
    const [clash, blend] = listens(lesson('chord-scales'));
    const [a] = soundPlan(clash.sound).events.map((e) => e.midi);
    const [b] = soundPlan(blend.sound).events.map((e) => e.midi);
    expect(a.slice(0, 4).map((m) => m % 12)).toEqual(chordPcs('Cmaj7'));
    expect(a[4] - a[1]).toBe(13); // F4 a minor ninth above E3
    expect(plainText(correct(clash)[0])).toMatch(/^Yes/);
    expect(b[4] % 12).toBe(2); // D: the 9th
    expect(b.slice(0, 4).every((m) => (b[4] - m) % 12 !== 1)).toBe(true); // no chord tone a half step below it
    expect(plainText(correct(blend)[0])).toMatch(/^No/);
  });
});

describe('scales-beyond: the modes of melodic minor', () => {
  const D = [...scalePcs('D', 'melodic-minor')].sort((a, b) => a - b).join('.');
  const set = (tonic: string, scale: string): string => [...scalePcs(tonic, scale)].sort((a, b) => a - b).join('.');

  it('spells each mode and its formula as the text does', () => {
    expect(scaleNotes('D', 'melodic-minor')).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C#']);
    expect(scaleNotes('G', 'lydian-dominant')).toEqual(['G', 'A', 'B', 'C#', 'D', 'E', 'F']);
    expect(scaleNotes('B', 'locrian-natural-2')).toEqual(['B', 'C#', 'D', 'E', 'F', 'G', 'A']);
    expect(scaleNotes('C#', 'altered')).toEqual(['C#', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(scaleNotes('F', 'lydian-augmented')).toEqual(['F', 'G', 'A', 'B', 'C#', 'D', 'E']);
    for (const [t, s] of [['G', 'lydian-dominant'], ['B', 'locrian-natural-2'], ['C#', 'altered'], ['F', 'lydian-augmented']]) expect(set(t, s), `${t} ${s}`).toBe(D);
    expect(getScale('lydian-dominant')!.degrees).toEqual(['1', '2', '3', '#4', '5', '6', 'b7']);
    expect(getScale('locrian-natural-2')!.degrees).toEqual(['1', '2', 'b3', '4', 'b5', 'b6', 'b7']);
    expect(getScale('lydian-augmented')!.degrees).toEqual(['1', '2', '3', '#4', '#5', '6', '7']);
    // Mode numbers: 3, 4, 6 and 7 of melodic minor.
    const modes = getScale('melodic-minor')!;
    expect(modes.id).toBe('melodic-minor');
    for (const [n, id, tonic] of [[3, 'lydian-augmented', 'F'], [4, 'lydian-dominant', 'G'], [6, 'locrian-natural-2', 'B'], [7, 'altered', 'C#']] as const) {
      expect(scaleNotes('D', 'melodic-minor')[n - 1], id).toBe(tonic);
      expect(getScale(id)!.parent, id).toBe('melodic-minor');
      expect(getScale(id)!.mode, id).toBe(n);
    }
    const typed = exercises(lesson('melodic-minor-modes').steps).find((e): e is TypeAnswerExercise => e.type === 'type-answer')!;
    expect(typed.answer.value).toBe(scaleNotes('G', 'lydian-dominant')[3]);
    const order = exercises(lesson('melodic-minor-modes').steps).find((e): e is OrderExercise => e.type === 'order')!;
    expect(order.tiles.map((t) => tagged(t, 'note')[0])).toEqual(scaleNotes('G', 'lydian-dominant'));
    for (const d of order.distractors ?? []) expect(scaleNotes('G', 'lydian-dominant')).not.toContain(tagged(d, 'note')[0]);
  });

  it('fits each chord to the mode it is matched with', () => {
    const MODES: Record<string, string> = { 'Lydian dominant': 'lydian-dominant', 'Locrian natural 2': 'locrian-natural-2', 'Altered scale': 'altered', 'Lydian augmented': 'lydian-augmented' };
    const pairs = ofType<MatchPairsExercise>('match-pairs').filter((e) => /melodic minor/.test(String(e.prompt))).flatMap((e) => e.pairs);
    expect(pairs.length).toBe(12);
    for (const p of pairs) {
      const chord = tagged(p.left, 'chord')[0];
      const root = chord.match(/^[A-G][#b]?/)![0];
      expect(inScale(root, MODES[plainText(p.right)], chord), `${chord} ${plainText(p.right)}`).toBe(true);
      // The mode that a plain dominant scale would miss: Mixolydian has no #11 or altered tension.
      if (/7#11|7alt/.test(chord)) expect(inScale(root, 'mixolydian', chord)).toBe(false);
    }
    expect(inScale('B', 'locrian-natural-2', 'Bm7b5')).toBe(true);
    for (const c of ['Bm7', 'B7', 'Bdim7']) expect(inScale('B', 'locrian-natural-2', c), c).toBe(false);
  });

  it('labels the three figures as the same notes counted from G, B and C#', () => {
    const figs = [0, 4, 6].map((i) => card(lesson('melodic-minor-modes'), i).figure);
    const roots = ['G', 'B', 'C#'];
    const spots = figs.map((fig) => {
      if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
      return fig.dots!.map((d) => `${d.string}:${d.fret}`).join(' ');
    });
    expect(new Set(spots).size).toBe(1);
    figs.forEach((fig, i) => {
      if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
      expect(fig.root).toBe(roots[i]);
      expect(fig.labels).toBe('degree');
      expect(fig.dots!.every((d) => d.degree !== undefined)).toBe(true);
    });
    // Every place in frets 2 to 5 that holds a note of D melodic minor has a dot, and no other.
    const fig = figs[0];
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    for (let s = 1; s <= 6; s++) {
      for (let f = 2; f <= 5; f++) {
        const inside = scalePcs('D', 'melodic-minor').includes(midiAt({ string: s, fret: f }) % 12);
        expect(fig.dots!.some((d) => d.string === s && d.fret === f), `${s}:${f}`).toBe(inside);
      }
    }
  });

  it('plays Lydian dominant over a low G', () => {
    const [q] = listens(lesson('melodic-minor-modes'));
    const notes = soundPlan(q.sound).events.map((e) => e.midi[0]);
    expect(notes.filter((_m, i) => i % 2 === 0).every((m) => m === 43)).toBe(true);
    expect(notes.filter((_m, i) => i % 2 === 1)).toEqual(scaleMidi(55, 'lydian-dominant'));
    expect(plainText(correct(q)[0])).toBe('Lydian dominant');
  });
});

describe('scales-beyond: Phrygian dominant', () => {
  it('is mode 5 of harmonic minor, with the notes the text spells', () => {
    expect(scaleNotes('E', 'phrygian-dominant')).toEqual(['E', 'F', 'G#', 'A', 'B', 'C', 'D']);
    expect(scaleNotes('A', 'harmonic-minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#']);
    expect(scaleNotes('A', 'harmonic-minor')[4]).toBe('E');
    expect([...scalePcs('E', 'phrygian-dominant')].sort().join()).toBe([...scalePcs('A', 'harmonic-minor')].sort().join());
    expect(getScale('phrygian-dominant')).toMatchObject({ parent: 'harmonic-minor', mode: 5, degrees: ['1', 'b2', '3', '4', '5', 'b6', 'b7'] });
    expect(getScale('mixolydian-b6')).toMatchObject({ parent: 'melodic-minor', mode: 5, degrees: ['1', '2', '3', '4', '5', 'b6', 'b7'] });
    expect(scaleNotes('B', 'phrygian-dominant')).toEqual(['B', 'C', 'D#', 'E', 'F#', 'G', 'A']);
    expect([...scalePcs('B', 'phrygian-dominant')].sort().join()).toBe([...scalePcs('E', 'harmonic-minor')].sort().join());
    const typed = ofType<TypeAnswerExercise>('type-answer').filter((e) => /Phrygian dominant/.test(String(e.prompt)));
    expect(typed.length).toBe(2);
    for (const e of typed) expect(e.answer.value).toBe(scaleNotes('B', 'phrygian-dominant')[2]);
  });

  it('fits E7b9, the dominant of A minor, and not the other chords offered', () => {
    expect(chordNotes('E7b9')).toEqual(['E', 'G#', 'B', 'D', 'F']);
    for (const e of ofType<ChoiceExercise>('choice').filter((x) => /which chord does .*Phrygian dominant fit/i.test(plainText(x.prompt)))) {
      for (const o of e.options) {
        const chord = tagged(o.text ?? '', 'chord')[0];
        if (chord === 'Am7') continue; // fits A minor scales, not the dominant: a question of use, checked in the text
        expect(inScale('E', 'phrygian-dominant', chord), chord).toBe(!!o.correct);
      }
    }
  });

  it('plays and draws the scale on strings 6, 5 and 4 in open position', () => {
    // The open E chord (022100) the card names: its G# on string 3, fret 1, is the scale's major 3rd.
    expect(buildVoicing('E', '022100').notes.find((n) => n.string === 3)).toMatchObject({ fret: 1, note: 'G#' });
    const find = exercises(lesson('phrygian-dominant').steps).find((e) => e.type === 'fretboard-find');
    if (find?.type !== 'fretboard-find' || !('note' in find.find)) throw new Error('expected a note to find');
    expect(midiAt({ string: 6, fret: 4 })).toBe(44); // G#2, the only G#2 on string 6
    expect(find.find.note).toBe('G#2');
    expect(scaleNotes('E', 'phrygian-dominant')[2]).toBe('G#');
    const fig = card(lesson('phrygian-dominant'), 0).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    const resolved = resolveFigure(fig);
    if (!resolved || resolved.kind !== 'fretboard') throw new Error('figure does not resolve');
    expect(resolved.dots.length).toBe(18);
    for (const d of resolved.dots) expect(d.role === 'target', d.note).toBe(d.note === 'F' || d.note === 'G#');
    const audio = card(lesson('phrygian-dominant'), 1).figure;
    expect(audio).toMatchObject({ kind: 'audio', sound: { kind: 'progression', chords: ['Am', 'G', 'F', 'E'] } });
    const [q] = listens(lesson('phrygian-dominant'));
    const notes = soundPlan(q.sound).events.map((e) => e.midi[0]);
    expect(notes.filter((_m, i) => i % 2 === 1)).toEqual(scaleMidi(52, 'phrygian-dominant'));
    expect(notes.filter((_m, i) => i % 2 === 0).every((m) => m === 40)).toBe(true);
  });
});

describe('scales-beyond: bebop scales', () => {
  const run = (() => {
    const fig = card(lesson('bebop-scales'), 0).figure;
    if (fig?.kind !== 'tab') throw new Error('expected a tab');
    return pitches(fig.notes);
  })();
  const beats = (line: number[]): number[] => line.filter((_m, i) => i % 2 === 0);

  it('spells both bebop scales', () => {
    expect(scaleNotes('G', 'bebop-dominant')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F', 'F#']);
    expect(scaleNotes('C', 'bebop-major')).toEqual(['C', 'D', 'E', 'F', 'G', 'G#', 'A', 'B']);
    expect(scaleNotes('G', 'bebop-dominant').filter((n) => !scaleNotes('G', 'mixolydian').includes(n))).toEqual(['F#']);
    expect(scaleNotes('C', 'bebop-major').filter((n) => !scaleNotes('C', 'major').includes(n))).toEqual(['G#']);
    // C major plus Bb is C bebop dominant.
    expect([...new Set([...scalePcs('C', 'major'), 10])].sort((a, b) => a - b)).toEqual([...scalePcs('C', 'bebop-dominant')].sort((a, b) => a - b));
    const fill = ofType<FillBlanksExercise>('fill-blanks').filter((e) => /bebop/.test(String(e.prompt)));
    expect(fill.length).toBe(2);
    for (const e of fill) expect([...tagged(e.text, 'note'), tagged(e.blanks[0], 'note')[0]]).toEqual(scaleNotes('G', 'bebop-dominant'));
    const keys = card(lesson('bebop-scales'), 4).figure;
    if (keys?.kind !== 'keyboard') throw new Error('expected a keyboard');
    expect(keys.keys.map((k) => (typeof k === 'string' ? k : k.note).replace(/\d/, ''))).toEqual(scaleNotes('C', 'bebop-major'));
  });

  it('falls from G4 to G3 with G, F, D and B on the beats', () => {
    expect(run).toEqual([...scaleMidi(55, 'bebop-dominant')].reverse());
    expect(run).toHaveLength(9);
    expect(run[0]).toBe(67);
    expect(beats(run).map((m) => m % 12)).toEqual([7, 5, 2, 11, 7]); // G F D B G
    for (const m of beats(run)) expect(chordPcs('G7')).toContain(m % 12);
    // Without the F#, the same run puts E, C and A on beats 2 to 4.
    const mixo = [...scaleMidi(55, 'mixolydian')].reverse();
    expect(beats(mixo).slice(1, 4).map((m) => m % 12)).toEqual([4, 0, 9]);
    // Bebop major down from C: C, A, G, E on the beats, the notes of C6.
    const major = [...scaleMidi(60, 'bebop-major')].reverse();
    expect(beats(major).slice(0, 4).map((m) => m % 12)).toEqual([0, 9, 7, 4]);
    expect([...new Set(beats(major).slice(0, 4).map((m) => m % 12))].sort((a, b) => a - b)).toEqual([...chordPcs('C6')].sort((a, b) => a - b));
    // The questions about the run.
    const q = ofType<ChoiceExercise>('choice').find((e) => /beat 3/.test(String(e.prompt)))!;
    expect(chordPcs(`${tagged(correct(q)[0], 'note')[0]}5`)[0]).toBe(run[4] % 12);
    expect(run[1] % 12).toBe(6); // F# falls on the "and" of beat 1
    const phrase = exercises(lesson('bebop-scales').steps).find((e) => e.type === 'play-phrase');
    if (phrase?.type !== 'play-phrase') throw new Error('expected a phrase');
    expect(pitches(phrase.notes)).toEqual(run);
    const audio = card(lesson('bebop-scales'), 1).figure;
    if (audio?.kind !== 'audio') throw new Error('expected audio');
    expect(soundPlan(audio.sound).events.map((e) => e.midi[0])).toEqual(run);
  });
});

describe('scales-beyond: exotic scales', () => {
  it('spells each scale and its augmented seconds', () => {
    expect(scaleNotes('A', 'hungarian-minor')).toEqual(['A', 'B', 'C', 'D#', 'E', 'F', 'G#']);
    const hm = scaleNotes('A', 'harmonic-minor');
    expect(scaleNotes('A', 'hungarian-minor').map((n, i) => (n === hm[i] ? '' : `${hm[i]}>${n}`)).filter(Boolean)).toEqual(['D>D#']);
    expect(getScale('hungarian-minor')!.degrees).toEqual(['1', '2', 'b3', '#4', '5', 'b6', '7']);
    expect(intervalBetween('C', 'D#')).toBe('A2');
    expect(intervalBetween('F', 'G#')).toBe('A2');
    expect(scaleNotes('E', 'double-harmonic')).toEqual(['E', 'F', 'G#', 'A', 'B', 'C', 'D#']);
    expect(getScale('double-harmonic')!.degrees).toEqual(['1', 'b2', '3', '4', '5', 'b6', '7']);
    const dh = scaleNotes('E', 'double-harmonic');
    expect(dh.map((n, i) => (i + 1 < dh.length ? intervalBetween(n, dh[i + 1]) : intervalBetween(n, dh[0]))).filter((x) => x === 'A2' || x === '-A2').length).toBe(2);
    expect(intervalBetween('F', 'G#')).toBe('A2');
    expect(intervalBetween('C', 'D#')).toBe('A2');
    expect(scaleNotes('A', 'hirajoshi')).toEqual(['A', 'B', 'C', 'E', 'F']);
    expect(getScale('hirajoshi')!.degrees).toEqual(['1', '2', 'b3', '5', 'b6']);
    expect(getScale('in')!.degrees).toEqual(['1', 'b2', '4', '5', 'b6']);
    expect(scaleNotes('A', 'in')).toEqual(['A', 'Bb', 'D', 'E', 'F']);
    expect(getScale('hirajoshi')!.size).toBe(5);
    expect(scaleNotes('A', 'minor-pentatonic')).toEqual(['A', 'C', 'D', 'E', 'G']);
    const typed = exercises(lesson('exotic-scales').steps).find((e): e is TypeAnswerExercise => e.type === 'type-answer')!;
    expect(intervalBetween('F', String(typed.answer.value))).toBe('A2');
    expect(dh).toContain(typed.answer.value);
    const order = exercises(lesson('exotic-scales').steps).find((e): e is OrderExercise => e.type === 'order')!;
    expect(order.tiles.map((t) => tagged(t, 'note')[0])).toEqual(dh);
  });

  it('marks the notes the captions name on both figures', () => {
    const hung = card(lesson('exotic-scales'), 0).figure;
    const hira = card(lesson('exotic-scales'), 1).figure;
    if (hung?.kind !== 'fretboard' || hira?.kind !== 'fretboard') throw new Error('expected fretboards');
    for (const [fig, tonic, scale, marked] of [[hung, 'A', 'hungarian-minor', ['D#']], [hira, 'A', 'hirajoshi', ['C', 'F']]] as const) {
      const resolved = resolveFigure(fig);
      if (!resolved || resolved.kind !== 'fretboard') throw new Error('figure does not resolve');
      for (const d of resolved.dots) {
        expect(scalePcs(tonic, scale)).toContain(d.midi % 12);
        expect(d.role === 'target', `${scale} ${d.note}`).toBe((marked as readonly string[]).includes(d.note));
      }
    }
    // C and F are each a half step above a note of hirajoshi.
    for (const n of ['C', 'F']) expect(scalePcs('A', 'hirajoshi')).toContain((scalePcs(n, 'major')[0] + 11) % 12);
  });

  it('names the In scale and plays Hungarian minor over A', () => {
    const q = ofType<ChoiceExercise>('choice').find((e) => /Which scale is/.test(String(e.prompt)))!;
    expect(tagged(q.prompt, 'note')).toEqual(scaleNotes('A', 'in'));
    expect(plainText(correct(q)[0])).toBe('A In');
    const [ear] = listens(lesson('exotic-scales'));
    const notes = soundPlan(ear.sound).events.map((e) => e.midi[0]);
    expect(notes.filter((_m, i) => i % 2 === 1)).toEqual(scaleMidi(57, 'hungarian-minor'));
    expect(notes.filter((_m, i) => i % 2 === 0).every((m) => m === 45)).toBe(true);
  });
});

describe('scales-beyond: pentatonics on other roots', () => {
  const degrees = (tonic: string, scale: string, root: string): string[] =>
    scaleNotes(tonic, scale).map((n) => semitonesToDegree((scalePcs(n, 'major')[0] - scalePcs(root, 'major')[0] + 12) % 12));

  it('gives the degrees the text names', () => {
    expect(scaleNotes('B', 'minor-pentatonic')).toEqual(['B', 'D', 'E', 'F#', 'A']);
    expect(degrees('B', 'minor-pentatonic', 'A')).toEqual(['2', '4', '5', '6', '1']); // the 9, 11, 5, 6 and root
    expect(scaleNotes('D', 'major-pentatonic')).toEqual(['D', 'E', 'F#', 'A', 'B']);
    expect(degrees('D', 'major-pentatonic', 'C')).toEqual(['2', '3', '#4', '6', '7']); // the 9, 3, #11, 13 and 7
    expect(scaleNotes('Bb', 'minor-pentatonic')).toEqual(['Bb', 'Db', 'Eb', 'F', 'Ab']);
    expect(degrees('Bb', 'minor-pentatonic', 'G').map((d) => (getScale('chromatic')!.degrees.indexOf(d) + 12) % 12)).toEqual([3, 6, 8, 10, 1]); // #9, b5, b13, b7, b9
    expect(scaleNotes('G', 'major-pentatonic')).not.toContain('F#');
    expect(scaleNotes('F', 'major-pentatonic')).toContain('F');
    expect(scaleNotes('B', 'minor-pentatonic').every((n) => scaleNotes('A', 'dorian').includes(n))).toBe(true);
    expect(scaleNotes('D', 'major-pentatonic').every((n) => scaleNotes('C', 'lydian').includes(n))).toBe(true);
    expect(scaleNotes('Bb', 'minor-pentatonic').every((n) => scalePcs('G', 'altered').includes(scalePcs(n, 'major')[0]))).toBe(true);
    const typed = exercises(lesson('pentatonic-superimposition').steps).find((e): e is TypeAnswerExercise => e.type === 'type-answer')!;
    expect(typed.answer).toMatchObject({ kind: 'degree', value: '6' });
    expect(degreeInScale('A', 'dorian', 'F#')).toBe('6');
  });

  it('draws box 1 of each pentatonic, labelled against the chord root', async () => {
    const { scalePatterns } = await import('@/core/guitar');
    for (const [i, tonic, root] of [[0, 'B', 'A'], [4, 'Bb', 'G']] as const) {
      const fig = card(lesson('pentatonic-superimposition'), i).figure;
      if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
      expect(fig.root).toBe(root);
      const box = scalePatterns(tonic, 'minor-pentatonic')[0];
      expect(box.name).toBe('Box 1');
      expect(fig.dots!.map((d) => `${d.string}:${d.fret}`).sort()).toEqual(box.notes.map((n) => `${n.string}:${n.fret}`).sort());
    }
    expect(scalePatterns('B', 'minor-pentatonic')[0].minFret).toBe(7);
  });

  it('plays each line over the low note it names', () => {
    const [bb, g] = listens(lesson('pentatonic-superimposition'));
    const parts = (q: ListenChoiceExercise) => {
      const notes = soundPlan(q.sound).events.map((e) => e.midi[0]);
      return { drone: notes.filter((_m, i) => i % 2 === 0), line: notes.filter((_m, i) => i % 2 === 1) };
    };
    expect(parts(bb).drone.every((m) => m === 43)).toBe(true);
    expect(parts(bb).line).toEqual(scaleMidi(58, 'minor-pentatonic'));
    expect(parts(bb).line.some((m) => m % 12 === 7)).toBe(false); // never touches G
    expect(tagged(correct(bb)[0], 'note')).toEqual(['Bb']);
    expect(parts(g).line).toEqual(scaleMidi(55, 'minor-pentatonic'));
    expect(tagged(correct(g)[0], 'note')).toEqual(['G']);
    const audio = card(lesson('pentatonic-superimposition'), 1).figure;
    if (audio?.kind !== 'audio') throw new Error('expected audio');
    const notes = soundPlan(audio.sound).events.map((e) => e.midi[0]);
    expect(notes.filter((_m, i) => i % 2 === 1)).toEqual(scaleMidi(59, 'minor-pentatonic'));
    expect(notes.filter((_m, i) => i % 2 === 0).every((m) => m === 45)).toBe(true);
  });
});

describe('scales-beyond: on the go', () => {
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

  it('asks every fact without sound somewhere in its lesson', () => {
    for (const l of adaptUnit(unit, { guitar: false, sound: false }).lessons) {
      for (const f of l.facts ?? []) expect(l.steps.some((s) => !isGenerated(s) && s.type !== 'card' && s.fact === f.id), `${l.id}: ${f.id}`).toBe(true);
    }
  });
});
