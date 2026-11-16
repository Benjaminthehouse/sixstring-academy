/**
 * The player screen for one song. Three layouts from one set of parts:
 *
 *  bar   phones held upright and tablets: section chips on top, the score, the fretboard, and the
 *        controls in the thumb zone at the bottom (mode picker, loop, tempo, Play, More).
 *  rail  a phone held sideways (the main practice layout): score above, fretboard below, the
 *        controls in a column on the right edge; the shell's top bar steps aside while playing.
 *  wide  desktop: the score and fretboard with a side panel holding every control.
 *
 * The engine (`engine/engine.ts`) does the work; this file arranges it, maps the keyboard, keeps
 * the screen awake while practising and asks for full-screen focus.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useImmersive } from '@/app/shell';
import type { SongListing } from '@/core/library';
import { setPrefs, touchRecent, usePrefs, useSkill } from '@/core/progress';
import { readJSON, writeJSON, type MediaFailure } from '@/core/platform';
import { fretCount, showNotation } from '@/core/settings';
import type { Song } from '@/core/song';
import { Button, ChipGroup, Icon, IconButton, MediaBlocked, Page, PlayButton, Sheet, Skeleton, StarRating, Text, Tooltip, cx, toast, useMediaQuery, useWakeLock } from '@/ui';
import { TuningLabel, type TabRange, type TabSeek } from '@/ui/music';
import { PlayerEngine, readSavedSession, type EngineState } from './engine/engine';
import { MicInput } from './engine/mic';
import { commandFor } from './model/keys';
import { loopLabel, sectionAtBar, sectionChips } from './model/loop';
import { requestKey, resolveRequest, parsePlayerParams } from './model/params';
import { readSongData, type Suggestion } from './model/results';
import { openingState, sanitizeSession, type OpeningState } from './model/session';
import { MODE_HINTS, MODE_NAMES, needsMic, type PracticeMode } from './model/types';
import { CountIn, Judgement, MicLevel, WaitPrompt } from './components/Hud';
import { LoopButton, LoopOptions, ModePicker, MoreOptions, TempoCompact, TempoFull } from './components/Controls';
import { Neck } from './components/Neck';
import { Results } from './components/Results';
import { Score } from './components/Score';
import styles from './Player.module.css';

const MIC_NOTICE_KEY = 'player.micNotice';

/** Props of the screen. */
export interface PlayerScreenProps {
  song: Song;
  songId: string;
  listing: SongListing | null;
  params: string[];
}

/** Loads the opening state once, builds the engine (in an effect, so React's double mount in development gets a fresh one). */
export function PlayerScreen({ song, songId, listing, params }: PlayerScreenProps) {
  const prefs = usePrefs();
  const key = requestKey(params);
  const [opening] = useState<OpeningState & { problems: string[]; startBar: number | null }>(() => {
    const req = resolveRequest(parsePlayerParams(params), song);
    const shape = { barCount: song.bars.length, totalTicks: Number.MAX_SAFE_INTEGER, trackIds: song.tracks.map((t) => t.id) };
    const saved = sanitizeSession(readSavedSession(songId), shape);
    const o = openingState(saved, req, key, { now: Date.now(), layer: showNotation(prefs) ? 'both' : 'tab', micBlocked: MicInput.blockedByHost() });
    return { ...o, problems: req.problems, startBar: req.startBar };
  });
  const [engine, setEngine] = useState<PlayerEngine | null>(null);
  useEffect(() => {
    const e = new PlayerEngine({
      song, songId, title: song.meta.title || listing?.title || 'Song', session: opening.session, tone: prefs.sound.guitarTone, clickSound: prefs.sound.clickSound,
      ...(opening.startBar !== null ? { startBar: opening.startBar } : {}),
    });
    e.setOpened(key);
    setEngine(e);
    return () => e.dispose();
    // The engine lives as long as this song is open; settings changes are passed to it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song]);

  useEffect(() => {
    for (const p of opening.problems) toast.info(p);
  }, [opening.problems]);
  // Opening a song puts it in "Continue where you left off" (a finished run updates it again).
  useEffect(() => {
    touchRecent({ route: 'play', params: [songId], title: song.meta.title || listing?.title || 'Song', kind: 'song', skillId: `song:${songId}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  if (!engine) {
    return (
      <Page title={song.meta.title} hideHeader width="full" className={styles.page}>
        <div className={styles.loading} aria-busy="true">
          <Skeleton variant="block" height="14rem" />
          <Skeleton variant="block" height="7rem" />
        </div>
      </Page>
    );
  }
  return <PlayerView engine={engine} song={song} resumed={opening.resumed} />;
}

type Layout = 'bar' | 'rail' | 'wide';

function PlayerView({ engine, song, resumed }: { engine: PlayerEngine; song: Song; resumed: boolean }) {
  const s = useSyncExternalStore(engine.subscribe, engine.getState);
  const prefs = usePrefs();
  const skill = useSkill(`song:${engine.songId}`);
  const best = useMemo(() => {
    const data = readSongData(skill.record?.data);
    const b = data.best.flow ?? data.best.tap ?? data.best.wait;
    return b ? `Best ${Math.round(b.accuracy)} % at ${b.tempo} % speed` : null;
  }, [skill.record?.data]);
  const rail = useMediaQuery('(orientation: landscape) and (max-height: 540px)');
  const wideQuery = useMediaQuery('(min-width: 1080px)');
  const layout: Layout = rail ? 'rail' : wideQuery ? 'wide' : 'bar';
  const phone = useMediaQuery('(max-width: 719px)');
  const running = s.phase === 'playing' || s.phase === 'countin';
  const active = running || s.phase === 'paused' || s.phase === 'waiting';
  useImmersive(true, rail && (running || s.phase === 'waiting') ? 'bare' : 'focus');
  useWakeLock(active);

  // Follow Settings: the guitar and click sounds.
  useEffect(() => engine.setTone(prefs.sound.guitarTone), [engine, prefs.sound.guitarTone]);
  useEffect(() => engine.setClick(prefs.sound.clickSound), [engine, prefs.sound.clickSound]);

  const sections = useMemo(() => sectionChips(song), [song]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [loopOpen, setLoopOpen] = useState(false);
  const [blocked, setBlocked] = useState<MediaFailure | null>(null);
  const [hostNotice, setHostNotice] = useState(() => MicInput.blockedByHost() && readJSON<boolean>(MIC_NOTICE_KEY, false) !== true);
  const [showResumed, setShowResumed] = useState(resumed);
  useEffect(() => {
    if (!showResumed) return;
    const id = setTimeout(() => setShowResumed(false), 8000);
    return () => clearTimeout(id);
  }, [showResumed]);
  useEffect(() => {
    if (running) setShowResumed(false);
  }, [running]);

  const micAvailable = !MicInput.blockedByHost() && s.mic.failure !== 'blocked-by-host' && s.mic.failure !== 'unsupported' && s.mic.failure !== 'insecure-context';

  // ── loop picking by taps or a drag on the score ──
  const [picking, setPicking] = useState(false);
  const pickCount = useRef(0);
  const pickRange = useRef<TabRange | null>(null);
  const startPicking = useCallback(() => {
    pickCount.current = 0;
    pickRange.current = null;
    setLoopOpen(false);
    setMoreOpen(false);
    setPicking(true);
  }, []);
  const onLoopChange = useCallback(
    (r: TabRange | null) => {
      if (picking) {
        pickCount.current++;
        pickRange.current = r;
      }
      engine.setLoop(r);
    },
    [engine, picking],
  );
  // A pick ends after the second tap, or when a drag across bars is let go.
  useEffect(() => {
    if (!picking) return;
    const up = () => {
      requestAnimationFrame(() => {
        const r = pickRange.current;
        if (!r) return;
        if (pickCount.current >= 2 || r.from !== r.to) {
          setPicking(false);
          toast.ok(`${loopLabel(r)} will loop`, { description: 'Drag the loop’s ends to change it.', id: 'player-loop' });
        }
      });
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [picking]);

  const onSeek = useCallback(
    (at: TabSeek) => {
      if (picking) return;
      // A tap starts at the bar (wait mode: at the note tapped).
      const base = engine.timeline.tickOfBar(at.bar);
      engine.seekTick(engine.waiting ? base + at.tick : base);
    },
    [engine, picking],
  );

  // ── modes and the microphone ──
  const chooseMode = useCallback(
    async (m: PracticeMode) => {
      if (needsMic(m) && !micAvailable) {
        if (hostNotice || MicInput.blockedByHost()) setHostNotice(true);
        else setBlocked(s.mic.failure ?? 'unknown');
        return;
      }
      const r = await engine.setMode(m);
      if (!r.ok) {
        if (readJSON<boolean>(MIC_NOTICE_KEY, false) === true && r.reason !== 'denied') {
          toast.warn('The microphone is not available', { description: 'Tap along instead: tap in time with the notes.', id: 'player-mic' });
          void engine.setMode('tap');
        } else setBlocked(r.reason);
      }
    },
    [engine, micAvailable, hostNotice, s.mic.failure],
  );
  const dismissMicNotice = useCallback(
    (next: PracticeMode) => {
      writeJSON(MIC_NOTICE_KEY, true);
      setHostNotice(false);
      setBlocked(null);
      void engine.setMode(next);
    },
    [engine],
  );

  const onSuggestion = useCallback(
    (sg: Suggestion) => {
      engine.closeResults();
      engine.setLoop(sg.loop);
      engine.setTempo(sg.tempo);
      if (sg.mode !== s.mode) void chooseMode(sg.mode);
      else if (sg.loop) engine.seekBar(sg.loop.from);
    },
    [engine, s.mode, chooseMode],
  );
  const again = useCallback(() => {
    engine.closeResults();
    engine.stop();
    void engine.play();
  }, [engine]);

  // ── keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const t = e.target as HTMLElement | null;
      const cmd = commandFor({
        key: e.key, code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, shiftKey: e.shiftKey, repeat: e.repeat,
        target: t ? { tagName: t.tagName, isContentEditable: t.isContentEditable, role: t.getAttribute('role'), type: (t as HTMLInputElement).type, focusVisible: safeMatches(t, ':focus-visible') } : null,
      });
      if (!cmd) return;
      e.preventDefault();
      const st = engine.getState();
      switch (cmd) {
        case 'toggle':
          if (st.mode === 'tap' && (st.phase === 'playing' || st.phase === 'countin')) engine.tap(e.timeStamp);
          else engine.toggle();
          break;
        case 'prev-bar':
          engine.stepBar(-1);
          break;
        case 'next-bar':
          engine.stepBar(1);
          break;
        case 'loop':
          engine.loopKey();
          break;
        case 'slower':
          engine.setTempo(st.tempo - 5);
          break;
        case 'faster':
          engine.setTempo(st.tempo + 5);
          break;
        case 'metronome':
          engine.setMetronome(!st.metronome);
          break;
        case 'wait':
          void chooseMode('wait');
          break;
        case 'flow':
          void chooseMode('flow');
          break;
        case 'stop':
          if (picking) setPicking(false);
          else engine.stop();
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, chooseMode, picking]);

  const bpm = engine.timeline.tempo.bpmAt(s.tick) * (s.tempo / 100);
  const trackInfo = song.tracks.find((t) => t.id === s.track);
  const strumPart = trackInfo?.role === 'rhythm';
  const currentSection = sectionAtBar(sections, s.bar);
  const isWait = s.mode === 'wait';
  const playLabel = isWait ? (engine.waiting ? 'Stop wait mode' : 'Start: the song waits for each note') : running ? 'Pause (Space)' : s.phase === 'paused' ? 'Carry on (Space)' : 'Play (Space)';

  const play = (
    <PlayButton
      size={layout === 'rail' ? 'md' : 'lg'}
      playing={isWait ? engine.waiting : running}
      loading={s.phase === 'loading'}
      label={playLabel}
      icon={isWait ? (engine.waiting ? 'Square' : 'Hourglass') : undefined}
      onClick={() => engine.toggle()}
      data-player-play=""
      data-phase={s.phase}
    />
  );
  const tapPad = s.mode === 'tap' && running ? (
    <Button
      size="lg"
      variant="primary"
      className={styles.tapPad}
      onPointerDown={(e) => {
        e.preventDefault();
        engine.tap(e.timeStamp);
      }}
      data-player-tap=""
    >
      Tap
    </Button>
  ) : null;

  const tempo = <TempoCompact tempo={s.tempo} bpm={bpm} onChange={(p) => engine.setTempo(p)} vertical={layout === 'rail'} />;
  const loopBtn = <LoopButton loop={s.loop} picking={picking} compact={layout !== 'wide'} onClick={() => (picking ? setPicking(false) : s.loop ? setLoopOpen(true) : startPicking())} />;
  const micChip = needsMic(s.mode) ? (
    s.mic.status === 'on' ? (
      <MicLevel engine={engine} label="Listening" />
    ) : (
      <Button size="sm" variant="ghost" iconLeft="Mic" onClick={() => void engine.startMic()} loading={s.mic.status === 'starting'} data-player-mic="">
        Turn on the microphone
      </Button>
    )
  ) : null;

  const loopOptions = (
    <LoopOptions state={s} sections={sections} judged={s.mode === 'flow' || s.mode === 'tap'} onTrainer={(t) => engine.setTrainer(t)} onLoop={(r) => engine.setLoop(r)} onPick={startPicking} />
  );
  const moreOptions = (
    <MoreOptions
      state={s}
      song={song}
      onCountIn={(on) => engine.setCountIn(on)}
      onMetronome={(on) => engine.setMetronome(on)}
      onTrack={(id) => engine.setTrack(id)}
      onMute={(id, on) => engine.setMuted(id, on)}
      onSolo={(id, on) => engine.setSolo(id, on)}
      onPartAudible={(on) => engine.setPartAudible(on)}
      onLayer={(l) => engine.setLayer(l)}
      onNeck={(on) => engine.setNeck(on)}
      onTone={(t) => setPrefs({ sound: { guitarTone: t } })}
      showKeys={layout === 'wide'}
    />
  );

  const banner = picking ? (
    <div className={styles.banner} data-tone="info" role="status">
      <Icon name="MousePointerClick" size="sm" />
      <span>Tap the first bar of the loop, then the last{phone ? '' : ' (or drag across them)'}.</span>
      <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>
        Cancel
      </Button>
    </div>
  ) : s.pick.stage === 'end' ? (
    <div className={styles.banner} data-tone="info" role="status">
      <Icon name="Repeat" size="sm" />
      <span>The loop starts at bar {s.pick.from + 1}. Press L again at its last bar.</span>
    </div>
  ) : showResumed && s.tick > 0 && !active ? (
    <div className={styles.banner} role="status" data-player-resumed="">
      <Icon name="RotateCcw" size="sm" />
      <span>Picked up at bar {s.bar + 1}.</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          engine.seekTick(0);
          setShowResumed(false);
        }}
      >
        Start from the top
      </Button>
    </div>
  ) : null;

  const runBadge = active && !isWait ? (
    <div className={styles.runBadge}>
      <Tooltip content="Stop and see how it went (Esc)">
        <Button size="sm" iconLeft="Square" onClick={() => engine.stop()} data-player-stop="">
          Stop
        </Button>
      </Tooltip>
      {s.loop && s.passes > 0 && <span className={styles.pass}>Loop {s.passes}</span>}
      {s.trainerNote && <span className={styles.trainerNote}>{s.trainerNote}</span>}
    </div>
  ) : null;

  const score = (
    <Score
      engine={engine}
      song={song}
      track={s.track}
      layer={s.layer}
      line={layout === 'rail'}
      running={running || engine.waiting}
      loop={s.loop}
      picking={picking}
      onLoopChange={onLoopChange}
      onSeek={onSeek}
      noteStates={s.noteStates}
      heat={s.results ? s.results.summary.heat : null}
      size={layout === 'wide' ? 'lg' : layout === 'rail' ? 'sm' : 'md'}
      diagrams={strumPart}
      {...(s.mode === 'tap' && running ? { onTapDown: (t: number) => engine.tap(t) } : {})}
    >
      <CountIn engine={engine} />
      {(s.mode === 'flow' || s.mode === 'tap') && <Judgement engine={engine} />}
      {runBadge}
    </Score>
  );
  const bannerRow = banner ? <div className={styles.bannerWrap}>{banner}</div> : null;
  const waitPrompt = s.wait ? <WaitPrompt wait={s.wait} onHint={() => engine.hint()} onSkip={() => engine.skip()} compact={layout === 'rail'} /> : null;

  const neck = s.neck ? <Neck engine={engine} track={s.track} maxFret={fretCount(prefs)} minSpan={phone || layout === 'rail' ? 5 : 7} size={layout === 'wide' ? 'md' : 'sm'} className={styles.neck} /> : null;

  const info = (
    <div className={styles.info}>
      <p className={styles.title} aria-hidden="true">
        {song.meta.title}
      </p>
      <p className={styles.meta}>
        {[song.meta.composer || song.meta.artist, song.key ? keyName(song.key) : null, `${Math.round(engine.timeline.tempo.points[0]?.bpm ?? 0)} bpm`, timeSig(song)].filter(Boolean).join(' · ')}
        {(song.capo > 0 || !isStandard(song.tuning)) && (
          <>
            {' · '}
            <TuningLabel tuning={song.tuning} capo={song.capo} />
          </>
        )}
      </p>
      {(skill.stars > 0 || best) && (
        <p className={styles.best}>
          {skill.stars > 0 && <StarRating value={skill.stars} max={3} size={16} label={`${skill.stars} of 3 stars`} />}
          {best && <span>{best}</span>}
        </p>
      )}
    </div>
  );

  const chips = sections.length > 1 ? (
    <ChipGroup
      aria-label="Jump to a section"
      scroll="always"
      options={sections.map((c) => ({ value: c.slug, label: c.name }))}
      value={currentSection?.slug ?? null}
      onChange={(v) => {
        const c = sections.find((x) => x.slug === v);
        if (c) engine.seekBar(c.range.from);
      }}
      className={styles.chips}
    />
  ) : null;

  const hostBlocked = (
    <MediaBlocked reason="blocked-by-host" device="microphone" framed={layout === 'wide'} align="start" level={2} onContinueWithout={() => dismissMicNotice('tap')} continueLabel="Tap along instead" className={styles.hostNotice}>
      Wait and Flow listen to your guitar, so they need the app opened from its own address. Listen and Tap along work here.
    </MediaBlocked>
  );
  // Shown once: in the side panel on a desktop, as a sheet on phones (so the score stays in view).
  const hostPanel = hostNotice && layout === 'wide' ? hostBlocked : null;

  return (
    <Page title={song.meta.title} hideHeader width="full" className={styles.page}>
      <div className={cx(styles.screen, styles[layout])} data-layout={layout} data-chips={(layout === 'wide' ? chips : chips || micChip) ? 'yes' : 'no'} data-player="" data-mode={s.mode} data-phase={s.phase}>
        {layout === 'wide' && (
          <>
            <header className={styles.head}>
              {info}
              <div className={styles.headModes}>
                <ModePicker mode={s.mode} micAvailable={micAvailable} onChange={(m) => void chooseMode(m)} fullWidth={false} />
                <p className={styles.modeHint}>
                  {micChip}
                  <span>{MODE_HINTS[s.mode]}</span>
                </p>
              </div>
            </header>
            {chips && <div className={styles.chipRow}>{chips}</div>}
            <div className={styles.main}>
              {bannerRow}
              {score}
              {waitPrompt}
              {neck}
            </div>
            <aside className={styles.side} aria-label="Player controls">
              {hostPanel}
              <div className={styles.transport}>
                {play}
                {tapPad}
                <div className={styles.position}>
                  <span className={styles.positionBar}>
                    Bar {s.bar + 1} <span className={styles.positionOf}>of {song.bars.length}</span>
                  </span>
                  {currentSection && sections.length > 1 && <span className={styles.positionOf}>{currentSection.name}</span>}
                </div>
              </div>
              <TempoFull tempo={s.tempo} bpm={bpm} onChange={(p) => engine.setTempo(p)} />
              <div className={styles.sideBlock}>{loopOptions}</div>
              <div className={styles.sideBlock}>{moreOptions}</div>
            </aside>
          </>
        )}

        {layout === 'bar' && (
          <>
            {chips || micChip ? (
              <div className={styles.chipRow}>
                {chips}
                {micChip}
              </div>
            ) : null}
            <div className={styles.main}>
              {bannerRow}
              {score}
              {waitPrompt}
              {neck}
            </div>
            <div className={styles.dock}>
              <ModePicker mode={s.mode} micAvailable={micAvailable} onChange={(m) => void chooseMode(m)} size="sm" icons={!phone} />
              <div className={styles.dockRow}>
                {loopBtn}
                {/* While tapping along, the Tap pad takes the tempo's place (it can be changed when paused). */}
                {tapPad ?? tempo}
                {play}
                <IconButton icon="SlidersHorizontal" label="More: count-in, click, parts, sound" onClick={() => setMoreOpen(true)} data-player-more="" />
              </div>
            </div>
          </>
        )}

        {layout === 'rail' && (
          <>
            <div className={styles.main}>
              {bannerRow}
              {score}
              {waitPrompt}
              {neck}
            </div>
            <div className={styles.railControls}>
              <IconButton icon="SlidersHorizontal" label="Mode and options" onClick={() => setMoreOpen(true)} data-player-more="" />
              {needsMic(s.mode) && s.mic.status === 'on' && <MicLevel engine={engine} label="Listening" compact />}
              {loopBtn}
              {tempo}
              {tapPad}
              {play}
            </div>
          </>
        )}
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={layout === 'rail' ? 'Mode and options' : 'Options'} description={best ?? undefined} desktop="drawer">
        <div className={styles.sheetBody}>
          {layout === 'rail' && (
            <>
              <ModePicker mode={s.mode} micAvailable={micAvailable} onChange={(m) => void chooseMode(m)} size="sm" icons={false} />
              <Text variant="caption" tone="muted">
                {MODE_HINTS[s.mode]}
              </Text>
              {micChip}
              {sections.length > 1 && (
                <div className={styles.sheetChips}>
                  <Text variant="label">Jump to</Text>
                  {chips}
                </div>
              )}
            </>
          )}
          {moreOptions}
        </div>
      </Sheet>

      <Sheet open={loopOpen} onClose={() => setLoopOpen(false)} title="Loop" desktop="drawer">
        {loopOptions}
      </Sheet>

      <Sheet open={hostNotice && layout !== 'wide'} onClose={() => dismissMicNotice(s.mode === 'listen' ? 'listen' : 'tap')} title="Microphone">
        {hostBlocked}
      </Sheet>

      <Sheet open={!!blocked} onClose={() => setBlocked(null)} title="Microphone">
        {blocked && (
          <MediaBlocked reason={blocked} device="microphone" align="start" onRetry={() => { setBlocked(null); void chooseMode(s.mode === 'listen' || s.mode === 'tap' ? 'wait' : s.mode); }} onContinueWithout={() => dismissMicNotice('tap')} continueLabel="Tap along instead">
            Without a microphone you can still listen, and tap along in time for a timing score.
          </MediaBlocked>
        )}
      </Sheet>

      <Results results={micAvailable ? s.results : withoutMic(s.results)} barCount={song.bars.length} onClose={() => engine.closeResults()} onAgain={again} onSuggestion={onSuggestion} />
      <span className="sr-only" aria-live="polite">
        {modeAnnouncement(s)}
      </span>
    </Page>
  );
}

/** Where no microphone can be had, a suggestion of wait or flow mode becomes tap-along. */
function withoutMic(r: EngineState['results']): EngineState['results'] {
  const sg = r?.summary.suggestion;
  if (!r || !sg || !needsMic(sg.mode)) return r;
  const text = sg.loop ? sg.text : 'Now tap along in time with the notes';
  return { ...r, summary: { ...r.summary, suggestion: { ...sg, mode: 'tap', text } } };
}

function modeAnnouncement(s: EngineState): string {
  if (s.phase === 'countin') return 'Count-in';
  if (s.phase === 'waiting') return 'Waiting for you to play';
  return `${MODE_NAMES[s.mode]} mode`;
}

function safeMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

function keyName(key: string): string {
  const k = key.trim();
  if (/minor|major/i.test(k)) return k.replace(/#/g, '♯').replace(/b(?=\s|$)/, '♭');
  if (/m$/.test(k)) return `${k.slice(0, -1).replace('#', '♯').replace(/b$/, '♭')} minor`;
  return `${k.replace('#', '♯').replace(/b$/, '♭')} major`;
}

function timeSig(song: Song): string | null {
  const t = song.bars[0]?.time;
  return t ? `${t.numerator}/${t.denominator}` : null;
}

function isStandard(tuning: readonly number[]): boolean {
  return tuning.join(',') === '40,45,50,55,59,64';
}
