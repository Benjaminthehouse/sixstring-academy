import { describe, expect, it } from 'vitest';
import { PPQ } from '@/core/theory';
import { beamGroups, beamGroupsOfBar, secondaryBeams } from './beaming';
import { countAt, countLine, heldBeats } from './counting';
import { READ_LEVELS, generatePhrase, generateRound, introPhrase, itemAllowed, readLevel, seededRandom } from './generate';
import { meterInfo, quarterBpm, secondsPerTick } from './meter';
import { barTicksUsed, formatRhythm, parseItems, parseRhythm, rhythmOnsets, tupletGroups, validateRhythm } from './rhythm';

describe('meter', () => {
  it('resolves simple, compound and odd meters', () => {
    expect(meterInfo('4/4').beatStarts).toEqual([0, 960, 1920, 2880]);
    expect(meterInfo('3/4').barTicks).toBe(2880);
    const six = meterInfo('6/8');
    expect(six.beatStarts).toEqual([0, 1440]);
    expect(six.compound).toBe(true);
    expect(six.tempoBeatTicks).toBe(1440);
    expect(meterInfo('7/8').beatTicks).toEqual([960, 960, 1440]);
  });

  it('turns felt-beat tempo into seconds', () => {
    expect(secondsPerTick(60, meterInfo('4/4')) * PPQ).toBeCloseTo(1, 9);
    // 6/8 at 60 dotted quarters a minute: an eighth lasts a third of a second.
    expect(secondsPerTick(60, meterInfo('6/8')) * 480).toBeCloseTo(1 / 3, 9);
    expect(quarterBpm(60, meterInfo('6/8'))).toBe(90);
  });
});

describe('the text form', () => {
  it('parses values, rests, dots, ties, triplets and accents', () => {
    const r = parseRhythm('q. e rq >q~ | q 3e 3e 3e h');
    expect(r.bars).toHaveLength(2);
    const [a, b] = r.bars;
    expect(a.items.map((i) => i.ticks)).toEqual([1440, 480, 960, 960]);
    expect(a.items[0].dots).toBe(1);
    expect(a.items[2].rest).toBe(true);
    expect(a.items[3].accent).toBe(true);
    expect(a.items[3].tie).toBe(true);
    expect(b.items.filter((i) => i.tuplet === 3)).toHaveLength(3);
    expect(b.items[1].ticks).toBe(320);
    expect(formatRhythm(r)).toBe('q. e rq >q~ | q 3e 3e 3e h');
  });

  it('rejects bars that do not add up, with the bar named', () => {
    expect(() => parseRhythm('q q q')).toThrow(/Bar 1/);
    expect(() => parseRhythm('q q q q | h h q')).toThrow(/Bar 2/);
    expect(() => parseRhythm('q q q x')).toThrow(/not a note/);
  });

  it('rejects incomplete triplets, ties into rests and a dangling tie', () => {
    expect(validateRhythm({ meter: '4/4', swing: false, bars: [{ items: parseItems('3e 3e q q e e') }] }).join(' ')).toMatch(/incomplete triplet/);
    expect(validateRhythm({ meter: '4/4', swing: false, bars: [{ items: parseItems('e 3e 3e 3e e q q') }] }).join(' ')).toMatch(/triplet must start on a beat/);
    expect(() => parseRhythm('q~ rq h')).toThrow(/tied to a rest/);
    expect(() => parseRhythm('h h~')).toThrow(/tied to nothing/);
    expect(validateRhythm(parseRhythm('3q 3e 3q 3q 3q q'))).toEqual([]);
  });

  it('accepts other meters', () => {
    expect(parseRhythm('q q e e | h.', '3/4').bars).toHaveLength(2);
    expect(parseRhythm('e e e q. | q e q.', '6/8').bars[1].items.map((i) => i.tick)).toEqual([0, 960, 1440]);
    expect(() => parseRhythm('q q q q', '3/4')).toThrow();
  });

  it('groups triplets beat by beat', () => {
    const bar = parseRhythm('3e 3e 3e 3e 3e 3e 3q 3e q').bars[0];
    expect(tupletGroups(bar)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7]]);
  });
});

describe('onsets', () => {
  it('leaves out rests and tied-to notes, and adds tied lengths', () => {
    const r = parseRhythm('q rq q~ q~ | q e e h');
    const on = rhythmOnsets(r);
    expect(on.map((o) => o.tick)).toEqual([0, 1920, 3840 + 960, 3840 + 1440, 3840 + 1920]);
    // The tie runs across the bar line: quarter + quarter + quarter.
    expect(on[1].ticks).toBe(2880);
    expect(on[2].ticks).toBe(480);
  });

  it('swings the off-beat eighths and nothing else', () => {
    const r = parseRhythm('e e q e e q', '4/4', { swing: true });
    const on = rhythmOnsets(r);
    expect(on.map((o) => o.tick)).toEqual([0, 480, 960, 1920, 2400, 2880]);
    expect(on.map((o) => o.playTick)).toEqual([0, 640, 960, 1920, 2560, 2880]);
  });
});

describe('beaming', () => {
  const groupsOf = (text: string, meter = '4/4') => beamGroupsOfBar(parseRhythm(text, meter).bars[0], meterInfo(meter));

  it('beams by beat in 4/4', () => {
    expect(groupsOf('e e e e q q')).toEqual([[0, 1], [2, 3]]);
    expect(groupsOf('s s s s e s s q q')).toEqual([[0, 1, 2, 3], [4, 5, 6]]);
  });

  it('never beams across a beat, a rest or a longer note', () => {
    // e q e: the two eighths sit in different beats and keep their flags.
    expect(groupsOf('e q e h')).toEqual([]);
    expect(groupsOf('e re re e h')).toEqual([]);
    expect(groupsOf('s s rs s q h')).toEqual([[0, 1]]);
    expect(groupsOf('re e e re h')).toEqual([]);
  });

  it('beams three eighths per beat in 6/8 and keeps triplets together', () => {
    expect(groupsOf('e e e e e e', '6/8')).toEqual([[0, 1, 2], [3, 4, 5]]);
    expect(groupsOf('q e e e e', '6/8')).toEqual([[2, 3, 4]]);
    expect(groupsOf('3e 3e 3e q h')).toEqual([[0, 1, 2]]);
  });

  it('draws sixteenth beams as full beams or stubs', () => {
    const bar = parseRhythm('e. s s e. s e s q').bars[0];
    const groups = beamGroupsOfBar(bar, meterInfo('4/4'));
    expect(groups).toEqual([[0, 1], [2, 3], [4, 5, 6]]);
    expect(secondaryBeams(bar, groups[0])).toEqual(['none', 'stub-left']);
    expect(secondaryBeams(bar, groups[1])).toEqual(['stub-right', 'none']);
    expect(secondaryBeams(bar, groups[2])).toEqual(['stub-right', 'none', 'stub-left']);
    const run = parseRhythm('s s s s e s s q q').bars[0];
    expect(secondaryBeams(run, [0, 1, 2, 3])).toEqual(['full-right', 'full-right', 'full-right', 'none']);
    expect(secondaryBeams(run, [4, 5, 6])).toEqual(['none', 'full-right', 'none']);
  });

  it('covers every bar of a rhythm', () => {
    expect(beamGroups(parseRhythm('e e q h | q q e e q'))).toEqual([[[0, 1]], [[2, 3]]]);
  });
});

describe('counting', () => {
  it('counts sixteenths and triplets in simple time', () => {
    const m = meterInfo('4/4');
    expect(countLine(m, 240).map((c) => c.text).join(' ')).toBe('1 e & a 2 e & a 3 e & a 4 e & a');
    expect(countLine(m, 480).map((c) => c.text).join(' ')).toBe('1 & 2 & 3 & 4 &');
    expect([0, 320, 640, 960].map((t) => countAt(t, m).text)).toEqual(['1', 'trip', 'let', '2']);
    expect(countAt(0, m).part).toBe('beat');
    expect(countAt(480, m).part).toBe('and');
    expect(countAt(100, m).text).toBe('');
  });

  it('counts the eighths in compound time and restarts on groups in odd meters', () => {
    expect(countLine(meterInfo('6/8'), 480).map((c) => c.text).join(' ')).toBe('1 2 3 4 5 6');
    expect(countLine(meterInfo('6/8'), 240).map((c) => c.text).join(' ')).toBe('1 & 2 & 3 & 4 & 5 & 6 &');
    expect(countLine(meterInfo('7/8'), 480).map((c) => c.text).join(' ')).toBe('1 2 1 2 1 2 3');
    expect(countLine(meterInfo('5/8'), 480).map((c) => c.text).join(' ')).toBe('1 2 3 1 2');
    expect(countLine(meterInfo('3/4'), 480).map((c) => c.text).join(' ')).toBe('1 & 2 & 3 &');
  });

  it('lists the beats that pass under a held note', () => {
    const m = meterInfo('4/4');
    expect(heldBeats(0, 3840, m).map((h) => h.text)).toEqual(['2', '3', '4']);
    expect(heldBeats(960, 1440, m).map((h) => h.text)).toEqual(['3']);
    expect(heldBeats(0, 960, m)).toEqual([]);
  });
});

describe('levels and the generator', () => {
  it('has well-formed vocabularies: every cell and model phrase parses and fits its level', () => {
    for (const level of READ_LEVELS) {
      const intro = introPhrase(level);
      expect(validateRhythm(intro), `level ${level.id} intro`).toEqual([]);
      expect(intro.bars).toHaveLength(2);
      for (const bar of intro.bars) for (const item of bar.items) expect(itemAllowed(item, level.allowed), `level ${level.id} intro: ${formatRhythm(intro)}`).toBe(true);
      expect(level.cells.some((c) => c.feature), `level ${level.id} teaches something`).toBe(true);
    }
    expect(READ_LEVELS.map((l) => l.id)).toEqual(READ_LEVELS.map((_, i) => i + 1));
  });

  it('writes bars that add up, at every level, for many seeds', () => {
    for (const level of READ_LEVELS) {
      const capacity = meterInfo(level.meter).barTicks;
      for (let seed = 0; seed < 60; seed++) {
        const r = generatePhrase(level, seed);
        expect(r.bars).toHaveLength(2);
        for (const bar of r.bars) expect(barTicksUsed(bar), `level ${level.id} seed ${seed}: ${formatRhythm(r)}`).toBe(capacity);
        expect(validateRhythm(r), `level ${level.id} seed ${seed}: ${formatRhythm(r)}`).toEqual([]);
      }
    }
  });

  it('keeps every level to its own note values', () => {
    for (const level of READ_LEVELS) {
      for (let seed = 0; seed < 60; seed++) {
        const r = generatePhrase(level, seed);
        for (const bar of r.bars) for (const item of bar.items) expect(itemAllowed(item, level.allowed), `level ${level.id} seed ${seed}: ${formatRhythm(r)}`).toBe(true);
      }
    }
    // Spot checks in plain words: level 1 has no eighths and no rests, level 3 no sixteenths.
    for (let seed = 0; seed < 40; seed++) {
      expect(formatRhythm(generatePhrase(readLevel(1), seed))).toMatch(/^[whq |]+$/);
      expect(formatRhythm(generatePhrase(readLevel(3), seed))).toMatch(/^[hqe |]+$/);
    }
  });

  it('always contains what the level teaches, starts on a note and has no empty bar', () => {
    for (const level of READ_LEVELS) {
      const featured = level.cells.filter((c) => c.feature).map((c) => c.text);
      for (let seed = 0; seed < 40; seed++) {
        const r = generatePhrase(level, seed);
        const text = ` ${formatRhythm(r).replace(/~/g, '~')} `;
        // A featured cell appears as written; ties over the bar line may add a "~" to its last note.
        const found = featured.some((cell) => text.replace(/~ \|/g, ' |').includes(` ${cell} `) || text.includes(` ${cell} `) || text.includes(` ${cell}~ `));
        expect(found, `level ${level.id} seed ${seed}: ${text}`).toBe(true);
        expect(r.bars[0].items[0].rest).toBe(false);
        for (const bar of r.bars) expect(bar.items.some((i) => !i.rest)).toBe(true);
      }
    }
  });

  it('is deterministic per seed and varies between seeds', () => {
    const level = readLevel(7);
    expect(formatRhythm(generatePhrase(level, 12))).toBe(formatRhythm(generatePhrase(level, 12)));
    const distinct = new Set(Array.from({ length: 30 }, (_, seed) => formatRhythm(generatePhrase(level, seed))));
    expect(distinct.size).toBeGreaterThan(20);
    const a = seededRandom(5);
    const b = seededRandom(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('opens a first attempt with the model phrase and marks swing', () => {
    const level = readLevel(12);
    const round = generateRound(level, 0);
    expect(round).toHaveLength(4);
    expect(formatRhythm(round[0])).toBe(level.intro);
    expect(round.every((r) => r.swing)).toBe(true);
    expect(formatRhythm(generateRound(level, 3)[0])).not.toBe(level.intro);
    expect(readLevel(99).id).toBe(READ_LEVELS.length);
    expect(readLevel(Number.NaN).id).toBe(1);
  });

  it('beams every generated bar by beat: no group spans two beats', () => {
    for (const level of READ_LEVELS) {
      const meter = meterInfo(level.meter);
      for (let seed = 0; seed < 25; seed++) {
        const r = generatePhrase(level, seed);
        r.bars.forEach((bar, b) => {
          for (const group of beamGroups(r)[b]) {
            const beats = new Set(group.map((i) => meter.beatStarts.filter((s) => s <= bar.items[i].tick).length));
            expect(beats.size, `level ${level.id} seed ${seed}`).toBe(1);
            expect(group.length).toBeGreaterThanOrEqual(2);
          }
        });
      }
    }
  });
});
