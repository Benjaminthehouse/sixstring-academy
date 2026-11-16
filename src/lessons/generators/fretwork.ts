/**
 * Generators about the guitar itself: CAGED shapes up the neck, capo arithmetic and natural
 * harmonics. Shapes come from the guitar engine's chord library, pitches from `midiAt`, chord
 * names from the theory engine.
 */
import { chordVoicings, libraryVoicings, midiAt, spellMidi, type Voicing } from '@/core/guitar';
import { parseChord, parseNote, simplestTonic, transposeChordBySemitones } from '@/core/theory';
import { MAX_FRET } from '../limits';
import type { FretboardFigure, FretDot, TypeAnswerExercise } from '../types';
import type { CagedLetter } from './params';
import { checkParams, choiceOf, count, defineGenerator, distinct, pool } from './core';

const LETTERS: readonly CagedLetter[] = ['C', 'A', 'G', 'E', 'D'];
const SHAPES_EASY_FIRST: CagedLetter[] = ['E', 'A', 'D', 'C', 'G'];
const CAGED_ROOTS = ['C', 'D', 'G', 'A', 'E', 'F', 'Bb'];

const pcOf = (name: string): number => parseNote(name)?.chroma ?? -1;

/** A chord symbol with the root spelled the plain way for its quality (B♭, not A♯; G♯m, not A♭m). */
export function plainChord(rootPc: number, typeSymbol: string): string {
  const minorish = /^m(?!aj)/.test(typeSymbol) || typeSymbol === 'dim';
  return `${simplestTonic(((rootPc % 12) + 12) % 12, minorish ? 'minor' : 'major')}${typeSymbol}`;
}

/** The library's CAGED voicing of a chord in one shape, or null. */
export function cagedVoicing(symbol: string, shape: CagedLetter): Voicing | null {
  return libraryVoicings(symbol, { categories: ['caged', 'barre'] }).find((v) => v.shape === shape) ?? null;
}

const symbolOf = (root: string, quality: 'major' | 'minor'): string => `${root}${quality === 'minor' ? 'm' : ''}`;

export const cagedShape = defineGenerator({
  kind: 'caged-shape',
  summary: 'A chord shape is drawn up the neck: name its CAGED shape, or the chord it plays.',
  produces: ['choice'],
  params: [
    { name: 'ask', type: "'shape' | 'chord'", default: "'shape'", description: 'Which CAGED shape it is; or which chord it plays.' },
    { name: 'shapes', type: "('C' | 'A' | 'G' | 'E' | 'D')[]", default: "['E', 'A', 'D', 'C', 'G']", description: 'Shapes in play, easiest first (the options of a shape question).' },
    { name: 'roots', type: 'string[]', default: 'C D G A E F Bb', description: 'Chord roots, easiest first.' },
    { name: 'qualities', type: "('major' | 'minor')[]", default: "['major']", description: 'Major chords, minor chords, or both (minor has no G shape).' },
  ],
  check: (p) => {
    const check = checkParams()
      .oneOf('ask', p.ask, ['shape', 'chord'])
      .list('shapes', p.shapes, (s) => LETTERS.includes(s), "['E', 'A']", 2)
      .notes('roots', p.roots)
      .list('qualities', p.qualities, (q) => q === 'major' || q === 'minor', "['major', 'minor']");
    if (check.problems.length > 0) return check.problems;
    const shapes = p.shapes ?? SHAPES_EASY_FIRST;
    for (const quality of p.qualities ?? ['major']) {
      for (const root of p.roots ?? CAGED_ROOTS) {
        const missing = shapes.filter((s) => !cagedVoicing(symbolOf(root, quality), s));
        if (missing.length === shapes.length) check.need(false, `The chord library has none of the shapes ${shapes.join(', ')} for ${symbolOf(root, quality)}. Change "roots", "shapes" or "qualities".`);
      }
    }
    return check.problems;
  },
  make(p, { rng, difficulty }) {
    const shapes = p.shapes ?? SHAPES_EASY_FIRST;
    const inPlay = pool(shapes, difficulty, 2);
    const roots = pool(p.roots ?? CAGED_ROOTS, difficulty, 3);
    const qualities = p.qualities ?? ['major'];
    const options: Array<{ symbol: string; shape: CagedLetter; voicing: Voicing }> = [];
    for (const quality of qualities) {
      for (const root of roots) {
        for (const shape of inPlay) {
          const voicing = cagedVoicing(symbolOf(root, quality), shape);
          if (voicing) options.push({ symbol: symbolOf(root, quality), shape, voicing });
        }
      }
    }
    // check() guarantees one exists among all roots and shapes; at low difficulty fall back to those.
    const all = options.length > 0 ? options : (p.roots ?? CAGED_ROOTS).flatMap((root) => qualities.flatMap((q) => shapes.map((shape) => ({ symbol: symbolOf(root, q), shape, voicing: cagedVoicing(symbolOf(root, q), shape)! })))).filter((o) => o.voicing);
    const pick = rng.pick(all);
    const { symbol, shape, voicing } = pick;
    const minor = /m$/.test(symbol);
    const fretted = voicing.notes.map((n) => n.fret);
    const low = Math.min(...fretted.filter((f) => f > 0), 99);
    const figure: FretboardFigure = {
      kind: 'fretboard',
      frets: [Math.max(0, low - 1), Math.max(...fretted, low + 3)],
      labels: 'none',
      dots: voicing.notes.map((n): FretDot => ({ string: n.string, fret: n.fret, label: n.isRoot ? 'R' : n.degree, role: n.isRoot ? 'root' : n.role === 'third' ? 'third' : n.role === 'fifth' ? 'fifth' : 'tone' })),
    };
    const lowestRoot = voicing.notes.filter((n) => n.isRoot).sort((a, b) => b.string - a.string)[0];
    const open = `${shape}${minor ? 'm' : ''}`;
    const explain = `It is the open {c:${open}} grip moved up the neck: the ${shape} shape. Its lowest root (R) is on string ${lowestRoot.string}, fret ${lowestRoot.fret}: {n:${lowestRoot.note}}, so it plays {c:${symbol}}.`;
    if ((p.ask ?? 'shape') === 'chord') {
      const typeSymbol = minor ? 'm' : '';
      const rootPc = pcOf(lowestRoot.note);
      // Its own open name, a fret off, and the note under the same fret one string thicker.
      const thicker = lowestRoot.string < 6 ? midiAt({ string: lowestRoot.string + 1, fret: lowestRoot.fret }) % 12 : (rootPc + 5) % 12;
      const rivals = [open, plainChord(rootPc + 1, typeSymbol), plainChord(rootPc + 11, typeSymbol), plainChord(thicker, typeSymbol), plainChord(rootPc + 2, typeSymbol)];
      return choiceOf(
        rng,
        { prompt: 'Which chord does this shape play? R marks the root.', explain, figure },
        `{c:${symbol}}`,
        distinct(rivals, (s) => pcOf(parseChord(s)!.root), 3, [rootPc]).map((s) => `{c:${s}}`),
      );
    }
    // The shapes taught so far, always in C A G E D order: the learner thinks about the picture, not the list.
    const taught = LETTERS.filter((s) => shapes.includes(s));
    const exercise = choiceOf(
      rng,
      { prompt: `Which CAGED shape is this ${minor ? 'minor' : 'major'} chord? R marks the root.`, explain, figure, shuffle: false },
      `${shape} shape`,
      taught.filter((s) => s !== shape).map((s) => `${s} shape`),
    );
    exercise.options.sort((a, b) => LETTERS.indexOf(String(a.text)[0] as CagedLetter) - LETTERS.indexOf(String(b.text)[0] as CagedLetter));
    return exercise;
  },
});

// ── Capo ───────────────────────────────────────────────────────────────────────────────────────

const CAPO_SHAPES = ['G', 'C', 'D', 'A', 'E', 'Em', 'Am', 'Dm'];
const CAPOS = [2, 3, 1, 4, 5, 7];

/** What a shape sounds with a capo: every string raised by `capo` half steps. */
export function capoSounds(shape: string, capo: number): string {
  const chord = parseChord(shape)!;
  return plainChord(pcOf(chord.root) + capo, chord.type.symbol);
}

/** True when a chord has an open-position shape in the chord library. */
function hasOpenShape(symbol: string): boolean {
  try {
    const v = chordVoicings(symbol)[0];
    return !!v && v.category === 'open';
  } catch {
    return false;
  }
}

export const capoMath = defineGenerator({
  kind: 'capo-math',
  summary: 'Capo arithmetic: which chord a shape sounds with a capo, which shape gives a chord, or where the capo goes.',
  produces: ['choice', 'type-answer'],
  params: [
    { name: 'ask', type: "'sounds' | 'shape' | 'capo'", default: "'sounds'", description: 'Capo and shape given: which chord sounds; chord given: which shape; or which fret the capo goes on.' },
    { name: 'shapes', type: 'string[]', default: 'G C D A E Em Am Dm', description: 'Open shapes, easiest first (each needs an open shape in the chord library).' },
    { name: 'capos', type: 'number[]', default: '[2, 3, 1, 4, 5, 7]', description: 'Capo frets, easiest first, 1 to 9.' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('ask', p.ask, ['sounds', 'shape', 'capo'])
      .list('shapes', p.shapes, (s) => typeof s === 'string' && parseChord(s) !== null && hasOpenShape(s), "['G', 'C', 'Em'] (open shapes)", p.ask === 'shape' ? 2 : 1)
      .need(!p.shapes || new Set(p.shapes.map((s) => (parseChord(s) ? `${pcOf(parseChord(s)!.root)}${parseChord(s)!.type.symbol}` : s))).size === p.shapes.length, '"shapes" lists one chord twice. List each once.')
      .list('capos', p.capos, (c) => Number.isInteger(c) && c >= 1 && c <= 9, '[2, 3, 5]').problems,
  make(p, { rng, difficulty }) {
    const shapes = pool(p.shapes ?? CAPO_SHAPES, difficulty, 3);
    const capo = rng.pick(pool(p.capos ?? CAPOS, difficulty, 2));
    const shape = rng.pick(shapes);
    const sounds = capoSounds(shape, capo);
    const raise = `A capo on fret ${capo} raises every string ${count(capo, 'half step')}, so the {c:${shape}} shape sounds ${count(capo, 'half step')} higher: {c:${sounds}}.`;
    const ask = p.ask ?? 'sounds';
    if (ask === 'capo') {
      const out: TypeAnswerExercise = {
        type: 'type-answer',
        answer: { kind: 'number', value: capo },
        input: 'keypad',
        prompt: `On which fret does the capo go, so that the {c:${shape}} shape sounds {c:${sounds}}?`,
        explain: `From {n:${parseChord(shape)!.root}} up to {n:${parseChord(sounds)!.root}} is ${count(capo, 'half step')}, so the capo goes on fret ${capo}.`,
      };
      return out;
    }
    if (ask === 'shape') {
      const others = rng.shuffle((p.shapes ?? CAPO_SHAPES).filter((s) => s !== shape && capoSounds(s, capo) !== sounds));
      return choiceOf(
        rng,
        { prompt: `You want {c:${sounds}} with the capo on fret ${capo}. Which open shape do you play?`, explain: `Count ${count(capo, 'half step')} down from {c:${sounds}}: {c:${shape}}. ${raise}` },
        `{c:${shape}}`,
        others.slice(0, 3).map((s) => `{c:${s}}`),
      );
    }
    const typeSymbol = parseChord(shape)!.type.symbol;
    const rootPc = pcOf(parseChord(shape)!.root);
    // The shape's own name, a fret off either way, and the capo counted downwards.
    const rivals = [shape, plainChord(rootPc + capo - 1, typeSymbol), plainChord(rootPc + capo + 1, typeSymbol), plainChord(rootPc - capo + 12, typeSymbol)];
    return choiceOf(
      rng,
      { prompt: `With a capo on fret ${capo}, you play the {c:${shape}} shape. Which chord sounds?`, explain: raise },
      `{c:${sounds}}`,
      distinct(rivals, (s) => pcOf(parseChord(s)!.root), 3, [pcOf(parseChord(sounds)!.root)]).map((s) => `{c:${s}}`),
    );
  },
});

// ── Natural harmonics ──────────────────────────────────────────────────────────────────────────

/** Into how many equal parts touching a string over this fret divides it (the harmonic number). */
export const HARMONIC_PARTS: Readonly<Record<number, number>> = { 12: 2, 7: 3, 19: 3, 5: 4, 4: 5, 9: 5, 16: 5 };

/** Half steps from the open string to the harmonic that sounds with this many parts (rounded to the nearest note). */
export const HARMONIC_SEMITONES: Readonly<Record<number, number>> = { 2: 12, 3: 19, 4: 24, 5: 28 };

const HARMONIC_WORDS: Record<number, string> = { 2: 'an octave', 3: 'an octave and a fifth', 4: 'two octaves', 5: 'two octaves and a major third (a little flat)' };
const HARMONIC_FRETS = [12, 7, 5, 19, 4, 9, 16];

export const naturalHarmonic = defineGenerator({
  kind: 'natural-harmonic',
  summary: 'Natural harmonics: which note rings when a string is touched over fret 12, 7, 5 ..., or where a harmonic is.',
  produces: ['choice', 'type-answer'],
  params: [
    { name: 'ask', type: "'note' | 'fret'", default: "'note'", description: 'Which note rings over a fret; or over which fret a harmonic rings.' },
    { name: 'frets', type: 'number[]', default: '[12, 7, 5]', description: 'Harmonic frets, easiest first: 12, 7, 5, 19, 4, 9, 16.' },
    { name: 'strings', type: 'number[]', default: '[6, 5, 4, 3, 2, 1]', description: 'Strings to draw from.' },
  ],
  check: (p) =>
    checkParams()
      .oneOf('ask', p.ask, ['note', 'fret'])
      .list('frets', p.frets, (f) => HARMONIC_FRETS.includes(f), '[12, 7, 5] (from 12, 7, 5, 19, 4, 9, 16)')
      .list('strings', p.strings, (s) => Number.isInteger(s) && s >= 1 && s <= 6, '[6, 5]').problems,
  make(p, { rng, difficulty }) {
    const fret = rng.pick(pool(p.frets ?? [12, 7, 5], difficulty, 2));
    const string = rng.pick(p.strings ?? [6, 5, 4, 3, 2, 1]);
    const parts = HARMONIC_PARTS[fret];
    const openMidi = midiAt({ string, fret: 0 });
    const midi = openMidi + HARMONIC_SEMITONES[parts];
    const name = spellMidi(midi, { prefer: 'sharps' });
    const openName = spellMidi(openMidi, { prefer: 'sharps' });
    const why = `Touching string ${string} over fret ${fret} splits it into ${parts} equal parts, so it rings ${parts} times as fast as open: ${HARMONIC_WORDS[parts]} above {n:${openName}}, {n:${name}}.`;
    if ((p.ask ?? 'note') === 'fret') {
      const same = HARMONIC_FRETS.filter((f) => HARMONIC_PARTS[f] === parts && f <= MAX_FRET).sort((a, b) => a - b);
      const out: TypeAnswerExercise = {
        type: 'type-answer',
        answer: same.length > 1 ? { kind: 'number', value: same[0], accept: same.slice(1) } : { kind: 'number', value: same[0] },
        input: 'keypad',
        prompt: `Over which fret do you touch string ${string} lightly to ring the harmonic {n:${name}}?`,
        explain: `{n:${name}} is ${HARMONIC_WORDS[parts]} above the open {n:${openName}}: ${parts} times its speed, so the string must split into ${parts}. That happens over fret ${same.join(' or ')}.`,
      };
      return out;
    }
    // The fretted note at that fret, the open string itself, and the harmonics of the other frets.
    const rivals = [midiAt({ string, fret }), openMidi, ...[2, 3, 4, 5].map((n) => openMidi + HARMONIC_SEMITONES[n])];
    const wrong = distinct(rivals, (m) => m, 3, [midi]);
    return choiceOf(
      rng,
      {
        prompt: `Touch string ${string} lightly right over fret ${fret}, without pressing, and pick it. Which note rings?`,
        explain: why,
      },
      `{n:${name}}`,
      wrong.map((m) => `{n:${spellMidi(m, { prefer: 'sharps' })}}`),
    );
  },
});

/** The fretwork generators. */
export const FRETWORK_GENERATORS = [cagedShape, capoMath, naturalHarmonic] as const;
