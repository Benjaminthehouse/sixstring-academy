import { describe, expect, it } from 'vitest';
import { CAMPFIRE_GROOVE, sixTab } from '@/core/song';
import { createLibrary, memoryStore } from '@/core/library';
import { songChordShapes } from './chords';

const lib = createLibrary({ store: memoryStore(), broadcast: false });

describe('chord shapes of a song', () => {
  it('uses the shape written in the song', async () => {
    const shapes = songChordShapes(await lib.load('frere-jacques'));
    expect(shapes).toEqual([{ sounding: 'G', shape: 'G', frets: [null, null, 0, 0, 0, 3] }]);
  });

  it('finds a common shape for the others, in order of appearance, each once', async () => {
    const shapes = songChordShapes(await lib.load('hot-cross-buns'));
    expect(shapes.map((s) => s.sounding)).toEqual(['G', 'D']);
    expect(shapes[0].frets).toEqual([3, 2, 0, 0, 0, 3]);
    expect(shapes[1].frets).toEqual([null, null, 0, 2, 3, 2]);
    expect(songChordShapes(sixTab(CAMPFIRE_GROOVE)).map((s) => s.sounding)).toEqual(['G', 'Em', 'C', 'D']);
  });

  it('names the shape played behind a capo', () => {
    const song = sixTab`title: Capo song
tempo: 90
capo: 2
| "A" w / |`;
    const [a] = songChordShapes(song);
    expect(a.sounding).toBe('A');
    expect(a.shape).toBe('G');
    // A G shape behind the capo: the open G frets.
    expect(a.frets).toEqual([3, 2, 0, 0, 0, 3]);
  });
});
