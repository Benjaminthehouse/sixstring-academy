/**
 * Disk cache of rendered benchmark frames (Node only). Rendering a scene costs far more than
 * reading 700 kB back, so a detector author iterating on the benchmark pays for rendering once.
 * The cache is keyed by the scene AND by a fingerprint of the renderer sources: changing any
 * renderer file invalidates everything automatically.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Frame } from '../types';
import type { FrameStore } from './render';

/** Files whose content decides what a rendered frame looks like. */
const RENDERER_SOURCES = ['rng.ts', 'scene.ts', 'camera.ts', 'raster.ts', 'background.ts', 'guitar.ts', 'people.ts', 'render.ts', 'sequence.ts', '../geometry.ts'];

let FINGERPRINT: string | null = null;

/** Short hash of the renderer sources; frames rendered by a different renderer are never reused. */
export function rendererFingerprint(): string {
  if (FINGERPRINT) return FINGERPRINT;
  const here = dirname(fileURLToPath(import.meta.url));
  const hash = createHash('sha1');
  for (const file of RENDERER_SOURCES) {
    const path = join(here, file);
    hash.update(file);
    hash.update(existsSync(path) ? readFileSync(path) : 'missing');
  }
  FINGERPRINT = hash.digest('hex').slice(0, 12);
  return FINGERPRINT;
}

/** Default location of the frame cache, relative to the working directory (`guitar/`); git-ignored. */
export const DEFAULT_FRAME_CACHE_DIR = 'e2e/out/vision/cache';

/**
 * A frame store on disk: raw RGB files under `<dir>/<renderer fingerprint>/`. Directories left by
 * older renderer versions are removed when the store is created.
 */
export function diskFrameStore(dir: string = DEFAULT_FRAME_CACHE_DIR): FrameStore {
  const fingerprint = rendererFingerprint();
  const root = join(dir, fingerprint);
  mkdirSync(root, { recursive: true });
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== fingerprint && /^[0-9a-f]{12}$/.test(entry.name)) {
      rmSync(join(dir, entry.name), { recursive: true, force: true });
    }
  }
  const pathOf = (key: string, width: number, height: number): string => join(root, `${key}-${width}x${height}.rgb`);
  return {
    load(key, width, height) {
      const path = pathOf(key, width, height);
      if (!existsSync(path)) return null;
      let rgb: Buffer;
      try {
        rgb = readFileSync(path);
      } catch {
        return null;
      }
      const n = width * height;
      if (rgb.length !== n * 3) return null;
      const data = new Uint8ClampedArray(n * 4);
      for (let i = 0, j = 0, o = 0; i < n; i++, j += 3, o += 4) {
        data[o] = rgb[j];
        data[o + 1] = rgb[j + 1];
        data[o + 2] = rgb[j + 2];
        data[o + 3] = 255;
      }
      return { data, width, height };
    },
    save(key, frame: Frame) {
      const n = frame.width * frame.height;
      const rgb = Buffer.allocUnsafe(n * 3);
      for (let i = 0, j = 0, o = 0; i < n; i++, j += 3, o += 4) {
        rgb[j] = frame.data[o];
        rgb[j + 1] = frame.data[o + 1];
        rgb[j + 2] = frame.data[o + 2];
      }
      // Write-then-rename so a concurrent reader never sees half a file.
      const path = pathOf(key, frame.width, frame.height);
      const tmp = `${path}.${process.pid}.tmp`;
      try {
        writeFileSync(tmp, rgb);
        renameSync(tmp, path);
      } catch {
        rmSync(tmp, { force: true });
      }
    },
  };
}
