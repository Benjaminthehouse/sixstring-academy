/**
 * Unit 8 of the Theory Path, cross-checked against the engines: every chord shape the text spells
 * (and every chord box, with its fingers), the notes, thirds and fifths of each chord, the fret
 * counts of the thirds, every fretboard question's targets, what each listening question plays,
 * the drills' pools, and that every exercise accepts its own answer.
 */
import { describe, expect, it } from 'vitest';
import { buildVoicing, checkVoicingFingering, chordVoicings, identifyFretted, midiAt, parseFrets } from '@/core/guitar';
import { chordNotes, chordTones, interval, intervalBetween, midiToNote, parseChord, pcName, semitones } from '@/core/theory';
import {
  estimateLessonSeconds, findTargets, generateExercise, grade, isGenerated, missingChordNote, plainText, solve, soundPlan,
  type Exercise, type ExerciseStep, type Lesson, type Step,
} from '@/lessons';
import unit from './major-and-minor-chords';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const literal = (s: Step | ExerciseStep | undefined): s is Exercise => !!s && !('generate' in s) && s.type !== 'card';
/** Every literal exercise of a lesson: its steps, play alternatives and the facts' review questions. */
function exercisesOf(l: Lesson): Exercise[] {
  const out: Exercise[] = [];
  const add = (s: Step | ExerciseStep | undefined): void => {
    if (!literal(s)) return;
    out.push(s);
    if ('alternative' in s && s.alternative) add(s.alternative);
  };
  l.steps.forEach(add);
  (l.facts ?? []).forEach((f) => add(f.ask));
  return out;
}
const checkpoint = (): Exercise[] => (unit.checkpoint?.steps ?? []).filter(literal);
const everything = (): Exercise[] => [...unit.lessons.flatMap(exercisesOf), ...checkpoint()];
const of = <K extends Exercise['type']>(list: Exercise[], type: K) => list.filter((e): e is Extract<Exercise, { type: K }> => e.type === type);
const correct = (e: { options: Array<{ text?: unknown; correct?: boolean }> }): string => plainText((e.options.find((o) => o.correct)?.text ?? '') as string);
const prompt = (e: Exercise): string => ('prompt' in e && e.prompt ? plainText(e.prompt) : '');

/** Every object anywhere in the unit (steps, figures, facts, checkpoint), to find figures and texts. */
function walk(value: unknown, visit: (v: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) value.forEach((v) => walk(v, visit));
  else if (value && typeof value === 'object') {
    visit(value as Record<string, unknown>);
    Object.values(value).forEach((v) => walk(v, visit));
  }
}
function texts(): string[] {
  const out: string[] = [];
  const collect = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    // A `fingers` field spells fingers, not frets.
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => k !== 'fingers' && collect(x));
  };
  collect(unit);
  return out;
}

/** The shapes the unit spells out, string 6 to string 1, as the syllabus gives them. */
const SHAPES: Record<string, string> = {
  Em: '022000', C: 'x32010', E: '022100', A: 'x02220', Am: 'x02210', D: 'xx0232', Dm: 'xx0231', G5: '355xxx', A5: '577xxx', E5: '022xxx',
};
const shape = (frets: ReadonlyArray<number | null>): string => frets.map((f) => (f === null ? 'x' : String(f))).join('');
const thirdOf = (symbol: string): string => chordTones(symbol).find((t) => t.role === 'third')!.note;

describe('major-and-minor-chords: the shapes', () => {
  it('spells every shape so that it sounds its chord, with the right bass', () => {
    for (const [symbol, frets] of Object.entries(SHAPES)) {
      expect(identifyFretted(frets).symbol, frets).toBe(symbol);
      expect(buildVoicing(symbol, frets).chord, frets).toBe(symbol);
    }
    // The open shapes are the chord library's own first shapes.
    for (const symbol of ['Em', 'C', 'E', 'A', 'Am', 'D', 'Dm', 'E5']) expect(shape(chordVoicings(symbol)[0].frets), symbol).toBe(SHAPES[symbol]);
  });

  it('quotes no shape the table does not hold, and each next to its own chord', () => {
    const quoted = new Set(texts().flatMap((t) => t.match(/\b[x0-9]{6}\b/g) ?? []));
    for (const s of quoted) expect(Object.values(SHAPES), s).toContain(s);
    // "{c:Am} (x02210)": a shape in brackets right after a chord symbol belongs to that chord.
    for (const t of texts()) {
      for (const m of t.matchAll(/\{c:([^}]+)\}\s*\(([x0-9]{6})\)/g)) expect(SHAPES[m[1]], t).toBe(m[2]);
      for (const m of t.matchAll(/\{c:([^}]+)\}[^.(]*?is \*\*([x0-9]{6})\*\*/g)) expect(SHAPES[m[1]], t).toBe(m[2]);
    }
  });

  it('draws every chord box and builds every chord with a real shape of its chord, fingered playably', () => {
    const boxes: Array<{ symbol: string; frets: string; fingers?: string }> = [];
    walk(unit, (v) => {
      if (v.kind === 'chord' && typeof v.symbol === 'string' && typeof v.frets === 'string') boxes.push(v as { symbol: string; frets: string; fingers?: string });
    });
    expect(boxes.length).toBeGreaterThan(10);
    for (const b of boxes) {
      expect(SHAPES[b.symbol], b.symbol).toBe(b.frets);
      if (b.fingers) {
        const frets = parseFrets(b.frets)!;
        const fingers = [...b.fingers].map((c) => (c === 'x' ? null : Number(c)));
        expect(checkVoicingFingering(frets, fingers as Array<0 | 1 | 2 | 3 | 4 | null>), b.fingers).toEqual([]);
        // The fingering drawn is the library's own.
        expect(shape(chordVoicings(b.symbol)[0].fingers), b.symbol).toBe(b.fingers);
      }
    }
    for (const e of [...of(everything(), 'chord-build'), ...of(everything(), 'play-chord')]) {
      if ('task' in e && e.task === 'missing-note') continue;
      expect(SHAPES[e.chord], e.chord).toBe(e.frets);
    }
  });

  it('describes the shapes and fingers as they are', () => {
    // Em: strings 5 and 4 at fret 2 (fingers 2 and 3); its six strings sound only E, G and B.
    const em = buildVoicing('Em', SHAPES.Em);
    expect(em.notes.filter((n) => n.fret === 2).map((n) => n.string)).toEqual([5, 4]);
    const byNote = (v: typeof em, note: string) => v.notes.filter((n) => pcName(n.note) === note).map((n) => n.string).sort((a, b) => b - a);
    expect(byNote(em, 'E')).toEqual([6, 4, 1]);
    expect(byNote(em, 'B')).toEqual([5, 2]);
    expect(byNote(em, 'G')).toEqual([3]);
    // Open C: five strings, C E G C E from string 5; string 5 at fret 3 is the root.
    const c = buildVoicing('C', SHAPES.C);
    expect(c.notes.map((n) => pcName(n.note))).toEqual(['C', 'E', 'G', 'C', 'E']);
    expect(c.notes.length).toBe(5);
    expect(correct(of(exercisesOf(lesson('reading-a-chord-box')), 'choice').find((e) => /how many strings are played/.test(prompt(e)))!)).toBe(String(c.notes.length));
    // E is Em plus finger 1 on string 3 at fret 1; Em to Am moves fingers 2 and 3 over one string and adds finger 1.
    const fingersOf = (symbol: string) => Object.fromEntries(chordVoicings(symbol)[0].notes.filter((n) => n.fret > 0).map((n) => [n.string, n.finger]));
    expect(fingersOf('E')).toEqual({ 5: 2, 4: 3, 3: 1 });
    expect(fingersOf('Em')).toEqual({ 5: 2, 4: 3 });
    expect(fingersOf('Am')).toEqual({ 4: 2, 3: 3, 2: 1 });
    // A is fingered differently from Am, as the tip says ("your fingers rearrange").
    expect(fingersOf('A')).not.toEqual({ 4: 2, 3: 3, 2: 1 });
  });
});

describe('major-and-minor-chords: roots, thirds and fifths', () => {
  it('spells the chords it names', () => {
    expect(chordNotes('C')).toEqual(['C', 'E', 'G']);
    expect(chordNotes('G')).toEqual(['G', 'B', 'D']);
    expect(chordNotes('E')).toEqual(['E', 'G#', 'B']);
    expect(chordNotes('Em')).toEqual(['E', 'G', 'B']);
    expect(chordNotes('Am')).toEqual(['A', 'C', 'E']);
    expect(chordNotes('Cm')).toEqual(['C', 'Eb', 'G']);
    expect(chordNotes('Gm')).toEqual(['G', 'Bb', 'D']);
    expect(chordNotes('G5')).toEqual(['G', 'D']);
    expect(chordNotes('A5')).toEqual(['A', 'E']);
    expect(chordNotes('E5')).toEqual(['E', 'B']);
    expect(chordNotes('C5')).toEqual(['C', 'G']);
  });

  it('measures the thirds and the fifth', () => {
    expect(intervalBetween('C', 'E')).toBe('M3');
    expect(intervalBetween('C', 'Eb')).toBe('m3');
    expect(semitones('M3')).toBe(4);
    expect(semitones('m3')).toBe(3);
    expect(semitones('P5')).toBe(7);
    // Major: a major third, then a minor third. Minor: the other way round. Both add up to a fifth.
    expect([intervalBetween('C', 'E'), intervalBetween('E', 'G'), intervalBetween('C', 'G')]).toEqual(['M3', 'm3', 'P5']);
    expect([intervalBetween('A', 'C'), intervalBetween('C', 'E'), intervalBetween('A', 'E')]).toEqual(['m3', 'M3', 'P5']);
    expect(interval('M3').semitones + interval('m3').semitones).toBe(7);
  });

  it('lowers only the third, by a half step, from each major chord to its minor', () => {
    for (const [major, minor, string] of [['E', 'Em', 3], ['A', 'Am', 2], ['D', 'Dm', 1]] as const) {
      const a = parseFrets(SHAPES[major])!;
      const b = parseFrets(SHAPES[minor])!;
      const differ = a.map((f, i) => (f !== b[i] ? 6 - i : 0)).filter(Boolean);
      expect(differ, `${major} / ${minor}`).toEqual([string]);
      expect((a[6 - string] as number) - (b[6 - string] as number)).toBe(1);
      const majorThird = buildVoicing(major, SHAPES[major]).notes.find((n) => n.string === string)!;
      const minorThird = buildVoicing(minor, SHAPES[minor]).notes.find((n) => n.string === string)!;
      expect(pcName(majorThird.note)).toBe(thirdOf(major));
      expect(pcName(minorThird.note)).toBe(thirdOf(minor));
      expect(majorThird.role).toBe('third');
      expect(minorThird.role).toBe('third');
    }
    expect([thirdOf('A'), thirdOf('Am'), thirdOf('D'), thirdOf('Dm'), thirdOf('E'), thirdOf('Em')]).toEqual(['C#', 'C', 'F#', 'F', 'G#', 'G']);
  });

  it('matches each chord with its own third', () => {
    const pairs = of(everything(), 'match-pairs').filter((e) => /its third/.test(prompt(e)));
    expect(pairs.length).toBe(2);
    for (const e of pairs) for (const p of e.pairs) expect(p.right).toBe(`{n:${thirdOf(String(p.left).replace(/^\{c:|\}$/g, ''))}}`);
  });

  it('fills the triads by counting letters', () => {
    const blanks = of(everything(), 'fill-blanks');
    const fill = (e: (typeof blanks)[number]): string[] => {
      const words = e.blanks.map((w) => String(w));
      return String(e.text)
        .replace(/\{c:[^}]+\}:\s*/g, '')
        .split(/[.\s]+/)
        .filter((w: string) => w.startsWith('{n:') || w === '___')
        .map((w: string) => (w === '___' ? words.shift()! : w))
        .map((w: string) => w.replace(/^\{n:|\}$/g, ''));
    };
    for (const e of blanks.filter((b) => b.blanks.every((w) => String(w).startsWith('{n:')))) {
      const notes = fill(e);
      for (let i = 0; i < notes.length; i += 3) {
        const triad = notes.slice(i, i + 3);
        const symbol = triad[0] + (intervalBetween(triad[0], triad[1]) === 'm3' ? 'm' : '');
        expect(chordNotes(symbol), String(e.text)).toEqual(triad);
      }
    }
    // The planned missing note: C major with C and G given is missing E, the third.
    const missing = of(exercisesOf(lesson('root-third-fifth')), 'chord-build').find((e) => e.task === 'missing-note')!;
    expect(missingChordNote(missing)).toBe('E');
    expect(thirdOf('C')).toBe('E');
  });

  it('names the fifth of C major and the root of Em and C', () => {
    expect(correct(of(exercisesOf(lesson('root-third-fifth')), 'choice').find((e) => /fifth of a C major chord/.test(prompt(e)))!)).toBe('G');
    expect(chordTones('C').find((t) => t.role === 'fifth')!.note).toBe('G');
    expect(correct(of(exercisesOf(lesson('what-a-chord-is')), 'choice').find((e) => /root of Em/.test(prompt(e)))!)).toBe('E');
    expect(parseChord('Em')!.root).toBe('E');
    expect(parseChord('C')!.root).toBe('C');
    // A C E is A minor.
    expect(correct(of(exercisesOf(lesson('hearing-major-and-minor')), 'choice').find((e) => /make which chord/.test(prompt(e)))!)).toBe('Am');
  });
});

describe('major-and-minor-chords: on the neck', () => {
  const pos = (t: Array<{ string: number; fret: number }>): string[] => t.map((p) => `${p.string}:${p.fret}`).sort();

  it('finds the planned positions in every fretboard question', () => {
    const finds = of(everything(), 'fretboard-find');
    const targets = (re: RegExp) => pos(findTargets(finds.find((e) => re.test(prompt(e)))!));
    expect(targets(/open 5th string is A\. Tap the note a major third/)).toEqual(['5:4']); // C sharp
    expect(targets(/open 6th string is E\. Tap the note a major third/)).toEqual(['6:4']); // G sharp
    expect(targets(/open 6th string is E\. Tap the note a minor third/)).toEqual(['6:3']); // G
    expect(targets(/make Am/)).toEqual(['2:2']); // the C sharp of open A
    expect(targets(/make Dm/)).toEqual(['1:2']); // the F sharp of open D
    expect(targets(/three notes of A5/)).toEqual(['4:7', '5:7', '6:5']);
  });

  it('puts the thirds of C on string 5 where the figures say', () => {
    expect(midiAt({ string: 5, fret: 3 })).toBe(48); // C3
    expect(midiAt({ string: 5, fret: 6 })).toBe(51); // Eb3: three frets up, a minor third
    expect(midiAt({ string: 5, fret: 7 })).toBe(52); // E3: four frets up, a major third
    expect(midiAt({ string: 5, fret: 10 })).toBe(55); // G3: the fifth of C
    expect(midiAt({ string: 5, fret: 0 })).toBe(45); // A2
    expect(midiAt({ string: 5, fret: 4 }) - 45).toBe(semitones('M3'));
  });

  it('places the power chord shape: fifth and octave two frets above a string-6 root', () => {
    for (const root of [0, 3, 5, 8]) {
      const r = midiAt({ string: 6, fret: root });
      expect(midiAt({ string: 5, fret: root + 2 }) - r).toBe(semitones('P5'));
      expect(midiAt({ string: 4, fret: root + 2 }) - r).toBe(12);
    }
    expect(midiToNote(midiAt({ string: 6, fret: 8 }))).toBe('C3');
    expect(midiToNote(midiAt({ string: 5, fret: 10 }))).toBe('G3');
    const answers = of(everything(), 'type-answer').filter((e) => /power chord/.test(prompt(e)));
    expect(answers.length).toBe(3);
    for (const e of answers) {
      const root = Number(/fret (\d+)/.exec(prompt(e))![1]);
      if (e.answer.kind !== 'number') throw new Error('number');
      expect(e.answer.value, prompt(e)).toBe(root + 2);
    }
  });
});

describe('major-and-minor-chords: what is heard', () => {
  it('plays a chord when the answer is "A chord", one note when it is "One note"', () => {
    const listens = of(exercisesOf(lesson('what-a-chord-is')), 'listen-choice');
    for (const e of listens) {
      const notes = new Set(soundPlan(e.sound).events.flatMap((ev) => ev.midi).map((m) => m % 12));
      expect(correct(e), prompt(e)).toBe(notes.size >= 3 ? 'A chord' : 'One note');
    }
  });

  it('plays a major chord when the answer is "Major", a minor one when it is "Minor"', () => {
    const quality = of(everything(), 'listen-choice').filter((e) => e.options.some((o) => plainText(o.text ?? '') === 'Major'));
    expect(quality.length).toBeGreaterThanOrEqual(3);
    for (const e of quality) {
      if (e.sound.kind !== 'chord') throw new Error('chord sound');
      expect(correct(e), e.sound.chord).toBe(parseChord(e.sound.chord)!.type.quality === 'minor' ? 'Minor' : 'Major');
    }
  });

  it('plays a major third when the answer is a major third', () => {
    const [e] = of(exercisesOf(lesson('major-and-minor-thirds')), 'listen-choice');
    if (e.sound.kind !== 'interval') throw new Error('interval sound');
    const [a, b] = soundPlan(e.sound).events.flatMap((ev) => ev.midi);
    expect(b - a).toBe(4);
    expect(correct(e)).toBe('A major third');
  });
});

describe('major-and-minor-chords: drills', () => {
  const drills = (id: string) => lesson(id).steps.filter(isGenerated);
  const run = (step: ReturnType<typeof drills>[number], each: (e: Exercise) => void): void => {
    for (let seed = 1; seed <= 25; seed++) for (const difficulty of [0, 0.5, 1]) each(generateExercise(step, { seed, difficulty, level: 'beginner' }));
  };

  it('builds only the chords taught so far', () => {
    const taught: Record<string, string[]> = {
      'reading-a-chord-box': ['Em', 'C'],
      'root-third-fifth': ['C', 'Em'],
      'e-and-e-minor': ['E', 'Em', 'C'],
      'a-am-d-dm': ['Am', 'Dm', 'A', 'D', 'E', 'Em'],
      'power-chords': ['E5', 'G5'],
    };
    for (const [id, chords] of Object.entries(taught)) {
      const step = drills(id).find((s) => s.generate === 'chord-shape')!;
      run(step, (e) => {
        if (e.type !== 'chord-build') throw new Error('chord-build');
        expect(chords, id).toContain(e.chord);
      });
    }
  });

  it('asks the missing note only of C, G and F major in the root-third-fifth lesson', () => {
    const step = drills('root-third-fifth').find((s) => s.generate === 'chord-tones')!;
    run(step, (e) => {
      if (e.type !== 'chord-build') throw new Error('missing-note');
      expect(['C', 'G', 'F']).toContain(e.chord);
      // Natural notes only: counting letters is all this lesson has taught.
      expect(chordNotes(e.chord).every((n) => n.length === 1)).toBe(true);
    });
  });

  it('times every lesson close to its planned minutes', () => {
    for (const l of unit.lessons) expect(Math.abs(estimateLessonSeconds(l) / 60 - l.minutes), l.id).toBeLessThanOrEqual(1.5);
  });
});

describe('major-and-minor-chords: every exercise', () => {
  it('accepts its own answer', () => {
    for (const e of everything()) {
      if (e.type === 'flashcard' || e.type === 'play-chord') continue;
      expect(grade(e, solve(e)).correct, prompt(e)).toBe(true);
    }
  });

  it('names every fact after the unit', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^chords-/);
  });

  it('still asks at least three quiet questions with Sound off (play steps run as their tapping alternatives)', () => {
    const listening = new Set(['listen-choice', 'tap-rhythm']);
    const ear = new Set(['interval-ear', 'chord-quality-ear', 'rhythm-ear', 'rhythm-tap', 'higher-lower', 'scale-ear', 'cadence-ear']);
    for (const l of unit.lessons) {
      const quiet = l.steps.filter((s) => (isGenerated(s) ? !ear.has(String(s.generate)) : s.type !== 'card' && !listening.has(s.type) && s.figure?.kind !== 'audio'));
      expect(quiet.length, l.id).toBeGreaterThanOrEqual(3);
      for (const s of l.steps) if (literal(s) && /^play-/.test(s.type)) expect('alternative' in s && s.alternative, l.id).toBeTruthy();
    }
  });
});
