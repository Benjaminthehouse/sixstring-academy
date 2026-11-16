import { describe, expect, it } from 'vitest';
import { chordVoicings, tuning as tuningFor } from '@/core/guitar';
import { parseCameraParams } from '@/features/camera/model/address';
import { chordVoicingsFor, MAX_FRET } from '@/features/camera/model/content';
import { CAMERA_MAX_FRET, cameraChordParams } from './camera';
import { chordsOfType } from './catalog';
import { voicingSet } from './voicings';
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

  it('opens on the first shape when none is on screen, and not at all for a slash chord', () => {
    expect(cameraChordParams('G', [3, 2, 0, 0, 0, 3])).toEqual(['chord', 'g-major']);
    expect(cameraChordParams('G', null)).toEqual(['chord', 'g-major']);
    expect(cameraChordParams('C/E', [0, 3, 2, 0, 1, 0])).toBeNull();
  });

  // Review: about one shape in sixteen on the chord pages (partial shapes, shapes past fret 15) is
  // not in the camera's list, and the link used to open the open shape at the other end of the neck.
  it('opens on the camera shape nearest to one it does not list', () => {
    const standard = tuningFor('standard');
    const at = (frets: ReadonlyArray<number | null>) => {
      const f = frets.filter((x): x is number => x !== null && x > 0);
      return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
    };
    const opened = (symbol: string, frets: Array<number | null>) => {
      const params = cameraChordParams(symbol, frets, standard)!;
      const content = parseCameraParams(params);
      return content && content.kind === 'chord' ? chordVoicingsFor(symbol, { tuning: standard, capo: 0 })[content.voicing].frets : null;
    };
    // The partial G (bass strings of the open G) opens on the open G.
    expect(opened('G', [3, 2, 0, null, null, null])).toEqual([3, 2, 0, 0, 0, 3]);
    // A C up at the 8th fret opens on a C around the 8th fret, not the open C.
    const c8 = opened('C', [8, 7, 5, null, null, null])!;
    expect(Math.abs(at(c8) - at([8, 7, 5, null, null, null]))).toBeLessThanOrEqual(3);
    // A G past the camera's 15th fret opens high on the neck.
    expect(at(opened('G', [15, 14, 12, 12, 12, 15])!)).toBeGreaterThanOrEqual(9);
    // Every shape these chord pages show opens on a camera shape at most 5 frets away (the open shape
    // was up to 12 away). The camera lists no C between x-15-14-12-13-12 and fret 9.
    for (const symbol of ['C', 'D', 'E', 'F', 'G', 'A', 'Am', 'Em', 'Dm', 'C7', 'G7', 'Bm7']) {
      for (const v of voicingSet(symbol, 'standard').all) {
        const f = opened(symbol, [...v.frets]);
        expect(f, `${symbol} ${v.frets.join(',')}`).not.toBeNull();
        expect(Math.abs(at(f!) - at(v.frets)), `${symbol} ${v.frets.join(',')} -> ${f!.join(',')}`).toBeLessThanOrEqual(5);
      }
    }
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
