import { describe, expect, it } from 'vitest';
import { chord as parseChord, chordPcs, getChordType, identifyChords, note as parseNote } from '@/core/theory';
import {
  LIBRARY_ROOTS, MOVABLE_SHAPES, OPEN_SHAPES, VOICING_CATEGORIES, VOICING_CATEGORY_INFO, checkVoicingFingering, formatFrets, libraryChordTypes,
  libraryVoicings, midiAt, openChordVoicings, parseFrets, voicingLibrary, type Voicing,
} from './index';

/** The same chord: same root pitch class, same type, same bass pitch class. */
function sameChord(a: string, b: string): boolean {
  const x = parseChord(a);
  const y = parseChord(b);
  const pc = (name: string) => parseNote(name).chroma;
  return pc(x.root) === pc(y.root) && x.type.id === y.type.id && pc(x.bass ?? x.root) === pc(y.bass ?? y.root);
}

const shapes = (list: Voicing[]) => list.map((v) => formatFrets(v.frets));
const LIBRARY = voicingLibrary();

describe('the whole library sounds what it claims', () => {
  it('is big enough to be the library', () => {
    expect(LIBRARY.length).toBeGreaterThan(3000);
    expect(new Set(LIBRARY.map((v) => v.id)).size).toBe(LIBRARY.length);
    const categories = new Set(LIBRARY.map((v) => v.category));
    for (const c of ['open', 'barre', 'caged', 'power', 'shell', 'triad', 'jazz', 'drop2', 'drop3'] as const) expect(categories.has(c), c).toBe(true);
    expect(LIBRARY.every((v) => v.source === 'library')).toBe(true);
  });

  it('every voicing contains only tones of its chord, at the pitches its frets give', () => {
    for (const v of LIBRARY) {
      const pcs = chordPcs(v.chord);
      for (const n of v.notes) {
        expect(n.midi, v.id).toBe(midiAt(n));
        expect(pcs, `${v.id}: ${n.note}`).toContain(n.midi % 12);
        expect(parseNote(n.note).chroma, v.id).toBe(n.midi % 12);
      }
      // The lowest note is the bass the symbol names.
      const lowest = v.notes.reduce((a, b) => (b.midi < a.midi ? b : a));
      const named = parseChord(v.chord);
      expect(parseNote(named.bass ?? named.root).chroma, v.id).toBe(lowest.midi % 12);
    }
  });

  it('every voicing is identified as its chord by the theory engine', () => {
    for (const v of LIBRARY) {
      const matches = identifyChords(v.midi, { limit: 80 });
      const hit = matches.find((m) => sameChord(m.symbol, v.chord));
      expect(hit, `${v.chord} ${formatFrets(v.frets)} (${v.label}) is read as ${matches.map((m) => m.symbol).join(', ')}`).toBeDefined();
      // A complete voicing is an exact reading; "partial" is only acceptable when the voicing says what it leaves out.
      if (hit!.kind === 'partial') expect(v.omitted.length, v.id).toBeGreaterThan(0);
      if (v.omitted.length === 0 && parseChord(v.chord).inversion !== null) expect(hit!.kind, v.id).toBe('exact');
      if (hit!.kind === 'partial') expect([...hit!.omitted].sort(), v.id).toEqual([...v.omitted].sort());
    }
  });

  it('every complete root-position voicing is the first reading', () => {
    let checked = 0;
    for (const v of LIBRARY) {
      if (v.inversion !== 0 || v.omitted.length) continue;
      const top = identifyChords(v.midi, { limit: 1 })[0];
      expect(top && sameChord(top.symbol, v.chord), `${v.chord} ${formatFrets(v.frets)} is read first as ${top?.symbol}`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(1200);
  });

  it('every fingering is physically consistent', () => {
    for (const v of LIBRARY) {
      expect(checkVoicingFingering(v.frets, v.fingers), `${v.chord} ${formatFrets(v.frets)} ${v.fingers.join('')}`).toEqual([]);
      const used = new Map<number, number>();
      v.notes.forEach((n) => {
        if (n.finger > 0) used.set(n.finger, n.fret);
      });
      expect(used.size, v.id).toBeLessThanOrEqual(4);
      // A lower-numbered finger never frets higher up the neck than a higher-numbered one.
      const fingers = [...used.keys()].sort((a, b) => a - b);
      for (let i = 1; i < fingers.length; i++) expect(used.get(fingers[i - 1])!, v.id).toBeLessThanOrEqual(used.get(fingers[i])!);
      // One finger per fret at most five frets apart.
      expect(v.span, v.id).toBeLessThanOrEqual(5);
      // Open strings and mutes carry no finger; every fretted string does.
      v.frets.forEach((fret, i) => {
        if (fret === null) expect(v.fingers[i], v.id).toBeNull();
        else if (fret === 0) expect(v.fingers[i], v.id).toBe(0);
        else expect([1, 2, 3, 4], v.id).toContain(v.fingers[i]);
      });
    }
  });

  it('every barre covers the strings it claims', () => {
    let barres = 0;
    for (const v of LIBRARY) {
      for (const barre of v.barres) {
        barres++;
        expect(barre.fromString, v.id).toBeGreaterThan(barre.toString);
        // Both ends of the barre are notes held by that finger at that fret.
        for (const end of [barre.fromString, barre.toString]) {
          expect(v.frets[6 - end], v.id).toBe(barre.fret);
          expect(v.fingers[6 - end], v.id).toBe(barre.finger);
        }
        // Nothing under the finger is open or fretted below it.
        for (let string = barre.fromString; string >= barre.toString; string--) {
          const fret = v.frets[6 - string];
          if (fret !== null) expect(fret, `${v.id} string ${string}`).toBeGreaterThanOrEqual(barre.fret);
        }
      }
      // And every finger that holds two strings is listed as a barre.
      for (const finger of [1, 2, 3, 4]) {
        const held = v.fingers.filter((f) => f === finger).length;
        expect(v.barres.some((b) => b.finger === finger), v.id).toBe(held >= 2);
      }
    }
    expect(barres).toBeGreaterThan(500);
  });

  it('derived facts agree with the frets', () => {
    for (const v of LIBRARY) {
      const pressed = v.frets.filter((f): f is number => f !== null && f > 0);
      expect(v.baseFret, v.id).toBe(pressed.length ? Math.min(...pressed) : 1);
      expect(v.movable, v.id).toBe(!v.frets.includes(0));
      expect(v.midi, v.id).toEqual(v.notes.map((n) => n.midi));
      expect(v.difficulty, v.id).toBeGreaterThanOrEqual(1);
      expect(v.difficulty, v.id).toBeLessThanOrEqual(10);
      expect(v.id, v.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(v.rootless, v.id).toBe(false);
    }
  });
});

describe('curated shapes', () => {
  it('builds every typed open shape as the chord it is listed under', () => {
    const open = openChordVoicings();
    expect(open).toHaveLength(OPEN_SHAPES.length);
    open.forEach((v, i) => {
      expect(sameChord(v.chord, OPEN_SHAPES[i].chord), `${OPEN_SHAPES[i].chord} ${OPEN_SHAPES[i].frets} builds ${v.chord}`).toBe(true);
      expect(formatFrets(v.frets)).toBe(OPEN_SHAPES[i].frets);
      expect(v.fingers.map((f) => (f === null ? 'x' : f)).join('')).toBe(OPEN_SHAPES[i].fingers);
      expect(v.category).toBe('open');
      expect(v.frets.includes(0) || v.baseFret <= 3, v.id).toBe(true);
    });
  });

  it('has the open chords every beginner learns, as they are taught', () => {
    const open = new Map<string, string[]>();
    for (const v of openChordVoicings()) open.set(v.chord, [...(open.get(v.chord) ?? []), formatFrets(v.frets)]);
    const textbook: Record<string, string> = {
      C: 'x32010', A: 'x02220', G: '320003', E: '022100', D: 'xx0232', Am: 'x02210', Em: '022000', Dm: 'xx0231',
      A7: 'x02020', B7: 'x21202', C7: 'x32310', D7: 'xx0212', E7: '020100', G7: '320001',
      Cmaj7: 'x32000', Fmaj7: 'xx3210', Am7: 'x02010', Dm7: 'xx0211', Em7: '020000',
      Asus2: 'x02200', Asus4: 'x02230', Dsus2: 'xx0230', Dsus4: 'xx0233', Esus4: '022200', Cadd9: 'x32030',
      'D/F#': '200232', 'C/G': '332010', 'G/B': 'x20003',
    };
    for (const [symbol, frets] of Object.entries(textbook)) expect(open.get(symbol), symbol).toContain(frets);
  });

  it('places every movable shape on all twelve roots', () => {
    expect(new Set(MOVABLE_SHAPES.map((m) => m.id)).size).toBe(MOVABLE_SHAPES.length);
    for (const m of MOVABLE_SHAPES) {
      expect(getChordType(m.type), m.id).not.toBeNull();
      const written = parseFrets(m.frets).filter((f): f is number => f !== null);
      // Written with no open strings, and with its root on the string it names.
      expect(Math.min(...written), m.id).toBeGreaterThan(0);
      expect(midiAt({ string: m.rootString, fret: parseFrets(m.frets)[6 - m.rootString]! }) % 12, m.id).toBe(parseNote(m.root).chroma);
      for (const root of LIBRARY_ROOTS) {
        const type = getChordType(m.type)!;
        const list = libraryVoicings(`${root}${type.symbol}`, { maxFret: 24, inversions: true });
        const shift = (parseNote(root).chroma - parseNote(m.root).chroma + 12) % 12;
        const want = formatFrets(parseFrets(m.frets).map((f) => (f === null ? null : f + shift)));
        const found = list.find((v) => formatFrets(v.frets) === want);
        expect(found, `${m.id} on ${root} (${want})`).toBeDefined();
        expect(found!.fingers.map((f) => (f === null ? 'x' : f)).join(''), `${m.id} on ${root}`).toBe(m.fingers);
        expect(found!.root).toBe(root);
      }
    }
  });

  it('labels barre chords by shape and fret', () => {
    const f = libraryVoicings('F', { categories: ['barre'] });
    expect(shapes(f)).toEqual(['133211', 'x-8-10-10-10-8']);
    expect(f.map((v) => v.label)).toEqual(['E-shape barre at fret 1', 'A-shape barre at fret 8']);
    expect(f.map((v) => v.shape)).toEqual(['E', 'A']);
    expect(f[0].barres).toEqual([{ fret: 1, finger: 1, fromString: 6, toString: 1 }]);
    expect(f[0].fingers).toEqual([1, 3, 4, 2, 1, 1]);
    const g = libraryVoicings('G', { categories: ['barre'] })[0];
    expect([formatFrets(g.frets), g.label]).toEqual(['355433', 'E-shape barre at fret 3']);
    const bm = libraryVoicings('Bm', { categories: ['barre'] });
    expect(bm.map((v) => `${formatFrets(v.frets)} ${v.label}`)).toEqual(['799777 E-shape barre at fret 7', 'x24432 A-shape barre at fret 2']);
    const barreTypes = new Set(MOVABLE_SHAPES.filter((m) => m.category === 'barre').map((m) => m.type));
    for (const t of ['major', 'minor', '7', 'm7', 'maj7', 'sus4', '7sus4']) expect(barreTypes.has(t), t).toBe(true);
  });

  it('has the other CAGED shapes, power chords and shells', () => {
    const c = libraryVoicings('D', { categories: ['caged'] });
    expect(c.map((v) => v.shape)).toEqual(['C', 'G', 'G', 'D']);
    expect(shapes(c)).toContain('x54232'); // the C shape, two frets up
    const a5 = libraryVoicings('A5', { categories: ['power'] });
    expect(shapes(a5)).toEqual(['57xxxx', '577xxx', 'x-12-14-x-x-x', 'x-12-14-14-x-x', 'xx79xx', 'x-x-7-9-10-x']);
    expect(a5[1].fingers).toEqual([1, 3, 4, null, null, null]);
    const shells = libraryVoicings('G7', { categories: ['shell'] });
    expect(shapes(shells)).toEqual(['3x34xx', 'x-10-9-10-x-x', 'x-10-x-10-12-x']);
    expect(shells.every((v) => v.notes.length === 3 && v.omitted.join() === '5')).toBe(true);
    expect(shells[0].notes.map((n) => n.role)).toEqual(['root', 'seventh', 'third']);
  });

  it('has the standard jazz grips', () => {
    const grip = (symbol: string, frets: string) => libraryVoicings(symbol, { maxFret: 16 }).find((v) => formatFrets(v.frets) === frets);
    expect(grip('G13', '3x345x')?.category).toBe('jazz');
    expect(grip('C9', 'x3233x')).toBeDefined();
    expect(grip('E7#9', 'x7678x')).toBeDefined(); // the "Hendrix chord"
    expect(grip('C7b9', 'x3232x')).toBeDefined();
    expect(grip('Bm7b5', 'x2323x')).toBeDefined();
    expect(grip('Gmaj7', '3x443x')).toBeDefined();
    expect(grip('Cm9', 'x3133x')).toBeDefined();
    expect(grip('C6/9', 'x32233')).toBeDefined();
    expect(grip('G6/9', '322233')?.notes.map((n) => n.degree)).toEqual(['1', '3', '6', '9', '5', '1']);
  });
});

describe('computed families', () => {
  it('has close triads on every neighbouring string set in every inversion', () => {
    for (const symbol of ['C', 'F#m', 'Bdim']) {
      const triads = libraryVoicings(symbol, { categories: ['triad'], inversions: true, maxFret: 17 });
      expect(triads, symbol).toHaveLength(12);
      for (const set of ['strings 6–4', 'strings 5–3', 'strings 4–2', 'strings 3–1']) {
        for (const inv of ['root position', 'first inversion', 'second inversion']) {
          const v = triads.find((t) => t.label === `Triad, ${set}, ${inv}`);
          expect(v, `${symbol} ${set} ${inv}`).toBeDefined();
          expect(v!.notes).toHaveLength(3);
          expect(v!.inversion).toBe(['root position', 'first inversion', 'second inversion'].indexOf(inv));
          // Close position: the three voices fit inside an octave.
          expect(v!.midi[2] - v!.midi[0]).toBeLessThan(12);
        }
      }
    }
    expect(shapes(libraryVoicings('C', { categories: ['triad'], inversions: true }))).toEqual(expect.arrayContaining(['x320xx', 'xxx553', 'xx201x', 'xxx988']));
    // An augmented triad is its own inversion: one shape per string set.
    expect(libraryVoicings('Caug', { categories: ['triad'], inversions: true })).toHaveLength(4);
  });

  it('has drop-2 and drop-3 voicings on the usual string sets in every inversion', () => {
    for (const symbol of ['Cmaj7', 'Dm7', 'G7', 'Bm7b5']) {
      const all = libraryVoicings(symbol, { inversions: true, maxFret: 17 });
      for (const set of ['strings 4–1', 'strings 5–2', 'strings 6–3']) {
        for (let inv = 0; inv < 4; inv++) {
          // Four different chord tones on four neighbouring strings.
          const want = (v: Voicing) => v.notes.length === 4 && v.omitted.length === 0 && v.inversion === inv
            && v.notes.map((n) => n.string).join('') === { 'strings 4–1': '4321', 'strings 5–2': '5432', 'strings 6–3': '6543' }[set];
          const v = all.find(want);
          expect(v, `${symbol} drop 2 ${set} inversion ${inv}`).toBeDefined();
          // Drop 2: lift the bass an octave and it lands between the two top voices.
          const [bass, second, third, top] = v!.midi;
          expect(bass + 12).toBeGreaterThan(third);
          expect(bass + 12).toBeLessThan(top);
          expect(top - second).toBeLessThan(12);
        }
      }
      for (const strings of ['6432', '5321']) {
        for (let inv = 0; inv < 4; inv++) {
          const v = all.find((x) => x.notes.length === 4 && x.omitted.length === 0 && x.inversion === inv && x.notes.map((n) => n.string).join('') === strings);
          expect(v, `${symbol} drop 3 strings ${strings} inversion ${inv}`).toBeDefined();
          const [bass, second, third] = v!.midi;
          expect(bass + 12).toBeGreaterThan(second);
          expect(bass + 12).toBeLessThan(third);
        }
      }
    }
    const cmaj7 = libraryVoicings('Cmaj7', { inversions: true });
    const byFrets = new Map(cmaj7.map((v) => [formatFrets(v.frets), v]));
    expect(byFrets.get('x3545x')?.label).toBe('Drop 2, strings 5–2, root position');
    expect(byFrets.get('xx5557')?.label).toBe('Drop 2, strings 4–1, second inversion');
    expect(byFrets.get('xx5557')?.chord).toBe('Cmaj7/G');
    expect(byFrets.get('3x241x')?.label).toBe('Drop 3, strings 6 4 3 2, second inversion');
    expect(byFrets.get('8x998x')?.notes.map((n) => n.degree)).toEqual(['1', '7', '3', '5']);
    // Diminished sevenths repeat every three frets: one shape per string set.
    expect(libraryVoicings('Bdim7', { categories: ['drop2'], inversions: true })).toHaveLength(3);
  });
});

describe('looking chords up', () => {
  it('returns shapes in teaching order with the bass the symbol asks for', () => {
    const c = libraryVoicings('C');
    expect(formatFrets(c[0].frets)).toBe('x32010');
    expect(c.every((v) => v.chord === 'C')).toBe(true);
    const order = c.map((v) => VOICING_CATEGORIES.indexOf(v.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(shapes(libraryVoicings('C/E'))).toContain('032010');
    expect(libraryVoicings('C/E').every((v) => v.chord === 'C/E')).toBe(true);
    expect(shapes(libraryVoicings('Am/G'))).toEqual(['302210']);
    expect(libraryVoicings('C', { inversions: true }).some((v) => v.chord === 'C/G')).toBe(true);
    expect(libraryVoicings('C', { categories: ['open'] })).toHaveLength(1);
    expect(libraryVoicings('C', { maxFret: 5 }).every((v) => v.frets.every((f) => f === null || f <= 5))).toBe(true);
  });

  it('keeps the spelling of the root it is asked for', () => {
    expect(libraryVoicings('Db')[0].notes.map((n) => n.note)).toContain('Ab');
    expect(libraryVoicings('C#')[0].notes.map((n) => n.note)).toContain('G#');
    expect(libraryVoicings('C#').every((v) => v.root === 'C#')).toBe(true);
  });

  it('serves transposed standard tunings, capos and seven strings', () => {
    // A half step down, E flat is fingered as E.
    expect(shapes(libraryVoicings('Eb', { tuning: 'half-step-down', categories: ['open'] }))).toEqual(['022100']);
    const withCapo = libraryVoicings('G', { capo: 3, categories: ['open'] });
    expect(shapes(withCapo)).toEqual(['022100']);
    expect(withCapo[0].notes.map((n) => n.note)).toEqual(['G', 'D', 'G', 'B', 'D', 'G']);
    expect(withCapo[0].capo).toBe(3);
    const seven = libraryVoicings('Em', { tuning: 'standard-7', categories: ['open'] });
    expect(shapes(seven)).toEqual(['x022000']);
    expect(seven[0].fingers).toEqual([null, 0, 2, 3, 0, 0, 0]);
    // Shapes written for standard tuning mean something else elsewhere: no library there.
    expect(libraryVoicings('D', { tuning: 'drop-d' })).toEqual([]);
    expect(libraryVoicings('C', { tuning: 'ukulele' })).toEqual([]);
    expect(voicingLibrary({ tuning: 'dadgad' })).toEqual([]);
  });

  it('has nothing for chords it has no shape for, and says what it covers', () => {
    expect(libraryVoicings('C13#11')).toEqual([]);
    const types = libraryChordTypes();
    for (const id of ['major', 'minor', '7', 'maj7', 'm7', 'sus2', 'sus4', 'add9', '5', 'm7b5', 'dim7', '9', '13', '7sharp9', '7b9', 'aug', 'dim', '6', 'm6']) {
      expect(types, id).toContain(id);
    }
    expect(types.every((id) => getChordType(id) !== null)).toBe(true);
    for (const category of VOICING_CATEGORIES) expect(VOICING_CATEGORY_INFO[category].description.length).toBeGreaterThan(20);
    expect(() => libraryVoicings('not a chord')).toThrow(RangeError);
  });
});
