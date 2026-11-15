/**
 * PNG / JPEG file I/O for tests and debug dumps (Node only: uses node:fs, pngjs and jpeg-js).
 * Nothing in the browser bundle may import this file.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import { type GrayImage, rgbaToGray } from '../image/gray';

/** An RGBA picture in memory. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Read a PNG file as RGBA. */
export function readPngRgba(path: string): RgbaImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length) };
}

/** Read a PNG file as a grey image. */
export function readPngGray(path: string): GrayImage {
  const rgba = readPngRgba(path);
  return rgbaToGray(rgba.data, rgba.width, rgba.height);
}

/** Write a grey or RGBA image as PNG, creating the directory when needed. */
export function writePng(path: string, img: GrayImage | RgbaImage): void {
  mkdirSync(dirname(path), { recursive: true });
  const isGray = img.data.length === img.width * img.height;
  if (isGray) {
    const png = new PNG({ width: img.width, height: img.height, colorType: 0, inputColorType: 0, bitDepth: 8 });
    png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
    writeFileSync(path, PNG.sync.write(png, { colorType: 0, inputColorType: 0, bitDepth: 8 }));
  } else {
    const png = new PNG({ width: img.width, height: img.height });
    png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
    writeFileSync(path, PNG.sync.write(png, { colorType: 2, inputHasAlpha: true }));
  }
}
