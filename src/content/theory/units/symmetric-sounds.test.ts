/**
 * Unit 36 of the Theory Path, cross-checked against the engines: every chord shape written in the
 * text and figures, every dim7 and augmented chord said to share notes, the four dominants a dim7
 * stands in for, the passing and common-tone chords, the spelling of every scale, the frets of the
 * rising line, what each listening question plays, and that every lesson still teaches with the
 * guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import { chordNotes, chordPcs, diatonicChords, getScale, intervalBetween, parseChord, scaleNotes, scalePcs, transpose } from '@/core/theory';
import { buildVoicing, identifyFretted, midiAt, tryBuildVoicing } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, resolveFigure, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type ChordBuildExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise,
  type OrderExercise, type PlayChordExercise, type RichText, type Step, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './symmetric-sounds';

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
const wrong = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): RichText[] => e.options.filter((o) => !o.correct).map((o) => o.text ?? '');
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const heard = (e: ListenChoiceExercise): number[][] => soundPlan(e.sound).events.map((ev) => ev.midi);

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
const pcSet = (symbol: string): string => [...new Set(chordPcs(symbol))].sort((a, b) => a - b).join('.');
const card = (l: Lesson, index: number) => {
  const step = l.steps[index];
  if (isGenerated(step) || step.type !== 'card') throw new Error(`${l.id} step ${index} is not a card`);
  return step;
};

describe('symmetric-sounds: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^symmetric-/);
  });
});

describe('symmetric-sounds: every shape written in the text', () => {
  // "{c:C#dim7} (x4535x)" and the like.
  const pairs: Array<[string, string]> = [];
  for (const text of texts(unit)) for (const m of text.matchAll(/\{c:([^}]+)\}\s*\(([x0-9]{6})\)/g)) pairs.push([m[1], m[2]]);

  it('finds the shapes', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(7);
  });

  it('sounds exactly the chord it is written beside', () => {
    for (const [symbol, shape] of pairs) {
      const v = tryBuildVoicing(symbol, shape);
      expect(v, `${symbol} ${shape}`).not.toBeNull();
      expect(v!.chord, `${symbol} ${shape}`).toBe(symbol);
    }
  });

  it('names the other shapes the text quotes', () => {
    expect(buildVoicing('Bdim7', 'x2313x').chord).toBe('Bdim7');
    expect(buildVoicing('C7b9', 'x3232x').chord).toBe('C7b9');
    expect(buildVoicing('C7#5', 'x3x354').chord).toBe('C7#5');
    expect(buildVoicing('Ddim7', 'x5646x').chord).toBe('Ddim7');
    // x32210 has no G: C6 without its 5th, the notes of Am/C.
    expect(identifyFretted('x32210').symbol).toBe('Am/C');
    const c6 = new Set(chordPcs('C6'));
    for (const n of identifyFretted('x32210').notes) expect(c6.has(n.midi % 12)).toBe(true);
    expect(tryBuildVoicing('C6', 'x32210')).toBeNull();
  });

  it('builds every chord figure, chord-build and play-chord as its chord', () => {
    const figures: Array<{ symbol: string; frets: string }> = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (o.kind === 'chord' && typeof o.symbol === 'string' && typeof o.frets === 'string') figures.push({ symbol: o.symbol, frets: o.frets });
        Object.values(o).forEach(walk);
      }
    };
    walk(unit);
    expect(figures.length).toBe(3);
    for (const f of figures) expect(buildVoicing(f.symbol, f.frets).chord, `${f.symbol} ${f.frets}`).toBe(f.symbol);
    const shaped: Array<ChordBuildExercise | PlayChordExercise> = [
      ...ofType<ChordBuildExercise>('chord-build').filter((e) => e.task === 'fingers'),
      ...ofType<PlayChordExercise>('play-chord'),
    ];
    expect(shaped.length).toBe(4);
    for (const e of shaped) expect(buildVoicing(e.chord, e.frets!).chord, `${e.chord} ${String(e.frets)}`).toBe(e.chord);
  });
});

describe('symmetric-sounds: the diminished seventh', () => {
  const B = pcSet('Bdim7');

  it('is four minor thirds that fill the octave', () => {
    const notes = chordNotes('Bdim7');
    expect(notes).toEqual(['B', 'D', 'F', 'Ab']);
    for (let i = 0; i < 4; i++) expect(intervalBetween(notes[i], notes[(i + 1) % 4]), `${notes[i]} to ${notes[(i + 1) % 4]}`).toMatch(/^(m3|A2)$/);
    expect(chordPcs('Bdim7').map((pc, i, all) => (all[(i + 1) % 4] - pc + 12) % 12)).toEqual([3, 3, 3, 3]);
  });

  it('draws the Bdim7 shape at frets 2, 5, 8 and 11, each one the same four pitches', () => {
    const fig = card(lesson('dim7-symmetry'), 0).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    const resolved = resolveFigure(fig);
    if (!resolved || resolved.kind !== 'fretboard') throw new Error('figure does not resolve');
    expect(resolved.dots).toHaveLength(16);
    for (const d of resolved.dots) expect(chordPcs('Bdim7')).toContain(d.midi % 12);
    const shapes = ['x2313x', 'x5646x', 'x8979x', 'x-11-12-10-12-x'];
    expect(shapes.map((s) => buildVoicing('Bdim7', s).frets[1])).toEqual([2, 5, 8, 11]);
    for (const s of shapes) {
      const v = buildVoicing('Bdim7', s);
      expect(pcSet(v.chord), s).toBe(B);
      for (const n of v.notes) expect(resolved.dots.some((d) => d.string === n.string && d.fret === n.fret), `${s} string ${n.string}`).toBe(true);
    }
    // Each shape three frets up is every note a minor third higher.
    for (let i = 0; i + 1 < shapes.length; i++) {
      const a = buildVoicing('Bdim7', shapes[i]).midi;
      const b = buildVoicing('Bdim7', shapes[i + 1]).midi;
      expect(b.map((m, j) => m - a[j])).toEqual([3, 3, 3, 3]);
    }
    // The audio card plays the same four shapes.
    const audio = card(lesson('dim7-symmetry'), 1).figure;
    if (audio?.kind !== 'audio') throw new Error('expected audio');
    const played = soundPlan(audio.sound).events.map((e) => e.midi[0]);
    expect(played).toEqual(shapes.flatMap((s) => buildVoicing('Bdim7', s).midi));
  });

  it('has only three sets of notes: on C, C# and D', () => {
    const sets = new Set(['C', 'C#', 'D'].map((r) => pcSet(`${r}dim7`)));
    expect(sets.size).toBe(3);
    const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
    expect(new Set(roots.map((r) => pcSet(`${r}dim7`))).size).toBe(3);
    expect(pcSet('Ebdim7')).toBe(pcSet('Cdim7'));
    expect(pcSet('Edim7')).toBe(pcSet('C#dim7'));
    expect(pcSet('Fdim7')).toBe(pcSet('Ddim7'));
    expect(pcSet('Ddim7')).toBe(B);
    expect(pcSet('Fdim7')).toBe(B);
    expect(chordNotes('Ddim7')).toEqual(['D', 'F', 'Ab', 'Cb']);
    expect(chordNotes('Fdim7')).toEqual(['F', 'Ab', 'Cb', 'Ebb']);
    expect(chordNotes('Edim7')).toEqual(['E', 'G', 'Bb', 'Db']);
    expect(chordNotes('Cdim7')).toEqual(['C', 'Eb', 'Gb', 'Bbb']);
  });

  it('marks as right exactly the dim7 options that share the notes of Bdim7', () => {
    const asked = ofType<ChoiceExercise>('choice').filter((e) => /same notes as \{c:Bdim7\}/.test(plainText(e.prompt) + String(e.prompt)));
    expect(asked.length).toBe(2);
    for (const e of asked) {
      for (const o of e.options) expect(pcSet(tagged(o.text ?? '', 'chord')[0]) === B, String(o.text)).toBe(!!o.correct);
      // One option per set of notes: no two options are the same chord under two names.
      expect(new Set(e.options.map((o) => pcSet(tagged(o.text ?? '', 'chord')[0]))).size).toBe(e.options.length);
    }
  });
});

describe('symmetric-sounds: one dim7, four dominants', () => {
  const B = pcSet('Bdim7');
  const rootless = (dominant: string): string => [...new Set(chordPcs(dominant).slice(1))].sort((a, b) => a - b).join('.');

  it('is the rootless 7b9 of G, Bb, Db and E, and of no other root', () => {
    const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    expect(roots.filter((r) => rootless(`${r}7b9`) === B)).toEqual(['Db', 'E', 'G', 'Bb']);
    // Each root is a half step below a note of Bdim7, and the four roots are a minor third apart.
    for (const r of ['G', 'Bb', 'Db', 'E']) expect(chordPcs('Bdim7')).toContain(chordPcs(`${transpose(r, 'm2')}5`)[0]);
    expect(rootless('C7b9')).toBe(pcSet('Edim7'));
    expect(rootless('A7b9')).toBe(pcSet('C#dim7'));
    expect(rootless('D7b9')).toBe(pcSet('F#dim7'));
    expect(pcSet('F#dim7')).toBe(pcSet('Cdim7'));
    expect(rootless('E7b9')).toBe(B);
    expect(chordNotes('E7b9')).toEqual(['E', 'G#', 'B', 'D', 'F']);
  });

  it('marks the dominant options by that rule', () => {
    const asked = ofType<ChoiceExercise>('choice').filter((e) => e.options.length >= 3 && e.options.every((o) => /7b9\}/.test(String(o.text))));
    expect(asked.length).toBe(2);
    for (const e of asked) for (const o of e.options) expect(rootless(tagged(o.text ?? '', 'chord')[0]) === B, String(o.text)).toBe(!!o.correct);
  });

  it('passes a half step below the next chord, and decorates on the same root', () => {
    for (const [from, dim, to] of [['C', 'C#dim7', 'Dm7'], ['G', 'G#dim7', 'Am'], ['F', 'F#dim7', 'Gm7']]) {
      const [a, d, b] = [from, dim, to].map((c) => parseChord(c)!.root);
      expect(intervalBetween(a, b), `${from} to ${to}`).toBe('M2');
      expect(intervalBetween(a, d), `${from} to ${dim}`).toBe('A1');
      expect(intervalBetween(d, b), `${dim} to ${to}`).toBe('m2');
    }
    const typed = ofType<TypeAnswerExercise>('type-answer').filter((e) => e.answer.kind === 'chord');
    expect(typed.map((e) => e.answer.value)).toEqual(['G#dim7', 'C#dim7']);
    for (const e of typed) {
      const [from, to] = tagged(e.prompt, 'chord');
      expect(intervalBetween(parseChord(String(e.answer.value))!.root, parseChord(to)!.root), `${from} to ${to}`).toBe('m2');
    }
    const passing = ofType<ChoiceExercise>('choice').filter((e) => /passes between/.test(String(e.prompt)));
    expect(passing.length).toBe(2);
    for (const e of passing) {
      const to = parseChord(tagged(e.prompt, 'chord')[1])!.root;
      for (const o of e.options) expect(intervalBetween(parseChord(tagged(o.text ?? '', 'chord')[0])!.root, to) === 'm2', String(o.text)).toBe(!!o.correct);
    }
    // The common-tone chord keeps the bass of the C shape: string 5, fret 3.
    expect(buildVoicing('Cdim7', 'x3424x').notes[0]).toMatchObject({ string: 5, fret: 3, note: 'C' });
    expect(buildVoicing('C', 'x32010').notes[0]).toMatchObject({ string: 5, fret: 3, note: 'C' });
  });

  it('plays a bass climbing by half steps under the passing chord, and not under Am', () => {
    const [pass, plain] = listens(lesson('one-dim7-four-dominants'));
    expect(pass.sound).toEqual({ kind: 'progression', chords: ['C', 'C#dim7', 'Dm7'], tempo: 70 });
    expect(heard(pass).map((m) => Math.min(...m))).toEqual([48, 49, 50]);
    expect(plainText(correct(pass)[0])).toMatch(/^Yes/);
    expect(heard(plain).map((m) => Math.min(...m))).toEqual([48, 45, 50]);
    expect(plainText(correct(plain)[0])).toMatch(/^No/);
    // The figure marks the same climbing bass.
    const fig = card(lesson('one-dim7-four-dominants'), 0).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    expect(fig.dots!.map((d) => midiAt(d))).toEqual([48, 49, 50]);
  });
});

describe('symmetric-sounds: the diminished scales', () => {
  const halfWhole = scaleNotes('C', 'diminished-half-whole');
  const wholeHalf = scaleNotes('C', 'diminished-whole-half');
  const inScale = (tonic: string, scale: string, chord: string): boolean => chordPcs(chord).every((pc) => scalePcs(tonic, scale).includes(pc));

  it('spells both scales as the text does', () => {
    expect(halfWhole).toEqual(['C', 'Db', 'Eb', 'E', 'F#', 'G', 'A', 'Bb']);
    expect(wholeHalf).toEqual(['C', 'D', 'Eb', 'F', 'Gb', 'Ab', 'A', 'B']);
    expect(scaleNotes('G', 'diminished-half-whole')).toEqual(['G', 'Ab', 'Bb', 'B', 'C#', 'D', 'E', 'F']);
    expect(getScale('diminished-half-whole')!.size).toBe(8);
    expect(getScale('diminished-whole-half')!.size).toBe(8);
    expect(getScale('diminished-half-whole')!.semitones.slice(0, 3)).toEqual([0, 1, 3]);
    const fills = ofType<FillBlanksExercise>('fill-blanks').filter((e) => /half-whole/.test(String(e.prompt)));
    expect(fills.length).toBe(2);
    for (const e of fills) {
      const shown = tagged(e.text, 'note');
      const gap = halfWhole.findIndex((n, i) => shown[i] !== n);
      expect(tagged(e.blanks[0], 'note')[0]).toBe(halfWhole[gap]);
      expect([...shown.slice(0, gap), halfWhole[gap], ...shown.slice(gap)]).toEqual(halfWhole);
    }
    const orders = ofType<OrderExercise>('order').filter((e) => /diminished/.test(String(e.prompt)));
    expect(orders.map((e) => e.tiles.map((t) => tagged(t, 'note')[0]))).toEqual(expect.arrayContaining([wholeHalf, halfWhole]));
  });

  it('fits the chords the text says, and not the others', () => {
    expect(inScale('C', 'diminished-half-whole', 'C7b9')).toBe(true);
    expect(inScale('C', 'diminished-half-whole', 'C7#9')).toBe(true);
    expect(inScale('C', 'diminished-half-whole', 'C13b9')).toBe(true);
    expect(inScale('G', 'diminished-half-whole', 'G7b9')).toBe(true);
    expect(inScale('C', 'diminished-whole-half', 'Cdim7')).toBe(true);
    expect(inScale('C', 'diminished-whole-half', 'C7')).toBe(false);
    expect(inScale('G', 'diminished-whole-half', 'G7')).toBe(false);
    expect(inScale('C', 'mixolydian', 'C7b9')).toBe(false);
    // Both scales hold Cdim7; half-whole puts its other notes a half step above each chord tone (they clash),
    // whole-half a whole step above (usable tensions), which is why whole-half is the dim7 scale.
    expect(inScale('C', 'diminished-half-whole', 'Cdim7')).toBe(true);
    expect(chordPcs('Cdim7').map((pc) => (pc + 1) % 12).every((pc) => scalePcs('C', 'diminished-half-whole').includes(pc))).toBe(true);
    expect(inScale('G', 'whole-tone', 'G7b9')).toBe(false);
    // Whole-half: a note a whole step above each note of Cdim7.
    expect(chordNotes('Cdim7').map((n) => transpose(n, 'M2'))).toEqual(['D', 'F', 'Ab', 'Cb']);
    expect(chordPcs('Cdim7').map((pc) => (pc + 2) % 12).every((pc) => scalePcs('C', 'diminished-whole-half').includes(pc))).toBe(true);
  });

  it('shows C7 bright and its tensions pale on the figure', () => {
    const fig = card(lesson('diminished-scales'), 0).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    const resolved = resolveFigure(fig);
    if (!resolved || resolved.kind !== 'fretboard') throw new Error('figure does not resolve');
    expect(resolved.dots.length).toBe(14);
    const c7 = chordPcs('C7');
    for (const d of resolved.dots) {
      expect(scalePcs('C', 'diminished-half-whole')).toContain(d.midi % 12);
      expect(d.role === 'ghost', `string ${d.string} fret ${d.fret} ${d.note}`).toBe(!c7.includes(d.midi % 12));
    }
  });

  it('plays the scales the listening questions name', () => {
    const [q] = listens(lesson('diminished-scales'));
    const line = heard(q).map((m) => m[0]);
    expect(line.map((m) => m - line[0])).toEqual([...getScale('diminished-half-whole')!.semitones, 12]);
    expect(line[0] % 12).toBe(7); // G
    expect(plainText(correct(q)[0])).toBe('Half-whole diminished');
    const audio = card(lesson('diminished-scales'), 1).figure;
    if (audio?.kind !== 'audio') throw new Error('expected audio');
    const notes = soundPlan(audio.sound).events.map((e) => e.midi[0]);
    expect(notes.slice(0, 4)).toEqual(buildVoicing('C7b9', 'x3232x').midi);
    expect(notes.slice(4).map((m) => m - 48)).toEqual([...getScale('diminished-half-whole')!.semitones, 12]);
  });
});

describe('symmetric-sounds: the augmented triad', () => {
  it('is two major thirds, repeating every four frets', () => {
    expect(chordNotes('Caug')).toEqual(['C', 'E', 'G#']);
    expect(chordNotes('Eaug')).toEqual(['E', 'G#', 'B#']);
    expect(chordNotes('G#aug')).toEqual(['G#', 'B#', 'D##']);
    expect(pcSet('Eaug')).toBe(pcSet('Caug'));
    expect(pcSet('G#aug')).toBe(pcSet('Caug'));
    expect(pcSet('Daug')).not.toBe(pcSet('Caug'));
    expect(pcSet('Ebaug')).not.toBe(pcSet('Caug'));
    const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
    expect(new Set(roots.map((r) => pcSet(`${r}aug`))).size).toBe(4);
    expect(new Set(['C', 'C#', 'D', 'Eb'].map((r) => pcSet(`${r}aug`))).size).toBe(4);
    const shapes = ['x-x-10-9-9-x', 'xx655x', 'xx211x'];
    const voicings = [buildVoicing('Caug', shapes[0]), buildVoicing('G#aug', shapes[1]), buildVoicing('Eaug', shapes[2])];
    expect(voicings.map((v) => v.chord)).toEqual(['Caug', 'G#aug', 'Eaug']);
    expect(voicings.map((v) => v.notes.map((n) => n.note).join(' '))).toEqual(['C E G#', 'G# B# D##', 'E G# B#']);
    for (let i = 0; i + 1 < voicings.length; i++) expect(voicings[i + 1].midi.map((m, j) => voicings[i].midi[j] - m)).toEqual([4, 4, 4]);
    // The figure draws exactly those three shapes.
    const fig = card(lesson('augmented-symmetry'), 0).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    const drawn = fig.dots!.map((d) => `${d.string}:${d.fret}`).sort();
    expect(drawn).toEqual(voicings.flatMap((v) => v.notes.map((n) => `${n.string}:${n.fret}`)).sort());
    const audio = card(lesson('augmented-symmetry'), 1).figure;
    if (audio?.kind !== 'audio') throw new Error('expected audio');
    expect(soundPlan(audio.sound).events.map((e) => e.midi[0])).toEqual(voicings.flatMap((v) => v.midi));
  });

  it('marks as right exactly the augmented option with the notes of Caug', () => {
    const q = ofType<ChoiceExercise>('choice').find((e) => /same notes as \{c:Caug\}/.test(String(e.prompt)))!;
    for (const o of q.options) expect(pcSet(tagged(o.text ?? '', 'chord')[0]) === pcSet('Caug'), String(o.text)).toBe(!!o.correct);
  });

  it('plays an augmented chord in the listening question', () => {
    const [q] = listens(lesson('augmented-symmetry'));
    const [chord] = heard(q);
    expect(chord.map((m) => m - chord[0])).toEqual([0, 4, 8]);
    expect(plainText(correct(q)[0])).toBe('Augmented');
  });
});

describe('symmetric-sounds: the whole-tone scale', () => {
  const C = scaleNotes('C', 'whole-tone');

  it('spells the scale and lays it out as the figures say', () => {
    expect(C).toEqual(['C', 'D', 'E', 'F#', 'G#', 'Bb']);
    const along = card(lesson('whole-tone-scale'), 0).figure;
    if (along?.kind !== 'fretboard') throw new Error('expected a fretboard');
    expect(along.dots!.map((d) => d.fret)).toEqual([3, 5, 7, 9, 11, 13, 15]);
    expect(along.dots!.map((d) => midiAt(d) % 12)).toEqual([...scalePcs('C', 'whole-tone'), 0]);
    const position = card(lesson('whole-tone-scale'), 1).figure;
    if (position?.kind !== 'fretboard') throw new Error('expected a fretboard');
    const resolved = resolveFigure(position);
    if (!resolved || resolved.kind !== 'fretboard') throw new Error('figure does not resolve');
    for (const s of [1, 2, 3, 4, 5, 6]) expect(resolved.dots.filter((d) => d.string === s).length, `string ${s}`).toBe(2);
  });

  it('comes in only two sets of notes', () => {
    const set = (t: string): string => [...scalePcs(t, 'whole-tone')].sort((a, b) => a - b).join('.');
    const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
    expect(new Set(roots.map(set)).size).toBe(2);
    expect(set('D')).toBe(set('C'));
    expect(set('C#')).not.toBe(set('C'));
    expect(set('Db')).toBe(set('C#'));
    expect(scaleNotes('D', 'whole-tone')).toEqual(['D', 'E', 'F#', 'G#', 'A#', 'C']);
  });

  it('fits the chords with a raised 5th, and not the others', () => {
    const fits = (chord: string): boolean => chordPcs(chord).every((pc) => scalePcs('C', 'whole-tone').includes(pc));
    expect(chordNotes('C7#5')).toEqual(['C', 'E', 'G#', 'Bb']);
    expect(fits('C7#5')).toBe(true);
    expect(fits('C9#5')).toBe(true);
    for (const c of ['Cmaj7', 'Cm7', 'C7b9', 'C7']) expect(fits(c), c).toBe(false);
    const q = ofType<ChoiceExercise>('choice').filter((e) => /whole tone fit|whole-tone scale on/.test(String(e.prompt)));
    expect(q.length).toBe(2);
    for (const e of q) for (const o of e.options) expect(fits(tagged(o.text ?? '', 'chord')[0]), String(o.text)).toBe(!!o.correct);
    expect(buildVoicing('C7#5', 'x3x354').chord).toBe('C7#5');
  });

  it('plays a whole-tone scale in the listening question', () => {
    const [q] = listens(lesson('whole-tone-scale'));
    const line = heard(q).map((m) => m[0]);
    expect(line.slice(1).map((m, i) => m - line[i])).toEqual([2, 2, 2, 2, 2, 2]);
  });
});

describe('symmetric-sounds: augmented chords in progressions', () => {
  it('climbs one fret at a time on string 3, from C to F', () => {
    const shapes = ['x32010', 'x32110', 'x32210', 'x32310', 'xx3211'];
    expect(identifyFretted(shapes[0]).symbol).toBe('C');
    expect(identifyFretted(shapes[1]).symbol).toBe('Caug');
    expect(identifyFretted(shapes[3]).symbol).toBe('C7');
    expect(identifyFretted(shapes[4]).symbol).toBe('F');
    // Only string 3 changes among the C shapes: G, G#, A, Bb.
    const third = shapes.slice(0, 4).map((s) => identifyFretted(s).notes.find((n) => n.string === 3)!);
    expect(third.map((n) => n.fret)).toEqual([0, 1, 2, 3]);
    expect(third.map((n) => n.midi)).toEqual([55, 56, 57, 58]);
    for (const s of shapes.slice(1, 4)) {
      const changed = [...s].map((ch, i) => (ch === shapes[0][i] ? null : 6 - i)).filter((x) => x !== null);
      expect(changed, s).toEqual([3]);
    }
    // The Bb of C7 falls a half step to A, the 3rd of F (xx3211, string 3).
    expect(identifyFretted('xx3211').notes.find((n) => n.string === 3)!.midi).toBe(57);
    expect(chordToRootInterval('C7', 'F')).toBe('P4');
    // The audio card picks the same five shapes.
    const audio = card(lesson('augmented-in-progressions'), 1).figure;
    if (audio?.kind !== 'audio') throw new Error('expected audio');
    expect(soundPlan(audio.sound).events.map((e) => e.midi[0])).toEqual(shapes.flatMap((s) => identifyFretted(s).notes.map((n) => n.midi)));
    const fig = card(lesson('augmented-in-progressions'), 0).figure;
    if (fig?.kind !== 'fretboard') throw new Error('expected a fretboard');
    expect(fig.dots!.map((d) => midiAt(d))).toEqual([55, 56, 57, 58]);
  });

  it('raises the 5th of V to a D# that rises into the 3rd of I', () => {
    expect(chordNotes('G+')).toEqual(['G', 'B', 'D#']);
    expect(parseChord('G+')!.symbol).toBe('Gaug');
    for (const e of ofType<TypeAnswerExercise>('type-answer').filter((x) => x.answer.kind === 'note')) {
      expect(e.answer.value).toBe(chordNotes('Gaug')[2]);
    }
    const gaug = buildVoicing('Gaug', '321003');
    const c = buildVoicing('C', 'x32010');
    const sharp5 = gaug.notes.find((n) => n.string === 4)!;
    expect(sharp5).toMatchObject({ fret: 1, note: 'D#' });
    expect(c.notes.find((n) => n.string === 4)!.midi - sharp5.midi).toBe(1);
    expect(c.notes.find((n) => n.string === 4)!.note).toBe('E');
    const [plus, plain] = listens(lesson('augmented-in-progressions'));
    expect(heard(plus).map((m) => m[0])).toEqual([...gaug.midi, ...c.midi]);
    expect(heard(plain).map((m) => m[0])).toEqual([...buildVoicing('G', '320003').midi, ...c.midi]);
    expect(tagged(correct(plus)[0], 'roman')).toEqual(['V+', 'I']);
    expect(tagged(correct(plain)[0], 'roman')).toEqual(['V', 'I']);
  });

  it('finds the augmented chord on bIII of A harmonic minor', () => {
    const chords = diatonicChords('A minor', { minor: 'harmonic' });
    expect(chords[2]).toMatchObject({ roman: 'bIII+', symbol: 'Caug' });
    const q = ofType<ChoiceExercise>('choice').find((e) => /Harmonic minor raises/.test(String(e.prompt)))!;
    expect(tagged(correct(q)[0], 'chord')).toEqual(['Caug']);
  });

  it('leads the line to F in the checkpoint', () => {
    const q = exercises(unit.checkpoint!.steps!).find((e) => e.type === 'choice' && /lead to/.test(String(e.prompt))) as ChoiceExercise;
    expect(tagged(correct(q)[0], 'chord')).toEqual(['F']);
    expect(chordNotes('C7').map((n) => transpose(n, '-m2'))).toContain('A');
    expect(wrong(q).length).toBe(2);
  });
});

/** The interval from one chord's root up to another's. */
function chordToRootInterval(from: string, to: string): string {
  return intervalBetween(parseChord(from)!.root, parseChord(to)!.root);
}

describe('symmetric-sounds: on the go', () => {
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
