/**
 * The learner's own songs in a backup file and in cloud sync: written out exactly as the library
 * stores them (the listing with the learner's details, and the song JSON), checked one by one on
 * the way back in, and restored with the same id. Built-in songs are never part of a backup.
 */
import { songFromJson, songToJson, type ImportWarning, type SongFormat } from '@/core/song';
import { getLibrary, isMineId, type Library, type RemovedSong } from './library';
import { MAX_SONG_BYTES, byteSize } from './store';
import { summarizeSong } from './summary';
import { SONG_KINDS, SONG_STYLES } from '@/content/songs';
import type { SongListing, SongOriginKind } from './types';

/** One of the learner's songs as a backup carries it. */
export interface SongBackup {
  /** The library listing without what can be worked out again (summary, size). */
  listing: Omit<SongListing, 'summary' | 'bytes'>;
  /** The song, exactly as stored (`songToJson`, compact). */
  json: string;
}

/** What importing a backup's songs did. */
export interface SongImportResult {
  /** Ids of songs that were not here before. */
  added: string[];
  /** Songs that were here and were overwritten by the file's copy: their previous versions, for undo. */
  replaced: RemovedSong[];
  /** Ids already here and kept as they are (the same, or newer here when merging). */
  kept: string[];
  /** Entries in the file that are not readable songs. */
  skipped: number;
  /** Ids that could not be stored (no room). */
  failed: string[];
}

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown, max = 500): string | undefined => (typeof value === 'string' && value.trim() ? value.slice(0, max) : undefined);
const time = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback);
const ORIGINS: readonly SongOriginKind[] = ['import', 'paste', 'typed', 'scan', 'duplicate', 'other'];

/** A listing as the backup keeps it. */
function portableListing(listing: SongListing): SongBackup['listing'] {
  const { summary: _summary, bytes: _bytes, ...rest } = listing;
  return rest;
}

/** Every one of the learner's songs, exactly as stored. Built-in songs are left out. */
export async function exportMySongs(lib: Library = getLibrary()): Promise<SongBackup[]> {
  const mine = (await lib.list()).filter((s) => s.source === 'mine');
  const out: SongBackup[] = [];
  for (const listing of mine) {
    try {
      out.push({ listing: portableListing(listing), json: songToJson(await lib.load(listing.id), { pretty: false }) });
    } catch {
      // A song that cannot be read back is not worth stopping the whole backup for.
    }
  }
  return out;
}

/** Does this look like a backed-up song (cheap: for counting in a preview, not a full check)? */
export function looksLikeSongBackup(item: unknown): item is SongBackup {
  return isRec(item) && isRec(item.listing) && typeof item.listing.id === 'string' && isMineId(item.listing.id) && typeof item.json === 'string';
}

/**
 * Turn a backed-up song into one the library can restore, or null when it is not a readable song.
 * The listing's details are checked field by field; the summary and size are worked out again.
 */
export function songFromBackup(item: unknown, now: number = Date.now()): RemovedSong | null {
  if (!looksLikeSongBackup(item)) return null;
  const raw = item.listing as unknown as Rec;
  const id = String(raw.id);
  if (!/^my-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || byteSize(item.json) > MAX_SONG_BYTES) return null;
  let summary;
  try {
    const song = songFromJson(item.json);
    summary = summarizeSong(song);
  } catch {
    return null;
  }
  const levelSource = raw.levelSource === 'set' || raw.levelSource === 'authored' ? raw.levelSource : 'estimated';
  const level = typeof raw.level === 'number' && raw.level >= 1 && raw.level <= 10 ? Math.round(raw.level) : summary.estimatedLevel;
  const addedAt = time(raw.addedAt, now);
  const listing: SongListing = {
    id,
    source: 'mine',
    title: str(raw.title, 200) ?? 'Untitled song',
    level,
    levelSource,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 40)).slice(0, 20) : [],
    skills: summary.skills,
    teaches: [],
    addedAt,
    updatedAt: time(raw.updatedAt, addedAt),
    summary,
    bytes: byteSize(item.json),
  };
  const composer = str(raw.composer, 200);
  if (composer) listing.composer = composer;
  if (typeof raw.style === 'string' && (SONG_STYLES as readonly string[]).includes(raw.style)) listing.style = raw.style as SongListing['style'];
  if (typeof raw.kind === 'string' && (SONG_KINDS as readonly string[]).includes(raw.kind)) listing.kind = raw.kind as SongListing['kind'];
  const key = str(raw.key, 40);
  if (key) listing.key = key;
  const notes = str(raw.notes, 4000);
  if (notes) listing.notes = notes;
  if (isRec(raw.imported) && isRec(raw.imported.origin)) {
    const origin = raw.imported.origin;
    const kind = ORIGINS.includes(origin.kind as SongOriginKind) ? (origin.kind as SongOriginKind) : 'other';
    listing.imported = {
      origin: { kind, ...(typeof origin.format === 'string' ? { format: origin.format as SongFormat } : {}), ...(str(origin.fileName, 200) ? { fileName: str(origin.fileName, 200) } : {}), ...(str(origin.from, 200) ? { from: str(origin.from, 200) } : {}) },
      warnings: Array.isArray(raw.imported.warnings) ? (raw.imported.warnings.filter(isRec).slice(0, 50) as unknown as ImportWarning[]) : [],
      ...(typeof raw.imported.confidence === 'number' ? { confidence: raw.imported.confidence } : {}),
      ...(raw.imported.estimatedRhythm === true ? { estimatedRhythm: true } : {}),
    };
  }
  return { listing, json: item.json };
}

/** A fingerprint of what the learner sees of a song (its notes and their details, not when it was saved). */
export function songContentSum(item: { listing: Pick<SongListing, 'title' | 'composer' | 'level' | 'levelSource' | 'style' | 'kind' | 'tags' | 'notes'>; json: string }): string {
  const l = item.listing;
  const text = JSON.stringify([l.title, l.composer ?? null, l.level, l.levelSource, l.style ?? null, l.kind ?? null, l.tags ?? [], l.notes ?? null]) + '\n' + item.json;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}${text.length.toString(36)}`;
}

/**
 * Bring a backup's songs into the library. Importing never deletes a song. A song that is not
 * here yet is added with its own id; one that is here already is overwritten by the file's copy
 * with `replace`, and with `merge` only when the file's copy changed later. Damaged entries are
 * skipped, never fatal.
 */
export async function importSongBackups(items: readonly unknown[], strategy: 'merge' | 'replace', lib: Library = getLibrary(), now: number = Date.now()): Promise<SongImportResult> {
  const result: SongImportResult = { added: [], replaced: [], kept: [], skipped: 0, failed: [] };
  const seen = new Set<string>();
  for (const item of items) {
    const song = songFromBackup(item, now);
    if (!song || seen.has(song.listing.id)) {
      result.skipped += 1;
      continue;
    }
    seen.add(song.listing.id);
    const id = song.listing.id;
    try {
      const here = await lib.get(id);
      if (!here) {
        await lib.restore(song);
        result.added.push(id);
        continue;
      }
      const hereJson = songToJson(await lib.load(id), { pretty: false });
      const same = songContentSum({ listing: here, json: hereJson }) === songContentSum(song);
      if (same || (strategy === 'merge' && here.updatedAt >= song.listing.updatedAt)) {
        result.kept.push(id);
        continue;
      }
      await lib.restore(song);
      result.replaced.push({ listing: here, json: hereJson });
    } catch {
      result.failed.push(id);
    }
  }
  return result;
}

/** Delete every one of the learner's songs. Returns them, so they can be restored. */
export async function removeMySongs(lib: Library = getLibrary()): Promise<RemovedSong[]> {
  const mine = (await lib.list()).filter((s) => s.source === 'mine');
  const removed: RemovedSong[] = [];
  for (const listing of mine) {
    try {
      removed.push(await lib.remove(listing.id));
    } catch {
      /* already gone */
    }
  }
  return removed;
}

/** How many of the learner's own songs there are, and how much room they take. */
export async function mySongsSize(lib: Library = getLibrary()): Promise<{ count: number; bytes: number; ids: Array<{ id: string; updatedAt: number }> }> {
  const mine = (await lib.list()).filter((s) => s.source === 'mine');
  return { count: mine.length, bytes: mine.reduce((n, s) => n + (s.bytes ?? 0), 0), ids: mine.map((s) => ({ id: s.id, updatedAt: s.updatedAt })) };
}

// ---------------------------------------------------------------------------------------------
// Cloud sync's view of the songs
// ---------------------------------------------------------------------------------------------

/** One song in the cloud's list: its content fingerprint, size and when it was saved. */
export interface SongIndexEntry {
  sum: string;
  bytes: number;
  u: number;
}

/** What cloud sync needs from the library. */
export interface SongSyncPort {
  /** Load the learner's songs (the first call reads the store). */
  ready(): Promise<void>;
  /** Changes whenever one of the learner's songs is added, changed or deleted. Cheap and synchronous. */
  stamp(): string;
  /** The learner's songs with content fingerprints. */
  index(): Promise<Record<string, SongIndexEntry>>;
  read(id: string): Promise<SongBackup | null>;
  /** Store a song from the cloud with its own id. False when it is not a readable song. */
  write(item: unknown): Promise<boolean>;
  remove(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

/** The library as cloud sync sees it. Fingerprints are kept per song version, so `index` is cheap after the first call. */
export function songSyncPort(lib: Library = getLibrary()): SongSyncPort {
  const sums = new Map<string, { u: number; sum: string; bytes: number }>();
  return {
    async ready() {
      await lib.list();
    },
    stamp() {
      const { songs, ready } = lib.snapshot();
      if (!ready) return 'loading';
      return songs
        .filter((s) => s.source === 'mine')
        .map((s) => `${s.id}@${s.updatedAt}`)
        .sort()
        .join(',');
    },
    async index() {
      const out: Record<string, SongIndexEntry> = {};
      for (const listing of (await lib.list()).filter((s) => s.source === 'mine')) {
        let known = sums.get(listing.id);
        if (!known || known.u !== listing.updatedAt) {
          try {
            const json = songToJson(await lib.load(listing.id), { pretty: false });
            known = { u: listing.updatedAt, sum: songContentSum({ listing, json }), bytes: byteSize(json) };
            sums.set(listing.id, known);
          } catch {
            continue;
          }
        }
        out[listing.id] = { sum: known.sum, bytes: known.bytes, u: known.u };
      }
      return out;
    },
    async read(id) {
      const listing = await lib.get(id);
      if (!listing || listing.source !== 'mine') return null;
      try {
        return { listing: portableListing(listing), json: songToJson(await lib.load(id), { pretty: false }) };
      } catch {
        return null;
      }
    },
    async write(item) {
      const song = songFromBackup(item);
      if (!song) return false;
      await lib.restore(song);
      return true;
    },
    async remove(id) {
      if (await lib.get(id)) await lib.remove(id);
    },
    subscribe: (listener) => lib.subscribe(listener),
  };
}
