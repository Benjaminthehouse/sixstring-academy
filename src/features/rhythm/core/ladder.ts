/**
 * The rhythm class as a ladder: every activity and level in the order a teacher would give them,
 * grouped into stages. The hub shows it, marks what is done from the progress store, and always
 * points at one next step.
 */
import type { OffbeatPart, PulseHit, Subdivision } from './charts';
import { READ_LEVELS } from './generate';
import { STRUM_PATTERNS } from './strum';

/** The five kinds of round. */
export type ActivityId = 'beat' | 'read' | 'strum' | 'drill' | 'clock';

/** A level of "Feel the beat". */
export interface BeatLevel {
  id: number;
  title: string;
  blurb: string;
  teach: string;
  meter: string;
  bpm: number;
  bars: number;
  hit: PulseHit;
}

/** The levels of "Feel the beat". */
export const BEAT_LEVELS: readonly BeatLevel[] = [
  { id: 1, title: 'Every beat', blurb: 'Tap along with a steady click.', teach: 'Tap together with every click. Try to make your tap and the click one single sound.', meter: '4/4', bpm: 80, bars: 8, hit: 'all' },
  { id: 2, title: 'The backbeat', blurb: 'Only beats 2 and 4, where the snare drum lives.', teach: 'Count "1 2 3 4" and tap only on 2 and 4. Feel 1 and 3 pass without touching them.', meter: '4/4', bpm: 92, bars: 8, hit: 'backbeat' },
  { id: 3, title: 'Waltz time', blurb: 'Three beats in a bar.', teach: 'Count "1 2 3". The first click of each bar is the high one.', meter: '3/4', bpm: 96, bars: 8, hit: 'all' },
  { id: 4, title: 'Slow and wide', blurb: 'Slow tempos leave more room to drift.', teach: 'Slow is harder than fast. Fill the space between clicks by counting "1 and 2 and" in your head.', meter: '4/4', bpm: 56, bars: 6, hit: 'all' },
  { id: 5, title: 'Only beat one', blurb: 'One tap per bar. Feel the other three.', teach: 'Tap only on the high click that starts each bar. Keep counting the three beats in between.', meter: '4/4', bpm: 104, bars: 8, hit: 'one' },
  { id: 6, title: 'Up tempo', blurb: 'A fast, even pulse.', teach: 'Small movements. Let the finger bounce rather than hammer.', meter: '4/4', bpm: 144, bars: 12, hit: 'all' },
];

/** A subdivision or counting drill. */
export type Drill =
  | { id: string; kind: 'switch'; title: string; blurb: string; teach: string; bpm: number; bars: number; pool: Subdivision[] }
  | { id: string; kind: 'offbeat'; title: string; blurb: string; teach: string; bpm: number; bars: number; part: OffbeatPart }
  | { id: string; kind: 'one'; title: string; blurb: string; teach: string; bpm: number; meter: string; guided: number; blind: number };

/** The drills, easiest first. */
export const DRILLS: readonly Drill[] = [
  { id: 'offbeat-1', kind: 'offbeat', title: 'Clap on the "and"', blurb: 'The click plays the beat. You play the gap.', teach: 'Say "1 and 2 and" with the click on the numbers, and tap only on "and". The foot goes down on the click, the hand answers.', bpm: 70, bars: 6, part: 'and' },
  { id: 'switch-1', kind: 'switch', title: 'Quarters and eighths', blurb: 'Change gear on cue, without changing the beat.', teach: 'Each bar names what to tap. The click never changes: only how many notes you fit into each beat.', bpm: 76, bars: 8, pool: ['quarter', 'eighth'] },
  { id: 'switch-2', kind: 'switch', title: 'Add sixteenths', blurb: 'One, two or four notes per beat.', teach: 'Going from eighths to sixteenths, the notes get twice as close, not twice as loud. Stay light.', bpm: 66, bars: 8, pool: ['quarter', 'eighth', 'sixteenth'] },
  { id: 'offbeat-2', kind: 'offbeat', title: 'Off-beats, faster', blurb: 'The "and" at a tempo where there is no time to think.', teach: 'At this speed you cannot count each one. Feel the click and your tap as a steady tick-tock.', bpm: 104, bars: 8, part: 'and' },
  { id: 'switch-3', kind: 'switch', title: 'Eighths and triplets', blurb: 'Two against three: the hardest gear change.', teach: 'Two per beat is "1 &". Three per beat is "1 trip let". The first note of each beat still lands on the click.', bpm: 72, bars: 8, pool: ['eighth', 'triplet'] },
  { id: 'one-5', kind: 'one', title: 'Find one in five', blurb: 'Five quick clicks, grouped three plus two.', teach: 'Count "1 2 3 1 2". Tap only when the bar starts. After a few bars the accents vanish and counting is all you have.', bpm: 96, meter: '5/8', guided: 4, blind: 8 },
  { id: 'switch-4', kind: 'switch', title: 'All four gears', blurb: 'Quarters, eighths, triplets and sixteenths in any order.', teach: 'Read the next cue during the last beat of the bar, so the change is ready before it arrives.', bpm: 66, bars: 10, pool: ['quarter', 'eighth', 'triplet', 'sixteenth'] },
  { id: 'one-7', kind: 'one', title: 'Find one in seven', blurb: 'Seven clicks, grouped two, two, three.', teach: 'Count "1 2 1 2 1 2 3". The long group at the end is where the bar turns around.', bpm: 96, meter: '7/8', guided: 4, blind: 8 },
  { id: 'offbeat-3', kind: 'offbeat', title: 'The last sixteenth', blurb: 'Tap on the "a", just before each click.', teach: 'Count "1 e and a" and tap only on "a". It is a pick-up into the next beat: late in the count, never late in time.', bpm: 60, bars: 6, part: 'a' },
];

/** A level of the inner-clock game. */
export interface ClockLevel {
  id: number;
  title: string;
  blurb: string;
  bpm: number;
  on: number;
  off: number;
  cycles: number;
}

/** Inner-clock levels: the silences get longer. */
export const CLOCK_LEVELS: readonly ClockLevel[] = [
  { id: 1, title: 'One silent bar', blurb: 'Two bars of click, one without.', bpm: 84, on: 2, off: 1, cycles: 3 },
  { id: 2, title: 'Two silent bars', blurb: 'Two bars of click, two without.', bpm: 84, on: 2, off: 2, cycles: 3 },
  { id: 3, title: 'Mostly silence', blurb: 'One bar of click, three without.', bpm: 80, on: 1, off: 3, cycles: 3 },
  { id: 4, title: 'Slow and alone', blurb: 'Three silent bars at a slow tempo.', bpm: 60, on: 1, off: 3, cycles: 2 },
  { id: 5, title: 'Four bars alone', blurb: 'A whole phrase with nothing to lean on.', bpm: 92, on: 1, off: 4, cycles: 2 },
];

/** One step of the ladder. */
export interface Rung {
  /** Skill id in the progress store: `rhythm:read:3`. */
  skill: string;
  activity: ActivityId;
  /** Route params after `rhythm`: `['read', '3']`. */
  params: string[];
  title: string;
  blurb: string;
  /** Stage index. */
  stage: number;
}

/** Names of the activities, for labels. */
export const ACTIVITY_NAMES: Record<ActivityId, string> = { beat: 'Feel the beat', read: 'Read and tap', strum: 'Strumming', drill: 'Drill', clock: 'Inner clock' };

/** lucide icon of each activity. */
export const ACTIVITY_ICONS: Record<ActivityId, string> = { beat: 'Activity', read: 'Music', strum: 'ArrowDownUp', drill: 'Shuffle', clock: 'Timer' };

/** The skill id of a level of an activity. */
export function skillId(activity: ActivityId, level: string | number): string {
  return `rhythm:${activity}:${level}`;
}

/** The stages of the class. */
export const STAGES: ReadonlyArray<{ title: string; blurb: string; steps: string[] }> = [
  { title: 'Find the pulse', blurb: 'A steady beat, long and short notes, your first strum.', steps: ['beat:1', 'read:1', 'strum:four-down', 'beat:2', 'read:2', 'clock:1'] },
  { title: 'Split the beat', blurb: 'Eighth notes, upstrokes and the patterns most songs use.', steps: ['read:3', 'strum:down-up', 'drill:offbeat-1', 'strum:down-down-up', 'read:4', 'strum:folk-pop', 'drill:switch-1'] },
  { title: 'Hold and push', blurb: 'Dots, ties, syncopation and three-four time.', steps: ['read:5', 'strum:rock', 'read:6', 'strum:backbeat', 'read:7', 'clock:2', 'strum:chuck', 'beat:3', 'read:13', 'strum:waltz', 'strum:waltz-roll'] },
  { title: 'Four to the beat', blurb: 'Sixteenth notes in the hand and on the page.', steps: ['read:8', 'drill:switch-2', 'strum:driving-downs', 'strum:sixteenths', 'read:9', 'strum:gallop', 'read:10', 'strum:pop-sixteenth', 'drill:offbeat-2'] },
  { title: 'Three and swing', blurb: 'Triplets, swing, shuffle and six-eight.', steps: ['read:11', 'drill:switch-3', 'read:12', 'strum:swung-eighths', 'strum:shuffle', 'read:14', 'strum:six-eight', 'strum:six-eight-roll', 'beat:4'] },
  { title: 'Groove and odd time', blurb: 'Reggae, funk, clave, odd meters and a long silence.', steps: ['strum:reggae', 'drill:one-5', 'beat:5', 'strum:funk-scratch', 'drill:one-7', 'clock:3', 'strum:clave', 'drill:switch-4', 'drill:offbeat-3', 'read:15', 'clock:4', 'beat:6', 'clock:5'] },
];

function describe(activity: ActivityId, level: string): { title: string; blurb: string } | null {
  if (activity === 'beat') {
    const l = BEAT_LEVELS.find((x) => String(x.id) === level);
    return l ? { title: l.title, blurb: l.blurb } : null;
  }
  if (activity === 'read') {
    const l = READ_LEVELS.find((x) => String(x.id) === level);
    return l ? { title: l.title, blurb: l.blurb } : null;
  }
  if (activity === 'strum') {
    const p = STRUM_PATTERNS.find((x) => x.id === level);
    return p ? { title: p.name, blurb: p.blurb } : null;
  }
  if (activity === 'drill') {
    const d = DRILLS.find((x) => x.id === level);
    return d ? { title: d.title, blurb: d.blurb } : null;
  }
  const l = CLOCK_LEVELS.find((x) => String(x.id) === level);
  return l ? { title: l.title, blurb: l.blurb } : null;
}

/** Every rung in order. Throws at load when a stage names a level that does not exist. */
export const LADDER: readonly Rung[] = STAGES.flatMap((stage, stageIndex) =>
  stage.steps.map((step) => {
    const [activity, level] = step.split(':') as [ActivityId, string];
    const d = describe(activity, level);
    if (!d) throw new Error(`Rhythm ladder: unknown step "${step}"`);
    return { skill: skillId(activity, level), activity, params: [activity, level], title: d.title, blurb: d.blurb, stage: stageIndex };
  }),
);

/** The first rung that has not earned a star yet (the last rung when all have). `starsOf` reads the progress store. */
export function nextRung(starsOf: (skill: string) => number): Rung {
  return LADDER.find((r) => starsOf(r.skill) < 1) ?? LADDER[LADDER.length - 1];
}

/** The rung after a given skill, or null at the end. */
export function rungAfter(skill: string): Rung | null {
  const i = LADDER.findIndex((r) => r.skill === skill);
  return i >= 0 && i + 1 < LADDER.length ? LADDER[i + 1] : null;
}

/** The rung for a skill id, if it is on the ladder. */
export function rungOf(skill: string): Rung | null {
  return LADDER.find((r) => r.skill === skill) ?? null;
}
