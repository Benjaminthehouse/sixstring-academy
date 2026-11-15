/**
 * Chord voicings: the data model, fingering (with barre detection), difficulty, and the checks
 * that keep every voicing honest. A voicing is built from a chord and one fret per string; all
 * the rest (the sounding notes and their roles, fingers, barres, label) is derived here.
 */
import {
  buildChord, chord as parseChord, chordSlug, chordToneMap, chordTones, note as parseNote, noteSlug, toneAt, transposeChordBySemitones,
  type Chord, type ChordTone, type ChordToneRole,
} from '@/core/theory';
import { tuning, type Tuning, type TuningInput } from './tunings';
import type { CagedShape, Finger, FretPosition } from './types';

/** Frets of a shape, one per string low to high; null = the string is muted. */
export type Frets = ReadonlyArray<number | null>;

/** One finger pressing several strings at the same fret. */
export interface Barre {
  fret: number;
  finger: Finger;
  /** The lowest-pitched string the finger covers (the higher string number). */
  fromString: number;
  /** The highest-pitched string it covers (the lower string number). */
  toString: number;
}

/** A sounding note of a voicing. */
export interface VoicingNote extends FretPosition {
  midi: number;
  /** Spelled the way the chord spells it, without octave. */
  note: string;
  /** Degree against the chord root: `1`, `b3`, `b7`, `9`. */
  degree: string;
  /** True for the chord's root, in any octave. */
  isRoot: boolean;
  /** The same as an interval: `m3`. */
  interval: string;
  /** What the note does in the chord; `bass` for a slash bass that is not a chord tone. */
  role: ChordToneRole | 'bass';
  /** Fretting finger 1–4; 0 for an open string. */
  finger: Finger;
}

/** The families voicings are sorted into. */
export type VoicingCategory = 'open' | 'barre' | 'caged' | 'power' | 'shell' | 'drop2' | 'drop3' | 'triad' | 'jazz' | 'generated';

/** A playable way to finger a chord. */
export interface Voicing {
  /** Route-safe id, unique per chord, tuning and shape: `c-major-x32010`, `g-major-over-b-x20003`. */
  id: string;
  /** Canonical symbol of what sounds, with a slash when the lowest note is not the root: `C`, `C/E`. */
  chord: string;
  /** Spelled root. */
  root: string;
  /** Chord type id from the theory catalog: `major`, `m7b5`. */
  type: string;
  /** Spelled lowest note. */
  bass: string;
  /** 0 = root in the bass, 1 = first inversion …; null when the bass is not a chord tone. */
  inversion: number | null;
  /** Tuning id. */
  tuning: string;
  capo: number;
  /** Fret per string, low to high; null = muted, 0 = open. Counted from the capo. */
  frets: Array<number | null>;
  /** Finger per string, low to high; null = muted, 0 = open. */
  fingers: Array<Finger | null>;
  barres: Barre[];
  /** Lowest fretted fret (1 when nothing is fretted): the fret a chord box starts at. */
  baseFret: number;
  /** Frets covered by the fretted notes, inclusive (0 when nothing is fretted). */
  span: number;
  /** The sounding notes, lowest string first. */
  notes: VoicingNote[];
  /** Sounding MIDI numbers, lowest string first (the order of a downstroke). */
  midi: number[];
  /** Degrees of the chord that this voicing leaves out: `['5']`. */
  omitted: string[];
  /** True when the root itself is left out. */
  rootless: boolean;
  /** 1 (anyone) to 10 (ask a professional). */
  difficulty: number;
  /** How to call the shape: `Open`, `E-shape barre at fret 3`, `Drop 2, strings 4–1`. */
  label: string;
  category: VoicingCategory;
  /** CAGED shape the voicing is built on, when there is one. */
  shape: CagedShape | null;
  /** True when no open string is used, so the shape can slide to other frets. */
  movable: boolean;
  /** `library` for curated shapes with standard fingerings, `generated` for computed ones. */
  source: 'library' | 'generated';
}

/** Extra facts given when building a voicing. */
export interface VoicingInit {
  tuning?: TuningInput;
  capo?: number;
  /** Fingers per string, low to high (`'x32010'` or an array). Worked out when omitted. */
  fingers?: string | ReadonlyArray<Finger | null>;
  label?: string;
  category?: VoicingCategory;
  shape?: CagedShape | null;
  source?: 'library' | 'generated';
  /**
   * Accept a shape that leaves out tones the chord needs (its third or seventh, say). For
   * instruments with fewer strings than the chord has essential tones; such a voicing is a sketch
   * of the chord, and `omitted` says what is missing.
   */
  allowIncomplete?: boolean;
}

// ── Fret strings ───────────────────────────────────────────────────────────────────────────

/**
 * Read a shape written the usual way: `'x32010'`, `'x 3 2 0 1 0'`, `'10-12-12-11-10-10'`,
 * `'xx0232'`. Without separators every character is one string, so frets above 9 need separators.
 * Returns frets low to high with null for a muted string. Throws a RangeError on anything else.
 */
export function parseFrets(text: string): Array<number | null> {
  const trimmed = text.trim();
  const parts = /[\s,\-|.]/.test(trimmed) ? trimmed.split(/[\s,\-|.]+/).filter(Boolean) : [...trimmed];
  if (!parts.length) throw new RangeError('Empty fret string');
  return parts.map((p) => {
    if (/^[xX]$/.test(p)) return null;
    if (!/^\d+$/.test(p)) throw new RangeError(`Not a fret: "${p}" in "${text}"`);
    return Number(p);
  });
}

/** Write frets the usual way: `x32010`, or with dashes once a fret needs two digits: `8-10-10-9-8-8`. */
export function formatFrets(frets: Frets): string {
  const wide = frets.some((f) => f !== null && f > 9);
  return frets.map((f) => (f === null ? 'x' : String(f))).join(wide ? '-' : '');
}

function readFingers(input: string | ReadonlyArray<Finger | null>): Array<Finger | null> {
  if (typeof input !== 'string') return [...input];
  return [...input.replace(/[\s-]/g, '')].map((ch) => {
    if (/^[xX]$/.test(ch)) return null;
    if (!/^[0-4]$/.test(ch)) throw new RangeError(`Not a finger: "${ch}" in "${input}"`);
    return Number(ch) as Finger;
  });
}

// ── Fingering ──────────────────────────────────────────────────────────────────────────────

/** The barres implied by a fingering: every finger that holds more than one string. */
export function findBarres(frets: Frets, fingers: ReadonlyArray<Finger | null>): Barre[] {
  const count = frets.length;
  const barres: Barre[] = [];
  for (const finger of [1, 2, 3, 4] as Finger[]) {
    const held: number[] = [];
    fingers.forEach((f, i) => {
      if (f === finger && (frets[i] ?? 0) > 0) held.push(i);
    });
    if (held.length >= 2) barres.push({ fret: frets[held[0]]!, finger, fromString: count - held[0], toString: count - held[held.length - 1] });
  }
  return barres;
}

/** A fingering for a shape. */
export interface FingerAssignment {
  fingers: Array<Finger | null>;
  barres: Barre[];
}

/** Frets two fingers can be apart: one fret more than one-finger-per-fret puts between them. */
function fingerReach(lowFinger: number, highFinger: number): number {
  return highFinger - lowFinger + 1;
}

interface FretGroup { fret: number; strings: number[] }
interface FingerUnit { fret: number; strings: number[]; finger: Finger }

const ASSIGN_CACHE = new Map<string, FingerAssignment | null>();
const ASSIGN_CACHE_LIMIT = 20_000;

/**
 * What a fingering costs the hand, or Infinity when it cannot be held. `units` are the fingers in
 * ascending order with the strings (array indices, ascending) each one holds.
 */
function fingeringCost(frets: Frets, units: FingerUnit[], low: number): number {
  let cost = 0;
  for (let a = 0; a < units.length; a++) {
    const u = units[a];
    for (let b = a + 1; b < units.length; b++) {
      if (units[b].fret - u.fret > fingerReach(u.finger, units[b].finger)) return Infinity;
    }
    // One finger per fret from the lowest fret is the comfortable place: reaching above it is a
    // stretch, sitting below it (fingers crowding one fret) merely a little cramped.
    const ideal = low + u.finger - 1;
    cost += u.fret > ideal ? 2 * (u.fret - ideal) : ideal - u.fret;
    // Two fingers on one fret with several higher-fretted strings between them reach around the
    // other fingers: that is what a barre is for. (One string between is the open D triangle.)
    const next = units[a + 1];
    if (next && next.fret === u.fret) {
      let between = 0;
      for (let i = u.strings[u.strings.length - 1] + 1; i < next.strings[0]; i++) {
        const fret = frets[i];
        if (fret !== null && fret > u.fret) between++;
      }
      cost += 1.5 * Math.max(0, between - 1);
    }
    if (u.strings.length < 2) continue;
    const first = u.strings[0];
    const last = u.strings[u.strings.length - 1];
    let bridged = 0;
    let muted = 0;
    for (let i = first + 1; i < last; i++) {
      if (u.strings.includes(i)) continue;
      const fret = frets[i];
      if (fret === null) muted++;
      else if (fret <= u.fret) return Infinity;
      else bridged++;
    }
    // Strings beyond the fingertip side are free; strings past the far end must ring past the flat finger.
    let ringsPast = false;
    for (let i = last + 1; i < frets.length; i++) {
      const fret = frets[i];
      if (fret !== null && fret < u.fret) ringsPast = true;
    }
    if (u.finger === 1) {
      // The index finger is built for barring; a muted string under it has to be damped by easing the pressure there.
      cost += 1.5 + 0.25 * (last - first - 1) + (bridged ? 1 : 0) + 1.5 * muted + (ringsPast ? 3 : 0);
    } else {
      // Another finger can flatten across neighbouring strings, nothing more.
      if (bridged || muted) return Infinity;
      cost += 2.5 + 0.25 * (u.strings.length - 2) + (u.finger === 4 ? 0.5 : 0) + (ringsPast ? 1.5 : 0);
    }
  }
  return cost;
}

function solveFingering(frets: Frets): FingerAssignment | null {
  const fingers: Array<Finger | null> = frets.map((f) => (f === null ? null : 0));
  const groups: FretGroup[] = [];
  frets.forEach((fret, index) => {
    if (fret === null || fret <= 0) return;
    const group = groups.find((g) => g.fret === fret);
    if (group) group.strings.push(index);
    else groups.push({ fret, strings: [index] });
  });
  if (!groups.length) return { fingers, barres: [] };
  groups.sort((a, b) => a.fret - b.fret);
  const low = groups[0].fret;
  // Five frets is as far as a hand opens, and four fingers hold four frets at most.
  if (groups[groups.length - 1].fret - low > 4 || groups.length > 4) return null;

  let best: FingerUnit[] | null = null;
  let bestCost = Infinity;
  let bestSum = Infinity;
  const units: FingerUnit[] = [];
  /** Give the strings of group `g` from `from` on to fingers above `lastFinger`: lower strings take the lower fingers. */
  const place = (g: number, from: number, lastFinger: number) => {
    if (g === groups.length) {
      const cost = fingeringCost(frets, units, low);
      if (cost === Infinity) return;
      const sum = units.reduce((total, u) => total + u.finger, 0);
      if (cost < bestCost - 1e-9 || (Math.abs(cost - bestCost) <= 1e-9 && sum < bestSum)) {
        best = units.map((u) => ({ ...u, strings: [...u.strings] }));
        bestCost = cost;
        bestSum = sum;
      }
      return;
    }
    const group = groups[g];
    if (from === group.strings.length) {
      place(g + 1, 0, lastFinger);
      return;
    }
    // Fingers still needed after this unit: at least one per later group.
    const later = groups.length - 1 - g;
    for (let finger = lastFinger + 1; finger <= 4 - later; finger++) {
      for (let to = from + 1; to <= group.strings.length; to++) {
        units.push({ fret: group.fret, strings: group.strings.slice(from, to), finger: finger as Finger });
        place(g, to, finger);
        units.pop();
      }
    }
  };
  place(0, 0, 0);
  if (!best) return null;
  for (const u of best as FingerUnit[]) for (const s of u.strings) fingers[s] = u.finger;
  return { fingers, barres: findBarres(frets, fingers) };
}

/**
 * Work out the most comfortable fingering for a shape, or null when no hand can play it: more
 * than four fingers needed, more than five frets between the lowest and highest fretted note, or
 * two fingers further apart than they reach (one fret more than one finger per fret).
 * Every way of sharing the fretted strings among the four fingers is weighed: fingers follow the
 * frets (a higher fret never takes a lower finger; on one fret the lower string takes the lower
 * finger), the index finger may barre (also across higher-fretted or muted strings), the other
 * fingers may flatten across neighbouring strings, and nothing lies across an open string.
 */
export function assignFingers(frets: Frets): FingerAssignment | null {
  // The answer only depends on the shape, not on where it sits on the neck.
  let low = Infinity;
  for (const f of frets) if (f !== null && f > 0 && f < low) low = f;
  const key = frets.map((f) => (f === null ? 'x' : f === 0 ? 'o' : String(f - low))).join(',');
  let solved = ASSIGN_CACHE.get(key);
  if (solved === undefined) {
    solved = solveFingering(frets);
    if (ASSIGN_CACHE.size >= ASSIGN_CACHE_LIMIT) ASSIGN_CACHE.clear();
    ASSIGN_CACHE.set(key, solved);
  }
  if (!solved) return null;
  const fingers = [...solved.fingers];
  return { fingers, barres: findBarres(frets, fingers) };
}

/**
 * Check a fingering for physical sense. Returns the problems found, empty when it is playable:
 *  - muted strings have no finger, open strings finger 0, fretted strings a finger 1–4;
 *  - one finger holds one fret; a lower-numbered finger never frets higher than a higher-numbered one;
 *  - a finger on several strings is a barre: nothing under it may be open or fretted lower;
 *  - no two fingers are further apart than they reach: one fret more than one finger per fret
 *    (index and middle two frets, index and little finger four), so at most five frets in all.
 */
export function checkVoicingFingering(frets: Frets, fingers: ReadonlyArray<Finger | null>): string[] {
  const problems: string[] = [];
  if (frets.length !== fingers.length) return [`${frets.length} frets but ${fingers.length} fingers`];
  const count = frets.length;
  const fretOf = new Map<number, number>();
  frets.forEach((fret, i) => {
    const finger = fingers[i];
    const name = `string ${count - i}`;
    if (fret === null) {
      if (finger !== null) problems.push(`${name} is muted but has finger ${finger}`);
    } else if (fret === 0) {
      if (finger !== 0) problems.push(`${name} is open but has finger ${String(finger)}`);
    } else if (finger === null || finger < 1 || finger > 4) {
      problems.push(`${name} is fretted at ${fret} but has no finger 1–4`);
    } else if (fretOf.has(finger) && fretOf.get(finger) !== fret) {
      problems.push(`finger ${finger} is asked to hold frets ${fretOf.get(finger)} and ${fret}`);
    } else {
      fretOf.set(finger, fret);
    }
  });
  const used = [...fretOf.keys()].sort((a, b) => a - b);
  for (let i = 1; i < used.length; i++) {
    if (fretOf.get(used[i - 1])! > fretOf.get(used[i])!) {
      problems.push(`finger ${used[i - 1]} (fret ${fretOf.get(used[i - 1])}) is above finger ${used[i]} (fret ${fretOf.get(used[i])})`);
    }
  }
  for (const barre of findBarres(frets, fingers)) {
    for (let string = barre.fromString - 1; string > barre.toString; string--) {
      const fret = frets[count - string];
      if (fret !== null && fret < barre.fret) problems.push(`string ${string} (fret ${fret}) lies under the finger-${barre.finger} barre at fret ${barre.fret}`);
    }
  }
  const pressed = frets.filter((f): f is number => f !== null && f > 0);
  if (pressed.length && Math.max(...pressed) - Math.min(...pressed) > 4) problems.push(`a span of ${Math.max(...pressed) - Math.min(...pressed) + 1} frets`);
  for (let i = 0; i < used.length; i++) {
    for (let j = i + 1; j < used.length; j++) {
      const gap = fretOf.get(used[j])! - fretOf.get(used[i])!;
      if (gap > fingerReach(used[i], used[j])) problems.push(`fingers ${used[i]} and ${used[j]} cannot reach ${gap} frets apart`);
    }
  }
  return problems;
}

/**
 * How hard a fingered shape is to hold, from 1 (two fingers in open position) to 10. Counts the
 * fingers, barres (a full barre most), the span, fingers that reach above their own fret, muted
 * strings inside the chord, open strings that have to ring past a barre, and very high positions.
 * `strummed: false` is for notes that are plucked one by one (an arrangement, a double stop):
 * strings in between then need no damping and cost nothing.
 */
export function voicingDifficulty(frets: Frets, fingers: ReadonlyArray<Finger | null>, opts: { strummed?: boolean } = {}): number {
  const pressed = frets.filter((f): f is number => f !== null && f > 0);
  if (!pressed.length) return 1;
  const used = new Set(fingers.filter((f): f is Finger => f !== null && f > 0));
  let score = [0, 0.5, 1.2, 2, 3][used.size] ?? 3;
  const barres = findBarres(frets, fingers);
  for (const barre of barres) {
    const width = barre.fromString - barre.toString + 1;
    // The index finger is built for barring; a flattened ring or little finger is harder.
    score += barre.finger === 1 ? (width >= 5 ? 2.5 : width >= 3 ? 1.6 : 1) : 1.6;
    const arched = frets.some((f, i) => frets.length - i < barre.toString && f !== null && f < barre.fret);
    if (arched) score += 1;
  }
  const span = Math.max(...pressed) - Math.min(...pressed) + 1;
  score += span <= 2 ? 0 : span === 3 ? 0.4 : span === 4 ? 1.2 : 2.5;
  // Frets are wide near the nut: the same stretch costs more there.
  if (span >= 4 && Math.min(...pressed) <= 2) score += 0.5;
  // A finger above its own fret (one finger per fret from the lowest) has to reach.
  const low = Math.min(...pressed);
  const reached = new Map<number, number>();
  frets.forEach((fret, i) => {
    const finger = fingers[i];
    if (fret !== null && fret > 0 && finger) reached.set(finger, Math.max(0, fret - (low + finger - 1)));
  });
  for (const extra of reached.values()) score += 0.3 * extra;
  const sounding = frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
  if (sounding.length && opts.strummed !== false) {
    const inner = frets.slice(sounding[0], sounding[sounding.length - 1] + 1).filter((f) => f === null).length;
    score += 0.8 * inner;
  }
  if (Math.min(...pressed) > 9) score += 0.4;
  if (Math.max(...pressed) > 14) score += 0.4;
  return Math.round(Math.min(10, 1 + score) * 10) / 10;
}

/** A word for a difficulty score: up to 3.5 `easy`, up to 5.5 `medium`, up to 7.5 `hard`, beyond that `expert`. */
export function difficultyLevel(difficulty: number): 'easy' | 'medium' | 'hard' | 'expert' {
  return difficulty <= 3.5 ? 'easy' : difficulty <= 5.5 ? 'medium' : difficulty <= 7.5 ? 'hard' : 'expert';
}

// ── Building ───────────────────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

interface Analysis {
  notes: Array<Omit<VoicingNote, 'finger'>>;
  /** Index (in `notes`) of the lowest-sounding note. */
  lowest: number;
  omitted: string[];
  rootless: boolean;
  /** Notes that are neither chord tones nor the slash bass in the bass. */
  strangers: string[];
}

function analyse(c: Chord, frets: Frets, t: Tuning, capo: number): Analysis {
  const map = chordToneMap(c);
  const tones = chordTones(c);
  const roleByPc = new Map<number, ChordToneRole>();
  for (const tone of tones) {
    const pc = parseNote(tone.note).chroma;
    if (!roleByPc.has(pc)) roleByPc.set(pc, tone.role);
  }
  const notes: Analysis['notes'] = [];
  frets.forEach((fret, index) => {
    if (fret === null) return;
    const midi = t.midi[index] + capo + fret;
    const info = toneAt(map, midi);
    notes.push({
      string: t.stringCount - index, fret, midi,
      note: info.note, degree: info.degree, isRoot: info.pc === map.rootPc, interval: info.interval,
      role: roleByPc.get(info.pc) ?? 'bass',
    });
  });
  let lowest = 0;
  notes.forEach((n, i) => {
    if (n.midi < notes[lowest].midi) lowest = i;
  });
  const strangers: string[] = [];
  notes.forEach((n, i) => {
    const pc = ((n.midi % 12) + 12) % 12;
    if (roleByPc.has(pc)) return;
    // A slash bass that is not a chord tone is welcome in the bass and nowhere else.
    if (map.bassPc === pc && i === lowest) {
      n.note = c.bass!;
      return;
    }
    strangers.push(`${n.note} on string ${n.string}`);
  });
  const sounding = new Set(notes.map((n) => ((n.midi % 12) + 12) % 12));
  const omitted = map.tones.filter((tone) => !sounding.has(tone.pc)).map((tone) => tone.degree);
  return { notes, lowest, omitted, rootless: !sounding.has(map.rootPc), strangers };
}

/**
 * False for instruments whose lowest string is no bass: ukuleles (low G included) and re-entrant
 * tunings. Chords there are named and looked up without regard to which note happens to be lowest.
 */
export function hasBassRegister(t: Tuning): boolean {
  return !t.reentrant && t.instrument !== 'ukulele';
}

/**
 * The tones a voicing of a chord has to contain to be that chord: everything the theory engine
 * does not mark as omittable (so the fifth and the lesser tensions of big chords may go), plus the
 * third of any chord without a seventh: C F G is Csus4, not C(add11).
 * (`7alt` is a menu: its root, third and seventh are essential, and one alteration of the caller's choice.)
 */
export function essentialTones(chordInput: string | Chord): ChordTone[] {
  const tones = chordTones(chordInput);
  const hasSeventh = tones.some((tone) => tone.role === 'seventh');
  return tones.filter((tone) => !tone.omittable || (tone.role === 'third' && !hasSeventh));
}

function autoLabel(frets: Frets, fingers: ReadonlyArray<Finger | null>, baseFret: number): string {
  const hasOpen = frets.some((f) => f === 0);
  const barres = findBarres(frets, fingers);
  if (hasOpen && baseFret <= 4) return 'Open position';
  if (barres.some((b) => b.finger === 1)) return `Barre at fret ${baseFret}`;
  return `${ordinal(baseFret)} position`;
}

function voicingId(c: Chord, bassIsRoot: boolean, bass: string, frets: Frets, t: Tuning, capo: number): string {
  const wide = frets.some((f) => f !== null && f > 9);
  const shape = frets.map((f) => (f === null ? 'x' : String(f))).join(wide ? '-' : '');
  const where = `${t.id === 'standard' ? '' : `-${t.id}`}${capo ? `-capo${capo}` : ''}`;
  return `${chordSlug(c)}${bassIsRoot ? '' : `-over-${noteSlug(bass)}`}-${shape}${where}`;
}

/** Why a shape cannot be a voicing of a chord, or null when it can. */
export function voicingProblem(chordInput: string | Chord, fretsInput: string | Frets, init: VoicingInit = {}): string | null {
  const built = build(chordInput, fretsInput, init);
  return typeof built === 'string' ? built : null;
}

function build(chordInput: string | Chord, fretsInput: string | Frets, init: VoicingInit): Voicing | string {
  const t = tuning(init.tuning);
  const capo = init.capo ?? 0;
  const requested = parseChord(chordInput);
  const frets = typeof fretsInput === 'string' ? parseFrets(fretsInput) : [...fretsInput];
  if (frets.length !== t.stringCount) return `${frets.length} frets for a ${t.stringCount}-string tuning`;
  if (frets.some((f) => f !== null && (!Number.isInteger(f) || f < 0))) return 'frets must be whole numbers from 0 up';
  const a = analyse(requested, frets, t, capo);
  if (!a.notes.length) return 'no string sounds';
  if (a.strangers.length) return `not in ${requested.symbol}: ${a.strangers.join(', ')}`;
  if (!init.allowIncomplete) {
    // A chord without the tones that define it is another chord: C E G is not Cmaj7. Only the
    // root may go missing (the bass player has it); `rootless` then says so.
    const missing = essentialTones(requested).filter((tone) => tone.role !== 'root' && a.omitted.includes(tone.degree));
    if (missing.length) return `lacks the ${missing.map((tone) => tone.degree).join(' and ')} of ${requested.symbol}`;
    const tensions = chordTones(requested).filter((tone) => !['root', 'third', 'seventh'].includes(tone.role));
    if (requested.type.id === '7alt' && tensions.every((tone) => a.omitted.includes(tone.degree))) return `has none of the altered notes of ${requested.symbol}`;
  }

  let fingers: Array<Finger | null>;
  if (init.fingers !== undefined) {
    fingers = readFingers(init.fingers);
    const problems = checkVoicingFingering(frets, fingers);
    if (problems.length) return `fingering: ${problems.join('; ')}`;
  } else {
    const assigned = assignFingers(frets);
    if (!assigned) return 'no hand can hold it (more than four fingers, more than five frets, or fingers too far apart)';
    fingers = assigned.fingers;
  }

  const bassNote = a.notes[a.lowest];
  const bassIsRoot = bassNote.role === 'root';
  // What sounds decides the name: the lowest note becomes the slash bass unless it is the root.
  // Ukuleles and re-entrant tunings have no real bass register, so a plain symbol stays plain there.
  const named = bassIsRoot || (!hasBassRegister(t) && !requested.bass);
  const sounding = named ? buildChord(requested.root, requested.type) : buildChord(requested.root, requested.type, bassNote.note);
  const inversion = bassNote.role === 'bass' ? null : chordToneMap(requested).tones.findIndex((tone) => tone.pc === ((bassNote.midi % 12) + 12) % 12);
  const pressed = frets.filter((f): f is number => f !== null && f > 0);
  const baseFret = pressed.length ? Math.min(...pressed) : 1;
  const notes: VoicingNote[] = a.notes.map((n) => ({ ...n, finger: (fingers[t.stringCount - n.string] ?? 0) as Finger }));
  return {
    id: voicingId(sounding, named, bassNote.note, frets, t, capo),
    chord: sounding.symbol,
    root: sounding.root,
    type: sounding.type.id,
    bass: bassNote.note,
    inversion,
    tuning: t.id,
    capo,
    frets,
    fingers,
    barres: findBarres(frets, fingers),
    baseFret,
    span: pressed.length ? Math.max(...pressed) - baseFret + 1 : 0,
    notes,
    midi: notes.map((n) => n.midi),
    omitted: a.omitted,
    rootless: a.rootless,
    difficulty: voicingDifficulty(frets, fingers),
    label: init.label ?? autoLabel(frets, fingers, baseFret),
    category: init.category ?? 'generated',
    shape: init.shape ?? null,
    movable: !frets.some((f) => f === 0),
    source: init.source ?? 'generated',
  };
}

/**
 * Build a voicing from a chord and a shape: `buildVoicing('C', 'x32010')`. The sounding notes must
 * all be chord tones (a slash bass may sit in the bass), none of the tones the chord needs may be
 * missing (the fifth and lesser tensions may, as may the root: see `rootless`), and the shape must
 * be playable with four fingers; otherwise a RangeError explains what is wrong. A shape whose
 * lowest note is not the root is named as the inversion it is (`buildVoicing('C', '032010').chord` -> `C/E`).
 */
export function buildVoicing(chordInput: string | Chord, fretsInput: string | Frets, init: VoicingInit = {}): Voicing {
  const built = build(chordInput, fretsInput, init);
  if (typeof built === 'string') {
    const shape = typeof fretsInput === 'string' ? fretsInput : formatFrets(fretsInput);
    throw new RangeError(`${shape} is not a voicing of ${parseChord(chordInput).symbol}: ${built}`);
  }
  return built;
}

/** `buildVoicing` that returns null instead of throwing. */
export function tryBuildVoicing(chordInput: string | Chord, fretsInput: string | Frets, init: VoicingInit = {}): Voicing | null {
  try {
    const built = build(chordInput, fretsInput, init);
    return typeof built === 'string' ? null : built;
  } catch {
    return null;
  }
}

/** The fretted and open positions of a voicing, lowest string first. */
export function voicingPositions(voicing: Voicing): FretPosition[] {
  return voicing.notes.map((n) => ({ string: n.string, fret: n.fret }));
}

/**
 * Slide a movable voicing up or down the neck by `semitones`, keeping its fingering:
 * an F barre chord moved up 2 is G. Returns null when the shape uses open strings or would leave the neck.
 */
export function moveVoicing(voicing: Voicing, semitones: number, maxFret = 22): Voicing | null {
  if (!voicing.movable) return null;
  const frets = voicing.frets.map((f) => (f === null ? null : f + semitones));
  if (frets.some((f) => f !== null && (f < 1 || f > maxFret))) return null;
  const moved = transposeChordBySemitones(voicing.chord, semitones);
  const label = voicing.label.replace(/fret \d+/, (m) => `fret ${Number(m.slice(5)) + semitones}`);
  return tryBuildVoicing(moved, frets, {
    tuning: voicing.tuning, capo: voicing.capo, fingers: voicing.fingers, label, category: voicing.category, shape: voicing.shape, source: voicing.source,
  });
}
