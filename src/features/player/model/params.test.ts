import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from '@/app/router';
import { parsePlayerParams, playerParams, requestKey, resolveRequest } from './params';

const SONG = {
  bars: Array.from({ length: 16 }, () => ({ time: { numerator: 4, denominator: 4 } })),
  sections: [
    { name: 'Verse 1', start: 0, end: 8 },
    { name: 'Chorus', start: 8, end: 16 },
  ],
};

describe('player params', () => {
  it('reads the song id and nothing else by default', () => {
    expect(parsePlayerParams(['greensleeves'])).toEqual({ songId: 'greensleeves', startBar: null, loop: null, tempo: null, mode: null, section: null });
    expect(parsePlayerParams([]).songId).toBeNull();
  });

  it('reads a start bar, a loop, a tempo, a mode and a section in any order', () => {
    expect(parsePlayerParams(['x', 'm9']).startBar).toBe(8);
    expect(parsePlayerParams(['x', 't70', 'm12-9', 'flow'])).toMatchObject({ loop: { from: 8, to: 11 }, tempo: 70, mode: 'flow' });
    expect(parsePlayerParams(['x', 'chorus', 'wait'])).toMatchObject({ section: 'chorus', mode: 'wait' });
  });

  it('clamps the tempo and ignores bars counted from zero', () => {
    expect(parsePlayerParams(['x', 't10']).tempo).toBe(25);
    expect(parsePlayerParams(['x', 't400']).tempo).toBe(150);
    expect(parsePlayerParams(['x', 'm0']).startBar).toBeNull();
    expect(parsePlayerParams(['x', 'm0-3']).loop).toBeNull();
  });

  it('writes links that read back the same, through the router', () => {
    const params = playerParams('greensleeves-fingerstyle', { loop: { from: 8, to: 11 }, tempo: 70, mode: 'flow' });
    expect(params).toEqual(['greensleeves-fingerstyle', 'm9-12', 't70', 'flow']);
    const hash = formatHash('play', ...params);
    expect(hash).toBe('#play--greensleeves-fingerstyle--m9-12--t70--flow');
    const back = parsePlayerParams(parseHash(hash).params);
    expect(back).toMatchObject({ songId: 'greensleeves-fingerstyle', loop: { from: 8, to: 11 }, tempo: 70, mode: 'flow' });
    expect(playerParams('a', { startBar: 0, tempo: 100, mode: 'listen' })).toEqual(['a']);
    expect(playerParams('a', { section: 'Verse 1' })).toEqual(['a', 'verse-1']);
  });

  it('turns a section into its loop and start bar', () => {
    const r = resolveRequest(parsePlayerParams(['x', 'chorus']), SONG);
    expect(r).toMatchObject({ loop: { from: 8, to: 15 }, startBar: 8, sectionName: 'Chorus', problems: [] });
    expect(resolveRequest(parsePlayerParams(['x', 'verse-1']), SONG).loop).toEqual({ from: 0, to: 7 });
  });

  it('says so when the address asks for something the song does not have', () => {
    const r = resolveRequest(parsePlayerParams(['x', 'bridge']), SONG);
    expect(r.loop).toBeNull();
    expect(r.problems[0]).toMatch(/not in this song/);
    const far = resolveRequest(parsePlayerParams(['x', 'm40']), SONG);
    expect(far.startBar).toBeNull();
    expect(far.problems[0]).toMatch(/16 bars/);
    expect(resolveRequest(parsePlayerParams(['x', 'm12-40']), SONG).loop).toEqual({ from: 11, to: 15 });
  });

  it('keys a request by everything after the song id', () => {
    expect(requestKey(['x'])).toBe('');
    expect(requestKey(['x', 'm9-12', 't70'])).toBe('m9-12--t70');
  });
});
