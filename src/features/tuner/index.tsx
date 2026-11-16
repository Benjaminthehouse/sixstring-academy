/**
 * The Tuner screen (`#tuner`).
 *
 * How it is put together:
 *  - `model/session.ts` owns the microphone pipeline and the tuner logic and turns their hundred
 *    updates a second into a mutable `frame` (read by the meter inside requestAnimationFrame) and
 *    an immutable `view` (React re-renders only when wording or ticks change).
 *  - `components/Readout.tsx` is the face: note, meter, offset, instruction. Its root mirrors the
 *    live state for tests: `data-state` (idle | listening | hearing | in-tune), `data-note` (E2),
 *    `data-cents` (one decimal), `data-string` (string number or empty); also `data-mode`,
 *    `data-source` (off | starting | mic | ear), `data-instruction`, `data-target`, `data-tuned`
 *    (ticked string numbers), `data-tone` (MIDI of the reference note the app is playing).
 *  - This file wires those to the learner's preferences (`core/progress`: tuning, reference pitch,
 *    microphone), the screen's own options (`tuner.options`, `tuner.tunings` in storage), the
 *    reference-note player, the keyboard and the progress store.
 *
 * Three ways in: the microphone (automatic, held on a string, chromatic, or the guided flow through
 * all strings), and by ear (the app plays each string's note), which is also the whole screen
 * wherever the microphone is refused.
 *
 * Browser check: `node e2e/tuner.cjs`. Pictures of every state: `node e2e/tuner-shots.cjs`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RouteProps } from '@/app/routes';
import { useImmersive } from '@/app/shell';
import { playUi, unlockAudio } from '@/core/audio';
import type { Tuning } from '@/core/guitar';
import { PitchTracker } from '@/core/pitch';
import { isArtifact, type MediaFailure } from '@/core/platform';
import { recordActivity, setPrefs, usePrefs, type ActivityResult } from '@/core/progress';
import { micOptions } from '@/core/settings';
import {
  ActionBar,
  Banner,
  Button,
  Celebration,
  Icon,
  IconButton,
  MediaBlocked,
  Page,
  PlayButton,
  SegmentedControl,
  Sheet,
  Tooltip,
  cx,
  focusRing,
  toast,
  useEventListener,
  useIsTouch,
  useLocalState,
  useMediaQuery,
  useWakeLock,
} from '@/ui';
import { LevelBar } from './components/LevelBar';
import { Readout } from './components/Readout';
import { StringStrip, type TargetKind } from './components/StringStrip';
import { Summary, type SummaryInfo } from './components/Summary';
import { TunerSettings, type MicChoice } from './components/TunerSettings';
import { RetuneSteps, TuningSheet } from './components/TuningSheet';
import { queryMicPermission, useReferenceTone, useTunerSession } from './hooks';
import { LEVEL_MESSAGES } from './model/advice';
import { parseTunerParams } from './model/address';
import { resolveTuning, type SavedTuning } from './model/catalog';
import { MAX_CREDIT_SEC, tuneActivity } from './model/credit';
import { DEFAULT_OPTIONS, OPTIONS_KEY, SAVED_TUNINGS_KEY, sanitizeOptions, sanitizeSavedTunings, toleranceCents, type TunerOptions } from './model/options';
import type { Confirmation } from './model/session';
import { buildTargets, clampA4, clampCapo, noteParts, stringWords, targetsLabel } from './model/targets';
import styles from './Tuner.module.css';

/** Two panes (meter left, strings and settings right) from this width up. */
const TWO_PANE_QUERY = '(min-width: 1160px)';
/** A phone held sideways. */
const SIDEWAYS_QUERY = '(orientation: landscape) and (max-height: 520px)';
/** A laptop too short for a page heading above the meter (in one column the heading is always left out: the shell names the screen). */
const SHORT_QUERY = '(max-height: 759.98px)';
/** A phone too short to show the strings between the readout and the action bar while the tab bar is up. */
const SHORT_PHONE_QUERY = '(max-width: 719.98px) and (max-height: 739.98px) and (orientation: portrait)';

function failureReason(reason: MediaFailure | 'audio-failed'): MediaFailure {
  return reason === 'audio-failed' ? 'unknown' : reason;
}

/** The Tuner screen (`#tuner`). */
export default function TunerScreen({ params }: RouteProps) {
  const prefs = usePrefs();
  const [storedOptions, setStoredOptions] = useLocalState<TunerOptions>(OPTIONS_KEY, DEFAULT_OPTIONS);
  const options = useMemo(() => sanitizeOptions(storedOptions), [storedOptions]);
  const [storedTunings, setStoredTunings] = useLocalState<SavedTuning[]>(SAVED_TUNINGS_KEY, []);
  const saved = useMemo(() => sanitizeSavedTunings(storedTunings), [storedTunings]);
  const [capo, setCapo] = useState(0);

  // An address (`#tuner--dadgad`, `#tuner--capo-2`) picks the tuning and capo once per arrival, the
  // same as choosing them by hand: the tuning becomes the learner's, everywhere in the app.
  const addressKey = params.join('--');
  const tuningIdRef = useRef(prefs.tuningId);
  tuningIdRef.current = prefs.tuningId;
  useEffect(() => {
    const address = parseTunerParams(addressKey ? addressKey.split('--') : []);
    if (!address) return;
    if (address.tuning && address.tuning.id !== tuningIdRef.current) {
      setPrefs({ tuningId: address.tuning.id });
      toast.info(`Tuning: ${address.tuning.name}`, {
        description: address.tuning.id === 'standard' ? 'Back to standard tuning.' : `${address.tuning.label}. Chord shapes and the fretboard follow it too, until you change it back.`,
        id: 'tuner-address',
      });
    }
    if (address.capo !== undefined) setCapo(address.capo);
  }, [addressKey]);

  const twoPane = useMediaQuery(TWO_PANE_QUERY);
  const sideways = useMediaQuery(SIDEWAYS_QUERY);
  const shortScreen = useMediaQuery(SHORT_QUERY);
  const shortPhone = useMediaQuery(SHORT_PHONE_QUERY);
  const touch = useIsTouch();

  const naming = prefs.noteNaming;
  const a4 = clampA4(prefs.a4);
  const tuning = useMemo(() => resolveTuning(prefs.tuningId, saved), [prefs.tuningId, saved]);
  const targets = useMemo(() => buildTargets(tuning, { capo, a4 }), [tuning, capo, a4]);
  const tolerance = toleranceCents(options.tolerance);
  const preferFlats = prefs.accidentals === 'flats' || (prefs.accidentals !== 'sharps' && tuning.notes.some((n) => n.slice(1).includes('b')));
  const mic = micOptions(prefs);
  const { session, view } = useTunerSession({ targets, a4, toleranceCents: tolerance, deviceId: prefs.mic.deviceId, preferFlats, onset: mic.onset, tracker: mic.tracker });

  const hostBlocked = isArtifact();
  const listening = view.source === 'mic';
  // The chrome steps aside (the shell keeps a Back button) on a phone held sideways, and on a short
  // phone while the microphone is on: there the tab bar would cover the strings being tuned.
  useImmersive(sideways || (shortPhone && (listening || view.source === 'starting')), 'focus');
  /** The string chosen for tuning by ear; null while the microphone is the way in. */
  const [earIndex, setEarIndex] = useState<number | null>(hostBlocked ? 0 : null);
  const ear = !listening && view.source !== 'starting' && earIndex !== null ? Math.min(earIndex, targets.length - 1) : null;
  const [soundingIndex, setSoundingIndex] = useState(-1);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [micNoteOpen, setMicNoteOpen] = useState(false);
  const [failureSeen, setFailureSeen] = useState(false);
  const [summary, setSummary] = useState<SummaryInfo | null>(null);
  const [finale, setFinale] = useState(0);
  const [mics, setMics] = useState<MicChoice[]>([]);

  const tone = useReferenceTone(a4, prefs.sound.guitarTone, (playing) => session.setPaused(playing));
  useEffect(() => {
    if (tone.playing === null) setSoundingIndex(-1);
  }, [tone.playing]);

  // A note that is sounding belongs to the old targets once the tuning, capo or reference pitch changes.
  const targetSignature = targets.map((t) => t.freq.toFixed(3)).join(',');
  const stopTone = tone.stop;
  useEffect(() => stopTone, [targetSignature, stopTone]);

  useWakeLock(listening || tone.playing !== null);

  /** For progress: when this visit began, what was recorded already (none, part of a guided run, all strings), and the latest result. */
  const visitStart = useRef(Date.now());
  const recorded = useRef<'none' | 'partial' | 'full'>('none');
  const lastResult = useRef<ActivityResult | null>(null);

  const patchOptions = useCallback((patch: Partial<TunerOptions>) => setStoredOptions((prev) => ({ ...sanitizeOptions(prev), ...patch })), [setStoredOptions]);

  // --- microphone ------------------------------------------------------------------------------

  const refreshMics = useCallback(() => {
    void PitchTracker.inputs().then((list) => setMics(list.filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d) => ({ id: d.deviceId, label: d.label }))));
  }, []);

  const guideSeenRef = useRef(options.guideSeen);
  guideSeenRef.current = options.guideSeen;

  const startMic = useCallback(
    async (gesture: boolean) => {
      tone.stop();
      setFailureSeen(false);
      // A first visit walks through every string, thickest first, however the microphone starts:
      // the mode control shows Guided before Start (see `modeShown`), so Start must do just that.
      // Begun before the microphone opens, so the screen never flashes "Auto" while it starts.
      const guiding = !guideSeenRef.current && !session.getView().guide;
      if (guiding) {
        lastResult.current = null;
        session.startGuide();
      }
      const ok = await session.start({ gesture });
      if (!ok) {
        if (guiding) session.leaveGuide();
        return;
      }
      setEarIndex(null);
      refreshMics();
    },
    [session, tone, refreshMics],
  );

  const stopMic = useCallback(() => {
    // Stopping part of the way through a guided run: the strings tuned so far count.
    const g = session.getView().guide;
    if (g && !g.finished) creditPartialRef.current();
    tone.stop();
    session.stop();
  }, [session, tone]);

  // Permission already granted: listen as soon as the screen opens.
  useEffect(() => {
    if (hostBlocked) return undefined;
    let cancelled = false;
    void queryMicPermission().then((permission) => {
      if (cancelled || permission !== 'granted' || document.visibilityState !== 'visible') return;
      void startMic(false);
    });
    return () => {
      cancelled = true;
    };
    // Only when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // A hidden tab gives the microphone back; coming back picks up where it left off.
  const resumeOnReturn = useRef(false);
  useEventListener(typeof document !== 'undefined' ? document : null, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const source = session.getView().source;
      resumeOnReturn.current = source === 'mic' || source === 'starting';
      tone.stop();
      session.stop();
    } else if (resumeOnReturn.current) {
      resumeOnReturn.current = false;
      void startMic(false);
    }
  });

  // --- confirmations: sound, celebration, progress -----------------------------------------------

  const tuningNameRef = useRef(tuning.name);
  tuningNameRef.current = tuning.name;

  useEffect(
    () =>
      session.onConfirm((c: Confirmation) => {
        if (!c.fresh) return;
        // A short bell that climbs with each string; the last one gets the brighter figure.
        const heard = c.all ? playUi('perfect', { volume: 0.9 }) : playUi('combo', { step: Math.max(0, c.count - 1), volume: 0.9 });
        // The microphone hears that bell too: ignore it for as long as it rings.
        if (heard) session.hush(c.all ? 0.9 : 0.55);
        if (!c.all) return;
        setFinale((n) => n + 1);
        // One finished tuning per visit, however many tunings are tuned in it (the store caps the XP
        // per day as well); one that follows partial credit for a guided run completes it.
        if (recorded.current !== 'full') {
          recorded.current = 'full';
          const durationSec = Math.min(MAX_CREDIT_SEC, Math.max(1, Math.round((Date.now() - visitStart.current) / 1000)));
          lastResult.current = recordActivity({ kind: 'tuner', durationSec, route: 'tuner', title: `Tuned to ${tuningNameRef.current}` });
        }
      }),
    [session],
  );

  /**
   * Partial credit for a guided run that ended with strings skipped, or was stopped or left part of
   * the way: the strings tuned count (see `model/credit.ts`). Once per visit, and never after a
   * finished tuning.
   */
  const creditPartial = useCallback(() => {
    if (recorded.current !== 'none') return;
    const activity = tuneActivity(session.getView().confirmed, { seconds: (Date.now() - visitStart.current) / 1000, tuningName: tuningNameRef.current });
    if (!activity || activity.completed !== false) return;
    recorded.current = 'partial';
    lastResult.current = recordActivity(activity);
  }, [session]);
  const creditPartialRef = useRef(creditPartial);
  creditPartialRef.current = creditPartial;
  // Leaving in the middle of a guided run still counts the strings tuned.
  useEffect(
    () => () => {
      const g = session.getView().guide;
      if (g && !g.finished) creditPartialRef.current();
    },
    [session],
  );

  // The guided flow has ended: say how it went.
  const guideFinished = !!view.guide?.finished;
  useEffect(() => {
    if (!guideFinished) return;
    const g = session.getView().guide;
    if (!g) return;
    patchOptions({ guideSeen: true });
    // Strings skipped: the ones tuned still count, for part of the credit.
    creditPartial();
    setSummary({ kind: 'guide', confirmed: [...session.getView().confirmed], skipped: [...g.skipped], seconds: Math.max(1, Math.round((g.finishedAt - g.startedAt) / 1000)), result: lastResult.current });
    lastResult.current = null;
  }, [guideFinished, session, patchOptions, creditPartial]);

  // --- actions -----------------------------------------------------------------------------------

  const playTarget = useCallback(
    (index: number, loop: boolean) => {
      const t = targets[index];
      if (!t) return;
      setSoundingIndex(index);
      tone.play(t.midi, { voice: options.earVoice, loop, octaveUp: options.earOctaveUp });
    },
    [targets, tone, options.earVoice, options.earOctaveUp],
  );

  /** Tap on a string: lock onto it while listening, hear it otherwise. */
  const pickString = useCallback(
    (index: number) => {
      if (session.getView().source === 'mic') {
        const v = session.getView();
        if (v.mode === 'locked' && v.target === index) session.lock(null);
        else session.lock(index);
        return;
      }
      void unlockAudio();
      setEarIndex(index);
      if (tone.playing !== null && soundingIndex === index) tone.stop();
      else playTarget(index, options.earLoop);
    },
    [session, tone, soundingIndex, playTarget, options.earLoop],
  );

  /** Play (or stop) the reference note for whatever the readout is about. */
  const toggleReference = useCallback(() => {
    if (tone.playing !== null) {
      tone.stop();
      return;
    }
    const v = session.getView();
    if (v.source === 'mic') {
      if (v.shownIndex >= 0) {
        setSoundingIndex(v.shownIndex);
        tone.play(targets[v.shownIndex].midi, { voice: options.earVoice, loop: false, octaveUp: options.earOctaveUp });
      } else if (v.shownMidi >= 0) {
        tone.play(v.shownMidi, { voice: options.earVoice, loop: false, octaveUp: options.earOctaveUp });
      }
      return;
    }
    const index = ear ?? 0;
    setEarIndex(index);
    playTarget(index, options.earLoop);
  }, [tone, session, targets, options.earVoice, options.earOctaveUp, options.earLoop, ear, playTarget]);

  /** Start the guided flow afresh: its summary only reports what this run earns. */
  const beginGuide = useCallback(() => {
    lastResult.current = null;
    session.startGuide();
  }, [session]);

  const chooseMode = useCallback(
    (mode: 'guide' | 'auto' | 'chromatic') => {
      if (mode === 'guide') beginGuide();
      else {
        session.setMode(mode);
        patchOptions({ guideSeen: true });
      }
    },
    [session, patchOptions, beginGuide],
  );

  const startByEar = useCallback(() => {
    void unlockAudio();
    setEarIndex(0);
    playTarget(0, options.earLoop);
  }, [playTarget, options.earLoop]);

  /** By ear: this string sounds right, go to the next one that is not ticked yet. */
  const earNext = useCallback(() => {
    if (ear === null) return;
    tone.stop();
    session.confirmByEar(ear);
    const confirmed = session.getView().confirmed;
    let next = -1;
    for (let step = 1; step <= targets.length; step++) {
      const j = (ear + step) % targets.length;
      if (!confirmed[j]) {
        next = j;
        break;
      }
    }
    if (next < 0) {
      setSummary({ kind: 'ear', confirmed: [...confirmed], skipped: targets.map(() => false), seconds: 0, result: lastResult.current });
      lastResult.current = null;
      return;
    }
    setEarIndex(next);
    playTarget(next, options.earLoop);
  }, [ear, tone, session, targets, playTarget, options.earLoop]);

  const moveString = useCallback(
    (delta: number) => {
      const v = session.getView();
      const count = targets.length;
      if (v.source === 'mic') {
        const from = v.target >= 0 ? v.target : v.shownIndex >= 0 ? v.shownIndex : delta > 0 ? -1 : count;
        const next = Math.min(count - 1, Math.max(0, from + delta));
        session.lock(next);
      } else {
        const from = ear ?? (delta > 0 ? -1 : count);
        pickString(Math.min(count - 1, Math.max(0, from + delta)));
      }
    },
    [session, targets.length, ear, pickString],
  );

  const flipped = prefs.handedness === 'left';
  const panelOpen = tuningOpen || settingsOpen || summary !== null;

  useEventListener(typeof window !== 'undefined' ? window : null, 'keydown', (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || panelOpen) return;
    const el = event.target as HTMLElement | null;
    const tag = el?.tagName ?? '';
    if (el?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const key = event.key;
    if (key === ' ') {
      // On a focused button, Space is that button's own key.
      if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return;
      event.preventDefault();
      if (listening || view.source === 'starting') stopMic();
      else if (!hostBlocked) void startMic(true);
      else toggleReference();
      return;
    }
    if (key >= '1' && key <= '9') {
      const index = targets.length - Number(key);
      if (index >= 0 && index < targets.length) {
        event.preventDefault();
        pickString(index);
      }
      return;
    }
    const lower = key.toLowerCase();
    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      event.preventDefault();
      const towardThin = key === 'ArrowRight' ? 1 : -1;
      moveString(flipped ? -towardThin : towardThin);
    } else if (lower === 'a') chooseMode('auto');
    else if (lower === 'c') chooseMode('chromatic');
    else if (lower === 'g') chooseMode('guide');
    else if (lower === 'r') toggleReference();
    else if (key === 'Escape' && view.mode === 'locked') session.lock(null);
  });

  // --- tunings and settings ----------------------------------------------------------------------

  const selectTuning = useCallback((t: Tuning) => setPrefs({ tuningId: t.id }), []);
  const saveTuning = useCallback(
    (entry: SavedTuning, t: Tuning) => {
      setStoredTunings((prev) => [...sanitizeSavedTunings(prev).filter((s) => s.id !== entry.id), entry]);
      setPrefs({ tuningId: t.id });
    },
    [setStoredTunings],
  );
  const deleteTuning = useCallback(
    (id: string) => {
      const removed = saved.find((s) => s.id === id);
      const wasInUse = prefs.tuningId === id;
      setStoredTunings((prev) => sanitizeSavedTunings(prev).filter((s) => s.id !== id));
      if (wasInUse) setPrefs({ tuningId: 'standard' });
      if (!removed) return;
      // Nothing is lost by a slip of the finger: the tuning comes back with one tap.
      toast({
        title: `${removed.name} removed from your tunings`,
        action: {
          label: 'Undo',
          onClick: () => {
            setStoredTunings((prev) => [...sanitizeSavedTunings(prev).filter((s) => s.id !== id), removed]);
            if (wasInUse) setPrefs({ tuningId: id });
          },
        },
      });
    },
    [saved, setStoredTunings, prefs.tuningId],
  );
  const chooseMic = useCallback(
    (id: string | null) => {
      setPrefs({ mic: { deviceId: id } });
      void session.setDevice(id);
    },
    [session],
  );
  const audition = useCallback(
    (midi: number) => {
      void unlockAudio();
      tone.play(midi, { voice: 'pluck', loop: false, octaveUp: false });
    },
    [tone],
  );

  // --- what to show ------------------------------------------------------------------------------

  const label = targetsLabel(targets, naming);
  const settings = (
    <TunerSettings
      a4={a4}
      onA4={(hz) => setPrefs({ a4: clampA4(hz) })}
      capo={capo}
      onCapo={(fret) => setCapo(clampCapo(fret))}
      capoLabel={label}
      options={options}
      onOptions={patchOptions}
      mics={mics}
      micId={prefs.mic.deviceId}
      onMic={chooseMic}
      showShortcuts={!touch}
      level={listening ? <LevelBar session={session} size="lg" hot={view.advice === 'too-loud'} /> : undefined}
      levelNote={listening && view.advice !== 'ok' ? LEVEL_MESSAGES[view.advice] : ''}
    />
  );

  const showFailure = view.failure !== null && !failureSeen && !listening;
  const showHostNote = hostBlocked && (!options.micNoteSeen || micNoteOpen);
  const heardIndex = listening && view.shownLive && view.state !== 'idle' ? view.shownIndex : -1;
  const stripTarget = ear !== null ? ear : view.target;
  const stripKind: TargetKind | null = ear !== null ? 'ear' : view.mode === 'guide' ? 'guide' : view.mode === 'locked' ? 'locked' : null;
  const referenceNote = listening ? (view.shownNote ? noteParts(view.shownNote, naming).short : '') : ear !== null ? noteParts(targets[ear].note, naming).short : '';
  const guideNumber = view.guide && !view.guide.finished ? view.confirmed.filter(Boolean).length + view.guide.skipped.filter(Boolean).length + 1 : 0;

  // On a first visit Start leads into the guided flow (see `startMic`): show that choice before it begins.
  const modeShown = view.source === 'off' && !view.guide && !options.guideSeen && view.mode === 'auto' ? 'guide' : view.mode;

  let caption: string;
  if (ear !== null) caption = 'Tap a string to hear it. Tap again to stop.';
  else if (modeShown === 'guide' && !view.guide) caption = 'One string at a time, thickest first.';
  else if (view.mode === 'guide') caption = `String ${Math.min(guideNumber, targets.length)} of ${targets.length}. It moves on by itself.`;
  else if (view.mode === 'locked' && view.target >= 0) caption = `Held on the ${stringWords(view.target, targets.length, tuning.reentrant).name}. Tap it again to let go.`;
  else if (view.mode === 'chromatic') caption = 'Any note: the nearest of all twelve.';
  else caption = 'Pluck any string, or tap one to hold on it.';

  return (
    <Page title="Tuner" hideHeader={!twoPane || sideways || shortScreen} gap={0} className={styles.screen}>
      <div className={cx(styles.layout, twoPane && styles.twoPane, sideways && styles.sideways)} data-tuner-layout={twoPane ? 'two-pane' : sideways ? 'sideways' : 'column'} data-tuning={tuning.id} data-capo={capo} data-a4={a4}>
        <div className={styles.notices}>
          {(capo > 0 || a4 !== 440) && (
            <div className={styles.flags}>
              {capo > 0 && (
                <p className={styles.flag} data-tuner-capo={capo}>
                  <Icon name="Info" size="xs" />
                  <span>
                    Capo on fret {capo}: tuning to <strong>{label}</strong>
                  </span>
                </p>
              )}
              {a4 !== 440 && (
                <p className={styles.flag} data-tuner-a4={a4}>
                  <Icon name="Info" size="xs" />
                  <span>
                    Reference pitch <strong>A = {a4} Hz</strong>
                  </span>
                </p>
              )}
            </div>
          )}
          {view.fault && !listening && (
            <Banner tone="warn" title="The microphone stopped" live actions={<Button size="sm" onClick={() => void startMic(true)}>Start again</Button>}>
              {view.fault === 'device-lost' ? 'It was unplugged or switched off.' : 'The audio system reported a problem.'} You can also tune by ear below.
            </Banner>
          )}
          {showFailure && view.failure && (
            <div className={styles.blocked}>
              <MediaBlocked
                reason={failureReason(view.failure.reason)}
                device="microphone"
                onRetry={() => void startMic(true)}
                onContinueWithout={() => {
                  setFailureSeen(true);
                  startByEar();
                }}
                continueLabel="Tune by ear instead"
              >
                <p>You can still tune: the app plays each string's note and you match it by ear.</p>
              </MediaBlocked>
            </div>
          )}
          {showHostNote && (
            <div className={styles.blocked}>
              <MediaBlocked
                reason="blocked-by-host"
                device="microphone"
                onContinueWithout={() => {
                  patchOptions({ micNoteSeen: true });
                  setMicNoteOpen(false);
                }}
                continueLabel="Tune by ear"
              >
                <p>The by-ear tuner below plays each string's note for you to match.</p>
              </MediaBlocked>
            </div>
          )}
          {hostBlocked && !showHostNote && (
            <p className={styles.hostLine}>
              <Icon name="MicOff" size="xs" />
              <span>No microphone in this viewer, so this is the by-ear tuner.</span>
              <button type="button" className={styles.linkButton} onClick={() => setMicNoteOpen(true)}>
                Why?
              </button>
            </p>
          )}
        </div>

        {/* Readout and actions travel together: one pane on wide screens, separate grid rows on phones. */}
        <div className={styles.left}>
          <div className={styles.stage}>
            <Readout
              session={session}
              view={view}
              targets={targets}
              tuningCaption={`${tuning.name} tuning${capo > 0 ? `, capo on fret ${capo}` : ''}`}
              naming={naming}
              reentrant={tuning.reentrant}
              tolerance={tolerance}
              fine={options.tolerance === 'fine'}
              display={options.display}
              showHz={options.showHz}
              ear={ear !== null ? { index: ear, playing: tone.playing !== null } : null}
              toneMidi={tone.playing}
              headerStart={
                twoPane ? undefined : (
                  <button type="button" className={cx(styles.tuningChip, focusRing)} onClick={() => setTuningOpen(true)} aria-label={`Tuning: ${tuning.name}, ${label}. Change tuning`} data-tuner-tuning={tuning.id}>
                    <span className={styles.tuningName}>{tuning.name}</span>
                    <Icon name="ChevronDown" size="sm" />
                  </button>
                )
              }
              headerEnd={twoPane ? undefined : <IconButton icon="SlidersHorizontal" label="Tuner settings" size="sm" onClick={() => setSettingsOpen(true)} />}
              earControls={
                ear !== null ? (
                  <div className={styles.earControls}>
                    <IconButton icon="ChevronLeft" label="Previous string" variant="secondary" round disabled={flipped ? ear >= targets.length - 1 : ear <= 0} onClick={() => pickString(flipped ? ear + 1 : ear - 1)} />
                    <PlayButton playing={tone.playing !== null} icon={tone.playing !== null ? 'Square' : undefined} label={tone.playing !== null ? 'Stop the note' : `Play ${noteParts(targets[ear].note, naming).text}`} onClick={toggleReference} data-tuner-play="" />
                    <IconButton icon="ChevronRight" label="Next string" variant="secondary" round disabled={flipped ? ear <= 0 : ear >= targets.length - 1} onClick={() => pickString(flipped ? ear - 1 : ear + 1)} />
                  </div>
                ) : undefined
              }
            />
          </div>
          {/* The kit's bar, so toasts and other bottom layers know its height and sit above it. */}
          <ActionBar className={styles.actions} stretchOnMobile={false}>
            {ear !== null ? (
              <>
                {!hostBlocked &&
                  (twoPane ? (
                    <Button size="lg" iconLeft="Mic" onClick={() => void startMic(true)} data-tuner-start="">
                      Use the microphone
                    </Button>
                  ) : (
                    <IconButton icon="Mic" label="Tune with the microphone" variant="secondary" size="lg" className={styles.compact} onClick={() => void startMic(true)} data-tuner-start="" />
                  ))}
                <Button variant="primary" size="lg" wrap iconRight="ArrowRight" className={styles.start} onClick={earNext} data-tuner-ear-next="">
                  Sounds right, next
                </Button>
              </>
            ) : view.source === 'starting' ? (
              <>
                <Button size="lg" onClick={stopMic}>
                  Cancel
                </Button>
                <Button variant="primary" size="lg" loading className={styles.start}>
                  Starting
                </Button>
              </>
            ) : listening ? (
              <>
                {view.mode === 'guide' ? (
                  <>
                    {/* Labelled like Stop everywhere else: an unlabelled square read as "pause" or nothing at all. */}
                    <Tooltip content="Space">
                      <Button size="lg" iconLeft="Square" onClick={stopMic} aria-label="Stop listening" data-tuner-stop="">
                        Stop
                      </Button>
                    </Tooltip>
                    <Button size="lg" iconLeft="SkipForward" onClick={() => session.skipGuideString()} data-tuner-skip="">
                      Skip
                    </Button>
                  </>
                ) : (
                  <Tooltip content="Space">
                    <Button size="lg" iconLeft="Square" onClick={stopMic} data-tuner-stop="">
                      Stop
                    </Button>
                  </Tooltip>
                )}
                <Tooltip content="R">
                  <Button size="lg" iconLeft={tone.playing !== null ? 'Square' : 'Volume2'} disabled={!referenceNote && tone.playing === null} pressed={tone.playing !== null} onClick={toggleReference} data-tuner-reference="">
                    {tone.playing !== null ? 'Stop note' : referenceNote ? `Hear ${referenceNote}` : 'Hear it'}
                  </Button>
                </Tooltip>
              </>
            ) : (
              <>
                <Button size="lg" wrap iconLeft="Ear" onClick={startByEar} data-tuner-by-ear="">
                  By ear
                </Button>
                <Tooltip content="Space">
                  <Button variant="primary" size="lg" wrap iconLeft="Mic" className={styles.start} onClick={() => void startMic(true)} data-tuner-start="">
                    Start tuning
                  </Button>
                </Tooltip>
              </>
            )}
          </ActionBar>
        </div>

        <div className={styles.side}>
          <StringStrip
            targets={targets}
            naming={naming}
            confirmed={view.confirmed}
            heard={heardIndex}
            maybe={listening && view.instruction === 'which-string' ? view.otherIndex : -1}
            target={stripTarget}
            targetKind={stripKind}
            sounding={soundingIndex}
            flipped={flipped}
            action={listening ? 'holds the tuner on it' : 'plays its note'}
            onPick={pickString}
          />
          <div className={styles.modes}>
            {ear !== null ? (
              <SegmentedControl
                aria-label="Sound of the reference note"
                fullWidth
                options={[
                  { value: 'tone', label: 'Steady tone' },
                  { value: 'pluck', label: 'Plucked string' },
                ]}
                value={options.earVoice}
                onChange={(earVoice) => {
                  tone.stop();
                  patchOptions({ earVoice });
                }}
              />
            ) : (
              <SegmentedControl
                aria-label="How the tuner chooses the string"
                fullWidth
                options={[
                  { value: 'guide', label: 'Guided' },
                  { value: 'auto', label: 'Auto' },
                  { value: 'chromatic', label: 'Chromatic' },
                ]}
                value={modeShown}
                onChange={(mode) => chooseMode(mode as 'guide' | 'auto' | 'chromatic')}
              />
            )}
            <p className={styles.caption}>{caption}</p>
          </div>
          {twoPane && (
            <>
              <section className={styles.tuningCard} aria-label="Tuning">
                <div className={styles.tuningCardHead}>
                  <div>
                    <p className={styles.kicker}>Tuning</p>
                    <p className={styles.tuningCardName}>{tuning.name}</p>
                    <p className={styles.tuningCardNotes}>{label}</p>
                  </div>
                  <Button iconRight="ChevronRight" onClick={() => setTuningOpen(true)}>
                    Change
                  </Button>
                </div>
                <p className={styles.tuningCardText}>{tuning.description}</p>
                <RetuneSteps tuning={tuning} naming={naming} />
              </section>
              <section className={styles.settingsCard} aria-label="Settings">
                {settings}
              </section>
            </>
          )}
        </div>
      </div>

      <TuningSheet open={tuningOpen} onClose={() => setTuningOpen(false)} tuning={tuning} saved={saved} naming={naming} onSelect={selectTuning} onSave={saveTuning} onDelete={deleteTuning} onAudition={audition} />
      {!twoPane && (
        <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Tuner settings" desktop="drawer">
          {settings}
        </Sheet>
      )}
      <Summary
        info={summary}
        targets={targets}
        naming={naming}
        tuningName={tuning.name}
        onClose={() => {
          setSummary(null);
          session.leaveGuide();
        }}
        onAgain={() => {
          setSummary(null);
          lastResult.current = null;
          if (summary?.kind === 'ear') {
            session.resetConfirmed();
            setEarIndex(0);
          } else session.startGuide();
        }}
      />
      <Celebration fire={finale} intensity="medium" />
    </Page>
  );
}
