/**
 * Adversarial review of the guitar engine: the checks a guitar teacher and a suspicious engineer
 * would run against it. Nothing here trusts the engine's own validators. The physical rules are
 * written out again from scratch, the textbook shapes are typed in as an independent answer key,
 * and the properties run over the whole catalog: every chord type on every root, every scale in
 * every pattern system, several tunings and instruments.
 */
import { describe, expect, it } from 'vitest';
import {
  CHORD_TYPES, SCALES, chord as parseChord, chordPcs, chordTones, note as parseNote, scalePcs, transposeChordBySemitones,
} from '@/core/theory';
import {
  LIBRARY_ROOTS, MOVABLE_SHAPES, NECK_PRESETS, OPEN_SHAPES, SEQUENCES, TUNINGS, arpeggioPatterns, arpeggioPositions, bestVoicing, buildVoicing,
  checkFingering, chordChange, chordVoicings, degreeNumber, easiestVoicing, essentialTones, formatFrets, fretDistance, fretWireSegment,
  fretboardHalfWidth, fretboardLayout, generateVoicings, handMove, hasBassRegister, libraryVoicings, midiAt, neckPoint, openChordVoicings,
  patternSystemsFor, placeChord, planFingering, positionAtPoint, practiceSequence, progressionChanges, rootToRoot, scalePatterns, scalePositions,
  sequencesFor, simultaneousCost, tuning, voicingLibrary, voicingTransition, RESTING_HAND,
  type FretDot, type PatternNote, type ScalePattern, type SequenceKind, type Voicing,
} from './index';

const pc = (name: string) => parseNote(name).chroma;
const fretsOf = (v: Voicing) => formatFrets(v.frets);
const fingersOf = (v: Voicing) => v.fingers.map((f) => (f === null ? 'x' : f)).join('');
const shapes = (list: Voicing[]) => list.map(fretsOf);

/** Frets per string of a pattern, lowest string first. */
function layout(p: ScalePattern): number[][] {
  const strings = [...new Set(p.notes.map((n) => n.string))].sort((a, b) => b - a);
  return strings.map((s) => p.notes.filter((n) => n.string === s).map((n) => n.fret));
}

// ── An independent model of the fretting hand ──────────────────────────────────────────────

/**
 * Why a fingered shape cannot be held, judged without any of the engine's own checks.
 *  - A muted string has no finger, an open string finger 0, a fretted string one of four fingers.
 *  - A finger presses one fret. A finger with a lower number never sits on a higher fret.
 *  - Two fingers are at most one fret further apart than one-finger-per-fret puts them
 *    (index and middle two frets, index and little finger four).
 *  - A finger on several strings lies flat across everything between them: nothing there may be
 *    open or fretted lower. Only the index finger may lie across strings it does not sound.
 */
function handProblems(frets: ReadonlyArray<number | null>, fingers: ReadonlyArray<number | null>): string[] {
  const problems: string[] = [];
  const held = new Map<number, { fret: number; strings: number[] }>();
  frets.forEach((fret, i) => {
    const finger = fingers[i];
    if (fret === null) {
      if (finger !== null) problems.push(`muted string ${i} has a finger`);
    } else if (fret === 0) {
      if (finger !== 0) problems.push(`open string ${i} has finger ${String(finger)}`);
    } else if (finger === null || finger < 1 || finger > 4) {
      problems.push(`fretted string ${i} has no finger`);
    } else {
      const entry = held.get(finger);
      if (!entry) held.set(finger, { fret, strings: [i] });
      else if (entry.fret !== fret) problems.push(`finger ${finger} on frets ${entry.fret} and ${fret}`);
      else entry.strings.push(i);
    }
  });
  const used = [...held.keys()].sort((a, b) => a - b);
  for (let a = 0; a < used.length; a++) {
    for (let b = a + 1; b < used.length; b++) {
      const gap = held.get(used[b])!.fret - held.get(used[a])!.fret;
      if (gap < 0) problems.push(`finger ${used[a]} is above finger ${used[b]}`);
      if (gap > used[b] - used[a] + 1) problems.push(`fingers ${used[a]} and ${used[b]} are ${gap} frets apart`);
    }
  }
  for (const [finger, { fret, strings }] of held) {
    if (strings.length < 2) continue;
    for (let i = strings[0] + 1; i < strings[strings.length - 1]; i++) {
      if (strings.includes(i)) continue;
      const under = frets[i];
      if (under !== null && under <= fret) problems.push(`string ${i} (fret ${under}) lies under the finger-${finger} barre at fret ${fret}`);
      if (finger !== 1) problems.push(`finger ${finger} lies across string ${i} without sounding it`);
    }
  }
  const pressed = frets.filter((f): f is number => f !== null && f > 0);
  if (pressed.length && Math.max(...pressed) - Math.min(...pressed) > 4) problems.push('more than five frets');
  if (used.length > 4) problems.push('more than four fingers');
  return problems;
}

/**
 * Everything a voicing claims about itself, checked against the theory engine and the hand model.
 * Returns what is wrong with it (nothing, for an honest voicing).
 */
function dishonesty(v: Voicing, symbol: string, tuningId = 'standard', capo = 0): string[] {
  const wrong: string[] = [];
  const check = (ok: boolean, what: string) => {
    if (!ok) wrong.push(what);
  };
  const c = parseChord(symbol);
  const t = tuning(tuningId);
  const rootPc = pc(c.root);
  const tones = new Set(chordPcs(c));
  check(v.frets.length === t.stringCount, 'one fret per string');
  check(v.notes.length === v.frets.filter((f) => f !== null).length, 'one note per sounding string');
  // The notes are where the frets put them, they belong to the chord, and they are spelled by it.
  for (const n of v.notes) {
    check(n.midi === midiAt(n, { tuning: tuningId, capo }), `string ${n.string} sounds ${n.midi}`);
    check(tones.has(n.midi % 12), `${n.note} is not in the chord`);
    check(pc(n.note) === n.midi % 12, `${n.note} is misspelled`);
    check(n.isRoot === (n.midi % 12 === rootPc), `isRoot of ${n.note}`);
    check(n.finger === v.fingers[t.stringCount - n.string], `finger of string ${n.string}`);
    check(v.frets[t.stringCount - n.string] === n.fret, `fret of string ${n.string}`);
  }
  check(v.midi.join() === v.notes.map((n) => n.midi).join(), 'midi list');
  // What it says it leaves out is exactly what does not sound.
  const sounding = new Set(v.midi.map((m) => m % 12));
  const missing = [...new Set(chordTones(c).filter((tone) => !sounding.has(pc(tone.note))).map((tone) => tone.degree))].sort().join();
  check([...v.omitted].sort().join() === missing, `omitted says ${v.omitted.join(' ')}, missing is ${missing}`);
  check(v.rootless === !sounding.has(rootPc), 'rootless flag');
  // The name says what sounds: same root and type, and the lowest note after the slash.
  const named = parseChord(v.chord);
  check(pc(named.root) === rootPc && named.type.id === c.type.id && v.type === c.type.id && pc(v.root) === rootPc, `named ${v.chord}`);
  const lowest = Math.min(...v.midi) % 12;
  check(pc(v.bass) === lowest, `bass says ${v.bass}`);
  if (hasBassRegister(t)) check(pc(named.bass ?? named.root) === lowest, `${v.chord} does not have its lowest note in the bass`);
  // A hand can hold it, and the bookkeeping agrees with the frets.
  wrong.push(...handProblems(v.frets, v.fingers));
  for (const barre of v.barres) {
    const covered = v.fingers.map((f, i) => (f === barre.finger ? t.stringCount - i : 0)).filter((x) => x > 0);
    check(covered.length >= 2 && barre.fromString === Math.max(...covered) && barre.toString === Math.min(...covered), `barre of finger ${barre.finger}`);
    check(v.frets[t.stringCount - barre.fromString] === barre.fret, `barre fret of finger ${barre.finger}`);
  }
  for (const finger of [1, 2, 3, 4]) {
    check(v.barres.some((b) => b.finger === finger) === (v.fingers.filter((f) => f === finger).length >= 2), `finger ${finger} barre listing`);
  }
  const pressed = v.frets.filter((f): f is number => f !== null && f > 0);
  check(v.baseFret === (pressed.length ? Math.min(...pressed) : 1), 'baseFret');
  check(v.span === (pressed.length ? Math.max(...pressed) - Math.min(...pressed) + 1 : 0), 'span');
  check(v.movable === !v.frets.includes(0), 'movable');
  check(v.difficulty >= 1 && v.difficulty <= 10, `difficulty ${v.difficulty}`);
  check(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.id), `id ${v.id}`);
  return wrong;
}

function expectHonest(v: Voicing, symbol: string, tuningId = 'standard', capo = 0): void {
  expect(dishonesty(v, symbol, tuningId, capo), `${symbol} ${fretsOf(v)} [${fingersOf(v)}] (${tuningId})`).toEqual([]);
}

/** The essential tones a voicing lacks (the root of a rootless voicing aside). */
function incomplete(v: Voicing, symbol: string): string[] {
  const sounding = new Set(v.midi.map((m) => m % 12));
  return essentialTones(symbol).filter((tone) => !(tone.role === 'root' && v.rootless) && !sounding.has(pc(tone.note))).map((tone) => tone.degree);
}

function expectComplete(v: Voicing, symbol: string): void {
  expect(incomplete(v, symbol), `${symbol} ${fretsOf(v)} lacks`).toEqual([]);
}

// ── 1. The curated chord library ───────────────────────────────────────────────────────────

describe('the chord library, voicing by voicing', () => {
  /** What a teacher writes on the board: chord, frets, fingers. Typed here independently of the library. */
  const TEXTBOOK: Array<[string, string, string]> = [
    // The first chords.
    ['C', 'x32010', 'x32010'], ['A', 'x02220', 'x01230'], ['G', '320003', '210003'], ['E', '022100', '023100'], ['D', 'xx0232', 'xx0132'],
    ['Am', 'x02210', 'x02310'], ['Em', '022000', '023000'], ['Dm', 'xx0231', 'xx0231'],
    // F: the full barre, and the small F that leads up to it.
    ['F', '133211', '134211'], ['F', 'xx3211', 'xx3211'], ['Fm', '133111', '134111'],
    // The barre chords every song book needs.
    ['Bm', 'x24432', 'x13421'], ['Bb', 'x13331', 'x12341'], ['B', 'x24442', 'x12341'], ['F#m', '244222', '134111'], ['C#m', 'x46654', 'x13421'],
    ['Gm', '355333', '134111'], ['Cm', 'x35543', 'x13421'], ['F#', '244322', '134211'], ['Bbm', 'x13321', 'x13421'],
    // Open dominant sevenths.
    ['A7', 'x02020', 'x02030'], ['B7', 'x21202', 'x21304'], ['C7', 'x32310', 'x32410'], ['D7', 'xx0212', 'xx0213'], ['E7', '020100', '020100'],
    ['G7', '320001', '320001'], ['F7', '131211', '131211'], ['Bb7', 'x13131', 'x13141'],
    // Major and minor sevenths.
    ['Cmaj7', 'x32000', 'x32000'], ['Amaj7', 'x02120', 'x02130'], ['Dmaj7', 'xx0222', 'xx0111'], ['Fmaj7', 'xx3210', 'xx3210'], ['Gmaj7', '320002', '320001'],
    ['Am7', 'x02010', 'x02010'], ['Em7', '020000', '020000'], ['Dm7', 'xx0211', 'xx0211'], ['Bm7', 'x24232', 'x13121'], ['F#m7', '242222', '131111'],
    // The common sus and add9 shapes.
    ['Asus2', 'x02200', 'x01200'], ['Asus4', 'x02230', 'x01230'], ['Dsus2', 'xx0230', 'xx0130'], ['Dsus4', 'xx0233', 'xx0134'], ['Esus4', '022200', '023400'],
    ['Gsus4', '330013', '230014'], ['Csus2', 'x30013', 'x30014'], ['A7sus4', 'x02030', 'x02030'], ['E7sus4', '020200', '020300'],
    ['Cadd9', 'x32030', 'x21030'], ['Gadd9', '320203', '310204'], ['Eadd9', '022102', '023104'], ['Fadd9', 'xx3213', 'xx3214'], ['Emadd9', '024000', '013000'],
    // Slash chords of the first song books.
    ['D/F#', '200232', '100243'], ['C/G', '332010', '342010'], ['C/E', '032010', '032010'], ['G/B', 'x20003', 'x10003'], ['Am/G', '302210', '402310'],
    ['A/C#', 'x42220', 'x41230'], ['F/A', 'x03211', 'x03211'], ['Dm/F', 'xx3231', 'xx3241'], ['C/B', 'x22010', 'x23010'], ['E/G#', '4x2100', '4x2100'],
    // Power chords.
    ['E5', '022xxx', '012xxx'], ['A5', 'x022xx', 'x012xx'], ['G5', '355xxx', '134xxx'], ['C5', 'x355xx', 'x134xx'],
    // Jazz shells and grips.
    ['G7', '3x34xx', '1x23xx'], ['Gmaj7', '3x44xx', '1x23xx'], ['Gm7', '3x33xx', '2x34xx'], ['C7', 'x323xx', 'x213xx'], ['Cmaj7', 'x324xx', 'x214xx'],
    ['Cm7', 'x313xx', 'x314xx'], ['Gmaj7', '3x443x', '1x342x'], ['Gm7', '3x333x', '2x333x'], ['G7', '3x343x', '1x243x'], ['G13', '3x345x', '1x234x'],
    ['C9', 'x3233x', 'x2134x'], ['B9', 'x2122x', 'x2134x'], ['E7#9', 'x7678x', 'x2134x'], ['C7b9', 'x3232x', 'x3142x'], ['Bm7b5', 'x2323x', 'x1324x'],
    ['Cmaj9', 'x3243x', 'x2143x'], ['Cm9', 'x3133x', 'x2134x'], ['C6/9', 'x32233', 'x21134'], ['Cdim7', 'x3424x', 'x2314x'], ['G13b9', '3x3454', '1x1243'],
    ['C7#9#5', 'x32344', 'x21344'], ['Fmaj7#11', 'xx3200', 'xx3200'], ['Bb6', 'x13333', 'x13333'],
  ];

  it('has every shape a student expects, with the fingering a teacher gives', () => {
    for (const [symbol, frets, fingers] of TEXTBOOK) {
      const found = libraryVoicings(symbol, { inversions: true }).find((v) => fretsOf(v) === frets);
      expect(found, `${symbol} ${frets} is missing from the library`).toBeDefined();
      expect(fingersOf(found!), `${symbol} ${frets}`).toBe(fingers);
      expect(found!.source).toBe('library');
      expectHonest(found!, symbol);
      // And the lookup everybody uses offers it.
      expect(shapes(chordVoicings(symbol, { maxResults: 30 })), `${symbol} ${frets} is not offered`).toContain(frets);
    }
  });

  it('marks barres where a finger really lies flat, and nowhere else', () => {
    const barres = (symbol: string, frets: string) => libraryVoicings(symbol).find((v) => fretsOf(v) === frets)!.barres;
    expect(barres('F', '133211')).toEqual([{ fret: 1, finger: 1, fromString: 6, toString: 1 }]);
    expect(barres('F', 'xx3211')).toEqual([{ fret: 1, finger: 1, fromString: 2, toString: 1 }]);
    expect(barres('Bm', 'x24432')).toEqual([{ fret: 2, finger: 1, fromString: 5, toString: 1 }]);
    expect(barres('Bb', 'x13331')).toEqual([{ fret: 1, finger: 1, fromString: 5, toString: 1 }]);
    expect(barres('Bb6', 'x13333')).toEqual([{ fret: 3, finger: 3, fromString: 4, toString: 1 }]);
    expect(barres('A6', 'x02222')).toEqual([{ fret: 2, finger: 1, fromString: 4, toString: 1 }]);
    expect(barres('C9', 'x32333')).toEqual([{ fret: 3, finger: 3, fromString: 3, toString: 1 }]);
    for (const open of ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'B7', 'C7', 'G7']) expect(libraryVoicings(open)[0].barres, open).toEqual([]);
  });

  it('holds only shapes a hand can play that sound exactly the chord they are filed under', () => {
    const library = voicingLibrary();
    expect(library.length).toBeGreaterThan(3200);
    const seen = new Set<string>();
    for (const v of library) {
      expect(seen.has(v.id), v.id).toBe(false);
      seen.add(v.id);
      expectHonest(v, v.chord);
      expectComplete(v, v.chord);
      expect(v.rootless, v.id).toBe(false);
      // A bare-bones difficulty sanity: nothing in a chord book is "ask a professional".
      expect(v.difficulty, `${v.chord} ${fretsOf(v)}`).toBeLessThanOrEqual(9.5);
    }
  });

  it('keeps every open chord in the first frets and every movable shape free of open strings', () => {
    for (const v of openChordVoicings()) {
      expect(Math.max(...v.frets.map((f) => f ?? 0)), v.id).toBeLessThanOrEqual(4);
      expect(v.category).toBe('open');
      expect(v.difficulty, v.id).toBeLessThanOrEqual(6.5);
    }
    expect(OPEN_SHAPES.length).toBeGreaterThanOrEqual(95);
    for (const m of MOVABLE_SHAPES) expect(m.frets, m.id).not.toContain('0');
    // The same curated shape is the same grip on every root: only the fret changes.
    for (const m of MOVABLE_SHAPES.filter((x) => x.category === 'barre')) {
      const type = CHORD_TYPES.find((t) => t.id === m.type)!;
      const grips = LIBRARY_ROOTS.map((root) => libraryVoicings(`${root}${type.symbol}`, { maxFret: 24 }).find((v) => v.label.startsWith(m.name) && fingersOf(v) === m.fingers));
      for (const grip of grips) {
        expect(grip, m.id).toBeDefined();
        expect(grip!.frets.map((f) => (f === null ? null : f - grip!.baseFret)), m.id).toEqual(grips[0]!.frets.map((f) => (f === null ? null : f - grips[0]!.baseFret)));
      }
      expect(new Set(grips.map((g) => g!.baseFret)).size, m.id).toBe(12);
    }
  });

  it('places movable shapes at their lowest spot on the neck', () => {
    expect(shapes(libraryVoicings('F#m7', { categories: ['shell'] }))).toContain('2x22xx');
    expect(shapes(libraryVoicings('Fmaj7', { categories: ['jazz'] }))).toContain('1x221x');
    expect(shapes(libraryVoicings('B7#9', { categories: ['jazz'] }))).toContain('x2123x');
    for (const v of voicingLibrary()) {
      if (!v.movable || v.baseFret <= 12) continue;
      // Anything above the 12th fret is there because twelve frets lower it would need an open string.
      expect(Math.min(...v.frets.filter((f): f is number => f !== null)) - 12, v.id).toBeLessThan(1);
    }
  });
});

// ── 2. Scale patterns against the textbooks ────────────────────────────────────────────────

describe('scale patterns against the textbooks', () => {
  it('lays out the five pentatonic boxes of A minor', () => {
    const boxes = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true });
    expect(boxes.map(layout)).toEqual([
      [[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]],
      [[8, 10], [7, 10], [7, 10], [7, 9], [8, 10], [8, 10]],
      [[10, 12], [10, 12], [10, 12], [9, 12], [10, 13], [10, 12]],
      [[12, 15], [12, 15], [12, 14], [12, 14], [13, 15], [12, 15]],
      [[15, 17], [15, 17], [14, 17], [14, 17], [15, 17], [15, 17]],
    ]);
    expect(boxes.map((b) => b.name)).toEqual(['Box 1', 'Box 2', 'Box 3', 'Box 4', 'Box 5']);
    // The chord shape each box is built around: E minor shape first, then D, C, A, G.
    expect(boxes.map((b) => b.shape)).toEqual(['E', 'D', 'C', 'A', 'G']);
    // Textbook fingerings: box 1 is index-ring-little; box 2 puts the middle finger on the outer strings.
    expect(boxes[0].notes.map((n) => n.finger)).toEqual([1, 4, 1, 3, 1, 3, 1, 3, 1, 4, 1, 4]);
    expect(boxes[1].notes.map((n) => n.finger)).toEqual([2, 4, 1, 4, 1, 4, 1, 3, 2, 4, 2, 4]);
    expect(boxes[3].notes.map((n) => n.finger)).toEqual([1, 4, 1, 4, 1, 3, 1, 3, 2, 4, 1, 4]);
    expect(boxes[4].notes.map((n) => n.finger)).toEqual([2, 4, 2, 4, 1, 4, 1, 4, 2, 4, 2, 4]);
    // Without `upTheNeck` each box sits at its lowest place: boxes 4 and 5 below box 1.
    expect(scalePatterns('A', 'minor-pentatonic').map((b) => b.minFret)).toEqual([5, 7, 9, 0, 2]);
    // Every box ends where the next begins: neighbouring boxes share their inner column of notes.
    for (let i = 0; i + 1 < boxes.length; i++) {
      const upper = new Set(boxes[i].notes.map((n) => `${n.string}:${n.fret}`));
      expect(boxes[i + 1].notes.filter((n) => upper.has(`${n.string}:${n.fret}`)).length, `box ${i + 1} and ${i + 2}`).toBe(6);
    }
  });

  it('climbs the neck in order for every scale and key when asked to', () => {
    for (const scale of SCALES) {
      for (const tonic of LIBRARY_ROOTS) {
        for (const system of ['box', '3nps', 'position'] as const) {
          if (!patternSystemsFor(scale).includes(system)) continue;
          const low = scalePatterns(tonic, scale, { system });
          const climb = scalePatterns(tonic, scale, { system, upTheNeck: true });
          const label = `${tonic} ${scale.id} ${system}`;
          // The same patterns under the same names, only placed differently.
          expect(climb.map((p) => p.id), label).toEqual(low.map((p) => p.id));
          expect(climb[0].notes.map((n) => `${n.string}:${n.fret}`), label).toEqual(low[0].notes.map((n) => `${n.string}:${n.fret}`));
          // Boxes and 3NPS patterns climb by their first note, hand positions by where the hand sits.
          const starts = climb.map((p) => (system === 'position' ? p.position + 0.5 * p.index : p.notes[0].fret));
          // Each one starts above the one before, until the neck runs out: then the rest stay low.
          const wraps = starts.filter((fret, i) => i > 0 && fret <= starts[i - 1]).length;
          expect(wraps, `${label}: ${starts.join(' ')}`).toBeLessThanOrEqual(1);
          climb.forEach((p, i) => {
            expect(checkFingering(p.notes), `${label} ${p.id}`).toEqual([]);
            expect(p.minFret, `${label} ${p.id}`).toBeGreaterThanOrEqual(low[i].minFret);
            // A box or 3NPS pattern is the same shape wherever it sits: where it is, or an octave up.
            // (A hand position that used open strings is a different pattern at the twelfth fret.)
            if (system === 'position') return;
            const shift = p.notes[0].fret - low[i].notes[0].fret;
            expect([0, 12], `${label} ${p.id}`).toContain(shift);
            expect(p.notes.map((n) => n.fret - shift), `${label} ${p.id}`).toEqual(low[i].notes.map((n) => n.fret));
          });
        }
      }
    }
  }, 120_000);

  it('gives the major pentatonic the same five shapes, counted from its own root', () => {
    const major = scalePatterns('C', 'major-pentatonic', { upTheNeck: true });
    const minor = scalePatterns('A', 'minor-pentatonic', { upTheNeck: true });
    // C major pentatonic box 1 is A minor pentatonic box 2: same notes, root under the middle finger.
    expect(layout(major[0])).toEqual(layout(minor[1]));
    expect(major[0].notes[0]).toMatchObject({ string: 6, fret: 8, isRoot: true, finger: 2 });
    expect(major.map((b) => b.shape)).toEqual(['E', 'D', 'C', 'A', 'G']);
    for (let i = 0; i < 4; i++) expect(layout(major[i]), `major box ${i + 1}`).toEqual(layout(minor[i + 1]));
  });

  it('gives the five CAGED positions of C major, named after the chord shape under each', () => {
    const caged = scalePatterns('C', 'major');
    expect(caged.map((p) => `${p.name}, ${p.positionName}`)).toEqual([
      'C shape, Open position', 'A shape, 2nd position', 'G shape, 5th position', 'E shape, 7th position', 'D shape, 10th position',
    ]);
    expect(caged.map(layout)).toEqual([
      [[0, 1, 3], [0, 2, 3], [0, 2, 3], [0, 2], [0, 1, 3], [0, 1, 3]],
      [[3, 5], [2, 3, 5], [2, 3, 5], [2, 4, 5], [3, 5, 6], [3, 5]],
      [[5, 7, 8], [5, 7, 8], [5, 7], [4, 5, 7], [5, 6, 8], [5, 7, 8]],
      [[7, 8, 10], [7, 8, 10], [7, 9, 10], [7, 9, 10], [8, 10], [7, 8, 10]],
      [[10, 12, 13], [10, 12], [9, 10, 12], [9, 10, 12], [10, 12, 13], [10, 12, 13]],
    ]);
    // Roots sit where the open chord of that name has them.
    const rootStrings = (p: ScalePattern) => [...new Set(p.roots.map((r) => r.string))].sort((a, b) => b - a);
    expect(caged.map(rootStrings)).toEqual([[5, 2], [5, 3], [6, 3, 1], [6, 4, 1], [4, 2]]);
    // Open position is finger = fret; the E shape is one finger per fret with no shift at all.
    expect(caged[0].notes.every((n) => n.finger === n.fret)).toBe(true);
    expect(caged[3].notes.every((n) => n.finger === n.fret - 6 && !n.shift && !n.stretch)).toBe(true);
    // Where a shape leans out of its four frets the fingering says so.
    expect(caged[1].hasShift && caged[2].hasShift && caged[4].hasShift).toBe(true);
  });

  it('keeps the CAGED shapes in C-A-G-E-D order up the neck in every key', () => {
    for (const tonic of LIBRARY_ROOTS) {
      for (const scale of ['major', 'minor', 'dorian', 'mixolydian', 'harmonic-minor', 'melodic-minor']) {
        const list = scalePatterns(tonic, scale);
        expect(list, `${tonic} ${scale}`).toHaveLength(5);
        const order = list.map((p) => 'CAGED'.indexOf(p.shape!));
        // Going up the neck the shapes follow each other in the cycle C A G E D.
        for (let i = 1; i < 5; i++) expect((order[i] - order[i - 1] + 5) % 5, `${tonic} ${scale}`).toBe(1);
        for (let i = 1; i < 5; i++) expect(list[i].position, `${tonic} ${scale}`).toBeGreaterThan(list[i - 1].position);
      }
    }
  });

  it('gives G major its seven three-notes-per-string patterns', () => {
    const patterns = scalePatterns('G', 'major', { system: '3nps', upTheNeck: true });
    expect(patterns.map(layout)).toEqual([
      [[3, 5, 7], [3, 5, 7], [4, 5, 7], [4, 5, 7], [5, 7, 8], [5, 7, 8]],
      [[5, 7, 8], [5, 7, 9], [5, 7, 9], [5, 7, 9], [7, 8, 10], [7, 8, 10]],
      [[7, 8, 10], [7, 9, 10], [7, 9, 10], [7, 9, 11], [8, 10, 12], [8, 10, 12]],
      [[8, 10, 12], [9, 10, 12], [9, 10, 12], [9, 11, 12], [10, 12, 13], [10, 12, 14]],
      [[10, 12, 14], [10, 12, 14], [10, 12, 14], [11, 12, 14], [12, 13, 15], [12, 14, 15]],
      [[12, 14, 15], [12, 14, 15], [12, 14, 16], [12, 14, 16], [13, 15, 17], [14, 15, 17]],
      [[14, 15, 17], [14, 15, 17], [14, 16, 17], [14, 16, 17], [15, 17, 19], [15, 17, 19]],
    ]);
    patterns.forEach((p, i) => expect(p.notes[0].degreeIndex, p.id).toBe(i));
    // The three fingerings of 3NPS playing: whole-whole 1-2-4, half-whole 1-2-4, whole-half 1-3-4.
    for (const p of patterns) {
      for (let k = 0; k < p.notes.length; k += 3) {
        const [a, b, c] = p.notes.slice(k, k + 3);
        const steps = `${b.fret - a.fret}${c.fret - b.fret}`;
        expect([a.finger, b.finger, c.finger], `${p.id} frets ${a.fret} ${b.fret} ${c.fret}`).toEqual(steps === '21' ? [1, 3, 4] : [1, 2, 4]);
      }
    }
  });

  it('builds a true, fingered, unbroken run for every scale in every system that suits it', () => {
    let patterns = 0;
    const wrong: string[] = [];
    for (const scale of SCALES) {
      for (const tonic of ['C', 'E', 'Bb']) {
        const pcs = new Set(scalePcs(tonic, scale));
        for (const system of patternSystemsFor(scale)) {
          const list = scalePatterns(tonic, scale, { system });
          const label = `${tonic} ${scale.id} ${system}`;
          if (!list.length) wrong.push(`${label}: no pattern`);
          if (new Set(list.map((p) => p.id)).size !== list.length) wrong.push(`${label}: an id twice`);
          for (const p of list) {
            patterns++;
            const problems: string[] = checkFingering(p.notes);
            if (p.notes.length < Math.min(scale.size, 5)) problems.push('too few notes');
            if (!p.roots.length) problems.push('no root');
            if (p.maxFret > 22) problems.push('beyond fret 22');
            p.notes.forEach((n, i) => {
              if (!pcs.has(n.midi % 12) || n.midi !== midiAt(n)) problems.push(`note ${i} is not a scale note at its place`);
              if (i === 0) return;
              const before = p.notes[i - 1];
              // Each note is the next note of the scale, a step higher: nothing skipped, nothing twice.
              if (n.midi <= before.midi || n.midi - before.midi > 4 || n.degreeIndex !== (before.degreeIndex + 1) % scale.size) problems.push(`note ${i} does not follow note ${i - 1}`);
            });
            if (system === 'caged' || system === 'position' || system === 'box') {
              // A position holds every note of the scale and fits a hand: five frets, at most one more for a reach.
              if (new Set(p.notes.map((n) => n.degreeIndex)).size !== scale.size) problems.push('a scale note is missing');
              if (p.span > 6) problems.push(`spans ${p.span} frets`);
            }
            if (system === '3nps' && layout(p).some((frets) => frets.length !== 3)) problems.push('not three notes on every string');
            if (problems.length) wrong.push(`${label} ${p.id}: ${problems.join('; ')}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(patterns).toBeGreaterThan(4000);
  }, 120_000);

  it('covers every pitch of the neck with the positions of a scale', () => {
    for (const [tonic, scale] of [['C', 'major'], ['F#', 'harmonic-minor'], ['A', 'minor-pentatonic'], ['Eb', 'minor-blues'], ['C', 'whole-tone'], ['D', 'diminished-half-whole']] as const) {
      const list = scalePatterns(tonic, scale, { allOctaves: true });
      const covered = new Set(list.flatMap((p) => p.notes.map((n) => n.midi)));
      // From the bottom note of the lowest position up: no pitch falls between two positions.
      const lowest = Math.min(...covered);
      for (const tone of scalePositions(tonic, scale, { maxFret: 17 })) {
        if (tone.midi >= lowest) expect(covered.has(tone.midi), `${tonic} ${scale} midi ${tone.midi}`).toBe(true);
      }
      // And the lowest position starts within a few frets of the nut.
      expect(Math.min(...list.map((p) => p.minFret)), `${tonic} ${scale}`).toBeLessThanOrEqual(3);
    }
  });

  it('gives exotic and symmetric scales positions a hand can actually use', () => {
    for (const id of ['whole-tone', 'diminished-half-whole', 'diminished-whole-half', 'augmented', 'hirajoshi', 'double-harmonic', 'hungarian-minor', 'chromatic', 'bebop-dominant']) {
      const scale = SCALES.find((s) => s.id === id);
      expect(scale, id).toBeDefined();
      const list = scalePatterns('A', id);
      expect(list.length, id).toBeGreaterThanOrEqual(3);
      for (const p of list) {
        expect(p.span, `${id} ${p.id}`).toBeLessThanOrEqual(6);
        // No finger is asked to reach more than two frets out of its place, and never without saying so.
        expect(checkFingering(p.notes), `${id} ${p.id}`).toEqual([]);
        const perString = layout(p).map((frets) => Math.max(...frets) - Math.min(...frets.filter((f) => f > 0).concat(Math.max(...frets))));
        expect(Math.max(...perString), `${id} ${p.id}`).toBeLessThanOrEqual(5);
      }
    }
    // A symmetric scale repeats its shapes: the whole-tone positions two frets apart are the same shape.
    const wholeTone = scalePatterns('C', 'whole-tone', { upTheNeck: true });
    const relative = (p: ScalePattern) => layout(p).map((frets) => frets.map((f) => f - p.minFret));
    expect(relative(wholeTone[1])).toEqual(relative(wholeTone[0]));
  });

  it('keeps patterns whole in tunings where two strings are more than a fourth apart', () => {
    for (const tuningId of ['drop-d', 'dadgad', 'open-g', 'open-d', 'open-c', 'bass', 'bass-5', 'standard-7', 'baritone', 'all-fourths']) {
      for (const [tonic, scaleId] of [['D', 'major'], ['D', 'minor-pentatonic'], ['G', 'minor-blues'], ['E', 'harmonic-minor']] as const) {
        const scale = SCALES.find((s) => s.id === scaleId)!;
        const pcs = new Set(scalePcs(tonic, scale));
        const list = scalePatterns(tonic, scale, { tuning: tuningId });
        expect(list.length, `${tuningId} ${scaleId}`).toBeGreaterThanOrEqual(3);
        for (const p of list) {
          const label = `${tuningId} ${tonic} ${scaleId} ${p.id}`;
          expect(checkFingering(p.notes), label).toEqual([]);
          p.notes.forEach((n, i) => {
            expect(pcs.has(n.midi % 12), label).toBe(true);
            expect(n.midi, label).toBe(midiAt(n, { tuning: tuningId }));
            if (i > 0) expect(n.degreeIndex, `${label} note ${i}`).toBe((p.notes[i - 1].degreeIndex + 1) % scale.size);
            if (i > 0) expect(n.midi, `${label} note ${i}`).toBeGreaterThan(p.notes[i - 1].midi);
          });
        }
      }
    }
    // Drop D: the low string carries on to the G that the A string cannot reach from below.
    const dropD = scalePatterns('D', 'major', { tuning: 'drop-d' })[0];
    expect(layout(dropD)[0]).toEqual([0, 2, 4, 5]);
  });

  it('numbers the patterns of a seven-string the way the six-string numbers them', () => {
    const six = scalePatterns('E', 'minor-pentatonic');
    const seven = scalePatterns('E', 'minor-pentatonic', { tuning: 'standard-7' });
    expect(seven.map((p) => p.name)).toEqual(six.map((p) => p.name));
    seven.forEach((p, i) => {
      // The six familiar strings are untouched; the low B string adds two notes underneath.
      expect(layout(p).slice(1), p.id).toEqual(layout(six[i]));
      expect(p.shape, p.id).toBe(six[i].shape);
      expect(p.strings[0]).toBe(7);
    });
    const nps6 = scalePatterns('G', 'major', { system: '3nps' });
    const nps7 = scalePatterns('G', 'major', { system: '3nps', tuning: 'standard-7' });
    nps7.forEach((p, i) => expect(layout(p).slice(1), p.id).toEqual(layout(nps6[i])));
  });

  it('plays ukulele patterns in pitch order, whatever string comes next', () => {
    for (const tuningId of ['ukulele', 'nashville']) {
      for (const p of scalePatterns('C', 'major', { tuning: tuningId, system: 'position' })) {
        expect(checkFingering(p.notes), `${tuningId} ${p.id}`).toEqual([]);
        for (let i = 1; i < p.notes.length; i++) expect(p.notes[i].midi, `${tuningId} ${p.id}`).toBeGreaterThan(p.notes[i - 1].midi);
      }
    }
    const open = scalePatterns('C', 'major', { tuning: 'ukulele' })[0];
    expect(open.notes.map((n) => n.note).join(' ')).toBe('C D E F G A B C');
    // The G comes from the re-entrant fourth string, between the F and the A.
    expect(open.notes[4]).toMatchObject({ string: 4, fret: 0, note: 'G' });
  });
});

// ── 3. The voicing generator under attack ──────────────────────────────────────────────────

describe('the voicing generator under attack', () => {
  it('returns only honest, complete, playable, root-position voicings for every chord type on every root', () => {
    let voicings = 0;
    const wrong: string[] = [];
    for (const type of CHORD_TYPES) {
      for (const root of LIBRARY_ROOTS) {
        const symbol = `${root}${type.symbol}`;
        const canonical = parseChord(symbol).symbol;
        const list = chordVoicings(symbol);
        if (list.length < 4) wrong.push(`${symbol}: only ${list.length} voicings`);
        if (new Set(list.map((v) => v.id)).size !== list.length) wrong.push(`${symbol}: an id twice`);
        for (const v of list) {
          voicings++;
          const problems = [...dishonesty(v, symbol), ...incomplete(v, symbol).map((d) => `lacks its ${d}`)];
          if (v.chord !== canonical || v.inversion !== 0 || v.rootless) problems.push(`is ${v.chord}, not the root-position chord`);
          // One finger per fret unless the caller asks for stretches; nothing a chord book would not print.
          if (v.span > 4) problems.push(`spans ${v.span} frets`);
          if (v.difficulty > 9) problems.push(`difficulty ${v.difficulty}`);
          if (v.notes.length < (type.id === '5' ? 2 : 3)) problems.push('too few notes');
          if (Math.max(...v.frets.map((f) => f ?? 0)) > 15) problems.push('above fret 15');
          if (problems.length) wrong.push(`${symbol} ${fretsOf(v)} [${fingersOf(v)}]: ${problems.join('; ')}`);
        }
        // No computed shape is just another shape of the list with one string left out.
        for (const a of list) {
          if (a.source !== 'generated') continue;
          for (const b of list) {
            if (a === b || a.notes.length + 1 !== b.notes.length || Math.min(...a.midi) !== Math.min(...b.midi)) continue;
            if (a.frets.every((f, i) => f === null || f === b.frets[i])) wrong.push(`${symbol}: ${fretsOf(a)} is ${fretsOf(b)} with a string muted`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(voicings).toBeGreaterThan(8000);
  }, 120_000);

  it('never calls a chord by a name its notes do not earn', () => {
    // C F G is Csus4, whatever theory says about leaving thirds out: an add11 keeps its third.
    for (const root of LIBRARY_ROOTS) {
      for (const v of chordVoicings(`${root}add11`)) expect(v.notes.map((n) => n.degree), `${root}add11 ${fretsOf(v)}`).toContain('3');
    }
    expect(() => buildVoicing('Cadd11', 'x33011')).toThrow(/lacks the 3/);
    expect(() => buildVoicing('Cmaj7', 'x32010')).toThrow(/lacks the 7/);
    expect(() => buildVoicing('C7', 'x32013')).toThrow(/lacks the b7/);
    // A voicing is never a different catalog chord on the same root unless the two are one sound
    // (the #11 chord without its fifth and the b5 chord, 11 and 9sus4 …).
    const sameSound = new Set(['add11~add4', 'add4~add11', 'maj7sharp11~maj7b5', '7sharp11~7b5', '9sharp11~9b5', '7b9sharp11~7b9b5', '7sharp9sharp11~7sharp9b5',
      '7b13~7sharp5', '9b13~9sharp5', '7b9b13~7b9sharp5', '11~7sus4', '11~9sus4', 'm11~m7add11', 'm13~m6', 'maj13~6', '13~6']);
    const byNotes = new Map<string, string[]>();
    for (const type of CHORD_TYPES) {
      const key = [...new Set(chordPcs(`C${type.symbol}`))].sort((a, b) => a - b).join();
      byNotes.set(key, [...(byNotes.get(key) ?? []), type.id]);
    }
    for (const type of CHORD_TYPES) {
      if (type.id === '7alt') continue;
      for (const v of chordVoicings(`C${type.symbol}`)) {
        const key = [...new Set(v.midi.map((m) => m % 12))].sort((a, b) => a - b).join();
        for (const other of byNotes.get(key) ?? []) {
          if (other === type.id) continue;
          expect(sameSound.has(`${type.id}~${other}`), `C${type.symbol} ${fretsOf(v)} sounds exactly like the ${other} chord`).toBe(true);
        }
      }
    }
  });

  it('voices the chords people get wrong', () => {
    const degrees = (v: Voicing) => v.notes.map((n) => n.degree);
    for (const root of LIBRARY_ROOTS) {
      for (const v of chordVoicings(`${root}13b9`)) expect(degrees(v), `${root}13b9 ${fretsOf(v)}`).toEqual(expect.arrayContaining(['1', '3', 'b7', 'b9', '13']));
      for (const v of chordVoicings(`${root}m6/9`)) expect(degrees(v), `${root}m6/9 ${fretsOf(v)}`).toEqual(expect.arrayContaining(['1', 'b3', '6', '9']));
      for (const v of chordVoicings(`${root}maj7#11`)) expect(degrees(v), `${root}maj7#11 ${fretsOf(v)}`).toEqual(expect.arrayContaining(['1', '3', '7', '#11']));
      for (const v of chordVoicings(`${root}6/9`)) expect(degrees(v), `${root}6/9 ${fretsOf(v)}`).toEqual(expect.arrayContaining(['1', '3', '6', '9']));
      const alt = chordVoicings(`${root}7alt`);
      for (const v of alt) {
        expect(degrees(v), `${root}7alt ${fretsOf(v)}`).toEqual(expect.arrayContaining(['1', '3', 'b7']));
        expect(degrees(v).some((d) => ['b9', '#9', '#11', 'b13'].includes(d)), `${root}7alt ${fretsOf(v)}`).toBe(true);
        // No natural fifth, ninth or thirteenth sneaks into an altered chord.
        for (const d of degrees(v)) expect(['1', '3', 'b7', 'b9', '#9', '#11', 'b13'], `${root}7alt ${fretsOf(v)}`).toContain(d);
      }
      // The first choice is the real thing: an altered ninth and an altered fifth together.
      const top = degrees(alt[0]);
      expect(top.some((d) => d === 'b9' || d === '#9') && top.some((d) => d === '#11' || d === 'b13'), `${root}7alt ${fretsOf(alt[0])}`).toBe(true);
    }
    // Tensions sit above the third and seventh in the first choice, not growling underneath them.
    for (const symbol of ['C13b9', 'G13b9', 'A13', 'D9', 'E7#9', 'Bb7b9']) {
      const v = chordVoicings(symbol)[0];
      const guide = Math.min(...v.notes.filter((n) => n.role === 'third' || n.role === 'seventh').map((n) => n.midi));
      for (const n of v.notes) if (['ninth', 'thirteenth'].includes(n.role)) expect(n.midi, `${symbol} ${fretsOf(v)}`).toBeGreaterThan(guide);
    }
  });

  it('ranks the chord everybody means first', () => {
    const first: Record<string, string> = {
      C: 'x32010', G: '320003', D: 'xx0232', A: 'x02220', E: '022100', Am: 'x02210', Em: '022000', Dm: 'xx0231',
      F: '133211', Bm: 'x24432', Fm: '133111', 'F#m': '244222', Bb: 'x13331', B: 'x24442', 'C#m': 'x46654', Gm: '355333', Cm: 'x35543', Eb: 'x68886', Ab: '466544',
      A7: 'x02020', B7: 'x21202', C7: 'x32310', D7: 'xx0212', E7: '020100', G7: '320001', F7: '131211',
      Cmaj7: 'x32000', Fmaj7: 'xx3210', Am7: 'x02010', Dm7: 'xx0211', Em7: '020000', Bm7: 'x20202',
      Asus2: 'x02200', Asus4: 'x02230', Dsus2: 'xx0230', Dsus4: 'xx0233', Esus4: '022200', Cadd9: 'x32030', Gadd9: '320203',
      'D/F#': '200232', 'C/G': '332010', 'G/B': 'x20003', 'C/E': '032010', 'A/C#': 'x42220', 'F/A': 'x03211', 'Am/G': '302210', 'C/B': 'x22010',
      E5: '022xxx', A5: 'x022xx', G5: '35xxxx', C9: 'x32333', B9: 'x21222', Bm7b5: 'x2323x', G13b9: '3x3454', C6: 'x35555',
    };
    for (const [symbol, frets] of Object.entries(first)) expect(fretsOf(chordVoicings(symbol)[0]), symbol).toBe(frets);
    // The beginner's eight are open chords without a barre, in the easy range.
    for (const symbol of ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm']) {
      const v = bestVoicing(symbol)!;
      expect([v.category, v.label, v.source], symbol).toEqual(['open', 'Open', 'library']);
      expect(v.barres, symbol).toEqual([]);
      expect(v.frets.includes(0), symbol).toBe(true);
      expect(v.difficulty, symbol).toBeLessThanOrEqual(3.5);
    }
  });

  it('puts the barre first for F and B minor and keeps an easier way within reach', () => {
    const f = chordVoicings('F');
    expect(f.slice(0, 3).map((v) => `${fretsOf(v)} ${v.label}`)).toEqual([
      '133211 E-shape barre at fret 1', 'xx3211 Small barre (strings 4–1)', 'x-8-10-10-10-8 A-shape barre at fret 8',
    ]);
    expect(f[0].barres[0]).toEqual({ fret: 1, finger: 1, fromString: 6, toString: 1 });
    expect(f[1].difficulty).toBeLessThan(f[0].difficulty - 2);
    expect(easiestVoicing('F')!.difficulty).toBeLessThanOrEqual(4.4);
    const bm = chordVoicings('Bm');
    expect(bm.slice(0, 2).map((v) => `${fretsOf(v)} ${v.label}`)).toEqual(['x24432 A-shape barre at fret 2', '799777 E-shape barre at fret 7']);
    // The three-string B minor a teacher hands out first: no barre, three fingers.
    const easy = easiestVoicing('Bm')!;
    expect(fretsOf(easy)).toBe('xxx432');
    expect(easy.barres).toEqual([]);
    expect(easy.difficulty).toBeLessThanOrEqual(3.5);
    // Barre chords come in pairs: for every chord without an open form a barre leads the list, and
    // both the E shape and the A shape are among the first few.
    for (const symbol of ['F#', 'Ab', 'Bb', 'B', 'C#m', 'F#m', 'Gm', 'Bbm']) {
      const list = chordVoicings(symbol);
      expect(list[0].category, symbol).toBe('barre');
      expect(list.slice(0, 4).filter((v) => v.category === 'barre').map((v) => v.shape).sort(), symbol).toEqual(['A', 'E']);
    }
  });

  it('honours every option it is given', () => {
    for (const symbol of ['C', 'F#m7', 'Bb9', 'Dsus4', 'Emaj7#11']) {
      for (const v of chordVoicings(symbol, { allowOpen: false })) expect(v.movable, `${symbol} ${fretsOf(v)}`).toBe(true);
      for (const v of chordVoicings(symbol, { minFret: 5, maxFret: 9, allowOpen: false })) {
        for (const f of v.frets) if (f !== null) expect(f >= 5 && f <= 9, `${symbol} ${fretsOf(v)}`).toBe(true);
      }
      for (const v of chordVoicings(symbol, { strings: [4, 3, 2, 1] })) expect(v.frets.slice(0, 2), `${symbol} ${fretsOf(v)}`).toEqual([null, null]);
      for (const v of chordVoicings(symbol, { maxDifficulty: 4 })) expect(v.difficulty, `${symbol} ${fretsOf(v)}`).toBeLessThanOrEqual(4);
      for (const v of chordVoicings(symbol, { innerMutes: 0 })) {
        const sounding = v.frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
        expect(sounding[sounding.length - 1] - sounding[0] + 1, `${symbol} ${fretsOf(v)}`).toBe(sounding.length);
      }
      expect(chordVoicings(symbol, { maxResults: 3 }).length).toBeLessThanOrEqual(3);
      for (const v of chordVoicings(symbol, { rootInBass: false, maxResults: 30 })) expectHonest(v, symbol);
    }
    // A melody note on top, for chord melody.
    for (const top of ['E', 'G', 'B', 'C']) {
      const list = chordVoicings('Cmaj7', { top, rootInBass: false });
      expect(list.length, top).toBeGreaterThan(0);
      for (const v of list) expect(Math.max(...v.midi) % 12, `${top} ${fretsOf(v)}`).toBe(pc(top));
    }
    // Rootless voicings leave the root out and say so.
    for (const v of chordVoicings('G13', { rootless: true })) {
      expect(v.rootless, fretsOf(v)).toBe(true);
      expect(v.notes.map((n) => n.degree), fretsOf(v)).toEqual(expect.arrayContaining(['3', 'b7', '13']));
    }
    // A wider hand is allowed to stretch, and every stretch is still within reach.
    const wide = generateVoicings('Cmaj9', { maxSpan: 5, maxResults: 40, maxDifficulty: 10 });
    expect(wide.some((v) => v.span === 5)).toBe(true);
    for (const v of wide) expect(handProblems(v.frets, v.fingers), fretsOf(v)).toEqual([]);
  });

  it('plays slash chords with the right note on the bottom', () => {
    const slashes = ['C/E', 'C/G', 'Am/C', 'Am/E', 'G7/B', 'G7/D', 'G7/F', 'Dm7/C', 'F#m7b5/A', 'Bb/D', 'Eb/G', 'F#/A#', 'C/Bb', 'C/D', 'F/G', 'Am/F#', 'D/C', 'E/D', 'G/A'];
    for (const symbol of slashes) {
      const c = parseChord(symbol);
      const list = chordVoicings(symbol);
      expect(list.length, symbol).toBeGreaterThanOrEqual(3);
      for (const v of list) {
        expect(v.chord, `${symbol} ${fretsOf(v)}`).toBe(c.symbol);
        expect(Math.min(...v.midi) % 12, `${symbol} ${fretsOf(v)}`).toBe(pc(c.bass!));
        expect(handProblems(v.frets, v.fingers), `${symbol} ${fretsOf(v)}`).toEqual([]);
        // A bass note that is not in the chord sounds once, at the bottom, and nowhere else.
        if (c.inversion === null) expect(v.midi.filter((m) => m % 12 === pc(c.bass!)).length, `${symbol} ${fretsOf(v)}`).toBe(1);
        const upper = new Set(chordPcs(parseChord(`${c.root}${c.type.symbol}`)));
        for (const n of v.notes) if (n.midi !== Math.min(...v.midi)) expect(upper.has(n.midi % 12), `${symbol} ${fretsOf(v)}`).toBe(true);
      }
    }
  });

  it('follows the capo and transposed tunings exactly', () => {
    for (const symbol of ['G', 'Bb', 'F#m', 'Eb7', 'Cmaj7']) {
      for (const capo of [1, 3, 5]) {
        const shape = transposeChordBySemitones(symbol, -capo);
        const behind = chordVoicings(symbol, { capo });
        const plain = chordVoicings(shape);
        // The same shapes as without the capo, first choices first (a higher pitch can reshuffle the tail).
        expect(shapes(behind).slice(0, 3), `${symbol} capo ${capo}`).toEqual(shapes(plain).slice(0, 3));
        expect(shapes(behind).filter((frets) => shapes(plain).includes(frets)).length, `${symbol} capo ${capo}`).toBeGreaterThanOrEqual(9);
        for (const v of behind) {
          expectHonest(v, symbol, 'standard', capo);
          expect(v.capo).toBe(capo);
        }
      }
      // A half step down, every shape names the chord a half step lower.
      const lowered = chordVoicings(symbol, { tuning: 'half-step-down' });
      expect(shapes(lowered).slice(0, 3), symbol).toEqual(shapes(chordVoicings(transposeChordBySemitones(symbol, 1))).slice(0, 3));
      for (const v of lowered) expectHonest(v, symbol, 'half-step-down');
    }
  });

  it('finds honest, playable voicings for every chord type in alternate tunings and on other instruments', () => {
    const wrong: string[] = [];
    let voicings = 0;
    for (const tuningId of ['drop-d', 'dadgad', 'open-g', 'standard-7', 'ukulele', 'bass']) {
      const t = tuning(tuningId);
      for (const type of CHORD_TYPES) {
        for (const root of ['C', 'F#']) {
          const symbol = `${root}${type.symbol}`;
          const needed = essentialTones(symbol).length;
          const list = chordVoicings(symbol, { tuning: tuningId });
          // No chord is ever unplayable: when the full chord does not fit, what matters least is left out, and said so.
          if (!list.length) wrong.push(`${symbol} in ${tuningId}: no voicing at all`);
          for (const v of list) {
            voicings++;
            const problems = dishonesty(v, symbol, tuningId);
            if (v.tuning !== t.id) problems.push(`tuning ${v.tuning}`);
            const lacks = incomplete(v, symbol);
            // What is missing is admitted, and the root-position name is only given to a chord with its root at the bottom.
            if (lacks.some((d) => !v.omitted.includes(d))) problems.push(`hides that it lacks ${lacks.join(' ')}`);
            if (hasBassRegister(t) && !v.chord.includes('/') && Math.min(...v.midi) % 12 !== pc(root)) problems.push('root-position name, other bass');
            if (problems.length) wrong.push(`${symbol} ${fretsOf(v)} [${fingersOf(v)}] in ${tuningId}: ${problems.join('; ')}`);
          }
          // Chords that fit the instrument come out whole; with a string to spare, root in the bass wherever there is a bass.
          if (list.length && needed <= Math.min(4, t.stringCount)) {
            const lacks = incomplete(list[0], symbol);
            if (lacks.length) wrong.push(`${symbol} in ${tuningId}: first choice ${fretsOf(list[0])} lacks ${lacks.join(' ')}`);
            if (hasBassRegister(t) && needed < t.stringCount && list[0].inversion !== 0) wrong.push(`${symbol} in ${tuningId}: first choice ${fretsOf(list[0])} is an inversion`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(voicings).toBeGreaterThan(5000);
    // A sample of every other tuning in the catalog, common chords only.
    for (const t of TUNINGS) {
      for (const symbol of ['E', 'Am', 'D7', 'Gmaj7', 'Bm7b5', 'F#sus4', 'C9']) {
        const list = chordVoicings(symbol, { tuning: t.id, maxResults: 6 });
        expect(list.length, `${symbol} in ${t.id}`).toBeGreaterThan(0);
        for (const v of list) expectHonest(v, symbol, t.id);
      }
    }
  }, 120_000);

  it('knows the idioms of each tuning and instrument', () => {
    const top = (symbol: string, tuningId: string) => fretsOf(chordVoicings(symbol, { tuning: tuningId })[0]);
    // Drop D: the six-string D, one-finger power chords, and everything standard above the dropped string.
    expect(top('D', 'drop-d')).toBe('000232');
    expect(top('Dm', 'drop-d')).toBe('000231');
    expect(top('D5', 'drop-d')).toBe('000xxx');
    expect(top('E5', 'drop-d')).toBe('222xxx');
    expect(top('G5', 'drop-d')).toBe('555xxx');
    expect(chordVoicings('G5', { tuning: 'drop-d' })[0].fingers).toEqual([1, 1, 1, null, null, null]);
    expect(top('C', 'drop-d')).toBe('x32010');
    expect(top('Bm', 'drop-d')).toBe('x24432');
    expect(top('G', 'drop-d')).toBe('550003');
    // DADGAD and the open tunings: the open strings are the chord.
    expect(top('Dsus4', 'dadgad')).toBe('000000');
    expect(top('D5', 'dadgad')).toBe('000xxx');
    expect(top('G', 'open-g')).toBe('x00000');
    expect(top('D', 'open-d')).toBe('000000');
    expect(top('A', 'open-g')).toBe('x22222');
    expect(chordVoicings('A', { tuning: 'open-g' })[0].barres).toEqual([{ fret: 2, finger: 1, fromString: 5, toString: 1 }]);
    // Seven strings: the six-string chords with the low B left alone, and power chords on the B string.
    expect(top('Em', 'standard-7')).toBe('x022000');
    expect(top('F', 'standard-7')).toBe('x133211');
    expect(top('B5', 'standard-7')).toBe('022xxxx');
    // Ukulele, re-entrant or low G: the chords of every ukulele book, named without a slash.
    for (const uke of ['ukulele', 'ukulele-low-g']) {
      const book: Record<string, string> = { C: '0003', F: '2010', G: '0232', Am: '2000', A: '2100', D: '2220', Dm: '2210', Em: '0432', G7: '0212', C7: '0001', A7: '0100', E7: '1202' };
      for (const [symbol, frets] of Object.entries(book)) {
        const list = chordVoicings(symbol, { tuning: uke });
        expect(shapes(list).slice(0, 2), `${symbol} on ${uke}`).toContain(frets);
        expect(list[0].chord, `${symbol} on ${uke}`).toBe(symbol);
      }
    }
    // Nashville high-strung: the shapes you know.
    for (const [symbol, frets] of [['C', 'x32010'], ['G', '320003'], ['D7', 'xx0212'], ['F', '133211']] as const) expect(top(symbol, 'nashville')).toBe(frets);
    // A four-string bass plays a C13b9 the only way it can: without the root, and it says so.
    const bass = chordVoicings('C13b9', { tuning: 'bass' });
    expect(bass.length).toBeGreaterThan(0);
    for (const v of bass) {
      expect(v.rootless).toBe(true);
      expect(v.omitted).toContain('1');
      expect(v.notes.map((n) => n.degree)).toEqual(expect.arrayContaining(['3', 'b7', 'b9', '13']));
    }
  });
});

// ── 4. Fast enough for every render ────────────────────────────────────────────────────────

describe('performance', () => {
  /**
   * Milliseconds for one run of `work`: the best of `runs` after a warm-up. The build machine is
   * shared and busy, so only the fastest run says what the code costs; the limits below are several
   * times what an idle machine needs.
   */
  function best(runs: number, work: () => void): number {
    work();
    let fastest = Infinity;
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      work();
      fastest = Math.min(fastest, performance.now() - start);
    }
    return fastest;
  }

  it('looks a scale up over the whole neck in a fraction of a frame', () => {
    const all = () => {
      let notes = 0;
      for (const scale of SCALES) for (const tonic of LIBRARY_ROOTS) notes += scalePositions(tonic, scale).length;
      return notes;
    };
    expect(all()).toBeGreaterThan(50_000);
    const lookups = SCALES.length * LIBRARY_ROOTS.length;
    // About 0.02 ms each in practice; a tenth of a millisecond leaves room for a loaded machine.
    expect(best(4, all) / lookups).toBeLessThan(0.1);
  });

  it('builds the patterns of a scale without anyone noticing', () => {
    const all = () => {
      for (const scale of SCALES) for (const tonic of ['C', 'F#', 'A']) scalePatterns(tonic, scale);
    };
    // The five positions of a scale, fingered: well under a millisecond.
    expect(best(4, all) / (SCALES.length * 3)).toBeLessThan(1.5);
    expect(best(20, () => arpeggioPatterns('Cmaj7'))).toBeLessThan(5);
  });

  it('generates voicings once and serves them from memory after that', () => {
    const symbols = CHORD_TYPES.flatMap((type) => ['D', 'Ab'].map((root) => `${root}${type.symbol}`));
    const options = { minFret: 2, maxFret: 14 };
    const start = performance.now();
    for (const symbol of symbols) chordVoicings(symbol, options);
    const cold = (performance.now() - start) / symbols.length;
    // A new chord takes a few milliseconds: fine when a chord is picked, too slow for every frame.
    expect(cold).toBeLessThan(80);
    const warm = best(5, () => {
      for (const symbol of symbols) chordVoicings(symbol, options);
    }) / symbols.length;
    // So the answer is remembered: the same question again is a table lookup.
    expect(warm).toBeLessThan(0.1);
    expect(warm).toBeLessThan(cold / 10);
    // The memory holds a whole chord browser: every type on every root stays warm.
    const browser = CHORD_TYPES.flatMap((type) => LIBRARY_ROOTS.map((root) => `${root}${type.symbol}`));
    for (const symbol of browser) chordVoicings(symbol);
    expect(best(3, () => {
      for (const symbol of browser) chordVoicings(symbol);
    }) / browser.length).toBeLessThan(0.1);
    // Cached lists are fresh arrays: a caller sorting its copy does not disturb the next one.
    const first = chordVoicings('D', options);
    first.reverse();
    expect(fretsOf(chordVoicings('D', options)[0])).not.toBe(fretsOf(first[0]));
  }, 120_000);

  it('answers everything an interactive screen asks in one frame', () => {
    const render = () => {
      scalePositions('A', 'minor-pentatonic');
      scalePatterns('A', 'minor-pentatonic');
      scalePatterns('C', 'major');
      arpeggioPositions('Am7');
      for (const symbol of ['C', 'G', 'Am', 'F', 'Dm7', 'G7', 'Cmaj7']) chordVoicings(symbol);
      voicingTransition(chordVoicings('C')[0], chordVoicings('G')[0]);
      planFingering([57, 60, 62, 64, 67, 69, 72, 69, 67, 64, 62, 60, 57]);
    };
    // Sixteen milliseconds is a frame; this may use a quarter of it.
    expect(best(20, render)).toBeLessThan(4);
  });

  it('arranges a long melody quickly', () => {
    const melody = Array.from({ length: 1000 }, (_unused, i) => 52 + ((i * 7) % 24));
    expect(best(3, () => planFingering(melody))).toBeLessThan(400);
  });
});

// ── 5. What the screens need ───────────────────────────────────────────────────────────────

describe('what the screens need', () => {
  it('feeds a fretboard the same kind of dot from scales, patterns, arpeggios and chords', () => {
    const pattern = scalePatterns('A', 'minor-pentatonic')[0];
    const voicing = chordVoicings('Bm7')[0];
    const sources: Record<string, FretDot[]> = {
      scale: scalePositions('F#', 'major', { maxFret: 12 }),
      pattern: pattern.notes,
      arpeggio: arpeggioPositions('E7#9', { maxFret: 12 }),
      arpeggioPattern: arpeggioPatterns('Cmaj7')[0].notes,
      chord: voicing.notes,
    };
    for (const [name, dots] of Object.entries(sources)) {
      expect(dots.length, name).toBeGreaterThan(3);
      for (const dot of dots) {
        expect(dot.midi, name).toBe(midiAt(dot));
        expect(pc(dot.note), name).toBe(dot.midi % 12);
        expect(dot.degree, name).toMatch(/^(bb|b|#)?\d+$/);
        expect([1, 2, 3, 4, 5, 6, 7], name).toContain(degreeNumber(dot.degree));
        expect(dot.isRoot, name).toBe(dot.degree === '1');
      }
      expect(dots.some((d) => d.isRoot), name).toBe(true);
    }
    // Spelled by the key: F sharp major shows E sharp, not F.
    expect(sources.scale.map((d) => d.note)).toContain('E#');
    // Patterns and chords carry fingers; arpeggios and chords carry roles.
    for (const dot of [...sources.pattern, ...sources.arpeggioPattern, ...sources.chord]) expect([0, 1, 2, 3, 4]).toContain(dot.finger);
    for (const dot of [...sources.arpeggio, ...sources.chord]) expect(dot.role).toBeTruthy();
    expect(sources.chord.map((d) => `${d.string}:${d.fret} ${d.degree} f${d.finger}`)).toEqual(['5:2 1 f1', '4:0 b3 f0', '3:2 b7 f2', '2:0 1 f0', '1:2 5 f3']);
    // Degree colours: one of seven for any label the engine produces.
    expect(['1', 'b2', '2', 'b3', '3', '4', '#4', 'b5', '5', '#5', 'b6', '6', 'bb7', 'b7', '7', 'b9', '9', '#9', '11', '#11', 'b13', '13'].map(degreeNumber))
      .toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 6, 6, 7, 7, 7, 2, 2, 2, 4, 4, 6, 6]);
    for (const scale of SCALES) for (const d of scale.degrees) expect(degreeNumber(d), `${scale.id} ${d}`).toBeGreaterThanOrEqual(1);
    // A chord diagram also needs what is not played and where the box starts.
    const f = chordVoicings('F')[0];
    expect([f.baseFret, f.span, f.frets.filter((x) => x === null).length]).toEqual([1, 3, 0]);
    expect(chordVoicings('D')[0].frets.slice(0, 2)).toEqual([null, null]);
  });

  it('gives the scale games ordered sequences of real notes', () => {
    const kinds = SEQUENCES.map((s) => s.id);
    expect(kinds).toEqual(expect.arrayContaining(['ascending', 'descending', 'up-down', 'thirds', 'groups-3', 'groups-4', 'string-skip']));
    for (const [tonic, scale, system] of [['A', 'minor-pentatonic', 'box'], ['C', 'major', 'caged'], ['G', 'major', '3nps'], ['E', 'minor-blues', 'position'], ['D', 'dorian', 'two-string']] as const) {
      for (const pattern of scalePatterns(tonic, scale, { system })) {
        const own = new Set<PatternNote>(pattern.notes);
        const up = practiceSequence(pattern, 'ascending');
        const down = practiceSequence(pattern, 'descending');
        expect(up).toEqual(pattern.notes);
        expect(down).toEqual([...pattern.notes].reverse());
        for (let i = 1; i < up.length; i++) expect(up[i].midi).toBeGreaterThan(up[i - 1].midi);
        expect(practiceSequence(pattern, 'up-down')).toHaveLength(2 * up.length - 1);
        for (const kind of kinds as SequenceKind[]) {
          for (const direction of ['up', 'down', 'up-down'] as const) {
            const sequence = practiceSequence(pattern, kind, { direction });
            expect(sequence.length, `${pattern.id} ${kind} ${direction}`).toBeGreaterThanOrEqual(4);
            // The very objects of the pattern: position, pitch, degree and finger all there to light up.
            for (const n of sequence) expect(own.has(n), `${pattern.id} ${kind}`).toBe(true);
          }
        }
        expect(sequencesFor(pattern).length).toBeGreaterThanOrEqual(4);
        // Thirds really are thirds of the scale: two scale steps apart, pair by pair.
        const thirds = practiceSequence(pattern, 'thirds');
        for (let i = 0; i + 1 < thirds.length; i += 2) {
          expect(pattern.notes.indexOf(thirds[i + 1]) - pattern.notes.indexOf(thirds[i]), `${pattern.id} thirds`).toBe(2);
        }
        // Root to root: the scale as it is first practised.
        const run = rootToRoot(pattern);
        expect(run[0].isRoot && run[run.length - 1].isRoot, pattern.id).toBe(true);
        expect((run[run.length - 1].midi - run[0].midi) % 12, pattern.id).toBe(0);
        const octave = rootToRoot(pattern, { octaves: 1 });
        if (pattern.roots.length >= 2) expect(octave[octave.length - 1].midi - octave[0].midi, pattern.id).toBe(12);
      }
    }
    const box1 = scalePatterns('A', 'minor-pentatonic')[0];
    expect(rootToRoot(box1, { octaves: 1 }).map((n) => n.note).join(' ')).toBe('A C D E G A');
    expect(rootToRoot(box1).map((n) => n.midi)).toEqual([45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69]);
    expect(rootToRoot([])).toEqual([]);
  });

  it('tells the chord-change trainer how hard every change is, and why', () => {
    const chords = ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'F', 'Bm', 'B7', 'G7', 'C7', 'A7', 'E7', 'Cmaj7', 'Fmaj7', 'Dm7'];
    const voicings = chords.map((symbol) => chordVoicings(symbol)[0]);
    for (const from of voicings) {
      for (const to of voicings) {
        const change = voicingTransition(from, to);
        const label = `${from.chord} to ${to.chord}`;
        expect(change.difficulty, label).toBeGreaterThanOrEqual(1);
        expect(change.difficulty, label).toBeLessThanOrEqual(10);
        // Every fretting finger of the target chord is accounted for exactly once: it stays, slides or jumps.
        const used = [...new Set(to.fingers.filter((f): f is 1 | 2 | 3 | 4 => f !== null && f > 0))].sort();
        const told = [...change.anchors.map((a) => a.finger), ...change.guides.map((g) => g.finger), ...change.moving].sort();
        if (!change.sameShape) expect(told, label).toEqual(used);
        for (const anchor of change.anchors) {
          expect(from.frets[6 - anchor.string], label).toBe(anchor.fret);
          expect(to.frets[6 - anchor.string], label).toBe(anchor.fret);
          expect(from.fingers[6 - anchor.string], label).toBe(anchor.finger);
          expect(to.fingers[6 - anchor.string], label).toBe(anchor.finger);
        }
        for (const guide of change.guides) {
          expect([from.frets[6 - guide.string], to.frets[6 - guide.string]], label).toEqual([guide.fromFret, guide.toFret]);
          expect(guide.fromFret, label).not.toBe(guide.toFret);
        }
        if (from === to) {
          // Staying on a chord is as easy as that chord is to hold: nothing moves.
          expect(change.difficulty, label).toBeLessThanOrEqual(1.05 + Math.max(0, to.difficulty - 4) * 0.35);
          expect(change.moving, label).toEqual([]);
          expect(change.guides, label).toEqual([]);
        } else {
          expect(change.tips.length, label).toBeGreaterThan(0);
        }
        for (const tip of change.tips) expect(tip, label).toMatch(/^[A-Z].*\.$/);
      }
    }
    const d = (a: string, b: string) => chordChange(a, b)!.difficulty;
    // The order learners live through: shared fingers first, full re-fingering later, barres last.
    expect(d('C', 'Am')).toBeLessThan(d('Am', 'E'));
    expect(d('Am', 'E')).toBeLessThan(d('G', 'C'));
    expect(d('Em', 'Am')).toBeLessThan(d('G', 'C'));
    expect(d('G', 'C')).toBeLessThan(d('Am', 'F'));
    expect(d('C', 'F')).toBeLessThan(d('G', 'Bm'));
    expect(chordChange('C', 'Am')!.anchors.map((a) => a.finger).sort()).toEqual([1, 2]);
    expect(chordChange('D', 'A')!.guides).toEqual([{ finger: 3, string: 2, fromFret: 3, toFret: 2 }]);
    expect(chordChange('Am', 'E')!.block).toBe(true);
    expect(chordChange('Em', 'Am')!.block).toBe(true);
    expect(chordChange('F', 'G', { voicings: 'closest' })).toMatchObject({ sameShape: true, shift: 2 });
    expect(chordChange('Am', 'F')!.tips.join(' ')).toMatch(/barre first/);
    expect(chordChange('C', 'N.C.')).toBeNull();
    expect(chordChange('C', 'not a chord')).toBeNull();
    // A whole song: every change in order, and the one to practise.
    const song = progressionChanges(['G', 'G', 'D', 'Em', 'C', 'N.C.', 'G', 'D', 'C', '???'], { loop: true });
    expect(song.changes.map((c) => `${c.from.chord}-${c.to.chord}`)).toEqual(['G-D', 'D-Em', 'Em-C', 'C-G', 'G-D', 'D-C', 'C-G']);
    expect(song.hardest).toBe(song.practice[0]);
    expect(song.practice.length).toBe(5);
    for (let i = 1; i < song.practice.length; i++) expect(song.practice[i - 1].difficulty).toBeGreaterThanOrEqual(song.practice[i].difficulty);
    expect(song.difficulty).toBeGreaterThan(1);
    expect(progressionChanges(['Am', 'F', 'C', 'G']).difficulty).toBeGreaterThan(progressionChanges(['Am', 'Em', 'Am', 'Em']).difficulty);
    expect(progressionChanges([])).toMatchObject({ changes: [], difficulty: 1, hardest: null, practice: [] });
    // Barre-chord songs stay in one part of the neck when the shapes are chosen from where the hand is.
    const near = progressionChanges(['F', 'Bb', 'C', 'F'], { voicings: 'closest' });
    expect(Math.max(...near.changes.map((c) => Math.abs(c.shift)))).toBeLessThanOrEqual(2);
    expect(progressionChanges(['D', 'G', 'A'], { tuning: 'drop-d' }).changes).toHaveLength(2);
  });

  it('gives the camera overlay true fret geometry and its inverse', () => {
    // Frets by the twelfth root of two: the octave at half the string, every fret 5.6% of what is left.
    expect(fretDistance(12)).toBeCloseTo(0.5, 12);
    expect(fretDistance(24)).toBeCloseTo(0.75, 12);
    expect(fretDistance(1, 648)).toBeCloseTo(36.37, 2);
    for (let fret = 1; fret <= 24; fret++) {
      const width = fretDistance(fret) - fretDistance(fret - 1);
      expect(width / (1 - fretDistance(fret - 1))).toBeCloseTo(1 - 2 ** (-1 / 12), 12);
      expect(width).toBeGreaterThan(0);
    }
    for (const [name, geometry] of Object.entries(NECK_PRESETS)) {
      const [nutLow, nutHigh] = fretWireSegment(0, geometry);
      expect(nutHigh.y - nutLow.y, name).toBeCloseTo(geometry.nutWidth, 9);
      const [twelfthLow, twelfthHigh] = fretWireSegment(12, geometry);
      expect(twelfthHigh.y - twelfthLow.y, name).toBeCloseTo(geometry.width12, 9);
      for (let string = 1; string <= geometry.stringCount; string++) {
        let lastX = -1;
        for (let fret = 0; fret <= geometry.frets; fret++) {
          const marker = neckPoint({ string, fret }, geometry);
          const tip = neckPoint({ string, fret }, geometry, 'fingertip');
          const wire = neckPoint({ string, fret }, geometry, 'wire');
          // Along the neck: marker in the middle of the fret space, fingertip behind the wire, all moving up the neck.
          expect(marker.x, `${name} ${string}:${fret}`).toBeGreaterThan(lastX);
          if (fret > 0) expect(marker.x < tip.x && tip.x < wire.x, `${name} ${string}:${fret}`).toBe(true);
          lastX = marker.x;
          // Across the neck: on the board, string 1 on the positive side, strings fanning out toward the bridge.
          expect(Math.abs(marker.y), `${name} ${string}:${fret}`).toBeLessThan(fretboardHalfWidth(marker.x, geometry));
          if (string > 1) expect(marker.y, `${name} ${string}:${fret}`).toBeLessThan(neckPoint({ string: string - 1, fret }, geometry).y);
          // And back again: every marker and fingertip is read as the position it was drawn for.
          for (const point of [marker, tip]) {
            expect(positionAtPoint(point, geometry), `${name} ${string}:${fret}`).toMatchObject({ string, fret, onNeck: true });
            expect(Math.abs(positionAtPoint(point, geometry).stringOffset), `${name} ${string}:${fret}`).toBeLessThan(1e-9);
          }
        }
        const spread = (fret: number) => neckPoint({ string: 1, fret }, geometry).y - neckPoint({ string: geometry.stringCount, fret }, geometry).y;
        expect(spread(12), name).toBeGreaterThan(spread(1));
      }
      // A fingertip halfway between two strings, or off the board, is reported as such.
      const between = neckPoint({ string: 2, fret: 5 }, geometry);
      const next = neckPoint({ string: 1, fret: 5 }, geometry);
      const hit = positionAtPoint({ x: between.x, y: between.y + 0.3 * (next.y - between.y) }, geometry);
      expect([hit.string, hit.fret], name).toEqual([2, 5]);
      expect(hit.stringOffset, name).toBeCloseTo(0.3, 6);
      expect(positionAtPoint({ x: -5, y: 0 }, geometry).onNeck, name).toBe(false);
      expect(positionAtPoint({ x: between.x, y: geometry.width12 }, geometry).onNeck, name).toBe(false);
      expect(positionAtPoint({ x: geometry.scaleLength * 0.9, y: 0 }, geometry).onNeck, name).toBe(false);
    }
    // The drawing layout: wires and markers in order, in a unit box, for any stretch of the neck.
    for (const [firstFret, lastFret] of [[1, 12], [5, 9], [1, 22], [12, 24]]) {
      for (const proportional of [true, false]) {
        const box = fretboardLayout({ firstFret, lastFret, proportional });
        expect(box.wires).toHaveLength(lastFret - firstFret + 2);
        expect(box.centres).toHaveLength(lastFret - firstFret + 1);
        expect([box.wires[0], box.wires[box.wires.length - 1]]).toEqual([0, 1]);
        box.centres.forEach((centre, i) => expect(centre > box.wires[i] && centre < box.wires[i + 1]).toBe(true));
        expect([box.strings[0], box.strings[5]]).toEqual([0, 1]);
      }
    }
  });

  it('gives the song arranger a cost model that behaves like a hand', () => {
    // One note: staying is free, a stretch costs, a shift costs more, and further is dearer.
    const at5 = { position: 5, last: { string: 3, fret: 5 }, finger: 1 as const };
    const stay = handMove(at5, { string: 3, fret: 7 });
    const stretch = handMove(at5, { string: 3, fret: 9 });
    const shift = handMove(at5, { string: 3, fret: 12 });
    const far = handMove(at5, { string: 3, fret: 17 });
    expect([stay.shift, stay.stretch, stretch.stretch, shift.shift]).toEqual([false, false, true, true]);
    expect(stay.cost).toBeLessThan(stretch.cost);
    expect(stretch.cost).toBeLessThan(shift.cost);
    expect(shift.cost).toBeLessThan(far.cost);
    expect(handMove(RESTING_HAND, { string: 1, fret: 0 }).finger).toBe(0);
    // Whole lines: every note where it sounds, fingers and positions that agree with each other.
    const lines: number[][] = [
      [48, 50, 52, 53, 55, 57, 59, 60], [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62], [45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69],
      Array.from({ length: 30 }, (_unused, i) => 40 + i), [40, 64, 45, 69, 52, 76], [76, 79, 81, 83, 84, 86, 84, 81], [57, 57, 57, 57],
    ];
    for (const tuningId of ['standard', 'drop-d', 'dadgad', 'standard-7', 'bass', 'ukulele']) {
      for (const capo of [0, 2]) {
        for (const line of lines) {
          const plan = planFingering(line, { tuning: tuningId, capo });
          const label = `${tuningId} capo ${capo} [${line.slice(0, 4).join(' ')} …]`;
          expect(plan.notes.length + plan.unplayable.length, label).toBe(line.length);
          expect(plan.cost, label).toBeGreaterThanOrEqual(0);
          const playable = line.filter((_unused, i) => !plan.unplayable.includes(i));
          plan.notes.forEach((n, i) => {
            expect(n.midi, label).toBe(playable[i]);
            expect(midiAt(n, { tuning: tuningId, capo }), label).toBe(n.midi);
            expect(n.cost, label).toBeGreaterThanOrEqual(0);
            if (n.fret === 0) expect(n.finger, label).toBe(0);
            else {
              expect([1, 2, 3, 4], label).toContain(n.finger);
              // The finger sits on its own fret of the position, or it is reaching one fret out and says so.
              const off = n.fret - (n.position! + n.finger - 1);
              expect(off === 0 ? !n.stretch : n.stretch && Math.abs(off) === 1, `${label} note ${i}`).toBe(true);
            }
            // A shift is exactly a change of hand position between two fretted notes.
            const before = plan.notes.slice(0, i).reverse().find((x) => x.fret > 0);
            if (n.fret > 0 && before) expect(n.shift, `${label} note ${i}`).toBe(n.position !== before.position);
          });
          // Nothing is called unplayable that the neck can sound.
          for (const index of plan.unplayable) {
            const t = tuning(tuningId);
            expect(t.midi.some((open) => line[index] - open - capo >= 0 && line[index] - open - capo <= 22 - capo), label).toBe(false);
          }
        }
      }
    }
    // A melody that fits one position is played in it, without a single shift.
    const inPosition = planFingering([57, 59, 60, 62, 64, 65, 67, 69], { preferPosition: 5, weights: { openString: 5 } });
    expect(inPosition.notes.every((n) => !n.shift && n.position === 5 && n.fret >= 4 && n.fret <= 9)).toBe(true);
    expect(inPosition.notes.filter((n) => n.stretch)).toHaveLength(1);
    // Planning the whole line beats deciding note by note.
    const greedy = (midi: number[]) => {
      let state = { ...RESTING_HAND };
      let total = 0;
      for (const m of midi) {
        const options = tuning('standard').midi.map((open, i) => ({ string: 6 - i, fret: m - open })).filter((p) => p.fret >= 0 && p.fret <= 22);
        const moves = options.map((p) => handMove(state, p));
        const move = moves.reduce((a, b) => (b.cost < a.cost ? b : a));
        total += move.cost;
        state = move.state;
      }
      return total;
    };
    for (const line of lines.slice(0, 6)) expect(planFingering(line).cost).toBeLessThanOrEqual(greedy(line) + 0.011);
    // Notes held together: thirds, sixths, octaves and tenths are placed; the impossible is refused.
    expect(simultaneousCost([{ string: 5, fret: 3 }, { string: 5, fret: 5 }])).toBe(Infinity);
    expect(simultaneousCost([{ string: 6, fret: 1 }, { string: 1, fret: 9 }])).toBe(Infinity);
    for (const pitches of [[60, 64], [60, 69], [57, 69], [52, 67], [48, 64, 67], [45, 52, 60, 64], [40, 47, 52, 56, 59, 64]]) {
      const placed = placeChord(pitches)!;
      expect(placed, pitches.join()).not.toBeNull();
      expect(placed.positions.map((p) => midiAt(p)), pitches.join()).toEqual(pitches);
      expect(new Set(placed.positions.map((p) => p.string)).size, pitches.join()).toBe(pitches.length);
      expect(handProblems(placed.frets, placed.fingers), pitches.join()).toEqual([]);
      expect(placed.difficulty).toBe(simultaneousCost(placed.positions));
    }
    expect(placeChord([40, 47, 52, 56, 59, 64])!.frets).toEqual([0, 2, 2, 1, 0, 0]);
    expect(placeChord([65, 69], { near: 9 })!.positions.every((p) => p.fret >= 7 && p.fret <= 12)).toBe(true);
    expect(placeChord([65, 69])!.positions.every((p) => p.fret <= 6)).toBe(true);
    expect(placeChord([40, 41])).toBeNull(); // both only on the low E string
    expect(placeChord([30, 60])).toBeNull();
    expect(placeChord([60, 64, 67, 72, 76, 79, 84])).toBeNull();
    expect(placeChord([62, 66], { tuning: 'ukulele' })!.positions).toHaveLength(2);
  });

  it('serves every catalog tuning without a crash', () => {
    for (const t of TUNINGS) {
      expect(chordVoicings('C', { tuning: t.id }).length, t.id).toBeGreaterThan(0);
      expect(scalePatterns('C', 'major', { tuning: t.id }).length, t.id).toBeGreaterThan(0);
      expect(scalePositions('C', 'major', { tuning: t.id }).length, t.id).toBeGreaterThan(20);
      expect(planFingering([t.midi[0] + 3, t.midi[0] + 5, t.midi[t.stringCount - 1] + 2], { tuning: t.id }).unplayable, t.id).toEqual([]);
    }
  });
});
