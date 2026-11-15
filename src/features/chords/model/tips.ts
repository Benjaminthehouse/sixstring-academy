/**
 * Finger tips for a change between two chords: which fingers stay down (anchors), which slide
 * along their string (guides), which move, and which finger moves least, so both diagrams can
 * mark them. Built on the guitar engine's `chordChange` / `voicingTransition`.
 */
import { chordChange, voicingTransition, type TuningInput, type Voicing } from '@/core/guitar';

/** What a finger does in the change. */
export type FingerRole = 'anchor' | 'guide' | 'move';

/** One fretted note of a voicing, with its role. */
export interface FingerMark {
  string: number;
  fret: number;
  finger: number;
  role: FingerRole;
}

/** Everything the tips panel shows. */
export interface ChangeTips {
  from: Voicing;
  to: Voicing;
  /** 1–10. */
  difficulty: number;
  fromMarks: FingerMark[];
  toMarks: FingerMark[];
  /** Short sentences, the most useful first. */
  tips: string[];
  /** The finger to lead with when nothing stays put, or null. */
  lead: { finger: number; distance: number } | null;
}

const FINGER_NAMES = ['', 'index', 'middle', 'ring', 'little'];

/** The finger's name: 1 -> "index". */
export function fingerName(finger: number): string {
  return FINGER_NAMES[finger] ?? `finger ${finger}`;
}

function marks(v: Voicing, roleOf: (finger: number, string: number, fret: number) => FingerRole): FingerMark[] {
  return v.notes
    .filter((n) => n.fret > 0 && n.finger !== null && n.finger > 0)
    .map((n) => ({ string: n.string, fret: n.fret, finger: n.finger as number, role: roleOf(n.finger as number, n.string, n.fret) }));
}

/**
 * The finger that travels least between the shapes (strings across plus frets along), for
 * changes where nothing stays down. Ties go to the lower finger.
 */
export function leadFinger(from: Voicing, to: Voicing): { finger: number; distance: number } | null {
  let best: { finger: number; distance: number } | null = null;
  for (let finger = 1; finger <= 4; finger++) {
    const a = from.notes.filter((n) => n.finger === finger && n.fret > 0);
    const b = to.notes.filter((n) => n.finger === finger && n.fret > 0);
    if (!a.length || !b.length) continue;
    let d = Infinity;
    for (const x of a) for (const y of b) d = Math.min(d, Math.abs(x.string - y.string) + Math.abs(x.fret - y.fret));
    if (!best || d < best.distance) best = { finger, distance: d };
  }
  return best;
}

/** Tips for changing between two voicings. */
export function tipsForVoicings(from: Voicing, to: Voicing): ChangeTips {
  const t = voicingTransition(from, to);
  const isAnchor = (finger: number, string: number, fret: number) => t.anchors.some((a) => a.finger === finger && a.string === string && a.fret === fret);
  const fromMarks = marks(from, (finger, string, fret) => (isAnchor(finger, string, fret) ? 'anchor' : t.guides.some((g) => g.finger === finger && g.string === string && g.fromFret === fret) ? 'guide' : 'move'));
  const toMarks = marks(to, (finger, string, fret) => (isAnchor(finger, string, fret) ? 'anchor' : t.guides.some((g) => g.finger === finger && g.string === string && g.toFret === fret) ? 'guide' : 'move'));
  const tips = [...t.tips];
  const lead = t.anchors.length || t.guides.length ? null : leadFinger(from, to);
  if (lead) {
    const how = lead.distance <= 1 ? 'it barely moves' : lead.distance === 2 ? 'it has the shortest way to go' : 'it travels least';
    tips.push(`Lead with your ${fingerName(lead.finger)} finger: ${how}. Aim it first and let the others follow.`);
  }
  tips.push('Look at the new shape before you leave the old one, and move all the fingers at the same time.');
  return { from, to, difficulty: t.difficulty, fromMarks, toMarks, tips, lead };
}

/** Tips for a change between two chord symbols, with the standard shapes (or the ones given). */
export function changeTips(fromSymbol: string, toSymbol: string, opts: { from?: Voicing; to?: Voicing; tuning?: TuningInput } = {}): ChangeTips | null {
  if (opts.from && opts.to) return tipsForVoicings(opts.from, opts.to);
  try {
    const c = chordChange(fromSymbol, toSymbol, { tuning: opts.tuning });
    if (!c) return null;
    return tipsForVoicings(opts.from ?? c.from, opts.to ?? c.to);
  } catch {
    return null;
  }
}
