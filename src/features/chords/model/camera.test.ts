import { describe, expect, it } from 'vitest';
import { chordVoicings, tuning as tuningFor } from '@/core/guitar';
import { parseCameraParams } from '@/features/camera/model/address';
import { chordVoicingsFor, MAX_FRET } from '@/features/camera/model/content';
import { CAMERA_MAX_FRET, cameraChordParams } from './camera';
import { chordsOfType } from './catalog';
import { CHORD_TYPES } from '@/core/theory';

const SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('See it on your guitar', () => {
  it('uses the camera’s own fret limit', () => {
    expect(CAMERA_MAX_FRET).toBe(MAX_FRET);
  });

  it('opens the camera on the same chord and the same shape', () => {
    const standard = tuningFor('standard');
    for (const symbol of ['G', 'Em', 'F', 'Bm', 'C7', 'Am7', 'F#m7b5', 'Dsus4', 'Cadd9']) {
      const shapes = chordVoicings(symbol, { tuning: standard, maxFret: CAMERA_MAX_FRET });
      for (const n of [0, 1, Math.min(4, shapes.length - 1)]) {
        const params = cameraChordParams(symbol, shapes[n].frets, standard);
        expect(params, symbol).not.toBeNull();
        for (const p of params!) expect(p).toMatch(SAFE);
        const content = parseCameraParams(params!);
        expect(content, params!.join('--')).toEqual({ kind: 'chord', symbol, voicing: n });
        // The camera draws exactly the shape the chord page showed.
        expect(chordVoicingsFor(symbol, { tuning: standard, capo: 0 })[n].frets).toEqual(shapes[n].frets);
      }
    }
  });

  it('follows the learner’s tuning', () => {
    const dropD = tuningFor('drop-d');
    const shapes = chordVoicings('D', { tuning: dropD, maxFret: CAMERA_MAX_FRET });
    const params = cameraChordParams('D', shapes[2].frets, dropD)!;
    expect(parseCameraParams(params)).toEqual({ kind: 'chord', symbol: 'D', voicing: 2 });
  });

  it('opens on the first shape when the camera does not list the one on screen, and not at all for a slash chord', () => {
    expect(cameraChordParams('G', [3, 2, 0, 0, 0, 3])).toEqual(['chord', 'g-major']);
    expect(cameraChordParams('G', [null, null, null, null, null, 15])).toEqual(['chord', 'g-major']);
    expect(cameraChordParams('G', null)).toEqual(['chord', 'g-major']);
    expect(cameraChordParams('C/E', [0, 3, 2, 0, 1, 0])).toBeNull();
  });

  it('gives every catalog chord an address the camera reads', () => {
    for (const t of CHORD_TYPES) {
      for (const s of chordsOfType(t)) {
        const params = cameraChordParams(s, null);
        if (!params) continue;
        expect(parseCameraParams(params), s).toEqual({ kind: 'chord', symbol: s, voicing: 0 });
      }
    }
  });
});
