import { useMemo, useState } from 'react';
import { Fretboard, type FretMarker } from '@/ui/music';
import { SegmentedControl, Text, cx } from '@/ui';
import { isNatural, spell } from '../core/notes';
import { posKey } from '../core/neck';
import { heatMap, HEAT_WORDS, type HeatCell, type HeatLevel, type NeckStats } from '../core/stats';
import type { Trainer } from './useTrainer';
import styles from './Trainer.module.css';

type View = 'accuracy' | 'speed';

/** Colour, shape and words for each level: colour is never the only signal. */
const LOOK: Record<HeatLevel, Pick<FretMarker, 'color' | 'shape' | 'state' | 'root'>> = {
  new: { color: 'neutral', shape: 'ring', state: 'ghost' },
  weak: { color: 'bad', shape: 'square' },
  shaky: { color: 'info', shape: 'diamond' },
  good: { color: 'ok', shape: 'circle' },
  fluent: { color: 'ok', shape: 'circle', root: true },
};

type SpeedBand = 'quick' | 'steady' | 'slow';
const SPEED_LOOK: Record<SpeedBand, Pick<FretMarker, 'color' | 'shape'>> = {
  quick: { color: 'ok', shape: 'circle' },
  steady: { color: 'info', shape: 'diamond' },
  slow: { color: 'bad', shape: 'square' },
};
const SPEED_WORDS: Record<SpeedBand, string> = { quick: 'Under 2 seconds', steady: '2 to 4 seconds', slow: 'Over 4 seconds' };

function speedBand(ms: number): SpeedBand {
  return ms < 2000 ? 'quick' : ms <= 4000 ? 'steady' : 'slow';
}

function describe(c: HeatCell): string {
  if (c.accuracy === null) return 'not tried yet';
  const right = Math.round(c.accuracy * c.n);
  return `${right} of ${c.n} right${c.ms ? `, ${(c.ms / 1000).toFixed(1)} seconds` : ''}, ${HEAT_WORDS[c.level].toLowerCase()}`;
}

/** Props of {@link NeckMap}. */
export interface NeckMapProps {
  trainer: Trainer;
  stats: NeckStats;
  /** Frets shown (default 0 to the learner's neck length). */
  frets?: [number, number];
}

/**
 * The heat map of the neck: every place the learner has been asked, by how well they know it (or
 * how fast they answer). Untried natural notes are drawn faintly, so even a new map is a map.
 */
export function NeckMap({ trainer, stats, frets }: NeckMapProps) {
  const [view, setView] = useState<View>('accuracy');
  const range = frets ?? [0, trainer.maxFret];
  const cells = useMemo(() => heatMap(stats, trainer.ctx, range), [stats, trainer.ctx, range[0], range[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const flats = trainer.ctx.spelling === 'flats';
  const markers = useMemo<FretMarker[]>(() => {
    const out: FretMarker[] = [];
    // Places tried come first: the board's spoken description lists the first few dozen markers,
    // and what the learner has answered matters more than the faint "not tried yet" rings.
    const ordered = [...cells.filter((c) => c.level !== 'new'), ...cells.filter((c) => c.level === 'new')];
    for (const c of ordered) {
      const note = spell(c.pc, flats ? 'flats' : 'sharps');
      if (view === 'speed') {
        if (!c.ms) continue;
        const band = speedBand(c.ms);
        out.push({ string: c.string, fret: c.fret, ...SPEED_LOOK[band], label: (c.ms / 1000).toFixed(1), note, description: `${note}, ${(c.ms / 1000).toFixed(1)} seconds on average` });
        continue;
      }
      if (c.level === 'new' && !isNatural(c.pc)) continue;
      out.push({ string: c.string, fret: c.fret, ...LOOK[c.level], note, noteLabel: true, description: describe(c), id: posKey(c) });
    }
    return out;
  }, [cells, view, flats]);
  const counts = useMemo(() => {
    const n: Record<HeatLevel, number> = { new: 0, weak: 0, shaky: 0, good: 0, fluent: 0 };
    for (const c of cells) n[c.level]++;
    return n;
  }, [cells]);
  const timed = cells.filter((c) => c.ms).length;

  return (
    <div className={styles.map} data-fb-map>
      <div className={styles.mapTop}>
        <SegmentedControl
          aria-label="What the map shows"
          size="sm"
          options={[
            { value: 'accuracy', label: 'Accuracy' },
            { value: 'speed', label: 'Speed' },
          ]}
          value={view}
          onChange={(v) => setView(v as View)}
        />
        <Text size="sm" tone="muted">
          {view === 'accuracy' ? `${cells.length - counts.new} of ${cells.length} places tried` : `${timed} places timed`}
        </Text>
      </div>
      <div className={styles.mapBoard}>
        <Fretboard tuning={trainer.tuning} frets={range} markers={markers} size="md" fretNumbers="inlays" aria-label={`Your neck map, ${view === 'accuracy' ? 'by accuracy' : 'by speed'}`} />
      </div>
      <ul className={styles.legend} aria-label="Key">
        {view === 'accuracy'
          ? (['weak', 'shaky', 'good', 'fluent', 'new'] as HeatLevel[]).map((l) => (
              <li key={l} className={styles.legendItem}>
                <span className={cx(styles.swatch, styles[`sw-${l}`])} aria-hidden="true" />
                {HEAT_WORDS[l]}
                {l !== 'new' && counts[l] > 0 && <span className={styles.legendCount}>{counts[l]}</span>}
              </li>
            ))
          : (['quick', 'steady', 'slow'] as SpeedBand[]).map((b) => (
              <li key={b} className={styles.legendItem}>
                <span className={cx(styles.swatch, styles[`sw-${b}`])} aria-hidden="true" />
                {SPEED_WORDS[b]}
              </li>
            ))}
      </ul>
    </div>
  );
}
