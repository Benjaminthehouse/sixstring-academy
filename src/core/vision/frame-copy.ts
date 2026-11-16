/**
 * Camera frames to working-size RGBA without a canvas: the raw planes a `VideoFrame` copies out
 * (`frame.copyTo`), averaged down to the tracker's working size and converted to RGB here.
 *
 * Why: drawing a transferred `VideoFrame` on an `OffscreenCanvas` and reading it back cost the vision
 * worker 6-8 ms a frame (17 ms on the loaded machine), and a main-thread `createImageBitmap` resize
 * 9-11 ms; copying the planes out (about 1 ms for 1280x720 I420) and box-averaging them here takes
 * about 3.5 ms. Camera frames come as I420 or NV12 (4:2:0 YUV) in Chromium; RGBA / BGRA frames are
 * handled too. Anything else returns null and the caller draws the frame instead.
 *
 * Each output pixel is the mean of the source pixels under it (luma, or each RGB channel); chroma,
 * already at half resolution, is read at the middle of the box. YUV is converted with the frame's
 * matrix (BT.709 or BT.601) and range (limited unless the frame says full).
 */

/** Where one plane starts in the copied buffer and how many bytes a row takes (`PlaneLayout` of WebCodecs). */
export interface RawPlane {
  offset: number;
  stride: number;
}

/** A camera frame copied out of a `VideoFrame` (its visible rectangle). */
export interface RawFrame {
  /** `VideoFrame.format`: 'I420', 'I420A', 'NV12', 'RGBA', 'RGBX', 'BGRA', 'BGRX' are read. */
  format: string | null;
  width: number;
  height: number;
  data: Uint8Array;
  layout: readonly RawPlane[];
  /** `VideoFrame.colorSpace.matrix` ('bt709', 'bt470bg', 'smpte170m' ...) and `.fullRange`. */
  matrix?: string | null;
  fullRange?: boolean | null;
}

const YUV = new Set(['I420', 'I420A', 'NV12']);
const RGB = new Set(['RGBA', 'RGBX', 'BGRA', 'BGRX']);

/** Can `rawToRgba` read this format? */
export function canReadRaw(format: string | null | undefined): boolean {
  return !!format && (YUV.has(format) || RGB.has(format));
}

/** For each output index, the source range [start, end) it averages (at least one pixel). */
function spans(source: number, out: number): Int32Array {
  const s = new Int32Array(out * 2);
  for (let o = 0; o < out; o++) {
    const a = Math.min(source - 1, Math.floor((o * source) / out));
    const b = Math.max(a + 1, Math.min(source, Math.floor(((o + 1) * source) / out)));
    s[2 * o] = a;
    s[2 * o + 1] = b;
  }
  return s;
}

/**
 * The frame averaged down to `outWidth` x `outHeight` RGBA (into `out` when it has the right
 * length). Null for a format it cannot read or a layout that does not fit the data.
 */
export function rawToRgba(raw: RawFrame, outWidth: number, outHeight: number, out?: Uint8ClampedArray): Uint8ClampedArray | null {
  const { format, width: W, height: H, data, layout } = raw;
  if (!canReadRaw(format) || !(W > 0 && H > 0 && outWidth > 0 && outHeight > 0)) return null;
  const dst = out && out.length === outWidth * outHeight * 4 ? out : new Uint8ClampedArray(outWidth * outHeight * 4);
  const xs = spans(W, outWidth);
  const ys = spans(H, outHeight);
  if (RGB.has(format as string)) {
    const p = layout[0];
    if (!p || p.offset + (H - 1) * p.stride + W * 4 > data.length) return null;
    const bgr = format === 'BGRA' || format === 'BGRX';
    for (let oy = 0; oy < outHeight; oy++) {
      const y0 = ys[2 * oy];
      const y1 = ys[2 * oy + 1];
      for (let ox = 0; ox < outWidth; ox++) {
        const x0 = xs[2 * ox];
        const x1 = xs[2 * ox + 1];
        let r = 0;
        let g = 0;
        let b = 0;
        for (let y = y0; y < y1; y++) {
          let i = p.offset + y * p.stride + x0 * 4;
          for (let x = x0; x < x1; x++, i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
          }
        }
        const n = (y1 - y0) * (x1 - x0);
        const o = (oy * outWidth + ox) * 4;
        dst[o] = (bgr ? b : r) / n;
        dst[o + 1] = g / n;
        dst[o + 2] = (bgr ? r : b) / n;
        dst[o + 3] = 255;
      }
    }
    return dst;
  }
  // 4:2:0 YUV: luma at full resolution, chroma at half (NV12: U and V interleaved in one plane).
  const nv12 = format === 'NV12';
  const yp = layout[0];
  const up = layout[1];
  const vp = nv12 ? layout[1] : layout[2];
  const cw = (W + 1) >> 1;
  const ch = (H + 1) >> 1;
  if (!yp || !up || !vp) return null;
  if (yp.offset + (H - 1) * yp.stride + W > data.length) return null;
  if (up.offset + (ch - 1) * up.stride + (nv12 ? 2 * cw : cw) > data.length) return null;
  if (vp.offset + (ch - 1) * vp.stride + (nv12 ? 2 * cw : cw) > data.length) return null;
  const bt709 = raw.matrix === 'bt709';
  const full = raw.fullRange === true;
  // Y' and chroma scaled to 0..255 / -128..127, then the matrix.
  const ky = full ? 1 : 255 / 219;
  const kc = full ? 1 : 255 / 224;
  const oy0 = full ? 0 : 16;
  const rv = (bt709 ? 1.5748 : 1.402) * kc;
  const gu = (bt709 ? 0.1873 : 0.344136) * kc;
  const gv = (bt709 ? 0.4681 : 0.714136) * kc;
  const bu = (bt709 ? 1.8556 : 1.772) * kc;
  for (let oy = 0; oy < outHeight; oy++) {
    const y0 = ys[2 * oy];
    const y1 = ys[2 * oy + 1];
    const cy = Math.min(ch - 1, (y0 + y1 - 1) >> 2);
    for (let ox = 0; ox < outWidth; ox++) {
      const x0 = xs[2 * ox];
      const x1 = xs[2 * ox + 1];
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        let i = yp.offset + y * yp.stride + x0;
        for (let x = x0; x < x1; x++, i++) sum += data[i];
      }
      const Y = (sum / ((y1 - y0) * (x1 - x0)) - oy0) * ky;
      const cx = Math.min(cw - 1, (x0 + x1 - 1) >> 2);
      const U = data[up.offset + cy * up.stride + (nv12 ? 2 * cx : cx)] - 128;
      const V = data[vp.offset + cy * vp.stride + (nv12 ? 2 * cx + 1 : cx)] - 128;
      const o = (oy * outWidth + ox) * 4;
      dst[o] = Y + rv * V;
      dst[o + 1] = Y - gu * U - gv * V;
      dst[o + 2] = Y + bu * U;
      dst[o + 3] = 255;
    }
  }
  return dst;
}
