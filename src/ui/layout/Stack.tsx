import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../util/cx';
import { flexStyle, spaceVar, type AlignItems, type JustifyContent, type Space } from './space';
import styles from './Layout.module.css';

interface FlexBaseProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Default `div`. */
  as?: ElementType;
  /** Gap between children, a step on the spacing scale. */
  gap?: Space;
  align?: AlignItems;
  justify?: JustifyContent;
  children?: ReactNode;
}

/** Props for `<Stack>`. */
export interface StackProps extends FlexBaseProps {}

/** Vertical flow with an even gap (default 4 = 16 px). The default way to space things on a screen. */
export function Stack({ as: Tag = 'div', gap, align, justify, className, style, children, ...rest }: StackProps) {
  return (
    <Tag className={cx(styles.stack, className)} style={{ ...flexStyle(gap, align, justify), ...style }} {...rest}>
      {children}
    </Tag>
  );
}

/** Props for `<Row>`. */
export interface RowProps extends FlexBaseProps {
  /** Let children wrap onto more lines. Default false. */
  wrap?: boolean;
  /** Stack vertically (stretched) on phones. */
  stackOnMobile?: boolean;
}

/** Horizontal line of things, vertically centred, that does not wrap (default gap 3 = 12 px). */
export function Row({ as: Tag = 'div', gap, align, justify, wrap, stackOnMobile, className, style, children, ...rest }: RowProps) {
  return (
    <Tag className={cx(styles.row, wrap && styles.rowWrap, stackOnMobile && styles.rowStackMobile, className)} style={{ ...flexStyle(gap, align, justify), ...style }} {...rest}>
      {children}
    </Tag>
  );
}

/** Props for `<Cluster>`. */
export interface ClusterProps extends FlexBaseProps {}

/** A wrapping group of small things: chips, tags, buttons, counters (default gap 2 = 8 px). */
export function Cluster({ as: Tag = 'div', gap, align, justify, className, style, children, ...rest }: ClusterProps) {
  return (
    <Tag className={cx(styles.cluster, className)} style={{ ...flexStyle(gap, align, justify), ...style }} {...rest}>
      {children}
    </Tag>
  );
}

/** Props for `<Grid>`. */
export interface GridProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  /** Smallest column width before the grid drops a column, e.g. "14rem". Default "16rem". */
  min?: string;
  /** A fixed number of equal columns instead of the responsive behaviour. Collapses to one on phones. */
  columns?: number;
  /** With `columns`: keep the columns on phones too (small tiles). */
  keepOnMobile?: boolean;
  /** "fit" stretches the columns to fill the row (default); "fill" keeps empty tracks so few items stay narrow. */
  mode?: 'fit' | 'fill';
  gap?: Space;
  children?: ReactNode;
}

/** Responsive grid: as many columns as fit at `min` width, sharing the row equally. */
export function Grid({ as: Tag = 'div', min, columns, keepOnMobile, mode = 'fit', gap, className, style, children, ...rest }: GridProps) {
  const vars: Record<string, string | number | undefined> = {
    '--grid-min': min,
    '--grid-mode': mode === 'fill' ? 'auto-fill' : undefined,
    '--grid-cols': columns,
    gap: spaceVar(gap),
  };
  return (
    <Tag className={cx(styles.grid, columns != null && styles.gridFixed, columns != null && !keepOnMobile && styles.gridCollapse, className)} style={{ ...(vars as CSSProperties), ...style }} {...rest}>
      {children}
    </Tag>
  );
}

/** Props for `<Divider>`. */
export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  /** Optional short label centred on the line ("or"). Horizontal only. */
  label?: ReactNode;
  className?: string;
}

/** A hairline between groups of content. Decorative unless it carries a label. */
export function Divider({ orientation = 'horizontal', label, className }: DividerProps) {
  if (orientation === 'vertical') return <div role="separator" aria-orientation="vertical" className={cx(styles.dividerVertical, className)} />;
  if (label != null) {
    return (
      <div role="separator" className={cx(styles.dividerLabeled, className)}>
        {label}
      </div>
    );
  }
  return <hr className={cx(styles.divider, className)} />;
}

/** Props for `<Spacer>`. */
export interface SpacerProps {
  /** Fixed size on the spacing scale. Without it the spacer grows to push siblings apart. */
  size?: Space;
  className?: string;
}

/** Empty space: flexible inside a Row/Stack (pushes siblings apart), or a fixed step with `size`. */
export function Spacer({ size, className }: SpacerProps) {
  if (size === undefined) return <div aria-hidden="true" className={cx(styles.spacer, className)} />;
  const px = spaceVar(size);
  return <div aria-hidden="true" className={cx(styles.spacerFixed, className)} style={{ width: px, height: px }} />;
}
