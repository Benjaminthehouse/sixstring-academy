/**
 * React bindings of the song library: the song list, one song's summary, one whole song. Each
 * hook follows library changes (also from other tabs) and cleans up after itself.
 */
import { useEffect, useState } from 'react';
import type { Song } from '@/core/song';
import { getLibrary, type Library } from './library';
import { LibraryError, isLibraryError, type SongListing, type SongSummary } from './types';

function asLibraryError(e: unknown): LibraryError {
  return isLibraryError(e) ? e : new LibraryError('storage', 'Your songs could not be loaded.', e instanceof Error ? e.message : String(e));
}

/** Every song in the library. Built-in songs are there at once; `ready` turns true when the learner's own have loaded. */
export function useSongList(library: Library = getLibrary()): { songs: SongListing[]; ready: boolean; error: LibraryError | null } {
  const [state, setState] = useState(() => ({ ...library.snapshot(), error: null as LibraryError | null }));
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      library.list().then(
        (songs) => alive && setState({ songs, ready: true, error: null }),
        (e) => alive && setState((s) => ({ ...s, ready: true, error: asLibraryError(e) })),
      );
    };
    refresh();
    const off = library.subscribe(refresh);
    return () => {
      alive = false;
      off();
    };
  }, [library]);
  return state;
}

/**
 * The summary of a song (length, features, thumbnail). Uses the listing's own when it has one;
 * otherwise computes it when `enabled` (pass false until the row scrolls into view).
 */
export function useSongSummary(listing: SongListing | null | undefined, enabled = true, library: Library = getLibrary()): { summary: SongSummary | null; error: LibraryError | null } {
  const own = listing?.summary ?? null;
  const id = listing?.id ?? null;
  const [state, setState] = useState<{ id: string | null; summary: SongSummary | null; error: LibraryError | null }>({ id: null, summary: null, error: null });
  useEffect(() => {
    if (own || !id || !enabled) return;
    let alive = true;
    library.summary(id).then(
      (summary) => alive && setState({ id, summary, error: null }),
      (e) => alive && setState({ id, summary: null, error: asLibraryError(e) }),
    );
    return () => {
      alive = false;
    };
  }, [own, id, enabled, library]);
  if (own) return { summary: own, error: null };
  return state.id === id ? { summary: state.summary, error: state.error } : { summary: null, error: null };
}

/** One whole song by id (for the player and editors). Reloads when that song changes. */
export function useSong(id: string | null | undefined, library: Library = getLibrary()): { song: Song | null; listing: SongListing | null; loading: boolean; error: LibraryError | null } {
  const [state, setState] = useState<{ id: string | null; song: Song | null; listing: SongListing | null; error: LibraryError | null }>({ id: null, song: null, listing: null, error: null });
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let stamp = -1;
    const load = () => {
      Promise.all([library.get(id), library.load(id)]).then(
        ([listing, song]) => {
          if (!alive || (listing && listing.updatedAt === stamp)) return;
          stamp = listing?.updatedAt ?? 0;
          setState({ id, song, listing, error: null });
        },
        (e) => alive && setState({ id, song: null, listing: null, error: asLibraryError(e) }),
      );
    };
    load();
    const off = library.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [id, library]);
  const current = state.id === id && !!id;
  return { song: current ? state.song : null, listing: current ? state.listing : null, loading: !!id && (!current || (!state.song && !state.error)), error: current ? state.error : null };
}
