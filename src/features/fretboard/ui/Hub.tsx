import { useMemo, useState } from 'react';
import { href } from '@/app/router';
import { useProgress } from '@/core/progress';
import { Button, Card, Heading, Icon, LinkButton, Page, ProgressBar, Section, StarRating, Text, VisuallyHidden, cx } from '@/ui';
import { BLIND_SPOTS, DRILLS, drillSkillId } from '../core/drills';
import { fretWords } from '../core/explain';
import { STAGES, stageSkillId, stageTitle, stringName } from '../core/path';
import { pcAt } from '../core/neck';
import { spell } from '../core/notes';
import { blindSpots, notesLearnedOn, stringLearned, totals } from '../core/stats';
import { NeckMap } from './NeckMap';
import { SettingsSheet } from './SettingsSheet';
import { useTrainer } from './useTrainer';
import styles from './Trainer.module.css';

/** The fretboard trainer's home: the next step of the method, the neck map, the drills. */
export function Hub() {
  const trainer = useTrainer();
  const { ctx, fmt, stats, tuning } = trainer;
  const [sheet, setSheet] = useState(false);
  const skills = useProgress((s) => s.skills);

  const steps = STAGES.map((st) => {
    const sk = skills[stageSkillId(st)];
    const passed = !!sk && sk.bestAccuracy >= 0.8 && sk.completions > 0;
    return { stage: st, title: stageTitle(st, ctx, fmt), passed, tried: !!sk && sk.attempts > 0, best: sk && sk.attempts > 0 ? Math.round(sk.bestAccuracy * 100) : null, stars: sk?.stars ?? 0 };
  });
  const passedCount = steps.filter((s) => s.passed).length;
  const current = steps.find((s) => !s.passed) ?? null;
  const fresh = !steps.some((s) => s.tried);
  const sum = useMemo(() => totals(stats), [stats]);
  const spots = useMemo(() => blindSpots(stats, ctx, [0, trainer.maxFret], 4), [stats, ctx, trainer.maxFret]);
  const strings = Array.from({ length: tuning.stringCount }, (_, i) => i + 1);
  const learnedStrings = strings.filter((s) => stringLearned(stats, s) || skills[`fretboard:string-${s}`]?.completed);

  return (
    <Page
      title="Fretboard"
      subtitle="Learn every note on the neck, so you can play anywhere, not just in the shapes you know."
      actions={
        <Button variant="ghost" iconLeft="SlidersHorizontal" onClick={() => setSheet(true)} data-fb-settings>
          Practice settings
        </Button>
      }
    >
      <div className={styles.hub}>
          <Card variant="raised" padding="lg" className={styles.next} data-fb-next-step={current?.stage.id ?? 'done'}>
            <div className={styles.nextTop}>
              <span className={styles.nextIcon} aria-hidden="true">
                <Icon name={current ? 'Route' : 'Trophy'} size={26} />
              </span>
              <div className={styles.nextText}>
                <Text variant="eyebrow">{current ? (fresh ? 'Start here' : `Step ${current.stage.n} of ${STAGES.length}`) : 'The method is done'}</Text>
                <Heading level={2} size="xl" display>
                  {current ? current.title : 'Keep the neck fresh'}
                </Heading>
                <Text tone="muted">{current ? current.stage.blurb : 'Every step passed. Short drills keep it that way: your blind spots first.'}</Text>
              </div>
            </div>
            <ProgressBar label="The method" value={passedCount} max={STAGES.length} valueText={`${passedCount} of ${STAGES.length} steps`} tone="accent" segmented />
            {current ? (
              <LinkButton variant="primary" size="lg" fullWidth wrap to="fretboard" params={['stage', current.stage.id]} iconRight="ArrowRight" data-fb-continue-button>
                {fresh ? 'Start' : current.tried ? 'Continue' : 'Start'} step {current.stage.n}: {current.title}
              </LinkButton>
            ) : (
              <LinkButton variant="primary" size="lg" fullWidth to="fretboard" params={['drill', spots.length >= 3 ? 'blind-spots' : 'sprint']} iconRight="ArrowRight" data-fb-continue-button>
                {spots.length >= 3 ? 'Practise your blind spots' : 'Run a one-minute sprint'}
              </LinkButton>
            )}
          </Card>

          <Section className={styles.hubStrings} title="Your strings" description="A string is learned when all twelve of its notes come right, three times over, each in under five seconds.">
            <div className={styles.mapFacts}>
              <div className={styles.strings} aria-label="Strings learned">
                {strings.map((s) => {
                  const n = notesLearnedOn(stats, s);
                  const done = learnedStrings.includes(s);
                  return (
                    <div key={s} className={cx(styles.stringFact, done && styles.stringDone)}>
                      <span className={styles.stringName}>
                        {done && <Icon name="Check" size={14} strokeWidth={3} />}
                        {s} · {fmt(spell(pcAt(ctx, { string: s, fret: 0 }), 'sharps'))}
                      </span>
                      <span className={styles.stringBar} aria-hidden="true">
                        <span style={{ transform: `scaleX(${n / 12})` }} />
                      </span>
                      <Text size="xs" tone="muted">
                        {done ? 'Learned' : `${n} of 12`}
                      </Text>
                    </div>
                  );
                })}
              </div>
              <Text size="sm" tone="muted">
                {sum.answers === 0
                  ? 'Nothing on the map yet: it fills in as you practise.'
                  : `${sum.answers} answers so far, ${Math.round((sum.accuracy ?? 0) * 100)}% right${sum.avgMs ? `, ${(sum.avgMs / 1000).toFixed(1)} s on average` : ''}.`}
              </Text>
            </div>
          </Section>

          <Section className={styles.hubMap} title="Your neck map" description="Every place you have been asked, by how well you know it. The drills ask more of the weak ones.">
            <NeckMap trainer={trainer} stats={stats} />
            {spots.length > 0 && (
              <div className={styles.spots}>
                <Heading level={3} size="md">
                  Blind spots
                </Heading>
                <ul className={styles.spotList}>
                  {spots.map((b) => (
                    <li key={`${b.string}:${b.fret}`} className={styles.spot}>
                      <Icon name="Target" size={16} className={styles.spotIcon} />
                      <Text>
                        <strong>{fmt(spell(b.pc, ctx.spelling === 'flats' ? 'flats' : 'sharps'))}</strong> on {stringName(ctx, b.string, fmt)}, {fretWords(b.fret)}
                      </Text>
                      <Text size="sm" tone="muted" className={styles.spotMeta}>
                        {Math.round((b.accuracy ?? 0) * b.n)} of {b.n}
                      </Text>
                    </li>
                  ))}
                </ul>
                {spots.length >= 3 && (
                  <LinkButton to="fretboard" params={['drill', BLIND_SPOTS.id]} iconLeft="Target" data-fb-blind>
                    Practise these
                  </LinkButton>
                )}
              </div>
            )}
          </Section>

          <Section className={styles.hubDrills} title="Drills" description="Short rounds over the part of the neck you choose in Practice settings.">
            <div className={styles.drills}>
              {DRILLS.map((d) => {
                const sk = skills[drillSkillId(d.id)];
                return (
                  <Card key={d.id} to="fretboard" params={['drill', d.id]} padding="md" className={styles.drill} data-fb-drill={d.id}>
                    <span className={styles.drillIcon} aria-hidden="true">
                      <Icon name={d.icon} size={22} />
                    </span>
                    <span className={styles.drillText}>
                      <span className={styles.drillTitle}>{d.title}</span>
                      <span className={styles.drillBlurb}>{d.blurb}</span>
                    </span>
                    <span className={styles.drillMeta}>
                      {sk && sk.attempts > 0 ? (d.id === 'sprint' ? `Best ${sk.bestScore}` : `Best ${Math.round(sk.bestAccuracy * 100)}%`) : d.mic ? <Icon name="Mic" size={16} label="Uses the microphone" /> : null}
                    </span>
                  </Card>
                );
              })}
            </div>
          </Section>

          <Section className={styles.hubSteps} title="The method" description="Ten steps from the open strings to the whole neck. Every step is open: start wherever you like.">
            <ol className={styles.steps} aria-label="Steps of the method">
              {steps.map((s) => {
                const isNext = current?.stage.id === s.stage.id;
                return (
                  <li key={s.stage.id}>
                    <a className={cx(styles.step, isNext && styles.stepNext)} href={href('fretboard', 'stage', s.stage.id)} aria-current={isNext ? 'step' : undefined} data-fb-step={s.stage.id}>
                      <span className={cx(styles.stepMarker, s.tried && styles.stepTried, s.passed && styles.stepPassed)} aria-hidden="true">
                        {s.passed ? <Icon name="Check" size={16} strokeWidth={3} /> : s.stage.n}
                      </span>
                      <span className={styles.stepText}>
                        <span className={styles.stepTitle}>
                          {s.title}
                          {isNext && <span className={styles.stepTag}> · Next</span>}
                        </span>
                        <span className={styles.stepBlurb}>{s.stage.blurb}</span>
                      </span>
                      <span className={styles.stepMeta}>
                        {s.best !== null ? (
                          <>
                            <StarRating value={s.stars} size={12} label={`${s.stars} of 3 stars`} />
                            <span>{s.best}%</span>
                          </>
                        ) : null}
                      </span>
                      {(s.passed || s.tried) && <VisuallyHidden>{s.passed ? ', passed' : ', started'}</VisuallyHidden>}
                    </a>
                  </li>
                );
              })}
            </ol>
          </Section>
      </div>
      <SettingsSheet open={sheet} onClose={() => setSheet(false)} trainer={trainer} />
    </Page>
  );
}
