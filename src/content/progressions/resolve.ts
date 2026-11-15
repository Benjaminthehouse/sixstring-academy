/**
 * Turning catalog entries into music: split a chart into bars, read a chart token, choose a key
 * spelling, resolve the numerals to chord symbols with the theory engine, and build the bars the
 * BackingBand plays. Pure functions; nothing here touches Web Audio.
 */
import { BACKING_STYLES, type BackingBar, type BackingChord, type BackingStyleId } from '@/core/audio';
import {
  buildChord, chord, degreeToInterval, formatDegree, formatRoman, key, note, parseRoman,
  romanToChord, scaleNotes, simplifyNote, transpose, type KeyMode,
} from '@/core/theory';
import type { ChordSlot, Progression, ScaleTip, Tonality } from './types';

// ── Charts and tokens ─────────────────────────────────────────────────────────────────────────

const SLOT_RE = /^(.+?)(?:\/([b#]?[1-7]))?$/;
const DEGREE_RE = /^[b#]?[1-7]$/;

/** Split chart text into bars of tokens: `'I | ii7 V7 | I'` -> `[['I'], ['ii7', 'V7'], ['I']]`. */
export function parseChart(chart: string): string[][] {
  return chart
    .split('|')
    .map((bar) => bar.trim())
    .filter((bar) => bar.length > 0)
    .map((bar) => bar.split(/\s+/));
}

/**
 * Read one chart token: `'V/7'` -> `{ numeral: 'V', bass: '7' }`, `'V7/ii'` -> applied chord,
 * no bass. Null when the numeral does not parse with the theory engine.
 */
export function parseSlot(token: string): ChordSlot | null {
  const m = SLOT_RE.exec(token.trim());
  if (!m) return null;
  const numeral = m[1];
  if (!parseRoman(numeral)) return null;
  return { numeral, bass: m[2] ?? null };
}

/** Display text for a token with music signs: `'bVII'` -> `'♭VII'`, `'iv/b6'` -> `'iv/♭6'`. */
export function formatSlot(token: string, opts: { ascii?: boolean } = {}): string {
  const slot = parseSlot(token);
  if (!slot) return token;
  const numeral = formatRoman(slot.numeral, { ascii: opts.ascii });
  if (!slot.bass) return numeral;
  return `${numeral}/${opts.ascii ? slot.bass : formatDegree(slot.bass)}`;
}

// ── Tonality and keys ─────────────────────────────────────────────────────────────────────────

/** Theory-engine scale id of each tonality's home scale. */
export const TONALITY_SCALE: Readonly<Record<Tonality, string>> = {
  major: 'major', minor: 'minor', dorian: 'dorian', phrygian: 'phrygian',
  'phrygian-dominant': 'phrygian-dominant', lydian: 'lydian', mixolydian: 'mixolydian', locrian: 'locrian',
};

/** Plain-language name of each tonality, for "A minor", "D Dorian". */
export const TONALITY_NAME: Readonly<Record<Tonality, string>> = {
  major: 'major', minor: 'minor', dorian: 'Dorian', phrygian: 'Phrygian',
  'phrygian-dominant': 'Phrygian dominant', lydian: 'Lydian', mixolydian: 'Mixolydian', locrian: 'Locrian',
};

/** The engine key whose spelling a tonality borrows: major-third modes read as major, the rest as minor. */
export function keyModeFor(tonality: Tonality): KeyMode {
  return tonality === 'major' || tonality === 'lydian' || tonality === 'mixolydian' || tonality === 'phrygian-dominant'
    ? 'major'
    : 'minor';
}

/** A progression's home in a concrete key. */
export interface HomeKey {
  tonic: string;
  tonality: Tonality;
  /** The engine key used for spelling (`{ tonic, mode }`). */
  keyMode: KeyMode;
  /** Theory scale id of the home scale. */
  scale: string;
  /** "A minor", "D Dorian", "E Phrygian dominant" (ASCII; format the tonic for display). */
  name: string;
}

function tidy(name: string, own: readonly string[]): string {
  return own.includes(name) || Math.abs(note(name).alt) < 2 ? name : simplifyNote(name);
}

/** The home key of a progression on a tonic (`'A'`, `'F#'`). */
export function homeKey(p: Pick<Progression, 'tonality'>, tonic: string): HomeKey {
  const t = note(tonic).pcName;
  return {
    tonic: t,
    tonality: p.tonality,
    keyMode: keyModeFor(p.tonality),
    scale: TONALITY_SCALE[p.tonality],
    name: `${t} ${TONALITY_NAME[p.tonality]}`,
  };
}

// ── Resolving to chords ───────────────────────────────────────────────────────────────────────

/** One chord of a resolved progression. */
export interface ResolvedChord {
  /** The chart token (`'V/7'`). */
  token: string;
  numeral: string;
  /** Bass degree of the key, or null. */
  bassDegree: string | null;
  /** Chord symbol in the key, with slash bass when there is one (`'G/B'`). */
  symbol: string;
  root: string;
  /** Bass note name when it is not the root, else null. */
  bass: string | null;
  /** Chord notes from the root up (the slash bass not included). */
  notes: string[];
  /** Beat (0-based) where it starts in its bar, and how many beats it lasts, in the feel's meter. */
  beat: number;
  beats: number;
  /** The same chord as the BackingBand wants it. */
  backing: BackingChord;
}

/** A progression made concrete in one key. */
export interface ResolvedProgression {
  progression: Progression;
  key: HomeKey;
  /** The backing style the beats were counted in. */
  backing: BackingStyleId;
  beatsPerBar: number;
  bars: ResolvedChord[][];
  /** Every chord symbol in order of first appearance (for chord diagrams). */
  chords: string[];
}

/** Resolve one chart token in a key: `('V/7', C major)` -> `G/B`. Throws RangeError on a bad token. */
export function resolveSlot(token: string, home: HomeKey): Pick<ResolvedChord, 'token' | 'numeral' | 'bassDegree' | 'symbol' | 'root' | 'bass' | 'notes' | 'backing'> {
  const slot = parseSlot(token);
  if (!slot) throw new RangeError(`Not a chart token: "${token}"`);
  const k = key({ tonic: home.tonic, mode: home.keyMode });
  const plain = chord(romanToChord(slot.numeral, k));
  let bass: string | null = null;
  if (slot.bass) {
    if (!DEGREE_RE.test(slot.bass)) throw new RangeError(`Not a bass degree: "${slot.bass}"`);
    const own = [...k.scale, ...(k.harmonicMinor ?? []), ...(k.melodicMinor ?? [])];
    bass = tidy(transpose(k.tonic, degreeToInterval(slot.bass)), own);
    if (note(bass).chroma === note(plain.root).chroma) bass = null;
  }
  const full = bass ? buildChord(plain.root, plain.type, bass) : plain;
  const pcs = plain.notes.map((n) => note(n).chroma);
  const backing: BackingChord = { root: note(plain.root).chroma, tones: [...new Set(pcs)], symbol: full.symbol };
  if (bass) backing.bass = note(bass).chroma;
  return { token, numeral: slot.numeral, bassDegree: slot.bass, symbol: full.symbol, root: plain.root, bass, notes: [...plain.notes], backing };
}

/** How a bar of `n` chords splits `beatsPerBar` beats (the same rule the BackingBand uses). */
export function splitBeats(n: number, beatsPerBar: number): number[] {
  const count = Math.max(1, Math.min(n, beatsPerBar));
  const base = Math.floor(beatsPerBar / count);
  const extra = beatsPerBar - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Resolve a progression in a key: every token becomes a chord symbol, with its beats counted in
 * the default feel's meter (or the given backing style's). Throws RangeError on a bad tonic.
 */
export function resolveProgression(p: Progression, tonic: string, opts: { backing?: BackingStyleId } = {}): ResolvedProgression {
  const home = homeKey(p, tonic);
  const backing = opts.backing ?? p.feel.backing;
  const beatsPerBar = BACKING_STYLES[backing].beatsPerBar;
  const seen = new Set<string>();
  const chords: string[] = [];
  const bars = p.bars.map((bar) => {
    const lengths = splitBeats(bar.length, beatsPerBar);
    let beat = 0;
    return bar.slice(0, lengths.length).map((token, i) => {
      const r = resolveSlot(token, home);
      const out: ResolvedChord = { ...r, beat, beats: lengths[i] };
      beat += lengths[i];
      if (!seen.has(r.symbol)) {
        seen.add(r.symbol);
        chords.push(r.symbol);
      }
      return out;
    });
  });
  return { progression: p, key: home, backing, beatsPerBar, bars, chords };
}

/** The bars in the shape `BackingBand.load()` takes: one chord, or an evenly split array. */
export function toBackingBars(resolved: ResolvedProgression): BackingBar[] {
  return resolved.bars.map((bar) => (bar.length === 1 ? bar[0].backing : bar.map((c) => c.backing)));
}

// ── Choosing a spelling for each of the 12 keys ───────────────────────────────────────────────

function spellingCost(p: Progression, tonic: string): number {
  const home = homeKey(p, tonic);
  // The key signature weighs most (G# minor, not Ab minor), then how the chords themselves read.
  let cost = 3 * scaleNotes(tonic, home.scale).reduce((n, x) => n + Math.abs(note(x).alt), 0);
  const names = new Set<string>();
  for (const bar of p.bars) {
    for (const token of bar) {
      const r = resolveSlot(token, home);
      for (const n of r.notes) names.add(n);
      if (r.bass) names.add(r.bass);
    }
  }
  for (const n of names) {
    const alt = Math.abs(note(n).alt);
    cost += alt >= 2 ? alt * 3 : alt;
    if (n === 'Cb' || n === 'Fb' || n === 'E#' || n === 'B#') cost += 1;
  }
  return cost;
}

function candidateTonics(pc: number): string[] {
  const names = ['C', 'C#', 'Db', 'D', 'Eb', 'D#', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'G#', 'A', 'Bb', 'A#', 'B', 'Cb'];
  return names.filter((n) => note(n).chroma === pc);
}

/**
 * The best spelling of a tonic for this progression: the one whose chords read with the fewest
 * accidentals (Db major rather than C#, but C# minor rather than Db; F# for a progression full of
 * flat-side borrowed chords). Accepts a pitch class or any note name.
 */
export function bestTonic(p: Progression, tonic: number | string): string {
  const pc = typeof tonic === 'number' ? ((Math.round(tonic) % 12) + 12) % 12 : note(tonic).chroma;
  const options = candidateTonics(pc);
  let best = options[0];
  let bestCost = Infinity;
  for (const t of options) {
    const c = spellingCost(p, t);
    if (c < bestCost) {
      best = t;
      bestCost = c;
    }
  }
  return best;
}

/** All 12 tonics, best spelled for this progression, from C upward. */
export function keyChoices(p: Progression): string[] {
  return Array.from({ length: 12 }, (_, pc) => bestTonic(p, pc));
}

/** The tonic spellings considered for a pitch class (`'F#'` -> `['F#', 'Gb']`, `'B'` -> `['B', 'Cb']`). */
export function tonicSpellings(tonic: string | number): string[] {
  return candidateTonics(typeof tonic === 'number' ? ((Math.round(tonic) % 12) + 12) % 12 : note(tonic).chroma);
}

// ── Soloing scales in a key ───────────────────────────────────────────────────────────────────

/** A soloing scale made concrete: `{ tonic: 'A', scale: 'minor-pentatonic' }` in C. */
export interface ConcreteScale {
  tonic: string;
  scale: string;
}

/** The progression's scale tips in a key (tonic of each scale computed from its degree). */
export function scalesInKey(tips: readonly ScaleTip[], home: HomeKey): ConcreteScale[] {
  return tips.map((t) => {
    const raw = transpose(home.tonic, degreeToInterval(t.degree));
    return { tonic: Math.abs(note(raw).alt) >= 2 ? simplifyNote(raw) : raw, scale: t.scale };
  });
}
