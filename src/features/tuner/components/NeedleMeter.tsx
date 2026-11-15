import { useMemo, useRef, type ReactNode } from 'react';
import { cx, useLatest, useRafLoop } from '@/ui';
import type { TunerSession } from '../model/session';
import { METER_RANGE, meterPosition, meterTicks } from '../model/scale';
import styles from './Meter.module.css';

/** Props for `<NeedleMeter>`. */
export interface NeedleMeterProps {
  session: TunerSession;
  /** Cents either side of the note that count as in tune: sets the width of the centre zone. */
  tolerance: number;
  /** Nothing to point at (not listening, waiting with no note, or the note is another string's): the marker rests in the middle. */
  parked: boolean;
  /** Move without easing. */
  reducedMotion: boolean;
  /** Drawn between the two end labels: the offset as a number. */
  children?: ReactNode;
}

/** How quickly the drawn marker follows the reading, in ms: enough to bridge audio frames to screen frames. */
const FOLLOW_MS = 48;

/**
 * The dial: a pick-shaped marker that slides left (too low) or right (too high) over a scale with
 * a marked centre zone. Driven from requestAnimationFrame by mutating a transform; React renders
 * it once.
 */
export function NeedleMeter({ session, tolerance, parked, reducedMotion, children }: NeedleMeterProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const moverRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const drawn = useRef({ position: 0, hold: -1, flags: '' });
  const parkedRef = useLatest(parked);
  const reducedRef = useLatest(reducedMotion);
  const ticks = useMemo(() => meterTicks(), []);
  const zoneHalf = meterPosition(tolerance) * 50;

  useRafLoop((dt) => {
    const f = session.frame;
    const d = drawn.current;
    const root = rootRef.current;
    const mover = moverRef.current;
    if (!root || !mover) return;

    const active = (f.live || f.inTune) && !parkedRef.current;
    const target = parkedRef.current ? 0 : meterPosition(f.cents);
    const k = reducedRef.current || dt <= 0 ? 1 : 1 - Math.exp(-dt / FOLLOW_MS);
    const next = Math.abs(target - d.position) < 0.0005 ? target : d.position + (target - d.position) * k;
    if (next !== d.position) {
      d.position = next;
      mover.style.transform = `translate3d(${(next * 50).toFixed(3)}%, 0, 0)`;
    }

    const hold = f.inTune ? 1 : f.within ? f.hold : 0;
    if (hold !== d.hold && fillRef.current) {
      d.hold = hold;
      fillRef.current.style.transform = `scaleX(${hold.toFixed(3)})`;
    }

    const off = active && Math.abs(f.cents) > METER_RANGE ? (f.cents < 0 ? 'low' : 'high') : '';
    const side = !active || f.within || f.inTune ? '' : f.cents < 0 ? 'low' : 'high';
    const flags = `${active ? 1 : 0}${f.within ? 1 : 0}${f.inTune ? 1 : 0}${off}${side}${parkedRef.current ? 'p' : ''}`;
    if (flags !== d.flags) {
      d.flags = flags;
      root.dataset.live = active ? 'true' : 'false';
      root.dataset.within = f.within || f.inTune ? 'true' : 'false';
      root.dataset.intune = f.inTune ? 'true' : 'false';
      root.dataset.off = off;
      root.dataset.side = side;
      root.dataset.parked = parkedRef.current ? 'true' : 'false';
    }
  });

  return (
    <div ref={rootRef} className={styles.meter} data-live="false" data-within="false" data-intune="false" data-off="" data-side="" data-parked="true">
      <div className={styles.lane} aria-hidden="true">
        <div ref={moverRef} className={styles.mover}>
          <svg className={styles.marker} viewBox="0 0 40 46" width="40" height="46" focusable="false">
            <path className={styles.markerBody} d="M20 44.5C13.5 36 2 25.5 2 14.5 2 6.6 9.8 1.5 20 1.5S38 6.6 38 14.5C38 25.5 26.5 36 20 44.5Z" />
            <circle className={styles.markerDot} cx="20" cy="15" r="3.4" />
            <path className={styles.markerCheck} d="M12.5 15.5l5 5 10-10.5" />
            <path className={styles.markerLow} d="M21 9l-6 6 6 6M29 9l-6 6 6 6" />
            <path className={styles.markerHigh} d="M19 9l6 6-6 6M11 9l6 6-6 6" />
          </svg>
        </div>
      </div>
      <div className={styles.track} aria-hidden="true">
        <span className={styles.zone} style={{ left: `${50 - zoneHalf}%`, width: `${zoneHalf * 2}%` }}>
          <span ref={fillRef} className={styles.zoneFill} />
        </span>
        {ticks.map((t) => (
          <span key={t.cents} className={t.cents === 0 ? styles.tickCentre : t.major ? styles.tickMajor : styles.tick} style={{ left: `${50 + t.position * 50}%` }} />
        ))}
      </div>
      <div className={styles.labels} aria-hidden="true">
        {ticks
          .filter((t) => t.label)
          .map((t) => (
            <span key={t.cents} className={cx(styles.tickLabel, t.cents !== 0 && Math.abs(t.cents) !== METER_RANGE && styles.tickLabelInner)} style={{ left: `${50 + t.position * 50}%` }} data-tick-label="">
              {t.label}
            </span>
          ))}
      </div>
      <div className={styles.ends}>
        <span className={styles.endLow} aria-hidden="true">
          Too low
        </span>
        {children}
        <span className={styles.endHigh} aria-hidden="true">
          Too high
        </span>
      </div>
    </div>
  );
}
