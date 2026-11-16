/**
 * The AI service of the app (`@/core/platform` askJson, with pictures) as the two small
 * interfaces the sheet reader uses:
 *
 * - `createPlatformAiClient()` -> `OmrAiClient` for `ai-assist.ts` (page reading, fusion, measure questions);
 * - `createPlatformVisionModel()` -> `OmrVisionModel` for the staff recognizers' own second opinions.
 *
 * Both load the platform lazily, respect the learner's Settings switch (`aiAllowed()` is checked
 * before every request; when it is off nothing is sent and `OmrAiUnavailableError` says so), and
 * run on the page's thread (the AI host may need to ask the viewer's consent). Call them from a
 * user action ("Ask AI to check this page").
 */
import type { OmrAiClient, OmrAiRequest } from './ai-assist';
import { type GrayImage, grayToRgba } from './image/gray';
import type { OmrVisionModel } from './types';

/** Why the AI could not be asked. `reason` is safe to show; `settings` = the learner turned AI help off. */
export class OmrAiUnavailableError extends Error {
  constructor(readonly reason: 'settings' | 'not-available' | 'no-images', message: string) {
    super(message);
    this.name = 'OmrAiUnavailableError';
  }
}

/** A grey picture as a canvas the platform can encode. */
function toCanvas(img: GrayImage): HTMLCanvasElement | OffscreenCanvas {
  const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(img.width, img.height)
    : Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('No 2D canvas is available here.');
  ctx.putImageData(new ImageData(grayToRgba(img) as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
  return canvas;
}

async function ready(): Promise<{ askJson: typeof import('@/core/platform').askJson; maxImages: number }> {
  const [platform, settings] = await Promise.all([import('@/core/platform'), import('@/core/settings')]);
  if (!settings.aiAllowed()) throw new OmrAiUnavailableError('settings', 'AI help is turned off in Settings, so nothing was sent.');
  const status = await platform.aiStatus();
  if (!status.available) throw new OmrAiUnavailableError('not-available', 'The AI helper is not available here.');
  if (!status.images) throw new OmrAiUnavailableError('no-images', 'The AI helper here cannot look at pictures.');
  return { askJson: platform.askJson, maxImages: status.maxImages };
}

/** `OmrAiClient` over the platform AI (tier 'complex': reading a score is the hardest task it gets). */
export function createPlatformAiClient(): OmrAiClient {
  const client: OmrAiClient = {
    maxImages: 1,
    async askJson<T>(req: OmrAiRequest<T>): Promise<T> {
      const { askJson, maxImages } = await ready();
      client.maxImages = maxImages;
      const images = req.images.slice(0, Math.max(1, maxImages)).map((im) => toCanvas(im.gray));
      const { value } = await askJson<T>({ system: req.system, prompt: req.prompt, images, tier: 'complex', validate: req.validate, signal: req.signal });
      return value;
    },
  };
  return client;
}

/** `OmrVisionModel` over the platform AI: any JSON answer, or null when it is unavailable or fails. */
export function createPlatformVisionModel(): OmrVisionModel {
  return {
    async ask(image, prompt, signal) {
      try {
        const { askJson } = await ready();
        const gray: GrayImage = 'gray' in image ? image.gray : rgbaToGrayLocal(image.rgba, image.width, image.height);
        const { value } = await askJson<unknown>({ prompt, images: [toCanvas(gray)], tier: 'complex', validate: (v) => v, signal });
        return value;
      } catch {
        return null;
      }
    },
  };
}

function rgbaToGrayLocal(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2] + 128) >> 8;
  return { width, height, data };
}
