import { cx } from '@/ui';
import styles from './Brand.module.css';

/** Props for `<BrandMark>`. */
export interface BrandMarkProps {
  /** Edge length in px. Default 28. */
  size?: number;
  className?: string;
}

/**
 * The app's mark: six strings, thickest on the left, crossing a fret. Decorative; pair it with
 * the name or give the surrounding link a label.
 */
export function BrandMark({ size = 28, className }: BrandMarkProps) {
  // String gauges grow from the first string to the sixth, like the real thing.
  const strings = [1.1, 1.4, 1.7, 2.1, 2.5, 2.9];
  return (
    <svg className={cx(styles.mark, className)} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect className={styles.tile} x="0" y="0" width="32" height="32" rx="8" />
      <rect className={styles.fret} x="5" y="10.25" width="22" height="1.5" rx="0.75" />
      {strings.map((w, i) => (
        <rect key={i} className={styles.string} x={25.2 - i * 3.9 - w / 2} y="5.5" width={w} height="21" rx={w / 2} />
      ))}
    </svg>
  );
}

/** Props for `<Brand>`. */
export interface BrandProps {
  /** Show only "Sixstring" (phone top bar) instead of the two-line name. */
  compact?: boolean;
  /** Mark size in px. */
  size?: number;
  className?: string;
}

/** The mark with the app's name beside it. */
export function Brand({ compact, size = 28, className }: BrandProps) {
  return (
    <span className={cx(styles.brand, className)}>
      <BrandMark size={size} />
      <span className={styles.name}>
        <span className={styles.word}>Sixstring</span>
        {!compact && <span className={styles.sub}>Academy</span>}
      </span>
    </span>
  );
}
