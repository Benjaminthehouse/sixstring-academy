/**
 * One chord in a grid: its easiest diagram, its name, a tick when the learner knows it. A real
 * link to the chord's page. The diagram is worked out in idle time, so a grid of forty tiles
 * appears at once and fills in.
 */
import { memo } from 'react';
import { href } from '@/app/router';
import { cx, Icon } from '@/ui';
import { ChordDiagram, useMusicSettings } from '@/ui/music';
import { useVoicingSet } from '../hooks/data';
import { tileVoicing } from '../model/voicings';
import { chordParam, displaySymbol } from '../model/symbols';
import styles from './Library.module.css';

/** Props of a tile. */
export interface ChordTileProps {
  symbol: string;
  tuning: string;
  known?: boolean;
  /** The chord shown beside the list right now. */
  current?: boolean;
  /** A short line under the name ("minor seventh"). */
  sub?: string;
  /** Make the tile a button that picks the chord (in a picker) instead of a link to its page. */
  onPick?: (symbol: string) => void;
}

/** A chord tile. */
export const ChordTile = memo(function ChordTile({ symbol, tuning, known, current, sub, onPick }: ChordTileProps) {
  const { naming } = useMusicSettings();
  const set = useVoicingSet(symbol, tuning, true);
  const v = set ? tileVoicing(symbol, tuning) : null;
  const name = displaySymbol(symbol, { system: naming });
  const label = `${name}${sub ? `, ${sub}` : ''}${known ? ', you know this one' : ''}`;
  const inner = (
    <>
      {known && (
        <span className={styles.known} aria-hidden>
          <Icon name="Check" size={13} strokeWidth={3} />
        </span>
      )}
      <span className={cx(styles.tileDiagram)} aria-hidden>
        {v ? <ChordDiagram voicing={v} size="sm" title={false} /> : set ? <Icon name="CircleSlash" size="lg" /> : <span className={styles.placeholder} />}
      </span>
      <span className={styles.tileName} aria-hidden>
        {name}
      </span>
      {sub && (
        <span className={styles.tileSub} aria-hidden>
          {sub}
        </span>
      )}
    </>
  );
  if (onPick) {
    return (
      <button type="button" className={styles.tile} aria-pressed={!!current} aria-label={label} data-chord={symbol} onClick={() => onPick(symbol)}>
        {inner}
      </button>
    );
  }
  return (
    <a className={styles.tile} href={href('chords', chordParam(symbol))} aria-current={current ? 'page' : undefined} aria-label={label} data-chord={symbol} data-known={known || undefined}>
      {inner}
    </a>
  );
});
