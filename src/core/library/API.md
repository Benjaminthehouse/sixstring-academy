# `@/core/library` — the song library: where every song comes from

One API for **built-in songs** (the content registry in `src/content/songs`, notes loaded only when
a song is opened) and **the learner's own songs** (imported files, pasted tab or chords, typed
SixTab, scanned sheets), which are kept on the device. Import from the barrel only. Tests:
`npx vitest run src/core/library`. The Songs screen (`#songs`) is built on it; the Player opens
`#play--<id>` with `loadSong(id)`.

**Ids** are route-safe (`#play--<id>`, skill `song:<id>`, favourite `{ kind: 'song', id }`). Built-in
ids are their folder names (`hot-cross-buns`); the learner's start with `my-` (`my-riverside-waltz-k3f9`)
and never change, even on rename.

## Reading

```ts
import { getLibrary, loadSong, useSongList, useSong, useSongSummary } from '@/core/library';

const lib = getLibrary();                    // the app's library (IndexedDB, else the fallback below)
await lib.list();                            // SongListing[]: built-in + the learner's, unsorted
await lib.list({ scope: 'mine', levels: ['beginner'] }, { favourites });   // the same filter as filterSongs (below)
lib.snapshot();                              // { songs, ready } now, without waiting (built-in songs only until ready)
await lib.get(id);                           // SongListing | null
const song = await loadSong(id);             // the whole Song (a copy: yours to change); LibraryError 'not-found'
await lib.summary(id);                       // SongSummary (built-in: computed on first request, then kept)
const off = lib.subscribe(() => refresh());  // after every change, also changes made in another tab
```

```tsx
const { songs, ready, error } = useSongList();        // re-renders on changes
const { summary } = useSongSummary(listing, visible); // listing.summary, or computed once `visible`
const { song, listing, loading, error } = useSong(id); // for the Player; reloads when that song changes
```

`SongListing { id, source: 'built-in'|'mine', title, composer?, level 1–10, levelSource: 'authored'|'estimated'|'set',
style?, kind?, key? ('G major'), tags, skills, teaches, about?, origin?, publicDomain?, notes?, addedAt, updatedAt,
summary?, imported?: { origin: { kind: 'import'|'paste'|'typed'|'scan'|'duplicate'|'other', format?, fileName?, from? },
warnings, confidence?, estimatedRhythm? }, bytes? }`.

`SongSummary { bars, playedBars, seconds, bpm, time: '4/4', tracks, hasTab, hasChords, hasLyrics, hasStrumming,
chords: string[], tuning, capo, estimatedLevel, skills, thumb }` — `hasTab` / `hasStrumming` describe the learner's
part (the first written track: a strum-along song is "strum" even when a teacher's tune track has notes), `hasLyrics`
any track. `thumb` is the first two full bars of that part (`{ strings, bars: [{ ticks, beats: [{ t, d, n: [[string, fret]], slash? }], chords: [{ t, symbol }] }] }`,
fret `-1` = dead note), enough to draw a mini tab without loading the song.

## Writing (the learner's songs only; built-in songs are read-only: duplicate them)

```ts
await lib.save(song, { origin: { kind: 'scan', format: 'ascii-tab' }, warnings, confidence });  // -> SongListing (new id)
await lib.save(edited, { replace: id });            // overwrite one of the learner's, keeping id and details
await lib.update(id, { title?, composer?, level? (null = back to the estimate), style? (null clears), tags?, notes? });
await lib.rename(id, 'New title');                  // also rewrites song.meta.title
const removed = await lib.remove(id);               // keep it for undo:
await lib.restore(removed);                         // same id, same song
await lib.duplicate('greensleeves-fingerstyle');    // "Greensleeves (fingerstyle) (my copy)", style and tags kept
```

`save` gives the song its id, a title (`Untitled song` if empty), rejects a song with `validateSong` errors
(`unreadable`), stores it with its summary and notifies subscribers.

## Import and export

```ts
const r = await lib.importFile(file);               // any format @/core/song imports, chosen by content then name
const r = await lib.importText(pasted, { title? }); // text tab, chord sheet, ChordPro, SixTab, MusicXML text
// r: { listing (already saved), format, formatName ('Guitar Pro'), warnings: ImportWarning[], confidence, estimatedRhythm }
const file = await lib.exportSong(id, 'sixtab' | 'ascii-tab' | 'musicxml' | 'json');
// file: { filename: 'greensleeves.sixtab.txt', mime, data, losses: string[] } -> saveFile(file.filename, file.data, file.mime)
EXPORT_FORMATS  // [{ id, label, extension, mime, description }] for a picker; check canSaveFile(filename) per host
```

Imports are saved at once (offer "Undo" with `remove`, never lose work). Photos and PDFs reject with `needs-scan`
(send the learner to `#scan`); unknown text and formats with `unsupported` (the message says what tab or a chord
sheet looks like); files with no notes or chords with `empty`; damaged files with `unreadable`. File names:
`.sixtab.txt` and `-tab.txt` save in the Claude viewer too; `.musicxml` only on the app's own address.

## Lists: search, filters, sort, "Good next songs for you" (pure)

```ts
filterSongs(songs, { query?, scope?: 'all'|'built-in'|'mine'|'favourites', levels?: ['beginner'|'intermediate'|'expert'],
                     styles?, skills? (every one), features?: ['chords'|'lyrics'|'tab'] }, { favourites? })
sortSongs(songs, 'fit'|'level'|'title'|'recent'|'length', { fitOrder?: ids, query? })   // a query puts best matches first
searchScore(listing, 'blues a')     // every word must match title, composer, style, kind, key, tags, teaches, chords
activeFilterCount(filter)   SORT_NAMES   LEVEL_BAND_NAMES   LEVEL_BAND_RANGE (beginner 1–3, intermediate 4–7, expert 8–10)

const learner = learnerFromProgress(getProgress(), Date.now());   // experience, song:<id> skills, song favourites
rankSongs(songs, learner)        // Recommendation[] { listing, score, fit: 'easy'|'right'|'stretch'|'hard', reason }
goodNextSongs(songs, learner, 3) // not mastered, not far above, different styles where possible
targetLevel(songs, learner)      // experience (1 / 4 / 7), raised to one above the best level played well
```

Reasons are short and plain: "Right at your level", "A small step up", "You started this one", "Polish it: you
have 2 of 3 stars", "One of your favourites", "You added this", "You know this one".

## Storage and limits

| Store | When | Limit |
|---|---|---|
| IndexedDB `ssa-library` (`entries` = listings, `songs` = song JSON) | normal | 100 MB (`MAX_LIBRARY_BYTES`), 1000 songs (`MAX_SONGS`) |
| platform key-value storage `library.v1.*` | IndexedDB missing or refused | 1.5 MB (`FALLBACK_LIBRARY_BYTES`; it shares ~5 MB with progress) |
| memory | tests; or the platform storage is itself memory-only | lost on reload |

One song is at most 2 MB of JSON (`MAX_SONG_BYTES`, `too-large`); an imported file at most 20 MB (`MAX_IMPORT_BYTES`).
A full store rejects with `full` and leaves nothing half-saved. `await lib.status()` → `{ backend, persistent, songs,
usedBytes, limitBytes, maxSongs }` (say so on screen when `persistent` is false).

**Errors**: every rejection is a `LibraryError { code, message, detail? }` with `code` one of `not-found read-only
too-large full unsupported needs-scan unreadable empty storage`; `message` is written for the learner, `detail` is
for a collapsed "Technical details". `isLibraryError(e)`.

## Tests and other screens

`createLibrary({ store: memoryStore(), broadcast: false, now?, random?, builtins? })` builds an isolated library;
`keyValueStore(fakeKv, limit)` tests the fallback; `setLibrary(lib)` points `getLibrary()` and the hooks at it.
Adding built-in songs: `src/content/songs/README.md`.
