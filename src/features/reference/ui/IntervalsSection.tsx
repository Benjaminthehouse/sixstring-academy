/**
 * Intervals: the table of every simple interval (tap a row to hear it and see its shape on the
 * neck), the G–B exception, and the compound intervals beyond the octave.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Callout, IconButton, Section, Text, cx } from '@/ui';
import { Fretboard, degreeColor, type FretMarker } from '@/ui/music';
import { compoundRows, consonanceWords, fretMoveWords, intervalById, intervalRows, intervalShape, intervalSlug, type IntervalRow } from '../model/intervals';
import type { SectionProps } from './SectionBody';
import { playInterval } from './sound';
import styles from './Sections.module.css';

/** The lower note of every example: D3, string 5 fret 5. */
const ROOT_MIDI = 50;

/** The intervals page. */
export function IntervalsSection({ item, reveal, level, fmt, sounder }: SectionProps) {
  const rows = useMemo(() => intervalRows(), []);
  const compounds = useMemo(() => compoundRows(), []);
  const [selected, setSelected] = useState<string>(() => {
    const r = intervalById(item);
    return r && rows.some((x) => x.id === r.id) ? r.id : 'M3';
  });
  useEffect(() => {
    const r = intervalById(item);
    if (r && rows.some((x) => x.id === r.id)) setSelected(r.id);
  }, [item, reveal, rows]);

  const row = rows.find((r) => r.id === selected) ?? rows[4];
  const shape = useMemo(() => intervalShape(row.semitones), [row.semitones]);
  const markers = useMemo<FretMarker[]>(
    () =>
      shape.pairs.flatMap((p) => [
        { string: p.root.string, fret: p.root.fret, label: 'R', color: 'deg-1', root: true, id: `${p.across}-r` },
        { string: p.upper.string, fret: p.upper.fret, label: row.id, color: degreeColor(row.degree), id: `${p.across}-u` },
      ]),
    [shape, row.id, row.degree],
  );
  const soundId = `interval:${row.id}`;
  const play = (r: IntervalRow) => sounder.toggle(`interval:${r.id}`, () => playInterval(ROOT_MIDI, r.semitones));

  return (
    <div className={styles.stack}>
      <div className={styles.intervalHero} aria-live="polite">
        <div className={styles.intervalHead}>
          <div>
            <p className={styles.kicker}>
              {row.semitones} half step{row.semitones === 1 ? '' : 's'} · inverts to {row.inversion}
            </p>
            <p className={styles.keyName}>
              <span className={styles.mono}>{row.id}</span> {row.name}
            </p>
            <Text tone="muted">
              From {fmt.note('C')} up to {fmt.note(row.fromC)}. {consonanceWords(row.consonance)}.
            </Text>
          </div>
          <Button variant="primary" iconLeft={sounder.playing === soundId ? 'Square' : 'Play'} pressed={sounder.playing === soundId} onClick={() => play(row)}>
            {sounder.playing === soundId ? 'Stop' : 'Hear it'}
          </Button>
        </div>
        <div className={styles.neck}>
          <Fretboard frets={shape.frets} markers={markers} size="md" fretNumbers="all" />
        </div>
        <div className={styles.shapeNotes}>
          <p>
            <span className={styles.shapeTag}>Strings 5→4</span> and every pair a fourth apart: <strong>{fretMoveWords(row.nextString)}</strong> on the next string.
          </p>
          <p>
            <span className={cx(styles.shapeTag, styles.shapeTagAlt)}>Strings 3→2</span> from G to B: <strong>{fretMoveWords(row.gToB)}</strong>, one fret further.
          </p>
        </div>
      </div>

      <Callout label="The G–B exception" title="Why shapes shift on the B string">
        Neighbouring strings are tuned a fourth apart (5 half steps) except G to B, which is a major third (4). So any shape that crosses from string 3 to string 2 needs one fret more on string 2 to keep the same interval.
      </Callout>

      <Section level={level} title="Every interval up to the octave" description="Tap a row to hear it and see it on the neck.">
        <div className={styles.ivTable} role="list">
          <div className={styles.ivHead} aria-hidden="true">
            <span>Half steps</span>
            <span>Interval</span>
            <span>Inversion</span>
            <span>From {fmt.note('C')}</span>
            <span>Next string</span>
            <span>G→B</span>
          </div>
          {rows.map((r) => (
            <div role="listitem" key={r.id} data-ref-item={intervalSlug(r.id)}>
              <button type="button" className={cx(styles.ivRow, r.id === selected && styles.ivSelected)} aria-pressed={r.id === selected} onClick={() => {
                setSelected(r.id);
                play(r);
              }}>
                <span className={styles.ivSemis}>{r.semitones}</span>
                <span className={styles.ivName}>
                  <span className={styles.ivShort}>{r.id}</span>
                  <span>{r.name}</span>
                </span>
                <span className={styles.ivCell}>
                  <span className={styles.ivLabel}>Inverts to </span>
                  {r.inversion}
                </span>
                <span className={styles.ivCell}>
                  <span className={styles.ivLabel}>From {fmt.note('C')}: </span>
                  {fmt.note('C')}–{fmt.note(r.fromC)}
                </span>
                <span className={styles.ivCell}>
                  <span className={styles.ivLabel}>Next string: </span>
                  {fretMoveWords(r.nextString)}
                </span>
                <span className={styles.ivCell}>
                  <span className={styles.ivLabel}>G→B: </span>
                  {fretMoveWords(r.gToB)}
                </span>
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section level={level} title="Beyond the octave" description="Compound intervals: the 9ths, 11ths and 13ths of chords are seconds, fourths and sixths an octave up.">
        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Interval</th>
                <th scope="col">Half steps</th>
                <th scope="col">Octave above</th>
                <th scope="col">From {fmt.note('C')}</th>
                <th scope="col">
                  <span className={styles.srOnly}>Play</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {compounds.map((r) => {
                const id = `interval:${r.id}`;
                return (
                  <tr key={r.id} data-ref-item={intervalSlug(r.id)}>
                    <th scope="row">
                      <span className={styles.ivShort}>{r.id}</span> {r.name}
                    </th>
                    <td className={styles.num}>{r.semitones}</td>
                    <td>{r.simple}</td>
                    <td>
                      {fmt.note('C')}–{fmt.note(r.fromC)}
                    </td>
                    <td className={styles.playCell}>
                      <PlayIcon playing={sounder.playing === id} label={`Play a ${r.name}`} onClick={() => sounder.toggle(id, () => playInterval(ROOT_MIDI - 12, r.semitones))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

/** A small round play / stop button for a table row. */
export function PlayIcon({ playing, label, onClick }: { playing: boolean; label: string; onClick: () => void }) {
  return <IconButton icon={playing ? 'Square' : 'Play'} label={playing ? 'Stop' : label} variant="secondary" round size="sm" pressed={playing} onClick={onClick} />;
}
