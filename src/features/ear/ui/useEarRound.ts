/**
 * The life of one round on screen: intro, questions that play by themselves, feedback that lets
 * the learner hear the difference, and the summary. The pure rules live in `core/round.ts`; this
 * hook adds sound, timing and the progress store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playUi } from '@/core/audio';
import { readJSON, remove, writeJSON } from '@/core/platform';
import { getProgress, getProgressStore, recordActivity, setSkillData, type ActivityResult, type JsonValue } from '@/core/progress';
import { readRecord, weakSpots, type WeakSpot } from '../core/adapt';
import { levelSkillId, levelStatuses, recordSkillId } from '../core/progress';
import { mixSeed } from '../core/rng';
import { RESUME_KEY, readSnapshot, restoreRound, snapshotOf } from '../core/resume';
import { answerQuestion, createRound, nextQuestion, roundDone, scoreRound, sequenceMarks, type Round, type RoundScore } from '../core/round';
import { slower, spread } from '../core/sound';
import type { DrillDef, EarSettings, LevelDef, Question, SoundPlan } from '../core/types';
import { sequencePlan } from '../core/drills/melody';
import { earDebug } from '../engine/debug';
import { EarPlayer } from '../engine/player';

/** Where the round is. */
export type Phase = 'intro' | 'asking' | 'answered' | 'summary';

/** What is sounding (drives the highlighted control). */
export type Playing = null | 'question' | 'slower' | 'spread' | 'chosen' | 'answer' | 'example' | 'note';

/** The verdict on the last answer. */
export interface Feedback {
  correct: boolean;
  /** Option id, or the melody's entered row keys. */
  chosen: string | string[];
}

/** What the summary shows. */
export interface RoundOutcome {
  score: RoundScore;
  activity: ActivityResult | null;
  /** Level number newly opened by this round. */
  unlocked: number | null;
  weak: WeakSpot[];
  durationSec: number;
  bestStreak: number;
}

const AUTO_PLAY_MS = 650;
const AUTO_NEXT_MS = 1300;

function freshSeed(): number {
  return mixSeed(Date.now(), Math.floor(Math.random() * 1e9));
}

/** A round of this level left by a reload, rebuilt as it was (null when there is none to pick up). */
function resumable(drill: DrillDef, level: LevelDef): { round: Round; startedAt: number } | null {
  const snap = readSnapshot(readJSON<unknown>(RESUME_KEY, null));
  const round = restoreRound(drill, level, snap, Date.now());
  return round && snap ? { round, startedAt: snap.startedAt } : null;
}

/** Drive one level's rounds. */
export function useEarRound(drill: DrillDef, level: LevelDef, settings: EarSettings) {
  const playerRef = useRef<EarPlayer | null>(null);
  const player = () => (playerRef.current ??= new EarPlayer());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // A reload in the middle of a round comes back to the same question (audio waits for a tap).
  const [resumed] = useState(() => resumable(drill, level));
  const lastAnswer = resumed && resumed.round.answers.length === resumed.round.questions.length ? resumed.round.answers[resumed.round.answers.length - 1] : null;
  const [phase, setPhase] = useState<Phase>(resumed ? (lastAnswer ? 'answered' : 'asking') : 'intro');
  const [round, setRound] = useState<Round | null>(resumed?.round ?? null);
  const roundRef = useRef<Round | null>(resumed?.round ?? null);
  const [question, setQuestion] = useState<Question | null>(resumed ? resumed.round.questions[resumed.round.questions.length - 1] : null);
  const [feedback, setFeedback] = useState<Feedback | null>(lastAnswer ? { correct: lastAnswer.correct, chosen: lastAnswer.chosen } : null);
  const [playing, setPlaying] = useState<Playing>(null);
  const [playingOption, setPlayingOption] = useState<string | null>(null);
  const resumedEntry = (): string[] => {
    const q = resumed?.round.questions[resumed.round.questions.length - 1];
    return q && q.kind === 'sequence' && !lastAnswer ? q.target.slice(0, q.given) : [];
  };
  const [entered, setEntered] = useState<string[]>(resumedEntry);
  const enteredRef = useRef<string[]>(entered);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [silent, setSilent] = useState(false);
  const startedAt = useRef(resumed?.startedAt ?? 0);
  const timers = useRef<number[]>([]);
  const phaseRef = useRef<Phase>('intro');
  phaseRef.current = phase;

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  /** Play a plan and show what is playing until it ends (or something else starts). */
  const play = useCallback(async (plan: SoundPlan, what: Playing, option: string | null = null, label?: string): Promise<boolean> => {
    setPlaying(what);
    setPlayingOption(option);
    const s = settingsRef.current;
    const res = await player().play(plan, { tone: s.tone, band: s.progressionSound === 'band', label: label ?? what ?? 'play' });
    setSilent(res.silent);
    // Only clear the highlight if nothing newer has taken over.
    if (!player().playing) {
      setPlaying((p) => (p === what ? null : p));
      setPlayingOption((o) => (o === option ? null : o));
    }
    return res.finished;
  }, []);

  const stopSound = useCallback(() => {
    player().stop();
    setPlaying(null);
    setPlayingOption(null);
  }, []);

  const replay = useCallback(
    (mode: 'normal' | 'slower' | 'spread' = 'normal') => {
      const q = question;
      if (!q) return;
      clearTimers();
      const plan = mode === 'slower' ? slower(q.plan) : mode === 'spread' ? spread(q.plan) : q.plan;
      void play(plan, mode === 'normal' ? 'question' : mode, null, `question:${mode}`);
    },
    [question, play, clearTimers],
  );

  /** Keep the round in progress where a reload can find it. */
  const save = useCallback((r: Round) => {
    writeJSON(RESUME_KEY, snapshotOf(r, startedAt.current, Date.now()));
  }, []);

  const ask = useCallback(
    (r: Round) => {
      const { round: next, question: q } = nextQuestion(r, settingsRef.current);
      roundRef.current = next;
      save(next);
      setRound(next);
      setQuestion(q);
      earDebug.question = q;
      setFeedback(null);
      enteredRef.current = q.kind === 'sequence' ? q.target.slice(0, q.given) : [];
      setEntered(enteredRef.current);
      setPhase('asking');
      later(() => void play(q.plan, 'question', null, 'question'), AUTO_PLAY_MS);
    },
    [later, play, save],
  );

  /** Start a round (from the intro, or "again" from the summary). */
  const start = useCallback(() => {
    clearTimers();
    stopSound();
    const record = readRecord(getProgress().skills[recordSkillId(drill, level)]?.data);
    const r = createRound(drill, level, { seed: freshSeed(), settings: settingsRef.current, record });
    startedAt.current = Date.now();
    setOutcome(null);
    ask(r);
  }, [drill, level, ask, clearTimers, stopSound]);

  const finish = useCallback(
    (r: Round, completed: boolean) => {
      const score = scoreRound(r);
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      let streak = 0;
      let bestStreak = 0;
      for (const a of r.answers) {
        streak = a.correct ? streak + 1 : 0;
        bestStreak = Math.max(bestStreak, streak);
      }
      remove(RESUME_KEY);
      // A catalog progression is a round of its own: no level of the drill opens with it.
      const special = level.special;
      const before = special ? [] : levelStatuses(drill, getProgress().skills);
      setSkillData(recordSkillId(drill, level), r.record as unknown as JsonValue);
      let activity: ActivityResult | null = null;
      if (completed || score.answered >= 3) {
        activity = recordActivity({
          kind: 'ear',
          id: special?.skillId ?? levelSkillId(drill.id, level.n),
          title: `${drill.title}: ${level.title}`.slice(0, 80),
          accuracy: score.accuracy,
          ...(completed ? { stars: score.stars } : {}),
          mistakes: score.mistakes,
          perfect: completed && score.perfect,
          combo: bestStreak,
          count: score.answered,
          durationSec,
          completed,
          route: 'ear',
          params: special?.params ?? [drill.id, String(level.n)],
          progress: completed ? 1 : score.answered / score.total,
          meta: { level: level.n, questions: score.answered },
        });
      }
      const after = special ? [] : levelStatuses(drill, getProgress().skills);
      // Name the level right after this one when it opened; a pass that skipped ahead opens several.
      const opened = after.filter((s, i) => s.unlocked && !before[i].unlocked && s.n !== level.n).map((s) => s.n);
      const unlocked = opened.includes(level.n + 1) ? level.n + 1 : opened.length ? Math.max(...opened) : null;
      // Only a confusion heard more than once is a weak spot ("you often hear…"); single misses are listed as answers.
      return { score, activity, unlocked, weak: weakSpots(drill, r.record, { pool: level.pool, limit: 3 }), durationSec, bestStreak };
    },
    [drill, level],
  );

  const next = useCallback(() => {
    const r = roundRef.current;
    if (!r || phaseRef.current !== 'answered') return;
    clearTimers();
    stopSound();
    if (roundDone(r)) {
      const result = finish(r, true);
      setOutcome(result);
      setPhase('summary');
      earDebug.question = null;
      earDebug.finished++;
      if (result.score.stars >= 2) playUi('lessonComplete');
      return;
    }
    ask(r);
  }, [ask, clearTimers, finish, stopSound]);

  /** Play the learner's choice, then the right answer, back to back. */
  const compare = useCallback(async () => {
    const r = roundRef.current;
    const q = r?.questions[r.questions.length - 1];
    const a = r?.answers[r.answers.length - 1];
    if (!q || !a || a.correct) return;
    clearTimers();
    if (q.kind === 'choice') {
      const chosen = q.options.find((o) => o.id === a.chosen);
      const right = q.options.find((o) => o.id === q.answer);
      if (chosen && !(await play(chosen.plan, 'chosen', chosen.id, `compare:chosen:${chosen.id}`))) return;
      await new Promise((res) => window.setTimeout(res, 350));
      if (phaseRef.current !== 'answered') return;
      if (right) await play(right.plan, 'answer', right.id, `compare:answer:${right.id}`);
    } else {
      const ids = (a.chosen as string[]).filter((id) => q.keys.some((k) => k.id === id));
      if (!(await play(sequencePlan(q.keys, ids, q.noteGap, q.tone), 'chosen', null, 'compare:chosen'))) return;
      await new Promise((res) => window.setTimeout(res, 350));
      if (phaseRef.current !== 'answered') return;
      await play(q.plan, 'answer', null, 'compare:answer');
    }
  }, [clearTimers, play]);

  /** Play one side of the comparison again. */
  const hear = useCallback(
    (which: 'chosen' | 'answer') => {
      const r = roundRef.current;
      const q = r?.questions[r.questions.length - 1];
      const a = r?.answers[r.answers.length - 1];
      if (!q || !a) return;
      clearTimers();
      if (q.kind === 'choice') {
        const o = q.options.find((x) => x.id === (which === 'chosen' ? a.chosen : q.answer));
        if (o) void play(o.plan, which, o.id, `compare:${which}:${o.id}`);
      } else {
        const ids = which === 'chosen' ? (a.chosen as string[]).filter((id) => q.keys.some((k) => k.id === id)) : q.target;
        void play(sequencePlan(q.keys, ids, q.noteGap, q.tone), which, null, `compare:${which}`);
      }
    },
    [clearTimers, play],
  );

  const submit = useCallback(
    (chosen: string | string[]) => {
      const r = roundRef.current;
      if (!r || phaseRef.current !== 'asking') return;
      clearTimers();
      stopSound();
      const res = answerQuestion(r, chosen);
      roundRef.current = res.round;
      save(res.round);
      setRound(res.round);
      setFeedback({ correct: res.correct, chosen });
      setPhase('answered');
      phaseRef.current = 'answered';
      if (res.correct) {
        playUi('correct');
        later(() => next(), AUTO_NEXT_MS);
      } else {
        playUi('wrong');
        later(() => void compare(), 450);
      }
    },
    [clearTimers, stopSound, later, next, compare, save],
  );

  /** Melody: a key of the note row was tapped (plays it unless `sound` is false) or heard; fills the next slot. */
  const tapKey = useCallback(
    (id: string, sound = true) => {
      const q = question;
      if (!q || q.kind !== 'sequence' || phaseRef.current !== 'asking') return;
      const key = q.keys.find((k) => k.id === id);
      if (key && sound) void play({ events: [{ at: 0, midis: [key.midi], dur: 0.9, strike: 'pluck', role: 'subject', ...(q.tone ? { tone: q.tone } : {}) }], length: 0.6 }, 'note', null, `key:${id}`);
      const prev = enteredRef.current;
      if (prev.length >= q.target.length) return;
      const nextEntered = [...prev, id];
      enteredRef.current = nextEntered;
      setEntered(nextEntered);
      if (nextEntered.length === q.target.length) later(() => submit(nextEntered), 380);
    },
    [question, play, later, submit],
  );

  const undo = useCallback(() => {
    const q = question;
    if (!q || q.kind !== 'sequence' || phaseRef.current !== 'asking') return;
    const prev = enteredRef.current;
    if (prev.length <= q.given) return;
    enteredRef.current = prev.slice(0, -1);
    setEntered(enteredRef.current);
  }, [question]);

  /** Leave mid-round: what was answered still counts (half XP, no stars), and confusions are kept. */
  const abandonRef = useRef<() => void>(() => undefined);
  abandonRef.current = () => {
    const r = roundRef.current;
    if (!r || phaseRef.current === 'summary' || phaseRef.current === 'intro') return;
    // Left on purpose: nothing to pick up later.
    remove(RESUME_KEY);
    if (r.answers.length === 0) return;
    finish(r, false);
    roundRef.current = null;
  };

  /**
   * Leave the round on purpose (the X, Escape): it ends as left early, and the screen goes back to
   * the level's start. The screen may not unmount at once (the shell keeps it, hidden, while the
   * next screen loads), and coming straight back must find a start, not a round with nothing behind it.
   */
  const end = useCallback(() => {
    abandonRef.current();
    clearTimers();
    stopSound();
    roundRef.current = null;
    setRound(null);
    setQuestion(null);
    setFeedback(null);
    enteredRef.current = [];
    setEntered([]);
    setPhase('intro');
    earDebug.question = null;
  }, [clearTimers, stopSound]);

  // Leaving the screen ends the round. The decision waits a tick: a screen that is mounted again at
  // once (React's development double mount, which a resumed round meets on its very first render)
  // is not leaving.
  const mounted = useRef(false);
  const leaving = useRef<number | null>(null);
  useEffect(() => {
    mounted.current = true;
    if (leaving.current !== null) window.clearTimeout(leaving.current);
    leaving.current = null;
    return () => {
      mounted.current = false;
      clearTimers();
      playerRef.current?.dispose();
      playerRef.current = null;
      leaving.current = window.setTimeout(() => {
        leaving.current = null;
        if (mounted.current) return;
        abandonRef.current();
        earDebug.question = null;
      }, 0);
    };
  }, [clearTimers]);

  // A reload (or a closed tab) keeps the round to pick up where it was: the round is saved after
  // every question and answer, and what it taught the picker is kept now. A page kept for "back"
  // may still go on.
  useEffect(() => {
    const onHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      const r = roundRef.current;
      if (!r || phaseRef.current === 'summary' || phaseRef.current === 'intro') return;
      save(r);
      setSkillData(recordSkillId(drill, level), r.record as unknown as JsonValue);
      getProgressStore().flush();
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [drill, level, save]);

  // The browser check reads the question on screen (a resumed one too).
  useEffect(() => {
    if (question) earDebug.question = question;
  }, [question]);

  const marks = useMemo(() => (question?.kind === 'sequence' && feedback ? sequenceMarks(question, feedback.chosen as string[]) : null), [question, feedback]);

  return {
    phase,
    /** The round on screen was picked up after a reload (its sound waits for a tap). */
    resumed: resumed !== null,
    round,
    question,
    feedback,
    playing,
    playingOption,
    entered,
    marks,
    outcome,
    silent,
    start,
    replay,
    submit,
    next,
    hear,
    tapKey,
    undo,
    stopSound,
    /** Play any plan from the intro ("hear each one"). */
    preview: (plan: SoundPlan, option: string) => void play(plan, 'example', option, `example:${option}`),
    end,
  };
}

/** What the hook returns. */
export type EarRoundApi = ReturnType<typeof useEarRound>;
