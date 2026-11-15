/**
 * The one-minute changes trend: one column per practice day (the day's best), the fluent target
 * as a hairline, today's column in the accent. A single series, so no legend: the heading names it.
 * Each column shows its value on hover or focus; a table with every value follows for screen
 * readers.
 */
import { useMemo } from 'react';
import { VisuallyHidden } from '@/ui';
import type { TrendPoint } from '../model/trainer';
import styles from './Trainer.module.css';

/** Props of the chart. */
export interface TrendChartProps {
  trend: readonly TrendPoint[];
  /** Fluent changes a minute for this set. */
  target: number;
  /** The local day key of today (`2026-11-15`), drawn in the accent. */
  today: string;
  /** Columns shown (the most recent days). */
  days?: number;
}

const W = 320;
const H = 132;
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 18;
const PAD_B = 22;

function shortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[(m - 1) % 12] ?? ''}`;
}

/** The trend chart. */
export function TrendChart({ trend, target, today, days = 14 }: TrendChartProps) {
  const points = useMemo(() => trend.slice(-days), [trend, days]);
  const max = Math.max(target, ...points.map((p) => p.best), 10);
  const top = Math.ceil(max / 10) * 10;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const slot = plotW / Math.max(points.length, 7);
  const barW = Math.min(24, slot * 0.62);
  const y = (v: number) => PAD_T + plotH - (v / top) * plotH;
  const ticks = [0, top / 2, top];
  const best = points.reduce((m, p) => Math.max(m, p.best), 0);
  return (
    <figure className={styles.chart} data-trend={points.map((p) => p.best).join(',')}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} role="img" aria-label={`Best clean changes a minute on your last ${points.length} practice days, from ${points[0]?.best ?? 0} to ${points[points.length - 1]?.best ?? 0}. Goal ${target}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={styles.grid} x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} />
            <text className={styles.axis} x={PAD_L - 5} y={y(t)} textAnchor="end" dominantBaseline="central">
              {t}
            </text>
          </g>
        ))}
        <line className={styles.goal} x1={PAD_L} x2={W - PAD_R} y1={y(target)} y2={y(target)} />
        <text className={styles.goalText} x={W - PAD_R} y={y(target) - 4} textAnchor="end">
          goal {target}
        </text>
        {points.map((p, i) => {
          const cx = PAD_L + slot * i + slot / 2;
          const h = Math.max(2, PAD_T + plotH - y(p.best));
          const x = cx - barW / 2;
          const yy = PAD_T + plotH - h;
          const r = Math.min(4, barW / 2, h);
          const isToday = p.day === today;
          const isLast = i === points.length - 1;
          const label = `${shortDay(p.day)}: ${p.best} clean changes`;
          return (
            <g key={p.day} className={styles.col} tabIndex={0} aria-label={label} data-today={isToday || undefined}>
              <rect className={styles.hit} x={cx - slot / 2} y={PAD_T} width={slot} height={plotH} />
              <path className={isToday ? styles.barToday : styles.bar} d={`M${x} ${PAD_T + plotH} V${yy + r} Q${x} ${yy} ${x + r} ${yy} H${x + barW - r} Q${x + barW} ${yy} ${x + barW} ${yy + r} V${PAD_T + plotH} Z`} />
              <text className={isLast || p.best === best ? styles.valueShown : styles.value} x={cx} y={yy - 4} textAnchor="middle">
                {p.best}
              </text>
              {(i === 0 || isLast) && (
                <text className={styles.axis} x={cx} y={H - 6} textAnchor="middle">
                  {isToday ? 'today' : shortDay(p.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <VisuallyHidden>
        <table>
          <caption>Best clean changes a minute per practice day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Clean changes</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.day}>
                <td>{p.day}</td>
                <td>{p.best}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </VisuallyHidden>
    </figure>
  );
}
