import type { CSSProperties, ReactNode } from 'react';
import { cx } from '@/ui';
import styles from './Kit.module.css';

/** A numbered top-level group of the gallery ("03 Actions"). */
export function Group({ id, index, title, blurb, children }: { id: string; index: string; title: string; blurb: string; children: ReactNode }) {
  return (
    <section className={styles.group} id={`kit-${id}`} aria-labelledby={`kit-${id}-title`} data-kit-group={id}>
      <div className={styles.groupHead}>
        <span className={styles.groupIndex} aria-hidden="true">
          {index}
        </span>
        <div>
          <h2 id={`kit-${id}-title`} className={styles.groupTitle}>
            {title}
          </h2>
          <p className={styles.groupBlurb}>{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** One component: its name and a note on the left, its states on the right. */
export function Specimen({ name, note, children }: { name: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.specimen} data-specimen={name}>
      <div>
        <h3 className={styles.specName}>{name}</h3>
        {note != null && <p className={styles.specNote}>{note}</p>}
      </div>
      <div className={styles.specBody}>{children}</div>
    </div>
  );
}

/** A labelled state or variation inside a specimen. */
export function Demo({ label, width, children }: { label?: string; width?: 'narrow' | 'medium'; children: ReactNode }) {
  return (
    <div className={cx(styles.demo, width === 'narrow' && styles.narrow, width === 'medium' && styles.medium)}>
      {label && <div className={styles.demoLabel}>{label}</div>}
      {children}
    </div>
  );
}

/** A dashed placeholder block for layout demos. */
export function Box({ children, tall }: { children?: ReactNode; tall?: boolean }) {
  return <div className={cx(styles.box, tall && styles.boxTall)}>{children}</div>;
}

/** A colour token swatch. The colour arrives through a custom property that points at the token. */
export function Swatch({ token, fg, label }: { token: string; fg?: string; label?: string }) {
  const vars = { '--sw': `var(${token})`, ...(fg ? { '--sw-fg': `var(${fg})` } : null) } as CSSProperties;
  return (
    <div className={styles.swatch}>
      <div className={styles.swatchChip} style={vars}>
        {label ?? (fg ? 'Aa' : '')}
      </div>
      <span className={styles.swatchName}>{token}</span>
    </div>
  );
}

export { styles as kitStyles };
