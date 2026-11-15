import type { AchievementTier } from '@/core/progress';
import { Icon, cx } from '@/ui';
import styles from './Medal.module.css';

/** Props for `<Medal>`. */
export interface MedalProps {
  /** lucide icon name of the achievement. */
  icon: string;
  tier: AchievementTier;
  /** Earned: drawn in its metal. Otherwise a quiet outline with a lock. */
  earned: boolean;
  /** A secret that is still locked: a question mark instead of the icon. */
  hidden?: boolean;
  /** Diameter in px at the default text size. Default 56. */
  size?: number;
  /** Sweep a highlight across once (for the detail view of an earned medal). */
  shine?: boolean;
  className?: string;
}

/**
 * An achievement as a medal: a disc in the metal of its tier with the achievement's icon struck
 * into it. Decorative; the tier and the state are always written next to it.
 */
export function Medal({ icon, tier, earned, hidden, size = 56, shine, className }: MedalProps) {
  const rem = `${size / 16}rem`;
  return (
    <span className={cx(styles.medal, earned ? styles.earned : styles.locked, shine && earned && styles.shine, className)} data-tier={tier} style={{ width: rem, height: rem }} aria-hidden="true">
      <span className={styles.face}>
        <Icon name={hidden ? 'CircleQuestionMark' : icon} size={Math.round(size * 0.44)} strokeWidth={earned ? 2 : 1.75} />
      </span>
      {!earned && !hidden && (
        <span className={styles.lock}>
          <Icon name="Lock" size={Math.max(10, Math.round(size * 0.2))} strokeWidth={2.25} />
        </span>
      )}
    </span>
  );
}
