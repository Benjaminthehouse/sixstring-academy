import { useEffect, useRef } from 'react';
import { Icon, Spinner, cx } from '@/ui';
import type { ArcadeMic } from './useArcadeMic';
import styles from './Arcade.module.css';

/**
 * "Listening" with a live input meter, so the learner can see the guitar is heard. The meter is
 * moved straight from the tracker's level events (a CSS variable), never through React state.
 */
export function MicLine({ mic, hint }: { mic: ArcadeMic; hint?: string }) {
  const fill = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const t = mic.tracker;
    if (!t) return undefined;
    return t.on('level', (e) => {
      const v = Math.min(1, Math.max(0, (e.db + 66) / 54));
      fill.current?.style.setProperty('--level', v.toFixed(3));
    });
  }, [mic.tracker]);
  const on = mic.status === 'on';
  return (
    <div className={cx(styles.micLine, on && styles.micLineOn)} data-arcade-mic={mic.status}>
      {mic.status === 'starting' ? <Spinner size={18} /> : <Icon name="Mic" size={18} />}
      <span className={styles.micText}>{on ? (hint ?? 'Listening to your guitar') : mic.status === 'starting' ? 'Opening the microphone…' : 'Microphone off'}</span>
      <span className={styles.micMeter} aria-hidden="true">
        <span ref={fill} className={styles.micMeterFill} />
      </span>
    </div>
  );
}
