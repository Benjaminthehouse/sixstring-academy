/**
 * The OMR module worker (bundled by Vite: `new Worker(new URL('./omr.worker.ts', import.meta.url),
 * { type: 'module' })`). All the work is in `protocol.ts`; see `client.ts` for the page side.
 */
import { type OmrRequest, type OmrResponse, createOmrWorkerHandler } from './protocol';

const scope = self as unknown as { postMessage(msg: OmrResponse, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<OmrRequest>) => void) | null };
const handle = createOmrWorkerHandler((msg, transfer) => scope.postMessage(msg, transfer ?? []));
scope.onmessage = (e) => handle(e.data);
