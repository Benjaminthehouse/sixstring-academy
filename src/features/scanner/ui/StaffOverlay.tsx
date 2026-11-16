/**
 * What the quick look found, drawn over the picture: the paper's edge, each staff (its lines
 * traced, tab and notation in two styles with a label) and the bar lines.
 */
import type { PageLook } from '../model/pages';
import { cx } from '@/ui';
import styles from './StaffOverlay.module.css';

/** The overlay; scale it with the picture (it fills its box, like the image under it). */
export function StaffOverlay({ look, width, height, className, labels = false }: { look: PageLook; width: number; height: number; className?: string; labels?: boolean }) {
  const stroke = Math.max(width, height) / 500;
  return (
    <svg className={cx(styles.overlay, className)} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ ['--sw' as string]: `${stroke}px` }}>
      {look.paper && <rect className={styles.paper} x={look.paper.x} y={look.paper.y} width={look.paper.w} height={look.paper.h} />}
      {look.staves.map((s, i) => (
        <g key={i} className={s.kind === 'tab' ? styles.tab : styles.notation}>
          <rect className={styles.band} x={s.box.x} y={s.box.y} width={s.box.w} height={s.box.h} />
          {s.lines.map((l, k) => (
            <polyline key={k} className={styles.line} points={l.map((p) => `${p.x},${p.y}`).join(' ')} />
          ))}
          {labels && (
            <text className={styles.label} x={s.box.x} y={s.box.y - stroke * 3} fontSize={Math.max(10, s.box.h * 0.32)}>
              {s.kind === 'tab' ? `Tab, ${s.lineCount} lines` : 'Notation'}
            </text>
          )}
        </g>
      ))}
      {look.barlines.map((b, i) => (
        <line key={i} className={styles.bar} x1={b.x} x2={b.x} y1={b.y0} y2={b.y1} />
      ))}
    </svg>
  );
}
