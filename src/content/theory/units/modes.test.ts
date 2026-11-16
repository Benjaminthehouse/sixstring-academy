/**
 * Unit 26 of the Theory Path, cross-checked against the engines: every mode formula and spelling,
 * the changes against major and the bright-to-dark order, the characteristic notes and parent
 * scales it quotes, the chords of each vamp, every fretboard picture, what every "over a drone"
 * question plays, the frets of the phrases, and that each lesson still teaches with the guitar or
 * the sound off.
 */
import { describe, expect, it } from 'vitest';
import { chordNotes, chordPcs, getScale, scaleModes, scaleMidi, scaleNotes, scalePcs } from '@/core/theory';
import { midiAt, positionsForNote, scalePositions } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, soundPlan, tokenize, validateCourse,
  type Exercise, type FretboardFigure, type FretboardFindExercise, type Lesson, type ListenChoiceExercise, type MatchPairsExercise,
  type OrderExercise, type PlayPhraseExercise, type RichText, type Step, type TabNote, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './modes';

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
const tagged = (text: RichText, type: 'note' | 'degree' | 'chord' | 'key'): string[] =>
  tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
const scaleSet = (tonic: string, scale: string): string => [...scalePcs(tonic, scale)].sort((a, b) => a - b).join(',');
const midiOf = (n: TabNote): number => ('string' in n ? midiAt({ string: n.string, fret: n.fret }) : -1);

/** The mode names a learner sees, by scale id. */
const NAME: Record<string, string> = { major: 'Ionian', dorian: 'Dorian', phrygian: 'Phrygian', lydian: 'Lydian', mixolydian: 'Mixolydian', minor: 'Aeolian', locrian: 'Locrian' };
const MODES = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'];
/** Degrees of a mode that differ from major, as the text writes them. */
const changes = (mode: string): string[] => getScale(mode)!.degrees.filter((d) => !getScale('major')!.degrees.includes(d));

describe('modes: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'intermediate', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^modes-/);
  });
});

describe('modes: rotations and names', () => {
  it('names the modes of the major scale in order', () => {
    expect(scaleModes('major').map((m) => m.scale?.id)).toEqual(MODES);
    const seven = ofType<OrderExercise>('order').find((e) => e.tiles.length === 7 && /degree 1/.test(plainText(e.prompt)))!;
    expect(seven.tiles.map((t) => plainText(t))).toEqual(MODES.map((m) => NAME[m]));
    for (const e of ofType<OrderExercise>('order').filter((x) => /degree 1/.test(plainText(x.prompt)))) {
      expect(e.tiles.map((t) => plainText(t)), plainText(e.prompt)).toEqual(MODES.map((m) => NAME[m]).slice(0, e.tiles.length));
    }
  });

  it('gets the natural-note modes right', () => {
    const naturals = (tonic: string, mode: string) => scaleNotes(tonic, mode).every((n) => n.length === 1);
    for (const [tonic, mode] of [['C', 'major'], ['D', 'dorian'], ['E', 'phrygian'], ['F', 'lydian'], ['G', 'mixolydian'], ['A', 'minor'], ['B', 'locrian']]) {
      expect(naturals(tonic, mode), `${tonic} ${mode}`).toBe(true);
    }
    // The distractors of those questions are not natural-note modes.
    for (const [tonic, mode] of [['E', 'dorian'], ['E', 'minor'], ['E', 'lydian'], ['G', 'major'], ['G', 'lydian'], ['G', 'dorian'], ['A', 'dorian'], ['A', 'phrygian']]) {
      expect(naturals(tonic, mode), `${tonic} ${mode}`).toBe(false);
    }
  });

  it('draws C major along string 5 and E Phrygian along string 4', () => {
    const [cMajor] = lesson('modes-as-rotations').steps as Array<{ figure: FretboardFigure }>;
    expect(cMajor.figure.dots!.map((d) => midiAt(d))).toEqual(scaleMidi(48, 'major'));
    const ePhrygian = lesson('modes-as-rotations').steps[4] as { figure: FretboardFigure };
    expect(ePhrygian.figure.dots!.map((d) => midiAt(d))).toEqual(scaleMidi(52, 'phrygian'));
  });
});

describe('modes: against major, bright to dark', () => {
  it('states each change against major as the engine has it', () => {
    expect(changes('lydian')).toEqual(['#4']);
    expect(changes('mixolydian')).toEqual(['b7']);
    expect(changes('dorian')).toEqual(['b3', 'b7']);
    expect(changes('minor')).toEqual(['b3', 'b6', 'b7']);
    expect(changes('phrygian')).toEqual(['b2', 'b3', 'b6', 'b7']);
    expect(changes('locrian')).toEqual(['b2', 'b3', 'b5', 'b6', 'b7']);
    for (const e of ofType<MatchPairsExercise>('match-pairs').filter((x) => /differs from major/.test(plainText(x.prompt)))) {
      for (const p of e.pairs) {
        const mode = Object.keys(NAME).find((k) => NAME[k] === plainText(p.left))!;
        expect(tagged(p.right, 'degree'), plainText(p.left)).toEqual(changes(mode));
      }
    }
    // The card that lists them all.
    const card = lesson('modes-against-major').steps[1] as { body: RichText };
    expect(tagged(card.body, 'degree')).toEqual(['lydian', 'mixolydian', 'dorian', 'minor', 'phrygian', 'locrian'].flatMap(changes));
  });

  it('orders the modes from bright to dark, one lowered note per step', () => {
    const order = ['lydian', 'major', 'mixolydian', 'dorian', 'minor', 'phrygian', 'locrian'];
    const darkness = (m: string): number => getScale(m)!.semitones.reduce((s, x) => s - x, 0);
    for (let i = 1; i < order.length; i++) expect(darkness(order[i]) - darkness(order[i - 1]), order[i]).toBe(1);
    for (const e of ofType<OrderExercise>('order').filter((x) => /brightest/.test(plainText(x.prompt)))) {
      const shown = e.tiles.map((t) => plainText(t));
      expect(shown).toEqual(order.map((m) => NAME[m]).filter((n) => shown.includes(n)));
    }
  });

  it('gives the formulas the facts quote', () => {
    const formula = (id: string): string[] => tagged(unit.lessons.flatMap((l) => l.facts ?? []).find((f) => f.id === id)!.back, 'degree').slice(0, 7);
    expect(formula('modes-dorian-formula')).toEqual(getScale('dorian')!.degrees);
    expect(formula('modes-mixolydian-formula')).toEqual(getScale('mixolydian')!.degrees);
    expect(formula('modes-lydian-formula')).toEqual(getScale('lydian')!.degrees);
    expect(formula('modes-phrygian-formula')).toEqual(getScale('phrygian')!.degrees);
    expect(formula('modes-locrian')).toEqual(getScale('locrian')!.degrees);
  });

  it('spells the modes it writes out', () => {
    expect(scaleNotes('A', 'major')).toEqual(['A', 'B', 'C#', 'D', 'E', 'F#', 'G#']);
    expect(scaleNotes('A', 'mixolydian')).toEqual(['A', 'B', 'C#', 'D', 'E', 'F#', 'G']);
    expect(scaleNotes('E', 'dorian')).toEqual(['E', 'F#', 'G', 'A', 'B', 'C#', 'D']);
    expect(scaleNotes('D', 'mixolydian')).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C']);
    expect(scaleNotes('E', 'mixolydian')).toEqual(['E', 'F#', 'G#', 'A', 'B', 'C#', 'D']);
    expect(scaleNotes('C', 'lydian')).toEqual(['C', 'D', 'E', 'F#', 'G', 'A', 'B']);
    expect(scaleNotes('D', 'lydian')).toEqual(['D', 'E', 'F#', 'G#', 'A', 'B', 'C#']);
    expect(scaleNotes('A', 'phrygian')).toEqual(['A', 'Bb', 'C', 'D', 'E', 'F', 'G']);
    expect(scaleNotes('A', 'dorian')).toEqual(['A', 'B', 'C', 'D', 'E', 'F#', 'G']);
    expect(scaleNotes('B', 'phrygian')).toEqual(['B', 'C', 'D', 'E', 'F#', 'G', 'A']);
    expect(scaleNotes('B', 'locrian')).toEqual(['B', 'C', 'D', 'E', 'F', 'G', 'A']);
    expect(scaleNotes('A', 'lydian')).toEqual(['A', 'B', 'C#', 'D#', 'E', 'F#', 'G#']);
  });
});

describe('modes: characteristic notes, parents and vamps', () => {
  it('types the characteristic note of each mode it asks', () => {
    // Which degree each mode is asked for, by the word in the prompt.
    const asked = ofType<TypeAnswerExercise>('type-answer');
    expect(asked.length).toBe(10);
    for (const e of asked) {
      const prompt = plainText(e.prompt);
      const mode = ['Dorian', 'Mixolydian', 'Lydian', 'Phrygian'].find((m) => prompt.includes(m))!.toLowerCase();
      const tonic = tagged(e.prompt, 'note').at(-1)!;
      const index = { dorian: 5, mixolydian: 6, lydian: 3, phrygian: 1 }[mode]!;
      expect(e.answer.kind === 'note' && e.answer.spelling, prompt).toBe('exact');
      expect(e.answer.value, prompt).toBe(scaleNotes(tonic, mode)[index]);
    }
  });

  it('names each parent scale the way the engine does', () => {
    const parent = (tonic: string, mode: string): string => {
      const degree = MODES.indexOf(mode);
      const majors = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db'];
      return majors.find((m) => scaleNotes(m, 'major')[degree] === tonic && scaleSet(m, 'major') === scaleSet(tonic, mode))!;
    };
    expect(parent('E', 'mixolydian')).toBe('A');
    expect(parent('A', 'dorian')).toBe('G');
    expect(parent('D', 'mixolydian')).toBe('G');
    expect(parent('B', 'phrygian')).toBe('G');
    expect(parent('D', 'lydian')).toBe('A');
    expect(parent('D', 'dorian')).toBe('C');
    // The wrong parents of those questions give the modes their "why" names.
    expect(scaleNotes('D', 'major')[1]).toBe('E'); // E Dorian
    expect(scaleNotes('B', 'major')[3]).toBe('E'); // E Lydian
    expect(scaleNotes('A', 'major')[1]).toBe('B'); // B Dorian
    expect(scaleNotes('E', 'major')[4]).toBe('B'); // B Mixolydian
    expect(scaleNotes('G', 'major')[4]).toBe('D'); // D Mixolydian
    expect(scaleNotes('C', 'major')[1]).toBe('D'); // D Dorian
  });

  it('builds every vamp from the mode\'s own notes, and the wrong vamps from outside notes', () => {
    const fits = (chords: string[], tonic: string, mode: string): boolean =>
      chords.every((c) => chordPcs(c).every((pc) => scalePcs(tonic, mode).includes(pc)));
    expect(fits(['Am7', 'D'], 'A', 'dorian')).toBe(true);
    expect(fits(['Dm', 'G'], 'D', 'dorian')).toBe(true);
    expect(fits(['Em', 'A'], 'E', 'dorian')).toBe(true);
    expect(fits(['A', 'G'], 'A', 'mixolydian')).toBe(true);
    expect(fits(['G', 'F'], 'G', 'mixolydian')).toBe(true);
    expect(fits(['D', 'E'], 'D', 'lydian')).toBe(true);
    expect(fits(['F', 'G'], 'F', 'lydian')).toBe(true);
    expect(fits(['F', 'Em'], 'E', 'phrygian')).toBe(true);
    expect(fits(['Dm', 'Gm'], 'D', 'dorian')).toBe(false);
    expect(fits(['Dm', 'A'], 'D', 'dorian')).toBe(false);
    expect(fits(['G', 'D'], 'G', 'mixolydian')).toBe(false);
    expect(fits(['A', 'E'], 'A', 'mixolydian')).toBe(false);
    expect(fits(['A', 'B'], 'A', 'mixolydian')).toBe(false);
    expect(fits(['A', 'B'], 'A', 'lydian')).toBe(true);
    expect(fits(['Em', 'Am'], 'E', 'dorian')).toBe(false);
    expect(fits(['Gm'], 'F', 'lydian')).toBe(false);
    expect(fits(['F#m'], 'E', 'phrygian')).toBe(false);
    expect(fits(['B'], 'E', 'phrygian')).toBe(false);
    // The chords the vamp cards play.
    const vamps = unit.lessons.flatMap((l) => l.steps).flatMap((s) => (!isGenerated(s) && s.type === 'card' && s.figure?.kind === 'audio' && s.figure.sound.kind === 'progression' ? [s.figure.sound.chords] : []));
    expect(vamps).toEqual([['Am7', 'D', 'Am7', 'D'], ['A', 'G', 'A', 'G'], ['D', 'E', 'D', 'E'], ['F', 'Em', 'F', 'Em']]);
  });

  it('fits the seventh chords it pairs with Mixolydian and Locrian', () => {
    const inMode = (chord: string, tonic: string, mode: string): boolean => chordPcs(chord).every((pc) => scalePcs(tonic, mode).includes(pc));
    expect(inMode('G7', 'G', 'mixolydian')).toBe(true);
    expect(inMode('E7', 'E', 'mixolydian')).toBe(true);
    for (const c of ['Emaj7', 'Em7', 'Em7b5']) expect(inMode(c, 'E', 'mixolydian'), c).toBe(false);
    expect(inMode('Bm7b5', 'B', 'locrian')).toBe(true);
    expect(chordNotes('Bdim')).toEqual(['B', 'D', 'F']);
    expect(inMode('Bdim', 'B', 'locrian')).toBe(true);
    for (const c of ['Bm7', 'B7', 'Bmaj7']) expect(inMode(c, 'B', 'locrian'), c).toBe(false);
    // The tritone of Lydian: the #4 is six half steps above the tonic.
    for (const t of ['D', 'F', 'G', 'C']) expect((scalePcs(t, 'lydian')[3] - scalePcs(t, 'lydian')[0] + 12) % 12).toBe(6);
  });
});

describe('modes: the pictures on the neck', () => {
  /** A fretboard figure that should show every note of the mode inside its frets. */
  const complete = (figure: FretboardFigure, tonic: string, mode: string): void => {
    const drawn = figure.dots!.map((d) => `${d.string}:${d.fret}`).sort();
    const want = scalePositions(tonic, mode, { minFret: figure.frets![0], maxFret: figure.frets![1] }).map((n) => `${n.string}:${n.fret}`).sort();
    expect(drawn, `${tonic} ${mode}`).toEqual(want);
  };
  const cardFigure = (id: string, index: number): FretboardFigure => (lesson(id).steps[index] as { figure: FretboardFigure }).figure;

  it('draws whole positions', () => {
    complete(cardFigure('dorian', 0), 'A', 'dorian');
    complete(cardFigure('mixolydian', 0), 'A', 'mixolydian');
    complete(cardFigure('phrygian-and-locrian', 0), 'E', 'phrygian');
    complete(cardFigure('hearing-the-modes', 0), 'A', 'dorian');
  });

  it('draws the one-octave shapes note for note', () => {
    expect(cardFigure('modes-against-major', 0).dots!.map((d) => midiAt(d))).toEqual(scaleMidi(45, 'major'));
    expect(cardFigure('modes-against-major', 5).dots!.map((d) => midiAt(d))).toEqual(scaleMidi(45, 'mixolydian'));
    expect(cardFigure('lydian', 0).dots!.map((d) => midiAt(d))).toEqual(scaleMidi(50, 'lydian'));
  });

  it('marks the characteristic notes and nothing else', () => {
    const marked = (f: FretboardFigure): number[] => [...new Set(f.dots!.filter((d) => d.role === 'target').map((d) => midiAt(d) % 12))];
    expect(marked(cardFigure('dorian', 0))).toEqual([6]); // F#
    expect(marked(cardFigure('mixolydian', 0))).toEqual([7]); // G
    expect(marked(cardFigure('lydian', 0))).toEqual([8]); // G#
    expect(marked(cardFigure('phrygian-and-locrian', 0))).toEqual([5]); // F
    expect(marked(cardFigure('modes-against-major', 5))).toEqual([7]); // G
  });

  it('asks for the frets that are really there', () => {
    const finds = ofType<FretboardFindExercise>('fretboard-find');
    expect(finds.length).toBe(3);
    const where = (note: string, lo: number, hi: number, strings?: number[]) =>
      positionsForNote(note, { minFret: lo, maxFret: hi }).filter((p) => !strings || strings.includes(p.string)).map((p) => `${p.string}:${p.fret}`).sort();
    expect(where('F#', 4, 8)).toEqual(['2:7', '4:4']);
    expect(where('G', 4, 8)).toEqual(['2:8', '4:5']);
    expect(where('G#3', 3, 8, [4])).toEqual(['4:6']);
    // A tritone above the D at string 5, fret 5.
    expect(midiAt({ string: 4, fret: 6 }) - midiAt({ string: 5, fret: 5 })).toBe(6);
  });
});

describe('modes: what every "over a drone" sound plays', () => {
  const tabSounds = (): Array<{ notes: TabNote[]; answer: string | null }> => {
    const out: Array<{ notes: TabNote[]; answer: string | null }> = [];
    for (const e of allExercises().filter((x): x is ListenChoiceExercise => x.type === 'listen-choice')) {
      if (e.sound.kind === 'tab') out.push({ notes: e.sound.notes, answer: correctText(e) });
    }
    for (const s of unit.lessons.flatMap((l) => l.steps)) {
      if (!isGenerated(s) && s.type === 'card' && s.figure?.kind === 'audio' && s.figure.sound.kind === 'tab') out.push({ notes: s.figure.sound.notes, answer: null });
    }
    return out;
  };

  /** A drone passage: 16 notes, the even ones all the drone. Returns its drone and mode, or null. */
  const droneMode = (pitches: number[]): { drone: number; mode: string } | null => {
    if (pitches.length !== 16 || !pitches.filter((_m, i) => i % 2 === 0).every((m) => m === pitches[0])) return null;
    const melody = pitches.filter((_m, i) => i % 2 === 1);
    const mode = MODES.find((m) => scaleMidi(melody[0], m).join() === melody.join());
    return mode && melody[0] % 12 === pitches[0] % 12 ? { drone: pitches[0], mode } : null;
  };

  it('strikes the drone, then the next note of one mode, sixteen times', () => {
    const sounds = tabSounds();
    expect(sounds.length).toBe(14);
    for (const { notes, answer } of sounds) {
      const pitches = notes.map(midiOf);
      const one = droneMode(pitches);
      if (one) {
        if (answer) expect(answer.startsWith(NAME[one.mode]), `${answer} is ${one.mode}`).toBe(true);
      } else if (pitches.length === 32) {
        // Same notes, new home: C Ionian over a low C, then D Dorian over the open D.
        expect(droneMode(pitches.slice(0, 16))).toEqual({ drone: 48, mode: 'major' });
        expect(droneMode(pitches.slice(16))).toEqual({ drone: 50, mode: 'dorian' });
        expect(scaleSet('C', 'major')).toBe(scaleSet('D', 'dorian'));
      } else {
        // The bright-to-dark card: Lydian up, then Phrygian up, from A3.
        expect(pitches).toEqual([...scaleMidi(57, 'lydian'), ...scaleMidi(57, 'phrygian')]);
      }
    }
  });

  it('plays each drone where a guitarist can let it ring: an open string, or the low C at string 5, fret 3', () => {
    for (const { notes } of tabSounds()) {
      const pitches = notes.map(midiOf);
      if (!droneMode(pitches.slice(0, 16))) continue;
      const first = notes[0];
      if (!('string' in first)) throw new Error('a rest');
      expect(first.fret === 0 || (first.string === 5 && first.fret === 3), JSON.stringify(first)).toBe(true);
      // The melody stays on thinner strings than the drone, so the drone string is free to ring.
      for (const n of notes.slice(0, 16).filter((_n, i) => i % 2 === 1)) if ('string' in n) expect(n.string).toBeLessThan(first.string);
    }
    // And soundPlan plays it as written.
    const q = allExercises().find((x): x is ListenChoiceExercise => x.type === 'listen-choice')!;
    expect(soundPlan(q.sound).events.length).toBe(16);
  });
});

describe('modes: the phrases', () => {
  const phrases = ofType<PlayPhraseExercise>('play-phrase');

  it('Dorian: stays in A Dorian and leans on F sharp', () => {
    const dorian = phrases.find((p) => /F#|leans/.test(JSON.stringify(p.prompt)))!;
    const pitches = dorian.notes.map(midiOf);
    for (const m of pitches) expect(scalePcs('A', 'dorian')).toContain(m % 12);
    expect(pitches.filter((m) => m % 12 === 6).length).toBeGreaterThanOrEqual(2);
    expect(pitches[0] % 12).toBe(9);
    expect(pitches.at(-1)! % 12).toBe(9);
    // Four full bars of 4/4.
    const beats: Record<string, number> = { q: 1, h: 2, w: 4 };
    expect(dorian.notes.reduce((s, n) => s + beats[n.duration], 0)).toBe(16);
  });

  it('Mixolydian: the open A, then A Mixolydian from A3 to A4', () => {
    const mixo = phrases.find((p) => /Mixolydian/.test(JSON.stringify(p.prompt)))!;
    const pitches = mixo.notes.map(midiOf);
    expect(pitches[0]).toBe(45);
    expect(pitches.slice(1)).toEqual(scaleMidi(57, 'mixolydian'));
    const order = mixo.alternative as OrderExercise;
    expect(order.tiles.map((t) => tagged(t, 'note')[0])).toEqual(scaleNotes('A', 'mixolydian'));
    expect(scalePcs('A', 'mixolydian')).not.toContain(8); // no G#
    // The fret the explanation names: G at string 1, fret 3; A at fret 5.
    expect(midiAt({ string: 1, fret: 3 }) % 12).toBe(7);
    expect(midiAt({ string: 1, fret: 5 })).toBe(69);
  });

  it('lets every phrase be tapped instead', () => {
    expect(phrases.length).toBe(2);
    for (const p of phrases) expect(['fretboard-find', 'order']).toContain((p.alternative as Exercise).type);
  });
});

describe('modes: on the go', () => {
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
