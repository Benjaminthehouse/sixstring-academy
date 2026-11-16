import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from '@/app/router';
import { PATTERN_SYSTEMS, STANDARD_TUNING, scalePatterns } from '@/core/guitar';
import { SCALES } from '@/core/theory';
import { parseCameraParams, type ScaleContent } from '../../camera/model/address';
import { scaleNotes } from '../../camera/model/content';
import { shapesFor, systemsFor } from './neck';
import { DEFAULT_ADDRESS, arcadeParams, cameraParams, isShapeId, parseScaleParams, practiceEntry, scaleParams, shapeSkillId, systemOfShape } from './address';
import { rootChoices } from './catalog';

describe('scale addresses', () => {
  it('reads root and scale as two params', () => {
    expect(parseScaleParams(['a', 'minor-pentatonic'])).toEqual({ tonic: 'A', scale: 'minor-pentatonic', shape: null });
    expect(parseScaleParams(['f-sharp', 'dorian'])).toEqual({ tonic: 'F#', scale: 'dorian', shape: null });
    expect(parseScaleParams(['bb', 'major'])).toEqual({ tonic: 'Bb', scale: 'major', shape: null });
  });

  it('reads a shape after the scale', () => {
    expect(parseScaleParams(['a', 'minor-pentatonic', 'box-2'])).toEqual({ tonic: 'A', scale: 'minor-pentatonic', shape: 'box-2' });
    expect(parseScaleParams(['g', 'major', 'caged-e'])?.shape).toBe('caged-e');
    expect(parseScaleParams(['g', 'major', '3nps-4'])?.shape).toBe('3nps-4');
  });

  it('accepts the theory engine’s one-piece scale slug', () => {
    expect(parseScaleParams(['a-minor-pentatonic'])).toEqual({ tonic: 'A', scale: 'minor-pentatonic', shape: null });
    expect(parseScaleParams(['a-minor-pentatonic', 'box-2'])).toEqual({ tonic: 'A', scale: 'minor-pentatonic', shape: 'box-2' });
    expect(parseScaleParams(['f-sharp-lydian-sharp-2'])).toEqual({ tonic: 'F#', scale: 'lydian-sharp-2', shape: null });
  });

  it('ignores a shape it does not recognise, and rejects addresses that name no scale', () => {
    expect(parseScaleParams(['a', 'minor-pentatonic', 'nonsense'])?.shape).toBeNull();
    expect(parseScaleParams([])).toBeNull();
    expect(parseScaleParams(['h', 'major'])).toBeNull();
    expect(parseScaleParams(['a', 'not-a-scale'])).toBeNull();
    expect(parseScaleParams(['natural-minor'])).toBeNull();
  });

  it('writes canonical params', () => {
    expect(scaleParams({ tonic: 'A', scale: 'minor-pentatonic', shape: 'box-2' })).toEqual(['a', 'minor-pentatonic', 'box-2']);
    expect(scaleParams({ tonic: 'C#', scale: 'major', shape: null })).toEqual(['c-sharp', 'major']);
    expect(formatHash('scales', ...scaleParams({ tonic: 'Eb', scale: 'dorian', shape: 'caged-a' }))).toBe('#scales--eb--dorian--caged-a');
  });

  it('round-trips every scale in every key through the router', () => {
    for (const s of SCALES) {
      for (const root of rootChoices(s.id)) {
        const address = { tonic: root.tonic, scale: s.id, shape: 'box-3' };
        const hash = formatHash('scales', ...scaleParams(address));
        const route = parseHash(hash);
        expect(route.name).toBe('scales');
        expect(parseScaleParams(route.params)).toEqual(address);
      }
    }
  });

  it('has a default that is a real scale', () => {
    expect(parseScaleParams(scaleParams(DEFAULT_ADDRESS))).toEqual(DEFAULT_ADDRESS);
  });
});

describe('shape ids', () => {
  it('recognises every pattern id the guitar engine makes, and knows its system', () => {
    for (const scale of ['major', 'minor-pentatonic', 'minor-blues', 'bebop-dominant', 'whole-tone']) {
      for (const system of PATTERN_SYSTEMS) {
        for (const p of scalePatterns('A', scale, { system, allOctaves: true })) {
          expect(isShapeId(p.id), p.id).toBe(true);
          expect(systemOfShape(p.id), p.id).toBe(system);
        }
      }
    }
  });

  it('makes skill ids by the progress conventions, which the pentatonic-box achievements recognise', () => {
    const id = shapeSkillId('A', 'minor-pentatonic', 'box-1');
    expect(id).toBe('scale:a-minor-pentatonic:box-1');
    expect(/^scale:([^:]*pentatonic[^:]*):box-([1-5])$/.test(id)).toBe(true);
    expect(shapeSkillId('F#', 'major', 'caged-e')).toBe('scale:f-sharp-major:caged-e');
  });

  it('logs 20 s or more of playing against the shape played last, and nothing shorter', () => {
    const played = { address: { tonic: 'F#', scale: 'dorian', shape: 'caged-e' }, title: 'F♯ Dorian, E shape' };
    expect(practiceEntry(played, 95.4)).toEqual({ kind: 'scale-practice', id: 'scale:f-sharp-dorian:caged-e', durationSec: 95, title: 'F♯ Dorian, E shape', route: 'scales', params: ['f-sharp', 'dorian', 'caged-e'] });
    expect(practiceEntry(played, 19.4)).toBeNull();
    expect(practiceEntry(played, Number.NaN)).toBeNull();
    expect(practiceEntry(null, 300)).toBeNull();
    expect(practiceEntry({ ...played, address: { ...played.address, shape: null } }, 300)).toBeNull();
  });

  it('links to the Live Fretboard with the same scale and shape ("See it on your guitar")', () => {
    expect(cameraParams('A', 'minor-pentatonic', 'box-1')).toEqual(['scale', 'a', 'minor-pentatonic', 'box-1']);
    expect(formatHash('camera', ...cameraParams('F#', 'dorian', '3nps-4-8va'))).toBe('#camera--scale--f-sharp--dorian--3nps-4');
    expect(cameraParams('Bb', 'major', null)).toEqual(['scale', 'bb', 'major', 'all']);
    // The camera reads back exactly what the scales screen shows, for every scale, key and first-octave shape.
    for (const s of SCALES) {
      for (const root of rootChoices(s.id)) {
        const route = parseHash(formatHash('camera', ...cameraParams(root.tonic, s.id, null)));
        expect(parseCameraParams(route.params), `${root.tonic} ${s.id}`).toEqual({ kind: 'scale', tonic: root.tonic, scale: s.id, shape: 'all' });
      }
    }
    for (const scale of ['major', 'minor-pentatonic', 'dorian', 'harmonic-minor']) {
      for (const system of PATTERN_SYSTEMS) {
        for (const p of scalePatterns('E', scale, { system, allOctaves: true })) {
          const route = parseHash(formatHash('camera', ...cameraParams('E', scale, p.id)));
          expect(parseCameraParams(route.params), p.id).toEqual({ kind: 'scale', tonic: 'E', scale, shape: p.id.replace(/-8va$/, '') });
        }
      }
    }
  });

  it('and the Live Fretboard then shows that very shape, on the frets this screen draws it (every system, not only the usual one)', () => {
    // Review: the camera used to build only the scale's usual system, so `#camera--scale--c--major--3nps-4`
    // showed the C shape, and boxes 4 and 5 of a pentatonic sat in open position while this screen
    // draws them up the neck. Checked at the default 15-fret neck (the camera shows up to fret 15).
    const key = (n: { string: number; fret: number }) => `${n.string}:${n.fret}`;
    let checked = 0;
    for (const s of SCALES) {
      for (const tonic of ['E', 'C', 'Bb']) {
        for (const system of systemsFor(s.id)) {
          for (const shape of shapesFor(tonic, s.id, system, { lastFret: 15 })) {
            const content = parseCameraParams(parseHash(formatHash('camera', ...cameraParams(tonic, s.id, shape.id))).params);
            expect(content?.kind, `${tonic} ${s.id} ${shape.id}`).toBe('scale');
            const shown = scaleNotes(content as ScaleContent, { tuning: STANDARD_TUNING, capo: 0 });
            expect(shown.shape.id, `${tonic} ${s.id} ${shape.id}`).toBe(shape.id);
            expect(shown.notes.map(key).sort(), `${tonic} ${s.id} ${shape.id}`).toEqual(shape.notes.map(key).sort());
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('hands the Arcade a game, the scale slug and the shape', () => {
    expect(arcadeParams('run-the-scale', 'A', 'minor-pentatonic', 'box-2')).toEqual(['run-the-scale', 'a-minor-pentatonic', 'box-2']);
    expect(arcadeParams('note-hunt', 'Bb', 'major', null)).toEqual(['note-hunt', 'bb-major']);
    expect(formatHash('arcade', ...arcadeParams('shape-builder', 'F#', 'dorian', 'caged-e'))).toBe('#arcade--shape-builder--f-sharp-dorian--caged-e');
  });
});
