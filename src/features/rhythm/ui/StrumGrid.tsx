import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Icon, cx, focusRing } from '@/ui';
import { meterInfo } from '../core/meter';
import type { Verdict } from '../core/scoring';
import { patternArrows, strokes, type Stroke, type StrokeKind, type StrumPattern } from '../core/strum';
import styles from './Rhythm.module.css';

/** How a slot was played in the round so far. */
export interface SlotMark {
  verdict: Verdict;
  errorMs: number;
}

/** Props of {@link StrumGrid}. */
export interface StrumGridProps {
  pattern: Pick<StrumPattern, 'meter' | 'grid' | 'slots'>;
  /** Show the count under the arrows. */
  counts?: boolean;
  size?: 'lg' | 'sm';
  /** Latest judgement per slot. */
  marks?: ReadonlyArray<SlotMark | undefined>;
  /** Makes every slot a button (the pattern builder). */
  onToggle?: (slot: number) => void;
  className?: string;
}

/** Imperative handle: light up the slot that is sounding, without re-rendering. */
export interface StrumGridHandle {
  setActive(slot: number | null): void;
}

const KIND_WORD: Record<StrokeKind, string> = { strum: 'strum', accent: 'accented strum', mute: 'muted strum', ghost: 'ghost stroke (the hand misses the strings)' };
const MARK_ICON: Record<Verdict, string> = { perfect: 'Check', good: 'Check', ok: 'Minus', miss: 'X', extra: 'X' };
const MARK_TONE: Record<Verdict, string> = { perfect: styles.toneHit, good: styles.toneNear, ok: styles.toneOff, miss: styles.toneMiss, extra: styles.toneMiss };

/** One arrow: the hand going down or up. A ghost is dashed, a muted stroke carries a cross, an accent a wedge. */
function Arrow({ stroke }: { stroke: Stroke }) {
  const down = stroke.dir === 'D';
  const y0 = down ? 7 : 49;
  const y1 = down ? 47 : 9;
  const head = down ? `M5 ${y1 - 11} L12 ${y1 + 1} L19 ${y1 - 11}` : `M5 ${y1 + 11} L12 ${y1 - 1} L19 ${y1 + 11}`;
  return (
    <svg className={styles.arrow} viewBox="0 0 24 56" aria-hidden="true" data-kind={stroke.kind}>
      <path d={`M12 ${y0} V${y1}`} className={styles.arrowShaft} />
      <path d={head} className={styles.arrowHead} />
      {stroke.kind === 'mute' && <path d={down ? 'M6.5 14 L17.5 25 M17.5 14 L6.5 25' : 'M6.5 31 L17.5 42 M17.5 31 L6.5 42'} className={styles.arrowCross} />}
    </svg>
  );
}

/**
 * A strumming pattern as arrows over its count: one column per slot of the grid, grouped by beat.
 * Every slot shows the hand's motion (down on even slots, up on odd ones); slots where the hand
 * misses the strings on purpose are drawn as faint dashed "ghost" arrows.
 */
export const StrumGrid = forwardRef<StrumGridHandle, StrumGridProps>(function StrumGrid({ pattern, counts = true, size = 'lg', marks, onToggle, className }, ref) {
  const list = useMemo(() => strokes(pattern), [pattern]);
  const meter = meterInfo(pattern.meter);
  const cells = useRef<Array<HTMLElement | null>>([]);
  const active = useRef<number | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setActive(slot: number | null) {
        if (active.current === slot) return;
        if (active.current !== null) cells.current[active.current]?.removeAttribute('data-active');
        if (slot !== null) cells.current[slot]?.setAttribute('data-active', '1');
        active.current = slot;
      },
    }),
    [],
  );

  // Group the slots by felt beat so the bar reads in beats, not as one long row.
  const beats: Stroke[][] = meter.beatStarts.map(() => []);
  for (const s of list) {
    let beat = 0;
    meter.beatStarts.forEach((start, i) => {
      if (s.tick >= start) beat = i;
    });
    beats[beat].push(s);
  }

  const cell = (s: Stroke) => {
    const mark = marks?.[s.slot];
    const inner = (
      <>
        {s.kind === 'accent' && (
          <span className={styles.accentMark} aria-hidden="true">
            &gt;
          </span>
        )}
        <Arrow stroke={s} />
        {counts && <span className={cx(styles.slotCount, s.count.strong && styles.slotCountStrong)}>{s.count.text || '·'}</span>}
        {marks && (
          <span className={cx(styles.slotMark, mark && MARK_TONE[mark.verdict])} aria-hidden="true">
            {mark && <Icon name={mark.verdict === 'good' || mark.verdict === 'ok' ? (mark.errorMs < 0 ? 'ChevronLeft' : 'ChevronRight') : MARK_ICON[mark.verdict]} size={13} strokeWidth={3} />}
          </span>
        )}
      </>
    );
    const common = {
      className: cx(styles.slot, onToggle && styles.slotButton, onToggle && focusRing),
      'data-kind': s.kind,
      'data-dir': s.dir,
      ref: (el: HTMLElement | null) => {
        cells.current[s.slot] = el;
      },
    };
    if (onToggle) {
      return (
        <button key={s.slot} {...common} type="button" onClick={() => onToggle(s.slot)} aria-label={`${s.count.text || 'slot ' + (s.slot + 1)}: ${s.dir === 'D' ? 'down' : 'up'}, ${KIND_WORD[s.kind]}. Press to change.`}>
          {inner}
        </button>
      );
    }
    return (
      <div key={s.slot} {...common}>
        {inner}
      </div>
    );
  };

  return (
    <div
      className={cx(styles.strumGrid, size === 'sm' && styles.strumGridSm, list.length > 8 && styles.strumGridDense, className)}
      role={onToggle ? 'group' : 'img'}
      aria-label={`Strumming pattern in ${pattern.meter}: ${patternArrows(pattern).replace(/\./g, 'miss').replace(/D>/g, 'down accented').replace(/U>/g, 'up accented').replace(/Dx/g, 'down muted').replace(/Ux/g, 'up muted').replace(/\bD\b/g, 'down').replace(/\bU\b/g, 'up')}`}
    >
      {beats.map((group, i) => (
        <div key={i} className={styles.strumBeat} style={{ flexGrow: group.length }}>
          {group.map(cell)}
        </div>
      ))}
    </div>
  );
});
