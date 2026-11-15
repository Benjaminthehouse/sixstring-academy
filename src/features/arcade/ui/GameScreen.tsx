import { useMemo, useState } from 'react';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { ActionBar, Badge, Button, Icon, LinkButton, List, ListItem, Page, Section, StarRating, Text } from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { learnerTuning } from '@/core/settings';
import { patternOf, scaleTitle, shapeTitle, type Focus } from '../core/focus';
import { levelsOf, scopeOf, type GameDef } from '../core/games';
import { isUnlocked, levelRecord, nextLevel, starsIn } from '../core/records';
import { gameParams, levelParams } from '../core/skill';
import { setFocus, useRecords } from './store';
import { FocusSheet } from './FocusSheet';
import { navigate } from '@/app/router';
import styles from './Arcade.module.css';

const TRAINS: Record<string, { icon: string; label: string }> = {
  fingers: { icon: 'Hand', label: 'Fingers' },
  eyes: { icon: 'Eye', label: 'Eyes' },
  ears: { icon: 'Ear', label: 'Ears' },
};

/** One game: how it works, its levels with stars and locks, and the level to play next. */
export function GameScreen({ game, focus }: { game: GameDef; focus: Focus }) {
  useImmersive(true, 'none');
  useScreenTitle(game.title);
  const records = useRecords();
  const { naming } = useMusicSettings();
  const [sheet, setSheet] = useState(false);
  const tuning = useMemo(() => learnerTuning(), []);
  const levels = useMemo(() => levelsOf(game.id, focus, tuning), [game.id, focus, tuning]);
  const pattern = useMemo(() => patternOf(focus, tuning), [focus, tuning]);
  const scope = scopeOf(game.id, focus);
  const next = nextLevel(records, game.id, scope, levels.length);
  const nextInfo = levels.find((l) => l.n === next) ?? levels[0];
  const stars = starsIn(records, game.id, scope, levels.length);
  const best = records.bests[game.id];
  const usesShape = game.id !== 'mode-match' && game.id !== 'shape-builder' && game.id !== 'fretboard-sprint';

  return (
    <Page
      title={game.title}
      eyebrow="Scale Arcade"
      subtitle={game.blurb}
      back={{ to: 'arcade', label: 'Scale Arcade' }}
    >
      <div className={styles.gameLayout}>
        <div className={styles.gameSide}>
          {game.id !== 'mode-match' && (
            <div className={styles.focusBar} data-arcade-focus>
              <Icon name="Waypoints" size={20} className={styles.focusBarIcon} />
              <span className={styles.focusBarText}>
                <span className={styles.focusBarTitle}>{scaleTitle(focus, naming)}</span>
                <span className={styles.focusBarSub}>{usesShape ? shapeTitle(pattern) : game.id === 'shape-builder' ? `${levels.length} shapes, one per level` : 'Across the neck, frets 0–12'}</span>
              </span>
              <Button size="sm" variant="ghost" iconLeft="SlidersHorizontal" onClick={() => setSheet(true)} data-arcade-change>
                Change
              </Button>
            </div>
          )}
          <Section title="How it works" level={2}>
            <ol className={styles.howList}>
              {game.how.map((h, i) => (
                <li key={i}>
                  <span className={styles.howNum} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{h}</span>
                </li>
              ))}
            </ol>
            <div className={styles.trainRow}>
              {game.trains.map((t) => (
                <Badge key={t} tone="neutral" icon={TRAINS[t].icon}>
                  {TRAINS[t].label}
                </Badge>
              ))}
              {game.mic && (
                <Badge tone="info" icon="Mic">
                  Plays with your guitar
                </Badge>
              )}
            </div>
          </Section>
          <div className={styles.recordRow}>
            <div>
              <span className={styles.recordLabel}>Stars</span>
              <span className={styles.recordValue}>
                <Icon name="Star" size={18} className={styles.starIcon} /> {stars.stars} / {stars.max}
              </span>
            </div>
            <div>
              <span className={styles.recordLabel}>Best score</span>
              <span className={styles.recordValue}>{best ? best.score.toLocaleString() : '–'}</span>
            </div>
          </div>
        </div>

        <Section title="Levels" level={2} description={game.id === 'mode-match' ? 'A star opens the next level.' : `A star opens the next level. Levels are kept for each scale.`}>
          <List variant="card" data-arcade-levels>
            {levels.map((l) => {
              const rec = levelRecord(records, game.id, scope, l.n);
              const open = isUnlocked(records, game.id, scope, l.n);
              return (
                <ListItem
                  key={l.n}
                  to="arcade"
                  params={levelParams(game.id, focus, l.n)}
                  leading={
                    <span className={open ? styles.levelNum : styles.levelNumLocked} aria-hidden="true">
                      {open ? l.n : <Icon name="Lock" size={16} />}
                    </span>
                  }
                  title={`${l.n}. ${l.title}`}
                  subtitle={open ? l.goal : `Opens with a star on level ${l.n - 1}. ${l.goal}`}
                  trailing={<StarRating value={rec?.stars ?? 0} size={16} label={`${rec?.stars ?? 0} of 3 stars`} />}
                  selected={l.n === next}
                  wrap
                  data-arcade-level={l.n}
                  data-locked={open ? undefined : 'true'}
                />
              );
            })}
          </List>
        </Section>
      </div>

      <ActionBar start={<Text size="sm" tone="muted" className={styles.actionHint}>Level {next} of {levels.length}</Text>}>
        <LinkButton to="arcade" params={levelParams(game.id, focus, next)} variant="primary" size="lg" iconLeft="Play" wrap data-arcade-play>
          Play level {next}: {nextInfo.title}
        </LinkButton>
      </ActionBar>

      <FocusSheet
        open={sheet}
        focus={focus}
        onClose={() => setSheet(false)}
        onPick={(f) => {
          const next = setFocus(f);
          setSheet(false);
          navigate('arcade', ...gameParams(game.id, next));
        }}
      />
    </Page>
  );
}
