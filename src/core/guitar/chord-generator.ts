/**
 * The voicing generator: every way a hand can play a chord in a tuning, ranked.
 *
 * It enumerates one fret (or a mute) per string inside a hand-sized window, keeps the shapes that
 * sound only chord tones, contain the tones the chord cannot do without, have the right note in
 * the bass and can be fingered with four fingers, and scores them for ease and for how much they
 * sound like something a guitarist would actually play. Curated library shapes are merged in and
 * ranked first where they fit.
 *
 * Nothing comes back that a hand cannot hold, and no chord comes back empty: where a tuning has no
 * room for the whole chord (a 13th chord on a four-string bass) the search gives up what matters
 * least, step by step, and the voicings say so in `omitted` and `rootless`.
 */
import { chord as parseChord, chordTones, note as parseNote, type Chord, type ChordTone } from '@/core/theory';
import { curatedBonus, libraryCoverage, libraryVoicings } from './chord-library';
import type { NeckOptions } from './fretboard';
import { tuning, type Tuning } from './tunings';
import {
  assignFingers, essentialTones, findBarres, hasBassRegister, tryBuildVoicing, voicingDifficulty, type Frets, type Voicing, type VoicingCategory,
} from './voicing';

/** What to look for. */
export interface VoicingSearchOptions extends NeckOptions {
  /** Lowest fret a fretted note may use (default 1). */
  minFret?: number;
  /** Highest fret a fretted note may use (default 15). */
  maxFret?: number;
  /** Frets the fretted notes may span, inclusive (default 4: one finger per fret). 5 also admits one-fret stretches. */
  maxSpan?: number;
  /** May open strings ring? Default true, within the first five frets; `'always'` allows them under any position. */
  allowOpen?: boolean | 'always';
  /**
   * Must the lowest note be the root (or the slash bass)? Default true (false on ukuleles and
   * re-entrant tunings, which have no bass register); false also returns inversions.
   */
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
  /** Drop anything harder than this (1–10). Default 9, waived when a chord has nothing easier in the tuning. */
  maxDifficulty?: number;
  /** How many voicings to return (default 12). */
  maxResults?: number;
  /** Include the curated library shapes (default true). */
  library?: boolean;
}

interface Candidate {
  frets: Array<number | null>;
  score: number;
  difficulty: number;
  library: Voicing | null;
}

/**
 * Shapes harder than this are left out unless the caller sets `maxDifficulty` or nothing easier
 * exists: a hand can hold them, but nobody should be handed one as "a way to play this chord".
 */
const DEFAULT_MAX_DIFFICULTY = 9;

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
  /** The caller asked for voicings without the root: shapes that contain it are refused. */
  rootless: boolean;
  /** True when tones the chord needs had to go: too few strings for them, or nothing playable with all of them. */
  incomplete: boolean;
}

/**
 * How far the search may be relaxed when the full chord cannot be played in a tuning (C13b9 on a
 * four-string bass): 1 opens the hand (one more muted string inside, a five-fret span), 2 lets the
 * root go, each further step drops the least important tone that is left.
 */
const MAX_RELAX = 6;

/** The plan for a search, or null when `relax` asks for more than can be given up. */
function makePlan(c: Chord, t: Tuning, capo: number, opts: VoicingSearchOptions, relax = 0): Plan | null {
  const tones = chordTones(c);
  const byPc = new Map<number, ChordTone>();
  for (const tone of tones) {
    const pc = parseNote(tone.note).chroma;
    if (!byPc.has(pc)) byPc.set(pc, tone);
  }
  const rootPc = parseNote(c.root).chroma;
  const strings = opts.strings?.length ?? t.stringCount;
  const rootless = (opts.rootless ?? false) && tones.length >= 4;
  // Start from the tones a voicing must keep; then make it fit the strings there are.
  let keep = essentialTones(c).filter((tone) => !(rootless && tone.role === 'root'));
  const room = Math.min(strings, opts.maxNotes ?? strings);
  if (keep.length > room || (relax >= 2 && keep.length > 2)) keep = keep.filter((tone) => tone.role !== 'root');
  // Too many tones for the strings, or told to give some up: the least important tone goes first.
  let incomplete = false;
  let drop = Math.max(0, relax - 2);
  while (keep.length > room || (drop > 0 && keep.length > 2)) {
    if (keep.length <= room) drop--;
    const worst = keep.reduce((a, b) => (b.priority >= a.priority ? b : a));
    keep = keep.filter((tone) => tone !== worst);
    incomplete = true;
  }
  if (drop > 0) return null;
  const foreign = c.bass && c.inversion === null ? parseNote(c.bass).chroma : null;
  const wantsRootBass = opts.rootInBass ?? hasBassRegister(t);
  const bassPc = rootless ? null : c.bass ? parseNote(c.bass).chroma : wantsRootBass && keep.some((tone) => tone.role === 'root') ? rootPc : null;
  const fewest = c.type.intervals.length <= 2 ? 2 : Math.min(3, strings);
  return {
    c, t, capo, tones, byPc, rootPc,
    required: [...new Set(keep.map((tone) => parseNote(tone.note).chroma))],
    bassPc, foreignBass: foreign,
    topPc: opts.top ? parseNote(opts.top).chroma : null,
    minNotes: Math.max(2, opts.minNotes ?? fewest),
    maxNotes: opts.maxNotes ?? t.stringCount,
    maxSpan: opts.maxSpan ?? (relax >= 1 ? 5 : 4),
    innerMutes: opts.innerMutes ?? (relax >= 1 ? 2 : 1),
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
  if (power) score += 2 * (t.stringCount - 1 - sounding[0]) - (sounding[0] > 2 ? 8 : 0);
  // A hole in the middle of a chord has to be damped; in a power chord it has no business at all.
  score -= (power ? 10 : 5) * (sounding[sounding.length - 1] - sounding[0] + 1 - sounding.length);
  // A ukulele is strummed whole: every string left out is one to dodge.
  if (!hasBassRegister(t)) score -= 4 * (t.stringCount - sounding.length);
  const counts = new Map<number, number>();
  for (const m of midi) counts.set(mod12(m), (counts.get(mod12(m)) ?? 0) + 1);
  const alt = plan.c.type.id === '7alt';
  if (alt) {
    // The usual reading of "alt": one altered ninth and one altered fifth.
    const has = (semis: number) => counts.has(mod12(plan.rootPc + semis));
    const ninth = has(1) || has(3);
    const fifth = has(6) || has(8);
    score += ninth && fifth ? 16 : ninth || fifth ? 5 : 0;
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
  if (mod12(sorted[0]) === plan.rootPc && hasBassRegister(t)) score += 6;
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
  // Open strings ring best under the first frets. (A power chord gains nothing from one unless it is its root.)
  if (hasOpen && !(power && frets[sounding[0]] !== 0)) score += base <= 3 ? 5 : base <= 5 ? -3 : -8;
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
    if (pressed.length && Math.max(...pressed) - base + 1 > plan.maxSpan) return;
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
    found.set(key, { frets: [...frets], score: scoreShape(plan, frets, difficulty), difficulty, library: null });
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
        if (fret > base + plan.maxSpan - 1) break;
        const nowUnits = units + (fret > base && fret !== previous ? 1 : 0);
        if (nowUnits > 3) continue;
        frets[index] = fret;
        walk(index + 1, base, true, sounding + 1, nowGaps, 0, nowUnits);
      }
    }
    frets[index] = null;
  };

  for (let base = minFret; base <= maxFret; base++) walk(0, base, false, 0, 0, 0, 0);
  return [...found.values()];
}

const SMALL_FAMILIES: readonly VoicingCategory[] = ['triad', 'shell', 'drop2', 'drop3'];

/** What a curated voicing is worth over a computed one in a tuning. */
function libraryBonus(t: Tuning, v: Voicing): number {
  // A movable family that lands on open strings is a slice of some open chord: it competes as any computed shape does.
  if (SMALL_FAMILIES.includes(v.category) && !v.movable) return 0;
  // With a seventh string below them, the six-string power chords are no longer the lowest ones there are.
  if (v.category === 'power' && t.stringCount > 6) return 10;
  return LIBRARY_BONUS[v.category] + curatedBonus(v);
}

/** True when a library voicing respects the search options that restrict where and what may sound. */
function libraryFits(plan: Plan, v: Voicing, opts: VoicingSearchOptions): boolean {
  const pressed = v.frets.filter((f): f is number => f !== null && f > 0);
  if (pressed.length && Math.min(...pressed) < (opts.minFret ?? 1)) return false;
  if (pressed.length && Math.max(...pressed) > (opts.maxFret ?? 15)) return false;
  if (opts.allowOpen === false && !v.movable) return false;
  if (v.span > plan.maxSpan) return false;
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

/** True when `small` sounds only strings that `big` sounds, at the same frets, and fewer of them. */
function isSlice(small: Frets, big: Frets): boolean {
  let fewer = false;
  for (let i = 0; i < small.length; i++) {
    if (small[i] === big[i]) continue;
    if (small[i] !== null) return false;
    fewer = true;
  }
  return fewer;
}

/**
 * Complete shapes one search may examine. The largest chord takes about 55 000 on six strings,
 * 190 000 on seven and 570 000 on eight with default options (1.1 million on seven with every
 * option opened up), so this only bites on instruments with nine strings or more.
 */
const SEARCH_BUDGET = 2_000_000;

const CACHE = new Map<string, Voicing[]>();
const CACHE_LIMIT = 2000;

function cacheKey(c: Chord, t: Tuning, capo: number, opts: VoicingSearchOptions, generatedOnly: boolean): string {
  const rest: Record<string, unknown> = { ...opts, tuning: undefined, capo: undefined };
  return `${c.symbol}|${t.id}|${t.midi.join(',')}|${capo}|${generatedOnly ? 'g' : 'a'}|${JSON.stringify(rest)}`;
}

/** Every candidate shape of one plan: the search, with the curated shapes that fit merged in. */
function gather(plan: Plan, opts: VoicingSearchOptions, generatedOnly: boolean): Map<string, Candidate> {
  const { c, t, capo } = plan;
  const candidates = new Map<string, Candidate>();
  for (const cand of search(plan, opts)) candidates.set(cand.frets.join(','), cand);
  if (!generatedOnly && opts.library !== false) {
    const curated = libraryVoicings(c, { tuning: t, capo, maxFret: opts.maxFret ?? 15, inversions: plan.bassPc === null });
    for (const v of curated) {
      if (!libraryFits(plan, v, opts)) continue;
      const id = v.frets.join(',');
      const base = candidates.get(id)?.score ?? scoreShape(plan, v.frets, v.difficulty);
      candidates.set(id, { frets: v.frets, score: base + libraryBonus(t, v), difficulty: v.difficulty, library: v });
    }
    // In a drop tuning the open chords grow downward: drop D exists to play D as 000232, not xx0232.
    // The fullest shape that adds only open strings to a curated open chord takes its place.
    if (libraryCoverage(t) === 'partial') {
      for (const v of curated) {
        if (v.category !== 'open') continue;
        let fullest: Candidate | null = null;
        for (const cand of candidates.values()) {
          if (cand.library || !isSlice(v.frets, cand.frets) || cand.frets.some((f, i) => f !== v.frets[i] && f !== 0)) continue;
          if (!fullest || cand.frets.filter((f) => f !== null).length > fullest.frets.filter((f) => f !== null).length) fullest = cand;
        }
        if (!fullest) continue;
        fullest.score += LIBRARY_BONUS.open + curatedBonus(v);
        candidates.delete(v.frets.join(','));
      }
    }
  }
  return candidates;
}

function run(chordInput: string | Chord, opts: VoicingSearchOptions, generatedOnly: boolean): Voicing[] {
  const c = parseChord(chordInput);
  const t = tuning(opts.tuning);
  const capo = opts.capo ?? 0;
  const key = cacheKey(c, t, capo, opts, generatedOnly);
  const cached = CACHE.get(key);
  if (cached) {
    // Recently used entries are the last to go.
    CACHE.delete(key);
    CACHE.set(key, cached);
    return [...cached];
  }
  // When the chord as written cannot be played here, give up what matters least until something can.
  let plan = makePlan(c, t, capo, opts)!;
  let candidates = gather(plan, opts, generatedOnly);
  for (let relax = 1; !candidates.size && relax <= MAX_RELAX; relax++) {
    const relaxed = makePlan(c, t, capo, opts, relax);
    if (!relaxed) break;
    plan = relaxed;
    candidates = gather(plan, opts, generatedOnly);
  }
  let ranked = [...candidates.values()].sort((a, b) => b.score - a.score || a.frets.join(',').localeCompare(b.frets.join(',')));
  if (opts.maxDifficulty === undefined && ranked.some((cand) => cand.difficulty <= DEFAULT_MAX_DIFFICULTY)) {
    ranked = ranked.filter((cand) => cand.difficulty <= DEFAULT_MAX_DIFFICULTY);
  }
  const limit = opts.maxResults ?? 12;
  const out: Voicing[] = [];
  const kept: Candidate[] = [];
  /** The score that won each place in the list, so a chain of fuller twins cannot drift far from it. */
  const earned: number[] = [];
  const make = (cand: Candidate) => cand.library
    ?? tryBuildVoicing(c, cand.frets, { tuning: t, capo, source: 'generated', allowIncomplete: plan.incomplete, ...describe(plan, cand.frets) });
  const sounding = (cand: Candidate) => cand.frets.filter((f) => f !== null).length;
  const lowest = (cand: Candidate) => {
    let low = Infinity;
    cand.frets.forEach((fret, i) => {
      if (fret !== null) low = Math.min(low, t.midi[i] + fret);
    });
    return low;
  };
  const power = plan.tones.length <= 2;
  for (const cand of ranked) {
    const open = cand.frets.includes(0);
    if (cand.library) {
      // The small movable families (triads, shells, drop voicings) sometimes land on open strings near
      // the nut and turn out to be a slice of an open chord already listed: that adds nothing.
      if (SMALL_FAMILIES.includes(cand.library.category) && open && kept.some((k) => isSlice(cand.frets, k.frets))) continue;
    } else {
      // A computed shape that is a kept one with strings left out is the same chord strummed thinner
      // (32000x after 320003), unless it is a movable shape with a bass of its own (the top of a barre).
      if (kept.some((k) => isSlice(cand.frets, k.frets) && (open || lowest(k) === lowest(cand)))) continue;
      // The other way round, the fuller shape is the chord: let it take the place its thinner twin
      // earned, unless it is clearly the worse shape. Power chords stay small.
      const isTwin = (k: Candidate) => !k.library && isSlice(k.frets, cand.frets) && lowest(k) === lowest(cand);
      const twinAt = kept.findIndex(isTwin);
      if (twinAt >= 0) {
        const voicing = (!power || sounding(cand) <= 3) && earned[twinAt] - cand.score <= 5 ? make(cand) : null;
        if (voicing) {
          kept[twinAt] = cand;
          out[twinAt] = voicing;
          // Other thinner versions of the same shape further down the list go with it.
          for (let i = kept.length - 1; i > twinAt; i--) {
            if (!isTwin(kept[i])) continue;
            kept.splice(i, 1);
            earned.splice(i, 1);
            out.splice(i, 1);
          }
          continue;
        }
        // One more string of a shape already listed adds nothing; a much fuller one (the whole
        // barre under a four-string grip) is a voicing of its own and takes its own place below.
        if (power || kept.some((k) => isTwin(k) && sounding(cand) - sounding(k) === 1)) continue;
      }
    }
    if (out.length >= limit) continue;
    const voicing = make(cand);
    if (!voicing) continue;
    kept.push(cand);
    earned.push(cand.score);
    out.push(voicing);
  }
  // The oldest entries make room: a chord browser walks through hundreds of chords.
  if (CACHE.size >= CACHE_LIMIT) for (const old of [...CACHE.keys()].slice(0, CACHE_LIMIT / 4)) CACHE.delete(old);
  CACHE.set(key, out);
  return [...out];
}

/**
 * Playable voicings of any chord in any tuning, best first: curated shapes where the library has
 * them, computed ones for everything else. `chordVoicings('C')[0]` is the open C every beginner
 * learns, `chordVoicings('F')[0]` the full barre with the small F right behind it;
 * `chordVoicings('F#m7b5', { minFret: 5, strings: [4, 3, 2, 1] })` asks for something specific.
 * Results are cached (a repeated call is a table lookup): treat the voicings as read-only.
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
 * top-ranked voicing (Em 2.2, C 3.4, F 6.9 for the full barre, B flat 7.2); 10 when it has none.
 * `easiestVoicing(chord).difficulty` is what a beginner's version costs (the small F: 4.4).
 */
export function chordDifficulty(chordInput: string | Chord, opts: NeckOptions = {}): number {
  return bestVoicing(chordInput, opts)?.difficulty ?? 10;
}
