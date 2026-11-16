/**
 * Reading printed words with Tesseract (loaded on first use; worker, engine and English data come
 * from `vendor/tesseract/`, never from a CDN). Used for chord sheets and typed tab in photos, and
 * for the chord symbols, titles and tempo marks the sheet reader only locates. When the files are
 * missing (the Claude-artifact build ships without them) it says so instead of failing.
 */
import type { GrayImage } from '@/core/omr/image/gray';
import type { BBox } from '@/core/omr/types';
import { flatten } from '@/core/omr/image/illumination';
import { isArtifact } from '@/core/platform';
import { levelledCrop } from '../model/levels';
import type { TextPiece } from '../model/text-layout';
import { type AnyCanvas, canvasOfGray, ctx2d, makeCanvas } from './images';

/** Text reading is not available here (a sentence to show). */
export class OcrUnavailableError extends Error {
  constructor(message = 'Reading printed text is not available in this version of the app.', readonly detail?: string) {
    super(message);
    this.name = 'OcrUnavailableError';
  }
}

/** Words read from a picture. */
export interface OcrResult {
  words: TextPiece[];
  /** Lines as Tesseract grouped them, with boxes. */
  lines: { text: string; box: BBox; confidence: number }[];
  /** 0..100. */
  confidence: number;
}

/** A started reader. */
export interface Ocr {
  /** `allow`: the only characters to expect (chord names: "ABCDEFGmaj7sus..."), default any. */
  read(canvas: AnyCanvas, mode?: 'block' | 'line' | 'sparse', allow?: string): Promise<OcrResult>;
  close(): void;
}

interface TessWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
interface TessLine extends TessWord {
  words: TessWord[];
}
interface TessWorker {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(image: unknown, options?: unknown, output?: unknown): Promise<{ data: { confidence: number; blocks: { paragraphs: { lines: TessLine[] }[] }[] | null } }>;
  terminate(): Promise<unknown>;
}

const vendor = (path: string): string => new URL(`vendor/tesseract/${path}`, document.baseURI).href;
const START_TIMEOUT_MS = 30_000;

/** Start Tesseract. `onProgress(0..1)` follows loading the engine and language data. */
export async function createOcr(onProgress?: (fraction: number, status: string) => void): Promise<Ocr> {
  // The Claude-artifact build ships without the OCR files: say so at once instead of waiting.
  if (isArtifact()) throw new OcrUnavailableError('Reading printed words is not part of this version of the app; the AI helper can read them instead.');
  let mod: unknown;
  try {
    mod = await import('tesseract.js');
  } catch (e) {
    throw new OcrUnavailableError(undefined, e instanceof Error ? e.message : String(e));
  }
  const lib = mod as { createWorker?: unknown; default?: { createWorker?: unknown } };
  const createWorker = (lib.createWorker ?? lib.default?.createWorker) as ((langs: string, oem: number, opts: Record<string, unknown>) => Promise<TessWorker>) | undefined;
  if (typeof createWorker !== 'function') throw new OcrUnavailableError();
  let failed: string | null = null;
  const start = createWorker('eng', 1, {
    workerPath: vendor('worker.min.js'),
    corePath: vendor('core'),
    langPath: vendor('lang'),
    gzip: true,
    cacheMethod: 'none',
    workerBlobURL: false,
    logger: (m: { status?: string; progress?: number }) => onProgress?.(m.progress ?? 0, m.status ?? ''),
    errorHandler: (e: unknown) => {
      failed = e instanceof Error ? e.message : String(e);
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OcrUnavailableError(undefined, failed ?? 'the text reader did not start in time')), START_TIMEOUT_MS);
  });
  let worker: TessWorker;
  try {
    worker = await Promise.race([start, timeout]);
  } catch (e) {
    void start.then((w) => w.terminate(), () => undefined);
    if (e instanceof OcrUnavailableError) throw e;
    throw new OcrUnavailableError(undefined, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
  // A stated resolution keeps Tesseract from guessing it (and logging that it did).
  await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' });
  return {
    async read(canvas, mode = 'block', allow = '') {
      await worker.setParameters({ tessedit_pageseg_mode: mode === 'line' ? '7' : mode === 'sparse' ? '11' : '6', tessedit_char_whitelist: allow });
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      const words: TextPiece[] = [];
      const lines: OcrResult['lines'] = [];
      for (const block of data.blocks ?? []) {
        for (const para of block.paragraphs) {
          for (const line of para.lines) {
            const b = line.bbox;
            lines.push({ text: line.text.trim(), box: { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }, confidence: line.confidence });
            for (const w of line.words) {
              if (!w.text.trim()) continue;
              words.push({ text: w.text, x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0 });
            }
          }
        }
      }
      return { words, lines, confidence: data.confidence };
    },
    close() {
      void worker.terminate();
    },
  };
}

/** A page made ready for OCR: lighting evened out, enlarged when the text is small. */
export function ocrCanvas(gray: GrayImage, scale = 1): AnyCanvas {
  let img = gray;
  try {
    img = flatten(gray).image;
  } catch {
    img = gray;
  }
  const c = canvasOfGray(img);
  if (scale === 1) return c;
  const out = makeCanvas(c.width * scale, c.height * scale);
  const x = ctx2d(out);
  x.imageSmoothingQuality = 'high';
  x.drawImage(c as unknown as CanvasImageSource, 0, 0, out.width, out.height);
  return out;
}

/**
 * Read many small boxes of one picture in a single pass: each box is cut out, scaled to a common
 * text height and stacked on a strip, the strip is read once, and the lines are given back to the
 * boxes they came from. Boxes with nothing readable get ''.
 */
export async function readBoxes(ocr: Ocr, gray: GrayImage, boxes: BBox[], opts: { textHeight?: number; pad?: number; allow?: string } = {}): Promise<string[]> {
  if (!boxes.length) return [];
  const th = opts.textHeight ?? 40;
  const gap = Math.round(th * 0.9);
  const pad = opts.pad ?? 4;
  const placed: { y0: number; y1: number }[] = [];
  // Each box levelled on its own (a photo's grey paper turned white): on the white strip, grey paper
  // reads as a dark patch and nothing in it is read (`model/levels.ts`).
  const parts = boxes.map((b) => {
    const crop = levelledCrop(gray, { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad });
    const s = th / Math.max(1, crop.height);
    return { crop, w: Math.max(1, Math.round(crop.width * s)), h: th };
  });
  const width = Math.min(4000, Math.max(...parts.map((p) => p.w)) + 2 * gap);
  const height = parts.length * (th + gap) + gap;
  const strip = makeCanvas(width, height);
  const c = ctx2d(strip);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, width, height);
  c.imageSmoothingQuality = 'high';
  let y = gap;
  for (const p of parts) {
    const w = Math.min(p.w, width - 2 * gap);
    if (p.crop.width && p.crop.height) {
      const src = canvasOfGray({ width: p.crop.width, height: p.crop.height, data: p.crop.data });
      c.drawImage(src as unknown as CanvasImageSource, 0, 0, p.crop.width, p.crop.height, gap, y, w, p.h);
    }
    placed.push({ y0: y, y1: y + p.h });
    y += p.h + gap;
  }
  const r = await ocr.read(strip, 'block', opts.allow ?? '');
  const out = boxes.map(() => '');
  for (const line of r.lines) {
    const mid = line.box.y + line.box.h / 2;
    const i = placed.findIndex((p) => mid >= p.y0 - gap / 2 && mid <= p.y1 + gap / 2);
    if (i >= 0 && line.text) out[i] = out[i] ? `${out[i]} ${line.text}` : line.text;
  }
  return out;
}
