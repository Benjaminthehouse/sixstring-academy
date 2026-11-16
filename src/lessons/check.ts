/**
 * Checks for a single step: is every text short enough and well formed, is every figure real,
 * can the exercise be graded, is exactly the intended answer right, and is no distractor right by
 * accident (two names for one pitch in the same option list is the classic trap).
 *
 * `validateCourse` runs these over a whole course and adds where each problem is. The generator
 * tests run them over thousands of generated exercises.
 */
import { midiAt, tuning as resolveTuning } from '@/core/guitar';
import { getKey, getScale, isDegree, midiToNote, parseChord, parseInterval, parseNote, staffPosition } from '@/core/theory';
import { checkText, compareNoteNames, normalizeNote, specProblems } from './answers';
import { figureProblems, positionProblem, voicingFor } from './figures';
import { getGenerator, generatorProblems, isGenerated } from './generators';
import type { GlossaryLookup } from './glossary';
import {
  fillBank, findTargets, fretboardNameSpec, grade, missingChordNote, orderTiles, phraseMidi, solve, staffReadSpec, tapTargets, wrongAnswers,
} from './grade';
import { COUNT_LIMITS, MAX_FRET, TEMPO_LIMITS, TEXT_LIMITS, type TextLimit } from './limits';
import { parseRhythm } from './rhythm';
import { createRng } from './rng';
import { soundProblems, tabProblems } from './sound';
import { looseSymbols, parseRichText, plainText, textKey, textLength, tokenize } from './text';
import type { CardStep, ChoiceOption, CourseLevel, Exercise, ExerciseStep, Figure, RichText, Step } from './types';

/** One thing that is wrong with a step. */
export interface StepProblem {
  /** Stable code for tests and filtering: `text.long`, `exercise.distractor` ... */
  code: string;
  /** `error`: the content must not ship. `warning`: it works but breaks a guideline. */
  severity: 'error' | 'warning';
  /** What is wrong and how to fix it. */
  message: string;
}

/** What the checks need to know about the course. */
export interface CheckContext {
  glossary?: GlossaryLookup;
  level?: CourseLevel;
}

const EXERCISE_TYPES = new Set([
  'choice', 'true-false', 'match-pairs', 'order', 'fill-blanks', 'type-answer', 'listen-choice', 'tap-rhythm', 'fretboard-find',
  'fretboard-name', 'chord-build', 'staff-read', 'staff-place', 'play-note', 'play-chord', 'play-phrase', 'flashcard',
]);
const PLAY_TYPES = new Set(['play-note', 'play-chord', 'play-phrase']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class Collector {
  readonly problems: StepProblem[] = [];
  constructor(readonly ctx: CheckContext) {}

  error(code: string, message: string): void {
    this.problems.push({ code, severity: 'error', message });
  }

  warn(code: string, message: string): void {
    this.problems.push({ code, severity: 'warning', message });
  }

  /** Check one text: present, well-formed markup, within its length limit, speakable. */
  text(value: RichText | undefined, limit: TextLimit, label: string, opts: { optional?: boolean; blanks?: boolean } = {}): void {
    const raw = value === undefined || value === null ? '' : typeof value === 'string' ? value : value.text;
    if (typeof raw !== 'string' || raw.trim() === '') {
      if (!opts.optional) this.error('text.empty', `${label} is empty. Write it.`);
      return;
    }
    const parsed = parseRichText(value as RichText, { glossary: this.ctx.glossary });
    for (const problem of parsed.problems) {
      this.error(problem.includes('glossary') ? 'glossary.unknown' : 'text.markup', `${label}: ${problem}`);
    }
    if (!opts.blanks && parsed.blanks > 0) {
      this.error('text.markup', `${label} contains "___", which marks a blank only in a fill-blanks text. Remove it or write "\\_\\_\\_".`);
    }
    const length = textLength(value as RichText, { glossary: this.ctx.glossary });
    const max = TEXT_LIMITS[limit];
    if (length > max) {
      this.error('text.long', `${label} is ${length} characters long; the limit is ${max} so it fits a phone screen. Shorten it or split the step.`);
    }
    const hasSay = typeof value === 'object' && value !== null && typeof value.say === 'string' && value.say.trim() !== '';
    if (!hasSay) {
      const loose = looseSymbols(value as RichText, { glossary: this.ctx.glossary });
      if (loose.length > 0) {
        const tags = loose.map((l) => `${l.symbol} → ${l.tag}`).join(', ');
        this.error('text.speech', `${label} has music symbols typed as plain text, which a speech voice mispronounces and the screen cannot typeset. Wrap them in tags (${tags}), or give the text a "say" version.`);
      }
    }
  }

  figure(figure: Figure | undefined, label: string): void {
    if (figure === undefined) return;
    for (const problem of figureProblems(figure)) this.error('figure.invalid', `${label}: ${problem}`);
    if (figure && 'caption' in figure && figure.caption !== undefined) this.text(figure.caption, 'caption', `${label} caption`);
    if (figure?.kind === 'audio' && figure.label !== undefined) this.text(figure.label, 'audioLabel', `${label} label`);
  }

  count(n: number, limit: keyof typeof COUNT_LIMITS, what: string): void {
    const [min, max] = COUNT_LIMITS[limit];
    if (n < min) this.error('exercise.count', `Too few ${what}: ${n}, and at least ${min} ${min === 1 ? 'is' : 'are'} needed. Add more.`);
    if (n > max) this.error('exercise.count', `Too many ${what}: ${n}, and at most ${max} fit a phone screen. Remove some or split the step.`);
  }
}

// ── Enharmonic twins ───────────────────────────────────────────────────────────────────────────

/**
 * What a text SOUNDS like when it is nothing but music symbols: a note, a list of notes, a chord,
 * an interval or a key. Two options with the same signature and different words are the same
 * answer under two names. Null for ordinary text.
 */
export function pitchSignature(text: RichText | string, glossary?: GlossaryLookup): string | null {
  const tokens = tokenize(text, { glossary }).filter((t) => !(t.type === 'text' && /^[\s,;/→–-]*$/.test(t.text)));
  if (tokens.length === 0 || tokens.some((t) => t.type === 'text' || t.type === 'term' || t.type === 'break' || t.type === 'blank')) {
    // A bare word that happens to be a note name ("F#") counts as that note.
    const plain = typeof text === 'string' ? text : text.text;
    const asNote = /^[A-Ga-g](?:#|b|♯|♭){0,2}$/.test(plain.trim()) ? parseNote(plain.trim()) : null;
    return asNote ? `n:${asNote.chroma}` : null;
  }
  const parts = tokens.map((t) => {
    switch (t.type) {
      case 'note': {
        const n = parseNote(t.value)!;
        return `n:${n.midi ?? n.chroma}`;
      }
      case 'chord': {
        const c = parseChord(t.value)!;
        return `c:${parseNote(c.root)!.chroma}:${c.type.semitones.join('.')}:${parseNote(c.bass ?? c.root)!.chroma}`;
      }
      case 'interval':
        return `i:${parseInterval(t.value)!.semitones}`;
      case 'key': {
        const k = getKey(t.value)!;
        return `k:${parseNote(k.tonic)!.chroma}:${k.mode}`;
      }
      case 'degree':
        return `d:${t.value}`;
      case 'roman':
        return `r:${t.value}`;
      default:
        return 'x';
    }
  });
  return parts.join(' ');
}

/** Pairs of texts that sound the same but are written differently. */
function enharmonicTwins(texts: ReadonlyArray<RichText | string>, glossary?: GlossaryLookup): Array<[string, string]> {
  // Compared by key, reported as the author sees them ("C♯" and "D♭", not the lower-cased keys).
  const seen = new Map<string, { key: string; shown: string }>();
  const twins: Array<[string, string]> = [];
  for (const text of texts) {
    const signature = pitchSignature(text, glossary);
    if (signature === null) continue;
    const key = textKey(text);
    const shown = plainText(text, { glossary });
    const other = seen.get(signature);
    if (other !== undefined && other.key !== key) twins.push([other.shown, shown]);
    else seen.set(signature, { key, shown });
  }
  return twins;
}

// ── Per-type checks ────────────────────────────────────────────────────────────────────────────

function checkOptions(c: Collector, options: readonly ChoiceOption[], multiple: boolean, allowTwins: boolean, byEar: boolean): void {
  if (!Array.isArray(options)) {
    c.error('exercise.shape', '"options" is missing. Give a list of options, one of them with correct: true.');
    return;
  }
  c.count(options.length, 'options', 'options');
  options.forEach((option, i) => {
    const label = `Option ${i + 1}`;
    if (option.text === undefined && option.figure === undefined) c.error('exercise.shape', `${label} has neither "text" nor "figure". Give it one.`);
    if (option.text !== undefined) c.text(option.text, 'option', label);
    c.figure(option.figure, `${label} figure`);
    if (option.why !== undefined) c.text(option.why, 'optionWhy', `${label} "why"`);
    if (option.why !== undefined && option.correct) c.warn('exercise.shape', `${label} is the right answer but has a "why", which is only shown for wrong picks. Move that text into "explain".`);
  });
  const right = options.filter((o) => o.correct === true).length;
  if (multiple) {
    if (right < 1) c.error('exercise.ungradable', 'No option is marked correct. Mark every right option with correct: true.');
    if (right === options.length) c.error('exercise.distractor', 'Every option is correct, so there is nothing to choose. Add at least one wrong option.');
  } else if (right !== 1) {
    c.error('exercise.ungradable', `${right} options are marked correct; a single-answer question needs exactly one. Mark one option correct: true, or set multiple: true.`);
  }
  // Two options that read the same.
  const keys = options.map((o) => (o.text !== undefined ? `t:${textKey(o.text)}` : `f:${figureKey(o.figure)}`));
  keys.forEach((key, i) => {
    const first = keys.indexOf(key);
    if (first !== i) c.error('exercise.duplicate', `Options ${first + 1} and ${i + 1} are the same. Change or remove one.`);
  });
  const twins = enharmonicTwins(options.filter((o) => o.text !== undefined).map((o) => o.text as RichText), c.ctx.glossary);
  if (twins.length > 0 && (!allowTwins || byEar)) {
    const [a, b] = twins[0];
    c.error(
      'exercise.enharmonic',
      byEar
        ? `Options "${a}" and "${b}" sound exactly the same, so the ear cannot choose between them. Remove one.`
        : `Options "${a}" and "${b}" are the same pitch under two names, so both could be right. Remove one, or set spelling: 'exact' if telling the names apart is the point of the question.`,
    );
  }
}

/** A stable key for comparing figures: rhythms by where their notes start, everything else by content. */
function figureKey(figure: Figure | undefined): string {
  if (!figure) return '';
  if (figure.kind === 'rhythm') return `rhythm:${figure.time ?? '4/4'}:${parseRhythm(figure).onsets.join(',')}`;
  return JSON.stringify(figure);
}

function checkTuning(c: Collector, exercise: { tuning?: string; capo?: number }): boolean {
  try {
    resolveTuning(exercise.tuning);
  } catch {
    c.error('exercise.shape', `"${exercise.tuning}" is not a tuning the guitar engine knows. Use an id such as standard or drop-d.`);
    return false;
  }
  if (exercise.capo !== undefined && (!Number.isInteger(exercise.capo) || exercise.capo < 0 || exercise.capo > 12)) {
    c.error('exercise.shape', `Capo ${exercise.capo} is not possible. Use a whole fret from 0 to 12.`);
    return false;
  }
  return true;
}

function checkKey(c: Collector, key: string | undefined): void {
  if (key !== undefined && !getKey(key)) c.error('exercise.shape', `"${key}" is not a key. Write it like "G major" or "E minor".`);
}

/** The display options of play-note and play-phrase: `labels`, `hideNames`, `staffOnly`. */
function checkPlayDisplay(c: Collector, exercise: { labels?: unknown; hideNames?: unknown; staffOnly?: unknown }, midis: readonly number[]): void {
  if (exercise.labels !== undefined && exercise.labels !== 'note' && exercise.labels !== 'place') c.error('exercise.shape', '"labels" must be \'note\' (E2) or \'place\' (string 6, open).');
  for (const flag of ['hideNames', 'staffOnly'] as const) {
    if (exercise[flag] !== undefined && typeof exercise[flag] !== 'boolean') c.error('exercise.shape', `"${flag}" must be true or false.`);
  }
  if (exercise.staffOnly === true) {
    const far = midis.find((m) => Math.abs(staffPosition(midiToNote(m), {}).ledgerLines) > 4);
    if (far !== undefined) c.error('exercise.shape', `staffOnly draws the notes on the staff, but ${midiToNote(far)} needs more than four ledger lines. Keep to E2–E6 (sounding), or show the neck.`);
    if (exercise.labels === 'place') c.warn('exercise.shape', 'staffOnly shows no neck and no names, so labels: \'place\' has nothing to label. Remove one of them.');
  }
}

/**
 * Options that give the answer away: when the options are pictures, the right one must not be the
 * only one whose caption (or text) repeats a symbol the prompt asks about ("Which box is {c:G}?"
 * with "{c:G}" under the right box).
 */
function checkGiveaway(c: Collector, prompt: RichText | undefined, options: readonly ChoiceOption[]): void {
  if (prompt === undefined || !Array.isArray(options) || !options.some((o) => o.figure)) return;
  const symbols = (text: RichText | undefined): Set<string> => {
    const out = new Set<string>();
    if (text === undefined) return out;
    for (const t of tokenize(text, { glossary: c.ctx.glossary })) {
      if (t.type === 'note' || t.type === 'chord' || t.type === 'interval' || t.type === 'degree' || t.type === 'roman' || t.type === 'key') out.add(`${t.type}:${t.value}`);
    }
    return out;
  };
  const asked = symbols(prompt);
  if (asked.size === 0) return;
  const shown = options.map((o) => {
    const set = symbols(o.text);
    const caption = o.figure && 'caption' in o.figure ? o.figure.caption : undefined;
    for (const s of symbols(caption)) set.add(s);
    return [...set].some((s) => asked.has(s));
  });
  const right = options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
  if (right.length > 0 && right.every((i) => shown[i]) && shown.filter(Boolean).length === right.length) {
    c.warn('exercise.giveaway', 'The right option is the only one whose words repeat what the prompt asks for, so it can be picked without looking at the pictures. Take the name out of its caption or text (chord boxes in options are drawn without their names).');
  }
}

function checkPolicy(c: Collector, value: unknown, field: string, meaning: string): boolean {
  if (value === 'exact' || value === 'any') return true;
  c.error('exercise.policy', `"${field}" is missing. State it for this exercise: ${meaning}`);
  return false;
}

function checkButtons(c: Collector, options: readonly string[] | undefined, isRight: (o: string) => boolean, parses: (o: string) => boolean, what: string, twinsMatter: boolean): void {
  if (options === undefined) return;
  if (!Array.isArray(options) || options.length < 2 || options.length > COUNT_LIMITS.options[1]) {
    c.error('exercise.count', `"options" must hold 2 to ${COUNT_LIMITS.options[1]} answers, or be left out to show a keypad.`);
    return;
  }
  const bad = options.filter((o) => typeof o !== 'string' || !parses(o));
  if (bad.length > 0) c.error('exercise.shape', `The options ${bad.map((b) => JSON.stringify(b)).join(', ')} are not ${what}. Write plain values such as ${what === 'note names' ? '"F#"' : what === 'intervals' ? '"m3"' : '"b3"'} (no markup).`);
  const right = options.filter((o) => typeof o === 'string' && isRight(o)).length;
  if (right === 0) c.error('exercise.ungradable', 'None of the options is the right answer. Add it to "options".');
  if (right > 1) c.error('exercise.distractor', `${right} of the options are right answers. Keep one; the others must be wrong.`);
  if (new Set(options).size !== options.length) c.error('exercise.duplicate', 'An option is listed twice. Remove the duplicate.');
  if (twinsMatter) {
    const twins = enharmonicTwins(options, c.ctx.glossary);
    if (twins.length > 0) c.error('exercise.enharmonic', `Options "${twins[0][0]}" and "${twins[0][1]}" are the same pitch under two names. Remove one, or use spelling: 'exact' with a key that decides the name.`);
  }
}

function checkExerciseBody(c: Collector, exercise: Exercise): void {
  switch (exercise.type) {
    case 'choice':
      checkOptions(c, exercise.options, exercise.multiple === true, exercise.spelling === 'exact', false);
      checkGiveaway(c, exercise.prompt, exercise.options);
      break;
    case 'listen-choice':
      if (!exercise.sound) c.error('exercise.shape', 'A listen-choice exercise needs a "sound".');
      else for (const problem of soundProblems(exercise.sound)) c.error('figure.invalid', `Sound: ${problem}`);
      checkOptions(c, exercise.options, false, false, true);
      break;
    case 'true-false':
      c.text(exercise.statement, 'statement', 'The statement');
      if (typeof exercise.answer !== 'boolean') c.error('exercise.ungradable', '"answer" must be true or false.');
      break;
    case 'match-pairs': {
      const pairs = Array.isArray(exercise.pairs) ? exercise.pairs : [];
      c.count(pairs.length, 'pairs', 'pairs');
      pairs.forEach((pair, i) => {
        c.text(pair.left, 'pairSide', `Pair ${i + 1} left side`);
        c.text(pair.right, 'pairSide', `Pair ${i + 1} right side`);
      });
      for (const side of ['left', 'right'] as const) {
        const keys = pairs.map((p) => textKey(p[side] ?? ''));
        keys.forEach((key, i) => {
          if (keys.indexOf(key) !== i) c.error('exercise.duplicate', `Pairs ${keys.indexOf(key) + 1} and ${i + 1} have the same ${side} side ("${key}"), so the match is ambiguous. Make every ${side} side different.`);
        });
        const twins = enharmonicTwins(pairs.map((p) => p[side] ?? ''), c.ctx.glossary);
        if (twins.length > 0) c.error('exercise.enharmonic', `On the ${side} side, "${twins[0][0]}" and "${twins[0][1]}" are the same pitch under two names. Use one of them only.`);
      }
      break;
    }
    case 'order': {
      const tiles = Array.isArray(exercise.tiles) ? exercise.tiles : [];
      c.count(tiles.length, 'tiles', 'tiles');
      c.count((exercise.distractors ?? []).length, 'orderDistractors', 'extra tiles');
      orderTiles(exercise).forEach((tile, i) => c.text(tile, 'tile', `Tile ${i + 1}`));
      const keys = tiles.map((t) => textKey(t));
      if (tiles.length > 1 && new Set(keys).size === 1) c.error('exercise.ungradable', 'Every tile is the same, so any order is right. Use tiles that differ.');
      (exercise.distractors ?? []).forEach((d, i) => {
        if (keys.includes(textKey(d))) c.error('exercise.distractor', `Extra tile ${i + 1} ("${textKey(d)}") is the same as a tile of the answer. Extra tiles must not belong in the answer.`);
      });
      const tileSignatures = new Set(tiles.map((t) => pitchSignature(t, c.ctx.glossary)).filter((s): s is string => s !== null));
      (exercise.distractors ?? []).forEach((d, i) => {
        const signature = pitchSignature(d, c.ctx.glossary);
        if (signature !== null && tileSignatures.has(signature) && !keys.includes(textKey(d))) {
          c.error('exercise.enharmonic', `Extra tile ${i + 1} ("${textKey(d)}") is the same pitch as a tile of the answer under another name. Use a different note.`);
        }
      });
      break;
    }
    case 'fill-blanks': {
      c.text(exercise.text, 'fillText', 'The text', { blanks: true });
      const blanks = Array.isArray(exercise.blanks) ? exercise.blanks : [];
      const inText = parseRichText(exercise.text ?? '', { glossary: c.ctx.glossary }).blanks;
      c.count(blanks.length, 'blanks', 'blanks');
      if (inText !== blanks.length) c.error('exercise.shape', `The text has ${inText} "___" but "blanks" lists ${blanks.length} words. Give exactly one word per blank, in order.`);
      const bank = fillBank(exercise);
      c.count(bank.length, 'bank', 'words in the bank');
      bank.forEach((word, i) => c.text(word, 'bankWord', `Bank word ${i + 1}`));
      const blankKeys = blanks.map((b) => textKey(b));
      (exercise.bank ?? []).forEach((word) => {
        if (blankKeys.includes(textKey(word))) c.warn('exercise.duplicate', `The bank word "${textKey(word)}" is already one of the answers; answers are added to the bank automatically. Remove it from "bank".`);
      });
      if (new Set(blankKeys).size === 1 && bank.length === blanks.length) c.error('exercise.distractor', 'The bank holds only the right word. Add at least one wrong word to "bank".');
      if (exercise.spelling !== 'exact') {
        const twins = enharmonicTwins(bank, c.ctx.glossary);
        if (twins.length > 0) c.error('exercise.enharmonic', `The bank holds "${twins[0][0]}" and "${twins[0][1]}", the same pitch under two names. Remove one, or set spelling: 'exact' if the name is the point.`);
      }
      break;
    }
    case 'type-answer':
      if (!exercise.answer) c.error('exercise.ungradable', '"answer" is missing. Give { kind, value } and, for notes, intervals, chords and degrees, a spelling policy.');
      else for (const problem of specProblems(exercise.answer)) c.error(problem.includes('policy') ? 'exercise.policy' : 'exercise.ungradable', problem);
      break;
    case 'tap-rhythm': {
      const parsed = parseRhythm(exercise.rhythm ?? { pattern: '' });
      for (const problem of parsed.problems) c.error('figure.invalid', `Rhythm: ${problem}`);
      if (parsed.problems.length > 0) break;
      c.count(parsed.onsets.length, 'rhythmNotes', 'notes to tap');
      c.count(parsed.bars, 'rhythmBars', 'bars');
      if (!(exercise.tempo >= TEMPO_LIMITS[0] && exercise.tempo <= 160)) {
        c.error('exercise.shape', `Tempo ${exercise.tempo} is outside ${TEMPO_LIMITS[0]}–160 beats per minute, the range a rhythm can be tapped at. Choose a tempo in that range.`);
        break;
      }
      if (!['notation', 'audio', 'both'].includes(exercise.show)) c.error('exercise.shape', '"show" must be \'notation\', \'audio\' or \'both\'.');
      if (exercise.counting !== undefined && typeof exercise.counting !== 'boolean') c.error('exercise.shape', '"counting" must be true or false.');
      if (exercise.start === 'first-tap' && !parsed.events[0]?.attack) c.error('exercise.ungradable', 'With start: \'first-tap\' the rhythm must begin with a note, because the first tap is taken as beat one. Start with a note or use the count-in.');
      const times = tapTargets(exercise);
      for (let i = 1; i < times.length; i++) {
        if (times[i] - times[i - 1] < 0.14) {
          c.error('exercise.ungradable', `Two notes are only ${Math.round((times[i] - times[i - 1]) * 1000)} ms apart at ${exercise.tempo} BPM, too fast to tap with one finger. Lower the tempo or use longer notes.`);
          break;
        }
      }
      break;
    }
    case 'fretboard-find': {
      if (!checkTuning(c, exercise)) break;
      checkKey(c, exercise.key);
      const okOctave = checkPolicy(c, exercise.octave, 'octave', "'exact' when only that very pitch counts, 'any' when any octave of the note does.");
      if (exercise.mode !== 'one' && exercise.mode !== 'all') c.error('exercise.shape', '"mode" must be \'one\' (tap one right place) or \'all\' (tap every right place).');
      const frets = exercise.frets;
      if (!Array.isArray(frets) || frets.length !== 2 || !Number.isInteger(frets[0]) || !Number.isInteger(frets[1]) || frets[0] < 0 || frets[1] < frets[0] || frets[1] > MAX_FRET) {
        c.error('exercise.shape', `"frets" must be [first, last] with 0 ≤ first ≤ last ≤ ${MAX_FRET}.`);
        break;
      }
      if (frets[1] - frets[0] + 1 > COUNT_LIMITS.fretSpan[1]) c.error('exercise.count', `The region spans ${frets[1] - frets[0] + 1} frets; a phone shows ${COUNT_LIMITS.fretSpan[1]} at most. Narrow "frets".`);
      for (const s of exercise.strings ?? []) {
        const bad = positionProblem({ string: s, fret: 0 }, exercise);
        if (bad) c.error('exercise.shape', `"strings": ${bad}.`);
      }
      (exercise.shown ?? []).forEach((dot, i) => {
        const bad = positionProblem(dot, exercise);
        if (bad) c.error('figure.invalid', `Shown dot ${i + 1}: ${bad}.`);
      });
      const find = exercise.find;
      if (!find || typeof find !== 'object') {
        c.error('exercise.shape', '"find" is missing. Give { note }, { chord }, { scale, tonic } or { interval, from }.');
        break;
      }
      if ('note' in find) {
        const n = parseNote(find.note);
        if (!n) c.error('exercise.shape', `"find.note" is "${find.note}", which is not a note. Write it like C or C4.`);
        else if (okOctave && exercise.octave === 'exact' && n.midi === null) c.error('exercise.policy', `octave: 'exact' needs a note with its octave, but "find.note" is "${find.note}". Write it like ${n.pcName}3, or use octave: 'any'.`);
      } else if ('chord' in find) {
        if (!parseChord(find.chord)) c.error('exercise.shape', `"find.chord" is "${find.chord}", which is not a chord symbol.`);
        else if (exercise.octave === 'exact') c.error('exercise.policy', "A chord's tones are found in every octave: use octave: 'any' with find: { chord }.");
      } else if ('scale' in find) {
        if (!getScale(find.scale)) c.error('exercise.shape', `"find.scale" is "${find.scale}", which is not a scale id.`);
        else if (!parseNote(find.tonic)) c.error('exercise.shape', `"find.tonic" is "${find.tonic}", which is not a note.`);
        else if (exercise.octave === 'exact') c.error('exercise.policy', "A scale's notes are found in every octave: use octave: 'any' with find: { scale }.");
      } else if ('interval' in find) {
        if (!parseInterval(find.interval)) c.error('exercise.shape', `"find.interval" is "${find.interval}", which is not an interval. Write it like M3 or P5.`);
        const bad = find.from ? positionProblem(find.from, exercise) : 'it is missing';
        if (bad) c.error('exercise.shape', `"find.from": ${bad}.`);
      } else {
        c.error('exercise.shape', '"find" must be { note }, { chord }, { scale, tonic } or { interval, from }.');
      }
      if (c.problems.some((p) => p.severity === 'error')) break;
      const targets = findTargets(exercise);
      if (targets.length === 0) c.error('exercise.ungradable', 'No position in the region is a right answer. Widen "frets" or "strings", or change what is asked.');
      else if (exercise.mode === 'all') c.count(targets.length, 'findTargets', 'positions to find');
      break;
    }
    case 'fretboard-name': {
      if (!checkTuning(c, exercise)) break;
      checkKey(c, exercise.key);
      const bad = exercise.position ? positionProblem(exercise.position, exercise) : 'it is missing';
      if (bad) {
        c.error('exercise.shape', `"position": ${bad}.`);
        break;
      }
      if (!['note', 'interval', 'degree'].includes(exercise.ask)) {
        c.error('exercise.shape', '"ask" must be \'note\', \'interval\' or \'degree\'.');
        break;
      }
      if (!checkPolicy(c, exercise.spelling, 'spelling', "'any' when only the pitch matters, 'exact' (with a key) when the name does.")) break;
      if (exercise.ask === 'note') {
        if (exercise.spelling === 'exact' && !exercise.key) c.error('exercise.policy', "spelling: 'exact' needs a \"key\" to decide the name (is it F# or Gb?). Add key: '<key>' or use spelling: 'any'.");
      } else {
        const rootBad = exercise.root ? positionProblem(exercise.root, exercise) : 'it is missing; an interval or degree is measured from a root position';
        if (rootBad) {
          c.error('exercise.shape', `"root": ${rootBad}.`);
          break;
        }
        if (exercise.spelling === 'exact') c.error('exercise.policy', "A fret fixes the size of an interval, not its spelling: use spelling: 'any' when asking for an interval or degree.");
      }
      const spec = fretboardNameSpec(exercise);
      if (!spec) {
        c.error('exercise.ungradable', 'The answer cannot be worked out: the asked position must be at or above the root, and at most an octave above it.');
        break;
      }
      const parses = exercise.ask === 'note' ? (o: string) => parseNote(o) !== null : exercise.ask === 'interval' ? (o: string) => parseInterval(o) !== null : (o: string) => isDegree(o);
      checkButtons(c, exercise.options, (o) => checkText(o, spec).verdict === 'correct', parses, exercise.ask === 'note' ? 'note names' : exercise.ask === 'interval' ? 'intervals' : 'degrees', exercise.ask === 'note' && spec.kind === 'note' && spec.spelling === 'any');
      break;
    }
    case 'chord-build': {
      if (!checkTuning(c, exercise)) break;
      if (!parseChord(exercise.chord)) {
        c.error('exercise.shape', `"chord" is "${exercise.chord}", which is not a chord symbol. Write it like Am or G7.`);
        break;
      }
      if (exercise.task === 'fingers') {
        if (exercise.accept !== undefined && exercise.accept !== 'any-voicing' && exercise.accept !== 'this-shape') c.error('exercise.shape', '"accept" must be \'any-voicing\' or \'this-shape\'.');
        if (!voicingFor(exercise.chord, exercise.frets, exercise)) {
          c.error('exercise.ungradable', exercise.frets !== undefined ? `The shape ${JSON.stringify(exercise.frets)} is not a voicing of ${exercise.chord}. Fix the frets (low string first, x or null for muted).` : `The chord library has no shape for ${exercise.chord}. Give the shape yourself with "frets".`);
        }
      } else if (exercise.task === 'missing-note') {
        const given = exercise.given ?? [];
        const tones = new Set(parseChord(exercise.chord)!.notes.map((n) => parseNote(n)!.chroma));
        const strangers = given.filter((g) => !parseNote(g) || !tones.has(parseNote(g)!.chroma));
        if (strangers.length > 0) c.error('exercise.shape', `"given" holds ${strangers.join(', ')}, which ${strangers.length === 1 ? 'is' : 'are'} not in ${exercise.chord}. List only notes of the chord.`);
        const missing = missingChordNote(exercise);
        if (!missing) {
          c.error('exercise.ungradable', `"given" must leave exactly one note of ${exercise.chord} out (its notes are ${parseChord(exercise.chord)!.notes.join(' ')}).`);
          break;
        }
        const spelling = exercise.spelling ?? 'any';
        checkButtons(c, exercise.options, (o) => compareNoteNames(normalizeNote(o) ?? o, missing, spelling) === 'correct', (o) => parseNote(o) !== null, 'note names', spelling === 'any');
      } else {
        c.error('exercise.shape', '"task" must be \'fingers\' or \'missing-note\'.');
      }
      break;
    }
    case 'staff-read':
    case 'staff-place': {
      checkKey(c, exercise.key);
      const n = parseNote(exercise.note);
      if (!n) {
        c.error('exercise.shape', `"note" is "${exercise.note}", which is not a note. Write the sounding pitch like G3 (the open third string).`);
        break;
      }
      if (Math.abs(n.alt) > 1) c.error('exercise.shape', `"note" is "${exercise.note}": double sharps and flats are not drawn. Use a single accidental.`);
      if (exercise.type === 'staff-read') {
        if (n.midi === null) {
          c.error('exercise.shape', `"note" is "${exercise.note}" without an octave. A note on the staff has an exact pitch: write the sounding pitch like ${n.pcName}3.`);
          break;
        }
        const spec = staffReadSpec(exercise)!;
        checkButtons(c, exercise.options, (o) => checkText(o, spec).verdict === 'correct', (o) => parseNote(o) !== null, 'note names', false);
      } else if (checkPolicy(c, exercise.octave, 'octave', "'exact' when one particular line or space is right, 'any' when any octave of the note is.")) {
        if (exercise.octave === 'exact' && n.midi === null) c.error('exercise.policy', `octave: 'exact' needs a note with its octave, but "note" is "${exercise.note}". Write it like ${n.pcName}3, or use octave: 'any'.`);
      }
      if (n.midi !== null && Math.abs(staffPosition(n.name, { clef: exercise.clef }).ledgerLines) > 4) {
        c.error('exercise.shape', `"${exercise.note}" needs more than four ledger lines, too many to read. Keep to E2–E6 (sounding) for guitar notation.`);
      }
      break;
    }
    case 'play-note': {
      const n = parseNote(exercise.note);
      if (!n || n.midi === null) {
        c.error('exercise.shape', `"note" is "${exercise.note}"; a note to play needs its octave. Write the sounding pitch like E2 (the low E string).`);
      } else {
        if (n.midi < 40 || n.midi > 88) c.error('exercise.shape', `"${exercise.note}" is outside the guitar's range (E2 to E6).`);
        if (exercise.where) {
          const bad = positionProblem(exercise.where);
          if (bad) c.error('figure.invalid', `"where": ${bad}.`);
          else if (midiAt(exercise.where) !== n.midi) c.error('figure.invalid', `"where" (string ${exercise.where.string}, fret ${exercise.where.fret}) does not sound ${exercise.note}. Fix the position or the note.`);
        }
        if (exercise.labels === 'place' && !exercise.where && !exercise.staffOnly) c.error('exercise.shape', 'labels: \'place\' names the target by string and fret, so the exercise needs "where".');
        checkPlayDisplay(c, exercise, [n.midi]);
      }
      checkKey(c, exercise.key);
      checkPolicy(c, exercise.octave, 'octave', "'exact' when that very pitch must be played, 'any' when any octave of the note is fine.");
      break;
    }
    case 'play-chord': {
      if (!checkTuning(c, exercise)) break;
      if (exercise.hideDiagram !== undefined && typeof exercise.hideDiagram !== 'boolean') c.error('exercise.shape', '"hideDiagram" must be true or false.');
      if (!parseChord(exercise.chord)) {
        c.error('exercise.shape', `"chord" is "${exercise.chord}", which is not a chord symbol.`);
        break;
      }
      const shape = voicingFor(exercise.chord, exercise.frets, { tuning: exercise.tuning, capo: exercise.capo });
      if (!shape) {
        c.error('figure.invalid', exercise.frets !== undefined ? `The shape ${JSON.stringify(exercise.frets)} is not a voicing of ${exercise.chord}${exercise.capo ? ` with a capo at fret ${exercise.capo} (frets count from the capo; the chord names what sounds)` : ''}.` : `The chord library has no shape for ${exercise.chord}; give one with "frets".`);
      } else if (exercise.fingers !== undefined && !voicingFor(exercise.chord, shape.frets, { tuning: exercise.tuning, capo: exercise.capo, fingers: exercise.fingers })) {
        c.error('figure.invalid', `The fingers "${exercise.fingers}" do not fit the shape ${shape.frets.map((f) => (f === null ? 'x' : f)).join('')}: give one finger (1–4, 0 open, x muted) per string, low to high, that a hand can hold.`);
      }
      break;
    }
    case 'play-phrase': {
      if (!checkTuning(c, exercise)) break;
      const notes = Array.isArray(exercise.notes) ? exercise.notes : [];
      for (const problem of tabProblems(notes, exercise)) c.error('figure.invalid', `Phrase: ${problem}`);
      c.count(phraseMidi({ ...exercise, notes }).length, 'phraseNotes', 'notes in the phrase');
      checkPolicy(c, exercise.octave, 'octave', "'exact' when the phrase must be played at pitch, 'any' when the note names are enough.");
      if (exercise.pass !== undefined && !(exercise.pass > 0 && exercise.pass <= 1)) c.error('exercise.shape', '"pass" must be a share between 0 and 1, such as 0.8.');
      checkKey(c, exercise.key);
      checkPlayDisplay(c, exercise, phraseMidi({ ...exercise, notes }));
      break;
    }
    case 'flashcard':
      c.text(exercise.front, 'flashFront', 'The front');
      c.text(exercise.back, 'flashBack', 'The back');
      c.figure(exercise.backFigure, 'The back figure');
      break;
  }
}

function checkAlternative(c: Collector, alternative: ExerciseStep | undefined): void {
  if (alternative === undefined || alternative === null) {
    c.error('exercise.alternative', 'This microphone exercise has no "alternative". Add a non-microphone exercise that practises the same thing (for a note: a fretboard-find; for a chord: a chord-build), for when the learner cannot play.');
    return;
  }
  if (isGenerated(alternative)) {
    if (getGenerator(String(alternative.generate))?.mic) c.error('exercise.alternative', `The alternative uses the "${String(alternative.generate)}" generator, which itself needs the microphone. Use a generator or exercise that works by tapping.`);
    for (const problem of generatorProblems(alternative)) c.error('generator.params', `Alternative: ${problem}`);
    return;
  }
  if (PLAY_TYPES.has(alternative.type)) {
    c.error('exercise.alternative', `The alternative is a ${alternative.type} exercise, which needs the microphone too. Use a tapping exercise such as fretboard-find or chord-build.`);
    return;
  }
  for (const problem of exerciseProblems(alternative, c.ctx)) c.problems.push({ ...problem, message: `Alternative: ${problem.message}` });
}

/**
 * Everything that is wrong with one literal exercise (empty when fine): its texts, figure, shape,
 * limits, and whether grading works: the exercise's own answer must be accepted and every
 * distractor rejected.
 */
export function exerciseProblems(exercise: Exercise, ctx: CheckContext = {}): StepProblem[] {
  const c = new Collector(ctx);
  if (!exercise || typeof exercise !== 'object' || !EXERCISE_TYPES.has((exercise as { type?: string }).type ?? '')) {
    c.error('exercise.shape', `"${String((exercise as { type?: unknown } | null)?.type)}" is not an exercise type. Use one of: ${[...EXERCISE_TYPES].join(', ')}.`);
    return c.problems;
  }
  if (exercise.id !== undefined && !SLUG.test(exercise.id)) c.error('id.format', `The id "${exercise.id}" is not a slug. Use lower-case letters, digits and single hyphens.`);
  if (exercise.type !== 'flashcard') {
    if (exercise.type !== 'true-false' || exercise.prompt !== undefined) c.text(exercise.prompt, 'prompt', 'The prompt');
    c.text(exercise.explain, 'explain', 'The explanation ("explain": why the answer is right)');
  }
  c.text(exercise.hint, 'hint', 'The hint', { optional: true });
  c.figure(exercise.figure, 'The figure');
  try {
    checkExerciseBody(c, exercise);
  } catch (error) {
    c.error('exercise.shape', `The exercise could not be checked (${error instanceof Error ? error.message : String(error)}). Compare it with the example for "${exercise.type}" in the authoring guide.`);
  }
  if (PLAY_TYPES.has(exercise.type)) checkAlternative(c, (exercise as { alternative?: ExerciseStep }).alternative);

  // Grading must work: the exercise's own answer is right and nothing it offers as wrong is right.
  if (!c.problems.some((p) => p.severity === 'error')) {
    const gradeCtx = { level: ctx.level };
    const own = grade(exercise, solve(exercise), gradeCtx);
    if (!own.correct) {
      c.error('exercise.ungradable', 'The grader does not accept the exercise\'s own answer. Check that the data is consistent (the answer, the figure and what the prompt asks for).');
    } else {
      for (const wrong of wrongAnswers(exercise)) {
        if (grade(exercise, wrong, gradeCtx).correct) {
          c.error('exercise.distractor', `A wrong option is graded as right: ${JSON.stringify(wrong)}. A distractor must never be a correct answer; change or remove it.`);
          break;
        }
      }
    }
  }
  return c.problems;
}

/** Everything that is wrong with a teaching card. */
export function cardProblems(card: CardStep, ctx: CheckContext = {}): StepProblem[] {
  const c = new Collector(ctx);
  if (card.id !== undefined && !SLUG.test(card.id)) c.error('id.format', `The id "${card.id}" is not a slug. Use lower-case letters, digits and single hyphens.`);
  c.text(card.title, 'cardTitle', 'The card title', { optional: true });
  c.text(card.body, 'cardBody', 'The card body');
  c.text(card.tip, 'cardTip', 'The card tip', { optional: true });
  c.figure(card.figure, 'The figure');
  return c.problems;
}

/** Seeds and difficulties a generated step is tried with during validation. */
const TRIAL_RUNS: ReadonlyArray<{ seed: number; difficulty: number }> = [
  { seed: 1, difficulty: 0 }, { seed: 2, difficulty: 0.3 }, { seed: 3, difficulty: 0.6 }, { seed: 4, difficulty: 1 }, { seed: 5, difficulty: 0.3 }, { seed: 6, difficulty: 1 },
];

// Trying a generator out is the slow part of validation, and content repeats the same generated
// steps many times (drills, checkpoints, alternatives): remember each verdict.
const TRIED = new Map<string, StepProblem[]>();

/** Everything that is wrong with a generated step: its params, and the exercises it actually produces. */
export function generatedProblems(step: Extract<Step, { generate: unknown }>, ctx: CheckContext = {}): StepProblem[] {
  let key: string | null = null;
  try {
    key = JSON.stringify([step.generate, step.params ?? {}, step.seed ?? null, ctx.level ?? 'beginner']);
  } catch {
    key = null;
  }
  const known = key === null ? undefined : TRIED.get(key);
  if (known) return known.map((p) => ({ ...p }));
  const found = tryGenerator(step, ctx);
  if (key !== null) {
    if (TRIED.size > 2000) TRIED.clear();
    TRIED.set(key, found);
  }
  return found.map((p) => ({ ...p }));
}

function tryGenerator(step: Extract<Step, { generate: unknown }>, ctx: CheckContext): StepProblem[] {
  const problems: StepProblem[] = generatorProblems(step).map((message) => ({ code: 'generator.params', severity: 'error' as const, message }));
  if (problems.length > 0) return problems;
  const def = getGenerator(String(step.generate))!;
  for (const run of TRIAL_RUNS) {
    let exercise: Exercise;
    try {
      exercise = def.make((step.params ?? {}) as never, { rng: createRng(step.seed ?? run.seed), difficulty: run.difficulty, level: ctx.level ?? 'beginner' });
    } catch (error) {
      problems.push({ code: 'generator.failed', severity: 'error', message: `The ${def.kind} generator fails with these params (${error instanceof Error ? error.message : String(error)}). Loosen or correct the params.` });
      break;
    }
    const found = exerciseProblems(exercise, ctx).filter((p) => p.severity === 'error');
    if (found.length > 0) {
      problems.push({ code: 'generator.output', severity: 'error', message: `With these params the ${def.kind} generator can produce a faulty exercise: ${found[0].message} Adjust the params (for example a wider range or a larger pool).` });
      break;
    }
  }
  return problems;
}


/** Everything that is wrong with any step: a card, a literal exercise or a generated one. */
export function stepProblems(step: Step, ctx: CheckContext = {}): StepProblem[] {
  if (!step || typeof step !== 'object') return [{ code: 'exercise.shape', severity: 'error', message: 'The step is not an object. A step is a card ({ type: \'card\' }), an exercise ({ type: \'choice\' } ...) or a generated exercise ({ generate: ... }).' }];
  if (isGenerated(step)) return generatedProblems(step, ctx);
  if (step.type === 'card') return cardProblems(step, ctx);
  return exerciseProblems(step, ctx);
}
