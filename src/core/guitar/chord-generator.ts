/**
 * The voicing generator: every way a hand can play a chord in a tuning, ranked.
 *
 * It enumerates one fret (or a mute) per string inside a hand-sized window, keeps the shapes that
 * sound only chord tones, contain the tones the chord cannot do without, have the right note in
 * the bass and can be fingered with four fingers, and scores them for ease and for how much they
 * sound like something a guitarist would actually play. Curated library shapes are merged in and
 * ranked first where they fit.
 */
import { chord as parseChord, chordTones, note as parseNote, type Chord, type ChordTone } from '@/core/theory';
import { libraryVoicings } from './chord-library';
import type { NeckOptions } from './fretboard';
import { tuning, type Tuning } from './tunings';
import {
  assignFingers, findBarres, tryBuildVoicing, voicingDifficulty, type Frets, type Voicing, type VoicingCategory,
} from './voicing';

/** What to look for. */
export interface VoicingSearchOptions extends NeckOptions {
  /** Lowest fret a fretted note may use (default 1). */
  minFret?: number;
  /** Highest fret a fretted note may use (default 15). */
  maxFret?: number;
  /** Frets the fretted notes may span, inclusive (default 4). Shapes with open strings get one more. */
  maxSpan?: number;
  /** May open strings ring? Default true, within the first five frets; `'always'` allows them under any position. */
  allowOpen?: boolean | 'always';
  /** Must the lowest note be the root (or the slash bass)? Default true; false also returns inversions. */
  rootInBass?: boolean;
  /** Only these strings may sound (string numbers, 1 = thinnest). */
  strings?: number[];
  /** With `strings`: every listed string must sound. */
  allStrings?: boolean;
  /** Fewest and most strings that may sound (default: three, or two for power chords, up to all). */
  minNotes?: number;
  maxNotes?: number;
  /** Leave the root out (to the bass player): rootless voicings only. For chords of four or more tones; ignored for triads. */
  rootless?: boolean;
  /** Note name required as the highest voice (chord melody). */
  top?: string;
  /** Muted strings allowed between sounding ones (default 1). */
  innerMutes?: number;
  /** Drop anything harder than this (1–10). */
  maxDifficulty?: number;
  /** How many voicings to return (default 12). */
  maxResults?: number;
  /** Include the curated library shapes (default true). */
  library?: boolean;
}

interface Candidate {
  frets: Array<number | null>;
  score: number;
  library: Voicing | null;
}

/** How much a curated shape outranks a computed one of the same quality: the more a shape is "the" way to play a chord, the more. */
const LIBRARY_BONUS: Record<VoicingCategory, number> = {
  open: 40, barre: 30, power: 30, jazz: 20, shell: 14, caged: 12, drop2: 12, drop3: 9, triad: 6, generated: 0,
};

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

interface Plan {
  c: Chord;
  t: Tuning;
  capo: number;
  tones: ChordTone[];
  /** Role and weight of each chord pitch class. */
  byPc: Map<number, ChordTone>;
  rootPc: number;
  /** Pitch classes every voicing must contain. */
  required: number[];
  /** Pitch class the lowest note must have, or null for any chord tone. */
  bassPc: number | null;
  /** A slash bass that is not a chord tone: allowed only as the lowest note. */
  foreignBass: number | null;
  topPc: number | null;
  minNotes: number;
  maxNotes: number;
  maxSpan: number;
  innerMutes: number;
  rootless: boolean;
  /** True when the instrument has fewer strings than the chord has essential tones, so some had to go. */
  incomplete: boolean;
}

function makePlan(c: Chord, t: Tuning, capo: number, opts: VoicingSearchOptions): Plan {
  const tones = chordTones(c);
  const byPc = new Map<number, ChordTone>();
  for (const tone of tones) {
    const pc = parseNote(tone.note).chroma;
    if (!byPc.has(pc)) byPc.set(pc, tone);
  }
  const rootPc = parseNote(c.root).chroma;
  const strings = opts.strings?.length ?? t.stringCount;
  const rootless = (opts.rootless ?? false) && tones.length >= 4;
  // Start from the tones theory says a voicing must keep; then make it fit the strings there are.
  let keep = tones.filter((tone) => !tone.omittable && !(rootless && tone.role === 'root'));
  if (c.type.id === '7alt') keep = tones.filter((tone) => ['root', 'third', 'seventh'].includes(tone.role) && !(rootless && tone.role === 'root'));
  const room = Math.min(strings, opts.maxNotes ?? strings);
  if (keep.length > room) keep = keep.filter((tone) => tone.role !== 'root');
  const incomplete = keep.length > room;
  while (keep.length > room) {
    // Still too many: drop the least important tone that is left.
    const worst = keep.reduce((a, b) => (b.priority >= a.priority ? b : a));
    keep = keep.filter((tone) => tone !== worst);
  }
  const foreign = c.bass && c.inversion === null ? parseNote(c.bass).chroma : null;
  const wantsRootBass = opts.rootInBass ?? !t.reentrant;
  const bassPc = rootless ? null : c.bass ? parseNote(c.bass).chroma : wantsRootBass && keep.some((tone) => tone.role === 'root') ? rootPc : null;
  const fewest = c.type.intervals.length <= 2 ? 2 : Math.min(3, strings);
  return {
    c, t, capo, tones, byPc, rootPc,
    required: [...new Set(keep.map((tone) => parseNote(tone.note).chroma))],
    bassPc, foreignBass: foreign,
    topPc: opts.top ? parseNote(opts.top).chroma : null,
    minNotes: Math.max(2, opts.minNotes ?? fewest),
    maxNotes: opts.maxNotes ?? t.stringCount,
    maxSpan: opts.maxSpan ?? 4,
    innerMutes: opts.innerMutes ?? 1,
    rootless,
    incomplete,
  };
}

/** Everything that is checked without fingering: musical content and the block of sounding strings. */
function acceptable(plan: Plan, frets: Frets): boolean {
  const { t, capo } = plan;
  let first = -1;
  let last = -1;
  let count = 0;
  for (let i = 0; i < frets.length; i++) {
    if (frets[i] === null) continue;
    if (first < 0) first = i;
    last = i;
    count++;
  }
  if (count < plan.minNotes || count > plan.maxNotes) return false;
  if (last - first + 1 - count > plan.innerMutes) return false;
  let lowest = Infinity;
  let highest = -Infinity;
  let mask = 0;
  for (let i = first; i <= last; i++) {
    const fret = frets[i];
    if (fret === null) continue;
    const midi = t.midi[i] + capo + fret;
    if (midi < lowest) lowest = midi;
    if (midi > highest) highest = midi;
    mask |= 1 << mod12(midi);
  }
  for (const pc of plan.required) if (!(mask & (1 << pc))) return false;
  if (plan.rootless && mask & (1 << plan.rootPc)) return false;
  if (plan.c.type.id === '7alt' && ![1, 3, 6, 8].some((s) => mask & (1 << mod12(plan.rootPc + s)))) return false;
  if (plan.bassPc !== null && mod12(lowest) !== plan.bassPc) return false;
  if (plan.foreignBass !== null) {
    // The foreign bass sounds once, at the bottom.
    for (let i = first; i <= last; i++) {
      const fret = frets[i];
      if (fret === null) continue;
      const midi = t.midi[i] + capo + fret;
      if (mod12(midi) === plan.foreignBass && midi !== lowest) return false;
    }
  }
  if (plan.topPc !== null && mod12(highest) !== plan.topPc) return false;
  return true;
}

function scoreShape(plan: Plan, frets: Frets, difficulty: number): number {
  const { t, capo } = plan;
  const midi: number[] = [];
  const sounding: number[] = [];
  frets.forEach((fret, i) => {
    if (fret === null) return;
    midi.push(t.midi[i] + capo + fret);
    sounding.push(i);
  });
  const pressed = frets.filter((f): f is number => f !== null && f > 0);
  const base = pressed.length ? Math.min(...pressed) : 1;
  const hasOpen = frets.some((f) => f === 0);
  let score = 100 - 5 * difficulty;
  // Fuller is better for a strummed chord, up to five strings (three for a power chord, which lives on the low strings).
  const power = plan.tones.length <= 2;
  score += 4 * Math.min(power ? 3 : 5, midi.length);
  if (power) score += 0.5 * (t.stringCount - 1 - sounding[0]);
  score -= 5 * (sounding[sounding.length - 1] - sounding[0] + 1 - sounding.length);
  const counts = new Map<number, number>();
  for (const m of midi) counts.set(mod12(m), (counts.get(mod12(m)) ?? 0) + 1);
  const alt = plan.c.type.id === '7alt';
  if (alt) {
    // The usual reading of "alt": one altered ninth and one altered fifth.
    const has = (semis: number) => counts.has(mod12(plan.rootPc + semis));
    if (has(1) || has(3)) score += 5;
    if (has(6) || has(8)) score += 5;
  }
  for (const tone of plan.tones) {
    const pc = parseNote(tone.note).chroma;
    const n = counts.get(pc) ?? 0;
    // "Alt" is a menu: leaving a tension out costs nothing, as long as the chord keeps one of each kind (below).
    if (n === 0) score -= tone.role === 'root' ? (plan.rootless ? 0 : 12) : alt ? 0 : tone.role === 'fifth' && tone.interval === 'P5' ? 2 : 3;
    // Roots and fifths double well; thirds, sevenths and tensions thicken or blur the chord.
    else if (n > 1 && tone.role !== 'root' && tone.role !== 'fifth') score -= (tone.role === 'third' ? 2 : 3) * (n - 1);
  }
  const sorted = [...midi].sort((a, b) => a - b);
  if (mod12(sorted[0]) === plan.rootPc) score += 6;
  // A third (or closer) right above a low bass note is mud.
  if (sorted.length > 1 && sorted[1] - sorted[0] <= 4 && sorted[0] < 48) score -= 6;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    // Semitone rubs and two strings on one pitch are rarely what a chord chart means
    // (except on re-entrant instruments, where unisons are part of the sound).
    if (gap === 1) score -= 6;
    else if (gap === 0 && !t.reentrant) score -= 5;
  }
  // Tensions belong above the notes that define the chord, not underneath them.
  const lowestOf = (roles: string[]) => {
    const found = midi.filter((m) => roles.includes(plan.byPc.get(mod12(m))?.role ?? ''));
    return found.length ? Math.min(...found) : null;
  };
  const third = lowestOf(['third', 'fourth', 'second']);
  const seventh = lowestOf(['seventh', 'sixth']);
  const floor = Math.max(third ?? -Infinity, seventh ?? -Infinity);
  for (const m of midi) {
    const tone = plan.byPc.get(mod12(m));
    if (tone && ['ninth', 'eleventh', 'thirteenth'].includes(tone.role) && m < floor) score -= tone.altered ? 12 : 5;
  }
  score -= 1.5 * Math.max(0, base - 3) + Math.max(0, base - 9);
  if (hasOpen) score += base <= 3 ? 5 : base <= 5 ? -3 : -8;
  // A chord that stops short of the two highest strings loses its sparkle.
  if (sounding[sounding.length - 1] < t.stringCount - 2 && plan.tones.length > 2) score -= 3;
  return score;
}

function search(plan: Plan, opts: VoicingSearchOptions): Candidate[] {
  const { t, capo } = plan;
  const count = t.stringCount;
  const minFret = Math.max(1, Math.round(opts.minFret ?? 1));
  const maxFret = Math.round(opts.maxFret ?? 15);
  const allowOpen = opts.allowOpen ?? true;
  const usable = opts.strings ? new Set(opts.strings.map((s) => count - s)) : null;
  const isTone = (midi: number) => plan.byPc.has(mod12(midi)) || mod12(midi) === plan.foreignBass;
  /** Chord-tone frets of every string, ascending. */
  const toneFrets: number[][] = t.midi.map((open, i) => {
    if (usable && !usable.has(i)) return [];
    const list: number[] = [];
    for (let fret = minFret; fret <= maxFret; fret++) if (isTone(open + capo + fret)) list.push(fret);
    return list;
  });
  const openOk: boolean[] = t.midi.map((open, i) => allowOpen !== false && (!usable || usable.has(i)) && isTone(open + capo));
  const found = new Map<string, Candidate>();
  const frets: Array<number | null> = new Array(count).fill(null);

  const leaf = (base: number, anyFretted: boolean) => {
    const pressed = frets.filter((f): f is number => f !== null && f > 0);
    // Each shape is found once: in the window that starts at its lowest fretted fret.
    if (anyFretted ? Math.min(...pressed) !== base : base !== minFret) return;
    const hasOpen = frets.some((f) => f === 0);
    if (pressed.length && Math.max(...pressed) - base + 1 > plan.maxSpan + (hasOpen ? 1 : 0)) return;
    if (hasOpen && allowOpen !== 'always' && base > 5) return;
    if (!acceptable(plan, frets)) return;
    const key = frets.join(',');
    if (found.has(key)) return;
    const fingering = assignFingers(frets);
    if (!fingering) return;
    // Two barres at once is past what a chord chart should ask for.
    if (findBarres(frets, fingering.fingers).length > 2) return;
    const difficulty = voicingDifficulty(frets, fingering.fingers);
    if (opts.maxDifficulty !== undefined && difficulty > opts.maxDifficulty) return;
    found.set(key, { frets: [...frets], score: scoreShape(plan, frets, difficulty), library: null });
  };

  // The search is a tree of one choice per string. Three things keep it small: a sounding block may
  // only be interrupted `innerMutes` times, notes above the window's first fret each need a finger
  // (neighbouring strings at one fret can share one) and there are only three such fingers, and a
  // hard budget stops instruments with very many strings from running away.
  let budget = SEARCH_BUDGET;
  const walk = (index: number, base: number, anyFretted: boolean, sounding: number, gaps: number, pending: number, units: number) => {
    if (budget <= 0) return;
    if (index === count) {
      budget--;
      if (sounding >= plan.minNotes) leaf(base, anyFretted);
      return;
    }
    // Not enough strings left to reach the minimum: stop early.
    if (sounding + (count - index) < plan.minNotes) return;
    const forced = opts.allStrings && usable?.has(index);
    if (!forced) {
      frets[index] = null;
      walk(index + 1, base, anyFretted, sounding, gaps, sounding > 0 ? pending + 1 : 0, units);
    }
    // Sounding again after muted strings turns those mutes into gaps inside the chord.
    const nowGaps = gaps + pending;
    if (sounding < plan.maxNotes && nowGaps <= plan.innerMutes) {
      if (openOk[index] && (allowOpen === 'always' || base <= 5)) {
        frets[index] = 0;
        walk(index + 1, base, anyFretted, sounding + 1, nowGaps, 0, units);
      }
      const previous = index > 0 ? frets[index - 1] : null;
      for (const fret of toneFrets[index]) {
        if (fret < base) continue;
        if (fret > base + plan.maxSpan) break;
        const nowUnits = units + (fret > base && fret !== previous ? 1 : 0);
        if (nowUnits > 3) continue;
        frets[index] = fret;
        walk(index + 1, base, true, sounding + 1, nowGaps, 0, nowUnits);
      }
    }
    frets[index] = null;
  };

  for (let base = minFret; base <= maxFret; base++) walk(0, base, false, 0, 0, 0, 0);
  (globalThis as Record<string, unknown>).__leaves = SEARCH_BUDGET - budget;
  return [...found.values()];
}

/** True when a library voicing respects the search options that restrict where and what may sound. */
function libraryFits(plan: Plan, v: Voicing, opts: VoicingSearchOptions): boolean {
  const pressed = v.frets.filter((f): f is number => f !== null && f > 0);
  if (pressed.length && Math.min(...pressed) < (opts.minFret ?? 1)) return false;
  if (pressed.length && Math.max(...pressed) > (opts.maxFret ?? 15)) return false;
  if (opts.allowOpen === false && !v.movable) return false;
  if (v.span > plan.maxSpan + (v.movable ? 0 : 1)) return false;
  const strings = v.notes.map((n) => n.string);
  if (Math.max(...strings) - Math.min(...strings) + 1 - strings.length > plan.innerMutes) return false;
  if (opts.maxDifficulty !== undefined && v.difficulty > opts.maxDifficulty) return false;
  if (opts.strings) {
    const usable = new Set(opts.strings);
    if (v.notes.some((n) => !usable.has(n.string))) return false;
    if (opts.allStrings && v.notes.length !== usable.size) return false;
  }
  if (opts.minNotes !== undefined && v.notes.length < opts.minNotes) return false;
  if (opts.maxNotes !== undefined && v.notes.length > opts.maxNotes) return false;
  if (v.rootless !== plan.rootless) return false;
  const lowest = v.notes.reduce((a, b) => (b.midi < a.midi ? b : a));
  const highest = v.notes.reduce((a, b) => (b.midi > a.midi ? b : a));
  if (plan.bassPc !== null && mod12(lowest.midi) !== plan.bassPc) return false;
  if (plan.topPc !== null && mod12(highest.midi) !== plan.topPc) return false;
  return true;
}

/** Name what a computed shape is, where a guitarist has a name for it. */
function describe(plan: Plan, frets: Frets): { label?: string; category?: VoicingCategory } {
  if (plan.c.type.id === '5') return { label: frets.some((f) => f === 0) ? 'Open power chord' : 'Power chord', category: 'power' };
  const voices: Array<{ midi: number; index: number }> = [];
  frets.forEach((fret, i) => {
    if (fret !== null) voices.push({ midi: plan.t.midi[i] + plan.capo + fret, index: i });
  });
  voices.sort((a, b) => a.midi - b.midi);
  const distinct = new Set(voices.map((v) => mod12(v.midi))).size;
  if (voices.length === 4 && distinct === 4 && plan.tones.length === 4 && !frets.some((f) => f === 0)) {
    const [bass, second, third, top] = voices.map((v) => v.midi);
    const raised = bass + 12;
    // Lift the bass an octave: if the four voices then sit inside one octave, the chord is a drop voicing.
    if (top - second < 12 && raised > second && raised < top) {
      return raised > third ? { label: 'Drop 2', category: 'drop2' } : { label: 'Drop 3', category: 'drop3' };
    }
  }
  return {};
}

/**
 * How two shapes relate when one is the other with strings muted and the bass note is the same:
 * the number of strings they differ by, or 0 when they are different voicings. A small chord
 * on the high strings is not a "thinner" version of a full barre: its bass is an octave up.
 */
function mutedTwin(plan: Plan, a: Frets, b: Frets): number {
  let onlyA = 0;
  let onlyB = 0;
  let lowA = Infinity;
  let lowB = Infinity;
  for (let i = 0; i < a.length; i++) {
    const fa = a[i];
    const fb = b[i];
    if (fa !== null) lowA = Math.min(lowA, plan.t.midi[i] + fa);
    if (fb !== null) lowB = Math.min(lowB, plan.t.midi[i] + fb);
    if (fa === fb) continue;
    if (fa !== null && fb !== null) return 0;
    if (fa === null) onlyB++;
    else onlyA++;
  }
  if ((onlyA > 0 && onlyB > 0) || lowA !== lowB) return 0;
  return onlyA + onlyB;
}

/** Complete shapes one search may examine. A six-string chord needs a few thousand; this only bites on a dozen strings. */
const SEARCH_BUDGET = 40_000_000;

const CACHE = new Map<string, Voicing[]>();
const CACHE_LIMIT = 600;

function cacheKey(c: Chord, t: Tuning, capo: number, opts: VoicingSearchOptions, generatedOnly: boolean): string {
  const rest: Record<string, unknown> = { ...opts, tuning: undefined, capo: undefined };
  return `${c.symbol}|${t.id}|${t.midi.join(',')}|${capo}|${generatedOnly ? 'g' : 'a'}|${JSON.stringify(rest)}`;
}

function run(chordInput: string | Chord, opts: VoicingSearchOptions, generatedOnly: boolean): Voicing[] {
  const c = parseChord(chordInput);
  const t = tuning(opts.tuning);
  const capo = opts.capo ?? 0;
  const key = cacheKey(c, t, capo, opts, generatedOnly);
  const cached = CACHE.get(key);
  if (cached) return [...cached];
  const plan = makePlan(c, t, capo, opts);
  const candidates = new Map<string, Candidate>();
  for (const cand of search(plan, opts)) candidates.set(cand.frets.join(','), cand);
  if (!generatedOnly && opts.library !== false) {
    const curated = libraryVoicings(c, { tuning: t, capo, maxFret: opts.maxFret ?? 15, inversions: plan.bassPc === null });
    for (const v of curated) {
      if (!libraryFits(plan, v, opts)) continue;
      const id = v.frets.join(',');
      const base = candidates.get(id)?.score ?? scoreShape(plan, v.frets, v.difficulty);
      candidates.set(id, { frets: v.frets, score: base + LIBRARY_BONUS[v.category], library: v });
    }
  }
  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score || a.frets.join(',').localeCompare(b.frets.join(',')));
  const limit = opts.maxResults ?? 12;
  const out: Voicing[] = [];
  const kept: Candidate[] = [];
  /** The score that won each place in the list, so a chain of fuller twins cannot drift far from it. */
  const earned: number[] = [];
  const make = (cand: Candidate) => cand.library
    ?? tryBuildVoicing(c, cand.frets, { tuning: t, capo, source: 'generated', allowIncomplete: plan.incomplete, ...describe(plan, cand.frets) });
  const sounding = (cand: Candidate) => cand.frets.filter((f) => f !== null).length;
  for (const cand of ranked) {
    // The same shape with one string more or less muted is not a new voicing (curated shapes are kept even so).
    const exempt = cand.library !== null;
    // The small movable families (triads, shells, drop voicings) sometimes land on open strings near
    // the nut and turn out to be a slice of an open chord already listed: that adds nothing.
    const slice = cand.library !== null && ['triad', 'shell', 'drop2', 'drop3'].includes(cand.library.category) && !cand.library.movable;
    if (slice && kept.some((k) => sounding(k) > sounding(cand) && mutedTwin(plan, k.frets, cand.frets) > 0)) continue;
    const twinAt = exempt ? -1 : kept.findIndex((k) => mutedTwin(plan, k.frets, cand.frets) === 1);
    if (twinAt >= 0) {
      // The fuller shape is the chord (320003 rather than 32000x): let it take the place its thinner
      // twin earned, unless it is clearly the worse shape. Power chords stay small.
      const twin = kept[twinAt];
      if (!twin.library && plan.tones.length > 2 && sounding(cand) > sounding(twin) && earned[twinAt] - cand.score <= 5) {
        const voicing = make(cand);
        if (voicing) {
          kept[twinAt] = cand;
          out[twinAt] = voicing;
        }
      }
      continue;
    }
    if (out.length >= limit) continue;
    const voicing = make(cand);
    if (!voicing) continue;
    kept.push(cand);
    earned.push(cand.score);
    out.push(voicing);
  }
  if (CACHE.size >= CACHE_LIMIT) CACHE.clear();
  CACHE.set(key, out);
  return [...out];
}

/**
 * Playable voicings of any chord in any tuning, best first: curated shapes where the library has
 * them, computed ones for everything else. `chordVoicings('C')[0]` is the open C every beginner
 * learns; `chordVoicings('F#m7b5', { minFret: 5, strings: [4, 3, 2, 1] })` asks for something specific.
 * Results are cached: treat the voicings as read-only.
 */
export function chordVoicings(chordInput: string | Chord, opts: VoicingSearchOptions = {}): Voicing[] {
  return run(chordInput, opts, false);
}

/** Only the computed voicings, without the curated library (the raw generator). */
export function generateVoicings(chordInput: string | Chord, opts: VoicingSearchOptions = {}): Voicing[] {
  return run(chordInput, opts, true);
}

/** The top-ranked voicing of a chord, or null when the options leave none. */
export function bestVoicing(chordInput: string | Chord, opts: VoicingSearchOptions = {}): Voicing | null {
  return run(chordInput, { ...opts, maxResults: 1 }, false)[0] ?? null;
}

/** The voicing that is easiest to hold among the best-ranked ones, or null when there is none. */
export function easiestVoicing(chordInput: string | Chord, opts: VoicingSearchOptions = {}): Voicing | null {
  const list = run(chordInput, { ...opts, maxResults: Math.max(8, opts.maxResults ?? 8) }, false);
  return list.reduce<Voicing | null>((best, v) => (!best || v.difficulty < best.difficulty ? v : best), null);
}

/**
 * How hard a chord is on the guitar as it is normally played: the difficulty (1–10) of its
 * top-ranked voicing (Em 2.2, C 3.4, F 4.4, B flat 6.9); 10 when it has none.
 */
export function chordDifficulty(chordInput: string | Chord, opts: NeckOptions = {}): number {
  return bestVoicing(chordInput, opts)?.difficulty ?? 10;
}
