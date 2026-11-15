/**
 * The circle of fifths. Major keys around the outside, their relative minors inside, the number of
 * sharps or flats on the rim. Tap (or arrow to) a key to select it: its wedge fills with the
 * accent, and the wedges holding its diatonic chords (the key and its two neighbours, plus the
 * diminished chord) light up with their roman numerals.
 *
 *   <CircleOfFifths value={key} onChange={setKey} />          // 'G major', 'E minor'
 *   <CircleOfFifths value="A minor" />                        // a static picture
 */
import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { diatonicChords, formatChords, formatKey, formatKeySignature, formatRoman, type Key } from '@/core/theory';
import { cx } from '@/ui';
import { noteText } from '../format';
import { useMusicSettings } from '../settings';
import type { NoteNaming } from '../types';
import { circleSlots, circleWedges, moveOnCircle, polar, signatureText, slotOfKey, wedgePath, type CircleRing, type WedgeInfo } from './model';
import styles from './CircleOfFifths.module.css';

/** Props of `<CircleOfFifths>`. */
export interface CircleOfFifthsProps {
  /** The selected key (`G major`, `E minor`, `Bb`); null for none. */
  value?: string | null;
  /** Called with the chosen key's name (`D major`, `B minor`). Without it the circle is a static picture. */
  onChange?: (keyName: string) => void;
  /** Which rings carry names (default both). */
  show?: 'both' | 'major' | 'minor';
  /** Other keys to outline: neighbours, a modulation target. */
  highlight?: readonly string[];
  /** Show the selected key's diatonic chords and numerals (default true). */
  diatonic?: boolean;
  naming?: NoteNaming;
  /** Accessible name (default "Circle of fifths"). */
  'aria-label'?: string;
  className?: string;
}

const C = 200;
const R_OUT = 197;
const R_MID = 137;
const R_IN = 89;

/** The circle of fifths. See the module comment. */
export const CircleOfFifths = memo(function CircleOfFifths(props: CircleOfFifthsProps) {
  const settings = useMusicSettings();
  const { value = null, onChange, show = 'both', highlight, diatonic = true, naming = settings.naming, className } = props;
  const interactive = !!onChange;
  const wedges = useMemo(() => circleWedges(value), [value]);
  const selected = useMemo(() => slotOfKey(value), [value]);
  const highlighted = useMemo(() => new Set((highlight ?? []).map((k) => slotOfKey(k)).filter(Boolean).map((s) => `${s!.ring}:${s!.index}`)), [highlight]);
  const [focus, setFocus] = useState<{ index: number; ring: CircleRing } | null>(null);
  const refs = useRef(new Map<string, SVGGElement>());
  const current = focus ?? (selected ? { index: selected.index, ring: selected.ring } : { index: 0, ring: 'major' as CircleRing });

  const choose = useCallback(
    (w: { index: number; ring: CircleRing }) => {
      const slot = circleSlots()[w.index];
      const key = (w.ring === 'major' ? slot.major : slot.minor)[0];
      onChange?.(key.name);
    },
    [onChange],
  );

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (!interactive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(current);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
    e.preventDefault();
    let next = moveOnCircle(current, e.key as 'ArrowLeft');
    if (show !== 'both') next = { ...next, ring: show };
    setFocus(next);
    refs.current.get(`${next.ring}:${next.index}`)?.focus();
    choose(next);
  };

  const label = props['aria-label'] ?? 'Circle of fifths';
  const selectedKey = selected?.key ?? null;
  const description = selectedKey && diatonic ? describeDiatonic(selectedKey, naming) : undefined;

  return (
    <svg className={cx(styles.root, className)} viewBox="0 0 400 400" role={interactive ? undefined : 'img'} aria-label={interactive ? undefined : label}>
      {description && <desc>{description}</desc>}
      <g role={interactive ? 'radiogroup' : undefined} aria-label={interactive ? label : undefined} onKeyDown={onKeyDown}>
        {wedges.map((w) => {
          const named = show === 'both' || show === w.ring;
          const isCurrent = current.index === w.index && current.ring === w.ring;
          const r0 = w.ring === 'major' ? R_MID : R_IN;
          const r1 = w.ring === 'major' ? R_OUT : R_MID;
          const a0 = w.index * 30 - 15;
          const key = `${w.ring}:${w.index}`;
          const itemProps =
            interactive && named
              ? {
                  role: 'radio',
                  'aria-checked': w.selected,
                  'aria-label': wedgeLabel(w, naming),
                  tabIndex: isCurrent ? 0 : -1,
                  onClick: () => {
                    setFocus({ index: w.index, ring: w.ring });
                    choose(w);
                  },
                  onFocus: () => setFocus({ index: w.index, ring: w.ring }),
                }
              : {};
          return (
            <g
              key={key}
              ref={(el) => {
                if (el) refs.current.set(key, el);
                else refs.current.delete(key);
              }}
              className={cx(styles.wedge, interactive && named && styles.interactive)}
              data-ring={w.ring}
              data-selected={w.selected || undefined}
              data-diatonic={(diatonic && w.roman && !w.selected) || undefined}
              data-highlight={highlighted.has(key) || undefined}
              {...itemProps}
            >
              <path className={styles.shape} d={wedgePath(C, C, r0 + 1, r1 - 1, a0 + 0.6, a0 + 30 - 0.6)} />
              {named && <WedgeText w={w} naming={naming} showRoman={diatonic} />}
            </g>
          );
        })}
      </g>
      <Centre keyInfo={selectedKey} naming={naming} interactive={interactive} />
    </svg>
  );
});

function displayName(k: Key, naming: NoteNaming): string {
  const tonic = noteText(k.tonic, naming);
  return k.mode === 'minor' ? `${tonic}m` : tonic;
}

/**
 * Name, roman numeral and signature inside one wedge, stacked on screen lines (not along the
 * radius), so they never run into each other on the wedges at three and nine o'clock.
 * Enharmonic slots show the usual spelling with the other one smaller underneath.
 */
function WedgeText({ w, naming, showRoman }: { w: WedgeInfo; naming: NoteNaming; showRoman: boolean }) {
  const outer = w.ring === 'major';
  const c = polar(C, C, outer ? 166 : 113, w.index * 30);
  const names = w.keys.map((k) => displayName(k, naming));
  const roman = showRoman && w.roman ? formatRoman(w.roman) : null;
  const lines: Array<{ text: string; className: string; h: number }> = [];
  if (outer) lines.push({ text: signatureText({ major: w.keys }), className: styles.sig, h: 12 });
  lines.push({ text: names[0], className: cx(styles.name, !outer && styles.minorName, names.length > 1 && (outer ? styles.twin : styles.twinMinor)), h: outer ? (names.length > 1 ? 16 : 20) : names.length > 1 ? 13 : 16 });
  if (names.length > 1) lines.push({ text: names[1], className: cx(styles.name, styles.alt), h: 11 });
  if (roman) lines.push({ text: roman, className: styles.roman, h: 13 });
  const total = lines.reduce((sum, l) => sum + l.h, 0);
  let y = c.y - total / 2;
  return (
    <>
      {lines.map((l, i) => {
        const at = y + l.h / 2;
        y += l.h;
        return (
          <text key={i} className={l.className} x={c.x} y={at}>
            {l.text}
          </text>
        );
      })}
    </>
  );
}

/** The middle: the selected key, its signature, its relative. */
function Centre({ keyInfo, naming, interactive }: { keyInfo: Key | null; naming: NoteNaming; interactive: boolean }) {
  if (!keyInfo) {
    return (
      <g>
        <circle className={styles.centre} cx={C} cy={C} r={R_IN - 4} />
        <text className={styles.centreHint} x={C} y={C}>
          {interactive ? 'Tap a key' : 'Circle of fifths'}
        </text>
      </g>
    );
  }
  const sig = formatKeySignature(keyInfo, { system: naming });
  const count = keyInfo.signature.count;
  const kind = keyInfo.signature.type === 'sharps' ? (count === 1 ? 'sharp' : 'sharps') : count === 1 ? 'flat' : 'flats';
  return (
    <g>
      <circle className={styles.centre} cx={C} cy={C} r={R_IN - 4} />
      <text className={styles.centreKey} x={C} y={C - 18}>
        {formatKey(keyInfo, { system: naming })}
      </text>
      <text className={styles.centreSig} x={C} y={C + 8}>
        {count === 0 ? 'no sharps or flats' : `${count} ${kind}`}
      </text>
      {count > 0 && (
        <text className={styles.centreNotes} x={C} y={C + 27}>
          {sig.join(' ')}
        </text>
      )}
    </g>
  );
}

function wedgeLabel(w: WedgeInfo, naming: NoteNaming): string {
  const names = w.keys.map((k) => formatKey(k, { system: naming })).join(' or ');
  const f = w.keys[0].signature;
  const sig = f.count === 0 ? 'no sharps or flats' : `${f.count} ${f.type}`;
  return `${names}, ${sig}${w.roman ? `, ${w.roman} chord of the selected key` : ''}`;
}

function describeDiatonic(k: Key, naming: NoteNaming): string {
  const list = diatonicChords(k);
  const names = formatChords(list.map((c) => c.symbol), { system: naming });
  const chords = list.map((c, i) => `${c.roman} ${names[i]}`);
  return `${formatKey(k, { system: naming })} selected. Its chords: ${chords.join(', ')}.`;
}
