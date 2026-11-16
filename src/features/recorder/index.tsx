/**
 * The Recorder (`#record`, `#record--<label>`): record yourself, then listen back.
 *
 * How it is put together:
 *  - `engine/session.ts` owns one recording: the microphone (`requestMic`), the level meter, the
 *    metronome count-in and click, and MediaRecorder. It lives outside React, so leaving the screen
 *    mid-take still finishes and stores the take (a toast says where it went).
 *  - `engine/finish.ts` stores a recording as a take (exact length and waveform from decoding it)
 *    and reports the time played with `recordActivity` (kind `other`, source `recorder`).
 *  - `engine/player.ts` plays takes back on the app's AudioContext, untouched, and swaps takes at
 *    the same moment for the A/B comparison (`ui/CompareSheet.tsx`).
 *  - `model/store.ts` keeps takes in IndexedDB on this device only (`model/backend.ts` picks the
 *    backend); they are too large for backups and cloud sync, and the screen says so.
 *  - `model/support.ts` decides before anything is asked whether this host can record: in a Claude
 *    artifact the viewer refuses the microphone, so the screen shows `MediaBlocked` instead of a
 *    Record button and the takes list still works (empty, or what this browser already has).
 *
 * `#record--<label>` names the takes after the label ("week-1-first-section" -> "Week 1 first
 * section", then "Week 1 first section, take 2"); teacher tasks link here that way, and "Compare"
 * picks the take of the same label nearest a week earlier.
 *
 * Keyboard: R record / stop, Space play / pause the selected take, arrows on the waveform seek,
 * A / B / X in the comparison. The root mirrors state for tests: `data-phase`
 * (idle | opening | counting | recording | finishing), `data-takes`, `data-selected`, `data-playing`,
 * `data-saving`, `data-support` (ok | media | recorder), `data-backend` (indexeddb | memory).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RouteProps } from '@/app/routes';
import { useImmersive } from '@/app/shell';
import { encodeWav, unlockAudio } from '@/core/audio';
import { canSaveFile, isArtifact, saveFile } from '@/core/platform';
import { micOptions } from '@/core/settings';
import {
  ActionBar,
  Banner,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Kbd,
  LinkButton,
  List,
  ListItem,
  MediaBlocked,
  Menu,
  Page,
  PlayButton,
  Section,
  Skeleton,
  Text,
  TextField,
  Tooltip,
  cx,
  formatBytes,
  toast,
  useDialogOpen,
  useEventListener,
  useInterval,
  useIsMobile,
  useLocalState,
  useRafLoop,
} from '@/ui';
import { storeRecording } from './engine/finish';
import { channelsOf, decodeTake, forgetTake, TakePlayer } from './engine/player';
import { RecorderSession, type FinishedRecording, type SessionPhase, type StartFailure } from './engine/session';
import { openTakeStore } from './model/backend';
import { DEFAULT_PREFS, PREFS_KEY, describePrefs, sanitizePrefs, type RecorderPrefs } from './model/prefs';
import { takeAdvice } from './model/signal';
import type { TakeStore } from './model/store';
import { detectSupport } from './model/support';
import { cleanLabel, cleanName, extensionFor, formatDuration, formatTakeDate, nextTakeName, takeFileName, totalBytes, type Take } from './model/takes';
import { CompareSheet } from './ui/CompareSheet';
import { LevelMeter } from './ui/LevelMeter';
import { ListeningTips, OptionsSheet, RenameModal } from './ui/Panels';
import { MiniWave, Waveform } from './ui/Waveform';
import styles from './Recorder.module.css';

type Dialog = 'options' | 'rename' | 'compare' | null;

/** Is this keyboard event aimed at something that types? */
function typing(el: HTMLElement | null): boolean {
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** A clock that follows a source every frame without re-rendering ("0:12"). */
function LiveClock({ read, running, className }: { read: () => number; running: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const last = useRef('');
  const paint = () => {
    const text = formatDuration(read());
    if (text !== last.current && ref.current) {
      last.current = text;
      ref.current.textContent = text;
    }
  };
  useRafLoop(paint, running);
  useEffect(paint);
  return <span ref={ref} className={className} />;
}

/** The Recorder screen. */
export default function RecorderScreen({ params }: RouteProps) {
  const label = useMemo(() => cleanLabel(params[0]), [params]);
  const support = useMemo(() => detectSupport(isArtifact(), typeof window !== 'undefined' && window.isSecureContext === true), []);
  const isMobile = useIsMobile();
  const dialogOpen = useDialogOpen();
  const [storedPrefs, setStoredPrefs] = useLocalState<unknown>(PREFS_KEY, DEFAULT_PREFS);
  const prefs = useMemo(() => sanitizePrefs(storedPrefs), [storedPrefs]);

  // --- the takes ------------------------------------------------------------------------------
  const [store, setStore] = useState<TakeStore | null>(null);
  const storeRef = useRef<TakeStore | null>(null);
  const [takes, setTakes] = useState<Take[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    void openTakeStore().then(async (s) => {
      if (!alive) return;
      storeRef.current = s;
      setStore(s);
      const list = await s.list().catch(() => [] as Take[]);
      if (!alive) return;
      setTakes(list);
      // Open on the newest take of this task, else the newest take: a useful state, ready to play.
      setSelectedId((current) => current ?? (list.find((t) => label && t.label === label) ?? list[0])?.id ?? null);
    });
    return () => {
      alive = false;
      mounted.current = false;
    };
    // Runs once: the label only picks the first selection.
  }, []);

  const selected = useMemo(() => takes?.find((t) => t.id === selectedId) ?? null, [takes, selectedId]);

  // --- the name of the next take ------------------------------------------------------------------
  const autoName = takes ? nextTakeName(takes, label) : '';
  const [typedName, setTypedName] = useState<string | null>(null);
  useEffect(() => setTypedName(null), [label]);
  const nameValue = typedName ?? autoName;

  // --- recording ------------------------------------------------------------------------------------
  const sessionRef = useRef<RecorderSession | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [count, setCount] = useState<number | null>(null);
  const [failure, setFailure] = useState<StartFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [advice, setAdvice] = useState<{ id: string; tone: 'warn' | 'info'; text: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const details = useRef<{ name: string; label: string | null }>({ name: '', label: null });
  const busy = phase !== 'idle';
  useImmersive(busy, 'focus');
  const readLevel = useCallback(() => sessionRef.current?.level() ?? { db: -Infinity, peak: 0 }, []);

  // The clock shows whole seconds: re-render only when the second changes.
  useInterval(() => {
    const ms = sessionRef.current?.elapsedMs() ?? 0;
    setElapsed((prev) => (Math.floor(prev / 1000) === Math.floor(ms / 1000) ? prev : ms));
  }, phase === 'recording' ? 250 : null);

  const finished = useCallback(async (rec: FinishedRecording | null) => {
    sessionRef.current = null;
    if (mounted.current) {
      setCount(null);
      setElapsed(0);
    }
    const target = storeRef.current;
    if (!rec || !target) return;
    if (mounted.current) setSaving(true);
    try {
      const { take, list } = await storeRecording(target, rec, details.current);
      if (mounted.current) {
        setTakes(list);
        setSelectedId(take.id);
        setTypedName(null);
        const note = takeAdvice(take.peaks);
        setAdvice(note ? { id: take.id, ...note } : null);
        toast.ok(`Saved “${take.name}”`, { description: rec.hitLimit ? 'It stopped by itself at ten minutes, the longest a take can be.' : 'Press Play to listen back.' });
      } else {
        toast.ok(`Saved your take “${take.name}”`, { description: 'It is in Tools > Recorder.' });
      }
    } catch (e) {
      // Never lose a take: if it cannot be stored, offer it as a file straight away.
      toast.error('The take could not be kept on this device', {
        description: e instanceof Error ? e.message : undefined,
        duration: 0,
        action: {
          label: 'Save it as a file',
          onClick: () => void saveFile(takeFileName({ name: details.current.name || 'take', createdAt: rec.startedAt }, extensionFor(rec.mimeType)), rec.blob, rec.mimeType.split(';')[0]),
        },
      });
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, []);

  // --- playback -------------------------------------------------------------------------------------
  const playerRef = useRef<TakePlayer | null>(null);
  if (!playerRef.current) playerRef.current = new TakePlayer();
  const player = playerRef.current;
  const [playing, setPlaying] = useState(false);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [duration, setDuration] = useState(0);
  useEffect(() => player.onChange((s) => setPlaying(s.playing)), [player]);
  useEffect(() => () => player.dispose(), [player]);
  const position = useCallback(() => player.position(), [player]);

  useEffect(() => {
    player.load(null);
    setDuration(0);
    if (!selected || !store) {
      setLoadState('idle');
      return;
    }
    let alive = true;
    setLoadState('loading');
    void (async () => {
      const blob = await store.audio(selected.id).catch(() => null);
      const buffer = blob ? await decodeTake(selected.id, blob) : null;
      if (!alive) return;
      if (!buffer) {
        setLoadState('failed');
        return;
      }
      player.load(buffer);
      setDuration(buffer.duration);
      setLoadState('ready');
    })();
    return () => {
      alive = false;
    };
  }, [selected?.id, store, player]);

  const togglePlay = useCallback(() => {
    if (busy || loadState !== 'ready') return;
    void unlockAudio();
    player.toggle();
  }, [busy, loadState, player]);

  // --- record / stop --------------------------------------------------------------------------------
  const startRecording = useCallback(async () => {
    if (!support.ok || !storeRef.current || sessionRef.current) return;
    void unlockAudio();
    player.pause();
    setFailure(null);
    setAdvice(null);
    details.current = { name: cleanName(nameValue), label };
    const session = new RecorderSession();
    sessionRef.current = session;
    session.onPhase((p) => {
      if (mounted.current) setPhase(p);
    });
    session.onCount((n) => {
      if (mounted.current) setCount(n);
    });
    session.onLimit((rec) => void finished(rec));
    const result = await session.start({ mimeType: support.mimeType, deviceId: micOptions().deviceId, countIn: prefs.countIn, click: prefs.click, bpm: prefs.bpm, beatsPerBar: prefs.beats });
    if (!result.ok) {
      sessionRef.current = null;
      if (mounted.current) setFailure(result.reason);
    }
  }, [support, player, nameValue, label, prefs, finished]);

  const stopRecording = useCallback(async () => {
    const session = sessionRef.current;
    // Already finishing (the length limit, or a second press): that stop stores the take.
    if (!session || session.phase === 'finishing') return;
    if (session.phase === 'recording') {
      const rec = await session.stop();
      await finished(rec);
    } else {
      await session.cancel();
      sessionRef.current = null;
      setCount(null);
    }
  }, [finished]);

  const toggleRecord = useCallback(() => {
    if (saving) return;
    if (sessionRef.current) void stopRecording();
    else void startRecording();
  }, [saving, startRecording, stopRecording]);

  // Leaving mid-take keeps the take; leaving during the count-in keeps nothing.
  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (!session) return;
      if (session.phase === 'recording') void session.stop().then((rec) => finished(rec));
      else void session.cancel();
    },
    [finished],
  );

  // --- take actions -----------------------------------------------------------------------------------
  const [dialog, setDialog] = useState<Dialog>(null);
  const [wavAllowed, setWavAllowed] = useState(false);
  // The comparison has its own player: the main one goes quiet while it is open.
  useEffect(() => {
    if (dialog === 'compare') player.pause();
  }, [dialog, player]);
  useEffect(() => {
    void canSaveFile('take.wav').then(setWavAllowed);
  }, []);

  const rename = async (take: Take, name: string) => {
    if (!store) return;
    try {
      setTakes(await store.put({ ...take, name }));
      toast.ok('Renamed');
    } catch (e) {
      toast.error('The name could not be saved', { description: e instanceof Error ? e.message : undefined });
    }
  };

  const remove = async (take: Take) => {
    if (!store || !takes) return;
    const blob = await store.audio(take.id).catch(() => null);
    const index = takes.findIndex((t) => t.id === take.id);
    try {
      const list = await store.remove(take.id);
      forgetTake(take.id);
      setTakes(list);
      if (selectedId === take.id) setSelectedId(list[Math.min(index, list.length - 1)]?.id ?? null);
      if (advice?.id === take.id) setAdvice(null);
      toast({
        title: `Deleted “${take.name}”`,
        action: blob
          ? {
              label: 'Undo',
              onClick: () => {
                void store.put(take, blob).then((restored) => {
                  if (!mounted.current) return;
                  setTakes(restored);
                  setSelectedId(take.id);
                });
              },
            }
          : undefined,
      });
    } catch (e) {
      toast.error('The take could not be deleted', { description: e instanceof Error ? e.message : undefined });
    }
  };

  const saveAsFile = async (take: Take, wav: boolean) => {
    if (!store) return;
    const blob = await store.audio(take.id).catch(() => null);
    if (!blob) {
      toast.error('This take’s audio is missing on this device');
      return;
    }
    let result;
    if (wav) {
      const buffer = await decodeTake(take.id, blob);
      if (!buffer) {
        toast.error('This take cannot be turned into a WAV file in this browser');
        return;
      }
      const channels = channelsOf(buffer);
      result = await saveFile(takeFileName(take, 'wav'), encodeWav(channels[0], buffer.sampleRate, { channels: channels.slice(0, 2) }), 'audio/wav');
    } else {
      result = await saveFile(takeFileName(take, extensionFor(take.mimeType)), blob, take.mimeType.split(';')[0]);
    }
    if (result.ok) toast.ok('Saved as a file');
    else if (result.reason !== 'declined') toast.error(result.message);
  };

  // --- keyboard -------------------------------------------------------------------------------------
  useEventListener(typeof window !== 'undefined' ? window : null, 'keydown', (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || dialogOpen) return;
    const el = event.target as HTMLElement | null;
    if (typing(el)) return;
    if ((event.key === 'r' || event.key === 'R') && !event.repeat) {
      if (!support.ok) return;
      event.preventDefault();
      toggleRecord();
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      // On a control reached by keyboard, Space presses that control; otherwise it plays the take.
      const tag = el?.tagName ?? '';
      if ((tag === 'BUTTON' || tag === 'A' || el?.getAttribute('role') === 'slider') && el?.matches(':focus-visible')) return;
      if (!selected) return;
      event.preventDefault();
      if (!event.repeat) togglePlay();
    }
  });

  // --- pieces -----------------------------------------------------------------------------------------
  const recording = phase === 'recording';
  const counting = phase === 'counting' || phase === 'opening';
  const recordLabel = recording ? 'Stop recording' : counting ? 'Cancel the count-in' : 'Record';
  const status = saving
    ? 'Saving your take…'
    : phase === 'opening'
      ? 'Starting the microphone…'
      : phase === 'counting'
        ? count !== null
          ? `Get ready: ${count}`
          : 'Get ready…'
        : recording
          ? 'Recording'
          : support.ok
            ? 'Ready when you are'
            : '';

  const recordButton = (size: 'lg' | 'xl') => (
    <Tooltip content={<span>{recordLabel} <Kbd>R</Kbd></span>}>
      <PlayButton
        size={size}
        tone="danger"
        icon={busy ? 'Square' : 'Circle'}
        filled
        label={recordLabel}
        loading={saving}
        onClick={toggleRecord}
        aria-keyshortcuts="R"
        data-recorder-record=""
        className={cx(styles.recordButton, recording && styles.recordLive)}
      />
    </Tooltip>
  );

  const clock = (
    <span className={styles.clock} data-recorder-clock="" aria-hidden={!recording || undefined}>
      {phase === 'counting' && count !== null ? <span className={styles.countNumber}>{count}</span> : formatDuration(elapsed)}
    </span>
  );

  const failurePanel =
    failure &&
    (failure === 'recorder-failed' ? (
      <Banner tone="warn" title="The recording could not start" live>
        The microphone opened but this browser refused to record it. Try again; if it keeps failing, use a current Chrome, Edge, Firefox or Safari.
      </Banner>
    ) : (
      <MediaBlocked reason={failure} device="microphone" onRetry={() => void startRecording()} level={3} framed>
        <p>You can still listen to the takes already on this device.</p>
      </MediaBlocked>
    ));

  const unsupportedPanel: ReactNode = support.ok ? null : support.kind === 'media' ? (
    <MediaBlocked reason={support.reason} device="microphone" level={2} framed>
      <p>Your phone’s own voice recorder does the same job: record yourself there, then listen back with the checklist on this page. {takes && takes.length > 0 ? 'Takes already on this device still play here.' : ''}</p>
    </MediaBlocked>
  ) : (
    <div className={styles.blocked} role="alert">
      <span className={styles.blockedIcon} aria-hidden="true">
        <Icon name="MicOff" size={24} />
      </span>
      <div>
        <h2 className={styles.blockedTitle}>{support.title}</h2>
        <p className={styles.blockedText}>{support.fix}</p>
      </div>
    </div>
  );

  const deck = (
    <section className={styles.deck} aria-label="Record a take" data-recorder-deck="">
      <TextField label="Name of the next take" value={nameValue} onChange={setTypedName} maxLength={60} disabled={busy} data-recorder-name="" hint={label ? 'From your lesson. Change it if you like.' : undefined} />
      <div className={styles.stage} data-counting={phase === 'counting' || undefined} data-live={recording || undefined}>
        {!isMobile && (
          <div className={styles.stageCenter}>
            {recordButton('xl')}
            <div className={styles.stageText}>
              {clock}
              <p className={styles.status} aria-live="polite" data-recorder-status="">
                {recording && <span className={styles.liveDot} aria-hidden="true" />}
                {status}
              </p>
            </div>
          </div>
        )}
        <LevelMeter read={readLevel} active={busy && phase !== 'finishing'} showVerdict />
      </div>
      <Button variant="ghost" iconLeft="SlidersHorizontal" onClick={() => setDialog('options')} disabled={busy} data-recorder-options-open="" className={styles.optionsButton}>
        {describePrefs(prefs)}
      </Button>
      {failurePanel}
    </section>
  );

  const nowPlaying = selected && (
    <section className={styles.player} aria-label={`Take: ${selected.name}`} data-recorder-player="" data-load={loadState}>
      <div className={styles.playerHead}>
        <div className={styles.playerTitle}>
          <h2 className={styles.takeName}>{selected.name}</h2>
          <Text variant="caption" tone="muted">
            {formatTakeDate(selected.createdAt)} · {formatDuration(selected.durationMs)}
            {selected.bpm ? ` · ${selected.bpm} BPM` : ''}
          </Text>
        </div>
        <Menu
          trigger={<IconButton icon="EllipsisVertical" label="More for this take" data-recorder-more="" />}
          items={[
            { label: 'Rename', icon: 'Pencil', onSelect: () => setDialog('rename') },
            { label: 'Save as a file', icon: 'Download', onSelect: () => void saveAsFile(selected, false), hint: extensionFor(selected.mimeType).toUpperCase() },
            ...(wavAllowed ? [{ label: 'Save as WAV', icon: 'Download', onSelect: () => void saveAsFile(selected, true), hint: 'Plays anywhere' }] : []),
            'separator' as const,
            { label: 'Delete', icon: 'Trash2', danger: true, onSelect: () => void remove(selected) },
          ]}
        />
      </div>
      {loadState === 'failed' ? (
        <Banner tone="warn" title="This take cannot be played here">
          Its audio is missing or damaged on this device. You can still delete it.
        </Banner>
      ) : loadState === 'ready' ? (
        <Waveform peaks={selected.peaks} duration={duration} position={position} playing={playing} onSeek={(s) => player.seek(s)} onToggle={togglePlay} label={`Position in “${selected.name}”`} />
      ) : (
        <Skeleton variant="block" height={96} aria-busy="true" />
      )}
      <div className={styles.transport}>
        <Tooltip content={<span>{playing ? 'Pause' : 'Play'} <Kbd>Space</Kbd></span>}>
          <Button variant="primary" size="lg" iconLeft={playing ? 'Pause' : 'Play'} onClick={togglePlay} disabled={busy || loadState !== 'ready'} aria-keyshortcuts="Space" data-recorder-play="">
            {playing ? 'Pause' : 'Play'}
          </Button>
        </Tooltip>
        <span className={styles.time} data-recorder-time="">
          <LiveClock read={() => position() * 1000} running={playing} /> / {formatDuration(duration * 1000 || selected.durationMs)}
        </span>
        {takes && takes.length > 1 && (
          <Button iconLeft="ArrowLeftRight" onClick={() => setDialog('compare')} disabled={busy} data-recorder-compare-open="" className={styles.compareButton}>
            Compare
          </Button>
        )}
      </div>
      {advice && advice.id === selected.id && (
        <Banner tone={advice.tone} onDismiss={() => setAdvice(null)}>
          {advice.text}
          {/silent/.test(advice.text) && (
            <>
              {' '}
              <LinkButton to="profile" params={['settings', 'microphone']} variant="ghost" size="sm">
                Microphone settings
              </LinkButton>
            </>
          )}
        </Banner>
      )}
    </section>
  );

  const deviceNote = (
    <Text variant="caption" tone="muted" className={styles.deviceNote} data-recorder-device-note="">
      <Icon name="HardDrive" size={16} />
      <span>
        Takes stay on this device only: they are too large for backups and sync. Save the ones you want to keep as files.
        {takes && takes.length > 0 ? ` They use ${formatBytes(totalBytes(takes))}.` : ''}
      </span>
    </Text>
  );

  const takeList =
    takes === null ? (
      <div aria-busy="true">
        <Skeleton variant="text" lines={3} />
      </div>
    ) : takes.length === 0 ? (
      <EmptyState icon="AudioLines" title={support.ok ? 'No takes yet' : 'No takes on this device'} level={3}>
        {support.ok ? (
          <>
            Press Record (or <Kbd>R</Kbd>) and play something, even ten seconds. Then listen back: you will hear things your hands cannot feel yet.
          </>
        ) : (
          'Takes recorded with this browser show up here.'
        )}
      </EmptyState>
    ) : (
      <List variant="card" data-recorder-takes="">
        {takes.map((t) => (
          <ListItem
            key={t.id}
            title={t.name}
            subtitle={`${formatTakeDate(t.createdAt)} · ${formatDuration(t.durationMs)}`}
            selected={t.id === selectedId}
            onClick={() => setSelectedId(t.id)}
            trailing={<MiniWave peaks={t.peaks} />}
          />
        ))}
      </List>
    );

  const memoryOnly = store && !store.persistent();

  return (
    <Page
      title="Recorder"
      subtitle="Record yourself, then listen back the way a teacher would."
      data-recorder=""
      data-phase={saving ? 'finishing' : phase}
      data-takes={takes?.length ?? -1}
      data-selected={selectedId ?? ''}
      data-playing={playing || undefined}
      data-saving={saving || undefined}
      data-support={support.ok ? 'ok' : support.kind}
      data-backend={store?.backend ?? ''}
    >
      <div className={styles.layout}>
        <div className={styles.main}>
          {support.ok ? deck : unsupportedPanel}
          {memoryOnly && support.ok && (
            <Banner tone="warn" title="This browser is not keeping takes">
              They disappear when you close this page. Save the ones you want as files.
            </Banner>
          )}
          <Section title="What to listen for" level={2} className={styles.tipsSection}>
            <ListeningTips />
          </Section>
        </div>
        <div className={styles.side}>
          {nowPlaying}
          <Section title="Your takes" level={2} className={styles.takesSection}>
            {deviceNote}
            {takeList}
          </Section>
        </div>
      </div>

      {isMobile && support.ok && (
        <ActionBar
          stretchOnMobile={false}
          className={styles.dock}
          start={
            <div className={styles.dockText}>
              {clock}
              <p className={styles.status} aria-live="polite" data-recorder-status="">
                {recording && <span className={styles.liveDot} aria-hidden="true" />}
                {status}
              </p>
              {busy && phase !== 'finishing' && <LevelMeter read={readLevel} active showVerdict={false} compact />}
            </div>
          }
        >
          {recordButton('lg')}
        </ActionBar>
      )}

      <OptionsSheet open={dialog === 'options'} onClose={() => setDialog(null)} prefs={prefs} onChange={(next: RecorderPrefs) => setStoredPrefs(next)} />
      <RenameModal open={dialog === 'rename' && !!selected} name={selected?.name ?? ''} onClose={() => setDialog(null)} onSave={(name) => {
        setDialog(null);
        if (selected) void rename(selected, name);
      }} />
      <CompareSheet
        open={dialog === 'compare'}
        onClose={() => setDialog(null)}
        store={store}
        takes={takes ?? []}
        take={selected}
      />
    </Page>
  );
}
