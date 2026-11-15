/**
 * Guitar tablature of one track of a song, engraved in SVG: string lines with knocked-out fret
 * numbers, bars, time signatures, tuning labels, sections and tempo, rhythm stems and beams under
 * the staff, every technique the song model has, chord symbols (optionally with small diagrams)
 * and lyrics. Measures are sized by their content and wrapped to the width; `layout="line"` puts
 * everything on one horizontally scrolling line for play-along.
 *
 *   <TabView song={song} />
 *   <TabView song={song} track="bass" size="lg" notation />
 *   const tab = useRef<TabViewHandle>(null);
 *   useRafLoop(() => tab.current?.setPlayerPosition(player.position()), playing);   // no React render per frame
 *   <TabView ref={tab} song={song} layout="line" loop={loop} onLoopChange={setLoop} onSeek={(p) => player.seekBar(p.bar)} />
 *
 * Only the systems near the viewport are drawn; the cursor, the current-beat highlight, the loop
 * and the selection are a separate layer moved through refs.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Song } from '@/core/song';
import { cx, focusRing, useElementSize, usePrefersReducedMotion } from '@/ui';
import { useMusicSettings } from '../settings';
import type { NoteNaming } from '../types';
import { barBoundaryAt, barRangeRects, columnSpan, hitTest, layoutTab, locate, measureOfBar, regionBottom, regionTop, type NotationSpacing, type TabLayout } from './layout';
import { buildTabModel, type TabModel } from './model';
import { TabTile, type TabNoteState } from './TabTile';
import { useScoreSpacing } from './ScoreLayer';
import { useTabText } from './useTabText';
import styles from './TabView.module.css';

export type { TabNoteState } from './TabTile';

/** A place in the music: a song bar and ticks from its start. */
export interface TabCursor {
  bar: number;
  tick: number;
}

/** A range of bars, both ends included. */
export interface TabRange {
  from: number;
  to: number;
}

/** What a tap or click on a beat gives. */
export interface TabSeek {
  bar: number;
  /** Beat index in the bar. */
  beat: number;
  /** Ticks from the start of the bar. */
  tick: number;
}

/** Sizes: string spacing 11 / 13 / 15.6 / 19 px. A number is a zoom factor. */
export type TabSize = 'sm' | 'md' | 'lg' | 'xl' | number;

/** Props of `<TabView>`. */
export interface TabViewProps {
  song: Song;
  /** Track id, name or index (default the first track). */
  track?: string | number;
  /** `wrap` (default): systems fill the width. `line`: one line that scrolls sideways (play-along). */
  layout?: 'wrap' | 'line';
  size?: TabSize;
  /** Show only bars `[from, to)`. */
  bars?: [number, number];
  /** Rhythm stems and beams under the staff (default true; false when `notation` is on). */
  rhythm?: boolean;
  /** Standard notation above the tab (VexFlow, loaded on demand; tab-only while it loads or if it cannot). */
  notation?: boolean;
  /** Chord symbols above the staff (default true); `diagrams` adds a small chord box above each change. */
  chords?: boolean | 'diagrams';
  /** With a capo, name chords by the shape played (default) or by what sounds. */
  chordNames?: 'shapes' | 'sounding';
  lyrics?: boolean;
  barNumbers?: boolean;
  /** Most bars on one system (wrap layout). */
  maxBarsPerSystem?: number;
  /** Declarative cursor (for occasional updates; per frame use the handle's `setCursor`). */
  cursor?: TabCursor | null;
  /** Practice states of notes, keyed `bar:beat:string` or `bar:beat` (see `noteKey`). */
  noteStates?: ReadonlyMap<string, TabNoteState> | Readonly<Record<string, TabNoteState>> | null;
  /** Shaded loop range; with `onLoopChange` its ends get draggable handles. */
  loop?: TabRange | null;
  onLoopChange?: (range: TabRange | null) => void;
  /** Selected bars (drag across bars with a mouse or pen, or tap two bars in `pick="select"` mode). */
  selection?: TabRange | null;
  onSelectionChange?: (range: TabRange | null) => void;
  /** Tap or click a beat. */
  onSeek?: (at: TabSeek) => void;
  /** What a tap does: seek (default with `onSeek`), set the loop's first then last bar, or select bars. */
  pick?: 'seek' | 'loop' | 'select' | 'none';
  /** Keep the cursor in view (default true). */
  autoScroll?: boolean;
  /** Make the view its own vertical scroll box of this height (wrap layout). */
  height?: number | string;
  naming?: NoteNaming;
  'aria-label'?: string;
  className?: string;
}

/** What `ref` gives. */
export interface TabViewHandle {
  /** Move the cursor (call every animation frame; nothing re-renders). `null` hides it. */
  setCursor(at: TabCursor | null): void;
  /** Move the cursor to a `SongPlayer.position()`: its song bar and progress through the bar. */
  setPlayerPosition(pos: { bar: number; barProgress: number; countIn?: unknown } | null): void;
  /** Scroll a bar into view. */
  scrollToBar(bar: number, opts?: { smooth?: boolean }): void;
  /** The current layout (for overlays of your own), or null before the first measure. */
  getLayout(): TabLayout | null;
}

const SIZE_ZOOM: Record<Exclude<TabSize, number>, number> = { sm: 0.85, md: 1, lg: 1.2, xl: 1.46 };
/** Chord diagram size at zoom 1 (an `xs` chord box: 3.5 rem wide). */
const DIAGRAM = { width: 56, height: 51 };
const USER_SCROLL_PAUSE_MS = 2500;
/** Up to this many systems (or line tiles) everything is drawn; longer pieces draw only what is near the view. */
const DRAW_ALL_TILES = 12;

function toStateMap(input: TabViewProps['noteStates']): ReadonlyMap<string, TabNoteState> | null {
  if (!input) return null;
  if (input instanceof Map) return input;
  return new Map(Object.entries(input as Record<string, TabNoteState>));
}

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    p = p.parentElement;
  }
  return null;
}

function describe(model: TabModel): string {
  const song = model.song;
  const bars = model.measures.length;
  const first = model.measures[0];
  const time = first ? `${first.time.numerator}/${first.time.denominator}` : '';
  const tuning = model.stringLabels.slice(1).reverse().join(' ');
  const parts = [`Tab of ${song.meta.title}${model.track.name && song.tracks.length > 1 ? `, ${model.track.name}` : ''}`, `${bars} ${bars === 1 ? 'bar' : 'bars'}${time ? ` in ${time}` : ''}`, `tuning ${tuning}`];
  if (model.capo) parts.push(`capo ${model.capo}`);
  return parts.join(', ');
}

/** The tab. See the module comment. */
export const TabView = forwardRef<TabViewHandle, TabViewProps>(function TabView(props, ref) {
  const settings = useMusicSettings();
  const {
    song,
    track,
    layout: mode = 'wrap',
    size = 'md',
    bars,
    notation = false,
    chords = true,
    chordNames = 'shapes',
    lyrics = true,
    barNumbers = true,
    maxBarsPerSystem,
    cursor,
    noteStates,
    loop = null,
    onLoopChange,
    selection = null,
    onSelectionChange,
    onSeek,
    autoScroll = true,
    height,
    naming = settings.naming,
    className,
  } = props;
  const pick = props.pick ?? (onSeek ? 'seek' : onSelectionChange ? 'select' : 'none');
  const rhythm = props.rhythm ?? !notation;
  const zoom = typeof size === 'number' ? size : SIZE_ZOOM[size];
  const reducedMotion = usePrefersReducedMotion();
  const measureText = useTabText();
  const [sizeRef, { width }] = useElementSize<HTMLDivElement>();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRoot = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      sizeRef(node);
    },
    [sizeRef],
  );

  const barsKey = bars ? `${bars[0]}-${bars[1]}` : '';
  const model = useMemo(() => {
    try {
      return buildTabModel(song, { track, bars, chordNames, naming });
    } catch {
      return null;
    }
    // bars is compared by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song, track, barsKey, chordNames, naming]);

  const score = useScoreSpacing(model, notation);
  const spacing: NotationSpacing | null = score.ready ? score.spacing : null;
  const layout = useMemo(() => {
    if (!model || width <= 0) return null;
    return layoutTab(model, {
      width,
      mode,
      zoom,
      measureText,
      rhythm,
      chords: chords !== false,
      diagrams: chords === 'diagrams' ? DIAGRAM : null,
      lyrics,
      barNumbers,
      notation: spacing,
      maxBarsPerSystem,
    });
  }, [model, width, mode, zoom, measureText, rhythm, chords, lyrics, barNumbers, spacing, maxBarsPerSystem]);
  const layoutRef = useRef<TabLayout | null>(null);
  layoutRef.current = layout;

  // ── which tiles are near the viewport ───────────────────────────────────────────────────────
  const [visible, setVisible] = useState<{ lo: number; hi: number }>({ lo: 0, hi: DRAW_ALL_TILES - 1 });
  const updateVisible = useCallback(() => {
    const root = rootRef.current;
    const L = layoutRef.current;
    if (!root || !L) return;
    let lo = Infinity;
    let hi = -1;
    if (L.tiles.length <= DRAW_ALL_TILES) {
      // A short piece is simply drawn whole: nothing pops in, and full-page captures see it all.
      lo = 0;
      hi = L.tiles.length - 1;
    } else if (L.mode === 'line') {
      const margin = Math.max(900, root.clientWidth);
      const left = root.scrollLeft - margin;
      const right = root.scrollLeft + root.clientWidth + margin;
      L.tiles.forEach((t) => {
        if (t.x + t.width >= left && t.x <= right) {
          lo = Math.min(lo, t.index);
          hi = Math.max(hi, t.index);
        }
      });
    } else {
      const rect = root.getBoundingClientRect();
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const margin = Math.max(700, vh);
      const ownScroll = height !== undefined;
      const top = ownScroll ? root.scrollTop - margin : -rect.top - margin;
      const bottom = ownScroll ? root.scrollTop + root.clientHeight + margin : vh - rect.top + margin;
      L.tiles.forEach((t) => {
        if (t.y + t.height >= top && t.y <= bottom) {
          lo = Math.min(lo, t.index);
          hi = Math.max(hi, t.index);
        }
      });
    }
    if (hi < 0) {
      lo = 0;
      hi = -1;
    }
    setVisible((v) => (v.lo === lo && v.hi === hi ? v : { lo, hi }));
  }, [height]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateVisible();
      });
    };
    schedule();
    const root = rootRef.current;
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    root?.addEventListener('scroll', schedule, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      root?.removeEventListener('scroll', schedule);
    };
  }, [updateVisible, layout]);

  // ── note states, split per tile so only tiles whose notes changed re-render ─────────────────
  const stateMap = useMemo(() => toStateMap(noteStates), [noteStates]);
  const tileStates = useMemo(() => {
    if (!layout || !stateMap || stateMap.size === 0) return null;
    const byBar = new Map<number, Array<[string, TabNoteState]>>();
    stateMap.forEach((state, key) => {
      const bar = Number(key.slice(0, key.indexOf(':')));
      let list = byBar.get(bar);
      if (!list) byBar.set(bar, (list = []));
      list.push([key, state]);
    });
    return layout.tiles.map((t) => {
      const entries: Array<[string, TabNoteState]> = [];
      for (let i = t.from; i < t.to; i++) entries.push(...(byBar.get(layout.measures[i].bar) ?? []));
      entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
      return { map: entries.length ? new Map(entries) : null, key: entries.map((e) => `${e[0]}=${e[1]}`).join(',') };
    });
  }, [layout, stateMap]);
  const stableStates = useRef<Array<{ map: ReadonlyMap<string, TabNoteState> | null; key: string }>>([]);
  const statesFor = (i: number) => {
    const next = tileStates?.[i] ?? { map: null, key: '' };
    const prev = stableStates.current[i];
    if (prev && prev.key === next.key) return prev;
    stableStates.current[i] = next;
    return next;
  };

  // ── cursor and current beat, moved through refs ─────────────────────────────────────────────
  const cursorEl = useRef<HTMLDivElement | null>(null);
  const beatEl = useRef<HTMLDivElement | null>(null);
  const cursorAt = useRef<TabCursor | null>(null);
  const shown = useRef<{ measure: number; col: number; system: number; beat: string } | null>(null);
  const userScrolledAt = useRef(0);
  const autoScrollRef = useRef(autoScroll);
  autoScrollRef.current = autoScroll;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const followSystem = useCallback((systemIndex: number) => {
    const root = rootRef.current;
    const L = layoutRef.current;
    if (!root || !L || !autoScrollRef.current) return;
    if (performance.now() - userScrolledAt.current < USER_SCROLL_PAUSE_MS) return;
    const sys = L.systems[systemIndex];
    if (!sys) return;
    // Glide to the next line; jump when the cursor leaps far (a loop going back, a seek).
    const behaviorFor = (distance: number, view: number): ScrollBehavior => (reducedRef.current || Math.abs(distance) > view * 1.5 ? 'auto' : 'smooth');
    if (height !== undefined) {
      const top = sys.y;
      const bottom = sys.y + sys.height;
      if (top < root.scrollTop + 8 || bottom > root.scrollTop + root.clientHeight - 8) {
        const target = Math.max(0, top - root.clientHeight * 0.12);
        root.scrollTo({ top: target, behavior: behaviorFor(target - root.scrollTop, root.clientHeight) });
      }
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const parent = scrollParentOf(root);
    const viewTop = parent ? parent.getBoundingClientRect().top : 0;
    const viewH = parent ? parent.clientHeight : window.innerHeight;
    const top = rootRect.top + sys.y - viewTop;
    const bottom = top + sys.height;
    if (top >= viewH * 0.08 && bottom <= viewH * 0.88) return;
    const delta = top - viewH * 0.22;
    const behavior = behaviorFor(delta, viewH);
    if (parent) parent.scrollBy({ top: delta, behavior });
    else window.scrollBy({ top: delta, behavior });
  }, [height]);

  const placeCursor = useCallback(
    (at: TabCursor | null, follow = true) => {
      cursorAt.current = at;
      const L = layoutRef.current;
      const cEl = cursorEl.current;
      const bEl = beatEl.current;
      const root = rootRef.current;
      if (!cEl || !bEl) return;
      const loc = L && at ? locate(L, at.bar, at.tick) : null;
      if (!L || !loc) {
        cEl.style.opacity = '0';
        bEl.style.opacity = '0';
        if (shown.current) root?.querySelectorAll('[data-now]').forEach((el) => el.removeAttribute('data-now'));
        shown.current = null;
        return;
      }
      const sys = L.systems[loc.system];
      const top = sys.y + regionTop(sys);
      const h = regionBottom(sys) - regionTop(sys);
      cEl.style.transform = `translate3d(${loc.x.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
      cEl.style.height = `${h}px`;
      cEl.style.opacity = '1';
      const m = L.model.measures[loc.measure];
      const beatKey = `${m.bar}:${m.columns[loc.col]?.beat ?? 0}`;
      const prev = shown.current;
      if (!prev || prev.measure !== loc.measure || prev.col !== loc.col) {
        const span = columnSpan(L, loc.measure, loc.col);
        const by = sys.y + sys.staffTop - L.metrics.lineGap * 0.85;
        const bh = sys.staffBottom - sys.staffTop + L.metrics.lineGap * 1.7;
        bEl.style.transform = `translate3d(${span.x0.toFixed(1)}px, ${by.toFixed(1)}px, 0)`;
        bEl.style.width = `${(span.x1 - span.x0).toFixed(1)}px`;
        bEl.style.height = `${bh.toFixed(1)}px`;
        bEl.style.opacity = '1';
        if (!prev || prev.beat !== beatKey) {
          root?.querySelectorAll('[data-now]').forEach((el) => el.removeAttribute('data-now'));
          root?.querySelectorAll(`[data-beat="${beatKey}"]`).forEach((el) => el.setAttribute('data-now', ''));
        }
      }
      const systemChanged = !prev || prev.system !== loc.system;
      shown.current = { measure: loc.measure, col: loc.col, system: loc.system, beat: beatKey };
      if (!follow) return;
      if (L.mode === 'line' && root && autoScrollRef.current && performance.now() - userScrolledAt.current > USER_SCROLL_PAUSE_MS) {
        const target = Math.max(0, loc.x - root.clientWidth * 0.3);
        if (Math.abs(root.scrollLeft - target) > 1) root.scrollLeft = target;
      } else if (systemChanged && L.mode === 'wrap') {
        followSystem(loc.system);
      }
    },
    [followSystem],
  );

  // Notes of the current beat are marked when their tile mounts later, too; this never scrolls
  // (tiles mount because the learner scrolled).
  useEffect(() => {
    const at = cursorAt.current;
    shown.current = null;
    placeCursor(at, false);
  }, [layout, visible, placeCursor]);

  useEffect(() => {
    if (cursor !== undefined) placeCursor(cursor);
  }, [cursor?.bar, cursor?.tick, cursor === null, placeCursor]); // eslint-disable-line react-hooks/exhaustive-deps

  // A scroll by the learner pauses following the cursor for a moment.
  useEffect(() => {
    const mark = () => {
      userScrolledAt.current = performance.now();
    };
    const root = rootRef.current;
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    root?.addEventListener('pointerdown', mark, { passive: true });
    return () => {
      window.removeEventListener('wheel', mark);
      window.removeEventListener('touchmove', mark);
      root?.removeEventListener('pointerdown', mark);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setCursor: (at) => placeCursor(at),
      setPlayerPosition: (pos) => {
        const L = layoutRef.current;
        if (!pos || !L) return placeCursor(null);
        const mi = measureOfBar(L, pos.bar);
        if (mi < 0) return placeCursor(null);
        placeCursor({ bar: pos.bar, tick: Math.max(0, Math.min(1, pos.barProgress)) * L.model.measures[mi].length });
      },
      scrollToBar: (bar, opts) => {
        const L = layoutRef.current;
        const root = rootRef.current;
        if (!L || !root) return;
        const mi = measureOfBar(L, bar);
        if (mi < 0) return;
        const lm = L.measures[mi];
        if (L.mode === 'line') root.scrollTo({ left: Math.max(0, lm.x - root.clientWidth * 0.2), behavior: opts?.smooth ? 'smooth' : 'auto' });
        else {
          userScrolledAt.current = 0;
          followSystem(lm.system);
        }
      },
      getLayout: () => layoutRef.current,
    }),
    [placeCursor, followSystem],
  );

  // ── pointer: tap to seek / pick bars, drag to select, loop handles ──────────────────────────
  const contentRef = useRef<HTMLDivElement | null>(null);
  const press = useRef<{ x: number; y: number; id: number; t: number; dragging: boolean; anchorBar: number; type: string } | null>(null);
  const pendingPick = useRef<number | null>(null);
  const [pendingBar, setPendingBar] = useState<number | null>(null);

  const toContent = (e: { clientX: number; clientY: number }) => {
    const el = contentRef.current!;
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!layout || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const p = toContent(e);
    const hit = hitTest(layout, p.x, p.y);
    if (!hit) return;
    press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now(), dragging: false, anchorBar: hit.bar, type: e.pointerType };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId || !layout) return;
    // Touch drags scroll the page; selecting by dragging is for mouse and pen.
    if (pr.type === 'touch') return;
    const dist = Math.hypot(e.clientX - pr.x, e.clientY - pr.y);
    if (!pr.dragging && dist > 6 && (onSelectionChange || (pick === 'loop' && onLoopChange))) {
      pr.dragging = true;
      contentRef.current?.setPointerCapture(e.pointerId);
    }
    if (!pr.dragging) return;
    const p = toContent(e);
    const hit = hitTest(layout, p.x, p.y);
    if (!hit) return;
    const range = { from: Math.min(pr.anchorBar, hit.bar), to: Math.max(pr.anchorBar, hit.bar) };
    if (pick === 'loop' && onLoopChange) {
      if (!loop || loop.from !== range.from || loop.to !== range.to) onLoopChange(range);
    } else if (onSelectionChange && (!selection || selection.from !== range.from || selection.to !== range.to)) onSelectionChange(range);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pr = press.current;
    press.current = null;
    if (!pr || pr.id !== e.pointerId || !layout) return;
    if (pr.dragging) {
      contentRef.current?.releasePointerCapture?.(e.pointerId);
      return;
    }
    if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 10) return;
    const p = toContent(e);
    const hit = hitTest(layout, p.x, p.y);
    if (!hit) return;
    if (e.shiftKey && onSelectionChange) {
      const anchor = selection?.from ?? hit.bar;
      onSelectionChange({ from: Math.min(anchor, hit.bar), to: Math.max(anchor, hit.bar) });
      return;
    }
    tap(hit);
  };

  const tap = (hit: { bar: number; beat: number; tick: number; measure: number; col: number }) => {
    focusBeat.current = { measure: hit.measure, col: hit.col };
    if (pick === 'seek') onSeek?.({ bar: hit.bar, beat: hit.beat, tick: hit.tick });
    else if (pick === 'loop' || pick === 'select') {
      const set = pick === 'loop' ? onLoopChange : onSelectionChange;
      if (!set) return;
      const anchor = pendingPick.current;
      if (anchor === null) {
        pendingPick.current = hit.bar;
        setPendingBar(hit.bar);
        set({ from: hit.bar, to: hit.bar });
      } else {
        pendingPick.current = null;
        setPendingBar(null);
        set({ from: Math.min(anchor, hit.bar), to: Math.max(anchor, hit.bar) });
      }
    }
  };

  // ── keyboard: arrows step through beats, shift+arrows grow the selection ────────────────────
  const focusBeat = useRef<{ measure: number; col: number } | null>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!layout) return;
    const L = layout;
    const beats: Array<{ measure: number; col: number }> = [];
    L.model.measures.forEach((m, mi) => m.columns.forEach((c, ci) => c.piece === 0 && beats.push({ measure: mi, col: ci })));
    if (!beats.length) return;
    const cur = focusBeat.current ?? (cursorAt.current ? (() => {
      const loc = locate(L, cursorAt.current!.bar, cursorAt.current!.tick);
      return loc ? { measure: loc.measure, col: loc.col } : null;
    })() : null);
    let index = cur ? beats.findIndex((b) => b.measure === cur.measure && b.col >= cur.col) : -1;
    if (index < 0) index = 0;
    const go = (i: number) => {
      const b = beats[Math.max(0, Math.min(beats.length - 1, i))];
      const m = L.model.measures[b.measure];
      const c = m.columns[b.col];
      focusBeat.current = b;
      if (pick === 'seek' || onSeek) onSeek?.({ bar: m.bar, beat: c.beat, tick: c.start });
      if (!onSeek) placeCursor({ bar: m.bar, tick: c.start });
    };
    if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && onSelectionChange) {
      e.preventDefault();
      const firstBar = L.model.measures[0].bar;
      const lastBar = L.model.measures[L.model.measures.length - 1].bar;
      const base = selection ?? (cur ? { from: L.model.measures[cur.measure].bar, to: L.model.measures[cur.measure].bar } : { from: firstBar, to: firstBar });
      const to = Math.max(firstBar, Math.min(lastBar, base.to + (e.key === 'ArrowRight' ? 1 : -1)));
      onSelectionChange({ from: Math.min(base.from, to), to: Math.max(base.from, to) });
      return;
    }
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        go(cur ? index + (beats[index].measure === cur.measure && beats[index].col === cur.col ? 1 : 0) : 0);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        go(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        go(0);
        break;
      case 'End':
        e.preventDefault();
        go(beats.length - 1);
        break;
      case 'Escape':
        if (selection && onSelectionChange) {
          e.preventDefault();
          onSelectionChange(null);
        }
        pendingPick.current = null;
        setPendingBar(null);
        break;
      default:
    }
  };

  // ── render ──────────────────────────────────────────────────────────────────────────────────
  const loopRects = useMemo(() => (layout && loop ? barRangeRects(layout, loop.from, loop.to) : []), [layout, loop]);
  const selRects = useMemo(() => (layout && selection ? barRangeRects(layout, selection.from, selection.to) : []), [layout, selection]);
  const pendingRects = useMemo(() => (layout && pendingBar !== null ? barRangeRects(layout, pendingBar, pendingBar) : []), [layout, pendingBar]);
  const interactive = pick !== 'none' || !!onSeek;
  const label = props['aria-label'] ?? (model ? describe(model) : 'Tab');
  const rootStyle = { '--z': zoom, ...(height !== undefined ? { height, overflowY: 'auto' } : {}) } as CSSProperties;

  if (!model) {
    return (
      <div className={cx(styles.root, className)}>
        <p className={styles.empty}>This song has no track to show as tab.</p>
      </div>
    );
  }

  const tileLabel = (t: { from: number; to: number }) => {
    const a = model.measures[t.from]?.bar ?? 0;
    const b = model.measures[t.to - 1]?.bar ?? a;
    return a === b ? `Bar ${a + 1}` : `Bars ${a + 1} to ${b + 1}`;
  };

  return (
    <div
      ref={setRoot}
      className={cx(styles.root, mode === 'line' && styles.line, interactive && focusRing, className)}
      style={rootStyle}
      role="group"
      aria-label={label}
      aria-roledescription="tablature"
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      data-tab-view=""
    >
      {layout ? (
        <div
          ref={contentRef}
          className={cx(styles.content, interactive && styles.interactive)}
          style={{ width: layout.width, height: layout.height }}
          onPointerDown={interactive ? onPointerDown : undefined}
          onPointerMove={interactive ? onPointerMove : undefined}
          onPointerUp={interactive ? onPointerUp : undefined}
          onPointerCancel={() => (press.current = null)}
        >
          <div className={styles.underlay} aria-hidden="true">
            {loopRects.map((r, i) => (
              <div key={`l${i}`} className={styles.loop} data-start={r.start || undefined} data-end={r.end || undefined} style={{ left: r.x, top: r.y, width: r.width, height: r.height }} />
            ))}
            {selRects.map((r, i) => (
              <div key={`s${i}`} className={styles.selection} style={{ left: r.x, top: r.y, width: r.width, height: r.height }} />
            ))}
            {pendingRects.map((r, i) => (
              <div key={`p${i}`} className={styles.pending} style={{ left: r.x, top: r.y, width: r.width, height: r.height }} />
            ))}
            <div ref={beatEl} className={styles.beat} />
            <div ref={cursorEl} className={styles.cursor} />
          </div>
          {layout.tiles.map((t) => {
            const st = statesFor(t.index);
            const isVisible = t.index >= visible.lo && t.index <= visible.hi;
            return (
              <TabTile
                key={t.index}
                layout={layout}
                tile={t}
                visible={isVisible}
                states={st.map}
                statesKey={st.key}
                label={tileLabel(t)}
                score={notation ? score : null}
              />
            );
          })}
          {loop && onLoopChange && layout.measures.length > 0 && <LoopHandles layout={layout} loop={loop} onLoopChange={onLoopChange} rects={loopRects} toContent={toContent} />}
        </div>
      ) : (
        <div className={styles.placeholder} aria-busy="true" />
      )}
    </div>
  );
});

function LoopHandles({
  layout,
  loop,
  onLoopChange,
  rects,
  toContent,
}: {
  layout: TabLayout;
  loop: TabRange;
  onLoopChange: (r: TabRange | null) => void;
  rects: ReturnType<typeof barRangeRects>;
  toContent: (e: { clientX: number; clientY: number }) => { x: number; y: number };
}) {
  const first = rects.find((r) => r.start);
  const last = [...rects].reverse().find((r) => r.end);
  const minBar = layout.model.measures[0].bar;
  const maxBar = layout.model.measures[layout.model.measures.length - 1].bar;
  const drag = useRef<number | null>(null);
  const move = (edge: 'start' | 'end', bar: number) => {
    const clamped = Math.max(minBar, Math.min(maxBar, bar));
    const next = edge === 'start' ? { from: Math.min(clamped, loop.to), to: loop.to } : { from: loop.from, to: Math.max(clamped, loop.from) };
    if (next.from !== loop.from || next.to !== loop.to) onLoopChange(next);
  };
  const handle = (edge: 'start' | 'end', r: (typeof rects)[number] | undefined) => {
    if (!r) return null;
    const x = edge === 'start' ? r.x : r.x + r.width;
    const bar = edge === 'start' ? loop.from : loop.to;
    return (
      <button
        type="button"
        className={cx(styles.handle, focusRing)}
        data-edge={edge}
        style={{ left: x, top: r.y - 22 }}
        aria-label={`Loop ${edge === 'start' ? 'starts at' : 'ends after'} bar ${bar + 1}. Arrow keys move it.`}
        onPointerDown={(e) => {
          e.stopPropagation();
          drag.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current !== e.pointerId) return;
          const p = toContent(e);
          const b = barBoundaryAt(layout, p.x, p.y, edge);
          if (b !== null) move(edge, b);
        }}
        onPointerUp={(e) => {
          drag.current = null;
          e.currentTarget.releasePointerCapture?.(e.pointerId);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            move(edge, bar + (e.key === 'ArrowRight' ? 1 : -1));
          }
        }}
      >
        <span className={styles.handleGrip} aria-hidden="true" />
      </button>
    );
  };
  return (
    <>
      {handle('start', first)}
      {handle('end', last)}
    </>
  );
}
