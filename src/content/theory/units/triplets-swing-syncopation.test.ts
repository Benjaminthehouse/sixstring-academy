/**
 * Unit 17 of the Theory Path, cross-checked against the engines: every rhythm's bar length, where
 * each note falls and how it is counted, the 2:1 swing ratio, the triplet, syncopated and sixteenth
 * strums, the shuffle's frets and intervals, the tempo words and their speeds, and what each
 * listening question really plays.
 */
import { describe, expect, it } from 'vitest';
import { PPQ, SWING, chordNotes, durationTicks, intervalBetween, parseNote, parseTimeSignature, progressionToChords, swingPair, tempoMarking, tempoRange } from '@/core/theory';
import { midiAt, noteAt } from '@/core/guitar';
import {
  findTargets, formatProblems, parseRhythm, parseStrum, plainText, resolveFigure, soundPlan, tickSeconds, validateCourse, type AudioFigure,
  type CardStep, type ChoiceExercise, type Figure, type Exercise, type FillBlanksExercise, type FretboardFigure, type FretboardFindExercise, type Lesson, type ListenChoiceExercise,
  type MatchPairsExercise, type PlayChordExercise, type PlayPhraseExercise, type RhythmFigure, type Step, type TabNote, type TapRhythmExercise,
  type TrueFalseExercise,
} from '@/lessons';
import { THEORY_GLOSSARY } from '../glossary';
import unit from './triplets-swing-syncopation';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const isExercise = (s: Step): s is Exercise => !('generate' in s) && s.type !== 'card';
const isCard = (s: Step): s is CardStep => !('generate' in s) && s.type === 'card';
const exercisesOf = (l: Lesson): Exercise[] => [
  ...l.steps.filter(isExercise),
  ...l.steps.filter(isExercise).flatMap((e) => ('alternative' in e && e.alternative && !('generate' in e.alternative) ? [e.alternative] : [])),
  ...(l.facts ?? []).map((f) => f.ask).filter((a): a is Exercise => !!a && !('generate' in a)),
];
const checkpoint = (): Exercise[] => (unit.checkpoint?.steps ?? []).filter(isExercise);
const all = (): Exercise[] => [...unit.lessons.flatMap(exercisesOf), ...checkpoint()];
const prompt = (e: Exercise): string => plainText('prompt' in e && e.prompt ? e.prompt : 'statement' in e ? e.statement : '');
function find<T extends Exercise>(list: Exercise[], type: T['type'], text: string): T {
  const hit = list.find((e) => e.type === type && prompt(e).includes(text));
  if (!hit) throw new Error(`no ${type} exercise with "${text}"`);
  return hit as T;
}
const right = (e: ChoiceExercise | ListenChoiceExercise): string => plainText(e.options.find((o) => o.correct)?.text ?? '');
function card(l: string, title: string): Figure {
  const c = lesson(l).steps.filter(isCard).find((s) => s.title === title);
  if (!c || !c.figure) throw new Error(`no card "${title}"`);
  return c.figure;
}
/** Onsets (ticks) and counts of a rhythm, checking that every bar is exactly full. */
function rhythm(pattern: string, time = '4/4') {
  const r = parseRhythm({ pattern, time });
  expect(r.problems, pattern).toEqual([]);
  return { onsets: r.onsets, counts: r.events.filter((e) => e.attack).map((e) => e.count), barTicks: r.barTicks };
}
/** Gaps between the plucks of a sound, in ticks. */
function soundGaps(sound: AudioFigure['sound']): number[] {
  const plan = soundPlan(sound);
  const ticks = plan.events.map((e) => Math.round((e.at * plan.tempo * PPQ) / 60));
  return ticks.slice(1).map((t, i) => t - ticks[i]);
}
const onsetsOf = (notes: TabNote[]): number[] => {
  let tick = 0;
  const out: number[] = [];
  for (const n of notes) {
    if ('string' in n) out.push(tick);
    tick += parseRhythm(`${n.duration}`).events[0].ticks;
  }
  return out;
};
const triplet = durationTicks('eighth', { tuplet: 3 });

describe('triplets-swing-syncopation: the unit on its own', () => {
  it('passes the lesson validator with no problems', () => {
    const problems = validateCourse({ id: 'theory-path', title: 'Theory Path', teacher: 'none', level: 'intermediate', units: [unit], glossary: [...THEORY_GLOSSARY] });
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('still asks at least four questions per lesson with Sound off (no listening, tapping along or ear drills)', () => {
    const heard = new Set(['listen-choice', 'tap-rhythm']);
    const earDrills = new Set(['higher-lower', 'interval-ear', 'chord-quality-ear', 'scale-ear', 'cadence-ear', 'rhythm-ear', 'rhythm-tap']);
    for (const l of unit.lessons) {
      const quiet = l.steps.filter((s) => ('generate' in s ? !earDrills.has(String(s.generate)) : s.type !== 'card' && !heard.has(s.type)));
      expect(quiet.length, l.id).toBeGreaterThanOrEqual(4);
    }
    const quietCheckpoint = (unit.checkpoint?.steps ?? []).filter((s) => ('generate' in s ? !earDrills.has(String(s.generate)) : !heard.has(s.type)));
    expect(quietCheckpoint.length).toBeGreaterThanOrEqual(6);
  });

  it('starts every fact id with the unit word "triplets"', () => {
    for (const f of unit.lessons.flatMap((l) => l.facts ?? [])) expect(f.id).toMatch(/^triplets-/);
  });

  it('keeps every tapped rhythm full, within two bars, and its notes at least 140 ms apart', () => {
    for (const e of all().filter((x): x is TapRhythmExercise => x.type === 'tap-rhythm')) {
      const { onsets } = rhythm(e.rhythm.pattern, e.rhythm.time);
      const gaps = onsets.slice(1).map((t, i) => tickSeconds(t - onsets[i], e.tempo));
      expect(Math.min(...gaps), e.rhythm.pattern).toBeGreaterThanOrEqual(0.14);
    }
  });
});

describe('triplets-swing-syncopation: triplets', () => {
  it('fits three triplet eighths into one beat, the time of two eighths', () => {
    expect(3 * triplet).toBe(PPQ);
    expect(3 * triplet).toBe(2 * durationTicks('eighth'));
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('triplets')), 'choice', 'triplets fill one'))).toBe('3');
    expect(find<TrueFalseExercise>(exercisesOf(lesson('triplets')), 'true-false', 'Three eighth-note triplets').answer).toBe(true);
    const m = find<MatchPairsExercise>(exercisesOf(lesson('triplets')), 'match-pairs', 'how many fill one beat');
    const per: Record<string, number> = { 'Quarter notes': PPQ / durationTicks('quarter'), 'Eighth notes': PPQ / durationTicks('eighth'), 'Triplet eighths': PPQ / triplet, 'Sixteenth notes': PPQ / durationTicks('sixteenth') };
    for (const p of m.pairs) expect(plainText(p.right)).toBe(`${per[plainText(p.left)]} per beat`);
  });

  it('draws and plays two eighths then a triplet on each pair of beats, counted 1-trip-let', () => {
    const fig = card('triplets', 'Three in the time of two') as RhythmFigure;
    // Two beats in 2/4 (it fits a phone), drawn without a count row: mixing eighths and triplets
    // puts the bar on a six-step grid, where the eighth's "&" would be labelled "ta".
    expect(fig.time).toBe('2/4');
    expect(fig.counting).toBe(false);
    const two = rhythm(fig.pattern, fig.time);
    expect(two.onsets).toEqual([0, 480, 960, 1280, 1600]);
    const r = rhythm(`${fig.pattern} ${fig.pattern}`);
    expect(r.onsets).toEqual([0, 480, 960, 1280, 1600, 1920, 2400, 2880, 3200, 3520]);
    const audio = card('triplets', 'Count 1-trip-let') as AudioFigure;
    const plan = soundPlan(audio.sound);
    expect(plan.events.every((e) => e.midi[0] === parseNote('E4')!.midi)).toBe(true); // the open high E string
    expect(plan.events.map((e) => Math.round((e.at * 70 * PPQ) / 60))).toEqual(r.onsets);
    const blank = find<FillBlanksExercise>(exercisesOf(lesson('triplets')), 'fill-blanks', 'triplets');
    expect(plainText(blank.text).replace('___', String(blank.blanks[0])).split(/\s+/)).toEqual(['1', 'trip', 'let', '2', 'trip', 'let']);
  });

  it('taps two beats of triplets then two quarters', () => {
    const tap = find<TapRhythmExercise>(exercisesOf(lesson('triplets')), 'tap-rhythm', 'two beats of triplets');
    expect(rhythm(tap.rhythm.pattern).onsets).toEqual([0, 320, 640, 960, 1280, 1600, 1920, 2880]);
    expect(tap.tempo).toBe(70);
  });

  it('splits beats 2 and 4 into three in the listening question', () => {
    const q = find<ListenChoiceExercise>(exercisesOf(lesson('triplets')), 'listen-choice', 'eighth notes or triplets');
    const onsets = soundPlan(q.sound).events.map((e) => Math.round((e.at * 70 * PPQ) / 60));
    // "One beat has a single note, the next is split": one note on beats 1 and 3, three on 2 and 4.
    expect(onsets.filter((t) => t < PPQ)).toEqual([0]);
    expect(onsets.filter((t) => t >= 2 * PPQ && t < 3 * PPQ)).toEqual([2 * PPQ]);
    expect(onsets.filter((t) => t >= PPQ && t < 2 * PPQ)).toHaveLength(3);
    expect(onsets.filter((t) => t >= 3 * PPQ)).toHaveLength(3);
    expect(right(q)).toBe('Triplets: three per beat');
  });
});

describe('triplets-swing-syncopation: swing and the shuffle', () => {
  it('writes swung eighths as a triplet quarter and eighth: 2:1, the engine\'s triplet swing', () => {
    expect(swingPair()).toEqual([2 * triplet, triplet]);
    expect(SWING.triplet).toBeCloseTo(2 / 3, 10);
    const fig = card('swing', 'Long, short, long, short') as RhythmFigure;
    const { onsets } = rhythm(fig.pattern);
    expect(onsets).toEqual([0, 640, 960, 1600, 1920, 2560, 2880, 3520]);
    const tap = find<TapRhythmExercise>(exercisesOf(lesson('swing')), 'tap-rhythm', 'swung eighth');
    expect(tap.rhythm.pattern).toBe(fig.pattern);
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('swing')), 'choice', 'how do the two lengths compare'))).toBe('The first is about twice as long');
    expect(find<TrueFalseExercise>(exercisesOf(lesson('swing')), 'true-false', 'played evenly').answer).toBe(false);
  });

  it('offers long-short, short-long and straight pictures, with long-short right', () => {
    const q = find<ChoiceExercise>(exercisesOf(lesson('swing')), 'choice', 'Which rhythm shows');
    const pics = q.options.map((o) => o.figure as RhythmFigure);
    const firstBeat = (f: RhythmFigure) => rhythm(f.pattern, f.time).onsets.filter((t) => t < PPQ);
    expect(firstBeat(pics[q.options.findIndex((o) => o.correct)])).toEqual([0, 640]);
    expect(pics.map(firstBeat)).toEqual([[0, 640], [0, 320], [0, 480]]);
  });

  it('plays C and D on string 2 straight, then swung, and swung in the listening question', () => {
    expect(noteAt({ string: 2, fret: 1 })).toBe('C4');
    expect(noteAt({ string: 2, fret: 3 })).toBe('D4');
    const both = card('swing', 'Hear both') as AudioFigure;
    const gaps = soundGaps(both.sound);
    expect(gaps.slice(0, 7)).toEqual(Array(7).fill(480));
    expect(gaps.slice(8)).toEqual([640, 320, 640, 320, 640, 320, 640]);
    const q = find<ListenChoiceExercise>(exercisesOf(lesson('swing')), 'listen-choice', 'Straight or swung');
    expect(new Set(soundGaps(q.sound))).toEqual(new Set([640, 320]));
    expect(right(q)).toBe('Swung: long-short');
  });

  it('builds the A, D and E shuffles from the root, its 5th and its 6th', () => {
    const check = (root: { string: number; fret: number }, five: { string: number; fret: number }, six: { string: number; fret: number }) => {
      const tonic = noteAt(root, { octave: false });
      const spell = (p: { string: number; fret: number }) => noteAt(p, { context: { tonic, scale: 'major' } });
      expect(midiAt(five) - midiAt(root)).toBe(7);
      expect(midiAt(six) - midiAt(root)).toBe(9);
      expect(intervalBetween(spell(root), spell(five))).toBe('P5');
      expect(intervalBetween(spell(root), spell(six))).toBe('M6');
    };
    check({ string: 5, fret: 0 }, { string: 4, fret: 2 }, { string: 4, fret: 4 }); // A: E and F#
    check({ string: 4, fret: 0 }, { string: 3, fret: 2 }, { string: 3, fret: 4 }); // D: A and B
    check({ string: 6, fret: 0 }, { string: 5, fret: 2 }, { string: 5, fret: 4 }); // E: B and C#
    expect(noteAt({ string: 4, fret: 2 }, { octave: false })).toBe('E');
    expect(noteAt({ string: 4, fret: 4 }, { octave: false, context: { tonic: 'A', scale: 'major' } })).toBe('F#');
    expect(noteAt({ string: 5, fret: 4 }, { octave: false, context: { tonic: 'E', scale: 'major' } })).toBe('C#');
    expect(chordNotes('A5')).toEqual(['A', 'E']);
    for (const title of ['A swung groove', 'Move it to D and E']) {
      const fig = resolveFigure(card('the-shuffle', title) as FretboardFigure);
      if (!fig || fig.kind !== 'fretboard') throw new Error('not drawn');
      expect(fig.dots.map((d) => d.degree)).toEqual(['1', '5', '6']);
    }
  });

  it('plays the shuffle line long-short on string 4, and the D line straight on string 3', () => {
    const line = card('the-shuffle', 'Hear the moving line') as AudioFigure;
    const plan = soundPlan(line.sound);
    expect(plan.events.map((e) => e.midi[0])).toEqual(Array(4).fill([52, 52, 54, 54]).flat()); // E3 E3 F#3 F#3
    expect(new Set(soundGaps(line.sound))).toEqual(new Set([640, 320]));
    const play = find<PlayPhraseExercise>(exercisesOf(lesson('the-shuffle')), 'play-phrase', 'moving line');
    expect(play.notes.map((n) => ('string' in n ? `${n.string}:${n.fret}` : ''))).toEqual(['4:2', '4:2', '4:4', '4:4']);
    expect(onsetsOf(play.notes)).toEqual([0, 640, 960, 1600]);
    expect(findTargets(play.alternative as FretboardFindExercise)).toEqual([expect.objectContaining({ string: 4, fret: 4 })]);
    const q = find<ListenChoiceExercise>(exercisesOf(lesson('the-shuffle')), 'listen-choice', 'shuffle, or straight');
    expect(new Set(soundGaps(q.sound))).toEqual(new Set([480]));
    expect(soundPlan(q.sound).events.map((e) => e.midi[0]).slice(0, 4)).toEqual([57, 57, 59, 59]); // A3 A3 B3 B3: the D shuffle's 5 and 6
    expect(right(q)).toBe('Straight eighths: even');
    const six = find<FretboardFindExercise>(exercisesOf(lesson('the-shuffle')), 'fretboard-find', 'For E');
    expect(findTargets(six)).toEqual([expect.objectContaining({ string: 5, fret: 4 })]);
  });

  it('moves the shuffle to D and E: with A, the I, IV and V of a blues in A', () => {
    expect(progressionToChords('I IV V', 'A major')).toEqual(['A', 'D', 'E']);
    const c = lesson('the-shuffle').steps.filter(isCard).find((s) => s.title === 'Move it to D and E')!;
    expect(plainText(c.body)).toContain('the three chords of a blues in A');
    expect(noteAt({ string: 4, fret: 0 }, { octave: false })).toBe('D');
    expect(noteAt({ string: 6, fret: 0 }, { octave: false })).toBe('E');
  });

  it('fills a 12/8 bar with four long-short beats', () => {
    const fig = card('the-shuffle', 'Written in 12/8') as RhythmFigure;
    const ts = parseTimeSignature('12/8')!;
    expect(ts.kind).toBe('compound');
    expect(ts.beats).toBe(4);
    const { onsets } = rhythm(fig.pattern, fig.time);
    expect(onsets).toEqual([0, 960, 1440, 2400, 2880, 3840, 4320, 5280]);
    // Each beat is a dotted quarter split 2:1, exactly the swung pair.
    expect(onsets[1] / (onsets[2] - onsets[1])).toBe(2);
  });
});

describe('triplets-swing-syncopation: syncopation and anticipations', () => {
  it('strikes 1, 2, &, & of 3, 4, & and holds through beat 3', () => {
    const fig = card('syncopation', 'Off the beat') as RhythmFigure;
    const r = rhythm(fig.pattern);
    expect(r.onsets).toEqual([0, 960, 1440, 2400, 2880, 3360]);
    expect(r.onsets).not.toContain(1920);
    expect(r.counts).toEqual(['1', '2', '&', '&', '4', '&']);
    const tap = find<TapRhythmExercise>(exercisesOf(lesson('syncopation')), 'tap-rhythm', 'syncopated strum');
    expect(tap.rhythm.pattern).toBe(fig.pattern);
    expect(find<TrueFalseExercise>(exercisesOf(lesson('syncopation')), 'true-false', 'beat 3 is not struck').answer).toBe(true);
  });

  it('strums exactly that rhythm on G (320003), down on 1, 2 and 4 and up on the &s', () => {
    const audio = card('syncopation', 'Strum it on G') as AudioFigure;
    if (audio.sound.kind !== 'strum') throw new Error('not a strum');
    const slots = parseStrum(audio.sound.pattern).slots.filter((s) => s.stroke);
    expect(slots.map((s) => s.tick)).toEqual([0, 960, 1440, 2400, 2880, 3360]);
    expect(slots.map((s) => s.stroke)).toEqual(['down', 'down', 'up', 'up', 'down', 'up']);
    const midi = soundPlan(audio.sound).events[0].midi;
    expect(midi).toEqual([3, 2, 0, 0, 0, 3].map((f, i) => midiAt({ string: 6 - i, fret: f })));
    const play = find<PlayChordExercise>(exercisesOf(lesson('syncopation')), 'play-chord', 'Strum G');
    const drawn = resolveFigure({ kind: 'chord', symbol: play.chord, frets: play.frets });
    if (!drawn || drawn.kind !== 'chord') throw new Error('not drawn');
    expect(drawn.notes.map((n) => n.note)).toEqual(['G', 'B', 'D', 'G', 'B', 'G']);
  });

  it('anticipates the next bar on the & of 4 and holds over beat 1', () => {
    const fig = card('syncopation', 'Anticipations') as RhythmFigure;
    const r = rhythm(fig.pattern);
    expect(r.onsets).toEqual([0, 960, 1920, 2880, 3360, 5760]);
    expect(r.onsets).not.toContain(r.barTicks); // nothing new on beat 1 of bar 2
    expect(r.counts[4]).toBe('&');
    const q = find<ChoiceExercise>(exercisesOf(lesson('syncopation')), 'choice', 'anticipates beat 2');
    const pics = q.options.map((o) => rhythm((o.figure as RhythmFigure).pattern, (o.figure as RhythmFigure).time).onsets);
    expect(pics[q.options.findIndex((o) => o.correct)]).toEqual([0, 480]); // the & of 1 is held over beat 2
    expect(pics).toEqual([[0, 480], [0, 480, 960], [0, 960]]);
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('syncopation')), 'choice', 'how early'))).toBe('An eighth note early, on the "&"');
  });

  it('plays a plain bar, then the syncopated one, in the listening question', () => {
    const q = find<ListenChoiceExercise>(exercisesOf(lesson('syncopation')), 'listen-choice', 'Which one is syncopated');
    if (q.sound.kind !== 'rhythm') throw new Error('not a rhythm');
    const { onsets, barTicks } = rhythm(q.sound.pattern, q.sound.time);
    const bar1 = onsets.filter((t) => t < barTicks);
    const bar2 = onsets.filter((t) => t >= barTicks).map((t) => t - barTicks);
    expect(bar1.every((t) => t % PPQ === 0)).toBe(true);
    expect(bar2.some((t) => t % PPQ !== 0)).toBe(true);
    expect(bar2).not.toContain(2 * PPQ);
    expect(right(q)).toBe('Bar 2');
  });
});

describe('triplets-swing-syncopation: sixteenth-note grooves', () => {
  const countsOf = (beat: string): string[] => rhythm(`${beat} q q q`).counts.slice(0, -3);

  it('counts the figures 1 & a, 2 e &, 3 e a, then 4', () => {
    const fig = card('sixteenth-grooves', 'Where the notes fall') as RhythmFigure;
    expect(rhythm(fig.pattern).counts).toEqual(['1', '&', 'a', '2', 'e', '&', '3', 'e', 'a', '4']);
    const tap = find<TapRhythmExercise>(exercisesOf(lesson('sixteenth-grooves')), 'tap-rhythm', '1 & a');
    expect(tap.rhythm.pattern).toBe(fig.pattern);
    expect(tickSeconds(durationTicks('sixteenth'), tap.tempo)).toBeGreaterThanOrEqual(0.14);
  });

  it('names each one-beat figure by the syllables it strikes', () => {
    const figures: Record<string, string> = {
      'Eighth, two sixteenths': 'e s s',
      'Two sixteenths, eighth': 's s e',
      'Sixteenth, eighth, sixteenth': 's e s',
      'Four sixteenths': 's s s s',
      'Two eighths': 'e e',
    };
    let checked = 0;
    for (const e of all().filter((x): x is MatchPairsExercise => x.type === 'match-pairs' && prompt(x).includes('one-beat figure'))) {
      for (const p of e.pairs) {
        expect(countsOf(figures[plainText(p.left)]).join(' '), plainText(p.left)).toBe(plainText(p.right));
        checked++;
      }
    }
    expect(checked).toBe(10);
    const blank = find<FillBlanksExercise>(exercisesOf(lesson('sixteenth-grooves')), 'fill-blanks', 'Sixteenth, eighth, sixteenth');
    expect(countsOf('s e s')).toEqual(['1', 'e', blank.blanks[0]]);
    // The e and the a are the 16th-note spots between the beat and the &.
    expect(rhythm('s s s s q q q').counts.slice(0, 4)).toEqual(['1', 'e', '&', 'a']);
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('sixteenth-grooves')), 'choice', 'most off-beat'))).toBe('The e and the a');
  });

  it('puts the sixteenth after a dotted eighth on the a', () => {
    const fig = card('sixteenth-grooves', 'The dotted eighth') as RhythmFigure;
    expect(rhythm(fig.pattern).counts).toEqual(['1', 'a', '2', 'a', '3', 'a', '4', 'a']);
    expect(durationTicks('eighth', { dots: 1 })).toBe(3 * durationTicks('sixteenth'));
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('sixteenth-grooves')), 'choice', 'dotted eighth'))).toBe('On the a');
  });

  it('strums the same figures on Em7 with the hand moving in sixteenths', () => {
    const audio = card('sixteenth-grooves', 'Funk: keep the hand moving') as AudioFigure;
    if (audio.sound.kind !== 'strum') throw new Error('not a strum');
    const parsed = parseStrum(audio.sound.pattern, audio.sound.grid);
    expect(parsed.slots).toHaveLength(16);
    expect(parsed.slots.filter((s) => s.stroke).map((s) => s.tick)).toEqual(rhythm((card('sixteenth-grooves', 'Where the notes fall') as RhythmFigure).pattern).onsets);
    // Down on the beat and the &, up on the e and the a: the hand never changes direction pattern.
    for (const s of parsed.slots.filter((x) => x.stroke)) expect(s.stroke).toBe(s.tick % 480 === 0 ? 'down' : 'up');
    const em7 = resolveFigure({ kind: 'chord', symbol: 'Em7', frets: '022030' });
    if (!em7 || em7.kind !== 'chord') throw new Error('not drawn');
    expect(new Set(em7.notes.map((n) => n.note))).toEqual(new Set(chordNotes('Em7')));
    expect(find<TrueFalseExercise>(exercisesOf(lesson('sixteenth-grooves')), 'true-false', 'stops moving').answer).toBe(false);
  });

  it('plays "1 e a" on every beat and offers it among the figures', () => {
    const q = find<ListenChoiceExercise>(exercisesOf(lesson('sixteenth-grooves')), 'listen-choice', 'same figure');
    if (q.sound.kind !== 'rhythm') throw new Error('not a rhythm');
    expect(rhythm(q.sound.pattern).counts).toEqual(['1', 'e', 'a', '2', 'e', 'a', '3', 'e', 'a', '4', 'e', 'a']);
    const pics = q.options.map((o) => o.figure as RhythmFigure);
    const correct = pics[q.options.findIndex((o) => o.correct)];
    expect(rhythm(correct.pattern, correct.time).counts).toEqual(['1', 'e', 'a', '2', 'e', 'a']);
    expect(pics.map((p) => rhythm(p.pattern, p.time).counts.slice(0, 3).join(' '))).toEqual(['1 & a', '1 e &', '1 e a']);
  });
});

describe('triplets-swing-syncopation: tempo words', () => {
  it('gives each word the meaning and speed of the engine\'s tempo table', () => {
    const meaning = (word: string) => tempoRange(word)!.meaning.toLowerCase();
    expect(meaning('Adagio')).toMatch(/^slow/);
    expect(meaning('Andante')).toBe('at a walking pace');
    expect(meaning('Moderato')).toContain('moderate');
    expect(meaning('Allegro')).toBe('fast and bright');
    expect(meaning('Presto')).toBe('very fast');
    for (const e of all().filter((x): x is MatchPairsExercise => x.type === 'match-pairs' && prompt(x).includes('tempo word'))) {
      for (const p of e.pairs) expect(meaning(plainText(p.left)), plainText(p.left)).toContain(plainText(p.right).toLowerCase());
    }
    expect([tempoRange('Andante')!.min, tempoRange('Andante')!.max]).toEqual([76, 108]);
    expect([tempoRange('Allegro')!.min, tempoRange('Allegro')!.max]).toEqual([120, 156]);
    const q = find<ChoiceExercise>(exercisesOf(lesson('tempo-words')), 'choice', 'Allegro');
    expect(tempoMarking(Number(/\d+/.exec(right(q))![0])).name).toBe('Allegro');
    const named = q.options.map((o) => tempoMarking(Number(/\d+/.exec(plainText(o.text ?? ''))![0])).name);
    expect(named).toEqual(['Larghetto', 'Andante', 'Allegro', 'Presto']); // "slow: closer to Largo or Adagio", Andante, the answer, Presto
    expect(right(find<ChoiceExercise>(exercisesOf(lesson('tempo-words')), 'choice', 'a tempo'))).toBe('Go back to the original speed');
    expect(find<TrueFalseExercise>(exercisesOf(lesson('tempo-words')), 'true-false', 'Accel.').answer).toBe(false);
  });

  it('writes the Andante line on strings 2 and 1, frets 0 to 3, and plays the same notes', () => {
    const staff = card('tempo-words', 'Speed in Italian');
    if (staff.kind !== 'staff') throw new Error('not a staff');
    const written = staff.notes.map((n) => parseNote(typeof n === 'string' ? n : n.note)!.midi!);
    const allowed = [2, 1].flatMap((s) => [0, 1, 2, 3].map((f) => midiAt({ string: s, fret: f })));
    expect(written.every((m) => allowed.includes(m))).toBe(true);
    const durations = staff.notes.map((n) => (typeof n === 'string' ? 'q' : n.duration ?? 'q'));
    expect(rhythm(durations.join(' ').replace(/^((?:\S+ ){3}\S+) ((?:\S+ ){3}\S+) /, '$1 | $2 | ')).onsets).toHaveLength(written.length);
    const accel = card('tempo-words', 'Slowing down, speeding up') as AudioFigure;
    expect(soundPlan(accel.sound).events.map((e) => e.midi[0])).toEqual(written);
  });

  it('names rit. and accel. only from the tempo-words lesson on, and never calls them sudden', () => {
    const texts = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap(texts);
      if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
      return [];
    };
    const words = /accel|ritard|\brit\.|a tempo/i;
    const before = unit.lessons.slice(0, unit.lessons.findIndex((l) => l.id === 'tempo-words'));
    for (const l of before) for (const t of texts(l)) expect(words.test(t), `${l.id}: ${t}`).toBe(false);
    for (const t of texts(unit)) if (/\b(rit|accel)/i.test(t)) expect(t, t).not.toMatch(/sudden/i);
    const shuffle = find<ChoiceExercise>(checkpoint(), 'choice', 'What is a shuffle');
    expect(shuffle.options.find((o) => /tempo/.test(String(o.text)))!.text).toBe('A gradual change of tempo');
  });

  it('spreads the notes further apart in the rit. and closer together in the accel.', () => {
    const accel = card('tempo-words', 'Slowing down, speeding up') as AudioFigure;
    const a = soundGaps(accel.sound);
    expect(a.every((g, i) => i === 0 || g <= a[i - 1])).toBe(true);
    expect(a[0]).toBeGreaterThan(a.at(-1)!);
    const q = find<ListenChoiceExercise>(exercisesOf(lesson('tempo-words')), 'listen-choice', 'slow down or speed up');
    const r = soundGaps(q.sound);
    expect(r.every((g, i) => i === 0 || g >= r[i - 1])).toBe(true);
    expect(r.at(-1)!).toBeGreaterThan(r[0]);
    expect(right(q)).toBe('It slowed down (rit.)');
  });

  it('ends no option text on a full stop (the feedback adds its own: "You picked ... .")', () => {
    for (const e of all()) {
      if (e.type !== 'choice' && e.type !== 'listen-choice') continue;
      for (const o of e.options) if (o.text) expect(plainText(o.text), prompt(e)).not.toMatch(/\.$/);
    }
  });
});
