/**
 * Unit 22 of the Theory Path, cross-checked against the engines: the job of every chord it names,
 * the numerals and chords of every progression, every cadence, the voice leading of the dominant
 * seventh, the keys that hold each chord list, every chord shape it writes, and what each listening
 * question plays.
 */
import { describe, expect, it } from 'vitest';
import { chordNotes, classifyCadence, detectKeyFromChords, diatonicChords, intervalBetween, progressionToChords, scaleNotes, semitones } from '@/core/theory';
import { identifyFretted, midiAt } from '@/core/guitar';
import { plainText, type Exercise, type Figure, type Lesson, type ListenChoiceExercise, type RichText, type Step } from '@/lessons';
import unit from './functional-harmony';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (l: Lesson): Exercise[] => l.steps.filter((s: Step): s is Exercise => !('generate' in s) && s.type !== 'card');
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const chordsHeard = (e: ListenChoiceExercise): string[] => (e.sound.kind === 'progression' ? e.sound.chords : []);
const answer = (e: ListenChoiceExercise): string => plainText(e.options.find((o) => o.correct)?.text ?? '');
const keyChordSymbols = (k: string): string[] => diatonicChords(k).map((c) => c.symbol);
const shared = (a: string, b: string): string[] => chordNotes(a).filter((n) => chordNotes(b).includes(n));

/** Every rich text of the unit (cards, prompts, options, explanations, facts, checkpoint). */
function allTexts(): string[] {
  const out: string[] = [];
  const add = (t: RichText | undefined) => {
    if (t !== undefined) out.push(typeof t === 'string' ? t : t.text);
  };
  const walk = (value: unknown): void => {
    if (typeof value === 'string') add(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(unit);
  return out;
}

/** Every figure of the unit, wherever it sits. */
function allFigures(): Figure[] {
  const out: Figure[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      const v = value as { kind?: unknown };
      if (typeof v.kind === 'string' && ['fretboard', 'chord', 'staff', 'keyboard', 'circle', 'rhythm', 'tab', 'audio'].includes(v.kind)) out.push(value as Figure);
      Object.values(value).forEach(walk);
    }
  };
  walk(unit);
  return out;
}

describe('functional-harmony: the jobs of the chords', () => {
  it('gives each chord of C major the job the engine gives it', () => {
    const jobs = Object.fromEntries(diatonicChords('C major').map((c) => [c.symbol, c.function]));
    expect(jobs).toEqual({ C: 'tonic', Dm: 'subdominant', Em: 'tonic', F: 'subdominant', G: 'dominant', Am: 'tonic', Bdim: 'dominant' });
    const romans = Object.fromEntries(diatonicChords('C major').map((c) => [c.symbol, c.roman]));
    expect(romans).toMatchObject({ C: 'I', Dm: 'ii', F: 'IV', G: 'V', Am: 'vi', Bdim: 'vii°', Em: 'iii' });
  });

  it('names D as the dominant of G major, and C and Em as its IV and vi', () => {
    const g = Object.fromEntries(diatonicChords('G major').map((c) => [c.roman, c.symbol]));
    expect(g).toMatchObject({ I: 'G', IV: 'C', V: 'D', vi: 'Em', ii: 'Am' });
  });

  it('shares two notes between each stand-in and its main chord', () => {
    expect(shared('Dm', 'F')).toEqual(['F', 'A']);
    expect(shared('Am', 'C')).toEqual(['C', 'E']);
    expect(shared('Bdim', 'G')).toEqual(['B', 'D']);
    expect(shared('Em', 'C')).toEqual(['E', 'G']);
    // The tip: Dm (xx0231) and F (xx3211) share string 3 fret 2 and string 1 fret 1.
    const dm = identifyFretted('xx0231').notes.map((n) => `${n.string}:${n.fret}:${n.note}`);
    const f = identifyFretted('xx3211').notes.map((n) => `${n.string}:${n.fret}:${n.note}`);
    expect(dm.filter((x) => f.includes(x)).sort()).toEqual(['1:1:F', '3:2:A']);
  });

  it('uses the degree names on the degrees of C major', () => {
    expect(scaleNotes('C', 'major')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    // The leading tone is a half step below the tonic.
    expect(semitones(intervalBetween('B', 'C'))).toBe(1);
  });
});

describe('functional-harmony: why V pulls home', () => {
  it('spells G7, D7 and A7 and finds their tritones', () => {
    expect(chordNotes('G7')).toEqual(['G', 'B', 'D', 'F']);
    expect(chordNotes('D7')).toEqual(['D', 'F#', 'A', 'C']);
    expect(chordNotes('A7')).toEqual(['A', 'C#', 'E', 'G']);
    for (const [third, seventh] of [['B', 'F'], ['F#', 'C'], ['C#', 'G']]) expect(semitones(intervalBetween(third, seventh))).toBe(6);
  });

  it('names the leading tone and the 4th of C and G major', () => {
    expect(scaleNotes('C', 'major')[6]).toBe('B');
    expect(scaleNotes('C', 'major')[3]).toBe('F');
    expect(scaleNotes('G', 'major')[6]).toBe('F#');
    expect(scaleNotes('G', 'major')[3]).toBe('C');
  });

  it('moves the top two strings by one fret from G7 (320001) to C (x32010)', () => {
    expect(identifyFretted('320001').symbol).toBe('G7');
    expect(identifyFretted('x32010').symbol).toBe('C');
    // String 2: open B rises to C at fret 1. String 1: F at fret 1 falls to the open E.
    expect(midiAt({ string: 2, fret: 1 }) - midiAt({ string: 2, fret: 0 })).toBe(1);
    expect(midiAt({ string: 1, fret: 1 }) - midiAt({ string: 1, fret: 0 })).toBe(1);
    const g7 = identifyFretted('320001').notes;
    const c = identifyFretted('x32010').notes;
    expect(g7.find((n) => n.string === 2)!.note).toBe('B');
    expect(c.find((n) => n.string === 2)!.note).toBe('C');
    expect(g7.find((n) => n.string === 1)!.note).toBe('F');
    expect(c.find((n) => n.string === 1)!.note).toBe('E');
  });
});

describe('functional-harmony: cadences', () => {
  const cases: Array<[string[], string, string]> = [
    [['D7', 'G'], 'G major', 'authentic'],
    [['C', 'G'], 'G major', 'plagal'],
    [['Am', 'D'], 'G major', 'half'],
    [['D', 'Em'], 'G major', 'deceptive'],
    [['G', 'Am'], 'C major', 'deceptive'],
    [['G7', 'Am'], 'C major', 'deceptive'],
    [['G7', 'C'], 'C major', 'authentic'],
    [['A7', 'Bm'], 'D major', 'deceptive'],
    [['G', 'A'], 'D major', 'half'],
  ];
  it.each(cases)('%j in %s is %s', (chords, key, type) => {
    expect(classifyCadence(chords, key)?.type).toBe(type);
  });

  it('plays the cadence each listening question names', () => {
    const named: Array<[string, string]> = [
      ['cadences', 'G major'],
      ['hearing-cadences', 'D major'],
      ['hearing-cadences', 'C major'],
    ];
    const qs = [...listens(lesson('cadences')), ...listens(lesson('hearing-cadences'))];
    expect(qs).toHaveLength(named.length);
    qs.forEach((q, i) => {
      const chords = chordsHeard(q);
      const type = classifyCadence(chords.slice(-2), named[i][1])?.type;
      expect(answer(q).toLowerCase().startsWith(type!), `${answer(q)} for ${chords.join(' ')}`).toBe(true);
    });
  });
});

describe('functional-harmony: progressions', () => {
  it('spells each named progression in its key', () => {
    expect(progressionToChords('I IV V I', 'G')).toEqual(['G', 'C', 'D', 'G']);
    expect(progressionToChords('I vi IV V', 'G')).toEqual(['G', 'Em', 'C', 'D']);
    expect(progressionToChords('I vi IV V', 'C')).toEqual(['C', 'Am', 'F', 'G']);
    expect(progressionToChords('ii V I', 'G')).toEqual(['Am', 'D', 'G']);
    expect(progressionToChords('ii V I', 'C')).toEqual(['Dm', 'G', 'C']);
    expect(progressionToChords('I V vi IV', 'G')).toEqual(['G', 'D', 'Em', 'C']);
    expect(progressionToChords('vi IV I V', 'G')).toEqual(['Em', 'C', 'G', 'D']);
  });

  it('matches each numeral line with its chords in G (common-progressions)', () => {
    const match = exercises(lesson('common-progressions')).find((e) => e.type === 'match-pairs');
    if (match?.type !== 'match-pairs') throw new Error('no match');
    for (const p of match.pairs) expect(progressionToChords(plainText(p.left), 'G').join(' ')).toBe(plainText(p.right));
  });

  it('plays I-IV-V-I and ii-V-I where the questions say so', () => {
    const [prog] = listens(lesson('common-progressions'));
    expect(chordsHeard(prog)).toEqual(progressionToChords('I IV V I', 'G'));
    expect(answer(prog)).toBe('I–IV–V–I');
    const [sub] = listens(lesson('substitute-chords'));
    expect(chordsHeard(sub)).toEqual(progressionToChords('ii V I', 'C'));
    expect(answer(sub)).toBe('ii–V–I');
  });

  it('ends the first listening question on the dominant and the G7 one unresolved', () => {
    const [ends] = listens(lesson('three-functions'));
    expect(diatonicChords('C major').find((c) => c.symbol === chordsHeard(ends).at(-1))?.function).toBe('dominant');
    const [hangs] = listens(lesson('why-v-pulls-home'));
    expect(chordsHeard(hangs).at(-1)).toBe('G7');
    expect(answer(hangs)).toMatch(/stopped on the tension/);
  });
});

describe('functional-harmony: finding the key', () => {
  const holds = (k: string, chords: string[]) => chords.every((c) => keyChordSymbols(k).includes(c));
  it('finds the one major key that holds each chord list', () => {
    expect(holds('D major', ['D', 'A', 'Bm', 'G'])).toBe(true);
    for (const k of ['A major', 'G major', 'E major']) expect(holds(k, ['D', 'A', 'Bm', 'G'])).toBe(false);
    expect(holds('A major', ['A', 'E', 'F#m', 'D'])).toBe(true);
    for (const k of ['E major', 'D major', 'G major']) expect(holds(k, ['A', 'E', 'F#m', 'D'])).toBe(false);
    expect(holds('E major', ['E', 'A', 'B', 'C#m'])).toBe(true);
    expect(holds('C major', ['C', 'G', 'Am', 'F'])).toBe(true);
    expect(holds('A minor', ['C', 'G', 'Am', 'F'])).toBe(true);
    for (const k of ['G major', 'F major']) expect(holds(k, ['C', 'G', 'Am', 'F'])).toBe(false);
    expect(holds('C major', ['C', 'F', 'G', 'Dm'])).toBe(true);
    for (const k of ['F major', 'G major']) expect(holds(k, ['C', 'F', 'G', 'Dm'])).toBe(false);
    expect(holds('G major', ['G', 'C', 'D', 'Em'])).toBe(true);
  });

  it('hears the loop Am F C G Am at home in A minor, and C G Am F C in C major', () => {
    const [q] = listens(lesson('finding-the-key'));
    expect(chordsHeard(q)).toEqual(['Am', 'F', 'C', 'G', 'Am']);
    expect(detectKeyFromChords(chordsHeard(q))[0].key.name).toBe('A minor');
    expect(answer(q)).toBe('At home on Am');
    expect(detectKeyFromChords(['C', 'G', 'Am', 'F', 'C'])[0].key.name).toBe('C major');
  });
});

describe('functional-harmony: questions that teach, not give away', () => {
  /** Every choice of the unit, wherever it sits (lessons, alternatives, facts, checkpoint). */
  const choices = (): Array<Extract<Exercise, { type: 'choice' }>> => {
    const out: Array<Extract<Exercise, { type: 'choice' }>> = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        if ((v as { type?: unknown }).type === 'choice') out.push(v as Extract<Exercise, { type: 'choice' }>);
        Object.values(v).forEach(walk);
      }
    };
    walk(unit);
    return out;
  };

  it('never lists the right answer first in a question that keeps its order', () => {
    // Unshuffled options show in the authored order: with the answer always first, a learner
    // could pass by position alone. Fixed orders (tonic, subdominant, dominant; the four cadences)
    // are fine, as long as the answer moves around.
    const fixed = choices().filter((c) => c.shuffle === false);
    expect(fixed.length).toBeGreaterThan(3);
    for (const c of fixed) expect(c.options.findIndex((o) => o.correct), plainText(c.prompt)).toBeGreaterThan(0);
  });

  it('asks every cadence of hearing-cadences without sound too', () => {
    const quiet = exercises(lesson('hearing-cadences')).filter((e) => e.type !== 'listen-choice');
    const text = JSON.stringify(quiet).toLowerCase();
    for (const name of ['authentic', 'half', 'deceptive', 'plagal']) expect(text, name).toContain(name);
  });

  it('names the A7 to D ending authentic, and its wrong options truly wrong', () => {
    const q = choices().find((c) => plainText(c.prompt).includes('ends A7 to D'))!;
    expect(classifyCadence(['A7', 'D'], 'D major')?.type).toBe('authentic');
    expect(plainText(q.options.find((o) => o.correct)!.text!)).toMatch(/authentic$/);
    expect(progressionToChords('IV', 'D')).toEqual(['G']); // the plagal option's why
    expect(progressionToChords('vi', 'D')).toEqual(['Bm']); // the deceptive option's why
    expect(progressionToChords('V7', 'D')).toEqual(['A7']);
  });
});

describe('functional-harmony: the shapes it writes', () => {
  it('draws every chord box as the chord it names', () => {
    const boxes = allFigures().filter((f): f is Extract<Figure, { kind: 'chord' }> => f.kind === 'chord');
    expect(boxes.length).toBeGreaterThan(5);
    for (const b of boxes) expect(identifyFretted(String(b.frets)).symbol, `${b.symbol} ${String(b.frets)}`).toBe(b.symbol);
  });

  it('names every shape written in the text after its chord', () => {
    const found: Array<[string, string]> = [];
    for (const t of allTexts()) for (const m of t.matchAll(/\{c:([^}]+)\}\s\(?([x0-9]{6})\)?/g)) found.push([m[1], m[2]]);
    expect(found.length).toBeGreaterThan(8);
    for (const [symbol, frets] of found) expect(identifyFretted(frets).symbol, `${symbol} ${frets}`).toBe(symbol);
  });
});
