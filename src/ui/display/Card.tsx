import { forwardRef, type HTMLAttributes, type MouseEventHandler, type ReactNode, type Ref } from 'react';
import { Icon, renderIcon, type IconSource } from '../icon/Icon';
import { cx } from '../util/cx';
import { isExternalHref, resolveHref, type LinkTarget } from '../util/links';
import styles from './Card.module.css';

/** Props for `<Card>`. */
export interface CardProps extends LinkTarget, Omit<HTMLAttributes<HTMLElement>, 'onClick'> {
  /** plain: surface with a hairline (default). sunken: tinted, no border. raised: shadow. outline: border only. */
  variant?: 'plain' | 'sunken' | 'raised' | 'outline';
  /** Inner padding. Default "md" (20 px, 16 on phones). */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Makes the whole card a button. With `to`/`href` it is a link instead. */
  onClick?: MouseEventHandler<HTMLElement>;
  /** Selected look with a check badge (choices, the active item). */
  selected?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}

/**
 * A surface that groups one thing. Use it for discrete objects (a song, a lesson, a setting group),
 * not as a wrapper around every block: plain Sections need no card. With `onClick` or `to` the
 * whole card is one control, so it must not contain other buttons or links.
 *   <Card to="scales" params={['a-minor']}>…</Card>     <Card selected onClick={pick}>…</Card>
 */
export const Card = forwardRef<HTMLElement, CardProps>(function Card({ variant = 'plain', padding = 'md', to, params, href, onClick, selected, disabled, className, children, ...rest }, ref) {
  const url = resolveHref({ to, params, href });
  const interactive = !!url || !!onClick;
  const cls = cx(styles.card, variant !== 'plain' && styles[variant], styles[`pad-${padding}`], interactive && styles.interactive, selected && styles.selected, disabled && styles.disabled, className);
  const body = (
    <>
      {children}
      {selected && (
        <span className={styles.check} aria-hidden="true">
          <Icon name="Check" size={14} strokeWidth={3} />
        </span>
      )}
    </>
  );
  if (url && !disabled) {
    const external = isExternalHref(url);
    return (
      <a ref={ref as Ref<HTMLAnchorElement>} href={url} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className={cls} aria-current={selected ? 'true' : undefined} onClick={onClick} {...rest}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button ref={ref as Ref<HTMLButtonElement>} type="button" className={cx(cls, styles.asButton)} aria-pressed={selected} disabled={disabled} onClick={onClick} {...rest}>
        {body}
      </button>
    );
  }
  return (
    <div ref={ref as Ref<HTMLDivElement>} className={cls} {...rest}>
      {body}
    </div>
  );
});

/** Props for `<List>`. */
export interface ListProps extends HTMLAttributes<HTMLUListElement> {
  /** plain: rows separated by hairlines on the page. card: the same rows inside one bordered surface. */
  variant?: 'plain' | 'card';
  children?: ReactNode;
}

/** A vertical list of `<ListItem>` rows (renders a `ul`). */
export function List({ variant = 'plain', className, children, ...rest }: ListProps) {
  return (
    <ul role="list" className={cx(styles.list, variant === 'card' && styles.listCard, className)} {...rest}>
      {children}
    </ul>
  );
}

/** Props for `<ListItem>`. */
export interface ListItemProps extends LinkTarget {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Leading icon, drawn in a soft tile. */
  icon?: IconSource;
  /** Any leading node instead of `icon` (an Avatar, a ChordDiagram thumbnail). */
  leading?: ReactNode;
  /** Trailing content: a Badge, a duration, a Switch. */
  trailing?: ReactNode;
  /** Makes the row a button. With `to`/`href` it is a link and shows a chevron. */
  onClick?: () => void;
  /** Highlight as the current item. */
  selected?: boolean;
  disabled?: boolean;
  /** Let title and subtitle wrap instead of truncating. */
  wrap?: boolean;
  className?: string;
}

/**
 * One row of a `<List>`: leading visual, title and subtitle, trailing detail. Rows are at least
 * 56 px tall. A row with `to`/`onClick` is one control, so put no other buttons inside it.
 *   <ListItem icon="Music" title="Greensleeves" subtitle="Traditional · Key of A minor" to="play" params={['greensleeves']} />
 */
export function ListItem({ title, subtitle, icon, leading, trailing, to, params, href, onClick, selected, disabled, wrap, className }: ListItemProps) {
  const url = resolveHref({ to, params, href });
  const action = (!!url || !!onClick) && !disabled;
  const rowClass = cx(styles.row, (url || onClick) && styles.rowAction, selected && styles.rowSelected, disabled && styles.rowDisabled, wrap && styles.rowWrap);
  const inner = (
    <>
      {leading != null ? <span className={styles.leading}>{leading}</span> : icon != null && <span className={cx(styles.leading, styles.leadingTile)}>{renderIcon(icon, { size: 20 })}</span>}
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{title}</span>
        {subtitle != null && <span className={styles.rowSubtitle}>{subtitle}</span>}
      </span>
      {trailing != null && <span className={styles.trailing}>{trailing}</span>}
      {url && (
        <span className={styles.chevron} aria-hidden="true">
          <Icon name="ChevronRight" size={18} />
        </span>
      )}
    </>
  );
  return (
    <li className={cx(styles.listItem, className)}>
      {url && action ? (
        <a className={rowClass} href={url} aria-current={selected ? 'true' : undefined} onClick={onClick} target={isExternalHref(url) ? '_blank' : undefined} rel={isExternalHref(url) ? 'noopener noreferrer' : undefined}>
          {inner}
        </a>
      ) : onClick ? (
        <button type="button" className={rowClass} aria-pressed={selected} disabled={disabled} onClick={onClick}>
          {inner}
        </button>
      ) : (
        <div className={rowClass}>{inner}</div>
      )}
    </li>
  );
}
