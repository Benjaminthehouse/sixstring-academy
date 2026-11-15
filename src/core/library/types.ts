/**
 * Types of the song library: one listing shape for built-in songs and the learner's own songs,
 * the cheap summary the Songs screen shows, filters, and errors.
 */
import type { ImportWarning, SongFormat } from '@/core/song';
import type { SongKind, SongSkill, SongStyle } from '@/content/songs';

export type { SongKind, SongSkill, SongStyle } from '@/content/songs';

/** Where a song comes from: the built-in collection, or the learner's own library. */
export type SongSource = 'built-in' | 'mine';

/** How one of the learner's songs got into the library. */
export type SongOriginKind = 'import' | 'paste' | 'typed' | 'scan' | 'duplicate' | 'other';

/** The story of one of the learner's songs. */
export interface SongOrigin {
  kind: SongOriginKind;
  /** The format it was read from (`guitar-pro`, `musicxml`, `ascii-tab` ...). */
  format?: SongFormat;
  /** The file it came from. */
  fileName?: string;
  /** The song it was copied from (`duplicate`). */
  from?: string;
}

/** One beat of a thumbnail: start and length in ticks (from the bar start), notes as [string, fret]. */
export interface ThumbBeat {
  t: number;
  d: number;
  /** `[string, fret]` pairs; fret -1 is a dead note (x). */
  n: Array<[number, number]>;
  /** A strum slash (draw a slash, not fret numbers). */
  slash?: boolean;
}

/** The first bars of a song's first track, small enough to keep with the listing. */
export interface SongThumb {
  /** Number of strings (6 on a guitar, 4 on a bass). */
  strings: number;
  bars: Array<{ ticks: number; beats: ThumbBeat[]; chords: Array<{ t: number; symbol: string }> }>;
}

/** Facts about a song that need its notes: computed once, then cheap to show. */
export interface SongSummary {
  bars: number;
  /** Bars as played, repeats included. */
  playedBars: number;
  /** Length at the written tempo, repeats included. */
  seconds: number;
  /** Tempo at the start, quarter notes per minute. */
  bpm: number;
  /** Time signature at the start, `4/4`. */
  time: string;
  tracks: number;
  /** The learner's part (the first written track) has fretted notes written out (tab). */
  hasTab: boolean;
  hasChords: boolean;
  /** Words to sing, on any track. */
  hasLyrics: boolean;
  /** The learner's part is strummed (rhythm slashes). */
  hasStrumming: boolean;
  /** Distinct chord symbols in order of appearance (at most 12). */
  chords: string[];
  /** Open-string MIDI, low to high. */
  tuning: number[];
  capo: number;
  /** `estimateDifficulty` level 1–10. */
  estimatedLevel: number;
  /** What the music trains, inferred from the notes. */
  skills: SongSkill[];
  thumb: SongThumb;
}

/** One song in the library, built-in or the learner's: everything the list shows. */
export interface SongListing {
  /** Route-safe id: `#play--<id>`, skill `song:<id>`. The learner's songs start with `my-`. */
  id: string;
  source: SongSource;
  title: string;
  /** Composer, tradition or artist. */
  composer?: string;
  /** 1–10. */
  level: number;
  /** `authored` (content or the file), `estimated` (computed from the notes) or `set` (by the learner). */
  levelSource: 'authored' | 'estimated' | 'set';
  style?: SongStyle;
  kind?: SongKind;
  /** Key for people: `G major`. */
  key?: string;
  tags: string[];
  /** Filter categories (authored for built-ins, inferred from the notes for the learner's songs). */
  skills: SongSkill[];
  /** Plain-language points, built-in songs only. */
  teaches: string[];
  /** How it should sound, the common mistake and the fix (built-in songs). */
  about?: string;
  /** When and where the music comes from (built-in songs). */
  origin?: string;
  /** Why it is free to use (built-in songs). */
  publicDomain?: string;
  /** The learner's own note about the song. */
  notes?: string;
  /** When it was added (epoch ms). */
  addedAt: number;
  updatedAt: number;
  /** Always present for the learner's songs; for built-in songs once `summary(id)` has run. */
  summary?: SongSummary;
  /** The learner's songs: where they came from and what the importer said. */
  imported?: { origin: SongOrigin; warnings: ImportWarning[]; confidence?: number; estimatedRhythm?: boolean };
  /** Size of the stored song in bytes (the learner's songs). */
  bytes?: number;
}

/** What the learner may change about one of their songs (`library.update`). */
export interface SongDetailsPatch {
  title?: string;
  composer?: string;
  /** A level the learner sets; `null` goes back to the estimate. */
  level?: number | null;
  style?: SongStyle | null;
  tags?: string[];
  notes?: string;
}

/** Why a library call failed; `message` is written for the learner. */
export type LibraryErrorCode =
  | 'not-found'
  | 'read-only'
  | 'too-large'
  | 'full'
  | 'unsupported'
  | 'needs-scan'
  | 'unreadable'
  | 'empty'
  | 'storage';

/** A failed library call. `message` can be shown as it is; `detail` is for "Technical details". */
export class LibraryError extends Error {
  constructor(
    readonly code: LibraryErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'LibraryError';
  }
}

/** True for a `LibraryError` (also across module copies). */
export function isLibraryError(e: unknown): e is LibraryError {
  return e instanceof LibraryError || (!!e && typeof e === 'object' && (e as { name?: unknown }).name === 'LibraryError');
}

/** Formats `exportSong` writes. */
export type ExportFormat = 'sixtab' | 'ascii-tab' | 'musicxml' | 'json';

/** A file ready for `saveFile(filename, data, mime)`. */
export interface SongExport {
  format: ExportFormat;
  filename: string;
  mime: string;
  data: string;
  /** What the format cannot hold exactly (approximated or left out). */
  losses: string[];
}

/** Where the learner's songs are kept, and how much room there is. */
export interface LibraryStatus {
  /** `indexeddb` survives reloads; `storage` is the small key-value fallback; `memory` is lost on reload. */
  backend: 'indexeddb' | 'storage' | 'memory';
  persistent: boolean;
  songs: number;
  usedBytes: number;
  limitBytes: number;
  maxSongs: number;
}

/** Result of an import: the saved song plus what the importer said about it. */
export interface ImportedSong {
  listing: SongListing;
  format: SongFormat;
  /** `Guitar Pro`, `Text tab` ... */
  formatName: string;
  warnings: ImportWarning[];
  confidence: number;
  estimatedRhythm: boolean;
}
