/**
 * What an import did: the songs added (already saved), what the importer had to guess for each,
 * and what could not be read and why. "Play it" is the next step; "Undo" takes them out again.
 */
import { Banner, Button, Callout, Icon, LinkButton, Sheet, Stack, Text, cx } from '@/ui';
import type { ImportedSong, LibraryError } from '@/core/library';
import { lengthLabel, sortedWarnings, withoutRhythmNote } from '../format';
import styles from './ImportResult.module.css';

/** The outcome of one import (one or more files, or a paste). */
export interface ImportOutcome {
  imported: ImportedSong[];
  failed: Array<{ name: string; error: LibraryError }>;
}

/** Props of `ImportResultSheet`. */
export interface ImportResultProps {
  outcome: ImportOutcome | null;
  onClose: () => void;
  onUndo: (outcome: ImportOutcome) => void;
  onEdit: (song: ImportedSong) => void;
}

const SHOWN_WARNINGS = 5;

function ImportedBlock({ item }: { item: ImportedSong }) {
  const notes = sortedWarnings(withoutRhythmNote(item.warnings, item.estimatedRhythm));
  const s = item.listing.summary;
  const facts = [item.formatName, s ? `${s.bars} ${s.bars === 1 ? 'bar' : 'bars'}` : null, s ? lengthLabel(s.seconds).short : null, `Level ${item.listing.level}`].filter(Boolean).join(' · ');
  return (
    <div className={styles.item} data-imported={item.listing.id}>
      <div className={styles.itemHead}>
        <span className={styles.itemIcon}>
          <Icon name="FileMusic" />
        </span>
        <span className={styles.itemText}>
          <span className={styles.itemTitle}>{item.listing.title}</span>
          <span className={styles.itemFacts}>{facts}</span>
        </span>
      </div>
      {item.estimatedRhythm && (
        <Callout tone="warn" label="Check the rhythm" icon="TriangleAlert">
          This kind of file does not say how long each note lasts, so the rhythm was worked out from the spacing. Listen in the player and fix anything that sounds off.
        </Callout>
      )}
      {notes.length ? (
        <div className={styles.notes} data-import-warnings={notes.length}>
          <p className={styles.notesTitle}>
            <Icon name="Info" size="sm" />
            {notes.length === 1 ? 'One thing the importer noted' : `${notes.length} things the importer noted`}
          </p>
          <ul className={styles.noteList}>
            {notes.slice(0, SHOWN_WARNINGS).map((n) => (
              <li key={n.text} className={cx(n.unsure && styles.unsure)}>
                {n.unsure && <span className={styles.unsureTag}>Unsure</span>}
                {n.text}
                {n.count > 1 && <span className={styles.count}> (×{n.count})</span>}
              </li>
            ))}
          </ul>
          {notes.length > SHOWN_WARNINGS && (
            <Text size="sm" tone="muted">
              And {notes.length - SHOWN_WARNINGS} more: the song’s details list them all.
            </Text>
          )}
        </div>
      ) : (
        !item.estimatedRhythm && (
          <p className={styles.clean}>
            <Icon name="CircleCheck" size="sm" />
            Read cleanly: nothing had to be guessed.
          </p>
        )
      )}
    </div>
  );
}

/** The sheet shown after an import. */
export function ImportResultSheet({ outcome, onClose, onUndo, onEdit }: ImportResultProps) {
  const imported = outcome?.imported ?? [];
  const failed = outcome?.failed ?? [];
  const one = imported.length === 1 ? imported[0] : null;
  const title = imported.length === 1 ? 'Added to your songs' : imported.length > 1 ? `Added ${imported.length} songs` : failed.length > 1 ? 'Those files could not be added' : 'That could not be added';
  const footer = (
    <>
      {imported.length > 0 && outcome && (
        <Button variant="ghost" iconLeft="Undo2" onClick={() => onUndo(outcome)}>
          Undo
        </Button>
      )}
      {one && (
        <Button iconLeft="Pencil" onClick={() => onEdit(one)}>
          Edit details
        </Button>
      )}
      {one ? (
        <LinkButton variant="primary" iconLeft="Play" to="play" params={[one.listing.id]}>
          Play it
        </LinkButton>
      ) : (
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      )}
    </>
  );
  return (
    <Sheet open={!!outcome} onClose={onClose} title={title} footer={footer} size="md">
      <Stack gap={4} data-import-result={imported.length ? 'added' : 'failed'}>
        {imported.map((item) => (
          <ImportedBlock key={item.listing.id} item={item} />
        ))}
        {failed.map((f) => (
          <Banner
            key={f.name}
            tone="bad"
            title={f.name ? `Could not add ${f.name}` : 'Could not add it'}
            actions={
              f.error.code === 'needs-scan' ? (
                <LinkButton size="sm" to="scan" iconLeft="ScanLine">
                  Scan a sheet
                </LinkButton>
              ) : undefined
            }
          >
            {f.error.message}
          </Banner>
        ))}
      </Stack>
    </Sheet>
  );
}
