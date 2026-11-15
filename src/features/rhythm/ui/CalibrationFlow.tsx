import { useEffect, useMemo, useRef, useState } from 'react';
import type { OnsetEvent } from '@/core/pitch';
import { Banner, Button, ButtonGroup, Heading, Icon, MediaBlocked, Text, cx, usePrefersReducedMotion } from '@/ui';
import { detectBleed, estimateOffset, judgeEstimate, loadCalibration, saveCalibration, type Bleed, type EstimateVerdict, type InputSource, type OffsetEstimate } from '../core/calibration';
import { CALIBRATION_BPM, PROBE_TICKS, calibrationChart } from '../core/charts';
import { BeatLane } from './BeatLane';
import { DEFAULT_PREFS } from './prefs';
import { SpreadPlot } from './SpreadPlot';
import { TapPad } from './TapPad';
import { useRound } from './useRound';
import styles from './Rhythm.module.css';

/** Props of {@link CalibrationFlow}. */
export interface CalibrationFlowProps {
  source: InputSource;
  /** Called when the learner is finished here (saved or not). */
  onDone?: () => void;
  /** Label of the closing button (default "Done"). */
  doneLabel?: string;
  /** Called after a value has been stored, so a screen showing the stored values can read them again. */
  onSaved?: () => void;
}

interface Measured {
  estimate: OffsetEstimate;
  bleed: Bleed | null;
  verdict: EstimateVerdict;
  saved: boolean;
}

const describe = (ms: number, source: InputSource): string => {
  const n = Math.round(Math.abs(ms));
  const what = source === 'mic' ? 'Your claps reach the app' : 'Your taps reach the app';
  if (n <= 3) return `${what} right on the click.`;
  return `${what} ${n} ms ${ms > 0 ? 'after' : 'before'} the click.`;
};

/**
 * Ten seconds of tapping (or clapping) with a click, turned into the latency of this device.
 * Nothing is judged while it runs: the point is to measure, not to score.
 */
export function CalibrationFlow({ source, onDone, doneLabel = 'Done', onSaved }: CalibrationFlowProps) {
  const reduced = usePrefersReducedMotion();
  const chart = useMemo(() => calibrationChart({ probe: source === 'mic' }), [source]);
  const onsets = useRef<OnsetEvent[]>([]);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const round = useRound({
    skill: 'rhythm:calibration',
    title: 'Latency calibration',
    params: ['calibrate'],
    chart,
    prefs: DEFAULT_PREFS,
    source,
    record: false,
    noOffer: true,
    rawTiming: true,
    onOnset: (o) => onsets.current.push(o),
  });
  const { session, result, phase } = round;

  // When the round ends, measure. A stopped round measures nothing.
  useEffect(() => {
    if (phase !== 'done' || !session || !result) return;
    const play = session.chart.segments.find((s) => s.kind === 'play');
    const clicks = session.chart.targets.filter((t) => t.seg === play?.index).map((t) => session.targetTime(t.id));
    const period = 60 / CALIBRATION_BPM;
    const estimate = estimateOffset(clicks, session.rawTaps, { periodSec: period, earliestMs: source === 'mic' ? -100 : undefined, minTaps: 8 });
    let bleed: Bleed | null = null;
    if (source === 'mic') {
      const probeSeg = session.chart.segments.find((s) => s.kind === 'listen');
      if (probeSeg) bleed = detectBleed(PROBE_TICKS.map((tick) => session.timeOfTick(probeSeg.startTick + tick)), onsets.current);
    }
    const verdict = judgeEstimate(estimate, source);
    if (verdict === 'save') save(estimate, bleed);
    setMeasured({ estimate, bleed, verdict, saved: verdict === 'save' });
    // Measured once per finished round: `save` and the refs it reads do not belong in the dependencies.
  }, [phase, session, result]);

  const save = (estimate: OffsetEstimate, bleed: Bleed | null) => {
    const at = Date.now();
    if (source === 'mic') saveCalibration({ micMs: Math.round(estimate.offsetMs * 10) / 10, micAt: at, micOffered: true, bleed });
    else saveCalibration({ tapMs: Math.round(estimate.offsetMs * 10) / 10, tapAt: at, offered: true });
    onSaved?.();
  };

  const again = () => {
    onsets.current = [];
    setMeasured(null);
    round.reset();
  };

  const begin = () => {
    onsets.current = [];
    setMeasured(null);
    round.start();
  };

  if (round.mic.status === 'failed' && round.mic.reason) {
    return (
      <MediaBlocked reason={round.mic.reason === 'audio-failed' ? 'unknown' : round.mic.reason} device="microphone" onRetry={begin} onContinueWithout={onDone} continueLabel="Carry on without it" align="start">
        You can still play every rhythm round by tapping.
      </MediaBlocked>
    );
  }

  if (measured && phase === 'done') {
    const { estimate, bleed, saved, verdict } = measured;
    const centred = estimate.deviations.map((d) => d - estimate.offsetMs);
    const n = Math.round(Math.abs(estimate.offsetMs));
    const what = source === 'mic' ? 'claps' : 'taps';
    return (
      <div className={styles.calib} data-calibration-result={verdict} data-offset={Math.round(estimate.offsetMs)}>
        {verdict === 'too-few' ? (
          <>
            <Heading level={3} size="lg">
              Not enough to measure
            </Heading>
            <Text tone="muted">
              {source === 'mic' ? `Only ${estimate.matched} claps were heard. Clap once on every click, close to the device.` : `Only ${estimate.matched} taps arrived. Tap once on every click, all sixteen.`}
            </Text>
          </>
        ) : verdict === 'implausible' ? (
          <div className={styles.calibHead}>
            <span className={cx(styles.calibIcon, styles.toneOff)}>
              <Icon name="CircleAlert" size={28} />
            </span>
            <div>
              <Heading level={3} size="lg">
                That did not line up with the click
              </Heading>
              <Text tone="muted">
                {`Your ${what} came about ${n} ms ${estimate.offsetMs < 0 ? 'before' : 'after'} each click. No ${source === 'mic' ? 'microphone' : 'device'} delays a ${source === 'mic' ? 'clap' : 'tap'} by that much, so they were probably following something else, such as the off-beat. Nothing was saved: try again and ${source === 'mic' ? 'clap' : 'tap'} exactly when you hear each click.`}
              </Text>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.calibHead}>
              <span className={cx(styles.calibIcon, saved ? styles.toneHit : styles.toneOff)}>
                <Icon name={saved ? 'CircleCheck' : 'CircleAlert'} size={28} />
              </span>
              <div>
                <Heading level={3} size="lg">
                  {describe(estimate.offsetMs, source)}
                </Heading>
                <Text tone="muted">
                  {saved
                    ? 'Saved on this device. From now on that delay is taken off before anything is scored.'
                    : `That was a little uneven (it varied by about ${Math.round(estimate.spreadMs)} ms), so it has not been saved yet. Try once more, or keep it.`}
                </Text>
              </div>
            </div>
            <SpreadPlot errors={centred} caption={`How steady you were around that delay: ±${Math.round(estimate.spreadMs)} ms`} />
          </>
        )}
        {bleed && (
          <Banner tone="warn" title="The microphone can hear your speakers">
            The click came back through the microphone. Headphones are the real fix. Without them, sounds at the click&apos;s own level are ignored, so strum or clap clearly louder than the click.
          </Banner>
        )}
        <ButtonGroup align="end">
          {/* Nothing usable came out of it: measuring again is the way forward. */}
          <Button iconLeft="RotateCcw" onClick={again} variant={!saved && verdict !== 'uneven' ? 'primary' : 'secondary'} data-calibrate-again>
            Measure again
          </Button>
          {!saved && verdict === 'uneven' && (
            <Button
              onClick={() => {
                save(estimate, bleed);
                setMeasured({ ...measured, saved: true });
              }}
            >
              Keep it anyway
            </Button>
          )}
          {onDone && (
            <Button variant={saved || verdict === 'uneven' ? 'primary' : 'secondary'} onClick={onDone} data-autofocus>
              {doneLabel}
            </Button>
          )}
        </ButtonGroup>
      </div>
    );
  }

  const running = phase === 'running';
  const play = chart.segments.find((s) => s.kind === 'play');
  const taps = round.judgements.filter((j) => j.verdict !== 'miss').length;
  const cue = round.segment?.kind === 'listen' ? 'Stay quiet: checking whether the microphone hears your speakers' : round.segment?.kind === 'count' ? 'Get ready…' : source === 'mic' ? 'Clap with every click' : 'Tap with every click';
  const stored = loadCalibration();
  const previous = source === 'mic' ? stored.micMs : stored.tapMs;
  return (
    <div className={styles.calib}>
      {!running && (
        <>
          <Text>
            {source === 'mic'
              ? 'Clap, or strum muted strings, together with the click: sixteen times, about ten seconds. First come four uneven clicks. Stay quiet for those; they check whether the microphone hears your speakers.'
              : 'Tap together with the click: sixteen taps, about ten seconds. Use the same finger, device and headphones you will practise with.'}
          </Text>
          <Text tone="muted" size="sm">
            {previous !== null ? `Stored now: ${Math.round(previous)} ms.` : 'Nothing is stored yet for this device.'} Sound has to travel through speakers, the screen and the browser, and every device adds a different delay. Measuring it once makes the scoring fair.
          </Text>
        </>
      )}
      <div className={styles.calibLane}>
        <BeatLane chart={round.chart} session={round.session} marks={round.marks} judgements={round.judgements} reduced={reduced} />
      </div>
      {running ? (
        <>
          <div className={styles.calibCue} role="status">
            <Text weight="semibold">{cue}</Text>
            <Text tone="muted" tabular mono>
              {Math.min(taps, play ? 16 : 0)} / 16
            </Text>
          </div>
          {round.source === 'tap' ? (
            <TapPad onTap={round.tap} />
          ) : (
            <div className={styles.listening}>
              <Icon name="Mic" size={22} />
              <span>Listening for your claps</span>
            </div>
          )}
          <ButtonGroup align="end">
            <Button variant="ghost" iconLeft="Square" onClick={round.stop}>
              Stop
            </Button>
          </ButtonGroup>
        </>
      ) : (
        <ButtonGroup align="end">
          {onDone && (
            <Button variant="ghost" onClick={onDone}>
              Not now
            </Button>
          )}
          <Button variant="primary" iconLeft={source === 'mic' ? 'Mic' : 'Play'} onClick={begin} loading={phase === 'starting'} data-autofocus data-calibrate-start>
            Start: {source === 'mic' ? 'clap' : 'tap'} with the click
          </Button>
        </ButtonGroup>
      )}
    </div>
  );
}
