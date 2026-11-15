/**
 * The curated chord shapes: the grips every guitarist learns, with their standard fingerings.
 *
 * Only what cannot be computed is typed here: which frets, which fingers, what the shape is
 * called. Everything is written for standard tuning, strings low to high (`x` = muted), and the
 * tests check every entry against the theory engine in all twelve keys: the notes must be exactly
 * the chord the entry claims, and the fingering must be physically possible.
 *
 * Fingers: 1 index, 2 middle, 3 ring, 4 little, 0 open. The same finger on several strings is a barre.
 */
import type { CagedShape } from './types';
import type { VoicingCategory } from './voicing';

/** An open-position chord: it only exists where it is written. */
export interface OpenShape {
  /** Chord symbol, with a slash bass where the lowest note is not the root. */
  chord: string;
  frets: string;
  fingers: string;
}

function open(chord: string, frets: string, fingers: string): OpenShape {
  return { chord, frets, fingers };
}

/** Open-position chords in teaching order: the first chords, then sevenths, colours and slash chords. */
export const OPEN_SHAPES: readonly OpenShape[] = [
  // Major and minor
  open('C', 'x32010', 'x32010'),
  open('A', 'x02220', 'x01230'),
  open('G', '320003', '210003'),
  open('G', '320033', '210034'),
  open('E', '022100', '023100'),
  open('D', 'xx0232', 'xx0132'),
  open('F', 'xx3211', 'xx3211'),
  open('Am', 'x02210', 'x02310'),
  open('Em', '022000', '023000'),
  open('Dm', 'xx0231', 'xx0231'),
  // Dominant sevenths
  open('A7', 'x02020', 'x02030'),
  open('B7', 'x21202', 'x21304'),
  open('C7', 'x32310', 'x32410'),
  open('D7', 'xx0212', 'xx0213'),
  open('E7', '020100', '020100'),
  open('E7', '022130', '023140'),
  open('G7', '320001', '320001'),
  // Major sevenths
  open('Cmaj7', 'x32000', 'x32000'),
  open('Amaj7', 'x02120', 'x02130'),
  open('Dmaj7', 'xx0222', 'xx0111'),
  open('Emaj7', '021100', '031200'),
  open('Fmaj7', 'xx3210', 'xx3210'),
  open('Gmaj7', '320002', '320001'),
  // Minor sevenths
  open('Am7', 'x02010', 'x02010'),
  open('Em7', '020000', '020000'),
  open('Em7', '022030', '023040'),
  open('Dm7', 'xx0211', 'xx0211'),
  open('Bm7', 'x20202', 'x10203'),
  // Suspended
  open('Asus2', 'x02200', 'x01200'),
  open('Asus4', 'x02230', 'x01230'),
  open('Dsus2', 'xx0230', 'xx0130'),
  open('Dsus4', 'xx0233', 'xx0134'),
  open('Esus4', '022200', '023400'),
  open('Gsus4', '330013', '230014'),
  open('Csus2', 'x30013', 'x30014'),
  open('Csus4', 'x3301x', 'x3401x'),
  open('Fsus2', 'xx3011', 'xx3011'),
  open('A7sus4', 'x02030', 'x02030'),
  open('D7sus4', 'xx0213', 'xx0213'),
  open('E7sus4', '020200', '020300'),
  // Added notes and sixths
  open('Cadd9', 'x32030', 'x21030'),
  open('Cadd9', 'x32033', 'x21034'),
  open('Eadd9', '022102', '023104'),
  open('Aadd9', 'x02420', 'x01420'),
  open('Fadd9', 'xx3213', 'xx3214'),
  open('Emadd9', '024000', '013000'),
  open('Amadd9', 'x02410', 'x02410'),
  open('A6', 'x02222', 'x01111'),
  open('D6', 'xx0202', 'xx0102'),
  open('E6', '022120', '023140'),
  open('G6', '320000', '210000'),
  open('Am6', 'x02212', 'x02314'),
  open('Em6', '022020', '012030'),
  open('Dm6', 'xx0201', 'xx0201'),
  // Open power chords
  open('E5', '02xxxx', '01xxxx'),
  open('E5', '022xxx', '012xxx'),
  open('A5', 'x02xxx', 'x01xxx'),
  open('A5', 'x022xx', 'x012xx'),
  open('D5', 'xx02xx', 'xx01xx'),
  open('D5', 'xx023x', 'xx013x'),
  // Slash chords
  open('D/F#', '200232', '100243'),
  open('C/G', '332010', '342010'),
  open('C/E', '032010', '032010'),
  open('G/B', 'x20003', 'x10003'),
  open('G/D', 'xx0003', 'xx0003'),
  open('D/A', 'x00232', 'x00132'),
  open('F/C', 'x33211', 'x34211'),
  open('Am/G', '302210', '402310'),
  open('Cmaj7/B', 'x22010', 'x23010'),
];

/** A shape with no open strings: it slides to any root. */
export interface MovableShape {
  /** Stable id: `barre-e-major`, `shell-6-m7`. */
  id: string;
  /** Chord type id from the theory catalog. */
  type: string;
  /** Root of the shape as written below. */
  root: string;
  frets: string;
  fingers: string;
  category: VoicingCategory;
  /** CAGED shape it comes from, if any. */
  shape: CagedShape | null;
  /** String that carries the root. */
  rootString: number;
  /** What the shape is called; the fret is added when it is placed. */
  name: string;
}

function movable(
  category: VoicingCategory, name: string, shape: CagedShape | null, rootString: number, root: string,
  rows: Array<[type: string, frets: string, fingers: string]>,
): MovableShape[] {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return rows.map(([type, frets, fingers], i) => {
    const repeat = rows.slice(0, i).filter((r) => r[0] === type).length;
    return { id: `${slug}-${type}${repeat ? `-${repeat + 1}` : ''}`, type, root, frets, fingers, category, shape, rootString, name };
  });
}

/** Movable shapes in teaching order: barre chords, the other CAGED forms, power chords, shells, jazz grips. */
export const MOVABLE_SHAPES: readonly MovableShape[] = [
  ...movable('barre', 'E-shape barre', 'E', 6, 'F', [
    ['major', '133211', '134211'],
    ['minor', '133111', '134111'],
    ['7', '131211', '131211'],
    ['m7', '131111', '131111'],
    ['maj7', '132211', '142311'],
    ['sus4', '133311', '123411'],
    ['7sus4', '131311', '131411'],
    ['9', '131213', '131214'],
    ['m9', '131113', '131114'],
    ['mmaj7', '132111', '132111'],
    ['m6', '133131', '123141'],
    ['13', '131231', '131241'],
    ['7sharp5', '1x1221', '1x1231'],
    ['aug', '1x3221', '1x4231'],
    ['m7add11', '111111', '111111'],
  ]),
  ...movable('barre', 'A-shape barre', 'A', 5, 'Bb', [
    ['major', 'x13331', 'x12341'],
    ['minor', 'x13321', 'x13421'],
    ['7', 'x13131', 'x13141'],
    ['m7', 'x13121', 'x13121'],
    ['maj7', 'x13231', 'x13241'],
    ['sus2', 'x13311', 'x13411'],
    ['sus4', 'x13341', 'x12341'],
    ['7sus4', 'x13141', 'x13141'],
    ['mmaj7', 'x13221', 'x14231'],
    ['6', 'x13333', 'x13333'],
  ]),
  ...movable('caged', 'C shape', 'C', 5, 'C#', [
    ['major', 'x43121', 'x43121'],
    ['7', 'x4342x', 'x3241x'],
    ['maj7', 'x43111', 'x43111'],
    ['minor', 'x4212x', 'x4213x'],
    ['add9', 'x4314x', 'x3214x'],
  ]),
  ...movable('caged', 'G shape', 'G', 6, 'G#', [
    ['major', '431114', '321114'],
    ['major', '43111x', '32111x'],
  ]),
  ...movable('caged', 'D shape', 'D', 4, 'D#', [
    ['major', 'xx1343', 'xx1243'],
    ['minor', 'xx1342', 'xx1342'],
    ['7', 'xx1323', 'xx1324'],
    ['maj7', 'xx1333', 'xx1333'],
    ['m7', 'xx1322', 'xx1322'],
    ['sus4', 'xx1344', 'xx1234'],
    ['sus2', 'xx1341', 'xx1341'],
  ]),
  ...movable('power', 'Power chord, root on string 6', null, 6, 'F', [
    ['5', '13xxxx', '13xxxx'],
    ['5', '133xxx', '134xxx'],
  ]),
  ...movable('power', 'Power chord, root on string 5', null, 5, 'Bb', [
    ['5', 'x13xxx', 'x13xxx'],
    ['5', 'x133xx', 'x134xx'],
  ]),
  ...movable('power', 'Power chord, root on string 4', null, 4, 'Eb', [
    ['5', 'xx13xx', 'xx13xx'],
    ['5', 'xx134x', 'xx134x'],
  ]),
  ...movable('shell', 'Shell voicing, root on string 6', null, 6, 'G', [
    ['maj7', '3x44xx', '1x23xx'],
    ['7', '3x34xx', '1x23xx'],
    ['m7', '3x33xx', '2x34xx'],
    ['mmaj7', '3x43xx', '1x32xx'],
  ]),
  ...movable('shell', 'Shell voicing, root on string 5', null, 5, 'C', [
    ['maj7', 'x324xx', 'x214xx'],
    ['7', 'x323xx', 'x213xx'],
    ['m7', 'x313xx', 'x314xx'],
    ['mmaj7', 'x314xx', 'x314xx'],
    ['maj7', 'x3x45x', 'x1x23x'],
    ['7', 'x3x35x', 'x1x24x'],
    ['m7', 'x3x34x', 'x1x23x'],
  ]),
  ...movable('jazz', 'Jazz voicing, root on string 6', null, 6, 'G', [
    ['maj7', '3x443x', '1x342x'],
    ['7', '3x343x', '1x243x'],
    ['m7', '3x333x', '2x333x'],
    ['6', '3x243x', '2x143x'],
    ['m6', '3x233x', '2x134x'],
    ['m7b5', '3x332x', '2x341x'],
    ['dim7', '3x232x', '2x131x'],
    ['7sharp5', '3x344x', '1x234x'],
    ['7b5', '3x342x', '2x341x'],
    ['13', '3x345x', '1x234x'],
    ['mmaj7', '3x433x', '1x423x'],
    ['7sus4', '3x353x', '1x243x'],
    ['69', '322233', '211134'],
    ['m7add11', '3x331x', '2x341x'],
    ['m9', '3x3335', '2x3334'],
    ['maj9', '3x4435', '1x2314'],
  ]),
  ...movable('jazz', 'Jazz voicing, root on string 5', null, 5, 'C', [
    ['9', 'x3233x', 'x2134x'],
    ['9', 'x32333', 'x21333'],
    ['7sharp9', 'x3234x', 'x2134x'],
    ['7b9', 'x3232x', 'x3142x'],
    ['13', 'x32335', 'x21334'],
    ['maj9', 'x3243x', 'x2143x'],
    ['69', 'x32233', 'x21134'],
    ['m9', 'x3133x', 'x2134x'],
    ['m6', 'x31213', 'x31214'],
    ['m7b5', 'x3434x', 'x1324x'],
    ['dim7', 'x3424x', 'x2314x'],
    ['7sharp5', 'x3x354', 'x1x243'],
    ['9sus4', 'x3333x', 'x1111x'],
    ['aug', 'x3211x', 'x3211x'],
    ['dim', 'x3454x', 'x1243x'],
  ]),
  ...movable('jazz', 'Jazz voicing, root on string 4', null, 4, 'Eb', [
    ['dim7', 'xx1212', 'xx1324'],
    ['m7b5', 'xx1222', 'xx1234'],
    ['6', 'xx1313', 'xx1314'],
    ['m6', 'xx1312', 'xx1312'],
  ]),
];
