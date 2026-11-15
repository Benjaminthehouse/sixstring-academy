import { describe, expect, it } from 'vitest';
import { createRng } from '../geometry';
import { clipLineToImage, clusterAxes, fitEdgeLine, profilePeaks } from './band';
import { angleDiffDeg, detectLines, type HoughLine } from './hough';
import { createImage, smooth3, sobel, type Image32 } from './image';

/** Paint a step edge: pixels on the positive side of the line n . p = rho get `bright`, anti-aliased over one pixel. */
function paintHalfPlane(img: Image32, nx: number, ny: number, rho: number, dark: number, bright: number): void {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const d = (x + 0.5) * nx + (y + 0.5) * ny - rho;
      const t = Math.max(0, Math.min(1, d + 0.5));
      img.data[y * img.width + x] = dark + (bright - dark) * t;
    }
  }
}

/** Add a thin bright line segment of the given half-width. */
function paintLine(img: Image32, x0: number, y0: number, x1: number, y1: number, halfWidth: number, value: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      let h = ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / len2;
      h = Math.max(0, Math.min(1, h));
      const d = Math.hypot(x + 0.5 - x0 - h * dx, y + 0.5 - y0 - h * dy);
      const a = Math.max(0, Math.min(1, halfWidth + 0.5 - d));
      const i = y * img.width + x;
      img.data[i] += (value - img.data[i]) * a;
    }
  }
}

function addNoise(img: Image32, sigma: number, seed: number): void {
  const rng = createRng(seed);
  for (let i = 0; i < img.data.length; i++) img.data[i] += sigma * Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

function lineAngleDeg(l: HoughLine): number {
  let a = (Math.atan2(l.ny, l.nx) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a;
}

describe('detectLines', () => {
  it('recovers a step edge with its polarity, angle and offset', () => {
    for (const deg of [0, 17, 63, 90, 141, 200, 305]) {
      const img = createImage(320, 200);
      const nx = Math.cos((deg * Math.PI) / 180);
      const ny = Math.sin((deg * Math.PI) / 180);
      const rho = 160 * nx + 100 * ny + 7.3;
      paintHalfPlane(img, nx, ny, rho, 60, 180);
      const { lines } = detectLines(sobel(smooth3(img)));
      expect(lines.length, `angle ${deg}`).toBeGreaterThanOrEqual(1);
      const best = lines[0];
      // The normal points to the bright side, so the oriented angle comes back, not its opposite.
      expect(angleDiffDeg(lineAngleDeg(best), deg), `angle ${deg}`).toBeLessThan(0.6);
      expect(Math.abs(best.rho - rho), `offset at ${deg}`).toBeLessThan(0.6);
      expect(best.support).toBeGreaterThan(100);
    }
  });

  it('separates the two flanks of a thin bright line and finds several lines at once', () => {
    const img = createImage(400, 240);
    img.data.fill(70);
    paintLine(img, 20, 60, 380, 95, 1.2, 220);
    paintLine(img, 30, 200, 370, 150, 1.2, 220);
    addNoise(img, 2, 5);
    const { lines } = detectLines(sobel(smooth3(img)));
    // Two flanks per line, opposite normals.
    expect(lines.length).toBeGreaterThanOrEqual(4);
    const first = (Math.atan2(95 - 60, 380 - 20) * 180) / Math.PI + 90;
    const near = lines.filter((l) => Math.min(angleDiffDeg(lineAngleDeg(l), first), angleDiffDeg(lineAngleDeg(l), first + 180)) < 2);
    expect(near.length).toBeGreaterThanOrEqual(2);
    expect(near.some((l) => angleDiffDeg(lineAngleDeg(l), first) < 2)).toBe(true);
    expect(near.some((l) => angleDiffDeg(lineAngleDeg(l), first + 180) < 2)).toBe(true);
  });

  it('reports the extent of a segment and bridges a short gap only', () => {
    const img = createImage(320, 120);
    img.data.fill(50);
    // A horizontal edge from x = 40 to x = 280 with a 4-pixel hole and a 40-pixel hole.
    for (let y = 60; y < 120; y++) {
      for (let x = 40; x < 280; x++) {
        if ((x >= 100 && x < 104) || (x >= 180 && x < 220)) continue;
        img.data[y * 320 + x] = 200;
      }
    }
    // Around a hole the gradient turns, so the gap in the support is a few pixels wider than the hole itself.
    const { lines } = detectLines(sobel(smooth3(img)), { minVotes: 30, maxGap: 12 });
    const horizontal = lines.find((l) => angleDiffDeg(lineAngleDeg(l), 90) < 2);
    expect(horizontal).toBeDefined();
    expect(Math.min(horizontal!.t0, horizontal!.t1)).toBeLessThan(-270 + 235);
    expect(Math.abs(horizontal!.t1 - horizontal!.t0)).toBeGreaterThan(220);
    // The longest unbroken stretch is the 136 pixels before the wide hole (the 4-pixel hole is bridged).
    expect(horizontal!.longestRun).toBeGreaterThan(125);
    expect(horizontal!.longestRun).toBeLessThan(150);
  });

  it('finds nothing in a flat or merely noisy image', () => {
    const flat = createImage(320, 180);
    flat.data.fill(128);
    expect(detectLines(sobel(smooth3(flat))).lines).toHaveLength(0);
    addNoise(flat, 6, 9);
    expect(detectLines(sobel(smooth3(flat))).lines).toHaveLength(0);
  });
});

describe('band helpers', () => {
  it('clusters near-parallel neighbouring lines into one axis and keeps a distant one apart', () => {
    const mk = (deg: number, rho: number, support: number): HoughLine => ({ nx: Math.cos((deg * Math.PI) / 180), ny: Math.sin((deg * Math.PI) / 180), rho, support, t0: -150, t1: 150, longestRun: 250 });
    const lines = [mk(90, 100, 300), mk(91, 108, 250), mk(270, -116, 240), mk(88, 124, 200), mk(90, 300, 280), mk(10, 200, 150)];
    const axes = clusterAxes(lines, 7, 60, 8);
    expect(axes).toHaveLength(3);
    expect(axes[0].lines).toBe(4);
    expect(axes[0].score).toBe(300 + 250 + 240 + 200);
  });

  it('clips a line to the image', () => {
    const clip = clipLineToImage(0, 1, 50, 200, 100);
    expect(clip).not.toBeNull();
    expect(clip![1] - clip![0]).toBeCloseTo(200, 6);
    expect(clipLineToImage(0, 1, 150, 200, 100)).toBeNull();
  });

  it('fits an edge through fret ends, ignoring frets cut short by fingers', () => {
    const cols = new Float64Array([10, 40, 70, 100, 130, 160, 190, 220]);
    const rows = new Float64Array(8);
    for (let k = 0; k < 8; k++) rows[k] = 20 + 0.05 * cols[k];
    rows[3] += 9;
    rows[4] += 12;
    const inlier = new Uint8Array(8);
    const fit = fitEdgeLine(cols, rows, 8, 1.5, inlier);
    expect(fit).not.toBeNull();
    expect(fit!.count).toBe(6);
    expect(fit!.a).toBeCloseTo(20, 6);
    expect(fit!.b).toBeCloseTo(0.05, 6);
    expect(Array.from(inlier)).toEqual([1, 1, 1, 0, 0, 1, 1, 1]);
  });

  it('picks profile peaks, strongest first, at least a minimum distance apart', () => {
    const p = new Float32Array(40);
    p[5] = 4;
    p[7] = 6;
    p[20] = 9;
    p[30] = 1;
    expect(profilePeaks(p, 40, 2, 3)).toEqual([20, 7]);
    expect(profilePeaks(p, 40, 0.5, 1)).toEqual([20, 7, 5, 30]);
  });
});
