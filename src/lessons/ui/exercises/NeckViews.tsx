/**
 * Exercises on the neck: find notes (tap frets), name a marked position, build a chord shape or
 * pick its missing note. The board is the shared Fretboard; each cell is a real button, arrows
 * move between cells, Space marks one and Enter checks.
 */
import { useCallback, useMemo, useState } from 'react';
import { Text } from '@/ui';
import { ChordDiagram, Fretboard, NoteBadge, type FretCell, type FretMarker } from '@/ui/music';
import { resolveFigure, voicingFor } from '../../figures';
import { fretboardNameSpec, missingChordNote, referenceFrets } from '../../grade';
import type { ChordBuildExercise, FretboardFindExercise, FretboardNameExercise, NeckPosition } from '../../types';
import { chordTap, findTap } from '../logic/drafts';
import { dotColor } from '../figures/colors';
import { ScrollHint } from '../figures/ScrollHint';
import { useShortViewport } from '../useShortViewport';
import { AnswerButtons, expectedValue } from './TypeViews';
import { KeyHints } from './parts';
import type { ExerciseViewProps } from './types';
import styles from './Exercises.module.css';

const key = (p: NeckPosition): string => `${p.string}:${p.fret}`;

/** Markers for dots that are already on the neck (the root of an interval question ...). */
function shownMarkers(exercise: FretboardFindExercise): FretMarker[] {
  if (!exercise.shown || exercise.shown.length === 0) return [];
  const resolved = resolveFigure({ kind: 'fretboard', dots: exercise.shown, frets: exercise.frets, tuning: exercise.tuning, capo: exercise.capo });
  return resolved.dots.map((d) => ({
    string: d.string,
    fret: d.fret,
    label: d.label || (d.role === 'root' ? 'R' : ''),
    note: d.note,
    color: dotColor(d.role, null),
    root: d.role === 'root',
    id: `shown-${key(d)}`,
  }));
}

// ── Find ───────────────────────────────────────────────────────────────────────────────────────

/** "string 5", "strings 6 and 5", "strings 6, 5 and 4". */
function stringsText(strings: readonly number[]): string {
  const list = [...strings].sort((a, b) => b - a);
  return list.length === 1 ? `string ${list[0]}` : `strings ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** Tap the asked notes on the neck. */
export function FretFindView({ exercise, review, onDraft, hints }: ExerciseViewProps<FretboardFindExercise>) {
  const [positions, setPositions] = useState<NeckPosition[]>(() => (review?.answer?.type === 'fretboard-find' ? review.answer.positions : []));
  const [offString, setOffString] = useState(false);
  const detail = review?.result.feedback.detail.type === 'fretboard-find' ? review.result.feedback.detail : null;
  const shown = useMemo(() => shownMarkers(exercise), [exercise]);
  // A phone held sideways has little height: a smaller neck fits without scrolling.
  const short = useShortViewport();
  const allowed = exercise.strings && exercise.strings.length > 0 ? exercise.strings : null;

  const onCell = useCallback(
    (cell: FretCell) => {
      if (review) return;
      // Only the strings of the question count: a tap elsewhere is not an answer.
      if (allowed && !allowed.includes(cell.string)) {
        setOffString(true);
        return;
      }
      setOffString(false);
      setPositions((prev) => {
        const next = findTap(prev, cell, exercise.mode);
        onDraft(next.length > 0 ? { type: 'fretboard-find', positions: next } : null);
        return next;
      });
    },
    [review, exercise.mode, onDraft, allowed],
  );

  const markers = useMemo<FretMarker[]>(() => {
    if (detail) {
      const hit = new Set(detail.hits.map(key));
      const out: FretMarker[] = [...shown];
      for (const t of detail.targets) {
        out.push(hit.has(key(t)) ? { string: t.string, fret: t.fret, note: t.note, noteLabel: true, label: t.note, color: 'ok', state: 'hit' } : { string: t.string, fret: t.fret, note: t.note, noteLabel: true, label: t.note, color: 'ok', shape: 'ring', state: 'target' });
      }
      for (const w of detail.wrong) out.push({ string: w.string, fret: w.fret, note: w.note, noteLabel: true, label: w.note, color: 'bad', state: 'miss' });
      return out;
    }
    return [...shown, ...positions.map<FretMarker>((p) => ({ string: p.string, fret: p.fret, color: 'accent', label: '', shape: 'circle', id: `pick-${key(p)}`, description: 'marked' }))];
  }, [detail, shown, positions]);

  return (
    <div className={styles.answerArea}>
      <ScrollHint className={styles.neck}>
        <div data-native-keys="">
          <Fretboard
            frets={exercise.frets}
            tuning={exercise.tuning}
            capo={exercise.capo}
            markers={markers}
            onCellClick={review ? undefined : onCell}
            cellLabels="position"
            size={short ? 'md' : 'xl'}
            fretNumbers="all"
            // The strings that count are shaded; the others are drawn but take no answer.
            box={
              allowed
                ? {
                    // Frets on the wood (the box ignores the capo), strings as a span.
                    from: Math.max(1, exercise.frets[0] + (exercise.capo ?? 0)),
                    to: Math.max(1, exercise.frets[1] + (exercise.capo ?? 0)),
                    strings: [Math.min(...allowed), Math.max(...allowed)] as const,
                    label: stringsText(allowed),
                  }
                : undefined
            }
            aria-label={allowed ? `Fretboard: tap the frets on ${stringsText(allowed)}` : 'Fretboard: tap the frets'}
          />
        </div>
      </ScrollHint>
      {!review && (
        <Text variant="caption" tone="muted" aria-live="polite">
          {offString && allowed
            ? `Only ${stringsText(allowed)} ${allowed.length === 1 ? 'counts' : 'count'} here: tap there.`
            : exercise.mode === 'all'
              ? `Tap every one${allowed ? ` on ${stringsText(allowed)}` : ''}. ${positions.length} marked; tap a mark again to remove it.`
              : positions.length
                ? 'Marked. Tap another fret to change it.'
                : allowed
                  ? `Tap one fret on ${stringsText(allowed)}.`
                  : 'Tap one fret.'}
        </Text>
      )}
      <KeyHints show={hints && !review}>Tab into the neck, arrows move, Space marks a fret, Enter checks.</KeyHints>
    </div>
  );
}

// ── Name ───────────────────────────────────────────────────────────────────────────────────────

/** A position (and a root) is marked: name its note, interval or degree. */
export function FretNameView({ exercise, presentation, review, onDraft, hints, naming }: ExerciseViewProps<FretboardNameExercise>) {
  const spec = useMemo(() => fretboardNameSpec(exercise), [exercise]);
  const markers = useMemo<FretMarker[]>(() => {
    const out: FretMarker[] = [];
    if (exercise.root) out.push({ ...exercise.root, label: 'R', color: 'deg-1', root: true, description: 'root' });
    out.push({ ...exercise.position, label: '?', color: 'accent', state: review ? 'normal' : 'target', description: 'the note to name' });
    return out;
  }, [exercise.root, exercise.position, review]);
  const lo = Math.min(exercise.position.fret, exercise.root?.fret ?? exercise.position.fret);
  const hi = Math.max(exercise.position.fret, exercise.root?.fret ?? exercise.position.fret);
  const from = lo <= 3 ? 0 : lo - 1;
  const frets: [number, number] = [from, Math.max(from + 4, hi + 1)];
  return (
    <div className={styles.answerArea}>
      <ScrollHint className={styles.neck}>
        <Fretboard frets={frets} tuning={exercise.tuning} capo={exercise.capo} markers={markers} fretNumbers="all" size="lg" aria-label={`Fretboard: string ${exercise.position.string}, fret ${exercise.position.fret} is marked${exercise.root ? `; the root is on string ${exercise.root.string}, fret ${exercise.root.fret}` : ''}`} />
      </ScrollHint>
      <AnswerButtons
        buttons={presentation.buttons}
        kind={exercise.ask === 'note' ? 'note' : exercise.ask}
        type="fretboard-name"
        review={review}
        onDraft={onDraft}
        hints={hints}
        naming={naming}
        expected={expectedValue(spec)}
      />
    </div>
  );
}

// ── Chord build ────────────────────────────────────────────────────────────────────────────────

/** Build a chord shape on a chord-box view of the neck, or pick the note a chord is missing. */
export function ChordBuildView(props: ExerciseViewProps<ChordBuildExercise>) {
  return props.exercise.task === 'missing-note' ? <MissingNote {...props} /> : <Fingers {...props} />;
}

function MissingNote({ exercise, presentation, review, onDraft, hints, naming }: ExerciseViewProps<ChordBuildExercise>) {
  const expected = useMemo(() => missingChordNote(exercise), [exercise]);
  return (
    <div className={styles.answerArea}>
      <div className={styles.givenNotes} aria-label="The notes you have">
        {(exercise.given ?? []).map((n) => (
          <NoteBadge key={n} note={n} size="lg" />
        ))}
        <span className={styles.missingSlot} aria-label="the missing note">
          {review ? <NoteBadge note={expected ?? '?'} size="lg" /> : '?'}
        </span>
      </div>
      <AnswerButtons buttons={presentation.buttons} kind="note" type="chord-build" review={review} onDraft={onDraft} hints={hints} naming={naming} expected={expected} />
    </div>
  );
}

function Fingers({ exercise, review, onDraft, hints }: ExerciseViewProps<ChordBuildExercise>) {
  const reference = useMemo(() => referenceFrets(exercise), [exercise]);
  // The right box, drawn with its capo when it has one.
  const referenceVoicing = useMemo(() => (reference ? voicingFor(exercise.chord, reference, { tuning: exercise.tuning, capo: exercise.capo }) : null), [reference, exercise]);
  const strings = reference?.length ?? 6;
  const [frets, setFrets] = useState<Array<number | null>>(() =>
    review?.answer?.type === 'chord-build' && review.answer.frets ? [...review.answer.frets] : Array.from({ length: strings }, () => 0),
  );
  const detail = review?.result.feedback.detail;
  const wrong = new Set(detail?.type === 'chord-build' && detail.task === 'fingers' ? detail.wrongStrings : []);
  const top = Math.max(4, ...(reference ?? []).filter((f): f is number => f !== null), ...frets.filter((f): f is number => f !== null));

  const onCell = useCallback(
    (cell: FretCell) => {
      if (review) return;
      setFrets((prev) => {
        const next = chordTap(prev, cell.string, cell.fret);
        onDraft(next.some((f) => f !== null) ? { type: 'chord-build', frets: next } : null);
        return next;
      });
    },
    [review, onDraft],
  );

  const markers: FretMarker[] = [];
  const open: number[] = [];
  const muted: number[] = [];
  frets.forEach((f, i) => {
    const string = strings - i;
    if (f === null) muted.push(string);
    else if (f === 0) open.push(string);
    else markers.push({ string, fret: f, color: review ? (wrong.has(string) ? 'bad' : 'ok') : 'accent', state: review ? (wrong.has(string) ? 'miss' : 'hit') : 'normal', label: '' });
  });

  return (
    <div className={styles.answerArea}>
      <div className={styles.chordBuild}>
        <div className={styles.chordBoard} data-native-keys="">
          <Fretboard
            orientation="vertical"
            frets={[0, top]}
            tuning={exercise.tuning}
            capo={exercise.capo}
            markers={markers}
            open={open}
            muted={muted}
            onCellClick={review ? undefined : onCell}
            cellLabels="position"
            size="xl"
            fretNumbers="all"
            aria-label={`Chord grid for ${exercise.chord}`}
          />
        </div>
        <div className={styles.chordSide}>
          <Text variant="caption" tone="muted">
            Tap a fret to put a finger there; tap it again to lift it. Tap above the nut to switch a string between open (o) and not played (×).
          </Text>
          {review && !review.result.correct && reference && (
            <div className={styles.reference} data-reference-box="">
              <Text variant="label">{exercise.accept === 'this-shape' ? 'The shape asked for' : 'One way to play it'}</Text>
              {referenceVoicing ? <ChordDiagram voicing={referenceVoicing} chord={exercise.chord} size="sm" /> : <ChordDiagram frets={reference} chord={exercise.chord} size="sm" />}
            </div>
          )}
        </div>
      </div>
      <KeyHints show={hints && !review}>Tab into the grid, arrows move, Space places a finger, Enter checks.</KeyHints>
    </div>
  );
}
