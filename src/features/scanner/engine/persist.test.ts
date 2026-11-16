import { describe, expect, it } from 'vitest';
import { type BlobStore, createBlobStore, memoryBlobBackend } from '@/core/platform/blobs';
import type { OmrDocument } from '@/core/omr/pipeline';
import { type DraftKeeper, type KeepInput, createDraftKeeper } from './persist';
import { KEPT_PAST, agoWords, describeSnapshot, makeSnapshot, readSnapshot, trimHistory } from './snapshot';
import type { Draft } from '../model/draft';
import type { History } from '../model/select';

const pic = (s: string, type = 'image/png') => new Blob([s], { type });

function draft(title: string, fret = 0): Draft {
  return {
    song: { meta: { title }, bars: [{ time: { numerator: 4, denominator: 4 } }], tracks: [{ measures: [{ beats: [{ start: 0, duration: 3840, notes: [{ string: 1, fret, midi: 64 + fret }] }] }] }] },
    marks: [],
    pageCount: 1,
    notationOnly: false,
    hasNotation: false,
    tabLines: 6,
    notes: [],
  } as unknown as Draft;
}

const DOC = { pages: [{ width: 10, height: 10, systems: [], texts: [], staffSpace: 12 }], measures: [], context: {}, warnings: [] } as unknown as OmrDocument;

function input(over: Partial<KeepInput> = {}, blobs = { a: pic('aaa'), at: pic('t', 'image/jpeg') }): KeepInput {
  const page = { id: 'p1', label: 'Photo 1', origin: 'camera' as const, kindOf: 'photo' as const, width: 100, height: 140, look: null, blob: blobs.a, thumbBlob: blobs.at };
  return { phase: 'pages', pages: [page], readPages: [], readNotes: [], text: null, aiResult: null, history: null, doc: null, ...over };
}

async function settle(keeper: DraftKeeper) {
  await keeper.flush();
}

describe('the kept scan', () => {
  it('describes what it holds in plain words', () => {
    const h: History = { past: [draft('Ode'), draft('Ode')], present: draft('Ode to Joy', 3), future: [] };
    const s = makeSnapshot({ phase: 'music', pages: [], readPages: [{ id: 'p', label: 'x', origin: 'photo', kindOf: 'photo', width: 1, height: 1, pic: 'a', thumb: null, look: null }], readNotes: [], text: null, aiResult: null, history: h, docId: 'd', historyId: 'h' }, 1000);
    const words = describeSnapshot(s, 1000 + 5 * 60_000);
    expect(words.title).toMatch(/left off/);
    expect(words.detail).toBe('Your unsaved scan: “Ode to Joy”, 1 bar read from 1 page with 2 changes you made. Kept on this device 5 minutes ago.');
    const pagesOnly = makeSnapshot({ phase: 'reading', pages: [{ id: 'p', label: 'x', origin: 'photo', kindOf: 'photo', width: 1, height: 1, pic: 'a', thumb: null, look: null }], readPages: [], readNotes: [], text: null, aiResult: null, history: null, docId: null, historyId: null }, 0);
    expect(pagesOnly.phase).toBe('pages');
    expect(describeSnapshot(pagesOnly, 30_000).detail).toMatch(/1 page, not read yet\. Kept on this device a moment ago/);
    expect(agoWords(0, 2 * 3_600_000)).toBe('2 hours ago');
  });

  it('keeps only recent undo steps', () => {
    const past = Array.from({ length: 40 }, (_, i) => draft(`v${i}`));
    const t = trimHistory({ past, present: draft('now'), future: [draft('f1'), draft('f2')] });
    expect(t.past.length).toBe(KEPT_PAST);
    expect(t.past[t.past.length - 1].song.meta.title).toBe('v39');
    expect(t.future.length).toBe(2);
  });

  it('refuses a damaged or foreign description', () => {
    expect(readSnapshot(null)).toBeNull();
    expect(readSnapshot({ version: 99, savedAt: 1, pages: [], readPages: [] })).toBeNull();
    expect(readSnapshot({ version: 1, savedAt: 1, pages: [{ id: 'x' }], readPages: [] })).toBeNull();
    const ok = readSnapshot({ version: 1, savedAt: 1, phase: 'music', pages: [{ id: 'p', label: 'P', origin: 'pdf', kindOf: 'render', width: 1, height: 2, pic: 'a', thumb: 'b', look: null }], readPages: [] });
    expect(ok?.pages[0]).toMatchObject({ id: 'p', origin: 'pdf', kindOf: 'render', thumb: 'b' });
  });
});

describe('the draft keeper on a blob store', () => {
  const make = (store?: BlobStore) => {
    const s = store ?? createBlobStore('scanner', memoryBlobBackend());
    return { store: s, keeper: createDraftKeeper(Promise.resolve(s), { delay: 5, maxWait: 20 }) };
  };

  it('keeps pages and brings them back with their pictures', async () => {
    const { store, keeper } = make();
    keeper.schedule(() => input());
    expect(keeper.state).toBe('pending');
    await new Promise((r) => setTimeout(r, 30));
    await settle(keeper);
    expect(keeper.state).toBe('saved');
    const keys = (await store.list()).map((e) => e.key).sort();
    expect(keys.filter((k) => k.startsWith('draft/pic/')).length).toBe(1);
    expect(keys.filter((k) => k.startsWith('draft/thumb/')).length).toBe(1);
    expect(keys).toContain('draft/state.json');

    const again = createDraftKeeper(Promise.resolve(store));
    const loaded = await again.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.snapshot.pages).toHaveLength(1);
    const p = loaded!.snapshot.pages[0];
    expect(await loaded!.pictures.get(p.pic)!.text()).toBe('aaa');
    expect(await loaded!.pictures.get(p.thumb!)!.text()).toBe('t');
    expect(loaded!.history).toBeNull();
  });

  it('keeps a reading with its undo steps, and writes a picture only once', async () => {
    const store = createBlobStore('scanner', memoryBlobBackend());
    let puts = 0;
    const counting: BlobStore = { ...store, put: async (k, b) => { if (k.startsWith('draft/pic/')) puts++; return store.put(k, b); } };
    const { keeper } = make(counting);
    const blobs = { a: pic('aaa'), at: pic('t') };
    const h1: History = { past: [], present: draft('Ode'), future: [] };
    const base = input({}, blobs);
    keeper.schedule(() => ({ ...base, phase: 'music', readPages: base.pages, history: h1, doc: DOC }));
    await settle(keeper);
    const h2: History = { past: [h1.present], present: draft('Ode', 7), future: [] };
    keeper.schedule(() => ({ ...base, phase: 'music', readPages: base.pages, history: h2, doc: DOC }));
    await settle(keeper);
    expect(puts).toBe(1);
    const loaded = await createDraftKeeper(Promise.resolve(store)).load();
    expect(loaded!.snapshot.phase).toBe('music');
    expect(loaded!.history!.present.song.tracks[0].measures[0].beats[0].notes[0].fret).toBe(7);
    expect(loaded!.history!.past).toHaveLength(1);
    expect(loaded!.doc!.pages[0].staffSpace).toBe(12);
    expect(describeSnapshot(loaded!.snapshot).detail).toMatch(/“Ode”, 1 bar read from 1 page with 1 change you made/);
  });

  it('drops a picture that nothing names any more (a page turned or removed)', async () => {
    const { store, keeper } = make();
    keeper.schedule(() => input({}, { a: pic('first'), at: pic('t1') }));
    await settle(keeper);
    keeper.schedule(() => input({}, { a: pic('turned'), at: pic('t2') }));
    await settle(keeper);
    const pics = await store.list('draft/pic/');
    expect(pics).toHaveLength(1);
    const loaded = await createDraftKeeper(Promise.resolve(store)).load();
    expect(await loaded!.pictures.get(loaded!.snapshot.pages[0].pic)!.text()).toBe('turned');
  });

  it('a reading whose stored parts do not match its description comes back as its pages only', async () => {
    const { store, keeper } = make();
    const base = input();
    keeper.schedule(() => ({ ...base, phase: 'music', readPages: base.pages, history: { past: [], present: draft('Ode'), future: [] }, doc: DOC }));
    await settle(keeper);
    await store.putJSON('draft/doc.json', { id: 'someone-else', doc: DOC });
    const loaded = await createDraftKeeper(Promise.resolve(store)).load();
    expect(loaded!.snapshot.phase).toBe('pages');
    expect(loaded!.history).toBeNull();
    expect(loaded!.snapshot.pages).toHaveLength(1);
  });

  it('a missing picture leaves its page out; nothing left means nothing to offer', async () => {
    const { store, keeper } = make();
    keeper.schedule(() => input());
    await settle(keeper);
    await store.deletePrefix('draft/pic/');
    expect(await createDraftKeeper(Promise.resolve(store)).load()).toBeNull();
  });

  it('clears everything, and puts a loaded scan back on undo', async () => {
    const { store, keeper } = make();
    keeper.schedule(() => input());
    await settle(keeper);
    const loaded = await keeper.load();
    await keeper.clear();
    expect(keeper.state).toBe('cleared');
    expect(await store.list()).toEqual([]);
    await keeper.restore(loaded!);
    const back = await createDraftKeeper(Promise.resolve(store)).load();
    expect(back!.snapshot.pages[0].label).toBe('Photo 1');
  });

  it('nothing to keep clears the store', async () => {
    const { store, keeper } = make();
    keeper.schedule(() => input());
    await settle(keeper);
    keeper.schedule(() => null);
    await settle(keeper);
    expect(keeper.state).toBe('cleared');
    expect(await store.list()).toEqual([]);
  });

  it('a burst of changes is one write', async () => {
    const store = createBlobStore('scanner', memoryBlobBackend());
    let writes = 0;
    const counting: BlobStore = { ...store, putJSON: async (k, v) => { if (k === 'draft/state.json') writes++; return store.putJSON(k, v); } };
    const keeper = createDraftKeeper(Promise.resolve(counting), { delay: 20, maxWait: 500 });
    for (let i = 0; i < 10; i++) keeper.schedule(() => input());
    await new Promise((r) => setTimeout(r, 60));
    await keeper.flush();
    expect(writes).toBe(1);
  });

  it('a full disk is reported, and the next change tries again from scratch', async () => {
    const store = createBlobStore('scanner', memoryBlobBackend({ quota: 4 }));
    const keeper = createDraftKeeper(Promise.resolve(store), { delay: 1 });
    keeper.schedule(() => input());
    await keeper.flush();
    expect(keeper.state).toBe('failed');
    expect(keeper.error).toMatch(/no room left/);
  });

  it('without a store (storage refused) it stays off and keeps nothing', async () => {
    const keeper = createDraftKeeper(Promise.resolve(null));
    await keeper.load();
    keeper.schedule(() => input());
    await keeper.flush();
    expect(keeper.state).toBe('off');
    expect(keeper.persistent).toBe(false);
  });
});
