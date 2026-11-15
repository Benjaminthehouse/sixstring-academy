/**
 * Match pairs, order and fill-blanks: answers built from tiles. Tapping is always enough (no
 * dragging); every tile is at least 44 px; number keys pick tiles and Backspace takes one back.
 */
import { useState } from 'react';
import { Icon, Kbd, Text, cx } from '@/ui';
import { orderTiles } from '../../grade';
import type { FillBlanksExercise, MatchPairsExercise, OrderExercise } from '../../types';
import { RichText } from '../RichText';
import { useStepKeys } from '../keys';
import {
  EMPTY_MATCH, emptyFill, fillBackspace, fillPlace, fillTapBlank, fillWords, matchComplete, matchTap, orderBackspace, orderTap, pairOf, type FillDraft, type MatchDraft,
} from '../logic/drafts';
import { digitFor } from '../logic/layout';
import { KeyHints } from './parts';
import type { ExerciseViewProps } from './types';
import styles from './Exercises.module.css';

type TileState = 'idle' | 'picked' | 'placed' | 'right' | 'wrong' | 'used';

function Tile({ state, hint, badge, onClick, disabled, children, ...data }: { state: TileState; hint?: string | null; badge?: string | null; onClick?: () => void; disabled?: boolean; children: React.ReactNode; [key: `data-${string}`]: string | number }) {
  return (
    <button type="button" className={cx(styles.tile, styles[`tile-${state}`])} onClick={onClick} disabled={disabled} aria-pressed={state === 'picked' || state === 'placed'} data-state={state} {...data}>
      {hint && <Kbd className={styles.tileKey}>{hint}</Kbd>}
      {badge && (
        <span className={styles.pairBadge} aria-label={`pair ${badge}`}>
          {badge}
        </span>
      )}
      <span className={styles.tileText}>{children}</span>
      {state === 'right' && <Icon name="Check" size="sm" className={styles.markRight} label="Right" />}
      {state === 'wrong' && <Icon name="X" size="sm" className={styles.markWrong} label="Wrong" />}
    </button>
  );
}

// ── Match pairs ────────────────────────────────────────────────────────────────────────────────

function initialMatch(review: ExerciseViewProps['review']): MatchDraft {
  if (review?.answer?.type === 'match-pairs') return { pairs: review.answer.pairs.map((p) => [p[0], p[1]]), left: null, right: null };
  return EMPTY_MATCH;
}

/** Pair each left item with a right one: tap one, then its partner. Tap a pair to undo it. */
export function MatchView({ exercise, presentation, review, onDraft, hints }: ExerciseViewProps<MatchPairsExercise>) {
  const n = exercise.pairs.length;
  const left = presentation.left ?? exercise.pairs.map((_p, i) => i);
  const right = presentation.right ?? exercise.pairs.map((_p, i) => i);
  const [draft, setDraft] = useState<MatchDraft>(() => initialMatch(review));
  const detail = review?.result.feedback.detail.type === 'match-pairs' ? review.result.feedback.detail : null;

  const tap = (side: 'left' | 'right', index: number) => {
    if (review) return;
    const next = matchTap(draft, side, index);
    setDraft(next);
    onDraft(matchComplete(next, n) ? { type: 'match-pairs', pairs: next.pairs } : null);
  };

  useStepKeys(
    {
      digit: (p) => {
        if (p < n) tap('left', left[p]);
        else if (p < 2 * n) tap('right', right[p - n]);
        else return false;
        return true;
      },
      backspace: () => {
        if (draft.pairs.length === 0) return false;
        const last = draft.pairs[draft.pairs.length - 1];
        const next = { pairs: draft.pairs.slice(0, -1), left: null, right: null };
        setDraft(next);
        onDraft(null);
        return last !== undefined;
      },
    },
    !review,
  );

  const stateOf = (side: 'left' | 'right', index: number): { state: TileState; badge: string | null } => {
    const p = pairOf(draft, side, index);
    if (detail && p >= 0) {
      const pair = draft.pairs[p];
      const ok = detail.right.some((r) => r[0] === pair[0] && r[1] === pair[1]);
      return { state: ok ? 'right' : 'wrong', badge: String(p + 1) };
    }
    if (p >= 0) return { state: 'placed', badge: String(p + 1) };
    if (draft[side] === index) return { state: 'picked', badge: null };
    return { state: 'idle', badge: null };
  };

  return (
    <div className={styles.answerArea}>
      <div className={styles.matchGrid}>
        <div className={styles.matchColumn} role="group" aria-label="Left column">
          {left.map((index, position) => {
            const s = stateOf('left', index);
            return (
              <Tile key={index} state={s.state} badge={s.badge} hint={hints && !review ? digitFor(position) : null} onClick={() => tap('left', index)} disabled={!!review} data-left={index}>
                <RichText text={exercise.pairs[index].left} />
              </Tile>
            );
          })}
        </div>
        <div className={styles.matchColumn} role="group" aria-label="Right column">
          {right.map((index, position) => {
            const s = stateOf('right', index);
            return (
              <Tile key={index} state={s.state} badge={s.badge} hint={hints && !review ? digitFor(position + n) : null} onClick={() => tap('right', index)} disabled={!!review} data-right={index}>
                <RichText text={exercise.pairs[index].right} />
              </Tile>
            );
          })}
        </div>
      </div>
      {!review && (
        <Text variant="caption" tone="muted" aria-live="polite">
          {draft.pairs.length === n ? 'All matched. Check when you are ready.' : `${draft.pairs.length} of ${n} matched. Tap one item, then its partner.`}
        </Text>
      )}
      <KeyHints show={hints && !review}>Numbers pick items, Backspace undoes the last pair.</KeyHints>
    </div>
  );
}

// ── Order ──────────────────────────────────────────────────────────────────────────────────────

/** Put tiles in order: tap them in sequence; tap a placed tile to send it back. */
export function OrderView({ exercise, presentation, review, onDraft, hints }: ExerciseViewProps<OrderExercise>) {
  const all = orderTiles(exercise);
  const n = exercise.tiles.length;
  const bank = presentation.tiles ?? all.map((_t, i) => i);
  const [order, setOrder] = useState<number[]>(() => (review?.answer?.type === 'order' ? [...review.answer.order] : []));
  const detail = review?.result.feedback.detail.type === 'order' ? review.result.feedback.detail : null;

  const update = (next: number[]) => {
    setOrder(next);
    onDraft(next.length === n ? { type: 'order', order: next } : null);
  };
  const tap = (tile: number) => {
    if (review) return;
    if (!order.includes(tile) && order.length >= n) return;
    update(orderTap(order, tile));
  };

  useStepKeys(
    {
      digit: (p) => (p < bank.length ? (tap(bank[p]), true) : false),
      backspace: () => (order.length > 0 ? (update(orderBackspace(order)), true) : false),
    },
    !review,
  );

  return (
    <div className={styles.answerArea}>
      <ol className={styles.orderLine} aria-label="Your order">
        {Array.from({ length: n }, (_u, slot) => {
          const tile = order[slot];
          if (tile === undefined) {
            return (
              <li key={`empty${slot}`} className={styles.slot} aria-label={`Place ${slot + 1}, empty`}>
                <span className={styles.slotNumber}>{slot + 1}</span>
              </li>
            );
          }
          const state: TileState = detail ? (detail.wrongAt.includes(slot) ? 'wrong' : 'right') : 'placed';
          return (
            <li key={`t${tile}`} className={styles.slotFilled}>
              <Tile state={state} onClick={() => tap(tile)} disabled={!!review} data-placed={tile}>
                <RichText text={all[tile]} />
              </Tile>
            </li>
          );
        })}
      </ol>
      {!review && (
        <div className={styles.bank} role="group" aria-label="Tiles to place">
          {bank.map((tile, position) => {
            const used = order.includes(tile);
            return (
              <Tile key={tile} state={used ? 'used' : 'idle'} hint={hints ? digitFor(position) : null} onClick={() => tap(tile)} data-tile={tile}>
                <RichText text={all[tile]} />
              </Tile>
            );
          })}
        </div>
      )}
      {!review && exercise.distractors && exercise.distractors.length > 0 && (
        <Text variant="caption" tone="muted">
          {exercise.distractors.length === 1 ? 'One tile does not belong.' : `${exercise.distractors.length} tiles do not belong.`}
        </Text>
      )}
      <KeyHints show={hints && !review}>Numbers place tiles, Backspace takes the last one back.</KeyHints>
    </div>
  );
}

// ── Fill blanks ────────────────────────────────────────────────────────────────────────────────

function initialFill(exercise: FillBlanksExercise, bank: readonly string[], review: ExerciseViewProps['review']): FillDraft {
  const draft = emptyFill(exercise.blanks.length);
  if (review?.answer?.type !== 'fill-blanks') return draft;
  const used = new Set<number>();
  const blanks = review.answer.blanks.map((word) => {
    const i = bank.findIndex((w, k) => w === word && !used.has(k));
    if (i < 0) return null;
    used.add(i);
    return i;
  });
  return { blanks, focus: 0 };
}

/** Fill the gaps of a text from a word bank: tap a word for the highlighted gap, tap a gap to empty it. */
export function FillView({ exercise, presentation, review, onDraft, hints, uid }: ExerciseViewProps<FillBlanksExercise>) {
  const bank = presentation.bank ?? [];
  const [draft, setDraft] = useState<FillDraft>(() => initialFill(exercise, bank, review));
  const detail = review?.result.feedback.detail.type === 'fill-blanks' ? review.result.feedback.detail : null;

  const update = (next: FillDraft) => {
    setDraft(next);
    const words = fillWords(next, bank);
    onDraft(words.every((w) => w !== null) ? { type: 'fill-blanks', blanks: words } : null);
  };

  useStepKeys(
    {
      digit: (p) => (p < bank.length ? (update(fillPlace(draft, p)), true) : false),
      backspace: () => (draft.blanks.some((b) => b !== null) ? (update(fillBackspace(draft)), true) : false),
    },
    !review,
  );

  const blank = (index: number) => {
    const word = draft.blanks[index];
    const state = detail ? (detail.ok[index] ? 'right' : 'wrong') : draft.focus === index && !review ? 'focus' : word === null ? 'empty' : 'filled';
    return (
      <button
        type="button"
        id={`${uid}-blank-${index}`}
        className={cx(styles.blankSlot, styles[`blank-${state}`])}
        onClick={() => !review && update(fillTapBlank(draft, index))}
        disabled={!!review}
        aria-label={word === null ? `Blank ${index + 1}, empty` : `Blank ${index + 1}: tap to empty it`}
        data-blank={index}
      >
        {word === null ? <span className={styles.blankEmpty}>{index + 1}</span> : <RichText text={bank[word]} terms={false} />}
        {state === 'right' && <Icon name="Check" size="xs" className={styles.markRight} label="Right" />}
        {state === 'wrong' && <Icon name="X" size="xs" className={styles.markWrong} label="Wrong" />}
      </button>
    );
  };

  return (
    <div className={styles.answerArea}>
      <div className={styles.fillText}>
        <RichText text={exercise.text} renderBlank={blank} as="p" />
      </div>
      {!review && (
        <div className={styles.bank} role="group" aria-label="Words to place">
          {bank.map((word, position) => {
            const used = draft.blanks.includes(position);
            return (
              <Tile key={`${word}-${position}`} state={used ? 'used' : 'idle'} hint={hints ? digitFor(position) : null} onClick={() => update(fillPlace(draft, position))} data-bank={position} data-word={word}>
                <RichText text={word} terms={false} />
              </Tile>
            );
          })}
        </div>
      )}
      <KeyHints show={hints && !review}>Numbers fill the highlighted gap, Backspace empties the last one.</KeyHints>
    </div>
  );
}
