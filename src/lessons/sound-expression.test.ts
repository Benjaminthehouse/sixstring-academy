/**
 * Lesson sounds use what the audio engine now offers: a drone under a line, a line over a held
 * chord, and bends, slides, vibrato and hammer-ons/pull-offs written on tab notes.
 */
import { describe, expect, it } from 'vitest';
import { exerciseProblems } from './check';
import { figureProblems, resolveFigure } from './figures';
import { describeSound, hasTechnique, soundPlan, soundProblems, tabProblems } from './sound';
import type { PlayPhraseExercise, Sound, TabNote } from './types';

const lick: TabNote[] = [
  { string: 3, fret: 5, duration: 'q' },
  { string: 3, fret: 7, duration: 'e', legato: 'hammer' },
  { string: 3, fret: 5, duration: 'e', legato: 'pull' },
  { string: 2, fret: 8, duration: 'q', bend: 2, release: true, vibrato: true },
  { string: 1, fret: 5, duration: 'h', slideIn: 'below', slideOut: 'down' },
];

describe('tab techniques', () => {
  it('a written lick is valid and its techniques reach the plan', () => {
    const sound: Sound = { kind: 'tab', notes: lick, tempo: 80 };
    expect(soundProblems(sound)).toEqual([]);
    const plan = soundPlan(sound);
    expect(plan.events.map((e) => e.technique ?? null)).toEqual([
      null,
      { legato: 'hammer' },
      { legato: 'pull' },
      { bend: 2, release: true, vibrato: true },
      { slideIn: 'below', slideOut: 'down' },
    ]);
    // The pitches stay the fretted ones: the engine bends from there.
    expect(plan.events.map((e) => e.midi[0])).toEqual([60, 62, 60, 67, 69]);
  });

  it('keeps the note before a hammer-on ringing into it, so the engine has something to hammer from', () => {
    const plan = soundPlan({ kind: 'tab', notes: lick, tempo: 60 });
    // Quarter at 60 bpm = 1 s, so the first note would end exactly where the hammer-on starts.
    expect(plan.events[0].duration).toBeGreaterThan(plan.events[1].at - plan.events[0].at);
    expect(plan.events[1].duration).toBeGreaterThan(plan.events[2].at - plan.events[1].at);
    // A picked note after them is not stretched.
    expect(plan.events[3].duration).toBeCloseTo(1, 5);
  });

  it('plain notes carry no technique', () => {
    const plan = soundPlan({ kind: 'tab', notes: [{ string: 1, fret: 0, duration: 'q' }] });
    expect(plan.events[0].technique).toBeUndefined();
    expect(hasTechnique({ string: 1, fret: 0, duration: 'q' })).toBe(false);
    expect(hasTechnique({ rest: true, duration: 'q' })).toBe(false);
  });

  it('says how to fix techniques that cannot be played', () => {
    const bad = (notes: TabNote[]): string => tabProblems(notes).join(' ');
    expect(bad([{ string: 3, fret: 5, duration: 'q', bend: 7 }])).toMatch(/0\.5 to 3 semitones/);
    expect(bad([{ string: 3, fret: 5, duration: 'q', bend: 1.3 }])).toMatch(/in halves/);
    expect(bad([{ string: 3, fret: 5, duration: 'q', release: true }])).toMatch(/release" without a bend/);
    expect(bad([{ string: 3, fret: 7, duration: 'q', legato: 'hammer' }])).toMatch(/not ringing on string 3/);
    expect(bad([{ string: 2, fret: 5, duration: 'q' }, { string: 3, fret: 7, duration: 'q', legato: 'hammer' }])).toMatch(/not ringing on string 3/);
    expect(bad([{ string: 3, fret: 5, duration: 'q' }, { rest: true, duration: 'q' }, { string: 3, fret: 7, duration: 'q', legato: 'hammer' }])).toMatch(/no rest between/);
    expect(bad([{ string: 3, fret: 7, duration: 'q' }, { string: 3, fret: 5, duration: 'q', legato: 'hammer' }])).toMatch(/higher fret/);
    expect(bad([{ string: 3, fret: 5, duration: 'q' }, { string: 3, fret: 7, duration: 'q', legato: 'pull' }])).toMatch(/lower fret/);
    expect(bad([{ string: 3, fret: 0, duration: 'q' }, { string: 3, fret: 2, duration: 'q', legato: 'slide' }])).toMatch(/not to or from an open string/);
    expect(bad([{ string: 3, fret: 0, duration: 'q', slideIn: 'below' }])).toMatch(/slides into an open string/);
    expect(bad([{ string: 3, fret: 0, duration: 'q', slideOut: 'down' }])).toMatch(/slides off an open string/);
    // A pull-off to the open string is fine.
    expect(tabProblems([{ string: 1, fret: 3, duration: 'e' }, { string: 1, fret: 0, duration: 'e', legato: 'pull' }])).toEqual([]);
  });

  it('a technique in a play-phrase target is an authoring error: the listener would hear other notes', () => {
    const ex: PlayPhraseExercise = {
      type: 'play-phrase', prompt: 'Play it.', octave: 'exact', explain: 'Because.',
      notes: [{ string: 3, fret: 5, duration: 'q' }, { string: 3, fret: 7, duration: 'q', bend: 2 }],
      alternative: { type: 'true-false', statement: 'Yes.', answer: true, explain: 'Because.' },
    };
    const problems = exerciseProblems(ex).filter((p) => p.severity === 'error');
    expect(problems.map((p) => p.message).join(' ')).toMatch(/Note 2 has a technique/);
    expect(exerciseProblems({ ...ex, notes: [ex.notes[0], { string: 3, fret: 7, duration: 'q' }] }).filter((p) => p.severity === 'error')).toEqual([]);
  });

  it('a tab figure keeps the techniques to draw, and checks them', () => {
    const tab = resolveFigure({ kind: 'tab', notes: lick });
    expect(tab.notes.map((n) => n.technique)).toEqual([null, { legato: 'hammer' }, { legato: 'pull' }, { bend: 2, release: true, vibrato: true }, { slideIn: 'below', slideOut: 'down' }]);
    expect(figureProblems({ kind: 'tab', notes: [{ string: 3, fret: 5, duration: 'q', legato: 'pull' }] }).join(' ')).toMatch(/not ringing/);
  });
});

describe('a drone under a line', () => {
  it('a scale over a drone plans the drone for the whole sound', () => {
    const sound: Sound = { kind: 'scale', tonic: 'D3', scale: 'dorian', drone: { root: 'D2', fifth: true } };
    expect(soundProblems(sound)).toEqual([]);
    const plan = soundPlan(sound);
    expect(plan.drone).toEqual({ midi: 38, fifth: true });
    expect(plan.events).toHaveLength(8);
    expect(describeSound(sound)).toBe('a scale over a drone');
  });

  it('defaults to the root alone, so an interval against it stays clear', () => {
    const plan = soundPlan({ kind: 'interval', from: 'A3', interval: 'M3', drone: { root: 'A2' } });
    expect(plan.drone).toEqual({ midi: 45, fifth: false });
  });

  it('says what is wrong with a drone', () => {
    expect(soundProblems({ kind: 'notes', notes: ['A3'], drone: { root: 'A' } }).join(' ')).toMatch(/drone root.*octave|has no octave/);
    expect(soundProblems({ kind: 'notes', notes: ['A3'], drone: { root: 'H2' } }).join(' ')).toMatch(/not a note/);
    // An invalid sound plays nothing rather than a broken drone.
    expect(soundPlan({ kind: 'notes', notes: ['A3'], drone: { root: 'A' } }).drone).toBeUndefined();
  });
});

describe('a line over a held chord', () => {
  it('holds the chord (library voicing, guitar by default) under the notes', () => {
    const sound: Sound = { kind: 'notes', notes: ['A3', 'C4', 'E4'], over: { chord: 'Am' } };
    expect(soundProblems(sound)).toEqual([]);
    const plan = soundPlan(sound);
    expect(plan.hold?.voice).toBe('guitar');
    expect(plan.hold?.midi).toEqual([45, 52, 57, 60, 64]);
    expect(plan.events.map((e) => e.midi[0])).toEqual([57, 60, 64]);
    expect(describeSound(sound)).toBe('3 notes over a chord');
  });

  it('takes a given shape and voice, and a tab line keeps its capo for the chord', () => {
    const plan = soundPlan({ kind: 'tab', notes: [{ string: 2, fret: 1, duration: 'q' }], capo: 2, over: { chord: 'A', frets: 'x02220', voice: 'epiano' } });
    // x02220 behind capo 2 is the A shape sounding as B... so it is not an A voicing: a problem.
    expect(plan.events).toEqual([]);
    const ok = soundPlan({ kind: 'tab', notes: [{ string: 2, fret: 1, duration: 'q' }], capo: 2, over: { chord: 'A', frets: '320003', voice: 'epiano' } });
    expect(ok.hold).toEqual({ midi: [45, 49, 52, 57, 61, 69], voice: 'epiano' });
  });

  it('says what is wrong with the chord under a line', () => {
    expect(soundProblems({ kind: 'notes', notes: ['A3'], over: { chord: 'Hm' } }).join(' ')).toMatch(/not a chord symbol/);
    expect(soundProblems({ kind: 'notes', notes: ['A3'], over: { chord: 'Am', frets: '320003' } }).join(' ')).toMatch(/not a voicing of Am/);
    expect(soundProblems({ kind: 'notes', notes: ['A3', 'C4'], together: true, over: { chord: 'Am' } }).join(' ')).toMatch(/bigger chord/);
    expect(soundProblems({ kind: 'notes', notes: ['A3'], over: { chord: 'Am' }, drone: { root: 'A2' } }).join(' ')).toMatch(/Pick one/);
  });
});
