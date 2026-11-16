import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate } from '@/app/router';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { pluck, normalizeTone, unlockAudio } from '@/core/audio';
import { useProgress } from '@/core/progress';
import { soundPrefs } from '@/core/settings';
import { ActionBar, Button, CountdownRing, Heading, Icon, IconButton, Kbd, MediaBlocked, Page, ProgressBar, StarRating, Text, cx, useEventListener, useIsMobile, useMediaQuery, usePrefersReducedMotion, useWakeLock } from '@/ui';
import { Fretboard, type FretBox, type FretMarker } from '@/ui/music';
import { drillPlan, type Drill } from '../core/drills';
import { boardRange, midiAtPos, posKey, scopeHasAccidentals } from '../core/neck';
import { pcForKey, spell } from '../core/notes';
import { stageLesson, stageSkillId, stageTitle, STAGES, stringName, type Stage } from '../core/path';
import { bestResult, nextQuestion, startRound, type RoundPlan } from '../core/round';
import { describeSettings } from '../core/settings';
import { blindSpots } from '../core/stats';
import type { Question } from '../core/types';
import { NotePad } from './NotePad';
import { QuestionBoard } from './QuestionBoard';
import { SettingsSheet } from './SettingsSheet';
import { Summary } from './Summary';
import { useMic } from './useMic';
import { useRound, type RoundApi } from './useRound';
import { useTrainer, type Trainer } from './useTrainer';
import styles from './Trainer.module.css';

/** Props of {@link RoundScreen}: a step of the method, or a free drill. */
export type RoundScreenProps = { stage: Stage; drill?: undefined } | { drill: Drill; stage?: undefined };

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || !!el.closest('[role="dialog"]');
}

/** A note with its octave, in the reader's naming: "C4". */
function withOctave(trainer: Trainer, midi: number): string {
  return trainer.fmt(`${spell(midi % 12, trainer.ctx.spelling === 'flats' ? 'flats' : 'sharps')}${Math.floor(midi / 12) - 1}`);
}

/** A round: the intro (what this step teaches, or how the drill works), the questions, the summary. */
export function RoundScreen(props: RoundScreenProps) {
  const trainer = useTrainer();
  const { stage, drill } = props;
  const [tapInstead, setTapInstead] = useState(false);
  // "Tap the notes instead" is an action: the tap round starts as soon as its plan is ready.
  const [startTapping, setStartTapping] = useState(false);
  const [sheet, setSheet] = useState(false);
  const mic = useMic();
  const blind = useMemo(() => (drill?.id === 'blind-spots' ? blindSpots(trainer.stats, trainer.ctx, [0, trainer.maxFret], 8).map(posKey) : undefined), [drill?.id, trainer.stats, trainer.ctx, trainer.maxFret]);
  const title = stage ? stageTitle(stage, trainer.ctx, trainer.fmt) : drill!.title;
  const plan = useMemo<RoundPlan>(() => {
    if (stage) return { skillId: stageSkillId(stage), title, asks: stage.asks, scope: stage.scope(trainer.ctx, trainer.maxFret), length: stage.length, seconds: null, passAt: 0.8, options: stage.options };
    return drillPlan(drill!, trainer.settings, { tapInstead, blind });
    // Blind spots are read when the round is planned; a new round re-reads them.
  }, [stage, drill, trainer.ctx, trainer.maxFret, trainer.settings, tapInstead, blind?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const params = stage ? ['stage', stage.id] : ['drill', drill!.id];
  const api = useRound(plan, trainer, { params, title: stage ? `Fretboard step ${stage.n}: ${title}` : `Fretboard: ${title}`, playOctaves: trainer.settings.playOctaves });
  const playing = api.phase === 'asking' || api.phase === 'answered';
  // A phone held sideways needs every pixel of height for the neck: the round brings its own way out.
  const sideways = useMediaQuery('(orientation: landscape) and (max-height: 540px)');
  useImmersive(playing, sideways ? 'bare' : 'focus');
  useWakeLock(playing);
  useScreenTitle(title);
  useEffect(() => {
    if (api.phase !== 'answered') window.scrollTo({ top: 0 });
  }, [api.phase]);

  const next = stage ? STAGES[stage.n] ?? null : null;
  const usesMic = drill?.id === 'play-the-note' && !tapInstead;

  const begin = useCallback(async () => {
    void unlockAudio();
    if (usesMic && mic.status !== 'on') {
      const ok = await mic.start();
      if (!ok) return;
    }
    api.start();
  }, [usesMic, mic, api]);

  useEffect(() => {
    if (!startTapping || !tapInstead) return;
    setStartTapping(false);
    void begin();
  }, [startTapping, tapInstead, begin]);
  const tapNow = useCallback(() => {
    mic.stop();
    setTapInstead(true);
    setStartTapping(true);
  }, [mic]);

  const endRound = useCallback(() => {
    api.end();
    mic.stop();
    navigate('fretboard');
  }, [api, mic]);

  // Keyboard: letters name notes, Space shows the answer (or moves on), Enter moves on, Esc leaves.
  useEventListener(typeof window === 'undefined' ? null : window, 'keydown', (e: KeyboardEvent) => {
    if (sheet || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    const onControl = !!(e.target as HTMLElement | null)?.closest?.('a, button');
    if (api.phase === 'intro' || api.phase === 'summary') {
      if (e.key === 'Enter' && !onControl) {
        e.preventDefault();
        void begin();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        navigate('fretboard');
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      endRound();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (api.phase === 'asking') api.giveUp();
      else api.next();
      return;
    }
    if (e.key === 'Enter' && api.phase === 'answered' && !onControl) {
      e.preventDefault();
      api.next();
      return;
    }
    if (api.phase === 'asking' && api.question?.kind === 'name') {
      const pc = pcForKey(e.key, e.shiftKey, trainer.ctx.spelling, trainer.naming === 'german');
      if (pc !== null) {
        e.preventDefault();
        api.answerPc(pc);
      }
    }
  });

  const sheetEl = <SettingsSheet open={sheet} onClose={() => setSheet(false)} trainer={trainer} />;

  if (api.phase === 'summary' && api.outcome) {
    return (
      <Page title={title} eyebrow={stage ? `Step ${stage.n} of ${STAGES.length} · round complete` : 'Round complete'} back={{ to: 'fretboard', label: 'Fretboard' }}>
        <Summary
          outcome={api.outcome}
          trainer={trainer}
          scope={api.plan.scope}
          stage={stage}
          nextStage={next}
          nextTitle={next ? stageTitle(next, trainer.ctx, trainer.fmt) : undefined}
          sprint={plan.seconds !== null}
          offerPlay={!!drill && drill.id !== 'play-the-note' && drill.id !== 'sprint'}
          onAgain={() => void begin()}
        />
      </Page>
    );
  }

  if (!playing || !api.question) {
    return (
      <>
        <Intro trainer={trainer} stage={stage} drill={drill} title={title} plan={plan} mic={mic} usesMic={usesMic} onStart={begin} onSettings={() => setSheet(true)} onTapInstead={tapNow} />
        {sheetEl}
      </>
    );
  }

  return (
    <Page title={title} hideHeader width="full" className={styles.roundPage}>
      <Playing api={api} question={api.question} plan={api.plan} trainer={trainer} mic={mic} onEnd={endRound} sprint={api.plan.seconds} />
    </Page>
  );
}

// ── intro ────────────────────────────────────────────────────────────────────────────────────────

interface IntroProps {
  trainer: Trainer;
  stage?: Stage;
  drill?: Drill;
  title: string;
  plan: RoundPlan;
  mic: ReturnType<typeof useMic>;
  usesMic: boolean;
  onStart: () => void;
  onSettings: () => void;
  onTapInstead: () => void;
}

function Intro({ trainer, stage, drill, title, plan, mic, usesMic, onStart, onSettings, onTapInstead }: IntroProps) {
  const skill = useProgress((s) => s.skills[plan.skillId]);
  const best = bestResult(skill);
  const lesson = useMemo(() => (stage ? stageLesson(stage, trainer.ctx, trainer.fmt, trainer.maxFret) : null), [stage, trainer.ctx, trainer.fmt, trainer.maxFret]);
  const markers = useMemo<FretMarker[]>(
    () =>
      lesson
        ? lesson.dots.map((d) => ({ ...d.pos, note: d.name, noteLabel: true, color: d.accent ? 'accent' : d.anchor ? 'info' : 'neutral', root: d.anchor, id: posKey(d.pos) }))
        : [],
    [lesson],
  );
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  const playDots = useCallback(() => {
    if (!lesson) return;
    void unlockAudio();
    timers.current.forEach((t) => clearTimeout(t));
    const order = [...lesson.dots].sort((a, b) => midiAtPos(trainer.ctx, a.pos) - midiAtPos(trainer.ctx, b.pos)).slice(0, 16);
    const tone = normalizeTone(soundPrefs().guitarTone);
    timers.current = order.map((d, i) => window.setTimeout(() => pluck(midiAtPos(trainer.ctx, d.pos), undefined, { tone, string: d.pos.string, duration: 0.9, velocity: 0.7 }), i * 260));
  }, [lesson, trainer.ctx]);

  const startLabel = stage ? `Start step ${stage.n}` : usesMic ? 'Start listening' : drill?.id === 'sprint' ? 'Start the minute' : 'Start';
  const failed = usesMic && mic.status === 'failed' && !!mic.failure;
  // When the microphone cannot start, say so where the eyes are: at the top of the screen.
  const blockedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (failed) blockedRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [failed]);
  const octaves = trainer.settings.playOctaves;

  return (
    <Page
      title={title}
      eyebrow={stage ? `Step ${stage.n} of ${STAGES.length}` : 'Drill'}
      subtitle={stage ? stage.blurb : drill!.blurb}
      back={{ to: 'fretboard', label: 'Fretboard' }}
    >
      {failed && (
        <div ref={blockedRef} className={styles.blocked}>
          <MediaBlocked reason={mic.failure!} device="microphone" onRetry={onStart} onContinueWithout={onTapInstead} continueLabel="Tap the notes instead" framed level={2} />
        </div>
      )}
      <div className={cx(styles.intro, styles.introLesson)}>
        {!lesson && drill && (
          <div className={styles.introBoard}>
            <DrillExample trainer={trainer} drill={drill} plan={plan} />
          </div>
        )}
        {lesson && (
          <div className={styles.introBoard}>
            <div className={styles.mapBoard}>
              <Fretboard tuning={trainer.tuning} frets={lesson.frets} markers={markers} path={lesson.links.length ? lesson.links.flat() : null} pathArrows size="md" aria-label={`${title}: the notes of this step`} />
            </div>
            <Button size="sm" variant="ghost" iconLeft="Volume2" onClick={playDots}>
              Hear these notes
            </Button>
          </div>
        )}
        <div className={styles.introText}>
          {lesson ? (
            <ol className={styles.points}>
              {lesson.points.map((p, i) => (
                <li key={i}>
                  <Text>{p}</Text>
                </li>
              ))}
            </ol>
          ) : (
            <DrillHow trainer={trainer} drill={drill!} plan={plan} onSettings={onSettings} />
          )}
          {usesMic && (
            <div className={styles.micNote}>
              <Icon name="Mic" size={18} />
              <Text size="sm">
                {octaves === 'exact'
                  ? 'The microphone listens for the exact pitch of that place on the neck. It hears pitch, not strings, so the same pitch on another string counts too; another octave does not.'
                  : 'The microphone listens for the note in any octave. It hears pitch, not strings.'}{' '}
                Tune up first for the best results.
              </Text>
            </div>
          )}
          {usesMic && !failed && (
            <Button variant="ghost" iconLeft="Hand" onClick={onTapInstead} className={styles.tapInstead} data-fb-tap-instead>
              No microphone here? Tap the notes instead
            </Button>
          )}
          {best && skill && (
            <div className={styles.best}>
              <StarRating value={skill.stars} size={16} label={`${skill.stars} of 3 stars`} />
              <Text size="sm" tone="muted">
                {plan.seconds ? `Best: ${best.score} notes` : `Best: ${best.percent}%`} · {skill.completions} {skill.completions === 1 ? 'round' : 'rounds'}
              </Text>
            </div>
          )}
        </div>
      </div>
      <ActionBar start={<KeyHint>Enter</KeyHint>}>
        {failed ? (
          <Button variant="primary" size="lg" iconLeft="Hand" onClick={onTapInstead} data-fb-start-tap>
            Tap the notes instead
          </Button>
        ) : (
          <Button variant="primary" size="lg" iconRight={usesMic ? 'Mic' : 'ArrowRight'} onClick={onStart} loading={mic.status === 'starting'} data-fb-start aria-keyshortcuts="Enter">
            {startLabel}
          </Button>
        )}
      </ActionBar>
    </Page>
  );
}

function KeyHint({ children }: { children: ReactNode }) {
  return (
    <span className={styles.keyHintLine} aria-hidden="true">
      <Kbd>{children}</Kbd> to start
    </span>
  );
}

/** A picture of what the drill's questions look like, on the learner's own part of the neck. */
function DrillExample({ trainer, drill, plan }: { trainer: Trainer; drill: Drill; plan: RoundPlan }) {
  const { ctx } = trainer;
  const example = useMemo(() => {
    const q = nextQuestion(startRound(plan, ctx, trainer.stats, 7));
    if (!q) return null;
    const markers: FretMarker[] = [];
    let box: FretBox | null = null;
    let caption = '';
    if (q.kind === 'name') {
      markers.push({ ...q.pos, label: '?', color: 'accent', state: 'target' });
      caption = 'What note is this?';
    } else if (q.kind === 'every' || q.kind === 'find-any') {
      for (const t of q.targets) markers.push({ ...t, note: q.name, noteLabel: true, color: q.kind === 'every' ? 'ok' : 'neutral', shape: q.kind === 'every' ? 'circle' : 'ring' });
      caption = q.kind === 'every' ? `Every ${trainer.fmt(q.name)} on your part of the neck` : `${trainer.fmt(q.name)} lives in all these places`;
    } else if ('string' in q) {
      box = { from: Math.max(1, plan.scope.frets[0]), to: plan.scope.frets[1], strings: [q.string, q.string] };
      caption = `${drill.id === 'play-the-note' ? 'Play' : 'Find'} ${trainer.fmt(q.name)} on ${stringName(ctx, q.string, trainer.fmt)}`;
    }
    return { markers, box, caption };
  }, [plan, ctx, trainer, drill.id]);
  if (!example) return null;
  return (
    <figure className={styles.example}>
      <div className={styles.mapBoard}>
        <Fretboard tuning={trainer.tuning} frets={boardRange(plan.scope)} markers={example.markers} box={example.box} size="md" aria-label={`Example: ${example.caption}`} />
      </div>
      <figcaption>
        <Text size="sm" tone="muted">
          Example: {example.caption}
        </Text>
      </figcaption>
    </figure>
  );
}

function DrillHow({ trainer, drill, plan, onSettings }: { trainer: Trainer; drill: Drill; plan: RoundPlan; onSettings: () => void }) {
  const lines: string[] = [drill.how];
  if (plan.seconds) lines.push('Right answers move straight on. A miss shows the answer for a moment, then the next note comes.');
  else lines.push(`${plan.length} questions. They lean toward the places you miss most, so the round stays at about four right answers in five.`);
  lines.push('Miss one and you see where it is and how to work it out from the nearest dot.');
  return (
    <div className={styles.how}>
      <ol className={styles.points}>
        {lines.map((l, i) => (
          <li key={i}>
            <Text>{l}</Text>
          </li>
        ))}
      </ol>
      {drill.id !== 'blind-spots' && (
        <div className={styles.scopeLine}>
          <Icon name="SlidersHorizontal" size={16} />
          <Text size="sm">{describeSettings(trainer.settings, trainer.tuning.stringCount)}</Text>
          <Button size="sm" variant="ghost" onClick={onSettings}>
            Change
          </Button>
        </div>
      )}
    </div>
  );
}

// ── the round ────────────────────────────────────────────────────────────────────────────────────

interface PlayingProps {
  api: RoundApi;
  question: Question;
  plan: RoundPlan;
  trainer: Trainer;
  mic: ReturnType<typeof useMic>;
  onEnd: () => void;
  sprint: number | null;
}

function Playing({ api, question: q, plan, trainer, mic, onEnd, sprint }: PlayingProps) {
  const mobile = useIsMobile();
  const fine = useMediaQuery('(hover: hover) and (pointer: fine)');
  const portrait = useMediaQuery('(orientation: portrait)');
  const short = useMediaQuery('(orientation: landscape) and (max-height: 540px)');
  const answered = api.phase === 'answered';
  const { fmt, ctx } = trainer;
  const reduceMotion = usePrefersReducedMotion();
  // Sharps and flats on the pad only when the round can ask one (step 1 has seven letters).
  const accidentals = useMemo(() => scopeHasAccidentals(plan.scope, ctx), [plan.scope, ctx]);
  const lowest = Math.min(...ctx.tuning);

  // "Play it": listen while the question is open; "Hear it" pauses the listening while it sounds.
  const [listenKey, setListenKey] = useState(0);
  const [hearing, setHearing] = useState(false);
  useEffect(() => {
    if (q.kind !== 'play' || api.phase !== 'asking' || mic.status !== 'on' || hearing) return;
    const wait = mic.listen(q.midis.length ? q.midis : [midiAtPos(ctx, q.pos)], trainer.settings.playOctaves, (m) => api.heardWrong(m), lowest);
    if (!wait) return;
    // A note still ringing from before the question does not answer it: it has to be played again.
    const t0 = mic.clock();
    let live = true;
    void wait.then((r) => {
      if (!live) return;
      if (r.ok && t0 !== null && r.time < t0 - 0.05) setListenKey((k) => k + 1);
      else if (r.ok) api.heardRight(r.midi);
      else if (r.reason === 'timeout') api.giveUp();
    });
    return () => {
      live = false;
      wait.cancel();
    };
  }, [q, api.phase, mic.status, listenKey, hearing]); // eslint-disable-line react-hooks/exhaustive-deps
  const hearTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (hearTimer.current !== null) window.clearTimeout(hearTimer.current);
  }, []);
  const hearIt = () => {
    if (api.questionMidi === null) return;
    setHearing(true);
    pluck(api.questionMidi, undefined, { tone: normalizeTone(soundPrefs().guitarTone), duration: 1.2, velocity: 0.7 });
    hearTimer.current = window.setTimeout(() => {
      hearTimer.current = null;
      setHearing(false);
      setListenKey((k) => k + 1);
    }, 1700);
  };

  // After a miss the explanation and "Next" must be on screen, even on a phone held sideways or with large text.
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const missed = answered && api.attempt.right === false;
  useEffect(() => {
    const el = bottomRef.current;
    if (!missed || !el) return;
    // Only as far as needed: the explanation's bottom edge onto the screen, the neck kept in view.
    const over = el.getBoundingClientRect().bottom - window.innerHeight;
    if (over > 0) window.scrollBy({ top: over + 8, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [missed, q, reduceMotion]);

  const prompt = promptFor(q, trainer, plan);
  const progress = sprint ? null : (
    <ProgressBar className={styles.progress} value={api.index} max={plan.length ?? 1} segmented={(plan.length ?? 0) <= 16} aria-label="Round progress" valueText={false} size="sm" tone="accent" />
  );
  // "Name it" shows a picture of the neck sized to fit (and leaves room for the pad); "find it" makes every fret a 44 px button.
  const board = <QuestionBoard question={q} attempt={api.attempt} phase={api.phase} scope={plan.scope} trainer={trainer} onTap={q.kind === 'name' ? undefined : api.tap} size={q.kind === 'name' ? (mobile || short ? 'md' : 'xl') : undefined} />;
  const wideNeck = plan.scope.frets[1] - plan.scope.frets[0] > 7;

  return (
    <div className={styles.round} data-fb-round data-phase={api.phase} data-kind={q.kind}>
      <div className={styles.roundTop}>
        <IconButton icon="X" label="End round (Esc)" onClick={onEnd} data-fb-end />
        {progress}
        {sprint ? (
          <div className={styles.sprintTop}>
            <CountdownRing seconds={sprint} size={52} running onDone={api.timeUp} label="Time left" />
            <span className={styles.sprintScore} aria-live="off">
              <span className={styles.sprintNumber}>{api.score}</span> named
            </span>
          </div>
        ) : (
          <span className={styles.counter} aria-hidden="true">
            {Math.min(api.index + (answered ? 0 : 1), plan.length ?? 0)} of {plan.length}
          </span>
        )}
        {api.streak >= 3 && (
          <span className={styles.streak} aria-label={`${api.streak} right in a row`}>
            <Icon name="Flame" size={16} />
            {api.streak}
          </span>
        )}
      </div>

      <div className={styles.prompt}>
        <Heading level={2} size={mobile ? 'xl' : '2xl'} display data-fb-prompt>
          {prompt.title}
        </Heading>
        {prompt.sub && (
          <Text tone="muted" size="sm">
            {prompt.sub}
          </Text>
        )}
      </div>

      <div className={styles.stage}>
      {board}
      {mobile && portrait && q.kind !== 'name' && wideNeck && (
        <Text size="xs" tone="muted" className={styles.turnHint}>
          <Icon name="Smartphone" size={14} /> Swipe the neck sideways, or turn your phone to see all of it.
        </Text>
      )}
      </div>

      <div className={styles.bottom} ref={bottomRef}>
        <div className={cx(styles.feedback, api.feedback && styles[`fb-${api.feedback.tone}`])} aria-live="polite" data-fb-feedback={api.feedback?.tone ?? ''}>
          {api.feedback ? (
            <>
              <span className={styles.feedbackTitle}>
                <Icon name={api.feedback.tone === 'ok' ? 'CircleCheck' : api.feedback.tone === 'bad' ? 'CircleX' : 'Info'} size={20} />
                {api.feedback.title}
              </span>
              {api.feedback.lines.map((l, i) => (
                <Text key={i} size="sm" className={styles.feedbackLine}>
                  {l}
                </Text>
              ))}
            </>
          ) : (
            <span className={styles.feedbackIdle}>{idleHint(q, fine, ctx.spelling === 'flats')}</span>
          )}
        </div>

        <div className={styles.controls}>
          {q.kind === 'name' && (
            <NotePad
              accidentals={accidentals}
              spelling={ctx.spelling}
              fmt={fmt}
              onAnswer={api.answerPc}
              result={answered ? { answer: q.pc, chosen: api.attempt.namedPc } : null}
              keyHints={fine}
              german={trainer.naming === 'german'}
            />
          )}
          {q.kind === 'play' && api.phase === 'asking' && (
            <div className={styles.listen} data-fb-listening={mic.status === 'on' && !hearing ? '' : undefined}>
              <span className={styles.listenDot} aria-hidden="true" />
              <Text size="sm">{hearing ? 'Playing it for you…' : mic.status === 'on' ? 'Listening to your guitar' : 'The microphone is off'}</Text>
              <span className={styles.level} aria-hidden="true">
                <span ref={mic.levelRef} className={styles.levelBar} />
              </span>
            </div>
          )}
          <div className={styles.actions}>
            {api.phase === 'asking' && q.kind === 'play' && (
              <Button iconLeft="Volume2" onClick={hearIt} disabled={hearing}>
                Hear it
              </Button>
            )}
            {api.phase === 'asking' && (
              <Button variant="ghost" iconLeft="Eye" onClick={api.giveUp} aria-keyshortcuts="Space" data-fb-skip>
                {q.kind === 'every' ? 'Show the rest' : 'Show me'}
                {fine && <Kbd className={styles.btnKbd}>Space</Kbd>}
              </Button>
            )}
            {answered && !api.attempt.right && !sprint && (
              <Button variant="primary" iconRight="ArrowRight" onClick={api.next} aria-keyshortcuts="Enter" data-fb-continue>
                Next
                {fine && <Kbd className={styles.btnKbd}>Enter</Kbd>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function idleHint(q: Question, fine: boolean, flats: boolean): string {
  switch (q.kind) {
    case 'name':
      return fine ? `Click its name or type its letter (Shift for a ${flats ? 'flat' : 'sharp'}).` : 'Tap its name below.';
    case 'every':
      return 'Tap each one you find.';
    case 'play':
      return 'Play it, then let it ring for a moment.';
    default:
      return 'Tap it on the neck.';
  }
}

function promptFor(q: Question, trainer: Trainer, plan: RoundPlan): { title: string; sub?: string } {
  const { fmt, ctx } = trainer;
  const n = fmt(q.name);
  const onString = (s: number) => stringName(ctx, s, fmt);
  switch (q.kind) {
    case 'name':
      return { title: 'What note is this?', sub: `String ${q.pos.string}${plan.scope.notes === 'naturals' ? ' · natural notes' : ''}` };
    case 'find':
      if (q.flavor === 'barre-root') return { title: `Find ${n} on ${onString(q.string)}`, sub: `The root of ${n} major as an ${q.string === 6 ? 'E' : 'A'}-shape barre chord.` };
      return { title: `Find ${n} on ${onString(q.string)}`, sub: `String ${q.string}` };
    case 'find-any':
      return { title: `Find ${/^[AEF]/.test(q.name) && trainer.naming === 'letters' ? 'an' : 'a'} ${n}`, sub: 'Anywhere on the neck' };
    case 'every':
      return { title: `Find every ${n}`, sub: `${q.targets.length} on this part of the neck` };
    case 'octave':
      return { title: `Find this ${n} ${q.octaves === 2 ? 'two octaves' : 'an octave'} up`, sub: `On ${onString(q.string)}` };
    case 'play': {
      const pitches = q.midis.map((m) => withOctave(trainer, m));
      return { title: `Play ${n} on ${onString(q.string)}`, sub: trainer.settings.playOctaves === 'exact' ? `Listening for ${pitches.join(' or ')}` : 'Any octave counts' };
    }
  }
}
