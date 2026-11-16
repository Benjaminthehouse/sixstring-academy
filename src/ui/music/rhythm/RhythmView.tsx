/**
 * A rhythm on a beat grid: every step of the bar is a column, each note sits where it starts and
 * a bar shows how long it lasts (rests are hollow), accents are marked, and the counting
 * ("1 e & a") runs underneath with the syllables you play in bold. `current` moves a highlight
 * along the steps during playback.
 *
 *   <RhythmView rhythm="q q e e q" />
 *   <RhythmView rhythm="h q qr | e e e e h" time="4/4" current={step} />
 *   <RhythmView rhythm="q. e q q" time="6/8" />
 *
 * HTML grid (it reflows bar by bar on a phone) with small SVG glyphs.
 */
import { memo, useMemo, type CSSProperties } from 'react';
import { NOTE_VALUES } from '@/core/theory';
import { cx, useElementSize } from '@/ui';
import { barMarks } from './engrave';
import { rhythmStep, stepWidth } from './fit';
import { NoteGlyph } from './glyphs';
import { parseRhythm, rhythmGrid, type RhythmGrid, type RhythmNote } from './model';
import styles from './Rhythm.module.css';

/** Props of `<RhythmView>`. */
export interface RhythmViewProps {
  /** The rhythm in the compact notation (`'q q e e q'`) or as parsed notes. */
  rhythm: string | readonly RhythmNote[];
  /** Time signature (default `4/4`). */
  time?: string;
  /** The step to highlight (0-based across all bars), or null. Use `stepAt(grid, tick)` to get it from a tick. */
  current?: number | null;
  /** Show the counting row (default true). */
  counting?: boolean;
  /** Accessible description (default: the note values in words). */
  'aria-label'?: string;
  className?: string;
}

const NAMES = new Map(NOTE_VALUES.map((v) => [v.id, v]));

/** Words for one note: "dotted quarter note", "eighth rest", "accented quarter note". */
export function rhythmNoteName(n: RhythmNote): string {
  const v = NAMES.get(n.value);
  const base = n.rest ? (v?.restName ?? n.value) : (v?.name ?? n.value);
  return `${n.accent ? 'accented ' : ''}${n.tied ? 'tied ' : ''}${n.dots === 2 ? 'double-dotted ' : n.dots ? 'dotted ' : ''}${n.triplet ? 'triplet ' : ''}${base}`;
}

/** The rhythm grid. See the module comment. */
export const RhythmView = memo(function RhythmView({ rhythm, time = '4/4', current = null, counting = true, className, ...rest }: RhythmViewProps) {
  const grid = useMemo<RhythmGrid>(() => rhythmGrid(typeof rhythm === 'string' ? parseRhythm(rhythm).notes : [...rhythm], time), [rhythm, time]);
  const label = rest['aria-label'] ?? `Rhythm in ${grid.time.text}: ${grid.notes.map(rhythmNoteName).join(', ')}.`;
  // Steps as wide as is comfortable, narrower where a bar would not fit the box (a lesson card on a phone).
  const [boxRef, { width }] = useElementSize<HTMLDivElement>();
  const { base, floor } = rhythmStep(grid.stepsPerBar);
  const minStep = stepWidth(grid.stepsPerBar, width, base, floor);
  // Steps under about 26 px (a phone's lesson card): "trip" and "let" get a narrower face so they do not run together.
  const tight = width > 0 && width - 10 < grid.stepsPerBar * 26;
  // A row above the notes for accents and tuplet numbers, when the rhythm has any (the same in every bar, so bars line up).
  const marksRow = grid.notes.some((n) => n.accent || n.triplet);
  return (
    <div ref={boxRef} className={cx(styles.root, className)} role="group" aria-label={label}>
      <div className={styles.bars} aria-hidden="true" data-marks={marksRow || undefined}>
        {Array.from({ length: grid.bars }, (_unused, bar) => (
          <Bar key={bar} grid={grid} bar={bar} current={current} counting={counting} minStep={minStep} tight={tight} />
        ))}
      </div>
    </div>
  );
});

/** A tie as a filled crescent under the note heads, stretched to the box it is given. */
function TieArc({ kind, style }: { kind: 'prev' | 'barline' | 'out'; style?: CSSProperties }) {
  return (
    <svg className={styles.tie} data-kind={kind} style={style} viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M1 1 Q50 13 99 1 Q50 6.5 1 1 Z" fill="currentColor" stroke="currentColor" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Bar({ grid, bar, current, counting, minStep, tight }: { grid: RhythmGrid; bar: number; current: number | null; counting: boolean; minStep: string; tight: boolean }) {
  const cells = grid.cells.filter((c) => c.bar === bar);
  const first = bar * grid.stepsPerBar;
  // Segments: each note's stretch of steps inside this bar.
  const segments: Array<{ note: number; from: number; to: number; onset: boolean }> = [];
  for (const c of cells) {
    if (c.note === null) continue;
    const last = segments[segments.length - 1];
    if (last && last.note === c.note) last.to = c.inBar + 1;
    else segments.push({ note: c.note, from: c.inBar, to: c.inBar + 1, onset: c.onset === c.note });
  }
  const style = { '--steps': grid.stepsPerBar, '--min-step': minStep } as CSSProperties;
  // Beams, tuplets and ties by the engraving rules, bar by bar (so bar 2 is drawn like bar 1).
  const marks = useMemo(() => new Map(barMarks(grid, bar).map((m) => [m.note, m])), [grid, bar]);
  const local = current !== null && current >= first && current < first + grid.stepsPerBar ? current - first : null;
  // More steps than a phone has room for names (eighths beside triplets cut 4/4 into 24): say the
  // beats and what is played, not every "ta". A 6/8 bar of sixteenths (12 steps) keeps its "& a".
  const sparse = grid.stepsPerBar > 16;
  return (
    <div className={styles.bar} style={style} data-sparse={sparse || undefined} data-tight={tight || undefined}>
      {local !== null && <div className={styles.playhead} style={{ gridColumn: `${local + 1} / span 1` }} />}
      {cells.map((c) => (
        <div key={`g${c.step}`} className={styles.gridLine} data-beat={c.beat || undefined} data-first={c.inBar === 0 || undefined} style={{ gridColumn: `${c.inBar + 1} / span 1` }} />
      ))}
      {segments.map((s) => {
        const n = grid.notes[s.note];
        const mk = s.onset ? marks.get(s.note) : undefined;
        const cols = s.to - s.from;
        const pct = (steps: number) => `${(steps / cols) * 100}%`;
        return (
          <div
            key={`n${s.note}-${s.from}`}
            className={styles.segment}
            data-rest={n.rest || undefined}
            data-accent={n.accent || undefined}
            data-onset={s.onset || undefined}
            data-tied={(n.tied && s.onset) || undefined}
            data-tie-out={grid.notes[s.note + 1]?.tied || undefined}
            data-beamed={mk?.beamed || undefined}
            data-current={local !== null && local >= s.from && local < s.to ? true : undefined}
            style={{ gridColumn: `${s.from + 1} / ${s.to + 1}` }}
          >
            <span className={styles.glyphRow}>{s.onset && <NoteGlyph value={n.value} dots={n.dots} rest={n.rest} beamed={mk?.beamed} className={styles.glyph} />}</span>
            {s.onset && n.accent && <span className={styles.accent}>&gt;</span>}
            {mk?.tuplet && (
              <span className={styles.tuplet} data-bracket={mk.tuplet.bracket || undefined} style={{ ['--span' as string]: pct(mk.tuplet.spanCols) }}>
                <span className={styles.tupletNumber}>{mk.tuplet.number}</span>
              </span>
            )}
            {mk?.beams.map((b, i) => <span key={i} className={styles.beam} data-level={b.level} data-to={b.to} />)}
            {mk?.tie?.from === 'prev' && <TieArc kind="prev" style={{ ['--back' as string]: pct(mk.tie.prevCols) }} />}
            {mk?.tie?.from === 'barline' && <TieArc kind="barline" />}
            {mk?.tieOut && <TieArc kind="out" />}
            <span className={styles.sustain} />
          </div>
        );
      })}
      {counting &&
        cells.map((c) => {
          const n = c.note !== null ? grid.notes[c.note] : null;
          const played = c.onset !== null && n && !n.rest && !n.tied;
          return (
            <span key={`c${c.step}`} className={styles.count} data-long={c.syllable.length > 2 || undefined} data-beat={c.beat || undefined} data-played={played || undefined} data-current={local === c.inBar || undefined} style={{ gridColumn: `${c.inBar + 1} / span 1` }}>
              {sparse && !c.beat && !played ? '' : c.syllable}
            </span>
          );
        })}
    </div>
  );
}
