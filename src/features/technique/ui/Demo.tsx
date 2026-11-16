/**
 * The demonstration of a part: the tab (with a cursor that follows the click or the guide guitar)
 * and the notes on a fretboard, the one being played lit up.
 */
import { forwardRef, useEffect, useMemo, useState } from 'react';
import { noteAt } from '@/core/guitar';
import type { Song } from '@/core/song';
import { useIsMobile, useLatest } from '@/ui';
import type { RunnerEvent } from '../engine/runner';
import { Fretboard, type FretMarker, type MusicColor } from '@/ui/music';
import { TabView, type TabNoteState, type TabViewHandle } from '@/ui/music/tab';
import styles from '../Technique.module.css';

/** Fretboard markers for every place the part is played; the current beat's notes are targets. */
export function partMarkers(song: Song, current: { bar: number; beat: number } | null, key?: string): { markers: FretMarker[]; frets: [number, number] } {
  const seen = new Map<string, FretMarker>();
  const lit = new Set<string>();
  let lo = 99;
  let hi = 0;
  const capo = song.capo ?? 0;
  const track = song.tracks[0];
  const fingerColor = (f: unknown): MusicColor | undefined => (f === 1 || f === 2 || f === 3 || f === 4 ? (`finger-${f}` as MusicColor) : undefined);
  track?.measures.forEach((m, bar) => {
    m.beats.forEach((b, beat) => {
      const now = current && current.bar === bar && current.beat === beat;
      const notes = b.notes.length ? b.notes : [];
      for (const n of notes) {
        if (n.dead || n.tie) continue;
        const id = `${n.string}:${n.fret}`;
        if (now) lit.add(id);
        if (!seen.has(id)) {
          let name = '';
          try {
            name = noteAt({ string: n.string, fret: n.fret + capo }, { octave: false, ...(key ? { context: { key } } : {}) });
          } catch {
            name = '';
          }
          const color = fingerColor(n.finger);
          seen.set(id, {
            string: n.string,
            fret: n.fret,
            note: name,
            ...(color ? { color, label: String(n.finger), description: `finger ${n.finger}` } : { color: 'neutral' as MusicColor, noteLabel: true }),
            ...(n.harmonic ? { shape: 'diamond' as const } : {}),
          });
        }
        if (n.fret > 0) {
          lo = Math.min(lo, n.fret);
          hi = Math.max(hi, n.fret);
        } else lo = 0;
      }
    });
  });
  // Chord parts strum their voicings: show the first chord's shape.
  if (!seen.size && song.chords.length) {
    const v = song.chords.find((c) => c.voicing)?.voicing;
    v?.forEach((f, i) => {
      if (f === null || f === undefined) return;
      const string = 6 - i;
      seen.set(`${string}:${f}`, { string, fret: f, color: 'neutral', noteLabel: true, note: (() => { try { return noteAt({ string, fret: f + capo }, { octave: false }); } catch { return ''; } })() });
      if (f > 0) {
        lo = Math.min(lo, f);
        hi = Math.max(hi, f);
      } else lo = 0;
    });
  }
  const markers = [...seen.values()].map((m) => (lit.has(`${m.string}:${m.fret}`) ? { ...m, state: 'target' as const } : m));
  if (lo === 99) lo = 0;
  // With a capo the markers count from it, the range is frets on the wood.
  const from = lo <= 1 || capo ? 0 : lo - 1;
  const to = Math.max(from + 4, Math.min(24, hi + capo + 1));
  return { markers, frets: [from, to] };
}

/** Where the beats come from: the screen's runner. */
export interface BeatSource {
  subscribe(fn: (e: RunnerEvent) => void): () => void;
}

/**
 * The fretboard of a part with the note being played lit. It listens to the runner itself, so a
 * new note re-renders only the board, not the whole screen and its tab.
 */
function LiveBoard({ song, keyName, source, follow }: { song: Song; keyName?: string; source?: BeatSource; follow: boolean }) {
  const mobile = useIsMobile();
  const [current, setCurrent] = useState<{ bar: number; beat: number } | null>(null);
  const followRef = useLatest(follow);
  useEffect(() => {
    setCurrent(null);
    if (!source) return undefined;
    return source.subscribe((ev) => {
      if (ev.type === 'beat') setCurrent(followRef.current ? { bar: ev.bar, beat: ev.beat } : null);
      else if (ev.type === 'state' && ev.state === 'idle') setCurrent(null);
    });
  }, [source, song, followRef]);
  const { markers, frets } = useMemo(() => partMarkers(song, current, keyName), [song, current, keyName]);
  if (!markers.length) return null;
  return (
    <div className={styles.boardBox}>
      <Fretboard frets={frets} markers={markers} size={mobile ? 'sm' : 'md'} fretNumbers="all" capo={song.capo || undefined} />
    </div>
  );
}

/** Props of the demonstration. */
export interface DemoProps {
  song: Song;
  /** The runner whose beats light the fretboard. */
  source?: BeatSource;
  /** Light every note (false when the notes come too fast to follow). */
  follow?: boolean;
  noteStates?: Readonly<Record<string, TabNoteState>> | null;
  /** Key for note names. */
  keyName?: string;
  showFretboard?: boolean;
  /** Chord boxes over the changes (strumming and chord parts). */
  diagrams?: boolean;
  notation?: boolean;
}

/** Tab and fretboard of a part. The ref is the tab's handle, for the cursor. */
export const Demo = forwardRef<TabViewHandle, DemoProps>(function Demo({ song, source, follow = true, noteStates, keyName, showFretboard = true, diagrams, notation }, ref) {
  const mobile = useIsMobile();
  const bars = song.bars.length;
  return (
    <div className={styles.demo}>
      <div className={styles.tabBox}>
        <TabView
          ref={ref}
          song={song}
          size={mobile ? 'md' : 'lg'}
          chords={diagrams ? 'diagrams' : true}
          notation={notation}
          noteStates={noteStates ?? null}
          height={bars > 8 ? (mobile ? '20rem' : '24rem') : undefined}
          aria-label={`Tab: ${song.meta.title}`}
        />
      </div>
      {showFretboard && <LiveBoard song={song} keyName={keyName} source={source} follow={follow} />}
    </div>
  );
});
