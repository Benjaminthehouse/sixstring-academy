import { cx } from '@/ui';
import styles from './Onboarding.module.css';

/** A fretted note to mark on the neck. Strings are numbered the guitarist's way (1 = high E). */
export interface NeckDot {
  string: number;
  fret: number;
  /** Fretting finger 1 to 4; picks the finger colour and is printed on the dot. */
  finger: 1 | 2 | 3 | 4;
}

/** An open C major chord (x32010): ring finger on the fifth string, middle on the fourth, index on the second. */
export const C_MAJOR_SHAPE: readonly NeckDot[] = [
  { string: 5, fret: 3, finger: 3 },
  { string: 4, fret: 2, finger: 2 },
  { string: 2, fret: 1, finger: 1 },
];

/** Props for `<NeckArt>`. */
export interface NeckArtProps {
  /** Left-handed view: the nut on the right. A display flip only. */
  mirrored?: boolean;
  /** Frets drawn after the nut. Default 5. */
  frets?: number;
  dots?: readonly NeckDot[];
  className?: string;
}

const W = 320;
const H = 104;
const NUT = 8;
const PAD_Y = 13;
const INLAY_FRETS = [3, 5, 7, 9];

/** Distance of fret `n` from the nut as a fraction of the drawn length (real fret spacing: each fret is 2^(1/12) closer). */
export function fretFraction(n: number, total: number): number {
  return (1 - 2 ** (-n / 12)) / (1 - 2 ** (-total / 12));
}

/**
 * A short stretch of guitar neck drawn in the fretboard materials, with optional fingered notes.
 * Standard orientation: high E string on top, nut on the left. Decorative: the caption or the
 * option text beside it says what it shows.
 */
export function NeckArt({ mirrored, frets = 5, dots = [], className }: NeckArtProps) {
  const fretX = (n: number) => NUT + fretFraction(n, frets) * (W - NUT);
  const stringY = (s: number) => PAD_Y + ((s - 1) * (H - 2 * PAD_Y)) / 5;
  const midFret = (n: number) => (fretX(n - 1) + fretX(n)) / 2;
  return (
    <svg className={cx(styles.neck, className)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <g transform={mirrored ? `translate(${W} 0) scale(-1 1)` : undefined}>
        <rect className={styles.neckWood} x="0" y="0" width={W} height={H} rx="6" />
        <rect className={styles.neckGrain} x="0" y="0" width={W} height={H / 2} rx="6" />
        {INLAY_FRETS.filter((f) => f <= frets).map((f) => (
          <circle key={f} className={styles.neckInlay} cx={midFret(f)} cy={H / 2} r="4" />
        ))}
        {Array.from({ length: frets }, (_, i) => (
          <g key={i}>
            <rect className={styles.neckFretShade} x={fretX(i + 1) - 0.5} y="0" width="3.5" height={H} />
            <rect className={styles.neckFret} x={fretX(i + 1) - 1.5} y="0" width="2.5" height={H} />
          </g>
        ))}
        <rect className={styles.neckNut} x="0" y="0" width={NUT} height={H} rx="2" />
        {[1, 2, 3, 4, 5, 6].map((s) => {
          const gauge = 1 + (s - 1) * 0.42;
          return <rect key={s} className={s >= 4 ? styles.neckWound : styles.neckString} x="0" y={stringY(s) - gauge / 2} width={W} height={gauge} />;
        })}
        {dots.map((d) => (
          <g key={`${d.string}-${d.fret}`} transform={`translate(${midFret(d.fret)} ${stringY(d.string)})`}>
            <circle className={styles[`finger${d.finger}`]} r="9.5" />
            {/* Counter-flip the label so the finger number reads normally in the mirrored view. */}
            <text className={cx(styles.neckDotText, d.finger === 4 && styles.neckDotTextLight)} fontSize="11" transform={mirrored ? 'scale(-1 1)' : undefined} textAnchor="middle" dominantBaseline="central">
              {d.finger}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
