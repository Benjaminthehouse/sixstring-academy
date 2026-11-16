/**
 * Keys for a progression: which tonics to offer (the guitar-friendly ones first), how a route
 * param turns into a spelled tonic, stepping a semitone up or down, and when a capo makes an
 * awkward key easy. Pure; spellings come from the catalog (`keyChoices`, `p.keys`).
 */
import { keyChoices, progressionInKey, type Progression, type ResolvedProgression } from '@/content/progressions';
import { suggestCapo, type TuningInput } from '@/core/guitar';
import { chroma, isNote, noteFromSlug, noteSlug, parseChord } from '@/core/theory';

/** One key on offer for a progression. */
export interface KeyOption {
  /** Spelled tonic (`'F#'`, `'Bb'`). */
  tonic: string;
  /** Pitch class of the tonic, C = 0. */
  pc: number;
  /** One of the progression's guitar-friendly keys. */
  friendly: boolean;
}

/** The keys of a progression: guitar-friendly ones in the catalog's order, then the rest from C up. */
export function keyOptions(p: Progression): { friendly: KeyOption[]; others: KeyOption[]; all: KeyOption[] } {
  const friendly = p.keys.filter(isNote).map((tonic) => ({ tonic, pc: chroma(tonic), friendly: true }));
  const taken = new Set(friendly.map((k) => k.pc));
  const others = keyChoices(p)
    .map((tonic) => ({ tonic, pc: chroma(tonic), friendly: false }))
    .filter((k) => !taken.has(k.pc));
  const all = [...friendly, ...others].sort((a, b) => a.pc - b.pc);
  return { friendly, others, all };
}

/** The progression's spelling of a pitch class: its own guitar-friendly spelling first, else the catalog's best. */
export function spellTonic(p: Progression, pc: number): string {
  const n = ((Math.round(pc) % 12) + 12) % 12;
  const own = p.keys.find((k) => isNote(k) && chroma(k) === n);
  return own ?? keyChoices(p)[n];
}

/** The default key of a progression (its first guitar-friendly key). */
export function defaultTonic(p: Progression): string {
  return p.keys.find(isNote) ?? keyChoices(p)[0];
}

/** Route param for a tonic: `'F#'` -> `'f-sharp'`, `'Bb'` -> `'bb'`. */
export function keyParam(tonic: string): string {
  return noteSlug(tonic);
}

/**
 * A key from a route param or a stored value (`'f-sharp'`, `'gb'`, `'F#'`), spelled the way this
 * progression spells it; null when it is not a note.
 */
export function tonicFromParam(p: Progression, param: string | null | undefined): string | null {
  if (!param) return null;
  const n = isNote(param) ? param : noteFromSlug(param);
  if (!n || !isNote(n)) return null;
  return spellTonic(p, chroma(n));
}

/** The key a semitone up (+1) or down (-1), wrapping round the twelve. */
export function stepTonic(p: Progression, tonic: string, step: number): string {
  return spellTonic(p, chroma(tonic) + Math.round(step));
}

// ── Capo ──────────────────────────────────────────────────────────────────────────────────────

/** Chord types a capo turns into open shapes; jazz colours (9ths, altered, dim7) get no capo advice. */
const OPEN_TYPES = new Set(['major', 'minor', '5', '7', 'm7', 'maj7', 'sus2', 'sus4', '7sus4', 'add9', '6', 'm6']);

/** What a capo does for this key. */
export interface CapoAdvice {
  /** Fret for the capo. */
  capo: number;
  /** The key whose shapes you finger (`'G'` for B♭ with the capo on 3). */
  shapesTonic: string;
  /** Each distinct chord as it sounds and the shape you finger, in order of first appearance. */
  shapes: Array<{ chord: string; shape: string }>;
  /** Share of the chord changes that are easy open shapes with the capo, and without it (0–1). */
  easyShare: number;
  withoutShare: number;
}

/** True when a capo is worth considering for these chords at all (simple chord types, not a jazz form). */
export function capoCandidate(p: Progression, resolved: ResolvedProgression): boolean {
  if (p.family === 'jazz') return false;
  return resolved.chords.every((s) => {
    const c = parseChord(s);
    return !!c && OPEN_TYPES.has(c.type.id);
  });
}

/**
 * A capo suggestion when this key is awkward with open chords (under three quarters of the chords
 * are easy shapes) and a capo makes clearly more of them easy; null when the key is fine as it is,
 * or a capo does not help (jazz forms, extended chords).
 */
export function capoAdvice(p: Progression, tonic: string, opts: { tuning?: TuningInput; maxCapo?: number } = {}): CapoAdvice | null {
  const resolved = progressionInKey(p, tonic);
  if (!capoCandidate(p, resolved)) return null;
  const played = resolved.bars.flat().map((c) => c.symbol);
  const ranked = suggestCapo(played, { tuning: opts.tuning, maxCapo: opts.maxCapo ?? 7 });
  const best = ranked[0];
  const none = ranked.find((s) => s.capo === 0);
  if (!best || !none || best.capo === 0) return null;
  if (none.easyShare >= 0.75 || best.easyShare < none.easyShare + 0.25) return null;
  const shapesTonic = spellTonic(p, chroma(tonic) - best.capo);
  const shapeChords = progressionInKey(p, shapesTonic).chords;
  return {
    capo: best.capo,
    shapesTonic,
    shapes: resolved.chords.map((chord, i) => ({ chord, shape: shapeChords[i] ?? chord })),
    easyShare: best.easyShare,
    withoutShare: none.easyShare,
  };
}
