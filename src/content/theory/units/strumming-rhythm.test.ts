/**
 * Unit 9 of the Theory Path, cross-checked against the engines: dotted lengths and what fills a
 * bar, where every tap falls (and that the explanation counts the same), the tie, 3/4 and the
 * pickup as the click track plays them, sixteenth-note counting and strokes, the slash charts,
 * the chord change, the muted-strum pattern, the traditional tune's notes, and every exercise.
 */
import { describe, expect, it } from 'vitest';
import { chordVoicings, midiAt } from '@/core/guitar';
import { barCapacity, durationTicks, midiToNote, noteValue, pcName, PPQ, scaleNotes, staffPosition } from '@/core/theory';
import {
  estimateLessonSeconds, generateExercise, grade, isGenerated, parseRhythm, parseStrum, plainText, solve, soundPlan,
  type Exercise, type ExerciseStep, type Lesson, type Sound, type Step, type TapRhythmExercise,
} from '@/lessons';
import unit from './strumming-rhythm';

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
const choiceIn = (list: Exercise[], re: RegExp) => {
  const hit = of(list, 'choice').find((e) => re.test(prompt(e)));
  if (!hit) throw new Error(`no choice ${re}`);
  return hit;
};

const beats = (ticks: number): number => ticks / PPQ;
const dotted = (value: 'half' | 'quarter' | 'eighth'): number => beats(durationTicks(value, { dots: 1 }));
const plain = (value: 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth'): number => beats(noteValue(value)!.ticks);
/** "1½" and "3 beats" as numbers. */
const asBeats = (text: string): number => Number(text.replace('½', '.5').replace(/ beats?$/, '').replace(/^(\d)\.5$/, '$1.5'));
/** Where the taps of a rhythm fall, in beats from beat one. */
const tapBeats = (pattern: string, time?: string): number[] => parseRhythm({ pattern, time }).onsets.map(beats);
/** The counting of each tap ("1", "&", "e", "a"), as the rhythm engine counts it. */
const tapCounts = (pattern: string, time?: string): string[] => parseRhythm({ pattern, time }).events.filter((e) => e.attack).map((e) => e.count);
const taps = (): TapRhythmExercise[] => of(everything(), 'tap-rhythm');
const clicks = (sound: Sound) => soundPlan(sound).events.filter((e) => e.type === 'click');

describe('strumming-rhythm: dotted notes', () => {
  it('gives the lengths the engine has', () => {
    expect(dotted('half')).toBe(3);
    expect(dotted('quarter')).toBe(1.5);
    expect(dotted('half')).toBe(plain('half') + plain('quarter')); // a dotted half = a half + a quarter
    expect(dotted('quarter') + plain('eighth')).toBe(2); // a dotted quarter and an eighth fill two beats
    expect(asBeats(correct(choiceIn(exercisesOf(lesson('dotted-notes')), /dotted quarter note last/)))).toBe(dotted('quarter'));
    expect(asBeats(correct(choiceIn(exercisesOf(lesson('dotted-notes')), /How many beats do they fill/)))).toBe(2);
    const sum = of(exercisesOf(lesson('dotted-notes')), 'fill-blanks')[0];
    expect(sum.blanks).toEqual(['quarter']);
  });

  it('matches each note with its length in 4/4', () => {
    const words: Record<string, number> = { 'Dotted half note': dotted('half'), 'Half note': plain('half'), 'Dotted quarter note': dotted('quarter'), 'Quarter note': plain('quarter') };
    const lists = of(everything(), 'match-pairs').filter((e) => /how long it lasts/.test(prompt(e)));
    expect(lists.length).toBe(2);
    for (const e of lists) for (const p of e.pairs) expect(asBeats(plainText(p.right)), plainText(p.left)).toBe(words[plainText(p.left)]);
  });

  it('fills a bar of 3/4 with one dotted half note', () => {
    expect(durationTicks('half', { dots: 1 })).toBe(barCapacity('3/4'));
    expect(noteValue('whole')!.ticks).toBeGreaterThan(barCapacity('3/4'));
    for (const e of [choiceIn(exercisesOf(lesson('three-four-time')), /fills a whole bar of 3\/4/), choiceIn(checkpoint(), /fills a whole bar of 3\/4/)]) {
      expect(correct(e)).toBe('A dotted half note');
    }
  });
});

describe('strumming-rhythm: where the taps fall', () => {
  const tap = (pattern: string): TapRhythmExercise => {
    const hit = taps().find((t) => t.rhythm.pattern === pattern);
    if (!hit) throw new Error(`no tap-rhythm ${pattern}`);
    return hit;
  };

  it('taps the dotted rhythms where the explanations say', () => {
    expect(tapBeats('h. q')).toEqual([0, 3]);
    expect(plainText(tap('h. q').explain)).toMatch(/on 1 and on 4/);
    expect(tapBeats('q. e h')).toEqual([0, 1.5, 2]);
    expect(tapCounts('q. e h')).toEqual(['1', '&', '3']);
    expect(plainText(tap('q. e h').explain)).toMatch(/on 1, on the & of 2, and on 3/);
  });

  it('holds the tied note through beat 1 of bar 2', () => {
    const t = tap('h q q | ~q q h');
    expect(tapBeats(t.rhythm.pattern)).toEqual([0, 2, 3, 5, 6]);
    const tied = parseRhythm(t.rhythm.pattern).events.find((e) => e.tied)!;
    expect(beats(tied.tick)).toBe(4); // beat 1 of bar 2
    expect(tied.attack).toBe(false);
    // The click track of the card leaves beat 1 of bar 2 silent too.
    expect(clicks({ kind: 'rhythm', pattern: t.rhythm.pattern, tempo: 70 }).map((c) => Math.round(c.at * 70 / 60 * 1000) / 1000)).toEqual([0, 2, 3, 5, 6]);
  });

  it('taps every beat of two bars of 3/4', () => {
    expect(tapBeats('q q q | q q q', '3/4')).toEqual([0, 1, 2, 3, 4, 5]);
    expect(tapCounts('q q q | q q q', '3/4')).toEqual(['1', '2', '3', '1', '2', '3']);
  });

  it('taps the pickup of When the Saints on 2, 3 and 4, then beat 1', () => {
    const t = tap('qr q q q | w');
    expect(tapBeats(t.rhythm.pattern)).toEqual([1, 2, 3, 4]);
    expect(tapCounts(t.rhythm.pattern)).toEqual(['2', '3', '4', '1']);
  });

  it('taps four sixteenths, then three quarters', () => {
    expect(tapBeats('s s s s q q q')).toEqual([0, 0.25, 0.5, 0.75, 1, 2, 3]);
    expect(tapCounts('s s s s q q q')).toEqual(['1', 'e', '&', 'a', '2', '3', '4']);
  });

  it('taps the strumming pattern for two bars, down on numbers and up on the &s', () => {
    const t = taps().find((x) => x.rhythm.pattern.includes('|') && x.rhythm.pattern.startsWith('q e e er'))!;
    expect(tapBeats(t.rhythm.pattern)).toEqual([0, 1, 1.5, 2.5, 3, 3.5, 4, 5, 5.5, 6.5, 7, 7.5]);
    // The strum pattern on the card strikes exactly there.
    const strum = parseStrum('D-DU-UDU');
    const struck = strum.slots.filter((s) => s.stroke);
    expect(struck.map((s) => beats(s.tick))).toEqual(tapBeats('q e e er e e e'));
    for (const s of struck) expect(s.stroke).toBe(s.count === '&' ? 'up' : 'down');
    // The last upstroke before the change is the & of 4.
    expect(struck[struck.length - 1]).toMatchObject({ stroke: 'up', count: '&', tick: 3.5 * PPQ });
  });

  it('taps the backbeat on 2 and 4', () => {
    expect(tapBeats('qr q qr q | qr q qr q').map((b) => (b % 4) + 1)).toEqual([2, 4, 2, 4]);
  });

  it('keeps every tap-rhythm within the engine limits', () => {
    for (const t of taps()) {
      const parsed = parseRhythm(t.rhythm);
      expect(parsed.problems, t.rhythm.pattern).toEqual([]);
      expect(parsed.onsets.length).toBeGreaterThanOrEqual(2);
      const gaps = parsed.onsets.slice(1).map((o, i) => ((o - parsed.onsets[i]) / PPQ) * (60 / t.tempo));
      for (const g of gaps) expect(g).toBeGreaterThanOrEqual(0.14);
    }
  });
});

describe('strumming-rhythm: what is heard', () => {
  it('accents every third beat in the 3/4 question', () => {
    const [q] = of(exercisesOf(lesson('three-four-time')), 'listen-choice');
    const accented = clicks(q.sound).filter((c) => c.accent).map((c) => Math.round((c.at * 100) / 60));
    expect(accented).toEqual([0, 3, 6, 9]); // seconds at 100 BPM, as beats
    expect(correct(q)).toBe('In 3');
  });

  it('plays three soft clicks before the loud beat 1 in the pickup question', () => {
    const [q] = of(exercisesOf(lesson('pickup-notes')), 'listen-choice');
    const cs = clicks(q.sound);
    expect(cs.map((c) => !!c.accent)).toEqual([false, false, false, true, false]);
    expect(correct(q)).toBe('With a pickup');
  });

  it('puts the muted strums on beats 2 and 4', () => {
    const [q] = of(exercisesOf(lesson('accents-and-muted-strums')), 'listen-choice');
    if (q.sound.kind !== 'strum') throw new Error('strum');
    const slots = parseStrum(q.sound.pattern).slots;
    expect(slots.filter((s) => s.stroke === 'mute').map((s) => s.count)).toEqual(['2', '4']);
    expect(slots.filter((s) => s.stroke === 'down' || s.stroke === 'up').map((s) => s.count)).toEqual(['1', '3', '&']);
    expect(correct(q)).toBe('On beats 2 and 4');
    expect(soundPlan(q.sound).events.filter((e) => e.muted).length).toBe(4); // two bars
  });

  it('mutes every sixteenth of the sixteenth-note strum, down on 1 and &, up on e and a', () => {
    const muted = parseStrum('XXXXXXXXXXXXXXXX', 'sixteenth');
    expect(muted.problems).toEqual([]);
    expect(muted.slots.every((s) => s.stroke === 'mute')).toBe(true);
    const open = parseStrum('DUDUDUDUDUDUDUDU', 'sixteenth');
    for (const s of open.slots) expect(s.stroke, s.count).toBe(s.count === 'e' || s.count === 'a' ? 'up' : 'down');
  });
});

describe('strumming-rhythm: sixteenth notes', () => {
  it('fits four in a beat and sixteen in a bar, with two flags', () => {
    expect(noteValue('quarter')!.ticks / noteValue('sixteenth')!.ticks).toBe(4);
    expect(barCapacity('4/4') / noteValue('sixteenth')!.ticks).toBe(16);
    expect(noteValue('sixteenth')!.flags).toBe(2);
    expect(noteValue('eighth')!.flags).toBe(1);
    expect(correct(choiceIn(exercisesOf(lesson('sixteenth-notes')), /fill a bar of 4\/4/))).toBe('16');
    const typed = of(checkpoint(), 'type-answer').find((e) => /sixteenth/.test(prompt(e)))!;
    expect(typed.answer).toMatchObject({ value: 16 });
  });

  it('fills the counting blanks with the engine\'s counts', () => {
    const sixteenths = tapCounts('s s s s s s s s s s s s s s s s');
    expect(sixteenths.join(' ')).toBe('1 e & a 2 e & a 3 e & a 4 e & a');
    for (const e of of(everything(), 'fill-blanks').filter((f) => /sixteenth/.test(prompt(f)))) {
      const blanks = e.blanks.map((b) => plainText(b));
      const line = plainText(e.text).split(/\s+/).map((t) => (t === '___' ? blanks.shift()! : t));
      expect(line, plainText(e.text)).toEqual(sixteenths.slice(0, line.length));
    }
  });

  it('draws one full bar on the middle line of the staff', () => {
    const card = lesson('sixteenth-notes').steps.find((s) => 'type' in s && s.type === 'card' && s.figure?.kind === 'staff');
    if (!card || !('type' in card) || card.type !== 'card' || card.figure?.kind !== 'staff') throw new Error('staff card');
    const notes = card.figure.notes.map((n) => (typeof n === 'string' ? { note: n, duration: 'q' } : n));
    const ticks = notes.reduce((sum, n) => sum + noteValue(n.duration === 's' ? 'sixteenth' : 'quarter')!.ticks, 0);
    expect(ticks).toBe(barCapacity('4/4'));
    for (const n of notes) expect(staffPosition(n.note).position).toBe(4);
  });
});

describe('strumming-rhythm: pickups', () => {
  const phrase = of(exercisesOf(lesson('pickup-notes')), 'play-phrase')[0];

  it('plays When the Saints in C: C E F on beats 2, 3, 4, then G on beat 1', () => {
    const notes = phrase.notes.filter((n): n is { string: number; fret: number; duration: string } => 'string' in n);
    const midi = notes.map((n) => midiAt(n));
    expect(midi.map((m) => midiToNote(m))).toEqual(['C4', 'E4', 'F4', 'G4']);
    const cMajor = scaleNotes('C', 'major');
    for (const m of midi) expect(cMajor).toContain(pcName(midiToNote(m)));
    // The figure (with its silent beat 1) puts G on beat 1 of bar 2.
    const card = lesson('pickup-notes').steps.find((s) => 'type' in s && s.type === 'card' && s.figure?.kind === 'tab');
    if (!card || !('type' in card) || card.type !== 'card' || card.figure?.kind !== 'tab') throw new Error('tab card');
    let tick = 0;
    const starts: number[] = [];
    for (const n of card.figure.notes) {
      if ('string' in n) starts.push(beats(tick));
      tick += parseRhythm(n.duration).events[0]?.ticks ?? 0;
    }
    expect(starts).toEqual([1, 2, 3, 4]);
    expect(tick).toBe(2 * barCapacity('4/4'));
    // The tapping alternative orders the same four notes.
    const alt = phrase.alternative;
    if (!alt || !('type' in alt) || alt.type !== 'order') throw new Error('order');
    expect(alt.tiles.map((t) => plainText(t))).toEqual(midi.map((m) => pcName(midiToNote(m))));
  });

  it('puts the pickup of My Bonnie on beat 3 of 3/4', () => {
    expect(tapBeats('qr qr q', '3/4')).toEqual([2]);
    expect(correct(choiceIn(exercisesOf(lesson('pickup-notes')), /My Bonnie/))).toBe('Beat 3');
  });

  it('shortens the last bar by the pickup', () => {
    const e = choiceIn(exercisesOf(lesson('pickup-notes')), /last bar/);
    expect(asBeats(correct(e))).toBe(beats(barCapacity('4/4')) - 3);
  });
});

describe('strumming-rhythm: charts and the chord change', () => {
  /** The beat (1-based) each chord of a one-bar slash chart starts on, and how long it lasts. */
  const read = (bar: string): Array<{ chord: string; beat: number; length: number }> => {
    const marks = bar.trim().split(/\s+/);
    expect(marks.length).toBe(4);
    const out: Array<{ chord: string; beat: number; length: number }> = [];
    marks.forEach((m, i) => {
      if (m === '/') out[out.length - 1].length++;
      else out.push({ chord: m.replace(/^\{c:|\}$/g, ''), beat: i + 1, length: 1 });
    });
    return out;
  };

  it('reads the charts as the answers say', () => {
    expect(read('{c:Em} / {c:Am} /').find((c) => c.chord === 'Am')!.beat).toBe(3);
    expect(correct(choiceIn(exercisesOf(lesson('changing-chords-in-time')), /on which beat does Am start/))).toBe('Beat 3');
    const typed = of(exercisesOf(lesson('changing-chords-in-time')), 'type-answer')[0];
    const bar2 = /\| \{c:Am\} \/ \/ \/ \| (.*) \|/.exec(typed.prompt as string)![1];
    expect(typed.answer).toMatchObject({ value: read(bar2).find((c) => c.chord === 'Dm')!.length });
    expect(read('{c:Em} / / /')).toEqual([{ chord: 'Em', beat: 1, length: 4 }]);
  });

  it('moves fingers 2 and 3 over one string from Em to Am, and adds finger 1', () => {
    const fingers = (symbol: string) => Object.fromEntries(chordVoicings(symbol)[0].notes.filter((n) => n.fret > 0).map((n) => [n.string, n.finger]));
    expect(fingers('Em')).toEqual({ 5: 2, 4: 3 });
    expect(fingers('Am')).toEqual({ 4: 2, 3: 3, 2: 1 });
    const box = (s: string) => {
      const v = chordVoicings(s)[0];
      return v.frets.map((f) => (f === null ? 'x' : f)).join('');
    };
    expect(box('Am')).toBe('x02210');
    expect(box('Em')).toBe('022000');
    expect(box('E')).toBe('022100');
  });
});

describe('strumming-rhythm: drills', () => {
  const run = (step: Extract<Step, { generate: string }>, each: (e: Exercise) => void): void => {
    for (let seed = 1; seed <= 25; seed++) for (const difficulty of [0, 0.5, 1]) each(generateExercise(step, { seed, difficulty, level: 'beginner' }));
  };

  it('uses only note values taught so far', () => {
    const taught: Record<string, string[]> = {
      'dotted-notes': ['h', 'q', 'e'],
      ties: ['h', 'q', 'e'],
      'changing-chords-in-time': ['q', 'e'],
      'sixteenth-notes': ['q', 'e', 's', 'h'],
      'accents-and-muted-strums': ['q', 'e', 'h'],
    };
    for (const [id, codes] of Object.entries(taught)) {
      for (const step of lesson(id).steps.filter(isGenerated)) {
        run(step, (e) => {
          const patterns = e.type === 'tap-rhythm' ? [e.rhythm.pattern] : e.type === 'listen-choice' ? e.options.map((o) => (o.figure?.kind === 'rhythm' ? o.figure.pattern : '')).filter(Boolean) : [];
          for (const p of patterns) for (const code of p.split(/[\s|]+/).filter(Boolean)) expect(codes, `${id}: ${p}`).toContain(code.replace(/r$/, ''));
        });
      }
    }
  });

  it('asks only the dotted lengths the lesson teaches (no dotted eighth)', () => {
    const lengths = new Set<string>();
    for (const step of lesson('dotted-notes').steps.filter(isGenerated)) {
      run(step, (e) => {
        const p = prompt(e);
        expect(p, p).not.toMatch(/dotted (eighth|sixteenth|whole)/);
        if (e.type === 'choice') {
          const m = /how long does an? (.+?) note last/.exec(p);
          if (m) {
            lengths.add(m[1]);
            const value = m[1].replace('dotted ', '') as 'half' | 'quarter';
            expect(asBeats(correct(e)), p).toBe(m[1].startsWith('dotted') ? dotted(value) : plain(value));
          }
        }
      });
    }
    expect([...lengths].sort()).toEqual(['dotted half', 'dotted quarter', 'half', 'quarter']);
  });

  it('times every lesson close to its planned minutes', () => {
    for (const l of unit.lessons) expect(Math.abs(estimateLessonSeconds(l) / 60 - l.minutes), l.id).toBeLessThanOrEqual(1.5);
  });
});

describe('strumming-rhythm: every exercise', () => {
  it('accepts its own answer', () => {
    for (const e of everything()) {
      if (e.type === 'flashcard' || e.type === 'play-chord' || e.type === 'play-phrase') continue;
      expect(grade(e, solve(e)).correct, prompt(e)).toBe(true);
    }
  });

  it('names every fact after the unit', () => {
    for (const l of unit.lessons) for (const f of l.facts ?? []) expect(f.id).toMatch(/^strumming-/);
  });

  it('uses "downbeat" as the glossary defines it: the first beat of a bar, never beats 1 and 3', () => {
    const all: string[] = [];
    const collect = (v: unknown): void => {
      if (typeof v === 'string') all.push(v);
      else if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === 'object') Object.values(v).forEach(collect);
    };
    collect(unit);
    for (const t of all) expect(t, t).not.toMatch(/downbeats/i);
  });

  it('writes card titles without markup: the player shows a title as plain text', () => {
    for (const l of unit.lessons) for (const s of l.steps) if (!isGenerated(s) && s.type === 'card' && s.title) expect(s.title, l.id).not.toMatch(/[{}*]/);
  });

  it('asks about accents in the checkpoint, as the syllabus lists them', () => {
    const accent = choiceIn(checkpoint(), /accent mark/);
    expect(correct(accent)).toMatch(/^Louder/);
  });

  it('describes the muted-strum pattern stroke by stroke as it plays', () => {
    const [q] = of(exercisesOf(lesson('accents-and-muted-strums')), 'listen-choice');
    if (q.sound.kind !== 'strum') throw new Error('strum');
    const slots = parseStrum(q.sound.pattern).slots.filter((s) => s.stroke);
    // "A full strum on 1, a chick on 2, down-up on 3, a chick on 4."
    expect(slots.map((s) => `${s.count}:${s.stroke}`)).toEqual(['1:down', '2:mute', '3:down', '&:up', '4:mute']);
    expect(plainText(q.explain)).toMatch(/full strum on 1, a chick on 2, down-up on 3, a chick on 4/);
  });

  it('offers Em to a learner who meets the tie before A minor', () => {
    // The ties lesson only requires dotted-notes, which only requires unit 4 (where Em was taught).
    const card = lesson('ties').steps.find((s) => !isGenerated(s) && s.type === 'card' && /Am/.test(plainText(s.body)));
    expect(card && !isGenerated(card) && card.type === 'card' ? plainText(card.body) : '').toMatch(/Am \(or Em\)/);
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
