/**
 * Staff exercises: read a note (buttons or the note keypad) and place a note (tap the staff,
 * drag, or step it up and down; add a sharp, flat or natural). Both draw the same small staff,
 * so reading and writing look alike.
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { IconButton, Text, cx } from '@/ui';
import { resolveFigure } from '../../figures';
import { STAFF_PLACE_RANGE, staffPlaceTarget, staffReadSpec } from '../../grade';
import type { StaffAccidental, StaffPlaceExercise, StaffReadExercise } from '../../types';
import { useStepKeys } from '../keys';
import { nudgePosition, toggleAccidental, type StaffDraft } from '../logic/drafts';
import { GLYPH_WIDTH, glyphPath, ledgerLines, positionAtY, staffPositionName, type GlyphName } from '../logic/staff';
import { AnswerButtons, expectedValue } from './TypeViews';
import { KeyHints } from './parts';
import type { ExerciseViewProps } from './types';
import styles from './Exercises.module.css';

const SPACE = 14;
const STEP = SPACE / 2;
const WIDTH = 240;

/** A note drawn on the staff. */
interface StaffNoteMark {
  position: number;
  accidental: StaffAccidental | null;
  tone: 'ink' | 'accent' | 'ok' | 'bad' | 'ghost';
}

interface StaffSvgProps {
  clef: 'treble' | 'bass';
  guitar: boolean;
  keyName?: string;
  notes: StaffNoteMark[];
  range: readonly [number, number];
  label: string;
  onPointer?: (position: number, phase: 'down' | 'move') => void;
}

const ACC_GLYPH: Record<StaffAccidental, GlyphName> = { sharp: 'sharp', flat: 'flat', natural: 'natural' };

/** The staff drawing: lines, clef, key signature, ledger lines and notes. */
function StaffSvg({ clef, guitar, keyName, notes, range, label, onPointer }: StaffSvgProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  const top = SPACE;
  const maxPos = range[1];
  const height = top * 2 + (range[1] - range[0]) * STEP;
  const y = (p: number): number => top + (maxPos - p) * STEP;
  const key = useMemo(() => (keyName ? resolveFigure({ kind: 'staff', notes: [], key: keyName, clef }).key : null), [keyName, clef]);
  const clefX = 8;
  const clefGlyph: GlyphName = clef === 'bass' ? 'fClef' : 'gClef';
  const clefY = clef === 'bass' ? y(6) : y(2);
  const keyX = clefX + GLYPH_WIDTH[clefGlyph] * SPACE + 8;
  const keyWidth = (key?.positions.length ?? 0) * SPACE * 1.05;
  const noteX = Math.max(keyX + keyWidth + 56, WIDTH * 0.55);

  const toPosition = (e: ReactPointerEvent<SVGElement>): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = height / rect.height;
    return positionAtY((e.clientY - rect.top) * scale, top, maxPos, STEP, range);
  };

  return (
    <svg ref={svgRef} className={styles.staffSvg} viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={label}>
      {[0, 2, 4, 6, 8].map((p) => (
        <line key={p} x1={2} x2={WIDTH - 2} y1={y(p)} y2={y(p)} className={styles.staffLine} />
      ))}
      <path d={glyphPath(clefGlyph, clefX, clefY, SPACE)} className={styles.glyph} />
      {guitar && clef === 'treble' && (
        <text x={clefX + 15} y={y(2) + 3.4 * SPACE} className={styles.clefEight}>
          8
        </text>
      )}
      {key?.positions.map((p, i) => (
        <path key={i} d={glyphPath(key.accidentals[i].includes('b') ? 'flat' : 'sharp', keyX + i * SPACE * 1.05, y(p), SPACE)} className={styles.glyph} />
      ))}
      {notes.map((n, i) => (
        <g key={i} className={styles[`note-${n.tone}`]} data-position={n.position}>
          {ledgerLines(n.position).map((p) => (
            <line key={p} x1={noteX - 6} x2={noteX + GLYPH_WIDTH.wholeNote * SPACE + 6} y1={y(p)} y2={y(p)} className={styles.ledger} />
          ))}
          {n.accidental && <path d={glyphPath(ACC_GLYPH[n.accidental], noteX - SPACE * 1.5, y(n.position), SPACE)} />}
          <path d={glyphPath('wholeNote', noteX, y(n.position), SPACE)} />
        </g>
      ))}
      {onPointer && (
        <rect
          x={0}
          y={0}
          width={WIDTH}
          height={height}
          className={styles.staffHit}
          onPointerDown={(e) => {
            const p = toPosition(e);
            if (p === null) return;
            dragging.current = true;
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            onPointer(p, 'down');
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            const p = toPosition(e);
            if (p !== null) onPointer(p, 'move');
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        />
      )}
    </svg>
  );
}

// ── Read ───────────────────────────────────────────────────────────────────────────────────────

/** The note to read, on the staff (shown beside the prompt, so the buttons can sit by the thumb). */
export function StaffReadStimulus({ exercise }: { exercise: StaffReadExercise }) {
  const resolved = useMemo(() => resolveFigure({ kind: 'staff', notes: [exercise.note], key: exercise.key, clef: exercise.clef }), [exercise.note, exercise.key, exercise.clef]);
  const note = resolved.notes[0];
  const position = note?.position ?? 4;
  const range: [number, number] = [Math.min(-2, position - 2), Math.max(10, position + 2)];
  return (
    <div className={styles.staffBox}>
      <StaffSvg
        clef={resolved.clef}
        guitar={resolved.guitar}
        keyName={exercise.key}
        notes={note ? [{ position, accidental: note.accidental, tone: 'ink' }] : []}
        range={range}
        label={`A note on the ${staffPositionName(position)}${exercise.key ? `, key of ${exercise.key}` : ''}`}
      />
    </div>
  );
}

/** Name the note on the staff: buttons, or the note keypad. */
export function StaffReadView({ exercise, presentation, review, onDraft, hints, naming }: ExerciseViewProps<StaffReadExercise>) {
  const spec = useMemo(() => staffReadSpec(exercise), [exercise]);
  return <AnswerButtons buttons={presentation.buttons} kind="note" type="staff-read" review={review} onDraft={onDraft} hints={hints} naming={naming} expected={expectedValue(spec)} />;
}

// ── Place ──────────────────────────────────────────────────────────────────────────────────────

/** Put the asked note on the staff. */
export function StaffPlaceView({ exercise, review, onDraft, hints }: ExerciseViewProps<StaffPlaceExercise>) {
  const [draft, setDraft] = useState<StaffDraft>(() =>
    review?.answer?.type === 'staff-place' ? { position: review.answer.position, accidental: review.answer.accidental ?? null } : { position: null, accidental: null },
  );
  const target = useMemo(() => staffPlaceTarget(exercise), [exercise]);
  const detail = review?.result.feedback.detail.type === 'staff-place' ? review.result.feedback.detail : null;

  const update = (next: StaffDraft) => {
    setDraft(next);
    onDraft(next.position !== null ? { type: 'staff-place', position: next.position, accidental: next.accidental } : null);
  };
  const nudge = (by: number) => update(nudgePosition(draft, by, STAFF_PLACE_RANGE));
  const accidental = (a: StaffAccidental) => update(toggleAccidental(draft.position === null ? { ...draft, position: 4 } : draft, a));

  useStepKeys(
    {
      arrow: (k) => (k === 'ArrowUp' ? (nudge(1), true) : k === 'ArrowDown' ? (nudge(-1), true) : false),
      char: (k) => {
        if (k === '#' || k === '+') return accidental('sharp'), true;
        if (k === '-' || k === 'b') return accidental('flat'), true;
        if (k === 'n' || k === '=') return accidental('natural'), true;
        return false;
      },
      backspace: () => (draft.position !== null ? (update({ position: null, accidental: null }), true) : false),
    },
    !review,
  );

  const notes: StaffNoteMark[] = [];
  if (detail && target && !review?.result.correct) notes.push({ position: detail.position, accidental: detail.accidental, tone: 'ghost' });
  if (draft.position !== null) notes.push({ position: draft.position, accidental: draft.accidental, tone: review ? (review.result.correct ? 'ok' : 'bad') : 'accent' });

  return (
    <div className={styles.answerArea}>
      <div className={styles.placeRow}>
        <div className={cx(styles.staffBox, styles.staffPlace)} data-native-keys="">
          <StaffSvg
            clef={exercise.clef ?? 'treble'}
            guitar
            keyName={exercise.key}
            notes={notes}
            range={STAFF_PLACE_RANGE}
            label={draft.position === null ? 'Empty staff: tap a line or a space to place the note' : `Your note is on the ${staffPositionName(draft.position)}`}
            onPointer={review ? undefined : (p) => p !== draft.position && update({ ...draft, position: p })}
          />
        </div>
        {!review && (
          <div className={styles.placeControls}>
            <IconButton icon="ChevronUp" label="Move the note up" variant="secondary" size="lg" onClick={() => nudge(1)} />
            <IconButton icon="ChevronDown" label="Move the note down" variant="secondary" size="lg" onClick={() => nudge(-1)} />
          </div>
        )}
      </div>
      <Text variant="caption" tone="muted" aria-live="polite" className={styles.placeStatus}>
        {draft.position === null ? 'Tap a line or a space, or drag the note.' : `On the ${staffPositionName(draft.position)}${draft.accidental ? `, with a ${draft.accidental}` : ''}.`}
      </Text>
      {!review && (
        <div className={styles.accidentalRow} role="group" aria-label="Accidental">
          {(['sharp', 'flat', 'natural'] as const).map((a) => (
            <button key={a} type="button" className={cx(styles.key, styles.keyWide, draft.accidental === a && styles.keyOn)} aria-pressed={draft.accidental === a} onClick={() => accidental(a)} data-accidental={a}>
              {a === 'sharp' ? '♯ Sharp' : a === 'flat' ? '♭ Flat' : '♮ Natural'}
            </button>
          ))}
        </div>
      )}
      <KeyHints show={hints && !review}>Up and down arrows move the note; # sharp, b flat, n natural; Enter checks.</KeyHints>
    </div>
  );
}
