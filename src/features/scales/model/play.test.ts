import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING, tuning } from '@/core/guitar';
import { parseSixTab } from '@/core/song';
import { SCALES, chroma, getKey, getScale, parseKey, scaleNotes, simplestTonic, spellInKey } from '@/core/theory';
import { shapesFor, systemsFor } from './neck';
import { BAR_TICKS, PPQ, buildLine, exerciseChoices, fillBars, lineTab, staffKey, tabPosition, timeLine, type NotesPerBeat } from './play';

const box1 = () => shapesFor('A', 'minor-pentatonic', 'box', { lastFret: 15 })[0];

describe('lines', () => {
  it('plays a shape up and back down without repeating the top note', () => {
    const shape = box1();
    const line = buildLine(shape, 'shape', 'up-down');
    expect(line).toHaveLength(shape.notes.length * 2 - 1);
    expect(line[0]).toEqual(line[line.length - 1]);
    expect(line.map((n) => n.midi).slice(0, shape.notes.length)).toEqual(shape.notes.map((n) => n.midi));
    expect(buildLine(shape, 'shape', 'down')[0].midi).toBe(Math.max(...shape.notes.map((n) => n.midi)));
  });

  it('plays one octave root to root', () => {
    const line = buildLine(box1(), 'octave', 'up');
    expect(line.map((n) => n.note)).toEqual(['A', 'C', 'D', 'E', 'G', 'A']);
    expect(line[5].midi - line[0].midi).toBe(12);
  });

  it('plays a practice sequence from the guitar engine', () => {
    const line = buildLine(box1(), 'sequence', 'up', 'groups-3');
    expect(line.slice(0, 6).map((n) => n.note)).toEqual(['A', 'C', 'D', 'C', 'D', 'E']);
    expect(exerciseChoices(box1()).map((s) => s.id)).toContain('thirds');
    expect(exerciseChoices(box1()).map((s) => s.id)).not.toContain('ascending');
  });
});

describe('timing', () => {
  it('puts notes on the grid', () => {
    const line = buildLine(box1(), 'shape', 'up');
    const t = timeLine(line, 2);
    expect(t.events.map((e) => e.tick).slice(0, 4)).toEqual([0, 480, 960, 1440]);
    expect(t.lineTicks).toBe(line.length * 480);
    expect(t.loopTicks % BAR_TICKS).toBe(0);
    // At least a beat of breath before a loop starts again.
    expect(t.loopTicks - t.lineTicks).toBeGreaterThanOrEqual(PPQ);
  });

  it('swings off-beat eighths onto the triplet grid', () => {
    const t = timeLine(buildLine(box1(), 'shape', 'up'), 2, true);
    expect(t.events.map((e) => e.tick).slice(0, 4)).toEqual([0, 640, 960, 1600]);
  });

  it('repeats the line through a backing loop, each pass on a bar line that divides the form', () => {
    const line = buildLine(box1(), 'shape', 'up'); // 12 eighths + a beat of breath = 2 bars
    const t = timeLine(line, 2);
    expect(t.bars).toBe(2);
    const twelve = fillBars(t, 12);
    expect(twelve).toHaveLength(line.length * 6);
    expect(twelve.filter((e) => e.index === 0).map((e) => e.tick / BAR_TICKS)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(Math.max(...twelve.map((e) => e.tick))).toBeLessThan(12 * BAR_TICKS);
    // A 5-bar line in a 12-bar form: two passes, on bars 1 and 7.
    const five = { ...t, bars: 5 };
    expect(fillBars(five, 12).filter((e) => e.index === 0).map((e) => e.tick / BAR_TICKS)).toEqual([0, 6]);
    // A loop no longer than the line: once.
    expect(fillBars(t, 2)).toHaveLength(line.length);
  });

  it('handles triplets and sixteenths', () => {
    expect(timeLine(buildLine(box1(), 'shape', 'up'), 3).events[3].tick).toBe(960);
    expect(timeLine(buildLine(box1(), 'shape', 'up'), 4).events[4].tick).toBe(960);
  });
});

describe('tab', () => {
  it('writes valid SixTab whose pitches are the line’s, for every scale, rhythm and capo', () => {
    let checked = 0;
    for (const s of SCALES) {
      const system = systemsFor(s.id)[0];
      for (const capo of [0, 3]) {
        const shape = shapesFor('G', s.id, system, { lastFret: 15, capo })[0];
        if (!shape) continue;
        const line = buildLine(shape, 'shape', 'up-down');
        for (const perBeat of [1, 2, 3, 4] as NotesPerBeat[]) {
          const text = lineTab(line, perBeat, { tuning: STANDARD_TUNING, capo, tempo: 80 });
          const r = parseSixTab(text);
          expect(r.errors, `${s.id} ${perBeat} capo ${capo}\n${text}`).toEqual([]);
          const midis = r.song!.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes.map((n) => n.midi)));
          expect(midis).toEqual(line.map((n) => n.midi));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(SCALES.length * 4);
  });

  it('writes fingers and works in other tunings', () => {
    const shape = shapesFor('D', 'major', 'position', { lastFret: 15, tuning: 'dadgad' })[0];
    const line = buildLine(shape, 'shape', 'up');
    const text = lineTab(line, 2, { tuning: tuning('dadgad') });
    expect(parseSixTab(text).errors).toEqual([]);
    expect(lineTab(buildLine(box1(), 'shape', 'up'), 2, { tuning: STANDARD_TUNING })).toContain('6:5{1}');
  });

  it('names the key the staff under the tab is spelled in (Settings > "Tab and notation")', () => {
    const key = (tonic: string, id: string) => staffKey(tonic, getScale(id)!);
    expect(key('A', 'minor-pentatonic')).toBe('A minor');
    expect(key('E', 'phrygian')).toBe('E minor');
    expect(key('Bb', 'major-pentatonic')).toBe('Bb major');
    expect(key('F', 'lydian')).toBe('F major');
    expect(key('G', 'mixolydian')).toBe('G major');
    // Every scale gets a key the song parser understands, on every tonic spelling.
    for (const s of SCALES) for (const tonic of ['C', 'F#', 'Eb']) expect(parseKey(staffKey(tonic, s))).not.toBeNull();
    const text = lineTab(buildLine(box1(), 'shape', 'up'), 2, { tuning: STANDARD_TUNING, key: 'A minor' });
    const parsed = parseSixTab(text);
    expect(parsed.errors).toEqual([]);
    expect(text).toMatch(/^key: A minor$/m);
    expect(lineTab(buildLine(box1(), 'shape', 'up'), 2, { tuning: STANDARD_TUNING })).not.toMatch(/^key:/m);
  });

  it('spells every staff note the way the scale does, not the way its tonic key would', () => {
    const key = (tonic: string, id: string) => staffKey(tonic, getScale(id)!);
    const misspelt = (tonic: string, id: string) => {
      const k = key(tonic, id);
      return scaleNotes(tonic, id).filter((n) => spellInKey(chroma(n), k) !== n);
    };
    // C locrian has G♭ (C minor would write F♯): its parent key D♭ major spells all seven.
    expect(key('C', 'locrian')).toBe('Db major');
    expect(misspelt('C', 'locrian')).toEqual([]);
    // The blue note of A blues is E♭ (A minor would write D♯); the staff keeps the empty signature.
    expect(misspelt('A', 'blues')).toEqual([]);
    expect(getKey(key('A', 'blues'))?.signature.count).toBe(0);
    // Every everyday scale, on all twelve tonics: no note is respelled.
    const everyday = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'major-pentatonic', 'minor-pentatonic', 'blues', 'harmonic-minor', 'melodic-minor'];
    for (const id of everyday) {
      for (let pc = 0; pc < 12; pc++) {
        const tonic = simplestTonic(pc, id);
        expect(misspelt(tonic, id), `${tonic} ${id} in ${key(tonic, id)}`).toEqual([]);
      }
    }
  });

  it('finds a note’s place in the tab', () => {
    expect(tabPosition(0, 2)).toEqual({ bar: 0, tick: 0 });
    expect(tabPosition(9, 2)).toEqual({ bar: 1, tick: 480 });
    expect(tabPosition(13, 3)).toEqual({ bar: 1, tick: 320 });
  });
});
