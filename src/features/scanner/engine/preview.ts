/**
 * Hearing the reading while proofreading: one SongPlayer for the song on screen, started from a
 * click, from the bar being checked, stopped when the song changes or the screen goes away.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeTone, unlockAudio } from '@/core/audio';
import { type PlayerPosition, type Song, SongPlayer, liveOutput } from '@/core/song';
import { soundPrefs } from '@/core/settings';

/** What `usePreviewPlayer` gives. */
export interface PreviewPlayer {
  playing: boolean;
  /** Start (from `bar`, default the start) or stop. */
  toggle(bar?: number): void;
  stop(): void;
  /** Where the sound is now (for a cursor drawn every frame), or null when stopped. */
  position(): PlayerPosition | null;
}

/** A player for the song on screen (see the file comment). */
export function usePreviewPlayer(song: Song | null): PreviewPlayer {
  const [playing, setPlaying] = useState(false);
  const player = useRef<SongPlayer | null>(null);
  const token = useRef(0);

  const stop = useCallback(() => {
    token.current++;
    const p = player.current;
    player.current = null;
    if (p) {
      try {
        p.stop();
      } catch {
        /* already stopped */
      }
      p.dispose();
    }
    setPlaying(false);
  }, []);

  // A new reading (an edit) stops the old sound: what plays is always what is on screen.
  useEffect(() => stop, [song, stop]);

  const toggle = useCallback(
    (bar?: number) => {
      if (player.current || !song) {
        stop();
        return;
      }
      const my = ++token.current;
      setPlaying(true);
      void unlockAudio().then(async () => {
        if (token.current !== my) return;
        const tone = normalizeTone(soundPrefs().guitarTone, song.tracks[0]?.role === 'bass' ? 'bass-finger' : 'steel');
        const p = new SongPlayer(song, { countInBars: 0, output: liveOutput({ tone }) });
        player.current = p;
        p.subscribe((e) => {
          if (e.type === 'end' && token.current === my) stop();
        });
        try {
          await p.prepare();
        } catch {
          /* plays without the pre-render */
        }
        if (token.current !== my) return;
        if (bar && bar > 0) p.seekBar(bar);
        p.play();
      });
    },
    [song, stop],
  );

  const position = useCallback(() => {
    const p = player.current;
    if (!p) return null;
    try {
      return p.position();
    } catch {
      return null;
    }
  }, []);

  return { playing, toggle, stop, position };
}
