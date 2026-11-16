import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Button, Icon } from '@/ui';
import { Fretboard, type FretMarker } from '@/ui/music';
import type { SequenceQuestion } from '../core/types';
import styles from './Ear.module.css';

/** Sounding pitch of a fret in standard tuning (string 1 = high E). */
const OPEN = [64, 59, 55, 50, 45, 40];
const pitchAt = (string: number, fret: number): number => OPEN[string - 1] + fret;

/** The lowest-fret place of a pitch inside the area (for notes the learner did not tap: the given one, a correction). */
export function placeOf(midi: number, frets: readonly [number, number]): { string: number; fret: number } | null {
  let best: { string: number; fret: number } | null = null;
  for (let string = 6; string >= 1; string--) {
    const fret = midi - OPEN[string - 1];
    if (fret < frets[0] || fret > frets[1]) continue;
    if (!best || fret < best.fret) best = { string, fret };
  }
  return best;
}

/** Props of {@link NeckPad}. */
export interface NeckPadProps {
  question: SequenceQuestion;
  /** Key ids entered so far (the given first note included). */
  entered: readonly string[];
  /** Per note, after checking. */
  marks: readonly boolean[] | null;
  onTap: (id: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  disabled: boolean;
  mic?: ReactNode;
}

/**
 * Melodic dictation answered on a guitar neck: every cell plays its note and fills the next slot.
 * The given first note is shown; each tap leaves a numbered dot where it was made; after checking,
 * the dots are marked right or wrong and the notes that were missed appear where to find them.
 */
export function NeckPad({ question: q, entered, marks, onTap, onUndo, canUndo, disabled, mic }: NeckPadProps) {
  const frets = q.neck?.frets ?? [0, 5];
  // Where each entered note was tapped (the given note at its first place in the area).
  const places = useRef<Array<{ string: number; fret: number } | null>>([]);
  useEffect(() => {
    places.current = places.current.slice(0, entered.length);
  }, [entered.length]);

  const byMidi = useMemo(() => new Map(q.keys.map((k) => [k.midi, k])), [q.keys]);
  const markers = useMemo<FretMarker[]>(() => {
    const out: FretMarker[] = [];
    entered.forEach((id, i) => {
      const key = q.keys.find((k) => k.id === id);
      const place = places.current[i] ?? (key ? placeOf(key.midi, frets) : null);
      if (!place) return;
      const given = i < q.given;
      const mark = marks ? marks[i] : null;
      out.push({
        ...place,
        id: `n${i}`,
        label: String(i + 1),
        color: given ? 'deg-1' : 'accent',
        root: given,
        state: given || mark === null ? 'normal' : mark ? 'hit' : 'miss',
        description: `note ${i + 1}${given ? ', given' : ''}`,
      });
    });
    if (marks) {
      q.target.forEach((id, i) => {
        if (marks[i]) return;
        const key = q.keys.find((k) => k.id === id);
        const place = key ? placeOf(key.midi, frets) : null;
        if (place) out.push({ ...place, id: `fix${i}`, label: String(i + 1), color: 'ok', shape: 'ring', state: 'target', description: `note ${i + 1} is here` });
      });
    }
    return out;
    // `places` is a ref written before `entered` changes, so `entered` is the right dependency.
  }, [entered, marks, q.keys, q.target, q.given, frets]);

  return (
    <div className={styles.rowWrap} data-ear-neck>
      <div className={styles.neck}>
        <Fretboard
          frets={frets}
          cellLabels="position"
          markers={markers}
          onCellClick={(cell) => {
            if (disabled) return;
            const key = byMidi.get(Number.isFinite(cell.midi) ? cell.midi : pitchAt(cell.string, cell.fret));
            if (!key) return;
            places.current[entered.length] = { string: cell.string, fret: cell.fret };
            onTap(key.id);
          }}
        />
      </div>
      <div className={styles.rowTools}>
        <Button size="sm" variant="ghost" iconLeft="Undo2" onClick={onUndo} disabled={!canUndo || disabled} aria-keyshortcuts="Backspace">
          Undo
        </Button>
        {mic}
        <span className={styles.muted} aria-hidden="true">
          <Icon name="Music" size="xs" /> {q.target.length} notes
        </span>
      </div>
    </div>
  );
}
