/**
 * The Player: `#play--<song-id>` with optional params (every one is in API.md beside this file;
 * `model/params.ts` reads them): `m9` start at bar 9, `m9-12` loop bars 9 to 12, `t70` tempo 70 %,
 * `wait` / `flow` / `tap` / `listen`, `part-<part>` / `mute-<part>`, `tab-only` / `tab-and-notes`
 * / `notes`, `hide-chart`, `capo2`, `up2` / `down2`, or a section's name (`chorus`) to loop it.
 * Loads the song from the library, then hands over to the player screen. Without an id it offers
 * the song list rather than an empty shell.
 */
import { useMemo } from 'react';
import type { RouteProps } from '@/app/routes';
import { useScreenTitle } from '@/app/shell';
import { useSong } from '@/core/library';
import { EmptyState, ErrorState, LinkButton, Page, Skeleton } from '@/ui';
import { parsePlayerParams } from './model/params';
import { PlayerScreen } from './PlayerScreen';
import styles from './Player.module.css';

/** The player route. */
export default function Player({ params }: RouteProps) {
  const request = useMemo(() => parsePlayerParams(params), [params]);
  const { song, listing, error } = useSong(request.songId);
  useScreenTitle(song ? song.meta.title : listing?.title ?? null);

  if (!request.songId) {
    return (
      <Page title="Player" back={{ to: 'songs', label: 'Songs' }}>
        <EmptyState icon="Music" title="Pick a song to play" actions={<LinkButton to="songs" variant="primary" iconLeft="ListMusic">Open the song library</LinkButton>}>
          The player shows a song's tab with a cursor that follows the music, a fretboard with the notes to play, and practice modes that listen to you.
        </EmptyState>
      </Page>
    );
  }

  if (error) {
    return (
      <Page title="Player" back={{ to: 'songs', label: 'Songs' }}>
        <ErrorState
          title={error.code === 'not-found' ? 'That song is not in your library' : 'The song could not be opened'}
          error={error.detail ?? error.message}
          actions={<LinkButton to="songs" variant="primary" iconLeft="ListMusic">Choose another song</LinkButton>}
        >
          {error.code === 'not-found' ? 'It may have been deleted, or the link was copied from another device.' : error.message}
        </ErrorState>
      </Page>
    );
  }

  if (!song) {
    return (
      <Page title={listing?.title ?? 'Loading song'} hideHeader width="full" className={styles.page}>
        <div className={styles.loading} aria-busy="true" aria-live="polite">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="block" height="14rem" />
          <Skeleton variant="block" height="7rem" />
          <span className="sr-only">Opening the song</span>
        </div>
      </Page>
    );
  }

  // A new address (another song, or a link to other bars) opens afresh; the player never rewrites the address itself.
  return <PlayerScreen key={params.join('--')} song={song} songId={request.songId} listing={listing} params={params} />;
}
