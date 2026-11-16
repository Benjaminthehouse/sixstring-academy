/**
 * Unit 4 of the Theory Path, cross-checked against the engines: note and rest lengths, how many
 * notes fill a bar, where every tap falls (and that the explanation counts the same), the counts
 * of eighth notes, what each listening question and click track plays, and the strumming pattern.
 */
import { describe, expect, it } from 'vitest';
import { buildVoicing } from '@/core/guitar';
import { barCapacity, chordNotes, noteValue, parseTimeSignature, pcName, PPQ } from '@/core/theory';
import { midiAt } from '@/core/guitar';
import {
  generateExercise, grade, parseRhythm, parseStrum, plainText, solve, soundPlan,
  type Exercise, type ExerciseStep, type Lesson, type ListenChoiceExercise, type Sound, type Step, type TapRhythmExercise,
} from '@/lessons';
import unit from './pulse-and-beat';

const lesson = (id: string): Lesson => {
  const found = unit.lessons.find((l) => l.id === id);
  if (!found) throw new Error(`no lesson ${id}`);
  return found;
};
const literal = (s: Step | ExerciseStep): s is Exercise => !('generate' in s) && s.type !== 'card';
/** Every literal exercise of a lesson: its steps and the facts' review questions. */
function exercisesOf(l: Lesson): Exercise[] {
  const out: Exercise[] = [];
  const add = (s: Step | ExerciseStep | undefined): void => {
    if (s && literal(s)) out.push(s);
  };
  l.steps.forEach(add);
  (l.facts ?? []).forEach((f) => add(f.ask));
  return out;
}
const checkpoint = (): Exercise[] => (unit.checkpoint?.steps ?? []).filter(literal);
const everything = (): Exercise[] => [...unit.lessons.flatMap(exercisesOf), ...checkpoint()];
const of = <K extends Exercise['type']>(list: Exercise[], type: K) => list.filter((e): e is Extract<Exercise, { type: K }> => e.type === type);
const correct = (e: { options: Array<{ text?: unknown; correct?: boolean }> }): string => plainText((e.options.find((o) => o.correct)?.text ?? '') as string);
/** Where the taps of a rhythm fall, in beats from beat one. */
const tapBeats = (pattern: string, time?: string): number[] => parseRhythm({ pattern, time }).onsets.map((t) => t / PPQ);
/** The counting of each tap ("1", "&" ...), as the rhythm engine counts it. */
const tapCounts = (pattern: string): string[] => parseRhythm(pattern).events.filter((e) => e.attack).map((e) => e.count);
const beats = (value: 'whole' | 'half' | 'quarter' | 'eighth'): number => noteValue(value)!.ticks / PPQ;
const words = (n: number): string => (n === 0.5 ? 'Half a beat' : `${n} beat${n === 1 ? '' : 's'}`);
const clicks = (sound: Sound) => soundPlan(sound).events.filter((e) => e.type === 'click');

describe('pulse-and-beat: note and rest lengths', () => {
  it('gives the lengths the engine has, in 4/4', () => {
    expect(parseTimeSignature('4/4')!.unitTicks).toBe(PPQ);
    expect(barCapacity('4/4') / PPQ).toBe(4);
    expect([beats('whole'), beats('half'), beats('quarter'), beats('eighth')]).toEqual([4, 2, 1, 0.5]);
    for (const e of of(everything(), 'match-pairs')) {
      for (const p of e.pairs) {
        const m = /^(Whole|Half|Quarter|Eighth) (note|rest)$/.exec(plainText(p.left));
        if (!m) continue;
        expect(plainText(p.right), plainText(p.left)).toBe(words(beats(m[1].toLowerCase() as 'whole'))); // a rest lasts as long as its note
      }
    }
  });

  it('answers the counting questions as the engine counts', () => {
    expect(barCapacity('4/4') / noteValue('eighth')!.ticks).toBe(8);
    expect(correct(of(exercisesOf(lesson('eighth-notes')), 'choice').find((e) => /fill a bar/.test(plainText(e.prompt)))!)).toBe('8');
    expect(noteValue('quarter')!.ticks / noteValue('eighth')!.ticks).toBe(2);
    expect(correct(of(exercisesOf(lesson('quarter-half-whole')), 'choice').find((e) => /half note last/.test(plainText(e.prompt)))!)).toBe(String(beats('half')));
    expect(correct(of(exercisesOf(lesson('rests')), 'choice').find((e) => /quarter rest last/.test(plainText(e.prompt)))!)).toBe(words(beats('quarter')));
    expect(correct(of(checkpoint(), 'choice').find((e) => /half rest last/.test(plainText(e.prompt)))!)).toBe(words(beats('half')));
  });

  it('fills the counting blanks with the engine\'s counts', () => {
    const eighths = tapCounts('e e e e e e e e');
    expect(eighths.join(' ')).toBe('1 & 2 & 3 & 4 &');
    for (const e of of(everything(), 'fill-blanks')) {
      const blanks = e.blanks.map((b) => plainText(b));
      const line = plainText(e.text).split(/\s+/).filter((t) => t !== '|').map((t) => (t === '___' ? blanks.shift()! : t));
      const quarters = tapCounts('q q q q');
      const expected = /eighth/.test(plainText(e.prompt)) ? eighths : Array.from({ length: line.length / 4 }, () => quarters).flat();
      expect(line, plainText(e.prompt)).toEqual(expected);
    }
  });

  it('shows the half rest first only in the right option', () => {
    const pick = of(exercisesOf(lesson('rests')), 'choice').find((e) => /starts with a half rest/.test(plainText(e.prompt)))!;
    for (const o of pick.options) {
      if (o.figure?.kind !== 'rhythm') throw new Error('figure options');
      const first = parseRhythm(o.figure).events[0];
      expect(first.rest).toBe(true);
      expect(first.value === 'half', o.figure.pattern).toBe(o.correct === true);
    }
    const halves = of(exercisesOf(lesson('quarter-half-whole')), 'choice').find((e) => /made of half notes/.test(plainText(e.prompt)))!;
    for (const o of halves.options) {
      if (o.figure?.kind !== 'rhythm') throw new Error('figure options');
      const values = new Set(parseRhythm(o.figure).events.map((e) => e.value));
      expect(values.size === 1 && values.has('half'), o.figure.pattern).toBe(o.correct === true);
    }
  });
});

describe('pulse-and-beat: where the taps fall', () => {
  const taps = (): TapRhythmExercise[] => of(everything(), 'tap-rhythm');
  const tap = (pattern: string): TapRhythmExercise => {
    const hit = taps().find((t) => t.rhythm.pattern === pattern);
    if (!hit) throw new Error(`no tap-rhythm ${pattern}`);
    return hit;
  };

  it('taps beat 1 of each bar', () => {
    expect(tapBeats(tap('w | w').rhythm.pattern)).toEqual([0, 4]);
  });

  it('taps 1, 3 and 4 around a half note and around a quarter rest, as the explanations say', () => {
    expect(tapBeats('h q q')).toEqual([0, 2, 3]);
    expect(plainText(tap('h q q').explain)).toMatch(/1, 3 and 4/);
    expect(tapBeats('q qr q q')).toEqual([0, 2, 3]);
    expect(plainText(tap('q qr q q').explain)).toMatch(/1, 3 and 4/);
  });

  it('taps the planned strumming pattern: 1, 2, & of 2, & of 3, 4, & of 4', () => {
    const pattern = tap('q e e er e e e').rhythm.pattern;
    expect(tapBeats(pattern)).toEqual([0, 1, 1.5, 2.5, 3, 3.5]);
    expect(tapCounts(pattern)).toEqual(['1', '2', '&', '&', '4', '&']);
    // The strum pattern of the lesson strikes exactly there, down on numbers and up on &s.
    const strum = parseStrum('D-DU-UDU');
    const struck = strum.slots.filter((s) => s.stroke);
    expect(struck.map((s) => s.tick / PPQ)).toEqual(tapBeats(pattern));
    expect(struck.map((s) => (s.stroke === 'down' ? 'Down' : 'Up'))).toEqual(
      of(exercisesOf(lesson('down-up-strumming')), 'order')[0].tiles.map((t) => plainText(t)),
    );
    for (const s of struck) expect(s.stroke).toBe(s.count === '&' ? 'up' : 'down');
    // The hand misses on the & of 1 and on beat 3, as the card says.
    expect(strum.slots.filter((s) => !s.stroke).map((s) => s.tick / PPQ)).toEqual([0.5, 2]);
  });

  it('taps 1, 2 &, 4 & in the checkpoint bar', () => {
    expect(tapBeats('q e e qr e e')).toEqual([0, 1, 1.5, 3, 3.5]);
  });

  it('draws the planned eight beats at 70 BPM from the drill', () => {
    const drill = lesson('the-beat').steps.find((s) => 'generate' in s && s.generate === 'rhythm-tap')!;
    if (!('generate' in drill)) throw new Error('drill');
    for (let seed = 1; seed < 6; seed++) {
      const ex = generateExercise(drill, { seed, difficulty: 0.5, level: 'beginner' });
      if (ex.type !== 'tap-rhythm') throw new Error('tap-rhythm');
      expect(ex.rhythm.pattern).toBe('q q q q | q q q q');
      expect(ex.tempo).toBe(70);
    }
  });
});

describe('pulse-and-beat: what is heard', () => {
  const gaps = (sound: Sound): number[] => {
    const at = clicks(sound).map((c) => c.at);
    return at.slice(1).map((t, i) => Math.round((t - at[i]) * 1000) / 1000);
  };

  it('plays an uneven click when the answer is "not steady"', () => {
    const [q] = of(lesson('the-beat').steps.filter(literal), 'listen-choice');
    expect(new Set(gaps(q.sound)).size).toBeGreaterThan(1);
    expect(correct(q)).toMatch(/^Not steady/);
    // The beat it is compared with is even.
    expect(new Set(gaps({ kind: 'rhythm', pattern: 'q q q q | q q q q', tempo: 60 }))).toEqual(new Set([1]));
  });

  it('plays 120 BPM against a 60 BPM reference: twice as fast', () => {
    const [q] = of(lesson('tempo-and-bpm').steps.filter(literal), 'listen-choice') as ListenChoiceExercise[];
    if (q.figure?.kind !== 'audio') throw new Error('reference');
    expect(new Set(gaps(q.figure.sound))).toEqual(new Set([1]));
    expect(new Set(gaps(q.sound))).toEqual(new Set([0.5]));
    expect(correct(q)).toBe('Faster');
    // 60 BPM is one beat a second, 120 BPM two; 160 BPM nearly three, 70 BPM a little over one.
    expect(60 / 60).toBe(1);
    expect(120 / 60).toBe(2);
    expect(160 / 60).toBeGreaterThan(2.5);
    expect(160 / 60).toBeLessThan(3);
    expect(70 / 60).toBeGreaterThan(1);
  });

  it('accents every third click in 3/4 and every fourth in 4/4', () => {
    const [three, four] = of(lesson('bars-and-four-four').steps.filter(literal), 'listen-choice');
    const accents = (s: Sound) => clicks(s).map((c, i) => (c.accent ? i : -1)).filter((i) => i >= 0);
    expect(accents(three.sound)).toEqual([0, 3, 6]);
    expect(correct(three)).toBe('Three beats');
    expect(accents(four.sound)).toEqual([0, 4, 8]);
    expect(correct(four)).toBe('Four beats');
  });

  it('strums down on every beat and up on every & in the down-up audio', () => {
    for (const s of parseStrum('DUDUDUDU').slots) expect(s.stroke).toBe(s.tick % PPQ === 0 ? 'down' : 'up');
  });
});

describe('pulse-and-beat: on the guitar', () => {
  it('fingers the Em shape it shows: strings 5 and 4 at fret 2', () => {
    const card = lesson('down-up-strumming').steps.find((s) => 'type' in s && s.type === 'card' && s.figure?.kind === 'fretboard');
    if (!card || !('type' in card) || card.type !== 'card' || card.figure?.kind !== 'fretboard') throw new Error('Em card');
    expect(card.figure.dots!.map((d) => `${d.string}:${d.fret}`)).toEqual(['5:2', '4:2']);
    const v = buildVoicing('Em', '022000');
    expect(v.chord).toBe('Em');
    const tones = new Set(chordNotes('Em'));
    for (const n of v.notes) expect(tones.has(pcName(n.note))).toBe(true);
    // Open strings 3, 2 and 1 (G B E) are the top three notes of that chord.
    expect([3, 2, 1].map((s) => pcName(v.notes.find((n) => n.string === s)!.note))).toEqual(['G', 'B', 'E']);
    expect(midiAt({ string: 5, fret: 2 }) % 12).toBe(11); // B
  });
});

describe('pulse-and-beat: every exercise', () => {
  it('accepts its own answer', () => {
    for (const e of everything()) {
      if (e.type === 'flashcard') continue;
      expect(grade(e, solve(e)).correct, 'prompt' in e ? plainText(e.prompt ?? '') : '').toBe(true);
    }
  });

  it('names every fact after the unit', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^pulse-/);
  });
});
