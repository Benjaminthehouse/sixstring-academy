/**
 * The built-in song collection. Each song is a folder: `<id>/meta.ts` (title, level, style, what
 * it teaches ...) and `<id>/song.sixtab` (the notes, in the SixTab format of `@/core/song`).
 *
 * The metadata is bundled with this module, so listing songs costs nothing; a song's notes are a
 * separate chunk loaded only when it is opened (`loadSongText`). Screens read songs through
 * `@/core/library`, not from here. Adding a song: README.md beside this file.
 */
import type { SongEntry, SongMetaInput } from './types';

export * from './types';

const META = import.meta.glob<{ default: SongMetaInput }>('./*/meta.ts', { eager: true });
const TEXT = import.meta.glob<string>('./*/song.sixtab', { query: '?raw', import: 'default' });

/** `./hot-cross-buns/meta.ts` -> `hot-cross-buns`. */
function folderOf(path: string): string {
  return path.split('/')[1] ?? path;
}

const textLoaders = new Map<string, () => Promise<string>>();
for (const [path, load] of Object.entries(TEXT)) textLoaders.set(folderOf(path), load);

/** Every built-in song, easiest first (then by title). */
export const SONG_ENTRIES: readonly SongEntry[] = Object.entries(META)
  .map(([path, mod]) => ({ ...mod.default, id: folderOf(path) }))
  .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));

const BY_ID = new Map(SONG_ENTRIES.map((e) => [e.id, e]));

/** The metadata of one built-in song, or undefined. */
export function songEntry(id: string): SongEntry | undefined {
  return BY_ID.get(id);
}

/** Folder names that have a `song.sixtab` (for the content test). */
export function songTextIds(): string[] {
  return [...textLoaders.keys()].sort();
}

/** The SixTab text of a built-in song (a lazily loaded chunk). Rejects when there is none. */
export async function loadSongText(id: string): Promise<string> {
  const load = textLoaders.get(id);
  if (!load) throw new Error(`There is no built-in song "${id}".`);
  return load();
}
