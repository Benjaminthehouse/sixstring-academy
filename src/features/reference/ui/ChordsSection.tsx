/**
 * Chord formulas: every chord type with its formula (degrees of the major scale on its root), its
 * notes on a chosen root and a shape to play; tap the shape to hear it, the symbol to open the
 * chord in Chords.
 */
import { useMemo, useState } from 'react';
import { href } from '@/app/router';
import { chordVoicings, type Tuning } from '@/core/guitar';
import { usePrefs } from '@/core/progress';
import { learnerTuning } from '@/core/settings';
import { ChipGroup, Section, Select, Text, useLocalState } from '@/ui';
import { ChordDiagram } from '@/ui/music';
import { CHORD_CATEGORIES, CHORD_ROOTS, chordGroups, type ChordRow } from '../model/chords';
import { Lazy } from './Lazy';
import type { SectionProps } from './SectionBody';
import { strumChord } from './sound';
import styles from './Sections.module.css';

type Filter = 'all' | (typeof CHORD_CATEGORIES)[number]['id'];

/** The chord formulas page. */
export function ChordsSection({ item, level, fmt, sounder }: SectionProps) {
  const prefs = usePrefs();
  const tuning = useMemo(() => learnerTuning(prefs), [prefs]);
  const [rootRaw, setRoot] = useLocalState<string>('reference.chordRoot', 'C');
  const root = (CHORD_ROOTS as readonly string[]).includes(rootRaw) ? rootRaw : 'C';
  const [filter, setFilter] = useState<Filter>('all');
  const groups = useMemo(() => chordGroups(root), [root]);
  // A deep link to a row must show its group.
  const itemGroup = item ? groups.find((g) => g.rows.some((r) => r.id === item))?.id : undefined;
  const visible = groups.filter((g) => filter === 'all' || g.id === filter || g.id === itemGroup);

  return (
    <div className={styles.stack}>
      <div className={styles.controls}>
        <Select
          label="Root"
          value={root}
          onChange={setRoot}
          options={CHORD_ROOTS.map((r) => ({ value: r, label: fmt.note(r) }))}
          className={styles.rootSelect}
        />
        <ChipGroup<Filter>
          aria-label="Kind of chord"
          options={[{ value: 'all', label: 'All' }, ...CHORD_CATEGORIES.map((c) => ({ value: c.id as Filter, label: shortTitle(c.title) }))]}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <Text variant="caption" tone="muted">
        A formula counts each note against the major scale on the root: 3 is the major third, ♭3 a half step lower, ♭♭7 two half steps below 7. Tap a shape to hear it; tap a symbol to open the chord.
      </Text>

      {visible.map((g) => (
        <Section key={g.id} level={level} title={g.title} description={g.blurb}>
          <ul className={styles.chList}>
            {g.rows.map((r) => (
              <ChordItem key={r.id} row={r} fmt={fmt} tuning={tuning} sounder={sounder} />
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

function shortTitle(title: string): string {
  if (title.startsWith('Triads')) return 'Triads';
  if (title.startsWith('Seventh')) return 'Sevenths';
  if (title.startsWith('Sixth')) return 'Sixths';
  if (title.startsWith('Added')) return 'Added notes';
  if (title.startsWith('Ninths')) return '9, 11, 13';
  if (title.startsWith('Altered')) return 'Altered';
  return title;
}

function ChordItem({ row, fmt, tuning, sounder }: { row: ChordRow; fmt: SectionProps['fmt']; tuning: Tuning; sounder: SectionProps['sounder'] }) {
  return (
    <li className={styles.chRow} data-ref-item={row.id}>
      <div className={styles.chMain}>
        <a className={styles.chSymbol} href={href('chords', row.chordPage)}>
          {fmt.chord(row.symbol)}
        </a>
        <span className={styles.chName}>{row.name}</span>
      </div>
      <span className={styles.chFormula} aria-label={`Formula ${row.degrees.join(' ')}`}>
        {row.degrees.map((d) => (
          <span key={d} className={styles.degree}>
            {fmt.degree(d)}
          </span>
        ))}
      </span>
      <span className={styles.chNotes}>{fmt.notes(row.notes)}</span>
      <Lazy minHeight="4.75rem" minWidth="3.5rem" className={styles.chShape}>
        {() => <ShapeButton symbol={row.symbol} tuning={tuning} fmt={fmt} sounder={sounder} />}
      </Lazy>
    </li>
  );
}

function ShapeButton({ symbol, tuning, fmt, sounder }: { symbol: string; tuning: Tuning; fmt: SectionProps['fmt']; sounder: SectionProps['sounder'] }) {
  const voicing = useMemo(() => {
    try {
      return chordVoicings(symbol, { tuning })[0] ?? null;
    } catch {
      return null;
    }
  }, [symbol, tuning]);
  if (!voicing) return <span className={styles.noShape}>No shape</span>;
  const id = `shape:${symbol}`;
  return (
    <button type="button" className={styles.shapeButton} aria-label={`Play ${fmt.chord(symbol)}`} aria-pressed={sounder.playing === id} onClick={() => sounder.toggle(id, () => strumChord(symbol, tuning))}>
      <ChordDiagram voicing={voicing} size="xs" />
    </button>
  );
}
