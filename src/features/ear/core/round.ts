/**
 * A round: about ten questions of one level, picked adaptively one at a time, then scored.
 * Pure state in, state out, so the screen and the tests drive exactly the same logic.
 */
import { difficultyFor, pickAnswer, recentSuccess, recordAnswer, type EarRecord } from './adapt';
import { makeRng, mixSeed } from './rng';
import type { DrillDef, EarSettings, LevelDef, Question, SequenceQuestion } from './types';

/** Accuracy that passes a level and unlocks the next. */
export const PASS_ACCURACY = 0.8;

/** Stars for a round: 60 % one, 80 % two, 90 % three. */
export function starsFor(accuracy: number): 0 | 1 | 2 | 3 {
  if (accuracy >= 0.9) return 3;
  if (accuracy >= PASS_ACCURACY) return 2;
  if (accuracy >= 0.6) return 1;
  return 0;
}

/** One answered question. */
export interface Answered {
  question: Question;
  /** The option id, or the row-key ids entered for a melody. */
  chosen: string | string[];
  correct: boolean;
}

/** A round in progress. */
export interface Round {
  drill: DrillDef;
  level: LevelDef;
  seed: number;
  settings: EarSettings;
  /** The confusion record as it was when the round began. */
  startRecord: EarRecord;
  /** The record with this round's answers folded in. */
  record: EarRecord;
  questions: Question[];
  answers: Answered[];
  total: number;
}

/** Start a round. Nothing is generated until {@link nextQuestion}. */
export function createRound(drill: DrillDef, level: LevelDef, opts: { seed: number; settings: EarSettings; record: EarRecord; total?: number }): Round {
  return { drill, level, seed: opts.seed >>> 0, settings: opts.settings, startRecord: opts.record, record: opts.record, questions: [], answers: [], total: opts.total ?? level.questions };
}

/** The answer ids a question was about, for the picker's "not three times running". */
function asked(q: Question): string {
  return q.kind === 'choice' ? q.answer : q.target.slice(q.given).join(' ');
}

/** Generate the next question from everything known so far. Returns the round with it appended. */
export function nextQuestion(round: Round, settings: EarSettings = round.settings): { round: Round; question: Question } {
  const index = round.questions.length;
  const seed = mixSeed(round.seed, round.drill.id, round.level.n, index);
  const rng = makeRng(seed);
  const success = recentSuccess(round.record);
  const answer = pickAnswer(rng, round.level.pool, round.record, success, round.questions.map(asked));
  const question = round.level.make({ rng, answer, settings, difficulty: difficultyFor(success), index, seed });
  return { round: { ...round, settings, questions: [...round.questions, question] }, question };
}

/** Per note of a melody: was it right? The given notes count as right. */
export function sequenceMarks(q: SequenceQuestion, entered: readonly string[]): boolean[] {
  return q.target.map((id, i) => i < q.given || entered[i] === id);
}

/** Answer the latest question. Returns the round and whether the answer was right. */
export function answerQuestion(round: Round, chosen: string | string[]): { round: Round; correct: boolean } {
  const question = round.questions[round.questions.length - 1];
  if (!question || round.answers.length >= round.questions.length) return { round, correct: false };
  let record = round.record;
  let correct: boolean;
  if (question.kind === 'choice') {
    const pick = Array.isArray(chosen) ? chosen[0] ?? '' : chosen;
    correct = pick === question.answer;
    record = recordAnswer(record, question.answer, pick);
  } else {
    const entered = Array.isArray(chosen) ? chosen : [chosen];
    const marks = sequenceMarks(question, entered);
    correct = marks.every(Boolean);
    // Each note the learner had to find is one answer in the record.
    for (let i = question.given; i < question.target.length; i++) record = recordAnswer(record, question.target[i], entered[i] ?? '?');
  }
  return { round: { ...round, record, answers: [...round.answers, { question, chosen, correct }] }, correct };
}

/** True once every question of the round has been answered. */
export function roundDone(round: Round): boolean {
  return round.answers.length >= round.total;
}

/** The score of a round (or of the part played so far). */
export interface RoundScore {
  correct: number;
  answered: number;
  total: number;
  accuracy: number;
  stars: 0 | 1 | 2 | 3;
  passed: boolean;
  perfect: boolean;
  mistakes: number;
}

/** Score the answers so far. */
export function scoreRound(round: Round): RoundScore {
  const answered = round.answers.length;
  const correct = round.answers.filter((a) => a.correct).length;
  const accuracy = answered ? correct / answered : 0;
  const finished = answered >= round.total;
  return {
    correct,
    answered,
    total: round.total,
    accuracy,
    stars: finished ? starsFor(accuracy) : 0,
    passed: finished && accuracy >= PASS_ACCURACY,
    perfect: finished && correct === answered,
    mistakes: answered - correct,
  };
}
