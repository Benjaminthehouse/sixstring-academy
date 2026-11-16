/**
 * What sits on top of the live picture: the status pill (state in words and five bars), the line
 * of coaching with the one action that helps right now, and the tap layer the marking tools use.
 * Dark scrims and pale text in both themes: it is drawn over a camera feed.
 */
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Button, Icon, cx } from '@/ui';
import type { LiveStatus } from '../model/status';
import styles from './Stage.module.css';

/** The status pill: five bars and the state in words. */
export function StatusPill({ status, extra }: { status: LiveStatus; extra?: ReactNode }) {
  return (
    <div className={cx(styles.pill, styles.statusPill)} data-tone={status.tone} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.bars} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={cx(styles.bar, i < status.bars && styles.barOn)} style={{ height: `${5 + i * 2}px` }} />
        ))}
      </span>
      <span className={styles.statusWord}>{status.word}</span>
      {extra}
    </div>
  );
}

/** A line of text on a scrim with optional actions (coaching, a question, a tool prompt). */
export function CoachBar({ icon, children, actions, tone, live }: { icon?: string; children: ReactNode; actions?: ReactNode; tone?: 'ok' | 'warn' | 'info'; live?: boolean }) {
  return (
    <div className={styles.coach} data-tone={tone ?? 'info'} aria-live={live ? 'polite' : undefined}>
      <p className={styles.coachText}>
        {icon ? <Icon name={icon} size="sm" className={styles.coachIcon} /> : null}
        <span>{children}</span>
      </p>
      {actions ? <div className={styles.coachActions}>{actions}</div> : null}
    </div>
  );
}

/** A button styled for the dark scrim. */
export function HudButton({ children, onClick, primary, icon }: { children: ReactNode; onClick: () => void; primary?: boolean; icon?: string }) {
  return (
    <Button size="sm" variant={primary ? 'primary' : 'secondary'} iconLeft={icon} onClick={onClick} className={cx(styles.hudButton, primary && styles.hudPrimary)}>
      {children}
    </Button>
  );
}

/**
 * Where the learner taps the still picture (marking tools), with the taps made so far. From the
 * keyboard: the arrow keys move a crosshair (Shift for bigger steps), Enter or Space taps there.
 */
export function TapLayer({ taps, onTap, label }: { taps: ReadonlyArray<{ x: number; y: number }>; onTap: (p: { x: number; y: number }) => void; label: string }) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const handle = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onTap({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const box = layer.current?.getBoundingClientRect();
    if (!box) return;
    const at = cursor ?? { x: box.width / 2, y: box.height / 2 };
    const step = e.shiftKey ? 40 : 8;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      e.stopPropagation();
      const [dx, dy] = moves[e.key];
      setCursor({ x: Math.max(0, Math.min(box.width, at.x + dx)), y: Math.max(0, Math.min(box.height, at.y + dy)) });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onTap(at);
    }
  };
  return (
    <div
      ref={layer}
      className={styles.tapLayer}
      onPointerDown={handle}
      onKeyDown={onKey}
      onFocus={() => setCursor((c) => c ?? (layer.current ? { x: layer.current.clientWidth / 2, y: layer.current.clientHeight / 2 } : null))}
      tabIndex={0}
      role="application"
      aria-label={`${label} Arrow keys move the crosshair, Enter taps.`}
      data-camera-taplayer=""
    >
      {taps.map((t, i) => (
        <span key={i} className={styles.tapMark} style={{ left: `${t.x}px`, top: `${t.y}px` }} aria-hidden="true">
          {i + 1}
        </span>
      ))}
      {cursor ? <span className={styles.crosshair} style={{ left: `${cursor.x}px`, top: `${cursor.y}px` }} aria-hidden="true" /> : null}
    </div>
  );
}

/** The tool banner at the top of the stage: what to do now, and progress dots. */
export function ToolBanner({ title, text, step, steps, error }: { title: string; text: string; step?: number; steps?: number; error?: string | null }) {
  return (
    <div className={styles.toolBanner} aria-live="polite">
      <p className={styles.toolTitle}>
        {title}
        {steps ? (
          <span className={styles.dots} aria-label={`Step ${Math.min((step ?? 0) + 1, steps)} of ${steps}`}>
            {Array.from({ length: steps }, (_, i) => (
              <span key={i} className={cx(styles.dot, i < (step ?? 0) && styles.dotDone, i === step && styles.dotNow)} />
            ))}
          </span>
        ) : null}
      </p>
      <p className={styles.toolText}>{text}</p>
      {error ? (
        <p className={styles.toolError}>
          <Icon name="TriangleAlert" size="xs" /> {error}
        </p>
      ) : null}
    </div>
  );
}
