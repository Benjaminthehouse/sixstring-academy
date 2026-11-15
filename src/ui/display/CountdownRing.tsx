import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLatest } from '../hooks/useLatest';
import { cx } from '../util/cx';
import { formatClock } from '../util/format';
import type { ProgressTone } from '../feedback/Progress';
import styles from '../feedback/Progress.module.css';

/** Whole seconds to display for a remaining time: counts 3, 2, 1 and shows 0 only at the end. */
export function countdownLabelSeconds(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000 - 1e-9));
}

/** Props for `<CountdownRing>`. */
export interface CountdownRingProps {
  /** Total length in seconds. */
  seconds: number;
  /** Runs while true. Pausing keeps the remaining time. Default true. */
  running?: boolean;
  /** Change this to restart from the full time. */
  resetKey?: unknown;
  /** Called once when the time runs out. */
  onDone?: () => void;
  /** Called when the displayed whole second changes (for ticks or announcements). */
  onSecond?: (secondsLeft: number) => void;
  /** Outer diameter in px. Default 72. */
  size?: number;
  thickness?: number;
  tone?: ProgressTone;
  /** Turn red for the last N seconds. Default 3; 0 disables. */
  urgentBelow?: number;
  /** Accessible name. Default "Time left". */
  label?: string;
  /** Custom centre: receives the whole seconds left. Default: the number (m:ss past a minute). */
  children?: (secondsLeft: number) => ReactNode;
  className?: string;
}

/**
 * A ring that drains as time runs out, with the seconds in the middle (timed drills, rest between
 * sets). The ring is animated outside React; state changes once per second.
 *   <CountdownRing seconds={30} running={playing} onDone={finish} />
 */
export function CountdownRing({ seconds, running = true, resetKey, onDone, onSecond, size = 72, thickness, tone = 'accent', urgentBelow = 3, label = 'Time left', children, className }: CountdownRingProps) {
  const totalMs = Math.max(0, seconds * 1000);
  const stroke = thickness ?? Math.max(4, Math.round(size / 10));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = useRef<SVGCircleElement | null>(null);
  const remaining = useRef(totalMs);
  const finished = useRef(false);
  const [shown, setShown] = useState(() => countdownLabelSeconds(totalMs));
  const shownRef = useRef(shown);
  const onDoneRef = useLatest(onDone);
  const onSecondRef = useLatest(onSecond);

  const paint = (ms: number) => {
    const frac = totalMs > 0 ? ms / totalMs : 0;
    arc.current?.setAttribute('stroke-dashoffset', String(c * (1 - frac)));
  };

  // Restart when the length or the reset key changes.
  useEffect(() => {
    remaining.current = totalMs;
    finished.current = false;
    shownRef.current = countdownLabelSeconds(totalMs);
    setShown(shownRef.current);
    paint(totalMs);
    // `paint` only reads refs and the values listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalMs, resetKey, c]);

  useEffect(() => {
    if (!running || typeof requestAnimationFrame === 'undefined') return;
    let raf = 0;
    let last = -1;
    const frame = (time: number) => {
      const dt = last < 0 ? 0 : time - last;
      last = time;
      if (!finished.current) {
        remaining.current = Math.max(0, remaining.current - dt);
        paint(remaining.current);
        const next = countdownLabelSeconds(remaining.current);
        if (next !== shownRef.current) {
          shownRef.current = next;
          setShown(next);
          onSecondRef.current?.(next);
        }
        if (remaining.current <= 0) {
          finished.current = true;
          onDoneRef.current?.();
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, totalMs, resetKey, c]);

  const urgent = urgentBelow > 0 && shown <= urgentBelow && shown > 0 && totalMs > urgentBelow * 1000;
  return (
    <div className={cx(styles.ring, styles[`tone-${tone}`], urgent && styles.countdownUrgent, className)} style={{ width: size, height: size }} role="timer" aria-label={`${label}: ${shown} seconds`}>
      <svg className={styles.ringSvg} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className={styles.ringTrack} cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle ref={arc} className={cx(styles.ringFill, styles.ringNoAnim)} cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={0} />
      </svg>
      <div className={styles.ringCenter} aria-hidden="true">
        {children ? (
          children(shown)
        ) : (
          <span className={styles.ringValue} style={{ fontSize: Math.max(12, size * (shown >= 60 ? 0.24 : 0.36)) }}>
            {shown >= 60 ? formatClock(shown) : shown}
          </span>
        )}
      </div>
    </div>
  );
}
