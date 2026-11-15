import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../util/cx';
import styles from './Text.module.css';

/** Text colour roles. */
export type TextTone = 'default' | 'muted' | 'faint' | 'accent' | 'ok' | 'bad' | 'warn' | 'info';
/** Steps of the type scale. */
export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';

/** Props for `<Text>`. */
export interface TextProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Default `p` (`span` for eyebrow/label/caption when `inline`). */
  as?: ElementType;
  /**
   * body: normal copy. lead: larger intro line. caption: small muted note. label: small bold label.
   * eyebrow: tiny mono uppercase kicker above a heading. prose: a readable column for long text.
   */
  variant?: 'body' | 'lead' | 'caption' | 'label' | 'eyebrow' | 'prose';
  size?: TextSize;
  tone?: TextTone;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  /** JetBrains Mono: note names in tab, fret numbers, timings. */
  mono?: boolean;
  /** Fixed-width digits so changing numbers do not jiggle. */
  tabular?: boolean;
  /** One line with an ellipsis. */
  truncate?: boolean;
  align?: 'start' | 'center' | 'end';
  children?: ReactNode;
}

/** Body text with the type scale and colour roles, so screens never set fonts or colours inline. */
export function Text({ as, variant = 'body', size, tone, weight, mono, tabular, truncate, align, className, children, ...rest }: TextProps) {
  const Tag: ElementType = as ?? (variant === 'prose' ? 'div' : 'p');
  return (
    <Tag
      className={cx(
        styles.text,
        styles[variant],
        size && styles[`size-${size}`],
        tone && styles[`tone-${tone}`],
        weight && styles[`weight-${weight}`],
        mono && styles.mono,
        tabular && styles.tabular,
        truncate && styles.truncate,
        align && styles[`align-${align}`],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Props for `<Heading>`. */
export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Semantic level: picks h1..h4. Default 2. */
  level?: 1 | 2 | 3 | 4;
  /** Visual size, when it should differ from the level's default. */
  size?: TextSize;
  /** Heavier, tighter setting for the biggest line on a screen. */
  display?: boolean;
  tone?: TextTone;
  children?: ReactNode;
}

/** A heading in the display face. `level` is semantics, `size` is looks. */
export function Heading({ level = 2, size, display, tone, className, children, ...rest }: HeadingProps) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
  return (
    <Tag className={cx(styles.heading, size && styles[`size-${size}`], display && styles.display, tone && styles[`tone-${tone}`], className)} {...rest}>
      {children}
    </Tag>
  );
}
