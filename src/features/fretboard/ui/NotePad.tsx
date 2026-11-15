import type { CSSProperties } from 'react';
import { Icon, cx } from '@/ui';
import { ACCIDENTAL_PCS, NATURAL_PCS, namesOf, spell } from '../core/notes';
import type { Spelling } from '../core/types';
import styles from './Trainer.module.css';

/** Props of {@link NotePad}. */
export interface NotePadProps {
  /** Offer the sharps and flats too. */
  accidentals: boolean;
  spelling: Spelling;
  fmt: (ascii: string) => string;
  onAnswer: (pc: number) => void;
  /** After an answer: the right note and the one chosen. */
  result: { answer: number; chosen: number | null } | null;
  disabled?: boolean;
  /** Show the keyboard letter on each key (desktop). */
  keyHints?: boolean;
  german?: boolean;
}

/** Where a black key sits: between two white keys (index of the white key it follows). */
const AFTER: Record<number, number> = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

/**
 * The answer pad: the seven natural notes in a row, the sharps and flats above them in the gaps
 * where they live, like a piano. The missing key between E and F and between B and C is part of the
 * lesson: no note lives there.
 */
export function NotePad({ accidentals, spelling, fmt, onAnswer, result, disabled, keyHints, german }: NotePadProps) {
  const keyFor = (pc: number): { key: string; label: string } => {
    const natural = NATURAL_PCS.includes(pc);
    if (natural) {
      const letter = spell(pc, 'sharps');
      return { key: german && letter === 'B' ? 'H' : letter, label: letter };
    }
    const base = spelling === 'flats' ? spell(pc, 'flats')[0] : spell(pc, 'sharps')[0];
    return { key: `⇧${german && base === 'B' ? 'B' : base}`, label: spell(pc, spelling === 'flats' ? 'flats' : 'sharps') };
  };
  const state = (pc: number) => (!result ? undefined : pc === result.answer ? 'answer' : pc === result.chosen ? 'chosen' : 'dim');
  const button = (pc: number, black: boolean) => {
    const k = keyFor(pc);
    const names = namesOf(pc);
    const s = state(pc);
    const both = black && spelling === 'both';
    const main = both ? names[0] : black ? spell(pc, spelling) : names[0];
    const spoken = black ? names.map((n) => fmt(n)).join(' or ') : fmt(main);
    return (
      <button
        key={pc}
        type="button"
        className={cx(styles.key, black ? styles.keyBlack : styles.keyWhite, s === 'answer' && styles.keyAnswer, s === 'chosen' && styles.keyChosen, s === 'dim' && styles.keyDim)}
        style={black ? ({ gridColumn: `${AFTER[pc] * 2 + 2} / span 2` } as CSSProperties) : undefined}
        onClick={() => onAnswer(pc)}
        disabled={disabled || !!result}
        aria-keyshortcuts={k.key.startsWith('⇧') ? `Shift+${k.key.slice(1)}` : k.key}
        aria-label={`${spoken}${s === 'answer' ? ', the right answer' : s === 'chosen' ? ', your answer, not right' : ''}`}
        data-fb-key={pc}
      >
        <span className={styles.keyLabel}>{fmt(main)}</span>
        {both && <span className={styles.keyAlt}>{fmt(names[1])}</span>}
        {keyHints && (
          <span className={styles.keyHint} aria-hidden="true">
            {k.key}
          </span>
        )}
        {(s === 'answer' || s === 'chosen') && (
          <span className={styles.keyMark} aria-hidden="true">
            <Icon name={s === 'answer' ? 'Check' : 'X'} size={14} strokeWidth={3} />
          </span>
        )}
      </button>
    );
  };
  return (
    <div className={cx(styles.pad, accidentals && styles.padTwoRows)} role="group" aria-label="Note names" data-fb-pad>
      {accidentals && <div className={styles.padBlack}>{ACCIDENTAL_PCS.map((pc) => button(pc, true))}</div>}
      <div className={styles.padWhite}>{NATURAL_PCS.map((pc) => button(pc, false))}</div>
    </div>
  );
}
