/**
 * Strumming patterns.
 *
 * Every pattern is a row of slots on a steady grid (eighths or sixteenths). The strumming hand
 * never stops: it goes down on the even slots and up on the odd ones, like a pendulum. A pattern
 * only says what happens when the hand passes the strings in each slot: strum, strum hard, strum
 * with the strings muted, or miss them on purpose (a "ghost" stroke). So the direction of every
 * stroke follows from where it sits, which is exactly what a learner has to internalise.
 *
 * Each library pattern also carries its arrows and its spoken count as written text. The tests
 * derive both from the slots and compare, so a typo in either is caught.
 */
import { countAt, type Count } from './counting';
import { meterInfo } from './meter';
import { swungTick } from './rhythm';
import { PPQ } from '@/core/theory';

/** What the hand does in one slot. */
export type StrokeKind = 'strum' | 'accent' | 'mute' | 'ghost';

/** Grid a pattern is written on. `swing` = eighths played long-short. */
export type StrumGrid = 'eighth' | 'sixteenth' | 'swing';

/** One slot code per character: s strum, a accent, x muted, - ghost. */
const KIND_OF: Record<string, StrokeKind> = { s: 'strum', a: 'accent', x: 'mute', '-': 'ghost' };
const CODE_OF: Record<StrokeKind, string> = { strum: 's', accent: 'a', mute: 'x', ghost: '-' };

/** A strumming pattern of one bar. */
export interface StrumPattern {
  id: string;
  name: string;
  /** The nickname players use, where there is one ("D DU UDU"). */
  short?: string;
  meter: string;
  grid: StrumGrid;
  /** One character per slot (see `KIND_OF`). */
  slots: string;
  /** The arrows as a teacher writes them: D, U, D> (accent), Dx (muted), . (ghost), one per slot. */
  written: string;
  /** The syllables that are actually strummed, in order. */
  count: string;
  /** Felt beats per minute to start at. */
  bpm: number;
  /** 1 (first week) to 5 (takes months). */
  level: 1 | 2 | 3 | 4 | 5;
  /** One line for the list. */
  blurb: string;
  /** How to play it and what it should feel like. */
  how: string;
  /** The usual mistake and its fix. */
  mistake: string;
  /** Chord it is demonstrated on. */
  chord: string;
  /** Chords are cut short (reggae). */
  staccato?: boolean;
  /** Made by the learner in the builder. */
  custom?: boolean;
}

/** One slot of a pattern, resolved. */
export interface Stroke {
  slot: number;
  /** Written position in ticks from the start of the bar. */
  tick: number;
  /** Position as played (swing applied). */
  playTick: number;
  dir: 'D' | 'U';
  kind: StrokeKind;
  count: Count;
}

/** Length of one slot in ticks. */
export function slotTicks(grid: StrumGrid): number {
  return grid === 'sixteenth' ? PPQ / 4 : PPQ / 2;
}

/** Number of slots in one bar of a meter on a grid. */
export function slotsPerBar(meter: string, grid: StrumGrid): number {
  return meterInfo(meter).barTicks / slotTicks(grid);
}

/** The strokes of a pattern, ghosts included. Throws when the slots do not fill the bar. */
export function strokes(pattern: Pick<StrumPattern, 'meter' | 'grid' | 'slots'>): Stroke[] {
  const meter = meterInfo(pattern.meter);
  const step = slotTicks(pattern.grid);
  const n = meter.barTicks / step;
  if (pattern.slots.length !== n) throw new RangeError(`A bar of ${pattern.meter} on this grid has ${n} slots, the pattern has ${pattern.slots.length}`);
  return [...pattern.slots].map((code, slot) => {
    const kind = KIND_OF[code];
    if (!kind) throw new RangeError(`"${code}" is not a stroke`);
    const tick = slot * step;
    return { slot, tick, playTick: pattern.grid === 'swing' ? swungTick(tick, meter) : tick, dir: slot % 2 === 0 ? 'D' : 'U', kind, count: countAt(tick, meter) };
  });
}

/** True for a slot that makes a sound. */
export function sounds(stroke: Stroke): boolean {
  return stroke.kind !== 'ghost';
}

/**
 * True for an upstroke that a microphone may find hardest to hear: one sixteenth after a downstroke
 * whose chord is still ringing, the light upstroke adds little energy. `detectOnsets` used to find
 * only 14 of the 76 such upstrokes in four bars of every library pattern played by the synthesised
 * guitar; since it also listens for new sound above 1 kHz it finds all 76, and all 516 other strokes,
 * with nothing extra (`mic-strokes.test.ts`). A real guitar played lightly can still slip under it,
 * so a play-along round through the microphone does not count one of these as missed when it goes
 * unheard.
 */
export function quietUpstroke(pattern: Pick<StrumPattern, 'meter' | 'grid' | 'slots' | 'staccato'>, stroke: Stroke): boolean {
  if (stroke.dir !== 'U' || stroke.kind === 'ghost' || pattern.grid !== 'sixteenth' || pattern.staccato) return false;
  const before = stroke.slot > 0 ? pattern.slots[stroke.slot - 1] : '';
  return before === 's' || before === 'a';
}

/** The arrows of a pattern, derived from its slots: `D . D U . U D U`. */
export function patternArrows(pattern: Pick<StrumPattern, 'meter' | 'grid' | 'slots'>): string {
  return strokes(pattern)
    .map((s) => (s.kind === 'ghost' ? '.' : s.dir + (s.kind === 'accent' ? '>' : s.kind === 'mute' ? 'x' : '')))
    .join(' ');
}

/** The spoken count of the sounding strokes, derived from the slots: `1 2 & & 4 &`. */
export function patternCount(pattern: Pick<StrumPattern, 'meter' | 'grid' | 'slots'>): string {
  return strokes(pattern)
    .filter(sounds)
    .map((s) => s.count.text)
    .join(' ');
}

/** The sounding strokes grouped beat by beat: `D DU U DU`. Used as a nickname when the pattern has none. */
export function patternNickname(pattern: Pick<StrumPattern, 'meter' | 'grid' | 'slots' | 'short'>): string {
  if (pattern.short) return pattern.short;
  const meter = meterInfo(pattern.meter);
  const groups: string[] = meter.beatStarts.map(() => '');
  for (const s of strokes(pattern)) {
    if (!sounds(s)) continue;
    let beat = 0;
    meter.beatStarts.forEach((start, i) => {
      if (s.tick >= start) beat = i;
    });
    groups[beat] += s.kind === 'mute' ? 'x' : s.dir;
  }
  return groups.filter((g) => g).join(' ');
}

type Def = Omit<StrumPattern, 'custom'>;

/** The library, in teaching order. */
export const STRUM_PATTERNS: readonly StrumPattern[] = ([
  {
    id: 'four-down',
    name: 'Four downstrokes',
    meter: '4/4',
    grid: 'eighth',
    slots: 's-s-s-s-',
    written: 'D . D . D . D .',
    count: '1 2 3 4',
    bpm: 80,
    level: 1,
    blurb: 'One strum per beat. Where everybody starts.',
    how: 'Strum down on every beat. Between the beats your hand comes back up without touching the strings. That silent upstroke is the seed of every pattern that follows.',
    mistake: 'Stopping the hand after each strum. Keep it swinging like a pendulum, even through the silent half.',
    chord: 'Em',
  },
  {
    id: 'down-up',
    name: 'Down-up eighths',
    meter: '4/4',
    grid: 'eighth',
    slots: 'ssssssss',
    written: 'D U D U D U D U',
    count: '1 & 2 & 3 & 4 &',
    bpm: 80,
    level: 1,
    blurb: 'Now the upstroke touches the strings too.',
    how: 'The same pendulum, but the way back up brushes the thin strings. Downs land on the numbers, ups on the "and". Make the ups lighter than the downs.',
    mistake: 'Hitting all six strings on the way up. An upstroke only needs the top three or four.',
    chord: 'Em',
  },
  {
    id: 'down-down-up',
    name: 'Down, down-up',
    meter: '4/4',
    grid: 'eighth',
    slots: 's-sss-ss',
    written: 'D . D U D . D U',
    count: '1 2 & 3 4 &',
    bpm: 84,
    level: 2,
    blurb: 'Long, short-short: the campfire strum.',
    how: 'Beats 1 and 3 are a single downstroke that rings; beats 2 and 4 are a quick down-up. Say "long, short-short".',
    mistake: 'Rushing the single downstroke. It lasts a full beat: let your hand travel up silently before the next one.',
    chord: 'G',
  },
  {
    id: 'folk-pop',
    name: 'The folk and pop strum',
    short: 'D DU UDU',
    meter: '4/4',
    grid: 'eighth',
    slots: 's-ss-sss',
    written: 'D . D U . U D U',
    count: '1 2 & & 4 &',
    bpm: 88,
    level: 2,
    blurb: 'The pattern behind thousands of songs.',
    how: 'The secret is beat 3: your hand goes down but misses the strings on purpose, so two upstrokes follow each other. Keep the hand moving and the pattern plays itself.',
    mistake: 'Freezing on beat 3 to wait for the upstroke. The ghost downstroke is what keeps you in time.',
    chord: 'G',
  },
  {
    id: 'rock',
    name: 'Rock strum',
    meter: '4/4',
    grid: 'eighth',
    slots: 's-ss-ss-',
    written: 'D . D U . U D .',
    count: '1 2 & & 4',
    bpm: 96,
    level: 2,
    blurb: 'The pop strum with a clean landing on 4.',
    how: 'Like the folk and pop strum, but the bar ends on a plain downstroke. That gap after beat 4 gives you time to change chords.',
    mistake: 'Adding the last upstroke out of habit. Let beat 4 ring.',
    chord: 'A',
  },
  {
    id: 'backbeat',
    name: 'Backbeat accents',
    meter: '4/4',
    grid: 'eighth',
    slots: 'ssasssas',
    written: 'D U D> U D U D> U',
    count: '1 & 2 & 3 & 4 &',
    bpm: 88,
    level: 2,
    blurb: 'Down-up eighths that lean on 2 and 4.',
    how: 'Nothing changes in the hand except weight: dig in on beats 2 and 4, where a drummer hits the snare, and play everything else lightly.',
    mistake: 'Speeding up on the loud strokes. An accent is louder, not earlier.',
    chord: 'D',
  },
  {
    id: 'chuck',
    name: 'Chuck on 2 and 4',
    meter: '4/4',
    grid: 'eighth',
    slots: 's-xs-sxs',
    written: 'D . Dx U . U Dx U',
    count: '1 2 & & 4 &',
    bpm: 84,
    level: 3,
    blurb: 'A muted slap that turns the guitar into a drum.',
    how: 'On 2 and 4 the heel of your strumming hand lands on the strings just as the pick does, so you hear a percussive "chk" instead of a chord. It is the folk and pop strum with a snare drum built in.',
    mistake: 'Muting too late, so the chord rings first. Hand and pick arrive together.',
    chord: 'Am',
  },
  {
    id: 'reggae',
    name: 'Reggae off-beats',
    meter: '4/4',
    grid: 'eighth',
    slots: '-s-s-s-s',
    written: '. U . U . U . U',
    count: '& & & &',
    bpm: 76,
    level: 3,
    blurb: 'Nothing on the beat, a short chop on every "and".',
    how: 'Your hand swings down on each beat without touching the strings, then chops upward on the "and". Relax the fretting hand right after each chop to cut the chord short.',
    mistake: 'Drifting onto the beat. Tap your foot on the numbers and keep the chops in the gaps.',
    chord: 'Am',
    staccato: true,
  },
  {
    id: 'swung-eighths',
    name: 'Swung down-up',
    meter: '4/4',
    grid: 'swing',
    slots: 'ssssssss',
    written: 'D U D U D U D U',
    count: '1 & 2 & 3 & 4 &',
    bpm: 92,
    level: 3,
    blurb: 'Down-up with a lilt: long down, short up.',
    how: 'The downstroke lingers and the upstroke arrives late, just before the next beat: "doo-ba, doo-ba". The hand moves like a skip rather than a march.',
    mistake: 'Straightening it out as you speed up. Exaggerate the long-short until it sticks.',
    chord: 'A',
  },
  {
    id: 'shuffle',
    name: 'Shuffle',
    meter: '4/4',
    grid: 'swing',
    slots: 's-sss-ss',
    written: 'D . D U D . D U',
    count: '1 2 & 3 4 &',
    bpm: 96,
    level: 3,
    blurb: 'The blues strum: down, down-up with swing.',
    how: 'The campfire strum played with a shuffle feel. The upstrokes come late, tucked right before beats 3 and 1.',
    mistake: 'Playing the upstroke exactly halfway. In a shuffle it belongs to the beat that follows it.',
    chord: 'E',
  },
  {
    id: 'driving-downs',
    name: 'Driving downstrokes',
    meter: '4/4',
    grid: 'sixteenth',
    slots: 's-s-s-s-s-s-s-s-',
    written: 'D . D . D . D . D . D . D . D .',
    count: '1 & 2 & 3 & 4 &',
    bpm: 96,
    level: 3,
    blurb: 'Eight downstrokes a bar, the engine of punk and hard rock.',
    how: 'Every eighth note is a downstroke, so the hand returns twice as fast as before. Small movements from the wrist, mostly on the lower strings.',
    mistake: 'Tensing the forearm. If it burns, slow down and make the motion smaller.',
    chord: 'E',
  },
  {
    id: 'sixteenths',
    name: 'Sixteenth strum',
    meter: '4/4',
    grid: 'sixteenth',
    slots: 'asssasssasssasss',
    written: 'D> U D U D> U D U D> U D U D> U D U',
    count: '1 e & a 2 e & a 3 e & a 4 e & a',
    bpm: 66,
    level: 4,
    blurb: 'Four strokes per beat with the beat marked.',
    how: 'Down-up twice per beat: "one e and a". Lean slightly on each number so the beat stays audible inside the wash.',
    mistake: 'A stiff wrist. Hold the pick loosely and let it give as it crosses the strings.',
    chord: 'Em',
  },
  {
    id: 'gallop',
    name: 'Gallop',
    meter: '4/4',
    grid: 'sixteenth',
    slots: 's-sss-sss-sss-ss',
    written: 'D . D U D . D U D . D U D . D U',
    count: '1 & a 2 & a 3 & a 4 & a',
    bpm: 72,
    level: 4,
    blurb: 'Long, short-short on every beat.',
    how: 'One beat is "down, (miss), down-up": the sound of a horse at a gallop. The ghost upstroke after each number keeps the three strums evenly placed.',
    mistake: 'Turning it into a triplet. The gap after the first stroke is real: count "1 (e) & a".',
    chord: 'Em',
  },
  {
    id: 'pop-sixteenth',
    name: 'Sixteenth-note pop strum',
    meter: '4/4',
    grid: 'sixteenth',
    slots: 's-s-s-ss-ssss-ss',
    written: 'D . D . D . D U . U D U D . D U',
    count: '1 & 2 & a e & a 4 & a',
    bpm: 70,
    level: 4,
    blurb: 'The acoustic ballad pattern, at sixteenth speed.',
    how: 'Steady downs on "1 & 2 &", then the hand misses beat 3 and catches it on the way up, exactly like the folk and pop strum does one level slower.',
    mistake: 'Losing the pendulum in the busy second half. Practise it on muted strings first.',
    chord: 'C',
  },
  {
    id: 'funk-scratch',
    name: 'Funk scratch',
    meter: '4/4',
    grid: 'sixteenth',
    slots: 'a-xs-sx-a-xs-sxs',
    written: 'D> . Dx U . U Dx . D> . Dx U . U Dx U',
    count: '1 & a e & 3 & a e & a',
    bpm: 76,
    level: 5,
    blurb: 'Chord stabs and muted scratches on a sixteenth grid.',
    how: 'The fretting hand does half the work: press for the stabs, relax for the scratches. The strumming hand just keeps its sixteenths going.',
    mistake: 'Stopping the hand between stabs. In funk the motion never stops; only the pressure changes.',
    chord: 'Em',
    staccato: true,
  },
  {
    id: 'clave',
    name: 'Clave strum',
    meter: '4/4',
    grid: 'sixteenth',
    slots: 's--s--s---s-s---',
    written: 'D . . U . . D . . . D . D . . .',
    count: '1 a & & 4',
    bpm: 84,
    level: 5,
    blurb: 'Five strums in the old three-two clave shape.',
    how: 'Three strums spread across the first half of the bar, two in the second. Most of what your hand does is ghost strokes: trust the pendulum to place the five real ones.',
    mistake: 'Guessing the gaps. Count every sixteenth out loud until the shape is automatic.',
    chord: 'A',
  },
  {
    id: 'waltz',
    name: 'Waltz',
    meter: '3/4',
    grid: 'eighth',
    slots: 'a-s-s-',
    written: 'D> . D . D .',
    count: '1 2 3',
    bpm: 96,
    level: 1,
    blurb: 'Three beats in a bar: strong, light, light.',
    how: 'Count "ONE two three". Give beat 1 the weight, ideally on the bass strings, and play 2 and 3 softly on the higher strings.',
    mistake: 'Adding a fourth beat out of habit. A waltz turns around every three.',
    chord: 'C',
  },
  {
    id: 'waltz-roll',
    name: 'Waltz with upstrokes',
    meter: '3/4',
    grid: 'eighth',
    slots: 'a-ssss',
    written: 'D> . D U D U',
    count: '1 2 & 3 &',
    bpm: 92,
    level: 2,
    blurb: 'Strong, then two quick down-ups.',
    how: 'Beat 1 rings on its own; beats 2 and 3 each get a down-up. "ONE, two-and three-and".',
    mistake: 'Making all five strums equally loud. The first one leads, the rest follow.',
    chord: 'G',
  },
  {
    id: 'six-eight',
    name: 'Six-eight downstrokes',
    meter: '6/8',
    grid: 'sixteenth',
    slots: 'a-s-s-a-s-s-',
    written: 'D> . D . D . D> . D . D .',
    count: '1 2 3 4 5 6',
    bpm: 56,
    level: 2,
    blurb: 'Six strums in two groups of three.',
    how: 'Count "ONE two three FOUR five six" and lean on 1 and 4. It sways in two, where a waltz steps in three.',
    mistake: 'Accenting every other strum, which turns it into 3/4. The weight falls on 1 and 4 only.',
    chord: 'Am',
  },
  {
    id: 'six-eight-roll',
    name: 'Six-eight ballad',
    meter: '6/8',
    grid: 'sixteenth',
    slots: 'a-ssssa-ssss',
    written: 'D> . D U D U D> . D U D U',
    count: '1 2 & 3 & 4 5 & 6 &',
    bpm: 54,
    level: 3,
    blurb: 'Down, down-up-down-up, twice per bar.',
    how: 'Each half of the bar opens with a strong downstroke, then rolls through two down-ups. Slow and wide: this is the sway of a slow ballad.',
    mistake: 'Rushing the roll. The four quick strums take exactly as long as two counts.',
    chord: 'Em',
  },
] satisfies Def[]).map((p) => ({ ...p }));

/** A library pattern by id. */
export function strumPattern(id: string): StrumPattern | null {
  return STRUM_PATTERNS.find((p) => p.id === id) ?? null;
}

/** Meters the builder offers. */
export const BUILDER_METERS = ['4/4', '3/4', '6/8'] as const;

const METER_CODE: Record<string, string> = { '4/4': '44', '3/4': '34', '6/8': '68' };
const CODE_METER: Record<string, string> = { '44': '4/4', '34': '3/4', '68': '6/8' };
const GRID_CODE: Record<StrumGrid, string> = { eighth: 'e', sixteenth: 's', swing: 'w' };
const CODE_GRID: Record<string, StrumGrid> = { e: 'eighth', s: 'sixteenth', w: 'swing' };

/** True when a meter and grid can be combined (6/8 keeps to sixteenths so beat 4 stays a downstroke). */
export function gridAllowed(meter: string, grid: StrumGrid): boolean {
  if (!METER_CODE[meter]) return false;
  if (meter === '6/8') return grid === 'sixteenth';
  return true;
}

/** An empty-handed starting point for the builder: every beat a downstroke. */
export function blankSlots(meter: string, grid: StrumGrid): string {
  const info = meterInfo(meter);
  const step = slotTicks(grid);
  let out = '';
  for (let tick = 0; tick < info.barTicks; tick += step) out += info.beatStarts.includes(tick) || (info.compound && tick % (PPQ / 2) === 0) ? 's' : '-';
  return out;
}

/** The route-safe code of a custom pattern: `my-44-e-sossosss` (o = ghost). */
export function encodeCustom(meter: string, grid: StrumGrid, slots: string): string {
  return `my-${METER_CODE[meter] ?? '44'}-${GRID_CODE[grid]}-${slots.replace(/-/g, 'o')}`;
}

/**
 * A pattern object for slots made in the builder. The slots must fill the bar; they may all be
 * ghosts (an empty draft), which `decodeCustom` does not accept as a pattern to practise.
 */
export function customPattern(meter: string, grid: StrumGrid, slots: string): StrumPattern {
  const base = { meter, grid, slots };
  return {
    id: encodeCustom(meter, grid, slots),
    name: 'My pattern',
    ...base,
    written: patternArrows(base),
    count: patternCount(base),
    bpm: meter === '6/8' ? 56 : grid === 'sixteenth' ? 70 : 84,
    level: 3,
    blurb: 'A pattern you built.',
    how: 'Your own pattern. The arrows follow the same rule as every other: down on the even slots, up on the odd ones, and the hand never stops.',
    mistake: 'If it feels awkward, slow down and watch the ghost strokes. They are what keeps the real ones in place.',
    chord: 'G',
    custom: true,
  };
}

/** Read a custom pattern code. Null when the code is not one, does not fill its bar, or has no strum in it. */
export function decodeCustom(code: string): StrumPattern | null {
  const m = /^my-(44|34|68)-([esw])-([saxo]+)$/.exec(code);
  if (!m) return null;
  const meter = CODE_METER[m[1]];
  const grid = CODE_GRID[m[2]];
  const slots = m[3].replace(/o/g, '-');
  if (!gridAllowed(meter, grid) || slots.length !== slotsPerBar(meter, grid)) return null;
  if (![...slots].some((ch) => ch !== '-')) return null;
  return customPattern(meter, grid, slots);
}

/** Change one slot of a slots string. */
export function setSlot(slots: string, index: number, kind: StrokeKind): string {
  if (index < 0 || index >= slots.length) return slots;
  return slots.slice(0, index) + CODE_OF[kind] + slots.slice(index + 1);
}

/** The kind a slot moves to when tapped in the builder: strum, accent, muted, ghost, and round again. */
export function nextKind(kind: StrokeKind): StrokeKind {
  return kind === 'ghost' ? 'strum' : kind === 'strum' ? 'accent' : kind === 'accent' ? 'mute' : 'ghost';
}

/** The kind held by a slot character. */
export function kindOf(code: string): StrokeKind {
  return KIND_OF[code] ?? 'ghost';
}

/** A pattern from the library or from a custom code. */
export function resolvePattern(id: string): StrumPattern | null {
  return strumPattern(id) ?? decodeCustom(id);
}
