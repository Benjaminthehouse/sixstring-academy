/**
 * A thumbnail of a song's first bars: tab lines, fret numbers, strum slashes and chord names,
 * drawn from the library's `SongThumb` (no song load). It shows as many bars as fit its width,
 * so numbers never pile up. Decorative: the row's text says everything it shows.
 */
import { useMemo } from 'react';
import { cx, useElementSize } from '@/ui';
import type { SongThumb, ThumbBeat } from '@/core/library';
import styles from './MiniTab.module.css';

/** Narrowest room a beat gets before the thumbnail shows fewer bars, in px. */
const MIN_BEAT_PX = 15;

interface Shown {
  ticks: number;
  bars: Array<{ start: number; ticks: number; beats: ThumbBeat[]; chords: Array<{ t: number; symbol: string }> }>;
}

/** The leading bars (or the start of the first bar) that fit `maxBeats` beats. */
export function fitThumb(thumb: SongThumb, maxBeats: number): Shown {
  const out: Shown = { ticks: 0, bars: [] };
  let beats = 0;
  for (const bar of thumb.bars) {
    if (out.bars.length && beats + bar.beats.length > maxBeats) break;
    let use = bar;
    let ticks = bar.ticks;
    if (!out.bars.length && bar.beats.length > maxBeats) {
      // Even the first bar is too busy: show its start.
      const kept = bar.beats.slice(0, Math.max(1, maxBeats));
      const last = kept[kept.length - 1];
      ticks = last.t + last.d;
      use = { ...bar, beats: kept, chords: bar.chords.filter((c) => c.t < ticks) };
    }
    out.bars.push({ start: out.ticks, ticks, beats: use.beats, chords: use.chords });
    out.ticks += ticks;
    beats += use.beats.length;
  }
  return out;
}

/** Thumbnail of the first bars of a song. */
export function MiniTab({ thumb, className }: { thumb: SongThumb | null | undefined; className?: string }) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const strings = Math.min(8, Math.max(4, thumb?.strings ?? 6));
  const maxBeats = Math.max(4, Math.floor((width || 240) / MIN_BEAT_PX));
  const shown = useMemo(() => (thumb ? fitThumb(thumb, maxBeats) : null), [thumb, maxBeats]);
  const pct = (tick: number) => (shown && shown.ticks ? (tick / shown.ticks) * 100 : 0);
  const hasChords = !!shown?.bars.some((b) => b.chords.length);

  return (
    <div ref={ref} className={cx(styles.mini, hasChords && styles.withChords, className)} style={{ ['--strings' as string]: strings }} aria-hidden="true" data-mini-tab="">
      {shown && hasChords && (
        <div className={styles.chords}>
          {shown.bars.flatMap((bar) =>
            bar.chords.map((c) => (
              <span key={`${bar.start}-${c.t}`} className={styles.chord} style={{ left: `calc(${pct(bar.start + c.t)}% + 0.2rem)` }}>
                {c.symbol}
              </span>
            )),
          )}
        </div>
      )}
      <div className={styles.staff}>
        {Array.from({ length: strings }, (_, i) => (
          <i key={i} className={styles.line} style={{ top: `${(i / (strings - 1)) * 100}%` }} />
        ))}
        {shown?.bars.slice(1).map((bar) => <i key={bar.start} className={styles.bar} style={{ left: `${pct(bar.start)}%` }} />)}
        {shown?.bars.flatMap((bar) =>
          bar.beats.map((beat) => {
            // Notes sit a little after the start of their beat, so a bar line never runs through one.
            const left = `calc(${pct(bar.start + beat.t)}% + 0.5rem)`;
            if (beat.slash) return <i key={`${bar.start}-${beat.t}`} className={styles.slash} style={{ left }} />;
            return beat.n.map(([string, fret]) => (
              <span key={`${bar.start}-${beat.t}-${string}`} className={styles.note} style={{ left, top: `${((Math.min(string, strings) - 1) / (strings - 1)) * 100}%` }}>
                {fret < 0 ? 'x' : fret}
              </span>
            ));
          }),
        )}
      </div>
    </div>
  );
}
