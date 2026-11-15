import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { Icon, renderIcon, type IconSource } from '../icon/Icon';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { cx } from '../util/cx';
import { formatCount, formatInt, hashString, initials } from '../util/format';
import { easeOutCubic, lerp } from '../util/math';
import styles from './Bits.module.css';

/** Colour meaning for badges. */
export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'info' | 'xp' | 'streak';

/** Props for `<Badge>`. */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** soft: tinted (default). solid: filled, for counts and "new". outline: quiet. */
  variant?: 'soft' | 'solid' | 'outline';
  size?: 'sm' | 'md';
  icon?: IconSource;
  /** A small tone-coloured dot before the text (status badges). */
  dot?: boolean;
  children?: ReactNode;
}

/**
 * A short status or count: "New", "Due today", "3". The text carries the meaning; tone only supports it.
 *   <Badge tone="ok" dot>Mastered</Badge>   <Badge tone="accent" variant="solid">New</Badge>
 */
export function Badge({ tone = 'neutral', variant = 'soft', size = 'sm', icon, dot, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[`t-${tone}`], variant === 'solid' && styles.solid, variant === 'outline' && styles.outlineBadge, size === 'md' && styles.badgeMd, className)} {...rest}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {icon != null && <span className={styles.badgeIcon}>{renderIcon(icon, { size: size === 'md' ? 14 : 12, strokeWidth: 2.25 })}</span>}
      {children}
    </span>
  );
}

/** Props for `<Tag>`. */
export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  icon?: IconSource;
  /** Monospace, for keys, tunings, tempos ("DADGAD", "120 BPM"). */
  mono?: boolean;
  /** Shows a remove button; `removeLabel` names it ("Remove blues"). */
  onRemove?: () => void;
  removeLabel?: string;
  children?: ReactNode;
}

/**
 * A neutral descriptive label: genre, key, difficulty, tuning. Unlike a Badge it states a property,
 * not a status.
 *   <Tag icon="Clock">4 min</Tag>   <Tag mono>Drop D</Tag>
 */
export function Tag({ icon, mono, onRemove, removeLabel, className, children, ...rest }: TagProps) {
  return (
    <span className={cx(styles.tag, mono && styles.tagMono, className)} {...rest}>
      {icon != null && renderIcon(icon, { size: 12 })}
      {children}
      {onRemove && (
        <button type="button" className={styles.tagRemove} aria-label={removeLabel ?? 'Remove'} onClick={onRemove}>
          <Icon name="X" size={12} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

/** Props for `<Stat>`. */
export interface StatProps {
  label: ReactNode;
  /** The big figure (a number, an `<AnimatedNumber>`, a note name). */
  value: ReactNode;
  /** Small suffix after the value ("BPM", "%", "days"). */
  unit?: ReactNode;
  /** A line under the value. With `trend` it gets an arrow and a colour. */
  hint?: ReactNode;
  trend?: 'up' | 'down';
  icon?: IconSource;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * A labelled big number. Lay several out in a Grid; they need no card around them.
 *   <Stat label="Accuracy" value={92} unit="%" hint="+4 since last week" trend="up" />
 */
export function Stat({ label, value, unit, hint, trend, icon, size = 'md', className }: StatProps) {
  return (
    <div className={cx(styles.stat, size === 'sm' && styles.statSm, size === 'lg' && styles.statLg, className)}>
      <div className={styles.statLabel}>
        {icon != null && renderIcon(icon, { size: 16 })}
        {label}
      </div>
      <div className={styles.statValueRow}>
        <span className={styles.statValue}>{value}</span>
        {unit != null && <span className={styles.statUnit}>{unit}</span>}
      </div>
      {hint != null && (
        <div className={cx(styles.statHint, trend === 'up' && styles.statUp, trend === 'down' && styles.statDown)}>
          {trend && <Icon name={trend === 'up' ? 'TrendingUp' : 'TrendingDown'} size={14} strokeWidth={2.25} />}
          {hint}
        </div>
      )}
    </div>
  );
}

const AVATAR_PX = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 } as const;

/** Props for `<Avatar>`. */
export interface AvatarProps {
  /** Person's name: gives the initials, the colour and the accessible name. */
  name: string;
  /** Image URL (bundled asset). Falls back to initials. */
  src?: string;
  /** Show an icon instead of initials. */
  icon?: IconSource;
  /** xs 24, sm 32, md 40 (default), lg 56, xl 80, or px. */
  size?: keyof typeof AVATAR_PX | number;
  /** Colour slot 1-7, or "neutral". Default: derived from the name, so a person keeps their colour. */
  tone?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 'neutral';
  /** Amber ring (the active teacher, the current player). */
  ring?: boolean;
  /** Hide from screen readers when the name is printed next to it. */
  decorative?: boolean;
  className?: string;
}

/**
 * A round portrait: image, icon or initials on a stable colour.
 *   <Avatar name="Mia Brooks" size="lg" ring />
 */
export function Avatar({ name, src, icon, size = 'md', tone, ring, decorative, className }: AvatarProps) {
  const px = typeof size === 'number' ? size : AVATAR_PX[size];
  const slot = tone ?? ((hashString(name) % 7) + 1);
  return (
    <span className={cx(styles.avatar, slot !== 'neutral' && !src && styles[`av-${slot}`], ring && styles.avatarRing, className)} style={{ ['--av' as string]: `${px}px` }} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : name} aria-hidden={decorative || undefined}>
      {src ? <img src={src} alt="" draggable={false} /> : icon != null ? renderIcon(icon, { size: Math.round(px * 0.5) }) : initials(name)}
    </span>
  );
}

/** Props for `<Kbd>`. */
export interface KbdProps {
  children: ReactNode;
  className?: string;
}

/** A keyboard key, for shortcut hints: `<Kbd>Space</Kbd>` to play. Hide shortcut hints on phones. */
export function Kbd({ children, className }: KbdProps) {
  return <kbd className={cx(styles.kbd, className)}>{children}</kbd>;
}

/** Props for `<StarRating>`. */
export interface StarRatingProps {
  /** Stars earned, 0..max. */
  value: number;
  /** Default 3. */
  max?: number;
  /** Star size in px. Default 24. */
  size?: number;
  /** Pop the earned stars in one after another (result screens). */
  animate?: boolean;
  /** Accessible name. Default "2 of 3 stars". */
  label?: string;
  className?: string;
}

/**
 * Stars earned for a game round or a skill (0-3 by default). Earned stars are filled, the rest are
 * outlines, and the count is spoken.
 *   <StarRating value={2} animate />
 */
export function StarRating({ value, max = 3, size = 24, animate, label, className }: StarRatingProps) {
  const earned = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <span className={cx(styles.stars, className)} role="img" aria-label={label ?? `${earned} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={cx(styles.star, i < earned && styles.starOn, animate && i < earned && styles.starPop)} style={animate && i < earned ? { animationDelay: `${i * 160}ms` } : undefined}>
          <Icon name="Star" size={size} strokeWidth={1.75} />
        </span>
      ))}
    </span>
  );
}

interface CounterBaseProps {
  /** sm for nav bars and lists, lg for result screens. */
  size?: 'sm' | 'lg';
  /** Soft tinted pill behind the counter. Default true. */
  pill?: boolean;
  /** Abbreviate big numbers (1250 -> 1.2k). Default: only above 9999. */
  compact?: boolean;
  className?: string;
}

function countText(value: number, compact: boolean | undefined): string {
  const abbreviate = compact ?? Math.abs(value) > 9999;
  return abbreviate ? formatCount(value) : formatInt(value);
}

interface CounterShellProps extends CounterBaseProps {
  kind: 'xp' | 'streak' | 'heart' | 'gem';
  icon: IconSource;
  spoken: string;
  idle?: boolean;
  children: ReactNode;
}

function CounterShell({ kind, icon, spoken, idle, size = 'sm', pill = true, className, children }: CounterShellProps) {
  return (
    <span className={cx(styles.counter, styles[`c-${kind}`], pill && styles.counterPill, size === 'lg' && styles.counterLg, idle && styles.counterIdle, className)} role="img" aria-label={spoken}>
      <span className={styles.counterIcon} aria-hidden="true">
        {renderIcon(icon, { size: size === 'lg' ? 20 : 16, strokeWidth: 2 })}
      </span>
      <span aria-hidden="true">{children}</span>
    </span>
  );
}

/** Props for `<XpChip>`. */
export interface XpChipProps extends CounterBaseProps {
  /** XP amount to show. */
  value: number;
  /** Show as a gain: "+15". */
  gain?: boolean;
}

/** XP counter. Presentational: pass the number from `core/progress`. `<XpChip value={1250} />`, `<XpChip value={15} gain />`. */
export function XpChip({ value, gain, compact, ...rest }: XpChipProps) {
  const text = (gain && value > 0 ? '+' : '') + countText(value, compact);
  return (
    <CounterShell kind="xp" icon="Zap" spoken={`${gain ? 'plus ' : ''}${formatInt(value)} XP`} {...rest}>
      {text} <span className={styles.counterUnit}>XP</span>
    </CounterShell>
  );
}

/** Props for `<StreakChip>`. */
export interface StreakChipProps extends CounterBaseProps {
  /** Consecutive days. */
  days: number;
  /** False when today has not been counted yet: the flame is drawn unlit. Default true. */
  active?: boolean;
}

/** Streak counter. `<StreakChip days={12} />`; pass `active={false}` until today's practice is done. */
export function StreakChip({ days, active = true, compact, ...rest }: StreakChipProps) {
  return (
    <CounterShell kind="streak" icon="Flame" idle={!active || days <= 0} spoken={`${formatInt(days)} day streak${active ? '' : ', not extended today'}`} {...rest}>
      {countText(days, compact)}
    </CounterShell>
  );
}

/** Props for `<HeartsChip>`. */
export interface HeartsChipProps extends CounterBaseProps {
  /** Hearts left. */
  value: number;
  /** Hearts when full. With `pips` this many are drawn. Default 5. */
  max?: number;
  /** Draw one heart per slot (filled or empty) instead of a number. */
  pips?: boolean;
}

/** Hearts (mistake budget) counter. `<HeartsChip value={3} />` or `<HeartsChip value={3} max={5} pips />`. */
export function HeartsChip({ value, max = 5, pips, size = 'sm', pill = true, className }: HeartsChipProps) {
  const left = Math.max(0, Math.min(max, Math.round(value)));
  if (!pips) {
    return (
      <CounterShell kind="heart" icon="Heart" idle={left === 0} spoken={`${left} of ${max} hearts left`} size={size} pill={pill} className={className}>
        {left}
      </CounterShell>
    );
  }
  const px = size === 'lg' ? 20 : 16;
  return (
    <span className={cx(styles.counter, styles['c-heart'], pill && styles.counterPill, size === 'lg' && styles.counterLg, className)} role="img" aria-label={`${left} of ${max} hearts left`}>
      <span className={styles.pips} aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={cx(styles.pip, i >= left && styles.pipEmpty)}>
            <Icon name="Heart" size={px} strokeWidth={2} />
          </span>
        ))}
      </span>
    </span>
  );
}

/** Props for `<GemChip>`. */
export interface GemChipProps extends CounterBaseProps {
  value: number;
}

/** Gem (earned currency) counter. `<GemChip value={240} />`. */
export function GemChip({ value, compact, ...rest }: GemChipProps) {
  return (
    <CounterShell kind="gem" icon="Gem" spoken={`${formatInt(value)} gems`} {...rest}>
      {countText(value, compact)}
    </CounterShell>
  );
}

/** Props for `<LevelBadge>`. */
export interface LevelBadgeProps {
  level: number;
  /** Height in px. Default 40. */
  size?: number;
  /** Grey version (a level not reached yet). */
  muted?: boolean;
  /** Accessible name. Default "Level 7". */
  label?: string;
  className?: string;
}

/**
 * The player's level, on a guitar pick. `<LevelBadge level={7} />`
 */
export function LevelBadge({ level, size = 40, muted, label, className }: LevelBadgeProps) {
  const width = Math.round(size * 0.9);
  const digits = String(level).length;
  return (
    <span className={cx(styles.level, muted && styles.levelMuted, className)} style={{ width, height: size }} role="img" aria-label={label ?? `Level ${level}`}>
      <svg className={styles.levelShape} width={width} height={size} viewBox="0 0 45 50" aria-hidden="true">
        <path d="M22.5 48.5C17 43 2 28.5 2 15.6 2 6.6 11.2 1.5 22.5 1.5S43 6.6 43 15.6C43 28.5 28 43 22.5 48.5Z" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span className={styles.levelNumber} style={{ fontSize: size * (digits >= 3 ? 0.3 : digits === 2 ? 0.38 : 0.46) }} aria-hidden="true">
        {level}
      </span>
    </span>
  );
}

/** Props for `<AnimatedNumber>`. */
export interface AnimatedNumberProps {
  value: number;
  /** Milliseconds for the count. Default 700. */
  duration?: number;
  /** Start value for the first render (count up from it on mount). Default: no animation on mount. */
  from?: number;
  /** Format each frame's number. Default: whole number with thousands separators. */
  format?: (value: number) => string;
  className?: string;
}

/**
 * A number that counts to its new value when it changes (XP totals, scores). Screen readers get the
 * final value at once; with reduced motion it simply switches.
 *   <Stat label="Total XP" value={<AnimatedNumber value={xp} />} />
 */
export function AnimatedNumber({ value, duration = 700, from, format = formatInt, className }: AnimatedNumberProps) {
  const reduced = usePrefersReducedMotion();
  const visible = useRef<HTMLSpanElement | null>(null);
  const shown = useRef<number>(from ?? value);
  const formatRef = useRef(format);
  formatRef.current = format;
  // The text React renders never changes after mount, so React leaves the node alone and the effect is its only writer.
  const initialText = useRef<string | null>(null);
  if (initialText.current === null) initialText.current = format(from ?? value);

  useEffect(() => {
    const el = visible.current;
    if (!el) return;
    const start = shown.current;
    if (reduced || duration <= 0 || start === value || typeof requestAnimationFrame === 'undefined') {
      shown.current = value;
      el.textContent = formatRef.current(value);
      return;
    }
    let raf = 0;
    let t0 = -1;
    const frame = (t: number) => {
      if (t0 < 0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      const current = p >= 1 ? value : lerp(start, value, easeOutCubic(p));
      shown.current = current;
      // Written straight to the DOM: a per-frame React state update would re-render the parent tree.
      el.textContent = formatRef.current(current);
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);

  return (
    <span className={cx(styles.number, className)}>
      <span ref={visible} aria-hidden="true">
        {initialText.current}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
