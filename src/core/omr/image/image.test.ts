import { describe, expect, it } from 'vitest';
import { binarize, boxSum, integral, otsuThreshold } from './binarize';
import { labelComponents, removeSmallComponents } from './cc';
import { type BinaryImage, type GrayImage, blur3, boxBlurHorizontal, boxBlurSheared, boxBlurVertical, createBinary, createGray, cropGray, downscaleInt, histogram, resizeGray, rgbaToGray } from './gray';
import { estimateNoise, flatten } from './illumination';
import { close, countInk, dilate, erode, open } from './morph';
import { horizontalRuns, verticalRunHistograms, verticalRuns } from './runs';
import { estimateSkew } from './skew';
import { applyHomography, homographyFromPoints, identityMesh, meshFromAffine, meshFromFunction, meshMap, meshUnmap, rotateGray, warpGray } from './warp';

/** Deterministic pseudo-random numbers for synthetic pages. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A page of horizontal lines `pitch` px apart and `thick` px thick. */
function ruled(width: number, height: number, pitch: number, thick: number, ink = 20, paper = 240): GrayImage {
  const img = createGray(width, height, paper);
  for (let y = pitch; y + thick < height; y += pitch) {
    for (let t = 0; t < thick; t++) img.data.fill(ink, (y + t) * width + 10, (y + t) * width + width - 10);
  }
  return img;
}

function bin(rows: string[]): BinaryImage {
  const out = createBinary(rows[0].length, rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') out.data[y * out.width + x] = 1; }));
  return out;
}

describe('grey images', () => {
  it('converts RGBA to luma and treats transparency as white paper', () => {
    const g = rgbaToGray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0], 4, 1);
    expect(Array.from(g.data)).toEqual([77, 149, 29, 255]);
    expect(rgbaToGray([255, 255, 255, 255, 0, 0, 0, 255], 2, 1).data[0]).toBe(255);
  });

  it('box-reduces and resizes', () => {
    const img = createGray(8, 8, 0);
    for (let i = 0; i < 64; i++) img.data[i] = (i % 8) < 4 ? 0 : 200;
    const half = downscaleInt(img, 4);
    expect(half.width).toBe(2);
    expect(Array.from(half.data)).toEqual([0, 200, 0, 200]);
    const big = resizeGray(half, 6, 6);
    expect(big.width).toBe(6);
    expect(big.data[0]).toBe(0);
    expect(big.data[5]).toBe(200);
    expect(cropGray(img, 6, 6, 4, 4, 9).data[15]).toBe(9);
  });

  it('smooths along one direction only', () => {
    const img = ruled(120, 60, 12, 2);
    const h = boxBlurHorizontal(img, 6);
    // A horizontal line survives horizontal averaging untouched in its middle ...
    expect(h.data[12 * 120 + 60]).toBe(20);
    // ... and is washed out by vertical averaging.
    expect(boxBlurVertical(img, 6).data[12 * 120 + 60]).toBeGreaterThan(150);
    // The sheared version follows a slanted line.
    const slanted = rotateGray(img, 0.05);
    const s = boxBlurSheared(slanted, 6, Math.tan(0.05));
    const plain = boxBlurHorizontal(slanted, 6);
    const darkest = (g: GrayImage): number => Math.min(...Array.from(g.data.subarray(30 * 120 + 40, 30 * 120 + 80)), ...Array.from(g.data.subarray(31 * 120 + 40, 31 * 120 + 80)), ...Array.from(g.data.subarray(29 * 120 + 40, 29 * 120 + 80)));
    expect(darkest(s)).toBeLessThanOrEqual(darkest(plain));
    expect(blur3(img).data.length).toBe(img.data.length);
  });
});

describe('integral images and thresholds', () => {
  it('sums boxes exactly', () => {
    const img = createGray(5, 4, 0);
    for (let i = 0; i < 20; i++) img.data[i] = i;
    const I = integral(img, true);
    expect(boxSum(I.sum, I.width, 1, 1, 4, 3)).toBe(6 + 7 + 8 + 11 + 12 + 13);
    expect(boxSum(I.sq as Float64Array, I.width, 0, 0, 2, 1)).toBe(0 + 1);
  });

  it('finds the valley of a bimodal histogram', () => {
    const img = createGray(100, 10, 220);
    img.data.fill(30, 0, 300);
    const t = otsuThreshold(histogram(img));
    expect(t).toBeGreaterThan(30);
    expect(t).toBeLessThanOrEqual(220);
  });

  it('binarises thin lines under an illumination gradient after flattening', () => {
    const w = 400;
    const h = 300;
    const img = ruled(w, h, 12, 2, 0, 255);
    // Darken towards the right and add a little noise: the right side paper is darker than left side ink would allow a global threshold.
    const rnd = lcg(7);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const light = 1 - 0.55 * (x / w);
        const v = (img.data[y * w + x] * 0.8 + 40) * light + (rnd() - 0.5) * 6;
        img.data[y * w + x] = Math.max(0, Math.min(255, v));
      }
    }
    const flat = flatten(img);
    // Paper is white everywhere after flattening.
    expect(flat.image.data[6 * w + 30]).toBeGreaterThan(235);
    expect(flat.image.data[6 * w + w - 30]).toBeGreaterThan(235);
    expect(flat.noise).toBeGreaterThan(0.5);
    expect(flat.noise).toBeLessThan(8);
    for (const block of [1, 2] as const) {
      const b = binarize(flat.image, { window: 31, block });
      // Every line is ink at both ends of the gradient, and the paper between lines is clean.
      for (const x of [40, 200, 360]) {
        expect(b.data[12 * w + x] + b.data[13 * w + x]).toBeGreaterThanOrEqual(1);
        expect(b.data[18 * w + x]).toBe(0);
      }
      expect(countInk(b) / (w * h)).toBeLessThan(0.3);
    }
  });

  it('estimates noise from pixel differences', () => {
    const rnd = lcg(3);
    const img = createGray(300, 300, 128);
    for (let i = 0; i < img.data.length; i++) {
      // Sum of 4 uniforms: roughly normal with sigma = 10.
      const n = (rnd() + rnd() + rnd() + rnd() - 2) * Math.sqrt(3) * 10;
      img.data[i] = 128 + n;
    }
    const sigma = estimateNoise(img);
    expect(sigma).toBeGreaterThan(8);
    expect(sigma).toBeLessThan(12);
    expect(estimateNoise(createGray(50, 50, 200))).toBe(0);
  });
});

describe('runs, components, morphology', () => {
  it('measures staff-like run lengths', () => {
    const page = binarize(ruled(200, 200, 10, 2), { method: 'otsu' });
    const h = verticalRunHistograms(page);
    expect(h.black[2]).toBeGreaterThan(1000);
    expect(h.white[8]).toBeGreaterThan(1000);
    expect(h.pair[10]).toBeGreaterThan(1000);
    const runs = verticalRuns(page);
    const first = runs.start[50];
    expect(runs.pos[first]).toBe(10);
    expect(runs.len[first]).toBe(2);
    expect(runs.start[51] - runs.start[50]).toBe(19);
    expect(verticalRuns(page, 1).pos.length).toBe(0);
    const hr = horizontalRuns(page);
    expect(hr.len[hr.start[10]]).toBe(180);
  });

  it('labels and removes components', () => {
    const b = bin([
      '##....#',
      '##....#',
      '.......',
      '..#....',
      '...#...',
    ]);
    const cc8 = labelComponents(b, 8);
    expect(cc8.count).toBe(3);
    expect(Array.from(cc8.area.slice(1)).sort()).toEqual([2, 2, 4]);
    expect(labelComponents(b, 4).count).toBe(4);
    const big = cc8.area.indexOf(4);
    expect([cc8.x0[big], cc8.y0[big], cc8.x1[big], cc8.y1[big]]).toEqual([0, 0, 1, 1]);
    expect(removeSmallComponents(b, 3)).toBe(2);
    expect(countInk(b)).toBe(4);
  });

  it('opens and closes with rectangles', () => {
    const b = bin([
      '...........',
      '..###.###..',
      '..###.###..',
      '..###.###..',
      '...........',
      '.....#.....',
      '...........',
    ]);
    // Closing bridges the one-pixel gap; opening removes the speck and keeps the squares.
    expect(countInk(close(b, 1, 0))).toBe(countInk(b) + 3);
    expect(countInk(open(b, 1, 1))).toBe(18);
    expect(countInk(dilate(b, 1))).toBeGreaterThan(countInk(b));
    expect(countInk(erode(b, 1))).toBe(2);
  });
});

describe('warping', () => {
  it('leaves an image alone under the identity mesh', () => {
    const img = ruled(64, 48, 8, 1);
    const out = warpGray(img, identityMesh(64, 48));
    expect(Array.from(out.data)).toEqual(Array.from(img.data));
  });

  it('maps points through a mesh and back', () => {
    const mesh = meshFromFunction(200, 150, 16, (x, y) => ({ x: 1.1 * x + 0.05 * y + 3 + 2 * Math.sin(y / 40), y: 0.97 * y - 0.03 * x + 5 }));
    for (const [x, y] of [[10, 20], [150, 90], [199, 149]]) {
      const p = meshMap(mesh, x, y);
      const q = meshUnmap(mesh, p.x, p.y);
      expect(q.x).toBeCloseTo(x, 2);
      expect(q.y).toBeCloseTo(y, 2);
    }
    const affine = meshFromAffine(100, 100, [2, 0, 5, 0, 2, -3]);
    expect(meshMap(affine, 10, 10)).toEqual({ x: 25, y: 17 });
  });

  it('solves a homography from four points', () => {
    const from = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
    const to = [{ x: 3, y: 4 }, { x: 110, y: 9 }, { x: 96, y: 61 }, { x: -2, y: 52 }];
    const h = homographyFromPoints(from, to);
    from.forEach((p, i) => {
      const q = applyHomography(h, p.x, p.y);
      expect(q.x).toBeCloseTo(to[i].x, 6);
      expect(q.y).toBeCloseTo(to[i].y, 6);
    });
  });

  it('recovers the skew of a rotated page', () => {
    const page = ruled(600, 400, 14, 2);
    for (const deg of [-3, 0.8, 2.4]) {
      const rotated = rotateGray(page, (deg * Math.PI) / 180, 240);
      const est = estimateSkew(binarize(rotated, { method: 'otsu' }));
      expect((est.angle * 180) / Math.PI).toBeCloseTo(deg, 0);
      expect(Math.abs((est.angle * 180) / Math.PI - deg)).toBeLessThan(0.15);
      expect(est.confidence).toBeGreaterThan(0.3);
    }
  });
});
