import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { renderIcon, type IconSource } from '../icon/Icon';
import { Spinner } from '../feedback/Spinner';
import { Tooltip } from '../feedback/Tooltip';
import { cx } from '../util/cx';
import { isExternalHref, resolveHref, type LinkTarget } from '../util/links';
import styles from './Button.module.css';

/** primary: the one main action on a screen. secondary: other actions. ghost: low-emphasis. danger: destructive. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
/** sm 36 px (still a 44 px touch target), md 44 px, lg 52 px. */
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonLook {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon before the label: a lucide name, component or element. */
  iconLeft?: IconSource;
  /** Icon after the label. */
  iconRight?: IconSource;
  /** Stretch to the container's width. */
  fullWidth?: boolean;
  /** Allow the label to wrap onto two lines instead of truncating. */
  wrap?: boolean;
}

const ICON_PX: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

function lookClass(look: ButtonLook, extra?: string | false): string {
  const { variant = 'secondary', size = 'md', fullWidth, wrap } = look;
  return cx(styles.button, styles[variant], size !== 'md' && styles[size], fullWidth && styles.fullWidth, wrap && styles.wrap, extra);
}

function content(look: ButtonLook, children: ReactNode, loading?: boolean): ReactNode {
  const px = ICON_PX[look.size ?? 'md'];
  return (
    <>
      {loading ? (
        <span className={styles.icon}>
          <Spinner size={px} />
        </span>
      ) : (
        look.iconLeft != null && <span className={styles.icon}>{renderIcon(look.iconLeft, { size: px })}</span>
      )}
      {children != null && children !== false && <span className={styles.label}>{children}</span>}
      {look.iconRight != null && <span className={styles.icon}>{renderIcon(look.iconRight, { size: px })}</span>}
    </>
  );
}

/** Props for `<Button>`. */
export interface ButtonProps extends ButtonLook, ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shows a spinner and ignores presses, while staying focusable. */
  loading?: boolean;
  /** Toggle state: sets `aria-pressed` and the selected look. */
  pressed?: boolean;
  children?: ReactNode;
}

/**
 * The standard button. Labels say what happens ("Start lesson", "Save tuning").
 *   <Button variant="primary" iconLeft="Play" onClick={start}>Start lesson</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, iconLeft, iconRight, fullWidth, wrap, loading, pressed, disabled, className, children, onClick, type = 'button', ...rest },
  ref,
) {
  const look = { variant, size, iconLeft, iconRight, fullWidth, wrap };
  return (
    <button
      ref={ref}
      type={type}
      className={lookClass(look, cx(disabled && styles.disabled, loading && styles.loading, pressed && styles.pressed, className))}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      aria-pressed={pressed}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {content(look, children, loading)}
    </button>
  );
});

/** Props for `<LinkButton>`. */
export interface LinkButtonProps extends ButtonLook, LinkTarget, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Render as inert text with the disabled look (links cannot be natively disabled). */
  disabled?: boolean;
  children?: ReactNode;
}

/**
 * A real link that looks like a button: use it whenever a press navigates.
 *   <LinkButton to="scales" params={['a-minor']} variant="primary">Open A minor</LinkButton>
 *   <LinkButton href={href('tuner')} iconRight="ArrowRight">Tune up</LinkButton>
 */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  { variant, size, iconLeft, iconRight, fullWidth, wrap, to, params, href, disabled, className, children, target, rel, ...rest },
  ref,
) {
  const look = { variant, size, iconLeft, iconRight, fullWidth, wrap };
  const url = resolveHref({ to, params, href });
  const external = isExternalHref(url);
  if (disabled || !url) {
    return (
      <a ref={ref} role="link" aria-disabled="true" className={lookClass(look, cx(styles.disabled, className))} {...rest}>
        {content(look, children)}
      </a>
    );
  }
  return (
    <a ref={ref} href={url} target={target ?? (external ? '_blank' : undefined)} rel={rel ?? (external ? 'noopener noreferrer' : undefined)} className={lookClass(look, className)} {...rest}>
      {content(look, children)}
    </a>
  );
});

/** Props for `<IconButton>`. */
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** The icon: a lucide name, component or element. */
  icon: IconSource;
  /** Required accessible name, also shown as a tooltip on hover/focus ("Mute", "Next bar"). */
  label: string;
  /** Default "ghost". */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Circle instead of rounded square. */
  round?: boolean;
  /** Toggle state: sets `aria-pressed` and the selected look. */
  pressed?: boolean;
  loading?: boolean;
  /** Turn the hover tooltip off (when a visible label sits right next to the button). */
  noTooltip?: boolean;
}

/**
 * A square button holding only an icon. `label` is mandatory: it names the control for screen
 * readers and appears as a tooltip.
 *   <IconButton icon="Volume2" label="Mute" pressed={muted} onClick={toggle} />
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', round, pressed, loading, disabled, noTooltip, className, onClick, type = 'button', ...rest },
  ref,
) {
  const px = size === 'sm' ? 18 : size === 'lg' ? 24 : 20;
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      disabled={disabled}
      className={cx(styles.button, styles[variant], size !== 'md' && styles[size], styles.iconOnly, round && styles.round, pressed && styles.pressed, disabled && styles.disabled, loading && styles.loading, className)}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      <span className={styles.icon}>{loading ? <Spinner size={px} /> : renderIcon(icon, { size: px })}</span>
    </button>
  );
  if (noTooltip || disabled) return button;
  return <Tooltip content={label}>{button}</Tooltip>;
});

/** Props for `<ButtonGroup>`. */
export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Join the buttons into one strip with shared borders (use secondary buttons). */
  attached?: boolean;
  /** Children share the full width equally. */
  fullWidth?: boolean;
  /** Push the group to the end of the row (dialog footers). */
  align?: 'start' | 'end';
  /** On phones, stack full-width with the last (primary) button on top. */
  stackOnMobile?: boolean;
  children?: ReactNode;
}

/** A row of related buttons with consistent spacing. Put the primary action last. */
export function ButtonGroup({ attached, fullWidth, align, stackOnMobile, className, children, ...rest }: ButtonGroupProps) {
  return (
    <div role="group" className={cx(styles.group, attached && styles.attached, fullWidth && styles.groupFull, align === 'end' && styles.groupEnd, stackOnMobile && styles.groupStack, className)} {...rest}>
      {children}
    </div>
  );
}

/** Props for `<PlayButton>`. */
export interface PlayButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Shows the pause glyph; the accessible name switches between "Play" and "Pause". */
  playing?: boolean;
  /** Accessible name. Default "Play" / "Pause" following `playing`. */
  label?: string;
  /** 56, 72 (default) or 96 px. */
  size?: 'md' | 'lg' | 'xl';
  /** Replace the glyph (for "Listen": "Mic", for "Stop": "Square"). */
  icon?: IconSource;
  /** accent (default), neutral ink, or danger for recording. */
  tone?: 'accent' | 'neutral' | 'danger';
  loading?: boolean;
}

/**
 * The big round transport button: the single most important control on a playing screen.
 *   <PlayButton playing={playing} onClick={toggle} />
 */
export const PlayButton = forwardRef<HTMLButtonElement, PlayButtonProps>(function PlayButton(
  { playing = false, label, size = 'lg', icon, tone = 'accent', loading, disabled, className, onClick, type = 'button', ...rest },
  ref,
) {
  const px = size === 'md' ? 24 : size === 'xl' ? 40 : 30;
  const glyph = icon ?? (playing ? 'Pause' : 'Play');
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label ?? (playing ? 'Pause' : 'Play')}
      aria-busy={loading || undefined}
      disabled={disabled}
      className={cx(styles.play, styles[`play-${size}`], tone === 'neutral' && styles.playNeutral, tone === 'danger' && styles.playDanger, disabled && styles.disabled, className)}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {loading ? <Spinner size={px} /> : <span className={cx(styles.playGlyph, glyph === 'Play' && styles.playNudge)}>{renderIcon(glyph, { size: px, strokeWidth: 2 })}</span>}
    </button>
  );
});
