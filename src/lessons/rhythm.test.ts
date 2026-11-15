import { describe, expect, it } from 'vitest';
import { chordVoicings, midiAt } from '@/core/guitar';
import { chordMidi, noteToMidi, scaleMidi } from '@/core/theory';
import { countLabel, durationCode, parseDuration, parseRhythm, parseStrum, rhythmOnsetTimes, tickSeconds } from './rhythm';
import { chordSoundMidi, describeSound, soundPlan, soundProblems, tabProblems } from './sound';
import type { Sound } from './types';

describe('duration codes', () => {
  it('parses values, dots, triplets, rests and ties with the theory engine\'s ticks', () => {
    expect(parseDuration('q')).toMatchObject({ value: 'quarter', ticks: 960, rest: false, tied: false });
    expect(parseDuration('w')!.ticks).toBe(3840);
    expect(parseDuration('h.')!.ticks).toBe(2880);
    expect(parseDuration('e.')!.ticks).toBe(720);
    expect(parseDuration('et')).toMatchObject({ triplet: true, ticks: 320 });
    expect(parseDuration('qr')).toMatchObject({ rest: true, ticks: 960 });
    expect(parseDuration('q.r')).toMatchObject({ rest: true, ticks: 1440 });
    expect(parseDuration('~h')).toMatchObject({ tied: true, ticks: 1920 });
    expect(parseDuration('s')!.ticks).toBe(240);
  });

  it('rejects what is not a code', () => {
    for (const bad of ['', 'x', 'qq', '4', 'q..r.', '~qr', 'Q', 'q r']) expect(parseDuration(bad), bad).toBeNull();
  });

  it('writes codes back', () => {
    expect(durationCode('quarter')).toBe('q');
    expect(durationCode('half', { dots: 1 })).toBe('h.');
    expect(durationCode('eighth', { rest: true })).toBe('er');
    expect(() => durationCode('double-whole')).toThrow(RangeError);
  });
});

describe('parseRhythm', () => {
  it('lays a bar out in ticks with counting syllables', () => {
    const r = parseRhythm('q e e q q');
    expect(r.problems).toEqual([]);
    expect(r.bars).toBe(1);
    expect(r.barTicks).toBe(3840);
    expect(r.events.map((e) => e.tick)).toEqual([0, 960, 1440, 1920, 2880]);
    expect(r.events.map((e) => e.count)).toEqual(['1', '2', '&', '3', '4']);
    expect(r.onsets).toEqual([0, 960, 1440, 1920, 2880]);
  });

  it('counts sixteenths as 1 e & a', () => {
    expect(parseRhythm('s s s s q q q').events.slice(0, 4).map((e) => e.count)).toEqual(['1', 'e', '&', 'a']);
  });

  it('handles rests and ties: no attack, no onset', () => {
    const r = parseRhythm('q qr h | h ~q q');
    expect(r.problems).toEqual([]);
    expect(r.bars).toBe(2);
    expect(r.events.map((e) => e.attack)).toEqual([true, false, true, true, false, true]);
    expect(r.onsets).toEqual([0, 1920, 3840, 3840 + 2880]);
    expect(r.totalTicks).toBe(7680);
  });

  it('supports other time signatures', () => {
    const waltz = parseRhythm({ pattern: 'q q q', time: '3/4' });
    expect(waltz.problems).toEqual([]);
    expect(waltz.barTicks).toBe(2880);
    const six = parseRhythm({ pattern: 'q. q.', time: '6/8' });
    expect(six.problems).toEqual([]);
    expect(six.events.map((e) => e.count)).toEqual(['1', '4']);
    expect(parseRhythm({ pattern: 'e e e e e e', time: '6/8' }).events.map((e) => e.count)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('accepts triplets that fill the beat', () => {
    const r = parseRhythm('et et et q h');
    expect(r.problems).toEqual([]);
    expect(r.onsets).toEqual([0, 320, 640, 960, 1920]);
  });

  it('reports every problem with a fix and never throws', () => {
    expect(parseRhythm('q q q').problems[0]).toMatch(/Bar 1 lasts 3 quarter notes but a bar of 4\/4 holds 4/);
    expect(parseRhythm('q q q q q').problems[0]).toMatch(/lasts 5/);
    expect(parseRhythm('q x q q').problems[0]).toMatch(/"x" in bar 1 is not a rhythm code/);
    expect(parseRhythm('').problems[0]).toMatch(/empty/);
    expect(parseRhythm('q q q q | ').problems.join(' ')).toMatch(/Bar 2 is empty/);
    expect(parseRhythm('~q q q q').problems[0]).toMatch(/no note before it/);
    expect(parseRhythm('qr ~q q q').problems[0]).toMatch(/no note before it/);
    expect(parseRhythm({ pattern: 'q q q q', time: 'fast' }).problems[0]).toMatch(/not a time signature/);
    expect(() => parseRhythm(undefined as unknown as string)).not.toThrow();
  });

  it('gives onset times in seconds', () => {
    expect(rhythmOnsetTimes('q q q q', 60)).toEqual([0, 1, 2, 3]);
    expect(rhythmOnsetTimes('q e e q q', 120)).toEqual([0, 0.5, 0.75, 1, 1.5]);
    expect(tickSeconds(960, 80)).toBeCloseTo(0.75);
  });

  it('countLabel is empty off the sixteenth grid', () => {
    const time = parseRhythm('q q q q').time;
    expect(countLabel(320, time)).toBe('');
    expect(countLabel(2880, time)).toBe('4');
  });
});

describe('parseStrum', () => {
  it('reads the classic pattern on an eighth grid', () => {
    const s = parseStrum('D-DU-UDU');
    expect(s.problems).toEqual([]);
    expect(s.slots.map((x) => x.stroke)).toEqual(['down', null, 'down', 'up', null, 'up', 'down', 'up']);
    expect(s.slots.map((x) => x.count)).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(s.slotTicks).toBe(480);
    // Down-strokes on the numbers, up-strokes on the "&": the pendulum the lesson teaches.
    for (const slot of s.slots) {
      if (slot.stroke === 'down') expect(slot.count).toMatch(/\d/);
      if (slot.stroke === 'up') expect(slot.count).toBe('&');
    }
  });

  it('supports spaces, muted strums, several bars and a sixteenth grid', () => {
    expect(parseStrum('D D U X | D-DU-UDU').problems).toEqual([expect.stringMatching(/Bar 1.*has 4 slots.*has 8/)]);
    expect(parseStrum('D-DU-UDU | D-D-D-DU').slots).toHaveLength(16);
    expect(parseStrum('DxDU-UxU').slots[1].stroke).toBe('mute');
    const sixteen = parseStrum('D-DUD-DU-UDU-UDU', 'sixteenth');
    expect(sixteen.problems).toEqual([]);
    expect(sixteen.slotTicks).toBe(240);
  });

  it('reports bad characters and empty patterns', () => {
    expect(parseStrum('D-DZ-UDU').problems[0]).toMatch(/"Z" is not a strumming character/);
    expect(parseStrum('').problems[0]).toMatch(/empty/);
  });
});

describe('soundPlan', () => {
  it('notes in sequence and together', () => {
    const plan = soundPlan({ kind: 'notes', notes: ['E2', 'A2'], tempo: 60 });
    expect(plan.events.map((e) => [e.at, e.midi])).toEqual([[0, [40]], [1, [45]]]);
    expect(plan.tempo).toBe(60);
    expect(plan.duration).toBeGreaterThan(1);
    const chordal = soundPlan({ kind: 'notes', notes: ['C3', 'E3', 'G3'], together: true });
    expect(chordal.events).toHaveLength(1);
    expect(chordal.events[0].midi).toEqual([48, 52, 55]);
  });

  it('intervals up, down and together, sized by the theory engine', () => {
    const up = soundPlan({ kind: 'interval', from: 'C3', interval: 'P5' });
    expect(up.events.map((e) => e.midi[0])).toEqual([48, 55]);
    expect(soundPlan({ kind: 'interval', from: 'C3', interval: 'P5', play: 'down' }).events.map((e) => e.midi[0])).toEqual([55, 48]);
    expect(soundPlan({ kind: 'interval', from: 'C3', interval: 'm3', play: 'together' }).events[0].midi).toEqual([48, 51]);
  });

  it('chords use the guitar voicing by default and close position on request', () => {
    expect(soundPlan({ kind: 'chord', chord: 'C' }).events[0]).toMatchObject({ type: 'strum', midi: [...chordVoicings('C')[0].midi], direction: 'down' });
    expect(soundPlan({ kind: 'chord', chord: 'Cm', voicing: 'close', octave: 3 }).events[0].midi).toEqual(chordMidi('Cm', { octave: 3 }));
    expect(soundPlan({ kind: 'chord', chord: 'Em', frets: '022000' }).events[0].midi).toEqual([40, 47, 52, 55, 59, 64]);
    const arp = soundPlan({ kind: 'chord', chord: 'Em', style: 'arpeggio' });
    expect(arp.events.map((e) => e.type)).toEqual(Array(6).fill('pluck'));
    expect(arp.events.map((e) => e.at)).toEqual([...arp.events.map((e) => e.at)].sort((a, b) => a - b));
    expect(soundPlan({ kind: 'chord', chord: 'C', voicing: 'close', style: 'block' }).events[0].type).toBe('pluck');
    expect(chordSoundMidi('nope')).toBeNull();
  });

  it('scales up, down and both ways', () => {
    const up = scaleMidi(noteToMidi('A2'), 'minor', 1);
    expect(soundPlan({ kind: 'scale', tonic: 'A2', scale: 'minor' }).events.map((e) => e.midi[0])).toEqual(up);
    expect(soundPlan({ kind: 'scale', tonic: 'A2', scale: 'minor', direction: 'down' }).events.map((e) => e.midi[0])).toEqual([...up].reverse());
    expect(soundPlan({ kind: 'scale', tonic: 'A2', scale: 'minor', direction: 'up-down' }).events).toHaveLength(up.length * 2 - 1);
  });

  it('strum patterns place every stroke on its slot', () => {
    const plan = soundPlan({ kind: 'strum', chord: 'Em', pattern: 'D-DU-UDU', tempo: 60, repeat: 1 });
    expect(plan.events.map((e) => e.at)).toEqual([0, 1, 1.5, 2.5, 3, 3.5]);
    expect(plan.events.map((e) => e.direction)).toEqual(['down', 'down', 'up', 'up', 'down', 'up']);
    expect(soundPlan({ kind: 'strum', chord: 'Em', pattern: 'D-DU-UDU', tempo: 60 }).events).toHaveLength(12);
    expect(soundPlan({ kind: 'strum', chord: 'Em', pattern: 'DXDXDXDX', tempo: 60, repeat: 1 }).events.filter((e) => e.muted)).toHaveLength(4);
  });

  it('progressions strum each chord in turn', () => {
    const plan = soundPlan({ kind: 'progression', chords: ['C', 'G', 'Am', 'F'], tempo: 60, beats: 2 });
    expect(plan.events.map((e) => e.at)).toEqual([0, 2, 4, 6]);
    expect(plan.events[2].midi).toEqual([...chordVoicings('Am')[0].midi]);
  });

  it('rhythms click on every attack and accent the bar line', () => {
    const plan = soundPlan({ kind: 'rhythm', pattern: 'q qr e e q | h h', tempo: 60 });
    expect(plan.events.map((e) => e.at)).toEqual([0, 2, 2.5, 3, 4, 6]);
    expect(plan.events.map((e) => e.accent === true)).toEqual([true, false, false, false, true, false]);
    expect(plan.duration).toBe(8);
  });

  it('tab phrases use the neck', () => {
    const notes = [{ string: 6, fret: 0, duration: 'q' }, { rest: true as const, duration: 'q' }, { string: 6, fret: 3, duration: 'h' }];
    const plan = soundPlan({ kind: 'tab', notes, tempo: 60 });
    expect(plan.events.map((e) => [e.at, e.midi[0], e.string])).toEqual([[0, midiAt({ string: 6, fret: 0 }), 6], [2, midiAt({ string: 6, fret: 3 }), 6]]);
    expect(soundPlan({ kind: 'tab', notes: [{ string: 1, fret: 0, duration: 'q' }], capo: 2 }).events[0].midi).toEqual([66]);
  });

  it('reports problems with a fix and gives an empty plan instead of throwing', () => {
    const bad: Array<[Sound, RegExp]> = [
      [{ kind: 'notes', notes: ['E'] }, /has no octave/],
      [{ kind: 'notes', notes: [] }, /no notes/],
      [{ kind: 'notes', notes: ['H2'] }, /not a note/],
      [{ kind: 'notes', notes: ['C3'], tempo: 500 }, /Tempo 500/],
      [{ kind: 'interval', from: 'C3', interval: 'big' }, /not an interval/],
      [{ kind: 'chord', chord: 'Xq' }, /not a chord symbol/],
      [{ kind: 'chord', chord: 'C', frets: 'x32011' }, /not a voicing of C/],
      [{ kind: 'scale', tonic: 'A', scale: 'minor' }, /has no octave/],
      [{ kind: 'scale', tonic: 'A2', scale: 'nope' }, /not a scale id/],
      [{ kind: 'strum', chord: 'Em', pattern: 'D-D' }, /has 3 slots/],
      [{ kind: 'strum', chord: 'Em', pattern: '--------' }, /no strums/],
      [{ kind: 'progression', chords: ['C'] }, /at least two chords/],
      [{ kind: 'rhythm', pattern: 'q q' }, /Bar 1 lasts 2/],
      [{ kind: 'rhythm', pattern: 'qr qr qr qr' }, /only rests/],
      [{ kind: 'tab', notes: [{ string: 9, fret: 0, duration: 'q' }] }, /string 9/],
      [{ kind: 'tab', notes: [{ string: 1, fret: 30, duration: 'q' }] }, /fret 30/],
      [{ kind: 'tab', notes: [{ string: 1, fret: 0, duration: 'z' }] }, /not a duration code/],
      [{ kind: 'nope' } as unknown as Sound, /not a sound kind/],
    ];
    for (const [sound, pattern] of bad) {
      expect(soundProblems(sound).join(' '), JSON.stringify(sound)).toMatch(pattern);
      expect(soundPlan(sound), JSON.stringify(sound)).toEqual({ events: [], duration: 0, tempo: 0 });
    }
    expect(tabProblems([], {})[0]).toMatch(/no notes/);
    expect(tabProblems([{ string: 1, fret: 0, duration: 'q' }], { tuning: 'banjo-of-doom' })[0]).toMatch(/not a tuning/);
  });

  it('describes a sound without giving the answer away', () => {
    expect(describeSound({ kind: 'interval', from: 'C3', interval: 'M3' })).toBe('two notes');
    expect(describeSound({ kind: 'chord', chord: 'Cm' })).toBe('a chord');
    expect(describeSound({ kind: 'scale', tonic: 'A2', scale: 'dorian' })).toBe('a scale');
  });
});
