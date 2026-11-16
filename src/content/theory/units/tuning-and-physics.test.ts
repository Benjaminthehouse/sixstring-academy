/**
 * Unit 43 of the Theory Path, cross-checked against the engines: every frequency, harmonic, node,
 * fret distance, cent value and retuning the text quotes is recomputed here, the listening
 * questions are checked for what they play, and the synth is rendered to confirm the claim that a
 * tempered major third shimmers while a tempered fifth sits still.
 */
import { describe, expect, it } from 'vitest';
import { midiToFreq } from '@/core/math/pitch-math';
import { harmonicAmplitudes, renderPluck } from '@/core/audio';
import { identifyChord, interval, noteToMidi, semitones } from '@/core/theory';
import { buildVoicing, fretDistance, frequencyAt, hasStandardIntervals, midiAt, retuneSteps, tuning, tuningFrequencies } from '@/core/guitar';
import {
  findTargets, plainText, soundPlan, type ChoiceExercise, type Exercise, type FretboardFindExercise, type Lesson, type ListenChoiceExercise, type Step,
} from '@/lessons';
import unit, { DROP_D_POWER } from './tuning-and-physics';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const exercises = (l: Lesson): Exercise[] => l.steps.filter((s: Step): s is Exercise => !('generate' in s) && s.type !== 'card');
const listens = (l: Lesson): ListenChoiceExercise[] => exercises(l).filter((e): e is ListenChoiceExercise => e.type === 'listen-choice');
const heard = (e: ListenChoiceExercise): number[] => soundPlan(e.sound).events.flatMap((ev) => ev.midi);
const answerOf = (e: ChoiceExercise | ListenChoiceExercise): string => plainText(e.options.find((o) => o.correct)?.text ?? '');
const hz = (note: string): number => midiToFreq(noteToMidi(note));
const round1 = (x: number): number => Math.round(x * 10) / 10;
const cents = (ratio: number): number => 1200 * Math.log2(ratio);
const key = (p: { string: number; fret: number }): string => `${p.string}:${p.fret}`;

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

describe('tuning-and-physics: frequency and concert pitch', () => {
  it('quotes the right frequencies', () => {
    expect(hz('A4')).toBe(440);
    expect(frequencyAt({ string: 1, fret: 5 })).toBe(440); // A4 = string 1, fret 5
    expect(hz('A3')).toBe(220);
    expect(hz('A2')).toBe(110);
    expect(hz('A5')).toBe(880);
    expect(midiAt({ string: 1, fret: 17 })).toBe(noteToMidi('A5')); // "string 1, fret 17"
    expect(round1(hz('C4'))).toBe(261.6); // middle C, "about 261.6 Hz"
    expect(round1(hz('E3'))).toBe(164.8);
    expect(round1(hz('E5'))).toBe(659.3);
    expect(round1(hz('E2') / 2)).toBe(41.2);
  });

  it('gives the open strings as 82.4, 110, 146.8, 196, 246.9 and 329.6 Hz', () => {
    expect(tuningFrequencies('standard').map(round1)).toEqual([82.4, 110, 146.8, 196, 246.9, 329.6]);
    expect(hz('E4') / hz('E2')).toBeCloseTo(4, 9); // string 1 is exactly four times string 6
  });

  it('calls 112 Hz on the A string sharp, about a third of a half step', () => {
    const c = cents(112 / 110);
    expect(c).toBeGreaterThan(25);
    expect(c).toBeLessThan(40);
  });
});

describe('tuning-and-physics: length, tension and mass', () => {
  it('half the length is an octave; doubling the tension is six half steps; four times is an octave', () => {
    expect(fretDistance(12)).toBe(0.5);
    expect(cents(Math.sqrt(2))).toBeCloseTo(600, 9);
    expect(semitones('A4')).toBe(6); // a tritone
    expect(Math.round(Math.sqrt(2) * 100) / 100).toBe(1.41);
    expect(Math.sqrt(4)).toBe(2);
    expect(midiAt({ string: 6, fret: 12 })).toBe(noteToMidi('E3'));
  });

  it('plays what the cards describe: E F F# for tightening, string 6 then string 1 for mass', () => {
    const l = lesson('what-sets-the-pitch');
    const audio = l.steps.flatMap((s) => ('figure' in s && s.figure?.kind === 'audio' ? [soundPlan(s.figure.sound).events.flatMap((e) => e.midi)] : []));
    expect(audio).toEqual([[40, 41, 42], [40, 64]]);
  });
});

describe('tuning-and-physics: the harmonic series', () => {
  const e2 = hz('E2');

  it('quotes the low E harmonics: 164.8, 247.2, 329.6 and 412 Hz', () => {
    expect([2, 3, 4, 5].map((n) => round1(n * e2))).toEqual([164.8, 247.2, 329.6, 412]);
    expect(cents((2 * e2) / hz('E3'))).toBeCloseTo(0, 6);
    expect(Math.abs(cents((3 * e2) / hz('B3')))).toBeLessThan(2.5); // B3, a hair sharp
    expect(cents((4 * e2) / hz('E4'))).toBeCloseTo(0, 6);
    const fifth = cents((5 * e2) / hz('G#4'));
    expect(fifth).toBeLessThan(-12); // "a little below G#4"
    expect(fifth).toBeGreaterThan(-15);
  });

  it('names the intervals of harmonics 2 to 5', () => {
    expect([2, 3, 4, 5].map((n) => Math.round(cents(n) / 100))).toEqual([12, 19, 24, 28]);
    expect(semitones('P8')).toBe(12);
    expect(interval('P12').semitones).toBe(19); // an octave and a fifth
    expect(semitones('P8') * 2).toBe(24);
    expect(semitones('P8') * 2 + semitones('M3')).toBe(28);
  });

  it('the 3rd harmonic of A2 is 330 Hz, close to E4', () => {
    expect(3 * hz('A2')).toBe(330);
    expect(Math.abs(cents(330 / hz('E4')))).toBeLessThan(2.5);
    expect(4 * hz('A2')).toBe(440);
    expect(1.5 * hz('A2')).toBe(165);
  });

  it('plays the harmonic pitches, and the listening question is E2 to B3: an octave and a fifth', () => {
    const [q] = listens(lesson('the-harmonic-series'));
    expect(heard(q)).toEqual([40, 59]);
    expect(59 - 40).toBe(19);
    expect(answerOf(q)).toBe('An octave and a fifth');
  });

  it('marks the nodes of string 6 at frets 12, 7 and 5 (halves, thirds, quarters)', () => {
    expect(fretDistance(12)).toBe(1 / 2);
    expect(Math.abs(fretDistance(7) - 1 / 3)).toBeLessThan(0.001);
    expect(Math.abs(fretDistance(5) - 1 / 4)).toBeLessThan(0.001);
  });
});

describe('tuning-and-physics: natural harmonics', () => {
  /** The pitch of the harmonic over a node: fret 12 -> x2, fret 7 and 19 -> x3, fret 5 and 24 -> x4. */
  const harmonicOver = (string: number, fret: number): number => {
    const multiple = { 12: 2, 7: 3, 19: 3, 5: 4, 24: 4 }[fret]!;
    return midiAt({ string, fret: 0 }) + Math.round(cents(multiple) / 100);
  };

  it('frets 7 and 19 both sit on thirds nodes; frets 5 and 24 on quarters', () => {
    expect(Math.abs(fretDistance(19) - 2 / 3)).toBeLessThan(0.001);
    expect(fretDistance(24)).toBe(0.75);
    // The thirds node is exactly where the fret 7 note's 3x vibration lands: 19 half steps up.
    expect(Math.round(cents(3) / 100)).toBe(19);
  });

  it('on string 6 the harmonics at frets 12, 7 and 5 are E3, B3 and E4; fret 19 is B3 too', () => {
    expect([12, 7, 5, 19].map((f) => harmonicOver(6, f))).toEqual(['E3', 'B3', 'E4', 'B3'].map(noteToMidi));
    expect(midiAt({ string: 6, fret: 7 })).toBe(noteToMidi('B2')); // the fretted note, an octave lower
  });

  it('the fret 7 harmonic of string 4 is A4 and of string 5 is E4 (the open string 1)', () => {
    expect(harmonicOver(4, 7)).toBe(noteToMidi('A4'));
    expect(harmonicOver(5, 7)).toBe(noteToMidi('E4'));
    expect(harmonicOver(5, 7)).toBe(midiAt({ string: 1, fret: 0 }));
    expect(midiAt({ string: 5, fret: 7 })).toBe(noteToMidi('E3')); // pressing fret 7
    expect(harmonicOver(5, 12)).toBe(noteToMidi('A3'));
    expect(harmonicOver(5, 5)).toBe(noteToMidi('A4'));
    const play = collect<{ type: string; note: string; alternative: ChoiceExercise }>((v) => v.type === 'play-note' && v.note === 'E4')[0];
    expect(answerOf(play.alternative)).toBe('E4');
  });

  it('the fret 12 harmonic of string 4 matches the fretted note there: D4', () => {
    expect(harmonicOver(4, 12)).toBe(noteToMidi('D4'));
    const ff = collect<FretboardFindExercise>((v) => v.type === 'fretboard-find' && JSON.stringify(v.find) === '{"note":"D4"}')[0];
    expect(findTargets(ff).map(key)).toEqual(['4:12']);
  });
});

describe('tuning-and-physics: fret spacing and intonation', () => {
  const L = 648;

  it('each fret keeps about 94.4% of the string and cuts 5.6%', () => {
    const keep = 2 ** (-1 / 12);
    expect(Math.round(keep * 1000) / 10).toBe(94.4);
    expect(Math.round((1 - keep) * 1000) / 10).toBe(5.6);
    expect(keep ** 12).toBeCloseTo(0.5, 12);
  });

  it('quotes the 648 mm distances: 36.4, 324, 486 mm; gaps 34.3 and 19.3 mm', () => {
    expect(round1(fretDistance(1, L))).toBe(36.4);
    expect(fretDistance(12, L)).toBe(324);
    expect(fretDistance(24, L)).toBe(486);
    expect(round1(fretDistance(2, L) - fretDistance(1, L))).toBe(34.3);
    expect(round1(fretDistance(12, L) - fretDistance(11, L))).toBe(19.3);
    // The distractors: 162 mm is a quarter (near fret 5), 432 mm two thirds (near fret 19).
    expect(Math.abs(fretDistance(5, L) - 162)).toBeLessThan(1);
    expect(Math.abs(fretDistance(19, L) - 432)).toBeLessThan(1);
    expect(Math.round(25.5 * 25.4)).toBe(648); // 25½ inches
    // The figure caption: the first fret space is nearly twice as wide as the twelfth.
    const ratio = fretDistance(1, L) / (fretDistance(12, L) - fretDistance(11, L));
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2);
  });

  it('moving the saddle away from the neck lowers the fretted note against the harmonic', () => {
    // The open string is retuned to pitch after each move, so the fret 12 harmonic stays at 2x.
    const fret12 = fretDistance(12, L);
    const fretted = (length: number): number => length / (length - fret12); // fretted 12th over the open string
    expect(fretted(L)).toBeCloseTo(2, 12);
    expect(fretted(L + 2)).toBeLessThan(2); // away from the neck: flatter
    expect(fretted(L - 2)).toBeGreaterThan(2); // toward the neck: sharper
  });
});

describe('tuning-and-physics: equal temperament', () => {
  it('quotes the cents: 1200 to the octave, pure fifth 702, pure third 386, pure fourth 498', () => {
    expect(12 * 100).toBe(1200);
    expect(semitones('P5') * 100).toBe(700);
    expect(semitones('M3') * 100).toBe(400);
    expect(Math.round(cents(3 / 2))).toBe(702);
    expect(Math.round(cents(5 / 4))).toBe(386);
    expect(Math.round(cents(4 / 3))).toBe(498);
    expect(Math.round(cents(3 / 2) - 700)).toBe(2); // the pure fifth is about 2 cents wider
    expect(Math.round(400 - cents(5 / 4))).toBe(14); // the pure third about 14 cents narrower
    expect(cents(2)).toBe(1200); // the octave stays pure
  });

  it('tuning string 5 by harmonics leaves it about 2 cents flat of equal temperament', () => {
    const a = (4 * hz('E2')) / 3; // the fret 5 harmonic of string 6 (x4) = the fret 7 harmonic of string 5 (x3)
    expect(Math.round(cents(a / hz('A2')))).toBe(-2);
    expect(4 * hz('E2')).toBeCloseTo(hz('E4'), 9); // both harmonics are E4
    expect(Math.abs(cents((3 * hz('A2')) / hz('E4')))).toBeLessThan(2.5);
  });

  it('the figure: A2-E3 is a fifth and E3-G#3 a major third, on the frets shown', () => {
    expect(midiAt({ string: 5, fret: 0 })).toBe(noteToMidi('A2'));
    expect(midiAt({ string: 4, fret: 2 })).toBe(noteToMidi('E3'));
    expect(midiAt({ string: 3, fret: 1 })).toBe(noteToMidi('G#3'));
    const ff = collect<FretboardFindExercise>((v) => v.type === 'fretboard-find' && (v.find as { interval?: string }).interval === 'M3')[0];
    expect(findTargets(ff).map(key)).toEqual(['3:1']);
    const [q] = listens(lesson('equal-temperament'));
    expect(heard(q)).toEqual([52, 56]);
    expect(answerOf(q)).toMatch(/major third/);
  });

  it('in the synth the tempered third beats about 6.5 times a second and the fifth under once in two seconds', () => {
    // The beats come from near-coinciding harmonics: 5 x E3 against 4 x G#3, and 3 x A2 against 2 x E3.
    const thirdBeat = Math.abs(5 * hz('E3') - 4 * hz('G#3'));
    const fifthBeat = Math.abs(3 * hz('A2') - 2 * hz('E3'));
    expect(thirdBeat).toBeGreaterThan(6);
    expect(thirdBeat).toBeLessThan(7);
    expect(fifthBeat).toBeLessThan(0.5);
    // The synth's notes really carry those harmonics (within 30 dB of the fundamental), so the beat is there to hear.
    const fs = 48000;
    const db = (note: string, harmonic: number): number => {
      const x = renderPluck({ midi: noteToMidi(note), sampleRate: fs, seconds: 1 });
      const h = harmonicAmplitudes(x, fs, hz(note), harmonic, 0.2, 0.2);
      return 20 * Math.log10(h[harmonic - 1] / h[0]);
    };
    expect(db('E3', 5)).toBeGreaterThan(-30);
    expect(db('G#3', 4)).toBeGreaterThan(-30);
  });
});

describe('tuning-and-physics: alternate tunings', () => {
  it('drop D, DADGAD and open G have the open strings the lesson names', () => {
    expect(tuning('drop-d').notes).toEqual(['D2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(tuning('dadgad').notes).toEqual(['D2', 'A2', 'D3', 'G3', 'A3', 'D4']);
    expect(tuning('open-g').notes).toEqual(['D2', 'G2', 'D3', 'G3', 'B3', 'D4']);
  });

  it('retunes the strings it says, each down a whole step', () => {
    const moves = (id: string): string[] => retuneSteps(id).filter((s) => s.semitones !== 0).map((s) => `${s.string}:${s.semitones}`);
    expect(moves('drop-d')).toEqual(['6:-2']);
    expect(moves('dadgad').sort()).toEqual(['1:-2', '2:-2', '6:-2']);
    expect(moves('open-g').sort()).toEqual(['1:-2', '5:-2', '6:-2']);
  });

  it('open G strums G major; drop D strings 6-5-4 are D5 open and E5 at fret 2', () => {
    expect(identifyChord([...tuning('open-g').midi])).toBe('G/D'); // G major, its fifth D in the bass
    expect(identifyChord(tuning('drop-d').midi.slice(0, 3))).toBe('D5');
    expect(identifyChord([0, 1, 2].map((i) => tuning('drop-d').midi[i] + 2))).toBe('E5');
    const ff = collect<FretboardFindExercise>((v) => v.type === 'fretboard-find' && JSON.stringify(v.find) === '{"chord":"E5"}')[0];
    expect(findTargets(ff).map(key)).toEqual(['6:2', '5:2', '4:2']);
    expect(DROP_D_POWER.map((n) => ('fret' in n ? midiAt({ string: n.string, fret: n.fret }, { tuning: 'drop-d' }) : -1))).toEqual([38, 45, 50, 40, 47, 52]);
  });

  it('the D5 shape xx023x is D5 and sounds the same in standard tuning and drop D', () => {
    const standard = buildVoicing('D5', 'xx023x');
    const dropD = buildVoicing('D5', 'xx023x', { tuning: 'drop-d' });
    expect(standard.midi).toEqual(dropD.midi);
    expect(standard.midi).toEqual([50, 57, 62]);
    // "In standard tuning the same three-string power chord is a shape like 1-3-3".
    expect(identifyChord([1, 3, 3].map((f, i) => tuning('standard').midi[i] + f))).toBe('F5');
  });

  it('CAGED assumes standard tuning: the alternate tunings break its string intervals', () => {
    expect(hasStandardIntervals('standard')).toBe(true);
    for (const id of ['drop-d', 'dadgad', 'open-g']) expect(hasStandardIntervals(id), id).toBe(false);
  });

  it('the DADGAD-only review of the tunings fact is now a match of all three tunings, spelled by the engine', () => {
    const fact = unit.lessons.flatMap((l) => l.facts ?? []).find((f) => f.id === 'physics-tunings-common')!;
    const ask = fact.ask as { type: string; pairs: Array<{ left: string; right: string }> };
    expect(ask.type).toBe('match-pairs');
    const ids: Record<string, string> = { 'Drop D': 'drop-d', DADGAD: 'dadgad', 'Open G': 'open-g' };
    for (const { left, right } of ask.pairs) expect(right, left).toBe(tuning(ids[left]).notes.map((n) => n.replace(/\d/, '')).join(' '));
  });

  it('drop D changes only string 6, as the play-chord prompt and the checkpoint say', () => {
    expect(retuneSteps('drop-d').filter((s) => s.semitones !== 0)).toEqual([expect.objectContaining({ string: 6, semitones: -2 })]);
    const play = collect<{ type: string; prompt: string }>((v) => v.type === 'play-chord')[0];
    expect(plainText(play.prompt)).toMatch(/changes only string 6/);
    const q = unit.checkpoint!.steps!.find((s): s is ChoiceExercise => 'type' in s && s.type === 'choice' && plainText(s.prompt).includes('drop D'))!;
    expect(answerOf(q)).toMatch(/^Lower string 6 a whole step, to D$/);
    // The distractors: string 1 is still E in drop D; E raised a whole step is F#.
    expect(tuning('drop-d').notes[5]).toBe('E4');
    expect(midiAt({ string: 6, fret: 2 })).toBe(noteToMidi('F#2'));
  });

  it('the checkpoint asks about the pure major third, and "furthest from pure" is limited to the options', () => {
    const q = unit.checkpoint!.steps!.find((s): s is ChoiceExercise => 'type' in s && s.type === 'choice' && plainText(s.prompt).includes('pure major third'))!;
    expect(answerOf(q)).toBe('About 14 cents wider');
    expect(Math.round(400 - cents(5 / 4))).toBe(14);
    // The pure minor third (6:5) and major sixth (5:3) sit even further from their tempered sizes,
    // so the lesson question must say "of these three" (third, fifth, octave).
    expect(Math.abs(300 - cents(6 / 5))).toBeGreaterThan(400 - cents(5 / 4));
    expect(Math.abs(900 - cents(5 / 3))).toBeGreaterThan(400 - cents(5 / 4));
    const furthest = exercises(lesson('equal-temperament')).find((e): e is ChoiceExercise => e.type === 'choice' && plainText(e.prompt).includes('furthest'))!;
    expect(plainText(furthest.prompt)).toMatch(/^Of these three/);
    expect(furthest.options.map((o) => plainText(o.text ?? ''))).toEqual(['The major third', 'The fifth', 'The octave']);
    expect(answerOf(furthest)).toBe('The major third');
  });

  it('the harmonic series audio is labelled as the nearest fretted notes: G#4 sits above harmonic 5', () => {
    const card = lesson('the-harmonic-series').steps.find((s) => 'figure' in s && s.figure?.kind === 'audio' && 'title' in s && s.title === 'The series on the low E')!;
    const fig = (card as { figure: { label: string; sound: { notes: string[] } } }).figure;
    expect(fig.sound.notes).toEqual(['E2', 'E3', 'B3', 'E4', 'G#4']);
    expect(fig.label).toBe('Hear the nearest notes');
    expect(hz('G#4')).toBeGreaterThan(5 * hz('E2')); // "a shade above harmonic 5"
    expect(cents(hz('G#4') / (5 * hz('E2')))).toBeLessThan(15);
  });

  it('says the frequency (not "the pitch") rises 1.41 times when the tension doubles', () => {
    const tf = exercises(lesson('what-sets-the-pitch')).find((e) => e.type === 'true-false')!;
    expect(plainText(tf.explain)).toMatch(/the frequency rises only about 1\.41 times/);
    expect(Math.sqrt(2)).toBeCloseTo(1.41, 2);
  });

  it('the checkpoint 5th harmonic of 110 Hz is 550 Hz, near C#5', () => {
    expect(5 * 110).toBe(550);
    expect(Math.abs(cents(550 / hz('C#5')))).toBeLessThan(15);
  });
});
