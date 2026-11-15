import { describe, expect, it } from 'vitest';
import type { Frame } from '../types';
import { buildPyramid, ensureImage, gaussianBlur, gaussianKernel, halve, insideImage, sampleBilinear, toWorkingGray, workingSize } from './image';

function grayFrame(width: number, height: number, value: (x: number, y: number) => number): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = value(x, y);
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('working frame', () => {
  it('keeps frames near 640 wide as they are and brings the others to 640', () => {
    expect(workingSize(640, 360)).toEqual({ width: 640, height: 360, scale: 1 });
    expect(workingSize(1280, 720)).toMatchObject({ width: 640, height: 360 });
    expect(workingSize(960, 540)).toMatchObject({ width: 640, height: 360 });
    expect(workingSize(480, 270)).toMatchObject({ width: 640, height: 360 });
  });

  it('converts to Rec. 601 luminance 1:1', () => {
    const wide = grayFrame(640, 4, (x) => (x < 320 ? 40 : 200));
    // One pure-green pixel: luminance 0.587 * 255.
    wide.data[4 * 5] = 0;
    wide.data[4 * 5 + 1] = 255;
    wide.data[4 * 5 + 2] = 0;
    const { gray, scaleX } = toWorkingGray(wide);
    expect(scaleX).toBe(1);
    expect(gray.data[10]).toBeCloseTo(40, 3);
    expect(gray.data[400]).toBeCloseTo(200, 3);
    expect(gray.data[5]).toBeCloseTo(0.587 * 255, 2);
  });

  it('area-averages when shrinking: a fine checkerboard becomes flat grey', () => {
    const frame = grayFrame(1280, 720, (x, y) => ((x + y) & 1 ? 255 : 0));
    const { gray, scaleX, scaleY } = toWorkingGray(frame);
    expect(gray.width).toBe(640);
    expect(gray.height).toBe(360);
    expect(scaleX).toBeCloseTo(0.5, 6);
    expect(scaleY).toBeCloseTo(0.5, 6);
    for (const i of [0, 12345, 640 * 360 - 1]) expect(gray.data[i]).toBeCloseTo(127.5, 3);
  });

  it('keeps a ramp a ramp at any scale (positions are preserved)', () => {
    for (const [w, h] of [[960, 540], [480, 270], [1280, 720]] as const) {
      const frame = grayFrame(w, h, (x) => (x / w) * 250);
      const { gray } = toWorkingGray(frame);
      // The centre of working pixel c is at (c + 0.5) / 640 of the width.
      for (const c of [50, 320, 600]) expect(gray.data[100 * gray.width + c]).toBeCloseTo(((c + 0.5) / 640) * 250 - (250 / w) * 0.5, 0);
    }
  });
});

describe('smoothing', () => {
  it('has a normalised symmetric kernel', () => {
    const k = gaussianKernel(1.2);
    expect(k.length % 2).toBe(1);
    expect(Array.from(k).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(k[0]).toBeCloseTo(k[k.length - 1], 9);
  });

  it('leaves a constant image constant, borders included', () => {
    const img = ensureImage(40, 30);
    img.data.fill(77);
    const out = gaussianBlur(img, 1.5);
    for (const i of [0, 39, 40 * 15 + 20, 40 * 30 - 1]) expect(out.data[i]).toBeCloseTo(77, 4);
  });

  it('spreads an impulse symmetrically and preserves its mass', () => {
    const img = ensureImage(41, 41);
    img.data[20 * 41 + 20] = 1000;
    const out = gaussianBlur(img, 1.2);
    let sum = 0;
    for (let i = 0; i < out.data.length; i++) sum += out.data[i];
    expect(sum).toBeCloseTo(1000, 1);
    expect(out.data[20 * 41 + 23]).toBeCloseTo(out.data[20 * 41 + 17], 5);
    expect(out.data[23 * 41 + 20]).toBeCloseTo(out.data[20 * 41 + 23], 5);
    expect(out.data[20 * 41 + 20]).toBeGreaterThan(out.data[20 * 41 + 21]);
  });

  it('blurs only inside a rectangle when asked', () => {
    const img = ensureImage(30, 30);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 37) % 200;
    const full = gaussianBlur(img, 1.2);
    const out = ensureImage(30, 30);
    out.data.fill(-1);
    gaussianBlur(img, 1.2, out, { x0: 5, y0: 6, x1: 20, y1: 22 });
    expect(out.data[0]).toBe(-1);
    expect(out.data[10 * 30 + 10]).toBeCloseTo(full.data[10 * 30 + 10], 4);
    expect(out.data[6 * 30 + 5]).toBeCloseTo(full.data[6 * 30 + 5], 4);
    expect(out.data[23 * 30 + 10]).toBe(-1);
  });

  it('builds a half-resolution coarse level', () => {
    const img = ensureImage(64, 36);
    img.data.fill(10);
    const half = halve(img);
    expect(half.width).toBe(32);
    expect(half.height).toBe(18);
    const p = buildPyramid(img);
    expect(p.fine.width).toBe(64);
    expect(p.coarse.width).toBe(32);
    expect(p.coarse.data[5 * 32 + 5]).toBeCloseTo(10, 4);
  });
});

describe('sampling', () => {
  it('interpolates between pixel centres and clamps at the border', () => {
    const img = ensureImage(4, 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) img.data[y * 4 + x] = x * 10 + y;
    expect(sampleBilinear(img, 1.5, 1.5)).toBeCloseTo(11, 6);
    expect(sampleBilinear(img, 2, 1.5)).toBeCloseTo(16, 6);
    expect(sampleBilinear(img, -5, -5)).toBeCloseTo(0, 6);
    expect(sampleBilinear(img, 99, 99)).toBeCloseTo(33, 1);
    expect(insideImage(img, 2, 2, 1)).toBe(true);
    expect(insideImage(img, 3.5, 2, 1)).toBe(false);
  });
});
