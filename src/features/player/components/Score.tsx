/**
 * The score: the practised part as tab (with notation above it when asked), chord symbols and
 * lyrics, in its own scroll box. The cursor follows the audio clock every frame through the
 * TabView handle (no React render), the view keeps the line being played and the next one in
 * sight, a tap starts there, and after a run a heat strip marks the bars that went wrong.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { audioSoundingNow } from '@/core/audio';
import type { Song } from '@/core/song';
import { cx, usePrefersReducedMotion, useRafLoop } from '@/ui';
import { TabView, barRangeRects, type TabLayout, type TabNoteState, type TabRange, type TabSeek, type TabViewHandle } from '@/ui/music/tab';
import { playerDebug } from '../debug';
import type { PlayerEngine } from '../engine/engine';
import type { BarHeatCell } from '../model/results';
import { followTarget, scrollBehavior, shouldFollow } from '../model/scroll';
import type { BarRange, ScoreLayer } from '../model/types';
import styles from './Score.module.css';

/** Props of the score. */
export interface ScoreProps {
  engine: PlayerEngine;
  song: Song;
  track: string;
  layer: ScoreLayer;
  /** One scrolling line (phone held sideways) or wrapped lines. */
  line: boolean;
  /** Follow the music (playing, or wait mode moving on). */
  running: boolean;
  loop: BarRange | null;
  /** Choosing a loop by taps or a drag. */
  picking: boolean;
  onLoopChange: (range: TabRange | null) => void;
  onSeek: (at: TabSeek) => void;
  noteStates: ReadonlyMap<string, TabNoteState> | null;
  heat: readonly BarHeatCell[] | null;
  size: 'sm' | 'md' | 'lg';
  /** Strum parts show chord boxes above each change. */
  diagrams: boolean;
  /** Tap along: the whole score is a tap pad (pointer down, timed by the event). */
  onTapDown?: (timeStamp: number) => void;
  /** Things drawn over the score box (count-in, prompts). */
  children?: ReactNode;
}

/** The score box. */
export function Score(props: ScoreProps) {
  const { engine, song, track, layer, line, running, loop, picking, onLoopChange, onSeek, noteStates, heat, size, diagrams, onTapDown, children } = props;
  const tab = useRef<TabViewHandle>(null);
  const box = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const lastScroll = useRef(0);
  const lastLine = useRef(-1);
  const [content, setContent] = useState<HTMLElement | null>(null);
  const [layout, setLayout] = useState<TabLayout | null>(null);

  // The learner scrolling the score pauses following for a moment.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const mark = () => {
      lastScroll.current = performance.now();
    };
    el.addEventListener('wheel', mark, { passive: true });
    el.addEventListener('touchmove', mark, { passive: true });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'ArrowDown' || e.key === 'ArrowUp') mark();
    });
    return () => {
      el.removeEventListener('wheel', mark);
      el.removeEventListener('touchmove', mark);
    };
  }, []);

  const tabRoot = useRef<HTMLElement | null>(null);
  const follow = useCallback(
    (bar: number, progress: number, force = false) => {
      const L = tab.current?.getLayout();
      const el = box.current;
      if (!L || !el || L.mode !== 'wrap') return;
      const mi = bar - L.model.firstBar;
      const m = L.measures[mi];
      if (!m) return;
      const sys = m.system;
      // Where the TabView's content sits inside the scroll box.
      if (!tabRoot.current || !el.contains(tabRoot.current)) tabRoot.current = el.querySelector<HTMLElement>('[data-tab-view]');
      const offset = tabRoot.current ? tabRoot.current.offsetTop : 0;
      const lines = L.systems.map((s) => ({ y: s.y + offset, height: s.height }));
      // For the browser check: are this line and the next one in view right now?
      const a = lines[sys];
      const b = lines[sys + 1] ?? a;
      playerDebug.follow = { line: sys, lines: lines.length, current: a.y >= el.scrollTop - 1 && a.y + a.height <= el.scrollTop + el.clientHeight + 1, next: b.y + b.height <= el.scrollTop + el.clientHeight + 1, scrollTop: el.scrollTop };
      if (!force && !shouldFollow(performance.now(), lastScroll.current)) return;
      if (sys === lastLine.current && !force && progress < 0.5) return;
      lastLine.current = sys;
      const target = followTarget(lines, sys, { top: el.scrollTop, height: el.clientHeight }, el.scrollHeight);
      if (target === null) return;
      el.scrollTo({ top: target, behavior: scrollBehavior(target - el.scrollTop, el.clientHeight, reduced) });
    },
    [reduced],
  );

  // Every frame while playing: the cursor at what is heard, the view kept on it, missed notes counted.
  useRafLoop(() => {
    const pos = engine.player.position();
    tab.current?.setPlayerPosition(pos.countIn ? { bar: pos.bar, barProgress: pos.barProgress } : pos);
    engine.frame();
    playerDebug.frames++;
    playerDebug.cursor = { tick: pos.tick, bar: pos.bar, audio: audioSoundingNow() };
    if (!line) follow(pos.bar, pos.barProgress);
  }, running);

  // When not running, the cursor sits where the player is (after a seek, a stop or a reload).
  const state = engine.getState();
  useEffect(() => {
    if (running) return;
    const id = requestAnimationFrame(() => {
      const pos = engine.player.position();
      tab.current?.setPlayerPosition(pos);
      if (!line) {
        lastLine.current = -1;
        follow(pos.bar, pos.barProgress, true);
      } else tab.current?.scrollToBar(pos.bar);
    });
    return () => cancelAnimationFrame(id);
  }, [running, state.tick, state.bar, layout, line, engine, follow]);

  // The TabView's layout and content element, for the heat strip (drawn inside it so it scrolls
  // with it). The layout changes on resize and once the fonts settle; a slow poll is enough.
  useEffect(() => {
    const check = () => {
      const L = tab.current?.getLayout() ?? null;
      const el = box.current?.querySelector<HTMLElement>('[data-tab-view] > div') ?? null;
      setLayout((prev) => (prev === L ? prev : L));
      setContent((prev) => (prev === el ? prev : el));
    };
    const first = requestAnimationFrame(check);
    const slow = setInterval(check, 400);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(slow);
    };
  }, [song, track, layer, line, size]);

  return (
    <div className={cx(styles.wrap, line && styles.wrapLine)}>
      <div
        ref={box}
        className={cx(styles.box, line && styles.boxLine, picking && styles.picking, onTapDown && styles.tapping)}
        data-player-score=""
        onPointerDown={
          onTapDown
            ? (e) => {
                if (e.button !== 0) return;
                onTapDown(e.timeStamp);
              }
            : undefined
        }
      >
        <TabView
          ref={tab}
          song={song}
          track={track}
          layout={line ? 'line' : 'wrap'}
          size={size}
          notation={layer === 'both'}
          chords={diagrams ? 'diagrams' : true}
          loop={loop}
          onLoopChange={onLoopChange}
          onSeek={onTapDown ? undefined : onSeek}
          pick={onTapDown ? 'none' : picking ? 'loop' : 'seek'}
          noteStates={noteStates}
          autoScroll={line}
          className={styles.tab}
          aria-label={`${song.meta.title}: ${layer === 'both' ? 'notation and tab' : 'tab'}. Tap a bar to start there.`}
        />
        {heat && layout && content && createPortal(<HeatStrip layout={layout} heat={heat} />, content)}
      </div>
      {children}
    </div>
  );
}

const HEAT_WORDS = ['clean', 'a slip', 'some trouble', 'mostly wrong'];

/** Thin marks above the bars that went wrong, with their names for screen readers. */
function HeatStrip({ layout, heat }: { layout: TabLayout; heat: readonly BarHeatCell[] }) {
  return (
    <div className={styles.heat} aria-hidden="true">
      {heat
        .filter((h) => h.level > 0)
        .flatMap((h) =>
          barRangeRects(layout, h.bar, h.bar, 'all').map((r, i) => (
            <div
              key={`${h.bar}-${i}`}
              className={styles.heatCell}
              data-level={h.level}
              style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
              data-label={`Bar ${h.bar + 1}: ${HEAT_WORDS[h.level]}`}
            />
          )),
        )}
    </div>
  );
}
