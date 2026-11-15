/**
 * Graders: `grade(exercise, answer)` says whether an answer is right, how close it was, and what
 * the right answer is and why. Pure functions; every musical fact (the notes of a chord, the pitch
 * of a fret, the position of a note on the staff) is computed by the theory and guitar engines.
 *
 * Also here: `solve` (a correct answer for any exercise), `wrongAnswers` (the wrong answers its
 * distractors offer) and `presentExercise` (the shuffled display order of options and tiles).
 * Validation and the generator tests use the first two to prove that every exercise accepts its
 * answer and rejects every distractor.
 */
import {
  identifyFretted, midiAt, parseFrets, positionsForMidi, positionsForPitchClass, spellMidi, tuning as resolveTuning, voicingProblem,
} from '@/core/guitar';
import { compareNotes } from '@/core/pitch';
import {
  chordNotes, chordPcs, enharmonics, getKey, getScale, interval, noteAtStaffPosition, noteName, parseChord, parseNote, scalePcs,
  semitonesToDegree, semitonesToInterval, spellInKey, staffPosition, transpose, type NoteNaming,
} from '@/core/theory';
import { checkText, compareNoteNames, normalizeNote, specMarkup, specValue, type TextCheck } from './answers';
import { keyAlteration, positionProblem, shownAccidental, voicingFor } from './figures';
import { parseRhythm, tickSeconds } from './rhythm';
import { createRng, shuffleAway } from './rng';
import { plainText, textKey } from './text';
import type {
  Answer, AnswerSpec, ChoiceExercise, ChoiceOption, ChordBuildExercise, CourseLevel, Exercise, FeedbackDetail,
  FillBlanksExercise, FretboardFindExercise, FretboardNameExercise, GradeResult, ListenChoiceExercise, MatchPairsExercise,
  NamedPosition, NearMiss, NeckPosition, OrderExercise, PlayChordExercise, PlayNoteExercise, PlayPhraseExercise, RichText,
  StaffAccidental, StaffPlaceExercise, StaffReadExercise, TapRhythmExercise, TapVerdict, TypeAnswerExercise,
} from './types';

// ── Shared ─────────────────────────────────────────────────────────────────────────────────────

/** What a grader may need to know about the learner and the course. */
export interface GradeContext {
  /** Course level: sets the timing tolerance of tapped rhythms. Default `beginner`. */
  level?: CourseLevel;
  /** The learner's note-naming system, so typed answers such as "H" or "Do" are understood. */
  naming?: NoteNaming;
}

/** The markup text of a rich text. */
function markup(text: RichText | undefined): string {
  return text === undefined ? '' : typeof text === 'string' ? text : text.text;
}

/** The prompt of any exercise (true/false has a default one, a flashcard shows its front). */
export function promptOf(exercise: Exercise): RichText {
  if (exercise.type === 'flashcard') return exercise.front;
  if (exercise.type === 'true-false') return exercise.prompt ?? 'True or false?';
  return exercise.prompt;
}

/** The explanation of any exercise (a flashcard's back is its explanation). */
export function explainOf(exercise: Exercise): RichText | null {
  return exercise.type === 'flashcard' ? null : exercise.explain;
}

function result(exercise: Exercise, correct: boolean, score: number, answer: string, detail: FeedbackDetail, extra: { near?: NearMiss; note?: string } = {}): GradeResult {
  const out: GradeResult = {
    correct,
    score: correct ? 1 : Math.min(0.99, Math.max(0, score)),
    feedback: { answer, explain: explainOf(exercise), detail },
  };
  if (!correct && extra.near) out.near = extra.near;
  if (extra.note) out.feedback.note = extra.note;
  return out;
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

const posKey = (p: NeckPosition): string => `${p.string}:${p.fret}`;

function neckOpts(exercise: { tuning?: string; capo?: number }): { tuning?: string; capo?: number } {
  return { tuning: exercise.tuning, capo: exercise.capo };
}

function stringCountOf(tuningId: string | undefined): number {
  try {
    return resolveTuning(tuningId).stringCount;
  } catch {
    return 6;
  }
}

// ── Choice, listen-choice, true/false ──────────────────────────────────────────────────────────

/** Display label of an option as markup ("Option 2" for a figure without text). */
export function optionLabel(option: ChoiceOption, index: number): string {
  return markup(option.text) || `Option ${index + 1}`;
}

/** Indexes of the correct options. */
export function correctOptions(exercise: ChoiceExercise | ListenChoiceExercise): number[] {
  return exercise.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
}

function gradeChoice(exercise: ChoiceExercise | ListenChoiceExercise, selectedRaw: readonly number[]): GradeResult {
  const correct = correctOptions(exercise);
  const selected = [...new Set(selectedRaw)].filter((i) => Number.isInteger(i) && i >= 0 && i < exercise.options.length);
  const multiple = exercise.type === 'choice' && exercise.multiple === true;
  const hits = selected.filter((i) => correct.includes(i)).length;
  const falses = selected.length - hits;
  const ok = multiple ? sameSet(selected, correct) : selected.length === 1 && correct.includes(selected[0]);
  const score = multiple ? (hits - falses) / Math.max(1, correct.length) : 0;
  const why = selected
    .filter((i) => !correct.includes(i) && exercise.options[i].why !== undefined)
    .map((i) => ({ option: i, text: exercise.options[i].why as RichText }));
  const near: NearMiss | undefined = multiple && !ok && falses === 0 && hits > 0 ? 'incomplete' : multiple && !ok && hits === correct.length ? 'extra' : undefined;
  return result(exercise, ok, score, correct.map((i) => optionLabel(exercise.options[i], i)).join(', '), { type: exercise.type, correct, selected, why }, { near });
}

// ── Match pairs ────────────────────────────────────────────────────────────────────────────────

function gradeMatch(exercise: MatchPairsExercise, pairsRaw: ReadonlyArray<[number, number]>): GradeResult {
  const n = exercise.pairs.length;
  const rightKeys = exercise.pairs.map((p) => textKey(p.right));
  const solution: Array<[number, number]> = exercise.pairs.map((_p, i) => [i, i]);
  const right: Array<[number, number]> = [];
  const wrong: Array<[number, number]> = [];
  const solved = new Set<number>();
  for (const pair of pairsRaw) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const [l, r] = pair;
    if (!Number.isInteger(l) || !Number.isInteger(r) || l < 0 || r < 0 || l >= n || r >= n) continue;
    // Two right-hand tiles with the same words are interchangeable.
    if (rightKeys[l] === rightKeys[r]) {
      if (!solved.has(l)) right.push([l, r]);
      solved.add(l);
    } else {
      wrong.push([l, r]);
    }
  }
  const unmatched = solution.map(([l]) => l).filter((l) => !solved.has(l));
  const ok = unmatched.length === 0 && wrong.length === 0;
  const answer = exercise.pairs.map((p) => `${markup(p.left)} = ${markup(p.right)}`).join('\n');
  return result(exercise, ok, (right.length - wrong.length) / n, answer, { type: 'match-pairs', solution, right, wrong, unmatched }, { near: wrong.length === 0 && right.length > 0 ? 'incomplete' : undefined });
}

// ── Order ──────────────────────────────────────────────────────────────────────────────────────

/** All tiles of an order exercise as the answer indexes them: the tiles, then the distractors. */
export function orderTiles(exercise: OrderExercise): RichText[] {
  return [...exercise.tiles, ...(exercise.distractors ?? [])];
}

function gradeOrder(exercise: OrderExercise, orderRaw: readonly number[]): GradeResult {
  const all = orderTiles(exercise);
  const keys = all.map((t) => textKey(t));
  const n = exercise.tiles.length;
  const order = orderRaw.filter((i) => Number.isInteger(i) && i >= 0 && i < all.length);
  const wrongAt: number[] = [];
  // Tiles that read the same are the same tile (the two E strings), so compare what they say.
  for (let i = 0; i < Math.max(n, order.length); i++) {
    if (i >= n || i >= order.length || keys[order[i]] !== keys[i]) wrongAt.push(i);
  }
  const ok = wrongAt.length === 0 && order.length === n && new Set(order).size === order.length;
  const rightCount = Math.max(0, n - wrongAt.filter((i) => i < n).length);
  const solution = exercise.tiles.map((_t, i) => i);
  return result(exercise, ok, rightCount / n, exercise.tiles.map((t) => markup(t)).join('  '), { type: 'order', solution, wrongAt });
}

// ── Fill blanks ────────────────────────────────────────────────────────────────────────────────

/** The word bank of a fill-blanks exercise: the right words (repeated as often as needed) plus the distractors. */
export function fillBank(exercise: FillBlanksExercise): string[] {
  const used = new Set(exercise.blanks.map((b) => textKey(b)));
  const extra = (exercise.bank ?? []).filter((w) => !used.has(textKey(w)));
  const seen = new Set<string>();
  const distinctExtra = extra.filter((w) => (seen.has(textKey(w)) ? false : (seen.add(textKey(w)), true)));
  return [...exercise.blanks, ...distinctExtra];
}

function gradeFill(exercise: FillBlanksExercise, blanksRaw: ReadonlyArray<string | null>): GradeResult {
  const expected = exercise.blanks.map((b) => textKey(b));
  const given = expected.map((_e, i) => (typeof blanksRaw[i] === 'string' ? textKey(blanksRaw[i] as string) : ''));
  let ok: boolean[];
  if (exercise.unordered) {
    const pool = [...expected];
    ok = given.map((g) => {
      const at = pool.indexOf(g);
      if (at < 0) return false;
      pool.splice(at, 1);
      return true;
    });
  } else {
    ok = given.map((g, i) => g === expected[i]);
  }
  const right = ok.filter(Boolean).length;
  const all = right === expected.length && blanksRaw.length <= expected.length;
  return result(exercise, all, right / expected.length, exercise.blanks.join(', '), { type: 'fill-blanks', solution: [...exercise.blanks], ok }, { near: right > 0 && !all ? 'incomplete' : undefined });
}

// ── Typed answers ──────────────────────────────────────────────────────────────────────────────

function nearOf(check: TextCheck): NearMiss | undefined {
  return check.verdict === 'enharmonic' ? 'enharmonic' : check.caseOnly ? 'case' : undefined;
}

function textNote(check: TextCheck, spec: AnswerSpec): string | undefined {
  if (check.verdict === 'enharmonic') {
    return `Right pitch, different name: here it is spelled ${specMarkup(spec)}.`;
  }
  if (check.caseOnly) return 'Right number, but the case matters: capital numerals are major chords, small ones are minor.';
  if (check.verdict === 'invalid') return 'That could not be read as an answer.';
  return undefined;
}

function gradeTyped(exercise: TypeAnswerExercise, text: string, ctx: GradeContext): GradeResult {
  const check = checkText(text, exercise.answer, ctx.naming);
  return result(
    exercise,
    check.verdict === 'correct',
    0,
    specMarkup(exercise.answer),
    { type: 'type-answer', expected: specValue(exercise.answer), given: check.given, verdict: check.verdict },
    { near: nearOf(check), note: textNote(check, exercise.answer) },
  );
}

// ── Tap rhythm ─────────────────────────────────────────────────────────────────────────────────

/** How strictly tapped rhythms are graded per level: timing window either side, share of notes needed, stray taps forgiven. */
export const RHYTHM_GRADING: Readonly<Record<CourseLevel, { toleranceMs: number; pass: number; extraTaps: number }>> = {
  beginner: { toleranceMs: 150, pass: 0.8, extraTaps: 1 },
  intermediate: { toleranceMs: 100, pass: 0.9, extraTaps: 1 },
  expert: { toleranceMs: 65, pass: 1, extraTaps: 0 },
};

/** The largest constant delay (device and reaction latency) that is measured and removed, in ms. */
export const MAX_LATENCY_MS = 120;

/** When each note of a tap-rhythm exercise falls, in seconds from beat one. */
export function tapTargets(exercise: TapRhythmExercise): number[] {
  return parseRhythm(exercise.rhythm).onsets.map((tick) => tickSeconds(tick, exercise.tempo));
}

/** The timing window of a tap-rhythm exercise in ms: the level's tolerance, never more than 40 % of the shortest gap between notes. */
export function tapToleranceMs(exercise: TapRhythmExercise, ctx: GradeContext = {}): number {
  const level = exercise.level ?? ctx.level ?? 'beginner';
  const targets = tapTargets(exercise);
  let shortest = Infinity;
  for (let i = 1; i < targets.length; i++) shortest = Math.min(shortest, targets[i] - targets[i - 1]);
  const cap = Number.isFinite(shortest) ? shortest * 1000 * 0.4 : Infinity;
  return Math.round(Math.min(RHYTHM_GRADING[level].toleranceMs, cap));
}

function matchTaps(targets: readonly number[], taps: readonly number[], windowSec: number): Array<number | null> {
  const used = new Array<boolean>(taps.length).fill(false);
  return targets.map((t) => {
    let best = -1;
    for (let i = 0; i < taps.length; i++) {
      if (used[i]) continue;
      const d = Math.abs(taps[i] - t);
      if (d <= windowSec && (best < 0 || d < Math.abs(taps[best] - t))) best = i;
    }
    if (best < 0) return null;
    used[best] = true;
    return best;
  });
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function gradeTaps(exercise: TapRhythmExercise, tapsRaw: readonly number[], ctx: GradeContext): GradeResult {
  const level = exercise.level ?? ctx.level ?? 'beginner';
  const rule = RHYTHM_GRADING[level];
  const targets = tapTargets(exercise);
  const toleranceMs = tapToleranceMs(exercise, ctx);
  let taps = tapsRaw.filter((t) => typeof t === 'number' && Number.isFinite(t)).sort((a, b) => a - b);
  if (exercise.start === 'first-tap' && taps.length > 0 && targets.length > 0) {
    const shift = taps[0] - targets[0];
    taps = taps.map((t) => t - shift);
  }
  let shortest = Infinity;
  for (let i = 1; i < targets.length; i++) shortest = Math.min(shortest, targets[i] - targets[i - 1]);
  const window = Number.isFinite(shortest) ? shortest / 2 : 0.5;

  // Pass 1 finds the constant delay of this device and learner; pass 2 judges the rhythm without it.
  const rough = matchTaps(targets, taps, window);
  const roughErrors = rough.map((tap, i) => (tap === null ? null : taps[tap] - targets[i])).filter((e): e is number => e !== null);
  const offset = Math.min(MAX_LATENCY_MS / 1000, Math.max(-MAX_LATENCY_MS / 1000, median(roughErrors)));
  const shifted = taps.map((t) => t - offset);
  const matched = matchTaps(targets, shifted, window);

  const usedTaps = new Set<number>();
  const onsets: TapVerdict[] = targets.map((time, i) => {
    const tap = matched[i];
    if (tap === null) return { time, tap: null, errorMs: null, verdict: 'missed' };
    usedTaps.add(tap);
    const errorMs = Math.round((shifted[tap] - time) * 1000);
    const verdict = Math.abs(errorMs) <= toleranceMs ? 'hit' : errorMs < 0 ? 'early' : 'late';
    return { time, tap: taps[tap], errorMs, verdict };
  });
  const extra = taps.filter((_t, i) => !usedTaps.has(i));
  const hits = onsets.filter((o) => o.verdict === 'hit').length;
  const needed = Math.ceil(rule.pass * targets.length - 1e-9);
  const ok = targets.length > 0 && hits >= needed && extra.length <= rule.extraTaps;
  const score = targets.length === 0 ? 0 : hits / Math.max(targets.length, taps.length);
  const mistimed = onsets.some((o) => o.verdict === 'early' || o.verdict === 'late');
  const near: NearMiss | undefined = !ok && hits >= Math.ceil(targets.length / 2) ? (extra.length > rule.extraTaps && hits >= needed ? 'extra' : mistimed ? 'timing' : 'incomplete') : undefined;
  const answer = exercise.rhythm.pattern;
  return result(exercise, ok, score, answer, { type: 'tap-rhythm', onsets, extra, toleranceMs, offsetMs: Math.round(offset * 1000), needed, hits }, { near });
}

// ── Fretboard find ─────────────────────────────────────────────────────────────────────────────

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

/**
 * Names for a pitch and the note an interval above it, spelled as a pair: the interval decides
 * the letter (a third above D is F#, not Gb), and of the two names of a black-key root the one
 * that keeps the pair simple is used (G# and B rather than Ab and Cb).
 */
export function spellInterval(rootMidi: number, intervalName: string): { root: string; target: string } {
  const size = interval(intervalName).semitones;
  const plain = (midi: number): string => spellMidi(midi, undefined, { octave: false });
  const fallback = { root: plain(rootMidi), target: plain(rootMidi + size) };
  const roots = [fallback.root, ...enharmonics(fallback.root).filter((n) => Math.abs(parseNote(n)?.alt ?? 9) <= 1)];
  let best: { root: string; target: string } | null = null;
  let bestCost = Infinity;
  for (const root of roots) {
    const target = parseNote(transpose(root, intervalName));
    if (!target || Math.abs(target.alt) > 1) continue;
    // Cb, Fb, E# and B# are correct but needlessly hard to read.
    const alias = target.alt !== 0 && WHITE_PCS.has(target.chroma);
    const cost = (alias ? 10 : 0) + Math.abs(target.alt) + Math.abs(parseNote(root)!.alt) + (root === fallback.root ? 0 : 0.5);
    if (cost < bestCost) {
      bestCost = cost;
      best = { root, target: target.pcName };
    }
  }
  return best ?? fallback;
}

/** Every position that answers a fretboard-find exercise, with the note each one sounds. */
export function findTargets(exercise: FretboardFindExercise): NamedPosition[] {
  const opts = neckOpts(exercise);
  const range = { ...opts, minFret: exercise.frets[0], maxFret: exercise.frets[1] };
  const strings = exercise.strings;
  const inRegion = (p: NeckPosition): boolean => !strings || strings.includes(p.string);
  const named = (positions: readonly NeckPosition[], spell: (midi: number) => string): NamedPosition[] =>
    positions
      .filter(inRegion)
      .map((p) => {
        const midi = midiAt(p, opts);
        return { string: p.string, fret: p.fret, midi, note: spell(midi) };
      })
      .sort((a, b) => b.string - a.string || a.fret - b.fret);
  const byPcs = (pcs: readonly number[]): NeckPosition[] => pcs.flatMap((pc) => positionsForPitchClass(pc, range));
  const find = exercise.find;
  try {
    if ('note' in find) {
      const n = parseNote(find.note);
      if (!n) return [];
      const positions = exercise.octave === 'exact' ? (n.midi === null ? [] : positionsForMidi(n.midi, range)) : positionsForPitchClass(n.chroma, range);
      return named(positions, () => n.pcName);
    }
    if ('chord' in find) {
      return named(byPcs(chordPcs(find.chord)), (midi) => spellMidi(midi, { chord: find.chord }, { octave: false }));
    }
    if ('scale' in find) {
      return named(byPcs(scalePcs(find.tonic, find.scale)), (midi) => spellMidi(midi, { tonic: find.tonic, scale: find.scale }, { octave: false }));
    }
    const fromMidi = midiAt(find.from, opts);
    const size = interval(find.interval).semitones;
    const target = fromMidi + size;
    const spelled = spellInterval(fromMidi, find.interval).target;
    const positions = exercise.octave === 'exact' ? positionsForMidi(target, range) : positionsForPitchClass(((target % 12) + 12) % 12, range);
    return named(positions, () => spelled).filter((p) => !(p.string === find.from.string && p.fret === find.from.fret));
  } catch {
    return [];
  }
}

function describeFind(exercise: FretboardFindExercise, targets: readonly NamedPosition[]): string {
  const find = exercise.find;
  const what = 'note' in find ? `{n:${parseNote(find.note)?.pcName ?? find.note}}` : 'chord' in find ? `{c:${find.chord}}` : 'scale' in find ? `{n:${find.tonic}} ${getScale(find.scale)?.name.toLowerCase() ?? find.scale}` : targets[0] ? `{n:${targets[0].note}}` : '';
  const where = targets.slice(0, 6).map((t) => `string ${t.string}, fret ${t.fret}`).join('; ');
  return targets.length > 6 ? `${what}: ${targets.length} places` : `${what}: ${where}`;
}

function gradeFind(exercise: FretboardFindExercise, positionsRaw: readonly NeckPosition[]): GradeResult {
  const opts = neckOpts(exercise);
  const targets = findTargets(exercise);
  const targetKeys = new Set(targets.map(posKey));
  const targetPcs = new Set(targets.map((t) => t.midi % 12));
  const seen = new Set<string>();
  const given: NeckPosition[] = [];
  for (const p of positionsRaw) {
    if (!p || positionProblem(p, opts) || seen.has(posKey(p))) continue;
    seen.add(posKey(p));
    given.push({ string: p.string, fret: p.fret });
  }
  const hits = given.filter((p) => targetKeys.has(posKey(p)));
  const wrong: NamedPosition[] = given
    .filter((p) => !targetKeys.has(posKey(p)))
    .map((p) => {
      const midi = midiAt(p, opts);
      return { ...p, midi, note: spellMidi(midi, undefined, { octave: false }) };
    });
  const missed = exercise.mode === 'all' ? targets.filter((t) => !seen.has(posKey(t))).map((t) => ({ string: t.string, fret: t.fret })) : [];
  const ok = targets.length > 0 && wrong.length === 0 && (exercise.mode === 'all' ? missed.length === 0 : hits.length >= 1);
  const score = exercise.mode === 'all' ? (hits.length - wrong.length) / Math.max(1, targets.length) : 0;
  const octaveSlip = wrong.length > 0 && exercise.octave === 'exact' && wrong.every((w) => targetPcs.has(w.midi % 12));
  const near: NearMiss | undefined = ok ? undefined : octaveSlip ? 'octave' : wrong.length === 0 && hits.length > 0 ? 'incomplete' : undefined;
  const note = octaveSlip ? 'Right note name, but in a different octave: this one asks for the exact pitch.' : undefined;
  return result(exercise, ok, score, describeFind(exercise, targets), { type: 'fretboard-find', targets, hits, wrong, missed }, { near, note });
}

// ── Fretboard name ─────────────────────────────────────────────────────────────────────────────

/** The answer spec of a fretboard-name exercise, computed from the neck. Null when the exercise is malformed. */
export function fretboardNameSpec(exercise: FretboardNameExercise): AnswerSpec | null {
  const opts = neckOpts(exercise);
  try {
    if (positionProblem(exercise.position, opts)) return null;
    const midi = midiAt(exercise.position, opts);
    if (exercise.ask === 'note') {
      const key = exercise.key ? getKey(exercise.key) : null;
      const spelling = exercise.spelling === 'exact' && key ? 'exact' : 'any';
      let value = key ? spellInKey(midi % 12, key) : spellMidi(midi, undefined, { octave: false });
      // When the buttons already name the pitch one way (G# rather than Ab), the feedback uses that name.
      const offered = spelling === 'any' ? (exercise.options ?? []).map((o) => parseNote(o)).find((n) => n !== null && n.chroma === midi % 12) : undefined;
      if (offered) value = offered.pcName;
      return { kind: 'note', value, spelling };
    }
    if (!exercise.root || positionProblem(exercise.root, opts)) return null;
    const semis = midi - midiAt(exercise.root, opts);
    if (semis < 0 || semis > 12) return null;
    // A position fixes the size of an interval, not its spelling, so both names of a size are right.
    if (exercise.ask === 'interval') return { kind: 'interval', value: semitonesToInterval(semis), spelling: 'any' };
    return { kind: 'degree', value: semitonesToDegree(semis % 12), spelling: 'any' };
  } catch {
    return null;
  }
}

function gradeTextAgainst(exercise: Exercise, type: 'fretboard-name' | 'staff-read', spec: AnswerSpec | null, text: string, ctx: GradeContext): GradeResult {
  if (!spec) return result(exercise, false, 0, '', { type, expected: '', given: null, verdict: 'invalid' });
  const check = checkText(text, spec, ctx.naming);
  return result(exercise, check.verdict === 'correct', 0, specMarkup(spec), { type, expected: specValue(spec), given: check.given, verdict: check.verdict }, { near: nearOf(check), note: textNote(check, spec) });
}

// ── Chord build ────────────────────────────────────────────────────────────────────────────────

/** The reference shape of a chord-build (fingers) or play-chord exercise: frets low to high, or null when none exists. */
export function referenceFrets(exercise: ChordBuildExercise | PlayChordExercise): Array<number | null> | null {
  const voicing = voicingFor(exercise.chord, exercise.frets, 'tuning' in exercise ? neckOpts(exercise) : {});
  return voicing ? [...voicing.frets] : null;
}

/** The one chord tone a missing-note exercise leaves out, or null when it is not exactly one. */
export function missingChordNote(exercise: ChordBuildExercise): string | null {
  if (!parseChord(exercise.chord)) return null;
  const given = new Set((exercise.given ?? []).map((n) => parseNote(n)?.chroma));
  const missing = chordNotes(exercise.chord).filter((n) => !given.has(parseNote(n)?.chroma));
  return missing.length === 1 ? missing[0] : null;
}

function gradeChordBuild(exercise: ChordBuildExercise, answer: Extract<Answer, { type: 'chord-build' }>, ctx: GradeContext): GradeResult {
  if (exercise.task === 'missing-note') {
    const expected = missingChordNote(exercise);
    if (!expected) return result(exercise, false, 0, '', { type: 'chord-build', task: 'missing-note', expected: '', given: null, verdict: 'invalid' });
    const spec: AnswerSpec = { kind: 'note', value: expected, spelling: exercise.spelling ?? 'any' };
    const check = checkText(answer.text ?? '', spec, ctx.naming);
    return result(exercise, check.verdict === 'correct', 0, `{n:${expected}}`, { type: 'chord-build', task: 'missing-note', expected, given: check.given, verdict: check.verdict }, { near: nearOf(check), note: textNote(check, spec) });
  }
  const opts = neckOpts(exercise);
  const count = stringCountOf(exercise.tuning);
  const reference = referenceFrets(exercise);
  const frets: Array<number | null> = Array.from({ length: count }, (_u, i) => {
    const f = answer.frets?.[i];
    return typeof f === 'number' && Number.isInteger(f) && f >= 0 ? f : null;
  });
  const matchesReference = reference !== null && reference.every((f, i) => f === frets[i]);
  let problem: string | null = null;
  let built: string | null = null;
  try {
    problem = frets.every((f) => f === null) ? 'no string is played' : voicingProblem(exercise.chord, frets, opts);
    built = identifyFretted(frets, opts).symbol;
  } catch (error) {
    problem = error instanceof Error ? error.message : 'the shape cannot be played';
  }
  const ok = exercise.accept === 'this-shape' ? matchesReference : problem === null;
  const pcs = new Set(chordPcs(exercise.chord));
  const wrongStrings: number[] = [];
  frets.forEach((f, i) => {
    const string = count - i;
    const differs = reference ? reference[i] !== f : false;
    const outside = f !== null && !pcs.has(midiAt({ string, fret: f }, opts) % 12);
    if (exercise.accept === 'this-shape' ? differs : outside) wrongStrings.push(string);
  });
  const same = reference ? reference.filter((f, i) => f === frets[i]).length / count : 0;
  const near: NearMiss | undefined = !ok && wrongStrings.length === 0 && frets.some((f) => f !== null) ? 'incomplete' : undefined;
  const shape = reference ? reference.map((f) => (f === null ? 'x' : String(f))).join(reference.some((f) => f !== null && f > 9) ? '-' : '') : '';
  const note = !ok && built && parseChord(built)?.symbol !== parseChord(exercise.chord)?.symbol ? `That shape is {c:${built}}.` : undefined;
  return result(exercise, ok, same, `{c:${exercise.chord}}: ${shape}`, { type: 'chord-build', task: 'fingers', frets: reference ?? [], built, problem, wrongStrings }, { near, note });
}

// ── Staff ──────────────────────────────────────────────────────────────────────────────────────

/** The answer spec of a staff-read exercise: the note name as altered by the key signature. */
export function staffReadSpec(exercise: StaffReadExercise): AnswerSpec | null {
  const n = parseNote(exercise.note);
  return n ? { kind: 'note', value: n.pcName, spelling: 'exact' } : null;
}

/** Where a staff-place exercise expects the note: its staff position and the accidental to add (null = none). */
export function staffPlaceTarget(exercise: StaffPlaceExercise): { position: number; accidental: StaffAccidental | null } | null {
  const n = parseNote(exercise.note);
  if (!n) return null;
  const key = exercise.key ? getKey(exercise.key) : null;
  const accidental = shownAccidental(n.name, key);
  if (n.octave !== null) return { position: staffPosition(n.name, { clef: exercise.clef }).position, accidental };
  // Any octave: show the one nearest the middle line.
  let best = staffPosition(`${n.pcName}3`, { clef: exercise.clef }).position;
  for (let octave = 1; octave <= 6; octave++) {
    const p = staffPosition(`${n.pcName}${octave}`, { clef: exercise.clef }).position;
    if (Math.abs(p - 4) < Math.abs(best - 4)) best = p;
  }
  return { position: best, accidental };
}

/** Staff positions a note may be placed on: the staff plus four ledger lines either side. */
export const STAFF_PLACE_RANGE: readonly [number, number] = [-9, 17];

function gradeStaffPlace(exercise: StaffPlaceExercise, answer: Extract<Answer, { type: 'staff-place' }>): GradeResult {
  const target = parseNote(exercise.note);
  const expected = staffPlaceTarget(exercise);
  if (!target || !expected) return result(exercise, false, 0, '', { type: 'staff-place', position: 0, accidental: null, placed: null });
  const key = exercise.key ? getKey(exercise.key) : null;
  let placed: string | null = null;
  let ok = false;
  let near: NearMiss | undefined;
  if (Number.isFinite(answer.position) && answer.position >= STAFF_PLACE_RANGE[0] && answer.position <= STAFF_PLACE_RANGE[1]) {
    const natural = parseNote(noteAtStaffPosition(Math.round(answer.position), { clef: exercise.clef }));
    if (natural) {
      const alt = answer.accidental === 'sharp' ? 1 : answer.accidental === 'flat' ? -1 : answer.accidental === 'natural' ? 0 : keyAlteration(key, natural.letter);
      placed = noteName(natural.step, alt, natural.octave);
      const p = parseNote(placed)!;
      const sameName = p.step === target.step && p.alt === target.alt;
      const sameOctave = exercise.octave === 'any' || target.midi === null || p.midi === target.midi;
      ok = sameName && sameOctave;
      if (!ok && sameName) near = 'octave';
      else if (!ok && p.chroma === target.chroma && sameOctave) near = 'enharmonic';
    }
  }
  const note = near === 'octave' ? 'Right note name, but in a different octave.' : near === 'enharmonic' ? `Right pitch, different name: this one is written as {n:${target.pcName}}.` : undefined;
  return result(exercise, ok, 0, `{n:${target.pcName}}`, { type: 'staff-place', position: expected.position, accidental: expected.accidental, placed }, { near, note });
}

// ── Play ───────────────────────────────────────────────────────────────────────────────────────

/** Score from the chord matcher that counts as "yes, that chord". */
export const PLAY_CHORD_THRESHOLD = 0.6;

/** The MIDI note a play-note exercise asks for, or null when its note has no octave. */
export function playNoteTarget(exercise: PlayNoteExercise): number | null {
  return parseNote(exercise.note)?.midi ?? null;
}

/** The MIDI notes a play-phrase exercise asks for, in order. */
export function phraseMidi(exercise: PlayPhraseExercise): number[] {
  const out: number[] = [];
  for (const n of exercise.notes) {
    if ('rest' in n) continue;
    try {
      out.push(midiAt({ string: n.string, fret: n.fret }, neckOpts(exercise)));
    } catch {
      /* reported by validation */
    }
  }
  return out;
}

function gradePlayNote(exercise: PlayNoteExercise, answer: Extract<Answer, { type: 'play-note' }>): GradeResult {
  const target = playNoteTarget(exercise);
  const played = typeof answer.midi === 'number' && Number.isFinite(answer.midi) ? Math.round(answer.midi) : null;
  const samePc = target !== null && played !== null && (((played - target) % 12) + 12) % 12 === 0;
  const ok = target !== null && played !== null && (exercise.octave === 'any' ? samePc : played === target);
  const near: NearMiss | undefined = !ok && samePc ? 'octave' : undefined;
  const note = near === 'octave' ? 'Right note, but an octave away from the one asked for.' : undefined;
  return result(exercise, ok, 0, `{n:${parseNote(exercise.note)?.name ?? exercise.note}}`, { type: 'play-note', expected: target ?? 0, played, cents: answer.cents ?? null }, { near, note });
}

function gradePlayChord(exercise: PlayChordExercise, answer: Extract<Answer, { type: 'play-chord' }>): GradeResult {
  const score = Number.isFinite(answer.score) ? Math.min(1, Math.max(0, answer.score)) : 0;
  const ok = answer.matched === true && score >= PLAY_CHORD_THRESHOLD;
  const name = (pc: number): string => spellMidi(60 + ((pc % 12) + 12) % 12, { chord: exercise.chord }, { octave: false });
  const missing = (answer.missing ?? []).map(name);
  const extra = (answer.extra ?? []).map(name);
  const near: NearMiss | undefined = ok ? undefined : extra.length === 0 && missing.length > 0 ? 'incomplete' : extra.length > 0 && missing.length === 0 ? 'extra' : undefined;
  return result(exercise, ok, score, `{c:${exercise.chord}}`, { type: 'play-chord', chord: exercise.chord, missing, extra, score }, { near });
}

function gradePlayPhrase(exercise: PlayPhraseExercise, answer: Extract<Answer, { type: 'play-phrase' }>): GradeResult {
  const expected = phraseMidi(exercise);
  const played = (answer.played ?? []).filter((m) => typeof m === 'number' && Number.isFinite(m)).map((m) => Math.round(m));
  const comparison = compareNotes(played, expected, { octaves: exercise.octave });
  const pass = exercise.pass ?? 0.8;
  const ok = expected.length > 0 && comparison.accuracy >= pass - 1e-9;
  const near: NearMiss | undefined = !ok && comparison.accuracy >= 0.5 ? 'incomplete' : undefined;
  const answerText = expected.map((m) => `{n:${spellMidi(m, undefined, { octave: false })}}`).join(' ');
  return result(exercise, ok, comparison.accuracy, answerText, { type: 'play-phrase', expected, played, correct: comparison.correct, missed: comparison.missed, extra: comparison.extra }, { near });
}

// ── Dispatch ───────────────────────────────────────────────────────────────────────────────────

function invalid(exercise: Exercise): GradeResult {
  const solved = solve(exercise);
  const graded = solved.type === exercise.type ? gradeValid(exercise, solved, {}) : null;
  const feedback = graded?.feedback ?? { answer: '', explain: explainOf(exercise), detail: { type: 'true-false', answer: false } as FeedbackDetail };
  return { correct: false, score: 0, invalid: true, feedback };
}

function gradeValid(exercise: Exercise, answer: Answer, ctx: GradeContext): GradeResult {
  switch (exercise.type) {
    case 'choice':
    case 'listen-choice':
      return gradeChoice(exercise, (answer as Extract<Answer, { type: 'choice' }>).selected ?? []);
    case 'true-false': {
      const value = (answer as Extract<Answer, { type: 'true-false' }>).value;
      return result(exercise, value === exercise.answer, 0, exercise.answer ? 'True' : 'False', { type: 'true-false', answer: exercise.answer });
    }
    case 'match-pairs':
      return gradeMatch(exercise, (answer as Extract<Answer, { type: 'match-pairs' }>).pairs ?? []);
    case 'order':
      return gradeOrder(exercise, (answer as Extract<Answer, { type: 'order' }>).order ?? []);
    case 'fill-blanks':
      return gradeFill(exercise, (answer as Extract<Answer, { type: 'fill-blanks' }>).blanks ?? []);
    case 'type-answer':
      return gradeTyped(exercise, (answer as Extract<Answer, { type: 'type-answer' }>).text ?? '', ctx);
    case 'tap-rhythm':
      return gradeTaps(exercise, (answer as Extract<Answer, { type: 'tap-rhythm' }>).taps ?? [], ctx);
    case 'fretboard-find':
      return gradeFind(exercise, (answer as Extract<Answer, { type: 'fretboard-find' }>).positions ?? []);
    case 'fretboard-name':
      return gradeTextAgainst(exercise, 'fretboard-name', fretboardNameSpec(exercise), (answer as Extract<Answer, { type: 'fretboard-name' }>).text ?? '', ctx);
    case 'chord-build':
      return gradeChordBuild(exercise, answer as Extract<Answer, { type: 'chord-build' }>, ctx);
    case 'staff-read': {
      const graded = gradeTextAgainst(exercise, 'staff-read', staffReadSpec(exercise), (answer as Extract<Answer, { type: 'staff-read' }>).text ?? '', ctx);
      if (graded.near === 'enharmonic') graded.feedback.note = `Right pitch, but the note on the staff is {n:${parseNote(exercise.note)?.pcName ?? exercise.note}}: read the line or space it sits on.`;
      return graded;
    }
    case 'staff-place':
      return gradeStaffPlace(exercise, answer as Extract<Answer, { type: 'staff-place' }>);
    case 'play-note':
      return gradePlayNote(exercise, answer as Extract<Answer, { type: 'play-note' }>);
    case 'play-chord':
      return gradePlayChord(exercise, answer as Extract<Answer, { type: 'play-chord' }>);
    case 'play-phrase':
      return gradePlayPhrase(exercise, answer as Extract<Answer, { type: 'play-phrase' }>);
    case 'flashcard': {
      const rating = (answer as Extract<Answer, { type: 'flashcard' }>).rating;
      const known = rating === 'hard' || rating === 'good' || rating === 'easy';
      const out: GradeResult = { correct: known, score: rating === 'hard' ? 0.6 : known ? 1 : 0, feedback: { answer: markup(exercise.back), explain: null, detail: { type: 'flashcard', rating: known ? rating : 'again' } } };
      return out;
    }
  }
}

/**
 * Grade an answer. Never throws: an answer of the wrong shape for the exercise is marked wrong
 * with `invalid: true` (and still carries the right answer for the feedback panel).
 */
export function grade(exercise: Exercise, answer: Answer, ctx: GradeContext = {}): GradeResult {
  if (!answer || answer.type !== exercise.type) return invalid(exercise);
  try {
    return gradeValid(exercise, answer, ctx);
  } catch {
    return invalid(exercise);
  }
}

// ── Solving ────────────────────────────────────────────────────────────────────────────────────

/** A correct answer for an exercise: what the "show me" button fills in, and what validation checks the grader with. */
export function solve(exercise: Exercise): Answer {
  switch (exercise.type) {
    case 'choice':
      return { type: 'choice', selected: correctOptions(exercise) };
    case 'listen-choice':
      return { type: 'listen-choice', selected: correctOptions(exercise) };
    case 'true-false':
      return { type: 'true-false', value: exercise.answer };
    case 'match-pairs':
      return { type: 'match-pairs', pairs: exercise.pairs.map((_p, i) => [i, i] as [number, number]) };
    case 'order':
      return { type: 'order', order: exercise.tiles.map((_t, i) => i) };
    case 'fill-blanks':
      return { type: 'fill-blanks', blanks: [...exercise.blanks] };
    case 'type-answer':
      return { type: 'type-answer', text: specValue(exercise.answer) };
    case 'tap-rhythm':
      return { type: 'tap-rhythm', taps: tapTargets(exercise) };
    case 'fretboard-find': {
      const targets = findTargets(exercise).map((t) => ({ string: t.string, fret: t.fret }));
      return { type: 'fretboard-find', positions: exercise.mode === 'all' ? targets : targets.slice(0, 1) };
    }
    case 'fretboard-name': {
      const spec = fretboardNameSpec(exercise);
      return { type: 'fretboard-name', text: spec ? specValue(spec) : '' };
    }
    case 'chord-build':
      return exercise.task === 'missing-note'
        ? { type: 'chord-build', text: missingChordNote(exercise) ?? '' }
        : { type: 'chord-build', frets: referenceFrets(exercise) ?? [] };
    case 'staff-read':
      return { type: 'staff-read', text: parseNote(exercise.note)?.pcName ?? '' };
    case 'staff-place': {
      const target = staffPlaceTarget(exercise);
      return { type: 'staff-place', position: target?.position ?? 0, accidental: target?.accidental ?? null };
    }
    case 'play-note':
      return { type: 'play-note', midi: playNoteTarget(exercise), cents: 0 };
    case 'play-chord':
      return { type: 'play-chord', matched: true, score: 1, missing: [], extra: [] };
    case 'play-phrase':
      return { type: 'play-phrase', played: phraseMidi(exercise) };
    case 'flashcard':
      return { type: 'flashcard', rating: 'good' };
  }
}

/**
 * The wrong answers an exercise's own distractors offer: every wrong option, every wrong button,
 * a bank word in the wrong blank, tiles in the wrong order. Each of them must grade as wrong;
 * `validateCourse` and the generator tests check exactly that.
 */
export function wrongAnswers(exercise: Exercise): Answer[] {
  switch (exercise.type) {
    case 'choice':
    case 'listen-choice': {
      const correct = correctOptions(exercise);
      const wrong = exercise.options.map((_o, i) => i).filter((i) => !correct.includes(i));
      const out: Answer[] = wrong.map((i) => ({ type: exercise.type, selected: [i] }) as Answer);
      if (exercise.type === 'choice' && exercise.multiple) {
        // Every proper subset, and every superset by one wrong option, is wrong too.
        if (correct.length > 1) out.push({ type: 'choice', selected: correct.slice(1) });
        for (const i of wrong) out.push({ type: 'choice', selected: [...correct, i] });
      }
      return out;
    }
    case 'true-false':
      return [{ type: 'true-false', value: !exercise.answer }];
    case 'match-pairs': {
      const keys = exercise.pairs.map((p) => textKey(p.right));
      const out: Answer[] = [];
      for (let l = 0; l < exercise.pairs.length; l++) {
        const r = exercise.pairs.findIndex((_p, i) => keys[i] !== keys[l]);
        if (r >= 0) out.push({ type: 'match-pairs', pairs: exercise.pairs.map((_p, i) => (i === l ? [l, r] : [i, i]) as [number, number]) });
      }
      return out;
    }
    case 'order': {
      const keys = orderTiles(exercise).map((t) => textKey(t));
      const n = exercise.tiles.length;
      const out: Answer[] = [];
      const base = exercise.tiles.map((_t, i) => i);
      for (let i = 0; i + 1 < n; i++) {
        if (keys[i] === keys[i + 1]) continue;
        const swapped = [...base];
        [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
        out.push({ type: 'order', order: swapped });
      }
      (exercise.distractors ?? []).forEach((_d, d) => {
        if (keys[n + d] !== keys[0]) out.push({ type: 'order', order: [n + d, ...base.slice(1)] });
      });
      return out;
    }
    case 'fill-blanks': {
      const bank = fillBank(exercise);
      const out: Answer[] = [];
      exercise.blanks.forEach((right, i) => {
        for (const word of bank) {
          if (textKey(word) === textKey(right)) continue;
          if (exercise.unordered && exercise.blanks.some((b) => textKey(b) === textKey(word))) continue;
          out.push({ type: 'fill-blanks', blanks: exercise.blanks.map((b, j) => (j === i ? word : b)) });
        }
      });
      return out;
    }
    case 'fretboard-name': {
      const spec = fretboardNameSpec(exercise);
      if (!spec) return [];
      return (exercise.options ?? []).filter((o) => checkText(o, spec).verdict !== 'correct').map((o) => ({ type: 'fretboard-name', text: o }) as Answer);
    }
    case 'staff-read': {
      const spec = staffReadSpec(exercise);
      if (!spec) return [];
      return (exercise.options ?? []).filter((o) => checkText(o, spec).verdict !== 'correct').map((o) => ({ type: 'staff-read', text: o }) as Answer);
    }
    case 'chord-build': {
      if (exercise.task !== 'missing-note') return [];
      const expected = missingChordNote(exercise);
      if (!expected) return [];
      return (exercise.options ?? [])
        .filter((o) => compareNoteNames(normalizeNote(o) ?? o, expected, exercise.spelling ?? 'any') !== 'correct')
        .map((o) => ({ type: 'chord-build', text: o }) as Answer);
    }
    default:
      return [];
  }
}

// ── Presentation ───────────────────────────────────────────────────────────────────────────────

/** The display order of everything an exercise shuffles. Indexes point into the authored arrays. */
export interface Presentation {
  /** choice / listen-choice: option indexes in display order. */
  options?: number[];
  /** match-pairs: left and right indexes in display order. */
  left?: number[];
  right?: number[];
  /** order: tile indexes (tiles then distractors) in display order, never already solved. */
  tiles?: number[];
  /** fill-blanks: the word bank in display order. */
  bank?: string[];
  /** fretboard-name / staff-read / chord-build missing note: the buttons in display order. */
  buttons?: string[];
}

/**
 * How to lay an exercise out: shuffled options, tiles, pairs and word bank, the same for the same
 * seed. A screen shows this order and still answers with the authored indexes.
 */
export function presentExercise(exercise: Exercise, seed: number): Presentation {
  const rng = createRng(seed);
  switch (exercise.type) {
    case 'choice':
    case 'listen-choice': {
      const indexes = exercise.options.map((_o, i) => i);
      return { options: exercise.shuffle === false ? indexes : rng.shuffle(indexes) };
    }
    case 'match-pairs': {
      const indexes = exercise.pairs.map((_p, i) => i);
      const left = rng.shuffle(indexes);
      // The right column must not line up with the left one.
      let right = rng.shuffle(indexes);
      for (let attempt = 0; attempt < 6 && right.some((r, i) => r === left[i]) && indexes.length > 2; attempt++) right = rng.shuffle(indexes);
      return { left, right };
    }
    case 'order': {
      const all = orderTiles(exercise);
      const keys = all.map((t) => textKey(t));
      return { tiles: shuffleAway(all.map((_t, i) => i), rng, (a, b) => keys[a] === keys[b]) };
    }
    case 'fill-blanks':
      return { bank: rng.shuffle(fillBank(exercise)) };
    case 'fretboard-name':
    case 'staff-read':
      return exercise.options ? { buttons: rng.shuffle(exercise.options) } : {};
    case 'chord-build':
      return exercise.task === 'missing-note' && exercise.options ? { buttons: rng.shuffle(exercise.options) } : {};
    default:
      return {};
  }
}

/** The plain words of an exercise's right answer (markup removed), for logs and accessibility text. */
export function answerText(exercise: Exercise): string {
  return plainText(grade(exercise, solve(exercise)).feedback.answer);
}

/** Frets of a shape written any way, low to high, or null when it cannot be read. */
export function readFrets(frets: string | ReadonlyArray<number | null>): Array<number | null> | null {
  try {
    return typeof frets === 'string' ? parseFrets(frets) : [...frets];
  } catch {
    return null;
  }
}
