import { useMemo, useState } from 'react';
import { useScreenTitle } from '@/app/shell';
import { Button, Card, Icon, LinkButton, Page, Section, Text } from '@/ui';
import { Fretboard, useMusicSettings } from '@/ui/music';
import { useSkill } from '@/core/progress';
import { fretCount, learnerTuning } from '@/core/settings';
import { boxOf, patternOf, regionOf, scaleTitle, shapeTitle } from '../core/focus';
import { GAMES, gameById, levelsOf, scopeOf } from '../core/games';
import { highestOpen, nextLevel, starsIn } from '../core/records';
import { dailyChallenge, localDateKey } from '../core/daily';
import { gameParams, skillIdFor } from '../core/skill';
import { setFocus, useRecords } from './store';
import { FocusSheet } from './FocusSheet';
import { noteMarker } from './kit';
import styles from './Arcade.module.css';

/** The arcade: what you are practising, today's challenge, and the games with your stars and bests. */
export function Hub() {
  useScreenTitle(null);
  const records = useRecords();
  const focus = records.focus;
  const { naming } = useMusicSettings();
  const [sheet, setSheet] = useState(false);
  const tuning = useMemo(() => learnerTuning(), []);
  const frets = useMemo(() => fretCount(), []);
  const pattern = useMemo(() => patternOf(focus, tuning, frets), [focus, tuning, frets]);
  const markers = useMemo(() => pattern.notes.map((n) => noteMarker(n, { label: 'degree', color: 'degree' })), [pattern]);
  const skill = useSkill(skillIdFor('note-hunt', focus, 1));
  const today = localDateKey();
  const stages = useMemo(
    () => dailyChallenge(today, focus, (g) => highestOpen(records, g, scopeOf(g, focus), levelsOf(g, focus, tuning, frets).length)),
    [today, focus, records, tuning],
  );
  const daily = records.daily?.date === today ? records.daily : null;
  const crowns = skill?.mastery ?? 0;

  return (
    <Page title="Scale Arcade" subtitle="Short games that put scales into your fingers, eyes and ears.">
      <div className={styles.hero}>
        <Card padding="lg" className={styles.focusCard} data-arcade-focus-card>
          <div className={styles.focusHead}>
            <div className={styles.focusText}>
              <span className={styles.eyebrow}>Practising</span>
              <span className={styles.focusTitle}>{scaleTitle(focus, naming)}</span>
              <span className={styles.focusSub}>{shapeTitle(pattern)}</span>
            </div>
            <div className={styles.crownBox}>
              <div className={styles.crowns} aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <Icon key={i} name="Crown" size={18} className={i < crowns ? styles.crownOn : styles.crownOff} />
                ))}
              </div>
              <span className={styles.crownText}>{crowns} of 5 crowns</span>
            </div>
          </div>
          <div className={styles.focusBoard}>
            <Fretboard frets={regionOf(pattern)} tuning={tuning} markers={markers} box={boxOf(pattern)} size="sm" aria-label={`${scaleTitle(focus, naming)}, ${pattern.name}`} />
          </div>
          <div className={styles.focusActions}>
            <Button iconLeft="SlidersHorizontal" onClick={() => setSheet(true)} wrap data-arcade-change>
              Change scale or shape
            </Button>
            <LinkButton to="scales" params={gameParams('note-hunt', focus).slice(1)} variant="ghost" iconRight="ArrowRight" wrap>
              Learn it on the Scales page
            </LinkButton>
          </div>
        </Card>

        <Card padding="lg" variant="raised" className={styles.dailyCard} data-arcade-daily-card>
          <span className={styles.eyebrow}>Today’s challenge</span>
          <span className={styles.dailyTitle}>Three quick games on {scaleTitle(focus, naming)}</span>
          <ol className={styles.dailyList}>
            {stages.map((s, i) => {
              const g = gameById(s.game)!;
              return (
                <li key={i}>
                  <span className={styles.dailyIcon} aria-hidden="true">
                    <Icon name={g.icon} size={18} />
                  </span>
                  <span>
                    {g.title} <Text as="span" size="sm" tone="muted">· level {s.level}</Text>
                  </span>
                </li>
              );
            })}
          </ol>
          {daily?.done ? (
            <Text size="sm" tone="ok" weight="semibold">
              <Icon name="CircleCheck" size={16} /> Done today: {daily.score.toLocaleString()} points, {daily.stars} {daily.stars === 1 ? 'star' : 'stars'}
            </Text>
          ) : (
            <Text size="sm" tone="muted">About three minutes. A new one every day.</Text>
          )}
          <LinkButton to="arcade" params={['daily']} variant="primary" size="lg" iconLeft="CalendarCheck" fullWidth wrap data-arcade-daily>
            {daily?.done ? 'Play it again' : 'Play today’s challenge'}
          </LinkButton>
        </Card>
      </div>

      <Section title="Games" description="Each one drills the scale a different way. Stars open new levels.">
        <div className={styles.gameGrid}>
          {GAMES.map((g) => {
            const levels = levelsOf(g.id, focus, tuning, frets);
            const scope = scopeOf(g.id, focus);
            const st = starsIn(records, g.id, scope, levels.length);
            const best = records.bests[g.id];
            const lvl = nextLevel(records, g.id, scope, levels.length);
            return (
              <Card key={g.id} to="arcade" params={gameParams(g.id, focus)} padding="md" className={styles.gameCard} data-arcade-game={g.id}>
                <div className={styles.gameCardTop}>
                  <span className={styles.gameIcon} aria-hidden="true">
                    <Icon name={g.icon} size={24} />
                  </span>
                  <span className={styles.gameCardText}>
                    <span className={styles.gameTitle}>{g.title}</span>
                    <span className={styles.gameBlurb}>{g.blurb}</span>
                  </span>
                </div>
                <div className={styles.gameMeta}>
                  <span className={styles.metaStars} aria-label={`${st.stars} of ${st.max} stars`}>
                    <Icon name="Star" size={16} className={st.stars ? styles.starIcon : styles.starIconOff} />
                    <span>
                      {st.stars}/{st.max}
                    </span>
                  </span>
                  <span className={styles.metaBest}>{best ? `Best ${best.score.toLocaleString()}` : 'Not played yet'}</span>
                  <span className={styles.metaLevel}>Level {lvl}</span>
                  {g.mic && <Icon name="Mic" size={16} label="Plays with your guitar" className={styles.micIcon} />}
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      <FocusSheet
        open={sheet}
        focus={focus}
        onClose={() => setSheet(false)}
        onPick={(f) => {
          setFocus(f);
          setSheet(false);
        }}
      />
    </Page>
  );
}
