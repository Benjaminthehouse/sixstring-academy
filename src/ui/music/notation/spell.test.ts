import { describe, expect, it } from 'vitest';
import { isBluesLine, spellLine, type SpellEvent } from './spell';

/** A melody of single pitches in one key, optionally with a chord per note. */
const line = (key: string, midi: number[], chords?: Array<string | null>): SpellEvent[] => midi.map((m, i) => ({ midi: [m], key, chord: chords?.[i] ?? null }));
const names = (events: SpellEvent[], spellings?: string[]) => spellLine(events, { spellings }).map((n) => n.join(' '));

describe('spellLine', () => {
  it('spells notes of the key as the key does', () => {
    expect(names(line('E', [52, 54, 56, 57, 59, 61, 63, 64]))).toEqual(['E3', 'F#3', 'G#3', 'A3', 'B3', 'C#4', 'D#4', 'E4']);
    expect(names(line('F', [58, 57]))).toEqual(['Bb3', 'A3']);
    // Minor keys own their raised sixth and seventh.
    expect(names(line('A minor', [66, 68, 69]))).toEqual(['F#4', 'G#4', 'A4']);
  });

  it('writes the blue note in E as B flat, also when it slides up to B (the theory lesson says so)', () => {
    // E G A Bb B D: the E blues scale up and down.
    const scale = [52, 55, 57, 58, 59, 62, 64];
    expect(names(line('E', scale))).toEqual(['E3', 'G3', 'A3', 'Bb3', 'B3', 'D4', 'E4']);
    expect(names(line('E', [...scale].reverse()))).toEqual(['E4', 'D4', 'B3', 'Bb3', 'A3', 'G3', 'E3']);
    // The fingerstyle blues: Bb slides to B, then A G, over E7 and with the open E in the bass.
    const bar: SpellEvent[] = [
      { midi: [40, 58], key: 'E', chord: 'E7' },
      { midi: [59], key: 'E', chord: 'E7' },
      { midi: [40, 57], key: 'E', chord: 'E7' },
      { midi: [55], key: 'E', chord: 'E7' },
      { midi: [40, 62], key: 'E', chord: 'E7' },
    ];
    expect(spellLine(bar).map((n) => n.join(' '))).toEqual(['E2 Bb3', 'B3', 'E2 A3', 'G3', 'E2 D4']);
    // Over A minor the blues are written the same way: E A C D Eb E G.
    expect(names(line('A minor', [57, 60, 62, 63, 64, 67, 69]))).toEqual(['A3', 'C4', 'D4', 'Eb4', 'E4', 'G4', 'A4']);
  });

  it('follows the line where there is no blues: up a semitone sharp, down a semitone flat', () => {
    // C major: G G# A rises, A Ab G falls.
    expect(names(line('C', [67, 68, 69]))).toEqual(['G4', 'G#4', 'A4']);
    expect(names(line('C', [69, 68, 67]))).toEqual(['A4', 'Ab4', 'G4']);
    // E major with its leading tone: A A# B is a raised fourth, B Bb A a lowered fifth... falling.
    expect(names(line('E', [57, 58, 59, 63, 64]))).toEqual(['A3', 'A#3', 'B3', 'D#4', 'E4']);
    expect(names(line('E', [59, 58, 57, 63, 64]))).toEqual(['B3', 'Bb3', 'A3', 'D#4', 'E4']);
    // A repeated or held note looks past itself to where the line goes.
    expect(names(line('C', [68, 68, 69]))).toEqual(['G#4', 'G#4', 'A4']);
  });

  it('never invents double sharps or flats from the line', () => {
    // E major, blues third: G rises to G#. G stays G (F## would be the "raised" letter below G#).
    expect(names(line('E', [55, 56]))).toEqual(['G3', 'G#3']);
    // A white key keeps its natural name in a line: F between two F#s in G major, not E#.
    expect(names(line('G', [66, 65, 66, 67]))).toEqual(['F#4', 'F4', 'F#4', 'G4']);
  });

  it('spells chord tones as the chord in force does', () => {
    // C major: D7 (V/V) gives F#, Bb7 (bVII7) gives Ab rather than G#.
    expect(names(line('C', [66, 67], ['D7', 'G']))).toEqual(['F#4', 'G4']);
    expect(names(line('C', [68, 67], ['Bb7', 'C']))).toEqual(['Ab4', 'G4']);
    // E minor with its leading tone: the A# of F#7 on the way to B is not a blue note.
    expect(names(line('E minor', [63, 64, 58, 59], [null, null, 'F#7', 'B']))).toEqual(['D#4', 'E4', 'A#3', 'B3']);
  });

  it('lets an explicit hint win and keeps a held note as it began', () => {
    expect(names(line('C', [67, 68, 69]), ['Ab'])).toEqual(['G4', 'Ab4', 'A4']);
    // Over the key's own name too: the text's spelling is what the learner reads beside the staff.
    expect(names(line('B', [69, 70, 71]), ['Bb'])).toEqual(['A4', 'Bb4', 'B4']);
    const tied: SpellEvent[] = [
      { midi: [68], key: 'C' },
      { midi: [68], key: 'C', tied: [true] },
      { midi: [67], key: 'C' },
    ];
    expect(spellLine(tied).map((n) => n[0])).toEqual(['Ab4', 'Ab4', 'G4']);
  });

  it('knows a blues line by its minor third and seventh without a leading tone', () => {
    expect(isBluesLine(new Set([4, 7, 9, 10, 11, 2]), 4)).toBe(true);
    expect(isBluesLine(new Set([4, 7, 9, 10, 11, 2, 3]), 4)).toBe(false);
    expect(isBluesLine(new Set([4, 6, 8, 9, 11]), 4)).toBe(false);
  });
});
