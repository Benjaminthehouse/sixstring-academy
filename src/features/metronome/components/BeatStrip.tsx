/**
 * The bar, beat by beat. Each beat is a button showing its accent as three bars of loudness
 * (strong, medium, normal, silent); a tap steps the accent. While the metronome runs, the beat
 * being heard lights up at the moment it is heard: `onBeat` drives the DOM directly (data
 * attributes and a short animation), so nothing re-renders on the beat. The screen's root gets
 * `data-beat` (the index of the lit beat, -1 when stopped) for tests.
 */
import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { AccentLevel, Meter, MetronomeBeat, SilentBarsConfig, Subdivision } from '@/core/audio';
import { Icon, cx, usePrefersReducedMotion } from '@/ui';
import { ACCENT_WORDS } from '../model/settings';
import { clicksPerBeat } from '../model/subdivisions';
import { gapStatus } from '../model/trainer';
import styles from './BeatStrip.module.css';

/** Props for {@link BeatStrip}. */
export interface BeatStripProps {
  meter: Meter;
  accents: readonly AccentLevel[];
  subdivision: Subdivision;
  swing: number;
  gap: SilentBarsConfig | null;
  running: boolean;
  onCycle: (beat: number) => void;
  /** Subscribe to heard beats. */
  onBeat: (fn: (beat: MetronomeBeat) => void) => () => void;
  /** The screen root, which mirrors the lit beat as `data-beat`. */
  rootRef: RefObject<HTMLElement | null>;
  /** Show the number-key shortcut in the hint (keyboards). */
  keys?: boolean;
  className?: string;
}

/** The row of beat pads. */
export function BeatStrip({ meter, accents, subdivision, swing, gap, running, onCycle, onBeat, rootRef, keys = false, className }: BeatStripProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const padRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const phaseRef = useRef<HTMLSpanElement | null>(null);
  const lit = useRef<HTMLButtonElement | null>(null);
  const gapRef = useRef(gap);
  gapRef.current = gap;
  const reduced = usePrefersReducedMotion();
  const counts = clicksPerBeat(meter, subdivision, swing);

  useEffect(
    () =>
      onBeat((b) => {
        const strip = stripRef.current;
        const pad = padRefs.current[b.beat] ?? null;
        if (lit.current && lit.current !== pad) lit.current.removeAttribute('data-lit');
        lit.current = pad;
        const phase = b.countIn ? 'count-in' : b.silent ? 'silent' : 'play';
        if (strip) strip.dataset.phase = phase;
        if (pad) {
          pad.setAttribute('data-lit', b.level === null ? 'silent' : b.level);
          if (!reduced && typeof pad.animate === 'function' && phase === 'play' && b.level !== null) {
            pad.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
          }
        }
        rootRef.current?.setAttribute('data-beat', String(b.beat));
        const text = phaseRef.current;
        if (text && b.beat === 0) {
          if (b.countIn) text.textContent = 'Count-in';
          else if (gapRef.current) {
            const g = gapStatus(gapRef.current, b.bar);
            text.textContent = g.silent ? `Silent bar ${g.barOfPhase} of ${g.phaseBars}: keep counting` : `Bar ${b.bar + 1} · clicking ${g.barOfPhase} of ${g.phaseBars}`;
          } else text.textContent = `Bar ${b.bar + 1}`;
        }
      }),
    [onBeat, rootRef, reduced],
  );

  // Stopped: nothing is lit.
  useEffect(() => {
    if (running) return;
    lit.current?.removeAttribute('data-lit');
    lit.current = null;
    if (stripRef.current) stripRef.current.dataset.phase = 'stopped';
    if (phaseRef.current) phaseRef.current.textContent = '';
    rootRef.current?.setAttribute('data-beat', '-1');
  }, [running, rootRef]);

  return (
    <div ref={stripRef} className={cx(styles.strip, running && styles.running, className)} data-phase="stopped">
      <div className={styles.caption}>
        <span ref={phaseRef} className={styles.phase} />
        <span className={styles.hint}>{keys ? 'Tap a beat (or its number key) to change its accent' : 'Tap a beat to change its accent'}</span>
      </div>
      <div className={styles.pads} role="group" aria-label="Beats of the bar" style={{ '--beats': meter.beats.length } as CSSProperties}>
        {meter.beats.map((beat, i) => {
          const level = accents[i] ?? beat.accent;
          const subs = counts[i] ?? 1;
          return (
            <button
              key={`${meter.numerator}/${meter.denominator}:${i}`}
              ref={(el) => {
                padRefs.current[i] = el;
              }}
              type="button"
              className={styles.pad}
              style={{ flexGrow: beat.units }}
              data-accent={level}
              data-beat-pad={i}
              aria-label={`Beat ${i + 1}: ${ACCENT_WORDS[level]}. Tap to change.`}
              onClick={() => onCycle(i)}
            >
              <span className={styles.num} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.bars} aria-hidden="true">
                {level === 0 ? (
                  <Icon name="VolumeX" size={18} />
                ) : (
                  [1, 2, 3].map((n) => <span key={n} className={cx(styles.bar, n <= level && styles.on)} style={{ height: `${0.2 + n * 0.4}rem` }} />)
                )}
              </span>
              <span className={styles.subs} aria-hidden="true">
                {subs > 1 && Array.from({ length: Math.min(subs, 9) }, (_, k) => <span key={k} className={cx(styles.sub, k === 0 && styles.subBeat)} />)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
