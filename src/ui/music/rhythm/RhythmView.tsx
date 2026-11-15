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
import { cx } from '@/ui';
import { NoteGlyph, TieGlyph } from './glyphs';
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
  const minStep = grid.stepsPerBar <= 8 ? '1.9rem' : grid.stepsPerBar <= 12 ? '1.55rem' : '1.3rem';
  return (
    <div className={cx(styles.root, className)} role="group" aria-label={label}>
      <div className={styles.bars} aria-hidden="true">
        {Array.from({ length: grid.bars }, (_unused, bar) => (
          <Bar key={bar} grid={grid} bar={bar} current={current} counting={counting} minStep={minStep} />
        ))}
      </div>
    </div>
  );
});

function Bar({ grid, bar, current, counting, minStep }: { grid: RhythmGrid; bar: number; current: number | null; counting: boolean; minStep: string }) {
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
  const tripletStarts = useMemo(() => {
    const starts = new Set<number>();
    let run = 0;
    grid.notes.forEach((n, i) => {
      if (!n.triplet) {
        run = 0;
        return;
      }
      if (run % 3 === 0) starts.add(i);
      run++;
    });
    return starts;
  }, [grid.notes]);
  const local = current !== null && current >= first && current < first + grid.stepsPerBar ? current - first : null;
  return (
    <div className={styles.bar} style={style}>
      {local !== null && <div className={styles.playhead} style={{ gridColumn: `${local + 1} / span 1` }} />}
      {cells.map((c) => (
        <div key={`g${c.step}`} className={styles.gridLine} data-beat={c.beat || undefined} data-first={c.inBar === 0 || undefined} style={{ gridColumn: `${c.inBar + 1} / span 1` }} />
      ))}
      {segments.map((s) => {
        const n = grid.notes[s.note];
        return (
          <div
            key={`n${s.note}-${s.from}`}
            className={styles.segment}
            data-rest={n.rest || undefined}
            data-accent={n.accent || undefined}
            data-onset={s.onset || undefined}
            data-tied={(n.tied && s.onset) || undefined}
            data-tie-out={grid.notes[s.note + 1]?.tied || undefined}
            data-current={local !== null && local >= s.from && local < s.to ? true : undefined}
            style={{ gridColumn: `${s.from + 1} / ${s.to + 1}` }}
          >
            <span className={styles.glyphRow}>
              {s.onset && n.accent && <span className={styles.accent}>&gt;</span>}
              {s.onset && tripletStarts.has(s.note) && <span className={styles.tuplet}>3</span>}
              {s.onset && (n.tied ? <TieGlyph className={styles.glyph} /> : <NoteGlyph value={n.value} dots={n.dots} rest={n.rest} className={styles.glyph} />)}
            </span>
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
              {c.syllable}
            </span>
          );
        })}
    </div>
  );
}
