import type { ReactNode } from 'react';
import { explainMediaFailure, type MediaFailure } from '@/core/platform/media';
import { Button } from '../actions/Button';
import { renderIcon, type IconSource } from '../icon/Icon';
import { cx } from '../util/cx';
import styles from './State.module.css';

interface StateBaseProps {
  /** One plain line naming the situation. */
  title: ReactNode;
  /** What it means and what to do next. */
  children?: ReactNode;
  /** Buttons or links. Offer the way forward. */
  actions?: ReactNode;
  /** "start" (default) sits flush left with the content; "center" is for a whole empty screen. */
  align?: 'start' | 'center';
  /** Draw a dashed frame around it (an empty slot inside a list or grid). */
  framed?: boolean;
  /** Heading level of the title, to fit the page outline. Default 3. */
  level?: 2 | 3 | 4;
  className?: string;
}

function StateTitle({ level = 3, children }: { level?: 2 | 3 | 4; children: ReactNode }) {
  const Tag = `h${level}` as 'h2' | 'h3' | 'h4';
  return <Tag className={styles.title}>{children}</Tag>;
}

/** Props for `<EmptyState>`. */
export interface EmptyStateProps extends StateBaseProps {
  icon?: IconSource;
}

/**
 * Shown where content will be once there is some. Say what will appear and give the first step.
 *   <EmptyState icon="Music" title="No songs yet" actions={<LinkButton to="scan" variant="primary">Scan a sheet</LinkButton>}>
 *     Songs you scan or import show up here.</EmptyState>
 */
export function EmptyState({ icon = 'Inbox', title, children, actions, align = 'start', framed, level, className }: EmptyStateProps) {
  return (
    <div className={cx(styles.state, align === 'center' && styles.center, framed && styles.framed, className)}>
      <span className={styles.tile} aria-hidden="true">
        {renderIcon(icon, { size: 24 })}
      </span>
      <div className={styles.text}>
        <StateTitle level={level}>{title}</StateTitle>
        {children != null && <div className={styles.body}>{children}</div>}
        {actions != null && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}

/** Props for `<ErrorState>`. */
export interface ErrorStateProps extends Partial<StateBaseProps> {
  /** The caught error; its message goes into a collapsed "Technical details". */
  error?: unknown;
  /** Shows a "Try again" button. */
  onRetry?: () => void;
  retryLabel?: string;
  icon?: IconSource;
}

/**
 * Something failed and this part of the screen cannot show. Say what happened in plain words and
 * offer a retry; the raw error stays tucked away.
 *   <ErrorState title="This file could not be read" error={err} onRetry={load}>It may be damaged, or not a tab file.</ErrorState>
 */
export function ErrorState({ title = 'Something went wrong', children, actions, error, onRetry, retryLabel = 'Try again', icon = 'TriangleAlert', align = 'start', framed, level, className }: ErrorStateProps) {
  const detail = error == null ? null : error instanceof Error ? error.message : String(error);
  return (
    <div className={cx(styles.state, align === 'center' && styles.center, framed && styles.framed, className)} role="alert">
      <span className={cx(styles.tile, styles.tileBad)} aria-hidden="true">
        {renderIcon(icon, { size: 24 })}
      </span>
      <div className={styles.text}>
        <StateTitle level={level}>{title}</StateTitle>
        {children != null && <div className={styles.body}>{children}</div>}
        {(onRetry || actions != null) && (
          <div className={styles.actions}>
            {onRetry && (
              <Button variant="primary" iconLeft="RotateCw" onClick={onRetry}>
                {retryLabel}
              </Button>
            )}
            {actions}
          </div>
        )}
        {detail && (
          <details className={styles.details}>
            <summary>Technical details</summary>
            <pre>{detail}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

/** Failure reasons a retry can actually fix (the others need a different address, browser or host). */
const RETRYABLE: ReadonlySet<MediaFailure> = new Set<MediaFailure>(['denied', 'no-device', 'in-use', 'unknown']);

/** Props for `<MediaBlocked>`. */
export interface MediaBlockedProps {
  /** Why the request failed: the `reason` of a failed `requestMic()` / `requestCamera()`. */
  reason: MediaFailure;
  device: 'microphone' | 'camera';
  /** Ask for the device again. The button only shows for failures a retry can fix. */
  onRetry?: () => void;
  /** Carry on by tap/click instead. Shown whenever provided. */
  onContinueWithout?: () => void;
  /** Label for the fallback button. Default "Continue without the microphone/camera". */
  continueLabel?: string;
  align?: 'start' | 'center';
  framed?: boolean;
  /** Heading level of the title. Default 3. */
  level?: 2 | 3 | 4;
  className?: string;
  /** Extra line under the explanation: what still works here without the device. */
  children?: ReactNode;
}

/**
 * The standard "microphone/camera is not available" panel. Wording comes from
 * `explainMediaFailure`, so every screen explains a failure the same way.
 *   const res = await requestMic();
 *   if (!res.ok) return <MediaBlocked reason={res.reason} device="microphone" onRetry={start} onContinueWithout={useTapMode} />;
 */
export function MediaBlocked({ reason, device, onRetry, onContinueWithout, continueLabel, align = 'start', framed, level, className, children }: MediaBlockedProps) {
  const { title, fix } = explainMediaFailure(reason, device);
  const canRetry = !!onRetry && RETRYABLE.has(reason);
  return (
    <div className={cx(styles.state, align === 'center' && styles.center, framed && styles.framed, className)} role="alert">
      <span className={cx(styles.tile, styles.tileWarn)} aria-hidden="true">
        {renderIcon(device === 'camera' ? 'CameraOff' : 'MicOff', { size: 24 })}
      </span>
      <div className={styles.text}>
        <StateTitle level={level}>{title}</StateTitle>
        <div className={styles.body}>
          <p>{fix}</p>
          {children}
        </div>
        {(canRetry || onContinueWithout) && (
          <div className={styles.actions}>
            {canRetry && (
              <Button variant="primary" iconLeft="RotateCw" onClick={onRetry}>
                Try again
              </Button>
            )}
            {onContinueWithout && (
              <Button variant={canRetry ? 'secondary' : 'primary'} onClick={onContinueWithout}>
                {continueLabel ?? `Continue without the ${device}`}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
