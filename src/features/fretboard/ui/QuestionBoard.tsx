import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Fretboard, type FretboardSize, type FretCell, type FretMarker, type FretBox } from '@/ui/music';
import { cx, useElementSize } from '@/ui';
import { anchorFor, pcAt, posKey } from '../core/neck';
import { remaining } from '../core/grade';
import { spell } from '../core/notes';
import type { Pos, Question, Scope } from '../core/types';
import type { AttemptView, Phase } from './useRound';
import type { Trainer } from './useTrainer';
import styles from './Trainer.module.css';

/** Props of {@link QuestionBoard}. */
export interface QuestionBoardProps {
  question: Question;
  attempt: AttemptView;
  phase: Phase;
  scope: Scope;
  trainer: Trainer;
  /** Taps on the neck; when absent the board is a picture (name questions in a naming round). */
  onTap?: (p: Pos) => void;
  size?: FretboardSize;
}

/** The fret range a board shows for a scope: its frets, with the nut when it starts at the open strings. */
export function boardFrets(scope: Scope): [number, number] {
  return [scope.frets[0], Math.max(scope.frets[1], scope.frets[0] + 3)];
}

/**
 * The neck for one question: what is asked (a lit dot, a highlighted string, the note to carry an
 * octave), what the learner did (found, missed), and after the answer, the explanation drawn in.
 */
export function QuestionBoard({ question: q, attempt: a, phase, scope, trainer, onTap, size }: QuestionBoardProps) {
  const { ctx } = trainer;
  const done = phase === 'answered' || phase === 'summary';
  const nameOf = useCallback((p: Pos) => spell(pcAt(ctx, p), ctx.spelling === 'flats' ? 'flats' : 'sharps'), [ctx]);

  const markers = useMemo<FretMarker[]>(() => {
    const out = new Map<string, FretMarker>();
    const put = (m: FretMarker) => out.set(posKey(m), m);
    const named = (p: Pos, m: Partial<FretMarker>): FretMarker => ({ ...p, note: pcAt(ctx, p) === q.pc ? q.name : nameOf(p), noteLabel: true, ...m });
    switch (q.kind) {
      case 'name': {
        if (!done) {
          put({ ...q.pos, label: '?', color: 'accent', state: 'target', description: 'the note to name' });
          break;
        }
        if (a.revealed) {
          const anchor = anchorFor(ctx, q.pos, trainer.maxFret);
          if (anchor) put({ string: q.pos.string, fret: anchor.fret, note: nameOf({ string: q.pos.string, fret: anchor.fret }), noteLabel: true, color: 'neutral', shape: 'ring', description: 'landmark' });
          if (a.givenAt) put({ ...a.givenAt, note: nameOf(a.givenAt), noteLabel: true, color: 'bad', state: 'miss', description: 'your answer is here' });
          put({ ...q.pos, note: q.name, noteLabel: true, color: 'info', root: true, description: 'the note asked' });
        } else put({ ...q.pos, note: q.name, noteLabel: true, color: 'ok', state: 'hit' });
        break;
      }
      case 'octave': {
        put({ ...q.from, note: q.name, noteLabel: true, color: 'accent', root: true, description: 'carry this note an octave up' });
        if (done) {
          if (a.tapped && a.right) put(named(a.tapped, { color: 'ok', state: 'hit' }));
          else {
            if (a.tapped) put(named(a.tapped, { color: 'bad', state: 'miss' }));
            put({ ...q.pos, note: q.name, noteLabel: true, color: 'info', state: 'target' });
          }
        }
        break;
      }
      case 'find':
      case 'find-any':
      case 'play': {
        if (!done) break;
        if (a.tapped && a.right) put(named(a.tapped, { color: 'ok', state: 'hit' }));
        else {
          if (a.tapped && q.kind !== 'play') put(named(a.tapped, { color: 'bad', state: 'miss' }));
          const targets = q.kind === 'play' ? [q.pos] : q.targets;
          for (const t of targets) put({ ...t, note: q.name, noteLabel: true, color: 'info', state: 'target' });
          if (q.kind === 'play' && a.right !== false) put({ ...q.pos, note: q.name, noteLabel: true, color: 'ok', state: 'hit' });
        }
        break;
      }
      case 'every': {
        for (const w of a.wrongTaps) put(named(w, { color: 'bad', state: 'miss' }));
        for (const f of a.found) put({ ...f, note: q.name, noteLabel: true, color: 'ok', state: 'hit' });
        if (done && a.revealed) for (const r of remaining(q, a.found)) put({ ...r, note: q.name, noteLabel: true, color: 'info', state: 'target' });
        break;
      }
    }
    return [...out.values()];
  }, [q, a, done, ctx, nameOf, trainer.maxFret]);

  const frets = boardFrets(scope);
  const box = useMemo<FretBox | null>(() => {
    if (q.kind === 'find' || q.kind === 'play' || q.kind === 'octave') return { from: Math.max(1, frets[0]), to: frets[1], strings: [q.string, q.string] };
    return null;
  }, [q, frets]);

  const path = useMemo(() => (q.kind === 'octave' && done ? [q.from, a.right && a.tapped ? a.tapped : q.pos] : null), [q, a, done]);

  // On a narrow screen the neck scrolls: bring the dot that matters into view.
  const wrap = useRef<HTMLDivElement | null>(null);
  const [sizeRef, { width }] = useElementSize<HTMLDivElement>();
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      wrap.current = el;
      sizeRef(el);
    },
    [sizeRef],
  );
  // After an answer, show the right place nearest to where the learner tapped (both stay in view).
  let focusPos: Pos | null = null;
  if (q.kind === 'name') focusPos = q.pos;
  else if (q.kind === 'octave' && !done) focusPos = q.from;
  else if (done) {
    const targets = q.kind === 'play' ? [q.pos] : q.targets.length ? q.targets : 'pos' in q ? [q.pos] : [];
    const near = a.tapped ?? a.wrongTaps[a.wrongTaps.length - 1] ?? null;
    focusPos = targets.reduce<Pos | null>((best, t) => (!best || (near && Math.abs(t.fret - near.fret) < Math.abs(best.fret - near.fret)) ? t : best), null);
    if (focusPos && near) focusPos = { string: focusPos.string, fret: Math.round((focusPos.fret + near.fret) / 2) };
  }
  useEffect(() => {
    if (!focusPos || !wrap.current || !onTap) return;
    const label = focusPos.fret === 0 ? `string ${focusPos.string}, open` : `string ${focusPos.string}, fret ${focusPos.fret}`;
    const cell = wrap.current.querySelector<HTMLElement>(`button[aria-label^="${label}"]`);
    const scroller = cell?.closest<HTMLElement>('[data-orientation] > div');
    if (!cell || !scroller || scroller.scrollWidth <= scroller.clientWidth + 2) return;
    const left = cell.offsetLeft + cell.offsetWidth / 2 - scroller.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [focusPos?.string, focusPos?.fret, onTap, width]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCell = useCallback((c: FretCell) => onTap?.({ string: c.string, fret: c.fret }), [onTap]);
  const label = q.kind === 'name' ? 'Fretboard with one note lit up' : q.kind === 'every' ? `Fretboard: tap every ${trainer.fmt(q.name)}` : 'Fretboard';

  return (
    <div ref={setRefs} className={cx(styles.board, onTap && styles.boardTap)} data-fb-board data-kind={q.kind}>
      <Fretboard
        tuning={trainer.tuning}
        frets={frets}
        markers={markers}
        box={box}
        path={path}
        size={size}
        fretNumbers="inlays"
        cellLabels="position"
        noteContext={{ prefer: ctx.spelling === 'flats' ? 'flats' : 'sharps' }}
        onCellClick={onTap ? onCell : undefined}
        maxFretWidth={onTap || size === 'xl' ? 132 : undefined}
        aria-label={label}
      />
    </div>
  );
}
