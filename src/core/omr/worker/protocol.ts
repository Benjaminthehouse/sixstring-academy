/**
 * Messages between the page and the OMR worker, and the worker-side handler. The handler is plain
 * code (no `self`), so tests drive it directly and the worker file stays a three-line shell.
 *
 *   page -> worker: recognize | classify | cancel | ai-answer
 *   worker -> page: progress | result | error | ai-ask
 *
 * A vision model cannot live in the worker (it needs the page's consent dialog and network
 * client), so the worker asks the page: `ai-ask` with a grey crop and a prompt, answered by
 * `ai-answer`. Everything else is computed in the worker.
 */
import { type PageClassification, classifyPage } from '../classify-page';
import type { GrayImage } from '../image/gray';
import { type OmrDocument, type OmrImageInput, type OmrProgress, type RecognizePageOptions, isCancelled, recognizeDocument, recognizePage } from '../pipeline';
import type { OmrPage, OmrVisionModel } from '../types';

/** Options that can cross the worker boundary (no functions, no signal). */
export type WorkerRecognizeOptions = Omit<RecognizePageOptions, 'tab' | 'notation' | 'ai' | 'signal' | 'onProgress'>;

/** Page -> worker. */
export type OmrRequest =
  | { type: 'recognize'; id: number; images: OmrImageInput[]; document: boolean; options: WorkerRecognizeOptions; ai: boolean }
  | { type: 'classify'; id: number; image: OmrImageInput; maxSide?: number }
  | { type: 'cancel'; id: number }
  | { type: 'ai-answer'; id: number; askId: number; value: unknown };

/** Worker -> page. */
export type OmrResponse =
  | { type: 'progress'; id: number; progress: OmrProgress }
  | { type: 'result'; id: number; page?: OmrPage; document?: OmrDocument; classification?: PageClassification }
  | { type: 'error'; id: number; name: string; message: string }
  | { type: 'ai-ask'; id: number; askId: number; image: { gray: GrayImage } | { rgba: Uint8ClampedArray; width: number; height: number }; prompt: string };

/** Sends a message from the worker (with buffers to transfer). */
export type PostFn = (msg: OmrResponse, transfer?: Transferable[]) => void;

/**
 * The worker side: returns the `onmessage` handler. Jobs run one after another in arrival order
 * would block a cancel, so each job runs as soon as it arrives and checks its AbortSignal between
 * staves (the pipeline yields to the event loop there, which lets a `cancel` message in).
 */
export function createOmrWorkerHandler(post: PostFn): (msg: OmrRequest) => void {
  const jobs = new Map<number, AbortController>();
  const asks = new Map<number, (value: unknown) => void>();
  let nextAsk = 1;

  const remoteModel = (jobId: number, signal: AbortSignal): OmrVisionModel => ({
    ask(image, prompt, s) {
      const askId = nextAsk++;
      return new Promise<unknown>((resolve) => {
        const stop = (): void => {
          asks.delete(askId);
          resolve(null);
        };
        if (signal.aborted || s?.aborted) return stop();
        signal.addEventListener('abort', stop, { once: true });
        s?.addEventListener('abort', stop, { once: true });
        asks.set(askId, (value) => {
          signal.removeEventListener('abort', stop);
          asks.delete(askId);
          resolve(value);
        });
        if ('gray' in image) {
          const gray = { width: image.gray.width, height: image.gray.height, data: image.gray.data.slice() };
          post({ type: 'ai-ask', id: jobId, askId, image: { gray }, prompt }, [gray.data.buffer as ArrayBuffer]);
        } else {
          const rgba = image.rgba.slice();
          post({ type: 'ai-ask', id: jobId, askId, image: { rgba, width: image.width, height: image.height }, prompt }, [rgba.buffer as ArrayBuffer]);
        }
      });
    },
  });

  const run = async (id: number, work: (signal: AbortSignal) => Promise<Omit<Extract<OmrResponse, { type: 'result' }>, 'type' | 'id'>>): Promise<void> => {
    const ctl = new AbortController();
    jobs.set(id, ctl);
    try {
      const result = await work(ctl.signal);
      post({ type: 'result', id, ...result });
    } catch (err) {
      const e = err as { name?: string; message?: string };
      post({ type: 'error', id, name: isCancelled(err) ? 'AbortError' : e?.name ?? 'Error', message: e?.message ?? String(err) });
    } finally {
      jobs.delete(id);
    }
  };

  return (msg: OmrRequest): void => {
    switch (msg.type) {
      case 'recognize':
        void run(msg.id, async (signal) => {
          const options: RecognizePageOptions = {
            ...msg.options,
            signal,
            ai: msg.ai ? remoteModel(msg.id, signal) : null,
            onProgress: (progress) => post({ type: 'progress', id: msg.id, progress }),
          };
          if (msg.document) return { document: await recognizeDocument(msg.images, options) };
          return { page: await recognizePage(msg.images[0], options) };
        });
        break;
      case 'classify':
        void run(msg.id, async () => ({ classification: classifyPage(msg.image, { maxSide: msg.maxSide }) }));
        break;
      case 'cancel':
        jobs.get(msg.id)?.abort();
        break;
      case 'ai-answer':
        asks.get(msg.askId)?.(msg.value);
        break;
      default:
        break;
    }
  };
}
