import { describe, expect, it } from 'vitest';
import { applyHomography, markerHintPlanePoints, neckModel, renumberPose, makePose } from '../geometry';
import type { Frame, Mat3 } from '../types';
import { hueSaturation, resolveMarkers } from './markers';

/** A grey frame with two saturated squares where the stickers of `frets` are under H. */
function frameWithStickers(H: Mat3, frets: number[], rgb: [number, number, number]): Frame {
  const width = 640;
  const height = 360;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 90;
    data[i * 4 + 1] = 84;
    data[i * 4 + 2] = 80;
    data[i * 4 + 3] = 255;
  }
  const model = neckModel('steel');
  for (const p of markerHintPlanePoints(model, { frets })) {
    const at = applyHomography(H, p.x, p.y);
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = Math.round(at.x) + dx;
        const y = Math.round(at.y) + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        data.set(rgb, (y * width + x) * 4);
      }
    }
  }
  return { data, width, height };
}

describe('marker mode', () => {
  // A fronto-parallel view: nut on the right, 1.2 px per mm.
  const H: Mat3 = [-1.2, 0, 600, 0, 1.2, 150, 0, 0, 1];
  const model = neckModel('steel');

  it('measures hue and saturation', () => {
    expect(hueSaturation(255, 0, 0)).toEqual({ hue: 0, saturation: 1 });
    expect(hueSaturation(0, 255, 0).hue).toBeCloseTo(120, 6);
    expect(hueSaturation(40, 240, 90).hue).toBeGreaterThan(120);
    expect(hueSaturation(128, 128, 128).saturation).toBe(0);
  });

  it('leaves a correctly numbered pose alone', () => {
    const frame = frameWithStickers(H, [3, 9], [40, 240, 90]);
    const found = resolveMarkers(frame, H, model, { frets: [3, 9], hue: 135 });
    expect(found).not.toBeNull();
    expect(found!.delta).toBe(0);
    expect(found!.score).toBeGreaterThan(0.6);
  });

  it('finds the shift of a pose that calls every wire four frets too low', () => {
    const frame = frameWithStickers(H, [5, 12], [255, 50, 210]);
    const wrong = renumberPose(makePose(H, model, 640, 360), -4);
    for (const hue of [315, undefined]) {
      const found = resolveMarkers(frame, wrong.H, model, { frets: [5, 12], hue });
      expect(found, `hue ${hue}`).not.toBeNull();
      expect(found!.delta).toBe(4);
    }
  });

  it('declines when there are no stickers or the hue is another', () => {
    const plain = frameWithStickers(H, [], [0, 0, 0]);
    expect(resolveMarkers(plain, H, model, { frets: [3, 9], hue: 135 })).toBeNull();
    const magenta = frameWithStickers(H, [3, 9], [255, 50, 210]);
    expect(resolveMarkers(magenta, H, model, { frets: [3, 9], hue: 135 })).toBeNull();
  });
});
