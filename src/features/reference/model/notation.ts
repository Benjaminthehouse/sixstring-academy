/**
 * The notation and tab cheat sheet. Lengths and time signatures come from the theory engine's
 * rhythm module; the signs (repeats, dynamics, articulation) and the tab techniques are authored
 * here, each tab technique with a one-bar SixTab example that the tests parse and check.
 */
import { durationTicks, noteValue, parseTimeSignature, PPQ, type NoteValueId } from '@/core/theory';

/** The note values on the sheet, longest first. */
export const NOTE_VALUE_IDS = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as const satisfies readonly NoteValueId[];

/** VexFlow duration codes for `NotationView`. */
const VEX: Record<(typeof NOTE_VALUE_IDS)[number], 'w' | 'h' | 'q' | '8' | '16'> = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', sixteenth: '16' };

/** One note value: its names, its length in 4/4 and its rest. */
export interface NoteValueRow {
  id: (typeof NOTE_VALUE_IDS)[number];
  /** American name (`quarter note`). */
  name: string;
  /** British name (`crotchet`). */
  british: string;
  restName: string;
  /** Beats in 4/4 (a quarter note gets the beat). */
  beats: number;
  /** How many fill a 4/4 bar. */
  perBar: number;
  /** Duration code for the staff drawing. */
  vex: 'w' | 'h' | 'q' | '8' | '16';
}

/** The five everyday note values. */
export function noteValueRows(): NoteValueRow[] {
  return NOTE_VALUE_IDS.map((id) => {
    const v = noteValue(id)!;
    return { id, name: v.name, british: v.british, restName: v.restName, beats: v.ticks / PPQ, perBar: (4 * PPQ) / v.ticks, vex: VEX[id] };
  });
}

/** "4 beats", "1 beat", "½ beat", "¼ beat", "1½ beats". */
export function beatsWords(beats: number): string {
  const whole = Math.floor(beats);
  const frac = beats - whole;
  const fracText = frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : frac > 0 ? String(Number(frac.toFixed(3))).replace(/^0/, '') : '';
  const text = whole === 0 ? fracText : `${whole}${fracText}`;
  return `${text} beat${beats === 1 || beats < 1 ? '' : 's'}`;
}

/** A dotted or tied length worked out. */
export interface LengthExample {
  id: string;
  name: string;
  /** What it adds up to, in words. */
  sum: string;
  beats: number;
  /** For the staff: VexFlow-style notes. */
  notes: Array<{ duration: 'w' | 'h' | 'q' | '8' | '16'; dots?: number; tie?: boolean; triplet?: boolean; label?: string }>;
}

/** Dots, ties and triplets, each worked out in beats by the rhythm engine. */
export function lengthExamples(): LengthExample[] {
  const b = (ticks: number) => ticks / PPQ;
  const dh = b(durationTicks('half', { dots: 1 }));
  const dq = b(durationTicks('quarter', { dots: 1 }));
  const de = b(durationTicks('eighth', { dots: 1 }));
  const tie = b(durationTicks('half') + durationTicks('quarter'));
  const trip = b(3 * durationTicks('eighth', { tuplet: 3 }));
  return [
    { id: 'dotted-half', name: 'Dotted half note', sum: '2 + 1', beats: dh, notes: [{ duration: 'h', dots: 1, label: beatsWords(dh) }] },
    { id: 'dotted-quarter', name: 'Dotted quarter note', sum: '1 + ½', beats: dq, notes: [{ duration: 'q', dots: 1, label: beatsWords(dq) }] },
    { id: 'dotted-eighth', name: 'Dotted eighth note', sum: '½ + ¼', beats: de, notes: [{ duration: '8', dots: 1, label: beatsWords(de) }] },
    { id: 'tie', name: 'Tie', sum: '2 + 1, one sound', beats: tie, notes: [{ duration: 'h', tie: true, label: '2' }, { duration: 'q', label: '+1' }] },
    {
      id: 'triplet',
      name: 'Eighth-note triplet',
      sum: 'three in the time of two',
      beats: trip,
      notes: [
        { duration: '8', triplet: true, label: '1' },
        { duration: '8', triplet: true, label: 'trip' },
        { duration: '8', triplet: true, label: 'let' },
      ],
    },
  ];
}

/** A time signature explained. */
export interface TimeSignatureRow {
  id: string;
  /** As printed: `4/4`, `C`, `¢`. */
  text: string;
  /** Numerator and denominator drawn stacked (the C signs draw a letter instead). */
  top: string;
  bottom: string;
  symbol: 'common' | 'cut' | null;
  kind: 'simple' | 'compound' | 'odd';
  /** Beats you count (felt beats in compound time). */
  beats: number;
  meaning: string;
}

const TIME_IDS: Array<[string, string]> = [
  ['4-4', '4/4'],
  ['common-time', 'C'],
  ['3-4', '3/4'],
  ['2-4', '2/4'],
  ['cut-time', 'cut'],
  ['6-8', '6/8'],
  ['12-8', '12/8'],
  ['5-4', '5/4'],
  ['7-8', '7/8'],
];

const VALUE_BY_DENOMINATOR: Record<number, string> = { 1: 'whole note', 2: 'half note', 4: 'quarter note', 8: 'eighth note', 16: 'sixteenth note' };

/** The common time signatures with what they mean, from `parseTimeSignature`. */
export function timeSignatureRows(): TimeSignatureRow[] {
  return TIME_IDS.map(([id, text]) => {
    const ts = parseTimeSignature(text)!;
    const unit = VALUE_BY_DENOMINATOR[ts.denominator];
    let meaning: string;
    if (ts.kind === 'compound') meaning = `${ts.beats} beats in a bar, each a dotted quarter (three ${unit}s).`;
    else if (ts.kind === 'odd') meaning = `${ts.numerator} ${unit}s in a bar, grouped ${ts.grouping.join(' + ')}.`;
    else meaning = `${ts.numerator} beats in a bar, each a ${unit}.`;
    if (text === 'C') meaning = `Common time: the same as 4/4. ${meaning}`;
    if (text === 'cut') meaning = `Cut time: the same as 2/2. ${meaning}`;
    return {
      id,
      text: text === 'C' ? 'C' : text === 'cut' ? '¢' : text,
      top: String(ts.numerator),
      bottom: String(ts.denominator),
      symbol: text === 'C' ? 'common' : text === 'cut' ? 'cut' : null,
      kind: ts.kind,
      beats: ts.beats,
      meaning,
    };
  });
}

/** A drawn sign on the sheet (repeats, road signs, dynamics, articulation). */
export interface SignItem {
  id: string;
  name: string;
  /** What the glyph component draws. */
  glyph: string;
  meaning: string;
}

/** Repeats and road signs: how to find your way through the music. */
export const REPEAT_SIGNS: readonly SignItem[] = [
  { id: 'repeat-signs', name: 'Repeat signs', glyph: 'repeat', meaning: 'Play the bars between the two signs twice. With no start sign, go back to the beginning.' },
  { id: 'endings', name: 'First and second endings', glyph: 'endings', meaning: 'Play the 1. bracket the first time, skip it on the repeat and play the 2. bracket instead.' },
  { id: 'simile', name: 'Repeat the last bar', glyph: 'simile', meaning: 'Play the bar before this one again.' },
  { id: 'da-capo', name: 'D.C. (da capo)', glyph: 'dc', meaning: 'Go back to the beginning. D.C. al Fine: then stop at Fine.' },
  { id: 'dal-segno', name: 'D.S. (dal segno) and segno', glyph: 'segno', meaning: 'Go back to the sign (the segno, a slanted S with two dots) and play on from there.' },
  { id: 'coda', name: 'Coda', glyph: 'coda', meaning: 'At "to Coda", jump to the coda sign: the ending section.' },
  { id: 'fine', name: 'Fine', glyph: 'fine', meaning: 'The end, after a D.C. or D.S. sends you back.' },
  { id: 'double-bar', name: 'Double and final bar lines', glyph: 'barlines', meaning: 'A thin double line ends a section; a thin and a thick line end the piece.' },
];

/** Dynamics: how loud. */
export const DYNAMICS: readonly SignItem[] = [
  { id: 'pp', name: 'pp, pianissimo', glyph: 'pp', meaning: 'Very soft.' },
  { id: 'p', name: 'p, piano', glyph: 'p', meaning: 'Soft.' },
  { id: 'mp', name: 'mp, mezzo-piano', glyph: 'mp', meaning: 'Moderately soft.' },
  { id: 'mf', name: 'mf, mezzo-forte', glyph: 'mf', meaning: 'Moderately loud: the everyday level.' },
  { id: 'f', name: 'f, forte', glyph: 'f', meaning: 'Loud.' },
  { id: 'ff', name: 'ff, fortissimo', glyph: 'ff', meaning: 'Very loud.' },
  { id: 'crescendo', name: 'Crescendo (cresc.)', glyph: 'cresc', meaning: 'Get gradually louder over the opening wedge.' },
  { id: 'diminuendo', name: 'Diminuendo (dim., decresc.)', glyph: 'dim', meaning: 'Get gradually softer over the closing wedge.' },
  { id: 'sforzando', name: 'sfz, sforzando', glyph: 'sfz', meaning: 'A sudden strong accent on one note.' },
];

/** Articulation: how each note is attacked and released. */
export const ARTICULATIONS: readonly SignItem[] = [
  { id: 'staccato', name: 'Staccato', glyph: 'staccato', meaning: 'Short and detached: let go (or mute) the note early.' },
  { id: 'accent', name: 'Accent', glyph: 'accent', meaning: 'Play this note louder than the ones around it.' },
  { id: 'tenuto', name: 'Tenuto', glyph: 'tenuto', meaning: 'Hold the note for its full length, slightly leaned on.' },
  { id: 'marcato', name: 'Marcato', glyph: 'marcato', meaning: 'A strong, sharp accent.' },
  { id: 'fermata', name: 'Fermata', glyph: 'fermata', meaning: 'Hold the note longer than written, until it feels right to move on.' },
  { id: 'slur', name: 'Slur', glyph: 'slur', meaning: 'Play the notes smoothly connected; on guitar, often with hammer-ons and pull-offs.' },
];

/** A tab technique with the symbol you see and a bar you can hear. */
export interface TabTechnique {
  id: string;
  name: string;
  /** How it is written in tab (`h`, `b`, `P.M.`). */
  symbol: string;
  meaning: string;
  /** One bar of SixTab in 4/4. */
  tab: string;
  tempo: number;
}

/** Every tab technique symbol the app's tab shows, each with a playable example. */
export const TAB_TECHNIQUES: readonly TabTechnique[] = [
  { id: 'frets', name: 'Fret numbers', symbol: '0 1 3', meaning: 'Each line is a string, high E on top. The number is the fret; 0 is the open string.', tab: '| q 1:0 1:1 1:3 1:5 |', tempo: 90 },
  { id: 'chord-tab', name: 'Notes in a column', symbol: 'stacked', meaning: 'Numbers lined up vertically are played together: a chord.', tab: '| w (5:3 4:2 3:0 2:1 1:0) |', tempo: 80 },
  { id: 'hammer-on', name: 'Hammer-on', symbol: 'h', meaning: 'Pick the first note, then sound the higher one by hammering a finger down without picking.', tab: '| q 3:5 3:7h 3:5 3:7h |', tempo: 80 },
  { id: 'pull-off', name: 'Pull-off', symbol: 'p', meaning: 'Pick the higher note, then flick that finger off to sound the lower one already fretted.', tab: '| q 3:7 3:5p 3:7 3:5p |', tempo: 80 },
  { id: 'slide', name: 'Slide', symbol: '/ \\ s', meaning: 'Pick once and slide the same finger to the next fret, keeping pressure so it keeps ringing.', tab: '| q 3:5 3:7s 3:7 3:5s |', tempo: 80 },
  { id: 'slide-in-out', name: 'Slide in and out', symbol: '/7  7\\', meaning: 'Slide into a note from a few frets below or above, or slide away after it with no target.', tab: '| h /3:7 3:7\\ |', tempo: 80 },
  { id: 'bend', name: 'Bend', symbol: 'b, full', meaning: 'Push the string across the fret to raise the pitch: "full" is a whole step (two frets), as the second note shows.', tab: '| h 3:7b 3:9 |', tempo: 70 },
  { id: 'half-bend', name: 'Half bend', symbol: 'b, ½', meaning: 'Bend up a half step, the pitch of one fret higher.', tab: '| h 2:8b1 2:9 |', tempo: 70 },
  { id: 'bend-release', name: 'Bend and release', symbol: 'b r', meaning: 'Bend up, then let the string back down to the fretted pitch while it rings.', tab: '| h 3:7br 3:7 |', tempo: 70 },
  { id: 'pre-bend', name: 'Pre-bend', symbol: 'pre', meaning: 'Bend the string before you pick it, then release: the note starts high and falls.', tab: '| h 3:7br{pre} 3:7 |', tempo: 70 },
  { id: 'vibrato', name: 'Vibrato', symbol: '~', meaning: 'Shake the pitch slightly by rocking or bending the string back and forth.', tab: '| w 2:8~ |', tempo: 70 },
  { id: 'palm-mute', name: 'Palm mute', symbol: 'P.M.', meaning: 'Rest the edge of your picking hand on the strings by the bridge: a tight, chunky sound.', tab: '| e 6:0{pm} 6:0{pm} 6:0{pm} 6:0{pm} q 6:0{pm} 6:3 |', tempo: 100 },
  { id: 'let-ring', name: 'Let ring', symbol: 'let ring', meaning: 'Keep every note sounding into the next ones instead of lifting fingers.', tab: '| e 5:3{lr} 4:2{lr} 3:0{lr} 2:1{lr} h 1:0{lr} |', tempo: 80 },
  { id: 'dead-note', name: 'Dead note', symbol: 'x', meaning: 'Touch the string without pressing it down and pick: a percussive click with no pitch.', tab: '| e 6:x 6:x 6:0 6:x q 6:x 6:0 |', tempo: 100 },
  { id: 'ghost-note', name: 'Ghost note', symbol: '( )', meaning: 'A note in brackets is played very softly, almost felt more than heard.', tab: '| q 3:7 3:(7) 3:7 3:(7) |', tempo: 90 },
  { id: 'natural-harmonic', name: 'Natural harmonic', symbol: '<12>', meaning: 'Touch the string lightly right over the fret wire (12, 7 or 5) without pressing, pick, then lift: a bell tone.', tab: '| h 3:<12> 2:<12> |', tempo: 70 },
  { id: 'artificial-harmonic', name: 'Artificial harmonic', symbol: 'A.H.', meaning: 'Fret the note, then touch the string twelve frets higher with the picking hand and pluck: a bell an octave up.', tab: '| h 3:5{ah} 3:5 |', tempo: 70 },
  { id: 'tapping', name: 'Tapping', symbol: 'T', meaning: 'Hammer the note with a finger of the picking hand, then pull off to the fretting hand.', tab: '| e 1:12t 1:5p 1:8h 1:12t 1:5p 1:8h q r |', tempo: 90 },
  { id: 'tab-accent', name: 'Accent', symbol: '>', meaning: 'Pick this note harder than the others.', tab: '| q 6:0> 6:0 6:0> 6:0 |', tempo: 100 },
  { id: 'tab-staccato', name: 'Staccato', symbol: '·', meaning: 'Cut the note short by easing finger pressure right after picking.', tab: '| q 4:2{st} 4:2{st} h 4:2 |', tempo: 90 },
  { id: 'tab-tie', name: 'Tie', symbol: '(5)', meaning: 'A fret number in brackets after a tie is held from the note before, not picked again.', tab: '| h 3:5 3:- |', tempo: 80 },
  { id: 'strum-slashes', name: 'Rhythm slashes', symbol: '/ ↓ ↑', meaning: 'Slashes mean strum the chord written above in that rhythm; arrows say down or up.', tab: '| "G=320003" q D D U D |', tempo: 90 },
  { id: 'muted-strum', name: 'Muted strum', symbol: 'x slash', meaning: 'Strum with the fretting hand resting on the strings: a scratch instead of a chord.', tab: '| "Em=022000" q D X D X |', tempo: 90 },
  { id: 'pick-direction', name: 'Pick direction', symbol: '⊓ V', meaning: '⊓ is a downstroke (toward the floor), V an upstroke.', tab: '| e 1:0{dn} 1:0{up} 1:0{dn} 1:0{up} h r |', tempo: 90 },
];

/** Every item id on the sheet (for deep links and search). */
export function notationItemIds(): string[] {
  return [
    'note-values',
    'rests',
    ...lengthExamples().map((e) => e.id),
    ...timeSignatureRows().map((t) => t.id),
    ...REPEAT_SIGNS.map((s) => s.id),
    ...DYNAMICS.map((s) => s.id),
    ...ARTICULATIONS.map((s) => s.id),
    ...TAB_TECHNIQUES.map((t) => t.id),
  ];
}
