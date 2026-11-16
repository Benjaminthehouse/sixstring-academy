/**
 * Unit 40 of the Theory Path, cross-checked against the engines: every fret, note and degree on
 * the neck, which chords leave the key, the guide tones of each ii-V-I, the approach notes and
 * enclosures (spelled as the engine spells a half step below), the arpeggios a third up and the
 * degrees they give, the side-slipped phrase and the tritone substitute, what each listening
 * question plays, and that every lesson still teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import { chordNotes, chordPcs, chordTones, diatonicChords, intervalBetween, scaleNotes, semitones, transpose, tritoneSubstitute } from '@/core/theory';
import { buildVoicing, midiAt, noteAt } from '@/core/guitar';
import {
  formatProblems, isGenerated, plainText, resolveFigure, tokenize, validateCourse,
  type ChoiceExercise, type Exercise, type FillBlanksExercise, type Lesson, type ListenChoiceExercise, type MatchPairsExercise,
  type OrderExercise, type PlayPhraseExercise, type RichText, type Step, type TabNote, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './playing-the-changes';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (steps: readonly unknown[]): Exercise[] =>
  (steps as Step[]).filter((s): s is Exercise => !!s && typeof s === 'object' && !isGenerated(s) && s.type !== 'card');
const allExercises = (): Exercise[] => {
  const top = [
    ...unit.lessons.flatMap((l) => [...exercises(l.steps), ...exercises((l.facts ?? []).map((f) => f.ask))]),
    ...exercises(unit.checkpoint?.steps ?? []),
  ];
  return [...top, ...exercises(top.flatMap((e) => ('alternative' in e ? [e.alternative] : [])))];
};
const plain = (t: RichText): string => plainText(t, { format: { ascii: true } });
const correct = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): string => plain(e.options.find((o) => o.correct)?.text ?? '');
const inLesson = (id: string): Exercise[] => [...exercises(lesson(id).steps), ...exercises((lesson(id).facts ?? []).map((f) => f.ask))];
const listens = (steps: readonly unknown[]): ListenChoiceExercise[] => exercises(steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const findIn = <T extends Exercise>(pool: Exercise[], type: T['type'], text: RegExp): T => {
  const found = pool.find((e) => e.type === type && text.test(plain(('prompt' in e ? e.prompt : undefined) ?? '')));
  if (!found) throw new Error(`no ${type} matching ${text}`);
  return found as T;
};
function tagged(text: RichText, type: 'chord' | 'note' | 'key' | 'degree'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}
const pc = (note: string): number => chordPcs(note)[0];
const semis = (interval: string): number => ((semitones(interval) % 12) + 12) % 12;
const notesOf = (tab: readonly TabNote[]): number[] => tab.flatMap((x) => ('rest' in x ? [] : [midiAt(x)]));
const pcsOf = (tab: readonly TabNote[]): number[] => notesOf(tab).map((m) => m % 12);
const tabOf = (e: ListenChoiceExercise): TabNote[] => (e.sound.kind === 'tab' ? e.sound.notes : []);
const BEATS: Record<string, number> = { w: 4, 'h.': 3, h: 2, 'q.': 1.5, q: 1, e: 0.5 };
/** The notes that start each bar of 4/4 (rests skipped), and the bar lengths. */
function downbeats(tab: readonly TabNote[]): { first: number[]; bars: number[] } {
  const first: number[] = [];
  const bars: number[] = [];
  let t = 0;
  let bar = 0;
  for (const x of tab) {
    if (t === 0 && !('rest' in x)) first.push(midiAt(x));
    t += BEATS[x.duration];
    if (t >= 4) {
      bars.push(t);
      bar++;
      t = 0;
    }
  }
  if (t > 0) bars.push(t);
  return { first, bars: bar >= 0 ? bars : [] };
}
const third = (c: string): string => chordTones(c).find((t) => t.role === 'third')!.note;
const seventh = (c: string): string => chordTones(c).find((t) => t.role === 'seventh')!.note;
const keyChords = (k: string): string[] => diatonicChords(k).map((c) => c.symbol);
const inKey = (chord: string, k: string): boolean => {
  const scale = scaleNotes(k.split(' ')[0], k.endsWith('minor') ? 'minor' : 'major').map(pc);
  return chordPcs(chord).every((p) => scale.includes(p));
};

describe('playing-the-changes: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'expert', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^changes-/);
  });

  it('plays every heard line in whole bars of 4/4, so beat 1 is where the text says', () => {
    const tabs: TabNote[][] = [];
    for (const e of allExercises()) if (e.type === 'listen-choice' && e.sound.kind === 'tab') tabs.push(e.sound.notes);
    for (const l of unit.lessons) for (const s of l.steps) {
      if (!isGenerated(s) && s.type === 'card' && s.figure?.kind === 'audio' && s.figure.sound.kind === 'tab') tabs.push(s.figure.sound.notes);
    }
    expect(tabs.length).toBeGreaterThan(10);
    for (const tab of tabs) for (const b of downbeats(tab).bars) expect(b, JSON.stringify(tab)).toBe(4);
  });

  it('keeps every play step short and evenly spaced, so its tab fits a phone screen', () => {
    for (const e of allExercises().filter((x): x is PlayPhraseExercise => x.type === 'play-phrase')) {
      expect(e.notes.length, plain(e.prompt)).toBeLessThanOrEqual(6);
      const total = e.notes.reduce((t, x) => t + BEATS[x.duration], 0);
      const shortest = Math.min(...e.notes.map((x) => BEATS[x.duration]));
      // The tab spreads notes by time over about 34 px a note: keep every gap at 18 px or more.
      expect((shortest / total) * (Math.max(4, e.notes.length) * 34 - 18), plain(e.prompt)).toBeGreaterThanOrEqual(18);
    }
  });
});

describe('playing-the-changes: horizontal and vertical', () => {
  it('shows C major pentatonic at frets 7 to 10 with the root at string 6, fret 8', () => {
    const card = lesson('horizontal-and-vertical').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected the scale');
    const dots = resolveFigure(card.figure)!;
    if (dots.kind !== 'fretboard') throw new Error('expected a fretboard');
    expect([...new Set(dots.dots.map((d) => d.note))].sort()).toEqual([...scaleNotes('C', 'major-pentatonic')].sort());
    expect(dots.dots.some((d) => d.string === 6 && d.fret === 8 && d.note === 'C')).toBe(true);
    expect(dots.dots.every((d) => d.fret >= 7 && d.fret <= 10)).toBe(true);
  });

  it('finds the one chord that leaves the key, and its outside note', () => {
    for (const c of ['C', 'Am', 'F', 'G']) expect(inKey(c, 'C major'), c).toBe(true);
    const q = findIn<ChoiceExercise>(inLesson('horizontal-and-vertical'), 'choice', /needs a note from outside C major/);
    for (const o of q.options) expect(!inKey(tagged(o.text!, 'chord')[0], 'C major'), plain(o.text!)).toBe(!!o.correct);
    expect(third('A7')).toBe('C#');
    expect(noteAt({ string: 6, fret: 9 }, { octave: false, context: { chord: 'A7' } })).toBe('C#');
    const g = findIn<ChoiceExercise>(allExercises(), 'choice', /leaves G major/);
    for (const o of g.options) expect(!inKey(tagged(o.text!, 'chord')[0], 'G major'), plain(o.text!)).toBe(!!o.correct);
    const f = findIn<ChoiceExercise>(allExercises(), 'choice', /leaves F major/);
    for (const o of f.options) expect(!inKey(tagged(o.text!, 'chord')[0], 'F major'), plain(o.text!)).toBe(!!o.correct);
    expect(['Am', 'Dm', 'Em'].every((c) => inKey(c, 'A minor'))).toBe(true);
  });

  it('labels the A7 tones in position by degree', () => {
    const card = lesson('horizontal-and-vertical').steps[2];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected A7');
    const tones = chordTones('A7');
    for (const d of card.figure.dots!) {
      const t = tones.find((x) => pc(x.note) === midiAt(d) % 12)!;
      expect(t.degree, `${d.string}:${d.fret}`).toBe(d.degree);
    }
  });

  it('plays C, A7 and Dm tones in the vertical line, and the A7 arpeggio into F', () => {
    const [q] = listens(lesson('horizontal-and-vertical').steps);
    const tab = tabOf(q);
    const bars = [tab.slice(0, 4), tab.slice(4, 8), tab.slice(8)];
    ['C', 'A7', 'Dm'].forEach((c, i) => {
      for (const p of pcsOf(bars[i])) expect(chordPcs(c), c).toContain(p);
    });
    expect(pcsOf(tab)).toContain(pc('C#'));
    expect(correct(q)).toBe('It followed each chord');
    const play = findIn<PlayPhraseExercise>(inLesson('horizontal-and-vertical'), 'play-phrase', /Over A7/);
    const m = notesOf(play.notes);
    expect(m.slice(0, 4).map((x) => x % 12).sort()).toEqual([...chordPcs('A7')].sort());
    expect(m.at(-1)! % 12).toBe(pc(third('Dm')));
    expect(m.at(-2)! - m.at(-1)!).toBe(2); // G falls a whole step to F
  });
});

describe('playing-the-changes: guide-tone lines', () => {
  it('spells both guide-tone lines through Dm7 G7 Cmaj7 and Gm7 C7 Fmaj7', () => {
    expect([third('Dm7'), seventh('G7'), third('Cmaj7')]).toEqual(['F', 'F', 'E']);
    expect([seventh('Dm7'), third('G7'), seventh('Cmaj7')]).toEqual(['C', 'B', 'B']);
    expect([third('Gm7'), seventh('C7'), third('Fmaj7')]).toEqual(['Bb', 'Bb', 'A']);
    const other = findIn<FillBlanksExercise>(inLesson('guide-tone-lines'), 'fill-blanks', /starts on the 7th/);
    expect([...tagged(other.text, 'note'), ...other.blanks.flatMap((b) => tagged(b, 'note'))]).toEqual(['C', 'B', 'B']);
    for (const b of other.bank ?? []) expect([seventh('Cmaj7'), third('Cmaj7')]).not.toContain(tagged(b, 'note')[0]);
    const fill = findIn<FillBlanksExercise>(allExercises(), 'fill-blanks', /starting on the 3rd of Dm7/);
    expect(fill.blanks.flatMap((b) => tagged(b, 'note'))).toEqual(['F', 'F', 'E']);
    const gm = findIn<FillBlanksExercise>(allExercises(), 'fill-blanks', /Gm7 C7 Fmaj7/);
    expect([...tagged(gm.text, 'note'), ...gm.blanks.flatMap((b) => tagged(b, 'note'))]).toEqual(['Bb', 'Bb', 'A']);
    expect(findIn<TypeAnswerExercise>(inLesson('guide-tone-lines'), 'type-answer', /7th of G7/).answer.value).toBe(seventh('G7'));
    expect(findIn<TypeAnswerExercise>(allExercises(), 'type-answer', /3rd of G7/).answer.value).toBe(third('G7'));
  });

  it('plays F F E on string 2 at frets 6, 6, 5', () => {
    const play = findIn<PlayPhraseExercise>(inLesson('guide-tone-lines'), 'play-phrase', /guide-tone line on string 2/);
    expect(play.notes.map((x) => ('rest' in x ? -1 : x.fret))).toEqual([6, 6, 5]);
    expect(notesOf(play.notes)).toEqual([65, 65, 64]); // F4 F4 E4
  });

  it('starts every bar of the decorated line and the solo on its guide tone, and the other solo on roots', () => {
    const decorated = lesson('guide-tone-lines').steps[4];
    if (isGenerated(decorated) || decorated.type !== 'card' || decorated.figure?.kind !== 'audio' || decorated.figure.sound.kind !== 'tab') throw new Error('expected the line');
    const guides = [third('Dm7'), seventh('G7'), third('Cmaj7')].map(pc);
    expect(downbeats(decorated.figure.sound.notes).first.map((m) => m % 12)).toEqual(guides);
    const [solo] = listens(lesson('guide-tone-lines').steps);
    expect(downbeats(tabOf(solo)).first.map((m) => m % 12)).toEqual(guides);
    expect(correct(solo)).toBe('On a guide tone');
    const roots = listens(unit.checkpoint!.steps!).find((e) => /guide tone, or on the root/.test(plain(e.prompt)))!;
    expect(downbeats(tabOf(roots)).first.map((m) => m % 12)).toEqual(['D', 'G', 'C'].map(pc));
    expect(correct(roots)).toBe('On the root');
    // Every note of the decorated line belongs to its bar's chord or the key of C.
    for (const p of pcsOf(decorated.figure.sound.notes)) expect(scaleNotes('C', 'major').map(pc)).toContain(p);
  });
});

describe('playing-the-changes: approach notes and enclosures', () => {
  const below = (n: string): string => transpose(n, '-m2');

  it('spells each half step below with the letter below', () => {
    expect(['A', 'G', 'D', 'E', 'B', 'C'].map(below)).toEqual(['G#', 'F#', 'C#', 'D#', 'A#', 'B']);
    for (const e of allExercises().filter((x): x is TypeAnswerExercise => x.type === 'type-answer' && /half step below/.test(plain(x.prompt)))) {
      expect(e.answer.value, plain(e.prompt)).toBe(below(tagged(e.prompt, 'note')[0]));
    }
  });

  it('names the scale step above each target', () => {
    const above = (n: string): string => {
      const scale = scaleNotes('C', 'major');
      return scale[(scale.indexOf(n) + 1) % 7];
    };
    expect(above('E')).toBe('F');
    expect(above('G')).toBe('A');
    expect(above('A')).toBe('B');
    expect(above('C')).toBe('D');
    expect(above('B')).toBe('C');
    for (const q of [findIn<ChoiceExercise>(allExercises(), 'choice', /approach from above into E/), findIn<ChoiceExercise>(allExercises(), 'choice', /approach from above into G/)]) {
      const target = tagged(q.prompt, 'note')[0];
      expect(correct(q), target).toBe(above(target));
    }
    // Every enclosure in order: the scale note above, the half step below, the target.
    for (const e of allExercises().filter((x): x is OrderExercise => x.type === 'order' && /enclosure/.test(plain(x.prompt)))) {
      const [a, b, t] = e.tiles.map((x) => tagged(x, 'note')[0]);
      expect(a, plain(e.prompt)).toBe(above(t));
      expect(b, plain(e.prompt)).toBe(below(t));
    }
    const a = findIn<ChoiceExercise>(inLesson('enclosures'), 'choice', /Enclose A/);
    expect(correct(a)).toBe(`${above('A')}, then ${below('A')}`);
  });

  it('places the approach and enclosure phrases on the frets and beats they claim', () => {
    const fig = lesson('approach-notes').steps[0];
    if (isGenerated(fig) || fig.type !== 'card' || fig.figure?.kind !== 'fretboard') throw new Error('expected the neck');
    expect(fig.figure.dots!.map((d) => midiAt(d))).toEqual([63, 64, 65]); // D#4 E4 F4
    const approach = findIn<PlayPhraseExercise>(inLesson('approach-notes'), 'play-phrase', /approach E from D#/);
    const m = notesOf(approach.notes);
    expect(m).toEqual([60, 63, 64]); // C4, then D#4 into E4
    // C on beat 3, held into beat 4, D# on its "&", E on the next beat 1.
    const onsets = approach.notes.reduce<number[]>((acc, _x, i) => [...acc, i === 0 ? 0 : acc[i - 1] + BEATS[approach.notes[i - 1].duration]], []);
    expect(onsets).toEqual([0, 1.5, 2]);
    const [above, fromBelow] = listens(lesson('approach-notes').steps);
    expect(notesOf(tabOf(above)).slice(-2)).toEqual([65, 64]);
    expect(correct(above)).toBe('From above');
    expect(notesOf(tabOf(fromBelow)).slice(-2)).toEqual([63, 64]);
    expect(correct(fromBelow)).toBe('From below');
    expect(notesOf(tabOf(above)).slice(0, 4)).toEqual(buildVoicing('C', 'x32010').midi.slice(0, 4));
    const enc = findIn<PlayPhraseExercise>(inLesson('enclosures'), 'play-phrase', /Enclose B/);
    expect(notesOf(enc.notes)).toEqual([60, 58, 59]); // C4 A#3 B3
    expect(enc.notes.map((x) => x.duration)).toEqual(['e', 'e', 'q']); // two quick notes on beat 4, the target on beat 1
    expect(third('G7')).toBe('B');
    const [enclosed, oneSide] = listens(lesson('enclosures').steps);
    expect(notesOf(tabOf(enclosed)).slice(-3)).toEqual([65, 63, 64]);
    expect(correct(enclosed)).toMatch(/^Enclosed/);
    expect(notesOf(tabOf(oneSide)).slice(-3)).not.toContain(65);
    expect(correct(oneSide)).toBe('Approached from one side');
    expect(midiAt({ string: 3, fret: 3 })).toBe(58); // A#3, the half step below B on string 3
  });
});

describe('playing-the-changes: arpeggios a third up', () => {
  /** The seventh arpeggio built on a chord's 3rd, in the key of C. */
  const fromThird = (c: string): string => {
    const t = third(c);
    return diatonicChords('C major', { sevenths: true }).find((x) => x.root === t)!.symbol;
  };

  it('builds Em7, Fmaj7, Bm7b5 and Am7 on the 3rds of Cmaj7, Dm7, G7 and Fmaj7', () => {
    expect(['Cmaj7', 'Dm7', 'G7', 'Fmaj7', 'Am7'].map(fromThird)).toEqual(['Em7', 'Fmaj7', 'Bm7b5', 'Am7', 'Cmaj7']);
    for (const m of allExercises().filter((x): x is MatchPairsExercise => x.type === 'match-pairs' && /3rd|third above its root/.test(plain(x.prompt)))) {
      for (const p of m.pairs) expect(tagged(p.right, 'chord')[0], plain(p.left)).toBe(fromThird(tagged(p.left, 'chord')[0]));
    }
    expect(findIn<TypeAnswerExercise>(inLesson('arpeggio-substitution'), 'type-answer', /Over Am7/).answer.value).toBe(fromThird('Am7'));
    const fmaj = findIn<ChoiceExercise>(allExercises(), 'choice', /Over Fmaj7, which seventh arpeggio/);
    expect(correct(fmaj)).toBe(fromThird('Fmaj7'));
    expect(correct(findIn<ChoiceExercise>(inLesson('arpeggio-substitution'), 'choice', /Over Dm7, which arpeggio/))).toBe(fromThird('Dm7'));
  });

  it('gives the degrees the facts state', () => {
    const degreesOver = (arp: string, chord: string): string[] => {
      const root = chordTones(chord)[0].note;
      return chordNotes(arp).map((x) => intervalBetween(root, x));
    };
    expect(degreesOver('Em7', 'Cmaj7')).toEqual(['M3', 'P5', 'M7', 'M2']); // 3 5 7 9
    expect(degreesOver('Fmaj7', 'Dm7')).toEqual(['m3', 'P5', 'm7', 'M2']); // b3 5 b7 9
    expect(degreesOver('Bm7b5', 'G7')).toEqual(['M3', 'P5', 'm7', 'M2']); // 3 5 b7 9
    expect(degreesOver('Cmaj7', 'Am7')).toEqual(['m3', 'P5', 'm7', 'M2']);
    expect(chordNotes('G9')).toEqual(['G', ...chordNotes('Bm7b5')]);
    expect(chordNotes('F7')).toContain('Eb');
    expect(intervalBetween('D', 'Eb')).toBe('m2'); // the b9 of Dm7
  });

  it('draws the Em7 arpeggio from string 5, fret 7, against Cmaj7 x3545x', () => {
    expect(buildVoicing('Cmaj7', 'x3545x').chord).toBe('Cmaj7');
    const card = lesson('arpeggio-substitution').steps[0];
    if (isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected the arpeggio');
    const pos = card.figure.dots!.map((d) => `${d.string}:${d.fret}`);
    expect(pos).toEqual(['5:7', '4:5', '4:9', '3:7', '3:9', '2:8', '1:7', '1:10']);
    for (const d of card.figure.dots!) expect(chordPcs('Em7'), `${d.string}:${d.fret}`).toContain(midiAt(d) % 12);
    const play = findIn<PlayPhraseExercise>(inLesson('arpeggio-substitution'), 'play-phrase', /Em7 arpeggio/);
    expect(play.notes.map((x) => ('rest' in x ? '' : `${x.string}:${x.fret}`))).toEqual(pos.slice(0, 6));
    expect(notesOf(play.notes).at(-1)).toBe(midiAt({ string: 2, fret: 8 })); // "up to string 2, fret 8"
    const all = card.figure.dots!.map((d) => midiAt(d));
    expect(all).toEqual([...all].sort((a, b) => a - b)); // one climb
    const [q] = listens(lesson('arpeggio-substitution').steps);
    expect(notesOf(tabOf(q)).slice(0, 4)).toEqual(buildVoicing('Cmaj7', 'x3545x').midi);
    expect(notesOf(tabOf(q)).slice(4)).toEqual(all);
  });
});

describe('playing-the-changes: outside and back', () => {
  it('slips the D minor pentatonic phrase a fret up into Eb minor pentatonic, then home to D', () => {
    const play = findIn<PlayPhraseExercise>(inLesson('playing-outside'), 'play-phrase', /slide the shape up a fret/);
    const notes = play.notes.filter((x): x is Extract<TabNote, { string: number }> => !('rest' in x));
    const [inside, out, home] = [notes.slice(0, 2), notes.slice(2, 4), notes.slice(4)];
    const dPent = scaleNotes('D', 'minor-pentatonic').map(pc);
    const ebPent = scaleNotes('Eb', 'minor-pentatonic').map(pc);
    for (const x of [...inside, ...home]) expect(dPent).toContain(midiAt(x) % 12);
    for (const x of out) {
      expect(ebPent).toContain(midiAt(x) % 12);
      expect(dPent).not.toContain(midiAt(x) % 12);
    }
    expect(out.map((x) => `${x.string}:${x.fret - 1}`)).toEqual(inside.map((x) => `${x.string}:${x.fret}`));
    expect(midiAt(home.at(-1)!) % 12).toBe(pc('D'));
    const [slip, stay] = listens(lesson('playing-outside').steps);
    expect(notesOf(tabOf(slip))).toEqual(notesOf(play.notes));
    expect(correct(slip)).toMatch(/^Yes/);
    for (const p of pcsOf(tabOf(stay))) expect(dPent).toContain(p);
    expect(correct(stay)).toMatch(/^No/);
    expect(correct(findIn<ChoiceExercise>(inLesson('playing-outside'), 'choice', /moves up one fret/))).toBe('Eb minor pentatonic');
    expect(noteAt({ string: 2, fret: 11 }, { octave: false, context: { prefer: 'flats' } })).toBe('Bb');
  });

  it('substitutes Db7 for G7, sharing its 3rd and 7th', () => {
    expect(tritoneSubstitute('G7')).toBe('Db7');
    expect(tritoneSubstitute('D7')).toBe('Ab7');
    expect(chordNotes('Db7')).toEqual(['Db', 'F', 'Ab', 'Cb']);
    expect(pc('Cb')).toBe(pc(third('G7')));
    expect(chordNotes('Db7')).toContain(seventh('G7'));
    expect(['Db', 'F', 'Ab'].map((x) => intervalBetween('G', x))).toEqual(['d5', 'm7', 'm2']); // b5, b7 and b9 (a minor 2nd, an octave up)
    for (const e of allExercises().filter((x): x is TypeAnswerExercise => x.type === 'type-answer' && x.answer.kind === 'chord' && /tritone/.test(plain(x.prompt)))) {
      expect(e.answer.value, plain(e.prompt)).toBe(tritoneSubstitute(tagged(e.prompt, 'chord')[0]));
    }
    const q = findIn<ChoiceExercise>(inLesson('playing-outside'), 'choice', /standard tritone outside sound/);
    for (const o of q.options) expect(tritoneSubstitute('G7') === tagged(o.text!, 'chord')[0]).toBe(!!o.correct);
    // The card's neck: every dot is a note of Db7, at the degree of G7 it claims.
    const card = lesson('playing-outside').steps.find((s) => !isGenerated(s) && s.type === 'card' && s.title === 'The tritone trick');
    if (!card || isGenerated(card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('expected the Db7 neck');
    const DEGREE: Record<string, string> = { b5: 'd5', b7: 'm7', b9: 'm2', 3: 'M3' };
    for (const d of card.figure.dots!) {
      const at = noteAt(d, { octave: false, context: { chord: 'Db7' } });
      expect(at, `${d.string}:${d.fret}`).toBe(d.note);
      expect(chordNotes('Db7')).toContain(at);
      expect(semis(intervalBetween('G', at)), `${d.string}:${d.fret}`).toBe(semis(DEGREE[d.degree!]));
    }
  });
});

describe('playing-the-changes: on the go', () => {
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
