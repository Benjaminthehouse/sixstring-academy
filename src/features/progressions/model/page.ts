/**
 * The page model of one progression in one key: the chart laid out bar by bar (with section
 * labels), the distinct chords with the shapes that keep changes small, the change to practise,
 * the soloing scales, related progressions and what the catalog says about it. Pure; the screen
 * formats names in the reader's naming system.
 */
import {
  progressionInKey, relatedProgressions, soloScales,
  type ConcreteScale, type HeardIn, type Progression, type ResolvedChord, type ResolvedProgression,
} from '@/content/progressions';
import type { TuningInput, Voicing } from '@/core/guitar';
import { planVoicings, type PlannedChange, type ShapeMode } from './voicings';

/** A bar of the chart. */
export interface ChartBar {
  /** 0-based bar index in the chart. */
  index: number;
  chords: ResolvedChord[];
}

/** One line of the chart (four bars), with a section label on its first line. */
export interface ChartLine {
  label: string | null;
  bars: ChartBar[];
}

/** One distinct chord of the progression with its shape. */
export interface ChordCard {
  symbol: string;
  /** First chart token that makes it (`'V/7'`). */
  token: string;
  /** The shape (fingered behind the capo when there is one); null when the engine has none. */
  voicing: Voicing | null;
  /** With a capo: the chord you finger, named as if there were no capo (`'G'` for B♭ on capo 3). */
  shape: string | null;
}

/** Everything the progression page shows. */
export interface PageModel {
  progression: Progression;
  tonic: string;
  resolved: ResolvedProgression;
  lines: ChartLine[];
  chords: ChordCard[];
  /** The hardest change between the shapes shown, with the engine's tip. */
  practise: PlannedChange | null;
  scales: ConcreteScale[];
  related: Progression[];
  heardIn: readonly HeardIn[];
  /** The catalog's remark about this key (flamenco "por arriba"), if any. */
  keyNote: string | null;
  capo: number;
}

/** Options for {@link pageModel}. */
export interface PageOptions {
  /** Capo fret for the shapes (0 = none). */
  capo?: number;
  /** Map from sounding chord to shape name, for the capo labels. */
  capoShapes?: ReadonlyArray<{ chord: string; shape: string }>;
  shapes?: ShapeMode;
  tuning?: TuningInput;
  /** Bars per chart line (default 4). */
  perLine?: number;
}

/** Split a chart into lines of `perLine` bars, starting a new line at each section. */
export function chartLines(p: Pick<Progression, 'sections'>, resolved: ResolvedProgression, perLine = 4): ChartLine[] {
  const bars: ChartBar[] = resolved.bars.map((chords, index) => ({ index, chords }));
  const sections = p.sections && p.sections.reduce((n, s) => n + s.bars, 0) === bars.length ? p.sections : [{ label: '', bars: bars.length }];
  const lines: ChartLine[] = [];
  let at = 0;
  for (const s of sections) {
    const part = bars.slice(at, at + s.bars);
    at += s.bars;
    for (let i = 0; i < part.length; i += perLine) {
      lines.push({ label: i === 0 && s.label ? s.label : null, bars: part.slice(i, i + perLine) });
    }
  }
  return lines;
}

/** The chord symbols in playing order (one per chord slot; a held bar repeats its chord). */
export function playedSymbols(resolved: ResolvedProgression): string[] {
  return resolved.bars.flat().map((c) => c.symbol);
}

/** Build the page model of a progression in a key. Throws RangeError for a tonic that is not a note. */
export function pageModel(p: Progression, tonic: string, opts: PageOptions = {}): PageModel {
  const resolved = progressionInKey(p, tonic);
  const capo = Math.max(0, Math.round(opts.capo ?? 0));
  const plan = planVoicings(playedSymbols(resolved), {
    tuning: opts.tuning,
    capo: capo || undefined,
    mode: opts.shapes ?? 'smooth',
    beginner: p.level <= 3,
    loop: true,
  });
  const firstToken = new Map<string, string>();
  for (const c of resolved.bars.flat()) if (!firstToken.has(c.symbol)) firstToken.set(c.symbol, c.token);
  const shapeOf = new Map((opts.capoShapes ?? []).map((s) => [s.chord, s.shape]));
  const chords: ChordCard[] = resolved.chords.map((symbol) => ({
    symbol,
    token: firstToken.get(symbol) ?? '',
    voicing: plan.bySymbol.get(symbol) ?? null,
    shape: capo ? (shapeOf.get(symbol) ?? null) : null,
  }));
  return {
    progression: p,
    tonic: resolved.key.tonic,
    resolved,
    lines: chartLines(p, resolved, opts.perLine ?? 4),
    chords,
    practise: plan.hardest,
    scales: soloScales(p, resolved.key.tonic),
    related: relatedProgressions(p),
    heardIn: p.heardIn ?? [],
    keyNote: p.keyNotes?.[resolved.key.tonic] ?? null,
    capo,
  };
}
