import { describe, expect, it } from 'vitest';
import { parseTimeSignature } from '@/core/theory';
import { countSyllables, gridStep, parseRhythm, parseStrum, rhythmGrid, stepAt, strumSlotsPerBeat, strumSyllables } from './model';

const ts = (t: string) => parseTimeSignature(t)!;

describe('parseRhythm', () => {
  it('reads the lesson notation', () => {
    const { notes, errors } = parseRhythm('q q e e q | h qr ~q');
    expect(errors).toEqual([]);
    expect(notes.reduce((sum, n) => sum + n.ticks, 0)).toBe(2 * 3840);
    const { notes: ok } = parseRhythm('q >e. ~s hr et');
    expect(ok.map((n) => [n.value, n.dots, n.triplet, n.rest, n.tied, n.accent, n.ticks, n.start])).toEqual([
      ['quarter', 0, false, false, false, false, 960, 0],
      ['eighth', 1, false, false, false, true, 720, 960],
      ['sixteenth', 0, false, false, true, false, 240, 1680],
      ['half', 0, false, true, false, false, 1920, 1920],
      ['eighth', 0, true, false, false, false, 320, 3840],
    ]);
  });

  it('reports unknown codes', () => {
    expect(parseRhythm('q x q').errors).toHaveLength(1);
  });

  it('ignores a tie with nothing sounding before it', () => {
    expect(parseRhythm('~q qr ~q q ~q').notes.map((n) => n.tied)).toEqual([false, false, false, false, true]);
  });
});

describe('grids and counting', () => {
  it('counts eighths, sixteenths, compound time, odd meters and triplets', () => {
    expect(countSyllables(ts('4/4'), 480)).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(countSyllables(ts('2/4'), 240)).toEqual(['1', 'e', '&', 'a', '2', 'e', '&', 'a']);
    expect(countSyllables(ts('6/8'), 480)).toEqual(['1', '&', 'a', '2', '&', 'a']);
    expect(countSyllables(ts('7/8'), 480)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(rhythmGrid(parseRhythm('et et et q h').notes).cells.slice(0, 6).map((c) => c.syllable)).toEqual(['1', 'trip', 'let', '2', 'trip', 'let']);
  });

  it('chooses the coarsest grid that holds every note', () => {
    expect(gridStep(parseRhythm('q q h').notes, ts('4/4'))).toBe(480);
    expect(gridStep(parseRhythm('q e e s s e q').notes, ts('4/4'))).toBe(240);
    expect(gridStep(parseRhythm('qt qt qt h').notes, ts('4/4'))).toBe(320);
    expect(gridStep(parseRhythm('q. e e e').notes, ts('6/8'))).toBe(480);
  });

  it('marks onsets, sustains and bars', () => {
    const g = rhythmGrid(parseRhythm('h q qr | e e e e h').notes);
    expect(g.bars).toBe(2);
    expect(g.stepsPerBar).toBe(8);
    expect(g.cells.slice(0, 8).map((c) => c.onset)).toEqual([0, null, null, null, 1, null, 2, null]);
    expect(g.cells.slice(0, 8).map((c) => c.note)).toEqual([0, 0, 0, 0, 1, 1, 2, 2]);
    expect(g.cells[8]).toMatchObject({ bar: 1, inBar: 0, syllable: '1', beat: true, onset: 3 });
    expect(stepAt(g, 0)).toBe(0);
    expect(stepAt(g, 1000)).toBe(2);
    expect(stepAt(g, 99999)).toBeNull();
    expect(stepAt(g, -1)).toBeNull();
  });

  it('fills a short last bar with empty steps', () => {
    const g = rhythmGrid(parseRhythm('q q').notes);
    expect(g.bars).toBe(1);
    expect(g.cells.slice(4).every((c) => c.note === null)).toBe(true);
  });
});

describe('strumming', () => {
  it('reads D U X - with directions from the slot', () => {
    const { steps } = parseStrum('D-DU-UDU');
    expect(steps.map((s) => `${s.dir[0]}${s.kind[0]}`)).toEqual(['ds', 'ug', 'ds', 'us', 'dg', 'us', 'ds', 'us']);
    const muted = parseStrum('D U X> U');
    expect(muted.steps[2]).toEqual({ dir: 'down', kind: 'mute' });
    expect(parseStrum('D> U').steps[0]).toEqual({ dir: 'down', kind: 'accent' });
  });

  it('reads the strumming library format and bar lines', () => {
    const { steps, bars } = parseStrum('sxas | s-s-');
    expect(steps.map((s) => s.kind)).toEqual(['strum', 'mute', 'accent', 'strum', 'strum', 'ghost', 'strum', 'ghost']);
    expect(steps.map((s) => s.dir)).toEqual(['down', 'up', 'down', 'up', 'down', 'up', 'down', 'up']);
    expect(bars).toEqual([4]);
  });

  it('works out the grid and the counting', () => {
    expect(strumSlotsPerBeat(8, ts('4/4'))).toBe(2);
    expect(strumSlotsPerBeat(16, ts('4/4'))).toBe(4);
    expect(strumSlotsPerBeat(6, ts('6/8'))).toBe(3);
    expect(strumSlotsPerBeat(6, ts('3/4'))).toBe(2);
    expect(strumSyllables(8, ts('4/4'), 2)).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(strumSyllables(6, ts('2/4'), 3, true)).toEqual(['1', 'trip', 'let', '2', 'trip', 'let']);
    expect(strumSyllables(4, ts('4/4'), 4)).toEqual(['1', 'e', '&', 'a']);
  });
});
