import { useRef } from 'react';
import { cx, useRafLoop } from '@/ui';
import type { TunerSession } from '../model/session';
import styles from './LevelBar.module.css';

/** Props for `<LevelBar>`. */
export interface LevelBarProps {
  session: TunerSession;
  /** The input is clipping: draw the bar in the warning colour. */
  hot?: boolean;
  /** `sm` sits beside the "Listening" label; `lg` is the meter in the settings. */
  size?: 'sm' | 'lg';
  className?: string;
}

/** Input level drawn between these, in dBFS. */
const LEVEL_MIN_DB = -72;
const LEVEL_MAX_DB = -12;

function fraction(db: number): number {
  return Math.min(1, Math.max(0, (db - LEVEL_MIN_DB) / (LEVEL_MAX_DB - LEVEL_MIN_DB)));
}

/**
 * The microphone level as a small bar, with a mark at the level a note has to reach to be heard.
 * Written straight to the DOM from requestAnimationFrame (the level changes thirty times a second).
 */
export function LevelBar({ session, hot, size = 'sm', className }: LevelBarProps) {
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const gateRef = useRef<HTMLSpanElement | null>(null);
  const drawn = useRef({ level: -1, gate: -1 });

  useRafLoop(() => {
    const f = session.frame;
    const d = drawn.current;
    const level = Math.round(fraction(f.db) * 100) / 100;
    if (fillRef.current && level !== d.level) {
      d.level = level;
      fillRef.current.style.transform = `scaleX(${level})`;
    }
    const gate = Math.round(fraction(f.gateDb) * 100);
    if (gateRef.current && gate !== d.gate) {
      d.gate = gate;
      gateRef.current.style.left = `${gate}%`;
    }
  });

  return (
    <span className={cx(styles.level, size === 'lg' && styles.large, className)} aria-hidden="true">
      <span ref={fillRef} className={cx(styles.fill, hot && styles.hot)} />
      <span ref={gateRef} className={styles.gate} />
    </span>
  );
}
