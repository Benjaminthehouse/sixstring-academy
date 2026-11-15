import type { ReactNode } from 'react';
import { cx } from '../util/cx';
import styles from './Spinner.module.css';

/** Props for `<Spinner>`. */
export interface SpinnerProps {
  /** Diameter in px. Default 20. */
  size?: number;
  /** Colour: "current" inherits the text colour (default), "accent" or "muted". */
  tone?: 'current' | 'accent' | 'muted';
  /** Announced to screen readers ("Loading songs"). Omit when a visible label sits next to it. */
  label?: string;
  /** Visible text beside the spinner; renders the pair as one status line. */
  children?: ReactNode;
  className?: string;
}

/** An indeterminate "working" indicator. Use `<Skeleton>` instead when you know the shape of what is loading. */
export function Spinner({ size = 20, tone = 'current', label, children, className }: SpinnerProps) {
  const stroke = Math.max(2, Math.round(size / 9));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ring = (
    <span className={cx(styles.spinner, tone !== 'current' && styles[`tone-${tone}`], children == null && className)} role={children == null && label ? 'status' : undefined} aria-label={children == null ? label : undefined} aria-hidden={children == null && !label ? true : undefined}>
      <svg className={styles.svg} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden="true">
        <circle className={styles.track} cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className={styles.arc} cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={`${c * 0.28} ${c}`} />
      </svg>
    </span>
  );
  if (children == null) return ring;
  return (
    <div className={cx(styles.block, className)} role="status">
      {ring}
      <span>{children}</span>
    </div>
  );
}
