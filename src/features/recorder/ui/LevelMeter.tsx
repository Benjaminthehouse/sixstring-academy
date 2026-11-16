import { useEffect, useRef, useState } from 'react';
import { cx, useRafLoop } from '@/ui';
import { VERDICT_TEXT, levelVerdict, meterShare, type LevelVerdict } from '../model/signal';
import styles from '../Recorder.module.css';

/** Props for `<LevelMeter>`. */
export interface LevelMeterProps {
  /** Reads the latest input level; called every frame while `active`. */
  read: () => { db: number; peak: number };
  active: boolean;
  /** Show the verdict line under the bar. */
  showVerdict?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * The live input level: a bar with a hold mark for the recent peak, the "good" zone marked, and a
 * line that says whether the level is right. The bar is moved straight in the DOM every frame;
 * React only re-renders when the verdict changes.
 */
export function LevelMeter({ read, active, showVerdict = true, compact, className }: LevelMeterProps) {
  const barRef = useRef<HTMLSpanElement | null>(null);
  const holdRef = useRef<HTMLSpanElement | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const hold = useRef({ share: 0, at: 0 });
  const state = useRef<{ verdict: LevelVerdict; at: number }>({ verdict: 'silent', at: 0 });
  const [verdict, setVerdict] = useState<LevelVerdict>('silent');

  useRafLoop((_dt, time) => {
    const { db, peak } = read();
    const share = meterShare(db);
    if (barRef.current) barRef.current.style.transform = `scaleX(${share.toFixed(3)})`;
    if (share >= hold.current.share || time - hold.current.at > 1200) hold.current = { share, at: time };
    if (holdRef.current) holdRef.current.style.left = `${(hold.current.share * 100).toFixed(1)}%`;
    const next = levelVerdict(db, peak, state.current, time);
    // The hold runs from the last reading that really showed the verdict, not from one that only kept it.
    const genuine = levelVerdict(db, peak, { verdict: 'silent', at: -Infinity }, time);
    if (genuine === next) state.current = { verdict: next, at: time };
    else if (next !== state.current.verdict) state.current = { verdict: next, at: state.current.at };
    if (next !== verdict) setVerdict(next);
    if (meterRef.current && meterRef.current.dataset.verdict !== next) meterRef.current.dataset.verdict = next;
  }, active);

  useEffect(() => {
    if (active) return;
    if (barRef.current) barRef.current.style.transform = 'scaleX(0)';
    if (holdRef.current) holdRef.current.style.left = '0%';
    hold.current = { share: 0, at: 0 };
    state.current = { verdict: 'silent', at: 0 };
    setVerdict('silent');
  }, [active]);

  return (
    <div className={cx(styles.level, compact && styles.levelCompact, className)}>
      <div ref={meterRef} className={styles.levelBar} role="img" aria-label="Microphone level" data-recorder-level="" data-active={active || undefined}>
        <span className={styles.levelGood} aria-hidden="true" />
        <span ref={barRef} className={styles.levelFill} />
        <span ref={holdRef} className={styles.levelHold} />
      </div>
      {showVerdict && (
        <p className={styles.levelText} aria-live="polite" data-recorder-verdict={active ? verdict : 'off'}>
          {active ? VERDICT_TEXT[verdict] : 'The level shows here while the microphone is on.'}
        </p>
      )}
    </div>
  );
}
