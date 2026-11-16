/**
 * Jam with the band over a progression: the chord now and the next one, big enough to read from a
 * metre away (a phone on a music stand), the chord's tones on the neck with a scale to solo with,
 * the chart with the bar that sounds lit, and the band's controls (style, tempo, loop or a number
 * of passes, count-in, who plays). The shown chord follows `band.onChord`, so it changes when the
 * change is heard. The screen stays awake while this view is open.
 *
 * An address can set the band up (`--t96--waltz--x2`, see model/address.ts) and hide the chord
 * names until the learner reveals them (`--hide-chart`), for working the chords out by ear. A
 * learner new to the guitar (see `needsPlainWords`) gets plain words: no roman numerals, and a
 * scale or mode named by its notes ("A minor with G♯").
 *
 * Keyboard: Space play / pause, ←/→ key, ↑/↓ tempo.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { href } from '@/app/router';
import { backingFor, formatSlot, type Progression, type ProgressionFeel, type ResolvedChord } from '@/content/progressions';
import { BACKING_STYLES, type BackingInstrument, type BackingStyleId } from '@/core/audio';
import {
  ActionBar, Button, ChipGroup, Icon, IconButton, Page, PlayButton, SegmentedControl, Select, Sheet, Stack, Stepper, Switch, Text,
  cx, useEventListener, useIsMobile, useMediaQuery, usePrefersReducedMotion, useWakeLock,
} from '@/ui';
import { usePrefs, useProgress } from '@/core/progress';
import { fretCount, learnerTuning } from '@/core/settings';
import { Fretboard, useMusicSettings } from '@/ui/music';
import { strumChord, stopPreview } from '../audio/preview';
import {
  FASTER_BY, chordAt, clampTempo, defaultTempo, distanceText, endingChord, feelsFor, finishedText, glyphCount, jamMarkers, jamNeck, keyMarkers, positionOf, scaleChoices, scaleFor, tempoHint, upcoming,
  type ChartPos,
} from '../model/jam';
import { jamOptionParams, type JamOptions } from '../model/address';
import { needsPlainWords, plainKeyName, plainRole, plainScaleName, plainTitle } from '../model/plain';
import { chartLines } from '../model/page';
import { stepTonic } from '../model/keys';
import { Chart, KeyPicker } from './Pieces';
import { chordName, dialogOpen, keyName, ownsKey, scaleName, useJamSettings } from './shared';
import { useBand, useBandLog } from './useBand';
import styles from './Jam.module.css';

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
  /** What the address set up (tempo, style, times through, chart hidden), applied once per arrival. */
  address?: JamOptions;
}

/** The jam view. */
export function JamView({ progression: p, tonic, onTonic, back, title, skillId, activityParams, remembered, remember, feels, address }: JamViewProps) {
  const { naming } = useMusicSettings();
  const isPhone = useIsMobile();
  const sideways = useMediaQuery(SIDEWAYS_QUERY);
  const wide = useMediaQuery('(min-width: 1080px)');
  const reducedMotion = usePrefersReducedMotion();
  useImmersive(true, 'focus');
  useWakeLock(true);
  const [settings, update] = useJamSettings();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const plain = useProgress(needsPlainWords);
  // Chord names hidden until the learner shows them (the address's `hide-chart`, or the band sheet).
  const [hidden, setHidden] = useState(!!address?.hideChart);

  // ── Feel, tempo, the band's input ───────────────────────────────────────────────────────
  const { suggested, others } = useMemo(() => {
    const f = feelsFor(p);
    return feels ? { suggested: feels, others: f.others.filter((o) => !feels.some((x) => x.backing === o.backing)) } : f;
  }, [p, feels]);
  const allFeels = useMemo(() => [...suggested, ...others], [suggested, others]);
  const feel = allFeels.find((f) => f.backing === remembered.style) ?? suggested[0];
  const tempo = clampTempo(feel.backing, remembered.tempo ?? defaultTempo(feel));
  const style = BACKING_STYLES[feel.backing];

  // The address sets the band up once per arrival, as if by hand (so it is remembered too).
  const addressKey = address ? jamOptionParams(address).join('--') : '';
  useEffect(() => {
    if (!address) return;
    const chosen = address.style ? allFeels.find((f) => f.backing === address.style) : undefined;
    if (chosen || address.tempo !== undefined) {
      const f = chosen ?? feel;
      remember({ ...(chosen ? { style: chosen.backing } : {}), tempo: clampTempo(f.backing, address.tempo ?? defaultTempo(f)) });
    }
    if (address.passes !== undefined) update({ loop: false, choruses: address.passes });
    setHidden(!!address.hideChart);
    // Only when the address changes: later changes are the learner's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressKey]);

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
  // Set when the band has played its passes and stopped by itself: the screen offers what next.
  const [finished, setFinished] = useState(false);
  const band = useBand(setup, { muted: settings.muted, onBeat, onEnd: () => setFinished(true) });
  const playing = band.status === 'playing' || band.status === 'count-in';
  useEffect(() => {
    if (band.status !== 'idle') setFinished(false);
    // A stopped band has no beat: clear the dots it left lit.
    if (band.status === 'idle') beatsRef.current?.querySelectorAll('[data-dot]').forEach((d) => d.removeAttribute('data-on'));
  }, [band.status]);

  // Log the time played when the band stops, the learner leaves or the page is hidden for good.
  useBandLog(band, { skillId, title: `Jam: ${title}`, params: activityParams, data: { tonic, tempo, style: feel.backing } });
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
  const bigText = counting ? String(band.countBeat) : hidden ? '?' : chordName(nowSymbol, naming);
  const chordNames = useMemo(() => resolved.bars.flat().map((c) => chordName(c.symbol, naming)), [resolved, naming]);
  const shownTitle = hidden ? 'Chords by ear' : plain ? plainTitle(title, chordNames) : title;
  useScreenTitle(shownTitle);
  const shownKey = plain ? plainKeyName(resolved.key, naming) : keyName(resolved.key, naming);
  const nameScale = (t: string, sc: string) => (plain ? plainScaleName(t, sc, naming) : scaleName(t, sc, naming));
  /** What the line under the big chord says: its numeral, or in plain words only "Home chord". */
  const roleOf = (c: ResolvedChord) => (plain ? plainRole(c.root, resolved.key) ?? '' : formatSlot(c.token));

  // ── The neck ────────────────────────────────────────────────────────────────────────────
  const choices = useMemo(() => scaleChoices(p, tonic), [p, tonic]);
  const choice = choices.find((c) => c.id === settings.scale) ?? choices[0];
  // The neck redraws about a hundred dots per change: let it follow a moment after the chord
  // name, so on a slow phone the name still changes when the chord is heard.
  const neckSymbol = useDeferredValue(nowSymbol);
  const soloScale = useMemo(() => scaleFor(choice, neckSymbol, resolved.key), [choice, neckSymbol, resolved.key]);
  // Wide screens draw the whole neck the learner asked for in Settings, small enough to stay in
  // view; a phone keeps 12 frets, the most that stay readable at arm's length while the band plays.
  const prefs = usePrefs();
  const { maxFret, size: neckSize } = jamNeck({ phone: isPhone, sideways, wide }, fretCount(prefs));
  // The neck is the learner's guitar: in Drop D the low E-string notes sit two frets higher.
  const tuning = useMemo(() => learnerTuning(prefs), [prefs]);
  const markers = useMemo(
    () => (hidden ? keyMarkers(resolved.key, { maxFret, tuning }) : jamMarkers(neckSymbol, soloScale, { maxFret, tuning })),
    [hidden, resolved.key, neckSymbol, soloScale, maxFret, tuning],
  );
  const lines = useMemo(() => chartLines(p, resolved), [p, resolved]);

  // Keep the bar that sounds in view inside the chart's own scroll box (never the page).
  const chartRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const pane = chartRef.current;
    const bar = pane?.querySelector<HTMLElement>(`[data-bar="${pos.bar}"]`);
    if (!pane || !bar || pane.scrollHeight <= pane.clientHeight + 2) return;
    const top = bar.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    const want = Math.max(0, top - pane.clientHeight / 3);
    if (Math.abs(pane.scrollTop - want) > 4) pane.scrollTo({ top: want, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [pos.bar, reducedMotion]);

  const scaleOptions = choices.map((c) => ({
    value: c.id,
    label: c.id === 'chord' ? 'Follow the chords' : c.id === 'off' ? 'Chord tones only' : nameScale(c.scale!.tonic, c.scale!.scale),
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
    if (!playing && !hidden) void strumChord(c.symbol);
  }, [playing, hidden]);

  const statusText = band.status === 'loading'
    ? 'Getting the band ready…'
    : counting
      ? 'Count-in: come in on the first chord'
      : band.status === 'paused'
        ? 'Paused'
        : playing
          ? (settings.loop ? 'Looping' : `Time ${(heard?.segment.chorus ?? 0) + 1} of ${settings.choruses}`)
          : finished
            ? finishedText(settings.choruses, tempo)
            : settings.countIn > 0
              ? 'Press play: the band counts you in'
              : 'Press play: the band starts on the first chord';
  const faster = clampTempo(feel.backing, tempo + FASTER_BY);
  const goFaster = () => {
    setTempo(faster);
    void band.play();
  };

  const tempoStepper = (
    <Stepper label="Tempo" hideLabel={isPhone || sideways} unit="BPM" min={clampTempo(feel.backing, 0)} max={clampTempo(feel.backing, 999)} step={2} largeStep={10} value={tempo} onChange={setTempo} format={(v) => `${v} beats per minute`} />
  );

  const transportButtons = (
    <>
      {sideways && <IconButton icon="SlidersHorizontal" label="The band: style, key, loop, count-in, players" variant="secondary" onClick={() => setOptionsOpen(true)} />}
      <IconButton icon="RotateCcw" label="Back to the top" variant="secondary" onClick={band.stop} disabled={band.status === 'idle'} />
      <PlayButton playing={playing} loading={band.status === 'loading'} onClick={() => void band.toggle()} size={isPhone && !sideways ? 'lg' : wide ? 'lg' : 'md'} label={playing ? 'Pause the band (Space)' : 'Play with the band (Space)'} data-play />
    </>
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
        data-hidden={hidden ? 'true' : 'false'}
        data-plain={plain ? 'true' : 'false'}
      >
        <header className={styles.top}>
          <a className={styles.back} href={href(back.to, ...back.params)}>
            <Icon name="ArrowLeft" size="sm" />
            <span>{back.label}</span>
          </a>
          <div className={styles.topTitle}>
            <Text as="p" weight="semibold" truncate className={styles.title} data-jam-title>{shownTitle}</Text>
            <Text size="sm" tone="muted" truncate data-jam-key>
              {shownKey} · {style.name} · {tempo} BPM
            </Text>
          </div>
          <Button iconLeft="SlidersHorizontal" onClick={() => setOptionsOpen(true)} className={styles.optionsButton}>
            Band
          </Button>
        </header>

        <section className={styles.now} aria-label="Chords">
          <div className={styles.nowMain}>
            <span className={styles.label}>{counting ? 'Count-in' : started ? (endingNow ? 'Last chord' : 'Now') : 'First chord'}</span>
            <span className={cx(styles.big, counting && styles.count)} data-now-chord data-len={glyphCount(bigText)}>
              {bigText}
            </span>
            <span className={styles.nowNumeral} data-now-role>
              {counting ? (hidden ? 'Then the first chord' : `Then ${chordName(current.symbol, naming)}`) : endingNow ? 'The ending' : hidden ? `Bar ${pos.bar + 1} of ${resolved.bars.length}` : roleOf(current)}
            </span>
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
                <span className={styles.nextChord} data-next-chord data-len={hidden ? 1 : glyphCount(chordName(next.chord.symbol, naming))}>{hidden ? '?' : chordName(next.chord.symbol, naming)}</span>
                <span className={styles.nextWhen} data-next-when>{[hidden ? '' : roleOf(next.chord), distanceText(next.beats, resolved.beatsPerBar)].filter(Boolean).join(' · ')}</span>
              </>
            ) : (
              <>
                <span className={styles.nextChord}>{endingNow ? '—' : 'End'}</span>
                <span className={styles.nextWhen}>{endingNow ? 'Let it ring' : 'Last time through'}</span>
              </>
            )}
          </div>
          <div className={styles.status}>
            <Text size="sm" tone="muted" aria-live="polite">{statusText}</Text>
            {hidden && (
              <Button size="sm" iconLeft="Eye" onClick={() => setHidden(false)} data-reveal>
                Show the chords
              </Button>
            )}
            {finished && band.status === 'idle' && faster > tempo && (
              <Button size="sm" iconLeft="FastForward" onClick={goFaster} data-faster>
                Play it at {faster} BPM
              </Button>
            )}
          </div>
        </section>

        <section className={styles.neck} aria-label="On the neck">
          <div className={styles.neckBoard}>
            <Fretboard
              tuning={tuning}
              frets={[0, maxFret]}
              markers={markers}
              size={neckSize}
              aria-label={hidden ? `The notes of ${shownKey} on the neck` : `${chordName(neckSymbol, naming)} on the neck${soloScale ? `, with ${nameScale(soloScale.tonic, soloScale.scale)}` : ''}`}
            />
          </div>
          <div className={styles.scaleRow}>
            {!hidden && <ChipGroup aria-label="Scale to solo with" options={scaleOptions} value={choice.id} onChange={(v) => update({ scale: v })} scroll={sideways ? 'always' : 'auto'} />}
            <Text size="sm" tone="muted" className={styles.scaleHint} data-scale-hint>
              {hidden
                ? `The notes of ${shownKey}, the home note filled. Listen to the bass: it mostly plays each chord’s root. Find that note here, then the chord, and write it down bar by bar.`
                : soloScale
                  ? `Over ${chordName(neckSymbol, naming)}: ${plain && choice.id === 'chord' ? `the notes that fit ${chordName(neckSymbol, naming)} best` : nameScale(soloScale.tonic, soloScale.scale)}. Filled dots are the chord’s own notes (R = root), rings the rest of the scale.`
                  : `The dots are the notes of ${chordName(neckSymbol, naming)}: R is the root, then its third, fifth and so on.`}
            </Text>
          </div>
          {wide && (
            <div className={styles.players} role="group" aria-label="Who plays">
              {PLAYERS.map((pl) => (
                <Button key={pl.id} size="sm" pressed={!settings.muted[pl.id]} iconLeft={settings.muted[pl.id] ? 'VolumeX' : 'Volume2'} onClick={() => setMuted(pl.id, !settings.muted[pl.id])}>
                  {pl.label}
                </Button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.chartPane} aria-label="Chart" ref={chartRef}>
          <Chart lines={lines} naming={naming} now={started && !counting && !endingNow ? pos : null} onTap={hidden ? undefined : tapChord} numerals={!plain} masked={hidden} />
        </section>

        {wide && (
          <section className={styles.transport} aria-label="Transport">
            {tempoStepper}
            <span className={styles.transportButtons}>{transportButtons}</span>
          </section>
        )}

      </div>

      {!wide && (
        <ActionBar stretchOnMobile={false} className={styles.bar} start={tempoStepper}>
          {transportButtons}
        </ActionBar>
      )}

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
          <Stepper label="Tempo" unit="BPM" min={clampTempo(feel.backing, 0)} max={clampTempo(feel.backing, 999)} step={2} largeStep={10} value={tempo} onChange={setTempo} hint={tempoHint(feel, tempo)} />
          <div>
            <Text weight="semibold" size="sm">Key</Text>
            <KeyPicker progression={p} tonic={tonic} onChange={onTonic} naming={naming} />
          </div>
          <Switch label="Loop until I stop" description="Off: the band plays a number of times through, then an ending." checked={settings.loop} onChange={(v) => update({ loop: v })} />
          <Switch label="Hide the chord names" description="Work the chords out by ear, then show them to check." checked={hidden} onChange={setHidden} data-hide-chords />
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
