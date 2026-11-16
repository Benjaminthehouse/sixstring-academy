/**
 * The free drills: short adaptive rounds over the learner's own practice settings, plus a timed
 * sprint and a round made only of their blind spots.
 */
import { candidatesFor, type Ask } from './questions';
import type { RoundPlan } from './round';
import { settingsScope, type TrainerSettings } from './settings';
import type { NeckContext, Scope } from './types';

/** Drill ids (route params and skill suffixes). */
export type DrillId = 'name-the-note' | 'find-the-note' | 'find-every-note' | 'play-the-note' | 'sprint' | 'blind-spots';

/** A free drill. */
export interface Drill {
  id: DrillId;
  title: string;
  /** What it trains, one line. */
  blurb: string;
  /** How a question goes, one line for the intro. */
  how: string;
  icon: string;
  /** Needs the microphone (offers the tap version without one). */
  mic?: boolean;
}

/** The drills, in the order the hub lists them. */
export const DRILLS: readonly Drill[] = [
  { id: 'name-the-note', title: 'Name the note', blurb: 'A note lights up on the neck. Tap its name.', how: 'A dot lights up. Tap its letter below, or type it.', icon: 'Type' },
  { id: 'find-the-note', title: 'Find the note', blurb: 'You get a name. Tap where it lives on the neck.', how: 'A note is named. Tap it on the neck.', icon: 'Crosshair' },
  { id: 'find-every-note', title: 'Find every one', blurb: 'Find every C (or G, or F♯) across the neck.', how: 'Tap every place the note sits until you have them all.', icon: 'ScanSearch' },
  { id: 'play-the-note', title: 'Play it', blurb: 'Play the named note on your guitar. The microphone listens.', how: 'A note and a string are named. Play it on your guitar.', icon: 'Mic', mic: true },
  { id: 'sprint', title: 'One-minute sprint', blurb: 'Sixty seconds. How many notes can you name?', how: 'Name as many notes as you can in one minute.', icon: 'Timer' },
];

/** The blind-spots round, offered from the neck map. */
export const BLIND_SPOTS: Drill = { id: 'blind-spots', title: 'Your blind spots', blurb: 'Only the places you miss most.', how: 'Name and find the places you miss most.', icon: 'Target' };

/** A drill by its route param. */
export function drillById(id: string | undefined): Drill | null {
  if (id === BLIND_SPOTS.id) return BLIND_SPOTS;
  return DRILLS.find((d) => d.id === id) ?? null;
}

/** Skill id of a drill. */
export function drillSkillId(id: DrillId): string {
  return `fretboard:${id}`;
}

/** Sprint length in seconds. */
export const SPRINT_SECONDS = 60;

/**
 * The round a drill plays with the learner's settings. `tapInstead` turns "Play it" into its tap
 * version (no microphone); `blind` gives the blind-spot positions; `pc` asks about one note only
 * (find-the-note, find-every-note and play-the-note; the name drills ignore it), and with the
 * learner's neck (`ctx`) the round is as long as that note's places warrant.
 */
export function drillPlan(drill: Drill, settings: TrainerSettings, opts: { tapInstead?: boolean; blind?: string[]; pc?: number; ctx?: NeckContext } = {}): RoundPlan {
  const scope: Scope = settingsScope(settings);
  const oneNote = opts.pc !== undefined && (drill.id === 'find-the-note' || drill.id === 'find-every-note' || drill.id === 'play-the-note');
  // One note: whether it is natural or not, it is the note asked about.
  if (oneNote) scope.pcs = [((opts.pc! % 12) + 12) % 12];
  let asks: Ask[];
  let length: number | null = 12;
  let seconds: number | null = null;
  switch (drill.id) {
    case 'find-the-note':
      asks = [{ kind: settings.findWhere === 'anywhere' ? 'find-any' : 'find', weight: 1 }];
      break;
    case 'find-every-note':
      asks = [{ kind: 'every', weight: 1 }];
      // One note named: one question ("Find every C"), not the same one five times.
      length = oneNote ? 1 : 5;
      break;
    case 'play-the-note':
      asks = [{ kind: opts.tapInstead ? 'find' : 'play', weight: 1 }];
      length = 10;
      break;
    case 'sprint':
      asks = [{ kind: 'name', weight: 1 }];
      length = null;
      seconds = SPRINT_SECONDS;
      break;
    case 'blind-spots':
      asks = [
        { kind: 'name', weight: 0.5 },
        { kind: 'find', weight: 0.5 },
      ];
      length = 10;
      if (opts.blind && opts.blind.length >= 3) {
        scope.only = [...opts.blind];
        scope.notes = 'all';
        scope.strings = [...new Set(opts.blind.map((k) => Number(k.split(':')[0])))];
        // Show the neck around them, not just their frets: the landmarks are what helps.
        const frets = opts.blind.map((k) => Number(k.split(':')[1]));
        const lo = Math.min(...frets);
        const hi = Math.max(...frets);
        scope.frets = lo <= 12 ? [0, Math.max(12, hi)] : [12, hi];
      }
      break;
    default:
      asks = [{ kind: 'name', weight: 1 }];
  }
  // One note on a few strings has only a few places: each about twice (at least four questions),
  // rather than the same two places twelve times over.
  if (oneNote && opts.ctx && length !== null && drill.id !== 'find-every-note') {
    const places = candidatesFor(asks[0].kind, scope, opts.ctx).length;
    length = Math.min(length, Math.max(4, places * 2));
  }
  return { skillId: drillSkillId(drill.id), title: drill.title, asks, scope, length, seconds, passAt: 0.8 };
}
