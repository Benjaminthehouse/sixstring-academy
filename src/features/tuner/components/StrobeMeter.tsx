import { useEffect, useRef, type ReactNode } from 'react';
import { useElementSize, useLatest, useRafLoop } from '@/ui';
import type { TunerSession } from '../model/session';
import styles from './Meter.module.css';

/** Props for `<StrobeMeter>`. */
export interface StrobeMeterProps {
  session: TunerSession;
  /** Nothing to show (not listening, or waiting with no note): the bands stand still, dimmed. */
  parked: boolean;
  /** Drawn between the two end labels: the offset as a number. */
  children?: ReactNode;
}

/** Pixels per second the bands drift for each cent of error. Three cents is a slow crawl; thirty is a blur. */
const DRIFT_PER_CENT = 5.5;
/** Past this many cents the drift is as fast as it gets (faster would only alias). */
const MAX_CENTS = 55;
/** Band widths in px for the three rows, coarse to fine: the fine row shows the last cent best. */
const ROWS = [72, 36, 18];

/**
 * The strobe display for precise tuning: bands that drift left while the string is too low, right
 * while it is too high, and stand still when it is in tune. The drift speed is the error, so tiny
 * deviations that a needle hides are easy to see. Drawn on a canvas from requestAnimationFrame.
 */
export function StrobeMeter({ session, parked, children }: StrobeMeterProps) {
  const [boxRef, size] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phase = useRef(0);
  const palette = useRef({ ink: '', ok: '', age: 0 });
  const parkedRef = useLatest(parked);
  const sizeRef = useLatest(size);

  // Size the backing store for the display's pixel density whenever the box changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
  }, [size.width, size.height]);

  useRafLoop((dt) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { width, height } = sizeRef.current;
    if (!canvas || !ctx || width === 0) return;
    const f = session.frame;
    const active = (f.live || f.inTune) && !parkedRef.current;

    // Canvas needs literal colours: read the tokens, again every second so a theme switch is followed.
    const p = palette.current;
    p.age -= dt;
    if (p.age <= 0 || !p.ink) {
      const css = getComputedStyle(canvas);
      p.ink = css.getPropertyValue('--fg').trim();
      p.ok = css.getPropertyValue('--ok').trim();
      p.age = 1000;
    }

    const cents = Math.max(-MAX_CENTS, Math.min(MAX_CENTS, f.cents));
    // Inside the tolerance the bands stop completely: a still pattern is the "in tune" picture.
    if (active && !f.inTune) phase.current += (cents * DRIFT_PER_CENT * dt) / 1000;

    const dpr = canvas.width / width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = active && (f.inTune || f.within) ? p.ok : p.ink;
    const rowGap = 5;
    const rowHeight = (height - rowGap * (ROWS.length - 1)) / ROWS.length;
    ROWS.forEach((band, row) => {
      ctx.globalAlpha = active ? 0.92 - row * 0.12 : 0.16;
      // Each finer row moves at the same pace in bands, so they stop together.
      const offset = (((phase.current * band) / ROWS[0]) % (band * 2) + band * 2) % (band * 2);
      const y = row * (rowHeight + rowGap);
      for (let x = -band * 2 + offset + width / 2 - Math.ceil(width / (band * 4)) * band * 2 - band / 2; x < width; x += band * 2) {
        ctx.fillRect(x, y, band, rowHeight);
      }
    });
    ctx.globalAlpha = 1;
  });

  return (
    <div className={styles.meter} data-strobe="true">
      <div className={styles.strobeBox} aria-hidden="true">
        <div ref={boxRef} className={styles.strobeInner}>
          <canvas ref={canvasRef} className={styles.strobeCanvas} />
        </div>
      </div>
      <div className={styles.ends}>
        <span className={styles.endLow} aria-hidden="true">
          Left: too low
        </span>
        {children}
        <span className={styles.endHigh} aria-hidden="true">
          Right: too high
        </span>
      </div>
    </div>
  );
}
