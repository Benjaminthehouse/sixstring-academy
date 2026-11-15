/**
 * The song library: the one place songs come from. Built-in songs (from `@/content/songs`, notes
 * loaded on demand) and the learner's own songs (imported, pasted, typed or scanned; kept in a
 * `SongStore`) behind one API with change notifications.
 */
import {
  FORMAT_NAMES,
  detectTextFormat,
  importSong,
  parseSixTab,
  slugify,
  songFromJson,
  songToJson,
  validateSong,
  type ImportResult,
  type ImportWarning,
  type Song,
  type SongFormat,
} from '@/core/song';
import { parseKey } from '@/core/theory';
import { sniffFile } from '@/core/platform';
import { SONG_ENTRIES, loadSongText, type SongEntry } from '@/content/songs';
import { exportSongAs } from './export';
import { filterSongs, type FilterContext, type SongFilter } from './filter';
import { MAX_SONGS, MAX_SONG_BYTES, byteSize, createDefaultStore, type SongStore } from './store';
import { summarizeSong } from './summary';
import {
  LibraryError,
  type ExportFormat,
  type ImportedSong,
  type LibraryStatus,
  type SongDetailsPatch,
  type SongExport,
  type SongListing,
  type SongOrigin,
  type SongOriginKind,
  type SongSummary,
} from './types';

/** Largest file `importFile` reads, in bytes. */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
/** Prefix of the learner's song ids (built-in ids never start with it). */
export const MINE_PREFIX = 'my-';

/** Where built-in songs come from (the content registry by default; tests pass their own). */
export interface BuiltinSource {
  entries: readonly SongEntry[];
  load(id: string): Promise<string>;
}

/** Options of `createLibrary`. */
export interface LibraryOptions {
  /** Where the learner's songs live (default: IndexedDB, else the key-value fallback). */
  store?: SongStore | Promise<SongStore>;
  builtins?: BuiltinSource;
  now?: () => number;
  random?: () => number;
  /** Tell other tabs about changes (BroadcastChannel; default true in a browser). */
  broadcast?: boolean;
}

/** What `remove` hands back so the deletion can be undone with `restore`. */
export interface RemovedSong {
  listing: SongListing;
  json: string;
}

/** Options of `save`. */
export interface SaveOptions {
  origin?: SongOrigin;
  warnings?: ImportWarning[];
  confidence?: number;
  estimatedRhythm?: boolean;
  /** Replace this existing song of the learner's (keeps its id, added date and details). */
  replace?: string;
}

/** The song library. Create with `createLibrary`, or use the app's own with `getLibrary()`. */
export interface Library {
  /** Every song: built-in and the learner's, or those passing `filter` (unsorted; see `sortSongs`). */
  list(filter?: SongFilter, ctx?: FilterContext): Promise<SongListing[]>;
  /** What `list()` last returned (built-in songs only until the learner's are loaded), without waiting. */
  snapshot(): { songs: SongListing[]; ready: boolean };
  /** One listing, or null. */
  get(id: string): Promise<SongListing | null>;
  /** The full song (rejects with `LibraryError('not-found')`). The result is the caller's to change. */
  load(id: string): Promise<Song>;
  /** The summary of any song (built-in summaries are computed on first request and kept). */
  summary(id: string): Promise<SongSummary>;
  /** Add a song to the learner's library (or replace one with `replace`). */
  save(song: Song, opts?: SaveOptions): Promise<SongListing>;
  /** Change the learner's details of one of their songs. Built-in songs are read-only. */
  update(id: string, patch: SongDetailsPatch): Promise<SongListing>;
  rename(id: string, title: string): Promise<SongListing>;
  /** Delete one of the learner's songs; keep the result to `restore` it (undo). */
  remove(id: string): Promise<RemovedSong>;
  restore(removed: RemovedSong): Promise<SongListing>;
  /** Copy any song (built-in or the learner's) into the learner's library. */
  duplicate(id: string, opts?: { title?: string }): Promise<SongListing>;
  /** Read a file (any format the song core imports) and save it. */
  importFile(file: Blob & { name?: string }, opts?: { kind?: SongOriginKind; title?: string }): Promise<ImportedSong>;
  /** Read pasted or typed text (text tab, chord sheet, ChordPro, SixTab, MusicXML) and save it. */
  importText(text: string, opts?: { title?: string; kind?: SongOriginKind }): Promise<ImportedSong>;
  exportSong(id: string, format: ExportFormat): Promise<SongExport>;
  /** Called after every change (also changes made in another tab). Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  status(): Promise<LibraryStatus>;
}

/** `G` -> `G major`, `Em` -> `E minor`; undefined when it is not a key. */
export function keyLabel(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const k = parseKey(text);
  return k ? `${k.tonic} ${k.mode}` : undefined;
}

/** The listing of a built-in song (without its summary). */
export function builtinListing(e: SongEntry): SongListing {
  const added = Date.parse(e.added);
  return {
    id: e.id,
    source: 'built-in',
    title: e.title,
    composer: e.composer,
    level: e.level,
    levelSource: 'authored',
    style: e.style,
    kind: e.kind,
    key: e.key,
    tags: [...e.tags],
    skills: [...e.skills],
    teaches: [...e.teaches],
    about: e.about,
    origin: e.origin,
    publicDomain: e.publicDomain,
    addedAt: Number.isNaN(added) ? 0 : added,
    updatedAt: Number.isNaN(added) ? 0 : added,
  };
}

/** Is this the id of one of the learner's songs? */
export function isMineId(id: string): boolean {
  return id.startsWith(MINE_PREFIX);
}

const NOT_FOUND = 'That song is not in your library any more. It may have been deleted.';

/** Create a library on a store. */
export function createLibrary(opts: LibraryOptions = {}): Library {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  const builtins = opts.builtins ?? { entries: SONG_ENTRIES, load: loadSongText };
  const storePromise: Promise<SongStore> = Promise.resolve(opts.store ?? createDefaultStore());
  const listeners = new Set<() => void>();

  let builtinList: SongListing[] = builtins.entries.map(builtinListing);
  const builtinIds = new Set(builtinList.map((s) => s.id));
  const builtinSummaries = new Map<string, Promise<SongSummary>>();
  let mine: Map<string, SongListing> | null = null;
  let mineLoading: Promise<Map<string, SongListing>> | null = null;
  /** Bumped by every change, so a load that started before it does not overwrite newer state. */
  let generation = 0;
  const songCache = new Map<string, { stamp: number; song: Song }>();
  const SONG_CACHE_SIZE = 16;

  const channel: BroadcastChannel | null =
    (opts.broadcast ?? true) && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ssa-library') : null;
  if (channel) {
    channel.onmessage = () => {
      mine = null;
      mineLoading = null;
      songCache.clear();
      generation++;
      notify(false);
    };
  }

  function notify(tellOthers = true) {
    for (const l of [...listeners]) {
      try {
        l();
      } catch {
        // A broken listener must not stop the others.
      }
    }
    if (tellOthers) channel?.postMessage('changed');
  }

  async function loadMine(): Promise<Map<string, SongListing>> {
    if (mine) return mine;
    if (!mineLoading) {
      const gen = generation;
      mineLoading = storePromise
        .then((s) => s.entries())
        .then((list) => {
          const map = new Map(list.filter((e) => e && isMineId(e.id)).map((e) => [e.id, e]));
          if (gen === generation) mine = map;
          return map;
        })
        .catch((e) => {
          mineLoading = null;
          throw e;
        });
    }
    return mineLoading;
  }

  function all(m: Map<string, SongListing> | null): SongListing[] {
    return m ? [...m.values(), ...builtinList] : [...builtinList];
  }

  function cacheSong(id: string, stamp: number, song: Song) {
    songCache.delete(id);
    songCache.set(id, { stamp, song });
    while (songCache.size > SONG_CACHE_SIZE) songCache.delete(songCache.keys().next().value as string);
  }

  async function loadBuiltin(id: string): Promise<Song> {
    const cached = songCache.get(id);
    if (cached) return structuredClone(cached.song);
    const text = await builtins.load(id);
    const result = parseSixTab(text);
    if (!result.song) throw new LibraryError('unreadable', 'This song could not be read.', result.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n'));
    result.song.meta.id = id;
    cacheSong(id, 0, result.song);
    return structuredClone(result.song);
  }

  async function loadMineSong(id: string): Promise<Song> {
    const listing = (await loadMine()).get(id);
    if (!listing) throw new LibraryError('not-found', NOT_FOUND);
    const cached = songCache.get(id);
    if (cached && cached.stamp === listing.updatedAt) return structuredClone(cached.song);
    const store = await storePromise;
    const json = await store.song(id);
    if (!json) throw new LibraryError('not-found', NOT_FOUND);
    let song: Song;
    try {
      song = songFromJson(json);
    } catch (e) {
      throw new LibraryError('unreadable', 'This song is stored but could not be read back.', e instanceof Error ? e.message : String(e));
    }
    song.meta.id = id;
    cacheSong(id, listing.updatedAt, song);
    return structuredClone(song);
  }

  function newId(title: string, taken: Map<string, SongListing>): string {
    const base = slugify(title).slice(0, 40).replace(/-+$/, '') || 'song';
    for (;;) {
      const tail = Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0');
      const id = `${MINE_PREFIX}${base}-${tail}`;
      if (!taken.has(id) && !builtinIds.has(id)) return id;
    }
  }

  async function usedBytes(m: Map<string, SongListing>, except?: string): Promise<number> {
    let total = 0;
    for (const e of m.values()) if (e.id !== except) total += e.bytes ?? 0;
    return total;
  }

  async function writeSong(listing: SongListing, song: Song): Promise<SongListing> {
    const store = await storePromise;
    const json = songToJson(song, { pretty: false });
    const bytes = byteSize(json);
    if (bytes > MAX_SONG_BYTES) {
      throw new LibraryError('too-large', `This song is too big to keep (${Math.round(bytes / 1024)} KB; the limit is ${MAX_SONG_BYTES / 1024 / 1024} MB). Try importing just one part of it.`);
    }
    const m = await loadMine();
    if (!m.has(listing.id) && m.size >= MAX_SONGS) {
      throw new LibraryError('full', `Your library holds ${MAX_SONGS} songs, which is the most it can keep. Delete a few you no longer play first.`);
    }
    if ((await usedBytes(m, listing.id)) + bytes > store.limitBytes) {
      throw new LibraryError('full', 'There is no room left for this song on this device. Delete a few songs you no longer need, then try again.');
    }
    const stored: SongListing = { ...listing, bytes };
    await store.put(stored, json);
    generation++;
    m.set(stored.id, stored);
    mine = m;
    cacheSong(stored.id, stored.updatedAt, song);
    notify();
    return stored;
  }

  /** Make a song safe to keep: the id, a title, and no errors the player would trip over. */
  function prepare(song: Song, id: string): Song {
    const copy = structuredClone(song);
    copy.meta = { ...copy.meta, id, title: copy.meta.title?.trim() || 'Untitled song' };
    const errors = validateSong(copy).filter((i) => i.level === 'error');
    if (errors.length) {
      throw new LibraryError('unreadable', 'This song has problems the player cannot work around, so it was not saved.', errors.slice(0, 8).map((e) => e.message).join('\n'));
    }
    return copy;
  }

  function listingFor(song: Song, id: string, base: Partial<SongListing>, summary: SongSummary): SongListing {
    const t = now();
    const authored = typeof song.meta.difficulty === 'number' && song.meta.difficulty >= 1 && song.meta.difficulty <= 10;
    const set = base.levelSource === 'set' && typeof base.level === 'number';
    return {
      id,
      source: 'mine',
      title: song.meta.title,
      composer: song.meta.composer ?? song.meta.artist ?? base.composer,
      level: set ? base.level! : authored ? Math.round(song.meta.difficulty!) : summary.estimatedLevel,
      levelSource: set ? 'set' : authored ? 'authored' : 'estimated',
      style: base.style,
      kind: base.kind,
      key: keyLabel(song.key) ?? base.key,
      tags: base.tags ?? song.meta.tags ?? [],
      skills: summary.skills,
      teaches: [],
      notes: base.notes,
      addedAt: base.addedAt ?? t,
      updatedAt: Math.max(t, (base.updatedAt ?? 0) + 1),
      summary,
      imported: base.imported,
    };
  }

  async function finishImport(result: ImportResult & { format: SongFormat }, origin: SongOrigin, title?: string): Promise<ImportedSong> {
    const song = result.song;
    if (title?.trim()) song.meta.title = title.trim();
    const hasMusic = song.tracks.some((t) => t.measures.some((m) => m.beats.some((b) => b.notes.length || b.slash))) || song.chords.length > 0;
    if (!hasMusic) throw new LibraryError('empty', 'No notes or chords were found in it, so there is nothing to play.');
    const listing = await lib.save(song, { origin, warnings: result.warnings, confidence: result.confidence, estimatedRhythm: !!result.estimatedRhythm });
    return {
      listing,
      format: result.format,
      formatName: FORMAT_NAMES[result.format],
      warnings: result.warnings,
      confidence: result.confidence,
      estimatedRhythm: !!result.estimatedRhythm,
    };
  }

  async function runImporter(run: () => Promise<ImportResult & { format: SongFormat }>): Promise<ImportResult & { format: SongFormat }> {
    try {
      return await run();
    } catch (e) {
      if (e instanceof LibraryError) throw e;
      if (e instanceof RangeError) throw new LibraryError('unsupported', e.message);
      throw new LibraryError('unreadable', 'The file could not be read. It may be damaged, or saved by a program this app does not know.', e instanceof Error ? e.message : String(e));
    }
  }

  const lib: Library = {
    async list(filter, ctx) {
      const songs = all(await loadMine());
      return filter ? filterSongs(songs, filter, ctx) : songs;
    },

    snapshot() {
      return { songs: all(mine), ready: mine !== null };
    },

    async get(id) {
      if (isMineId(id)) return (await loadMine()).get(id) ?? null;
      return builtinList.find((s) => s.id === id) ?? null;
    },

    async load(id) {
      if (isMineId(id)) return loadMineSong(id);
      if (!builtinIds.has(id)) throw new LibraryError('not-found', NOT_FOUND);
      return loadBuiltin(id);
    },

    async summary(id) {
      if (isMineId(id)) {
        const listing = (await loadMine()).get(id);
        if (!listing) throw new LibraryError('not-found', NOT_FOUND);
        if (listing.summary) return listing.summary;
        return summarizeSong(await loadMineSong(id));
      }
      if (!builtinIds.has(id)) throw new LibraryError('not-found', NOT_FOUND);
      let pending = builtinSummaries.get(id);
      if (!pending) {
        pending = loadBuiltin(id).then((song) => {
          const summary = summarizeSong(song);
          builtinList = builtinList.map((s) => (s.id === id ? { ...s, summary } : s));
          return summary;
        });
        pending.catch(() => builtinSummaries.delete(id));
        builtinSummaries.set(id, pending);
      }
      return pending;
    },

    async save(song, o = {}) {
      const m = await loadMine();
      const existing = o.replace ? m.get(o.replace) : undefined;
      if (o.replace && !existing) throw new LibraryError(isMineId(o.replace) ? 'not-found' : 'read-only', isMineId(o.replace) ? NOT_FOUND : 'Built-in songs cannot be changed. Make a copy to edit it.');
      const id = existing?.id ?? newId(song.meta.title || 'song', m);
      const prepared = prepare(song, id);
      const summary = summarizeSong(prepared);
      const imported = o.origin || o.warnings ? { origin: o.origin ?? { kind: 'other' as const }, warnings: o.warnings ?? [], confidence: o.confidence, estimatedRhythm: o.estimatedRhythm } : existing?.imported;
      const listing = listingFor(prepared, id, { ...existing, imported }, summary);
      return writeSong(listing, prepared);
    },

    async update(id, patch) {
      if (!isMineId(id)) throw new LibraryError('read-only', 'Built-in songs cannot be changed. Make a copy to edit it.');
      const m = await loadMine();
      const before = m.get(id);
      if (!before) throw new LibraryError('not-found', NOT_FOUND);
      const next: SongListing = { ...before, updatedAt: Math.max(now(), before.updatedAt + 1) };
      if (patch.composer !== undefined) next.composer = patch.composer.trim() || undefined;
      if (patch.style !== undefined) next.style = patch.style ?? undefined;
      if (patch.tags !== undefined) next.tags = patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (patch.notes !== undefined) next.notes = patch.notes.trim() || undefined;
      if (patch.level !== undefined) {
        if (patch.level === null) {
          next.level = before.summary?.estimatedLevel ?? before.level;
          next.levelSource = 'estimated';
        } else {
          next.level = Math.min(10, Math.max(1, Math.round(patch.level)));
          next.levelSource = 'set';
        }
      }
      const title = patch.title?.trim();
      if (patch.title !== undefined && !title) throw new LibraryError('empty', 'A song needs a title.');
      if (title && title !== before.title) {
        // The title is part of the song too (exports, the player): rewrite it there.
        const song = await loadMineSong(id);
        song.meta.title = title;
        if (patch.composer !== undefined) song.meta.composer = next.composer;
        next.title = title;
        return writeSong(next, song);
      }
      const store = await storePromise;
      await store.put(next);
      generation++;
      m.set(id, next);
      mine = m;
      notify();
      return next;
    },

    rename(id, title) {
      return lib.update(id, { title });
    },

    async remove(id) {
      if (!isMineId(id)) throw new LibraryError('read-only', 'Built-in songs cannot be deleted.');
      const m = await loadMine();
      const listing = m.get(id);
      if (!listing) throw new LibraryError('not-found', NOT_FOUND);
      const store = await storePromise;
      const json = (await store.song(id)) ?? '';
      await store.remove(id);
      generation++;
      m.delete(id);
      mine = m;
      songCache.delete(id);
      notify();
      return { listing, json };
    },

    async restore(removed) {
      const store = await storePromise;
      const m = await loadMine();
      const listing = { ...removed.listing, updatedAt: Math.max(now(), removed.listing.updatedAt + 1) };
      await store.put(listing, removed.json);
      generation++;
      m.set(listing.id, listing);
      mine = m;
      notify();
      return listing;
    },

    async duplicate(id, o = {}) {
      const source = await lib.get(id);
      if (!source) throw new LibraryError('not-found', NOT_FOUND);
      const song = await lib.load(id);
      song.meta.title = o.title?.trim() || `${source.title} (my copy)`;
      if (source.source === 'built-in' && song.meta.difficulty === undefined) song.meta.difficulty = source.level;
      const saved = await lib.save(song, { origin: { kind: 'duplicate', from: id } });
      if (source.style || source.tags.length) return lib.update(saved.id, { style: source.style ?? null, tags: source.tags });
      return saved;
    },

    async importFile(file, o = {}) {
      const name = file.name;
      if (!file.size) throw new LibraryError('empty', 'That file is empty.');
      if (file.size > MAX_IMPORT_BYTES) {
        throw new LibraryError('too-large', `That file is ${Math.round(file.size / 1024 / 1024)} MB; songs up to ${MAX_IMPORT_BYTES / 1024 / 1024} MB can be imported.`);
      }
      const sniffed = await sniffFile(file).catch(() => null);
      if (sniffed && (sniffed.family === 'image' || sniffed.kind === 'pdf')) {
        throw new LibraryError('needs-scan', 'This is a photo or a PDF of a sheet. Scan a sheet reads those: it turns printed tab and notation into a song.');
      }
      const result = await runImporter(() => importSong(file, { name: file.name, ...(o.title ? { title: o.title } : {}) }));
      return finishImport(result, { kind: o.kind ?? 'import', format: result.format, ...(name ? { fileName: name } : {}) }, o.title);
    },

    async importText(text, o = {}) {
      if (!text.trim()) throw new LibraryError('empty', 'There is nothing to import yet: paste some tab or chords first.');
      const format = detectTextFormat(text);
      if (format === 'unknown') {
        throw new LibraryError(
          'unsupported',
          'This does not look like tab, a chord sheet or ChordPro. Tab needs six lines that start like "e|--0--"; a chord sheet needs chord names such as G, Am or D7 above the words.',
        );
      }
      const result = await runImporter(() => importSong(text, { format, ...(o.title ? { title: o.title } : {}) }));
      return finishImport(result, { kind: o.kind ?? (format === 'sixtab' ? 'typed' : 'paste'), format }, o.title);
    },

    async exportSong(id, format) {
      return exportSongAs(await lib.load(id), format);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async status() {
      const store = await storePromise;
      const m = await loadMine();
      return {
        backend: store.backend,
        persistent: store.persistent(),
        songs: m.size,
        usedBytes: await usedBytes(m),
        limitBytes: store.limitBytes,
        maxSongs: MAX_SONGS,
      };
    },
  };
  return lib;
}

let appLibrary: Library | null = null;

/** The app's library (created on first use, on IndexedDB when the browser has it). */
export function getLibrary(): Library {
  if (!appLibrary) appLibrary = createLibrary();
  return appLibrary;
}

/** Point `getLibrary()` (and the hooks) at another library, e.g. one on a memory store in tests. */
export function setLibrary(library: Library | null): void {
  appLibrary = library;
}
