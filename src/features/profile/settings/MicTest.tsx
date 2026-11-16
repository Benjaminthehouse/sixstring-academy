import { useCallback, useEffect, useRef, useState } from 'react';
import { listDevices, type MediaFailure } from '@/core/platform';
import { setPrefs, usePrefs } from '@/core/progress';
import { micOptions } from '@/core/settings';
import { Button, MediaBlocked, Select, Slider } from '@/ui';
import styles from './Settings.module.css';

type PitchModule = typeof import('@/core/pitch');
type Tracker = InstanceType<PitchModule['PitchTracker']>;

/** What the level meter says about the input. */
type Verdict = 'silent' | 'quiet' | 'good' | 'loud';

const VERDICT_TEXT: Readonly<Record<Verdict, string>> = {
  silent: 'Listening. Play a note.',
  quiet: 'A bit quiet. Move closer or play harder.',
  good: 'Good level.',
  loud: 'Too loud: it is clipping. Move back a little.',
};

/** The quietest level the meter shows, in dBFS: low enough that the note gate of every sensitivity is on it. */
export const METER_FLOOR_DB = -80;

/** Level in decibels (full scale = 0) as a share of the meter, with {@link METER_FLOOR_DB} at the left end. */
export function meterShare(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
}

/** How long the sensitivity slider must rest before a running test restarts with it, in ms. */
const RESTART_MS = 300;

const DEFAULT_DEVICE = '__default__';

/**
 * The microphone settings: which input to listen to, how sensitive it is, and a test that shows
 * the level and names the note it hears. Where the host refuses the microphone it says so and
 * points at what works instead.
 */
export function MicSettings() {
  const prefs = usePrefs();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<MediaFailure | null>(null);
  const [verdict, setVerdict] = useState<Verdict>('silent');
  const [heard, setHeard] = useState<string | null>(null);
  const [inputName, setInputName] = useState<string | null>(null);
  const trackerRef = useRef<Tracker | null>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);
  const peakRef = useRef<HTMLSpanElement | null>(null);
  const gateRef = useRef<HTMLSpanElement | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const verdictRef = useRef<Verdict>('silent');
  const peak = useRef({ value: 0, at: 0 });
  const mounted = useRef(true);
  /**
   * Counts starts and stops. Only the newest start may keep its microphone: a restart (new input,
   * new sensitivity) can begin before the previous one has opened, and the older one, opening
   * late, must close again instead of staying on after the learner has left.
   */
  const generation = useRef(0);
  /** The start whose end clears the button's busy state (0: none in flight). */
  const startingGen = useRef(0);

  /** Put the gate line where notes start to count (its level is also kept in the meter's `data-gate-db`). */
  const showGate = useCallback((gateDb: number) => {
    if (!Number.isFinite(gateDb)) return;
    const rounded = Math.round(gateDb);
    if (gateRef.current) gateRef.current.style.left = `${(meterShare(gateDb) * 100).toFixed(1)}%`;
    if (meterRef.current && meterRef.current.dataset.gateDb !== String(rounded)) meterRef.current.dataset.gateDb = String(rounded);
  }, []);

  const refreshDevices = useCallback(async () => {
    const found = await listDevices('audioinput');
    if (mounted.current) setDevices(found);
  }, []);

  const stop = useCallback(() => {
    generation.current++;
    trackerRef.current?.stop();
    trackerRef.current = null;
    if (startingGen.current) {
      startingGen.current = 0;
      if (mounted.current) setStarting(false);
    }
    if (barRef.current) barRef.current.style.transform = 'scaleX(0)';
    if (peakRef.current) peakRef.current.style.left = '0%';
    if (mounted.current) {
      setRunning(false);
      setHeard(null);
      setVerdict('silent');
    }
    verdictRef.current = 'silent';
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshDevices();
    return () => {
      mounted.current = false;
      generation.current++;
      trackerRef.current?.stop();
      trackerRef.current = null;
    };
  }, [refreshDevices]);

  const start = async (deviceId: string | null = prefs.mic.deviceId): Promise<void> => {
    const mine = ++generation.current;
    const current = (): boolean => mounted.current && generation.current === mine;
    startingGen.current = mine;
    setStarting(true);
    setFailure(null);
    try {
      const [{ PitchTracker }, theory] = await Promise.all([import('@/core/pitch'), import('@/core/theory')]);
      if (!current()) return;
      // Let go of the old test first, so its "stopped" does not end the new one.
      const previous = trackerRef.current;
      trackerRef.current = null;
      previous?.stop();
      // The learner's own settings (A4, sensitivity) read now, so a change made a moment ago counts.
      const options = micOptions();
      if (deviceId) options.deviceId = deviceId;
      else delete options.deviceId;
      const tracker = new PitchTracker(options);
      const result = await tracker.start();
      if (!current()) {
        // Overtaken by a newer start, a stop or leaving the screen: this microphone must close.
        tracker.stop();
        return;
      }
      if (!result.ok) {
        setFailure(result.reason === 'audio-failed' ? 'unknown' : result.reason);
        setRunning(false);
        return;
      }
      trackerRef.current = tracker;
      setInputName(tracker.info?.deviceLabel || null);
      // The meter moves about thirty times a second: draw it straight to the DOM, not through React.
      tracker.on('level', (level) => {
        const share = meterShare(level.db);
        if (barRef.current) barRef.current.style.transform = `scaleX(${share.toFixed(3)})`;
        const now = level.time;
        if (share >= peak.current.value || now - peak.current.at > 1.2) peak.current = { value: share, at: now };
        if (peakRef.current) peakRef.current.style.left = `${(peak.current.value * 100).toFixed(1)}%`;
        // The note gate: what the sensitivity (and the room) lets through. It moves slowly.
        showGate(level.gateDb);
        const next: Verdict = level.clipping ? 'loud' : level.db > -35 ? 'good' : level.db > level.gateDb ? 'quiet' : verdictRef.current === 'silent' ? 'silent' : verdictRef.current;
        if (next !== verdictRef.current) {
          verdictRef.current = next;
          setVerdict(next);
        }
      });
      tracker.on('noteon', (note) => {
        setHeard(theory.formatNote(theory.midiToNote(note.midi), { system: prefs.noteNaming }));
      });
      tracker.onStatus((status) => {
        if (status === 'stopped' && trackerRef.current === tracker) stop();
      });
      setRunning(true);
      // Device names are only given out once the microphone has been allowed.
      void refreshDevices();
    } catch {
      if (current()) setFailure('unknown');
    } finally {
      // A newer start keeps the button busy until it is done itself.
      if (mounted.current && startingGen.current === mine) {
        startingGen.current = 0;
        setStarting(false);
      }
    }
  };

  // Before the test (and between restarts) the line shows the lowest the gate can go at this
  // sensitivity; while the test runs it follows the real gate, which also rises with room noise.
  const idleGate = micOptions(prefs).tracker?.minGateDb ?? -68;
  useEffect(() => {
    if (!running) showGate(idleGate);
  }, [running, idleGate, showGate]);

  // A new sensitivity takes effect in the running test once the slider rests, so its effect can be heard and seen.
  const startRef = useRef(start);
  startRef.current = start;
  const sensitivity = prefs.mic.sensitivity;
  const applied = useRef(sensitivity);
  useEffect(() => {
    if (!running) {
      applied.current = sensitivity;
      return;
    }
    if (applied.current === sensitivity) return;
    const timer = setTimeout(() => {
      applied.current = sensitivity;
      void startRef.current();
    }, RESTART_MS);
    return () => clearTimeout(timer);
  }, [running, sensitivity]);

  const named = devices.filter((d) => d.label);
  const options = [{ value: DEFAULT_DEVICE, label: 'System default' }, ...named.filter((d) => d.deviceId && d.deviceId !== 'default').map((d) => ({ value: d.deviceId, label: d.label }))];
  const chosen = prefs.mic.deviceId && options.some((o) => o.value === prefs.mic.deviceId) ? prefs.mic.deviceId : DEFAULT_DEVICE;

  return (
    <div className={styles.fields} data-settings-mic="">
      <Select
        label="Input"
        value={chosen}
        options={options}
        hint={named.length === 0 ? 'Start the test once and the browser lists your microphones by name.' : 'A phone or laptop microphone works. An audio interface is better still.'}
        onChange={(value) => {
          const deviceId = value === DEFAULT_DEVICE ? null : value;
          setPrefs({ mic: { deviceId } });
          if (running) void start(deviceId);
        }}
      />
      <Slider
        label="Sensitivity"
        min={0}
        max={100}
        step={5}
        value={Math.round(prefs.mic.sensitivity * 100)}
        format={(v) => `${v}%`}
        hint="Higher picks up quiet playing, and more of the room. Lower ignores background noise."
        onChange={(v) => setPrefs({ mic: { sensitivity: v / 100 } })}
      />

      <div className={styles.micTest}>
        <div className={styles.micHead}>
          <p className={styles.fieldLabel}>Level test</p>
          <Button size="sm" iconLeft={running ? 'Square' : 'Mic'} loading={starting} pressed={running} onClick={() => (running ? stop() : void start())} data-mic-test="">
            {running ? 'Stop the test' : 'Test the microphone'}
          </Button>
        </div>
        <div ref={meterRef} className={styles.meter} role="img" aria-label="Microphone level" data-running={running || undefined} data-verdict={running ? verdict : undefined}>
          <span className={styles.meterFill} ref={barRef} />
          <span className={styles.meterPeak} ref={peakRef} />
          <span className={styles.meterGood} aria-hidden="true" />
          <span className={styles.meterGate} ref={gateRef} aria-hidden="true" data-mic-gate="" />
        </div>
        <p className={styles.meterLegend}>
          <span className={styles.meterGateKey} aria-hidden="true" />
          Notes left of the line are too quiet to count. More sensitivity moves it left.
        </p>
        <p className={styles.micStatus} aria-live="polite" data-mic-status={running ? verdict : 'off'}>
          {running ? (
            <>
              {VERDICT_TEXT[verdict]}
              {heard && (
                <>
                  {' '}
                  Heard: <strong>{heard}</strong>
                </>
              )}
              {inputName && <span className={styles.micDevice}> · {inputName}</span>}
            </>
          ) : (
            'Play a few notes while the test runs. The bar should reach the marked zone without hitting the end.'
          )}
        </p>
        {failure && (
          <MediaBlocked reason={failure} device="microphone" onRetry={() => void start()} level={4} framed>
            <p>Lessons, songs and games still work: tap the answers, or play along with the reference sound.</p>
          </MediaBlocked>
        )}
      </div>
    </div>
  );
}
