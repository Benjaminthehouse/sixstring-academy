/**
 * Chords in every key: the diatonic triads (or sevenths) of all 15 major and 15 minor keys in one
 * table, keys down the side and numerals across, each column marked with its job.
 */
import { useEffect, useMemo, useState } from 'react';
import { href } from '@/app/router';
import { SegmentedControl, Switch, Text, cx } from '@/ui';
import { functionLetter } from '../model/circle';
import { keyFromParam } from '../model/circle';
import { FUNCTION_WORDS, harmonyTable } from '../model/harmony';
import { functionClass } from './CircleSection';
import type { SectionProps } from './SectionBody';
import styles from './Sections.module.css';

/** The harmony table page. */
export function HarmonySection({ item, reveal, fmt }: SectionProps) {
  const itemKey = keyFromParam(item);
  const [mode, setMode] = useState<'major' | 'minor'>(itemKey?.mode === 'minor' ? 'minor' : 'major');
  const [sevenths, setSevenths] = useState(false);
  useEffect(() => {
    if (itemKey) setMode(itemKey.mode === 'minor' ? 'minor' : 'major');
  }, [itemKey, reveal]);
  const table = useMemo(() => harmonyTable(mode, sevenths), [mode, sevenths]);

  return (
    <div className={styles.stack}>
      <div className={styles.controls}>
        <SegmentedControl
          aria-label="Major or minor keys"
          options={[
            { value: 'major', label: 'Major keys' },
            { value: 'minor', label: 'Minor keys' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Switch checked={sevenths} onChange={setSevenths} label="Seventh chords" />
      </div>

      <ul className={styles.legend} aria-label="What the colours mean">
        {(['tonic', 'subdominant', 'dominant'] as const).map((f) => (
          <li key={f} className={cx(styles.legendItem, functionClass(f))}>
            <span className={styles.fnDot} aria-hidden="true" />
            <strong>{functionLetter(f)}</strong> {FUNCTION_WORDS[f]}
          </li>
        ))}
      </ul>

      <div className={styles.tableFrame} tabIndex={0} aria-label={`Chords of every ${mode} key; scrolls sideways`}>
        <table className={cx(styles.table, styles.harmonyTable)}>
          <thead>
            <tr>
              <th scope="col" className={styles.stickyCol}>
                Key
              </th>
              {table.columns.map((c, i) => (
                <th key={`${c.roman}-${i}`} scope="col" className={cx(functionClass(c.function), c.harmonic && styles.harmonicCol)}>
                  <span className={styles.colRoman}>{fmt.roman(c.roman)}</span>
                  <span className={styles.colFn}>
                    <span className={styles.fnDot} aria-hidden="true" />
                    {functionLetter(c.function)}
                    {c.harmonic && <span className={styles.colHarm}> harm.</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.key.id} data-ref-item={r.key.id} className={cx(itemKey?.id === r.key.id && styles.rowMarked)}>
                <th scope="row" className={styles.stickyCol}>
                  <a className={styles.keyLink} href={href('reference', 'circle', r.key.id)}>
                    {fmt.key(r.key.name)}
                  </a>
                </th>
                {r.chords.map((c, i) => (
                  <td key={i} className={cx(styles.chordTd, table.columns[i].harmonic && styles.harmonicCol)}>
                    {fmt.chord(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Text variant="caption" tone="muted">
        Numerals count from the major scale, so in minor ♭III is the chord on the lowered third degree (many books write it III).
        {mode === 'minor' && ' The last two columns come from harmonic minor: its raised 7th turns v into a major V and ♭VII into a diminished vii°, which pull harder toward home.'}
      </Text>
    </div>
  );
}
