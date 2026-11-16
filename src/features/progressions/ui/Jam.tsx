/**
 * Jam with the band over a progression: the chord now and the next one, big enough to read from a
 * metre away (a phone on a music stand), the chord's tones on the neck with a scale to solo with,
 * the chart with the bar that sounds lit, and the band's controls (style, tempo, loop or a number
 * of passes, count-in, who plays). The shown chord follows `band.onChord`, so it changes when the
 * change is heard. The screen stays awake while this view is open.
 *
 * Keyboard: Space play / pause, ←/→ key, ↑/↓ tempo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { href } from '@/app/router';
import { backingFor, formatSlot, type Progression, type ProgressionFeel, type ResolvedChord } from '@/content/progressions';
import { BACKING_STYLES, type BackingInstrument, type BackingStyleId } from '@/core/audio';
import { recordActivity } from '@/core/progress';
import {
  ActionBar, Button, ChipGroup, Icon, IconButton, Page, PlayButton, SegmentedControl, Select, Sheet, Stack, Stepper, Switch, Text,
  cx, useEventListener, useIsMobile, useMediaQuery, useWakeLock,
} from '@/ui';
import { Fretboard, useMusicSettings } from '@/ui/music';
import { strumChord, stopPreview } from '../audio/preview';
import {
  chordAt, clampTempo, defaultTempo, distanceText, endingChord, feelsFor, jamMarkers, positionOf, scaleChoices, scaleFor, upcoming,
  type ChartPos,
} from '../model/jam';
import { chartLines } from '../model/page';
import { stepTonic } from '../model/keys';
import { Chart, KeyPicker } from './Pieces';
import { chordName, dialogOpen, keyName, ownsKey, scaleName, useJamSettings } from './shared';
import { useBand } from './useBand';
import styles from './Jam.module.css';

/** Seconds of playing worth logging as a jam. */
const LOG_AFTER_SEC = 20;
const SIDEWAYS_QUERY = '(orientation: landscape) and (max-height: 520px)';

const PLAYERS: Array<{ id: BackingInstrument; label: string; hint?: string }> = [
  { id: 'drums', label: 'Drums' },
  { id: 'bass', label: 'Bass' },
  { id: 'keys', label: 'Keys' },
  { id: 'guitar', label: 'Rhythm guitar', hint: 'Off by default: you are the guitarist.' },
];

/** Props for {@link JamView}. */
export interface JamViewProps {
  progression: Progression;
  tonic: string;
  /** Change key (route or draft). */
  onTonic: (tonic: string) => void;
  /** Where "back" goes. */
  back: { to: string; params: string[]; label: string };
  title: string;
  /** Skill id for the progress store. */
  skillId: string;
  /** Route params for "continue where you left off". */
  activityParams: string[];
  /** Remembered tempo and style, and how to remember new ones. */
  remembered: { tempo?: number; style?: BackingStyleId };
  remember: (patch: { tempo?: number; style?: BackingStyleId }) => void;
  /** Feels to offer first (default: the progression's own and its alternatives). */
  feels?: ProgressionFeel[];
}

/** The jam view. */
export function JamView({ progression: p, tonic, onTonic, back, title, skillId, activityParams, remembered, remember, feels }: JamViewProps) {
  const { naming } = useMusicSettings();
  const isPhone = useIsMobile();
  const sideways = useMediaQuery(SIDEWAYS_QUERY);
  const wide = useMediaQuery('(min-width: 1080px)');
  useImmersive(true, 'focus');
  useWakeLock(true);
  useScreenTitle(title);
  const [settings, update] = useJamSettings();
  const [optionsOpen, setOptionsOpen] = useState(false);

  // ── Feel, tempo, the band's input ───────────────────────────────────────────────────────
  const { suggested, others } = useMemo(() => {
    const f = feelsFor(p);
    return feels ? { suggested: feels, others: f.others.filter((o) => !feels.some((x) => x.backing === o.backing)) } : f;
  }, [p, feels]);
  const allFeels = useMemo(() => [...suggested, ...others], [suggested, others]);
  const feel = allFeels.find((f) => f.backing === remembered.style) ?? suggested[0];
  const tempo = clampTempo(feel.backing, remembered.tempo ?? defaultTempo(feel));
  const style = BACKING_STYLES[feel.backing];

  const setup = useMemo(() => {
    const base = backingFor(p, tonic, { feel, tempo });
    const end = settings.loop ? undefined : endingChord(base.resolved);
    return backingFor(p, tonic, {
      feel,
      tempo,
      loop: settings.loop,
      choruses: settings.loop ? 1 : settings.choruses,
      countInBars: settings.countIn,
      ...(end ? { endingChord: end } : {}),
    });
  }, [p, tonic, feel, tempo, settings.loop, settings.choruses, settings.countIn]);
  const resolved = setup.resolved;

  // ── The band ────────────────────────────────────────────────────────────────────────────
  const beatsRef = useRef<HTMLDivElement | null>(null);
  const onBeat = useCallback((beat: number, _beats: number, countIn: boolean) => {
    const el = beatsRef.current;
    if (!el) return;
    el.dataset.beat = String(beat);
    el.dataset.countIn = countIn ? 'true' : 'false';
    el.querySelectorAll<HTMLElement>('[data-dot]').forEach((d, i) => d.toggleAttribute('data-on', i === beat));
  }, []);
  const band = useBand(setup, { muted: settings.muted, onBeat });
  const playing = band.status === 'playing' || band.status === 'count-in';

  // Log the session when the learner leaves (or the page is hidden for good).
  const logRef = useRef<() => void>(() => {});
  logRef.current = () => {
    const { seconds, changes } = band.takeStats();
    if (seconds < LOG_AFTER_SEC) return;
    recordActivity({
      kind: 'progression',
      id: skillId,
      title: `Jam: ${title}`,
      durationSec: Math.round(seconds),
      count: changes,
      route: 'progressions',
      params: activityParams,
      data: { tonic, tempo, style: feel.backing },
    });
  };
  useEffect(() => () => logRef.current(), []);
  useEventListener(window, 'pagehide', () => logRef.current());
  useEffect(() => {
    if (band.status === 'idle' && band.started) logRef.current();
  }, [band.status, band.started]);
  useEffect(() => () => stopPreview(), []);

  // ── Where we are ────────────────────────────────────────────────────────────────────────
  const heard = band.heard;
  const pos: ChartPos = heard ? positionOf(resolved, heard.segment) : { bar: 0, index: 0 };
  const current: ResolvedChord = chordAt(resolved, pos);
  const endingNow = !!heard?.segment.ending;
  const nowSymbol = endingNow && heard ? heard.segment.chord.symbol : current.symbol;
  const passesLeft = settings.loop || (heard ? heard.segment.chorus < settings.choruses - 1 : settings.choruses > 1);
  const next = endingNow ? null : upcoming(resolved, pos, passesLeft);
  const counting = band.status === 'count-in' && band.countBeat !== null;
  const started = heard !== null;

  // ── The neck ────────────────────────────────────────────────────────────────────────────
  const choices = useMemo(() => scaleChoices(p, tonic), [p, tonic]);
  const choice = choices.find((c) => c.id === settings.scale) ?? choices[0];
  const soloScale = useMemo(() => scaleFor(choice, nowSymbol, resolved.key), [choice, nowSymbol, resolved.key]);
  const maxFret = wide || sideways ? 15 : 12;
  const markers = useMemo(() => jamMarkers(nowSymbol, soloScale, { maxFret }), [nowSymbol, soloScale, maxFret]);
  const lines = useMemo(() => chartLines(p, resolved), [p, resolved]);

  const scaleOptions = choices.map((c) => ({
    value: c.id,
    label: c.id === 'chord' ? 'Follow the chords' : c.id === 'off' ? 'Chord tones only' : scaleName(c.scale!.tonic, c.scale!.scale, naming),
  }));

  // ── Controls ────────────────────────────────────────────────────────────────────────────
  const setTempo = useCallback((t: number) => remember({ tempo: clampTempo(feel.backing, t) }), [remember, feel.backing]);
  const setStyle = useCallback(
    (id: string) => {
      const f = allFeels.find((x) => x.backing === id);
      if (f) remember({ style: f.backing, tempo: defaultTempo(f) });
    },
    [allFeels, remember],
  );
  const setMuted = (id: BackingInstrument, muted: boolean) => update({ muted: { ...settings.muted, [id]: muted } });

  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || dialogOpen() || ownsKey(e.target, e.key)) return;
    if (e.key === ' ') {
      e.preventDefault();
      void band.toggle();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      onTonic(stepTonic(p, tonic, e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setTempo(tempo + (e.key === 'ArrowUp' ? 5 : -5));
    }
  });

  const tapChord = useCallback((c: ResolvedChord) => {
    if (!playing) void strumChord(c.symbol);
  }, [playing]);

  const statusText = band.status === 'loading'
    ? 'Getting the band ready…'
    : counting
      ? 'Count-in: come in on the first chord'
      : band.status === 'paused'
        ? 'Paused'
        : playing
          ? (settings.loop ? 'Looping' : `Time ${(heard?.segment.chorus ?? 0) + 1} of ${settings.choruses}`)
          : 'Press play: the band counts you in';

  const tempoStepper = (
    <Stepper label="Tempo" hideLabel={isPhone} unit="BPM" min={clampTempo(feel.backing, 0)} max={clampTempo(feel.backing, 999)} step={2} largeStep={10} value={tempo} onChange={setTempo} format={(v) => `${v} beats per minute`} />
  );

  return (
    <Page title={title} hideHeader width="full" className={styles.page} data-progressions="jam">
      <div
        className={cx(styles.jam, sideways && styles.sideways, wide && styles.wide)}
        data-jam
        data-status={band.status}
        data-chord={nowSymbol}
        data-band-chord={heard?.segment.chord.symbol ?? ''}
        data-next={next?.chord.symbol ?? ''}
        data-bar={pos.bar}
        data-index={pos.index}
        data-chorus={heard?.segment.chorus ?? -1}
        data-serial={heard?.serial ?? 0}
        data-tonic={tonic}
        data-style={feel.backing}
        data-tempo={tempo}
        data-scale={soloScale ? `${soloScale.tonic} ${soloScale.scale}` : ''}
      >
        <header className={styles.top}>
          <a className={styles.back} href={href(back.to, ...back.params)}>
            <Icon name="ArrowLeft" size="sm" />
            <span>{back.label}</span>
          </a>
          <div className={styles.topTitle}>
            <Text as="p" weight="semibold" truncate className={styles.title}>{title}</Text>
            <Text size="sm" tone="muted" truncate>
              {keyName(resolved.key, naming)} · {style.name} · {tempo} BPM
            </Text>
          </div>
          <Button iconLeft="SlidersHorizontal" onClick={() => setOptionsOpen(true)} className={styles.optionsButton}>
            Band
          </Button>
        </header>

        <section className={styles.now} aria-label="Chords">
          <div className={styles.nowMain}>
            <span className={styles.label}>{counting ? 'Count-in' : started ? (endingNow ? 'Last chord' : 'Now') : 'First chord'}</span>
            <span className={cx(styles.big, counting && styles.count)} data-now-chord>
              {counting ? band.countBeat : chordName(nowSymbol, naming)}
            </span>
            <span className={styles.nowNumeral}>{counting ? `Then ${chordName(current.symbol, naming)}` : endingNow ? 'The ending' : formatSlot(current.token)}</span>
            <div className={styles.beats} ref={beatsRef} aria-hidden="true">
              {Array.from({ length: resolved.beatsPerBar }, (_, i) => (
                <span key={i} className={styles.dot} data-dot />
              ))}
            </div>
          </div>
          <div className={styles.nowNext}>
            <span className={styles.label}>Next</span>
            {next ? (
              <>
                <span className={styles.nextChord} data-next-chord>{chordName(next.chord.symbol, naming)}</span>
                <span className={styles.nextWhen}>{formatSlot(next.chord.token)} · {distanceText(next.beats, resolved.beatsPerBar)}</span>
              </>
            ) : (
              <>
                <span className={styles.nextChord}>{endingNow ? '—' : 'End'}</span>
                <span className={styles.nextWhen}>{endingNow ? 'Let it ring' : 'Last time through'}</span>
              </>
            )}
          </div>
          <Text size="sm" tone="muted" className={styles.status} aria-live="polite">{statusText}</Text>
        </section>

        <section className={styles.neck} aria-label="On the neck">
          <div className={styles.neckBoard}>
            <Fretboard frets={[0, maxFret]} markers={markers} size={isPhone && !sideways ? 'sm' : 'md'} aria-label={`${chordName(nowSymbol, naming)} on the neck${soloScale ? `, with ${scaleName(soloScale.tonic, soloScale.scale, naming)}` : ''}`} />
          </div>
          <div className={styles.scaleRow}>
            <ChipGroup aria-label="Scale to solo with" options={scaleOptions} value={choice.id} onChange={(v) => update({ scale: v })} scroll="auto" />
            <Text size="sm" tone="muted">
              {soloScale
                ? `Over ${chordName(nowSymbol, naming)}: ${scaleName(soloScale.tonic, soloScale.scale, naming)}. Big dots are the chord’s own notes (R = root), small ones the rest of the scale.`
                : `The dots are the notes of ${chordName(nowSymbol, naming)}: R is the root, then its third, fifth and so on.`}
            </Text>
          </div>
        </section>

        <section className={styles.chartPane} aria-label="Chart">
          <Chart lines={lines} naming={naming} now={started && !counting ? pos : null} onTap={tapChord} />
        </section>

        {wide && (
          <section className={styles.players} aria-label="Who plays">
            {PLAYERS.map((pl) => (
              <Button key={pl.id} size="sm" pressed={!settings.muted[pl.id]} iconLeft={settings.muted[pl.id] ? 'VolumeX' : 'Volume2'} onClick={() => setMuted(pl.id, !settings.muted[pl.id])}>
                {pl.label}
              </Button>
            ))}
          </section>
        )}
      </div>

      <ActionBar stretchOnMobile={false} className={styles.bar} start={tempoStepper}>
        <IconButton icon="RotateCcw" label="Back to the top" variant="secondary" onClick={band.stop} disabled={band.status === 'idle'} />
        <PlayButton playing={playing} loading={band.status === 'loading'} onClick={() => void band.toggle()} size={isPhone && !sideways ? 'lg' : 'md'} label={playing ? 'Pause the band (Space)' : 'Play with the band (Space)'} data-play />
      </ActionBar>

      <Sheet open={optionsOpen} onClose={() => setOptionsOpen(false)} title="The band" description="Changes apply at once; a new style or key starts from the top." desktop="drawer">
        <Stack gap={6}>
          <Select
            label="Style"
            value={feel.backing}
            onChange={setStyle}
            options={[
              { group: 'Suits this progression', options: suggested.map((f) => ({ value: f.backing, label: `${BACKING_STYLES[f.backing].name} (${f.meter})` })) },
              { group: 'Other styles', options: others.map((f) => ({ value: f.backing, label: `${BACKING_STYLES[f.backing].name} (${f.meter})` })) },
            ]}
          />
          <Stepper label="Tempo" unit="BPM" min={clampTempo(feel.backing, 0)} max={clampTempo(feel.backing, 999)} step={2} largeStep={10} value={tempo} onChange={setTempo} hint={`This style sits best between ${style.tempo.min} and ${style.tempo.max}.`} />
          <div>
            <Text weight="semibold" size="sm">Key</Text>
            <KeyPicker progression={p} tonic={tonic} onChange={onTonic} naming={naming} />
          </div>
          <Switch label="Loop until I stop" description="Off: the band plays a number of times through, then an ending." checked={settings.loop} onChange={(v) => update({ loop: v })} />
          {!settings.loop && <Stepper label="Times through" min={1} max={16} value={settings.choruses} onChange={(v) => update({ choruses: v })} />}
          <div>
            <Text weight="semibold" size="sm">Count-in</Text>
            <SegmentedControl aria-label="Count-in" options={[{ value: '0', label: 'None' }, { value: '1', label: '1 bar' }, { value: '2', label: '2 bars' }]} value={String(settings.countIn)} onChange={(v) => update({ countIn: Number(v) })} />
          </div>
          <Stack gap={2}>
            <Text weight="semibold" size="sm">Who plays</Text>
            {PLAYERS.map((pl) => (
              <Switch key={pl.id} label={pl.label} description={pl.hint} checked={!settings.muted[pl.id]} onChange={(on) => setMuted(pl.id, !on)} />
            ))}
          </Stack>
        </Stack>
      </Sheet>
    </Page>
  );
}
