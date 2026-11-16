/**
 * What to tell a learner whose chord shape is not the one asked for, in plain words a beginner
 * understands: which string sounds a note that is not in the chord, which chord note nothing
 * plays, what the bass of a slash chord must be. A shape is named ("That shape is C") only when it
 * is a common chord the course has taught: a name like "Cmaj7/E" helps nobody who has not met it.
 */
import { midiAt, spellMidi, tuning as resolveTuning, voicingProblem } from '@/core/guitar';
import { chordNotes, chordPcs, parseChord, parseNote } from '@/core/theory';

/** Chord qualities common enough to name to a learner. */
const COMMON_TYPES = new Set(['major', 'minor', '7', 'm7', 'maj7', 'sus2', 'sus4', '5']);

/**
 * The chord a wrong shape makes, when naming it would help: a common chord (plain major, minor,
 * seventh, sus or power chord on a common root, no slash bass) that is in `taught` when that list
 * is given. Null otherwise, and when it is the requested chord itself.
 */
export function nameableChord(built: string | null, requested: string, taught?: readonly string[]): string | null {
  if (!built) return null;
  const c = parseChord(built);
  const want = parseChord(requested);
  if (!c || !want) return null;
  if (c.bass && parseNote(c.bass)?.chroma !== parseNote(c.root)?.chroma) return null;
  if (!COMMON_TYPES.has(c.type.id)) return null;
  if (Math.abs(parseNote(c.root)?.alt ?? 9) > 1) return null;
  if (c.symbol === want.symbol) return null;
  if (taught && !taught.some((t) => parseChord(t)?.symbol === c.symbol)) return null;
  return c.symbol;
}

function list(words: readonly string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** What a chord-build shape gets wrong, and how it is checked. */
export interface ChordShapeInput {
  chord: string;
  /** The learner's shape, low string first (null = not played). */
  frets: ReadonlyArray<number | null>;
  /** The shape the exercise shows as its answer. */
  reference: ReadonlyArray<number | null> | null;
  accept: 'any-voicing' | 'this-shape';
  tuning?: string;
  capo?: number;
  /** What the shape makes, as the guitar engine names it. */
  built: string | null;
  /** Chords the course has taught (see `GradeContext.chordsTaught`). */
  taught?: readonly string[];
}

/**
 * One or two plain sentences about a wrong chord shape, as rich-text markup, or undefined when
 * there is nothing specific to say. The right box itself is shown by the screen.
 */
export function chordBuildNote(input: ChordShapeInput): string | undefined {
  const chord = parseChord(input.chord);
  if (!chord) return undefined;
  let count = 6;
  try {
    count = resolveTuning(input.tuning).stringCount;
  } catch {
    /* default six strings */
  }
  const opts = { tuning: input.tuning, capo: input.capo };
  const played: Array<{ string: number; fret: number; midi: number }> = [];
  input.frets.forEach((f, i) => {
    if (f === null || f === undefined) return;
    try {
      played.push({ string: count - i, fret: f, midi: midiAt({ string: count - i, fret: f }, opts) });
    } catch {
      /* off the neck: the grader already refused the shape */
    }
  });
  if (played.length === 0) return 'No string is played yet: put your fingers down, or let some strings ring open.';
  const sym = `{c:${chord.symbol}}`;
  const name = (midi: number): string => `{n:${spellMidi(midi, { chord: chord.symbol }, { octave: false })}}`;
  const parts: string[] = [];

  const named = nameableChord(input.built, chord.symbol, input.taught);
  if (named) parts.push(`That shape is {c:${named}}.`);

  const pcs = new Set(chordPcs(chord));
  const strangers = played.filter((p) => !pcs.has(((p.midi % 12) + 12) % 12)).sort((a, b) => b.string - a.string);
  if (strangers.length > 0) {
    const shown = strangers.slice(0, 2);
    parts.push(
      shown.length === 1
        ? `String ${shown[0].string} sounds ${name(shown[0].midi)}, which is not in ${sym}.`
        : `Strings ${list(shown.map((s) => String(s.string)))} sound ${list(shown.map((s) => name(s.midi)))}, which are not in ${sym}.`,
    );
    return parts.join(' ');
  }

  const sounded = new Set(played.map((p) => ((p.midi % 12) + 12) % 12));
  let why: string | null = null;
  try {
    why = voicingProblem(chord.symbol, [...input.frets], opts);
  } catch {
    why = null;
  }
  if (why && why.startsWith('lacks')) {
    const missing = chordNotes(chord).filter((n) => !sounded.has(parseNote(n)!.chroma));
    if (missing.length > 0) {
      parts.push(`No string plays ${list(missing.map((n) => `{n:${n}}`))}, and ${sym} needs ${missing.length === 1 ? 'it' : 'them'}: it is ${list(chordNotes(chord).map((n) => `{n:${n}}`))}.`);
      return parts.join(' ');
    }
  }
  if (chord.bass) {
    const lowest = played.reduce((a, b) => (b.midi < a.midi ? b : a));
    if (((lowest.midi % 12) + 12) % 12 !== parseNote(chord.bass)!.chroma) {
      parts.push(`The lowest string you play sounds ${name(lowest.midi)}; ${sym} needs {n:${chord.bass}} at the bottom.`);
      return parts.join(' ');
    }
  }
  if (why && why.startsWith('no hand')) {
    parts.push('No hand can hold that shape: keep the fingers within four frets of each other.');
    return parts.join(' ');
  }
  if (input.accept === 'this-shape' && input.reference) {
    const differ: string[] = [];
    input.reference.forEach((f, i) => {
      if (f === input.frets[i]) return;
      const string = count - i;
      differ.push(`string ${string} ${f === null ? 'is not played' : f === 0 ? 'rings open' : `is pressed at fret ${f}`}`);
    });
    if (differ.length > 0) {
      const shown = list(differ.slice(0, 2)) + (differ.length > 2 ? `, and ${differ.length - 2} more ${differ.length - 2 === 1 ? 'string differs' : 'strings differ'}` : '');
      parts.push(why ? `In the box, ${shown}.` : `That is ${sym} too, but this one asks for the shape in the box, where ${shown}.`);
      return parts.join(' ');
    }
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}
