import { describe, expect, it } from 'vitest';
import { barMarks } from './engrave';
import { parseRhythm, rhythmGrid } from './model';

const grid = (rhythm: string, time = '4/4') => rhythmGrid(parseRhythm(rhythm).notes, time);

describe('barMarks', () => {
  it('beams eighths by the beat (a half bar of plain eighths under one beam) and flags a lone one', () => {
    const g = grid('q q e e q');
    const m = barMarks(g, 0);
    expect(m.map((x) => x.beamed)).toEqual([false, false, true, true, false]);
    expect(m[2].beams).toEqual([{ level: 1, to: 'next' }]);
    expect(m[3].beams).toEqual([]);
    expect(barMarks(grid('e e e e h'), 0).map((x) => x.beams.length)).toEqual([1, 1, 1, 0, 0]);
    // An eighth alone on its beat keeps its flag.
    expect(barMarks(grid('q. e h'), 0).map((x) => x.beamed)).toEqual([false, false, false]);
  });

  it('gives sixteenths a second beam, and the sixteenth after a dotted eighth a stub', () => {
    const m = barMarks(grid('>e s s q >e e q'), 0);
    expect(m[0].beams).toEqual([{ level: 1, to: 'next' }]);
    expect(m[1].beams).toEqual([{ level: 1, to: 'next' }, { level: 2, to: 'next' }]);
    const dotted = barMarks(grid('e. s e. s h'), 0);
    expect(dotted[1].beams).toEqual([{ level: 2, to: 'stub-left' }]);
  });

  it('draws a tie as a second note head tied from the note before', () => {
    const g = grid('q. e ~e e q');
    const m = barMarks(g, 0);
    // The tied eighth has its own head, a tie from the eighth before it (one step back), and is beamed with the next eighth.
    expect(m[2].tie).toEqual({ from: 'prev', prevCols: 1 });
    expect(m[2].beamed).toBe(true);
    // Across a barline: the tie leaves the last note of bar 1 and arrives at the first of bar 2.
    const across = grid('h q q | ~q q h');
    expect(barMarks(across, 0)[2].tieOut).toBe(true);
    expect(barMarks(across, 1)[0].tie).toEqual({ from: 'barline' });
  });

  it('marks triplets per bar, the same way in every bar', () => {
    const g = grid('qt et et qt qt et et qt | qt et et qt qt et et qt');
    const bars = [0, 1].map((b) => barMarks(g, b).map((x) => (x.tuplet ? `${x.tuplet.number}${x.tuplet.bracket ? '[]' : ''}:${x.tuplet.spanCols}` : '-')));
    expect(bars[0]).toEqual(bars[1]);
    // A quarter and an eighth of a triplet make a group; the next eighth and quarter another.
    expect(bars[0]).toEqual(['3[]:2', '-', '3[]:1', '-', '3[]:2', '-', '3[]:1', '-']);
    // Three beamed eighth triplets: the number alone, no bracket.
    expect(barMarks(grid('et et et q h'), 0).map((x) => x.tuplet && `${x.tuplet.number}${x.tuplet.bracket ? '[]' : ''}`)).toEqual(['3', undefined, undefined, undefined, undefined]);
  });
});
