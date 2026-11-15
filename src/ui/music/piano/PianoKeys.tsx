/**
 * A small piano keyboard (one to three octaves is the sweet spot) for explaining theory away from
 * the neck: half and whole steps, scales, chords. Keys can be highlighted with degree or finger
 * colours and a label, and made tappable (each key a real button; arrow keys walk the keyboard).
 *
 *   <PianoKeys from="C4" to="B4" highlight={['C4', 'E4', 'G4']} />
 *   <PianoKeys highlight={[{ note: 'C4', label: 'R', color: 'deg-1' }]} onKeyPress={(k) => play(k.midi)} />
 *
 * The keys are drawn in ivory and ebony in both themes, like the fretboard's materials.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { midiToNote } from '@/core/theory';
import { cx } from '@/ui';
import { noteText } from '../format';
import { useMusicSettings } from '../settings';
import tone from '../tone.module.css';
import type { MarkerState, MusicColor, NoteNaming } from '../types';
import { pianoLayout, rangeAround, toMidi, type PianoKey } from './layout';
import styles from './PianoKeys.module.css';

/** A highlighted key. */
export interface PianoHighlight {
  /** Pitch with octave (`C4`, spelled as you want it named) or a MIDI number. */
  note: string | number;
  /** Text on the key (default: the note name). Empty string for none. */
  label?: string;
  /** Colour name (default `accent`). */
  color?: MusicColor;
  state?: MarkerState;
}

/** A pressed key. */
export interface PianoKeyPress {
  midi: number;
  /** Spelled with sharps unless the highlight named it otherwise, with octave: `C#4`. */
  note: string;
}

/** Props of `<PianoKeys>`. */
export interface PianoKeysProps {
  /** First key (default: C of the octave holding the lowest highlight, or C4). */
  from?: string | number;
  /** Last key (default: B of the octave holding the highest highlight, or B4). */
  to?: string | number;
  /** Keys to highlight: names, MIDI numbers or full highlight objects. */
  highlight?: ReadonlyArray<PianoHighlight | string | number>;
  /** Names on keys that are not highlighted: every C (default), every white key, or none. */
  labels?: 'c' | 'white' | 'none';
  /** Makes each key a button. */
  onKeyPress?: (key: PianoKeyPress) => void;
  naming?: NoteNaming;
  /** Accessible name (default: "Piano keyboard, C4 to B4"). */
  'aria-label'?: string;
  className?: string;
}

const W = 24;
const H = 96;
const BH = 60;

/** The keyboard. See the module comment. */
export const PianoKeys = memo(function PianoKeys(props: PianoKeysProps) {
  const settings = useMusicSettings();
  const { highlight, labels = 'c', onKeyPress, naming = settings.naming, className } = props;
  const marks = useMemo(() => {
    const map = new Map<number, PianoHighlight & { name: string | null }>();
    for (const h of highlight ?? []) {
      const item = typeof h === 'object' ? h : { note: h };
      const midi = toMidi(item.note);
      map.set(midi, { ...item, name: typeof item.note === 'string' ? item.note : null });
    }
    return map;
  }, [highlight]);
  const [defFrom, defTo] = useMemo(() => rangeAround([...marks.keys()]), [marks]);
  const layout = useMemo(() => pianoLayout(props.from ?? defFrom, props.to ?? defTo), [props.from, props.to, defFrom, defTo]);
  const width = layout.whiteCount * W;
  const interactive = !!onKeyPress;
  const [down, setDown] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const nameOf = useCallback((midi: number) => marks.get(midi)?.name ?? midiToNote(midi, { prefer: 'sharps' }), [marks]);
  const press = useCallback(
    (midi: number) => {
      setDown(midi);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDown(null), 160);
      onKeyPress?.({ midi, note: nameOf(midi) });
    },
    [onKeyPress, nameOf],
  );

  const current = focus ?? layout.keys.find((k) => !k.black)?.midi ?? layout.from;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(layout.to, Math.max(layout.from, current + step));
    setFocus(next);
    refs.current.get(next)?.focus();
  };

  const whites = layout.keys.filter((k) => !k.black);
  const blacks = layout.keys.filter((k) => k.black);
  const label = props['aria-label'] ?? `Piano keyboard, ${noteText(midiToNote(layout.from), naming, { octave: true })} to ${noteText(midiToNote(layout.to), naming, { octave: true })}${marks.size ? `, ${[...marks.values()].map((m) => noteText(m.name ?? midiToNote(toMidi(m.note)), naming, { octave: true })).join(' ')} marked` : ''}`;

  const keyText = (k: PianoKey): string | null => {
    const m = marks.get(k.midi);
    if (m) return m.label ?? noteText(nameOf(k.midi), naming);
    if (k.black) return null;
    if (labels === 'white') return noteText(midiToNote(k.midi), naming);
    if (labels === 'c' && k.midi % 12 === 0) return noteText(midiToNote(k.midi), naming, { octave: true });
    return null;
  };

  const renderKey = (k: PianoKey) => {
    const m = marks.get(k.midi);
    const text = keyText(k);
    const x = k.x * W;
    const w = k.w * W;
    const h = k.black ? BH : H;
    const dotY = k.black ? BH - 13 : H - 15;
    return (
      <g key={k.midi} className={cx(styles.key, m && tone.tone)} data-black={k.black || undefined} data-marked={!!m || undefined} data-c={m?.color ?? (m ? 'accent' : undefined)} data-state={m?.state} data-down={down === k.midi || undefined}>
        <rect className={styles.keyShape} x={x + (k.black ? 0 : 0.5)} y={0} width={w - (k.black ? 0 : 1)} height={h} rx={k.black ? 2.5 : 3.5} />
        {m && <circle className={styles.dot} cx={x + w / 2} cy={dotY} r={k.black ? 7.5 : 9.5} />}
        {m?.state === 'hit' && <path className={styles.tick} d={`M${x + w / 2 - 4} ${dotY - 17} l3 3 l5 -6`} />}
        {m?.state === 'miss' && <path className={styles.tick} d={`M${x + w / 2 - 3.5} ${dotY - 20} l7 7 m0 -7 l-7 7`} />}
        {text && (
          <text className={cx(styles.text, m ? styles.dotText : undefined)} x={x + w / 2} y={m ? dotY + 0.5 : H - 10} fontSize={m ? (text.length > 2 ? 7.5 : 9.5) : 8.5}>
            {text}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.scroller}>
        <div className={styles.stage} style={{ minWidth: interactive ? layout.whiteCount * 34 : layout.whiteCount * 16, maxWidth: layout.whiteCount * 56 }}>
          <svg className={styles.svg} viewBox={`-1 -1 ${width + 2} ${H + 2}`} role="img" aria-label={label} aria-hidden={interactive || undefined}>
            <rect className={styles.bed} x={-1} y={-1} width={width + 2} height={H + 2} rx={4} />
            {whites.map(renderKey)}
            <rect className={styles.felt} x={0} y={0} width={width} height={2.5} />
            {blacks.map(renderKey)}
          </svg>
          {interactive && (
            <div className={styles.buttons} role="group" aria-label={`${label}. Tap a key; arrow keys move.`} onKeyDown={onKeyDown}>
              {[...whites, ...blacks].map((k) => (
                <button
                  key={k.midi}
                  ref={(el) => {
                    if (el) refs.current.set(k.midi, el);
                    else refs.current.delete(k.midi);
                  }}
                  type="button"
                  className={cx(styles.button, k.black && styles.blackButton)}
                  style={{ left: `${(k.x / layout.whiteCount) * 100}%`, width: `${(k.w / layout.whiteCount) * 100}%`, height: k.black ? `${(BH / H) * 100}%` : '100%' }}
                  tabIndex={k.midi === current ? 0 : -1}
                  aria-label={noteText(nameOf(k.midi), naming, { octave: true })}
                  onFocus={() => setFocus(k.midi)}
                  onClick={() => press(k.midi)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
