/**
 * Unit 28 of the Theory Path, cross-checked against the engines: every transposition, numeral
 * reading, capo sum and capo position the text quotes, the capo figures (shape and sound), the
 * capo tab, the number charts read in G, D, C and A, what each listening question plays, and that
 * every lesson still teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import {
  chordPcs, chroma, diatonicChords, noteToMidi, parseChord, progressionToChords, scaleNotes, transposeChord, transposeChordBySemitones,
} from '@/core/theory';
import { buildVoicing, midiAt, physicalFret, suggestCapo } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise,
  type MatchPairsExercise, type PlayChordExercise, type RichText, type Sound, type Step, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './capo-and-transposition';

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
const find = <T extends Exercise>(type: T['type'], prompt: RegExp): T => {
  const hit = ofType<T>(type).filter((e) => prompt.test(plainText((e as { prompt?: RichText }).prompt ?? '')));
  if (hit.length !== 1) throw new Error(`${hit.length} ${type} exercises match ${prompt}`);
  return hit[0];
};
const correct = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): RichText => e.options.find((o) => o.correct)!.text!;
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');

/** Every object of the unit with this `kind` (figures, sounds). */
function kinds<T>(kind: string, value: unknown = unit, out: T[] = []): T[] {
  if (Array.isArray(value)) for (const v of value) kinds(kind, v, out);
  else if (value && typeof value === 'object') {
    if ((value as { kind?: unknown }).kind === kind) out.push(value as T);
    for (const v of Object.values(value)) kinds(kind, v, out);
  }
  return out;
}

/** The values of the tags of one kind in a text: `{c:Am7}` -> 'Am7'. */
function tagged(text: RichText, type: 'chord' | 'note' | 'roman' | 'key'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}
/** MIDI of a note name with octave. */
const midiOf = (name: string): number => noteToMidi(name);
const sortedPcs = (pcs: Iterable<number>): number[] => [...new Set([...pcs].map((p) => ((p % 12) + 12) % 12))].sort((a, b) => a - b);
const samePcs = (a: string, b: string): boolean => sortedPcs(chordPcs(a)).join() === sortedPcs(chordPcs(b)).join();
/** Half steps from one note up to another, 0 to 11. */
const up = (from: string, to: string): number => (((chroma(to) - chroma(from)) % 12) + 12) % 12;
/** A Nashville number ("6-", "1/3", "5") read in a major key. */
function nashville(num: string, key: string): string {
  const m = /^([1-7])(-)?(?:\/([1-7]))?$/.exec(num);
  if (!m) throw new Error(`not a number: ${num}`);
  const scale = scaleNotes(key.replace(/ major$/, ''), 'major');
  const chord = `${scale[Number(m[1]) - 1]}${m[2] ? 'm' : ''}`;
  return m[3] ? `${chord}/${scale[Number(m[3]) - 1]}` : chord;
}
const chart = (nums: string, key: string): string[] => nums.split(/[\s|]+/).filter(Boolean).map((x) => nashville(x, key));

describe('capo-and-transposition: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'intermediate', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^capo-/);
  });
});

describe('capo-and-transposition: transposing', () => {
  it('moves every chord by the interval it says, keeping its quality', () => {
    const by = (chords: string[], interval: string): string[] => chords.map((c) => transposeChord(c, interval));
    expect(by(['C', 'Am', 'F', 'G'], 'M2')).toEqual(['D', 'Bm', 'G', 'A']);
    expect(by(['G', 'C', 'D'], 'M2')).toEqual(['A', 'D', 'E']);
    expect(by(['C', 'F', 'G'], 'M2')).toEqual(['D', 'G', 'A']);
    expect(transposeChord('Em7', 'P4')).toBe('Am7');
    expect(transposeChord('Am7', 'M2')).toBe('Bm7');
    expect(transposeChord('Em', 'M2')).toBe('F#m');
    expect(by(['G', 'Em', 'C', 'D'], 'P4')).toEqual(['C', 'Am', 'F', 'G']);
    expect(by(['G', 'D', 'Em', 'C'], 'M2')).toEqual(['A', 'E', 'F#m', 'D']);
    expect(by(['A', 'E', 'F#m', 'D'], '-M2')).toEqual(['G', 'D', 'Em', 'C']);
  });

  it('reads the numerals in each key the text names', () => {
    expect(progressionToChords('I vi IV V', 'C')).toEqual(['C', 'Am', 'F', 'G']);
    expect(progressionToChords('I vi IV V', 'D')).toEqual(['D', 'Bm', 'G', 'A']);
    expect(progressionToChords('I V vi IV', 'G')).toEqual(['G', 'D', 'Em', 'C']);
    expect(progressionToChords('I V vi IV', 'A')).toEqual(['A', 'E', 'F#m', 'D']);
    expect(progressionToChords('I V vi IV', 'D')).toEqual(['D', 'A', 'Bm', 'G']);
  });

  it('answers the transposing questions, and banks only wrong chords', () => {
    const fills = ofType<FillBlanksExercise>('fill-blanks').filter((e) => /whole step|perfect fourth|numerals|Read \{r/.test(String(e.prompt)));
    expect(fills.length).toBe(5);
    const answers: Record<string, string> = {};
    for (const e of fills) answers[plainText(e.prompt)] = tagged(e.blanks[0], 'chord')[0];
    expect(Object.values(answers).sort()).toEqual(['A', 'Bm', 'D', 'F', 'G'].sort());
    for (const e of fills) {
      const shown = tagged(e.text, 'chord');
      const blank = tagged(e.blanks[0], 'chord')[0];
      for (const w of e.bank ?? []) expect(tagged(w, 'chord')[0], plainText(e.prompt)).not.toBe(blank);
      expect(shown.length).toBeGreaterThanOrEqual(2);
    }
    const typed = ofType<TypeAnswerExercise>('type-answer').filter((e) => e.answer.kind === 'chord' && /Transpose/.test(String(e.prompt)));
    expect(typed.map((e) => [tagged(e.prompt, 'chord')[0], e.answer.kind === 'chord' ? e.answer.value : ''])).toEqual([['Em7', 'Am7'], ['Am7', 'Bm7']]);
    expect(transposeChord('Em7', 'P4')).toBe('Am7');
    expect(transposeChord('Am7', 'M2')).toBe('Bm7');
    // The "in A" choice: every option but the right one breaks a rule.
    const inA = find<ChoiceExercise>('choice', /What is it in A major/);
    expect(tagged(correct(inA), 'chord')).toEqual(progressionToChords('I V vi IV', 'A'));
    const inD = find<ChoiceExercise>('choice', /in D major\?/);
    expect(tagged(correct(inD), 'chord')).toEqual(progressionToChords('I V vi IV', 'D'));
  });

  it('draws each root two frets up its own string', () => {
    const dots = (lesson('transposing').steps[0] as unknown as { figure: { dots: Array<{ string: number; fret: number; role: string }> } }).figure.dots;
    const ghosts = dots.filter((d) => d.role === 'ghost');
    const roots = dots.filter((d) => d.role === 'root');
    expect(ghosts.map((d) => midiAt(d) % 12)).toEqual(['C', 'A', 'F', 'G'].map(chroma));
    expect(roots.map((d) => midiAt(d) % 12)).toEqual(['D', 'B', 'G', 'A'].map(chroma));
    ghosts.forEach((g, i) => {
      expect(roots[i].string).toBe(g.string);
      expect(roots[i].fret - g.fret).toBe(2);
    });
  });
});

describe('capo-and-transposition: the capo', () => {
  it('draws every capo figure as its shape, sounding the chord its caption names', () => {
    const figures = kinds<{ capo?: number; dots: Array<{ string: number; fret: number; note: string }>; caption: RichText }>('fretboard').filter((f) => f.capo);
    expect(figures.length).toBe(5); // the capo-2 G shape is drawn on its card and on the play step
    for (const f of figures) {
      const [shape, sounds] = tagged(f.caption, 'chord');
      const frets = [6, 5, 4, 3, 2, 1].map((string) => f.dots.find((d) => d.string === string)?.fret ?? 'x').join('');
      expect(buildVoicing(shape, frets).chord, `${shape} ${frets}`).toBe(shape);
      expect(transposeChordBySemitones(shape, f.capo!)).toBe(sounds);
      expect(buildVoicing(sounds, frets, { capo: f.capo }).chord).toBe(sounds);
      for (const d of f.dots) expect(midiAt(d, { capo: f.capo }), `${shape} ${d.string}:${d.fret}`).toBe(midiOf(d.note));
      expect(sortedPcs(f.dots.map((d) => midiAt(d, { capo: f.capo })))).toEqual(sortedPcs(chordPcs(sounds)));
    }
  });

  it('adds the capo to the shape in every question', () => {
    const sum = (shape: string, capo: number): string => transposeChordBySemitones(shape, capo);
    expect(sum('G', 2)).toBe('A');
    expect(sum('E', 3)).toBe('G');
    expect(sum('C', 3)).toBe('Eb');
    expect(sum('D', 5)).toBe('G');
    expect(sum('Am', 2)).toBe('Bm');
    expect(sum('Em', 3)).toBe('Gm');
    expect(sum('G', 4)).toBe('B');
    expect(['G', 'C', 'D', 'Em'].map((c) => sum(c, 3))).toEqual(['Bb', 'Eb', 'F', 'Gm']);
    expect(['D', 'G', 'A'].map((c) => sum(c, 3))).toEqual(['F', 'Bb', 'C']);
    expect(['D', 'G', 'A'].map((c) => sum(c, 2))).toEqual(['E', 'A', 'B']);
    expect(['C', 'F', 'G'].map((c) => sum(c, 4))).toEqual(['E', 'A', 'B']);
    expect(['G', 'C', 'D'].map((c) => sum(c, 1))).toEqual(['Ab', 'Db', 'Eb']);
    expect(['G', 'C', 'D', 'Em'].map((c) => sum(c, 1))).toEqual(['Ab', 'Db', 'Eb', 'Fm']);
    expect(['G', 'C', 'D'].map((c) => sum(c, 5))).toEqual(['C', 'F', 'G']);
    expect(['D', 'G', 'A'].map((c) => sum(c, 5))).toEqual(['G', 'C', 'D']);
    expect(['C', 'F', 'G'].map((c) => sum(c, 7))).toEqual(['G', 'C', 'D']);
    expect(['G', 'C', 'D'].map((c) => sum(c, 7))).toEqual(['D', 'G', 'A']);
    // The engine's own capo finder agrees on the B flat song.
    const best = suggestCapo(['Bb', 'Eb', 'F', 'Gm'])[0];
    expect(best.capo).toBe(3);
    expect(best.shapes.map((s) => s.shape)).toEqual(['G', 'C', 'D', 'Em']);
  });

  it('subtracts to find the capo fret and the shapes', () => {
    expect(up('G', 'A')).toBe(2); // A with G shapes: capo 2
    expect(up('G', 'Bb')).toBe(3); // Bb with G shapes: capo 3
    expect(up('C', 'E')).toBe(4); // E at capo 4: C shapes
    expect(up('D', 'E')).toBe(2); // E with D shapes: capo 2
    expect(up('C', 'D')).toBe(2); // D with C shapes: capo 2
    expect(up('G', 'Ab')).toBe(1); // Ab Db Eb with G C D shapes: capo 1
    expect(up('G', 'C')).toBe(5); // open C F G against capo 5: G C D shapes
    expect(up('G', 'D')).toBe(7); // open D G A against capo 7: G C D shapes
    expect(find<TypeAnswerExercise>('type-answer', /sound in E major/).answer).toEqual({ kind: 'number', value: 2 });
    expect(find<TypeAnswerExercise>('type-answer', /play them as/).answer).toEqual({ kind: 'number', value: 1 });
    expect(ofType<TypeAnswerExercise>('type-answer').find((e) => /D major with/.test(plainText(e.prompt)))!.answer).toEqual({ kind: 'number', value: 2 });
    expect(plainText(correct(find<ChoiceExercise>('choice', /A major with G shapes/)))).toBe('Fret 2');
    const capo4 = find<FillBlanksExercise>('fill-blanks', /capo at fret 4/);
    expect(tagged(capo4.blanks[0], 'note')).toEqual(['C']);
    for (const w of capo4.bank ?? []) expect(up(tagged(w, 'note')[0], 'E')).not.toBe(4);
  });

  it('answers every "which chord sounds" question', () => {
    const qs = [...ofType<TypeAnswerExercise>('type-answer'), ...ofType<ChoiceExercise>('choice')].filter((e) => /Which chord sounds|sounds which chord/.test(plainText(e.prompt)));
    expect(qs.length).toBe(7);
    for (const e of qs) {
      const prompt = plainText(e.prompt);
      const capo = Number(/fret (\d+)/.exec(prompt)![1]);
      const shape = tagged(e.prompt, 'chord')[0];
      const want = transposeChordBySemitones(shape, capo);
      const given = e.type === 'type-answer' ? (e.answer.kind === 'chord' ? e.answer.value : '') : tagged(correct(e as ChoiceExercise), 'chord')[0];
      expect(given, prompt).toBe(want);
      if (e.type === 'choice') for (const o of e.options.filter((x) => !x.correct)) expect(samePcs(tagged(o.text!, 'chord')[0], want), plainText(o.text!)).toBe(false);
    }
  });

  it('matches the B flat song with its capo 3 shapes', () => {
    const pairs = find<MatchPairsExercise>('match-pairs', /Capo at fret 3/).pairs;
    for (const p of pairs) expect(transposeChordBySemitones(tagged(p.right, 'chord')[0], 3)).toBe(tagged(p.left, 'chord')[0]);
  });

  it('counts capo tab frets from the capo', () => {
    const tab = kinds<{ capo?: number; notes: Array<{ string: number; fret: number }> }>('tab').find((t) => t.capo === 2)!;
    expect(tab.notes.map((x) => physicalFret(x.fret, 2))).toEqual([2, 2, 5]);
    expect(soundPlan({ kind: 'tab', notes: tab.notes as never, capo: 2 }).events.map((e) => e.midi[0])).toEqual([57, 61, 69]); // A3 C#4 A4
    expect(plainText(correct(find<ChoiceExercise>('choice', /tab shows a 2 on string 1/)))).toBe(`Fret ${physicalFret(2, 3)}`);
    // Open string 6 behind a capo at fret 2.
    expect(find<TypeAnswerExercise>('type-answer', /open string 6 sound/).answer).toMatchObject({ kind: 'note', value: 'F#' });
    expect(midiAt({ string: 6, fret: 2 }) % 12).toBe(chroma('F#'));
  });

  it('plays the G shape at capo 2 as an A chord, and asks what it sounds without the guitar', () => {
    const play = ofType<PlayChordExercise>('play-chord')[0];
    expect(play.frets).toBe('542225');
    expect([3, 2, 0, 0, 0, 3].map((f) => f + 2).join('')).toBe('542225');
    expect(buildVoicing('A', '542225').chord).toBe('A');
    expect(buildVoicing('A', '542225').midi).toEqual(buildVoicing('G', '320003').midi.map((m) => m + 2));
    expect(buildVoicing('A', '320003', { capo: 2 }).midi).toEqual(buildVoicing('A', '542225').midi);
    const alt = play.alternative as ChoiceExercise;
    expect(tagged(correct(alt), 'chord')).toEqual([transposeChordBySemitones('G', 2)]);
    // The step pictures the G shape behind the capo, and those dots sound the chord box's notes.
    const pic = play.figure as { kind: string; capo: number; dots: Array<{ string: number; fret: number }> };
    expect(pic.kind).toBe('fretboard');
    expect(pic.capo).toBe(2);
    expect([6, 5, 4, 3, 2, 1].map((s) => pic.dots.find((d) => d.string === s)!.fret).join('')).toBe('320003');
    expect([6, 5, 4, 3, 2, 1].map((s) => midiAt(pic.dots.find((d) => d.string === s)!, { capo: 2 }))).toEqual(buildVoicing('A', '542225').midi);
    expect(plainText(play.prompt)).not.toMatch(/wood|bar at fret/);
  });

  it('plays the two guitars of the card on one G chord', () => {
    const two = kinds<{ kind: 'audio'; sound: Sound; label?: string }>('audio').find((a) => /both guitars/.test(String(a.label)))!;
    const heard = sortedPcs(soundPlan(two.sound).events.flatMap((e) => e.midi));
    expect(heard).toEqual(sortedPcs(chordPcs('G')));
    const open = buildVoicing('G', '320003').midi;
    const capo5 = buildVoicing('G', 'xx0232', { capo: 5 }).midi;
    expect([...new Set(soundPlan(two.sound).events.flatMap((e) => e.midi))].sort((a, b) => a - b)).toEqual([...new Set([...open, ...capo5])].sort((a, b) => a - b));
  });
});

describe('capo-and-transposition: Nashville numbers', () => {
  it('reads the chart of the cards in G and in D, as the audio plays it', () => {
    const CHART = '1 | 5 | 6- | 4 | 1/3 | 4 | 5 | 1';
    expect(chart(CHART, 'G')).toEqual(['G', 'D', 'Em', 'C', 'G/B', 'C', 'D', 'G']);
    expect(chart(CHART, 'D')).toEqual(['D', 'A', 'Bm', 'G', 'D/F#', 'G', 'A', 'D']);
    const card = lesson('nashville-numbers').steps.find((s) => !isGenerated(s) && s.type === 'card' && /any key/.test(String(s.title))) as { body: RichText; figure: { sound: Sound } };
    expect(plainText(card.body)).toContain(CHART);
    const named = tagged(card.body, 'chord');
    expect(named.slice(0, 8)).toEqual(chart(CHART, 'G'));
    expect(named.slice(8)).toEqual(chart(CHART, 'D'));
    expect(card.figure.sound.kind === 'progression' && card.figure.sound.chords).toEqual(chart(CHART, 'D'));
    // The first card plays what its text reads: 1 4 5 (and home to 1) in G.
    const first = lesson('nashville-numbers').steps[0] as { body: RichText; figure: { sound: Sound; label: string } };
    expect(first.figure.sound.kind === 'progression' && first.figure.sound.chords).toEqual(chart('1 4 5 1', 'G'));
    expect(first.figure.label).toContain('1 4 5 1 in G');
    expect(tagged(first.body, 'chord')).toEqual(chart('1 4 5', 'G'));
    // Every slash chord of the charts is the 1 chord in first inversion.
    for (const s of ['G/B', 'D/F#']) expect(parseChord(s)!.notes).toContain(parseChord(s)!.bass);
  });

  it('agrees with the diatonic chords of each key', () => {
    for (const key of ['C', 'G', 'D', 'A']) {
      const diatonic = diatonicChords(`${key} major`).map((c) => c.symbol);
      expect(['1', '2-', '3-', '4', '5', '6-'].map((x) => nashville(x, key))).toEqual(diatonic.slice(0, 6));
    }
  });

  it('answers the number questions', () => {
    expect(chart('1 4 5', 'G')).toEqual(['G', 'C', 'D']);
    expect(chart('1 4 6- 5', 'D')).toEqual(['D', 'G', 'Bm', 'A']);
    expect(chart('1 5 6- 4', 'A')).toEqual(['A', 'E', 'F#m', 'D']);
    expect(chart('1 4 5 1', 'A')).toEqual(['A', 'D', 'E', 'A']);
    expect(nashville('6-', 'G')).toBe('Em');
    expect(nashville('2-', 'G')).toBe('Am');
    expect(nashville('3-', 'G')).toBe('Bm');
    expect(nashville('1/3', 'C')).toBe('C/E');
    expect(nashville('1/3', 'G')).toBe('G/B');
    expect(nashville('1/5', 'G')).toBe('G/D');
    expect(nashville('5/7', 'C')).toBe('G/B');
    expect(nashville('5/7', 'G')).toBe('D/F#');
    expect(nashville('5/4', 'C')).toBe('G/F');
    expect(nashville('5/4', 'G')).toBe('D/C');
    expect(scaleNotes('G', 'major').indexOf('E') + 1).toBe(6);
    // The fill-blanks and choices quote the same readings.
    const read = ofType<FillBlanksExercise>('fill-blanks').filter((e) => /Read the chart/.test(plainText(e.prompt)));
    expect(read.length).toBe(2);
    for (const e of read) {
      const m = /chart ([\d\s/-]+) in/.exec(plainText(e.prompt))!;
      const key = tagged(e.prompt, 'key')[0];
      const want = chart(m[1].trim(), key);
      const text = tokenize(e.text).filter((t) => t.type === 'chord' || t.type === 'blank');
      let b = 0;
      text.forEach((t, i) => expect(t.type === 'blank' ? tagged(e.blanks[b++], 'chord')[0] : String((t as { value: string }).value)).toBe(want[i]));
    }
    for (const [re, want] of [[/In C major, what is 5\/7/, 'G/B'], [/In G major, what is 5\/7/, 'D/F#'], [/In G major, what is 1\/3/, 'G/B'], [/1 4 5 1, in A/, 'A D E A']] as const) {
      expect(tagged(correct(find<ChoiceExercise>('choice', re)), 'chord').join(' '), String(re)).toBe(want);
    }
    expect(plainText(correct(find<ChoiceExercise>('choice', /how is Em written/i)))).toBe('6-');
    expect(plainText(correct(find<ChoiceExercise>('choice', /how is Am written/i)))).toBe('2-');
  });
});

describe('capo-and-transposition: what each listening question plays', () => {
  it('transposing: the second half is the first, a whole step higher', () => {
    const [q] = listens(lesson('transposing'));
    const events = soundPlan(q.sound).events;
    const half = events.length / 2;
    for (let i = 0; i < half; i++) expect(events[i + half].midi).toEqual(events[i].midi.map((m) => m + 2));
    expect(plainText(correct(q))).toBe('Yes, moved higher');
  });

  it('the checkpoint: the second half is the first, a whole step lower', () => {
    const q = exercises(unit.checkpoint!.steps!).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    const events = soundPlan(q.sound).events;
    const half = events.length / 2;
    for (let i = 0; i < half; i++) expect(events[i + half].midi).toEqual(events[i].midi.map((m) => m - 2));
    expect(plainText(correct(q))).toBe('Yes, moved lower');
  });

  it('the-capo: the same G shape, the second time two half steps higher', () => {
    const [q] = listens(lesson('the-capo'));
    const notes = soundPlan(q.sound).events.map((e) => e.midi[0]);
    expect(notes.slice(0, 6)).toEqual(buildVoicing('G', '320003').midi);
    expect(notes.slice(6)).toEqual(notes.slice(0, 6).map((m) => m + 2));
    expect(plainText(correct(q))).toBe('The second time');
  });
});

describe('capo-and-transposition: careful wording', () => {
  it('says capo tab "usually" counts from the capo: some tab counts from the nut', () => {
    const all: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') all.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(unit);
    const claims = all.filter((t) => /capo tab|tab for capo/i.test(t) && /counts|means/.test(t));
    expect(claims.length).toBeGreaterThanOrEqual(6);
    for (const t of claims) expect(t, t).toMatch(/usually|most/);
  });

  it('keeps a fixed option order only for numbers in order, so the answer is not always first', () => {
    for (const e of ofType<ChoiceExercise>('choice').filter((x) => x.shuffle === false)) {
      const nums = e.options.map((o) => Number(/\d+/.exec(plainText(o.text!))?.[0]));
      expect(nums.every((v, i) => !Number.isNaN(v) && (i === 0 || v > nums[i - 1])), plainText(e.prompt)).toBe(true);
    }
  });
});

describe('capo-and-transposition: on the go', () => {
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
