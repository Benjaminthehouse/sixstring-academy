import { describe, expect, it } from 'vitest';
import { blobAt, ridgeAt, stepAt, straightRidgeAt } from './features';
import { ensureImage, gaussianBlur, type GrayImage } from './image';

/** A smoothed test image: background 50, with whatever `paint` adds. */
function image(paint: (x: number, y: number) => number): GrayImage {
  const img = ensureImage(80, 60);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) img.data[y * 80 + x] = 50 + paint(x + 0.5, y + 0.5);
  return gaussianBlur(img, 1.2);
}

describe('thin-line response', () => {
  const vertical = image((x) => (Math.abs(x - 40) <= 1 ? 100 : 0));
  const dark = image((x) => (Math.abs(x - 40) <= 1 ? -40 : 0));
  const edge = image((x) => (x > 40 ? 100 : 0));
  const dot = image((x, y) => (Math.hypot(x - 40, y - 30) <= 2.5 ? 100 : 0));

  it('is positive on a bright line across its normal and negative on a dark one', () => {
    expect(ridgeAt(vertical, 40, 30, 1, 0, 2)).toBeGreaterThan(20);
    expect(ridgeAt(dark, 40, 30, 1, 0, 2)).toBeLessThan(-8);
  });

  it('peaks on the line and falls off beside it', () => {
    const on = ridgeAt(vertical, 40, 30, 1, 0, 2);
    expect(ridgeAt(vertical, 41.5, 30, 1, 0, 2)).toBeLessThan(on);
    expect(ridgeAt(vertical, 46, 30, 1, 0, 2)).toBeCloseTo(0, 3);
  });

  it('ignores a line seen along its own direction', () => {
    expect(Math.abs(ridgeAt(vertical, 40, 30, 0, 1, 2))).toBeLessThan(0.5);
  });

  it('steers to any orientation', () => {
    // A line at 30 degrees through the centre.
    const a = (30 * Math.PI) / 180;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const tilted = image((x, y) => (Math.abs((x - 40) * nx + (y - 30) * ny) <= 1 ? 100 : 0));
    const across = ridgeAt(tilted, 40, 30, nx, ny, 2);
    const along = ridgeAt(tilted, 40, 30, Math.cos(a), Math.sin(a), 2);
    expect(across).toBeGreaterThan(20);
    expect(Math.abs(along)).toBeLessThan(0.15 * across);
  });

  it('does not take the flank of a step edge for a line', () => {
    for (const x of [37, 38, 39, 40, 41, 42, 43]) expect(Math.abs(ridgeAt(edge, x, 30, 1, 0, 2))).toBeLessThan(1);
    expect(stepAt(edge, 40, 30, 1, 0, 3)).toBeGreaterThan(60);
  });

  it('straightRidgeAt rejects dots, blobAt finds them', () => {
    expect(ridgeAt(dot, 40, 30, 1, 0, 2)).toBeGreaterThan(10);
    expect(straightRidgeAt(dot, 40, 30, 1, 0, 2)).toBeLessThan(0.2 * ridgeAt(dot, 40, 30, 1, 0, 2));
    expect(straightRidgeAt(vertical, 40, 30, 1, 0, 2)).toBeGreaterThan(0.8 * ridgeAt(vertical, 40, 30, 1, 0, 2));
    expect(blobAt(dot, 40, 30, 5)).toBeGreaterThan(20);
    expect(Math.abs(blobAt(dot, 60, 30, 5))).toBeLessThan(1);
  });
});
