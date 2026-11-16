import { describe, expect, it } from 'vitest';
import type { GrayImage } from '@/core/omr/image/gray';
import { MIN_CONTRAST, levelledCrop } from './levels';

/** A grey picture: `paper` everywhere, a block of `ink` in the middle of the box at (10, 10, 20, 12). */
function picture(paper: number, ink: number): GrayImage {
  const width = 60;
  const height = 40;
  const data = new Uint8Array(width * height).fill(paper);
  for (let y = 14; y < 18; y++) for (let x = 16; x < 24; x++) data[y * width + x] = ink;
  return { width, height, data };
}

describe('levelledCrop', () => {
  it('turns a photo\'s grey paper white and its grey ink black', () => {
    const crop = levelledCrop(picture(196, 104), { x: 10, y: 10, w: 20, h: 12 });
    expect(crop).toMatchObject({ x: 10, y: 10, width: 20, height: 12, ink: 104, paper: 196 });
    // Paper (top-left corner of the box) is white, ink (the block) is black.
    expect(crop.data[0]).toBe(255);
    expect(crop.data[(14 - 10) * 20 + (16 - 10)]).toBe(0);
  });

  it('leaves a clean page as it is', () => {
    const src = picture(255, 0);
    const crop = levelledCrop(src, { x: 10, y: 10, w: 20, h: 12 });
    for (let r = 0; r < 12; r++) for (let c = 0; c < 20; c++) expect(crop.data[r * 20 + c]).toBe(src.data[(10 + r) * 60 + 10 + c]);
  });

  it('leaves blank paper alone (no ink to stretch: noise is not turned into marks)', () => {
    const src = picture(200, 200 - MIN_CONTRAST + 4);
    const crop = levelledCrop(src, { x: 10, y: 10, w: 20, h: 12 });
    expect(crop.ink).toBe(crop.paper);
    expect(Math.min(...crop.data)).toBeGreaterThan(150);
  });

  it('clips the box to the picture and copies, never changing the picture', () => {
    const src = picture(190, 90);
    const before = src.data.slice();
    const crop = levelledCrop(src, { x: -5.5, y: 30.2, w: 20, h: 20 });
    expect(crop).toMatchObject({ x: 0, y: 30, width: 15, height: 10 });
    expect(src.data).toEqual(before);
    expect(levelledCrop(src, { x: 70, y: 0, w: 5, h: 5 }).data.length).toBe(0);
  });
});
