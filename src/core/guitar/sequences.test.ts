import { describe, expect, it } from 'vitest';
import { SEQUENCES, practiceSequence, scalePatterns, sequenceMidi, sequencesFor, type SequenceKind } from './index';

const box = scalePatterns('A', 'minor-pentatonic')[0];
const caged = scalePatterns('C', 'major').find((p) => p.shape === 'E')!;
/** Index of each note within its pattern, so sequences read as scale-step numbers. */
const steps = (pattern: typeof box, kind: SequenceKind, direction?: 'up' | 'down' | 'up-down') =>
  practiceSequence(pattern, kind, { direction }).map((n) => pattern.notes.indexOf(n));

describe('practice sequences', () => {
  it('walks a pattern up, down and both ways', () => {
    expect(steps(box, 'ascending')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(steps(box, 'descending')).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(steps(box, 'up-down')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(steps(box, 'down-up')).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(practiceSequence(box)).toEqual(box.notes);
    const midi = sequenceMidi(practiceSequence(box, 'ascending'));
    expect(midi).toEqual([45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72]);
  });

  it('plays in thirds, fourths, fifths and sixths', () => {
    expect(steps(caged, 'thirds').slice(0, 8)).toEqual([0, 2, 1, 3, 2, 4, 3, 5]);
    expect(steps(caged, 'fourths').slice(0, 6)).toEqual([0, 3, 1, 4, 2, 5]);
    expect(steps(caged, 'fifths').slice(0, 4)).toEqual([0, 4, 1, 5]);
    expect(steps(caged, 'sixths').slice(0, 4)).toEqual([0, 5, 1, 6]);
    const n = caged.notes.length;
    expect(steps(caged, 'thirds')).toHaveLength(2 * (n - 2));
    expect(steps(caged, 'thirds', 'down').slice(0, 6)).toEqual([n - 1, n - 3, n - 2, n - 4, n - 3, n - 5]);
    expect(steps(caged, 'thirds', 'up-down')).toHaveLength(4 * (n - 2));
    // In a seven-note scale "in thirds" really is thirds: three or four semitones every time.
    const thirds = practiceSequence(caged, 'thirds');
    for (let i = 0; i < thirds.length; i += 2) expect([3, 4]).toContain(thirds[i + 1].midi - thirds[i].midi);
    const fourths = practiceSequence(caged, 'fourths');
    for (let i = 0; i < fourths.length; i += 2) expect([5, 6]).toContain(fourths[i + 1].midi - fourths[i].midi);
  });

  it('plays groups of three and four and stacked thirds', () => {
    expect(steps(caged, 'groups-3').slice(0, 9)).toEqual([0, 1, 2, 1, 2, 3, 2, 3, 4]);
    expect(steps(caged, 'groups-4').slice(0, 8)).toEqual([0, 1, 2, 3, 1, 2, 3, 4]);
    expect(steps(caged, 'triads').slice(0, 6)).toEqual([0, 2, 4, 1, 3, 5]);
    const n = caged.notes.length;
    expect(steps(caged, 'groups-3')).toHaveLength(3 * (n - 2));
    expect(steps(caged, 'groups-4')).toHaveLength(4 * (n - 3));
    expect(steps(caged, 'groups-3', 'down').slice(0, 6)).toEqual([n - 1, n - 2, n - 3, n - 2, n - 3, n - 4]);
    expect(steps(caged, 'groups-4', 'up-down')).toHaveLength(8 * (n - 3));
  });

  it('skips strings', () => {
    const walk = practiceSequence(box, 'string-skip');
    const strings = walk.filter((_n, i) => i % 2 === 0).map((n) => n.string);
    expect(strings).toEqual([6, 4, 5, 3, 4, 2, 3, 1]);
    expect(walk).toHaveLength(16);
    // Every note of the box is visited, and the walk ends on the top string.
    expect(new Set(walk).size).toBe(box.notes.length);
    expect(walk[walk.length - 1].string).toBe(1);
    const down = practiceSequence(box, 'string-skip', { direction: 'down' });
    expect(down[0].string).toBe(1);
    expect(down).toHaveLength(16);
    expect(practiceSequence(box, 'string-skip', { direction: 'up-down' })).toHaveLength(31);
    // Three strings: skip, then come back for the middle one.
    const three = box.notes.filter((n) => n.string >= 4);
    expect(practiceSequence(three, 'string-skip').filter((_n, i) => i % 2 === 0).map((n) => n.string)).toEqual([6, 4, 5]);
  });

  it('falls back to the plain run when the pattern is too small', () => {
    const oneString = scalePatterns('C', 'major', { system: 'single-string' })[0];
    expect(practiceSequence(oneString, 'string-skip')).toEqual(oneString.notes);
    const tiny = box.notes.slice(0, 2);
    expect(practiceSequence(tiny, 'groups-4')).toEqual(tiny);
    expect(practiceSequence(tiny, 'groups-4', { direction: 'down' })).toEqual([...tiny].reverse());
    expect(practiceSequence(tiny, 'thirds')).toEqual(tiny);
    expect(practiceSequence([], 'ascending')).toEqual([]);
  });

  it('only ever returns notes of the pattern, for every sequence and direction', () => {
    for (const info of SEQUENCES) {
      for (const direction of ['up', 'down', 'up-down'] as const) {
        const seq = practiceSequence(caged, info.id, { direction });
        expect(seq.length, info.id).toBeGreaterThanOrEqual(caged.notes.length);
        expect(seq.every((n) => caged.notes.includes(n)), info.id).toBe(true);
        expect(new Set(seq).size, info.id).toBe(caged.notes.length);
      }
    }
  });

  it('describes the sequences and says which ones fit a pattern', () => {
    expect(new Set(SEQUENCES.map((s) => s.id)).size).toBe(SEQUENCES.length);
    expect(SEQUENCES.every((s) => s.name && s.description.length > 10 && s.example)).toBe(true);
    expect(sequencesFor(box).map((s) => s.id)).toContain('string-skip');
    const oneString = scalePatterns('C', 'major', { system: 'single-string' })[0];
    expect(sequencesFor(oneString).map((s) => s.id)).not.toContain('string-skip');
    expect(sequencesFor(box.notes.slice(0, 3)).map((s) => s.id)).toEqual(['ascending', 'descending', 'up-down', 'down-up']);
  });
});
