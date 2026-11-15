import { Icon, cx } from '@/ui';
import { formatMs, verdictLabel, wrongWay, type Verdict } from '../core/scoring';
import type { LastJudgement } from './useRound';
import styles from './Rhythm.module.css';

const TONE: Record<Verdict, string> = { perfect: styles.toneHit, good: styles.toneNear, ok: styles.toneOff, miss: styles.toneMiss, extra: styles.toneMiss };
const ICON: Record<Verdict, string> = { perfect: 'Check', good: 'Check', ok: 'Minus', miss: 'X', extra: 'X' };

/** Half-width of the meter in ms: taps further off than this pin to the edge. */
const RANGE = 130;

/** Props of {@link Feedback}. */
export interface FeedbackProps {
  last: LastJudgement | null;
  /** Show the distance in milliseconds as well. */
  showMs: boolean;
  /** Shown before the first tap. */
  idle?: string;
}

/**
 * The answer to every tap: a word ("On it", "A touch late"), and a meter with the tap drawn where
 * it fell between early and late. Milliseconds only for those who ask.
 */
export function Feedback({ last, showMs, idle = 'Tap with the click' }: FeedbackProps) {
  const j = last?.judgement ?? null;
  const hit = j && j.verdict !== 'miss' && j.verdict !== 'extra';
  const position = hit ? Math.max(-1, Math.min(1, j.errorMs / RANGE)) : 0;
  const ahead = hit && j.verdict !== 'perfect' ? (j.errorMs < 0 ? 'ChevronsLeft' : 'ChevronsRight') : null;
  // On time but the wrong way: the direction is the thing to fix, so it is what the words say.
  const expected = last?.target?.dir;
  const reversed = !!hit && wrongWay(expected, j.dir);
  return (
    <div className={styles.feedback}>
      {/* Not a live region: a screen reader cannot keep up with a tap per beat. The summary is announced instead. */}
      <div className={cx(styles.verdict, j && (reversed ? styles.toneOff : TONE[j.verdict]))} key={last?.n ?? 0} data-verdict={reversed ? 'wrong-way' : j?.verdict ?? 'none'}>
        {j && reversed ? (
          <>
            <Icon name={expected === 'D' ? 'ArrowDown' : 'ArrowUp'} size={22} strokeWidth={2.5} />
            <span>{expected === 'D' ? 'That one goes down' : 'That one goes up'}</span>
          </>
        ) : j ? (
          <>
            <Icon name={ahead ?? ICON[j.verdict]} size={22} strokeWidth={2.5} />
            <span>{verdictLabel(j)}</span>
            {showMs && hit && <span className={styles.verdictMs}>{formatMs(j.errorMs)}</span>}
          </>
        ) : (
          <span className={styles.verdictIdle}>{idle}</span>
        )}
      </div>
      <div className={styles.meter} aria-hidden="true">
        <span className={styles.meterEnd}>early</span>
        <div className={styles.meterTrack}>
          <span className={styles.meterZone} />
          <span className={styles.meterCentre} />
          {hit && <span className={cx(styles.meterDot, TONE[j.verdict])} style={{ left: `${50 + position * 50}%` }} />}
        </div>
        <span className={styles.meterEnd}>late</span>
      </div>
    </div>
  );
}
