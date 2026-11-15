import type { ReactNode } from 'react';
import { IconButton } from '../actions/Button';
import { renderIcon, type IconSource } from '../icon/Icon';
import { cx } from '../util/cx';
import styles from './Banner.module.css';

/** Meaning of a banner or callout. "tip" is the amber teaching aside; "neutral" is a plain note. */
export type BannerTone = 'info' | 'ok' | 'warn' | 'bad' | 'tip' | 'neutral';

const TONE_ICON: Record<BannerTone, IconSource> = { info: 'Info', ok: 'CircleCheck', warn: 'TriangleAlert', bad: 'CircleAlert', tip: 'Lightbulb', neutral: 'Info' };

/** Props for `<Banner>`. */
export interface BannerProps {
  tone?: BannerTone;
  /** Short bold line. */
  title?: ReactNode;
  /** Override the tone's icon, or pass `null` for none. */
  icon?: IconSource | null;
  /** Buttons under the text (use size="sm"). */
  actions?: ReactNode;
  /** Shows a close button. */
  onDismiss?: () => void;
  /** Announce to screen readers when it appears (messages that show up after an action). */
  live?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * A message that belongs to the screen (not a passing toast): offline notice, import result,
 * permission problem. The icon carries the tone together with the wording, never colour alone.
 *   <Banner tone="warn" title="Microphone is off">Tap notes on the fretboard instead, or turn it on.</Banner>
 */
export function Banner({ tone = 'info', title, icon, actions, onDismiss, live, className, children }: BannerProps) {
  const glyph = icon === null ? null : (icon ?? TONE_ICON[tone]);
  const urgent = tone === 'bad' || tone === 'warn';
  return (
    <div className={cx(styles.banner, styles[`tone-${tone}`], className)} role={live ? (urgent ? 'alert' : 'status') : undefined}>
      {glyph != null && <span className={styles.icon}>{renderIcon(glyph, { size: 20 })}</span>}
      <div className={styles.content}>
        {title != null && <div className={styles.title}>{title}</div>}
        {children != null && <div className={styles.body}>{children}</div>}
        {actions != null && <div className={styles.actions}>{actions}</div>}
      </div>
      {onDismiss && <IconButton icon="X" label="Dismiss" size="sm" noTooltip className={styles.dismiss} onClick={onDismiss} />}
    </div>
  );
}

/** Props for `<Callout>`. */
export interface CalloutProps {
  /** tip (default): a teacher's aside. warn: a common mistake. info: background. ok: a checkpoint. bad: do not do this. */
  tone?: BannerTone;
  /** Small uppercase kicker naming the kind of aside ("Tip", "Common mistake", "Listen for"). */
  label?: ReactNode;
  /** Optional bold line. */
  title?: ReactNode;
  icon?: IconSource | null;
  className?: string;
  children?: ReactNode;
}

const TONE_LABEL: Record<BannerTone, string> = { tip: 'Tip', warn: 'Watch out', info: 'Good to know', ok: 'Checkpoint', bad: 'Avoid', neutral: 'Note' };

/**
 * An aside inside lesson or reference text: a tip, a common mistake, what to listen for.
 * Quieter than a Banner and always labelled.
 *   <Callout tone="warn" label="Common mistake">Pressing in the middle of the fret makes the note buzz. Move right behind the fret wire.</Callout>
 */
export function Callout({ tone = 'tip', label, title, icon, className, children }: CalloutProps) {
  const glyph = icon === null ? null : (icon ?? TONE_ICON[tone]);
  return (
    <aside className={cx(styles.banner, styles.callout, styles[`tone-${tone}`], className)}>
      {glyph != null && <span className={styles.icon}>{renderIcon(glyph, { size: 20 })}</span>}
      <div className={styles.content}>
        <div className={styles.kicker}>{label ?? TONE_LABEL[tone]}</div>
        {title != null && <div className={styles.title}>{title}</div>}
        {children != null && <div className={styles.body}>{children}</div>}
      </div>
    </aside>
  );
}
