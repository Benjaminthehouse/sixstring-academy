/**
 * The fretting hand as a cost model.
 *
 * The song arranger uses it to decide where on the neck a melody note should be played: the same
 * pitch exists on several strings, and the right one is the one that keeps the hand still. The
 * chord-change trainer uses the second half: how hard it is to get from one chord shape to the next.
 *
 * The hand is modelled by its *position*: the fret under the index finger. Four fingers cover
 * four frets; one fret further either way is a stretch; anything else is a shift.
 */
import { DEFAULT_FRETS, positionsForMidi, type FretRangeOptions } from './fretboard';
import { tuning } from './tunings';
import type { Finger, FretPosition } from './types';
import { assignFingers, voicingDifficulty, type Voicing } from './voicing';

/** What each kind of hand movement costs. All values are in the same arbitrary unit (a comfortable note costs about 0). */
export interface HandWeights {
  /** Moving the hand at all. */
  shift: number;
  /** Each fret the hand moves, on top of `shift`. */
  shiftPerFret: number;
  /** Reaching one fret outside the position without moving the hand. */
  stretch: number;
  /** Each string jumped over between two fretted notes (neighbouring strings are free; at most three are counted). */
  stringSkip: number;
  /** One finger rolling to the same fret on the next string. */
  roll: number;
  /** Each fret of height: a small pull toward the low positions, where notes are easier to find and read. */
  fretHeight: number;
  /** Each fret above the twelfth, on top of `fretHeight`. */
  highFret: number;
  /** Playing an open string. 0 by default (open strings are the easiest notes there are); raise it to keep a line fretted. */
  openString: number;
  /** An open string while the hand is up the neck: per fret of hand position above the third. */
  openFromHigh: number;
  /** Each fret between the hand and the preferred position, if one is given. */
  awayFromPreferred: number;
}

/** Defaults tuned for melodies: prefer staying in position, then small shifts, then stretches. */
export const DEFAULT_HAND_WEIGHTS: Readonly<HandWeights> = {
  shift: 2.5, shiftPerFret: 0.6, stretch: 1.8, stringSkip: 0.5, roll: 0.4, fretHeight: 0.06, highFret: 0.35, openString: 0, openFromHigh: 0.4, awayFromPreferred: 0.25,
};

/** Where the hand is and what it last played. */
export interface HandState {
  /** Fret under the index finger; null before the first fretted note. */
  position: number | null;
  /** The last note played, or null at the start. */
  last: FretPosition | null;
  /** Finger that played it (0 = open string). */
  finger: Finger;
}

/** A fresh hand: nowhere yet. */
export const RESTING_HAND: Readonly<HandState> = { position: null, last: null, finger: 0 };

/** One way to play a note from a given hand state. */
export interface HandMove {
  cost: number;
  /** The hand after the note. */
  state: HandState;
  finger: Finger;
  /** True when the hand had to move to a new position. */
  shift: boolean;
  /** True when the finger reaches outside the position. */
  stretch: boolean;
}

/** Hand positions from which a fret can be played, with the finger used; the last two are stretches. */
function placements(fret: number): Array<{ position: number; finger: Finger; stretch: boolean }> {
  const out: Array<{ position: number; finger: Finger; stretch: boolean }> = [];
  for (let finger = 1; finger <= 4; finger++) {
    const position = fret - finger + 1;
    if (position >= 1) out.push({ position, finger: finger as Finger, stretch: false });
  }
  // Index reaching one fret down, little finger one fret up.
  out.push({ position: fret + 1, finger: 1, stretch: true });
  if (fret - 4 >= 1) out.push({ position: fret - 4, finger: 4, stretch: true });
  return out;
}

function moveCost(state: HandState, to: FretPosition, place: { position: number; finger: Finger; stretch: boolean } | null, w: HandWeights, ease: number): HandMove {
  let cost = w.fretHeight * to.fret + w.highFret * Math.max(0, to.fret - 12);
  let shift = false;
  let position = state.position;
  let finger: Finger = 0;
  let stretch = false;
  if (!place) {
    cost += w.openString + w.openFromHigh * Math.max(0, (state.position ?? 0) - 3);
  } else {
    finger = place.finger;
    stretch = place.stretch;
    if (stretch) cost += w.stretch;
    if (state.position !== null && state.position !== place.position) {
      shift = true;
      // Time to get there makes a shift easier: `ease` shrinks toward 0 as the gap before the note grows.
      cost += (w.shift + w.shiftPerFret * Math.abs(place.position - state.position)) * ease;
    }
    position = place.position;
  }
  if (state.last) {
    const strings = Math.abs(to.string - state.last.string);
    // Skipping strings is work for the fretting fingers; an open string on either side costs them nothing.
    if (strings > 1 && place && state.last.fret > 0) cost += w.stringSkip * Math.min(3, strings - 1);
    if (place && state.last.fret > 0) {
      if (strings === 1 && to.fret === state.last.fret && finger === state.finger) cost += w.roll;
      // Two different frets on one string cannot share a finger without a slide.
      if (strings === 0 && to.fret !== state.last.fret && finger === state.finger && !shift) cost += w.shift;
    }
  }
  return { cost, state: { position, last: { string: to.string, fret: to.fret }, finger }, finger, shift, stretch };
}

/**
 * The cheapest way to play one note from a hand state: which finger, whether the hand shifts or
 * stretches, and what it costs. `ease` (0–1, default 1) scales the cost of shifting; pass a small
 * value when there is a rest or a long note before this one.
 */
export function handMove(state: HandState, to: FretPosition, weights: Partial<HandWeights> = {}, ease = 1): HandMove {
  const w = { ...DEFAULT_HAND_WEIGHTS, ...weights };
  if (to.fret === 0) return moveCost(state, to, null, w, ease);
  let best: HandMove | null = null;
  for (const place of placements(to.fret)) {
    const move = moveCost(state, to, place, w, ease);
    if (!best || move.cost < best.cost) best = move;
  }
  return best!;
}

/**
 * Cost of going from one position to the next with nothing else known: frets of hand travel
 * beyond what four fingers cover, plus string skips. A quick estimate; `planFingering` is the
 * real thing for a whole line.
 */
export function positionChangeCost(from: FretPosition, to: FretPosition, weights: Partial<HandWeights> = {}): number {
  const w = { ...DEFAULT_HAND_WEIGHTS, ...weights };
  const start = handMove(RESTING_HAND, from, w);
  return handMove(start.state, to, w).cost;
}

/** One note of a planned line. */
export interface PlannedNote extends FretPosition {
  midi: number;
  finger: Finger;
  /** Hand position (fret under the index finger) while the note is played; null while only open strings have sounded. */
  position: number | null;
  shift: boolean;
  stretch: boolean;
  /** What this note added to the total. */
  cost: number;
}

/** A whole line placed on the neck. */
export interface FingeringPlan {
  notes: PlannedNote[];
  /** Sum of all note costs: lower is easier. */
  cost: number;
  /** Notes that could not be placed (outside the instrument's range), by index into the input. */
  unplayable: number[];
}

/** Options for `planFingering`. */
export interface PlanOptions extends FretRangeOptions {
  weights?: Partial<HandWeights>;
  /** Keep the hand near this fret when the music allows (a soft preference). */
  preferPosition?: number;
  /**
   * Time before each note, in beats (same length as the notes). Shifts before a note that follows a
   * gap of a beat or more cost about half; omit for an even line.
   */
  gaps?: readonly number[];
  /** Where the hand starts (default: nowhere yet). */
  start?: HandState;
}

/**
 * Choose string, fret and finger for every note of a melody so that the hand moves as little as
 * possible. Dynamic programming over every place each pitch can be played and every hand position
 * that reaches it: the whole line is weighed, so an early note is placed where the later ones need
 * the hand to be.
 * Notes outside the instrument's range (or the fret range given) are left out and listed in `unplayable`.
 */
export function planFingering(midiNotes: readonly number[], opts: PlanOptions = {}): FingeringPlan {
  const w = { ...DEFAULT_HAND_WEIGHTS, ...opts.weights };
  const range: FretRangeOptions = { tuning: opts.tuning, capo: opts.capo, minFret: opts.minFret, maxFret: opts.maxFret ?? DEFAULT_FRETS - (opts.capo ?? 0) };
  type Place = { position: number; finger: Finger; stretch: boolean };
  interface Node { pos: FretPosition; total: number; back: number; move: HandMove }
  const layers: Node[][] = [];
  const kept: number[] = [];
  const unplayable: number[] = [];
  const start = opts.start ?? RESTING_HAND;
  midiNotes.forEach((midi, index) => {
    const candidates = positionsForMidi(midi, range);
    if (!candidates.length) {
      unplayable.push(index);
      return;
    }
    const gap = opts.gaps?.[index];
    const ease = gap === undefined ? 1 : 1 / (1 + Math.max(0, gap));
    const previous = layers[layers.length - 1];
    const prior: Array<{ state: HandState; total: number; back: number }> = previous
      ? previous.map((node, back) => ({ state: node.move.state, total: node.total, back }))
      : [{ state: start, total: 0, back: -1 }];
    const layer: Node[] = [];
    const consider = (pos: FretPosition, place: Place | null, from: Array<{ state: HandState; total: number; back: number }>) => {
      let best: Node | null = null;
      for (const f of from) {
        const move = moveCost(f.state, pos, place, w, ease);
        let cost = move.cost;
        if (opts.preferPosition !== undefined && move.state.position !== null) cost += w.awayFromPreferred * Math.abs(move.state.position - opts.preferPosition);
        const total = f.total + cost;
        if (!best || total < best.total) best = { pos, total, back: f.back, move: { ...move, cost } };
      }
      if (best) layer.push(best);
    };
    for (const pos of candidates) {
      if (pos.fret > 0) {
        for (const place of placements(pos.fret)) consider(pos, place, prior);
      } else {
        // An open string leaves the hand where it was, so every hand position reached so far stays a separate case.
        const byPosition = new Map<number | null, typeof prior>();
        for (const f of prior) {
          const list = byPosition.get(f.state.position);
          if (list) list.push(f);
          else byPosition.set(f.state.position, [f]);
        }
        for (const group of byPosition.values()) consider(pos, null, group);
      }
    }
    layers.push(layer);
    kept.push(index);
  });
  if (!layers.length) return { notes: [], cost: 0, unplayable };
  const lastLayer = layers[layers.length - 1];
  let at = lastLayer.reduce((bestIndex, node, i) => (node.total < lastLayer[bestIndex].total ? i : bestIndex), 0);
  const total = lastLayer[at].total;
  const notes: PlannedNote[] = new Array(layers.length);
  for (let i = layers.length - 1; i >= 0; i--) {
    const node: Node = layers[i][at];
    const move = node.move;
    notes[i] = {
      string: node.pos.string, fret: node.pos.fret, midi: midiNotes[kept[i]], finger: move.finger,
      position: move.state.position, shift: move.shift, stretch: move.stretch, cost: Math.round(move.cost * 100) / 100,
    };
    at = node.back;
  }
  return { notes, cost: Math.round(total * 100) / 100, unplayable };
}

/**
 * How hard it is to hold several positions at once (a double stop, a chord fragment in an
 * arrangement): the difficulty of the shape, 1–10, or Infinity when no hand can hold it (two
 * notes on one string, more than four fingers, a span of more than five frets).
 */
export function simultaneousCost(positions: readonly FretPosition[], opts: { tuning?: PlanOptions['tuning'] } = {}): number {
  const t = tuning(opts.tuning);
  const frets: Array<number | null> = new Array(t.stringCount).fill(null);
  for (const pos of positions) {
    const index = t.stringCount - pos.string;
    if (index < 0 || index >= t.stringCount || frets[index] !== null) return Infinity;
    frets[index] = pos.fret;
  }
  const pressed = frets.filter((f): f is number => f !== null && f > 0);
  if (pressed.length && Math.max(...pressed) - Math.min(...pressed) > 4) return Infinity;
  const fingering = assignFingers(frets);
  return fingering ? voicingDifficulty(frets, fingering.fingers) : Infinity;
}

// ── Chord changes ──────────────────────────────────────────────────────────────────────────

/** A finger that stays on the same string while the chord changes. */
export interface GuideFinger {
  finger: Finger;
  string: number;
  fromFret: number;
  toFret: number;
}

/** What the hand has to do to get from one voicing to another. */
export interface VoicingChange {
  /** 1 (the fingers barely move) to 10. */
  difficulty: number;
  /** Fingers that stay exactly where they are: keep them down. */
  anchors: Array<FretPosition & { finger: Finger }>;
  /** Fingers that slide along their string to a new fret: let them lead the hand. */
  guides: GuideFinger[];
  /** Fingers that lift and land somewhere else, or land for the first time. */
  moving: Finger[];
  /** Frets the hand travels (positive = up the neck). */
  shift: number;
  /** True when both chords are the same fingering at different frets. */
  sameShape: boolean;
  /** True when the fingers keep their formation and only move across strings or frets together (Am to E). */
  block: boolean;
  /** Practice advice in plain words, most useful first. */
  tips: string[];
}

interface FingerPlace { fret: number; strings: number[] }

function fingerPlaces(v: Voicing): Map<Finger, FingerPlace> {
  const places = new Map<Finger, FingerPlace>();
  v.notes.forEach((n) => {
    if (n.finger === 0) return;
    const held = places.get(n.finger);
    if (held) held.strings.push(n.string);
    else places.set(n.finger, { fret: n.fret, strings: [n.string] });
  });
  return places;
}

const FINGER_NAMES = ['', 'index', 'middle', 'ring', 'little'];

/**
 * Compare two voicings as a chord change: which fingers can stay (anchors), which can slide
 * (guides), which have to jump, how far the hand moves, and a difficulty from 1 to 10.
 * `voicingTransition(C, Am)` finds two anchor fingers; `voicingTransition(F barre, G barre)`
 * is the same shape two frets up.
 */
export function voicingTransition(from: Voicing, to: Voicing): VoicingChange {
  const a = fingerPlaces(from);
  const b = fingerPlaces(to);
  const anchors: VoicingChange['anchors'] = [];
  const guides: GuideFinger[] = [];
  const moving: Finger[] = [];
  let effort = 0;
  const bothFretted = a.size > 0 && b.size > 0;
  const shift = bothFretted ? to.baseFret - from.baseFret : 0;
  const relative = (v: Voicing) => v.frets.map((f) => (f === null ? 'x' : f === 0 ? 'o' : String(f - v.baseFret))).join(',');
  const sameShape = bothFretted && from.movable && to.movable && relative(from) === relative(to) && from.fingers.join() === to.fingers.join();
  let block = false;
  if (sameShape) {
    effort = shift === 0 ? 0 : 0.8 + Math.min(2.2, 0.3 * Math.abs(shift));
    for (const [finger, place] of b) {
      const before = a.get(finger)!;
      if (shift === 0) anchors.push({ finger, string: place.strings[0], fret: place.fret });
      else guides.push({ finger, string: place.strings[0], fromFret: before.fret, toFret: place.fret });
    }
  } else {
    // The same formation carried to other strings or frets (Am to E) moves as one block.
    const offsets = new Set<string>();
    for (const [finger, place] of b) {
      const before = a.get(finger);
      offsets.add(before && before.strings.length === place.strings.length ? `${place.strings[0] - before.strings[0]},${place.fret - before.fret}` : `new${finger}`);
    }
    block = b.size >= 2 && a.size === b.size && offsets.size === 1 && !offsets.has('0,0');
    for (const [finger, place] of b) {
      const before = a.get(finger);
      const shared = before ? place.strings.filter((s) => before.strings.includes(s)) : [];
      if (before && shared.length && before.fret === place.fret) {
        anchors.push({ finger, string: shared[0], fret: place.fret });
        // A finger that stays but changes how many strings it covers still has to adjust.
        if (shared.length !== place.strings.length || shared.length !== before.strings.length) effort += 0.5;
      } else if (before && shared.length) {
        guides.push({ finger, string: shared[0], fromFret: before.fret, toFret: place.fret });
        effort += 0.5 + 0.12 * Math.abs(place.fret - before.fret);
      } else {
        moving.push(finger);
        if (before) {
          const strings = Math.abs(place.strings[0] - before.strings[0]);
          const frets = Math.abs(place.fret - before.fret);
          effort += block ? 0.5 : Math.min(1.8, 0.8 + 0.15 * (strings + frets));
        } else {
          effort += 0.8;
        }
      }
      // Laying a finger flat where it was not is the slowest part of any change.
      if (place.strings.length > 1 && (!before || before.strings.length === 1)) effort += place.strings.length >= 4 ? 1.4 : 0.8;
    }
    effort += Math.min(2.5, 0.3 * Math.abs(shift));
    effort -= 0.5 * anchors.length;
  }
  // A hard target chord makes every change into it harder.
  effort += Math.max(0, to.difficulty - 4) * 0.35;
  const difficulty = Math.round(Math.min(10, Math.max(1, 1 + effort)) * 10) / 10;

  const tips: string[] = [];
  if (sameShape && shift !== 0) {
    tips.push(`Same shape: keep the fingers in formation and move the whole hand ${Math.abs(shift)} ${Math.abs(shift) === 1 ? 'fret' : 'frets'} ${shift > 0 ? 'up' : 'down'}.`);
  } else if (sameShape) {
    tips.push('Nothing moves: it is the same shape.');
  } else {
    for (const anchor of anchors) tips.push(`Keep your ${FINGER_NAMES[anchor.finger]} finger down on string ${anchor.string}, fret ${anchor.fret}: it does not move.`);
    for (const guide of guides) tips.push(`Slide your ${FINGER_NAMES[guide.finger]} finger along string ${guide.string} from fret ${guide.fromFret} to fret ${guide.toFret} and let it lead the hand.`);
    if (block && moving.length) tips.push('The fingers keep their formation: move them across together as one block.');
    else if (!anchors.length && !guides.length && moving.length) tips.push('No finger stays put: lift all the fingers together and land them together, as one shape.');
    if (to.barres.some((bar) => bar.finger === 1) && !from.barres.some((bar) => bar.finger === 1)) tips.push('Place the barre first, then let the other fingers fall into place.');
  }
  return { difficulty, anchors, guides, moving: moving.sort((x, y) => x - y), shift, sameShape, block, tips };
}

/** Difficulty (1–10) of changing from one voicing to another; see `voicingTransition` for the details. */
export function changeDifficulty(from: Voicing, to: Voicing): number {
  return voicingTransition(from, to).difficulty;
}

/** The voicing of `candidates` that is easiest to reach from `from`, or null for an empty list. */
export function closestVoicing(from: Voicing, candidates: readonly Voicing[]): Voicing | null {
  let best: Voicing | null = null;
  let bestCost = Infinity;
  for (const candidate of candidates) {
    const cost = voicingTransition(from, candidate).difficulty;
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best;
}
