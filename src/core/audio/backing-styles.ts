/**
 * The backing band's style book: for each style a drum groove (with fills), a bass approach, a
 * comping rhythm for the keys and a rhythm-guitar part, written as step strings on a per-bar grid.
 *
 * Step characters
 *   drums   X accent · x normal · o ghost · . rest
 *   bass    R root · r root an octave up · 3 third · 5 fifth · v fifth below · 7 seventh (or octave)
 *           6 passing sixth (always followed by 5) · Q root, alternating with the fifth on repeats
 *           A approach to the next chord (root if the chord stays) · a approach (fifth if it stays)
 *           N next chord's root, anticipated · W walking-bass note · - hold · . rest
 *   keys    C chord · c soft chord · s short stab · 1-4 single chord note (arpeggio) · - hold · . rest
 *   guitar  D/d down-strum (loud/soft) · U/u up-strum · x dead strum · B bass note · P plucked chord
 *           M palm-muted chug · A accented open power chord · - hold · . rest
 *
 * These are original grooves in familiar idioms; nothing is transcribed from a recording.
 */
import type { DrumName } from './percussion';
import type { TimeSignature } from './timeline';
import type { BassTone, ToneName } from './tones';

/** The styles the backing band can play. */
export type BackingStyleId =
  | 'pop-rock'
  | 'ballad'
  | 'ballad-68'
  | 'blues-shuffle'
  | 'slow-blues'
  | 'funk'
  | 'reggae'
  | 'bossa'
  | 'jazz-swing'
  | 'country'
  | 'folk'
  | 'metal'
  | 'latin'
  | 'waltz';

/** One bar of drums: a step string per drum. */
export type DrumBar = Partial<Record<DrumName, string>>;

/** Everything that defines a style. */
export interface BackingStyle {
  id: BackingStyleId;
  name: string;
  /** One line for a style picker. */
  description: string;
  timeSignature: TimeSignature;
  /** Felt beats per bar (2 in 6/8, 4 in 12/8) and their length in ticks. Chords change on these. */
  beatsPerBar: number;
  beatTicks: number;
  /** Tempo in felt beats per minute: default and sensible range. */
  tempo: { default: number; min: number; max: number };
  /** How the eighth notes feel, for the UI (notation hints, strumming advice). */
  feel: 'straight' | 'swing' | 'shuffle' | 'triplet';
  /** Steps per bar of every pattern in this style. */
  grid: number;
  drums: DrumBar[];
  fills: DrumBar[];
  /** Overall drum loudness (ballads and folk are played softer). */
  drumLevel: number;
  /** Hit the bass drum together with the crash that opens a section (default true; false keeps beat one empty). */
  kickWithCrash?: boolean;
  bass: string[];
  /** Bass bar used instead when the next bar starts on a different chord. */
  bassTurn?: string;
  /** How often the turn bar is taken when it applies (default 1 = always). */
  bassTurnChance?: number;
  bassTone: BassTone;
  /** Mix level of the bass in this style (a gain, default 1). */
  bassLevel?: number;
  /** Note length as a fraction of the written length (0.5 = staccato). */
  bassGate: number;
  /** Start the very first bar on the root even if the pattern rests there. */
  bassRootFirst?: boolean;
  keys: string[];
  keysVoice: 'epiano' | 'organ';
  keysGate: number;
  /** `close` = full chord near middle C; `rootless` = thirds and sevenths (jazz); `power` = root + fifth. */
  keysVoicing: 'close' | 'rootless' | 'power';
  /** Mix level of the keys in this style (a gain, 1 = unchanged). */
  keysLevel: number;
  guitar: string[];
  guitarTone: ToneName;
  guitarGate: number;
  /** Mix level of the rhythm guitar in this style (default 1). */
  guitarLevel?: number;
  /** Count-in click. */
  countIn: DrumName;
}

const Q = 960;

/** The style book. */
export const BACKING_STYLES: Record<BackingStyleId, BackingStyle> = {
  'pop-rock': {
    id: 'pop-rock', name: 'Pop / Rock', description: 'Straight eighths, backbeat on 2 and 4, pumping bass.',
    timeSignature: { numerator: 4, denominator: 4 }, beatsPerBar: 4, beatTicks: Q,
    tempo: { default: 112, min: 70, max: 170 }, feel: 'straight', grid: 16,
    drums: [
      { hihatClosed: 'x.x.x.x.x.x.x.x.', snare: '....X.......X...', kick: 'X.......X.x.....' },
      { hihatClosed: 'x.x.x.x.x.x.x.x.', snare: '....X.......X...', kick: 'X.....x.X.x.....' },
    ],
    fills: [
      { hihatClosed: 'x.x.x.x.........', snare: '....X...xxxx....', tomHigh: '............xx..', tomLow: '..............xx', kick: 'X.......X...x...' },
      { hihatClosed: 'x.x.x.x.x.x.....', snare: '....X.......X.xx', kick: 'X.......X.x.....' },
    ],
    drumLevel: 1,
    bass: ['R.R.R.R.R.R.R.R.'], bassTurn: 'R.R.R.R.R.R.R.A.', bassTone: 'bass-finger', bassGate: 0.85,
    keys: ['C-----C-----c---'], keysVoice: 'epiano', keysGate: 0.9, keysVoicing: 'close', keysLevel: 0.6,
    guitar: ['D...D.U...U.D.U.'], guitarTone: 'steel', guitarGate: 1,
    countIn: 'sidestick',
  },
  ballad: {
    id: 'ballad', name: 'Slow ballad', description: 'Gentle eighths, cross-stick backbeat, broken chords.',
    timeSignature: { numerator: 4, denominator: 4 }, beatsPerBar: 4, beatTicks: Q,
    tempo: { default: 66, min: 48, max: 92 }, feel: 'straight', grid: 16,
    drums: [
      { hihatClosed: 'x.o.x.o.x.o.x.o.', sidestick: '....x.......x...', kick: 'X.........x.....' },
      { hihatClosed: 'x.o.x.o.x.o.x.o.', sidestick: '....x.......x...', kick: 'X.......x.x.....' },
    ],
    fills: [
      { hihatClosed: 'x.o.x.o.x.o.....', sidestick: '....x...........', tomHigh: '............x...', tomMid: '..............x.', kick: 'X.........x.....' },
    ],
    drumLevel: 0.88,
    bass: ['R-----R-5-----a-'], bassTone: 'bass-finger', bassGate: 0.95,
    keys: ['1-3-4-3-2-3-4-3-'], keysVoice: 'epiano', keysGate: 3, keysVoicing: 'close', keysLevel: 0.38,
    guitar: ['D...d.u.D...d.u.'], guitarTone: 'steel', guitarGate: 1,
    countIn: 'sidestick',
  },
  'ballad-68': {
    id: 'ballad-68', name: '6/8 ballad', description: 'Two slow beats of three: kick on 1, snare on 4.',
    timeSignature: { numerator: 6, denominator: 8 }, beatsPerBar: 2, beatTicks: Q * 1.5,
    tempo: { default: 56, min: 40, max: 84 }, feel: 'triplet', grid: 12,
    drums: [
      { hihatClosed: 'x.x.x.x.x.x.', snare: '......X.....', kick: 'X.........x.' },
      { hihatClosed: 'x.x.x.x.x.x.', snare: '......X.....', kick: 'X...x.....x.' },
    ],
    fills: [
      { hihatClosed: 'x.x.x.......', snare: '......X.....', tomHigh: '........x...', tomMid: '..........x.', kick: 'X...........' },
    ],
    drumLevel: 0.82,
    bass: ['R-----5---a-'], bassTone: 'bass-finger', bassGate: 0.95,
    keys: ['1-2-3-4-3-2-'], keysVoice: 'epiano', keysGate: 3, keysVoicing: 'close', keysLevel: 0.42,
    guitar: ['D...d.D.u.d.'], guitarTone: 'steel', guitarGate: 1, guitarLevel: 0.9,
    countIn: 'sidestick',
  },
  'blues-shuffle': {
    id: 'blues-shuffle', name: 'Blues shuffle', description: 'Swung eighths, boogie bass line, backbeat.',
    timeSignature: { numerator: 4, denominator: 4 }, beatsPerBar: 4, beatTicks: Q,
    tempo: { default: 108, min: 70, max: 152 }, feel: 'shuffle', grid: 12,
    drums: [
      { hihatClosed: 'x.xx.xx.xx.x', snare: '...X.....X..', kick: 'X.....x.....' },
      { hihatClosed: 'x.xx.xx.xx.x', snare: '...X.....X..', kick: 'X....xx.....' },
    ],
    fills: [
      { hihatClosed: 'x.xx.x......', snare: '...X..xx....', tomHigh: '........xx..', tomLow: '..........xx', kick: 'X...........' },
      { hihatClosed: 'x.xx.xx.x...', snare: '...X.....XxX', kick: 'X.....x.....' },
    ],
    drumLevel: 0.95,
    bass: ['R.R3.35.56.5'], bassTurn: 'R.R3.35.53.A', bassTone: 'bass-finger', bassGate: 0.9,
    keys: ['C----c------'], keysVoice: 'organ', keysGate: 0.85, keysVoicing: 'close', keysLevel: 1.3,
    guitar: ['D.uD.uD.uD.u'], guitarTone: 'clean', guitarGate: 0.8, guitarLevel: 0.56,
    countIn: 'sidestick',
  },
  'slow-blues': {
    id: 'slow-blues', name: 'Slow blues 12/8', description: 'Four slow beats, each split in three.',
    timeSignature: { numerator: 12, denominator: 8 }, beatsPerBar: 4, beatTicks: Q * 1.5,
    tempo: { default: 60, min: 44, max: 84 }, feel: 'triplet', grid: 12,
    drums: [
      { hihatClosed: 'XxxXxxXxxXxx', snare: '...X.....X..', kick: 'X.....X....x' },
      { hihatClosed: 'XxxXxxXxxXxx', snare: '...X.....X..', kick: 'X....xX.....' },
    ],
    fills: [
      { hihatClosed: 'XxxXxx......', snare: '...X..xxx...', tomHigh: '.........xx.', tomLow: '...........x', kick: 'X.....X.....' },
    ],
    drumLevel: 0.85,
    bass: ['R--R-R5--3-a'], bassTone: 'bass-finger', bassGate: 0.92,
    keys: ['C--ccc---ccc'], keysVoice: 'epiano', keysGate: 0.8, keysVoicing: 'close', keysLevel: 0.65,
    guitar: ['D..d.uD..d.u'], guitarTone: 'clean', guitarGate: 0.9, guitarLevel: 0.63,
    countIn: 'sidestick',
  },
  funk: {
    id: 'funk', name: 'Funk', description: 'Sixteenth-note groove: syncopated kick, ghost notes, tight bass.',
    timeSignature: { numerator: 4, denominator: 4 }, beatsPerBar: 4, beatTicks: Q,
    tempo: { default: 100, min: 80, max: 124 }, feel: 'straight', grid: 16,
    drums: [
      { hihatClosed: 'x.x.x.x.x.x.x...', hihatOpen: '..............x.', snare: '....X..o.o..X..o', kick: 'X..x......x..x..' },
      { hihatClosed: 'x.x.x.x.x.x.x.x.', snare: '....X..o.o..X...', kick: 'X..x..x...x.....' },
    ],
    fills: [
      { hihatClosed: 'x.x.x.x.x.x.....', snare: '....X..o.o..x.xx', tomHigh: '.............x..', kick: 'X..x......x.....' },
    ],
    drumLevel: 1,
    bass: ['R..R..r.....R.ra'], bassTone: 'bass-finger', bassLevel: 1.4, bassGate: 0.55,
    keys: ['..s...s..s....s.'], keysVoice: 'epiano', keysGate: 0.5, keysVoicing: 'close', keysLevel: 1.2,
    guitar: ['D.xU.xD.xUxU.xUx'], guitarTone: 'clean', guitarGate: 0.35, guitarLevel: 1.0,
    countIn: 'sidestick',
  },
  reggae: {
    id: 'reggae', name: 'Reggae one-drop', description: 'Kick and rim together on 3, chords chopped on the off-beats.',
    timeSignature: { numerator: 4, denominator: 4 }, beatsPerBar: 4, beatTicks: Q,
    tempo: { default: 76, min: 60, max: 92 }, feel: 'straight', grid: 16,
    drums: [
      { hihatClosed: 'x.X.x.X.x.X.x.X.', kick: '........X.......', sidestick: '........X.......' },
      { hihatClosed: 'x.X.x.X.x.X.x.X.', kick: '........X.......', sidestick: '........X.....o.' },
    ],
    fills: [
      { hihatClosed: 'x.X.x.X.x.X.....', kick: '........X.......', sidestick: '........X.......', tomHigh: '............x...', snare: '.............x.x', tomMid: '..............x.' },
    ],
    drumLevel: 1, kickWithCrash: false,
    bass: ['....R.R.5...3...'], bassTurn: '....R.R.5...A...', bassTone: 'bass-finger', bassLevel: 1.5, bassGate: 0.8,
    keys: ['..s...s...s...s.'], keysVoice: 'organ', keysGate: 0.45, keysVoicing: 'close', keysLevel: 2.4,
    guitar: ['..U...U...U...U.'], guitarTone: 'clean', guitarGate: 0.25, guitarLevel: 1.1,
    countIn: 'sidestick',
  },
  bossa: {
    id: 'bossa', name: 'Bossa nova', description: 'Even eighths, two-bar rim clave, root-and-fifth bass.',
    timeSignature: { numerator: 4, denominator: 4 }, beatsPerBar: 4, beatTicks: Q,
    tempo: { default: 126, min: 96, max: 152 }, feel: 'straight', grid: 16,
    drums: [
      { hihatClosed: 'x.x.x.x.x.x.x.x.', kick: 'X.....x.X.....x.', sidestick: 'x.....x.....x...' },
      { hihatClosed: 'x.x.x.x.x.x.x.x.', kick: 'X.....x.X.....x.', sidestick: '....x.....x.....' },
    ],
    fills: [
      { hihatClosed: 'x.x.x.x.x.x.x.x.', kick: 'X.....x.X.....x.', sidestick: '....x.....x.x.x.' },
    ],
    drumLevel: 0.72,
    bass: ['R-----5-5-----N-'], bassTone: 'bass-upright', bassGate: 0.9,
    keys: ['s.....s...s.....', '..s...s.....s...'], keysVoice: 'epiano', keysGate: 0.6, keysVoicing: 'rootless', keysLevel: 1.15,
    guitar: ['B.P...P.B...P.P.', 'B...P.P.B.P...P.'], guitarTone: 'nylon', guitarGate: 0.7, guitarLevel: 0.85,
    countIn: 'sidestick',
  },
  'jazz-swing': {
    id: 'jazz-swing', name: 'Jazz swing', description: 'Ride cymbal, hi-hat on 2 and 4, walking bass.',
    timeSignature: { numerator: 4, denominator: 4 }, beatsPerBar: 4, beatTicks: Q,
    tempo: { default: 132, min: 90, max: 220 }, feel: 'swing', grid: 12,
    drums: [
      { ride: 'x..x.xx..x.x', hihatPedal: '...x.....x..', kick: 'o..o..o..o..' },
      { ride: 'x..x.xx..x.x', hihatPedal: '...x.....x..', kick: 'o..o..o..o..', snare: '.....o......' },
    ],
    fills: [
      { ride: 'x..x.x......', hihatPedal: '...x........', kick: 'o..o........', snare: '......x.xx.X' },
    ],
    drumLevel: 0.95,
    bass: ['W..W..W..W..'], bassTone: 'bass-upright', bassGate: 0.92,
    keys: ['s....C------', '..s......c--'], keysVoice: 'epiano', keysGate: 0.7, keysVoicing: 'rootless', keysLevel: 0.8,
    guitar: ['d..D..d..D..'], guitarTone: 'clean', guitarGate: 0.45, guitarLevel: 0.6,
    countIn: 'hihatPedal',
  },
  country: {
    id: 'country', name: 'Country train beat', description: 'Snare shuffling like a train, alternating root-fifth bass.',
    timeSignature: { numerator: 4, denominator: 4 }, beatsPerBar: 4, beatTicks: Q,
    tempo: { default: 116, min: 88, max: 152 }, feel: 'straight', grid: 16,
    drums: [
      { snare: 'o.ooX.ooo.ooX.oo', kick: 'X.......X.......', hihatPedal: '....x.......x...' },
    ],
    fills: [
      { snare: 'o.ooX.ooo.ooXxXx', kick: 'X.......X.....x.', hihatPedal: '....x...........' },
    ],
    drumLevel: 0.82,
    bass: ['R.......v.......'], bassTurn: 'R.......v...A...', bassTurnChance: 0.7, bassTone: 'bass-finger', bassLevel: 1.6, bassGate: 0.7,
    keys: ['....s.......s...'], keysVoice: 'epiano', keysGate: 0.5, keysVoicing: 'close', keysLevel: 1.5,
    guitar: ['B...D.U.B...D.U.'], guitarTone: 'steel', guitarGate: 0.9, guitarLevel: 0.85,
    countIn: 'sidestick',
  },
  folk: {
    id: 'folk', name: 'Folk strum', description: 'Light and open: shaker, soft kick, two bass notes a bar.',
    timeSignature: { numerator: 4, denominator: 4 }, beatsPerBar: 4, beatTicks: Q,
    tempo: { default: 100, min: 68, max: 144 }, feel: 'straight', grid: 16,
    drums: [
      { shaker: 'x.o.x.o.x.o.x.o.', kick: 'X.......x.......', sidestick: '....x.......x...' },
      { shaker: 'x.o.x.o.x.o.x.o.', kick: 'X.......x.x.....', sidestick: '....x.......x...' },
    ],
    fills: [
      { shaker: 'x.o.x.o.x.o.x.o.', kick: 'X.......x.......', sidestick: '....x.......x.x.', tambourine: '............x.x.' },
    ],
    drumLevel: 0.85,
    bass: ['R-------5-------'], bassTurn: 'R-------5---A---', bassTurnChance: 0.6, bassTone: 'bass-upright', bassLevel: 1.25, bassGate: 0.9,
    keys: ['c---------------'], keysVoice: 'organ', keysGate: 1, keysVoicing: 'close', keysLevel: 1.0,
    guitar: ['D...D.U.d.U.D.U.'], guitarTone: 'steel', guitarGate: 1, guitarLevel: 0.63,
    countIn: 'sidestick',
  },
  metal: {
    id: 'metal', name: 'Metal / driving eighths', description: 'Relentless eighths on kick and bass, palm-muted chugs.',
    timeSignature: { numerator: 4, denominator: 4 }, beatsPerBar: 4, beatTicks: Q,
    tempo: { default: 150, min: 108, max: 200 }, feel: 'straight', grid: 16,
    drums: [
      { hihatClosed: 'X...X...X...X...', snare: '....X.......X...', kick: 'X.x.X.x.X.x.X.x.' },
      { hihatClosed: 'X...X...X...X...', snare: '....X.......X...', kick: 'X.x.X.xxX.x.X.x.' },
    ],
    fills: [
      { hihatClosed: 'X...X...........', snare: '....X...XxXx....', tomHigh: '............Xx..', tomLow: '..............Xx', kick: 'X.x.X.x.x.x.x.x.' },
    ],
    drumLevel: 0.76,
    bass: ['R.R.R.R.R.R.R.R.'], bassTurn: 'R.R.R.R.R.R.R.A.', bassTone: 'bass-pick', bassLevel: 1.4, bassGate: 0.8,
    keys: ['c---------------'], keysVoice: 'organ', keysGate: 1, keysVoicing: 'power', keysLevel: 0.65,
    guitar: ['A.M.M.A.M.M.A.M.'], guitarTone: 'driven', guitarGate: 0.9, guitarLevel: 1.25,
    countIn: 'hihatClosed',
  },
  latin: {
    id: 'latin', name: 'Latin (songo-lite)', description: 'Cowbell pulse, two-bar clave, bass that leans into the next bar.',
    timeSignature: { numerator: 4, denominator: 4 }, beatsPerBar: 4, beatTicks: Q,
    tempo: { default: 100, min: 84, max: 126 }, feel: 'straight', grid: 16,
    drums: [
      { cowbell: 'x...x...x...x...', hihatClosed: '..x...x...x...x.', kick: '......x.....x...', sidestick: '....x...x.......', tomLow: '..............x.' },
      { cowbell: 'x...x...x...x...', hihatClosed: '..x...x...x...x.', kick: '......x.....x...', sidestick: 'x.....x.....x...' },
    ],
    fills: [
      { cowbell: 'x...x...........', kick: '......x.........', snare: '......x......x..', tomHigh: '........x.x.....', tomMid: '............x...', tomLow: '..............x.' },
    ],
    drumLevel: 0.9,
    bass: ['......5.....N---'], bassTone: 'bass-finger', bassLevel: 1.2, bassGate: 0.9, bassRootFirst: true,
    keys: ['s..s..s...s.s...', '..s..s..s...s.s.'], keysVoice: 'epiano', keysGate: 0.5, keysVoicing: 'close', keysLevel: 0.9,
    guitar: ['..P...P...P...P.'], guitarTone: 'nylon', guitarGate: 0.5, guitarLevel: 1.15,
    countIn: 'sidestick',
  },
  waltz: {
    id: 'waltz', name: 'Waltz 3/4', description: 'One strong beat and two light ones: bass, chord, chord.',
    timeSignature: { numerator: 3, denominator: 4 }, beatsPerBar: 3, beatTicks: Q,
    tempo: { default: 110, min: 70, max: 180 }, feel: 'straight', grid: 12,
    drums: [
      { kick: 'X...........', hihatClosed: '....x...x...' },
      { kick: 'X...........', hihatClosed: '....x...x...', sidestick: '........o...' },
    ],
    fills: [
      { kick: 'X...........', hihatClosed: '....x.......', snare: '........x.xx' },
    ],
    drumLevel: 0.92,
    bass: ['Q-------....'], bassTurn: 'Q-----..A---', bassTurnChance: 0.4, bassTone: 'bass-upright', bassLevel: 1.5, bassGate: 0.9,
    keys: ['....s...s...'], keysVoice: 'epiano', keysGate: 0.6, keysVoicing: 'close', keysLevel: 1.3,
    guitar: ['B...d...d...'], guitarTone: 'steel', guitarGate: 0.9, guitarLevel: 0.8,
    countIn: 'sidestick',
  },
};

/** Style ids in menu order. */
export const BACKING_STYLE_IDS = Object.keys(BACKING_STYLES) as BackingStyleId[];
