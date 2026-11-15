/**
 * Pick a chord for the trainer: the first chords (known ones ticked) and a search for anything else.
 * A bottom sheet on phones, a dialog on wide screens.
 */
import { useMemo, useState } from 'react';
import { Section, SearchField, Sheet, Text } from '@/ui';
import { FIRST_CHORDS, searchChords } from '../model/catalog';
import { ChordTile } from './ChordTile';
import styles from './Library.module.css';

/** Props of the picker. */
export interface ChordPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (symbol: string) => void;
  tuning: string;
  known: ReadonlySet<string>;
  /** Chords already in the set (shown as selected). */
  chosen: readonly string[];
  title?: string;
}

/** The chord picker sheet. */
export function ChordPicker({ open, onClose, onPick, tuning, known, chosen, title = 'Pick a chord' }: ChordPickerProps) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchChords(query, 18).flatMap((h) => (h.kind === 'chord' ? [h.symbol] : [])), [query]);
  const mine = [...known].filter((s) => !FIRST_CHORDS.includes(s)).sort();
  const pick = (s: string) => {
    onPick(s);
    setQuery('');
  };
  const grid = (list: readonly string[]) => (
    <div className={styles.grid}>
      {list.map((s) => (
        <ChordTile key={s} symbol={s} tuning={tuning} known={known.has(s)} current={chosen.includes(s)} onPick={pick} />
      ))}
    </div>
  );
  return (
    <Sheet open={open} onClose={onClose} title={title} size="lg">
      <div className={styles.panel}>
        <SearchField value={query} onChange={setQuery} label="Search chords" placeholder="Any chord: Bm7, F#, Cadd9…" data-autofocus />
        {query.trim() ? (
          results.length ? grid(results) : <Text tone="muted">No chord matches that. Try a symbol such as Am7 or D/F#.</Text>
        ) : (
          <>
            <Section title="First chords" level={3}>
              {grid(FIRST_CHORDS)}
            </Section>
            {mine.length > 0 && (
              <Section title="More of your chords" level={3}>
                {grid(mine)}
              </Section>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
