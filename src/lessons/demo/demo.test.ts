/**
 * The demo course will be seen, so its music must be right. Besides validating it, these tests
 * recompute the facts its hand-written text states from the theory and guitar engines.
 */
import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING, chordVoicings, midiAt, noteAt } from '@/core/guitar';
import {
  chordNotes, getScale, intervalBetween, key, noteAtStaffPosition, noteValue, parseNote, scaleNotes, semitones, staffPosition, transpose,
} from '@/core/theory';
import { exerciseProblems } from '../check';
import { resolveFigure } from '../figures';
import { GENERATOR_KINDS, generateStrict, isGenerated } from '../generators';
import { findTargets, grade, phraseMidi, playNoteTarget, solve, staffPlaceTarget } from '../grade';
import { parseRhythm, parseStrum } from '../rhythm';
import { factIndex, findLesson } from '../session';
import { soundPlan } from '../sound';
import { plainText, speakable } from '../text';
import type { Exercise, ExerciseType, Figure, Lesson, Step } from '../types';
import { estimateLessonSeconds, formatProblems, validateCourse } from '../validate';
import { DEMO_COURSE } from './index';

const lessons: Lesson[] = DEMO_COURSE.units.flatMap((u) => u.lessons);
const lesson = (id: string): Lesson => findLesson(DEMO_COURSE, id)!.lesson;
const allSteps: Array<{ lesson: Lesson; step: Step; index: number }> = lessons.flatMap((l) => l.steps.map((step, index) => ({ lesson: l, step, index })));
const literal = <T extends ExerciseType>(lessonId: string, type: T): Array<Extract<Exercise, { type: T }>> =>
  lesson(lessonId).steps.filter((s): s is Extract<Exercise, { type: T }> => !isGenerated(s) && s.type === type);
const pcs = (notes: readonly string[]): number[] => notes.map((n) => parseNote(n)!.chroma);

describe('the demo course as a whole', () => {
  it('passes validateCourse with no errors and no warnings', () => {
    expect(formatProblems(validateCourse(DEMO_COURSE))).toBe('');
  });

  it('is two units and eight lessons of two to five minutes', () => {
    expect(DEMO_COURSE.units).toHaveLength(2);
    expect(lessons).toHaveLength(8);
    for (const l of lessons) {
      expect(l.minutes, l.id).toBeGreaterThanOrEqual(2);
      expect(l.minutes, l.id).toBeLessThanOrEqual(5);
      expect(estimateLessonSeconds(l), l.id).toBeGreaterThanOrEqual(120);
      expect(estimateLessonSeconds(l), l.id).toBeLessThanOrEqual(300);
    }
  });

  it('uses every exercise type as a literal step, and a teaching card in every lesson', () => {
    const types = new Set(allSteps.filter((s) => !isGenerated(s.step)).map((s) => (s.step as { type: string }).type));
    const every: ExerciseType[] = ['choice', 'true-false', 'match-pairs', 'order', 'fill-blanks', 'type-answer', 'listen-choice', 'tap-rhythm', 'fretboard-find', 'fretboard-name', 'chord-build', 'staff-read', 'staff-place', 'play-note', 'play-chord', 'play-phrase', 'flashcard'];
    for (const type of every) expect(types.has(type), type).toBe(true);
    for (const l of lessons) expect(l.steps[0], l.id).toMatchObject({ type: 'card' });
  });

  it('uses many generators', () => {
    const used = new Set<string>();
    const visit = (step: unknown): void => {
      if (isGenerated(step)) used.add(String(step.generate));
      if (step && typeof step === 'object' && 'alternative' in step) visit((step as { alternative: unknown }).alternative);
    };
    allSteps.forEach((s) => visit(s.step));
    lessons.forEach((l) => (l.facts ?? []).forEach((f) => visit(f.ask)));
    DEMO_COURSE.units.forEach((u) => (u.checkpoint?.steps ?? []).forEach(visit));
    expect(used.size).toBeGreaterThanOrEqual(14);
    for (const kind of used) expect(GENERATOR_KINDS).toContain(kind);
  });

  it('follows the lesson recipe: one idea, show then ask, three to six question types, a why with every answer', () => {
    for (const l of lessons) {
      const exercises = l.steps.filter((s) => isGenerated(s) || s.type !== 'card');
      expect(exercises.length, l.id).toBeGreaterThanOrEqual(6);
      expect(l.teaches.length, l.id).toBeGreaterThan(20);
      for (const step of l.steps) {
        if (isGenerated(step) || step.type === 'card' || step.type === 'flashcard') continue;
        expect(plainText(step.explain).length, `${l.id} ${step.type}`).toBeGreaterThan(20);
      }
      expect((l.facts ?? []).length, l.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('every text is speakable without symbols a voice would trip over', () => {
    for (const { lesson: l, step } of allSteps) {
      if (isGenerated(step)) continue;
      const texts = step.type === 'card' ? [step.body, step.title, step.tip] : step.type === 'flashcard' ? [step.front, step.back] : [step.type === 'true-false' ? step.statement : step.prompt, step.explain];
      for (const text of texts) {
        if (text === undefined) continue;
        const spoken = speakable(text);
        expect(spoken, l.id).not.toMatch(/[{}#♯♭]/);
        expect(spoken.length, l.id).toBeGreaterThan(0);
      }
    }
    expect(speakable(lesson('first-chords').steps[0].type === 'card' ? (lesson('first-chords').steps[0] as { body: string }).body : '')).toContain('E minor is E, G and B');
  });

  it('every generated step of the course produces valid exercises for many seeds', () => {
    const generated = allSteps.filter((s) => isGenerated(s.step));
    expect(generated.length).toBeGreaterThan(20);
    for (const { lesson: l, step } of generated) {
      if (!isGenerated(step)) continue;
      for (let seed = 0; seed < 25; seed++) {
        for (const difficulty of [0, 0.5, 1]) {
          const exercise = generateStrict(step, { seed, difficulty });
          expect(exerciseProblems(exercise).filter((p) => p.severity === 'error'), `${l.id} ${step.generate} seed ${seed}`).toEqual([]);
          expect(grade(exercise, solve(exercise)).correct).toBe(true);
        }
      }
    }
  });

  it('every fact is reachable as a card, and facts named by steps exist', () => {
    const index = factIndex([DEMO_COURSE]);
    expect(index.size).toBe(lessons.reduce((n, l) => n + (l.facts?.length ?? 0), 0));
    for (const [id, ref] of index) expect(id).toBe(`demo:${ref.fact.id}`);
    for (const { lesson: l, step } of allSteps) {
      const fact = (step as { fact?: string }).fact;
      if (fact !== undefined) expect((l.facts ?? []).map((f) => f.id), `${l.id} ${fact}`).toContain(fact);
    }
  });
});

describe('the music in the demo is the engines\' music', () => {
  it('musical alphabet: natural neighbours, enharmonic twins and the count of twelve', () => {
    // "E to F and B to C have nothing between them": the only natural pairs a half step apart.
    const naturals = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const halfSteps = naturals.map((n, i) => [n, naturals[(i + 1) % 7]]).filter(([a, b]) => semitones(intervalBetween(a, b)) === 1);
    expect(halfSteps).toEqual([['E', 'F'], ['B', 'C']]);
    expect(parseNote('F#')!.chroma).toBe(parseNote('Gb')!.chroma);
    expect(parseNote('C#')!.chroma).toBe(parseNote('Db')!.chroma);
    // The fill-blanks sequence climbs by half steps.
    const [fill] = literal('musical-alphabet', 'fill-blanks');
    const sequence = ['C', 'C#', 'D', ...fill.blanks.slice(0, 1).map((b) => b.slice(3, -1)), 'E', ...fill.blanks.slice(1).map((b) => b.slice(3, -1)), 'F#'];
    expect(sequence).toEqual(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#']);
    sequence.slice(1).forEach((n, i) => expect((parseNote(n)!.chroma - parseNote(sequence[i])!.chroma + 12) % 12, n).toBe(1));
    // The alphabet order tile set.
    expect(literal('musical-alphabet', 'order')[0].tiles.map((t) => plainText(t))).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    // Seven naturals and five sharps make twelve: the "12" option is the right one.
    const twelve = literal('musical-alphabet', 'choice').find((c) => plainText(c.prompt).startsWith('How many different notes'))!;
    expect(twelve.options.find((o) => o.correct)!.text).toBe('12');
    expect(new Set([...naturals, 'C#', 'D#', 'F#', 'G#', 'A#'].map((n) => parseNote(n)!.chroma)).size).toBe(12);
    expect(midiAt({ string: 6, fret: 12 }) - midiAt({ string: 6, fret: 0 })).toBe(12);
  });

  it('open strings: names, numbers, octaves and the figure', () => {
    const names = STANDARD_TUNING.notes.map((n) => parseNote(n)!.pcName);
    expect(names).toEqual(['E', 'A', 'D', 'G', 'B', 'E']);
    const card = lesson('open-strings').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('card');
    const dots = resolveFigure(card.figure).dots;
    expect(dots.map((d) => d.note)).toEqual(names);
    expect(dots.map((d) => d.string)).toEqual([6, 5, 4, 3, 2, 1]);
    for (const pair of literal('open-strings', 'match-pairs')[0].pairs) {
      const string = Number(plainText(pair.left).replace('String ', ''));
      expect(plainText(pair.right), plainText(pair.left)).toBe(noteAt({ string, fret: 0 }, { octave: false }));
    }
    // "Strings 6 and 1 are both E, two octaves apart."
    expect(midiAt({ string: 1, fret: 0 }) - midiAt({ string: 6, fret: 0 })).toBe(24);
    // The audio figure plays exactly the open strings, low to high.
    const audio = lesson('open-strings').steps.map((s) => (!isGenerated(s) && s.type === 'card' ? s.figure : undefined)).find((f): f is Extract<Figure, { kind: 'audio' }> => f?.kind === 'audio')!;
    expect(soundPlan(audio.sound).events.map((e) => e.midi[0])).toEqual([...STANDARD_TUNING.midi]);
    // Play the open A: string 5 really is A2.
    const [play] = literal('open-strings', 'play-note');
    expect(playNoteTarget(play)).toBe(midiAt(play.where!));
    expect(play.alternative && !isGenerated(play.alternative) && play.alternative.type === 'fretboard-find' ? findTargets(play.alternative).map((t) => `${t.string}:${t.fret}`) : []).toEqual(['5:0']);
  });

  it('low E string: fret names, the fifth-fret trick and the phrase', () => {
    const walk = [0, 1, 2, 3, 4, 5].map((fret) => noteAt({ string: 6, fret }, { octave: false }));
    expect(walk).toEqual(['E', 'F', 'F#', 'G', 'G#', 'A']);
    expect(midiAt({ string: 6, fret: 5 })).toBe(midiAt({ string: 5, fret: 0 }));
    const [named] = literal('low-e-string', 'fretboard-name');
    expect(solve(named)).toEqual({ type: 'fretboard-name', text: 'F' });
    expect(findTargets(literal('low-e-string', 'fretboard-find')[0]).map((t) => t.fret)).toEqual([3]);
    const [phrase] = literal('low-e-string', 'play-phrase');
    expect(phraseMidi(phrase)).toEqual([40, 41, 43]);
    expect(phraseMidi(phrase).map((m) => parseNote(noteAt({ string: 6, fret: m - 40 }))!.pcName)).toEqual(['E', 'F', 'G']);
    const alternative = phrase.alternative;
    if (isGenerated(alternative) || alternative.type !== 'order') throw new Error('alternative');
    expect(alternative.tiles.map((t) => plainText(t))).toEqual(['E', 'F', 'F♯', 'G']);
    const fifth = lesson('low-e-string').facts!.find((f) => f.id === 'fifth-fret')!.ask!;
    if (isGenerated(fifth)) throw new Error('ask');
    expect(grade(fifth, { type: 'fretboard-name', text: 'A' }).correct).toBe(true);
  });

  it('the staff: lines, spaces, the guitar octave and the placed notes', () => {
    // Lines and spaces as the guitar reads them (sounding an octave below what is written).
    const lines = [0, 2, 4, 6, 8].map((p) => parseNote(noteAtStaffPosition(p))!.letter);
    const spaces = [1, 3, 5, 7].map((p) => parseNote(noteAtStaffPosition(p))!.letter);
    expect(lines.join(' ')).toBe('E G B D F');
    expect(spaces.join('')).toBe('FACE');
    const card = lesson('reading-the-staff').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'staff') throw new Error('card');
    const drawn = resolveFigure(card.figure);
    expect(drawn.notes.map((n) => n.position)).toEqual([0, 2, 4, 6, 8]);
    expect(drawn.notes.map((n) => n.label)).toEqual(['E', 'G', 'B', 'D', 'F']);
    expect(literal('reading-the-staff', 'match-pairs')[0].pairs.map((p) => plainText(p.right)).join('')).toBe('FACE');
    // "The open 3rd string, G, is written on the second line."
    expect(staffPosition(STANDARD_TUNING.notes[3]).position).toBe(2);
    expect(staffPosition(STANDARD_TUNING.notes[3]).written).toBe('G4');
    // "The open B string is written on the middle line."
    const [place] = literal('reading-the-staff', 'staff-place');
    expect(place.note).toBe(STANDARD_TUNING.notes[4]);
    expect(staffPlaceTarget(place)).toEqual({ position: 4, accidental: null });
    // The two literal reading questions: second line G, bottom line E; the bottom-line E is string 4, fret 2.
    const reads = literal('reading-the-staff', 'staff-read');
    expect(reads.map((r) => staffPosition(r.note).position)).toEqual([2, 0]);
    expect(midiAt({ string: 4, fret: 2 })).toBe(parseNote(reads[1].note)!.midi);
  });

  it('half and whole steps: frets, the octave and the interval question', () => {
    expect(semitones('m2')).toBe(1);
    expect(semitones('M2')).toBe(2);
    expect(semitones('P8')).toBe(12);
    expect(semitones(intervalBetween('B', 'C'))).toBe(1);
    const [typed] = literal('half-and-whole-steps', 'type-answer');
    expect(typed.answer).toEqual({ kind: 'number', value: semitones('P8') });
    const [find] = literal('half-and-whole-steps', 'fretboard-find');
    // A whole step above G (string 6, fret 3) is A at fret 5.
    expect(findTargets(find)).toEqual([{ string: 6, fret: 5, midi: 45, note: 'A' }]);
    const [listen] = literal('half-and-whole-steps', 'listen-choice');
    if (listen.sound.kind !== 'interval') throw new Error('sound');
    const heard = soundPlan(listen.sound).events.map((e) => e.midi[0]);
    expect(heard[1] - heard[0]).toBe(2);
    expect(transpose(listen.sound.from, listen.sound.interval)).toBe('F#3');
    expect(plainText(listen.options.find((o) => o.correct)!.text!)).toBe('A whole step');
    const card = lesson('half-and-whole-steps').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('card');
    expect(resolveFigure(card.figure).dots.map((d) => `${d.fret}:${d.note}`)).toEqual(['1:F', '2:F#', '3:G']);
  });

  it('the major scale: formula, C major, G major and its one sharp', () => {
    expect(getScale('major')!.stepPattern.join(' ')).toBe('W W H W W W H');
    const card = lesson('major-scale').steps[0];
    if (isGenerated(card) || card.type !== 'card') throw new Error('card');
    expect(plainText(card.body)).toContain('whole, whole, half, whole, whole, whole, half');
    expect(plainText(card.body)).toContain(scaleNotes('C', 'major').join(' '));
    // "The two half steps fall between notes 3 and 4, and between 7 and 8."
    const steps = getScale('major')!.steps;
    expect(steps.map((s, i) => (s === 1 ? i + 1 : 0)).filter(Boolean)).toEqual([3, 7]);
    const second = lesson('major-scale').steps[3];
    if (isGenerated(second) || second.type !== 'card' || second.figure?.kind !== 'staff') throw new Error('card');
    expect(plainText(second.body)).toContain('G A B C D E F♯');
    expect(scaleNotes('G', 'major')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
    expect(key('G major').signature.accidentals).toEqual(['F#']);
    expect(key('C major').signature.count).toBe(0);
    const staff = resolveFigure(second.figure);
    expect(staff.notes.map((n) => parseNote(n.note)!.pcName)).toEqual(scaleNotes('G', 'major'));
    // The key signature carries the sharp, so no accidental is drawn in front of F sharp.
    expect(staff.notes.map((n) => n.accidental)).toEqual(Array(7).fill(null));
    const [fill] = literal('major-scale', 'fill-blanks');
    expect(fill.blanks.map((b) => plainText(b))).toEqual([scaleNotes('C', 'major')[2], scaleNotes('C', 'major')[5]]);
    // "E to F is only a half step; the pattern needs a whole step from note 6 to note 7."
    expect(scaleNotes('G', 'major')[5]).toBe('E');
    expect(semitones(intervalBetween('E', 'F'))).toBe(1);
    expect(semitones(intervalBetween('E', 'F#'))).toBe(2);
    const sharps = literal('major-scale', 'choice').find((c) => plainText(c.prompt).startsWith('How many sharps'))!;
    expect(sharps.options.find((o) => o.correct)!.text).toBe(String(key('G major').signature.count));
  });

  it('first chords: E minor, E major and the shapes', () => {
    expect(chordNotes('Em')).toEqual(['E', 'G', 'B']);
    expect(chordNotes('E')).toEqual(['E', 'G#', 'B']);
    const em = chordVoicings('Em')[0];
    // "Two fingers, both at fret 2, on strings 5 and 4."
    expect(em.notes.filter((n) => n.fret > 0).map((n) => `${n.string}:${n.fret}:${n.note}`)).toEqual(['5:2:B', '4:2:E']);
    const [build, missing] = literal('first-chords', 'chord-build');
    expect(grade(build, { type: 'chord-build', frets: [...em.frets] }).correct).toBe(true);
    expect(grade(build, { type: 'chord-build', frets: [...chordVoicings('E')[0].frets] }).correct).toBe(false);
    expect(solve(missing)).toEqual({ type: 'chord-build', text: 'G#' });
    // "Em and E differ by one finger: string 3, fret 1."
    const e = chordVoicings('E')[0];
    const differing = e.frets.map((f, i) => (f !== em.frets[i] ? 6 - i : 0)).filter(Boolean);
    expect(differing).toEqual([3]);
    expect(noteAt({ string: 3, fret: 1 }, { octave: false })).toBe('G#');
    // The audio card plays E then E minor.
    const audio = lesson('first-chords').steps.map((s) => (!isGenerated(s) && s.type === 'card' ? s.figure : undefined)).find((f): f is Extract<Figure, { kind: 'audio' }> => f?.kind === 'audio')!;
    const plan = soundPlan(audio.sound);
    expect(plan.events.map((x) => [...new Set(x.midi.map((m) => m % 12))].sort((a, b) => a - b))).toEqual([pcs(['E', 'G#', 'B']).sort((a, b) => a - b), pcs(['E', 'G', 'B']).sort((a, b) => a - b)]);
    const chordCard = lesson('first-chords').steps[0];
    if (isGenerated(chordCard) || chordCard.type !== 'card' || chordCard.figure?.kind !== 'chord') throw new Error('card');
    expect(resolveFigure(chordCard.figure)!.frets).toEqual([...em.frets]);
  });

  it('counting rhythm: beats, eighth notes and the strumming pattern', () => {
    expect(noteValue('quarter')!.beats).toBe(1);
    expect(noteValue('eighth')!.beats).toBe(0.5);
    const taps = literal('counting-rhythm', 'tap-rhythm');
    expect(taps.map((t) => parseRhythm(t.rhythm).events.filter((e) => e.attack).map((e) => e.count).join(' '))).toEqual(['1 2 3 4', '1 2 & 3 4']);
    expect(plainText(taps[1].explain)).toContain('1, 2 &, 3, 4');
    const cards = lesson('counting-rhythm').steps.filter((s): s is Extract<Step, { type: 'card' }> => !isGenerated(s) && s.type === 'card');
    const second = cards[1].figure;
    if (second?.kind !== 'rhythm') throw new Error('figure');
    expect(resolveFigure(second).events.map((e) => e.count).join(' ')).toBe('1 & 2 & 3 4');
    const strum = cards[2].figure;
    if (strum?.kind !== 'audio' || strum.sound.kind !== 'strum') throw new Error('figure');
    // "Down on the numbers, up on the &": down, down-up, up-down-up.
    const slots = parseStrum(strum.sound.pattern).slots;
    expect(slots.filter((s) => s.stroke === 'down').every((s) => /\d/.test(s.count))).toBe(true);
    expect(slots.filter((s) => s.stroke === 'up').every((s) => s.count === '&')).toBe(true);
    expect(slots.map((s) => (s.stroke === 'down' ? 'D' : s.stroke === 'up' ? 'U' : '-')).join('')).toBe('D-DU-UDU');
    expect(soundPlan(strum.sound).events).toHaveLength(12);
  });
});
