import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../util/cx';

/** Props for `<VisuallyHidden>`. */
export interface VisuallyHiddenProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Default `span`. */
  as?: ElementType;
  children?: ReactNode;
}

/**
 * Text for screen readers only (uses the global `.sr-only` rule). Use it to name icon-only
 * controls' context, or to host an `aria-live` message that has no visible counterpart.
 */
export function VisuallyHidden({ as: Tag = 'span', className, children, ...rest }: VisuallyHiddenProps) {
  return (
    <Tag className={cx('sr-only', className)} {...rest}>
      {children}
    </Tag>
  );
}
