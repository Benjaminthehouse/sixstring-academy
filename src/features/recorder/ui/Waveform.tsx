import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cx, focusRing, useElementSize, useRafLoop } from '@/ui';
import { seekForKey, seekFraction } from '../model/signal';
import { formatDuration, spokenDuration } from '../model/takes';
import styles from '../Recorder.module.css';

/** Props for `<Waveform>`. */
export interface WaveformProps {
  peaks: readonly number[];
  /** Length of the take, seconds. */
  duration: number;
  /** Where playback is, seconds; read every frame while `playing`. */
  position: () => number;
  playing: boolean;
  onSeek: (seconds: number) => void;
  /** Space on the focused waveform. */
  onToggle?: () => void;
  label: string;
  size?: 'md' | 'lg';
  className?: string;
}

/** Bar height for a peak: the square root, so quiet passages still show and loud ones do not fill everything. */
function barHeight(peak: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, peak)));
}

/**
 * A take's waveform you can tap (or drag across) to seek, with the played part in amber and a
 * playhead. It is a slider for keyboards and screen readers: arrows step 5 s (Shift: 1 s), Home and
 * End go to the ends, Space plays. Drawn on a canvas; the playhead moves without React re-rendering.
 */
export function Waveform({ peaks, duration, position, playing, onSeek, onToggle, label, size = 'lg', className }: WaveformProps) {
  const [sizeRef, box] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const colours = useRef<{ played: string; rest: string; head: string } | null>(null);
  const lastShare = useRef(-1);
  const dragging = useRef(false);

  const setArea = useCallback(
    (node: HTMLDivElement | null) => {
      areaRef.current = node;
      sizeRef(node);
    },
    [sizeRef],
  );

  const draw = useCallback(
    (share: number) => {
      const canvas = canvasRef.current;
      if (!canvas || box.width === 0 || box.height === 0) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.round(box.width * dpr);
      const h = Math.round(box.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        colours.current = null;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (!colours.current) {
        // Colours come from the theme tokens, so both themes draw correctly.
        const cs = getComputedStyle(canvas);
        colours.current = { played: cs.getPropertyValue('--accent').trim(), rest: cs.getPropertyValue('--fg-muted').trim(), head: cs.getPropertyValue('--fg').trim() };
      }
      const c = colours.current;
      ctx.clearRect(0, 0, w, h);
      const n = Math.max(1, peaks.length);
      const gap = Math.max(1, Math.round(dpr));
      const slot = w / n;
      const barW = Math.max(1, slot - gap);
      const mid = h / 2;
      const playedX = share * w;
      for (let i = 0; i < n; i++) {
        const x = i * slot;
        const half = Math.max(dpr, (barHeight(peaks[i] ?? 0) * (h - 2 * dpr)) / 2);
        ctx.fillStyle = x + barW / 2 <= playedX ? c.played : c.rest;
        ctx.fillRect(x, mid - half, barW, half * 2);
      }
      if (share > 0 && share < 1) {
        ctx.fillStyle = c.head;
        ctx.fillRect(Math.round(playedX - dpr), 0, Math.max(2, Math.round(2 * dpr)), h);
      }
      lastShare.current = share;
    },
    [box.width, box.height, peaks],
  );

  const shareNow = useCallback(() => (duration > 0 ? Math.max(0, Math.min(1, position() / duration)) : 0), [duration, position]);

  // Redraw when the size, the take or the theme changes.
  useEffect(() => {
    colours.current = null;
    draw(shareNow());
  }, [draw, shareNow]);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const redraw = () => {
      colours.current = null;
      draw(shareNow());
    };
    mq.addEventListener?.('change', redraw);
    const observer = new MutationObserver(redraw);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => {
      mq.removeEventListener?.('change', redraw);
      observer.disconnect();
    };
  }, [draw, shareNow]);

  // The slider's value, kept current without re-rendering (it changes once a second while playing).
  // Compared with what the element says now, not with the last value written here: a re-render
  // (playback ending puts it back to 0) also writes it.
  const syncValue = useCallback(
    (seconds: number) => {
      const el = rootRef.current;
      if (!el) return;
      const second = Math.floor(seconds);
      if (el.getAttribute('aria-valuenow') === String(second)) return;
      el.setAttribute('aria-valuenow', String(second));
      el.setAttribute('aria-valuetext', `${spokenDuration(second * 1000)} of ${spokenDuration(duration * 1000)}`);
    },
    [duration],
  );

  // While playing, move the playhead every frame.
  useRafLoop(() => {
    const share = shareNow();
    if (Math.abs(share - lastShare.current) * box.width >= 0.5) draw(share);
    syncValue(position());
  }, playing);
  useEffect(() => {
    if (!playing) draw(shareNow());
  }, [playing, draw, shareNow]);

  const seekTo = (event: PointerEvent<HTMLDivElement>) => {
    const rect = (areaRef.current ?? event.currentTarget).getBoundingClientRect();
    const seconds = seekFraction(event.clientX - rect.left, rect.width) * duration;
    onSeek(seconds);
    syncValue(seconds);
    if (!playing) draw(duration > 0 ? seconds / duration : 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      if (onToggle) {
        event.preventDefault();
        if (!event.repeat) onToggle();
      }
      return;
    }
    const next = seekForKey(event.key, event.shiftKey, position(), duration);
    if (next === null) return;
    event.preventDefault();
    onSeek(next);
    syncValue(next);
    if (!playing) draw(duration > 0 ? next / duration : 0);
  };

  const now = Math.floor(position());
  return (
    <div
      ref={rootRef}
      className={cx(styles.wave, size === 'md' && styles.waveMd, focusRing, className)}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.floor(duration)}
      aria-valuenow={now}
      aria-valuetext={`${spokenDuration(now * 1000)} of ${spokenDuration(duration * 1000)}`}
      data-recorder-wave=""
      data-duration={duration.toFixed(2)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        seekTo(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) seekTo(event);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onKeyDown={onKeyDown}
    >
      <div ref={setArea} className={styles.waveArea}>
        <canvas ref={canvasRef} className={styles.waveCanvas} aria-hidden="true" />
      </div>
      <span className={styles.waveEnds} aria-hidden="true">
        <span>0:00</span>
        <span>{formatDuration(duration * 1000)}</span>
      </span>
    </div>
  );
}

/** A small, static waveform for a list row (decorative). */
export function MiniWave({ peaks, className }: { peaks: readonly number[]; className?: string }) {
  const bars = 28;
  const values: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * peaks.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / bars));
    let m = 0;
    for (let j = from; j < to && j < peaks.length; j++) m = Math.max(m, peaks[j]);
    values.push(barHeight(m));
  }
  return (
    <svg className={cx(styles.miniWave, className)} viewBox={`0 0 ${bars * 3} 20`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {values.map((v, i) => {
        const h = Math.max(1, v * 18);
        return <rect key={i} x={i * 3} y={10 - h / 2} width={2} height={h} rx={1} />;
      })}
    </svg>
  );
}
