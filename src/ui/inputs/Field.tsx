import type { ReactNode } from 'react';
import { Icon } from '../icon/Icon';
import { cx } from '../util/cx';
import styles from './Field.module.css';

/** The label/hint/error furniture shared by every form control in the kit. */
export interface FieldLabelProps {
  /** Visible label. Every input needs one; hide it visually with `hideLabel` only when the context names the field. */
  label: ReactNode;
  /** Keep the label for screen readers but do not show it. */
  hideLabel?: boolean;
  /** Help text under the control. */
  hint?: ReactNode;
  /** Error message; also marks the control invalid. Say how to fix it. */
  error?: ReactNode;
  /** Adds "(optional)" after the label. Required is the default assumption, so it is not marked. */
  optional?: boolean;
  /** Small text at the far end of the label row (a counter, a unit). */
  aside?: ReactNode;
}

/** Props for `<Field>`. */
export interface FieldProps extends FieldLabelProps {
  /** id of the control the label points at. */
  htmlFor?: string;
  /** id given to the label element (for `aria-labelledby` on custom controls). */
  labelId?: string;
  hintId?: string;
  errorId?: string;
  /** Render the label as a `span` (for groups that are labelled with aria-labelledby). */
  labelAs?: 'label' | 'span' | 'legend';
  className?: string;
  children: ReactNode;
}

/** Ids to pass to `aria-describedby` for a control inside a Field. */
export function describedBy(hintId: string, errorId: string, hint: ReactNode, error: ReactNode, extra?: string): string | undefined {
  const ids = [extra, hint != null && hint !== false ? hintId : null, error != null && error !== false ? errorId : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

/**
 * Label, hint and error around a control. TextField, Select, Slider and friends use it internally;
 * use it directly to give a custom control the same furniture.
 */
export function Field({ label, hideLabel, hint, error, optional, aside, htmlFor, labelId, hintId, errorId, labelAs = 'label', className, children }: FieldProps) {
  const LabelTag = labelAs === 'legend' ? 'span' : labelAs;
  const labelNode = (
    <LabelTag id={labelId} className={cx(styles.label, hideLabel && 'sr-only')} {...(LabelTag === 'label' ? { htmlFor } : {})}>
      {label}
      {optional && <span className={styles.optional}>(optional)</span>}
    </LabelTag>
  );
  return (
    <div className={cx(styles.field, className)}>
      {hideLabel && aside == null ? (
        labelNode
      ) : (
        <div className={styles.labelRow}>
          {labelNode}
          {aside != null && <span className={styles.aside}>{aside}</span>}
        </div>
      )}
      {children}
      {hint != null && hint !== false && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error != null && error !== false && (
        <p id={errorId} className={styles.error} role="alert">
          <Icon name="CircleAlert" size="sm" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
