/**
 * Unit 23 of the Theory Path, cross-checked against the engines: where every note it names is
 * written (staff positions and ledger lines, as the guitar reads them) and played (first-position
 * frets), the phrases (tab and staff agree note for note, bars are full, strings and frets as the
 * syllabus says), the accidentals the bar figures print, and what the listening question plays.
 */
import { describe, expect, it } from 'vitest';
import { diatonicChords, midiToNote, noteToMidi, staffPosition } from '@/core/theory';
import { midiAt, positionsForNote } from '@/core/guitar';
import { measureAccidentals } from '@/ui/music/notation/model';
import {
  GLOSSARY, findTargets, parseDuration, plainText, soundPlan, type CardStep, type Exercise, type FretboardFindExercise, type Lesson, type ListenChoiceExercise,
  type PlayPhraseExercise, type StaffFigure, type StaffNote, type Step, type TabNote,
} from '@/lessons';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './reading-first-position';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (l: Lesson): Exercise[] => l.steps.filter((s: Step): s is Exercise => !('generate' in s) && s.type !== 'card');
const cards = (l: Lesson): CardStep[] => l.steps.filter((s: Step): s is CardStep => !('generate' in s) && s.type === 'card');
const phrases = (l: Lesson): PlayPhraseExercise[] => exercises(l).filter((e): e is PlayPhraseExercise => e.type === 'play-phrase');
const staffNotes = (f: StaffFigure): StaffNote[] => f.notes.map((n) => (typeof n === 'string' ? { note: n } : n));
const played = (n: TabNote): number => ('rest' in n ? -1 : midiAt({ string: n.string, fret: n.fret }));
const beats = (code: string | undefined): number => parseDuration(code ?? 'q')!.ticks / 960;
/** First-position places of a sounding note (frets 0 to 4). */
const firstPosition = (note: string): string[] => positionsForNote(note, { maxFret: 4 }).map((p) => `${p.string}:${p.fret}`);

/** Every object of the unit that matches `test`, wherever it sits (steps, alternatives, facts, checkpoint). */
function collect<T>(test: (v: Record<string, unknown>) => boolean): T[] {
  const out: T[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      if (test(value as Record<string, unknown>)) out.push(value as T);
      Object.values(value).forEach(walk);
    }
  };
  walk(unit);
  return out;
}

describe('reading-first-position: where each note is written', () => {
  // [sounding pitch, staff position (0 = bottom line), ledger lines (negative = below)]
  const places: Array<[string, number, number]> = [
    ['E2', -7, -3], // hangs below the third ledger line
    ['F2', -6, -3], // on the third ledger line
    ['G2', -5, -2], // hangs from the second ledger line, one space above F
    ['B2', -3, -1], // just below the first ledger line
    ['C3', -2, -1], // on the first ledger line
    ['D3', -1, 0], // just below the staff
    ['E3', 0, 0], // bottom line
    ['F3', 1, 0], // bottom space
    ['G3', 2, 0], // second line
    ['A3', 3, 0], // second space
    ['Bb3', 4, 0], // middle line, with a flat
    ['C#4', 5, 0], // third space, with a sharp
    ['D4', 6, 0], // fourth line
    ['Eb4', 7, 0], // top space, with a flat
    ['F4', 8, 0], // top line
    ['F#4', 8, 0], // top line, with a sharp
    ['G4', 9, 0], // the space above the top line
  ];
  it.each(places)('%s sits at position %i with %i ledger lines', (note, position, ledger) => {
    const p = staffPosition(note);
    expect(p.position).toBe(position);
    expect(p.ledgerLines).toBe(ledger);
  });

  it('writes guitar notes an octave above where they sound', () => {
    expect(staffPosition('E2').written).toBe('E3');
    expect(staffPosition('C3').written).toBe('C4');
  });

  it('puts stems up below the middle line and down above it, as the stems card says', () => {
    for (const n of ['G3', 'A3']) expect(staffPosition(n).stem).toBe('up');
    for (const n of ['C4', 'D4', 'E4']) expect(staffPosition(n).stem).toBe('down');
    expect(staffPosition('B3').stem).toBe('down'); // the middle line: "usually down"
    const card = cards(lesson('rhythm-on-the-staff')).find((c) => c.title === 'Stems up, stems down');
    if (card?.figure?.kind !== 'staff') throw new Error('no stems card');
    for (const n of staffNotes(card.figure)) expect(staffPosition(n.note).stem, n.note).toBe(n.label);
  });
});

describe('reading-first-position: where each note is played in first position', () => {
  const frets: Array<[string, string]> = [
    ['E2', '6:0'], ['F2', '6:1'], ['G2', '6:3'], ['Ab2', '6:4'],
    ['A2', '5:0'], ['B2', '5:2'], ['C3', '5:3'],
    ['D3', '4:0'], ['E3', '4:2'], ['F3', '4:3'], ['F#3', '4:4'],
    ['G#3', '3:1'], ['Bb3', '3:3'],
    ['C#4', '2:2'], ['Eb4', '2:4'],
    ['F4', '1:1'], ['F#4', '1:2'],
  ];
  it.each(frets)('%s is at string:fret %s, and only there', (note, place) => {
    expect(firstPosition(note)).toEqual([place]);
  });

  it('asks every fretboard-find for one place, the one its explanation names', () => {
    const finds = collect<FretboardFindExercise>((v) => v.type === 'fretboard-find');
    expect(finds.length).toBeGreaterThanOrEqual(6);
    for (const f of finds) {
      const targets = findTargets(f);
      expect(targets, plainText(f.prompt)).toHaveLength(1);
      const [t] = targets;
      expect(plainText(f.explain).toLowerCase(), plainText(f.prompt)).toContain(t.fret === 0 ? `open` : `string ${t.string}, fret ${t.fret}`);
      // A staff beside the question shows the very note to find.
      if (f.figure?.kind === 'staff' && 'note' in f.find) expect(staffNotes(f.figure).map((n) => n.note)).toContain(f.find.note);
    }
  });
});

describe('reading-first-position: the phrases', () => {
  it('writes the same notes in the staff and the tab of every play-phrase', () => {
    const all = unit.lessons.flatMap(phrases);
    expect(all).toHaveLength(3);
    for (const p of all) {
      // A play step draws its tab at full width: six notes or fewer fit a 360 px phone.
      expect(p.notes.length, plainText(p.prompt)).toBeLessThanOrEqual(6);
      if (p.figure?.kind !== 'staff') throw new Error('a reading phrase shows its staff');
      const written = staffNotes(p.figure);
      expect(written.map((n) => noteToMidi(n.note))).toEqual(p.notes.map(played));
      expect(written.map((n) => n.duration)).toEqual(p.notes.map((n) => n.duration));
    }
  });

  it('plays an eight-bar melody on strings 4 to 6, frets 0 to 3, in full bars of 4/4', () => {
    const halves = phrases(lesson('strings-4-to-6'));
    expect(halves).toHaveLength(2);
    const notes = halves.flatMap((h) => h.notes);
    expect(notes.every((n) => 'string' in n && n.string >= 4 && n.fret <= 3)).toBe(true);
    const lengths = notes.map((n) => beats(n.duration));
    const bars: number[] = [];
    let sum = 0;
    for (const l of lengths) {
      sum += l;
      if (sum >= 4) {
        bars.push(sum);
        sum = 0;
      }
    }
    expect(bars).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
    expect(sum).toBe(0);
    // Only natural notes, and each half comes home to A.
    for (const half of halves) {
      const names = half.notes.map((n) => midiToNote(played(n), { octave: false }));
      expect(names.every((n) => n.length === 1)).toBe(true);
      expect(names.at(-1)).toBe('A');
      // The alternative reads the same four bars, in order, from the same staff.
      const alt = half.alternative;
      if (alt && !('generate' in alt) && alt.type === 'order') {
        expect(alt.tiles.map((t) => plainText(t))).toEqual(names);
        expect(alt.figure).toEqual(half.figure);
      } else throw new Error('the melody falls back to an order question');
    }
    // Together the halves are the eight bars the card shows.
    const [card] = cards(lesson('strings-4-to-6')).filter((c) => c.title === 'Read a melody');
    if (card?.figure?.kind !== 'staff') throw new Error('no melody card');
    expect(staffNotes(card.figure).map((n) => noteToMidi(n.note))).toEqual(notes.map(played));
  });

  it('plays the two rhythm bars on strings 1 to 3, frets 0 to 3, with the tapped rhythm', () => {
    const [bars] = phrases(lesson('rhythm-on-the-staff'));
    expect(bars.notes.every((n) => 'string' in n && n.string <= 3 && n.fret <= 3)).toBe(true);
    const tap = exercises(lesson('rhythm-on-the-staff')).find((e) => e.type === 'tap-rhythm');
    if (tap?.type !== 'tap-rhythm') throw new Error('no tap');
    const pattern = bars.notes.map((n) => n.duration);
    expect(tap.rhythm.pattern.replace(/\s*\|\s*/g, ' ').split(' ')).toEqual(pattern);
    expect(pattern.slice(0, 3).reduce((s, d) => s + beats(d), 0)).toBe(4);
    expect(pattern.slice(3).reduce((s, d) => s + beats(d), 0)).toBe(4);
    // A dotted quarter and beamed eighths, as the card says.
    expect(pattern).toContain('q.');
    expect(pattern.join(' ')).toContain('e e');
  });

  it('keeps the dynamics phrase on strings 1 and 2, frets 0 to 3, in four full bars', () => {
    const [card] = cards(lesson('dynamics-and-articulation'));
    if (card?.figure?.kind !== 'staff') throw new Error('no phrase');
    const notes = staffNotes(card.figure);
    expect(notes.reduce((s, n) => s + beats(n.duration), 0)).toBe(16);
    for (const n of notes) {
      const place = positionsForNote(n.note, { maxFret: 3 }).filter((p) => p.string <= 2);
      expect(place.length, n.note).toBeGreaterThan(0);
    }
  });
});

describe('reading-first-position: accidentals in a bar', () => {
  /** The accidental each note of a 4/4 staff figure prints, bar by bar. */
  const printed = (f: StaffFigure): Array<string | null> => {
    const out: Array<string | null> = [];
    let bar: StaffNote[] = [];
    let used = 0;
    const flush = () => {
      out.push(...measureAccidentals(bar.map((n) => ({ keys: [n.note] })), 0).map((g) => g[0]));
      bar = [];
      used = 0;
    };
    for (const n of staffNotes(f)) {
      bar.push(n);
      used += beats(n.duration);
      if (used >= 4) flush();
    }
    if (bar.length) flush();
    return out;
  };
  const figures = lesson('accidentals-in-a-bar').steps.map((s) => ('figure' in s ? s.figure : undefined)).filter((f): f is StaffFigure => f?.kind === 'staff' && f.time === '4/4');

  it('prints a sharp once per bar and none on the repeated note (the first card)', () => {
    expect(printed(figures[0])).toEqual(['#', null, null, null, null, null]);
    expect(staffNotes(figures[0]).map((n) => n.note)).toEqual(['F#3', 'G3', 'F#3', 'E3', 'F3', 'G3']);
  });

  it('leaves the third note of the question bar unsigned, though it is F sharp', () => {
    expect(staffNotes(figures[1]).map((n) => n.note)).toEqual(['F#3', 'G3', 'F#3', 'A3']);
    expect(printed(figures[1])).toEqual(['#', null, null, null]);
  });

  it('keeps the top-line F plain after a sharp in the bottom space', () => {
    expect(printed(figures[2])).toEqual(['#', null, null, null]);
    expect(staffNotes(figures[2])[2].note).toBe('F4');
    expect(printed(figures[3])).toEqual(['#', null, null]);
  });

  it('prints a natural sign once to cancel the sharp', () => {
    expect(printed(figures[4])).toEqual(['#', null, 'n', null, null]);
  });

  it('plays the unsigned F sharp of the bar question at string 4, fret 4', () => {
    const find = exercises(lesson('accidentals-in-a-bar')).find((e): e is FretboardFindExercise => e.type === 'fretboard-find')!;
    if (find.figure?.kind !== 'staff') throw new Error('no staff');
    expect(printed(find.figure)).toEqual(['#', null, null]);
    expect(findTargets(find).map((t) => `${t.string}:${t.fret}`)).toEqual(['4:4']);
  });

  it('prints the checkpoint bar with one sharp on C', () => {
    const q = unit.checkpoint!.steps!.find((s) => !('generate' in s) && s.type === 'choice' && s.figure?.kind === 'staff' && s.figure.time === '4/4');
    if (!q || 'generate' in q || q.figure?.kind !== 'staff') throw new Error('no bar question');
    expect(printed(q.figure)).toEqual(['#', null, null, null]);
    expect(firstPosition('C#4')).toEqual(['2:2']);
  });
});

describe('reading-first-position: the fixes of the review', () => {
  it('never lists the right answer first in a question that keeps its order, except up/down', () => {
    // Unshuffled options show as written. Up before down is a natural order; anywhere else an
    // answer that is always first could be picked by position alone.
    const natural = new Set(['Up, on the right|Down, on the left']);
    const fixed = collect<Extract<Exercise, { type: 'choice' }>>((v) => v.type === 'choice' && v.shuffle === false);
    expect(fixed.length).toBeGreaterThan(2);
    for (const c of fixed) {
      const order = c.options.map((o) => plainText(o.text ?? '')).join('|');
      if (natural.has(order)) continue;
      expect(c.options.findIndex((o) => o.correct), plainText(c.prompt)).toBeGreaterThan(0);
    }
    // Both stem questions keep up before down, so the answer moves with the question.
    const stems = fixed.filter((c) => natural.has(c.options.map((o) => plainText(o.text ?? '')).join('|')));
    expect(new Set(stems.map((c) => c.options.findIndex((o) => o.correct)))).toEqual(new Set([0, 1]));
  });

  it('plays the road-map example as its card says: A, A again, then B, all in G major', () => {
    const [card] = cards(lesson('the-road-map'));
    if (card?.figure?.kind !== 'audio' || card.figure.sound.kind !== 'progression') throw new Error('no example to hear');
    const tags = [...plainText(card.figure.caption ?? '').matchAll(/\(([^)]+)\)/g)].map((m) => m[1].split(' '));
    expect(tags).toHaveLength(2);
    const [a, b] = tags;
    expect(card.figure.sound.chords).toEqual([...a, ...a, ...b]);
    const inG = diatonicChords('G major').map((c) => c.symbol);
    for (const c of [...a, ...b]) expect(inG, c).toContain(c);
    expect(a.at(-1)).toBe('G');
    expect(b.at(-1)).toBe('G');
  });

  it('counts down from the first ledger line to the low G, as the staff-place hint says', () => {
    const place = exercises(lesson('strings-4-to-6')).find((e) => e.type === 'staff-place');
    if (place?.type !== 'staff-place') throw new Error('no staff-place');
    const named = [...(place.hint ? plainText(place.hint) : '').matchAll(/\b([A-G])\b/g)].map((m) => m[1]);
    expect(named).toEqual(['G', 'C', 'B', 'A', 'G']);
    // C3 on the first ledger line, then one step down each time to G2.
    expect(['C3', 'B2', 'A2', 'G2'].map((n) => staffPosition(n).position)).toEqual([-2, -3, -4, -5]);
    expect(midiAt({ string: 6, fret: 3 })).toBe(noteToMidi('G2'));
  });

  it('puts the C in the third space an octave above the ledger-line C, at string 2, fret 1', () => {
    expect(staffPosition('C4').position).toBe(5); // the third space
    expect(noteToMidi('C4') - noteToMidi('C3')).toBe(12);
    expect(midiAt({ string: 2, fret: 1 })).toBe(noteToMidi('C4'));
  });

  it('links only glossary terms that exist', () => {
    const known = new Set([...GLOSSARY, ...THEORY_GLOSSARY].map((t) => t.id));
    const ids = collect<Record<string, unknown>>(() => true).flatMap((v) => Object.values(v).filter((x): x is string => typeof x === 'string'))
      .flatMap((s) => [...s.matchAll(/\{t:([a-z0-9-]+)/g)].map((m) => m[1]));
    expect(ids).toContain('tie');
    for (const id of ids) expect(known.has(id), id).toBe(true);
  });
});

describe('reading-first-position: staccato and tenuto by ear', () => {
  it('plays the staccato question short, with a gap after every note', () => {
    const q = exercises(lesson('dynamics-and-articulation')).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    const events = soundPlan(q.sound).events;
    expect(events).toHaveLength(4);
    for (let i = 1; i < events.length; i++) expect(events[i - 1].at + events[i - 1].duration).toBeLessThan(events[i].at - 0.1);
    expect(plainText(q.options.find((o) => o.correct)!.text!)).toMatch(/^Staccato/);
  });

  it('plays the card example short, then held (each note lasts until the next)', () => {
    const card = cards(lesson('dynamics-and-articulation')).find((c) => c.title === 'Short or held');
    if (card?.figure?.kind !== 'audio') throw new Error('no audio');
    const events = soundPlan(card.figure.sound).events;
    expect(events).toHaveLength(8);
    const gaps = events.slice(1).map((e, i) => e.at - (events[i].at + events[i].duration));
    expect(gaps.slice(0, 3).every((g) => g > 0.1)).toBe(true);
    expect(gaps.slice(4).every((g) => Math.abs(g) < 0.01)).toBe(true);
  });
});
