import { formatMs } from '../core/scoring';
import styles from './Rhythm.module.css';

/** Props of {@link SpreadPlot}. */
export interface SpreadPlotProps {
  /** Signed error of every hit in ms (negative = early). */
  errors: readonly number[];
  /** Half-width in ms of the "on it" zone to shade (default 35). */
  zoneMs?: number;
  /** Caption under the picture; default describes the average. */
  caption?: string;
}

const W = 320;
const H = 104;
const BASE = 66;
const BIN = 8;

/**
 * The learner's timing as a picture: every note is a dot placed by how early or late it was, piled
 * up where several fell together. A tight pile in the middle is good timing; a pile off to one
 * side is a habit (or the device); a wide scatter is an unsteady pulse.
 */
export function SpreadPlot({ errors, zoneMs = 35, caption }: SpreadPlotProps) {
  const maxAbs = errors.reduce((m, e) => Math.max(m, Math.abs(e)), 0);
  const range = Math.min(180, Math.max(100, Math.ceil(maxAbs / 20) * 20));
  const pad = 12;
  const x = (ms: number) => pad + ((Math.max(-range, Math.min(range, ms)) + range) / (2 * range)) * (W - pad * 2);
  const piles = new Map<number, number>();
  const dots = errors.map((e, i) => {
    const bin = Math.round(Math.max(-range, Math.min(range, e)) / BIN);
    const level = piles.get(bin) ?? 0;
    piles.set(bin, level + 1);
    return { key: i, cx: x(bin * BIN), cy: BASE - 6 - Math.min(level, 7) * 6.5 };
  });
  const mean = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : 0;
  const text = caption ?? (errors.length ? `Average: ${formatMs(mean)}` : 'No notes were hit');
  return (
    <figure className={styles.spread}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.spreadSvg} role="img" aria-label={`Timing spread of ${errors.length} notes. ${text}.`}>
        <rect className={styles.spreadZone} x={x(-zoneMs)} y={8} width={x(zoneMs) - x(-zoneMs)} height={BASE - 8} rx={4} />
        <line className={styles.spreadAxis} x1={pad} y1={BASE} x2={W - pad} y2={BASE} />
        <line className={styles.spreadCentre} x1={x(0)} y1={6} x2={x(0)} y2={BASE + 4} />
        {dots.map((d) => (
          <circle key={d.key} className={styles.spreadDot} cx={d.cx} cy={d.cy} r={2.9} />
        ))}
        {errors.length > 0 && <path className={styles.spreadMean} d={`M${x(mean)} ${BASE + 2} l-5 8 h10 z`} />}
        <text className={styles.spreadLabel} x={pad} y={H - 6} textAnchor="start">
          early
        </text>
        <text className={styles.spreadLabel} x={x(0)} y={H - 6} textAnchor="middle">
          on the beat
        </text>
        <text className={styles.spreadLabel} x={W - pad} y={H - 6} textAnchor="end">
          late
        </text>
      </svg>
      <figcaption className={styles.spreadCaption}>{text}</figcaption>
    </figure>
  );
}
