import { describe, expect, it } from 'vitest';
import { PPQ, Timeline, defaultAccents, defaultGrouping, formatPosition, fromQuarterBpm, parseTimeSignature, resolveMeter, toQuarterBpm } from './timeline';

describe('meters', () => {
  it('simple meters: one beat per denominator unit, accent on one', () => {
    const m = resolveMeter('4/4');
    expect(m.barTicks).toBe(3840);
    expect(m.beats.map((b) => b.tick)).toEqual([0, 960, 1920, 2880]);
    expect(defaultAccents(m)).toEqual([3, 1, 1, 1]);
    expect(m.grouped).toBe(false);
    expect(m.tempoBeatTicks).toBe(960);
    expect(resolveMeter('3/4').beats.length).toBe(3);
    expect(resolveMeter('2/2').beats.map((b) => b.length)).toEqual([1920, 1920]);
    expect(resolveMeter('2/2').tempoBeatTicks).toBe(1920);
  });

  it('compound meters are felt in dotted beats', () => {
    const six = resolveMeter('6/8');
    expect(six.grouped).toBe(true);
    expect(six.beats.map((b) => [b.tick, b.length, b.units])).toEqual([[0, 1440, 3], [1440, 1440, 3]]);
    expect(six.barTicks).toBe(2880);
    expect(six.tempoBeatTicks).toBe(1440);
    expect(resolveMeter('9/8').beats.length).toBe(3);
    const twelve = resolveMeter('12/8');
    expect(twelve.beats.length).toBe(4);
    expect(twelve.barTicks).toBe(5760);
    expect(defaultAccents(twelve)).toEqual([3, 1, 1, 1]);
  });

  it('odd meters use a grouping, default or given', () => {
    const seven = resolveMeter('7/8');
    expect(seven.grouping).toEqual([2, 2, 3]);
    expect(seven.beats.map((b) => b.length)).toEqual([960, 960, 1440]);
    expect(seven.barTicks).toBe(3360);
    const custom = resolveMeter({ numerator: 7, denominator: 8, grouping: [3, 2, 2] });
    expect(custom.beats.map((b) => b.tick)).toEqual([0, 1440, 2400]);
    expect(resolveMeter('5/8').grouping).toEqual([3, 2]);
    expect(resolveMeter('7/8(3+2+2)').beats.map((b) => b.units)).toEqual([3, 2, 2]);
    // A grouping that does not add up is ignored.
    expect(resolveMeter({ numerator: 7, denominator: 8, grouping: [3, 3] }).grouping).toEqual([2, 2, 3]);
  });

  it('odd meters over quarters keep quarter beats and mark the groups', () => {
    const five = resolveMeter('5/4');
    expect(five.beats.length).toBe(5);
    expect(defaultAccents(five)).toEqual([3, 1, 1, 2, 1]);
    expect(defaultAccents(resolveMeter({ numerator: 5, denominator: 4, grouping: [2, 3] }))).toEqual([3, 1, 2, 1, 1]);
    expect(defaultAccents(resolveMeter('7/4'))).toEqual([3, 1, 1, 1, 2, 1, 1]);
    expect(defaultGrouping(3, 8)).toEqual([1, 1, 1]);
    expect(resolveMeter('3/8').grouped).toBe(false);
    expect(resolveMeter({ numerator: 3, denominator: 8, grouping: [3] }).beats.length).toBe(1);
  });

  it('parses and rejects', () => {
    expect(parseTimeSignature(' 12 / 8 ')).toEqual({ numerator: 12, denominator: 8 });
    expect(parseTimeSignature('5/8(2+3)').grouping).toEqual([2, 3]);
    expect(() => parseTimeSignature('waltz')).toThrow();
  });

  it('converts tempo units', () => {
    expect(toQuarterBpm(60, 1440)).toBe(90);
    expect(fromQuarterBpm(90, 1440)).toBe(60);
  });
});

describe('timeline: tempo', () => {
  it('constant tempo', () => {
    const tl = new Timeline({ bpm: 120 });
    expect(tl.ticksToSeconds(PPQ)).toBeCloseTo(0.5, 12);
    expect(tl.ticksToSeconds(3840 * 4)).toBeCloseTo(8, 12);
    expect(tl.secondsToTicks(2)).toBeCloseTo(3840, 9);
    expect(tl.ticksToSeconds(-960)).toBeCloseTo(-0.5, 12);
    expect(tl.bpmAt(123456)).toBe(120);
  });

  it('step changes add up exactly and invert', () => {
    const tl = new Timeline({ tempo: [{ tick: 0, bpm: 120 }, { tick: 3840, bpm: 60 }, { tick: 7680, bpm: 240 }] });
    expect(tl.ticksToSeconds(3840)).toBeCloseTo(2, 12);
    expect(tl.ticksToSeconds(7680)).toBeCloseTo(6, 12);
    expect(tl.ticksToSeconds(7680 + 960)).toBeCloseTo(6.25, 12);
    for (const tick of [0, 100, 3839, 3840, 5000, 7680, 9999, 20000]) {
      expect(tl.secondsToTicks(tl.ticksToSeconds(tick))).toBeCloseTo(tick, 6);
    }
    expect(tl.bpmAt(3839)).toBe(120);
    expect(tl.bpmAt(3840)).toBe(60);
  });

  it('linear ramps have the closed-form duration', () => {
    // 60 -> 120 bpm over 4 quarter notes: seconds = (60 / k) * ln(2) / PPQ with k in bpm per tick.
    const tl = new Timeline({ tempo: [{ tick: 0, bpm: 60, ramp: true }, { tick: 3840, bpm: 120 }] });
    const k = 60 / 3840;
    expect(tl.ticksToSeconds(3840)).toBeCloseTo(((60 / PPQ) * Math.log(2)) / k, 10);
    expect(tl.bpmAt(1920)).toBeCloseTo(90, 9);
    expect(tl.bpmAt(99999)).toBe(120);
    // Faster than staying at 60, slower than jumping to 120.
    expect(tl.ticksToSeconds(3840)).toBeLessThan(4);
    expect(tl.ticksToSeconds(3840)).toBeGreaterThan(2);
    // Numerically integrate to confirm.
    let sum = 0;
    const steps = 20000;
    for (let i = 0; i < steps; i++) sum += (3840 / steps) * (60 / (PPQ * tl.bpmAt(((i + 0.5) * 3840) / steps)));
    expect(tl.ticksToSeconds(3840)).toBeCloseTo(sum, 6);
    for (const tick of [1, 960, 2500, 3840, 5000]) expect(tl.secondsToTicks(tl.ticksToSeconds(tick))).toBeCloseTo(tick, 6);
    // After the ramp the tempo is constant.
    expect(tl.ticksToSeconds(3840 + 960) - tl.ticksToSeconds(3840)).toBeCloseTo(0.5, 10);
  });

  it('seconds are measured from tick 0 wherever the tempo points sit', () => {
    const tl = new Timeline({ tempo: [{ tick: 1920, bpm: 60 }, { tick: 3840, bpm: 120 }] });
    expect(tl.ticksToSeconds(0)).toBeCloseTo(0, 12);
    expect(tl.ticksToSeconds(1920)).toBeCloseTo(2, 12);
    expect(tl.ticksToSeconds(3840)).toBeCloseTo(4, 12);
  });
});

describe('timeline: swing', () => {
  it('delays the off-beat eighth and leaves the beats alone', () => {
    const tl = new Timeline({ bpm: 120, swing: { ratio: 2 / 3, unitTicks: 480 } });
    expect(tl.ticksToSeconds(0)).toBeCloseTo(0, 12);
    expect(tl.ticksToSeconds(960)).toBeCloseTo(0.5, 12);
    expect(tl.ticksToSeconds(480)).toBeCloseTo(0.5 * (2 / 3), 12);
    expect(tl.ticksToSeconds(960 + 480)).toBeCloseTo(0.5 + 0.5 * (2 / 3), 12);
    // Sixteenths inside the pair are stretched proportionally.
    expect(tl.ticksToSeconds(240)).toBeCloseTo(0.25 * (2 / 3), 12);
    expect(tl.ticksToSeconds(720)).toBeCloseTo(0.5 * (2 / 3) + 0.25 * (2 / 3) * 0.5 * 2 * 0.5, 12);
    for (const tick of [0, 100, 480, 700, 960, 1300, 1440, 5000.5]) expect(tl.secondsToTicks(tl.ticksToSeconds(tick))).toBeCloseTo(tick, 6);
    // Monotonic.
    let prev = -1;
    for (let t = 0; t < 4000; t += 7) {
      const s = tl.ticksToSeconds(t);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it('sixteenth swing pairs up sixteenths; ratio 0.5 means no swing', () => {
    const tl = new Timeline({ bpm: 60, swing: { ratio: 0.6, unitTicks: 240 } });
    expect(tl.ticksToSeconds(240)).toBeCloseTo(0.5 * 0.6, 12);
    expect(tl.ticksToSeconds(480)).toBeCloseTo(0.5, 12);
    expect(new Timeline({ swing: { ratio: 0.5, unitTicks: 480 } }).swing).toBeNull();
  });
});

describe('timeline: positions', () => {
  it('bar / beat / tick in 4/4', () => {
    const tl = new Timeline();
    expect(tl.positionOf(0)).toMatchObject({ bar: 0, beat: 0, tick: 0, beatsInBar: 4 });
    expect(tl.positionOf(3840 + 960 * 2 + 100)).toMatchObject({ bar: 1, beat: 2, tick: 100 });
    expect(tl.positionOf(1440).beatProgress).toBeCloseTo(0.5, 12);
    expect(tl.positionOf(1920).barProgress).toBeCloseTo(0.5, 12);
    expect(tl.tickOf({ bar: 2, beat: 3, tick: 10 })).toBe(2 * 3840 + 3 * 960 + 10);
    expect(tl.tickOf({ bar: 5 })).toBe(5 * 3840);
    expect(formatPosition(tl.positionOf(3840 + 960 + 480))).toBe('2.2.480');
    // A tick a rounding error short of a bar line belongs to the new bar.
    expect(tl.positionOf(3840 - 1e-9)).toMatchObject({ bar: 1, beat: 0 });
  });

  it('uneven beats in 7/8', () => {
    const tl = new Timeline({ timeSignature: '7/8' });
    expect(tl.positionOf(960 + 960 + 1000)).toMatchObject({ bar: 0, beat: 2, tick: 1000 });
    expect(tl.positionOf(3360)).toMatchObject({ bar: 1, beat: 0, tick: 0 });
    expect(tl.tickOf({ bar: 1, beat: 2 })).toBe(3360 + 1920);
    expect(tl.barStart(3)).toBe(3 * 3360);
  });

  it('meter changes at bar lines', () => {
    const tl = new Timeline({ meters: [{ bar: 0, timeSignature: '4/4' }, { bar: 2, timeSignature: '3/4' }, { bar: 4, timeSignature: '6/8' }] });
    expect(tl.barStart(2)).toBe(7680);
    expect(tl.barStart(3)).toBe(7680 + 2880);
    expect(tl.barStart(4)).toBe(7680 + 5760);
    expect(tl.barStart(5)).toBe(7680 + 5760 + 2880);
    expect(tl.positionOf(7680 + 2880 + 960)).toMatchObject({ bar: 3, beat: 1, beatsInBar: 3 });
    expect(tl.positionOf(7680 + 5760 + 1440)).toMatchObject({ bar: 4, beat: 1, beatsInBar: 2 });
    expect(tl.meterOfBar(1).numerator).toBe(4);
    expect(tl.meterOfBar(2).numerator).toBe(3);
    expect(tl.meterAt(7680 + 5760).numerator).toBe(6);
    for (const bar of [0, 1, 2, 3, 4, 7]) expect(tl.positionOf(tl.barStart(bar)).bar).toBe(bar);
  });

  it('with() replaces settings without touching the original', () => {
    const a = new Timeline({ bpm: 100, timeSignature: '3/4' });
    const b = a.with({ bpm: 50 });
    expect(a.bpmAt(0)).toBe(100);
    expect(b.bpmAt(0)).toBe(50);
    expect(b.meterAt(0).numerator).toBe(3);
    const c = b.with({ timeSignature: '5/4' });
    expect(c.meterAt(0).numerator).toBe(5);
    expect(c.bpmAt(0)).toBe(50);
    const d = c.with({ tempo: [{ tick: 0, bpm: 80 }, { tick: 960, bpm: 90 }] }).with({ bpm: 70 });
    expect(d.tempo.length).toBe(1);
    expect(d.bpmAt(5000)).toBe(70);
  });
});
