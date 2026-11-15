import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../util/cx';
import { fraction } from '../util/math';
import styles from './Progress.module.css';

/** Fill colour for progress, rings and meters. */
export type ProgressTone = 'accent' | 'ok' | 'info' | 'warn' | 'bad' | 'xp' | 'streak' | 'neutral';

/** Props for `<ProgressBar>`. */
export interface ProgressBarProps {
  /** Current amount, from 0 to `max`. Ignored when `indeterminate`. */
  value?: number;
  /** Default 100. */
  max?: number;
  /** Visible label; also the accessible name. Without it pass `aria-label`. */
  label?: ReactNode;
  'aria-label'?: string;
  /** Text at the end of the label row: "percent" (default with a label), "fraction" ("3 / 8"), custom text, or false. */
  valueText?: 'percent' | 'fraction' | false | string;
  tone?: ProgressTone;
  /** Track height: 4, 8 (default) or 12 px. */
  size?: 'sm' | 'md' | 'lg';
  /** Draw `max` separate steps instead of a continuous bar (lesson progress, up to about 20). */
  segmented?: boolean;
  /** Unknown duration: an animated sweep. Use when you cannot measure progress. */
  indeterminate?: boolean;
  className?: string;
}

/**
 * How far along something is.
 *   <ProgressBar label="Daily goal" value={30} max={50} valueText="30 / 50 XP" tone="xp" />
 *   <ProgressBar aria-label="Lesson progress" value={step} max={8} segmented />
 */
export function ProgressBar({ value = 0, max = 100, label, valueText, tone = 'accent', size = 'md', segmented, indeterminate, className, ...rest }: ProgressBarProps) {
  const frac = fraction(value, 0, max);
  const mode = valueText ?? (label != null ? 'percent' : false);
  const text = mode === 'percent' ? `${Math.round(frac * 100)}%` : mode === 'fraction' ? `${Math.round(value)} / ${max}` : mode || '';
  const aria = {
    role: 'progressbar',
    'aria-label': label == null ? rest['aria-label'] : undefined,
    'aria-valuemin': indeterminate ? undefined : 0,
    'aria-valuemax': indeterminate ? undefined : max,
    'aria-valuenow': indeterminate ? undefined : Math.min(max, Math.max(0, value)),
    'aria-valuetext': indeterminate ? undefined : text || undefined,
  } as const;
  const steps = segmented ? Math.max(1, Math.round(max)) : 0;
  return (
    <div className={cx(styles.bar, styles[`tone-${tone}`], styles[`size-${size}`], indeterminate && styles.indeterminate, className)}>
      {(label != null || text) && (
        <div className={styles.barHead}>
          <span className={styles.barLabel}>{label}</span>
          {text && !indeterminate && <span className={styles.barValue}>{text}</span>}
        </div>
      )}
      {segmented && !indeterminate ? (
        <div className={styles.segments} {...aria}>
          {Array.from({ length: steps }, (_, i) => (
            <span key={i} className={cx(styles.segment, i < Math.floor(value) && styles.segmentDone, i === Math.floor(value) && value < max && styles.segmentCurrent)} />
          ))}
        </div>
      ) : (
        <div className={styles.track} {...aria}>
          <span className={styles.fill} style={{ width: `${frac * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** Props for `<ProgressRing>`. */
export interface ProgressRingProps {
  value: number;
  /** Default 100. */
  max?: number;
  /** Outer diameter in px. Default 64. */
  size?: number;
  /** Stroke width in px. Default scales with size. */
  thickness?: number;
  tone?: ProgressTone;
  /** Accessible name ("Daily goal"). */
  label: string;
  /** Centre content. Default: the percentage. Pass `null` for an empty centre. */
  children?: ReactNode;
  className?: string;
}

/**
 * Circular progress with something in the middle: a number, an icon, an avatar.
 *   <ProgressRing label="Daily goal" value={30} max={50} tone="xp" size={96}>30<small>/ 50 XP</small></ProgressRing>
 */
export function ProgressRing({ value, max = 100, size = 64, thickness, tone = 'accent', label, children, className }: ProgressRingProps) {
  const stroke = thickness ?? Math.max(4, Math.round(size / 10));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = fraction(value, 0, max);
  return (
    <div className={cx(styles.ring, styles[`tone-${tone}`], className)} style={{ width: size, height: size }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(max, Math.max(0, value))}>
      <svg className={styles.ringSvg} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className={styles.ringTrack} cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className={styles.ringFill} cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      {children !== null && (
        <div className={styles.ringCenter}>
          {children ?? (
            <span className={styles.ringValue} style={{ fontSize: Math.max(11, size * 0.23) }}>
              {Math.round(frac * 100)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Props for `<Meter>`. */
export interface MeterProps {
  /** Current reading. */
  value: number;
  min?: number;
  max?: number;
  /** Readings below this are "low"; at or above `high` they are "high". Used for the automatic tone. */
  low?: number;
  high?: number;
  /** Accessible name ("Input level"). */
  label: string;
  /** Show the label above the meter. Default false (screen readers only). */
  showLabel?: boolean;
  /** Spoken value, e.g. "-12 dB" or "a little quiet". */
  valueText?: string;
  /** Number of LED-style cells, or 0 for a smooth bar. Default 16. */
  segments?: number;
  /** Fixed tone. Default: ok in range, warn when low, bad when high. */
  tone?: ProgressTone;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

/**
 * A live gauge of a measured value inside a known range: microphone level, timing accuracy, pitch
 * stability. Not for task completion (that is ProgressBar). For per-frame updates, drive it from a
 * throttled value or draw your own canvas; this re-renders on each change.
 *   <Meter label="Input level" value={level} low={0.15} high={0.9} max={1} valueText="Good level" />
 */
export function Meter({ value, min = 0, max = 1, low, high, label, showLabel, valueText, segments = 16, tone, orientation = 'horizontal', className }: MeterProps) {
  const frac = fraction(value, min, max);
  const zone = high != null && value >= high ? 'bad' : low != null && value < low ? 'warn' : 'ok';
  const fill = tone ?? zone;
  const on = Math.round(frac * segments);
  return (
    <div className={cx(styles.meter, styles[`tone-${fill}`], orientation === 'vertical' && styles.meterVertical, className)}>
      <span className={cx(styles.barLabel, !showLabel && 'sr-only')}>{label}</span>
      <div className={cx(styles.meterTrack, segments <= 0 && styles.meterSmooth)} role="meter" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.min(max, Math.max(min, value))} aria-valuetext={valueText}>
        {segments > 0 ? Array.from({ length: segments }, (_, i) => <span key={i} className={cx(styles.meterCell, i < on && styles.meterCellOn)} />) : <span className={styles.meterFill} style={orientation === 'vertical' ? { height: `${frac * 100}%` } : { width: `${frac * 100}%` }} />}
      </div>
    </div>
  );
}

/** Props for `<Skeleton>`. */
export interface SkeletonProps {
  /** text: a line of copy. block: a rounded rectangle. circle: an avatar. */
  variant?: 'text' | 'block' | 'circle';
  /** CSS width ("60%", 120). Default 100%. */
  width?: number | string;
  /** CSS height. Required for block; circle uses `width` for both. */
  height?: number | string;
  /** text only: number of lines; the last one is shorter. */
  lines?: number;
  className?: string;
}

/**
 * A placeholder in the shape of content that is loading. Put `aria-busy="true"` on the region that
 * is loading; the skeleton itself is hidden from screen readers.
 *   <Skeleton variant="text" lines={3} />   <Skeleton variant="block" height={160} />
 */
export function Skeleton({ variant = 'text', width, height, lines = 1, className }: SkeletonProps) {
  if (variant === 'text' && lines > 1) {
    return (
      <span className={cx(styles.skLines, className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={cx(styles.skeleton, styles.skText)} style={{ width: i === lines - 1 ? '62%' : (width ?? '100%') }} />
        ))}
      </span>
    );
  }
  const style: CSSProperties = { width: width ?? (variant === 'circle' ? 40 : '100%'), height: variant === 'circle' ? (height ?? width ?? 40) : height };
  return <span aria-hidden="true" className={cx(styles.skeleton, variant === 'text' && styles.skText, variant === 'circle' && styles.skCircle, variant === 'block' && styles.skBlock, className)} style={style} />;
}
