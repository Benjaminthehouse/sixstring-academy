/**
 * The Metronome screen (`#metronome`).
 *
 * How it is put together:
 *  - `model/session.ts` owns one engine `Metronome` (timing, accents, subdivisions, speed trainer,
 *    silent bars all come from `@/core/audio`) and adds visual-only mode, vibration and practice
 *    time. The screen configures it from the settings on every change.
 *  - `components/TempoDial.tsx` is the centre: the tempo, the knob around it and the beat pulse.
 *    `components/BeatStrip.tsx` shows every beat of the bar and lights the one being heard; it
 *    writes the DOM directly from `onBeat` (heard time), so nothing re-renders on the beat.
 *  - `components/Panels.tsx` holds the settings: bottom sheets on phones, the right pane on wide
 *    screens.
 *  - Settings (`metronome.settings`) and the learner's presets (`metronome.presets`) persist
 *    through the platform storage layer; the click sound is the app-wide `prefs.sound.clickSound`.
 *
 * The root mirrors state for tests: `data-running`, `data-bpm` (the tempo being played),
 * `data-beat` (index of the lit beat, -1 when stopped), `data-meter` ("7/8(3+2+2)"),
 * `data-subdivision`, `data-layout` (column | sideways | two-pane).
 *
 * Keyboard: Space start/stop, Up/Down +-1, Shift+Up/Down +-5, T tap tempo, 1-9 step that beat's
 * accent, Esc closes a sheet. Browser check: `node e2e/metronome.cjs`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RouteProps } from '@/app/routes';
import { useImmersive } from '@/app/shell';
import { normalizeClickSet, playUi, type ClickSet, type Subdivision } from '@/core/audio';
import { keepAwake } from '@/core/platform';
import { recordActivity, setPrefs, usePrefs } from '@/core/progress';
import {
  Banner,
  Button,
  Chip,
  Icon,
  Kbd,
  Page,
  Section,
  Sheet,
  Tooltip,
  cx,
  formatClock,
  toast,
  useEventListener,
  useInterval,
  useIsTouch,
  useLocalState,
  useMediaQuery,
  usePressHold,
} from '@/ui';
import { BeatStrip } from './components/BeatStrip';
import { SubdivisionPicture } from './components/NoteGlyphs';
import { MeterPanel, PracticePanel, PresetsPanel, RhythmPanel, SoundPanel, soundLabel } from './components/Panels';
import { TempoDial } from './components/TempoDial';
import { COMMON_METERS, meterChoice, meterLabel, meterOf, normalizeMeterKey, tempoBeatNote, tempoForRegrouping } from './model/meters';
import { MetronomeSession, practiceSeconds, timerRemaining } from './model/session';
import {
  DEFAULT_SETTINGS,
  MAX_PRESETS,
  accentsOf,
  applyPreset,
  cycleBeatAccent,
  describeSetup,
  makePreset,
  sanitizePresets,
  sanitizeSettings,
  setupOf,
  type MetronomeSettings,
  type Preset,
} from './model/settings';
import { SUBDIVISION_INFO, clampSwing, clicksPerBeat } from './model/subdivisions';
import { clampTempo, nudgeTempo } from './model/tempo';
import { gapConfig, trainerConfig } from './model/trainer';
import styles from './Metronome.module.css';

/** Storage keys (through the platform storage layer). */
const SETTINGS_KEY = 'metronome.settings';
const PRESETS_KEY = 'metronome.presets';

/** Two panes (the metronome left, settings right) from this width up. */
const TWO_PANE_QUERY = '(min-width: 1100px)';
/** A phone held sideways. */
const SIDEWAYS_QUERY = '(orientation: landscape) and (max-height: 520px)';
/** A laptop too short for the page heading above the dial. */
const SHORT_QUERY = '(max-height: 899.98px)';

type SheetId = 'meter' | 'rhythm' | 'sound' | 'practice' | 'presets';

const SHEET_TITLES: Record<SheetId, string> = {
  meter: 'Time signature',
  rhythm: 'Subdivision',
  sound: 'Sound',
  practice: 'Practice helpers',
  presets: 'Presets',
};

/** Is this keyboard event aimed at something that types or has its own Space key? */
function ownsKeys(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return false;
}

/** The Metronome screen (`#metronome`). */
export default function MetronomeScreen(_props: RouteProps) {
  const prefs = usePrefs();
  const sound: ClickSet = normalizeClickSet(prefs.sound.clickSound);
  const [stored, setStored] = useLocalState<unknown>(SETTINGS_KEY, DEFAULT_SETTINGS);
  const settings = useMemo(() => sanitizeSettings(stored), [stored]);
  const [storedPresets, setStoredPresets] = useLocalState<unknown>(PRESETS_KEY, []);
  const presets = useMemo(() => sanitizePresets(storedPresets), [storedPresets]);

  const twoPane = useMediaQuery(TWO_PANE_QUERY);
  const sideways = useMediaQuery(SIDEWAYS_QUERY) && !twoPane;
  const shortScreen = useMediaQuery(SHORT_QUERY);
  const touch = useIsTouch();
  useImmersive(sideways, 'focus');

  // One session per visit. Strict mode detaches and re-attaches it, so leaving only stops it.
  const sessionRef = useRef<MetronomeSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new MetronomeSession();
  const session = sessionRef.current;
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [running, setRunning] = useState(false);
  useEffect(() => session.onRunning(setRunning), [session]);

  useEffect(() => {
    session.configure(settings, sound);
  }, [session, settings, sound]);

  // The tempo actually being played (the speed trainer moves it once a bar).
  const [liveTempo, setLiveTempo] = useState<number | null>(null);
  /** The last tempo a speed-trainer climb reached in this visit (kept when the trainer is switched off). */
  const reached = useRef<number | null>(null);
  const trainerOnRef = useRef(settings.trainer.on);
  trainerOnRef.current = settings.trainer.on;
  useEffect(
    () =>
      session.onBeat((b) => {
        const t = Math.round(b.tempo);
        if (trainerOnRef.current && !b.countIn) reached.current = t;
        setLiveTempo((prev) => (prev === t ? prev : t));
      }),
    [session],
  );
  useEffect(() => {
    if (!running) setLiveTempo(null);
  }, [running]);
  const trainer = trainerConfig(settings.trainer);
  const climbing = running && trainer !== null;
  const shownTempo = climbing && liveTempo !== null ? liveTempo : settings.tempo;

  const meter = useMemo(() => meterOf(settings.meter), [settings.meter]);
  const accents = useMemo(() => accentsOf(settings), [settings]);

  // --- changing things -------------------------------------------------------------------------

  const update = useCallback((fn: (s: MetronomeSettings) => MetronomeSettings) => setStored((prev: unknown) => sanitizeSettings(fn(sanitizeSettings(prev)))), [setStored]);

  const runningRef = useRef(running);
  runningRef.current = running;

  /** A new tempo from the dial, the buttons, typing, tapping or the keys. */
  const setTempo = useCallback(
    (bpm: number) => {
      const tempo = clampTempo(bpm);
      const current = sanitizeSettings(stored);
      if (current.trainer.on && session.running) {
        // The learner took the tempo over in the middle of a climb: the trainer steps aside.
        toast.info('Speed trainer off', { description: `You set the tempo yourself: ${tempo} BPM.`, id: 'metronome-trainer' });
        update((s) => ({ ...s, tempo, trainer: { ...s.trainer, on: false } }));
        return;
      }
      update((s) => (s.trainer.on ? { ...s, tempo, trainer: { ...s.trainer, start: tempo } } : { ...s, tempo }));
    },
    [stored, session, update],
  );

  const shownTempoRef = useRef(shownTempo);
  shownTempoRef.current = shownTempo;
  const nudge = useCallback((direction: 1 | -1, big = false) => setTempo(nudgeTempo(shownTempoRef.current, direction, big)), [setTempo]);

  const setMeter = useCallback(
    (key: string) =>
      update((s) => {
        const next = normalizeMeterKey(key);
        if (next === s.meter) return s;
        const tempo = clampTempo(tempoForRegrouping(s.tempo, meterOf(s.meter), meterOf(next)));
        return { ...s, meter: next, accents: null, tempo, trainer: s.trainer.on ? { ...s.trainer, start: tempo } : s.trainer };
      }),
    [update],
  );

  const cycleAccent = useCallback((beat: number) => update((s) => cycleBeatAccent(s, beat)), [update]);

  const liveTempoRef = useRef(liveTempo);
  liveTempoRef.current = liveTempo;
  const setTrainer = useCallback(
    (on: boolean) =>
      update((s) => {
        if (!on) {
          // Keep the tempo the climb had reached: that is where the learner now plays.
          const tempo = runningRef.current && liveTempoRef.current !== null ? liveTempoRef.current : (reached.current ?? s.tempo);
          reached.current = null;
          return { ...s, tempo, trainer: { ...s.trainer, on: false } };
        }
        reached.current = null;
        const start = s.tempo;
        const target = s.trainer.target > start ? s.trainer.target : clampTempo(start + 20);
        return { ...s, trainer: { ...s.trainer, on: true, start, target } };
      }),
    [update],
  );

  // --- start, stop, tap --------------------------------------------------------------------------

  const [timerDone, setTimerDone] = useState<number | null>(null);
  const toggle = useCallback(() => {
    setTimerDone(null);
    const s = sanitizeSettings(stored);
    // A finished session timer starts again from zero.
    if (!session.running) {
      const left = timerRemaining(s.timerMinutes, session.time().timerSec);
      if (left !== null && left <= 0) session.resetTimer();
    }
    session.toggle();
  }, [session, stored]);

  const [tapInfo, setTapInfo] = useState<{ count: number; bpm: number | null } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tap = useCallback(
    (atMs?: number) => {
      const bpm = session.tap(atMs);
      setTapInfo((prev) => ({ count: bpm === null ? 1 : (prev?.count ?? 1) + 1, bpm: bpm === null ? null : Math.round(bpm) }));
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = setTimeout(() => setTapInfo(null), 2500);
      if (bpm !== null) setTempo(Math.round(bpm));
    },
    [session, setTempo],
  );
  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
  }, []);

  // --- background: wake lock, timer, progress -----------------------------------------------------

  useEffect(() => (running ? keepAwake() : undefined), [running]);

  const [clock, setClock] = useState({ visitSec: 0, timerSec: 0 });
  useInterval(
    () => {
      const t = session.time();
      const next = { visitSec: Math.floor(t.visitSec), timerSec: Math.floor(t.timerSec) };
      // Re-render once a second, not on every tick of this check.
      setClock((prev) => (prev.visitSec === next.visitSec && prev.timerSec === next.timerSec ? prev : next));
      const left = timerRemaining(settings.timerMinutes, t.timerSec);
      if (left !== null && left <= 0 && session.running) {
        session.stop();
        setTimerDone(settings.timerMinutes);
        playUi('lessonComplete');
      }
    },
    running ? 250 : null,
  );
  useEffect(() => {
    if (running) return;
    const t = session.time();
    setClock({ visitSec: Math.floor(t.visitSec), timerSec: Math.floor(t.timerSec) });
  }, [running, session]);

  const recorded = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const recordVisit = useCallback(() => {
    if (recorded.current) return;
    const sec = practiceSeconds(session.time().visitSec);
    if (sec === null) return;
    recorded.current = true;
    const s = settingsRef.current;
    recordActivity({ kind: 'metronome', durationSec: sec, route: 'metronome', title: `Metronome: ${describeSetup(setupOf(s))}`, meta: { tempo: s.tempo } });
  }, [session]);

  useEffect(() => {
    session.attach();
    return () => {
      // Leaving the screen: the click stops at once, and the visit counts if it was long enough.
      session.detach();
      recordVisit();
    };
  }, [session, recordVisit]);
  useEventListener(typeof window !== 'undefined' ? window : null, 'pagehide', () => {
    session.stop();
    recordVisit();
  });

  // --- presets -------------------------------------------------------------------------------------

  const [sheet, setSheet] = useState<SheetId | null>(null);
  // The sheet keeps its title and content while it slides away.
  const lastSheet = useRef<SheetId>('rhythm');
  if (sheet) lastSheet.current = sheet;
  const applyPresetById = useCallback(
    (p: Preset) => {
      update((s) => applyPreset(s, p));
      if (!twoPane) setSheet(null);
      toast.ok(`${p.name} is set`, { description: running ? undefined : 'Press Start when you are ready.', id: 'metronome-preset' });
    },
    [update, twoPane, running],
  );
  const savePreset = useCallback(
    (name: string) => {
      const p = makePreset(name, settings, presets);
      setStoredPresets([p, ...presets].slice(0, MAX_PRESETS));
      toast.ok(`Saved "${p.name}"`, { id: 'metronome-preset' });
    },
    [settings, presets, setStoredPresets],
  );
  const deletePreset = useCallback(
    (p: Preset) => {
      const before = presets;
      setStoredPresets(presets.filter((q) => q.id !== p.id));
      toast({ title: `Deleted "${p.name}"`, id: 'metronome-preset', action: { label: 'Undo', onClick: () => setStoredPresets(before) } });
    },
    [presets, setStoredPresets],
  );

  // --- keyboard ------------------------------------------------------------------------------------

  useEventListener(typeof window !== 'undefined' ? window : null, 'keydown', (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || sheet !== null) return;
    const el = event.target as HTMLElement | null;
    if (ownsKeys(el)) return;
    const key = event.key;
    if (key === ' ' || key === 'Spacebar') {
      // On a control reached by keyboard, Space presses that control; after a mouse click it is start/stop.
      const tag = el?.tagName ?? '';
      if ((tag === 'BUTTON' || tag === 'A' || el?.getAttribute('role') === 'radio') && el?.matches(':focus-visible')) return;
      event.preventDefault();
      if (!event.repeat) toggle();
      return;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      if (el?.getAttribute('role') === 'radio' || el?.getAttribute('role') === 'slider') return;
      event.preventDefault();
      nudge(key === 'ArrowUp' ? 1 : -1, event.shiftKey);
      return;
    }
    if ((key === 't' || key === 'T') && !event.repeat) {
      event.preventDefault();
      tap(event.timeStamp);
      return;
    }
    if (/^[1-9]$/.test(key) && !event.repeat) {
      const beat = Number(key) - 1;
      if (beat < meter.beats.length) {
        event.preventDefault();
        cycleAccent(beat);
      }
    }
  });

  // --- pieces ----------------------------------------------------------------------------------------

  const common = COMMON_METERS.includes(settings.meter);
  const choice = meterChoice(settings.meter);
  const moreLabel = common ? 'More' : (choice?.id ?? meterLabel(settings.meter));
  const sideMeterRef = useRef<HTMLDivElement | null>(null);
  const openMeters = () => {
    if (twoPane) {
      sideMeterRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      sideMeterRef.current?.querySelector<HTMLElement>('button[aria-pressed="true"], button')?.focus({ preventScroll: true });
    } else setSheet('meter');
  };

  const minus = usePressHold(() => nudge(-1));
  const plus = usePressHold(() => nudge(1));

  const timerLeft = timerRemaining(settings.timerMinutes, clock.timerSec);
  const timeText = timerLeft !== null ? `${formatClock(Math.ceil(timerLeft))} left` : clock.timerSec > 0 ? formatClock(clock.timerSec) : '';

  const helpersOn: string[] = [];
  if (trainer) helpersOn.push(`Speed trainer ${trainer.startBpm} to ${trainer.targetBpm}`);
  if (settings.gap.on) helpersOn.push(`Silent bars ${settings.gap.play}+${settings.gap.mute}`);
  if (settings.timerMinutes > 0) helpersOn.push(`Timer ${settings.timerMinutes} min`);
  if (settings.visualOnly) helpersOn.push('Flash only');
  if (settings.vibrate) helpersOn.push('Vibrate');

  const subCount = clicksPerBeat(meter, settings.subdivision, settings.swing)[0] ?? 1;
  const dottedBeat = meter.beats[0] ? meter.beats[0].length % 960 !== 0 : false;

  const onBeat = useMemo(() => session.onBeat.bind(session), [session]);
  const panels: Record<SheetId, ReactNode> = {
    meter: (
      <MeterPanel
        meterKey={settings.meter}
        meter={meter}
        onMeter={(key) => {
          setMeter(key);
          // Nothing more to choose for this one: show the result straight away.
          if (!twoPane && (meterChoice(key)?.groupings.length ?? 0) <= 1) setSheet(null);
        }}
        skipCommon={twoPane}
      />
    ),
    rhythm: (
      <RhythmPanel
        meter={meter}
        subdivision={settings.subdivision}
        swing={settings.swing}
        onSubdivision={(sub: Subdivision) => update((s) => ({ ...s, subdivision: sub }))}
        onSwing={(r) => update((s) => ({ ...s, swing: clampSwing(r) }))}
      />
    ),
    sound: (
      <SoundPanel
        sound={sound}
        onSound={(set) => setPrefs({ sound: { clickSound: set } })}
        volume={settings.volume}
        onVolume={(v) => update((s) => ({ ...s, volume: v }))}
        countIn={settings.countIn}
        onCountIn={(n) => update((s) => ({ ...s, countIn: n }))}
      />
    ),
    practice: (
      <PracticePanel
        settings={settings}
        update={update}
        running={running}
        timerSec={clock.timerSec}
        onResetTimer={() => {
          session.resetTimer();
          setClock((c) => ({ ...c, timerSec: 0 }));
          setTimerDone(null);
        }}
        onBeat={onBeat}
        onTrainer={setTrainer}
      />
    ),
    presets: <PresetsPanel settings={settings} presets={presets} onApply={applyPresetById} onSave={savePreset} onDelete={deletePreset} />,
  };

  const tiles: Array<{ id: SheetId; label: string; value: string; icon: ReactNode }> = [
    { id: 'rhythm', label: 'Subdivision', value: SUBDIVISION_INFO[settings.subdivision].label, icon: <SubdivisionPicture subdivision={settings.subdivision} count={subCount} dottedBeat={dottedBeat} className={styles.tilePicture} /> },
    { id: 'sound', label: 'Sound', value: settings.visualOnly ? 'Flash only' : soundLabel(sound), icon: <Icon name={settings.visualOnly ? 'Eye' : 'Volume2'} size={20} /> },
    { id: 'practice', label: 'Practice', value: helpersOn.length === 0 ? 'Helpers off' : helpersOn.length === 1 ? helpersOn[0].split(' ').slice(0, 2).join(' ') : `${helpersOn.length} on`, icon: <Icon name="TrendingUp" size={20} /> },
    { id: 'presets', label: 'Presets', value: presets.length ? `${presets.length} saved` : 'Save, recall', icon: <Icon name="Bookmark" size={20} /> },
  ];

  const tapLabel = tapInfo === null ? 'Tap' : tapInfo.bpm === null ? 'Again' : String(tapInfo.bpm);
  const layout = twoPane ? 'two-pane' : sideways ? 'sideways' : 'column';

  const stage = (
    <section className={styles.stage} aria-label="Metronome">
      <div className={styles.meterRow} role="group" aria-label="Time signature">
        {COMMON_METERS.map((id) => (
          <Chip key={id} selected={settings.meter === id} onClick={() => setMeter(id)} className={styles.meterChip} data-meter-chip={id}>
            {id}
          </Chip>
        ))}
        <Chip selected={!common} onClick={openMeters} className={cx(styles.meterChip, styles.moreChip)} aria-haspopup={twoPane ? undefined : 'dialog'} data-meter-chip="more">
          {moreLabel}
          <Icon name="ChevronDown" size={14} />
        </Chip>
      </div>

      {helpersOn.length > 0 && (
        <div className={styles.flags}>
          {helpersOn.map((h) => (
            <button key={h} type="button" className={styles.flag} onClick={() => (twoPane ? document.getElementById('metronome-practice')?.scrollIntoView({ behavior: 'smooth' }) : setSheet('practice'))}>
              {h}
            </button>
          ))}
        </div>
      )}

      <BeatStrip
        className={styles.beats}
        meter={meter}
        accents={accents}
        subdivision={settings.subdivision}
        swing={settings.swing}
        gap={gapConfig(settings.gap)}
        running={running}
        onCycle={cycleAccent}
        onBeat={onBeat}
        rootRef={rootRef}
        keys={!touch}
      />

      {!twoPane && (
        <div className={styles.tiles}>
          {tiles.map((t) => (
            <button key={t.id} type="button" className={styles.tile} onClick={() => setSheet(t.id)} aria-haspopup="dialog" data-sheet={t.id}>
              <span className={styles.tileIcon}>{t.icon}</span>
              <span className={styles.tileText}>
                <span className={styles.tileLabel}>{t.label}</span>
                <span className={styles.tileValue}>{t.value}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.dialArea}>
        <div className={styles.dialBox}>
          <TempoDial value={shownTempo} onChange={setTempo} beatNote={tempoBeatNote(meter)} onBeat={onBeat} strongPulse={settings.visualOnly} />
        </div>
      </div>

      <div className={styles.tempoRow}>
        <Tooltip content={<>Slower <Kbd>↓</Kbd> · 5 slower <Kbd>Shift</Kbd>+<Kbd>↓</Kbd></>}>
          <button type="button" className={styles.step} aria-label="Slower by 1 BPM (hold to keep going)" {...minus} disabled={shownTempo <= 20} data-tempo-step="-1">
            <Icon name="Minus" size={24} />
          </button>
        </Tooltip>
        <Tooltip content={<>Tap the beat to set the tempo <Kbd>T</Kbd></>}>
          <button
            type="button"
            className={cx(styles.tap, tapInfo !== null && styles.tapping)}
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse' && e.button !== 0) return;
              tap(e.timeStamp);
            }}
            onClick={(e) => {
              // Keyboard activation (Enter / Space on a focused button) comes without a pointer.
              if (e.detail === 0) tap();
            }}
            aria-label={tapInfo === null ? 'Tap tempo: tap along with the beat' : tapInfo.bpm === null ? 'Tap tempo: tap again' : `Tap tempo: ${tapInfo.bpm} BPM`}
            data-tap
          >
            <Icon name="Hand" size={20} />
            <span className={styles.tapLabel}>{tapLabel}</span>
          </button>
        </Tooltip>
        <Tooltip content={<>Faster <Kbd>↑</Kbd> · 5 faster <Kbd>Shift</Kbd>+<Kbd>↑</Kbd></>}>
          <button type="button" className={styles.step} aria-label="Faster by 1 BPM (hold to keep going)" {...plus} disabled={shownTempo >= 400} data-tempo-step="1">
            <Icon name="Plus" size={24} />
          </button>
        </Tooltip>
      </div>
      <p className={styles.live} aria-live="polite">
        {tapInfo !== null && (tapInfo.bpm === null ? 'Keep tapping with the beat.' : `Tapped tempo ${tapInfo.bpm} BPM.`)}
      </p>

      {timerDone !== null && (
        <Banner tone="ok" live title={`${timerDone} ${timerDone === 1 ? 'minute' : 'minutes'} done`} onDismiss={() => setTimerDone(null)}>
          Steady work. Press Start for another round.
        </Banner>
      )}

      <div className={styles.startRow} data-on={running ? 'stop' : 'start'}>
        <Tooltip content={<>Start or stop <Kbd>Space</Kbd></>}>
          <Button variant={running ? 'secondary' : 'primary'} size="lg" fullWidth iconLeft={running ? 'Square' : 'Play'} onClick={toggle} className={styles.start} data-start>
            {running ? 'Stop' : 'Start'}
          </Button>
        </Tooltip>
        <span className={styles.time} aria-label={timeText ? `Practice time ${timeText}` : undefined}>
          {timeText}
        </span>
      </div>
      {twoPane && !touch && (
        <p className={styles.keys}>
          <span>
            <Kbd>Space</Kbd> start, stop
          </span>
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> tempo
          </span>
          <span>
            <Kbd>T</Kbd> tap
          </span>
          <span>
            <Kbd>1</Kbd>–<Kbd>{Math.min(9, meter.beats.length)}</Kbd> accents
          </span>
        </p>
      )}
    </section>
  );

  return (
    <Page title="Metronome" subtitle="Set a tempo, press Start, play along." hideHeader={!twoPane || shortScreen} gap={0} className={styles.screen}>
      <div
        ref={rootRef}
        className={cx(styles.layout, twoPane && styles.twoPane, sideways && styles.sideways)}
        data-metronome
        data-layout={layout}
        data-running={running ? 'true' : 'false'}
        data-bpm={shownTempo}
        data-meter={settings.meter}
        data-subdivision={settings.subdivision}
        data-visual-only={settings.visualOnly ? 'true' : undefined}
      >
        {stage}
        {twoPane && (
          <div className={styles.side}>
            <div ref={sideMeterRef} className={styles.sideBlock}>
              <Section title="More time signatures" description={choice && !common ? undefined : 'Odd meters and their groupings. The four everyday ones sit beside the beats.'} level={2}>
                {panels.meter}
              </Section>
            </div>
            <Section title="Subdivision" description="Extra, softer clicks between the beats." level={2} divided>
              {panels.rhythm}
            </Section>
            <Section title="Sound" level={2} divided>
              {panels.sound}
            </Section>
            <div id="metronome-practice" className={styles.sideBlock}>
              <Section title="Practice helpers" description="Each one is off until you switch it on." level={2} divided>
                {panels.practice}
              </Section>
            </div>
            <Section title="Presets" description="Save the setup you use, recall it in one tap." level={2} divided>
              {panels.presets}
            </Section>
          </div>
        )}
      </div>

      {!twoPane && (
        <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={SHEET_TITLES[lastSheet.current]} size="md">
          {panels[lastSheet.current]}
        </Sheet>
      )}
    </Page>
  );
}
