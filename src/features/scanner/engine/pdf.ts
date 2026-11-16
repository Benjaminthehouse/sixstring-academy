/**
 * PDFs, read with pdf.js entirely in the browser: its worker is bundled with the app, character
 * maps, standard fonts and image decoders come from `vendor/pdfjs/` (nothing from the network).
 * Each page gives its text layer (a typed chord sheet or tab goes straight to the text importers)
 * and renders to a canvas at a resolution suited to the reader.
 */
import type { TextPiece } from '../model/text-layout';
import { ctx2d, type AnyCanvas } from './images';

/** An open PDF. */
export interface PdfFile {
  pageCount: number;
  /** Size of a page in PDF units (1/72 inch). */
  pageSize(index: number): Promise<{ width: number; height: number }>;
  /** The page's text pieces, top-left origin, in PDF units. */
  text(index: number): Promise<TextPiece[]>;
  /** The page drawn at `scale` (PDF units to px) on white. */
  render(index: number, scale: number): Promise<AnyCanvas>;
  close(): void;
}

/** Why a PDF could not be opened, in words. */
export class PdfError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'PdfError';
  }
}

const vendor = (path: string): string => new URL(`vendor/pdfjs/${path}`, document.baseURI).href;

type PdfJs = typeof import('pdfjs-dist');
let loading: Promise<PdfJs> | null = null;

async function pdfjs(): Promise<PdfJs> {
  loading ??= (async () => {
    const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Open a PDF file. */
export async function openPdf(file: Blob): Promise<PdfFile> {
  let lib: PdfJs;
  try {
    lib = await pdfjs();
  } catch (e) {
    throw new PdfError('The PDF reader could not start here.', e instanceof Error ? e.message : String(e));
  }
  const data = new Uint8Array(await file.arrayBuffer());
  let doc: Awaited<ReturnType<PdfJs['getDocument']>['promise']>;
  try {
    doc = await lib.getDocument({
      data,
      cMapUrl: vendor('cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: vendor('standard_fonts/'),
      wasmUrl: vendor('wasm/'),
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/password/i.test(msg)) throw new PdfError('This PDF is locked with a password. Open it, print it to a new PDF, and try that.', msg);
    throw new PdfError('This PDF could not be opened. It may be damaged.', msg);
  }
  return {
    pageCount: doc.numPages,
    async pageSize(index) {
      const page = await doc.getPage(index + 1);
      const v = page.getViewport({ scale: 1 });
      return { width: v.width, height: v.height };
    },
    async text(index) {
      const page = await doc.getPage(index + 1);
      const v = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const out: TextPiece[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const t = item.transform as number[];
        const h = item.height || Math.hypot(t[2], t[3]) || 10;
        // pdf.js gives the baseline in PDF space (y up); turn it into a top-left box, y down.
        const [x, y] = v.convertToViewportPoint(t[4], t[5]);
        out.push({ text: item.str, x, y: y - h * 0.8, w: item.width, h });
      }
      return out;
    },
    async render(index, scale) {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale });
      // A DOM canvas: pdf.js draws on one.
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const c = ctx2d(canvas) as CanvasRenderingContext2D;
      // Paper white under transparent PDFs, so the reader sees ink on paper (image data, not UI colour).
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: c, viewport, background: '#ffffff' }).promise;
      page.cleanup();
      return canvas;
    },
    close() {
      void doc.destroy();
    },
  };
}
