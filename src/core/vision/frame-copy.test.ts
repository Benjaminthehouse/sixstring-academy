import { describe, expect, it } from 'vitest';
import { canReadRaw, rawToRgba, type RawFrame } from './frame-copy';

const W = 64;
const H = 36;

/** A test picture: a grey ramp left to right, with a red and a blue block (flat over 4x4 cells). */
function picture(x: number, y: number): [number, number, number] {
  if (x >= 8 && x < 24 && y >= 8 && y < 20) return [200, 30, 40];
  if (x >= 40 && x < 56 && y >= 12 && y < 28) return [30, 60, 210];
  const g = Math.round((x * 255) / (W - 1));
  return [g, g, g];
}

/** BT.601 limited-range 4:2:0 planes of the picture (chroma from the top-left pixel of each pair). */
function yuv(nv12: boolean): RawFrame {
  const cw = W / 2;
  const ch = H / 2;
  const ySize = W * H;
  const data = new Uint8Array(ySize + 2 * cw * ch);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = picture(x, y);
      data[y * W + x] = Math.round(16 + (65.481 * r + 128.553 * g + 24.966 * b) / 255);
    }
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const [r, g, b] = picture(2 * x, 2 * y);
      const u = Math.round(128 + (-37.797 * r - 74.203 * g + 112 * b) / 255);
      const v = Math.round(128 + (112 * r - 93.786 * g - 18.214 * b) / 255);
      if (nv12) {
        data[ySize + y * W + 2 * x] = u;
        data[ySize + y * W + 2 * x + 1] = v;
      } else {
        data[ySize + y * cw + x] = u;
        data[ySize + cw * ch + y * cw + x] = v;
      }
    }
  const layout = nv12
    ? [{ offset: 0, stride: W }, { offset: ySize, stride: W }]
    : [{ offset: 0, stride: W }, { offset: ySize, stride: cw }, { offset: ySize + cw * ch, stride: cw }];
  return { format: nv12 ? 'NV12' : 'I420', width: W, height: H, data, layout, matrix: 'smpte170m', fullRange: false };
}

/** The picture averaged over 2x2 boxes: what a working frame at half size should hold. */
function expected(ox: number, oy: number): [number, number, number] {
  const s = [0, 0, 0];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const p = picture(2 * ox + dx, 2 * oy + dy);
    for (let c = 0; c < 3; c++) s[c] += p[c] / 4;
  }
  return s as [number, number, number];
}

describe('rawToRgba (VideoFrame planes to the working frame)', () => {
  it('reads I420 and NV12 camera frames at half size within a few levels of the true picture', () => {
    for (const nv12 of [false, true]) {
      const out = rawToRgba(yuv(nv12), W / 2, H / 2);
      expect(out).not.toBeNull();
      let worst = 0;
      for (let y = 0; y < H / 2; y++)
        for (let x = 0; x < W / 2; x++) {
          const e = expected(x, y);
          for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs((out as Uint8ClampedArray)[(y * (W / 2) + x) * 4 + c] - e[c]));
          expect((out as Uint8ClampedArray)[(y * (W / 2) + x) * 4 + 3]).toBe(255);
        }
      // Rounding of the 8-bit planes, and chroma read once per 2x2 box: a few levels at block edges.
      expect(worst).toBeLessThanOrEqual(nv12 ? 12 : 12);
      // Away from colour edges, luma is exact to rounding.
      const mid = (out as Uint8ClampedArray)[((H / 2 - 2) * (W / 2) + 4) * 4];
      expect(Math.abs(mid - expected(4, H / 2 - 2)[0])).toBeLessThanOrEqual(2);
    }
  });

  it('reads RGBA and BGRA and averages over boxes of any ratio', () => {
    const rgba = new Uint8Array(W * H * 4);
    const bgra = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const [r, g, b] = picture(x, y);
        rgba.set([r, g, b, 255], (y * W + x) * 4);
        bgra.set([b, g, r, 255], (y * W + x) * 4);
      }
    const a = rawToRgba({ format: 'RGBA', width: W, height: H, data: rgba, layout: [{ offset: 0, stride: W * 4 }] }, W / 2, H / 2) as Uint8ClampedArray;
    const b = rawToRgba({ format: 'BGRX', width: W, height: H, data: bgra, layout: [{ offset: 0, stride: W * 4 }] }, W / 2, H / 2) as Uint8ClampedArray;
    expect(Array.from(a)).toEqual(Array.from(b));
    const e = expected(6, 6);
    expect(Math.abs(a[(6 * (W / 2) + 6) * 4] - e[0])).toBeLessThanOrEqual(1);
    // 64 -> 27 wide (a ratio of 2.37): still the mean of what is under each pixel, and the full size.
    const odd = rawToRgba({ format: 'RGBA', width: W, height: H, data: rgba, layout: [{ offset: 0, stride: W * 4 }] }, 27, 15) as Uint8ClampedArray;
    expect(odd.length).toBe(27 * 15 * 4);
    const ramp = [odd[(14 * 27 + 0) * 4], odd[(14 * 27 + 13) * 4], odd[(14 * 27 + 26) * 4]];
    expect(ramp[0]).toBeLessThan(ramp[1]);
    expect(ramp[1]).toBeLessThan(ramp[2]);
  });

  it('refuses formats and layouts it cannot read (the worker then draws the frame instead)', () => {
    expect(canReadRaw('I420')).toBe(true);
    expect(canReadRaw('NV12')).toBe(true);
    expect(canReadRaw('I444')).toBe(false);
    expect(canReadRaw(null)).toBe(false);
    expect(rawToRgba({ ...yuv(false), format: 'I444' }, 32, 18)).toBeNull();
    const short = yuv(false);
    expect(rawToRgba({ ...short, data: short.data.subarray(0, W * H) }, 32, 18)).toBeNull();
  });
});
