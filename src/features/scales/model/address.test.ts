import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from '@/app/router';
import { PATTERN_SYSTEMS, scalePatterns } from '@/core/guitar';
import { SCALES } from '@/core/theory';
import { DEFAULT_ADDRESS, arcadeParams, isShapeId, parseScaleParams, scaleParams, shapeSkillId, systemOfShape } from './address';
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

  it('hands the Arcade a game, the scale slug and the shape', () => {
    expect(arcadeParams('run-the-scale', 'A', 'minor-pentatonic', 'box-2')).toEqual(['run-the-scale', 'a-minor-pentatonic', 'box-2']);
    expect(arcadeParams('note-hunt', 'Bb', 'major', null)).toEqual(['note-hunt', 'bb-major']);
    expect(formatHash('arcade', ...arcadeParams('shape-builder', 'F#', 'dorian', 'caged-e'))).toBe('#arcade--shape-builder--f-sharp-dorian--caged-e');
  });
});
