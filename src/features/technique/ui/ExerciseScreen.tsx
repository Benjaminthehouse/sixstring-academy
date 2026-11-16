/**
 * One exercise (`#technique--<id>`): the demonstration (tab, fretboard, hear it), the tempo ladder
 * with the click, an optional microphone take, how to play it, what to watch for, and the
 * learner's history. Ladder and guide exercises use this screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { TECHNIQUE_EXERCISES, type TechniqueExercise } from '@/content/technique';
import { playTone, unlockAudio } from '@/core/audio';
import { showNotation } from '@/core/settings';
import { usePrefs } from '@/core/progress';
import {
  ActionBar,
  Button,
  Card,
  Checkbox,
  ChipGroup,
  Icon,
  LinkButton,
  Page,
  Section,
  Select,
  Text,
  Tooltip,
  Kbd,
  useEventListener,
  useMediaQuery,
  useRafLoop,
} from '@/ui';
import type { TabViewHandle } from '@/ui/music/tab';
import { strainDue } from '../model/health';
import styles from '../Technique.module.css';
import { Demo } from './Demo';
import { HealthNotice } from './HealthNotice';
import { Coaching, History, LadderPanel, PhoneBarActions, PhoneBarStart, SummarySheet, exerciseEyebrow, nextExercise, togglePrimary } from './Panels';
import { useExercise } from './useExercise';

/** Two panes from this width; below it the ladder's controls live in the bottom bar. */
export const WIDE_QUERY = '(min-width: 1100px)';
/** A phone held sideways: the page header gives way to the music (the top bar keeps the title). */
export const SIDEWAYS_QUERY = '(orientation: landscape) and (max-height: 520px)';

/** Is this key press for something that owns its keys (typing, a slider, a radio group)? */
export function ownsKeys(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!el.closest('[role="radiogroup"],[role="tablist"],[role="listbox"],[role="menu"],[role="slider"],[role="spinbutton"],[role="dialog"],[data-tab-view]');
}

/** The exercise screen. */
export function ExerciseScreen({ e }: { e: TechniqueExercise }) {
  useScreenTitle(e.title);
  const x = useExercise(e);
  const wide = useMediaQuery(WIDE_QUERY);
  const prefs = usePrefs();
  const notation = showNotation(prefs);
  const tab = useRef<TabViewHandle>(null);
  const running = x.mode !== 'idle';
  const sideways = useMediaQuery(SIDEWAYS_QUERY);
  useImmersive(running || sideways, 'focus');

  // The cursor follows the music every frame, without React.
  useRafLoop(() => {
    const p = x.runner.position();
    if (p && p.state === 'playing' && !p.countIn) tab.current?.setPlayerPosition(p);
  }, running);
  useEffect(() => {
    if (!running) tab.current?.setCursor(null);
  }, [running]);

  // Keyboard: Space start/stop, arrows tempo, Enter clean, N not yet, H hear it.
  useEventListener(window, 'keydown', (ev: KeyboardEvent) => {
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const target = ev.target as Element | null;
    if (ownsKeys(target)) return;
    const onButton = target instanceof HTMLElement && (target.tagName === 'BUTTON' || target.tagName === 'A');
    if (ev.key === ' ' || ev.code === 'Space') {
      if (onButton) return;
      ev.preventDefault();
      togglePrimary(x);
    } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      if (x.mode === 'take') return;
      ev.preventDefault();
      x.nudge(ev.key === 'ArrowUp' ? 1 : -1, ev.shiftKey);
    } else if (ev.key === 'Enter' && !onButton && !x.micWanted) {
      ev.preventDefault();
      x.clean();
    } else if ((ev.key === 'n' || ev.key === 'N') && !x.micWanted) {
      x.notYet();
    } else if ((ev.key === 'h' || ev.key === 'H') && (x.mode === 'idle' || x.mode === 'demo')) {
      // Like the Hear it button: not while the learner is practising or taking a take.
      x.hear();
    }
  });

  // On a phone the result of a take is under the music: bring it into view.
  useEffect(() => {
    if (!x.take || wide) return;
    document.querySelector('[data-technique-take]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [x.take, wide]);

  const [strainOk, setStrainOk] = useState(false);
  const strain = e.strain && !strainOk && strainDue(x.exerciseMin * 60, e.strain.maxMinutes) ? { text: e.strain.text, minutes: x.exerciseMin } : null;
  const next = useMemo(() => nextExercise(e, TECHNIQUE_EXERCISES), [e]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const playReference = useCallback(() => {
    if (!e.reference) return;
    void unlockAudio();
    const h = playTone(e.reference.midi, undefined, { voice: 'reference', a4: prefs.a4, duration: 4, velocity: 0.8 });
    void h;
  }, [e.reference, prefs.a4]);

  const parts = e.parts;
  const partPicker =
    parts.length > 1 ? (
      parts.length > 8 ? (
        <Select label="Part" hideLabel value={x.part.id} onChange={x.selectPart} options={parts.map((p) => ({ value: p.id, label: p.name }))} disabled={running} />
      ) : (
        <ChipGroup aria-label="Part" options={parts.map((p) => ({ value: p.id, label: p.name }))} value={x.part.id} onChange={(v) => v && x.selectPart(v)} />
      )
    ) : null;

  const demo = (
    <Card padding="md" className={styles.demoCard} data-technique-demo="">
      <div className={styles.demoHead}>
        <div>
          <Text variant="eyebrow">{parts.length > 1 ? `Part ${x.partIndex + 1} of ${parts.length}` : 'The exercise'}</Text>
          <Text weight="bold">{x.part.name}</Text>
        </div>
        <Tooltip content={<>Hear it with the guitar <Kbd>H</Kbd></>}>
          <Button iconLeft={x.mode === 'demo' ? 'Square' : 'Volume2'} onClick={x.hear} disabled={x.mode === 'take' || x.mode === 'practice'} data-technique-hear="">
            {x.mode === 'demo' ? 'Stop' : 'Hear it'}
          </Button>
        </Tooltip>
      </div>
      {partPicker}
      {x.part.note && (
        <Text size="sm" tone="muted" className={styles.partNote}>
          {x.part.note}
        </Text>
      )}
      <Demo ref={tab} song={x.song} source={x.runner} follow={x.follow} noteStates={x.take?.noteStates ?? null} keyName={x.part.key} diagrams={x.part.check.kind === 'onsets' && x.song.chords.length > 0} notation={notation} />
    </Card>
  );

  const guide =
    e.mode === 'guide' ? (
      <Section title="Check yourself" level={3}>
        <div className={styles.checklist}>
          {(e.checklist ?? []).map((c, i) => (
            <Checkbox key={c} label={c} checked={!!checked[i]} onChange={(v) => setChecked((s) => ({ ...s, [i]: v }))} />
          ))}
        </div>
        {(e.reference || e.tools?.length) && (
          <div className={styles.todayLinks}>
            {e.reference && (
              <Button iconLeft="Volume2" onClick={playReference}>
                {e.reference.label}
              </Button>
            )}
            {e.tools?.map((t) => (
              <LinkButton key={t.route} to={t.route} iconLeft={t.icon}>
                {t.label}
              </LinkButton>
            ))}
          </div>
        )}
      </Section>
    ) : null;

  return (
    <Page
      title={e.title}
      eyebrow={exerciseEyebrow(e)}
      subtitle={e.summary}
      back={{ to: 'technique', label: 'Technique' }}
      hideHeader={sideways}
      actions={
        wide ? (
          <Button variant="secondary" iconLeft="Check" onClick={() => x.finish()} data-technique-finish="">
            Finish
          </Button>
        ) : undefined
      }
    >
      <div
        className={styles.layout}
        data-technique-screen="exercise"
        data-exercise={e.id}
        data-part={x.part.id}
        data-mode={x.mode}
        data-tempo={x.tempo}
        data-best={x.record.best ?? ''}
        data-passes={x.passes}
        data-mic={x.mic.kind}
      >
        <div className={styles.main}>
          {e.strain && (
            <p className={styles.strainLine} data-technique-strain="">
              <Icon name="TriangleAlert" size="sm" />
              <span>{e.strain.text}</span>
            </p>
          )}
          {guide}
          {demo}
          {!wide && <LadderPanel x={x} e={e} withControls={false} />}
          <Coaching e={e} />
          <History e={e} record={x.record} />
        </div>
        {wide && (
          <aside className={styles.side} aria-label="Tempo ladder">
            <LadderPanel x={x} e={e} withControls />
          </aside>
        )}
      </div>
      {!wide && (
        <ActionBar start={<PhoneBarStart x={x} />} stretchOnMobile={false}>
          <PhoneBarActions x={x} />
        </ActionBar>
      )}
      <HealthNotice onPause={x.stop} strain={strain} onStrainDismiss={() => setStrainOk(true)} hideCoolDown={e.id === 'tech-cool-down'} />
      <SummarySheet e={e} result={x.result} record={x.record} next={next} onClose={x.clearResult} />
    </Page>
  );
}
