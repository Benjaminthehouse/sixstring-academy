/**
 * The fretboard under the score: the notes to play now lit, the next ones dimmed, in the part's
 * tuning and capo. It listens to the engine's beat channel (fed by the player's subscription,
 * as each beat is heard), so only this board re-renders when the notes change: never the screen.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { cx } from '@/ui';
import { Fretboard } from '@/ui/music';
import type { PlayerEngine, NeckFrame } from '../engine/engine';
import { neckMarkers, neckRange } from '../model/neck';
import styles from './Neck.module.css';

/** Props of the fretboard strip. */
export interface NeckProps {
  engine: PlayerEngine;
  /** The practised part (its tuning, capo and range). */
  track: string;
  maxFret: number;
  size: 'sm' | 'md';
  className?: string;
}

/** The fretboard strip. */
export const Neck = memo(function Neck({ engine, track, maxFret, size, className }: NeckProps) {
  const [frame, setFrame] = useState<NeckFrame>({ now: [], next: [], hint: false });
  useEffect(() => engine.onNeck(setFrame), [engine]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const labels = useMemo(() => engine.neckLabels, [engine, track]);
  // The range is fixed per part: the board does not jump while the music moves.
  const frets = useMemo(() => {
    const spots = engine.partTargets.flatMap((t) => t.positions);
    return neckRange(spots, { maxFret: Math.max(maxFret, 12) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, track, maxFret]);
  const markers = useMemo(() => neckMarkers(frame.now, frame.next, labels, { hint: frame.hint }), [frame, labels]);
  const tuning = labels.tuning;
  const capo = labels.capo;
  const summary = frame.now.length ? `Play now: ${markers.filter((m) => m.state === 'target').map((m) => `${m.note ?? ''} string ${m.string} fret ${m.fret}`).join(', ')}` : 'Fretboard';
  return (
    <div className={cx(styles.neck, frame.hint && styles.hint, className)} data-player-neck="" data-now={frame.now.map((s) => `${s.string}:${s.fret}`).join(' ')}>
      <Fretboard tuning={tuning} frets={frets} {...(capo ? { capo } : {})} markers={markers} size={size} fretNumbers="inlays" aria-label={summary} />
    </div>
  );
});
