import { useId, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { href as routeHref } from '@/app/router';
import { Icon } from '../icon/Icon';
import { cx } from '../util/cx';
import { useBottomClearance } from './clearance';
import { spaceVar, type Space } from './space';
import styles from './Page.module.css';

/** Where a Page's back link goes. */
export interface PageBack {
  /** Route name to go back to, e.g. "songs". */
  to?: string;
  params?: Array<string | undefined>;
  /** Link text. Default "Back". Name the destination: "Songs", "All scales". */
  label?: string;
  /** Use a handler instead of a link (for example `() => back('songs')`). */
  onClick?: () => void;
}

/** Props for `<Page>`. */
export interface PageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** The screen title (rendered as the page's only h1). */
  title: ReactNode;
  /** One or two plain sentences under the title. */
  subtitle?: ReactNode;
  /** Small kicker above the title ("Lesson 3 of 12"). */
  eyebrow?: ReactNode;
  /** Back link above the title: a route name, or `{ to, params, label, onClick }`. */
  back?: string | PageBack;
  /** Controls aligned with the title (one primary action at most). */
  actions?: ReactNode;
  /** "content" 72rem (default), "prose" 40rem for reading screens, "full" for edge-to-edge tools. */
  width?: 'content' | 'prose' | 'full';
  /** Gap between direct children. Default 8 (32 px). */
  gap?: Space;
  /** Hide the visible header (immersive screens); the title stays available to screen readers. */
  hideHeader?: boolean;
  children?: ReactNode;
}

/**
 * The wrapper every screen starts with: title block, optional back link and actions, consistent
 * max width and gutters, and a vertical rhythm between its children.
 */
export function Page({ title, subtitle, eyebrow, back, actions, width = 'content', gap, hideHeader, className, style, children, ...rest }: PageProps) {
  const titleId = useId();
  const backInfo: PageBack | null = typeof back === 'string' ? { to: back } : back ?? null;
  const backContent = (
    <>
      <Icon name="ArrowLeft" size="sm" />
      {backInfo?.label ?? 'Back'}
    </>
  );
  return (
    <div className={cx(styles.page, width === 'prose' && styles.prose, width === 'full' && styles.full, className)} style={style} data-ui-page="" {...rest}>
      {hideHeader ? (
        <h1 id={titleId} className="sr-only">
          {title}
        </h1>
      ) : (
        <header className={styles.header}>
          {backInfo &&
            (backInfo.onClick && !backInfo.to ? (
              <button type="button" className={styles.back} onClick={backInfo.onClick}>
                {backContent}
              </button>
            ) : (
              <a className={styles.back} href={routeHref(backInfo.to ?? 'home', ...(backInfo.params ?? []))} onClick={backInfo.onClick}>
                {backContent}
              </a>
            ))}
          <div className={styles.headRow}>
            <div className={styles.titles}>
              {eyebrow != null && <p className={styles.eyebrow}>{eyebrow}</p>}
              <h1 id={titleId} className={styles.title}>
                {title}
              </h1>
              {subtitle != null && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            {actions != null && <div className={styles.actions}>{actions}</div>}
          </div>
        </header>
      )}
      <div className={styles.body} style={gap !== undefined ? ({ gap: spaceVar(gap) } as CSSProperties) : undefined}>
        {children}
      </div>
    </div>
  );
}

/** Props for `<Section>`. */
export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Section heading. */
  title?: ReactNode;
  /** A sentence under the heading. */
  description?: ReactNode;
  /** Small kicker above the heading. */
  eyebrow?: ReactNode;
  /** Controls on the heading row ("See all", a filter). */
  actions?: ReactNode;
  /** Heading level. Default 2. */
  level?: 2 | 3;
  /** Draw a hairline above the section. */
  divided?: boolean;
  /** Gap between the heading and the content, and between direct children. Default 4. */
  gap?: Space;
  children?: ReactNode;
}

/** A titled block inside a Page. Plain by default: no card, no border. */
export function Section({ title, description, eyebrow, actions, level = 2, divided, gap, className, style, children, ...rest }: SectionProps) {
  const id = useId();
  const Tag = level === 3 ? 'h3' : 'h2';
  const hasHead = title != null || actions != null;
  return (
    <section className={cx(styles.section, divided && styles.sectionDivided, className)} style={{ ...(gap !== undefined ? { gap: spaceVar(gap) } : null), ...style }} aria-labelledby={title != null ? id : undefined} {...rest}>
      {hasHead && (
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitles}>
            {eyebrow != null && <p className={styles.sectionEyebrow}>{eyebrow}</p>}
            {title != null && (
              <Tag id={id} className={cx(styles.sectionTitle, level === 3 && styles.sectionTitle3)}>
                {title}
              </Tag>
            )}
            {description != null && <p className={styles.sectionDescription}>{description}</p>}
          </div>
          {actions != null && <div className={styles.sectionActions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Props for `<ActionBar>`. */
export interface ActionBarProps extends HTMLAttributes<HTMLDivElement> {
  /** Content at the start of the bar: feedback text, a progress note, a secondary link. */
  start?: ReactNode;
  /** On phones, let the buttons share the full width. Default true. */
  stretchOnMobile?: boolean;
  /**
   * While the bar sits at the bottom of the screen, publish its height as `--action-bar-h` so toasts
   * (and other bottom layers) stay above it. Default true; false for a bar that never needs that.
   */
  clearance?: boolean;
  /** The actions, primary last. */
  children?: ReactNode;
}

/**
 * A bar of actions that stays at the bottom of the screen while the content scrolls: the lesson
 * runner's "Check" / "Continue", a form's "Save". Put it last inside a `<Page>`. The shell's
 * "Jump to actions" link finds it (`data-ui-action-bar`).
 *   <ActionBar start={<Text tone="ok">Correct</Text>}><Button variant="primary">Continue</Button></ActionBar>
 */
export function ActionBar({ start, stretchOnMobile = true, clearance = true, className, children, ...rest }: ActionBarProps) {
  const el = useRef<HTMLDivElement | null>(null);
  // Only while it is really at the bottom: a bar that ends mid-screen (a short page, a layout that
  // makes it static on wide screens) must not lift the toasts or put them over itself.
  useBottomClearance(el, clearance);
  return (
    <div ref={el} className={cx(styles.actionBar, stretchOnMobile && styles.actionBarStretch, className)} data-ui-action-bar="" {...rest}>
      {start != null && <div className={styles.actionBarStart}>{start}</div>}
      {children}
    </div>
  );
}
