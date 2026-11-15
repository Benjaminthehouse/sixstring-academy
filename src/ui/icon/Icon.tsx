import { isValidElement, useEffect, useSyncExternalStore, type ReactElement, type ReactNode, type SVGAttributes } from 'react';
import type { LucideIcon, icons } from 'lucide-react';
import { cx } from '../util/cx';
import { BUNDLED_ICONS } from './registry';
import styles from './Icon.module.css';

/** A lucide icon name in PascalCase ("House", "ListMusic"). Any lucide name is accepted, including aliases. */
export type IconName = keyof typeof icons | (string & {});

/** What kit components accept for an icon slot: a lucide name, a lucide component, or a ready element. */
export type IconSource = IconName | LucideIcon | ReactElement;

/** Named icon sizes in px. */
export const ICON_SIZES = { xs: 14, sm: 16, md: 20, lg: 24, xl: 32 } as const;
/** Icon size: a named step or a pixel value. */
export type IconSize = keyof typeof ICON_SIZES | number;

// The full lucide set (about 1 MB) stays out of the main bundle. It is fetched once, on demand,
// the first time a name outside the bundled registry is rendered.
let fullSet: Record<string, unknown> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const warned = new Set<string>();

function loadFullSet(): Promise<void> {
  loading ??= import('lucide-react')
    .then((mod) => {
      fullSet = mod as unknown as Record<string, unknown>;
    })
    .catch(() => {
      fullSet = {};
    })
    .then(() => listeners.forEach((l) => l()));
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => fullSet;

function isIconComponent(value: unknown): value is LucideIcon {
  return (typeof value === 'object' && value !== null && '$$typeof' in value) || typeof value === 'function';
}

/** Look up a lucide component by name: bundled set first, then the lazily loaded full set. */
export function resolveIcon(name: string): LucideIcon | null {
  const bundled = BUNDLED_ICONS[name];
  if (bundled) return bundled;
  const lazy = fullSet?.[name];
  return isIconComponent(lazy) ? lazy : null;
}

/** True when `name` resolves without waiting for the lazy chunk. */
export function isBundledIcon(name: string): boolean {
  return name in BUNDLED_ICONS;
}

/** Props for `<Icon>`. */
export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'name'> {
  /** lucide icon name ("House"), or a lucide component. */
  name: IconName | LucideIcon;
  /** Named step (xs 14, sm 16, md 20, lg 24, xl 32) or px. Default "md". */
  size?: IconSize;
  /** Stroke width. Default 1.75: a touch lighter than lucide's 2, to sit well beside the body type. */
  strokeWidth?: number;
  /** Accessible name. Without it the icon is decorative (`aria-hidden`), which is right beside a text label. */
  label?: string;
}

/**
 * A lucide icon by name. Decorative by default; pass `label` when the icon is the only content.
 *   <Icon name="Flame" />   <Icon name={route.icon} size="lg" />   <Icon name="Info" label="More information" />
 */
export function Icon({ name, size = 'md', strokeWidth = 1.75, label, className, ...rest }: IconProps) {
  const px = typeof size === 'number' ? size : ICON_SIZES[size];
  const byName = typeof name === 'string';
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const Glyph: LucideIcon | null = byName ? resolveIcon(name) : name;
  const missing = byName && !Glyph;

  useEffect(() => {
    if (missing && !fullSet) void loadFullSet();
  }, [missing]);

  const a11y = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const);

  if (!Glyph) {
    if (byName && fullSet && !warned.has(name)) {
      warned.add(name);
      console.warn(`[ui] Unknown icon name "${name}". Use a lucide-react PascalCase name.`);
    }
    // Still loading, or unknown: an empty box of the right size (unknown names get a neutral ring).
    if (fullSet) {
      const Fallback = BUNDLED_ICONS.CircleDashed;
      return <Fallback size={px} strokeWidth={strokeWidth} className={cx(styles.icon, className)} {...a11y} {...rest} />;
    }
    return <span className={cx(styles.placeholder, className)} style={{ width: px, height: px }} {...a11y} />;
  }
  return <Glyph size={px} strokeWidth={strokeWidth} className={cx(styles.icon, className)} {...a11y} {...rest} />;
}

/**
 * Render an icon slot value. Strings and lucide components become `<Icon>` with the given defaults;
 * elements are returned untouched (so a caller can pass a fully custom node).
 */
export function renderIcon(source: IconSource | null | undefined, defaults: Omit<IconProps, 'name'> = {}): ReactNode {
  if (source == null || source === '') return null;
  if (isValidElement(source)) return source;
  return <Icon name={source as IconName | LucideIcon} {...defaults} />;
}
