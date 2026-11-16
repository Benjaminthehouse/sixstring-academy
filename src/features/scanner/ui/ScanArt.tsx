/**
 * The picture at the top of the scanner: a printed sheet passing under a scan line and coming out
 * as tab you can play. Decorative; drawn from the theme's tokens.
 */
import styles from './ScanArt.module.css';

const STAVES = [26, 62, 98];

/** The illustration. */
export function ScanArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 340 150" role="img" aria-label="A printed sheet becomes tab you can play" focusable="false">
      {/* the sheet */}
      <g transform="rotate(-4 70 75)">
        <rect className={styles.paper} x={14} y={8} width={112} height={136} rx={4} />
        {STAVES.map((y) => (
          <g key={y}>
            {[0, 1, 2, 3, 4].map((l) => (
              <line key={l} className={styles.staff} x1={24} x2={116} y1={y + l * 4} y2={y + l * 4} />
            ))}
            {[38, 56, 74, 92, 108].map((x, i) => (
              <g key={x}>
                <ellipse className={styles.head} cx={x} cy={y + 4 + ((i * 3) % 4) * 2} rx={3} ry={2.2} transform={`rotate(-20 ${x} ${y + 4 + ((i * 3) % 4) * 2})`} />
                <line className={styles.stem} x1={x + 2.7} x2={x + 2.7} y1={y + 4 + ((i * 3) % 4) * 2} y2={y - 9 + ((i * 3) % 4) * 2} />
              </g>
            ))}
          </g>
        ))}
        <rect className={styles.beam} x={10} y={70} width={120} height={3} rx={1.5} />
        <rect className={styles.glow} x={10} y={58} width={120} height={14} />
      </g>
      {/* the arrow */}
      <path className={styles.arrow} d="M146 75 h34 m-8 -8 l8 8 l-8 8" />
      {/* the screen with tab */}
      <rect className={styles.screen} x={196} y={22} width={132} height={106} rx={12} />
      {[0, 1, 2, 3, 4, 5].map((s) => (
        <line key={s} className={styles.tabLine} x1={208} x2={316} y1={50 + s * 9} y2={50 + s * 9} />
      ))}
      {[
        [224, 1, '0'],
        [244, 2, '1'],
        [264, 2, '3'],
        [284, 3, '2'],
        [304, 1, '3'],
      ].map(([x, s, t]) => (
        <g key={`${x}`}>
          <rect className={styles.knock} x={(x as number) - 4.5} y={50 + ((s as number) - 1) * 9 - 5} width={9} height={10} rx={2} />
          <text className={styles.fret} x={x as number} y={50 + ((s as number) - 1) * 9 + 3.4}>
            {t as string}
          </text>
        </g>
      ))}
      <circle className={styles.play} cx={262} cy={112} r={9} />
      <path className={styles.playIcon} d="M259 107.5 L266.5 112 L259 116.5 Z" />
      <text className={styles.tabLabel} x={208} y={40}>
        TAB
      </text>
    </svg>
  );
}
