/**
 * A strumming pattern: one slot per eighth (or sixteenth, or triplet), each with its stroke drawn
 * as an arrow (down or up), a muted strum crossed out, an accent heavier with a `>`, a missed
 * stroke as a faint dashed arrow (the hand keeps moving), the count underneath, and a moving
 * highlight for the current slot.
 *
 *   <StrumPattern pattern="D-DU-UDU" />
 *   <StrumPattern pattern="D>-DU X>UDU" current={slot} />
 *   <StrumPattern pattern="sxsx" grid="eighth" time="2/4" />      // the strumming library's format
 */
import { memo, useMemo, type CSSProperties } from 'react';
import { parseTimeSignature } from '@/core/theory';
import { cx, useElementSize } from '@/ui';
import { stepWidth, strumStep } from './fit';
import { StrokeGlyph } from './glyphs';
import { parseStrum, strumSlotsPerBeat, strumSyllables, type StrumGridKind, type StrumStep } from './model';
import styles from './Rhythm.module.css';

/** Props of `<StrumPattern>`. */
export interface StrumPatternProps {
  /** `'D-DU-UDU'` (D down, U up, X muted, - missed, > accent after a slot, | between bars) or slots. */
  pattern: string | readonly StrumStep[];
  /** Time signature (default `4/4`). */
  time?: string;
  /** Slot grid; default: worked out from the slots per bar. */
  grid?: StrumGridKind;
  /** The slot to highlight (0-based across bars), or null. */
  current?: number | null;
  /** Show the counting row (default true). */
  counting?: boolean;
  'aria-label'?: string;
  className?: string;
}

const KIND_WORDS: Record<StrumStep['kind'], string> = { strum: '', accent: 'accented ', mute: 'muted ', ghost: 'miss ' };

/** The strumming pattern. See the module comment. */
export const StrumPattern = memo(function StrumPattern({ pattern, time = '4/4', grid, current = null, counting = true, className, ...rest }: StrumPatternProps) {
  const parsed = useMemo(() => (typeof pattern === 'string' ? parseStrum(pattern) : { steps: [...pattern], bars: [], errors: [] }), [pattern]);
  const ts = useMemo(() => parseTimeSignature(time) ?? parseTimeSignature('4/4')!, [time]);
  const slotsPerBar = parsed.bars.length ? parsed.bars[0] : parsed.steps.length;
  const perBeat = strumSlotsPerBeat(slotsPerBar, ts, grid);
  const barLength = perBeat * ts.beats;
  const syllables = strumSyllables(parsed.steps.length, ts, perBeat, grid === 'triplet' || (perBeat === 3 && ts.kind !== 'compound'));
  const bars: number[][] = [];
  parsed.steps.forEach((_s, i) => {
    const b = Math.floor(i / barLength);
    (bars[b] ??= []).push(i);
  });
  const label =
    rest['aria-label'] ??
    `Strumming pattern: ${parsed.steps.map((s, i) => (s.kind === 'ghost' ? `${syllables[i]} miss` : `${syllables[i]} ${KIND_WORDS[s.kind]}${s.dir}`)).join(', ')}.`;
  // Slots as wide as is comfortable, narrower where a bar would not fit the box (sixteen to a bar on a phone).
  const [boxRef, { width }] = useElementSize<HTMLDivElement>();
  const { base, floor } = strumStep(barLength);
  const minStep = stepWidth(barLength, width, base, floor);
  return (
    <div ref={boxRef} className={cx(styles.root, className)} role="group" aria-label={label}>
      <div className={styles.bars} aria-hidden="true">
        {bars.map((slots, b) => (
          <div key={b} className={cx(styles.bar, styles.strumBar)} style={{ '--steps': barLength, '--min-step': minStep } as CSSProperties}>
            {slots.map((i, k) => {
              const s = parsed.steps[i];
              return (
                <div key={i} className={styles.slot} data-kind={s.kind} data-dir={s.dir} data-beat={k % perBeat === 0 || undefined} data-current={current === i || undefined} style={{ gridColumn: `${k + 1} / span 1` }}>
                  {s.kind === 'accent' && <span className={styles.accent}>&gt;</span>}
                  <StrokeGlyph dir={s.dir} kind={s.kind} className={styles.stroke} />
                  {counting && (
                    <span className={styles.count} data-long={syllables[i].length > 2 || undefined} data-beat={k % perBeat === 0 || undefined} data-played={s.kind !== 'ghost' || undefined}>
                      {syllables[i]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});
