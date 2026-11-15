import { describe, expect, it } from 'vitest';
import { identifyChord } from '@/core/theory';
import {
  assignFingers, buildVoicing, checkVoicingFingering, difficultyLevel, findBarres, formatFrets, moveVoicing, parseFrets, tryBuildVoicing,
  voicingDifficulty, voicingPositions, voicingProblem, type Finger,
} from './index';

const fingersOf = (shape: string) => assignFingers(parseFrets(shape))?.fingers.map((f) => (f === null ? 'x' : String(f))).join('') ?? null;

describe('fret strings', () => {
  it('reads and writes the usual notations', () => {
    expect(parseFrets('x32010')).toEqual([null, 3, 2, 0, 1, 0]);
    expect(parseFrets('X 3 2 0 1 0')).toEqual([null, 3, 2, 0, 1, 0]);
    expect(parseFrets('8-10-10-9-8-8')).toEqual([8, 10, 10, 9, 8, 8]);
    expect(parseFrets('x,x,0,2,3,2')).toEqual([null, null, 0, 2, 3, 2]);
    expect(parseFrets('0003')).toEqual([0, 0, 0, 3]);
    expect(formatFrets([null, 3, 2, 0, 1, 0])).toBe('x32010');
    expect(formatFrets([8, 10, 10, 9, 8, 8])).toBe('8-10-10-9-8-8');
    expect(formatFrets(parseFrets('x-10-12-12-12-10'))).toBe('x-10-12-12-12-10');
    expect(() => parseFrets('x3a010')).toThrow(RangeError);
    expect(() => parseFrets('')).toThrow(RangeError);
  });
});

describe('textbook chords', () => {
  it('x32010 is C', () => {
    const c = buildVoicing('C', 'x32010');
    expect(c.chord).toBe('C');
    expect(c.notes.map((n) => n.note)).toEqual(['C', 'E', 'G', 'C', 'E']);
    expect(c.notes.map((n) => n.degree)).toEqual(['1', '3', '5', '1', '3']);
    expect(c.notes.map((n) => n.role)).toEqual(['root', 'third', 'fifth', 'root', 'third']);
    expect(c.midi).toEqual([48, 52, 55, 60, 64]);
    expect(identifyChord(c.midi)).toBe('C');
    expect(c.fingers).toEqual([null, 3, 2, 0, 1, 0]);
    expect(c.barres).toEqual([]);
    expect([c.baseFret, c.span, c.inversion, c.movable, c.rootless]).toEqual([1, 3, 0, false, false]);
    expect(c.omitted).toEqual([]);
    expect(c.id).toBe('c-major-x32010');
    expect(c.label).toBe('Open position');
    expect(voicingPositions(c)).toEqual([
      { string: 5, fret: 3 }, { string: 4, fret: 2 }, { string: 3, fret: 0 }, { string: 2, fret: 1 }, { string: 1, fret: 0 },
    ]);
  });

  it('320003 is G', () => {
    const g = buildVoicing('G', '320003');
    expect(g.notes.map((n) => n.note)).toEqual(['G', 'B', 'D', 'G', 'B', 'G']);
    expect(identifyChord(g.midi)).toBe('G');
    expect(g.fingers).toEqual([2, 1, 0, 0, 0, 3]);
    expect(g.bass).toBe('G');
  });

  it('names the other first chords correctly', () => {
    const cases: Array<[string, string]> = [
      ['D', 'xx0232'], ['A', 'x02220'], ['E', '022100'], ['Am', 'x02210'], ['Em', '022000'], ['Dm', 'xx0231'], ['F', '133211'],
      ['G7', '320001'], ['C7', 'x32310'], ['B7', 'x21202'], ['Fmaj7', 'xx3210'], ['Am7', 'x02010'], ['Dsus4', 'xx0233'], ['E5', '022xxx'],
      ['Bm', 'x24432'], ['Cadd9', 'x32030'],
    ];
    for (const [symbol, shape] of cases) {
      const v = buildVoicing(symbol, shape);
      expect(v.chord, shape).toBe(symbol);
      expect(identifyChord(v.midi), shape).toBe(symbol);
    }
  });

  it('spells notes as the chord does', () => {
    expect(buildVoicing('F#', '244322').notes.map((n) => n.note)).toEqual(['F#', 'C#', 'F#', 'A#', 'C#', 'F#']);
    expect(buildVoicing('Gb', '244322').notes.map((n) => n.note)).toEqual(['Gb', 'Db', 'Gb', 'Bb', 'Db', 'Gb']);
    expect(buildVoicing('E7#9', 'x7678x').notes.map((n) => `${n.note} ${n.degree}`)).toEqual(['E 1', 'G# 3', 'D b7', 'F## #9']);
    expect(buildVoicing('Cdim7', 'x3424x').notes.map((n) => n.degree)).toEqual(['1', 'b5', 'bb7', 'b3']);
  });

  it('names a shape by what sounds lowest', () => {
    const inv = buildVoicing('C', '032010');
    expect(inv.chord).toBe('C/E');
    expect([inv.bass, inv.inversion]).toEqual(['E', 1]);
    expect(inv.id).toBe('c-major-over-e-032010');
    expect(buildVoicing('C/E', '032010').chord).toBe('C/E');
    expect(buildVoicing('C/G', '332010').inversion).toBe(2);
    // A slash chord played without its bass is just the chord.
    expect(buildVoicing('C/E', 'x32010').chord).toBe('C');
    const foreign = buildVoicing('Am/G', '302210');
    expect(foreign.chord).toBe('Am/G');
    expect(foreign.inversion).toBeNull();
    expect(foreign.notes[0]).toMatchObject({ note: 'G', role: 'bass' });
    // On a re-entrant ukulele there is no bass to speak of: the plain name stays.
    const uke = buildVoicing('C', '0003', { tuning: 'ukulele' });
    expect(uke.chord).toBe('C');
    expect(uke.notes.map((n) => n.note)).toEqual(['G', 'C', 'E', 'C']);
    expect(uke.tuning).toBe('ukulele');
  });

  it('reports what a voicing leaves out', () => {
    const shell = buildVoicing('G7', '3x34xx');
    expect(shell.omitted).toEqual(['5']);
    expect(buildVoicing('G13', '3x345x').omitted).toEqual(['5', '9']);
    expect(buildVoicing('C9', 'xx2333').rootless).toBe(true);
    expect(buildVoicing('C9', 'xx2333').omitted).toEqual(['1']);
  });

  it('follows the tuning and the capo', () => {
    const capo = buildVoicing('D', 'x32010', { capo: 2 });
    expect(capo.notes.map((n) => n.note)).toEqual(['D', 'F#', 'A', 'D', 'F#']);
    expect([capo.capo, capo.id]).toEqual([2, 'd-major-x32010-capo2']);
    const dropD = buildVoicing('D5', '000xxx', { tuning: 'drop-d' });
    expect(dropD.notes.map((n) => n.note)).toEqual(['D', 'A', 'D']);
    expect(dropD.id).toBe('d-5-000xxx-drop-d');
    expect(buildVoicing('G', '000000', { tuning: 'open-g' }).chord).toBe('G/D');
  });

  it('refuses shapes that are not the chord', () => {
    expect(() => buildVoicing('C', 'x32011')).toThrow(/not in C: F on string 1/);
    expect(() => buildVoicing('C', 'x3201')).toThrow(/5 frets for a 6-string tuning/);
    expect(() => buildVoicing('C', 'xxxxxx')).toThrow(/no string sounds/);
    expect(() => buildVoicing('Am/G', 'x02213')).toThrow(RangeError); // the G is not in the bass
    expect(() => buildVoicing('C', 'x32010', { fingers: 'x12010' })).toThrow(/fingering/);
    expect(() => buildVoicing('H', 'x32010')).toThrow(RangeError);
    // The right notes are not enough: the tones that make the chord what it is must be there.
    expect(() => buildVoicing('Cmaj7', 'x32010')).toThrow(/lacks the 7 of Cmaj7/);
    expect(() => buildVoicing('C', 'x3x01x')).toThrow(/lacks the 3/);
    expect(() => buildVoicing('G7alt', '3x34xx')).toThrow(/none of the altered notes/);
    expect(buildVoicing('G7alt', '3x344x').omitted).toEqual(['b9', '#9', '#11']);
    expect(buildVoicing('Cmaj7', 'x32010', { allowIncomplete: true }).omitted).toEqual(['7']);
    expect(tryBuildVoicing('C', 'x32011')).toBeNull();
    expect(tryBuildVoicing('H', 'x32010')).toBeNull();
    expect(voicingProblem('C', 'x32011')).toMatch(/not in C/);
    expect(voicingProblem('C', 'x32010')).toBeNull();
    expect(voicingProblem('E', '0 7 9 9 9 12')).toMatch(/four fingers|fingering/);
  });
});

describe('fingering', () => {
  it('finds the standard fingerings of the first chords', () => {
    expect(fingersOf('x32010')).toBe('x32010'); // C
    expect(fingersOf('022100')).toBe('023100'); // E
    expect(fingersOf('x02210')).toBe('x02310'); // Am
    expect(fingersOf('xx0232')).toBe('xx0132'); // D
    expect(fingersOf('xx0231')).toBe('xx0231'); // Dm
    expect(fingersOf('x02220')).toBe('x01230'); // A
    expect(fingersOf('320003')).toBe('210003'); // G
    expect(fingersOf('320001')).toBe('320001'); // G7
    expect(fingersOf('x32310')).toBe('x32410'); // C7
    expect(fingersOf('x21202')).toBe('x21304'); // B7
    expect(fingersOf('000000')).toBe('000000');
    expect(fingersOf('xxxxxx')).toBe('xxxxxx');
  });

  it('barres with the index finger when the shape calls for it', () => {
    expect(fingersOf('133211')).toBe('134211'); // F
    expect(fingersOf('133111')).toBe('134111'); // Fm
    expect(fingersOf('131211')).toBe('131211'); // F7
    expect(fingersOf('131111')).toBe('131111'); // Fm7
    expect(fingersOf('x13321')).toBe('x13421'); // Bbm
    expect(fingersOf('x13331')).toBe('x12341'); // Bb
    expect(fingersOf('x24232')).toBe('x13121'); // Bm7
    expect(fingersOf('xx3211')).toBe('xx3211'); // small F
    expect(fingersOf('xx0211')).toBe('xx0211'); // Dm7
    expect(fingersOf('x02222')).toBe('x01111'); // A6
    const f = assignFingers(parseFrets('133211'))!;
    expect(f.barres).toEqual([{ fret: 1, finger: 1, fromString: 6, toString: 1 }]);
    // No barre where an open string has to ring under or above it.
    expect(fingersOf('022033')).toBe('012034');
    expect(assignFingers(parseFrets('x02220'))!.barres).toEqual([]);
  });

  it('uses the higher fingers for power chords and lets the ring finger flatten when fingers run out', () => {
    expect(fingersOf('x355xx')).toBe('x134xx');
    expect(fingersOf('35xxxx')).toBe('13xxxx');
    expect(fingersOf('x32333')).toBe('x21333'); // C9
    expect(assignFingers(parseFrets('x32333'))!.barres).toEqual([{ fret: 3, finger: 3, fromString: 3, toString: 1 }]);
  });

  it('gives up on shapes no hand can hold', () => {
    expect(assignFingers(parseFrets('1 3 5 7 9 11'))).toBeNull();
    expect(assignFingers(parseFrets('123456'))).toBeNull();
    expect(assignFingers(parseFrets('2 4 1 3 5 x'))).toBeNull();
  });

  it('always produces fingerings that pass its own physical check', () => {
    const shapes = ['x32010', '133211', 'x13331', 'x24232', 'x32333', '3x443x', 'xx1212', '022033', 'x3x354', '431114', '5x5565', '8-10-10-9-8-8'];
    for (const s of shapes) {
      const frets = parseFrets(s);
      const assigned = assignFingers(frets)!;
      expect(checkVoicingFingering(frets, assigned.fingers), s).toEqual([]);
      expect(new Set(assigned.fingers.filter((f) => f !== null && f > 0)).size).toBeLessThanOrEqual(4);
    }
  });

  it('finds barres from fingers', () => {
    expect(findBarres(parseFrets('x13331'), [null, 1, 3, 3, 3, 1])).toEqual([
      { fret: 1, finger: 1, fromString: 5, toString: 1 }, { fret: 3, finger: 3, fromString: 4, toString: 2 },
    ]);
    expect(findBarres(parseFrets('x32010'), [null, 3, 2, 0, 1, 0])).toEqual([]);
  });

  it('catches physically impossible fingerings', () => {
    const check = (shape: string, fingers: string) =>
      checkVoicingFingering(parseFrets(shape), [...fingers].map((ch) => (ch === 'x' ? null : (Number(ch) as Finger))));
    expect(check('x32010', 'x32010')).toEqual([]);
    expect(check('133211', '134211')).toEqual([]);
    expect(check('x32010', 'x12030')[0]).toMatch(/finger 1 \(fret 3\) is above finger 2 \(fret 2\)/);
    expect(check('x32010', 'x32011')[0]).toMatch(/open but has finger 1/);
    expect(check('x32010', '132010')[0]).toMatch(/muted but has finger/);
    expect(check('x32010', 'x3201x')[0]).toMatch(/open but has finger null/);
    expect(check('x32010', 'x30010')[0]).toMatch(/no finger 1–4/);
    expect(check('x32310', 'x32210')[0]).toMatch(/finger 2 is asked to hold frets 2 and 3/);
    // A "barre" with an open string underneath it cannot work.
    expect(check('202xxx', '101xxx')[0]).toMatch(/lies under the finger-1 barre/);
    expect(check('1x3x5x', '1x2x4x').length).toBe(0);
    expect(check('1x3x7x', '1x2x4x')[0]).toMatch(/span of 7 frets/);
    expect(checkVoicingFingering([1, 2], [1])).toHaveLength(1);
  });
});

describe('difficulty', () => {
  const d = (symbol: string, shape: string) => buildVoicing(symbol, shape).difficulty;

  it('orders chords the way learners meet them', () => {
    expect(d('Em', '022000')).toBeLessThan(d('C', 'x32010'));
    expect(d('C', 'x32010')).toBeLessThan(d('F', 'xx3211'));
    expect(d('F', 'xx3211')).toBeLessThan(d('F', '133211'));
    expect(d('E5', '02xxxx')).toBeLessThan(d('E', '022100'));
    expect(d('G7', '3x34xx')).toBeLessThan(d('G7', '353433'));
    expect(d('E', '022100')).toBeLessThan(d('Bm', 'x24432'));
  });

  it('stays between 1 and 10 and has words for the levels', () => {
    expect(voicingDifficulty([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0])).toBe(1);
    expect(d('Em', '022000')).toBeGreaterThanOrEqual(1);
    expect(d('F', '133211')).toBeLessThanOrEqual(10);
    expect(difficultyLevel(d('Em', '022000'))).toBe('easy');
    expect(difficultyLevel(d('C', 'x32010'))).toBe('easy');
    expect(difficultyLevel(d('F', '133211'))).toBe('hard');
    expect(difficultyLevel(5)).toBe('medium');
    expect(difficultyLevel(9)).toBe('expert');
    // Muting a string inside the chord and stretching both cost something.
    expect(d('G7', '3x34xx')).toBeGreaterThan(d('C7', 'x323xx'));
  });
});

describe('moving shapes', () => {
  it('slides a barre chord to another root', () => {
    const f = buildVoicing('F', '133211', { label: 'E-shape barre at fret 1', category: 'barre', shape: 'E', source: 'library', fingers: '134211' });
    const g = moveVoicing(f, 2)!;
    expect(g.chord).toBe('G');
    expect(formatFrets(g.frets)).toBe('355433');
    expect(g.fingers).toEqual(f.fingers);
    expect(g.label).toBe('E-shape barre at fret 3');
    expect([g.category, g.shape, g.source]).toEqual(['barre', 'E', 'library']);
    expect(moveVoicing(g, -2)!.chord).toBe('F');
    expect(moveVoicing(f, 1)!.chord).toMatch(/^(F#|Gb)$/);
    expect(moveVoicing(f, -1)).toBeNull(); // would hit the nut
    expect(moveVoicing(f, 30)).toBeNull();
    expect(moveVoicing(buildVoicing('C', 'x32010'), 2)).toBeNull(); // open strings do not move
  });
});
