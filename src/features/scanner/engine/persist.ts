/**
 * Keeping the unsaved scan on the device (the platform blob store, namespace `scanner`):
 *
 *   draft/state.json        the description (`snapshot.ts`), written last
 *   draft/doc.json          the reading as the sheet reader gave it, stamped
 *   draft/history.json      the draft being proofread with its recent undo steps, stamped
 *   draft/pic/<id>          each page picture, written once
 *   draft/thumb/<id>        its thumbnail
 *
 * Writes are debounced (a burst of edits is one write) and run one at a time; each writes only
 * what changed since the last one (a picture is never written twice; the reading only when it is a
 * new reading). A picture nothing names any more is removed after the description that dropped it.
 * Saving the song, "Start over" and "Start fresh" clear it all.
 */
import type { BlobStore } from '@/core/platform/blobs';
import type { OmrDocument } from '@/core/omr/pipeline';
import type { History } from '../model/select';
import { type KeptPage, type ScanSnapshot, type SnapshotInput, makeSnapshot, readDocument, readHistory, readSnapshot, trimHistory, worthOffering } from './snapshot';

const STATE = 'draft/state.json';
const DOC = 'draft/doc.json';
const HISTORY = 'draft/history.json';
const PIC = 'draft/pic/';
const THUMB = 'draft/thumb/';

/** A page of the screen as the keeper needs it. */
export interface PageWithPictures extends Omit<KeptPage, 'pic' | 'thumb'> {
  blob: Blob;
  thumbBlob?: Blob;
}

/** What the screen hands over to keep (null: nothing worth keeping, clear it). */
export interface KeepInput extends Omit<SnapshotInput, 'pages' | 'readPages' | 'docId' | 'historyId'> {
  pages: PageWithPictures[];
  readPages: PageWithPictures[];
  doc: OmrDocument | null;
}

/** A kept scan read back. */
export interface LoadedScan {
  snapshot: ScanSnapshot;
  /** Pictures and thumbnails by id. */
  pictures: Map<string, Blob>;
  doc: OmrDocument | null;
  history: History | null;
}

/** Where the keeper is. */
export type KeeperState = 'off' | 'idle' | 'pending' | 'saving' | 'saved' | 'cleared' | 'failed';

/** The keeper of one screen. */
export interface DraftKeeper {
  readonly state: KeeperState;
  /** True when what is kept survives closing the page. */
  readonly persistent: boolean;
  /** The last failure, in words. */
  readonly error: string | null;
  /** Something changed: keep it soon (`build` is called when the write happens). */
  schedule(build: () => KeepInput | null): void;
  /** Write now what was scheduled (the page is being hidden). */
  flush(): Promise<void>;
  /** Forget the kept scan. */
  clear(): Promise<void>;
  /** The kept scan, or null. Pictures it names but that are missing leave their pages out. */
  load(): Promise<LoadedScan | null>;
  /** Pictures that came back from `load` keep their ids (so they are not written again). */
  adopt(pictures: Map<string, Blob>): void;
  /** Put a loaded scan back exactly as it was (undo of a `clear`). */
  restore(loaded: LoadedScan): Promise<void>;
  /** Called on every state change. */
  subscribe(fn: (state: KeeperState) => void): () => void;
}

/** Options for {@link createDraftKeeper}. */
export interface KeeperOptions {
  /** Quiet time before a write, ms (default 700). */
  delay?: number;
  /** Longest a change waits while edits keep coming, ms (default 3000). */
  maxWait?: number;
  now?: () => number;
}

let stampCounter = 0;
const stamp = (): string => `${Date.now().toString(36)}${(stampCounter++).toString(36)}`;

/** A keeper on a blob store (a promise, so the screen does not wait for IndexedDB to open). */
export function createDraftKeeper(storeP: Promise<BlobStore | null>, opts: KeeperOptions = {}): DraftKeeper {
  const delay = opts.delay ?? 700;
  const maxWait = opts.maxWait ?? 3000;
  const now = opts.now ?? Date.now;
  let state: KeeperState = 'idle';
  let error: string | null = null;
  let persistent = false;
  let store: BlobStore | null = null;
  const ready = storeP.then(
    (s) => {
      store = s;
      persistent = !!s?.persistent;
      if (!s) set('off');
      return s;
    },
    () => {
      set('off');
      return null;
    },
  );
  const listeners = new Set<(s: KeeperState) => void>();
  const set = (s: KeeperState) => {
    if (s === state) return;
    state = s;
    for (const fn of listeners) fn(s);
  };

  // Ids of pictures, and the ones known to be in the store.
  const ids = new WeakMap<Blob, string>();
  const written = new Set<string>();
  const idOf = (b: Blob): string => {
    let id = ids.get(b);
    if (!id) ids.set(b, (id = `p${stamp()}`));
    return id;
  };
  let lastDoc: OmrDocument | null | undefined;
  let lastHistory: History | null | undefined;
  let docId: string | null = null;
  let historyId: string | null = null;

  let pending: (() => KeepInput | null) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstAt = 0;
  let running: Promise<void> = Promise.resolve();

  const write = async (input: KeepInput | null): Promise<void> => {
    const s = store;
    if (!s) return;
    if (!input) {
      await wipe(s);
      return;
    }
    const keptPage = (p: PageWithPictures): KeptPage => {
      const { blob, thumbBlob, ...rest } = p;
      return { ...rest, pic: idOf(blob), thumb: thumbBlob ? idOf(thumbBlob) : null };
    };
    // Pictures first, each once.
    const named = new Set<string>();
    for (const p of [...input.pages, ...input.readPages]) {
      for (const [b, prefix] of [[p.blob, PIC], [p.thumbBlob, THUMB]] as const) {
        if (!b) continue;
        const id = idOf(b);
        named.add(prefix + id);
        if (written.has(prefix + id)) continue;
        await s.put(prefix + id, b);
        written.add(prefix + id);
      }
    }
    const reading = input.history ? input.doc : null;
    if (reading !== lastDoc) {
      if (reading) {
        docId = stamp();
        await s.putJSON(DOC, { id: docId, doc: reading });
      } else {
        docId = null;
        await s.delete(DOC);
      }
      lastDoc = reading;
    }
    if (input.history !== lastHistory) {
      if (input.history) {
        historyId = stamp();
        await s.putJSON(HISTORY, { id: historyId, history: trimHistory(input.history) });
      } else {
        historyId = null;
        await s.delete(HISTORY);
      }
      lastHistory = input.history;
    }
    const snapshot = makeSnapshot({ ...input, pages: input.pages.map(keptPage), readPages: input.readPages.map(keptPage), docId, historyId }, now());
    await s.putJSON(STATE, snapshot);
    // Pictures nothing names any more.
    for (const e of [...(await s.list(PIC)), ...(await s.list(THUMB))]) {
      if (named.has(e.key)) continue;
      await s.delete(e.key);
      written.delete(e.key);
    }
  };

  const wipe = async (s: BlobStore): Promise<void> => {
    await s.deletePrefix('draft/');
    written.clear();
    lastDoc = undefined;
    lastHistory = undefined;
    docId = null;
    historyId = null;
  };

  const run = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    const build = pending;
    pending = null;
    if (!build) return running;
    running = running.then(async () => {
      const s = await ready;
      if (!s) return;
      set('saving');
      try {
        const input = build();
        await write(input);
        error = null;
        set(input ? 'saved' : 'cleared');
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        // What is in the store may be half old, half new: the next write starts from scratch.
        written.clear();
        lastDoc = undefined;
        lastHistory = undefined;
        set('failed');
      }
      // Changes made while writing.
      if (pending) set('pending');
    });
    return running;
  };

  return {
    get state() {
      return state;
    },
    get persistent() {
      return persistent;
    },
    get error() {
      return error;
    },
    schedule(build) {
      if (state === 'off') return;
      const t = now();
      if (!pending) firstAt = t;
      pending = build;
      set('pending');
      if (timer) clearTimeout(timer);
      const wait = Math.max(0, Math.min(delay, firstAt + maxWait - t));
      timer = setTimeout(() => void run(), wait);
    },
    flush: () => run(),
    clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      running = running.then(async () => {
        const s = await ready;
        if (!s) return;
        try {
          await wipe(s);
          set('cleared');
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          set('failed');
        }
      });
      return running;
    },
    async load() {
      const s = await ready;
      if (!s) return null;
      try {
        const snapshot = readSnapshot(await s.getJSON(STATE, null));
        if (!snapshot) return null;
        const pictures = new Map<string, Blob>();
        const fetchPic = async (prefix: string, id: string | null): Promise<boolean> => {
          if (!id) return false;
          if (pictures.has(id)) return true;
          const b = await s.get(prefix + id);
          if (b) pictures.set(id, b);
          return !!b;
        };
        const usable = async (list: KeptPage[]): Promise<KeptPage[]> => {
          const out: KeptPage[] = [];
          for (const p of list) {
            if (!(await fetchPic(PIC, p.pic))) continue;
            if (!(await fetchPic(THUMB, p.thumb))) p.thumb = null;
            out.push(p);
          }
          return out;
        };
        snapshot.pages = await usable(snapshot.pages);
        snapshot.readPages = await usable(snapshot.readPages);
        let doc: OmrDocument | null = null;
        let history: History | null = null;
        if (snapshot.docId && snapshot.historyId) {
          const d = await s.getJSON<{ id?: string; doc?: unknown } | null>(DOC, null);
          const h = await s.getJSON<{ id?: string; history?: unknown } | null>(HISTORY, null);
          if (d?.id === snapshot.docId && h?.id === snapshot.historyId) {
            doc = readDocument(d.doc);
            history = readHistory(h.history);
          }
        }
        // Without its reading (or its pictures), a reading is offered back as its pages.
        if (!doc || !history || !snapshot.readPages.length) {
          if (snapshot.phase === 'music') snapshot.phase = 'pages';
          doc = null;
          history = null;
          snapshot.readPages = [];
        }
        if (!worthOffering(snapshot)) return null;
        return { snapshot, pictures, doc, history };
      } catch {
        return null;
      }
    },
    adopt(pictures) {
      for (const [id, b] of pictures) {
        ids.set(b, id);
        written.add(PIC + id);
        written.add(THUMB + id);
      }
    },
    restore(loaded) {
      running = running.then(async () => {
        const s = await ready;
        if (!s) return;
        try {
          for (const p of [...loaded.snapshot.pages, ...loaded.snapshot.readPages]) {
            for (const [prefix, id] of [[PIC, p.pic], [THUMB, p.thumb]] as const) {
              const b = id ? loaded.pictures.get(id) : undefined;
              if (!id || !b || written.has(prefix + id)) continue;
              await s.put(prefix + id, b);
              ids.set(b, id);
              written.add(prefix + id);
            }
          }
          if (loaded.doc && loaded.history && loaded.snapshot.docId && loaded.snapshot.historyId) {
            await s.putJSON(DOC, { id: loaded.snapshot.docId, doc: loaded.doc });
            await s.putJSON(HISTORY, { id: loaded.snapshot.historyId, history: loaded.history });
          }
          await s.putJSON(STATE, loaded.snapshot);
          set('saved');
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          set('failed');
        }
      });
      return running;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
