/**
 * Scale formulas: every scale and mode with its formula, step pattern and notes on a chosen root;
 * hear it, or open it in Scales for its shapes on the neck.
 */
import { useMemo, useState } from 'react';
import { href } from '@/app/router';
import { SCALE_FAMILIES, noteToMidi, scaleNotes } from '@/core/theory';
import { ChipGroup, Section, Select, Text, useLocalState } from '@/ui';
import { prettyName } from '../model/names';
import { SCALE_ROOTS, displayAliases, scaleGroups, type ScaleRow } from '../model/scales';
import { PlayIcon } from './IntervalsSection';
import type { SectionProps } from './SectionBody';
import { playLine } from './sound';
import styles from './Sections.module.css';

/** The scale formulas page. */
export function ScalesSection({ item, level, fmt, sounder }: SectionProps) {
  const [pcRaw, setPc] = useLocalState<number>('reference.scaleRoot', 0);
  const pc = Number.isInteger(pcRaw) && pcRaw >= 0 && pcRaw < 12 ? pcRaw : 0;
  const [family, setFamily] = useState<string>('all');
  const groups = useMemo(() => scaleGroups(pc), [pc]);
  const itemGroup = item ? groups.find((g) => g.rows.some((r) => r.id === item))?.id : undefined;
  const visible = groups.filter((g) => family === 'all' || g.id === family || g.id === itemGroup);

  return (
    <div className={styles.stack}>
      <div className={styles.controls}>
        <Select
          label="Root"
          value={String(pc)}
          onChange={(v) => setPc(Number(v))}
          options={SCALE_ROOTS.map((r) => ({ value: String(r.pc), label: r.label.split('/').map(fmt.note).join(' / ') }))}
          className={styles.rootSelect}
        />
        <ChipGroup aria-label="Scale family" options={[{ value: 'all', label: 'All' }, ...SCALE_FAMILIES.map((f) => ({ value: f.id, label: f.name.replace(' modes', '') }))]} value={family} onChange={setFamily} className={styles.grow} />
      </div>
      <Text variant="caption" tone="muted">
        A formula counts each note against the major scale on the same root. Steps: H is a half step (1 fret), W a whole step (2 frets), WH a step and a half (3 frets) and 2W two whole steps (4 frets).
      </Text>
      {visible.map((g) => (
        <Section key={g.id} level={level} title={g.title} description={g.blurb}>
          <ul className={styles.scList}>
            {g.rows.map((r) => (
              <ScaleItem key={r.id} row={r} fmt={fmt} sounder={sounder} />
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

function ScaleItem({ row, fmt, sounder }: { row: ScaleRow; fmt: SectionProps['fmt']; sounder: SectionProps['sounder'] }) {
  const id = `scale:${row.tonic}:${row.id}`;
  const play = () =>
    sounder.toggle(id, () => {
      const notes = scaleNotes(`${row.tonic}3`, row.id, { closed: true });
      return playLine(notes.map((n) => noteToMidi(n)), 0.26);
    });
  const aka = displayAliases(row.name, row.aliases).map(prettyName);
  const name = prettyName(row.name);
  return (
    <li className={styles.scRow} data-ref-item={row.id}>
      <div className={styles.scMain}>
        <a className={styles.scName} href={href('scales', ...row.scalePage)}>
          {name}
        </a>
        {aka.length > 0 && <span className={styles.scAka}>also {aka.join(', ')}</span>}
      </div>
      <span className={styles.chFormula}>
        {row.degrees.map((d) => (
          <span key={d} className={styles.degree}>
            {fmt.degree(d)}
          </span>
        ))}
      </span>
      <span className={styles.scSteps}>{row.steps.join(' ')}</span>
      <span className={styles.chNotes}>{fmt.notes(row.notes)}</span>
      <span className={styles.scPlay}>
        <PlayIcon playing={sounder.playing === id} label={`Play ${fmt.note(row.tonic)} ${name}`} onClick={play} />
      </span>
    </li>
  );
}
