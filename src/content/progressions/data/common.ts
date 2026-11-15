/**
 * Shared building blocks for the progression data files: feels, scale tips and the strumming
 * advice that many progressions share. Keeping them here keeps the wording consistent.
 */
import type { BackingStyleId } from '@/core/audio';
import type { Meter, ProgressionFeel, ScaleTip } from '../types';

const METER: Record<BackingStyleId, Meter> = {
  'pop-rock': '4/4', ballad: '4/4', 'ballad-68': '6/8', 'blues-shuffle': '4/4', 'slow-blues': '12/8',
  funk: '4/4', reggae: '4/4', bossa: '4/4', 'jazz-swing': '4/4', country: '4/4', folk: '4/4',
  metal: '4/4', latin: '4/4', waltz: '3/4',
};

/** A feel: backing style id and tempo range (felt beats per minute); the meter follows the style. */
export function feel(backing: BackingStyleId, slow: number, fast: number): ProgressionFeel {
  return { backing, tempo: [slow, fast], meter: METER[backing] };
}

/** A soloing scale on a degree of the key. */
export function sc(degree: string, scale: string): ScaleTip {
  return { degree, scale };
}

/** Repeat a chart token for `n` bars: `bars('i7', 3)` -> `'i7 | i7 | i7'`. */
export function bars(token: string, n: number): string {
  return Array.from({ length: n }, () => token).join(' | ');
}

/** Strumming and comping advice shared across many progressions. */
export const STRUM = {
  campfire:
    'Start with four down-strums a bar. When the changes are smooth, play the campfire pattern: down, down-up, up, down-up (D DU UDU), with the hand moving down and up in steady eighths even when it misses the strings.',
  downs:
    'Four steady down-strums a bar, a little heavier on beats 2 and 4. Change chord on the last strum of the bar if you need a moment: a late change sounds worse than a short gap.',
  rock:
    'Driving down-strums in eighth notes, eight per bar, with the side of your picking hand resting lightly on the strings near the bridge for a tight, chunky sound. Lift the mute to let the last chord of a phrase ring.',
  power:
    'Power chords (root and fifth on the low strings), down-picked in eighths. Mute the strings you are not playing with the underside of the fretting fingers so only two or three strings sound.',
  shuffle:
    'Shuffle: each beat is long-short, like "hump-ty dump-ty". Play the boogie pattern on the two lowest strings of each chord: root and fifth for one beat, root and sixth for the next, two shuffled strums on each.',
  slowBlues:
    'Count four slow beats, each split into three (1-trip-let 2-trip-let ...). Strum the chord on beat 1 and let it ring, then fill the rest of the bar with single notes, or play soft down-strums on all twelve triplets.',
  ballad:
    'Pick each chord as an arpeggio, one string per eighth note: bass note first, then up through the higher strings. Or strum once per chord and let it ring; leave space.',
  ballad68:
    'Count 1-2-3-4-5-6 with the weight on 1 and 4. Strum down on 1 and 4, and fill between with light down-up-down, or arpeggiate six notes per bar from the bass up.',
  funk:
    'Sixteenth-note scratch: the picking hand moves down-up four times per beat without stopping, the fretting hand presses only when you want a chord to sound. Let short chord stabs through on beat 1 and a couple of off-beats; mute the rest.',
  reggae:
    'The skank: a short, choked chord on beats 2 and 4 only, cut off at once by relaxing the fretting hand so it sounds like "chk". Nothing on beats 1 and 3: the bass and drums own them.',
  ska:
    'Up-strokes on every off-beat (the "and" between the beats), short and bright, fretting hand releasing straight after each chop. The space on the beats is the groove.',
  bossa:
    'Thumb plays the root on beat 1 and the fifth on beat 3, steady and soft. The fingers pluck the upper three or four strings together in a syncopated pattern that lands between the beats.',
  swing:
    'Four short down-strums a bar on the middle strings, using three-note shapes (root, third and seventh), the second and fourth a touch heavier. Keep them crisp: let go of the chord just before the next strum.',
  country:
    'Boom-chick: pick the root on beat 1, strum the treble strings on 2, pick the fifth on 3, strum on 4. Alternating the bass between root and fifth is what makes it walk.',
  folk:
    'Thumb on the bass note on beats 1 and 3, a light brush of the treble strings on 2 and 4. Or fingerpick: thumb alternating between two bass strings, a finger filling in on the off-beats.',
  waltz:
    'Oom-pah-pah: pick the bass note on beat 1, then two light strums of the treble strings on beats 2 and 3.',
  latin:
    'Short, light chops between the beats, as a piano montuno would play them, while the bass and the clave keep the time. Mute every chord straight after you hit it.',
  rasgueado:
    'A rasgueado: flick the fingers out across the strings one after another, little finger first, for a rolling strum, and accent the arrival chord. Simpler start: a strong down-strum on beat 1 and light ones after.',
  fingerstyle:
    'Fingerpick: thumb on the bass note (the slash note when the chart has one), fingers on the upper strings in an even pattern such as thumb, index, middle, ring.',
  gospel:
    'One strum per chord, letting each ring, with the bass note of every chord clearly on top of the beat. Small up-strums on 2 and 4 keep it moving.',
  vamp:
    'One chord, so the rhythm is everything: pick one tight two-bar strumming pattern and repeat it exactly, leaving rests so the groove can breathe.',
} as const;
