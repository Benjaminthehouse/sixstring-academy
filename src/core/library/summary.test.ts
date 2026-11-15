import { describe, expect, it } from 'vitest';
import { CAMPFIRE_GROOVE, ODE_TO_JOY, TECHNIQUE_SAMPLER, sixTab } from '@/core/song';
import { createLibrary } from './library';
import { memoryStore } from './store';
import { inferSkills, songThumb, summarizeSong } from './summary';

const lib = createLibrary({ store: memoryStore(), broadcast: false });

describe('summaries', () => {
  it('describe a melody with chords', () => {
    const s = summarizeSong(sixTab(ODE_TO_JOY));
    expect(s).toMatchObject({ bars: 8, playedBars: 8, bpm: 100, time: '4/4', tracks: 1, hasTab: true, hasChords: true, hasLyrics: false, hasStrumming: false, capo: 0 });
    expect(s.chords).toEqual(['C', 'G']);
    expect(s.tuning).toEqual([40, 45, 50, 55, 59, 64]);
    expect(s.seconds).toBeCloseTo(19.2, 1);
  });

  it('count repeats in the played length', () => {
    const s = summarizeSong(sixTab(CAMPFIRE_GROOVE));
    expect(s.playedBars).toBeGreaterThan(s.bars);
    expect(s.hasStrumming).toBe(true);
  });

  it('infer skills from the notes', () => {
    expect(inferSkills(sixTab(ODE_TO_JOY))).toEqual(['melody', 'chords']);
    expect(inferSkills(sixTab(CAMPFIRE_GROOVE))).toEqual(expect.arrayContaining(['chords', 'strumming']));
    expect(inferSkills(sixTab(TECHNIQUE_SAMPLER))).toEqual(expect.arrayContaining(['technique', 'rhythm']));
  });
});

describe('thumbnails', () => {
  it('hold the first two bars of the first track, with chords', () => {
    const t = songThumb(sixTab(ODE_TO_JOY));
    expect(t.strings).toBe(6);
    expect(t.bars).toHaveLength(2);
    expect(t.bars[0].ticks).toBe(3840);
    expect(t.bars[0].beats.map((b) => b.n)).toEqual([[[1, 0]], [[1, 0]], [[1, 1]], [[1, 3]]]);
    expect(t.bars[0].chords).toEqual([{ t: 0, symbol: 'C' }]);
  });

  it('show strums as slashes', async () => {
    const t = songThumb(await lib.load('frere-jacques'));
    expect(t.bars[0].beats).toHaveLength(4);
    expect(t.bars[0].beats.every((b) => b.slash && b.n.length === 0)).toBe(true);
  });

  it('keep a pickup bar and still show two full bars', async () => {
    const t = songThumb(await lib.load('greensleeves-fingerstyle'));
    expect(t.bars.map((b) => b.ticks)).toEqual([480, 2880, 2880]);
    expect(t.bars[0].beats[0].n).toEqual([[3, 2]]);
  });

  it('mark dead notes', () => {
    const t = songThumb(sixTab`title: Mute
tempo: 90
| q 6:x 6:0 h 6:3 |`);
    expect(t.bars[0].beats[0].n).toEqual([[6, -1]]);
  });
});
