import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeTone, playUi, pluck, unlockAudio } from '@/core/audio';
import { getProgress, markSkill, recordActivity, setSkillData, type ActivityResult } from '@/core/progress';
import { soundPrefs } from '@/core/settings';
import { explainFindMiss, explainNameMiss, fretWords, onLandmarkSentence, anchorSentence } from '../core/explain';
import { gradeName, gradePlayed, gradeTap, questionMidi, remaining, type Attempt } from '../core/grade';
import { midiAtPos, pcAt } from '../core/neck';
import { spell } from '../core/notes';
import { stringName } from '../core/path';
import { freshSeed } from '../core/rng';
import { finishQuestion, nextQuestion, roundDone, startRound, summarize, type RoundPlan, type RoundState, type RoundSummary } from '../core/round';
import { encodeStats, stringLearned } from '../core/stats';
import type { Pos, Question, QuestionResult } from '../core/types';
import { fretboardDebug } from './debug';
import type { Trainer } from './useTrainer';

/** Where a round is. */
export type Phase = 'intro' | 'asking' | 'answered' | 'summary';

/** What the feedback line says after a tap or an answer. */
export interface Feedback {
  tone: 'ok' | 'bad' | 'info';
  title: string;
  lines: string[];
}

/** The current question's progress, for drawing the board and the pad. */
export interface AttemptView {
  wrongTaps: Pos[];
  found: Pos[];
  /** The tap that ended the question. */
  tapped: Pos | null;
  /** The note the learner named (name questions). */
  namedPc: number | null;
  /** Where the named note really sits on that string (after a wrong name). */
  givenAt: Pos | null;
  /** Notes heard that were not the one asked (play questions). */
  heard: number[];
  /** The answer is shown (after a miss or "Show me"). */
  revealed: boolean;
  /** How the question ended (null while it is open). */
  right: boolean | null;
}

/** A finished round, for the summary. */
export interface RoundOutcome {
  summary: RoundSummary;
  activity: ActivityResult | null;
  /** Strings whose every note became learned in this round. */
  learned: number[];
  results: QuestionResult[];
  durationSec: number;
  /** The best sprint score before this round (sprints only). */
  bestBefore: number | null;
}

const EMPTY: AttemptView = { wrongTaps: [], found: [], tapped: null, namedPc: null, givenAt: null, heard: [], revealed: false, right: null };

/** Options of {@link useRound}. */
export interface RoundOptions {
  /** Route params that reopen this round (for "continue" and the log). */
  params: string[];
  /** Title for the log and the recents list. */
  title: string;
  /** "Play it": exact pitch or any octave. */
  playOctaves?: 'exact' | 'any';
}

function tone() {
  return normalizeTone(soundPrefs().guitarTone);
}

/** Pluck the note at a place, as the guitar would sound it. */
export function playAt(trainer: Trainer, p: Pos): void {
  pluck(midiAtPos(trainer.ctx, p), undefined, { tone: tone(), string: p.string, duration: 1.4, velocity: 0.75 });
}

/**
 * One round on screen: questions, answers, sounds, feedback, and the record of it in the progress
 * store when it ends (or when the learner leaves part-way).
 */
export function useRound(plan: RoundPlan, trainer: Trainer, opts: RoundOptions) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [question, setQuestion] = useState<Question | null>(null);
  const [attempt, setAttempt] = useState<AttemptView>(EMPTY);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);

  const state = useRef<RoundState | null>(null);
  const phaseRef = useRef<Phase>('intro');
  const questionRef = useRef<Question | null>(null);
  const attemptRef = useRef<AttemptView>(EMPTY);
  const shownAt = useRef(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseline = useRef(trainer.stats);
  const trainerRef = useRef(trainer);
  trainerRef.current = trainer;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const sprint = plan.seconds !== null;

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const setAttemptBoth = (a: AttemptView) => {
    attemptRef.current = a;
    setAttempt(a);
  };
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Write the round to the progress store. `completed: false` when the learner left part-way. */
  const persist = useCallback(
    (completed: boolean): RoundOutcome | null => {
      const s = state.current;
      if (!s || s.results.length === 0) return null;
      const t = trainerRef.current;
      const summary = summarize(s.results, s.plan.passAt);
      const durationSec = Math.max(1, Math.round((performance.now() - startedAt.current) / 1000));
      const strings = Array.from({ length: t.tuning.stringCount }, (_, i) => i + 1);
      const before = new Set(strings.filter((n) => stringLearned(baseline.current, n)));
      const best = getProgress().skills[s.plan.skillId]?.bestScore;
      setSkillData(t.mapId, encodeStats(s.stats));
      let activity: ActivityResult | null = null;
      if (completed || s.results.length >= 3) {
        activity = recordActivity({
          kind: 'fretboard',
          id: s.plan.skillId,
          title: optsRef.current.title,
          accuracy: summary.accuracy,
          stars: summary.stars as 0 | 1 | 2 | 3,
          count: summary.right,
          mistakes: summary.asked - summary.right,
          combo: summary.bestRun,
          score: sprint ? summary.right : Math.round(summary.accuracy * 100),
          durationSec,
          completed,
          route: 'fretboard',
          params: optsRef.current.params,
          progress: completed ? 1 : s.plan.length ? s.results.length / s.plan.length : 0.5,
          meta: { asked: summary.asked, right: summary.right, ...(summary.avgMs ? { avgMs: summary.avgMs } : {}) },
        });
      }
      const learned: number[] = [];
      const skills = getProgress().skills;
      for (const n of strings) {
        if (before.has(n) || !stringLearned(s.stats, n)) continue;
        learned.push(n);
        if (!skills[`fretboard:string-${n}`]?.completed) markSkill(`fretboard:string-${n}`, { completed: true });
      }
      baseline.current = s.stats;
      return { summary, activity, learned, results: s.results, durationSec, bestBefore: sprint && best ? best : null };
    },
    [sprint],
  );

  const finishRound = useCallback(() => {
    clearTimer();
    const out = persist(true);
    fretboardDebug.finished++;
    fretboardDebug.question = null;
    state.current = null;
    questionRef.current = null;
    setQuestion(null);
    setOutcome(out);
    setPhaseBoth('summary');
    if (out?.summary.passed) playUi('lessonComplete');
  }, [persist]);

  const ask = useCallback(() => {
    clearTimer();
    const s = state.current;
    if (!s) return;
    if (roundDone(s)) {
      finishRound();
      return;
    }
    const q = nextQuestion(s);
    if (!q) {
      finishRound();
      return;
    }
    questionRef.current = q;
    fretboardDebug.question = q;
    setQuestion(q);
    setAttemptBoth(EMPTY);
    setFeedback(null);
    shownAt.current = performance.now();
    setPhaseBoth('asking');
  }, [finishRound]);

  /** Close the current question and show what happened. */
  const close = useCallback(
    (a: Attempt, view: AttemptView, fb: Feedback) => {
      const s = state.current;
      const q = questionRef.current;
      if (!s || !q) return;
      const { state: nextState, result } = finishQuestion(s, q, a);
      state.current = nextState;
      fretboardDebug.results = nextState.results;
      setAttemptBoth(view);
      setFeedback(fb);
      setScore(nextState.results.filter((r) => r.right).length);
      setStreak((n) => (result.right ? n + 1 : 0));
      setPhaseBoth('answered');
      // Right answers move on by themselves; a miss waits for "Next" so the explanation can be read.
      if (result.right) timer.current = setTimeout(() => ask(), sprint ? 320 : 850);
      else if (sprint) timer.current = setTimeout(() => ask(), 1300);
    },
    [ask, sprint],
  );

  const start = useCallback(() => {
    void unlockAudio();
    clearTimer();
    baseline.current = trainerRef.current.stats;
    state.current = startRound(plan, trainerRef.current.ctx, trainerRef.current.stats, freshSeed());
    fretboardDebug.results = [];
    startedAt.current = performance.now();
    setOutcome(null);
    setStreak(0);
    setScore(0);
    ask();
  }, [plan, ask]);

  const elapsed = () => Math.round(performance.now() - shownAt.current);

  /** A note named on the pad or the keyboard. */
  const answerPc = useCallback(
    (pc: number) => {
      const q = questionRef.current;
      if (phaseRef.current !== 'asking' || !q || q.kind !== 'name') return;
      const t = trainerRef.current;
      const g = gradeName(q, pc, t.ctx, t.maxFret);
      const view: AttemptView = { ...attemptRef.current, namedPc: pc, givenAt: g.givenAt, right: g.right, revealed: !g.right };
      if (g.right) {
        pluck(q.midi, undefined, { tone: tone(), string: q.pos.string, duration: 1.2, velocity: 0.75 });
        close({ right: true, ms: elapsed(), wrongTaps: [], found: [] }, view, { tone: 'ok', title: `Right: ${t.fmt(q.name)}`, lines: [] });
      } else {
        playUi('wrong');
        setTimeout(() => pluck(q.midi, undefined, { tone: tone(), string: q.pos.string, duration: 1.2, velocity: 0.7 }), 260);
        close({ right: false, ms: null, wrongTaps: [], found: [] }, view, { tone: 'bad', title: `Not ${t.fmt(spell(pc, t.ctx.spelling === 'flats' ? 'flats' : 'sharps'))}`, lines: explainNameMiss(q, pc, g.givenAt, t.ctx, t.fmt) });
      }
    },
    [close],
  );

  /** A tap on the neck. */
  const tap = useCallback(
    (p: Pos) => {
      const q = questionRef.current;
      const t = trainerRef.current;
      if (phaseRef.current === 'answered' || phaseRef.current === 'summary') {
        // After a question the neck is an instrument again.
        playAt(t, p);
        return;
      }
      if (phaseRef.current !== 'asking' || !q || q.kind === 'name' || q.kind === 'play') return;
      const a = attemptRef.current;
      const g = gradeTap(q, p, t.ctx, a.found);
      const noteName = t.fmt(spell(pcAt(t.ctx, p), t.ctx.spelling === 'flats' ? 'flats' : 'sharps'));
      if (g === 'other-string') {
        setFeedback({ tone: 'info', title: `That is string ${p.string}`, lines: [`Tap on string ${'string' in q ? q.string : ''}, the one that is highlighted.`] });
        return;
      }
      if (q.kind === 'every') {
        if (g === 'again') return;
        if (g === 'found') {
          playAt(t, p);
          const found = [...a.found, p];
          const left = remaining(q, found).length;
          if (left === 0) {
            const right = a.wrongTaps.length === 0;
            close({ right, ms: right ? elapsed() : null, wrongTaps: a.wrongTaps, found }, { ...a, found, right }, { tone: right ? 'ok' : 'info', title: right ? `All ${found.length} found` : `All ${found.length} found, with ${a.wrongTaps.length} wrong ${a.wrongTaps.length === 1 ? 'tap' : 'taps'}`, lines: [] });
          } else {
            setAttemptBoth({ ...a, found });
            setFeedback({ tone: 'ok', title: `${found.length} found, ${left} to go`, lines: [] });
          }
          return;
        }
        playUi('wrong', { volume: 0.6 });
        setAttemptBoth({ ...a, wrongTaps: [...a.wrongTaps, p] });
        setFeedback({ tone: 'bad', title: `That one is ${noteName}`, lines: [`Keep looking for ${t.fmt(q.name)}.`] });
        return;
      }
      if (g === 'right') {
        playAt(t, p);
        close({ right: true, ms: elapsed(), wrongTaps: [], found: [], tapped: p }, { ...a, tapped: p, right: true }, { tone: 'ok', title: `Right: ${t.fmt(q.name)}, ${fretWords(p.fret)}`, lines: [] });
        return;
      }
      playUi('wrong');
      const target = q.kind === 'find-any' ? q.targets[0] : q.pos;
      if (target) setTimeout(() => playAt(t, target), 300);
      close({ right: false, ms: null, wrongTaps: q.kind === 'find-any' ? [p] : [], found: [], tapped: p }, { ...a, tapped: p, right: false, revealed: true, wrongTaps: [p] }, { tone: 'bad', title: `Not quite`, lines: explainFindMiss(q, p, t.ctx, t.fmt) });
    },
    [close],
  );

  /** "Show me" (or Space): reveal the answer; it counts as a miss and comes back later. */
  const giveUp = useCallback(() => {
    const q = questionRef.current;
    const t = trainerRef.current;
    if (phaseRef.current !== 'asking' || !q) return;
    const a = attemptRef.current;
    const at = q.kind === 'name' || q.kind === 'find' || q.kind === 'octave' || q.kind === 'play' ? q.pos : q.targets[0];
    if (at) setTimeout(() => playAt(t, at), 120);
    const lines: string[] = [];
    if (q.kind === 'name' || q.kind === 'find' || q.kind === 'play') {
      const how = onLandmarkSentence(q.pos) ?? anchorSentence(t.ctx, q.pos, q.name, t.fmt);
      if (how) lines.push(how);
    } else lines.push(...explainFindMiss(q, null, t.ctx, t.fmt));
    const title = q.kind === 'every' ? `Here are the rest of the ${t.fmt(q.name)}s` : `It is ${t.fmt(q.name)}${'pos' in q && q.kind !== 'name' ? `, ${fretWords(q.pos.fret)}` : ''}`;
    close({ right: false, ms: null, wrongTaps: a.wrongTaps, found: a.found, gaveUp: true }, { ...a, right: false, revealed: true }, { tone: 'info', title, lines });
  }, [close]);

  /** The microphone heard the note asked for (play questions). */
  const heardRight = useCallback(
    (midi: number) => {
      const q = questionRef.current;
      const t = trainerRef.current;
      if (phaseRef.current !== 'asking' || !q || q.kind !== 'play') return;
      if (!gradePlayed(q, midi, optsRef.current.playOctaves ?? 'exact')) return;
      const a = attemptRef.current;
      // One stray reading (a knock, a neighbouring string) is forgiven; two wrong notes are a miss.
      const right = a.heard.length <= 1;
      close({ right, ms: right ? elapsed() : null, wrongTaps: [], found: [] }, { ...a, right, tapped: q.pos }, { tone: right ? 'ok' : 'info', title: right ? `Heard it: ${t.fmt(q.name)}` : `Got there: ${t.fmt(q.name)}`, lines: right ? [] : ['It took a couple of tries, so it will come back once more.'] });
    },
    [close],
  );

  /** The microphone heard another note (play questions). */
  const heardWrong = useCallback((midi: number) => {
    const q = questionRef.current;
    const t = trainerRef.current;
    if (phaseRef.current !== 'asking' || !q || q.kind !== 'play') return;
    const a = attemptRef.current;
    setAttemptBoth({ ...a, heard: [...a.heard, midi] });
    const name = t.fmt(spell(midi % 12, t.ctx.spelling === 'flats' ? 'flats' : 'sharps'));
    setFeedback({ tone: 'bad', title: `That sounded like ${name}`, lines: [`Try ${t.fmt(q.name)} on ${stringName(t.ctx, q.string, t.fmt)} again.`] });
  }, []);

  const next = useCallback(() => {
    if (phaseRef.current === 'answered') ask();
  }, [ask]);

  /** The sprint clock ran out. */
  const timeUp = useCallback(() => {
    if (phaseRef.current === 'asking' || phaseRef.current === 'answered') finishRound();
  }, [finishRound]);

  /** Leave the round now (the "End" button): what was answered is kept. */
  const end = useCallback(() => {
    clearTimer();
    if (phaseRef.current === 'asking' || phaseRef.current === 'answered') persist(false);
    state.current = null;
    setPhaseBoth('intro');
  }, [persist]);

  // Leaving the screen part-way still keeps what was learned.
  useEffect(
    () => () => {
      clearTimer();
      if ((phaseRef.current === 'asking' || phaseRef.current === 'answered') && state.current) persist(false);
    },
    [persist],
  );

  const s = state.current;
  return {
    phase,
    question,
    attempt,
    feedback,
    outcome,
    streak,
    score,
    index: s ? s.results.length : 0,
    total: plan.length,
    start,
    answerPc,
    tap,
    giveUp,
    next,
    heardRight,
    heardWrong,
    timeUp,
    end,
    /** The sounding pitch of the current question (for "Hear it"). */
    questionMidi: question ? questionMidi(question, trainer.ctx) : null,
  };
}

/** The round API the screens use. */
export type RoundApi = ReturnType<typeof useRound>;
