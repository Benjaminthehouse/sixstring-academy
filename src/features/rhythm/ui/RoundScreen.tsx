import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useScreenTitle } from '@/app/shell';
import { ActionBar, Button, Callout, Icon, Kbd, MediaBlocked, Page, SegmentedControl, Sheet, Stepper, Switch, Text, cx, useIsTouch, usePrefersReducedMotion, useRafLoop } from '@/ui';
import { saveCalibration, type InputSource } from '../core/calibration';
import type { Chart } from '../core/charts';
import { countAt } from '../core/counting';
import { ACTIVITY_NAMES, rungAfter, type ActivityId } from '../core/ladder';
import { meterInfo } from '../core/meter';
import type { TipAction } from '../core/tips';
import { CalibrationFlow } from './CalibrationFlow';
import { Feedback } from './Feedback';
import { useRhythmPrefs, type RhythmPrefs } from './prefs';
import { Summary } from './Summary';
import { TapPad, type PadMode } from './TapPad';
import { useRound, type Round } from './useRound';
import styles from './Rhythm.module.css';

/** What a display gets to draw the round. */
export interface DisplayContext {
  round: Round;
  prefs: RhythmPrefs;
  /** The learner asked for less motion. */
  reduced: boolean;
  /** True before the round starts: draw a still preview. */
  preview: boolean;
}

/** Props of {@link RoundScreen}. */
export interface RoundScreenProps {
  activity: ActivityId;
  /** Skill id (`rhythm:read:3`). */
  skill: string;
  /** Route params of this screen after `rhythm`. */
  params: string[];
  /** Small line above the title ("Read and tap · Level 3"). */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** How to do it, in the teacher's words. */
  teach: string;
  /** The usual mistake and its fix. */
  mistake?: string;
  /** Where "back" goes inside the rhythm section. */
  back: { params: string[]; label: string };
  chart: Chart;
  bpm: number;
  onBpm: (bpm: number) => void;
  bpmMin: number;
  bpmMax: number;
  padMode?: PadMode;
  /** The picture: notation, the beat lane, a strum grid. */
  display: (ctx: DisplayContext) => ReactNode;
  /** Controls shown on the ready screen next to tempo and input. */
  quick?: ReactNode;
  /** Extra rows for the options sheet. */
  options?: ReactNode;
  /** Shown in the summary under the numbers. */
  review?: (round: Round) => ReactNode;
  /** Called when the learner asks for another go, before the round resets (pick a new seed here). */
  onAgain?: (round: Round) => void;
  /** Whether counting syllables apply to this display (adds the switch). */
  hasCounts?: boolean;
  innerClock?: boolean;
  chord?: string;
  staccato?: boolean;
  slotSeconds?: number;
  /** Words shown in place of the verdict before the first tap. */
  idleHint?: string;
  /** Replace the start button label. */
  startLabel?: string;
}

/** A bar that fills as the round goes by, moved from the audio clock without re-rendering. */
function RunProgress({ round }: { round: Round }) {
  const bar = useRef<HTMLDivElement | null>(null);
  useRafLoop(() => {
    const s = round.session;
    if (!s || !bar.current) return;
    const f = Math.max(0, Math.min(1, s.tickNow() / Math.max(1, s.chart.lengthTicks)));
    bar.current.style.transform = `scaleX(${f.toFixed(4)})`;
  }, round.phase === 'running');
  return (
    <div className={styles.runProgress} aria-hidden="true">
      <div ref={bar} className={styles.runProgressFill} />
    </div>
  );
}

/** The count-in and the cue of the stretch being heard. */
function Cue({ round }: { round: Round }) {
  const [beat, setBeat] = useState<{ seg: number; text: string } | null>(null);
  const { session, segment } = round;
  useEffect(() => {
    if (!session) return;
    const meter = meterInfo(session.chart.meter);
    return session.on('sound', ({ sound }) => {
      if (sound.type !== 'click' || sound.level === 'sub') return;
      const seg = session.segmentAt(sound.tick);
      if (!seg || seg.kind !== 'count') return;
      setBeat({ seg: seg.index, text: countAt((sound.tick - seg.startTick) % meter.barTicks, meter).text });
    });
  }, [session]);
  const counting = segment?.kind === 'count';
  const word = segment?.cue ?? (segment?.kind === 'count' ? 'Count in' : segment?.kind === 'listen' ? 'Listen' : 'Go');
  return (
    <div className={styles.cue} role="status" data-seg-kind={segment?.kind ?? 'none'}>
      <span className={cx(styles.cueWord, counting && styles.cueWordSoft)}>{word}</span>
      {counting && beat && beat.seg === segment.index && (
        <span className={styles.cueBeat} key={`${beat.seg}-${beat.text}`}>
          {beat.text}
        </span>
      )}
    </div>
  );
}

/** Shown instead of the pad while the microphone is the input. */
function Listening({ round }: { round: Round }) {
  // The level moves every frame: written straight to the bar, never through React state.
  const fill = useRef<HTMLDivElement | null>(null);
  useRafLoop(() => {
    const level = Math.max(0, Math.min(1, (round.micLevel() + 60) / 50));
    if (fill.current) fill.current.style.transform = `scaleX(${level.toFixed(3)})`;
  }, round.phase === 'running');
  return (
    <div className={styles.listening} data-rhythm-listening>
      <Icon name="Mic" size={24} />
      <div className={styles.listeningText}>
        <span>Listening: clap or strum</span>
        <div className={styles.listeningMeter} aria-hidden="true">
          <div ref={fill} className={styles.listeningFill} />
        </div>
      </div>
    </div>
  );
}

/**
 * One activity from start to summary. Every rhythm round uses this frame, so tempo, input, the
 * pad, feedback and the end of a round work the same way everywhere.
 */
export function RoundScreen(props: RoundScreenProps) {
  const { activity, skill, params, eyebrow, title, subtitle, teach, back, chart, bpm, onBpm, bpmMin, bpmMax, padMode = 'single', display, quick, options, review, onAgain, hasCounts = false } = props;
  const [prefs, setPrefs] = useRhythmPrefs();
  const reduced = usePrefersReducedMotion();
  const touch = useIsTouch();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [offerStage, setOfferStage] = useState<'ask' | 'flow'>('ask');
  // Calibrating from Options or from a tip happens right here, in a sheet over the round.
  const [calibrating, setCalibrating] = useState<InputSource | null>(null);

  const round = useRound({
    skill,
    title: `${ACTIVITY_NAMES[activity]}: ${title}`,
    params,
    chart,
    prefs,
    chord: props.chord,
    staccato: props.staccato,
    slotSeconds: props.slotSeconds,
    innerClock: props.innerClock,
    canSlow: bpm - 8 >= bpmMin,
    canSpeedUp: bpm + 6 <= bpmMax,
    countsHidden: hasCounts && !prefs.counts,
    keysOff: optionsOpen || calibrating !== null,
  });
  useScreenTitle(title);

  // A round fills the screen: start it from the top, wherever the ready page had been scrolled to.
  const running = round.phase === 'running';
  useEffect(() => {
    if (running) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [running]);

  // A microphone that cannot be opened is explained next to the controls. On a phone that is far
  // below the Start button that was pressed, so bring the explanation into view and give it focus.
  const micFailed = round.mic.status === 'failed' && !!round.mic.reason;
  const blocked = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = blocked.current;
    if (!micFailed || !el) return;
    el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  }, [micFailed, reduced]);

  // The offer is made once: seeing it counts, whatever the answer.
  const offer = round.offer;
  useEffect(() => {
    if (!offer) return;
    setOfferStage('ask');
    saveCalibration(offer === 'mic' ? { micOffered: true } : { offered: true });
  }, [offer]);

  const ctx: DisplayContext = { round, prefs, reduced, preview: round.phase === 'ready' || round.phase === 'starting' };
  const next = rungAfter(skill);
  const slower = bpm - 8 >= bpmMin ? Math.max(bpmMin, Math.round((bpm - 10) / 2) * 2) : null;
  const faster = bpm + 6 <= bpmMax ? Math.min(bpmMax, bpm + 8) : null;

  const again = () => {
    onAgain?.(round);
    round.reset();
  };

  const act = (action: Exclude<TipAction, null>) => {
    if (action === 'slower' && slower !== null) onBpm(slower);
    else if (action === 'faster' && faster !== null) onBpm(faster);
    else if (action === 'counts') setPrefs({ counts: true });
    else if (action === 'calibrate') return setCalibrating(round.source);
    else if (action === 'headphones') return setCalibrating('mic');
    round.reset();
  };

  const closeCalibration = () => {
    setCalibrating(null);
    // Back from a tip on the summary: the next round is scored with the new offset.
    if (round.phase === 'done') round.reset();
  };

  const sourceControl = !round.micBlocked && (
    <SegmentedControl<InputSource>
      aria-label="How you play"
      value={round.source}
      onChange={(value) => {
        round.clearMicFailure();
        setPrefs({ source: value });
      }}
      options={[
        { value: 'tap', label: 'Tap', icon: 'Hand' },
        { value: 'mic', label: 'Clap or strum', icon: 'Mic' },
      ]}
      fullWidth
    />
  );

  const optionsSheet = (
    <Sheet open={optionsOpen} onClose={() => setOptionsOpen(false)} title="Options" footer={<Button variant="primary" onClick={() => setOptionsOpen(false)}>Done</Button>}>
      <div className={styles.optionList}>
        {hasCounts && <Switch checked={prefs.counts} onChange={(v) => setPrefs({ counts: v })} label="Show the count" description='"1 e & a" written under the notes.' />}
        {options}
        <Switch checked={prefs.showMs} onChange={(v) => setPrefs({ showMs: v })} label="Show milliseconds" description="The exact distance of every tap, next to the words." />
        <div className={styles.optionRow}>
          <div>
            <Text weight="semibold">Latency calibration</Text>
            <Text tone="muted" size="sm">
              Ten seconds that make the scoring fair on this device.
            </Text>
          </div>
          <Button
            size="sm"
            iconLeft="Gauge"
            onClick={() => {
              setOptionsOpen(false);
              setCalibrating(round.source);
            }}
          >
            Calibrate
          </Button>
        </div>
      </div>
    </Sheet>
  );

  const offerSheet = (
    <Sheet open={!!offer} onClose={() => round.answerOffer('close')} title={offer === 'mic' ? 'Set up the microphone first' : 'A ten-second sound check'} size="md">
      {offer && offerStage === 'ask' && (
        <div className={styles.calib}>
          <Text>
            {offer === 'mic'
              ? 'A clap takes a moment to travel through the microphone, and how long depends on your device. Clap along with a click for ten seconds and the scoring will allow for it.'
              : 'A tap reaches the app a few milliseconds after your finger lands, and how many depends on your device. Tap along with a click for ten seconds and the scoring will allow for it.'}
          </Text>
          <Text tone="muted" size="sm">
            You can do this later from Options. Without it, the timing feedback may read a little early or late.
          </Text>
          <ActionBar>
            <Button onClick={() => round.answerOffer('skip')} data-offer-skip>
              Skip and start
            </Button>
            <Button variant="primary" iconLeft="Gauge" onClick={() => setOfferStage('flow')} data-autofocus>
              Calibrate now
            </Button>
          </ActionBar>
        </div>
      )}
      {offer && offerStage === 'flow' && <CalibrationFlow source={offer} onDone={() => round.answerOffer('close')} doneLabel="Back to the round" />}
    </Sheet>
  );

  const calibrationSheet = (
    <Sheet open={calibrating !== null} onClose={closeCalibration} title={calibrating === 'mic' ? 'Microphone calibration' : 'Tap calibration'} size="md">
      {calibrating && <CalibrationFlow source={calibrating} onDone={closeCalibration} doneLabel="Back to the round" />}
    </Sheet>
  );

  if (round.phase === 'running') {
    return (
      <Page title={title} hideHeader className={styles.runPage}>
        <div className={cx(styles.run, padMode !== 'single' && round.source === 'tap' && styles.runSplit)} data-rhythm-phase="running" data-source={round.source}>
          <div className={styles.runBar}>
            <div className={styles.runTitle}>
              <Text variant="eyebrow">{eyebrow}</Text>
              <Text weight="semibold" truncate>
                {title} · {bpm} BPM
              </Text>
            </div>
            <Button size="sm" variant="ghost" iconLeft="Square" onClick={round.stop} data-rhythm-stop>
              Stop
            </Button>
          </div>
          <RunProgress round={round} />
          <Cue round={round} />
          <div className={styles.runStage}>{display(ctx)}</div>
          <Feedback last={round.last} showMs={prefs.showMs} idle={props.idleHint ?? (round.source === 'mic' ? 'Clap or strum with the notes' : 'Tap with the notes')} />
          {round.source === 'tap' ? <TapPad mode={padMode} onTap={round.tap} /> : <Listening round={round} />}
        </div>
      </Page>
    );
  }

  if (round.phase === 'done') {
    return (
      <Page title={title} eyebrow={eyebrow} back={{ to: 'rhythm', params: back.params, label: back.label }}>
        <div data-rhythm-phase="done">
          <Summary round={round} bpm={round.chart.bpm} slowerBpm={slower} fasterBpm={faster} onAgain={again} onAction={act} next={next ? { title: next.title, params: next.params } : null}>
            {review?.(round)}
          </Summary>
        </div>
        {calibrationSheet}
      </Page>
    );
  }

  return (
    <Page title={title} eyebrow={eyebrow} subtitle={subtitle} back={{ to: 'rhythm', params: back.params, label: back.label }}>
      <div className={styles.ready} data-rhythm-phase="ready">
        <div className={styles.readyMain}>
          <div className={styles.readyStage}>{display(ctx)}</div>
          <Callout tone="tip" label="How">
            {teach}
          </Callout>
          {props.mistake && (
            <Callout tone="warn" label="Common mistake">
              {props.mistake}
            </Callout>
          )}
        </div>
        <div className={styles.readySide}>
          {micFailed && (
            <div ref={blocked} tabIndex={-1} className={styles.micBlocked} data-rhythm-mic-blocked>
            <MediaBlocked
              reason={round.mic.reason === 'audio-failed' ? 'unknown' : round.mic.reason!}
              device="microphone"
              onRetry={round.start}
              onContinueWithout={() => {
                round.clearMicFailure();
                setPrefs({ source: 'tap' });
              }}
              continueLabel="Tap instead"
              align="start"
              framed
            >
              Every round works by tapping the screen or the keyboard too.
            </MediaBlocked>
            </div>
          )}
          <div className={styles.controls}>
            <Stepper label="Tempo" unit="BPM" min={bpmMin} max={bpmMax} step={2} largeStep={10} value={bpm} onChange={onBpm} />
            {sourceControl}
            {quick}
            <div className={styles.controlsRow}>
              <Button variant="ghost" size="sm" iconLeft="SlidersHorizontal" onClick={() => setOptionsOpen(true)}>
                Options
              </Button>
              {!touch && round.source === 'tap' && (
                <Text tone="muted" size="sm" className={styles.keysHint}>
                  Tap with <Kbd>Space</Kbd>
                  {padMode !== 'single' ? (
                    <>
                      , <Kbd>F</Kbd> and <Kbd>J</Kbd>
                    </>
                  ) : (
                    <>
                      , <Kbd>F</Kbd> or <Kbd>J</Kbd>
                    </>
                  )}
                </Text>
              )}
            </div>
          </div>
        </div>
        {/* A child of the whole layout, so it stays pinned to the bottom of a phone from the first screen. */}
        <ActionBar className={styles.readyAction}>
          <Button variant="primary" size="lg" iconLeft={round.source === 'mic' ? 'Mic' : 'Play'} onClick={round.start} loading={round.phase === 'starting'} data-rhythm-start>
            {props.startLabel ?? 'Start'}
          </Button>
        </ActionBar>
      </div>
      {optionsSheet}
      {offerSheet}
      {calibrationSheet}
    </Page>
  );
}
