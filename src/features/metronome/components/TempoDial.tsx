/**
 * The tempo dial: a knob with the tempo in the middle.
 *
 * Turn it from anywhere on the ring (3 degrees per BPM, so a grab never makes the value jump), use
 * the mouse wheel, or focus it and use the arrow keys (it is a real `role="slider"`). The number in
 * the middle is a button: tap it to type a tempo. The ring around the number pulses on every beat
 * when it is heard (driven straight from the metronome, never through React state).
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { MetronomeBeat } from '@/core/audio';
import { cx, usePrefersReducedMotion } from '@/ui';
import { beatNoteWords, type BeatNote } from '../model/meters';
import { DIAL_DEGREES_PER_BPM, TEMPO_MAX, TEMPO_MIN, angleDelta, clampTempo, gaugeFraction, parseTempoInput, pointAngle, tempoAfterTurn, tempoName } from '../model/tempo';
import { BeatNoteGlyph } from './NoteGlyphs';
import styles from './TempoDial.module.css';

/** The gauge runs from -150 to +150 degrees (an opening at the bottom). */
const ARC = 150;
const C = 100;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)];
}

function arcPath(r: number, from: number, to: number): string {
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const KNURL = Array.from({ length: 72 }, (_, i) => i * 5);

/** Props for {@link TempoDial}. */
export interface TempoDialProps {
  /** Tempo shown (the live tempo while a speed trainer runs). */
  value: number;
  onChange: (bpm: number) => void;
  /** The note the tempo counts, shown beside "BPM". */
  beatNote: BeatNote;
  /** Subscribe to heard beats, for the pulse. */
  onBeat?: (fn: (beat: MetronomeBeat) => void) => () => void;
  /** Bright pulse (visual-only mode): the flash has to carry the beat on its own. */
  strongPulse?: boolean;
  className?: string;
}

/** The big tempo knob. */
export function TempoDial({ value, onChange, beatNote, onBeat, strongPulse = false, className }: TempoDialProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const pulseRef = useRef<SVGCircleElement | null>(null);
  const drag = useRef<{ id: number; startAngle: number; turned: number; startBpm: number; last: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const reduced = usePrefersReducedMotion();
  const strongRef = useRef(strongPulse);
  strongRef.current = strongPulse;

  const name = tempoName(value);
  const fraction = gaugeFraction(value);
  const end = -ARC + 2 * ARC * fraction;
  const [tx, ty] = polar(80, end);

  // The pulse ring: a short fade on every heard beat, brighter on the downbeat.
  useEffect(() => {
    if (!onBeat) return undefined;
    return onBeat((b) => {
      const ring = pulseRef.current;
      if (!ring || typeof ring.animate !== 'function') return;
      const strong = strongRef.current;
      const peak = b.level === null ? (strong ? 0.25 : 0.12) : b.level === 'accent' ? (strong ? 1 : 0.55) : strong ? 0.7 : 0.3;
      const frames = reduced
        ? [{ opacity: peak }, { opacity: 0 }]
        : [
            { opacity: peak, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(1.08)' },
          ];
      ring.animate(frames, { duration: strong ? 260 : 200, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
    });
  }, [onBeat, reduced]);

  // The wheel needs a non-passive listener to keep the page from scrolling under it.
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return undefined;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      // One notch of a mouse wheel is about 100; trackpads send many small deltas.
      const steps = Math.trunc(acc / 40);
      if (!steps) return;
      acc -= steps * 40;
      onChangeRef.current(clampTempo(valueRef.current - steps * (e.shiftKey ? 5 : 1)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const angleOf = (e: { clientX: number; clientY: number }) => {
    const r = sliderRef.current!.getBoundingClientRect();
    return pointAngle(e.clientX, e.clientY, r.left + r.width / 2, r.top + r.height / 2);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // The very centre has no direction to turn in.
    if (Math.hypot(dx, dy) < r.width * 0.08) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const a = angleOf(e);
    drag.current = { id: e.pointerId, startAngle: a, turned: 0, startBpm: valueRef.current, last: a };
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    // Near the middle a small move swings the angle wildly: ignore it there.
    if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < r.width * 0.08) return;
    const a = angleOf(e);
    d.turned += angleDelta(d.last, a);
    d.last = a;
    const next = tempoAfterTurn(d.startBpm, d.turned);
    if (next !== valueRef.current) onChangeRef.current(next);
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey;
    let next: number | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = value + (big ? 5 : 1);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = value - (big ? 5 : 1);
    else if (e.key === 'PageUp') next = value + 10;
    else if (e.key === 'PageDown') next = value - 10;
    else if (e.key === 'Home') next = TEMPO_MIN;
    else if (e.key === 'End') next = TEMPO_MAX;
    if (next === null) return;
    e.preventDefault();
    onChange(clampTempo(next));
  };

  const beginEdit = () => {
    setDraft(String(value));
    setEditing(true);
  };
  const commit = () => {
    const n = parseTempoInput(draft);
    setEditing(false);
    if (n !== null) onChange(clampTempo(n));
  };

  const valueText = `${value} beats per minute, ${name.name}`;

  return (
    <div className={cx(styles.dial, dragging && styles.dragging, className)}>
      <div
        ref={sliderRef}
        className={styles.ring}
        role="slider"
        tabIndex={0}
        aria-label="Tempo dial: turn to change the tempo"
        aria-valuemin={TEMPO_MIN}
        aria-valuemax={TEMPO_MAX}
        aria-valuenow={value}
        aria-valuetext={valueText}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
      >
        <svg viewBox="0 0 200 200" className={styles.svg} aria-hidden="true" focusable="false">
          <circle cx={C} cy={C} r={97} className={styles.rim} />
          <g className={styles.knurl} style={{ transform: `rotate(${value * DIAL_DEGREES_PER_BPM}deg)` }}>
            {KNURL.map((deg) => {
              const [x0, y0] = polar(90, deg);
              const [x1, y1] = polar(96, deg);
              return <line key={deg} x1={x0} y1={y0} x2={x1} y2={y1} />;
            })}
          </g>
          <circle cx={C} cy={C} r={86} className={styles.face} />
          <path d={arcPath(78, -ARC, ARC)} className={styles.track} />
          {fraction > 0.002 && <path d={arcPath(78, -ARC, end)} className={styles.fill} />}
          <circle ref={pulseRef} cx={C} cy={C} r={64} className={styles.pulse} />
          <circle cx={tx} cy={ty} r={7} className={styles.thumb} />
        </svg>
      </div>
      <div className={styles.centre}>
        {editing ? (
          <input
            className={styles.input}
            value={draft}
            inputMode="numeric"
            aria-label={`Type a tempo from ${TEMPO_MIN} to ${TEMPO_MAX}`}
            // The learner asked for this field by tapping the number.
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setEditing(false);
              }
            }}
          />
        ) : (
          <button type="button" className={styles.number} onClick={beginEdit} aria-label={`Tempo ${value}. Tap to type a tempo`} data-metronome-tempo>
            {value}
          </button>
        )}
        <span className={styles.unit}>
          BPM
          {beatNote !== 'quarter' && (
            <span className={styles.beatNote}>
              <BeatNoteGlyph note={beatNote} />
              <span className="sr-only">, counting {beatNoteWords(beatNote)}</span>
            </span>
          )}
        </span>
        <span className={styles.name}>{name.name}</span>
        <span className={styles.meaning}>{name.meaning}</span>
      </div>
    </div>
  );
}
