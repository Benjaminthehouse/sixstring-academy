/**
 * Chord checking on top of the chroma extractor: "did they just strum a G major?"
 *
 * A candidate chord is a set of pitch classes (plus, optionally, its bass note). The score rewards
 * energy that falls on chord tones and every chord tone being present, and punishes strong notes
 * that do not belong. It is meant for verifying an EXPECTED chord and for choosing among a few
 * candidates, not for naming an arbitrary chord out of thin air.
 */
import type { ChromaFrame } from './chroma';

/** A chord to look for. */
export interface ChordSpec {
  /** Pitch classes of the chord tones, C = 0 ... B = 11. */
  pcs: readonly number[];
  /** Pitch class expected in the bass (the root, or the note after the slash). Optional. */
  bass?: number;
  /** Label carried through to results, e.g. "G" or "Am7". Optional. */
  name?: string;
}

/** Options for {@link matchChord}. */
export interface ChordMatchOptions {
  /** A chord tone counts as present from this fraction of the strongest pitch class (default 0.2). */
  presentThreshold?: number;
  /** A non-chord pitch class counts as a wrong note from this fraction (default 0.4). */
  extraThreshold?: number;
}

/** How well a chroma frame fits one chord. */
export interface ChordMatch {
  /** The chord that was tested. */
  chord: ChordSpec;
  /** 0..1 confidence that this chord is what is sounding. Around 0.6 and up is a comfortable yes. */
  score: number;
  /** Fraction of the energy that lies on chord tones. */
  purity: number;
  /** Fraction of the chord tones that are present. */
  coverage: number;
  /** Chord tones that were heard. */
  present: number[];
  /** Chord tones that were not heard (a muted or missed string). */
  missing: number[];
  /** Pitch classes that are sounding strongly but are not in the chord. */
  extra: number[];
  /** Whether the lowest note is the expected bass; null when not asked for or not measurable. */
  bassOk: boolean | null;
}

/** A chord tone this strong (relative to the strongest pitch class) counts as fully present in the score. */
const SOFT_REF = 0.4;

function chromaOf(input: ChromaFrame | ArrayLike<number>): ArrayLike<number> {
  return 'chroma' in input ? input.chroma : input;
}

/** Pitch classes (sorted, unique) of a list of MIDI notes. */
export function pitchClassesOf(midis: readonly number[]): number[] {
  return [...new Set(midis.map((m) => ((Math.round(m) % 12) + 12) % 12))].sort((a, b) => a - b);
}

/** Score one chord against a chroma frame (or a bare 12-element chroma). */
export function matchChord(
  input: ChromaFrame | ArrayLike<number>,
  chord: ChordSpec,
  opts: ChordMatchOptions = {},
): ChordMatch {
  const chroma = chromaOf(input);
  const presentThr = opts.presentThreshold ?? 0.2;
  const extraThr = opts.extraThreshold ?? 0.4;
  const inChord = new Array<boolean>(12).fill(false);
  for (const pc of chord.pcs) inChord[((pc % 12) + 12) % 12] = true;
  const tones: number[] = [];
  for (let pc = 0; pc < 12; pc++) if (inChord[pc]) tones.push(pc);

  let max = 0;
  let total = 0;
  for (let pc = 0; pc < 12; pc++) {
    const v = Math.max(0, chroma[pc]);
    total += v;
    if (v > max) max = v;
  }
  const result: ChordMatch = {
    chord,
    score: 0,
    purity: 0,
    coverage: 0,
    present: [],
    missing: [...tones],
    extra: [],
    bassOk: null,
  };
  if (max <= 0 || tones.length === 0) return result;

  let inside = 0;
  let soft = 0;
  result.missing = [];
  for (let pc = 0; pc < 12; pc++) {
    const rel = Math.max(0, chroma[pc]) / max;
    if (inChord[pc]) {
      inside += Math.max(0, chroma[pc]);
      // Graded presence: a faint tone (often just an overtone of the other strings) counts for less.
      soft += Math.min(1, rel / SOFT_REF);
      if (rel >= presentThr) result.present.push(pc);
      else result.missing.push(pc);
    } else if (rel >= extraThr) {
      result.extra.push(pc);
    }
  }
  result.purity = inside / total;
  result.coverage = result.present.length / tones.length;
  let score = result.purity * Math.pow(soft / tones.length, 1.5);
  if (chord.bass !== undefined && 'chroma' in input && input.bass >= 0) {
    result.bassOk = input.bass === ((chord.bass % 12) + 12) % 12;
    if (!result.bassOk) score *= 0.88;
  }
  result.score = Math.max(0, Math.min(1, score));
  return result;
}

/** Score several candidate chords and return them best first. */
export function rankChords(
  input: ChromaFrame | ArrayLike<number>,
  candidates: readonly ChordSpec[],
  opts: ChordMatchOptions = {},
): ChordMatch[] {
  return candidates.map((c) => matchChord(input, c, opts)).sort((a, b) => b.score - a.score);
}

/** Average several chroma frames (e.g. those after one strum) into one steadier frame. */
export function averageChroma(frames: readonly (ChromaFrame | ArrayLike<number>)[]): number[] {
  const out = new Array<number>(12).fill(0);
  for (const f of frames) {
    const c = chromaOf(f);
    for (let pc = 0; pc < 12; pc++) out[pc] += c[pc];
  }
  let max = 0;
  for (let pc = 0; pc < 12; pc++) if (out[pc] > max) max = out[pc];
  if (max > 0) for (let pc = 0; pc < 12; pc++) out[pc] /= max;
  return out;
}
