/**
 * Unit 42 of the Theory Path, cross-checked against the engines: where every note it names is
 * written (staff places and ledger lines, as the guitar reads them) and played (string, fret and
 * position), the melodies (tab and staff agree, bars are full, keys and ranges as stated), the two
 * fingerings and their shifts, every "which position fits" claim, the 8va frets, the fill-in
 * alternatives, and what the listening question plays.
 */
import { describe, expect, it } from 'vitest';
import { noteToMidi, parseNote, scaleContains, staffPosition } from '@/core/theory';
import { midiAt, positionsForMidi, scalePositions } from '@/core/guitar';
import {
  findTargets, parseDuration, plainText, soundPlan, type CardStep, type ChoiceExercise, type Exercise, type FillBlanksExercise,
  type FretboardFindExercise, type Lesson, type ListenChoiceExercise, type PlayPhraseExercise, type StaffFigure, type Step, type TabNote,
} from '@/lessons';
import unit, {
  ABOVE_STAFF, FIFTH_HIGH, FIFTH_LOW, FIFTH_MELODY_A, FIFTH_MELODY_B, G_FIRST_POSITION, G_SECOND_POSITION, LOCO_PASSAGE, OTTAVA_PASSAGE,
  SHIFT_HEARD, SHIFT_HIDDEN, SIGHT_BARS_1_4, SIGHT_BARS_5_8, SIGHT_PIECE, type Fingered, type Note,
} from './reading-up-the-neck';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (l: Lesson): Exercise[] => l.steps.filter((s: Step): s is Exercise => !('generate' in s) && s.type !== 'card');
const cards = (l: Lesson): CardStep[] => l.steps.filter((s: Step): s is CardStep => !('generate' in s) && s.type === 'card');
const beats = (code: string): number => parseDuration(code)!.ticks / 960;
const midiOf = (pitch: string): number => noteToMidi(pitch);
const key = (p: { string: number; fret: number }): string => `${p.string}:${p.fret}`;
const answerOf = (e: ChoiceExercise | ListenChoiceExercise): string => plainText(e.options.find((o) => o.correct)?.text ?? '');

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

/** Bar lengths in beats, failing on a note that crosses a bar line. */
function bars(durations: string[], perBar: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const d of durations) {
    sum += beats(d);
    expect(sum).toBeLessThanOrEqual(perBar);
    if (sum === perBar) {
      out.push(sum);
      sum = 0;
    }
  }
  expect(sum).toBe(0);
  return out;
}

/**
 * Can every pitch be fretted with the first finger at `position` (frets position..position+3), or
 * one fret lower when `stretch` allows the first finger to reach back? Open strings do not count.
 */
function fits(midis: number[], position: number, stretch = false, open = false): boolean {
  const lo = position - (stretch ? 1 : 0);
  return midis.every((m) => positionsForMidi(m).some((p) => (open && p.fret === 0) || (p.fret > 0 && p.fret >= lo && p.fret <= position + 3)));
}
/** The pitches that do not fit `position`, even with open strings allowed. */
const misfits = (midis: number[], position: number): number[] => [...new Set(midis.filter((m) => !fits([m], position, false, true)))].sort((a, b) => a - b);

describe('reading-up-the-neck: every place it names sounds the pitch it claims', () => {
  const groups: Record<string, Note[]> = {
    FIFTH_LOW, FIFTH_HIGH, FIFTH_MELODY_A, FIFTH_MELODY_B, ABOVE_STAFF, LOCO_PASSAGE, OTTAVA_PASSAGE, SIGHT_PIECE,
  };
  it.each(Object.entries(groups))('%s: string and fret sound the written pitch', (_name, notes) => {
    for (const [string, fret, pitch] of notes) expect(midiAt({ string, fret }), `${pitch} at ${string}:${fret}`).toBe(midiOf(pitch));
  });

  it('the fingerings play the pitches they claim', () => {
    for (const [string, fret, pitch] of [...G_FIRST_POSITION, ...G_SECOND_POSITION]) expect(midiAt({ string, fret })).toBe(midiOf(pitch));
  });

  it('every staff figure, tab and phrase in the lessons draws what it says', () => {
    // Staff cards built from the note lists label each note with its fret.
    const fifth = lesson('fifth-position');
    const fretLabels = cards(fifth)
      .map((c) => c.figure)
      .filter((f): f is StaffFigure => f?.kind === 'staff' && f.notes.some((n) => typeof n !== 'string' && n.label !== undefined));
    expect(fretLabels.map((f) => f.notes.map((n) => (typeof n === 'string' ? '' : n.label)))).toEqual([
      FIFTH_LOW.map(([, fret]) => String(fret)),
      FIFTH_HIGH.map(([, fret]) => String(fret)),
    ]);
    // Every play-phrase plays exactly the notes its staff figure shows.
    for (const p of collect<PlayPhraseExercise>((v) => v.type === 'play-phrase')) {
      const shown = (p.figure as StaffFigure).notes.map((n) => midiOf(typeof n === 'string' ? n : n.note));
      const played = p.notes.map((n: TabNote) => ('rest' in n ? -1 : midiAt({ string: n.string, fret: n.fret }, { tuning: p.tuning })));
      expect(played).toEqual(shown);
    }
  });
});

describe('reading-up-the-neck: positions and how they are marked', () => {
  it('the written E in the top space sounds E4: open string 1, string 2 fret 5, string 3 fret 9', () => {
    expect(staffPosition('E4').position).toBe(7); // top space
    expect(staffPosition('E4').onLine).toBe(false);
    expect([midiAt({ string: 1, fret: 0 }), midiAt({ string: 2, fret: 5 }), midiAt({ string: 3, fret: 9 })]).toEqual([64, 64, 64]);
    expect(positionsForMidi(64, { maxFret: 9 }).map(key).sort()).toEqual(['1:0', '2:5', '3:9']);
  });

  it('the finger figure puts fingers 1 to 4 on frets 5 to 8 (fifth position)', () => {
    const fig = cards(lesson('what-a-position-is'))[1].figure;
    expect(fig?.kind).toBe('fretboard');
    const dots = fig?.kind === 'fretboard' ? fig.dots ?? [] : [];
    expect(dots.map((d) => [d.fret, d.finger])).toEqual([[5, 1], [6, 2], [7, 3], [8, 4]]);
  });

  it('asks for the E on string 2 (fret 5) and on string 3 (fret 9), and the E choices are right', () => {
    const finds = collect<FretboardFindExercise>((v) => v.type === 'fretboard-find' && JSON.stringify(v.find) === '{"note":"E4"}');
    expect(finds.map((f) => findTargets(f).map(key))).toEqual([['2:5'], ['3:9']]);
    const same = exercises(lesson('what-a-position-is')).find((e): e is ChoiceExercise => e.type === 'choice' && plainText(e.prompt).includes('same E'))!;
    expect(answerOf(same)).toBe('String 2, fret 5');
    expect(midiAt({ string: 2, fret: 7 })).toBe(midiOf('F#4'));
    expect(midiAt({ string: 3, fret: 7 })).toBe(midiOf('D4'));
    expect(midiAt({ string: 6, fret: 12 })).toBe(64 - 12); // "one octave lower"
  });
});

describe('reading-up-the-neck: fifth position', () => {
  const all = [...FIFTH_LOW, ...FIFTH_HIGH];

  it('holds exactly the natural notes between frets 4 and 8, with fret 4 used only for B on string 3', () => {
    const engine = scalePositions('A', 'minor', { minFret: 4, maxFret: 8 }).map(key).sort();
    expect(all.map(([s, f]) => `${s}:${f}`).sort()).toEqual(engine);
    expect(all.filter(([, f]) => f === 4)).toEqual([[3, 4, 'B3', 'q']]);
    expect(all.every(([, f]) => f >= 4 && f <= 8)).toBe(true);
    // The syllabus fact, string by string.
    const byString = (s: number): string => all.filter(([x]) => x === s).map(([, f, p]) => `${p.replace(/\d/, '')}${f}`).join(' ');
    expect([6, 5, 4, 3, 2, 1].map(byString)).toEqual(['A5 B7 C8', 'D5 E7 F8', 'G5 A7', 'B4 C5 D7', 'E5 F6 G8', 'A5 B7 C8']);
  });

  it('runs from A2 (second ledger line below) to C5 (second ledger line above)', () => {
    expect(all[0][2]).toBe('A2');
    expect(all[all.length - 1][2]).toBe('C5');
    expect(staffPosition('A2')).toMatchObject({ ledgerLines: -2, onLine: true, written: 'A3' });
    expect(staffPosition('C5')).toMatchObject({ ledgerLines: 2, onLine: true, written: 'C6' });
  });

  it('finds every G (string 4 fret 5, string 2 fret 8), every C and every D in the position', () => {
    const find = (note: string): string[] => {
      const ex = collect<FretboardFindExercise>((v) => v.type === 'fretboard-find' && JSON.stringify(v.find) === JSON.stringify({ note }) && JSON.stringify(v.frets) === '[4,8]')[0];
      return findTargets(ex).map(key);
    };
    expect(find('G')).toEqual(['4:5', '2:8']);
    expect(find('C')).toEqual(['6:8', '3:5', '1:8']);
    expect(find('D')).toEqual(['5:5', '3:7']);
    const top = collect<FretboardFindExercise>((v) => v.type === 'fretboard-find' && JSON.stringify(v.find) === '{"note":"C5"}' && JSON.stringify(v.frets) === '[4,8]')[0];
    expect(findTargets(top).map(key)).toEqual(['1:8']);
  });

  it('places the A of the second space at string 4, fret 7, and the B of the middle line at string 3, fret 4', () => {
    expect(staffPosition('A3').position).toBe(3); // second space
    expect(midiAt({ string: 4, fret: 7 })).toBe(midiOf('A3'));
    expect(midiAt({ string: 3, fret: 2 })).toBe(midiOf('A3')); // the first-position distractor: same pitch
    expect(midiAt({ string: 5, fret: 7 })).toBe(midiOf('E3'));
    expect(staffPosition('E3').position).toBe(0); // "written on the bottom line"
    expect(staffPosition('A4').ledgerLines).toBe(1); // string 1 fret 5: "first ledger line above"
    expect(staffPosition('B3').position).toBe(4); // middle line
    expect(midiAt({ string: 3, fret: 4 })).toBe(midiOf('B3'));
    expect(midiAt({ string: 3, fret: 6 })).toBe(midiOf('C#4'));
    expect(midiAt({ string: 4, fret: 9 })).toBe(midiOf('B3'));
  });

  it('the melody is in A minor, all in fifth position, with the B stretch in bar 7, in eight full bars', () => {
    const melody = [...FIFTH_MELODY_A, ...FIFTH_MELODY_B];
    const places = new Set(all.map(([s, f]) => `${s}:${f}`));
    for (const [s, f, p] of melody) {
      expect(places.has(`${s}:${f}`), `${p} at ${s}:${f}`).toBe(true);
      expect(scaleContains('A', 'minor', p)).toBe(true);
    }
    expect(melody[0][2]).toBe('A3');
    expect(melody[melody.length - 1][2]).toBe('A3');
    expect(bars(FIFTH_MELODY_A.map((n) => n[3]), 4)).toHaveLength(4);
    expect(bars(FIFTH_MELODY_B.map((n) => n[3]), 4)).toHaveLength(4);
    expect(FIFTH_MELODY_B.slice(3, 5).map((n) => n[2])).toEqual(['D4', 'B3']); // bar 7
    expect(FIFTH_MELODY_B[4].slice(0, 2)).toEqual([3, 4]);
    // Six notes per played phrase: a play step's tab fits a 360 px phone.
    for (const p of collect<PlayPhraseExercise>((v) => v.type === 'play-phrase')) expect(p.notes.length).toBeLessThanOrEqual(6);
    // Range A3 to C5, which the "which position suits it" question quotes.
    const midis = melody.map((n) => midiOf(n[2]));
    expect([Math.min(...midis), Math.max(...midis)]).toEqual([midiOf('A3'), midiOf('C5')]);
    // The fill-in explanations: A then C in the second and third spaces; A on the first ledger
    // line above with G in the space below it; D on the fourth line, B on the middle line.
    expect([staffPosition('A3').position, staffPosition('C4').position]).toEqual([3, 5]);
    expect(staffPosition('A4').ledgerLines).toBe(1);
    expect(staffPosition('G4').position).toBe(9);
    expect([staffPosition('D4').position, staffPosition('B3').position]).toEqual([6, 4]);
  });
});

describe('reading-up-the-neck: choosing a position', () => {
  const pitches = (f: Fingered[]): string[] => f.map((n) => `${n[2]}/${n[3]}`);
  const shifts = (f: Fingered[]): number => {
    const positions = f.filter((n) => n[1] > 0).map((n) => n[4]);
    return positions.filter((p, i) => i > 0 && p !== positions[i - 1]).length;
  };

  it('both fingerings play the same G major melody in eight full bars of 4/4', () => {
    expect(pitches(G_FIRST_POSITION)).toEqual(pitches(G_SECOND_POSITION));
    for (const n of G_SECOND_POSITION) expect(scaleContains('G', 'major', n[2])).toBe(true);
    expect(bars(G_SECOND_POSITION.map((n) => n[3]), 4)).toHaveLength(8);
  });

  it('every fretted note lies under the hand of the position it claims', () => {
    for (const [string, fret, pitch, , pos] of [...G_FIRST_POSITION, ...G_SECOND_POSITION]) {
      if (fret === 0) continue;
      expect(fret >= pos && fret <= pos + 3, `${pitch} at ${string}:${fret} in position ${pos}`).toBe(true);
    }
  });

  it('first position shifts three times (bars 3, 5 and 7); second position never shifts and uses no open string', () => {
    expect(shifts(G_FIRST_POSITION)).toBe(3);
    expect(shifts(G_SECOND_POSITION)).toBe(0);
    expect(G_SECOND_POSITION.every(([, fret]) => fret >= 2 && fret <= 5)).toBe(true);
    // Where the shifts land: the bar of each note whose position differs from the one before.
    const starts: number[] = [];
    let beat = 0;
    let last = 0;
    for (const [, fret, , d, pos] of G_FIRST_POSITION) {
      if (fret > 0) {
        if (last && pos !== last) starts.push(Math.floor(beat / 4) + 1);
        last = pos;
      }
      beat += beats(d);
    }
    expect(starts).toEqual([3, 5, 7]);
    // In second position the C of bar 2 is at string 3, fret 5 (the only C4 in frets 2 to 5).
    const ff = collect<FretboardFindExercise>((v) => v.type === 'fretboard-find' && JSON.stringify(v.find) === '{"note":"C4"}')[0];
    expect(findTargets(ff).map(key)).toEqual(['3:5']);
  });

  it('the keys fit their positions: G major frets 2 to 5, A minor 5 to 8 (plus the stretch), A major 4 to 7', () => {
    const scaleSpan = (tonic: string, scale: string, lo: number, hi: number): number[] =>
      scalePositions(tonic, scale, { minFret: lo, maxFret: hi }).map((p) => p.midi).sort((a, b) => a - b);
    // Each position holds a full run of the key, more than two octaves, with no gaps.
    for (const [tonic, scale, lo, hi] of [['G', 'major', 2, 5], ['A', 'minor', 4, 8], ['A', 'major', 4, 7]] as const) {
      const midis = [...new Set(scaleSpan(tonic, scale, lo, hi))];
      expect(midis[midis.length - 1] - midis[0]).toBeGreaterThanOrEqual(24);
      const pcsInKey = midis.length;
      expect(pcsInKey).toBeGreaterThanOrEqual(15);
    }
    // The derived figure of the card is G major in frets 2 to 5.
    expect(scalePositions('G', 'major', { minFret: 2, maxFret: 5 }).length).toBe(17);
  });

  it('every "which position" answer fits and every wrong option does not', () => {
    const range = (notes: Note[] | Fingered[]): number[] => notes.map((n) => midiOf(n[2]));
    // A minor, A3 to C5: fifth position (with its stretch); not first or second.
    const aMinor = range([...FIFTH_MELODY_A, ...FIFTH_MELODY_B]);
    expect(fits(aMinor, 5, true)).toBe(true);
    expect(fits(aMinor, 5)).toBe(false); // only the B needs the stretch
    expect(fits(aMinor.filter((m) => m !== midiOf('B3')), 5)).toBe(true);
    expect(fits(aMinor, 1, true)).toBe(false);
    expect(fits(aMinor, 2, true)).toBe(false);
    // The G major melody (G3 to A4): second position; first and fifth need more than the hand.
    const g = range(G_SECOND_POSITION);
    expect(fits(g, 2)).toBe(true);
    expect(fits(g, 1)).toBe(false);
    expect(fits(g, 5)).toBe(false);
    expect(misfits(g, 1)).toEqual([midiOf('A4')]);
    // The sight-reading piece (F#3 to A4): second position; fifth needs two stretches (F#3, B3).
    const piece = range(SIGHT_PIECE);
    expect([Math.min(...piece), Math.max(...piece)]).toEqual([midiOf('F#3'), midiOf('A4')]);
    expect(fits(piece, 2)).toBe(true);
    expect(fits(piece, 1)).toBe(false);
    expect(fits(piece, 5)).toBe(false);
    expect(misfits(piece, 5)).toEqual([midiOf('F#3')]); // "the low F# at string 4, fret 4 lies below the hand"
    expect(misfits(piece, 1)).toEqual([midiOf('A4')]); // "the high A at fret 5 lies above first position"
    // A minor: first position cannot reach the high C; second cannot reach the high B and C.
    expect(misfits(aMinor, 1)).toContain(midiOf('C5'));
    expect(misfits(aMinor, 2)).toEqual([midiOf('B4'), midiOf('C5')]);
    expect(misfits(scalePositions('A', 'minor').map((p) => p.midi).filter((m) => m >= midiOf('A3') && m <= midiOf('C5')), 2)).toEqual([midiOf('F4'), midiOf('B4'), midiOf('C5')]);
    // The checkpoint's A major melody, A2 to B4: fourth position; not first, second or fifth.
    const aMajor = scalePositions('A', 'major').map((p) => p.midi).filter((m, i, a) => m >= midiOf('A2') && m <= midiOf('B4') && a.indexOf(m) === i);
    expect(fits(aMajor, 4)).toBe(true);
    for (const p of [1, 2, 5]) expect(fits(aMajor, p), `position ${p}`).toBe(false);
    expect(misfits(aMajor, 1)).toEqual([midiOf('A4'), midiOf('B4')]);
    expect(misfits(aMajor, 5)).toEqual([midiOf('C#3'), midiOf('F#3'), midiOf('G#4')]);
    expect([midiAt({ string: 5, fret: 4 }), midiAt({ string: 4, fret: 4 }), midiAt({ string: 1, fret: 4 })]).toEqual(misfits(aMajor, 5));
    // Second position: the top B at string 1, fret 7 has no place between frets 2 and 5 (nor open).
    expect(misfits(aMajor, 2)).toContain(midiOf('B4'));
    expect(positionsForMidi(midiOf('B4')).filter((p) => p.fret === 0 || (p.fret >= 2 && p.fret <= 5))).toEqual([]);
    // Review fix: ninth position was a distractor whose "why" said the low B (string 6, fret 7) had
    // no other place. It has one (string 5, fret 2), and with the open A string ninth position holds
    // every other note of the range, so ninth position must not be offered as certainly wrong.
    expect(positionsForMidi(midiOf('B2')).map(key)).toEqual(['6:7', '5:2']);
    expect(misfits(aMajor, 9)).toEqual([midiOf('B2')]);
    const aMajorQ = unit.checkpoint!.steps!.find((s): s is ChoiceExercise => 'type' in s && s.type === 'choice' && plainText(s.prompt).includes('A major'))!;
    expect(answerOf(aMajorQ)).toBe('Fourth position');
    expect(aMajorQ.options.map((o) => plainText(o.text ?? ''))).not.toContain('Ninth position');
    expect(aMajorQ.options.map((o) => plainText(o.text ?? '')).sort()).toEqual(['Fifth position', 'First position', 'Fourth position', 'Second position']);
    // The G major home position spans F#2 (string 6) to A4 (string 1).
    const gHome = scalePositions('G', 'major', { minFret: 2, maxFret: 5 }).map((p) => p.midi);
    expect([Math.min(...gHome), Math.max(...gHome)]).toEqual([midiOf('F#2'), midiOf('A4')]);
  });

  it('the hidden shift keeps every note on the beat; the heard one delivers a note half a beat late', () => {
    const onsets = (notes: TabNote[]): number[] => soundPlan({ kind: 'tab', notes, tempo: 84 }).events.map((e) => e.at * (84 / 60));
    const pitchesOf = (notes: TabNote[]): number[] => soundPlan({ kind: 'tab', notes, tempo: 84 }).events.flatMap((e) => e.midi);
    expect(onsets(SHIFT_HIDDEN).every((b) => Math.abs(b - Math.round(b)) < 1e-6)).toBe(true);
    expect(onsets(SHIFT_HEARD).filter((b) => Math.abs(b - Math.round(b)) > 1e-6).map((b) => Math.round(b * 2) / 2)).toEqual([3.5]);
    // Same climb both times: G3 A3 B3 D4 E4 D4 G4, and the hidden one plays B3 on the open string.
    expect(pitchesOf(SHIFT_HIDDEN)).toEqual(pitchesOf(SHIFT_HEARD));
    expect(pitchesOf(SHIFT_HIDDEN)).toEqual(['G3', 'A3', 'B3', 'D4', 'E4', 'D4', 'G4'].map(midiOf));
    expect(SHIFT_HIDDEN[2]).toEqual({ string: 2, fret: 0, duration: 'q' });
    // Before the open string the hand is in second position, after it in seventh (frets 7 to 10).
    const fretsAfter = SHIFT_HIDDEN.slice(3).map((n) => ('fret' in n ? n.fret : -1));
    expect(fretsAfter.every((f) => f >= 7 && f <= 10)).toBe(true);
    const lc = exercises(lesson('choosing-a-position')).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    expect(lc.sound).toEqual({ kind: 'tab', notes: SHIFT_HEARD, tempo: 84 });
    expect(answerOf(lc)).toMatch(/^Heard/);
  });
});

describe('reading-up-the-neck: ledger lines above and 8va', () => {
  it('writes G to E above the staff on string 1, frets 3 to 12', () => {
    expect(ABOVE_STAFF.map(([, fret]) => fret)).toEqual([3, 5, 7, 8, 10, 12]);
    expect(staffPosition('F4')).toMatchObject({ position: 8, onLine: true }); // the top line
    expect(staffPosition('G4')).toMatchObject({ position: 9, ledgerLines: 0 }); // space above
    expect(staffPosition('A4')).toMatchObject({ ledgerLines: 1, onLine: true, written: 'A5' });
    expect(staffPosition('B4')).toMatchObject({ ledgerLines: 1, onLine: false });
    expect(staffPosition('C5')).toMatchObject({ ledgerLines: 2, onLine: true, written: 'C6' });
    expect(staffPosition('D5')).toMatchObject({ ledgerLines: 2, onLine: false }); // just below the third line
    expect(staffPosition('E5')).toMatchObject({ ledgerLines: 3, onLine: true, written: 'E6' });
    expect(staffPosition('E4').position).toBe(7); // the open string 1: top space
  });

  it('the card says where each note sits above the staff, and does not tie them to string 1 alone', () => {
    const card = cards(lesson('ledger-lines-above'))[0];
    const body = plainText(card.body);
    // G sits just above the staff (no ledger line); A on the first ledger line; C on the second.
    expect(body).toMatch(/G sits just above the staff, A on the first ledger line, B above it, C on the second/);
    expect(staffPosition('G4').ledgerLines).toBe(0);
    expect(staffPosition('A4')).toMatchObject({ ledgerLines: 1, onLine: true });
    expect(staffPosition('B4')).toMatchObject({ ledgerLines: 1, onLine: false });
    expect(staffPosition('C5')).toMatchObject({ ledgerLines: 2, onLine: true });
    // These notes are not "string 1 notes": fifth position plays G4 at string 2, fret 8, and
    // G4 to E5 all exist on string 2 too. The card says "On string 1 they run ...".
    for (const [, , pitch] of ABOVE_STAFF) expect(positionsForMidi(midiOf(pitch)).some((p) => p.string === 2), pitch).toBe(true);
    expect(FIFTH_HIGH).toContainEqual([2, 8, 'G4', 'q']);
    expect(body).not.toMatch(/they are string 1 notes/);
    expect(body).toMatch(/On string 1 they run from G at fret 3 up to E at fret 12/);
  });

  it('the fifth-position opening card does not claim every natural is under the four fingers', () => {
    const body = plainText(cards(lesson('fifth-position'))[0].body);
    expect(body).toMatch(/Almost every natural note/);
    // The one exception, B on string 3, is at fret 4: below finger 1 at fret 5.
    expect([...FIFTH_LOW, ...FIFTH_HIGH].filter(([, f]) => f < 5 || f > 8)).toEqual([[3, 4, 'B3', 'q']]);
  });

  it('finds the C of the second ledger line at string 1, fret 8 only', () => {
    for (const ex of collect<FretboardFindExercise>((v) => v.type === 'fretboard-find' && JSON.stringify(v.find) === '{"note":"C5"}' && JSON.stringify(v.frets) === '[0,12]')) {
      expect(findTargets(ex).map(key)).toEqual(['1:8']);
    }
  });

  it('8va moves every note an octave (12 frets) up the same string', () => {
    LOCO_PASSAGE.forEach(([s, f, p], i) => {
      const [s8, f8, p8] = OTTAVA_PASSAGE[i];
      expect(s8).toBe(s);
      expect(f8).toBe(f + 12);
      expect(midiOf(p8)).toBe(midiOf(p) + 12);
    });
    const card = cards(lesson('ledger-lines-above')).find((c) => c.title === '8va: an octave higher')!;
    const labels = (card.figure as StaffFigure).notes.map((n) => (typeof n === 'string' ? '' : n.label));
    expect(labels).toEqual(OTTAVA_PASSAGE.map(([, f]) => String(f)));
    // The 8va find questions: written G (space above) -> string 1 fret 15; written A (first ledger) -> fret 17.
    const g8 = collect<FretboardFindExercise>((v) => v.type === 'fretboard-find' && JSON.stringify(v.find) === '{"note":"G5"}')[0];
    expect(findTargets(g8).map(key)).toEqual(['1:15']);
    const a8 = collect<FretboardFindExercise>((v) => v.type === 'fretboard-find' && JSON.stringify(v.find) === '{"note":"A5"}')[0];
    expect(findTargets(a8).map(key)).toEqual(['1:17']);
    // "The 8 counts letter names": E up to the next E is eight letters.
    expect('EFGABCDE'.length).toBe(8);
  });
});

describe('reading-up-the-neck: the sight-reading piece', () => {
  it('is sixteen full bars of 3/4 in G major, all in second position', () => {
    expect(bars(SIGHT_PIECE.map((n) => n[3]), 3)).toHaveLength(16);
    expect(bars(SIGHT_BARS_1_4.map((n) => n[3]), 3)).toHaveLength(4);
    expect(bars(SIGHT_BARS_5_8.map((n) => n[3]), 3)).toHaveLength(4);
    expect([...SIGHT_BARS_1_4, ...SIGHT_BARS_5_8]).toEqual(SIGHT_PIECE.slice(0, 12));
    for (const [s, f, p] of SIGHT_PIECE) {
      expect(scaleContains('G', 'major', p)).toBe(true);
      expect(f >= 2 && f <= 5, `${p} at ${s}:${f}`).toBe(true);
    }
    expect(SIGHT_PIECE[0][2]).toBe('G3');
    expect(SIGHT_PIECE[SIGHT_PIECE.length - 1][2]).toBe('G3');
  });

  it('plays F sharp at string 1, fret 2 in bars 7 and 9, as the key-signature question says', () => {
    let beat = 0;
    const barsWithF: number[] = [];
    for (const [s, f, p, d] of SIGHT_PIECE) {
      if (p === 'F#4') {
        expect([s, f]).toEqual([1, 2]);
        barsWithF.push(Math.floor(beat / 3) + 1);
      }
      if (p === 'F#3') expect([s, f, Math.floor(beat / 3) + 1]).toEqual([4, 4, 15]);
      beat += beats(d);
    }
    expect(barsWithF).toEqual([7, 9]);
    expect(staffPosition('F#4').position).toBe(8); // written on the top line, where the sharp of the signature sits
    // The key-signature figure shows bars 7 to 9: three full bars, with both F sharps.
    const shown = SIGHT_PIECE.slice(9, 14);
    expect(bars(shown.map((n) => n[3]), 3)).toHaveLength(3);
    expect(shown.filter((n) => n[2] === 'F#4')).toHaveLength(2);
    expect(parseNote(shown[1][2])?.name).toBe('F#4');
  });

  it('the read bars match the fill-in explanations: D on the fourth line, C and A in the spaces, F sharp on the top line', () => {
    expect(SIGHT_BARS_1_4.map((n) => n[2])).toEqual(['G3', 'B3', 'D4', 'C4', 'A3', 'B3']);
    expect(SIGHT_BARS_5_8.map((n) => n[2])).toEqual(['G3', 'A3', 'C4', 'E4', 'F#4', 'D4']);
    expect([staffPosition('D4').position, staffPosition('C4').position, staffPosition('A3').position]).toEqual([6, 5, 3]);
  });
});

describe('reading-up-the-neck: the fill-in alternatives spell their phrases', () => {
  const names = (text: string, blanks: string[]): string[] => {
    let i = 0;
    return [...text.matchAll(/\{n:([A-G][#b]?)\}|___/g)].map((m) => (m[0] === '___' ? blanks[i++].replace(/\{n:|\}/g, '') : m[1]));
  };
  it.each(collect<PlayPhraseExercise>((v) => v.type === 'play-phrase' && (v.alternative as { type?: string })?.type === 'fill-blanks').map((p, i) => [i, p] as const))(
    'phrase %i',
    (_i, phrase) => {
      const fill = phrase.alternative as FillBlanksExercise;
      const played = phrase.notes.filter((n): n is Extract<TabNote, { string: number }> => !('rest' in n)).map((n) => midiAt({ string: n.string, fret: n.fret }) % 12);
      const spelled = names(String(fill.text), fill.blanks).map((n) => parseNote(n)!.chroma);
      expect(spelled).toEqual(played);
      // The wrong bank words really are wrong for every blank.
      const blankPcs = fill.blanks.map((b) => parseNote(b.replace(/\{n:|\}/g, ''))!.chroma);
      for (const [k, w] of (fill.bank ?? []).entries()) expect(blankPcs, `bank word ${k}`).not.toContain(parseNote(w.replace(/\{n:|\}/g, ''))!.chroma);
      // The figure is the phrase itself.
      expect(fill.figure).toEqual(phrase.figure);
    },
  );
});

describe('reading-up-the-neck: the facts and checkpoint answers', () => {
  it('each staff-read answer is the note shown', () => {
    for (const ex of collect<{ type: string; note: string; options: string[] }>((v) => v.type === 'staff-read')) {
      expect(ex.options).toContain(ex.note.replace(/\d/, ''));
    }
  });

  it('the position facts: seventh position puts finger 1 on fret 7, ninth covers frets 9 to 12', () => {
    const seventh = exercises(lesson('what-a-position-is')).find((e): e is ChoiceExercise => e.type === 'choice' && plainText(e.prompt).includes('seventh'))!;
    expect(answerOf(seventh)).toBe('Fret 7');
    const ninth = unit.checkpoint!.steps!.find((s): s is ChoiceExercise => 'type' in s && s.type === 'choice' && plainText(s.prompt).includes('ninth'))!;
    expect(answerOf(ninth)).toBe('Fret 9');
  });

  it('the highest note of fifth position sounds C5 at string 1, fret 8', () => {
    expect(midiAt({ string: 1, fret: 8 })).toBe(midiOf('C5'));
    expect(Math.max(...[...FIFTH_LOW, ...FIFTH_HIGH].map((n) => midiOf(n[2])))).toBe(midiOf('C5'));
  });
});
