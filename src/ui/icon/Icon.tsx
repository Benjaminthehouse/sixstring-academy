import { createElement, isValidElement, useEffect, useSyncExternalStore, type ComponentType, type ReactElement, type ReactNode, type SVGAttributes } from 'react';
import type { icons } from 'lucide-react';
import { cx } from '../util/cx';
import { BUNDLED_ICONS } from './bundled.generated';
import type { IconNode } from './types';
import styles from './Icon.module.css';

/** A lucide icon name in PascalCase ("House", "ListMusic"). Any lucide name works, including older aliases ("Home"). */
export type IconName = keyof typeof icons | (string & {});

/** An icon component with lucide's props (anything imported from `lucide-react`). */
export type IconComponent = ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;

/** What kit components accept for an icon slot: a lucide name, a lucide component, or a ready element. */
export type IconSource = IconName | IconComponent | ReactElement;

/** Named icon sizes in px. */
export const ICON_SIZES = { xs: 14, sm: 16, md: 20, lg: 24, xl: 32 } as const;
/** Icon size: a named step or a pixel value. */
export type IconSize = keyof typeof ICON_SIZES | number;

interface FullSet {
  icons: Record<string, IconNode>;
  aliases: Record<string, string>;
}

// Names outside the bundled set are drawn from the complete lucide data (about 100 kB gzipped),
// fetched once, on demand, the first time such a name is rendered.
let fullSet: FullSet | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const warned = new Set<string>();

function loadFullSet(): Promise<void> {
  loading ??= import('./all.generated')
    .then((mod) => {
      fullSet = JSON.parse(mod.default) as FullSet;
    })
    .catch(() => {
      fullSet = { icons: {}, aliases: {} };
    })
    .then(() => listeners.forEach((l) => l()));
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => fullSet;

/** Accept the `FooIcon` and `LucideFoo` spellings lucide also exports. */
function baseName(name: string): string {
  if (name.length > 4 && name.endsWith('Icon')) return name.slice(0, -4);
  if (name.length > 6 && name.startsWith('Lucide')) return name.slice(6);
  return name;
}

/** Drawing data for a lucide name: the bundled set first, then the lazily loaded full set. Null when unknown or not loaded yet. */
export function resolveIcon(name: string): IconNode | null {
  const bundled = BUNDLED_ICONS[name] ?? BUNDLED_ICONS[baseName(name)];
  if (bundled) return bundled;
  if (!fullSet) return null;
  const key = name in fullSet.icons || name in fullSet.aliases ? name : baseName(name);
  return fullSet.icons[key] ?? fullSet.icons[fullSet.aliases[key]] ?? null;
}

/** True when `name` draws at once, without waiting for the lazy icon data. */
export function isBundledIcon(name: string): boolean {
  return name in BUNDLED_ICONS || baseName(name) in BUNDLED_ICONS;
}

/** Fetch the complete icon data ahead of time (optional: `<Icon>` does it by itself when needed). */
export function preloadAllIcons(): Promise<void> {
  return loadFullSet();
}

/** Props for `<Icon>`. */
export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'name'> {
  /** lucide icon name ("House"), or a component imported from `lucide-react`. */
  name: IconName | IconComponent;
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
  const node = byName ? resolveIcon(name) : null;
  const missing = byName && !node;

  useEffect(() => {
    if (missing && !fullSet) void loadFullSet();
  }, [missing]);

  const a11y = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const);

  if (!byName) {
    const Component = name;
    return createElement(Component as ComponentType<Record<string, unknown>>, { size: px, strokeWidth, className: cx(styles.icon, className), ...a11y, ...rest });
  }

  if (!node && !fullSet) {
    // Still loading the full set: hold the space so nothing shifts when the icon arrives.
    return <span className={cx(styles.placeholder, className)} style={{ width: px, height: px }} {...a11y} />;
  }
  if (!node && !warned.has(name)) {
    warned.add(name);
    console.warn(`[ui] Unknown icon name "${name}". Use a lucide-react PascalCase name such as "House".`);
  }
  // An unknown name draws a neutral dashed ring rather than nothing.
  const children = node ?? BUNDLED_ICONS.CircleDashed;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(styles.icon, className)}
      data-icon={name}
      {...a11y}
      {...rest}
    >
      {children.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

/**
 * Render an icon slot value. Strings and lucide components become `<Icon>` with the given defaults;
 * elements are returned untouched (so a caller can pass a fully custom node).
 */
export function renderIcon(source: IconSource | null | undefined, defaults: Omit<IconProps, 'name'> = {}): ReactNode {
  if (source == null || source === '') return null;
  if (isValidElement(source)) return source;
  return <Icon name={source as IconName | IconComponent} {...defaults} />;
}
