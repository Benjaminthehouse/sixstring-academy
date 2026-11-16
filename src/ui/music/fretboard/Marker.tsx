/**
 * One note marker of the fretboard: shape, label, root halo, target ring and hit/miss badge.
 * Its props are primitives, so the memo skips every marker whose look did not change when a game
 * updates one marker's state (the board passes a fresh array each time). The pulse of a target is
 * not drawn here: it is an HTML layer over the board (`TargetPulses`), so the animation runs on
 * the compositor instead of repainting the whole SVG every frame.
 */
import { memo } from 'react';
import { cx } from '@/ui';
import { labelFontSize } from '../format';
import tone from '../tone.module.css';
import type { MusicColor } from '../types';
import type { FretMarker } from './markers';
import styles from './Fretboard.module.css';

/** Props of `<Marker>`: where it is drawn and how it looks. */
export interface MarkerProps {
  x: number;
  y: number;
  r: number;
  label?: string;
  color?: MusicColor;
  shape?: NonNullable<FretMarker['shape']>;
  state?: NonNullable<FretMarker['state']>;
  root?: boolean;
  /** In the open-string column behind the nut (off the wood): drawn in page colours. */
  open?: boolean;
}

/** One note marker, centred on (x, y). */
export const Marker = memo(function Marker({ x, y, r, label = '', color = 'neutral', shape = 'circle', state = 'normal', root = false, open = false }: MarkerProps) {
  const fontSize = labelFontSize(label, r);
  return (
    <g className={cx(tone.tone, styles.marker)} data-c={color} data-shape={shape} data-state={state} data-root={root || undefined} data-open={open || undefined} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
      <g className={styles.markerBody}>
        {root && <MarkerShape shape={shape} r={r + 3} className={styles.halo} />}
        <MarkerShape shape={shape} r={r} className={styles.dot} strokeWidth={shape === 'ring' ? Math.max(2, r * 0.26) : undefined} />
        {state === 'target' && <circle className={styles.targetRing} r={r + 3.5} />}
        {label && (
          <text className={styles.label} y={0.5} fontSize={fontSize}>
            {label}
          </text>
        )}
      </g>
      {(state === 'hit' || state === 'miss') && (
        <g transform={`translate(${(r * 0.78).toFixed(2)} ${(-r * 0.78).toFixed(2)})`}>
          <circle className={styles.badge} data-kind={state} r={Math.max(5.5, r * 0.5)} />
          <path
            className={styles.badgeMark}
            d={state === 'hit' ? `M${-r * 0.22} 0 L${-r * 0.05} ${r * 0.18} L${r * 0.25} ${-r * 0.18}` : `M${-r * 0.18} ${-r * 0.18} L${r * 0.18} ${r * 0.18} M${r * 0.18} ${-r * 0.18} L${-r * 0.18} ${r * 0.18}`}
          />
        </g>
      )}
    </g>
  );
});

/** A marker's outline as an SVG shape centred on 0,0. */
export function MarkerShape({ shape, r, className, strokeWidth }: { shape: string; r: number; className?: string; strokeWidth?: number }) {
  if (shape === 'square') return <rect className={className} x={-r * 0.92} y={-r * 0.92} width={r * 1.84} height={r * 1.84} rx={r * 0.32} strokeWidth={strokeWidth} />;
  if (shape === 'diamond') {
    const d = r * 1.18;
    return <path className={className} d={`M0 ${-d} L${d} 0 L0 ${d} L${-d} 0 Z`} strokeLinejoin="round" strokeWidth={strokeWidth} />;
  }
  return <circle className={className} r={r} strokeWidth={strokeWidth} />;
}

/**
 * The pulse around target markers, as HTML rings over the drawing: transform and opacity on a
 * composited layer, so a target can pulse for a whole game without repainting the board.
 */
export const TargetPulses = memo(function TargetPulses({ points }: { points: ReadonlyArray<{ x: number; y: number; r: number; key: string }> }) {
  if (!points.length) return null;
  return (
    <div className={styles.pulses} aria-hidden="true">
      {points.map((p) => (
        <span key={p.key} className={styles.pulse} style={{ left: p.x - p.r, top: p.y - p.r, width: p.r * 2, height: p.r * 2 }} />
      ))}
    </div>
  );
});
