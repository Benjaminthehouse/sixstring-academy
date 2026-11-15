/**
 * "Name that shape" (`#chords--identify`, `#chords--identify--x32010`): tap frets on an empty neck
 * and the guitar engine names the chord, with the other names the same notes go by. Opens on an
 * example (an open C) so the first look already shows how it works.
 */
import { useCallback, useMemo, useState } from 'react';
import { formatFrets, noteAt, voicingFromFrets } from '@/core/guitar';
import { Button, ChipGroup, LinkButton, Section, SegmentedControl, Text, useIsMobile } from '@/ui';
import { degreeColor, Fretboard, NoteBadge, useMusicSettings, type FretCell, type FretMarker } from '@/ui/music';
import { useShortcuts } from '../hooks/keys';
import { strumVoicing } from '../hooks/sound';
import { emptyShape, EXAMPLE_SHAPE, fretSpan, nameShape, shapeFromParam, tapCell, type ShapeFrets } from '../model/shape';
import { chordParam, displaySymbol } from '../model/symbols';
import styles from './Shape.module.css';

/** Shapes to try, written as tab-style fret numbers so the name stays a surprise. */
const EXAMPLES = ['x32010', '022000', 'x02010', '133211', 'xx0212', 'x20202', 'xx4555', '032010'];

/** The "Name that shape" tool. */
export function NameShape({ initial, tuning }: { initial: string | null; tuning: string }) {
  const { naming } = useMusicSettings();
  const isMobile = useIsMobile();
  const [frets, setFrets] = useState<ShapeFrets>(() => shapeFromParam(initial) ?? [...EXAMPLE_SHAPE]);
  const [range, setRange] = useState<'low' | 'high'>(() => ((fretSpan(shapeFromParam(initial) ?? EXAMPLE_SHAPE)?.max ?? 0) > 7 ? 'high' : 'low'));
  const named = useMemo(() => nameShape(frets, tuning), [frets, tuning]);
  const voicing = useMemo(() => (named.sounding ? voicingFromFrets(frets, { tuning, ...(named.symbol ? { as: named.symbol } : {}) }) : null), [frets, named.symbol, named.sounding, tuning]);

  const onCell = useCallback((cell: FretCell) => setFrets((f) => tapCell(f, cell.string, cell.fret)), []);
  const strum = () => voicing && strumVoicing(voicing);
  useShortcuts({ ' ': strum });

  const degreeOf = new Map(named.notes.map((n) => [`${n.string}:${n.fret}`, n.degree]));
  const markers: FretMarker[] = frets.flatMap((f, i) => {
    const string = frets.length - i;
    if (f === null || f === 0) return [];
    const degree = degreeOf.get(`${string}:${f}`) ?? null;
    const note = noteAt({ string, fret: f }, { tuning, octave: false });
    return [{ string, fret: f, note, noteLabel: true, label: note, color: degree ? degreeColor(degree) : 'neutral', root: degree === '1' }];
  });
  const open = frets.flatMap((f, i) => (f === 0 ? [frets.length - i] : []));
  const muted = frets.flatMap((f, i) => (f === null ? [frets.length - i] : []));
  const shown: [number, number] = isMobile ? (range === 'low' ? [0, 7] : [5, 12]) : [0, 12];
  const lowOut = isMobile && range === 'high' ? frets.some((f) => f !== null && f > 0 && f < 5) : false;

  const name = named.symbol ? displaySymbol(named.symbol, { system: naming }) : null;
  return (
    <div className={styles.layout} data-name-shape data-symbol={named.symbol ?? ''} data-frets={formatFrets(frets)}>
      <section className={styles.result} aria-live="polite" aria-label="What the app hears in your shape">
        <Text variant="eyebrow">{named.sounding ? 'Your shape' : 'Empty neck'}</Text>
        <p className={styles.shapeName} data-shape-name>
          {name ?? (named.sounding ? 'No chord name' : 'Tap a fret')}
        </p>
        <Text tone="muted" mono>
          {formatFrets(frets)}
        </Text>
        {named.sounding === 0 && <Text>Tap a fret to place a finger. Tap the open column (left of the nut) to let a string ring; tap a dot again to mute its string.</Text>}
        {named.sounding > 0 && !named.symbol && <Text>These notes do not make a chord the app can name. Try adding or moving one note.</Text>}
        {named.partial && name && <Text variant="caption" tone="muted">Named without its fifth (or a lesser tension): still {name}, just a thinner sound.</Text>}
        {named.notes.length > 0 && (
          <div className={styles.notes} aria-label="Notes, low to high">
            {named.notes.map((n) => (
              <NoteBadge key={`${n.string}:${n.fret}`} note={n.note} degree={n.degree ?? undefined} naming={naming} />
            ))}
          </div>
        )}
        {named.alternatives.length > 0 && (
          <div className={styles.alts}>
            <Text variant="label">Also read as</Text>
            <div className={styles.altList}>
              {named.alternatives.map((a) => (
                <LinkButton key={a.symbol} size="sm" variant="ghost" to="chords" params={[chordParam(a.symbol)]}>
                  {displaySymbol(a.symbol, { system: naming })}
                </LinkButton>
              ))}
            </div>
          </div>
        )}
        <div className={styles.actions}>
          <Button iconLeft="Volume2" onClick={strum} disabled={!voicing}>
            Strum it
          </Button>
          <Button variant="ghost" iconLeft="Eraser" onClick={() => setFrets(emptyShape(frets.length))}>
            Clear
          </Button>
          {named.symbol && (
            <LinkButton variant="primary" iconRight="ArrowRight" to="chords" params={[chordParam(named.symbol)]} data-open-chord>
              Open {name}
            </LinkButton>
          )}
        </div>
      </section>
      <section className={styles.boardSide} aria-label="The neck: tap to place fingers">
        {isMobile && (
          <SegmentedControl<'low' | 'high'>
            aria-label="Part of the neck"
            options={[
              { value: 'low', label: 'Frets 0–7' },
              { value: 'high', label: 'Frets 5–12' },
            ]}
            value={range}
            onChange={setRange}
            fullWidth
          />
        )}
        {lowOut && <Text variant="caption" tone="muted">Some fingers sit below fret 5; switch to frets 0–7 to see them.</Text>}
        <div className={styles.board}>
          <Fretboard tuning={tuning} frets={shown} orientation={isMobile ? 'vertical' : 'horizontal'} markers={markers.filter((m) => m.fret >= shown[0] && m.fret <= shown[1])} open={shown[0] === 0 ? open : []} muted={shown[0] === 0 ? muted : []} onCellClick={onCell} cellLabels="note" fretNumbers="all" aria-label="Tap the neck to build a chord shape" />
        </div>
        <Section title="Try a shape" level={3}>
          <ChipGroup aria-label="Example shapes" options={EXAMPLES.map((e) => ({ value: e, label: e }))} value={EXAMPLES.includes(formatFrets(frets)) ? formatFrets(frets) : null} onChange={(v) => setFrets(shapeFromParam(v) ?? [...EXAMPLE_SHAPE])} />
        </Section>
      </section>
    </div>
  );
}
