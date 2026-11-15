import { useMemo, useState } from 'react';
import { href } from '@/app/router';
import { useProgress } from '@/core/progress';
import { Button, Icon, LinkButton, Page, Section, StarRating, Text, cx } from '@/ui';
import { readRecord, strengths, weakSpots } from '../core/adapt';
import { LADDER } from '../core/drills';
import { currentLevel, drillSkillId, levelStatuses } from '../core/progress';
import type { DrillDef } from '../core/types';
import { SoundSheet } from './SoundSheet';
import { useEarSettings } from './useEarSettings';
import styles from './Ear.module.css';

/** One drill: its levels as a list (locked ones say how they open), weak spots and sound choices. Route `#ear--<drill>`. */
export function DrillScreen({ drill }: { drill: DrillDef }) {
  const skills = useProgress((s) => s.skills);
  const [settings, setSettings] = useEarSettings();
  const [sheet, setSheet] = useState(false);
  const statuses = levelStatuses(drill, skills);
  const current = currentLevel(drill, skills);
  const rung = LADDER.findIndex((d) => d.id === drill.id) + 1;
  const record = useMemo(() => readRecord(skills[drillSkillId(drill.id)]?.data), [skills, drill.id]);
  const weak = weakSpots(drill, record, { limit: 4 });
  const everyAnswer = [...new Set(drill.levels.flatMap((l) => l.pool))];
  const sure = strengths(record, everyAnswer).slice(0, 4);
  const passed = statuses.filter((s) => s.passed).length;

  return (
    <Page
      title={drill.title}
      eyebrow={`Rung ${rung} of ${LADDER.length} · ${passed} of ${drill.levels.length} levels passed`}
      subtitle={drill.trains}
      back={{ to: 'ear', label: 'Ear Training' }}
      actions={
        <LinkButton variant="primary" size="lg" to="ear" params={[drill.id, String(current)]} iconLeft="Play" data-ear-play-level={current}>
          Play level {current}
        </LinkButton>
      }
    >
      <div className={styles.drillLayout}>
        <Section title="Levels" description="Each level adds choices. Score 80% in a round to open the next one.">
          <ol className={styles.levels}>
            {drill.levels.map((l, i) => {
              const s = statuses[i];
              const isCurrent = l.n === current && !s.passed;
              return (
                <li key={l.n}>
                  <a
                    className={cx(styles.level, !s.unlocked && styles.levelLocked, isCurrent && styles.levelCurrent)}
                    href={href('ear', drill.id, String(l.n))}
                    aria-label={`Level ${l.n}: ${l.title}. ${l.blurb}. ${s.passed ? `Passed, best ${Math.round(s.best * 100)}%` : s.unlocked ? (s.completions ? `Best ${Math.round(s.best * 100)}%` : 'Open') : 'Locked'}`}
                    data-ear-level={l.n}
                    data-locked={!s.unlocked || undefined}
                  >
                    <span className={cx(styles.levelNum, s.passed && styles.levelNumDone)} aria-hidden="true">
                      {s.passed ? <Icon name="Check" size={16} strokeWidth={3} /> : s.unlocked ? l.n : <Icon name="Lock" size={14} />}
                    </span>
                    <span className={styles.rungText}>
                      <span className={styles.rungTitle}>
                        {l.title}
                        {isCurrent && <span className={styles.tag}> · Next</span>}
                      </span>
                      <span className={styles.rungSub}>
                        {l.blurb} · {l.pool.length} choices
                      </span>
                    </span>
                    <span className={styles.rungMeta}>
                      {/* A round left early has no score: the record starts with the first finished round. */}
                      {s.completions > 0 ? (
                        <>
                          <StarRating value={s.stars} size={12} label={`${s.stars} of 3 stars`} />
                          <span>Best {Math.round(s.best * 100)}%</span>
                        </>
                      ) : !s.unlocked ? (
                        <span>Opens after level {l.n - 1}</span>
                      ) : null}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </Section>

        <div className={styles.hubSide}>
          <Section title="Your ears here" level={2}>
            {weak.length > 0 ? (
              <ul className={styles.weak}>
                {weak.map((w) => (
                  <li key={`${w.answer}>${w.chosen}`} className={styles.weakItem}>
                    <Icon name="Ear" size={18} className={styles.weakIcon} />
                    <span className={styles.weakText}>
                      <Text>{w.sentence}</Text>
                      <Text size="sm" tone="muted">
                        {w.count} {w.count === 1 ? 'time' : 'times'}
                      </Text>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Text tone="muted">No weak spots yet. After a few rounds this shows what you mix up, in plain words, and the rounds ask more of it.</Text>
            )}
            {sure.length > 0 && (
              <Text tone="muted">
                <Icon name="Sparkles" size="xs" /> Sure of: {sure.map((id) => drill.info(id).label).join(', ')}
              </Text>
            )}
          </Section>
          <Section title="Sound" level={2}>
            <Text tone="muted">
              {settings.tone === 'nylon' ? 'Nylon-string' : settings.tone === 'clean' ? 'Electric' : 'Steel-string'} guitar, {settings.root === 'random' ? 'a random root each question' : 'always the same root'}
              {settings.showFirstNote ? ', first note named' : ''}.
            </Text>
            <div>
              <Button iconLeft="SlidersHorizontal" onClick={() => setSheet(true)}>
                Sound choices
              </Button>
            </div>
          </Section>
        </div>
      </div>
      <SoundSheet open={sheet} onClose={() => setSheet(false)} settings={settings} onChange={setSettings} drill={drill.id} />
    </Page>
  );
}
