/**
 * The song library: the one place songs come from. Built-in songs (the content registry in
 * `@/content/songs`, notes loaded only when a song is opened) and the learner's own songs
 * (imported files, pasted tab, typed SixTab, scanned sheets) kept in IndexedDB, with a small
 * key-value fallback. Read API.md beside this file first.
 */
import { getLibrary } from './library';
import type { Library } from './library';

export * from './types';
export { MAX_IMPORT_BYTES, MINE_PREFIX, builtinListing, createLibrary, getLibrary, isMineId, keyLabel, setLibrary } from './library';
export type { BuiltinSource, Library, LibraryOptions, RemovedSong, SaveOptions } from './library';
export { FALLBACK_LIBRARY_BYTES, MAX_LIBRARY_BYTES, MAX_SONGS, MAX_SONG_BYTES, createDefaultStore, indexedDbStore, keyValueStore, memoryStore, openLibraryDb } from './store';
export type { KeyValue, SongStore } from './store';
export { THUMB_BARS, inferSkills, songThumb, summarizeSong } from './summary';
export { LEVEL_BAND_NAMES, LEVEL_BAND_RANGE, SORT_NAMES, activeFilterCount, filterSongs, normalizeText, searchScore, sortSongs } from './filter';
export type { FilterContext, LevelBand, SongFilter, SongSort } from './filter';
export { goodNextSongs, learnerFromParts, learnerFromProgress, rankSongs, targetLevel } from './rank';
export type { LearnerSnapshot, PlayedSong, Recommendation, SongFit } from './rank';
export { EXPORT_FORMATS, exportFileName, exportSongAs } from './export';
export { useSong, useSongList, useSongSummary } from './react';
export { KIND_NAMES, SKILL_NAMES, SONG_KINDS, SONG_SKILLS, SONG_STYLES, STYLE_NAMES } from '@/content/songs';

/** `getLibrary().list()`: every song, built-in and the learner's. */
export const listSongs: Library['list'] = () => getLibrary().list();
/** `getLibrary().get(id)`: one listing or null. */
export const getSongListing: Library['get'] = (id) => getLibrary().get(id);
/** `getLibrary().load(id)`: the whole song (for the player). */
export const loadSong: Library['load'] = (id) => getLibrary().load(id);
/** `getLibrary().save(song, opts)`: add a song to the learner's library. */
export const saveSong: Library['save'] = (song, opts) => getLibrary().save(song, opts);
/** `getLibrary().subscribe(fn)`: hear about every change. */
export const subscribeLibrary: Library['subscribe'] = (fn) => getLibrary().subscribe(fn);
