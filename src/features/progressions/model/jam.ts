/**
 * The jam view's logic: the band settings a learner can change, where the band is in the chart
 * (from a `ChordSegment`), the next chord and how far away it is, which scale to solo with over
 * each chord, and the dots for the neck. Pure.
 */
import {
  resolveSlot, soloScales,
  type ConcreteScale, type HomeKey, type Progression, type ProgressionFeel, type ResolvedChord, type ResolvedProgression,
} from '@/content/progressions';
import { BACKING_INSTRUMENTS, BACKING_STYLES, BACKING_STYLE_IDS, type BackingChord, type BackingInstrument, type BackingStyleId } from '@/core/audio';
import { chroma, getScale, scaleNotes, scalesForChord } from '@/core/theory';
import { arpeggioMarkers, scaleMarkers, type FretMarker } from '@/ui/music';

// ── Settings ─────────────────────────────────────────────────────────────────────────────────

/** What the learner can change about the band, kept per device. */
export interface JamSettings {
  /** Bars of count-in: 0, 1 or 2. */
  countIn: number;
  /** Loop for ever, or play `choruses` passes and an ending. */
  loop: boolean;
  choruses: number;
  /** Muted band members; the rhythm guitar starts muted (you are the guitarist). */
  muted: Record<BackingInstrument, boolean>;
  /** Which scale lights up on the neck: a scale tip by index (`tip-0`), the chord's own scale, or none. */
  scale: string;
}

/** Defaults: one bar of count-in, looping, two choruses when not looping, the first scale tip. */
export const DEFAULT_JAM: JamSettings = {
  countIn: 1,
  loop: true,
  choruses: 2,
  muted: { drums: false, bass: false, keys: false, guitar: true },
  scale: 'tip-0',
};

/** Settings from storage, with anything unreadable replaced by the default. */
export function sanitizeJam(raw: unknown): JamSettings {
  const r = raw && typeof raw === 'object' ? (raw as Partial<JamSettings>) : {};
  const muted = { ...DEFAULT_JAM.muted };
  if (r.muted && typeof r.muted === 'object') {
    for (const k of BACKING_INSTRUMENTS) {
      const v = (r.muted as Record<string, unknown>)[k];
      if (typeof v === 'boolean') muted[k] = v;
    }
  }
  const countIn = typeof r.countIn === 'number' && [0, 1, 2].includes(r.countIn) ? r.countIn : DEFAULT_JAM.countIn;
  const choruses = typeof r.choruses === 'number' && Number.isFinite(r.choruses) ? Math.min(16, Math.max(1, Math.round(r.choruses))) : DEFAULT_JAM.choruses;
  const scale = typeof r.scale === 'string' && /^(tip-[0-9]|chord|off)$/.test(r.scale) ? r.scale : DEFAULT_JAM.scale;
  return { countIn, loop: typeof r.loop === 'boolean' ? r.loop : DEFAULT_JAM.loop, choruses, muted, scale };
}

// ── Feels ────────────────────────────────────────────────────────────────────────────────────

/** The meter text of a backing style. */
export function meterOf(style: BackingStyleId): ProgressionFeel['meter'] {
  const ts = BACKING_STYLES[style].timeSignature;
  const text = `${ts.numerator}/${ts.denominator}`;
  return text === '3/4' || text === '6/8' || text === '12/8' ? text : '4/4';
}

/** A feel for any backing style, with the style's own tempo range. */
export function feelFor(style: BackingStyleId): ProgressionFeel {
  const s = BACKING_STYLES[style];
  return { backing: style, tempo: [s.tempo.min, s.tempo.max], meter: meterOf(style) };
}

/** The feels to offer: the progression's own first, then its alternatives, then every other style. */
export function feelsFor(p: Pick<Progression, 'feel' | 'altFeels'>): { suggested: ProgressionFeel[]; others: ProgressionFeel[] } {
  const suggested = [p.feel, ...(p.altFeels ?? [])].filter((f, i, all) => all.findIndex((g) => g.backing === f.backing) === i);
  const taken = new Set(suggested.map((f) => f.backing));
  const others = BACKING_STYLE_IDS.filter((id) => !taken.has(id)).map(feelFor);
  return { suggested, others };
}

/** The middle of a feel's tempo range, rounded. */
export function defaultTempo(feel: ProgressionFeel): number {
  return Math.round((feel.tempo[0] + feel.tempo[1]) / 2);
}

/** A tempo kept inside what the style can play. */
export function clampTempo(style: BackingStyleId, bpm: number): number {
  const s = BACKING_STYLES[style].tempo;
  const lo = Math.max(30, Math.min(s.min, 50));
  return Math.round(Math.min(s.max + 20, Math.max(lo, Number.isFinite(bpm) ? bpm : s.default)));
}

// ── Where the band is ────────────────────────────────────────────────────────────────────────

/** A place in the chart: bar and chord index within the bar. */
export interface ChartPos {
  bar: number;
  index: number;
}

/** What a band chord change says about where it is (a subset of `ChordSegment`). */
export interface SegmentLike {
  bar: number;
  beat: number;
  chorus: number;
  ending: boolean;
}

/** The chart position of a band segment (bar modulo the chart length; the ending bar is the last bar). */
export function positionOf(resolved: ResolvedProgression, seg: SegmentLike): ChartPos {
  const n = resolved.bars.length;
  const bar = seg.ending ? n - 1 : ((seg.bar % n) + n) % n;
  const chords = resolved.bars[bar];
  let index = 0;
  chords.forEach((c, i) => {
    if (c.beat <= seg.beat) index = i;
  });
  return { bar, index };
}

/** The chord at a chart position. */
export function chordAt(resolved: ResolvedProgression, pos: ChartPos): ResolvedChord {
  const bar = resolved.bars[Math.min(resolved.bars.length - 1, Math.max(0, pos.bar))];
  return bar[Math.min(bar.length - 1, Math.max(0, pos.index))];
}

/** The next different chord and how many beats away its arrival is (from the start of the current chord). */
export interface Upcoming {
  chord: ResolvedChord;
  pos: ChartPos;
  beats: number;
  /** True when the arrival is after the loop back to the top. */
  wraps: boolean;
}

/**
 * The next chord that differs from the one at `pos`, looking round to the top when `wrap` is set
 * (looping, or more passes to come). Null when the rest of the chart holds this chord and it does
 * not wrap.
 */
export function upcoming(resolved: ResolvedProgression, pos: ChartPos, wrap: boolean): Upcoming | null {
  const flat: Array<{ chord: ResolvedChord; pos: ChartPos; start: number }> = [];
  resolved.bars.forEach((bar, b) => bar.forEach((chord, i) => flat.push({ chord, pos: { bar: b, index: i }, start: b * resolved.beatsPerBar + chord.beat })));
  const here = flat.findIndex((f) => f.pos.bar === pos.bar && f.pos.index === pos.index);
  if (here < 0) return null;
  const total = resolved.bars.length * resolved.beatsPerBar;
  const current = flat[here];
  for (let step = 1; step < flat.length + 1; step++) {
    const j = here + step;
    if (j >= flat.length && !wrap) return null;
    const f = flat[j % flat.length];
    if (f.chord.symbol !== current.chord.symbol) {
      const wraps = j >= flat.length;
      return { chord: f.chord, pos: f.pos, beats: f.start - current.start + (wraps ? total : 0), wraps };
    }
  }
  return null;
}

/** "next bar", "in 3 bars", "in 2 beats" for a distance in beats. */
export function distanceText(beats: number, beatsPerBar: number): string {
  if (beats < beatsPerBar) return beats === 1 ? 'next beat' : `in ${beats} beats`;
  const bars = Math.round(beats / beatsPerBar);
  if (beats % beatsPerBar !== 0) return `in ${beats} beats`;
  return bars === 1 ? 'next bar' : `in ${bars} bars`;
}

/** The chord the band ends on: the first chord when it is the home chord, otherwise the home triad. */
export function endingChord(resolved: ResolvedProgression): BackingChord | undefined {
  const first = resolved.bars[0]?.[0];
  if (!first) return undefined;
  if (chroma(first.root) === chroma(resolved.key.tonic)) return undefined;
  const home = homeNumeral(resolved.key);
  try {
    return resolveSlot(home, resolved.key).backing;
  } catch {
    return undefined;
  }
}

/** The home chord's numeral for a tonality. */
export function homeNumeral(home: Pick<HomeKey, 'tonality'>): string {
  switch (home.tonality) {
    case 'minor':
    case 'dorian':
    case 'phrygian':
      return 'i';
    case 'locrian':
      return 'i°';
    default:
      return 'I';
  }
}

// ── Scales to solo with ──────────────────────────────────────────────────────────────────────

/** A scale option for the neck. */
export interface ScaleChoice {
  id: string;
  /** For `tip-n`: the scale; `chord` resolves per chord; `off` shows chord tones only. */
  scale: ConcreteScale | null;
}

/** The choices: each of the catalog's scale tips in this key, then the chord's own scale, then off. */
export function scaleChoices(p: Progression, tonic: string): ScaleChoice[] {
  const tips = soloScales(p, tonic).filter((s) => !!getScale(s.scale)).map((s, i) => ({ id: `tip-${i}`, scale: s }));
  return [...tips, { id: 'chord', scale: null }, { id: 'off', scale: null }];
}

/**
 * The chord-scale for one chord: among the engine's matching seven- and eight-note scales (up to
 * tier 3), the one that shares the most notes with the key (so D Dorian over Dm7 in C, G Mixolydian over G7,
 * E Phrygian dominant over E7 in A minor). Null when nothing matches.
 */
export function chordScale(symbol: string, home: Pick<HomeKey, 'tonic' | 'scale'>): ConcreteScale | null {
  let keyPcs: Set<number>;
  try {
    keyPcs = new Set(scaleNotes(home.tonic, home.scale).map(chroma));
  } catch {
    keyPcs = new Set();
  }
  let matches: ReturnType<typeof scalesForChord> = [];
  try {
    matches = scalesForChord(symbol, { maxTier: 3, limit: 24 });
  } catch {
    return null;
  }
  let best: ConcreteScale | null = null;
  let bestScore = -1;
  for (const m of matches) {
    if (m.scale.size < 7 || m.fit === 'colour') continue;
    // Notes shared with the key first; between equals, the more everyday scale.
    const shared = m.notes.filter((n) => keyPcs.has(chroma(n))).length * 10 - m.scale.tier;
    if (shared > bestScore) {
      bestScore = shared;
      best = { tonic: m.tonic, scale: m.scale.id };
    }
  }
  return best;
}

/** The scale in force for a choice and a chord. */
export function scaleFor(choice: ScaleChoice | undefined, chordSymbol: string, home: Pick<HomeKey, 'tonic' | 'scale'>): ConcreteScale | null {
  if (!choice || choice.id === 'off') return null;
  if (choice.id === 'chord') return chordScale(chordSymbol, home);
  return choice.scale;
}

/**
 * Dots for the jam neck: the chord's tones (labelled R 3 5 ♭7, degree colours, the root large)
 * over the scale's other notes as dimmed rings with their names.
 */
export function jamMarkers(chordSymbol: string, scale: ConcreteScale | null, opts: { maxFret?: number } = {}): FretMarker[] {
  const maxFret = opts.maxFret ?? 12;
  let tones: FretMarker[] = [];
  try {
    tones = arpeggioMarkers(chordSymbol, { maxFret, label: 'degree', color: 'degree' });
  } catch {
    tones = [];
  }
  if (!scale) return tones;
  const taken = new Set(tones.map((m) => `${m.string}:${m.fret}`));
  let rest: FretMarker[] = [];
  try {
    rest = scaleMarkers(scale.tonic, scale.scale, { maxFret, label: 'note', color: 'neutral', state: 'ghost', shape: 'ring', rootShape: 'ring' }).filter((m) => !taken.has(`${m.string}:${m.fret}`));
  } catch {
    rest = [];
  }
  return [...rest.map((m) => ({ ...m, root: false })), ...tones];
}
