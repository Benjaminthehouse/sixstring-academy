/**
 * What can be done to a song from anywhere on the Songs screen (a row's menu, the preview pane,
 * the details sheet): one context so every place offers the same actions with the same words.
 */
import { createContext, useContext } from 'react';
import type { MenuEntry } from '@/ui';
import type { SongListing } from '@/core/library';

/** The screen's song actions. */
export interface SongActions {
  edit(listing: SongListing): void;
  exportSong(listing: SongListing): void;
  duplicate(listing: SongListing): void;
  remove(listing: SongListing): void;
  toggleFavourite(listing: SongListing): void;
  isFavourite(id: string): boolean;
  /** Show a song's details (the preview pane on wide screens, a sheet on phones). */
  details(listing: SongListing): void;
  /** Hovered or focused: wide screens preview it. */
  hover(listing: SongListing, how: 'pointer' | 'focus'): void;
}

const noop = () => {};
export const SongActionsContext = createContext<SongActions>({
  edit: noop,
  exportSong: noop,
  duplicate: noop,
  remove: noop,
  toggleFavourite: noop,
  isFavourite: () => false,
  details: noop,
  hover: noop,
});

/** The song actions of the screen. */
export function useSongActions(): SongActions {
  return useContext(SongActionsContext);
}

/** The "More" menu of a song: the same items, in the same order, everywhere. */
export function songMenuItems(listing: SongListing, actions: SongActions, opts: { withDetails?: boolean; withFavourite?: boolean } = {}): MenuEntry[] {
  const mine = listing.source === 'mine';
  const fav = actions.isFavourite(listing.id);
  const items: MenuEntry[] = [];
  if (opts.withDetails) items.push({ label: 'About this song', icon: 'Info', onSelect: () => actions.details(listing) });
  if (opts.withFavourite) items.push({ label: fav ? 'Remove from favourites' : 'Add to favourites', icon: 'Heart', onSelect: () => actions.toggleFavourite(listing) });
  if (mine) items.push({ label: 'Edit details', icon: 'Pencil', onSelect: () => actions.edit(listing) });
  items.push({ label: mine ? 'Make a copy' : 'Copy to my songs', icon: 'Copy', onSelect: () => actions.duplicate(listing) });
  items.push({ label: 'Export…', icon: 'Download', onSelect: () => actions.exportSong(listing) });
  if (mine) items.push('separator', { label: 'Delete', icon: 'Trash2', danger: true, onSelect: () => actions.remove(listing) });
  return items;
}
