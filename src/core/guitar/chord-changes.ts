/**
 * Chord changes by name: what the hand has to do to get from one chord of a song to the next, and
 * which change of a progression deserves the practice time. Built on `voicingTransition`, which
 * compares two fingered shapes; here the shapes are chosen too.
 */
import type { Chord } from '@/core/theory';
import { isNoChord, parseChord } from '@/core/theory';
import { chordVoicings } from './chord-generator';
import type { NeckOptions } from './fretboard';
import { voicingTransition, type VoicingChange } from './hand';
import type { Voicing } from './voicing';

/** A change between two named chords: the shapes used and what moving between them takes. */
export interface ChordChange extends VoicingChange {
  from: Voicing;
  to: Voicing;
}

/** Options for the chord-change helpers. */
export interface ChordChangeOptions extends NeckOptions {
  /**
   * Which shapes to compare. `standard` (default): each chord as it is normally played, the
   * top-ranked voicing. `closest`: for the chord being changed to, the one of its best few voicings
   * that is easiest to reach, the way a player picks the F barre next to the B flat barre.
   */
  voicings?: 'standard' | 'closest';
}

function read(input: string | Chord): Chord | null {
  if (typeof input !== 'string') return input;
  return isNoChord(input) ? null : parseChord(input);
}

function pick(c: Chord, opts: ChordChangeOptions, from: Voicing | null): Voicing | null {
  const list = chordVoicings(c, { tuning: opts.tuning, capo: opts.capo, maxResults: 4 });
  if (!list.length) return null;
  if (opts.voicings !== 'closest' || !from) return list[0];
  // Ranking still counts: a far-fetched shape has to be a good deal easier to reach to be chosen.
  let best = list[0];
  let bestCost = Infinity;
  list.forEach((v, rank) => {
    const cost = voicingTransition(from, v).difficulty + 0.6 * rank;
    if (cost < bestCost) {
      best = v;
      bestCost = cost;
    }
  });
  return best;
}

/**
 * The change from one chord to another: `chordChange('C', 'Am')` finds two fingers that stay down;
 * `chordChange('G', 'Bm').difficulty` says why that one takes a week. Null when either symbol is
 * not a chord (or is `N.C.`) or has no playable voicing in the tuning.
 */
export function chordChange(from: string | Chord, to: string | Chord, opts: ChordChangeOptions = {}): ChordChange | null {
  const a = read(from);
  const b = read(to);
  if (!a || !b) return null;
  const first = pick(a, opts, null);
  const second = first && pick(b, opts, first);
  if (!first || !second) return null;
  return { from: first, to: second, ...voicingTransition(first, second) };
}

/** The changes of a progression, with the ones to practise picked out. */
export interface ProgressionChanges {
  /** One entry per change between two different chords, in song order. */
  changes: ChordChange[];
  /** Mean difficulty of the changes, 1–10 (1 for a progression with no change in it). */
  difficulty: number;
  /** The hardest change, or null when there is none. */
  hardest: ChordChange | null;
  /** The distinct changes (by chord pair, either direction), hardest first: the practice list. */
  practice: ChordChange[];
}

/**
 * Every chord change of a progression in order: `progressionChanges(['G', 'D', 'Em', 'C'], { loop: true })`.
 * Repeats of one chord, unreadable symbols and `N.C.` are skipped. `loop` adds the change from the
 * last chord back to the first. With `voicings: 'closest'` each shape is chosen from where the hand
 * already is, so a line of barre chords stays in one part of the neck.
 */
export function progressionChanges(chords: ReadonlyArray<string | Chord>, opts: ChordChangeOptions & { loop?: boolean } = {}): ProgressionChanges {
  const played: Voicing[] = [];
  for (const item of chords) {
    const c = read(item);
    if (!c) continue;
    const previous = played[played.length - 1] ?? null;
    const voicing = pick(c, opts, previous);
    if (!voicing || (previous && previous.chord === voicing.chord)) continue;
    played.push(voicing);
  }
  const changes: ChordChange[] = [];
  for (let i = 1; i < played.length; i++) changes.push({ from: played[i - 1], to: played[i], ...voicingTransition(played[i - 1], played[i]) });
  if (opts.loop && played.length > 1 && played[played.length - 1].chord !== played[0].chord) {
    const from = played[played.length - 1];
    changes.push({ from, to: played[0], ...voicingTransition(from, played[0]) });
  }
  const byPair = new Map<string, ChordChange>();
  for (const change of changes) {
    const key = [change.from.id, change.to.id].sort().join(' ');
    const held = byPair.get(key);
    if (!held || change.difficulty > held.difficulty) byPair.set(key, change);
  }
  const practice = [...byPair.values()].sort((x, y) => y.difficulty - x.difficulty);
  const mean = changes.length ? changes.reduce((sum, c) => sum + c.difficulty, 0) / changes.length : 1;
  return { changes, difficulty: Math.round(mean * 10) / 10, hardest: practice[0] ?? null, practice };
}
