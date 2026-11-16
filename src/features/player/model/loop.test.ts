import { describe, expect, it } from 'vitest';
import { flattenSong, sixTab } from '@/core/song';
import { IDLE_PICK, loopKey, loopLabel, loopShort, normalizeLoop, sameLoop, sectionAtBar, sectionChips, stepBarTick } from './loop';

const SONG = sixTab(`title: Steps
tempo: 120
[Verse]
| q 3:0 3:2 3:4 3:5 | 3:0 3:2 3:4 3:5 |
[Chorus]
|: q 2:0 2:1 2:3 2:5 | 2:0 2:1 2:3 2:5 :|
[Verse]
| q 3:0 3:2 3:4 3:5 ||
`);

describe('loop selection', () => {
  it('normalises a range: in order, inside the song, or nothing', () => {
    expect(normalizeLoop({ from: 5, to: 2 }, 10)).toEqual({ from: 2, to: 5 });
    expect(normalizeLoop({ from: -3, to: 40 }, 10)).toEqual({ from: 0, to: 9 });
    expect(normalizeLoop({ from: 12, to: 14 }, 10)).toBeNull();
    expect(normalizeLoop({ from: NaN, to: 2 }, 10)).toBeNull();
    expect(normalizeLoop(null, 10)).toBeNull();
  });

  it('labels bars counted from 1', () => {
    expect(loopLabel({ from: 8, to: 11 })).toBe('Bars 9 to 12');
    expect(loopLabel({ from: 3, to: 3 })).toBe('Bar 4');
    expect(loopShort({ from: 8, to: 11 })).toBe('9–12');
    expect(sameLoop({ from: 1, to: 2 }, { from: 1, to: 2 })).toBe(true);
    expect(sameLoop(null, null)).toBe(true);
    expect(sameLoop({ from: 1, to: 2 }, null)).toBe(false);
  });

  it('works as an A–B repeat with the L key', () => {
    let s = loopKey(null, IDLE_PICK, 8);
    expect(s).toEqual({ loop: { from: 8, to: 8 }, pick: { stage: 'end', from: 8 } });
    s = loopKey(s.loop, s.pick, 11);
    expect(s).toEqual({ loop: { from: 8, to: 11 }, pick: IDLE_PICK });
    s = loopKey(s.loop, s.pick, 3);
    expect(s).toEqual({ loop: null, pick: IDLE_PICK });
    // Closing the loop before the first bar still gives a range in order.
    const back = loopKey({ from: 8, to: 8 }, { stage: 'end', from: 8 }, 5);
    expect(back.loop).toEqual({ from: 5, to: 8 });
  });

  it('makes one chip per section name, ignoring repeats of it', () => {
    const chips = sectionChips(SONG);
    expect(chips.map((c) => [c.name, c.slug, c.range])).toEqual([
      ['Verse', 'verse', { from: 0, to: 1 }],
      ['Chorus', 'chorus', { from: 2, to: 3 }],
    ]);
    expect(sectionAtBar(chips, 3)?.name).toBe('Chorus');
    expect(sectionAtBar(chips, 4)).toBeNull();
  });

  it('steps bars in playback order, repeats included', () => {
    const t = flattenSong(SONG);
    // Bars as played: 0 1 2 3 2 3 4.
    expect(t.bars.map((b) => b.bar)).toEqual([0, 1, 2, 3, 2, 3, 4]);
    const start = (i: number) => t.bars[i].start;
    expect(stepBarTick(t, start(0) + 100, 1)).toBe(start(1));
    expect(stepBarTick(t, start(3) + 10, 1)).toBe(start(4)); // into the repeat
    expect(stepBarTick(t, start(6), 1)).toBe(start(6)); // last bar stays
    // ← near the start of a bar goes to the bar before; further in, to the start of this one.
    expect(stepBarTick(t, start(2) + 100, -1)).toBe(start(1));
    expect(stepBarTick(t, start(2) + 2000, -1)).toBe(start(2));
    expect(stepBarTick(t, 0, -1)).toBe(0);
  });

  it('keeps stepping inside a loop', () => {
    const t = flattenSong(SONG);
    const loop = { start: t.bars[2].start, end: t.bars[4].start };
    expect(stepBarTick(t, t.bars[3].start + 10, 1, loop)).toBe(loop.start); // wraps round
    expect(stepBarTick(t, t.bars[2].start + 10, -1, loop)).toBe(loop.start); // never before it
  });
});
