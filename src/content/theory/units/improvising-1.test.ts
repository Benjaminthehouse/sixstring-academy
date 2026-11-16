/**
 * Unit 29 of the Theory Path, cross-checked against the engines: the arpeggio shapes and box 1,
 * every note the fretboard questions ask for (against the positions their explanations list), the
 * chord tones on the strong beats of every line, the target notes and the half step at the change,
 * the motif and its sequence, new ending and new rhythm, the call and its answer, what each
 * listening question plays, and that every lesson still teaches with the guitar or the sound off.
 */
import { describe, expect, it } from 'vitest';
import { chordNotes, chordPcs, chordTones, scaleNotes, scalePcs } from '@/core/theory';
import { midiAt, scalePatterns } from '@/core/guitar';
import {
  findTargets, formatProblems, isGenerated, plainText, soundPlan, tokenize, validateCourse,
  type ChoiceExercise, type Exercise, type FillBlanksExercise, type FretboardFindExercise, type Lesson, type ListenChoiceExercise,
  type OrderExercise, type PlayPhraseExercise, type RichText, type Step, type TabNote, type TypeAnswerExercise,
} from '@/lessons';
import { adaptUnit, isListeningStep, MIN_QUIET_EXERCISES } from '@/features/learn/model/conditions';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './improvising-1';

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
const correct = (e: { options: Array<{ text?: RichText; correct?: boolean }> }): RichText => e.options.find((o) => o.correct)!.text!;
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l.steps).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const phrases = (l: Lesson): PlayPhraseExercise[] => exercises(l.steps).filter((e): e is PlayPhraseExercise => e.type === 'play-phrase');
/** The tab notes of a card's figure (a tab) or its audio (a tab sound). */
const cardTab = (l: Lesson, i: number): TabNote[] => {
  const card = l.steps[i] as { figure: { kind: string; notes?: TabNote[]; sound?: { notes: TabNote[] } } };
  return card.figure.kind === 'tab' ? card.figure.notes! : card.figure.sound!.notes;
};

/** The values of the tags of one kind in a text: `{n:F#}` -> 'F#'. */
function tagged(text: RichText, type: 'chord' | 'note' | 'degree'): string[] {
  return tokenize(text).flatMap((t) => (t.type === type && 'value' in t ? [String(t.value)] : []));
}
const pc = (note: string): number => chordPcs(note)[0];
const BEATS: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5 };
/** The notes of a phrase with the beat each starts on, counted from 0 (rests give their time only). */
function timed(notes: readonly TabNote[]): Array<{ midi: number; at: number; beats: number }> {
  let at = 0;
  const out: Array<{ midi: number; at: number; beats: number }> = [];
  for (const x of notes) {
    if (!('rest' in x)) out.push({ midi: midiAt(x), at, beats: BEATS[x.duration] });
    at += BEATS[x.duration];
  }
  return out;
}
const length = (notes: readonly TabNote[]): number => notes.reduce((s, x) => s + BEATS[x.duration], 0);
const inChord = (midi: number, chord: string): boolean => chordPcs(chord).includes(midi % 12);
const PENTATONIC = scalePcs('A', 'minor-pentatonic');
const inPentatonic = (midi: number): boolean => PENTATONIC.includes(midi % 12);
/** The next note of A minor pentatonic above a pitch. */
const nextUp = (midi: number): number => {
  for (let m = midi + 1; ; m++) if (inPentatonic(m)) return m;
};
/** Positions an explanation lists: "string 6 fret 2", "string 5 frets 3 and 7", "string 3, fret 5". */
function listedPositions(text: RichText): string[] {
  const out: string[] = [];
  for (const m of plainText(text).matchAll(/string (\d),? frets? (\d+)(?: and (\d+))?/gi)) {
    out.push(`${m[1]}:${m[2]}`);
    if (m[3]) out.push(`${m[1]}:${m[3]}`);
  }
  return out.sort();
}

describe('improvising-1: the unit on its own', () => {
  it('is valid for the lesson engine, with no warnings', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'intermediate', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('starts every fact id with the unit word', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^improvising-/);
  });
});

describe('improvising-1: every note the neck questions ask for', () => {
  it('finds exactly the positions each explanation lists', () => {
    const finds = ofType<FretboardFindExercise>('fretboard-find');
    expect(finds.length).toBe(12);
    let listed = 0;
    for (const e of finds) {
      const targets = findTargets(e).map((t) => `${t.string}:${t.fret}`).sort();
      const named = listedPositions(e.explain);
      if (named.length > 0) {
        listed++;
        expect(targets, plainText(e.prompt)).toEqual(named);
      }
    }
    expect(listed).toBe(10);
  });

  it('counts the ones it gives by number', () => {
    const count = (re: RegExp): number => findTargets(ofType<FretboardFindExercise>('fretboard-find').find((e) => re.test(plainText(e.prompt)))!).length;
    expect(count(/chord tone in box 1/)).toBe(8); // "eight safe landing places"
    expect(count(/every note of Am7 in box 1/)).toBe(10); // "Ten notes"
    expect(count(/every F♯/)).toBe(4);
    expect(count(/every G♯/)).toBe(3);
    expect(count(/every C♯/)).toBe(3);
  });

  it('marks box 1 of A minor pentatonic, as the engine lays it out', () => {
    const box = scalePatterns('A', 'minor-pentatonic')[0];
    const engine = box.notes.map((x) => `${x.string}:${x.fret}`).sort();
    const shown = ofType<FretboardFindExercise>('fretboard-find').find((e) => e.shown)!.shown!.map((d) => `${d.string}:${d.fret}`).sort();
    expect(shown).toEqual(engine);
    const figure = (lesson('seventh-arpeggios').steps[0] as unknown as { figure: { dots: Array<{ string: number; fret: number; role: string }> } }).figure.dots;
    expect(figure.map((d) => `${d.string}:${d.fret}`).sort()).toEqual(engine);
    // In colour: the Am7 tones; faded: the Ds.
    for (const d of figure) expect(d.role === 'ghost', `${d.string}:${d.fret}`).toBe(!inChord(midiAt(d), 'Am7'));
    expect(scaleNotes('A', 'minor-pentatonic').filter((x) => !chordNotes('Am7').includes(x))).toEqual(['D']);
  });
});

describe('improvising-1: arpeggios', () => {
  it('plays the A and Am arpeggios from string 6, fret 5', () => {
    const up = timed(phrases(lesson('arpeggios'))[0].notes).map((x) => x.midi);
    expect(up).toEqual([45, 49, 52, 57, 52, 49, 45]); // A2 C#3 E3 A3, and back
    expect(up.every((m) => inChord(m, 'A'))).toBe(true);
    const [minor] = listens(lesson('arpeggios'));
    const heard = soundPlan(minor.sound).events.map((e) => e.midi[0]);
    expect(heard).toEqual([45, 48, 52, 57]); // A2 C3 E3 A3
    expect(heard[1] - heard[0]).toBe(3); // a minor 3rd
    expect(plainText(correct(minor))).toBe('Minor');
    const major = exercises(unit.checkpoint!.steps!).find((e): e is ListenChoiceExercise => e.type === 'listen-choice')!;
    const majorHeard = soundPlan(major.sound).events.map((e) => e.midi[0]);
    expect(majorHeard[1] - majorHeard[0]).toBe(4); // a major 3rd
    expect(plainText(correct(major))).toBe('Major');
  });

  it('labels the degrees of the arpeggio cards truthfully', () => {
    for (const [i, chord] of [[0, 'A'], [3, 'Am']] as const) {
      const dots = (lesson('arpeggios').steps[i] as unknown as { figure: { dots: Array<{ string: number; fret: number; degree: string }> } }).figure.dots;
      const degrees = Object.fromEntries(chordTones(chord).map((t) => [t.note, t.degree]));
      for (const d of dots) {
        const note = chordNotes(chord).find((x) => pc(x) === midiAt(d) % 12)!;
        expect(d.degree === '8' ? '1' : d.degree, `${chord} ${d.string}:${d.fret}`).toBe(degrees[note]);
      }
    }
  });

  it('spells the seventh arpeggios and degree formulas', () => {
    expect(chordNotes('Am7')).toEqual(['A', 'C', 'E', 'G']);
    expect(chordNotes('Em7')).toEqual(['E', 'G', 'B', 'D']);
    const dm7 = ofType<TypeAnswerExercise>('type-answer').find((e) => /Dm7/.test(String(e.prompt)))!;
    expect(dm7.answer.kind === 'text' && dm7.answer.value).toBe(chordNotes('Dm7').join(' '));
    expect(tagged(correct(ofType<ChoiceExercise>('choice').find((e) => /into \{c:Am7\}/.test(String(e.prompt)))!), 'note')).toEqual([chordNotes('Am7')[3]]);
    const em7 = ofType<ChoiceExercise>('choice').find((e) => /\{c:Em7\}/.test(String(e.prompt)))!;
    expect(tagged(correct(em7), 'note')).toEqual(chordNotes('Em7'));
    for (const e of ofType<ChoiceExercise>('choice').filter((x) => /Which degrees make/.test(plainText(x.prompt)))) {
      const want = /minor/.test(plainText(e.prompt)) ? ['1', 'b3', '5'] : ['1', '3', '5'];
      expect(tagged(correct(e), 'degree')).toEqual(want);
    }
  });

  it('climbs Am7 in box 1 and ends on its 7th', () => {
    const line = timed(phrases(lesson('seventh-arpeggios'))[0].notes);
    expect(line.slice(0, 4).every((x) => inChord(x.midi, 'Am7'))).toBe(true);
    expect(line.every((x) => inPentatonic(x.midi))).toBe(true);
    expect(line.at(-1)!.midi % 12).toBe(pc('G'));
    const audio = timed(cardTab(lesson('seventh-arpeggios'), 3));
    expect(audio.every((x) => inChord(x.midi, 'Am7'))).toBe(true);
  });
});

describe('improvising-1: chord tones on strong beats', () => {
  const strong = (at: number): boolean => at % 2 === 0; // beats 1 and 3 of 4/4, counted from 0

  it('puts chord tones of Am, then Dm, on beats 1 and 3 of the card line, passing notes between', () => {
    const line = timed(cardTab(lesson('chord-tones-on-strong-beats'), 0));
    expect(length(cardTab(lesson('chord-tones-on-strong-beats'), 0))).toBe(8);
    for (const x of line) {
      const chord = x.at < 4 ? 'Am' : 'Dm';
      if (Number.isInteger(x.at) && strong(x.at)) expect(inChord(x.midi, chord), `beat ${x.at}`).toBe(true);
      else expect(inChord(x.midi, chord), `beat ${x.at}`).toBe(false);
      expect(scalePcs('A', 'minor')).toContain(x.midi % 12);
    }
    expect(line.filter((x) => strong(x.at)).map((x) => x.midi)).toEqual([57, 60, 62, 65]); // A3 C4 | D4 F4
  });

  it('plays the right line first in the listening question, and steps each tense note to a chord tone', () => {
    const [q] = listens(lesson('chord-tones-on-strong-beats'));
    const tab = (q.sound as { notes: TabNote[] }).notes;
    const am = timed(tab.slice(0, 4)).map((x) => x.midi);
    expect([...new Set(am.map((m) => m % 12))].sort((a, b) => a - b)).toEqual([...chordPcs('Am')].sort((a, b) => a - b));
    const first = timed(tab.slice(5, 9)).map((x) => x.midi);
    const second = timed(tab.slice(14, 18)).map((x) => x.midi);
    expect([first[0], first[2]].every((m) => inChord(m, 'Am'))).toBe(true);
    expect([second[0], second[2]].some((m) => inChord(m, 'Am'))).toBe(false);
    for (const i of [0, 2]) {
      expect(Math.abs(second[i + 1] - second[i])).toBeLessThanOrEqual(2);
      expect(inChord(second[i + 1], 'Am')).toBe(true);
    }
    expect(plainText(correct(q))).toBe('The first line');
  });

  it('lands the eighth-note phrase on Am chord tones at beats 1 and 3', () => {
    const line = timed(phrases(lesson('chord-tones-on-strong-beats'))[0].notes);
    for (const x of line.filter((y) => Number.isInteger(y.at) && strong(y.at))) expect(inChord(x.midi, 'Am'), `beat ${x.at}`).toBe(true);
    expect(line.every((x) => inPentatonic(x.midi))).toBe(true);
    expect(length(phrases(lesson('chord-tones-on-strong-beats'))[0].notes)).toBe(6); // a bar, then the A on the next beat 1
  });

  it('answers the chord-tone choices and fills', () => {
    const dm = ofType<ChoiceExercise>('choice').find((e) => /Over \{c:Dm\}, which/.test(String(e.prompt)))!;
    for (const o of dm.options) expect(inChord(pc(tagged(o.text!, 'note')[0]), 'Dm'), plainText(o.text!)).toBe(!!o.correct);
    const g = ofType<ChoiceExercise>('choice').find((e) => /Over \{c:G\}/.test(String(e.prompt)))!;
    for (const o of g.options) expect(inChord(pc(tagged(o.text!, 'note')[0]), 'G'), plainText(o.text!)).toBe(!!o.correct);
    const beat3 = ofType<ChoiceExercise>('choice').find((e) => /beat 3 so that/.test(plainText(e.prompt)))!;
    for (const o of beat3.options) expect(inChord(pc(tagged(o.text!, 'note')[0]), 'Am'), plainText(o.text!)).toBe(!!o.correct);
    const fill = ofType<FillBlanksExercise>('fill-blanks').find((e) => /\{c:Dm\}/.test(String(e.prompt)))!;
    expect(inChord(pc(tagged(fill.blanks[0], 'note')[0]), 'Dm')).toBe(true);
    for (const w of fill.bank ?? []) expect(inChord(pc(tagged(w, 'note')[0]), 'Dm')).toBe(false);
  });
});

describe('improvising-1: target notes', () => {
  const role = (chord: string, note: string): string | undefined => chordTones(chord).find((t) => pc(t.note) === pc(note))?.role;

  it('rings the 3rds and the 7th the card names', () => {
    const dots = (lesson('target-notes').steps[0] as unknown as { figure: { dots: Array<{ string: number; fret: number; role: string }> } }).figure.dots;
    const [cs, fs1, fs2, c] = dots.map((d) => midiAt(d) % 12);
    expect(role('A7', 'C#')).toBe('third');
    expect(cs).toBe(pc('C#'));
    expect([fs1, fs2]).toEqual([pc('F#'), pc('F#')]);
    expect(role('D7', 'F#')).toBe('third');
    expect(c).toBe(pc('C'));
    expect(role('D7', 'C')).toBe('seventh');
  });

  it('plays A7 chord tones, then falls a half step to the 7th of D7 on beat 1', () => {
    const notes = cardTab(lesson('target-notes'), 3);
    expect(phrases(lesson('target-notes'))[0].notes).toEqual(notes);
    const line = timed(notes);
    expect(line.filter((x) => x.at < 4).every((x) => inChord(x.midi, 'A7'))).toBe(true);
    const change = line.find((x) => x.at === 4)!;
    expect(change.midi % 12).toBe(pc('C'));
    expect(role('D7', 'C')).toBe('seventh');
    expect(line[line.indexOf(change) - 1].midi - change.midi).toBe(1); // C# to C: one fret down
    expect(change.midi).toBe(midiAt({ string: 3, fret: 5 }));
    expect(midiAt({ string: 3, fret: 6 }) % 12).toBe(pc('C#'));
  });

  it('answers with the 3rd of the new chord', () => {
    for (const [re, chord] of [[/changes to \{c:E7\}/, 'E7'], [/changes to \{c:Dm\}/, 'Dm']] as const) {
      for (const e of ofType<ChoiceExercise>('choice').filter((x) => re.test(String(x.prompt)))) {
        expect(role(chord, tagged(correct(e), 'note')[0])).toBe('third');
        for (const o of e.options.filter((x) => !x.correct)) expect(role(chord, tagged(o.text!, 'note')[0]), plainText(o.text!)).not.toBe('third');
      }
    }
    // The 5th and root of D and Dm are the same; only the 3rd differs.
    expect(chordNotes('D').filter((x) => !chordNotes('Dm').includes(x))).toEqual(['F#']);
  });
});

describe('improvising-1: motifs', () => {
  const groups = (notes: readonly TabNote[]): number[][] => {
    const pitches = notes.filter((x) => !('rest' in x)).map((x) => midiAt(x as { string: number; fret: number }));
    const out: number[][] = [];
    for (let i = 0; i < pitches.length; i += 3) out.push(pitches.slice(i, i + 3));
    return out;
  };
  const MOTIF = [57, 60, 62]; // A3 C4 D4
  const kind = (g: number[], i: number): string => {
    if (g.join() === MOTIF.join()) return i === 0 ? 'Original' : 'Repeat';
    if (g.join() === MOTIF.map(nextUp).join()) return 'Sequence';
    if (g[0] === MOTIF[0] && g[1] === MOTIF[1]) return 'New ending';
    return 'New idea';
  };

  it('moves the motif one box note up for the sequence', () => {
    expect(MOTIF.map(nextUp)).toEqual([60, 62, 64]); // C4 D4 E4
    const card = groups(cardTab(lesson('motifs'), 1));
    expect(card.map(kind)).toEqual(['Original', 'Repeat', 'Sequence', 'Repeat']); // the last: same notes, new rhythm
    // The fourth version keeps the notes and changes the rhythm.
    const tab = cardTab(lesson('motifs'), 1);
    expect(tab.slice(0, 3).map((x) => x.duration)).toEqual(['e', 'e', 'q']);
    expect(tab.slice(9, 12).map((x) => x.duration)).toEqual(['q', 'e', 'e']);
    expect(length(tab)).toBe(8);
  });

  it('orders the tiles as the tab plays the versions', () => {
    const e = ofType<OrderExercise>('order').find((x) => /four ways/.test(plainText(x.prompt)))!;
    const fig = e.figure as { notes: TabNote[] };
    expect(groups(fig.notes).map(kind)).toEqual(e.tiles.map((t) => plainText(t)));
  });

  it('plays a sequence, then a new idea, in the listening questions', () => {
    const [seq, idea] = listens(lesson('motifs'));
    const second = (q: ListenChoiceExercise): number[] => soundPlan(q.sound).events.map((x) => x.midi[0]).slice(3);
    expect(soundPlan(seq.sound).events.map((x) => x.midi[0]).slice(0, 3)).toEqual(MOTIF);
    expect(kind(second(seq), 1)).toBe('Sequence');
    expect(plainText(correct(seq))).toBe('A sequence');
    expect(kind(second(idea), 1)).toBe('New idea');
    expect(plainText(correct(idea))).toBe('A new idea');
    const play = phrases(lesson('motifs'))[0];
    expect(groups(play.notes).map(kind)).toEqual(['Original', 'Sequence']);
  });

  it('moves the checkpoint motif one box note up too', () => {
    const e = ofType<ChoiceExercise>('choice').find((x) => /motif is \{n:C\}/.test(String(x.prompt)))!;
    const motif = [60, 62, 64]; // C4 D4 E4
    expect(motif.map(nextUp).map((m) => m % 12)).toEqual(tagged(correct(e), 'note').map(pc));
    const lessonChoice = ofType<ChoiceExercise>('choice').find((x) => /motif is \{n:A\} \{n:C\} \{n:D\}\. Which/.test(String(x.prompt)))!;
    expect(MOTIF.map(nextUp).map((m) => m % 12)).toEqual(tagged(correct(lessonChoice), 'note').map(pc));
  });
});

describe('improvising-1: call and response', () => {
  const parts = (): [TabNote[], TabNote[]] => [cardTab(lesson('call-and-response'), 0), cardTab(lesson('call-and-response'), 1)];

  it('ends the call on D, off the chord, and the answer on A, on beat 1', () => {
    const [call, answer] = parts();
    expect(length(call)).toBe(8);
    expect(length(answer)).toBe(8);
    const c = timed(call).at(-1)!;
    const a = timed(answer).at(-1)!;
    expect(c.midi).toBe(midiAt({ string: 3, fret: 7 }));
    expect(inChord(c.midi, 'Am')).toBe(false);
    expect(a.midi).toBe(midiAt({ string: 4, fret: 7 }));
    expect(a.midi % 12).toBe(pc('A'));
    expect(a.at % 4).toBe(0); // beat 1 of its bar
    expect(timed(call).every((x) => inPentatonic(x.midi)) && timed(answer).every((x) => inPentatonic(x.midi))).toBe(true);
    expect(phrases(lesson('call-and-response'))[0].notes).toEqual(answer);
  });

  it('plays the answer first and the call second in the listening question', () => {
    const [q] = listens(lesson('call-and-response'));
    const pitches = soundPlan(q.sound).events.map((x) => x.midi[0]);
    const [call, answer] = parts();
    const answerPitches = timed(answer).map((x) => x.midi);
    const callPitches = timed(call).map((x) => x.midi);
    expect(pitches.slice(4, 4 + answerPitches.length)).toEqual(answerPitches);
    expect(pitches.slice(-callPitches.length)).toEqual(callPitches);
    expect(plainText(correct(q))).toBe('The second');
  });

  it('marks only a chord tone on a strong beat as the finished ending', () => {
    for (const e of ofType<ChoiceExercise>('choice').filter((x) => /most finished/.test(plainText(x.prompt)))) {
      for (const o of e.options) {
        const t = plainText(o.text!);
        const finished = inChord(pc(tagged(o.text!, 'note')[0]), 'Am') && /beat 1\b/.test(t);
        expect(finished, t).toBe(!!o.correct);
      }
    }
  });
});

describe('improvising-1: on the go', () => {
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
