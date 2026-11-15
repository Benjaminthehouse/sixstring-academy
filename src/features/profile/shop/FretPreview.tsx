import { cx } from '@/ui';
import { inlayName, woodName } from './model';
import styles from './FretPreview.module.css';

/** Props for `<FretPreview>`. */
export interface FretPreviewProps {
  /** Cosmetic id of the wood (`wood-ebony`). */
  wood: string;
  /** Cosmetic id of the inlay style (`inlay-blocks`). */
  inlay: string;
  /** Flip for a left-handed neck (nut on the right). */
  leftHanded?: boolean;
  /** `strip`: the first twelve frets, for the stage. `swatch`: frets 2 to 5, for a tile. */
  variant?: 'strip' | 'swatch';
  className?: string;
}

const W = 360;
const H = 96;
const NUT = 14;
const BOARD = W - NUT - 6;
const TOP = 10;
const BOTTOM = H - 10;
const MID = H / 2;

/** Distance from the nut to fret `n`, with the twelfth fret at the far edge of the board. */
const fretX = (n: number): number => NUT + 2 * BOARD * (1 - Math.pow(2, -n / 12));
/** The middle of the space a finger presses for fret `n`. */
const slotX = (n: number): number => (fretX(n - 1) + fretX(n)) / 2;
const slotW = (n: number): number => fretX(n) - fretX(n - 1);

const MARKED = [3, 5, 7, 9, 12] as const;
/** Strings top to bottom: high E first, as tab is drawn. */
const STRINGS = [0.9, 1.1, 1.4, 1.8, 2.2, 2.6] as const;

function Inlays({ style }: { style: string }) {
  switch (style) {
    case 'offset-dots':
      return (
        <>
          {MARKED.map((n) =>
            n === 12 ? (
              <g key={n}>
                <circle cx={slotX(n) - 5} cy={BOTTOM - 9} r={3} />
                <circle cx={slotX(n) + 5} cy={BOTTOM - 9} r={3} />
              </g>
            ) : (
              <circle key={n} cx={slotX(n)} cy={BOTTOM - 9} r={3} />
            ),
          )}
        </>
      );
    case 'blocks':
      return (
        <>
          {MARKED.map((n) => {
            const w = Math.max(8, slotW(n) - 9);
            return <rect key={n} x={slotX(n) - w / 2} y={MID - 21} width={w} height={42} rx={2.5} />;
          })}
        </>
      );
    case 'diamonds':
      return (
        <>
          {MARKED.map((n) => {
            const x = slotX(n);
            const w = Math.min(8, slotW(n) / 2 - 3);
            // A slim diamond split along its long axis.
            return (
              <g key={n}>
                <polygon points={`${x - 1},${MID - 20} ${x - 1},${MID + 20} ${x - w},${MID}`} />
                <polygon points={`${x + 1},${MID - 20} ${x + 1},${MID + 20} ${x + w},${MID}`} />
              </g>
            );
          })}
        </>
      );
    case 'sharkfin':
      return (
        <>
          {MARKED.map((n) => {
            const left = fretX(n - 1) + 4;
            const right = fretX(n) - 4;
            // A fin that rises from the bass edge and leans toward the body.
            return <polygon key={n} points={`${left},${BOTTOM - 4} ${right},${BOTTOM - 4} ${right},${MID - 14}`} />;
          })}
        </>
      );
    case 'vine': {
      // A stem that winds along the neck, with a leaf at every marked fret.
      let d = `M ${NUT + 6} ${MID + 12}`;
      for (let n = 1; n <= 12; n++) d += ` Q ${slotX(n)} ${n % 2 === 1 ? MID - 20 : MID + 20} ${fretX(n) - 2} ${n % 2 === 1 ? MID - 2 : MID + 2}`;
      return (
        <>
          <path d={d} className={styles.stem} />
          {MARKED.map((n) => {
            const x = slotX(n);
            const up = n % 2 === 1;
            const y = up ? MID - 13 : MID + 13;
            return <path key={n} d={`M ${x - 7} ${y} Q ${x} ${y + (up ? -10 : 10)} ${x + 7} ${y} Q ${x} ${y + (up ? 5 : -5)} ${x - 7} ${y} Z`} />;
          })}
        </>
      );
    }
    default:
      return (
        <>
          {MARKED.map((n) =>
            n === 12 ? (
              <g key={n}>
                <circle cx={slotX(n)} cy={MID - 17} r={4.5} />
                <circle cx={slotX(n)} cy={MID + 17} r={4.5} />
              </g>
            ) : (
              <circle key={n} cx={slotX(n)} cy={MID} r={4.5} />
            ),
          )}
        </>
      );
  }
}

/**
 * A small drawing of the neck in a wood and an inlay style: what the shop's cosmetics look like
 * on a fretboard. Decorative; the names are written beside it.
 */
export function FretPreview({ wood, inlay, leftHanded, variant = 'strip', className }: FretPreviewProps) {
  // A swatch looks at frets 2 to 5, where both a marker and plain wood are in view.
  const view = variant === 'swatch' ? `${fretX(2) - 3} 0 ${fretX(5) - fretX(2) + 6} ${H}` : `0 0 ${W} ${H}`;
  return (
    <svg className={cx(styles.board, variant === 'swatch' && styles.swatch, className)} viewBox={view} preserveAspectRatio={variant === 'swatch' ? 'xMidYMid slice' : 'xMidYMid meet'} data-wood={woodName(wood)} data-inlay={inlayName(inlay)} aria-hidden="true" focusable="false">
      <g transform={leftHanded ? `translate(${W} 0) scale(-1 1)` : undefined}>
        <rect className={styles.wood} x={NUT} y={TOP} width={BOARD + 6} height={BOTTOM - TOP} rx={3} />
        {/* Grain: a few long, faint strokes. */}
        <g className={styles.grain}>
          {[0.14, 0.31, 0.47, 0.66, 0.83].map((t, i) => (
            <path key={t} d={`M ${NUT + 4} ${TOP + (BOTTOM - TOP) * t} C ${W * 0.3} ${TOP + (BOTTOM - TOP) * t + (i % 2 ? 3 : -3)}, ${W * 0.65} ${TOP + (BOTTOM - TOP) * t + (i % 2 ? -3 : 3)}, ${W - 4} ${TOP + (BOTTOM - TOP) * t}`} />
          ))}
        </g>
        <g className={styles.inlay}>
          <Inlays style={inlayName(inlay)} />
        </g>
        <g className={styles.frets}>
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1={fretX(i + 1)} x2={fretX(i + 1)} y1={TOP} y2={BOTTOM} />
          ))}
        </g>
        <rect className={styles.nut} x={NUT - 5} y={TOP - 1} width={6} height={BOTTOM - TOP + 2} rx={1.5} />
        <g>
          {STRINGS.map((width, i) => {
            const y = TOP + 8 + ((BOTTOM - TOP - 16) * i) / 5;
            return <line key={i} className={i >= 3 ? styles.wound : styles.plain} x1={NUT - 5} x2={W} y1={y} y2={y} strokeWidth={width} />;
          })}
        </g>
      </g>
    </svg>
  );
}
