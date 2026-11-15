/**
 * A few bars of tab inside lesson text: SixTab in, engraved tab out, nothing to tap but an
 * optional play button (the lesson does the playing; the snippet hands it the parsed song).
 *
 *   <TabSnippet tab="| e 3:5 3:7h 3:5p 3:7 q 3:7b2r 2:5~ |" />
 *   <TabSnippet tab={AMAZING_GRACE} bars={[0, 3]} onPlay={(song) => play(song)} playing={playing} caption="The first line" />
 */
import { forwardRef, useMemo, type ReactNode } from 'react';
import { parseSixTab, type Song } from '@/core/song';
import { IconButton } from '@/ui';
import { TabView, type TabSize, type TabViewHandle } from './TabView';
import styles from './TabView.module.css';

/** Props of `<TabSnippet>`. */
export interface TabSnippetProps {
  /** SixTab text: whole files, or just music lines (`| q 3:5 3:7 |`), or a parsed song. */
  tab: string | Song;
  /** Header defaults when `tab` has no header of its own. */
  time?: string;
  tempo?: number;
  tuning?: string;
  /** Key, for spelling when `notation` is on. */
  keyName?: string;
  /** Only these bars, `[from, to)`. */
  bars?: [number, number];
  track?: string | number;
  size?: TabSize;
  rhythm?: boolean;
  notation?: boolean;
  /** Show a play button; called with the parsed song. */
  onPlay?: (song: Song) => void;
  playing?: boolean;
  playLabel?: string;
  caption?: ReactNode;
  'aria-label'?: string;
  className?: string;
}

/** Wrap bare music lines in a minimal SixTab header. */
export function snippetSource(tab: string, opts: { time?: string; tempo?: number; tuning?: string; keyName?: string } = {}): string {
  if (/^\s*title\s*:/m.test(tab)) return tab;
  const head = ['title: Example'];
  if (opts.tempo) head.push(`tempo: ${opts.tempo}`);
  if (opts.time) head.push(`time: ${opts.time}`);
  if (opts.keyName) head.push(`key: ${opts.keyName}`);
  if (opts.tuning) head.push(`tuning: ${opts.tuning}`);
  return `${head.join('\n')}\n\n${tab.trim()}\n`;
}

/** The snippet. See the module comment. */
export const TabSnippet = forwardRef<TabViewHandle, TabSnippetProps>(function TabSnippet(props, ref) {
  const { tab, time, tempo, tuning, keyName, bars, track, size = 'md', rhythm, notation, onPlay, playing = false, playLabel, caption, className } = props;
  const parsed = useMemo(() => {
    if (typeof tab !== 'string') return { song: tab, error: null as string | null, text: '' };
    const text = snippetSource(tab, { time, tempo, tuning, keyName });
    const r = parseSixTab(text);
    return { song: r.song, error: r.errors.length ? r.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n') : null, text: tab };
  }, [tab, time, tempo, tuning, keyName]);

  if (!parsed.song) {
    return (
      <div className={styles.snippet}>
        <pre className={styles.snippetError}>{parsed.text.trim()}</pre>
        {import.meta.env.DEV && parsed.error && <p className={styles.snippetCaption}>{parsed.error}</p>}
      </div>
    );
  }
  const song = parsed.song;
  return (
    <figure className={className ? `${styles.snippet} ${className}` : styles.snippet}>
      <TabView ref={ref} song={song} track={track} bars={bars} size={size} rhythm={rhythm} notation={notation} pick="none" autoScroll={false} aria-label={props['aria-label']} />
      {(onPlay || caption) && (
        <figcaption className={styles.snippetBar}>
          {onPlay && <IconButton icon={playing ? 'Square' : 'Play'} label={playing ? 'Stop' : playLabel ?? 'Play this example'} variant="secondary" round size="sm" pressed={playing} onClick={() => onPlay(song)} />}
          {caption && <span className={styles.snippetCaption}>{caption}</span>}
        </figcaption>
      )}
    </figure>
  );
});
