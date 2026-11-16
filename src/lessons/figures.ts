/**
 * Figures are data (`{ kind, ...data }`); this file checks them and computes what a renderer needs.
 *
 *   figureProblems(figure)   everything that is wrong, each with how to fix it (used by validateCourse)
 *   resolveFigure(figure)    the figure with every computed fact filled in: pitches, spelled notes,
 *                            degrees, staff positions, key-signature accidentals, counting, events
 *
 * A screen renders the resolved form and never does music maths itself. All facts come from the
 * theory and guitar engines.
 */
import {
  chordVoicings, identifyFretted, midiAt, parseFrets, scalePositions, positionsForPitchClass, arpeggioPositions, spellMidi,
  tryBuildVoicing, tuning as resolveTuning, voicingProblem, type Tuning, type Voicing,
} from '@/core/guitar';
import {
  circleOfFifths, getKey, getScale, keySignaturePositions, parseChord, parseNote, parseTimeSignature, semitonesToDegree,
  staffPosition, type Key,
} from '@/core/theory';
import { COUNT_LIMITS, MAX_FRET } from './limits';
import { parseDuration, parseRhythm, parseStrum, type ParsedRhythm, type RhythmEvent, type StrumSlot } from './rhythm';
import { soundPlan, soundProblems, tabProblems, type SoundPlan } from './sound';
import { inferSpelling, keySpelling, spellPitch, spellingOfName, tabMidi, type SpellContext } from './spelling';
import type {
  AudioFigure, ChordFigure, CircleFigure, DotRole, Figure, FretboardFigure, FretDot, KeyboardFigure, RhythmFigure,
  StaffAccidental, StaffFigure, TabFigure,
} from './types';

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────

function tuningOf(id: string | undefined): Tuning | null {
  try {
    return resolveTuning(id);
  } catch {
    return null;
  }
}

function tuningProblem(id: string | undefined): string[] {
  return tuningOf(id) ? [] : [`"${id}" is not a tuning the guitar engine knows. Use an id such as standard, drop-d or open-g.`];
}

function capoProblem(capo: number | undefined): string[] {
  return capo === undefined || (Number.isInteger(capo) && capo >= 0 && capo <= 12) ? [] : [`Capo ${capo} is not possible. Use a whole fret from 0 to 12.`];
}

/** Why a position is not on the neck, or null when it is. */
export function positionProblem(pos: { string: number; fret: number }, opts: { tuning?: string; capo?: number } = {}): string | null {
  const t = tuningOf(opts.tuning);
  if (!t) return `"${opts.tuning}" is not a known tuning.`;
  const maxFret = MAX_FRET - (opts.capo ?? 0);
  if (!Number.isInteger(pos.string) || pos.string < 1 || pos.string > t.stringCount) {
    return `string ${pos.string} does not exist (strings are 1 to ${t.stringCount}, 1 is the thinnest)`;
  }
  if (!Number.isInteger(pos.fret) || pos.fret < 0 || pos.fret > maxFret) {
    return `fret ${pos.fret} is not on the neck (0 to ${maxFret}, 0 is the open string)`;
  }
  return null;
}

/** Pitch class 0–11 of a root name, or null. */
function rootPc(root: string | undefined): number | null {
  return root === undefined ? null : (parseNote(root)?.chroma ?? null);
}

/** The frets range to draw: the declared one, widened to hold every dot. Frets count from the capo. */
function fretWindow(declared: [number, number] | undefined, dotFrets: readonly number[]): [number, number] {
  let [lo, hi] = declared ?? [0, 4];
  for (const fret of dotFrets) {
    lo = Math.min(lo, fret);
    hi = Math.max(hi, fret);
  }
  return [lo, hi];
}

/**
 * The frets ON THE WOOD that show a window counted from a capo (what the drawn board takes): the
 * window moves up by the capo, and a window that starts at the capo shows the nut and the capo
 * too when the board stays within the widest a phone shows. Without a capo it is the window itself.
 */
export function boardFrets(window: [number, number], capo: number): [number, number] {
  if (!capo) return window;
  const [lo, hi] = window;
  const top = hi + capo;
  const from = lo > 0 ? lo + capo : top + 1 <= COUNT_LIMITS.fretSpan[1] ? 0 : capo;
  return [from, top];
}

function roleOfDegree(degree: string): DotRole {
  const n = degree.replace(/[b#]/g, '');
  return n === '1' ? 'root' : n === '3' ? 'third' : n === '5' ? 'fifth' : n === '7' ? 'seventh' : 'tone';
}

// ── Fretboard ──────────────────────────────────────────────────────────────────────────────────

/** A fretboard dot with everything computed. */
export interface ResolvedDot {
  string: number;
  fret: number;
  midi: number;
  /** Spelled note name without octave (`F#`). */
  note: string;
  /** Degree against the figure's root, or null without one. */
  degree: string | null;
  role: DotRole;
  /** Text to draw inside the dot ('' for none). */
  label: string;
  finger: number | null;
}

/** A fretboard figure ready to draw. */
export interface ResolvedFretboard {
  kind: 'fretboard';
  tuning: Tuning;
  capo: number;
  /** First and last fret of the window, counted from the capo (as the dots are). */
  frets: [number, number];
  /** The same window as frets on the wood, for the drawn board (`Fretboard`'s `frets` with `capo`). */
  board: [number, number];
  dots: ResolvedDot[];
  labels: 'note' | 'degree' | 'finger' | 'none';
  root: string | null;
  caption: FretboardFigure['caption'] | null;
}

function derivedDots(figure: FretboardFigure): FretDot[] {
  try {
    return derive(figure);
  } catch {
    // An unknown scale, chord or tuning: reported by figureProblems, drawn as nothing.
    return [];
  }
}

function derive(figure: FretboardFigure): FretDot[] {
  const d = figure.derive;
  if (!d) return [];
  const [minFret, maxFret] = figure.frets ?? [0, 4];
  const range = { tuning: figure.tuning, capo: figure.capo, minFret, maxFret };
  const wanted = (string: number): boolean => !figure.strings || figure.strings.includes(string);
  if ('scale' in d) {
    return scalePositions(d.tonic, d.scale, range)
      .filter((p) => wanted(p.string))
      .map((p) => ({ string: p.string, fret: p.fret, note: p.note, degree: p.degree, role: roleOfDegree(p.degree) }));
  }
  if ('chord' in d) {
    return arpeggioPositions(d.chord, range)
      .filter((p) => wanted(p.string))
      .map((p) => ({ string: p.string, fret: p.fret, note: p.note, degree: p.degree, role: roleOfDegree(p.degree) }));
  }
  const n = parseNote(d.note);
  if (!n) return [];
  return positionsForPitchClass(n.chroma, range)
    .filter((p) => wanted(p.string))
    .filter((p) => n.midi === null || midiAt(p, range) === n.midi)
    .map((p) => ({ string: p.string, fret: p.fret, note: n.pcName, role: 'target' as const }));
}

function fretboardProblems(figure: FretboardFigure): string[] {
  const problems = [...tuningProblem(figure.tuning), ...capoProblem(figure.capo)];
  if (problems.length > 0) return problems;
  const opts = { tuning: figure.tuning, capo: figure.capo };
  if (figure.frets) {
    const [lo, hi] = figure.frets;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi < lo || hi > MAX_FRET) {
      problems.push(`The fret range [${lo}, ${hi}] is not valid. Write [first, last] with 0 ≤ first ≤ last ≤ ${MAX_FRET}.`);
    } else if (hi - lo + 1 > COUNT_LIMITS.fretSpan[1]) {
      problems.push(`The fret range [${lo}, ${hi}] spans ${hi - lo + 1} frets; a phone shows ${COUNT_LIMITS.fretSpan[1]} at most. Narrow the range.`);
    }
  }
  if (figure.root !== undefined && rootPc(figure.root) === null) {
    problems.push(`The root "${figure.root}" is not a note. Write it like A or F#.`);
  }
  if (figure.key !== undefined && !keySpelling(figure.key)) problems.push(`"${figure.key}" is not a key. Write it like "A major" or "E minor".`);
  if (figure.derive) {
    const d = figure.derive;
    if ('scale' in d) {
      if (!getScale(d.scale)) problems.push(`"${d.scale}" is not a scale id. Use an id from the theory engine such as major or minor-pentatonic.`);
      if (!parseNote(d.tonic)) problems.push(`The tonic "${d.tonic}" is not a note. Write it like A or F#.`);
    } else if ('chord' in d) {
      if (!parseChord(d.chord)) problems.push(`"${d.chord}" is not a chord symbol. Write it like Am or G7.`);
    } else if (!parseNote(d.note)) {
      problems.push(`"${d.note}" is not a note. Write it like C or C4.`);
    }
    if (problems.length === 0 && derivedDots(figure).length === 0) {
      problems.push('Nothing to show: no derived note falls inside the fret range and strings given. Widen "frets" or change "strings".');
    }
  }
  if (!figure.derive && (!figure.dots || figure.dots.length === 0)) {
    problems.push('The fretboard has no dots. Add "dots" or a "derive" rule.');
  }
  const pc = rootPc(figure.root);
  const seen = new Set<string>();
  (figure.dots ?? []).forEach((dot, index) => {
    const where = `Dot ${index + 1} (string ${dot.string}, fret ${dot.fret})`;
    const bad = positionProblem(dot, opts);
    if (bad) {
      problems.push(`${where}: ${bad}. Move the dot to a real position.`);
      return;
    }
    const key = `${dot.string}:${dot.fret}`;
    if (seen.has(key)) problems.push(`${where} is listed twice. Remove the duplicate.`);
    seen.add(key);
    const midi = midiAt(dot, opts);
    if (dot.note !== undefined) {
      const claimed = parseNote(dot.note);
      if (!claimed) {
        problems.push(`${where} claims the note "${dot.note}", which is not a note name. Write it like C or F#3.`);
      } else if (claimed.chroma !== midi % 12 || (claimed.midi !== null && claimed.midi !== midi)) {
        problems.push(`${where} is ${spellMidi(midi)} on the neck, not ${dot.note}. Fix the note or move the dot.`);
      }
    }
    if (dot.degree !== undefined) {
      if (pc === null) {
        problems.push(`${where} claims the degree "${dot.degree}" but the figure has no "root". Add root: '<note>' to the figure.`);
      } else {
        const actual = (midi - pc + 120) % 12;
        const claimed = degreeSemitones(dot.degree);
        if (claimed === null) problems.push(`${where} claims the degree "${dot.degree}", which is not a degree label. Write it like 1, b3 or #4.`);
        else if (claimed !== actual) problems.push(`${where} is the ${semitonesToDegree(actual)} of ${figure.root}, not the ${dot.degree}. Fix the degree or move the dot.`);
      }
    }
    if (figure.frets && (dot.fret < figure.frets[0] || dot.fret > figure.frets[1]) && dot.fret !== 0) {
      problems.push(`${where} lies outside the fret range [${figure.frets[0]}, ${figure.frets[1]}]. Widen the range or move the dot.`);
    }
  });
  return problems;
}

const DEGREE_SEMITONES: Record<string, number> = { '1': 0, '2': 2, '3': 4, '4': 5, '5': 7, '6': 9, '7': 11 };

/** Semitones above the root of a degree label (`b3` -> 3), folded into one octave. Null when it is not a degree. */
export function degreeSemitones(label: string): number | null {
  const match = /^(b{1,2}|#{1,2})?(\d{1,2})$/.exec(label);
  if (!match) return null;
  const number = ((parseInt(match[2], 10) - 1) % 7) + 1;
  const base = DEGREE_SEMITONES[String(number)];
  if (base === undefined) return null;
  const alt = match[1] ? (match[1][0] === 'b' ? -match[1].length : match[1].length) : 0;
  return (((base + alt) % 12) + 12) % 12;
}

function resolveFretboard(figure: FretboardFigure): ResolvedFretboard {
  const tuning = tuningOf(figure.tuning) ?? resolveTuning();
  const capo = figure.capo ?? 0;
  const opts = { tuning: figure.tuning, capo };
  const labels = figure.labels ?? 'note';
  const derive = figure.derive;
  const root = figure.root ?? (derive && 'scale' in derive ? derive.tonic : derive && 'chord' in derive ? (parseChord(derive.chord)?.root ?? null) : null);
  const pc = rootPc(root ?? undefined);
  const byKey = new Map<string, FretDot>();
  for (const dot of derivedDots(figure)) byKey.set(`${dot.string}:${dot.fret}`, dot);
  // Hand-placed dots win over derived ones at the same place.
  for (const dot of figure.dots ?? []) byKey.set(`${dot.string}:${dot.fret}`, { ...byKey.get(`${dot.string}:${dot.fret}`), ...dot });
  const context = fretboardSpelling(figure, [...byKey.values()], opts);

  const dots: ResolvedDot[] = [];
  for (const dot of byKey.values()) {
    if (positionProblem(dot, opts)) continue;
    const midi = midiAt(dot, opts);
    const note = dot.note ? (parseNote(dot.note)?.pcName ?? dot.note) : spellPitch(midi, context, { octave: false });
    const degree = dot.degree ?? (pc === null ? null : semitonesToDegree((midi - pc + 120) % 12));
    const role = dot.role ?? (degree ? roleOfDegree(degree) : 'tone');
    const label = dot.label ?? (labels === 'note' ? note : labels === 'degree' ? (degree ?? note) : labels === 'finger' ? (dot.finger ? String(dot.finger) : '') : '');
    dots.push({ string: dot.string, fret: dot.fret, midi, note, degree, role, label, finger: dot.finger ?? null });
  }
  dots.sort((a, b) => b.string - a.string || a.fret - b.fret);
  const frets = fretWindow(figure.frets, dots.map((d) => d.fret));
  return { kind: 'fretboard', tuning, capo, frets, board: boardFrets(frets, capo), dots, labels, root: root ?? null, caption: figure.caption ?? null };
}

/**
 * How the unclaimed dots of a fretboard figure are named: its `key`, else its derived scale or
 * chord, else the sharps or flats its claimed notes use, else the key all its dots imply.
 */
function fretboardSpelling(figure: FretboardFigure, dots: readonly FretDot[], opts: { tuning?: string; capo?: number }): SpellContext | undefined {
  const fromKey = keySpelling(figure.key);
  if (fromKey) return fromKey;
  const d = figure.derive;
  if (d && 'scale' in d) return { tonic: d.tonic, scale: d.scale };
  if (d && 'chord' in d) return { chord: d.chord };
  for (const dot of dots) {
    const claimed = spellingOfName(dot.note);
    if (claimed) return claimed;
  }
  const midis: number[] = [];
  for (const dot of dots) {
    if (positionProblem(dot, opts)) continue;
    midis.push(midiAt(dot, opts));
  }
  return inferSpelling(midis) ?? undefined;
}

// ── Chord ──────────────────────────────────────────────────────────────────────────────────────

/** A chord figure ready to draw. */
export interface ResolvedChord {
  kind: 'chord';
  /** The chord symbol, or null when a bare shape makes no chord the catalog knows. */
  symbol: string | null;
  /** Frets low to high; null = muted. */
  frets: Array<number | null>;
  /** Fingers low to high (0 open, null muted). */
  fingers: Array<number | null>;
  barres: Voicing['barres'];
  /** First fret shown by the diagram. */
  baseFret: number;
  /** Sounding notes, lowest string first. */
  notes: Array<{ string: number; fret: number; midi: number; note: string; degree: string | null }>;
  midi: number[];
  tuning: Tuning;
  capo: number;
  /** The guitar engine's voicing (its capo, barres and fingering), for a chord box that draws a capo. Null for a bare shape the catalog cannot name. */
  voicing: Voicing | null;
  caption: ChordFigure['caption'] | null;
}

function parseFretsSafe(frets: ChordFigure['frets']): Array<number | null> | null {
  if (frets === undefined) return null;
  try {
    return typeof frets === 'string' ? parseFrets(frets) : [...frets];
  } catch {
    return null;
  }
}

/** The voicing a chord figure or exercise refers to: the given shape, or the first library voicing. */
export function voicingFor(symbol: string | undefined, frets: ChordFigure['frets'], opts: { tuning?: string; capo?: number; fingers?: string } = {}): Voicing | null {
  try {
    if (symbol !== undefined && frets !== undefined) return tryBuildVoicing(symbol, frets, opts);
    if (symbol !== undefined) return chordVoicings(symbol, { tuning: opts.tuning, capo: opts.capo })[0] ?? null;
  } catch {
    return null;
  }
  return null;
}

function chordProblems(figure: ChordFigure): string[] {
  const problems = [...tuningProblem(figure.tuning), ...capoProblem(figure.capo)];
  if (problems.length > 0) return problems;
  const t = tuningOf(figure.tuning)!;
  if (figure.symbol === undefined && figure.frets === undefined) {
    return ['The chord figure has neither "symbol" nor "frets". Give a chord symbol (Am7), a shape (x02010), or both.'];
  }
  if (figure.symbol !== undefined && !parseChord(figure.symbol)) {
    return [`"${figure.symbol}" is not a chord symbol. Write it like Am, G7 or Cmaj7.`];
  }
  if (figure.frets !== undefined) {
    const frets = parseFretsSafe(figure.frets);
    if (!frets) return [`The shape ${JSON.stringify(figure.frets)} cannot be read. Write one character per string, low to high, such as x32010, or an array with null for muted strings.`];
    if (frets.length !== t.stringCount) return [`The shape has ${frets.length} strings but ${t.name} tuning has ${t.stringCount}. Give one fret per string, low to high.`];
    if (frets.some((f) => f !== null && (!Number.isInteger(f) || f < 0 || f > MAX_FRET))) return [`The shape ${JSON.stringify(figure.frets)} uses a fret that is not on the neck (0 to ${MAX_FRET}).`];
    if (figure.symbol !== undefined) {
      const why = voicingProblem(figure.symbol, frets, { tuning: figure.tuning, capo: figure.capo, fingers: figure.fingers });
      if (why) problems.push(`The shape ${JSON.stringify(figure.frets)} is not ${figure.symbol}: ${why}. Fix the frets or the symbol.`);
    } else if (frets.every((f) => f === null)) {
      problems.push('Every string of the shape is muted. Give at least one played string.');
    }
  } else if (!voicingFor(figure.symbol, undefined, figure)) {
    problems.push(`The chord library has no shape for ${figure.symbol} in this tuning. Give the shape yourself with "frets".`);
  }
  return problems;
}

function resolveChord(figure: ChordFigure): ResolvedChord | null {
  const tuning = tuningOf(figure.tuning) ?? resolveTuning();
  const capo = figure.capo ?? 0;
  const opts = { tuning: figure.tuning, capo, fingers: figure.fingers };
  const caption = figure.caption ?? null;
  const voicing = voicingFor(figure.symbol, figure.frets, opts);
  if (voicing) {
    return {
      kind: 'chord',
      symbol: figure.symbol ?? voicing.chord,
      frets: [...voicing.frets],
      fingers: [...voicing.fingers],
      barres: voicing.barres,
      baseFret: voicing.baseFret,
      notes: voicing.notes.map((n) => ({ string: n.string, fret: n.fret, midi: n.midi, note: n.note, degree: n.degree })),
      midi: [...voicing.midi],
      tuning,
      capo,
      voicing,
      caption,
    };
  }
  const frets = parseFretsSafe(figure.frets);
  if (!frets || figure.symbol !== undefined) return null;
  try {
    const named = identifyFretted(frets, { tuning: figure.tuning, capo });
    const fretted = frets.filter((f): f is number => f !== null && f > 0);
    const low = fretted.length ? Math.min(...fretted) : 1;
    return {
      kind: 'chord',
      symbol: named.symbol,
      frets,
      fingers: frets.map((f) => (f === null ? null : 0)),
      barres: [],
      baseFret: Math.max(...fretted, 0) <= 4 ? 1 : low,
      notes: named.notes.map((n) => ({ string: n.string, fret: n.fret, midi: n.midi, note: n.note, degree: n.degree })),
      midi: named.notes.map((n) => n.midi),
      tuning,
      capo,
      voicing: null,
      caption,
    };
  } catch {
    return null;
  }
}

// ── Staff ──────────────────────────────────────────────────────────────────────────────────────

/** One note head of a resolved staff. */
export interface ResolvedStaffNote {
  /** Sounding pitch as given (`F#3`). */
  note: string;
  midi: number;
  /** 0 = bottom line, 1 = first space ... negative below the staff. */
  position: number;
  /** Positions of the ledger lines the note needs. */
  ledgerPositions: number[];
  /** The accidental that must be DRAWN before the note (the key signature already covers the rest). */
  accidental: StaffAccidental | null;
  stem: 'up' | 'down';
  duration: string | null;
  label: string | null;
}

/** A staff figure ready to draw. */
export interface ResolvedStaff {
  kind: 'staff';
  clef: 'treble' | 'bass';
  /** True when the notes are drawn an octave above their sounding pitch (guitar notation). */
  guitar: boolean;
  key: { name: string; fifths: number; accidentals: string[]; positions: number[] } | null;
  time: string | null;
  notes: ResolvedStaffNote[];
  caption: StaffFigure['caption'] | null;
}

/** Alteration the key signature gives a letter: +1, -1 or 0. */
export function keyAlteration(key: Key | null, letter: string): number {
  if (!key) return 0;
  const altered = key.signature.accidentals.find((a) => a[0] === letter);
  return altered ? (parseNote(altered)?.alt ?? 0) : 0;
}

/** The accidental sign a note needs in a key: none when the signature already says it. */
export function shownAccidental(noteName: string, key: Key | null): StaffAccidental | null {
  const n = parseNote(noteName);
  if (!n) return null;
  const fromKey = keyAlteration(key, n.letter);
  if (n.alt === fromKey) return null;
  return n.alt > 0 ? 'sharp' : n.alt < 0 ? 'flat' : 'natural';
}

function staffNotesOf(figure: StaffFigure): Array<{ note: string; duration?: string; label?: string }> {
  return figure.notes.map((n) => (typeof n === 'string' ? { note: n } : n));
}

function staffProblems(figure: StaffFigure): string[] {
  const problems: string[] = [];
  if (figure.key !== undefined && !getKey(figure.key)) problems.push(`"${figure.key}" is not a key. Write it like "G major" or "E minor".`);
  if (figure.time !== undefined && !parseTimeSignature(figure.time)) problems.push(`"${figure.time}" is not a time signature. Write it like 4/4 or 6/8.`);
  if (figure.notes.length === 0 && figure.key === undefined) problems.push('The staff is empty. Add notes, or a key to show its signature.');
  staffNotesOf(figure).forEach((entry, index) => {
    const n = parseNote(entry.note);
    if (!n) {
      problems.push(`Staff note ${index + 1} ("${entry.note}") is not a note. Write the sounding pitch with its octave, like E3 or F#4.`);
    } else if (n.midi === null) {
      problems.push(`Staff note ${index + 1} ("${entry.note}") has no octave. Write the sounding pitch with its octave: E2 is the low E string, E4 the high one.`);
    } else if (Math.abs(n.alt) > 1) {
      problems.push(`Staff note ${index + 1} ("${entry.note}") uses a double accidental, which the staff figure does not draw. Use a single sharp or flat.`);
    } else {
      const pos = staffPosition(n.name, { clef: figure.clef, guitar: figure.guitar });
      if (Math.abs(pos.ledgerLines) > 4) {
        problems.push(`Staff note ${index + 1} (${entry.note}) needs ${Math.abs(pos.ledgerLines)} ledger lines, too many to read. Keep notes within four ledger lines (E2 to E6 for guitar notation).`);
      }
    }
    if (entry.duration !== undefined && !parseDuration(entry.duration)) {
      problems.push(`Staff note ${index + 1} has the duration "${entry.duration}", which is not a duration code. Use w h q e s.`);
    }
  });
  return problems;
}

function resolveStaff(figure: StaffFigure): ResolvedStaff {
  const key = figure.key ? getKey(figure.key) : null;
  const clef = figure.clef ?? 'treble';
  const guitar = figure.guitar !== false;
  const notes: ResolvedStaffNote[] = [];
  for (const entry of staffNotesOf(figure)) {
    const n = parseNote(entry.note);
    if (!n || n.midi === null) continue;
    const pos = staffPosition(n.name, { clef, guitar });
    notes.push({
      note: n.name,
      midi: n.midi,
      position: pos.position,
      ledgerPositions: pos.ledgerPositions,
      accidental: shownAccidental(n.name, key),
      stem: pos.stem,
      duration: entry.duration ?? null,
      label: entry.label ?? null,
    });
  }
  return {
    kind: 'staff',
    clef,
    guitar,
    key: key ? { name: key.name, fifths: key.fifths, accidentals: [...key.signature.accidentals], positions: keySignaturePositions(key.fifths, clef) } : null,
    time: figure.time ?? null,
    notes,
    caption: figure.caption ?? null,
  };
}

// ── Keyboard ───────────────────────────────────────────────────────────────────────────────────

/** A keyboard figure ready to draw. */
export interface ResolvedKeyboard {
  kind: 'keyboard';
  /** First and last MIDI key shown; both are white keys. */
  from: number;
  to: number;
  keys: Array<{ midi: number; note: string; label: string; role: DotRole; black: boolean }>;
  caption: KeyboardFigure['caption'] | null;
}

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

function keyboardKeysOf(figure: KeyboardFigure): Array<{ note: string; label?: string; role?: DotRole }> {
  return figure.keys.map((k) => (typeof k === 'string' ? { note: k } : k));
}

function keyboardRange(figure: KeyboardFigure, midis: readonly number[]): [number, number] {
  const fromGiven = figure.from ? parseNote(figure.from)?.midi : null;
  const toGiven = figure.to ? parseNote(figure.to)?.midi : null;
  const low = midis.length ? Math.min(...midis) : 60;
  const high = midis.length ? Math.max(...midis) : 71;
  // Default: whole octaves from the C at or below the lowest key to the B at or above the highest.
  const from = fromGiven ?? low - (low % 12);
  const to = toGiven ?? high + (11 - (high % 12));
  return [from, to];
}

function keyboardProblems(figure: KeyboardFigure): string[] {
  const problems: string[] = [];
  const midis: number[] = [];
  keyboardKeysOf(figure).forEach((k, index) => {
    const n = parseNote(k.note);
    if (!n) problems.push(`Key ${index + 1} ("${k.note}") is not a note. Write it with its octave, like C4 or F#4.`);
    else if (n.midi === null) problems.push(`Key ${index + 1} ("${k.note}") has no octave. Write it like C4.`);
    else midis.push(n.midi);
  });
  for (const [name, value] of [['from', figure.from], ['to', figure.to]] as const) {
    if (value === undefined) continue;
    const n = parseNote(value);
    if (!n || n.midi === null) problems.push(`"${name}: ${value}" is not a note with an octave. Write it like C3.`);
    else if (BLACK_PCS.has(n.chroma)) problems.push(`The keyboard cannot ${name === 'from' ? 'start' : 'end'} on the black key ${value}. Use a white key.`);
  }
  if (problems.length > 0) return problems;
  if (midis.length === 0) problems.push('The keyboard highlights no keys. List at least one key.');
  const [from, to] = keyboardRange(figure, midis);
  if (to <= from) problems.push('"to" must be higher than "from".');
  if (to - from > 36) problems.push('The keyboard spans more than three octaves, too small to read on a phone. Narrow "from" and "to".');
  if (midis.some((m) => m < from || m > to)) problems.push('A highlighted key lies outside the range "from"–"to". Widen the range or remove the key.');
  return problems;
}

function resolveKeyboard(figure: KeyboardFigure): ResolvedKeyboard {
  const keys: ResolvedKeyboard['keys'] = [];
  for (const k of keyboardKeysOf(figure)) {
    const n = parseNote(k.note);
    if (!n || n.midi === null) continue;
    keys.push({ midi: n.midi, note: n.pcName, label: k.label ?? n.pcName, role: k.role ?? 'tone', black: BLACK_PCS.has(n.chroma) });
  }
  const [from, to] = keyboardRange(figure, keys.map((k) => k.midi));
  return { kind: 'keyboard', from, to, keys, caption: figure.caption ?? null };
}

// ── Circle of fifths ───────────────────────────────────────────────────────────────────────────

/** One slot of a resolved circle. */
export interface ResolvedCircleSlot {
  /** 0 = C at the top, clockwise. */
  index: number;
  /** Major key name(s) at this slot, the usual spelling first. */
  major: string[];
  minor: string[];
  /** Sharps (positive) or flats (negative) of the first spelling. */
  fifths: number;
  /** `selected`, `highlight` or null, for the major and the minor ring. */
  majorState: 'selected' | 'highlight' | null;
  minorState: 'selected' | 'highlight' | null;
}

/** A circle-of-fifths figure ready to draw. */
export interface ResolvedCircle {
  kind: 'circle';
  key: { name: string; mode: 'major' | 'minor'; fifths: number; accidentals: string[] };
  show: 'major' | 'minor' | 'both';
  slots: ResolvedCircleSlot[];
  caption: CircleFigure['caption'] | null;
}

function circleProblems(figure: CircleFigure): string[] {
  const problems: string[] = [];
  const check = (name: string, what: string): void => {
    const k = getKey(name);
    if (!k) problems.push(`${what} "${name}" is not a key. Write it like "G major" or "E minor".`);
    else if (k.theoretical) problems.push(`${what} "${name}" has more than seven sharps or flats and is not on the circle. Use its everyday spelling.`);
  };
  check(figure.key, 'The key');
  (figure.highlight ?? []).forEach((name) => check(name, 'The highlighted key'));
  return problems;
}

function resolveCircle(figure: CircleFigure): ResolvedCircle | null {
  const key = getKey(figure.key);
  if (!key) return null;
  const marks = new Map<string, 'selected' | 'highlight'>();
  for (const name of figure.highlight ?? []) {
    const k = getKey(name);
    if (k) marks.set(k.name, 'highlight');
  }
  marks.set(key.name, 'selected');
  const stateOf = (keys: readonly Key[]): 'selected' | 'highlight' | null => {
    const states = keys.map((k) => marks.get(k.name));
    return states.includes('selected') ? 'selected' : states.includes('highlight') ? 'highlight' : null;
  };
  const slots = circleOfFifths().map((slot) => ({
    index: slot.index,
    major: slot.major.map((k) => k.name),
    minor: slot.minor.map((k) => k.name),
    fifths: slot.major[0].fifths,
    majorState: stateOf(slot.major),
    minorState: stateOf(slot.minor),
  }));
  return {
    kind: 'circle',
    key: { name: key.name, mode: key.mode, fifths: key.fifths, accidentals: [...key.signature.accidentals] },
    show: figure.show ?? 'both',
    slots,
    caption: figure.caption ?? null,
  };
}

// ── Rhythm, tab, audio ─────────────────────────────────────────────────────────────────────────

/** A rhythm figure ready to draw. */
export interface ResolvedRhythm {
  kind: 'rhythm';
  time: string;
  bars: number;
  barTicks: number;
  events: RhythmEvent[];
  /** Seconds of each struck note at `tempo`, or null without a tempo. */
  onsetTimes: number[] | null;
  tempo: number | null;
  counting: boolean;
  caption: RhythmFigure['caption'] | null;
}

function rhythmProblems(figure: RhythmFigure): string[] {
  const parsed: ParsedRhythm = parseRhythm(figure);
  const problems = [...parsed.problems];
  if (parsed.bars > COUNT_LIMITS.rhythmBars[1]) problems.push(`The rhythm has ${parsed.bars} bars; a figure holds ${COUNT_LIMITS.rhythmBars[1]} at most. Shorten it or split it over two steps.`);
  if (figure.tempo !== undefined && !(figure.tempo >= 40 && figure.tempo <= 200)) problems.push(`Tempo ${figure.tempo} is outside 40–200 beats per minute.`);
  return problems;
}

function resolveRhythm(figure: RhythmFigure): ResolvedRhythm {
  const parsed = parseRhythm(figure);
  const tempo = figure.tempo ?? null;
  return {
    kind: 'rhythm',
    time: parsed.time.text,
    bars: parsed.bars,
    barTicks: parsed.barTicks,
    events: parsed.events,
    onsetTimes: tempo === null ? null : parsed.onsets.map((tick) => (tick / 960) * (60 / tempo)),
    tempo,
    counting: figure.counting !== false,
    caption: figure.caption ?? null,
  };
}

/** A tab figure ready to draw. */
export interface ResolvedTab {
  kind: 'tab';
  tuning: Tuning;
  capo: number;
  time: string;
  tempo: number | null;
  /** Notes and rests in order, with their start in ticks. */
  notes: Array<{ rest: boolean; string: number | null; fret: number | null; midi: number | null; note: string | null; tick: number; ticks: number; duration: string }>;
  totalTicks: number;
  caption: TabFigure['caption'] | null;
}

function tabFigureProblems(figure: TabFigure): string[] {
  const problems = [...tuningProblem(figure.tuning), ...capoProblem(figure.capo)];
  if (figure.key !== undefined && !keySpelling(figure.key)) problems.push(`"${figure.key}" is not a key. Write it like "A major" or "E minor".`);
  if (problems.length > 0) return problems;
  if (figure.time !== undefined && !parseTimeSignature(figure.time)) problems.push(`"${figure.time}" is not a time signature. Write it like 4/4 or 6/8.`);
  problems.push(...tabProblems(figure.notes, figure));
  if (figure.notes.length > 32) problems.push('The tab phrase has more than 32 notes, too long for one figure. Split it.');
  return problems;
}

function resolveTab(figure: TabFigure): ResolvedTab {
  const tuning = tuningOf(figure.tuning) ?? resolveTuning();
  const capo = figure.capo ?? 0;
  const notes: ResolvedTab['notes'] = [];
  // Named in the phrase's key: an A major line has C♯, never D♭.
  const context = keySpelling(figure.key) ?? inferSpelling(tabMidi(figure.notes, { tuning: figure.tuning, capo })) ?? undefined;
  let tick = 0;
  for (const n of figure.notes) {
    const d = parseDuration(n.duration);
    if (!d) continue;
    if ('rest' in n) {
      notes.push({ rest: true, string: null, fret: null, midi: null, note: null, tick, ticks: d.ticks, duration: n.duration });
    } else if (!positionProblem(n, figure)) {
      const midi = midiAt(n, { tuning: figure.tuning, capo });
      notes.push({ rest: false, string: n.string, fret: n.fret, midi, note: spellPitch(midi, context), tick, ticks: d.ticks, duration: n.duration });
    }
    tick += d.ticks;
  }
  return { kind: 'tab', tuning, capo, time: figure.time ?? '4/4', tempo: figure.tempo ?? null, notes, totalTicks: tick, caption: figure.caption ?? null };
}

/** An audio figure ready to play. */
export interface ResolvedAudio {
  kind: 'audio';
  plan: SoundPlan;
  /** For a strum sound: the pattern slots, so the arrows can be drawn. */
  strum: StrumSlot[] | null;
  label: AudioFigure['label'] | null;
  caption: AudioFigure['caption'] | null;
}

function resolveAudio(figure: AudioFigure): ResolvedAudio {
  const strum = figure.sound.kind === 'strum' ? parseStrum(figure.sound.pattern, figure.sound.grid).slots : null;
  return { kind: 'audio', plan: soundPlan(figure.sound), strum, label: figure.label ?? null, caption: figure.caption ?? null };
}

// ── Public API ─────────────────────────────────────────────────────────────────────────────────

/** A figure with everything computed. */
export type ResolvedFigure = ResolvedFretboard | ResolvedChord | ResolvedStaff | ResolvedKeyboard | ResolvedCircle | ResolvedRhythm | ResolvedTab | ResolvedAudio;

/** Everything that is wrong with a figure (empty when it is fine). Each entry says how to fix it. */
export function figureProblems(figure: Figure): string[] {
  switch (figure?.kind) {
    case 'fretboard':
      return fretboardProblems(figure);
    case 'chord':
      return chordProblems(figure);
    case 'staff':
      return staffProblems(figure);
    case 'keyboard':
      return keyboardProblems(figure);
    case 'circle':
      return circleProblems(figure);
    case 'rhythm':
      return rhythmProblems(figure);
    case 'tab':
      return tabFigureProblems(figure);
    case 'audio':
      return figure.sound ? soundProblems(figure.sound) : ['The audio figure has no "sound".'];
    default:
      return [`"${String((figure as { kind?: unknown } | undefined)?.kind)}" is not a figure kind. Use fretboard, chord, staff, keyboard, circle, rhythm, tab or audio.`];
  }
}

/**
 * Compute a figure for drawing. Returns null for a figure that cannot be drawn at all (run
 * `figureProblems` first; `validateCourse` does), so a renderer can skip it instead of crashing.
 */
export function resolveFigure(figure: FretboardFigure): ResolvedFretboard;
export function resolveFigure(figure: StaffFigure): ResolvedStaff;
export function resolveFigure(figure: KeyboardFigure): ResolvedKeyboard;
export function resolveFigure(figure: RhythmFigure): ResolvedRhythm;
export function resolveFigure(figure: TabFigure): ResolvedTab;
export function resolveFigure(figure: AudioFigure): ResolvedAudio;
export function resolveFigure(figure: ChordFigure): ResolvedChord | null;
export function resolveFigure(figure: CircleFigure): ResolvedCircle | null;
export function resolveFigure(figure: Figure): ResolvedFigure | null;
export function resolveFigure(figure: Figure): ResolvedFigure | null {
  try {
    switch (figure.kind) {
      case 'fretboard':
        return resolveFretboard(figure);
      case 'chord':
        return resolveChord(figure);
      case 'staff':
        return resolveStaff(figure);
      case 'keyboard':
        return resolveKeyboard(figure);
      case 'circle':
        return resolveCircle(figure);
      case 'rhythm':
        return resolveRhythm(figure);
      case 'tab':
        return resolveTab(figure);
      case 'audio':
        return resolveAudio(figure);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
