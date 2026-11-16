import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { Banner, Button, Heading, Icon, MediaBlocked, Page, SegmentedControl, Switch, Text, cx, useEventListener, useMediaQuery, usePrefersReducedMotion, useWakeLock } from '@/ui';
import { recordActivity, type ActivityResult } from '@/core/progress';
import { fretCount, learnerTuning } from '@/core/settings';
import { audioState, unlockAudio } from '@/core/audio';
import { readJSON, type MediaFailure } from '@/core/platform';
import { getScale } from '@/core/theory';
import { useMusicSettings } from '@/ui/music';
import { patternOf, scaleTitle, shapesFor, shapeTitle, type Focus } from '../core/focus';
import { levelsOf, scopeOf, type GameDef } from '../core/games';
import { applyRound, isUnlocked, levelRecord, type RoundChange } from '../core/records';
import { freshSeed } from '../core/rng';
import { gameParams, roundTitle, scopeLabel, skillIdFor } from '../core/skill';
import { getRecords, updateRecords, useRecords } from './store';
import { markMicBlockedShown, micBlockedShown, useArcadeMic } from './useArcadeMic';
import { useFx } from './fx';
import { countSound, endSound } from './sound';
import { Summary } from './Summary';
import { NoteHunt } from './games/NoteHunt';
import { ShapeBuilder } from './games/ShapeBuilder';
import { RunTheScale } from './games/RunTheScale';
import { DegreeDarts } from './games/DegreeDarts';
import { ModeMatch } from './games/ModeMatch';
import { LickEcho } from './games/LickEcho';
import { Sprint } from './games/Sprint';
import type { GameProps, RoundContext, RoundResult } from './types';
import styles from './Arcade.module.css';

const COMPONENTS: Record<GameDef['id'], (p: GameProps) => JSX.Element> = {
  'note-hunt': NoteHunt,
  'shape-builder': ShapeBuilder,
  'run-the-scale': RunTheScale,
  'degree-darts': DegreeDarts,
  'mode-match': ModeMatch,
  'lick-echo': LickEcho,
  'fretboard-sprint': Sprint,
};

/** How a round ended, for the screen that hosts it. */
export interface RoundOutcome {
  result: RoundResult;
  activity: ActivityResult | null;
  change: RoundChange;
}

/** Props of {@link RoundScreen}. */
export interface RoundScreenProps {
  game: GameDef;
  focus: Focus;
  level: number;
  /** Daily challenge: fixed seed and a short round; the host shows the summary. */
  seed?: number;
  size?: number;
  /** "Challenge 2 of 3" above the ready card. */
  eyebrow?: string;
  /** Called instead of showing this screen's own summary (the daily challenge). */
  onDone?: (o: RoundOutcome) => void;
  /** Where "End round" goes. */
  onExit: () => void;
}

type Phase = 'ready' | 'count' | 'play' | 'summary';

/** Storage key a browser check sets to make rounds reproducible (never set by the app itself). */
export const TEST_SEED_KEY = 'arcade.test-seed';

function testSeed(): number | null {
  const v = readJSON<unknown>(TEST_SEED_KEY, null);
  return typeof v === 'number' && Number.isFinite(v) ? v >>> 0 : null;
}

/**
 * A level of a game: a ready card over the board (how to play, tap or guitar, Start), a short
 * count, the round itself, then the summary. Reports the round to `core/progress` and the arcade's
 * own records.
 */
export function RoundScreen({ game, focus, level, seed: fixedSeed, size, eyebrow, onDone, onExit }: RoundScreenProps) {
  const records = useRecords();
  const { naming } = useMusicSettings();
  const tuning = useMemo(() => learnerTuning(), []);
  const frets = useMemo(() => fretCount(), []);
  const levels = useMemo(() => levelsOf(game.id, focus, tuning, frets), [game.id, focus, tuning, frets]);
  const info = levels.find((l) => l.n === level) ?? levels[0];
  // Shape Builder's levels are the shapes themselves; every other game uses the focus shape.
  const shapeFocus = useMemo<Focus>(() => {
    if (game.id !== 'shape-builder') return focus;
    const shapes = shapesFor(focus.tonic, focus.scale, tuning, frets);
    return { ...focus, shape: shapes[level - 1]?.id ?? focus.shape };
  }, [game.id, focus, level, tuning, frets]);
  const pattern = useMemo(() => patternOf(shapeFocus, tuning, frets), [shapeFocus, tuning, frets]);
  const scale = useMemo(() => getScale(focus.scale)!, [focus.scale]);
  const scaleName = scaleTitle(focus, naming);
  const scope = scopeOf(game.id, focus);
  const locked = !isUnlocked(records, game.id, scope, info.n);
  const best = levelRecord(records, game.id, scope, info.n);

  const [phase, setPhase] = useState<Phase>('ready');
  const [seed, setSeed] = useState(() => fixedSeed ?? testSeed() ?? freshSeed());
  const [attempt, setAttempt] = useState(0);
  const [input, setInput] = useState<'tap' | 'mic'>(() => (game.mic ? records.input : 'tap'));
  const [blocked, setBlocked] = useState<MediaFailure | null>(null);
  // Why a round meant for the guitar is played by tapping: no microphone here, or it stopped mid-round.
  const [fallback, setFallback] = useState<'none' | 'lost' | null>(null);
  const [count, setCount] = useState(3);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [starting, setStarting] = useState(false);
  // The tab went to the background mid-round: the round stands still and counts in again on return.
  const [away, setAway] = useState(false);
  const mic = useArcadeMic();
  const fx = useFx();
  const reduced = usePrefersReducedMotion();
  const shortLandscape = useMediaQuery('(orientation: landscape) and (max-height: 540px)');
  const inRound = phase === 'count' || phase === 'play';
  // The round hides the navigation (all of it on a phone held sideways); the summary brings it back.
  useImmersive(true, phase === 'summary' ? 'none' : shortLandscape && inRound ? 'bare' : 'focus');
  useWakeLock(inRound && !away);
  const title = `${game.title} · Level ${info.n}`;
  useScreenTitle(`${game.title}: ${info.title}`);
  const startedRef = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase === 'summary' || phase === 'count') window.scrollTo({ top: 0 });
  }, [phase]);

  // Leaving the tab pauses the round (games stop their clocks and listening while `running` is
  // false); coming back counts 3-2-1 again, so nobody loses time to a phone call.
  useEventListener(typeof document === 'undefined' ? null : document, 'visibilitychange', () => {
    if (document.hidden) {
      if (phase === 'count' || phase === 'play') setAway(true);
    } else if (away) {
      setAway(false);
      setPhase((p) => (p === 'play' ? 'count' : p));
    }
  });

  // The microphone died mid-round (unplugged, taken by another app): finish the round by tapping.
  useEffect(() => {
    if (input !== 'mic' || !inRound || mic.status !== 'failed') return;
    setInput('tap');
    setFallback('lost');
  }, [input, inRound, mic.status]);

  // While the ready card is up, the board behind it is out of reach (no stray Tab stops under it);
  // the card itself takes the focus so Enter starts and Tab reaches its controls.
  useEffect(() => {
    const shell = shellRef.current;
    const round = shell?.querySelector('[data-arcade-round]');
    round?.toggleAttribute('inert', phase === 'ready');
    if (phase !== 'ready' || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    shell?.querySelector<HTMLElement>('[data-arcade-ready]')?.focus({ preventScroll: true });
  }, [phase, blocked, seed, attempt]);

  // Once it starts, focus goes to the board (or the round's first control), where the arrow keys,
  // Enter and the number keys work; it is never left on the page body.
  useEffect(() => {
    if (phase !== 'count') return;
    const shell = shellRef.current;
    const round = shell?.querySelector('[data-arcade-round]');
    const active = document.activeElement;
    if (!round || (active && active !== document.body && !shell?.contains(active)) || (active && round.contains(active))) return;
    const target =
      round.querySelector<HTMLElement>('[data-arcade-autofocus]:not([disabled])') ??
      round.querySelector<HTMLElement>('[data-arcade-stage] button[tabindex="0"]:not([disabled])') ??
      round.querySelector<HTMLElement>('[data-arcade-stage] button:not([disabled])') ??
      round.querySelector<HTMLElement>('[data-arcade-controls] button:not([disabled])');
    target?.focus({ preventScroll: true });
  }, [phase]);

  // The countdown: 3, 2, 1 with ticks, then go.
  useEffect(() => {
    if (phase !== 'count') return;
    const step = reduced ? 380 : 520;
    let n = 3;
    setCount(3);
    countSound(false);
    const id = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(id);
        countSound(true);
        setPhase('play');
        return;
      }
      setCount(n);
      countSound(false);
    }, step);
    return () => window.clearInterval(id);
  }, [phase, reduced]);

  const chooseInput = useCallback(
    (next: 'tap' | 'mic') => {
      setInput(next);
      setBlocked(null);
      updateRecords((r) => (r.input === next ? r : { ...r, input: next }));
      if (next === 'tap') mic.stop();
    },
    [mic],
  );

  const start = useCallback(
    async (mode: 'tap' | 'mic' = input) => {
      if (startedRef.current) return;
      startedRef.current = true;
      setStarting(true);
      await unlockAudio().catch(() => false);
      if (mode === 'mic') {
        const failure = await mic.start();
        if (failure) {
          startedRef.current = false;
          setStarting(false);
          // The panel explains it once a visit; after that the game quietly plays by taps.
          if (!micBlockedShown()) {
            markMicBlockedShown();
            setBlocked(failure);
            return;
          }
          setInput('tap');
          setFallback('none');
          startedRef.current = true;
        }
      }
      setStarting(false);
      setPhase('count');
    },
    [input, mic],
  );

  const finish = useCallback(
    (result: RoundResult) => {
      endSound(result.stars);
      const params = gameParams(game.id, focus);
      let activity: ActivityResult | null = null;
      try {
        activity = recordActivity({
          kind: 'scale-game',
          id: skillIdFor(game.id, shapeFocus, info.n),
          title: roundTitle(game, scaleName, pattern.name),
          accuracy: result.accuracy,
          score: result.score,
          stars: result.stars,
          combo: result.bestCombo,
          mistakes: result.mistakes,
          perfect: result.perfect,
          count: result.count,
          durationSec: Math.max(1, result.durationSec),
          route: 'arcade',
          params,
          progress: 1,
          meta: { level: info.n },
        });
      } catch {
        activity = null;
      }
      const holder: { change?: RoundChange } = {};
      updateRecords((r) => {
        holder.change = applyRound(r, { game: game.id, scope, level: info.n, levelCount: levels.length, stars: result.stars, score: result.score, scaleSlug: params[1], at: Date.now() });
        return holder.change.records;
      });
      const o: RoundOutcome = { result, activity, change: holder.change ?? applyRound(getRecords(), { game: game.id, scope, level: info.n, levelCount: levels.length, stars: result.stars, score: result.score, scaleSlug: params[1], at: Date.now() }) };
      mic.stop();
      if (onDone) {
        onDone(o);
        return;
      }
      setOutcome(o);
      setPhase('summary');
    },
    [game, focus, shapeFocus, info.n, scaleName, pattern.name, scope, levels.length, mic, onDone],
  );

  const again = useCallback(() => {
    startedRef.current = false;
    setOutcome(null);
    setSeed(testSeed() ?? freshSeed());
    setAttempt((a) => a + 1);
    setPhase('ready');
  }, []);

  useEventListener(typeof window === 'undefined' ? null : window, 'keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || phase !== 'ready' || blocked) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('button, a, input, select, [role="dialog"]') || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    e.preventDefault();
    void start();
  });

  if (phase === 'summary' && outcome) {
    return (
      <Page title={`${game.title}: ${info.title}`} eyebrow={`Level ${info.n} of ${levels.length} · ${scopeLabel(game.id, scaleName)}`} back={{ to: 'arcade', params: gameParams(game.id, focus), label: game.title }}>
        <Summary game={game} focus={focus} level={info.n} levels={levels} outcome={outcome} onAgain={again} />
      </Page>
    );
  }

  const ctx: RoundContext = { game: game.id, focus: shapeFocus, pattern, scale, tuning, level: info.n, seed, size, scaleName };
  const Game = COMPONENTS[game.id];
  const audioLocked = audioState() === 'locked';

  return (
    <Page title={`${game.title}: ${info.title}`} hideHeader width="full" className={styles.roundPage}>
      <div ref={shellRef} className={cx(styles.roundShell, phase === 'ready' && styles.roundShellDim)} data-arcade-phase={phase} data-arcade-input={input} data-arcade-away={away || undefined}>
        {fallback && phase !== 'ready' && (
          <Banner tone="info" icon="Hand" className={styles.fallbackBanner} live={fallback === 'lost'}>
            {fallback === 'lost' ? 'The microphone stopped, so the rest of this round is played by tapping.' : 'No microphone here, so this round is played by tapping.'}
          </Banner>
        )}
        <Game key={`${seed}:${attempt}`} ctx={ctx} input={input} mic={mic} anyOctave={records.anyOctave} running={phase === 'play' && !away} fx={fx} title={title} onFinish={finish} onEnd={onExit} />
        {phase === 'count' && (
          <div className={styles.countOverlay} aria-live="assertive" data-arcade-countdown>
            <span className={styles.countBig} key={count}>
              {count}
            </span>
          </div>
        )}
        {phase === 'ready' && (
          <div className={styles.readyOverlay}>
            <section className={styles.readyCard} aria-labelledby={blocked ? undefined : 'arcade-ready-title'} aria-label={blocked ? 'Microphone' : undefined} tabIndex={-1} data-arcade-ready>
              {blocked ? (
                <MediaBlocked
                  reason={blocked}
                  device="microphone"
                  level={2}
                  onRetry={() => {
                    setBlocked(null);
                    void start('mic');
                  }}
                  onContinueWithout={() => {
                    // The learner asked to play by tapping: start straight away, no second Start.
                    chooseInput('tap');
                    setBlocked(null);
                    startedRef.current = false;
                    void start('tap');
                  }}
                  continueLabel="Tap the notes instead"
                />
              ) : (
                <>
                  <span className={styles.readyEyebrow}>{eyebrow ?? `Level ${info.n} of ${levels.length}`}</span>
                  <Heading level={2} size="2xl" display id="arcade-ready-title">
                    {info.title}
                  </Heading>
                  <Text tone="muted">{info.goal}</Text>
                  <Text size="sm" tone="muted">
                    {game.id === 'mode-match' ? 'The modes of the major scale' : `${scaleName} · ${shapeTitle(pattern)}`}
                  </Text>
                  <ol className={styles.howList}>
                    {game.how.map((h, i) => (
                      <li key={i}>
                        <span className={styles.howNum} aria-hidden="true">
                          {i + 1}
                        </span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ol>
                  {locked && (
                    <Text size="sm" tone="warn">
                      <Icon name="Lock" size={14} /> Skipping ahead: a star here opens this level for good.
                    </Text>
                  )}
                  {best && best.plays > 0 && (
                    <Text size="sm" tone="muted" tabular>
                      Your best here: {best.best.toLocaleString()} · {best.stars} {best.stars === 1 ? 'star' : 'stars'}
                    </Text>
                  )}
                  {game.mic && (
                    <div className={styles.inputPick}>
                      <SegmentedControl
                        aria-label="How to play"
                        fullWidth
                        options={[
                          { value: 'tap', label: 'Tap the screen', icon: 'Pointer' },
                          { value: 'mic', label: 'Play my guitar', icon: 'Mic' },
                        ]}
                        value={input}
                        onChange={(v) => chooseInput(v as 'tap' | 'mic')}
                      />
                      {input === 'mic' && (
                        <Switch
                          checked={records.anyOctave}
                          onChange={(on) => updateRecords((r) => ({ ...r, anyOctave: on }))}
                          label="Any octave counts"
                          description="The right note an octave up or down is fine."
                        />
                      )}
                    </div>
                  )}
                  <div className={styles.readyActions}>
                    <Button variant="ghost" onClick={onExit}>
                      Not now
                    </Button>
                    <Button variant="primary" size="lg" iconLeft={input === 'mic' ? 'Mic' : 'Play'} onClick={() => void start(input)} loading={starting} aria-keyshortcuts="Enter" data-arcade-go>
                      {input === 'mic' ? 'Start listening' : 'Start'}
                    </Button>
                  </div>
                  {audioLocked && game.id === 'mode-match' && (
                    <Text size="xs" tone="muted">
                      Sound starts with this tap.
                    </Text>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </Page>
  );
}
