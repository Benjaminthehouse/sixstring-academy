/**
 * Chords in every key: the diatonic triads (or sevenths) of all 15 major and 15 minor keys in one
 * table, keys down the side and numerals across, each column marked with its job.
 */
import { useEffect, useMemo, useState } from 'react';
import { href } from '@/app/router';
import { SegmentedControl, Switch, Text, cx } from '@/ui';
import { functionLetter } from '../model/circle';
import { keyFromParam } from '../model/circle';
import { FUNCTION_WORDS, MINOR_KINDS, harmonyCaption, harmonyTable, minorKindFromParam, type MinorKind } from '../model/harmony';
import { functionClass } from './CircleSection';
import type { SectionProps } from './SectionBody';
import styles from './Sections.module.css';

/** The harmony table page. */
export function HarmonySection({ item, reveal, fmt }: SectionProps) {
  const itemKey = keyFromParam(item);
  const itemMinor = minorKindFromParam(item);
  const [mode, setMode] = useState<'major' | 'minor'>(itemKey?.mode === 'minor' || itemMinor ? 'minor' : 'major');
  const [minor, setMinor] = useState<MinorKind>(itemMinor ?? 'natural');
  const [sevenths, setSevenths] = useState(false);
  useEffect(() => {
    if (itemKey) setMode(itemKey.mode === 'minor' ? 'minor' : 'major');
    if (itemMinor) {
      setMode('minor');
      setMinor(itemMinor);
    }
  }, [itemKey, itemMinor, reveal]);
  const table = useMemo(() => harmonyTable(mode, sevenths, minor), [mode, sevenths, minor]);

  return (
    <div className={styles.stack}>
      <div className={styles.controls} data-ref-item={itemMinor ? item ?? undefined : undefined}>
        <SegmentedControl
          aria-label="Major or minor keys"
          options={[
            { value: 'major', label: 'Major keys' },
            { value: 'minor', label: 'Minor keys' },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'minor' && <SegmentedControl aria-label="Which minor scale" options={MINOR_KINDS.map((k) => ({ value: k.value, label: k.label }))} value={minor} onChange={setMinor} />}
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

      <div className={styles.tableFrame} tabIndex={0} aria-label={`Chords of every ${mode} key${mode === 'minor' && minor !== 'natural' ? `, from ${minor} minor` : ''}; scrolls sideways`}>
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
        {harmonyCaption(mode, minor)}
      </Text>
    </div>
  );
}
