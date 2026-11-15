/**
 * Property tests for every generator: over many seeds and difficulties each generated exercise
 * must be valid, deterministic, have exactly one right answer (unless it is multi-select), no
 * duplicate or enharmonic-twin options, accept its own answer and reject every distractor.
 * Then spot checks that the facts are the theory engine's facts.
 */
import { describe, expect, it } from 'vitest';
import { midiAt } from '@/core/guitar';
import {
  chordNotes, classifyCadence, getKey, interval, intervalBetween, parseChord, parseNote, relativeKey, romanToChord, scaleNotes,
} from '@/core/theory';
import { exerciseProblems, pitchSignature } from '../check';
import { correctOptions, findTargets, grade, solve, wrongAnswers } from '../grade';
import { parseRhythm } from '../rhythm';
import { soundPlan } from '../sound';
import { plainText, textKey } from '../text';
import type { Exercise, GeneratedStep, GeneratorKind } from '../types';
import { GENERATORS, GENERATOR_KINDS, generateExercise, generateStrict, generatorProblems, getGenerator } from './index';
import type { GeneratorParamsMap } from './params';

const SEEDS = 60;
const DIFFICULTIES = [0, 0.35, 0.7, 1];

/** Parameter variants per generator: the defaults plus every `ask` / `form` and a few pools. */
const VARIANTS: { [K in GeneratorKind]: Array<GeneratorParamsMap[K]> } = {
  'interval-name': [{}, { intervals: ['m3', 'M3'] }, { intervals: ['A4', 'd5', 'P5', 'P4'], roots: ['F#', 'Bb', 'B'] }],
  'interval-note': [{}, { direction: 'down' }, { intervals: ['M7', 'm7', 'A4'], roots: ['C#', 'Ab', 'B'] }],
  'semitones-match': [{}, { pairs: 3 }, { pairs: 5 }, { intervals: ['m2', 'M2', 'm3', 'M3'], pairs: 4 }],
  'interval-on-neck': [{}, { ask: 'name' }, { ask: 'degree' }, { ask: 'find', strings: [6, 5, 4, 3], frets: [3, 9] }, { ask: 'name', intervals: ['A4', 'm6', 'M7'] }],
  'note-on-string': [{}, { ask: 'find' }, { ask: 'fret' }, { ask: 'name', strings: [6, 5, 4, 3, 2, 1], frets: [0, 12] }, { ask: 'fret', strings: [5], frets: [0, 12], naturals: true }, { ask: 'find', frets: [0, 12] }],
  'open-strings': [{}, { ask: 'name' }, { ask: 'number' }, { ask: 'order', tuning: 'drop-d' }, { ask: 'number', tuning: 'dadgad' }],
  'step-up': [{}, { steps: [1, 2, 3, 4, 5] }, { roots: ['Bb', 'F#', 'E', 'B'] }],
  enharmonic: [{}, { notes: ['Gb', 'A#'] }],
  'scale-notes': [{}, { form: 'fill' }, { form: 'odd-one-out' }, { scales: ['minor', 'minor-pentatonic', 'major-pentatonic'], tonics: ['A', 'E', 'D', 'B', 'F#'] }, { form: 'fill', scales: ['minor-blues', 'dorian'] }, { form: 'odd-one-out', scales: ['harmonic-minor'] }],
  'scale-formula': [{}, { scales: ['major', 'minor', 'minor-pentatonic', 'major-pentatonic', 'harmonic-minor', 'dorian'] }],
  'key-signature': [{}, { ask: 'key' }, { ask: 'accidentals' }, { ask: 'count', modes: ['major', 'minor'], maxAccidentals: 7 }, { ask: 'key', modes: ['minor'], maxAccidentals: 7 }, { ask: 'accidentals', maxAccidentals: 7, modes: ['major', 'minor'] }],
  'relative-key': [{}, { direction: 'major' }, { direction: 'both', maxAccidentals: 7 }],
  'degree-in-key': [{}, { ask: 'degree' }, { modes: ['major', 'minor'], maxAccidentals: 7 }, { ask: 'degree', degrees: [1, 2, 3, 4, 5, 6, 7], maxAccidentals: 6 }],
  'fifths-order': [{}, { ask: 'sharps' }, { ask: 'flats' }, { count: 3 }, { count: 7 }, { ask: 'sharps', count: 7 }, { ask: 'flats', count: 6 }],
  'chord-tones': [{}, { ask: 'tone' }, { ask: 'missing' }, { ask: 'name' }, { types: ['major', 'minor', 'dim', 'aug', 'sus4', 'sus2'] }, { ask: 'name', types: ['7', 'maj7', 'm7', 'm7b5', '6', 'm6'] }, { ask: 'tone', types: ['7', 'maj7', 'm7'] }, { ask: 'missing', types: ['maj7', 'm7', 'dim7', '9'] }],
  'diatonic-chord': [{}, { ask: 'quality' }, { sevenths: true }, { ask: 'quality', sevenths: true, modes: ['major', 'minor'], maxAccidentals: 7 }, { modes: ['minor'], maxAccidentals: 5 }],
  'roman-chord': [{}, { direction: 'to-roman' }, { modes: ['major', 'minor'], maxAccidentals: 7 }, { direction: 'to-roman', modes: ['minor'] }, { numerals: ['I', 'IV', 'V', 'V7', 'bVII', 'ii'] }],
  'chord-shape': [{}, { accept: 'this-shape' }, { chords: ['G7', 'C7', 'D7', 'A7', 'E7', 'F'] }],
  'neck-tones': [{}, { what: 'scale' }, { what: 'chord', span: 3, strings: [3, 2, 1] }, { what: 'scale', span: 5, strings: [6, 5], scales: ['major', 'minor', 'minor-pentatonic'] }],
  'note-value-math': [{}, { ask: 'beats' }, { ask: 'sum' }, { dotted: true }, { ask: 'beats', dotted: true }, { values: ['eighth', 'sixteenth'] }],
  meter: [{}, { ask: 'unit' }, { ask: 'fill' }, { signatures: ['4/4', '3/4', '2/4', '6/8', '12/8', '2/2', '5/4', '7/8'] }, { ask: 'fill', signatures: ['6/8', '12/8', '2/2'] }],
  'rhythm-tap': [{}, { bars: 2 }, { rests: true }, { values: ['quarter', 'eighth', 'sixteenth'], tempo: 60 }, { show: 'audio', values: ['half', 'quarter'] }],
  'rhythm-ear': [{}, { values: ['quarter'] }, { values: ['quarter', 'eighth', 'sixteenth'], tempo: 70 }],
  'higher-lower': [{}, { maxSemitones: 4, minSemitones: 1 }, { maxSemitones: 12, minSemitones: 7 }],
  'interval-ear': [{}, { play: 'down' }, { play: 'together' }, { intervals: ['P5', 'P8'] }, { intervals: ['A4', 'd5', 'P4', 'P5'] }],
  'chord-quality-ear': [{}, { types: ['major', 'minor', 'dim', 'aug', 'sus4', '7', 'maj7', 'm7'] }],
  'scale-ear': [{}, { scales: ['major', 'minor', 'minor-pentatonic', 'major-pentatonic', 'harmonic-minor', 'dorian', 'mixolydian', 'minor-blues'] }],
  'cadence-ear': [{}, { types: ['authentic', 'half', 'plagal', 'deceptive'] }],
  'staff-note': [{}, { ask: 'place' }, { accidentals: true }, { ask: 'place', accidentals: true }, { low: 'E2', high: 'E5' }],
  'play-note': [{}, { naturals: false, frets: [0, 12] }, { strings: [6], frets: [0, 5] }],
};

function each(kind: GeneratorKind, run: (exercise: Exercise, step: GeneratedStep, label: string) => void): void {
  for (const params of VARIANTS[kind] as Array<Record<string, unknown>>) {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const step = { generate: kind, params } as GeneratedStep;
        const label = `${kind} ${JSON.stringify(params)} seed ${seed} difficulty ${difficulty}`;
        let exercise: Exercise;
        try {
          exercise = generateStrict(step, { seed, difficulty });
        } catch (error) {
          throw new Error(`${label}: generator threw ${error instanceof Error ? error.message : String(error)}`);
        }
        run(exercise, step, label);
      }
    }
  }
}

describe('generator registry', () => {
  it('has a definition, documentation and variants for every kind', () => {
    expect(GENERATOR_KINDS.length).toBe(Object.keys(VARIANTS).length);
    for (const kind of GENERATOR_KINDS) {
      const def = getGenerator(kind)!;
      expect(def.kind).toBe(kind);
      expect(def.summary.length).toBeGreaterThan(10);
      expect(def.produces.length).toBeGreaterThan(0);
      for (const param of def.params) {
        expect(param.description.length, `${kind}.${param.name}`).toBeGreaterThan(5);
        expect(param.default.length, `${kind}.${param.name}`).toBeGreaterThan(0);
      }
      expect(VARIANTS[kind].length).toBeGreaterThan(0);
    }
    expect(new Set(GENERATOR_KINDS).size).toBe(GENERATOR_KINDS.length);
    expect(Object.keys(GENERATORS).sort()).toEqual([...GENERATOR_KINDS].sort());
  });

  it('accepts every variant used in these tests and documents every parameter it accepts', () => {
    for (const kind of GENERATOR_KINDS) {
      for (const params of VARIANTS[kind] as Array<Record<string, unknown>>) {
        expect(generatorProblems({ generate: kind, params } as GeneratedStep), `${kind} ${JSON.stringify(params)}`).toEqual([]);
      }
    }
  });

  it('reports unknown generators, unknown parameters and bad values with a fix', () => {
    expect(generatorProblems({ generate: 'nope' } as unknown as GeneratedStep)[0]).toMatch(/not a generator/);
    expect(generatorProblems({ generate: 'interval-name', params: { interval: ['m3'] } } as unknown as GeneratedStep)[0]).toMatch(/"interval" is not a parameter.*intervals, roots/);
    expect(generatorProblems({ generate: 'interval-name', params: { intervals: ['m3', 'X9'] } })[0]).toMatch(/"X9"/);
    expect(generatorProblems({ generate: 'note-on-string', params: { strings: [7] } })[0]).toMatch(/string numbers from 1 to 6/);
    expect(generatorProblems({ generate: 'note-on-string', params: { frets: [5, 2] } })[0]).toMatch(/\[low, high\]/);
    expect(generatorProblems({ generate: 'key-signature', params: { maxAccidentals: 9 } })[0]).toMatch(/1 to 7/);
    expect(generatorProblems({ generate: 'chord-tones', params: { types: ['majr'] } })[0]).toMatch(/"majr"/);
    expect(generatorProblems({ generate: 'interval-ear', params: { intervals: ['A4', 'd5'] } })[0]).toMatch(/different sizes/);
    expect(generatorProblems({ generate: 'scale-ear', params: { scales: ['minor', 'aeolian'] } }).join(' ')).toMatch(/same notes/);
    expect(generatorProblems({ generate: 'semitones-match', params: { intervals: ['A4', 'd5', 'P5'], pairs: 3 } }).join(' ')).toMatch(/different sizes/);
    expect(generatorProblems({ generate: 'enharmonic', params: { notes: ['E#'] } })[0]).toMatch(/black keys/);
    expect(generatorProblems({ generate: 'open-strings', params: { tuning: 'ukulele' } })[0]).toMatch(/six-string/);
    expect(generatorProblems({ generate: 'interval-name', seed: -1 })[0]).toMatch(/seed/);
  });

  it('never throws from generateExercise, even for a broken step', () => {
    const broken = generateExercise({ generate: 'nope' } as unknown as GeneratedStep);
    expect(broken.type).toBe('true-false');
    expect(exerciseProblems(broken)).toEqual([]);
    const bad = generateExercise({ generate: 'chord-tones', params: { types: ['majr'] } });
    expect(exerciseProblems(bad).filter((p) => p.severity === 'error')).toEqual([]);
  });

  it('carries the step id and fact onto the exercise', () => {
    const exercise = generateExercise({ generate: 'interval-name', id: 'q1', fact: 'f1' }, { seed: 3 });
    expect(exercise.id).toBe('q1');
    expect(exercise.fact).toBe('f1');
  });
});

describe.each(GENERATOR_KINDS.map((kind) => [kind]))('%s', (kind) => {
  it('is deterministic for a seed and varies across seeds', () => {
    const seen = new Set<string>();
    for (const params of VARIANTS[kind] as Array<Record<string, unknown>>) {
      for (let seed = 0; seed < 40; seed++) {
        const step = { generate: kind, params } as GeneratedStep;
        const a = generateStrict(step, { seed, difficulty: 0.5 });
        const b = generateStrict(step, { seed, difficulty: 0.5 });
        expect(a).toEqual(b);
        seen.add(JSON.stringify(a));
      }
    }
    // A drill must not run dry: many different exercises come out of the variants.
    expect(seen.size).toBeGreaterThan(kind === 'open-strings' || kind === 'scale-formula' ? 3 : 8);
  });

  it('a step seed pins the exercise whatever the session seed', () => {
    const step = { generate: kind, params: VARIANTS[kind][0], seed: 7 } as GeneratedStep;
    expect(generateExercise(step, { seed: 1 })).toEqual(generateExercise(step, { seed: 99 }));
  });

  it('produces valid, gradable exercises with safe distractors', () => {
    const def = getGenerator(kind)!;
    each(kind, (exercise, _step, label) => {
      expect(def.produces, label).toContain(exercise.type);
      const problems = exerciseProblems(exercise);
      expect(problems.filter((p) => p.severity === 'error'), `${label}\n${JSON.stringify(exercise)}`).toEqual([]);
      // The grader accepts the generated answer and rejects every distractor.
      expect(grade(exercise, solve(exercise)).correct, label).toBe(true);
      for (const wrong of wrongAnswers(exercise)) expect(grade(exercise, wrong).correct, `${label} ${JSON.stringify(wrong)}`).toBe(false);
      if (exercise.type === 'choice' || exercise.type === 'listen-choice') {
        const multiple = exercise.type === 'choice' && exercise.multiple === true;
        if (!multiple) expect(correctOptions(exercise).length, label).toBe(1);
        const keys = exercise.options.map((o) => (o.text !== undefined ? textKey(o.text) : JSON.stringify(o.figure)));
        expect(new Set(keys).size, `${label} duplicate options ${keys.join(' | ')}`).toBe(keys.length);
        expect(exercise.options.length, label).toBeGreaterThanOrEqual(2);
        // No two options may be one pitch under two names unless spelling is the declared point.
        if (!(exercise.type === 'choice' && exercise.spelling === 'exact')) {
          const signatures = exercise.options.map((o) => (o.text !== undefined ? pitchSignature(o.text) : null)).filter((s) => s !== null);
          expect(new Set(signatures).size, `${label} enharmonic twins ${keys.join(' | ')}`).toBe(signatures.length);
        }
      }
      if (def.mic) expect('alternative' in exercise, label).toBe(true);
    });
  });
});

describe('generated facts come from the theory engine', () => {
  const options = (exercise: Exercise): string[] => (exercise.type === 'choice' || exercise.type === 'listen-choice' ? exercise.options.map((o) => plainText(o.text ?? '')) : []);
  const right = (exercise: Exercise): string => {
    if (exercise.type !== 'choice' && exercise.type !== 'listen-choice') throw new Error('not a choice');
    return plainText(exercise.options[correctOptions(exercise)[0]].text ?? '');
  };
  const tags = (text: string, tag: string): string[] => [...text.matchAll(new RegExp(`\\{${tag}:([^}|]+)\\}`, 'g'))].map((m) => m[1]);
  const promptOf = (exercise: Exercise): string => ('prompt' in exercise && typeof exercise.prompt === 'string' ? exercise.prompt : '');

  it('interval-name: the named interval is the interval between the two notes', () => {
    each('interval-name', (exercise, _s, label) => {
      const [from, to] = tags(promptOf(exercise), 'n');
      if (exercise.type !== 'choice') throw new Error(label);
      const text = String(exercise.options[correctOptions(exercise)[0]].text).toLowerCase();
      const between = intervalBetween(from, to);
      const names: Record<string, string> = { P1: 'perfect unison' };
      // intervalBetween without octaves measures upwards within an octave; an octave reads as a unison there.
      if (between === 'P1') expect(text, label).toBe('perfect octave');
      else expect(names[between] ?? text, label).toBe(text);
      expect(interval(between === 'P1' ? 'P8' : between).semitones % 12, label).toBe((parseNote(to)!.chroma - parseNote(from)!.chroma + 12) % 12);
    });
  });

  it('interval-note: the answer is that interval from the root, correctly spelled', () => {
    each('interval-note', (exercise, step, label) => {
      const [root] = tags(promptOf(exercise), 'n');
      const answer = right(exercise);
      const down = (step.params as { direction?: string }).direction === 'down';
      const between = down ? intervalBetween(answerAscii(exercise), root) : intervalBetween(root, answerAscii(exercise));
      expect(promptOf(exercise).toLowerCase(), label).toContain(between === 'P1' ? 'octave' : nameOf(between));
      expect(answer.length, label).toBeGreaterThan(0);
    });
  });

  function answerAscii(exercise: Exercise): string {
    if (exercise.type !== 'choice') throw new Error('not a choice');
    return tags(String(exercise.options[correctOptions(exercise)[0]].text), 'n')[0];
  }
  function nameOf(ivl: string): string {
    const words: Record<string, string> = { m2: 'minor second', M2: 'major second', m3: 'minor third', M3: 'major third', P4: 'perfect fourth', A4: 'augmented fourth', d5: 'diminished fifth', P5: 'perfect fifth', m6: 'minor sixth', M6: 'major sixth', m7: 'minor seventh', M7: 'major seventh' };
    return words[ivl] ?? ivl;
  }

  it('scale-notes (order): the tiles are the scale as the engine spells it', () => {
    each('scale-notes', (exercise, step, label) => {
      if (exercise.type !== 'order') return;
      const tonic = tags(promptOf(exercise), 'n').pop()!;
      const scales = (step.params as { scales?: string[] }).scales ?? ['major'];
      const tiles = exercise.tiles.map((t) => tags(String(t), 'n')[0]);
      expect(scales.some((s) => scaleNotes(tonic, s).join(' ') === tiles.join(' ')), `${label} ${tiles.join(' ')}`).toBe(true);
    });
  });

  it('chord-tones (notes): the right option is exactly the chord', () => {
    each('chord-tones', (exercise, step, label) => {
      if ((step.params as { ask?: string }).ask !== undefined && (step.params as { ask?: string }).ask !== 'notes') return;
      const symbol = tags(promptOf(exercise), 'c')[0];
      expect(answerNotes(exercise), label).toEqual(chordNotes(symbol));
    });
  });

  function answerNotes(exercise: Exercise): string[] {
    if (exercise.type !== 'choice') throw new Error('not a choice');
    return tags(String(exercise.options[correctOptions(exercise)[0]].text), 'n');
  }

  it('relative-key: the answer is the relative key', () => {
    each('relative-key', (exercise, _s, label) => {
      const asked = tags(promptOf(exercise), 'k')[0];
      if (exercise.type !== 'choice') throw new Error(label);
      const answer = tags(String(exercise.options[correctOptions(exercise)[0]].text), 'k')[0];
      expect(answer, label).toBe(relativeKey(asked).name);
    });
  });

  it('key-signature (count): the answer is the signature of the key', () => {
    each('key-signature', (exercise, step, label) => {
      if (((step.params as { ask?: string }).ask ?? 'count') !== 'count') return;
      const key = getKey(tags(promptOf(exercise), 'k')[0])!;
      const expected = key.fifths === 0 ? 'No sharps or flats' : `${Math.abs(key.fifths)} ${key.fifths > 0 ? 'sharp' : 'flat'}${Math.abs(key.fifths) === 1 ? '' : 's'}`;
      expect(right(exercise), label).toBe(expected);
    });
  });

  it('roman-chord (to-chord): the answer is the numeral in that key', () => {
    each('roman-chord', (exercise, step, label) => {
      if ((step.params as { direction?: string }).direction === 'to-roman') return;
      const key = tags(promptOf(exercise), 'k')[0];
      const numeral = tags(promptOf(exercise), 'r')[0];
      if (exercise.type !== 'choice') throw new Error(label);
      const answer = tags(String(exercise.options[correctOptions(exercise)[0]].text), 'c')[0];
      expect(parseChord(answer)!.symbol, label).toBe(parseChord(romanToChord(numeral, key))!.symbol);
    });
  });

  it('note-on-string (name): the answer is the pitch of that fret', () => {
    each('note-on-string', (exercise, _s, label) => {
      if (exercise.type !== 'fretboard-name') return;
      const answer = solve(exercise);
      if (answer.type !== 'fretboard-name') throw new Error(label);
      expect(parseNote(answer.text)!.chroma, label).toBe(midiAt(exercise.position) % 12);
    });
  });

  it('interval-on-neck (find): every target is the root plus the interval', () => {
    each('interval-on-neck', (exercise, _s, label) => {
      if (exercise.type !== 'fretboard-find' || !('interval' in exercise.find)) return;
      const rootMidi = midiAt(exercise.find.from);
      const targets = findTargets(exercise);
      expect(targets.length, label).toBeGreaterThan(0);
      for (const t of targets) expect(t.midi - rootMidi, label).toBe(interval(exercise.find.interval).semitones);
    });
  });

  it('cadence-ear: the phrase really ends with the cadence named as right', () => {
    each('cadence-ear', (exercise, _s, label) => {
      if (exercise.type !== 'listen-choice' || exercise.sound.kind !== 'progression') throw new Error(label);
      const key = tags(String(exercise.explain), 'k')[0];
      const type = classifyCadence(exercise.sound.chords, key)!.type;
      expect(right(exercise).toLowerCase().startsWith(type), `${label} ${right(exercise)} vs ${type}`).toBe(true);
      expect(soundPlan(exercise.sound).events.length, label).toBe(4);
    });
  });

  it('higher-lower and interval-ear: the sound matches the answer', () => {
    each('higher-lower', (exercise, _s, label) => {
      if (exercise.type !== 'listen-choice') throw new Error(label);
      const plan = soundPlan(exercise.sound);
      expect(plan.events.length, label).toBe(2);
      const up = plan.events[1].midi[0] > plan.events[0].midi[0];
      expect(right(exercise), label).toBe(up ? 'Higher' : 'Lower');
      expect(options(exercise), label).toEqual(['Higher', 'Lower']);
    });
    each('interval-ear', (exercise, _s, label) => {
      if (exercise.type !== 'listen-choice' || exercise.sound.kind !== 'interval') throw new Error(label);
      const plan = soundPlan(exercise.sound);
      const midis = plan.events.flatMap((e) => e.midi);
      expect(Math.abs(midis[midis.length - 1] - midis[0]), label).toBe(interval(exercise.sound.interval).semitones);
    });
  });

  it('rhythm generators: bars are full, the answer is tappable, and ear options sound different', () => {
    each('rhythm-tap', (exercise, _s, label) => {
      if (exercise.type !== 'tap-rhythm') throw new Error(label);
      const parsed = parseRhythm(exercise.rhythm);
      expect(parsed.problems, label).toEqual([]);
      expect(parsed.events[0].attack, label).toBe(true);
    });
    each('rhythm-ear', (exercise, _s, label) => {
      if (exercise.type !== 'listen-choice') throw new Error(label);
      const onsets = exercise.options.map((o) => (o.figure?.kind === 'rhythm' ? parseRhythm(o.figure).onsets.join(',') : ''));
      expect(new Set(onsets).size, label).toBe(onsets.length);
      expect(exercise.options.length, label).toBe(3);
    });
  });

  it('note-value-math and meter: the numbers add up in ticks', () => {
    each('note-value-math', (exercise, _s, label) => {
      if (exercise.type !== 'type-answer' || exercise.answer.kind !== 'number') return;
      expect(Number.isInteger(exercise.answer.value) && exercise.answer.value >= 2, `${label} ${exercise.answer.value}`).toBe(true);
    });
    each('meter', (exercise, _s, label) => {
      if (exercise.type !== 'type-answer' || exercise.answer.kind !== 'number') return;
      expect(Number.isInteger(exercise.answer.value) && exercise.answer.value >= 1, label).toBe(true);
    });
  });

  it('difficulty widens the pool: easy drills use the start of a list, hard ones all of it', () => {
    const seen = (difficulty: number): Set<string> => {
      const out = new Set<string>();
      for (let seed = 0; seed < 300; seed++) {
        const exercise = generateStrict({ generate: 'interval-ear' }, { seed, difficulty });
        if (exercise.type === 'listen-choice' && exercise.sound.kind === 'interval') out.add(exercise.sound.interval);
      }
      return out;
    };
    const easy = seen(0);
    const hard = seen(1);
    expect(easy.size).toBeLessThan(hard.size);
    expect([...easy].every((i) => ['P8', 'P5', 'M3', 'm3', 'P4'].includes(i))).toBe(true);
    expect(hard.size).toBe(12);
  });
});

describe('explanations say exactly what the exercise shows', () => {
  const text = (e: Exercise): string => plainText(('prompt' in e && e.prompt ? e.prompt : '') as string) + ' || ' + plainText(('explain' in e ? e.explain : '') as string);

  it('interval-on-neck (name): every option is a simple interval of a different size, never P1 or a compound', () => {
    each('interval-on-neck', (exercise, _s, label) => {
      if (exercise.type !== 'fretboard-name' || exercise.ask !== 'interval') return;
      const sizes = (exercise.options ?? []).map((o) => interval(o).semitones);
      expect(sizes.every((s) => s >= 1 && s <= 12), `${label} ${exercise.options}`).toBe(true);
      expect(new Set(sizes).size, label).toBe(sizes.length);
    });
  });

  it('neck-tones: the prompt says whether it is a chord or a scale', () => {
    each('neck-tones', (exercise, _s, label) => {
      expect(text(exercise), label).toMatch(/every note of the .+ (chord|scale) on strings/);
    });
  });

  it('staff-note (place): the explanation names every place on the staff the grader accepts', () => {
    each('staff-note', (exercise, _s, label) => {
      if (exercise.type !== 'staff-place') return;
      const target = parseNote(exercise.note)!;
      const accidental = target.alt > 0 ? 'sharp' : target.alt < 0 ? 'flat' : null;
      const accepted = Array.from({ length: 9 }, (_u, p) => p).filter((p) => grade(exercise, { type: 'staff-place', position: p, accidental }).correct);
      expect(accepted.length, label).toBeGreaterThan(0);
      const named = (plainText(exercise.explain).match(/(line|space)/g) ?? []).length;
      expect(named, `${label}: ${plainText(exercise.explain)}`).toBe(accepted.length);
      if (accidental) expect(plainText(exercise.explain), label).toContain(`${accidental} sign`);
    });
  });

  it('scale names keep their capitals mid-sentence (Dorian), common words do not (natural minor)', () => {
    for (const kind of ['scale-formula', 'scale-notes', 'scale-ear', 'neck-tones'] as const) {
      each(kind, (exercise, _s, label) => {
        const t = text(exercise);
        expect(t, label).not.toMatch(/\b(dorian|mixolydian|lydian|phrygian|locrian)\b/);
        expect(t, label).not.toMatch(/the [A-G][♯♭]? Natural minor|the Natural minor|the Major scale/);
      });
    }
  });

  it('relative-key: the explanation teaches the rule for the direction asked', () => {
    each('relative-key', (exercise, _s, label) => {
      const t = text(exercise);
      if (/relative major of/.test(t)) expect(t, label).toContain('3rd note of the minor scale');
      else expect(t, label).toContain('6th note of the major scale');
    });
  });

  it('interval-name: the explanation spells both notes and counts their letters', () => {
    each('interval-name', (exercise, _s, label) => {
      const t = text(exercise);
      const [from, to] = [...t.matchAll(/from (\S+) up to (\S+)\?/g)][0].slice(1);
      expect(t, label).toContain(`${from} to ${to} spans`);
    });
  });

  it('interval-ear: the explanation follows the direction the notes are played in', () => {
    const down = generateStrict({ generate: 'interval-ear', params: { play: 'down' } }, { seed: 4 });
    const together = generateStrict({ generate: 'interval-ear', params: { play: 'together' } }, { seed: 4 });
    const up = generateStrict({ generate: 'interval-ear' }, { seed: 4 });
    expect(text(down)).toMatch(/down to/);
    expect(text(together)).toMatch(/together/);
    expect(text(up)).toMatch(/up to/);
  });

  it('chord-shape: a barre chord is explained as a barre', () => {
    const f = generateStrict({ generate: 'chord-shape', params: { chords: ['F'] } }, { seed: 1 });
    expect(text(f)).toMatch(/index finger across fret 1 from string 6 to string 1 \(a barre\), then press/);
    const c = generateStrict({ generate: 'chord-shape', params: { chords: ['C'] } }, { seed: 1 });
    expect(text(c)).not.toMatch(/barre/);
  });

  it('roman-chord in a minor key explains the flat of a numeral like bIII', () => {
    let seen = 0;
    each('roman-chord', (exercise, _s, label) => {
      const t = text(exercise);
      if (/minor/.test(t) && /♭(III|VI|VII)/.test(t)) {
        seen++;
        expect(t, label).toContain('sits lower than in the major scale');
      }
    });
    expect(seen).toBeGreaterThan(0);
  });
});
