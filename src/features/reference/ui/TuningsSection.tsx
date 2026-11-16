/**
 * Tunings: the guitar engine's catalog grouped players' way, each with its open strings, what to
 * change from standard, what it is for, and its sound.
 */
import { useMemo } from 'react';
import { usePrefs } from '@/core/progress';
import { Badge, LinkButton, Section, Text } from '@/ui';
import { TuningLabel } from '@/ui/music';
import { changeSummary, tuningGroups, type TuningRow } from '../model/tunings';
import { prettyName } from './format';
import { PlayIcon } from './IntervalsSection';
import type { SectionProps } from './SectionBody';
import { playOpenStrings } from './sound';
import styles from './Sections.module.css';

/** The tunings page. */
export function TuningsSection({ level, sounder }: SectionProps) {
  const prefs = usePrefs();
  const groups = useMemo(() => tuningGroups(), []);
  return (
    <div className={styles.stack}>
      <div className={styles.controls}>
        <Text tone="muted">Strings are listed low to high, the way you tune them. Tap play to hear the open strings.</Text>
        <LinkButton to="tuner" size="sm" iconLeft="Gauge">
          Open the tuner
        </LinkButton>
      </div>
      {groups.map((g) => (
        <Section key={g.id} level={level} title={g.title}>
          <ul className={styles.tuList}>
            {g.rows.map((r) => (
              <TuningItem key={r.id} row={r} mine={prefs.tuningId === r.id} sounder={sounder} />
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

function TuningItem({ row, mine, sounder }: { row: TuningRow; mine: boolean; sounder: SectionProps['sounder'] }) {
  const id = `tuning:${row.id}`;
  return (
    <li className={styles.tuRow} data-ref-item={row.id}>
      <div className={styles.tuHead}>
        <PlayIcon playing={sounder.playing === id} label={`Play the open strings of ${row.name}`} onClick={() => sounder.toggle(id, () => playOpenStrings(row.midi))} />
        <div className={styles.tuTitles}>
          <span className={styles.tuName}>
            {prettyName(row.name)}
            {mine && (
              <Badge tone="accent" size="sm" icon="Check">
                Your tuning
              </Badge>
            )}
          </span>
          <TuningLabel tuning={row.id} showName={false} className={styles.tuNotes} />
        </div>
      </div>
      <p className={styles.tuText}>{row.description}</p>
      {row.changes.length > 0 && <p className={styles.tuChange}>From standard: {changeSummary(row.changes)}</p>}
    </li>
  );
}
