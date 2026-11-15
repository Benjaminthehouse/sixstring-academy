import { describe, expect, it } from 'vitest';
import {
  barCapacity, barFill, beatPositions, dottedTicks, durationTicks, NOTE_VALUES, noteValue, parseTimeSignature, PPQ,
  secondsToTicks, splitDuration, SWING, swingPair, swingRatioFromPercent, swingTick, TEMPO_MARKINGS, tempoMarking,
  tempoRange, tickToBar, ticksToDuration, ticksToSeconds, tupletTicks,
} from './rhythm';

describe('note values', () => {
  it('measures every value in ticks at 960 per quarter', () => {
    expect(PPQ).toBe(960);
    const table: Record<string, number> = {
      'double-whole': 7680, whole: 3840, half: 1920, quarter: 960, eighth: 480, sixteenth: 240, 'thirty-second': 120, 'sixty-fourth': 60,
    };
    expect(NOTE_VALUES.map((v) => v.id)).toEqual(Object.keys(table));
    for (const v of NOTE_VALUES) {
      expect(v.ticks, v.id).toBe(table[v.id]);
      expect(durationTicks(v.id)).toBe(table[v.id]);
      expect(v.beats).toBe(table[v.id] / 960);
    }
    expect(NOTE_VALUES.map((v) => v.flags)).toEqual([0, 0, 0, 0, 1, 2, 3, 4]);
    expect(noteValue('quarter')).toMatchObject({ name: 'quarter note', british: 'crotchet', restName: 'quarter rest', denominator: 4 });
    expect(noteValue('eighth')!.british).toBe('quaver');
    expect(noteValue(16)!.id).toBe('sixteenth');
    expect(noteValue('8')!.id).toBe('eighth');
    expect(noteValue('thirty-second')!.name).toBe('thirty second note');
    expect(noteValue(3)).toBeNull();
    expect(noteValue('nope')).toBeNull();
  });

  it('applies dots and tuplets', () => {
    expect(durationTicks('quarter', { dots: 1 })).toBe(1440);
    expect(durationTicks('quarter', { dots: 2 })).toBe(1680);
    expect(durationTicks('half', { dots: 1 })).toBe(2880);
    expect(durationTicks('eighth', { dots: 1 })).toBe(720);
    expect(durationTicks(8, { tuplet: 3 })).toBe(320);
    expect(durationTicks('quarter', { tuplet: 3 })).toBe(640);
    expect(durationTicks('sixteenth', { tuplet: 3 })).toBe(160);
    expect(durationTicks('sixteenth', { tuplet: 5 })).toBe(192);
    expect(durationTicks('sixteenth', { tuplet: 6 })).toBe(160);
    expect(durationTicks('eighth', { tuplet: [2, 3] })).toBe(720);
    expect(durationTicks('sixty-fourth', { tuplet: 3 })).toBe(40);
    expect(dottedTicks(960)).toBe(1440);
    expect(dottedTicks(960, 0)).toBe(960);
    expect(tupletTicks(960, [5, 4])).toBe(768);
    // Three triplet eighths fill one quarter; five quintuplet sixteenths fill one quarter.
    expect(3 * durationTicks('eighth', { tuplet: 3 })).toBe(960);
    expect(5 * durationTicks('sixteenth', { tuplet: 5 })).toBe(960);
    expect(() => durationTicks('eighth', { tuplet: 17 })).toThrow(RangeError);
    expect(() => durationTicks(3)).toThrow(RangeError);
  });

  it('names a length in ticks, or splits it into tied values', () => {
    expect(ticksToDuration(960)).toEqual({ value: 'quarter' });
    expect(ticksToDuration(1440)).toEqual({ value: 'quarter', dots: 1 });
    expect(ticksToDuration(1680)).toEqual({ value: 'quarter', dots: 2 });
    expect(ticksToDuration(320)).toEqual({ value: 'eighth', tuplet: 3 });
    expect(ticksToDuration(192)).toEqual({ value: 'sixteenth', tuplet: 5 });
    expect(ticksToDuration(2400)).toBeNull();
    expect(splitDuration(2400)).toEqual([{ value: 'half' }, { value: 'eighth' }]);
    expect(splitDuration(1200)).toEqual([{ value: 'quarter' }, { value: 'sixteenth' }]);
    expect(splitDuration(3840)).toEqual([{ value: 'whole' }]);
    expect(splitDuration(2880)).toEqual([{ value: 'half', dots: 1 }]);
    expect(splitDuration(0)).toEqual([]);
    for (const ticks of [60, 180, 300, 540, 1020, 2460, 3300, 4800, 9000]) {
      const total = splitDuration(ticks).reduce((sum, d) => sum + durationTicks(d.value, d), 0);
      expect(total, String(ticks)).toBe(ticks);
    }
    for (const v of NOTE_VALUES) {
      for (const dots of [0, 1, 2]) expect(durationTicks(ticksToDuration(durationTicks(v.id, { dots }))!.value, ticksToDuration(durationTicks(v.id, { dots }))!)).toBe(durationTicks(v.id, { dots }));
    }
  });
});

describe('time signatures', () => {
  it('parses simple meters', () => {
    expect(parseTimeSignature('4/4')).toEqual({
      numerator: 4, denominator: 4, text: '4/4', kind: 'simple', unitTicks: 960, barTicks: 3840, grouping: [2, 2], beats: 4,
      beatTicks: [960, 960, 960, 960], accents: ['strong', 'weak', 'medium', 'weak'],
    });
    expect(parseTimeSignature('3/4')).toMatchObject({ kind: 'simple', barTicks: 2880, beats: 3, grouping: [3], accents: ['strong', 'weak', 'weak'] });
    expect(parseTimeSignature('2/4')).toMatchObject({ kind: 'simple', barTicks: 1920, beats: 2 });
    expect(parseTimeSignature('2/2')).toMatchObject({ kind: 'simple', barTicks: 3840, beats: 2, beatTicks: [1920, 1920] });
    expect(parseTimeSignature('3/8')).toMatchObject({ kind: 'simple', barTicks: 1440, beats: 3 });
    expect(parseTimeSignature('C')).toMatchObject({ text: '4/4' });
    expect(parseTimeSignature('common time')).toMatchObject({ text: '4/4' });
    expect(parseTimeSignature('cut')).toMatchObject({ text: '2/2' });
    expect(parseTimeSignature('C|')).toMatchObject({ text: '2/2' });
    expect(parseTimeSignature([3, 4])).toMatchObject({ text: '3/4' });
    expect(parseTimeSignature(' 4 / 4 ')).toMatchObject({ text: '4/4' });
  });

  it('parses compound meters as dotted beats', () => {
    expect(parseTimeSignature('6/8')).toMatchObject({
      kind: 'compound', unitTicks: 480, barTicks: 2880, grouping: [3, 3], beats: 2, beatTicks: [1440, 1440],
      accents: ['strong', 'weak', 'weak', 'medium', 'weak', 'weak'],
    });
    expect(parseTimeSignature('9/8')).toMatchObject({ kind: 'compound', beats: 3, barTicks: 4320 });
    expect(parseTimeSignature('12/8')).toMatchObject({ kind: 'compound', beats: 4, barTicks: 5760, beatTicks: [1440, 1440, 1440, 1440] });
    expect(parseTimeSignature('6/4')).toMatchObject({ kind: 'compound', beats: 2, beatTicks: [2880, 2880] });
    expect(parseTimeSignature('12/16')).toMatchObject({ kind: 'compound', beats: 4, barTicks: 2880 });
  });

  it('parses odd meters with their grouping', () => {
    expect(parseTimeSignature('7/8')).toMatchObject({
      kind: 'odd', barTicks: 3360, grouping: [2, 2, 3], beats: 3, beatTicks: [960, 960, 1440],
      accents: ['strong', 'weak', 'medium', 'weak', 'medium', 'weak', 'weak'],
    });
    expect(parseTimeSignature('5/4')).toMatchObject({ kind: 'odd', barTicks: 4800, grouping: [3, 2], beats: 5, beatTicks: [960, 960, 960, 960, 960] });
    expect(parseTimeSignature('5/8')).toMatchObject({ kind: 'odd', grouping: [3, 2], beats: 2, beatTicks: [1440, 960] });
    expect(parseTimeSignature('3+2+2/8')).toMatchObject({ text: '7/8', kind: 'odd', grouping: [3, 2, 2], beatTicks: [1440, 960, 960] });
    expect(parseTimeSignature('7/8', { grouping: [3, 2, 2] })).toMatchObject({ grouping: [3, 2, 2] });
    expect(parseTimeSignature('8/8')).toMatchObject({ kind: 'odd', grouping: [3, 3, 2] });
    expect(parseTimeSignature('11/8')).toMatchObject({ kind: 'odd', grouping: [3, 3, 3, 2] });
    expect(parseTimeSignature('17/16')!.grouping.reduce((a, b) => a + b, 0)).toBe(17);
  });

  it('keeps grouping, beats and accents consistent for every meter', () => {
    for (let n = 1; n <= 20; n++) {
      for (const d of [2, 4, 8, 16]) {
        const ts = parseTimeSignature(`${n}/${d}`)!;
        expect(ts.grouping.reduce((a, b) => a + b, 0), ts.text).toBe(n);
        expect(ts.beatTicks.reduce((a, b) => a + b, 0), ts.text).toBe(ts.barTicks);
        expect(ts.accents.length, ts.text).toBe(n);
        expect(ts.accents[0]).toBe('strong');
        expect(ts.accents.filter((a) => a === 'strong')).toHaveLength(1);
        expect(ts.beats).toBe(ts.beatTicks.length);
        expect(ts.barTicks).toBe((n * 3840) / d);
      }
    }
  });

  it('rejects invalid signatures', () => {
    for (const bad of ['', '4', '4/3', '0/4', 'x/4', '4/0', '4/5', 'waltz', '3+2/8/4']) expect(parseTimeSignature(bad), bad).toBeNull();
    expect(parseTimeSignature('7/8', { grouping: [3, 3] })).toBeNull();
    expect(() => barCapacity('4/5')).toThrow(RangeError);
  });

  it('measures bars', () => {
    expect(barCapacity('4/4')).toBe(3840);
    expect(barCapacity('3/4')).toBe(2880);
    expect(barCapacity('6/8')).toBe(2880);
    expect(barCapacity([7, 8])).toBe(3360);
    expect(barCapacity(parseTimeSignature('5/4')!)).toBe(4800);
    expect(beatPositions('4/4')).toEqual([0, 960, 1920, 2880]);
    expect(beatPositions('6/8')).toEqual([0, 1440]);
    expect(beatPositions('7/8')).toEqual([0, 960, 1920]);
    expect(barFill([960, 960, 1920], '4/4')).toEqual({ used: 3840, remaining: 0, complete: true });
    expect(barFill([960, 480], '3/4')).toEqual({ used: 1440, remaining: 1440, complete: false });
    expect(barFill([1920, 1920, 960], '4/4').remaining).toBe(-960);
    expect(tickToBar(0, '4/4')).toEqual({ bar: 0, offset: 0 });
    expect(tickToBar(4800, '4/4')).toEqual({ bar: 1, offset: 960 });
    expect(tickToBar(2880, '6/8')).toEqual({ bar: 1, offset: 0 });
  });
});

describe('swing', () => {
  it('splits a beat long-short', () => {
    expect(swingPair()).toEqual([640, 320]);
    expect(swingPair(SWING.straight)).toEqual([480, 480]);
    expect(swingPair(SWING.hard)).toEqual([720, 240]);
    expect(swingPair(2 / 3, 480)).toEqual([320, 160]);
    expect(() => swingPair(1)).toThrow(RangeError);
  });

  it('moves off-beats later and leaves beats alone', () => {
    expect(swingTick(0)).toBe(0);
    expect(swingTick(480)).toBe(640);
    expect(swingTick(960)).toBe(960);
    expect(swingTick(1440)).toBe(1600);
    expect(swingTick(240)).toBe(320);
    expect(swingTick(720)).toBe(800);
    expect(swingTick(480, SWING.straight)).toBe(480);
    expect(swingTick(480, 0.75)).toBe(720);
    expect(swingTick(240, 2 / 3, 480)).toBe(320);
    // Swing never reorders events.
    let last = -1;
    for (let t = 0; t <= 3840; t += 60) {
      const swung = swingTick(t, 0.7);
      expect(swung).toBeGreaterThan(last);
      last = swung;
    }
    expect(swingRatioFromPercent(50)).toBe(0.5);
    expect(swingRatioFromPercent(66.7)).toBeCloseTo(0.667, 3);
    expect(swingRatioFromPercent(10)).toBe(0.5);
  });
});

describe('tempo', () => {
  it('names tempos from Largo to Presto', () => {
    const cases: Array<[number, string]> = [
      [30, 'Grave'], [40, 'Largo'], [50, 'Largo'], [60, 'Larghetto'], [66, 'Adagio'], [72, 'Adagio'], [76, 'Andante'], [90, 'Andante'],
      [108, 'Moderato'], [112, 'Moderato'], [120, 'Allegro'], [140, 'Allegro'], [156, 'Vivace'], [170, 'Vivace'], [176, 'Presto'],
      [190, 'Presto'], [200, 'Prestissimo'], [240, 'Prestissimo'],
    ];
    for (const [bpm, name] of cases) expect(tempoMarking(bpm).name, String(bpm)).toBe(name);
    expect(() => tempoMarking(0)).toThrow(RangeError);
  });

  it('covers every tempo exactly once', () => {
    for (let i = 1; i < TEMPO_MARKINGS.length; i++) expect(TEMPO_MARKINGS[i].min).toBe(TEMPO_MARKINGS[i - 1].max);
    expect(TEMPO_MARKINGS[0].min).toBe(0);
    expect(TEMPO_MARKINGS[TEMPO_MARKINGS.length - 1].max).toBe(Infinity);
    expect(tempoRange('andante')).toMatchObject({ min: 76, max: 108 });
    expect(tempoRange('Allegro')!.meaning).toBe('fast and bright');
    expect(tempoRange('swing')).toBeNull();
  });

  it('converts ticks and seconds', () => {
    expect(ticksToSeconds(960, 60)).toBe(1);
    expect(ticksToSeconds(960, 120)).toBe(0.5);
    expect(ticksToSeconds(3840, 120)).toBe(2);
    expect(secondsToTicks(1, 60)).toBe(960);
    expect(secondsToTicks(2, 120)).toBe(3840);
    expect(secondsToTicks(ticksToSeconds(1234, 97), 97)).toBeCloseTo(1234, 8);
  });
});
