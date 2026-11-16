/**
 * What the neck shows: the scale's shapes from the guitar engine, one at a time or connected to
 * the next one, every note of the scale, or two scales compared, turned into Fretboard markers.
 * Pure functions; the screen memoises them.
 *
 * Frets: the engine and the markers count from the capo (fret 0 = the capo or the nut); a fret
 * *range* shown on the board is in frets on the wood. `range` arguments below are on the wood.
 */
import { patternSystemsFor, scalePatterns, scalePositions, type NeckTone, type PatternSystem, type ScalePattern, type TuningInput } from '@/core/guitar';
import { compareScales, formatDegree, getScale } from '@/core/theory';
import { degreeColor, dotsToMarkers, type FretBox, type FretMarker, type MusicColor } from '@/ui/music';
import { systemOfShape } from './address';

/** What the neck is showing. */
export type NeckView = 'shape' | 'all' | 'connect' | 'compare';
/** What the dots say. */
export type DotLabel = 'degree' | 'note' | 'finger';

/** How each pattern system is named for a learner. */
export const SYSTEM_INFO: Record<PatternSystem, { label: string; short: string; description: string }> = {
  caged: { label: 'CAGED shapes', short: 'CAGED', description: 'Five shapes built around the open C, A, G, E and D chords. Together they cover the neck.' },
  box: { label: 'Boxes', short: 'Boxes', description: 'Two notes on every string, inside four or five frets: the classic pentatonic boxes.' },
  '3nps': { label: 'Three notes per string', short: '3 per string', description: 'Three notes on every string: wider stretches, even fingering, built for speed.' },
  position: { label: 'Positions', short: 'Positions', description: 'Every scale note your hand reaches without moving, one fret per finger.' },
  'single-string': { label: 'One string', short: 'One string', description: 'The scale along a single string: the clearest way to see its steps.' },
  'two-string': { label: 'Two strings', short: 'Two strings', description: 'One octave, root to root, on two neighbouring strings.' },
  diagonal: { label: 'Diagonal', short: 'Diagonal', description: 'One octave shape repeated across the strings, climbing the neck as you go up.' },
};

/** Systems where the engine can lay the shapes out as one climb up the neck. */
const CLIMBING: ReadonlySet<PatternSystem> = new Set(['box', '3nps', 'position', 'diagonal']);

/** Where the neck is and what it is tuned to. */
export interface NeckSetup {
  tuning?: TuningInput;
  capo?: number;
  /** Highest fret on the wood to draw (the learner's full-neck setting). */
  lastFret: number;
}

/** The pattern systems that suit a scale, the usual one first. */
export function systemsFor(scale: string, tuning?: TuningInput): PatternSystem[] {
  try {
    return patternSystemsFor(scale, tuning);
  } catch {
    return ['position'];
  }
}

/** The shapes of a scale in one system, laid out up the neck in order. */
export function shapesFor(tonic: string, scale: string, system: PatternSystem, setup: NeckSetup): ScalePattern[] {
  const capo = setup.capo ?? 0;
  const maxFret = Math.max(4, setup.lastFret - capo);
  try {
    return scalePatterns(tonic, scale, { system, tuning: setup.tuning, capo, maxFret, upTheNeck: CLIMBING.has(system) });
  } catch {
    return [];
  }
}

/** What the neck shows for an address: the pattern systems on offer, the one in use, its shapes and the shape. */
export interface ShapeChoice {
  /** Systems that have at least one shape here (the usual one first; a linked one appended). */
  systems: PatternSystem[];
  system: PatternSystem;
  shapes: ScalePattern[];
  /** Null only when no system has a shape (then the neck shows every note). */
  shape: ScalePattern | null;
}

/**
 * Resolve the shape an address asks for. A shape id from another system (an Arcade link, an old
 * bookmark) is honoured when that system really has it; otherwise the screen falls back to a real
 * shape — the same system's first, else the scale's usual system — so an address never dead-ends
 * on "no shape". Systems without a shape here (a capo high up a short neck) are left out.
 */
export function resolveShape(tonic: string, scale: string, wanted: string | null, setup: NeckSetup, base: readonly PatternSystem[] = systemsFor(scale, setup.tuning)): ShapeChoice {
  const linked = wanted ? systemOfShape(wanted) : null;
  const order = linked && !base.includes(linked) ? [...base, linked] : [...base];
  const all = order.map((system) => ({ system, shapes: shapesFor(tonic, scale, system, setup) }));
  const offered = all.filter((e) => e.shapes.length > 0 && (base.includes(e.system) || e.shapes.some((s) => s.id === wanted)));
  const pick = offered.find((e) => e.system === linked) ?? offered[0];
  if (!pick) return { systems: [...base], system: base[0] ?? 'position', shapes: [], shape: null };
  return {
    systems: offered.map((e) => e.system),
    system: pick.system,
    shapes: pick.shapes,
    shape: pick.shapes.find((s) => s.id === wanted) ?? pick.shapes[0],
  };
}

/** The index of a shape id in a list (0 when it is not there). */
export function shapeIndex(shapes: readonly ScalePattern[], id: string | null): number {
  if (!id) return 0;
  const i = shapes.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

/** The shape a step away (wrapping round), for prev / next. */
export function stepShape(shapes: readonly ScalePattern[], id: string | null, delta: number): ScalePattern | null {
  if (!shapes.length) return null;
  const i = shapeIndex(shapes, id);
  return shapes[(((i + delta) % shapes.length) + shapes.length) % shapes.length];
}

/** The neighbour shown in "connect" mode: the next shape up the neck, or the one below for the last. */
export function neighbourOf(shapes: readonly ScalePattern[], current: ScalePattern): ScalePattern | null {
  if (shapes.length < 2) return null;
  const i = shapes.indexOf(current);
  const above = shapes
    .filter((s) => s !== current && s.minFret >= current.minFret && s.minFret <= current.maxFret + 1)
    .sort((a, b) => a.minFret - b.minFret)[0];
  if (above) return above;
  return shapes[i + 1] ?? shapes[i - 1] ?? null;
}

/** Frets on the wood a shape occupies, with a fret of air either side (for zooming in). */
export function shapeRange(shape: ScalePattern, setup: NeckSetup): [number, number] {
  const capo = setup.capo ?? 0;
  const from = shape.minFret === 0 ? 0 : Math.max(capo > 0 ? capo : 0, shape.minFret + capo - 1);
  const to = Math.min(setup.lastFret, Math.max(shape.maxFret + capo + 1, from + 4));
  return [from, to];
}

/** The highlighted box for a shape (frets on the wood). */
export function shapeBox(shapes: readonly ScalePattern[], setup: NeckSetup, label?: string): FretBox | null {
  if (!shapes.length) return null;
  const capo = setup.capo ?? 0;
  const lo = Math.min(...shapes.map((s) => s.minFret));
  const hi = Math.max(...shapes.map((s) => s.maxFret));
  return { from: lo === 0 ? capo : lo + capo, to: hi + capo, label };
}

/** The pattern's fret span in words: "frets 5–8", "open position". */
export function shapeWhere(shape: ScalePattern): string {
  if (shape.minFret === shape.maxFret) return `fret ${shape.minFret}`;
  return shape.minFret === 0 ? `open to fret ${shape.maxFret}` : `frets ${shape.minFret}–${shape.maxFret}`;
}

interface MarkerContext {
  tonic: string;
  scale: string;
  setup: NeckSetup;
  /** Frets on the wood. */
  range: [number, number];
  label: DotLabel;
}

function engineRange(ctx: MarkerContext): { minFret: number; maxFret: number } {
  const capo = ctx.setup.capo ?? 0;
  return { minFret: Math.max(0, ctx.range[0] - capo), maxFret: Math.max(0, ctx.range[1] - capo) };
}

function labelMode(label: DotLabel, fingers: boolean): 'degree' | 'note' | 'finger' {
  if (label === 'finger') return fingers ? 'finger' : 'degree';
  return label;
}

const key = (m: { string: number; fret: number }) => `${m.string}:${m.fret}`;

/** Every note of the scale in the range, degree-coloured. */
export function allNoteMarkers(ctx: MarkerContext): FretMarker[] {
  let tones: NeckTone[];
  try {
    tones = scalePositions(ctx.tonic, ctx.scale, { tuning: ctx.setup.tuning, capo: ctx.setup.capo, ...engineRange(ctx) });
  } catch {
    return [];
  }
  return dotsToMarkers(tones, { label: labelMode(ctx.label, false), color: 'degree', rootLabel: 'R' });
}

/** One shape with its fingering, over the rest of the scale's notes drawn faintly. */
export function shapeMarkers(ctx: MarkerContext, shape: ScalePattern): FretMarker[] {
  const mode = labelMode(ctx.label, true);
  const own = dotsToMarkers(shape.notes, { label: mode, color: mode === 'finger' ? 'finger' : 'degree', rootLabel: 'R' });
  const taken = new Set(own.map(key));
  const rest = allNoteMarkers({ ...ctx, label: 'degree' })
    .filter((m) => !taken.has(key(m)))
    // Hollow rings: the rest of the scale is context, never confused with the shape's own dots.
    .map((m) => ({ ...m, label: '', noteLabel: undefined, shape: 'ring' as const, state: 'ghost' as const, description: `${m.description ? `${m.description}, ` : ''}outside this shape` }));
  return [...rest, ...own];
}

/** Two neighbouring shapes: the notes they share are squares, the next shape's own notes faint. */
export function connectMarkers(ctx: MarkerContext, shape: ScalePattern, next: ScalePattern | null): FretMarker[] {
  if (!next) return shapeMarkers(ctx, shape);
  const mode = labelMode(ctx.label, true);
  const opts = { label: mode, color: mode === 'finger' ? ('finger' as const) : ('degree' as const), rootLabel: 'R' as const };
  const nextKeys = new Set(next.notes.map(key));
  const ownKeys = new Set(shape.notes.map(key));
  const own = dotsToMarkers(shape.notes, opts).map((m) =>
    nextKeys.has(key(m)) ? { ...m, shape: 'square' as const, description: `${m.description ? `${m.description}, ` : ''}in both shapes` } : m,
  );
  const theirs = dotsToMarkers(
    next.notes.filter((n) => !ownKeys.has(key(n))),
    { ...opts, label: mode === 'finger' ? 'degree' : mode },
  ).map((m) => ({ ...m, shape: 'ring' as const, state: 'ghost' as const, description: `${m.description ? `${m.description}, ` : ''}${next.name}` }));
  return [...theirs, ...own];
}

/** A note's place in a comparison of two scales on one root. */
export type CompareRole = 'shared' | 'only-a' | 'only-b';

/** Colours and shapes of the three roles (colour is never the only signal: shape and label differ too). */
export const COMPARE_LOOK: Record<CompareRole, { color: MusicColor; shape: 'circle' | 'square' | 'diamond' }> = {
  shared: { color: 'neutral', shape: 'circle' },
  'only-a': { color: 'info', shape: 'square' },
  'only-b': { color: 'accent', shape: 'diamond' },
};

/** The comparison in numbers and words, for the legend. */
export interface CompareSummary {
  a: string;
  b: string;
  shared: string[];
  onlyA: string[];
  onlyB: string[];
  sentence: string;
}

/** Two scales on one root: which degrees they share and which differ (from the theory engine). */
export function compareSummary(a: string, b: string): CompareSummary {
  const c = compareScales(a, b);
  const pretty = (d: string) => (d === '1' ? '1' : formatDegree(d));
  // Seven-note pairs report differing degrees as "changes"; fold them into the two "only" lists.
  const onlyA = [...c.onlyA, ...c.changes.map((x) => x.a)].map(pretty);
  const onlyB = [...c.onlyB, ...c.changes.map((x) => x.b)].map(pretty);
  return { a: c.a.name, b: c.b.name, shared: c.shared.map(pretty), onlyA, onlyB, sentence: c.summary.replace(/\b([#b]+)(\d)/g, (_m, acc: string, n: string) => formatDegree(`${acc}${n}`)) };
}

/** Every note of two scales on one root: shared notes plain, the differences shaped and labelled. */
export function compareMarkers(ctx: MarkerContext, other: string): FretMarker[] {
  const range = { tuning: ctx.setup.tuning, capo: ctx.setup.capo, ...engineRange(ctx) };
  let a: NeckTone[];
  let b: NeckTone[];
  try {
    a = scalePositions(ctx.tonic, ctx.scale, range);
    b = scalePositions(ctx.tonic, other, range);
  } catch {
    return [];
  }
  const nameA = getScale(ctx.scale)?.name ?? ctx.scale;
  const nameB = getScale(other)?.name ?? other;
  const inB = new Map(b.map((t) => [key(t), t]));
  const inA = new Set(a.map(key));
  const mode = ctx.label === 'note' ? 'note' : 'degree';
  const out: FretMarker[] = [];
  const look = (t: NeckTone, role: CompareRole, words: string): FretMarker => {
    const [m] = dotsToMarkers([t], { label: mode, color: 'degree', rootLabel: 'R' });
    return { ...m, color: role === 'shared' && t.isRoot ? degreeColor('1') : COMPARE_LOOK[role].color, shape: COMPARE_LOOK[role].shape, description: `${m.description ? `${m.description}, ` : ''}${words}` };
  };
  for (const t of a) out.push(inB.has(key(t)) ? look(t, 'shared', 'in both scales') : look(t, 'only-a', `only in ${nameA}`));
  for (const t of b) if (!inA.has(key(t))) out.push(look(t, 'only-b', `only in ${nameB}`));
  return out;
}

/**
 * Light one position (the note being heard): a bright pearl dot with the amber pulse, keeping its
 * label. Pearl because every degree colour is taken (amber is close to the third's yellow).
 */
export function withLit(markers: readonly FretMarker[], lit: { string: number; fret: number } | null): FretMarker[] {
  if (!lit) return markers as FretMarker[];
  let found = false;
  const out = markers.map((m) => {
    if (m.string !== lit.string || m.fret !== lit.fret) return m;
    found = true;
    return { ...m, color: 'neutral' as const, shape: m.shape === 'ring' ? ('circle' as const) : m.shape, state: 'target' as const, label: m.label || null, description: `${m.description ? `${m.description}, ` : ''}playing now` };
  });
  if (!found) out.push({ string: lit.string, fret: lit.fret, color: 'neutral', state: 'target', label: null, description: 'playing now' });
  return out;
}
