import type { CSSProperties } from 'react';
import { Icon, cx, focusRing } from '@/ui';
import { noteParts, type NoteNaming, type StringTarget } from '../model/targets';
import styles from './StringStrip.module.css';

/** Why a string is singled out. */
export type TargetKind = 'guide' | 'locked' | 'ear';

/** Props for `<StringStrip>`. */
export interface StringStripProps {
  targets: readonly StringTarget[];
  naming: NoteNaming;
  /** Per string: confirmed in tune in this visit. */
  confirmed: readonly boolean[];
  /** Index of the string being heard right now, -1 for none. */
  heard: number;
  /** Index of the string that is locked, guided or chosen for playing by ear, -1 for none. */
  target: number;
  targetKind: TargetKind | null;
  /** Index of the string whose reference note is sounding, -1 for none. */
  sounding: number;
  /** Draw the thickest string on the right (left-handed players). A display flip only. */
  flipped: boolean;
  /** What a tap does, for screen readers: "locks the tuner onto it", "plays its note". */
  action: string;
  onPick: (index: number) => void;
}

/**
 * The strings of the current tuning as a slice of headstock: one bone-coloured peg per string with
 * its note, strings of real relative thickness running over the nut. A peg shows a tick once its
 * string is in tune, a lock when the tuner is held on it, and its string shimmers while it is heard.
 * Tapping a peg picks that string.
 */
export function StringStrip({ targets, naming, confirmed, heard, target, targetKind, sounding, flipped, action, onPick }: StringStripProps) {
  return (
    <div className={cx(styles.strip, flipped && styles.flipped)} role="group" aria-label={`Strings. Choosing one ${action}.`}>
      <span className={styles.nut} aria-hidden="true" />
      {targets.map((t) => {
        const parts = noteParts(t.note, naming);
        const isTarget = t.index === target;
        const isHeard = t.index === heard;
        const isSounding = t.index === sounding;
        const done = !!confirmed[t.index];
        const status = [done ? 'in tune' : '', isHeard ? 'sounding now' : '', isTarget ? (targetKind === 'locked' ? 'locked' : 'selected') : ''].filter(Boolean).join(', ');
        return (
          <div key={t.index} className={styles.column} style={{ '--gauge': t.gauge } as CSSProperties}>
            <button
              type="button"
              className={cx(styles.peg, focusRing, isTarget && styles.pegTarget, isTarget && targetKind === 'guide' && styles.pegGuide, isHeard && styles.pegHeard, done && styles.pegDone)}
              aria-pressed={isTarget}
              aria-label={`String ${t.string}, ${parts.text}${status ? `, ${status}` : ''}`}
              data-string={t.string}
              data-note={t.note}
              data-tuned={done ? 'true' : 'false'}
              onClick={() => onPick(t.index)}
            >
              <span className={styles.pegNote}>
                {parts.letter}
                {parts.accidental && <span className={styles.pegAccidental}>{parts.accidental}</span>}
              </span>
              {done && (
                <span className={styles.tick} aria-hidden="true">
                  <Icon name="Check" size={12} strokeWidth={3.5} />
                </span>
              )}
              {isTarget && targetKind === 'locked' && (
                <span className={styles.lock} aria-hidden="true">
                  <Icon name="Lock" size={11} strokeWidth={2.75} />
                </span>
              )}
              {isSounding && (
                <span className={styles.lock} aria-hidden="true">
                  <Icon name="Volume2" size={11} strokeWidth={2.75} />
                </span>
              )}
            </button>
            <span className={cx(styles.wire, t.wound && styles.wireWound, (isHeard || isSounding) && styles.wireLive)} aria-hidden="true" />
            <span className={styles.number} aria-hidden="true">
              {t.string}
            </span>
          </div>
        );
      })}
    </div>
  );
}
