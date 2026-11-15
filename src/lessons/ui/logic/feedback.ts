/**
 * The words of the feedback panel: a short verdict, one line about THIS answer (kind and
 * specific: "You found 2 of the 4"), the right answer when it was missed, and why it is right.
 * Built from the grader's typed feedback, so every exercise type speaks the same way.
 */
import { midiToNote } from '@/core/theory';
import { optionLabel } from '../../grade';
import type { SessionFeedback } from '../../session';
import type { AnswerSpec, Exercise, FeedbackDetail, GradeResult, RichText } from '../../types';

/** What the panel says. Text fields are rich-text markup. */
export interface FeedbackCopy {
  /** `ok` right, `bad` wrong, `info` skipped ("here is the answer"). */
  tone: 'ok' | 'bad' | 'info';
  /** The verdict: "Right.", "Not quite.", "Here is the answer." */
  title: string;
  /** One line about this answer, or null. */
  note: RichText | null;
  /** The right answer (markup), shown when it was missed; null when right. */
  answer: string | null;
  /** Why the right answer is right. */
  explain: RichText | null;
  /** A heart was used for this answer. */
  heartLost: boolean;
  /** The question will come back later in the session. */
  willRetry: boolean;
}

const RIGHT_WORDS = ['Right.', 'Exactly.', 'Correct.', 'That is it.', 'Spot on.', 'Yes.'];

/** A verdict word for a right answer, varied by a seed so it does not repeat mechanically. */
export function rightWord(seed: number): string {
  return RIGHT_WORDS[Math.abs(Math.floor(seed)) % RIGHT_WORDS.length];
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Markup for a canonical value of a typed answer (`F#` -> `{n:F#}`). */
export function valueMarkup(kind: AnswerSpec['kind'] | 'note', value: string): string {
  if (!value) return value;
  switch (kind) {
    case 'note':
      return `{n:${value}}`;
    case 'interval':
      return `{i:${value}}`;
    case 'chord':
      return `{c:${value}}`;
    case 'degree':
      return `{d:${value}}`;
    case 'roman':
      return `{r:${value}}`;
    default:
      return value.replace(/[{}*_\\]/g, (c) => `\\${c}`);
  }
}

function noteOf(midi: number): string {
  return `{n:${midiToNote(midi)}}`;
}

/** The kind of value a text-graded exercise compares, for marking up what the learner gave. */
function givenKind(exercise: Exercise): AnswerSpec['kind'] {
  if (exercise.type === 'type-answer') return exercise.answer.kind;
  if (exercise.type === 'fretboard-name') return exercise.ask === 'note' ? 'note' : exercise.ask;
  return 'note';
}

/**
 * One kind, specific line about a wrong answer, from the grader's detail. The grader's own `note`
 * (enharmonic spellings, octaves, the chord a shape really makes) always wins.
 */
export function wrongLine(exercise: Exercise, result: GradeResult): RichText | null {
  if (result.feedback.note) return result.feedback.note;
  const d: FeedbackDetail = result.feedback.detail;
  switch (d.type) {
    case 'choice':
    case 'listen-choice': {
      if (d.why.length > 0) return d.why[0].text;
      if (result.near === 'incomplete') return `You found ${d.selected.length} of the ${d.correct.length}: there are more.`;
      if (result.near === 'extra') return 'You have them all, plus one that does not belong.';
      if ((exercise.type === 'choice' || exercise.type === 'listen-choice') && d.selected.length > 0) {
        const picked = d.selected.map((i) => optionLabel(exercise.options[i], i)).join(', ');
        return exercise.type === 'listen-choice' ? `You picked ${picked}. Listen again and compare.` : `You picked ${picked}.`;
      }
      return null;
    }
    case 'match-pairs': {
      const total = d.solution.length;
      return `${d.right.length} of ${total} pairs ${d.right.length === 1 ? 'was' : 'were'} right.`;
    }
    case 'order': {
      const total = d.solution.length;
      const right = Math.max(0, total - d.wrongAt.filter((i) => i < total).length);
      return right === 0 ? 'None of the tiles were in the right place yet.' : `${count(right, 'tile')} of ${total} were in the right place.`;
    }
    case 'fill-blanks': {
      const right = d.ok.filter(Boolean).length;
      return `${right} of ${count(d.ok.length, 'blank')} ${right === 1 ? 'was' : 'were'} right.`;
    }
    case 'type-answer':
    case 'fretboard-name':
    case 'staff-read':
      if (d.verdict === 'invalid' || d.given === null) return 'That could not be read as an answer.';
      return `You answered ${valueMarkup(givenKind(exercise), d.given)}.`;
    case 'chord-build':
      if (d.task === 'missing-note') {
        if (d.given === null) return 'That could not be read as a note.';
        return `You picked {n:${d.given}}, which is not in {c:${exercise.type === 'chord-build' ? exercise.chord : ''}}.`;
      }
      if (d.problem === 'no string is played') return 'No string was played: put at least one finger down or leave strings open.';
      if (d.wrongStrings.length > 0) {
        const strings = [...d.wrongStrings].sort((a, b) => b - a);
        return `Check ${strings.length === 1 ? 'string' : 'strings'} ${strings.join(', ')}.`;
      }
      return result.near === 'incomplete' ? 'Close: the shape is missing a chord tone.' : null;
    case 'tap-rhythm': {
      const hits = d.onsets.filter((o) => o.verdict === 'hit').length;
      const early = d.onsets.filter((o) => o.verdict === 'early').length;
      const late = d.onsets.filter((o) => o.verdict === 'late').length;
      const missed = d.onsets.filter((o) => o.verdict === 'missed').length;
      const parts = [`${hits} of ${d.onsets.length} taps landed on time`];
      if (early > late && early > 0) parts.push('you were a little early: let the click lead');
      else if (late > early && late > 0) parts.push('you were a little late: tap as the click sounds');
      else if (missed > 0) parts.push(`${count(missed, 'note')} had no tap`);
      if (d.extra.length > 0 && missed === 0) parts.push(`and there ${d.extra.length === 1 ? 'was one extra tap' : `were ${d.extra.length} extra taps`}`);
      return `${parts.join('; ')}.`;
    }
    case 'fretboard-find': {
      if (d.wrong.length > 0) {
        const w = d.wrong[0];
        return `${w.fret === 0 ? `String ${w.string} open` : `String ${w.string}, fret ${w.fret}`} is {n:${w.note}}${d.targets.length > 1 ? `; you found ${d.hits.length} of ${d.targets.length}` : ''}.`;
      }
      if (d.targets.length > 1) return `You found ${d.hits.length} of ${d.targets.length}.`;
      return null;
    }
    case 'staff-place':
      return d.placed ? `You placed {n:${d.placed}}.` : 'Place a note on a line or a space first.';
    case 'play-note':
      if (d.played === null) return 'I did not hear a clear note.';
      return `I heard ${noteOf(d.played)}${result.near === 'octave' ? ': the right note, an octave away' : ''}.`;
    case 'play-chord': {
      const parts: string[] = [];
      if (d.missing.length > 0) parts.push(`missing ${d.missing.map((n) => `{n:${n}}`).join(', ')}`);
      if (d.extra.length > 0) parts.push(`extra ${d.extra.map((n) => `{n:${n}}`).join(', ')}`);
      if (parts.length === 0) return 'I could not make out the chord: strum all the strings it uses, slowly.';
      return `Close: ${parts.join('; ')}. Press each string firmly behind the fret.`;
    }
    case 'play-phrase':
      return d.played.length === 0 ? 'I did not hear the notes.' : `${d.correct} of ${d.expected.length} notes were right.`;
    default:
      return null;
  }
}

/** Everything the feedback panel shows for one answered (or skipped) step. */
export function feedbackCopy(exercise: Exercise, feedback: SessionFeedback, seed = 0): FeedbackCopy {
  const { result } = feedback;
  const explain = result.feedback.explain;
  if (feedback.skipped) {
    return { tone: 'info', title: 'Here is the answer.', note: null, answer: result.feedback.answer || null, explain, heartLost: false, willRetry: feedback.willRetry };
  }
  if (result.correct) {
    return { tone: 'ok', title: rightWord(seed), note: null, answer: null, explain, heartLost: false, willRetry: false };
  }
  return {
    tone: 'bad',
    title: 'Not quite.',
    note: wrongLine(exercise, result),
    answer: result.feedback.answer || null,
    explain,
    heartLost: feedback.heartLost,
    willRetry: feedback.willRetry,
  };
}
