/**
 * Chord quality: major or minor first, then diminished, augmented and suspended, then sevenths and
 * extensions. Chords are real guitar voicings from `@/core/guitar` (root in the bass), strummed or
 * played one string at a time.
 *
 * "Answerable by ear": a voicing may leave out the perfect fifth of a four-note chord (and the 9th
 * of a 13th chord), as guitarists do, but only if the notes that remain could not be read as any
 * other chord offered in the same question. `heardAs` is that rule; the tests hold every question to it.
 */
import { chordVoicings, formatFrets, type Voicing } from '@/core/guitar';
import { chroma, formatDegree, formatNote, getChordType, parseChord } from '@/core/theory';
import { ROOT_NAMES, buildChoice, pcOf, placeNote, withArticle } from '../question';
import { inGuitarRange, together } from '../sound';
import type { DrillDef, LevelDef, OptionInfo, SoundEvent, SoundPlan } from '../types';

const LABELS: Record<string, [label: string, name: string]> = {
  major: ['Major', 'major chord'],
  minor: ['Minor', 'minor chord'],
  dim: ['Diminished', 'diminished chord'],
  aug: ['Augmented', 'augmented chord'],
  sus2: ['sus2', 'sus2 chord'],
  sus4: ['sus4', 'sus4 chord'],
  maj7: ['maj7', 'major 7th chord'],
  '7': ['7', 'dominant 7th chord'],
  m7: ['m7', 'minor 7th chord'],
  m7b5: ['m7♭5', 'half-diminished chord'],
  dim7: ['dim7', 'diminished 7th chord'],
  '6': ['6', 'major 6th chord'],
  m6: ['m6', 'minor 6th chord'],
  add9: ['add9', 'add9 chord'],
  '9': ['9', 'dominant 9th chord'],
  maj9: ['maj9', 'major 9th chord'],
  m9: ['m9', 'minor 9th chord'],
  '13': ['13', 'dominant 13th chord'],
  '7b9': ['7♭9', '7♭9 chord'],
  '7sharp9': ['7♯9', '7♯9 chord'],
};

/** Label, name and formula of a chord-quality answer. */
export function chordInfo(id: string): OptionInfo {
  const type = getChordType(id);
  const [label, name] = LABELS[id] ?? [type?.symbol ?? id, type?.name ?? id];
  const formula = type ? type.degrees.map((d) => formatDegree(d)).join(' ') : undefined;
  return { id, label, name, ...(formula ? { detail: formula } : {}) };
}

const uniqSorted = (xs: readonly number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);
const sameSet = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Pitch classes of notes relative to the lowest one, sorted, without repeats. */
export function relativePcs(midis: readonly number[]): number[] {
  const bass = Math.min(...midis);
  return uniqSorted(midis.map((m) => pcOf(m - bass)));
}

/** The pitch-class sets (relative to the root) a chord type may be heard from. */
export function acceptedSets(typeId: string): number[][] {
  const type = getChordType(typeId);
  if (!type) return [];
  const full = uniqSorted(type.semitones.map((s) => pcOf(s)));
  const sets = [full];
  // A guitarist drops the perfect fifth of a four-note chord without changing what it is.
  if (full.length >= 4 && full.includes(7)) sets.push(full.filter((x) => x !== 7));
  // ...and the 9th of a 13th chord.
  if (type.semitones.includes(21) && full.includes(2)) {
    const no9 = full.filter((x) => x !== 2);
    sets.push(no9);
    if (no9.includes(7)) sets.push(no9.filter((x) => x !== 7));
  }
  return sets;
}

/** True when these notes (root in the bass) are this chord type, allowing the usual omissions. */
export function heardAs(midis: readonly number[], typeId: string): boolean {
  const rel = relativePcs(midis);
  return acceptedSets(typeId).some((s) => sameSet(s, rel));
}

/** Which of the offered types these notes can be heard as. A fair question gives exactly one. */
export function heardTypes(midis: readonly number[], pool: readonly string[]): string[] {
  return pool.filter((id) => heardAs(midis, id));
}

/** A chord as it will be played: notes low to high and the string each is on. */
export interface ChordShape {
  midis: number[];
  strings: Array<number | null>;
  /** Fret pattern for display (`x32010`), or null for a computed close voicing. */
  frets: string | null;
  symbol: string;
}

function shapeOf(v: Voicing): ChordShape {
  const notes = [...v.notes].sort((a, b) => b.string - a.string);
  return {
    midis: notes.map((n) => n.midi),
    strings: notes.map((n) => n.string),
    frets: formatFrets(v.frets),
    symbol: v.chord,
  };
}

const cache = new Map<string, Voicing[]>();
function voicings(symbol: string): Voicing[] {
  let list = cache.get(symbol);
  if (!list) {
    try {
      list = chordVoicings(symbol);
    } catch {
      list = [];
    }
    cache.set(symbol, list);
  }
  return list;
}

/** A close root-position voicing from the theory engine, for when no guitar shape passes the checks. */
export function closeShape(rootPc: number, typeId: string, bassNear = 48): ChordShape {
  const type = getChordType(typeId)!;
  let bass = 40 + ((rootPc - 40 + 1200) % 12);
  while (bass + 12 <= bassNear + 6) bass += 12;
  const midis = uniqSorted(type.semitones.map((s) => bass + s));
  return { midis, strings: midis.map(() => null), frets: null, symbol: `${ROOT_NAMES[rootPc]}${type.symbol}` };
}

/**
 * Guitar shapes of `typeId` on `rootPc` that sound unambiguous among `pool`: root in the bass,
 * inside the guitar's range, and heard as this type and no other on offer. Best-ranked first.
 */
export function fairShapes(rootPc: number, typeId: string, pool: readonly string[]): ChordShape[] {
  const type = getChordType(typeId);
  if (!type) return [];
  const symbol = `${ROOT_NAMES[rootPc]}${type.symbol}`;
  const out: ChordShape[] = [];
  for (const v of voicings(symbol)) {
    if (v.rootless || v.notes.length < 3) continue;
    const shape = shapeOf(v);
    if (!inGuitarRange(shape.midis)) continue;
    if (pcOf(Math.min(...shape.midis)) !== rootPc) continue;
    const heard = heardTypes(shape.midis, pool);
    if (heard.length !== 1 || heard[0] !== typeId) continue;
    out.push(shape);
  }
  return out;
}

/**
 * A guitar shape for a chord symbol (`F`, `Dm`, `E7`) with its root in the bass and every note a
 * chord tone, the bass as close to `bassNear` as the best few shapes allow. Falls back to a close
 * voicing from the theory engine.
 */
export function playableShape(symbol: string, bassNear: number): ChordShape {
  const chord = parseChord(symbol);
  if (!chord) throw new RangeError(`not a chord: ${symbol}`);
  const rootPc = chroma(chord.root);
  const candidates: ChordShape[] = [];
  for (const v of voicings(symbol)) {
    if (v.rootless || v.notes.length < 3) continue;
    const shape = shapeOf(v);
    if (!inGuitarRange(shape.midis) || pcOf(Math.min(...shape.midis)) !== rootPc) continue;
    if (!heardAs(shape.midis, chord.type.id)) continue;
    candidates.push(shape);
    if (candidates.length >= 6) break;
  }
  if (!candidates.length) return closeShape(rootPc, chord.type.id, bassNear);
  return candidates.sort((a, b) => Math.abs(Math.min(...a.midis) - bassNear) - Math.abs(Math.min(...b.midis) - bassNear))[0];
}

/** The strummed or arpeggiated plan of a shape. */
export function shapePlan(shape: ChordShape, style: 'strum' | 'arpeggio'): SoundPlan {
  if (style === 'strum') return together(shape.midis, { strike: 'strum', strings: shape.strings, dur: 2.4, direction: 'down' });
  const gap = 0.36;
  const n = shape.midis.length;
  const events: SoundEvent[] = shape.midis.map((m, i) => ({
    at: i * gap,
    midis: [m],
    strings: [shape.strings[i] ?? null],
    dur: (n - i) * gap + 1.4,
    strike: 'pluck',
    role: 'subject',
  }));
  return { events, length: n * gap + 1.4 };
}

function level(n: number, title: string, pool: string[], blurb?: string): LevelDef {
  return {
    n,
    title,
    blurb: blurb ?? pool.map((id) => chordInfo(id).label).join(' · '),
    pool,
    questions: 10,
    make(ctx) {
      const { rng } = ctx;
      // A root between A2 and G♯3 keeps open and low barre shapes in play.
      const rootPc = pcOf(placeNote(rng, ctx.settings, 45, 56));
      const answerShapes = fairShapes(rootPc, ctx.answer, pool);
      const shape = answerShapes.length ? answerShapes[rng.int(0, Math.min(3, answerShapes.length - 1))] : closeShape(rootPc, ctx.answer);
      const bass = Math.min(...shape.midis);
      // Each other option is voiced on the same root, as close to the same bass note as possible.
      const shapeFor = (id: string): ChordShape => {
        if (id === ctx.answer) return shape;
        const list = fairShapes(rootPc, id, pool);
        if (!list.length) return closeShape(rootPc, id, bass);
        return [...list].sort((a, b) => Math.abs(Math.min(...a.midis) - bass) - Math.abs(Math.min(...b.midis) - bass))[0];
      };
      const options = pool.map((id) => ({ ...chordInfo(id), plan: shapePlan(shapeFor(id), ctx.settings.chordStyle) }));
      return buildChoice({
        drill: 'chords',
        level: n,
        ctx,
        prompt: 'What kind of chord was that?',
        options,
        canSlow: ctx.settings.chordStyle === 'arpeggio',
        canSpread: ctx.settings.chordStyle === 'strum',
        keyName: `Root ${formatNote(ROOT_NAMES[rootPc])}`,
        truth: { rootPc, bass, midis: shape.midis, type: ctx.answer, symbol: shape.symbol, frets: shape.frets ?? '' },
      });
    },
  };
}

/** The chord-quality drill. */
export const chordsDrill: DrillDef = {
  id: 'chords',
  title: 'Chord quality',
  trains: 'Major, minor and the colours beyond: the mood of a chord.',
  icon: 'Grid3x3',
  prompt: 'What kind of chord was that?',
  path: { start: 4.5, pace: 4.5 },
  levels: [
    level(1, 'Major or minor', ['major', 'minor']),
    level(2, 'Add diminished', ['major', 'minor', 'dim']),
    level(3, 'Add augmented', ['major', 'minor', 'dim', 'aug']),
    level(4, 'Suspended chords', ['major', 'minor', 'sus2', 'sus4']),
    level(5, 'All six triads', ['major', 'minor', 'dim', 'aug', 'sus2', 'sus4']),
    level(6, 'Three sevenths', ['maj7', '7', 'm7']),
    level(7, 'Five sevenths', ['maj7', '7', 'm7', 'm7b5', 'dim7']),
    level(8, 'Ninths', ['add9', '9', 'maj9', 'm9']),
    level(9, 'Dominant colours', ['7', '9', '13', '7b9', '7sharp9']),
    level(10, 'Everything', ['6', 'm6', 'maj7', '7', 'm7', 'm7b5', 'dim7', 'add9', '9', 'maj9', 'm9', '13'], 'Twelve chords, sixths to 13ths'),
  ],
  info: chordInfo,
  mixSentence: (answer, chosen) => `You often hear ${withArticle(answer.name)} as ${withArticle(chosen.name)}.`,
};
