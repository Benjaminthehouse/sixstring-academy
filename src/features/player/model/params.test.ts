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
    expect(parsePlayerParams(['greensleeves'])).toEqual({
      songId: 'greensleeves', startBar: null, loop: null, tempo: null, mode: null, section: null, part: null, mute: [], layer: null, hideChart: false, capo: null, transpose: null,
    });
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

  it('reads the part, mutes, score, hidden chart, capo and transposition, none of them as a section', () => {
    const r = parsePlayerParams(['x', 'part-your-strum', 'mute-teacher', 'mute-bass', 'notes', 'hide-chart', 'capo2', 'down3']);
    expect(r).toMatchObject({ part: 'your-strum', mute: ['teacher', 'bass'], layer: 'notation', hideChart: true, capo: 2, transpose: -3, section: null });
    expect(parsePlayerParams(['x', 'tab-and-notes']).layer).toBe('both');
    expect(parsePlayerParams(['x', 'tab-only']).layer).toBe('tab');
    expect(parsePlayerParams(['x', 'up2']).transpose).toBe(2);
    // Out of range: ignored, never thrown on.
    expect(parsePlayerParams(['x', 'capo14']).capo).toBeNull();
    expect(parsePlayerParams(['x', 'up9']).transpose).toBeNull();
    expect(parsePlayerParams(['x', 'down0']).transpose).toBeNull();
  });

  it('writes the new params so they read back the same', () => {
    const params = playerParams('korobeiniki', { part: 'Your strum', mute: ['teacher'], layer: 'notation', hideChart: true, capo: 3, transpose: -2, tempo: 70 });
    expect(params).toEqual(['korobeiniki', 't70', 'part-your-strum', 'mute-teacher', 'notes', 'hide-chart', 'capo3', 'down2']);
    expect(parsePlayerParams(params)).toMatchObject({ part: 'your-strum', mute: ['teacher'], layer: 'notation', hideChart: true, capo: 3, transpose: -2, tempo: 70, section: null });
    expect(playerParams('a', { transpose: 0, layer: 'both' })).toEqual(['a', 'tab-and-notes']);
  });

  it('finds the part by id, by name or by role, and says so when the song has no such part', () => {
    const song = { ...SONG, tracks: [{ id: 'your-strum', name: 'Your strum', role: 'rhythm' as const }, { id: 'teacher', name: 'Teacher', role: 'lead' as const }, { id: 'teacher-bass', name: 'Teacher bass', role: 'bass' as const }] };
    expect(resolveRequest(parsePlayerParams(['x', 'part-teacher']), song).track).toBe('teacher');
    expect(resolveRequest(parsePlayerParams(['x', 'part-bass']), song).track).toBe('teacher-bass');
    expect(resolveRequest(parsePlayerParams(['x', 'part-strum']), song).track).toBe('your-strum');
    expect(resolveRequest(parsePlayerParams(['x', 'part-melody']), song).track).toBe('teacher');
    const none = resolveRequest(parsePlayerParams(['x', 'part-violin']), song);
    expect(none.track).toBeNull();
    expect(none.problems[0]).toMatch(/no part called "violin", so you play Your strum/);
    expect(resolveRequest(parsePlayerParams(['x', 'mute-teacher', 'mute-nobody']), song).muted).toEqual(['teacher']);
    expect(resolveRequest(parsePlayerParams(['x']), song).muted).toBeNull();
  });

  it('reads `part-a` as the section "Part A" when no part is called that', () => {
    const song = { bars: SONG.bars, sections: [{ name: 'Part A', start: 0, end: 4 }, { name: 'Part B', start: 4, end: 8 }], tracks: [{ id: 'melody', name: 'Melody', role: 'lead' as const }] };
    const r = resolveRequest(parsePlayerParams(['x', 'part-b']), song);
    expect(r).toMatchObject({ track: null, loop: { from: 4, to: 7 }, sectionName: 'Part B', problems: [] });
  });

  it('keys a request by everything after the song id', () => {
    expect(requestKey(['x'])).toBe('');
    expect(requestKey(['x', 'm9-12', 't70'])).toBe('m9-12--t70');
  });
});
