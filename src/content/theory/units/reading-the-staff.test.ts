/**
 * Unit 13 of the Theory Path, cross-checked against the engines: where every note the text names
 * sits on the staff, which string and fret plays it, the tune, the answers of every staff and
 * fretboard question, and the listening question.
 */
import { describe, expect, it } from 'vitest';
import { noteAtStaffPosition, noteToMidi, parseNote, staffPosition } from '@/core/theory';
import { midiAt } from '@/core/guitar';
import {
  estimateLessonSeconds, findTargets, formatProblems, plainText, soundPlan, validateCourse,
  type Exercise, type Figure, type FretboardFindExercise, type Lesson, type Step, type StaffFigure, type Unit,
} from '@/lessons';
import { assembleTheory } from '../index';
import unit, { TUNE, TUNE_BARS, TUNE_LOW, TUNE_OPENING } from './reading-the-staff';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const isExercise = (s: Step): s is Exercise => !('generate' in s) && s.type !== 'card';
/** Every literal exercise of the unit: lesson steps, play alternatives, fact asks and the checkpoint. */
function allExercises(u: Unit): Exercise[] {
  const out: Exercise[] = [];
  const add = (s: Step | undefined): void => {
    if (!s || !isExercise(s)) return;
    out.push(s);
    if ('alternative' in s && s.alternative) add(s.alternative as Step);
  };
  for (const l of u.lessons) {
    l.steps.forEach(add);
    for (const f of l.facts ?? []) add(f.ask as Step | undefined);
  }
  u.checkpoint?.steps?.forEach(add);
  return out;
}
const pos = (note: string) => staffPosition(note);
const letter = (note: string): string => parseNote(note)!.letter;
const staffNotes = (f: Figure | undefined): string[] =>
  f && f.kind === 'staff' ? (f as StaffFigure).notes.map((n) => (typeof n === 'string' ? n : n.note)) : [];

/** This unit alone as a course, with prerequisites outside it dropped. */
function unitCourse() {
  const course = assembleTheory([unit]).course;
  const ids = new Set(unit.lessons.map((l) => l.id));
  const units = course.units
    .filter((u) => u.id === unit.id)
    .map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, requires: (l.requires ?? []).filter((r) => ids.has(r)) })) }));
  return { ...course, units };
}

describe('reading-the-staff: the lesson engine accepts it', () => {
  it('has no problems on its own', () => {
    const problems = validateCourse(unitCourse());
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('plans about as long as each lesson takes', () => {
    for (const l of unit.lessons) expect(Math.abs(estimateLessonSeconds(l) / 60 - l.minutes), l.id).toBeLessThan(1.5);
  });

  it('starts every fact id with "staff-"', () => {
    const ids = unit.lessons.flatMap((l) => (l.facts ?? []).map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^staff-/);
  });
});

describe('reading-the-staff: the staff as the text describes it', () => {
  it('has lines E G B D F and spaces F A C E, from the bottom', () => {
    expect([0, 2, 4, 6, 8].map((p) => letter(noteAtStaffPosition(p)))).toEqual(['E', 'G', 'B', 'D', 'F']);
    expect([1, 3, 5, 7].map((p) => letter(noteAtStaffPosition(p)))).toEqual(['F', 'A', 'C', 'E']);
    // The clef's G line is line 2.
    expect(noteAtStaffPosition(2)).toBe('G3');
  });

  it('puts each named note where the text says (sounding pitch, written an octave up)', () => {
    const line = (n: number) => (n - 1) * 2;
    const space = (n: number) => (n - 1) * 2 + 1;
    expect(pos('B3').position).toBe(line(3)); // the middle line
    expect(pos('G3').position).toBe(line(2));
    expect(pos('D4').position).toBe(line(4));
    expect(pos('F4').position).toBe(line(5)); // the top line
    expect(pos('E3').position).toBe(line(1)); // the bottom line
    expect(pos('F3').position).toBe(space(1));
    expect(pos('A3').position).toBe(space(2));
    expect(pos('C4').position).toBe(space(3));
    expect(pos('E4').position).toBe(space(4)); // the top space
    expect(pos('G4')).toMatchObject({ position: 9, ledgerLines: 0 }); // just above the top line
    expect(pos('D3')).toMatchObject({ position: -1, ledgerLines: 0 }); // just below the bottom line
    expect(pos('C3')).toMatchObject({ onLine: true, ledgerLines: -1 }); // one ledger line below
    expect(pos('A2')).toMatchObject({ onLine: true, ledgerLines: -2 }); // the second ledger line
    expect(pos('E2')).toMatchObject({ onLine: false, ledgerLines: -3, position: -7 }); // below the third
    expect(pos('C3').written).toBe('C4'); // written an octave up
    expect(pos('C4').written).toBe('C5');
  });

  it('writes the open strings where the unit says', () => {
    const open = [1, 2, 3, 4, 5, 6].map((s) => midiAt({ string: s, fret: 0 }));
    expect(open).toEqual(['E4', 'B3', 'G3', 'D3', 'A2', 'E2'].map((n) => noteToMidi(n)));
    expect(pos('E4').position).toBe(7); // string 1: top space
    expect(pos('B3').position).toBe(4); // string 2: middle line
    expect(pos('G3').position).toBe(2); // string 3: line 2
    expect(pos('D3').position).toBe(-1); // string 4: the space below
    expect(pos('A2').ledgerLines).toBe(-2); // string 5: second ledger line
    expect(pos('E2').ledgerLines).toBe(-3); // string 6: below the third
  });

  it('plays each written note at the fret the text gives', () => {
    const at = (string: number, fret: number) => midiAt({ string, fret });
    expect(at(2, 1)).toBe(60); // the space-3 C: middle C, C4
    expect(at(5, 3)).toBe(48); // the C on one ledger line: C3, an octave below middle C
    expect(at(4, 2)).toBe(noteToMidi('E3')); // the bottom-line E
    expect(at(1, 1)).toBe(noteToMidi('F4')); // the top-line F
    expect(at(4, 3)).toBe(noteToMidi('F3')); // the bottom-space F, an octave lower
    expect(at(2, 3)).toBe(noteToMidi('D4'));
    expect(at(3, 2)).toBe(noteToMidi('A3'));
    expect(at(1, 3)).toBe(noteToMidi('G4'));
    // Wrong options and their reasons.
    expect(at(1, 8)).toBe(72); // C5: an octave above space 3, written above the staff
    expect(pos('C5').position).toBeGreaterThan(8);
    expect(at(6, 3)).toBe(noteToMidi('G2')); // the G an octave below line 2, on ledger lines
    expect(pos('G2').ledgerLines).toBeLessThan(0);
    expect(pos('E3').position).toBe(0); // "that E sounds an octave lower: string 4, fret 2" is on the bottom line
  });
});

describe('reading-the-staff: the answers', () => {
  const exercises = allExercises(unit);

  it('asks every staff-read about the note its figure shows', () => {
    const reads = exercises.filter((e) => e.type === 'staff-read');
    expect(reads.length).toBeGreaterThan(5);
    for (const r of reads) if (r.type === 'staff-read') expect(r.options).toContain(letter(r.note));
  });

  it('has exactly one place to tap for every fretboard question, the one the text names', () => {
    const finds = exercises.filter((e): e is FretboardFindExercise => e.type === 'fretboard-find');
    const where = finds.map((f) => findTargets(f).map((t) => `${t.string}/${t.fret}`));
    for (const w of where) expect(w).toHaveLength(1);
    const expected: Record<string, string> = { E4: '1/0', C4: '2/1', G3: '3/0', A2: '5/0', F4: '1/1', D4: '2/3', A3: '3/2' };
    finds.forEach((f, i) => {
      const note = 'note' in f.find ? f.find.note : '';
      expect(where[i][0], `${plainText(f.prompt)}`).toBe(expected[note]);
      // When the question shows a staff, it shows the note to find.
      const shown = staffNotes(f.figure);
      if (shown.length) expect(shown).toEqual([note]);
    });
  });

  it('places the low E and the open A exactly where the staff-place questions expect', () => {
    const places = exercises.filter((e) => e.type === 'staff-place');
    const notes = places.map((p) => (p.type === 'staff-place' ? p.note : ''));
    expect(notes).toEqual(expect.arrayContaining(['F', 'E2', 'A2']));
  });

  it('lets the listening question play what the right staff shows', () => {
    const q = lesson('the-staff').steps.find((s) => isExercise(s) && s.type === 'listen-choice');
    if (!q || !isExercise(q) || q.type !== 'listen-choice') throw new Error('no listening question');
    const heard = soundPlan(q.sound).events.flatMap((e) => e.midi);
    expect(heard).toEqual([64, 55]); // high E, then G: high, then low
    const right = q.options.find((o) => o.correct)!;
    expect(staffNotes(right.figure).map((n) => noteToMidi(n))).toEqual(heard);
    const wrong = q.options.find((o) => !o.correct)!;
    expect(staffNotes(wrong.figure).map((n) => noteToMidi(n))).toEqual([...heard].reverse());
  });

  it('marks the higher note right in every "which sounds higher" question', () => {
    const higher = exercises.filter((e) => e.type === 'choice' && /sounds (higher|the highest)/.test(plainText(e.prompt)));
    expect(higher.length).toBeGreaterThanOrEqual(2);
    for (const q of higher) {
      if (q.type !== 'choice' || q.figure?.kind !== 'staff') throw new Error('expected a staff figure');
      const notes = q.figure.notes.map((n) => (typeof n === 'string' ? { note: n, label: '' } : { note: n.note, label: n.label ?? '' }));
      const top = notes.reduce((a, b) => (noteToMidi(b.note) > noteToMidi(a.note) ? b : a));
      expect(plainText(q.options.find((o) => o.correct)!.text ?? '')).toBe(`Note ${top.label}`);
    }
  });
});

describe('reading-the-staff: the tune', () => {
  it('is eight full bars of 4/4, mostly quarter notes', () => {
    const beats: Record<string, number> = { q: 1, h: 2, w: 4 };
    expect(TUNE_BARS).toHaveLength(8);
    for (const bar of TUNE_BARS) expect(bar.reduce((sum, [, , , d]) => sum + beats[d], 0)).toBe(4);
    expect(TUNE).toEqual(TUNE_BARS.flat());
    expect(TUNE.filter(([, , , d]) => d === 'q').length).toBe(16);
    // It ends at home, on C.
    expect(TUNE[TUNE.length - 1][2]).toBe('C4');
  });

  it('checks two phrases of six notes that together use all eight notes', () => {
    expect(TUNE_OPENING).toEqual([...TUNE_BARS[0], ...TUNE_BARS[1]]);
    expect(TUNE_LOW).toEqual([...TUNE_BARS[4], ...TUNE_BARS[5]]);
    // A play step's tab is about 40 + 34 px per note, drawn at 125 %: six notes fit a 360 px phone.
    for (const p of [TUNE_OPENING, TUNE_LOW]) {
      expect(p.length).toBeLessThanOrEqual(6);
      expect((40 + p.length * 34) * 1.25).toBeLessThanOrEqual(360 - 32);
    }
    expect(new Set([...TUNE_OPENING, ...TUNE_LOW].map(([, , n]) => n)).size).toBe(8);
  });

  it('uses only the first-position naturals of strings 1 to 3, played where the staff says', () => {
    const naturals = new Set(['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4']);
    for (const [string, fret, pitch] of TUNE) {
      expect(midiAt({ string, fret }), pitch).toBe(noteToMidi(pitch));
      expect(naturals.has(pitch)).toBe(true);
      expect([1, 2, 3]).toContain(string);
      expect(fret).toBeLessThanOrEqual(3);
    }
    expect(new Set(TUNE.map(([, , p]) => p))).toEqual(naturals);
  });

  it('shows the tune on the staff with the notes the tab plays', () => {
    const l = lesson('reading-strings-1-to-3');
    const phrases = l.steps.filter((s) => isExercise(s) && s.type === 'play-phrase');
    expect(phrases).toHaveLength(2);
    phrases.forEach((p, i) => {
      if (!isExercise(p) || p.type !== 'play-phrase') return;
      const half = i === 0 ? TUNE_OPENING : TUNE_LOW;
      expect(staffNotes(p.figure)).toEqual(half.map(([, , n]) => n));
      expect(p.notes.map((n) => ('fret' in n ? midiAt(n) : -1))).toEqual(half.map(([, , n]) => noteToMidi(n)));
    });
  });

  it('labels the first-position fingers with their fret numbers', () => {
    const card = lesson('reading-strings-1-to-3').steps[0];
    if (isExercise(card) || 'generate' in card || card.figure?.kind !== 'fretboard') throw new Error('expected the fretboard card');
    for (const d of card.figure.dots ?? []) {
      expect(midiAt(d), `${d.string}/${d.fret}`).toBe(noteToMidi(d.note!));
      if (d.fret > 0) expect(d.finger).toBe(d.fret);
    }
  });
});
