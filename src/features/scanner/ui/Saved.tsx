/**
 * The moment the sheet becomes a song: a short celebration, the first bars as tab, what the Player
 * can do with it, and one big "Play it now".
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Celebration, Icon, LinkButton, Page, Text } from '@/ui';
import { TabView } from '@/ui/music';
import { playUi } from '@/core/audio';
import { loadSong } from '@/core/library';
import type { Song } from '@/core/song';
import type { ScanState } from '../engine/useScan';
import styles from './Saved.module.css';

/** The saved view. */
export function Saved({ scan }: { scan: ScanState }) {
  const saved = scan.saved!;
  const [song, setSong] = useState<Song | null>(null);
  const [fire, setFire] = useState(false);
  const listing = saved.listing;

  useEffect(() => {
    let live = true;
    void loadSong(listing.id)
      .then((s) => live && setSong(s))
      .catch(() => undefined);
    setFire(true);
    try {
      playUi('lessonComplete');
    } catch {
      /* sound is optional */
    }
    return () => {
      live = false;
    };
  }, [listing.id]);

  const facts = useMemo(() => {
    if (!song) return null;
    const t = song.bars[0]?.time;
    return [`${song.bars.length} ${song.bars.length === 1 ? 'bar' : 'bars'}`, t ? `${t.numerator}/${t.denominator}` : null, `${song.tempo[0]?.bpm ?? 90} BPM`, song.key ? `key of ${song.key.endsWith('m') ? `${song.key.slice(0, -1)} minor` : song.key}` : null, song.chords.length ? `${new Set(song.chords.map((c) => c.symbol)).size} chords` : null].filter(Boolean).join(' · ');
  }, [song]);

  return (
    <Page title={`${listing.title} is ready to play`} hideHeader width="content">
      <div className={styles.card} data-scan="saved">
        <Celebration fire={fire} intensity="medium" contained />
        <span className={styles.badge} aria-hidden="true">
          <Icon name="Music" size="lg" />
        </span>
        <p className={styles.eyebrow}>In your songs</p>
        <h1 className={styles.title} data-scan-saved-title="">
          {listing.title} is ready to play
        </h1>
        {facts && (
          <Text tone="muted" tabular>
            {facts}
          </Text>
        )}
        <div className={styles.actions}>
          <LinkButton to="play" params={[listing.id]} variant="primary" size="lg" iconLeft="Play" data-scan-open-player="">
            Play it now
          </LinkButton>
          <Button iconLeft="ScanLine" onClick={scan.reset}>
            Scan another sheet
          </Button>
          <LinkButton to="songs" variant="ghost" iconRight="ArrowRight">
            All your songs
          </LinkButton>
        </div>
        {song && (
          <div className={styles.preview}>
            <TabView song={song} bars={[0, Math.min(2, song.bars.length)]} size="md" barNumbers={false} aria-label={`The first bars of ${listing.title}`} />
          </div>
        )}
        <ul className={styles.next}>
          <li>
            <Icon name="Gauge" size="sm" /> Start slow: the Player can play it at half speed, and speed it up as you get it.
          </li>
          <li>
            <Icon name="Hourglass" size="sm" /> Wait mode waits for you on every note, so you play it right before moving on.
          </li>
          <li>
            <Icon name="Repeat" size="sm" /> Loop the hard bars until they feel easy.
          </li>
        </ul>
        {saved.warnings.length > 0 && (
          <details className={styles.warnings}>
            <summary>{saved.warnings.length === 1 ? 'One thing was adjusted' : `${saved.warnings.length} things were adjusted`}</summary>
            <ul>
              {saved.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Page>
  );
}
