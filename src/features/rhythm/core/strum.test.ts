import { describe, expect, it } from 'vitest';
import { PPQ } from '@/core/theory';
import { chartSeconds, clockChart, findOneChart, offbeatChart, pulseChart, readChart, strumChart, switchChart, switchSequence } from './charts';
import { generateRound, readLevel, seededRandom } from './generate';
import { BEAT_LEVELS, CLOCK_LEVELS, DRILLS, LADDER, STAGES, nextRung, rungAfter, skillId } from './ladder';
import { meterInfo } from './meter';
import { parseRhythm, rhythmOnsets } from './rhythm';
import {
  STRUM_PATTERNS,
  blankSlots,
  decodeCustom,
  encodeCustom,
  gridAllowed,
  nextKind,
  patternArrows,
  patternCount,
  patternNickname,
  resolvePattern,
  setSlot,
  slotsPerBar,
  sounds,
  strokes,
  strumPattern,
} from './strum';

describe('the strumming library', () => {
  it('has unique ids and fills its bar in every pattern', () => {
    expect(new Set(STRUM_PATTERNS.map((p) => p.id)).size).toBe(STRUM_PATTERNS.length);
    for (const p of STRUM_PATTERNS) {
      expect(p.slots, p.id).toHaveLength(slotsPerBar(p.meter, p.grid));
      expect(p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(strokes(p).some(sounds), p.id).toBe(true);
    }
  });

  it.each(STRUM_PATTERNS.map((p) => [p.id, p] as const))('%s: the stroke grid matches its written arrows and count', (_id, p) => {
    expect(patternArrows(p)).toBe(p.written);
    expect(patternCount(p)).toBe(p.count);
  });

  it('follows the pendulum: downs on the even slots, ups on the odd ones', () => {
    for (const p of STRUM_PATTERNS) {
      for (const s of strokes(p)) expect(s.dir, `${p.id} slot ${s.slot}`).toBe(s.slot % 2 === 0 ? 'D' : 'U');
      // So a downstroke is always on a number or an "&" of the sixteenth grid, never on "e" or "a".
      for (const s of strokes(p).filter(sounds)) {
        if (s.dir === 'D') expect(['e', 'a'], `${p.id} slot ${s.slot}`).not.toContain(s.count.text);
      }
    }
  });

  it('spells the famous one the way players say it', () => {
    const folk = strumPattern('folk-pop')!;
    expect(patternNickname(folk)).toBe('D DU UDU');
    expect(patternArrows(folk)).toBe('D . D U . U D U');
    expect(strokes(folk).filter((s) => s.kind === 'ghost').map((s) => s.count.text)).toEqual(['&', '3']);
    expect(patternNickname(strumPattern('down-down-up')!)).toBe('D DU D DU');
    expect(patternNickname(strumPattern('chuck')!)).toBe('D xU U xU');
  });

  it('swings the shuffle and leaves straight patterns alone', () => {
    expect(strokes(strumPattern('swung-eighths')!).map((s) => s.playTick)).toEqual([0, 640, 960, 1600, 1920, 2560, 2880, 3520]);
    expect(strokes(strumPattern('down-up')!).map((s) => s.playTick)).toEqual([0, 480, 960, 1440, 1920, 2400, 2880, 3360]);
    expect(strokes(strumPattern('six-eight')!).map((s) => s.tick)[11]).toBe(11 * 240);
  });

  it('covers what a beginner needs', () => {
    const ids = STRUM_PATTERNS.map((p) => p.id);
    for (const id of ['four-down', 'down-up', 'folk-pop', 'waltz', 'six-eight', 'reggae', 'funk-scratch', 'shuffle', 'chuck', 'sixteenths']) expect(ids).toContain(id);
    expect(STRUM_PATTERNS.filter((p) => p.meter === '3/4').length).toBeGreaterThanOrEqual(2);
    expect(STRUM_PATTERNS.filter((p) => p.meter === '6/8').length).toBeGreaterThanOrEqual(2);
    expect(STRUM_PATTERNS.some((p) => p.slots.includes('x'))).toBe(true);
    for (const p of STRUM_PATTERNS) {
      expect(p.how.length, p.id).toBeGreaterThan(40);
      expect(p.mistake.length, p.id).toBeGreaterThan(20);
    }
  });
});

describe('the pattern builder', () => {
  it('round-trips a pattern through its route code', () => {
    const code = encodeCustom('4/4', 'eighth', 's-ss-sax');
    expect(code).toBe('my-44-e-sossosax');
    expect(code).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const p = decodeCustom(code)!;
    expect(p.slots).toBe('s-ss-sax');
    expect(p.written).toBe('D . D U . U D> Ux');
    expect(p.count).toBe('1 2 & & 4 &');
    expect(p.custom).toBe(true);
    expect(resolvePattern(code)!.id).toBe(code);
    expect(resolvePattern('folk-pop')!.name).toBe('The folk and pop strum');
  });

  it('refuses codes that do not fill the bar, are empty or use an impossible grid', () => {
    expect(decodeCustom('my-44-e-sos')).toBeNull();
    expect(decodeCustom('my-44-e-oooooooo')).toBeNull();
    expect(decodeCustom('my-68-e-ssssss')).toBeNull();
    expect(decodeCustom('my-99-e-ssssssss')).toBeNull();
    expect(decodeCustom('folk-pop')).toBeNull();
    expect(decodeCustom(encodeCustom('6/8', 'sixteenth', blankSlots('6/8', 'sixteenth')))!.count).toBe('1 2 3 4 5 6');
    expect(decodeCustom(encodeCustom('3/4', 'swing', 'ssssss'))!.grid).toBe('swing');
  });

  it('starts from the beats and cycles a slot through its four states', () => {
    expect(blankSlots('4/4', 'eighth')).toBe('s-s-s-s-');
    expect(blankSlots('4/4', 'sixteenth')).toBe('s---s---s---s---');
    expect(blankSlots('3/4', 'eighth')).toBe('s-s-s-');
    expect(gridAllowed('6/8', 'eighth')).toBe(false);
    expect(nextKind('ghost')).toBe('strum');
    expect(nextKind(nextKind(nextKind(nextKind('ghost'))))).toBe('ghost');
    expect(setSlot('s-s-', 1, 'mute')).toBe('sxs-');
    expect(setSlot('s-s-', 9, 'mute')).toBe('s-s-');
  });
});

describe('charts', () => {
  it('pulse: a bar of count-in, then a target on every wanted beat', () => {
    const all = pulseChart({ bpm: 80, bars: 4 });
    expect(all.segments.map((s) => s.kind)).toEqual(['count', 'play']);
    expect(all.targets.map((t) => t.tick)).toEqual(Array.from({ length: 16 }, (_, i) => 3840 + i * 960));
    expect(all.sounds.filter((s) => s.type === 'click')).toHaveLength(20);
    expect(all.sounds.filter((s) => s.type === 'click' && s.level === 'accent')).toHaveLength(5);
    expect(pulseChart({ bpm: 90, bars: 2, hit: 'backbeat' }).targets.map((t) => t.label)).toEqual(['2', '4', '2', '4']);
    expect(pulseChart({ bpm: 90, bars: 3, hit: 'one' }).targets.map((t) => t.tick)).toEqual([3840, 7680, 11520]);
    expect(pulseChart({ meter: '3/4', bpm: 90, bars: 2 }).targets).toHaveLength(6);
    expect(chartSeconds(all)).toBeCloseTo((20 * 60) / 80, 6);
  });

  it('read: targets are the onsets of each phrase, after its own count-in', () => {
    const phrases = [parseRhythm('q q rq q | h~ q q'), parseRhythm('e e q h | w')];
    const chart = readChart(phrases, { bpm: 72 });
    expect(chart.segments.map((s) => s.kind)).toEqual(['count', 'play', 'count', 'play']);
    const first = chart.targets.filter((t) => t.seg === 1);
    expect(first.map((t) => t.tick - 3840)).toEqual(rhythmOnsets(phrases[0]).map((o) => o.tick));
    expect(first.map((t) => t.label)).toEqual(['1', '2', '4', '1', '4']);
    expect(first.map((t) => t.ref)).toEqual([0, 1, 2, 3, 4]);
    const second = chart.targets.filter((t) => t.seg === 3);
    expect(second[0].tick).toBe(3840 * 4);
    expect(second.map((t) => t.part)).toEqual(['beat', 'and', 'beat', 'beat', 'beat']);
    expect(chart.lengthTicks).toBe(3840 * 6);
  });

  it('read with echo: the phrase is heard first, on a guide sound', () => {
    const phrase = parseRhythm('q q h | w');
    const chart = readChart([phrase], { bpm: 72, echo: true });
    expect(chart.segments.map((s) => s.kind)).toEqual(['count', 'listen', 'count', 'play']);
    expect(chart.sounds.filter((s) => s.type === 'guide').map((s) => s.tick)).toEqual([3840, 4800, 5760, 7680]);
    expect(chart.targets.map((t) => t.tick)).toEqual([15360, 16320, 17280, 19200]);
  });

  it('read: swung phrases are played swung and counted straight', () => {
    const chart = readChart([parseRhythm('e e q h | w', '4/4', { swing: true })], { bpm: 96 });
    expect(chart.targets.slice(0, 3).map((t) => t.tick - 3840)).toEqual([0, 640, 960]);
    expect(chart.targets.slice(0, 3).map((t) => t.label)).toEqual(['1', '&', '2']);
  });

  it('generated rounds become charts whose targets stay inside their play segments', () => {
    for (const levelId of [1, 6, 10, 11, 12, 14]) {
      const level = readLevel(levelId);
      const chart = readChart(generateRound(level, 5), { bpm: level.bpm });
      for (const t of chart.targets) {
        const seg = chart.segments[t.seg];
        expect(seg.kind).toBe('play');
        expect(t.tick).toBeGreaterThanOrEqual(seg.startTick);
        expect(t.tick).toBeLessThan(seg.endTick);
      }
      expect(chart.targets.map((t) => t.tick)).toEqual([...chart.targets.map((t) => t.tick)].sort((a, b) => a - b));
    }
  });

  it('strum: every sounding stroke is a strum and, when playing along, a target with its direction', () => {
    const folk = strumPattern('folk-pop')!;
    const play = strumChart(folk, { bpm: 88, bars: 2, mode: 'play', guitar: true });
    const strums = play.sounds.filter((s) => s.type === 'strum');
    expect(strums).toHaveLength(12);
    expect(play.targets).toHaveLength(12);
    expect(play.targets.slice(0, 6).map((t) => t.tick - 3840)).toEqual([0, 960, 1440, 2400, 2880, 3360]);
    expect(play.targets.slice(0, 6).map((t) => t.dir)).toEqual(['D', 'D', 'U', 'U', 'D', 'U']);
    expect(play.targets.slice(0, 6).map((t) => t.ref)).toEqual([0, 2, 3, 5, 6, 7]);
    expect(play.targets.slice(0, 6).map((t) => t.label).join(' ')).toBe(folk.count);
    const listen = strumChart(folk, { bpm: 88, bars: 2, mode: 'listen', guitar: true });
    expect(listen.targets).toHaveLength(0);
    expect(listen.loop).toEqual({ start: 3840, end: 3840 * 3 });
    const quiet = strumChart(folk, { bpm: 88, bars: 1, mode: 'play', guitar: false });
    expect(quiet.sounds.every((s) => s.type === 'click')).toBe(true);
  });

  it('strum: six-eight clicks the two big beats with soft eighths between', () => {
    const chart = strumChart(strumPattern('six-eight')!, { bpm: 56, bars: 1, mode: 'play', guitar: false });
    const firstBar = chart.sounds.filter((s) => s.tick < 2880);
    expect(firstBar.map((s) => (s.type === 'click' ? s.level : '?'))).toEqual(['accent', 'sub', 'sub', 'beat', 'sub', 'sub']);
    expect(chart.targets.map((t) => t.label).join(' ')).toBe('1 2 3 4 5 6');
    expect(chartSeconds(chart)).toBeCloseTo((4 * 60) / 56, 6);
  });

  it('switch: each bar carries its cue and the right number of evenly spaced targets', () => {
    const chart = switchChart({ bpm: 72, sequence: ['quarter', 'triplet', 'sixteenth', 'eighth'] });
    expect(chart.segments.map((s) => s.cue)).toEqual(['Quarters', 'Quarters', 'Triplets', 'Sixteenths', 'Eighths']);
    expect([1, 2, 3, 4].map((seg) => chart.targets.filter((t) => t.seg === seg).length)).toEqual([4, 12, 16, 8]);
    const trip = chart.targets.filter((t) => t.seg === 2).slice(0, 4);
    expect(trip.map((t) => t.tick - 3840 * 2)).toEqual([0, 320, 640, 960]);
    expect(trip.map((t) => t.label)).toEqual(['1', 'trip', 'let', '2']);
    const seq = switchSequence(['quarter', 'eighth', 'sixteenth'], 12, seededRandom(4));
    expect(seq[0]).toBe('quarter');
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });

  it('off-beat: only the chosen part of each beat is a target', () => {
    expect(offbeatChart({ bpm: 70, bars: 1, part: 'and' }).targets.map((t) => [t.tick - 3840, t.label])).toEqual([[480, '&'], [1440, '&'], [2400, '&'], [3360, '&']]);
    expect(offbeatChart({ bpm: 60, bars: 1, part: 'a' }).targets.map((t) => t.label)).toEqual(['a', 'a', 'a', 'a']);
    expect(offbeatChart({ bpm: 60, bars: 1, part: 'e' }).targets[0].tick).toBe(3840 + 240);
  });

  it('find one: targets on every bar line; accents first, then none', () => {
    const chart = findOneChart({ meter: '7/8', bpm: 96, guided: 2, blind: 3 });
    const bar = meterInfo('7/8').barTicks;
    expect(bar).toBe(7 * 480);
    expect(chart.targets.map((t) => t.tick)).toEqual([1, 2, 3, 4, 5].map((n) => n * bar));
    const levelsIn = (from: number) => chart.sounds.filter((s) => s.tick >= from && s.tick < from + bar).map((s) => (s.type === 'click' ? s.level : '?'));
    expect(levelsIn(bar)).toEqual(['accent', 'sub', 'medium', 'sub', 'medium', 'sub', 'sub']);
    expect(levelsIn(bar * 3)).toEqual(Array(7).fill('beat'));
  });

  it('inner clock: silent bars have targets and no clicks', () => {
    const chart = clockChart({ bpm: 84, on: 2, off: 1, cycles: 2 });
    expect(chart.segments.map((s) => !!s.silent)).toEqual([false, false, true, false, true, false]);
    const silentSeg = chart.segments[2];
    expect(chart.sounds.some((s) => s.tick >= silentSeg.startTick && s.tick < silentSeg.endTick)).toBe(false);
    const silentTargets = chart.targets.filter((t) => t.silent);
    expect(silentTargets).toHaveLength(8);
    expect(chart.targets).toHaveLength(4 * (2 + 1) * 2 + 4);
    expect(chart.lengthTicks).toBe(3840 * (1 + 6 + 1));
  });
});

describe('the ladder', () => {
  it('visits every level of every activity exactly once', () => {
    const skills = LADDER.map((r) => r.skill);
    expect(new Set(skills).size).toBe(skills.length);
    for (const l of BEAT_LEVELS) expect(skills).toContain(skillId('beat', l.id));
    for (let id = 1; id <= 15; id++) expect(skills).toContain(skillId('read', id));
    for (const p of STRUM_PATTERNS) expect(skills).toContain(skillId('strum', p.id));
    for (const d of DRILLS) expect(skills).toContain(skillId('drill', d.id));
    for (const l of CLOCK_LEVELS) expect(skills).toContain(skillId('clock', l.id));
    expect(LADDER).toHaveLength(BEAT_LEVELS.length + 15 + STRUM_PATTERNS.length + DRILLS.length + CLOCK_LEVELS.length);
    expect(STAGES.reduce((n, s) => n + s.steps.length, 0)).toBe(LADDER.length);
  });

  it('introduces reading levels in order and has route-safe params', () => {
    const reads = LADDER.filter((r) => r.activity === 'read').map((r) => Number(r.params[1]));
    // 13 (three-four) is taught early with the waltz; the rest climbs.
    expect(reads.filter((n) => n !== 13)).toEqual([...reads.filter((n) => n !== 13)].sort((a, b) => a - b));
    for (const r of LADDER) for (const p of r.params) expect(p).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('points at the first step without a star, then the one after it', () => {
    expect(nextRung(() => 0).skill).toBe('rhythm:beat:1');
    const done = new Set(['rhythm:beat:1', 'rhythm:read:1']);
    expect(nextRung((s) => (done.has(s) ? 2 : 0)).skill).toBe('rhythm:strum:four-down');
    expect(nextRung(() => 3).skill).toBe(LADDER[LADDER.length - 1].skill);
    expect(rungAfter('rhythm:beat:1')!.skill).toBe('rhythm:read:1');
    expect(rungAfter(LADDER[LADDER.length - 1].skill)).toBeNull();
  });

  it('keeps tick maths on the shared grid', () => {
    expect(PPQ).toBe(960);
  });
});
