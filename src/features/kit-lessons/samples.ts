/**
 * Sample answers for the lesson gallery: one right and one wrong answer for every exercise type,
 * so each renderer can be shown fresh, answered right and answered wrong.
 */
import {
  findTargets, phraseMidi, playNoteTarget, referenceFrets, solve, staffPlaceTarget, tapTargets, wrongAnswers, type Answer, type Exercise,
} from '@/lessons';

/** A right answer. */
export function rightAnswer(exercise: Exercise): Answer {
  return solve(exercise);
}

/** A plausible wrong answer (the exercise's own distractors where it has them). */
export function wrongAnswer(exercise: Exercise): Answer {
  // The engine's own wrong answers may use one tile twice, which taps cannot do: swap two instead.
  const tiles = exercise.type === 'match-pairs' || exercise.type === 'order' || exercise.type === 'fill-blanks';
  const own = tiles ? undefined : wrongAnswers(exercise)[0];
  if (own) return own;
  switch (exercise.type) {
    case 'match-pairs': {
      const n = exercise.pairs.length;
      return { type: 'match-pairs', pairs: exercise.pairs.map((_p, i) => [i, i < 2 ? 1 - i : i] as [number, number]).slice(0, n) };
    }
    case 'order':
      return { type: 'order', order: exercise.tiles.map((_t, i) => i).reverse() };
    case 'fill-blanks':
      return { type: 'fill-blanks', blanks: exercise.blanks.length > 1 ? [...exercise.blanks].reverse() : [exercise.bank?.[0] ?? exercise.blanks[0]] };
    case 'type-answer': {
      const spec = exercise.answer;
      if (spec.kind === 'number') return { type: 'type-answer', text: String(spec.value + 1) };
      if (spec.kind === 'note') return { type: 'type-answer', text: spec.value.startsWith('C') ? 'D' : 'C' };
      if (spec.kind === 'interval') return { type: 'type-answer', text: spec.value === 'M3' ? 'm3' : 'M3' };
      return { type: 'type-answer', text: 'something else' };
    }
    case 'tap-rhythm':
      return { type: 'tap-rhythm', taps: tapTargets(exercise).map((t, i) => t + (i % 2 ? 0.28 : -0.05)).slice(0, -1) };
    case 'fretboard-find': {
      const targets = new Set(findTargets(exercise).map((p) => `${p.string}:${p.fret}`));
      for (let fret = exercise.frets[0]; fret <= exercise.frets[1]; fret++) {
        for (let string = 1; string <= 6; string++) if (!targets.has(`${string}:${fret}`)) return { type: 'fretboard-find', positions: [{ string, fret }] };
      }
      return { type: 'fretboard-find', positions: [] };
    }
    case 'chord-build': {
      const ref = referenceFrets(exercise) ?? [0, 0, 0, 0, 0, 0];
      return { type: 'chord-build', frets: ref.map((f, i) => (i === ref.length - 2 && f !== null ? f + 1 : f)) };
    }
    case 'staff-place': {
      const target = staffPlaceTarget(exercise);
      return { type: 'staff-place', position: (target?.position ?? 4) + 1, accidental: null };
    }
    case 'play-note':
      return { type: 'play-note', midi: (playNoteTarget(exercise) ?? 60) + 2 };
    case 'play-chord':
      return { type: 'play-chord', matched: false, score: 0.35, missing: [11], extra: [] };
    case 'play-phrase':
      return { type: 'play-phrase', played: phraseMidi(exercise).slice(0, 1) };
    case 'flashcard':
      return { type: 'flashcard', rating: 'again' };
    default:
      return solve(exercise);
  }
}
