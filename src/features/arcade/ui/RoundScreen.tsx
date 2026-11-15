import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { Banner, Button, Heading, Icon, MediaBlocked, Page, SegmentedControl, Switch, Text, cx, useEventListener, useMediaQuery, usePrefersReducedMotion, useWakeLock } from '@/ui';
import { recordActivity, type ActivityResult } from '@/core/progress';
import { learnerTuning } from '@/core/settings';
import { audioState, unlockAudio } from '@/core/audio';
import { readJSON, type MediaFailure } from '@/core/platform';
import { getScale } from '@/core/theory';
import { useMusicSettings } from '@/ui/music';
import { patternOf, scaleTitle, shapesFor, shapeTitle, type Focus } from '../core/focus';
import { levelsOf, scopeOf, type GameDef } from '../core/games';
import { applyRound, isUnlocked, levelRecord, type RoundChange } from '../core/records';
import { freshSeed } from '../core/rng';
import { gameParams, roundTitle, skillIdFor } from '../core/skill';
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
  const levels = useMemo(() => levelsOf(game.id, focus, tuning), [game.id, focus, tuning]);
  const info = levels.find((l) => l.n === level) ?? levels[0];
  // Shape Builder's levels are the shapes themselves; every other game uses the focus shape.
  const shapeFocus = useMemo<Focus>(() => {
    if (game.id !== 'shape-builder') return focus;
    const shapes = shapesFor(focus.tonic, focus.scale, tuning);
    return { ...focus, shape: shapes[level - 1]?.id ?? focus.shape };
  }, [game.id, focus, level, tuning]);
  const pattern = useMemo(() => patternOf(shapeFocus, tuning), [shapeFocus, tuning]);
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
  const [quietFallback, setQuietFallback] = useState(false);
  const [count, setCount] = useState(3);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [starting, setStarting] = useState(false);
  const mic = useArcadeMic();
  const fx = useFx();
  const reduced = usePrefersReducedMotion();
  const shortLandscape = useMediaQuery('(orientation: landscape) and (max-height: 540px)');
  const inRound = phase === 'count' || phase === 'play';
  useImmersive(phase !== 'summary', shortLandscape && inRound ? 'bare' : 'focus');
  useWakeLock(inRound);
  const title = `${game.title} · Level ${info.n}`;
  useScreenTitle(`${game.title}: ${info.title}`);
  const startedRef = useRef(false);

  useEffect(() => {
    if (phase === 'summary' || phase === 'count') window.scrollTo({ top: 0 });
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

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarting(true);
    await unlockAudio().catch(() => false);
    if (input === 'mic') {
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
        setQuietFallback(true);
        startedRef.current = true;
      }
    }
    setStarting(false);
    setPhase('count');
  }, [input, mic]);

  const finish = useCallback(
    (result: RoundResult) => {
      endSound(result.stars);
      const params = gameParams(game.id, focus);
      let activity: ActivityResult | null = null;
      try {
        activity = recordActivity({
          kind: 'scale-game',
          id: skillIdFor(game.id, shapeFocus, info.n),
          title: roundTitle(game, scaleName, game.id === 'mode-match' ? null : pattern.name),
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
      <Page title={`${game.title}: ${info.title}`} eyebrow={`Level ${info.n} of ${levels.length} · ${scaleName}`} back={{ to: 'arcade', params: gameParams(game.id, focus), label: game.title }}>
        <Summary game={game} focus={focus} level={info.n} levels={levels} outcome={outcome} onAgain={again} />
      </Page>
    );
  }

  const ctx: RoundContext = { game: game.id, focus: shapeFocus, pattern, scale, tuning, level: info.n, seed, size, scaleName };
  const Game = COMPONENTS[game.id];
  const audioLocked = audioState() === 'locked';

  return (
    <Page title={`${game.title}: ${info.title}`} hideHeader width="full" className={styles.roundPage}>
      <div className={cx(styles.roundShell, phase === 'ready' && styles.roundShellDim)} data-arcade-phase={phase} data-arcade-input={input}>
        {quietFallback && phase !== 'ready' && (
          <Banner tone="info" icon="Hand" className={styles.fallbackBanner}>
            No microphone here, so this round is played by tapping.
          </Banner>
        )}
        <Game key={`${seed}:${attempt}`} ctx={ctx} input={input} mic={mic} anyOctave={records.anyOctave} running={phase === 'play'} fx={fx} title={title} onFinish={finish} onEnd={onExit} />
        {phase === 'count' && (
          <div className={styles.countOverlay} aria-live="assertive" data-arcade-countdown>
            <span className={styles.countBig} key={count}>
              {count}
            </span>
          </div>
        )}
        {phase === 'ready' && (
          <div className={styles.readyOverlay}>
            <section className={styles.readyCard} aria-labelledby="arcade-ready-title" data-arcade-ready>
              {blocked ? (
                <MediaBlocked
                  reason={blocked}
                  device="microphone"
                  level={2}
                  onRetry={() => {
                    setBlocked(null);
                    void start();
                  }}
                  onContinueWithout={() => {
                    chooseInput('tap');
                    setBlocked(null);
                    startedRef.current = false;
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
                    <Button variant="primary" size="lg" iconLeft={input === 'mic' ? 'Mic' : 'Play'} onClick={() => void start()} loading={starting} aria-keyshortcuts="Enter" data-arcade-go>
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
