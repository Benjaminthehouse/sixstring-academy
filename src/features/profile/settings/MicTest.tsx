import { useCallback, useEffect, useRef, useState } from 'react';
import { listDevices, type MediaFailure } from '@/core/platform';
import { setPrefs, usePrefs } from '@/core/progress';
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

/** Level in decibels (full scale = 0) as a share of the meter, with -60 dB at the left end. */
function meterShare(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

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
  const verdictRef = useRef<Verdict>('silent');
  const peak = useRef({ value: 0, at: 0 });
  const mounted = useRef(true);

  const refreshDevices = useCallback(async () => {
    const found = await listDevices('audioinput');
    if (mounted.current) setDevices(found);
  }, []);

  const stop = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
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
      trackerRef.current?.stop();
      trackerRef.current = null;
    };
  }, [refreshDevices]);

  const start = async (deviceId: string | null = prefs.mic.deviceId): Promise<void> => {
    setStarting(true);
    setFailure(null);
    try {
      const [{ PitchTracker }, theory] = await Promise.all([import('@/core/pitch'), import('@/core/theory')]);
      trackerRef.current?.stop();
      const tracker = new PitchTracker({ a4: prefs.a4, ...(deviceId ? { deviceId } : {}) });
      const result = await tracker.start();
      if (!mounted.current) {
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
      if (mounted.current) setFailure('unknown');
    } finally {
      if (mounted.current) setStarting(false);
    }
  };

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
        <div className={styles.meter} role="img" aria-label="Microphone level" data-running={running || undefined} data-verdict={running ? verdict : undefined}>
          <span className={styles.meterFill} ref={barRef} />
          <span className={styles.meterPeak} ref={peakRef} />
          <span className={styles.meterGood} aria-hidden="true" />
        </div>
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
