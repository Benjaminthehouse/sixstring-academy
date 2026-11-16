import type { ReactNode } from 'react';
import { AnimatedNumber, Icon, IconButton, Kbd, ProgressBar, cx } from '@/ui';
import { comboMultiplier } from '../core/scoring';
import { fxLayerClass, type Fx } from './fx';
import styles from './Arcade.module.css';

/** Props of {@link RoundFrame}. */
export interface RoundFrameProps {
  /** "Note Hunt · Level 2". */
  title: string;
  progress: { value: number; max: number } | null;
  score: number;
  combo: number;
  /** A clock (CountdownRing) for timed levels. */
  timer?: ReactNode;
  onEnd: () => void;
  /** The call: what to find or play now. */
  prompt: ReactNode;
  /** The verdict line, announced politely. */
  status: ReactNode;
  /** `data-arcade-status` for checks: `waiting`, `hit`, `miss` … */
  statusKind?: string;
  board: ReactNode;
  /** Controls under the board (microphone, hint, replay). */
  controls?: ReactNode;
  /** Keyboard hints for desktops. */
  keys?: Array<[string, string]>;
  fx: Fx;
  /** Anything to expose to browser checks as data attributes on the round. */
  data?: Record<string, string | number | undefined>;
  /** The board needs all the width (and goes edge to edge on phones). */
  wide?: boolean;
}

/**
 * The frame every round shares: a heads-up bar (end, progress, clock, score, combo) on top, the
 * call, the board with its effects layer, the verdict, and the controls at the bottom edge where
 * the thumbs are.
 */
export function RoundFrame({ title, progress, score, combo, timer, onEnd, prompt, status, statusKind = 'waiting', board, controls, keys, fx, data, wide }: RoundFrameProps) {
  const dataAttrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-arcade-${k}`, v]));
  return (
    <div className={cx(styles.round, wide && styles.roundWide)} data-arcade-round {...dataAttrs}>
      <header className={styles.hud}>
        <IconButton icon="X" label="End round" onClick={onEnd} data-arcade-end />
        <div className={styles.hudMid}>
          <span className={styles.hudTitle}>{title}</span>
          {progress && (
            <ProgressBar className={styles.hudBar} aria-label="Round progress" value={progress.value} max={progress.max} size="sm" tone="accent" valueText={false} segmented={progress.max <= 16} />
          )}
        </div>
        {timer && <div className={styles.hudTimer}>{timer}</div>}
        <div className={styles.hudScore} aria-label={`Score ${score}`}>
          <span className={styles.hudScoreLabel}>Score</span>
          <span className={styles.hudScoreValue}>
            <AnimatedNumber value={score} duration={350} />
          </span>
        </div>
        <div className={cx(styles.combo, combo >= 2 && styles.comboOn, combo >= 10 && styles.comboHot)} aria-label={`Combo ${combo}`} data-arcade-combo={combo}>
          <Icon name="Flame" size={18} />
          <span className={styles.comboValue} key={combo}>
            {combo}
          </span>
          <span className={styles.comboMult}>×{comboMultiplier(combo).toFixed(1)}</span>
        </div>
      </header>

      <div className={styles.prompt}>{prompt}</div>

      <div className={styles.stage} data-arcade-stage>
        {board}
        <div ref={fx.layerRef} className={fxLayerClass} />
      </div>

      <div className={styles.statusLine} aria-live="polite" data-arcade-status={statusKind}>
        {status}
      </div>

      {controls && (
        <div className={styles.controls} data-arcade-controls>
          {controls}
        </div>
      )}

      {keys && keys.length > 0 && (
        <div className={styles.keysHint} aria-hidden="true">
          {keys.map(([k, what]) => (
            <span key={k}>
              <Kbd>{k}</Kbd> {what}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
