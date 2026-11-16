/**
 * One progression from the catalog by ear (`#ear--progression--<id>`, linked from a progression's
 * page): the progression and up to three look-alikes from the catalog, all in one key, strummed on
 * guitar shapes or played by the band. Like the progressions drill, no two options share a shape
 * relative to their first chord, so none can pass for another; all have as many bars, and the same
 * tonality and meter, so the length and the feel give nothing away.
 */
import {
  PROGRESSIONS as CATALOG, bestTonic, formatProgressionName, formatSlot, getProgression, progressionInKey, relatedProgressions,
  type Progression, type ResolvedProgression,
} from '@/content/progressions';
import { chordPcs, chroma, formatKey, parseChord } from '@/core/theory';
import { buildChoice, pcOf, placeNote } from '../question';
import type { BandPart, DrillDef, LevelDef, OptionInfo, SoundEvent, SoundPlan } from '../types';
import { playableShape } from './chords';
import { progressionsDrill } from './progressions';

/** Longest stretch played: a 12-bar blues whole, the first eight bars of anything longer. */
export const MAX_BARS = 12;
const LONG_FORM_BARS = 8;
/** Options in a round, the progression itself included. */
const MAX_OPTIONS = 4;
/**
 * Where catalog rounds keep their confusion record (catalog ids, "heard the axis as the doo-wop"):
 * apart from the progressions drill's own record, whose answers are a different set.
 */
export const CATALOG_RECORD_ID = 'ear:progression';

/** Bars played of a progression. */
function barsPlayed(p: Progression): number {
  return p.bars.length <= MAX_BARS ? p.bars.length : LONG_FORM_BARS;
}

/** The progression in a key, cut to the bars that are played. */
function resolved(p: Progression, tonic: string, bars: number): ResolvedProgression {
  const r = progressionInKey(p, tonic);
  return { ...r, bars: r.bars.slice(0, bars) };
}

/**
 * The sound of a progression relative to its first chord: per chord its beat, its root's distance
 * from the first root, its bass, and its pitch classes from its own root.
 */
export function catalogShape(p: Progression, bars: number = barsPlayed(p)): string {
  const r = resolved(p, p.keys[0] ?? 'C', bars);
  const first = chroma(r.bars[0][0].root);
  return r.bars
    .map((bar) =>
      bar
        .map((c) => {
          const ch = parseChord(c.symbol.split('/')[0]);
          const root = chroma(c.root);
          const rel = ch ? chordPcs(ch).map((pc) => pcOf(pc - root)).sort((a, b) => a - b).join('.') : c.symbol;
          const bass = c.bass ? pcOf(chroma(c.bass) - first) : 'r';
          return `${c.beat}@${pcOf(root - first)}:${rel}/${bass}`;
        })
        .join(','),
    )
    .join('|');
}

/** Look-alikes for a progression: same tonality, meter and length, each with a shape of its own. */
export function lookAlikes(p: Progression): Progression[] {
  const bars = barsPlayed(p);
  const fits = (c: Progression) =>
    c.id !== p.id && c.tonality === p.tonality && c.feel.meter === p.feel.meter && barsPlayed(c) === bars && c.bars.length >= bars;
  const related = new Set(relatedProgressions(p).map((c) => c.id));
  const candidates = CATALOG.filter(fits).sort((a, b) => {
    const score = (c: Progression) => (related.has(c.id) ? 0 : c.family === p.family ? 1 : 2) * 20 + Math.abs(c.level - p.level);
    return score(a) - score(b) || (a.id < b.id ? -1 : 1);
  });
  const shapes = new Set([catalogShape(p, bars)]);
  const out: Progression[] = [];
  for (const c of candidates) {
    if (out.length >= MAX_OPTIONS - 1) break;
    let shape: string;
    try {
      shape = catalogShape(c, bars);
    } catch {
      continue;
    }
    if (shapes.has(shape)) continue;
    shapes.add(shape);
    out.push(c);
  }
  return out;
}

/** Label and name of a catalog progression as an answer. */
export function catalogInfo(id: string): OptionInfo {
  const p = getProgression(id);
  if (!p) return { id, label: id, name: id };
  const tokens = p.bars.slice(0, barsPlayed(p)).flat();
  // Held chords are shown once ("I–IV–V–I", not "I–I–IV–IV…").
  const shown = tokens.filter((t, i) => i === 0 || t !== tokens[i - 1]).map((t) => formatSlot(t));
  const name = formatProgressionName(p.name);
  if (shown.length > 6) return { id, label: name, name, detail: shown.slice(0, 6).join('–') + '…' };
  const label = shown.join('–');
  // The name often starts with the numerals the label already shows ("I–V–vi–IV (the axis
  // progression)"): under the label, only what it adds.
  const extra = name.startsWith(label) ? name.slice(label.length).trim().replace(/^\((.*)\)$/, '$1').trim() : name;
  return { id, label, name, ...(extra && extra !== label ? { detail: extra } : {}) };
}

/** A shape that a guitar can strum for a chord symbol (a slash chord is played without its slash bass if need be). */
function shapeFor(symbol: string, bassNear: number): { midis: number[]; strings: Array<number | null> } | null {
  for (const s of [symbol, symbol.split('/')[0]]) {
    try {
      return playableShape(s, bassNear);
    } catch {
      // Try the plain chord.
    }
  }
  return null;
}

/** Strum a resolved progression: one stroke per beat, the first of each chord a little harder. */
function guitarPlan(r: ResolvedProgression, beat: number, bassNear: number): SoundPlan {
  const events: SoundEvent[] = [];
  const bar = beat * r.beatsPerBar;
  r.bars.forEach((chords, b) => {
    for (const c of chords) {
      const shape = shapeFor(c.symbol, bassNear);
      if (!shape) continue;
      for (let k = 0; k < c.beats; k++) {
        events.push({ at: b * bar + (c.beat + k) * beat, midis: shape.midis, strings: shape.strings, dur: beat, strike: 'strum', direction: 'down', velocity: k === 0 ? 0.82 : 0.6, role: 'subject' });
      }
    }
  });
  const last = events[events.length - 1];
  if (last) last.dur = 1.6;
  return { events, length: (last?.at ?? 0) + 1.6 };
}

/** A progression from the catalog as a round of its own, or null for an unknown id. */
export function catalogRound(id: string): { drill: DrillDef; level: LevelDef; progression: Progression } | null {
  const p = getProgression(id);
  if (!p) return null;
  const others = lookAlikes(p);
  if (others.length === 0) return null;
  const pool = [p.id, ...others.map((o) => o.id)];
  const bars = barsPlayed(p);
  const tempo = Math.min(110, Math.round((p.feel.tempo[0] + p.feel.tempo[1]) / 2));
  const level: LevelDef = {
    n: 1,
    title: formatProgressionName(p.name),
    blurb: `${pool.length} progressions in ${p.tonality === 'major' || p.tonality === 'minor' ? `a ${p.tonality}` : `the ${p.tonality}`} key`,
    pool,
    questions: 6,
    special: { key: `progression:${p.id}`, skillId: `ear:progression:${p.id}`, params: ['progression', p.id], recordId: CATALOG_RECORD_ID },
    make(ctx) {
      const pc = pcOf(placeNote(ctx.rng, ctx.settings, 40, 51));
      const plan = (option: string): SoundPlan => {
        const prog = getProgression(option)!;
        const tonic = bestTonic(prog, pc);
        const r = resolved(prog, tonic, bars);
        const bassNear = 40 + ((pc - 40 + 1200) % 12) + (pc < 4 ? 12 : 0);
        const g = guitarPlan(r, 60 / tempo, bassNear);
        // The band plays the same bars; a bar with two chords is shared between them on the beat.
        const band: BandPart = {
          bars: r.bars.map((b) => ({ root: b[0].backing.root, tones: b[0].backing.tones, symbol: b[0].symbol })),
          split: r.bars.map((b) => (b.length === 1 ? b[0].backing : b.map((c) => ({ beat: c.beat, chord: c.backing })))),
          style: prog.feel.backing,
          tempo,
        };
        return { ...g, band };
      };
      const tonic = bestTonic(p, pc);
      const home = progressionInKey(p, tonic).key.name;
      return buildChoice({
        drill: 'progressions',
        level: 1,
        ctx,
        prompt: 'Which progression was that?',
        options: pool.map((option) => ({ ...catalogInfo(option), plan: plan(option) })),
        canSlow: true,
        canSpread: false,
        keyName: `Key of ${formatKey(home)}`,
        truth: { key: home, chords: resolved(getProgression(ctx.answer)!, tonic, bars).bars.flat().map((c) => c.symbol), progression: ctx.answer },
      });
    },
  };
  const drill: DrillDef = { ...progressionsDrill, title: 'Progression by ear', levels: [level], info: catalogInfo, mixSentence: (a, c) => `You often hear ${a.name} as ${c.name}.` };
  return { drill, level, progression: p };
}
