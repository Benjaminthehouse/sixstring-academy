import { describe, expect, it } from 'vitest';
import { SCALES, filterScales, getScale, scalePcs, scaleToneMap } from '@/core/theory';
import {
  CAGED_ORDER, PATTERN_SYSTEMS, TUNINGS, allScalePatterns, cagedShapeOfRoots, checkFingering, fingerLine, hasStandardIntervals, midiAt,
  patternContaining, patternRootPc, patternSystemsFor, positionPatternAt, scalePattern, scalePatterns, scalePositions, tonePositions, tuningIntervals,
  type FretPosition, type PatternSystem, type ScalePattern,
} from './index';

/** Frets per string of a pattern, lowest string first: `[[5, 8], [5, 7], …]`. */
function shape(p: ScalePattern): number[][] {
  const strings = [...new Set(p.notes.map((n) => n.string))];
  return strings.map((s) => p.notes.filter((n) => n.string === s).map((n) => n.fret));
}

function keys(positions: readonly FretPosition[]): string[] {
  return positions.map((p) => `${p.string}:${p.fret}`).sort();
}

/** Everything that must hold for any pattern of any scale in any tuning. */
function expectSound(p: ScalePattern, tonic: string, scaleId: string, opts: { tuning?: string; capo?: number } = {}): void {
  const label = `${tonic} ${scaleId} ${p.id} (${opts.tuning ?? 'standard'})`;
  const pcs = scalePcs(tonic, scaleId);
  const map = scaleToneMap(tonic, scaleId);
  expect(p.notes.length, label).toBeGreaterThan(0);
  for (const n of p.notes) {
    // The note really is where the pattern says, and it really is in the scale.
    expect(n.midi, label).toBe(midiAt(n, opts));
    expect(pcs, label).toContain(n.midi % 12);
    const tone = map.byPc[n.midi % 12];
    expect(n.note, label).toBe(tone.note);
    expect(n.degree, label).toBe(tone.degree);
    expect(n.degreeIndex, label).toBe(tone.index);
    expect(n.isRoot, label).toBe(n.midi % 12 === map.rootPc);
    if (n.fret === 0) expect(n.finger, label).toBe(0);
    else expect([1, 2, 3, 4], label).toContain(n.finger);
  }
  // No position twice.
  expect(new Set(keys(p.notes)).size, label).toBe(p.notes.length);
  // One finger per fret, or the stretch/shift is said out loud.
  expect(checkFingering(p.notes), label).toEqual([]);
  expect(keys(p.roots), label).toEqual(keys(p.notes.filter((n) => n.isRoot)));
  expect(p.minFret, label).toBe(Math.min(...p.notes.map((n) => n.fret)));
  expect(p.maxFret, label).toBe(Math.max(...p.notes.map((n) => n.fret)));
  expect(p.hasStretch, label).toBe(p.notes.some((n) => n.stretch));
  expect(p.hasShift, label).toBe(p.notes.some((n) => n.shift));
  expect(p.tonic, label).toBe(map.root);
  expect(p.scale, label).toBe(scaleId);
}

describe('scale positions', () => {
  it('lists every scale note on the neck, and nothing else', () => {
    const positions = scalePositions('C', 'major', { maxFret: 12 });
    const pcs = scalePcs('C', 'major');
    let expected = 0;
    for (let string = 1; string <= 6; string++) {
      for (let fret = 0; fret <= 12; fret++) if (pcs.includes(midiAt({ string, fret }) % 12)) expected++;
    }
    expect(positions).toHaveLength(expected);
    expect(positions.every((p) => pcs.includes(p.midi % 12))).toBe(true);
    expect(positions.find((p) => p.string === 5 && p.fret === 3)).toMatchObject({ note: 'C', degree: '1', degreeIndex: 0, isRoot: true, midi: 48 });
    expect(positions.find((p) => p.string === 1 && p.fret === 1)).toMatchObject({ note: 'F', degree: '4', isRoot: false });
    expect(positions.find((p) => p.string === 6 && p.fret === 2)).toBeUndefined();
  });

  it('spells notes the way the scale does', () => {
    const fSharp = scalePositions('F#', 'major', { maxFret: 4 });
    expect(fSharp.find((p) => p.string === 1 && p.fret === 1)?.note).toBe('E#');
    const flat = scalePositions('Bb', 'minor-pentatonic', { maxFret: 4 });
    expect(new Set(flat.map((p) => p.note))).toEqual(new Set(['Bb', 'Db', 'Eb', 'F', 'Ab']));
    expect(flat.filter((p) => p.isRoot).every((p) => p.note === 'Bb' && p.degree === '1')).toBe(true);
  });

  it('respects tuning, capo and fret range', () => {
    const dropD = scalePositions('D', 'minor-pentatonic', { tuning: 'drop-d', maxFret: 3 });
    expect(dropD[0]).toMatchObject({ string: 6, fret: 0, note: 'D', isRoot: true });
    const capo = scalePositions('A', 'major', { capo: 2, minFret: 0, maxFret: 0 });
    // With a capo on 2 the open strings sound F# B E A C# F#: all in A major.
    expect(capo.map((p) => p.note)).toEqual(['F#', 'B', 'E', 'A', 'C#', 'F#']);
    expect(scalePositions('C', 'major', { minFret: 5, maxFret: 8 }).every((p) => p.fret >= 5 && p.fret <= 8)).toBe(true);
    expect(() => scalePositions('C', 'no-such-scale')).toThrow(RangeError);
    expect(tonePositions(scaleToneMap('C', 'major'), { maxFret: 3 }).length).toBe(scalePositions('C', 'major', { maxFret: 3 }).length);
  });
});

describe('pentatonic boxes', () => {
  const boxes = scalePatterns('A', 'minor-pentatonic');

  it('puts A minor pentatonic box 1 at frets 5 to 8', () => {
    const box1 = boxes[0];
    expect(box1.id).toBe('box-1');
    expect(box1.name).toBe('Box 1');
    expect(shape(box1)).toEqual([[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]]);
    expect([box1.minFret, box1.maxFret, box1.span, box1.position]).toEqual([5, 8, 4, 5]);
    expect(box1.positionName).toBe('5th position');
    expect(keys(box1.roots)).toEqual(['1:5', '4:7', '6:5']);
    // The standard fingering: index on 5, ring on 7, little finger on 8.
    expect(box1.notes.map((n) => n.finger)).toEqual([1, 4, 1, 3, 1, 3, 1, 3, 1, 4, 1, 4]);
    expect(box1.hasStretch || box1.hasShift).toBe(false);
    expect(box1.shape).toBe('E');
  });

  it('gives the five textbook boxes', () => {
    expect(boxes.map((b) => shape(b))).toEqual([
      [[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]],
      [[8, 10], [7, 10], [7, 10], [7, 9], [8, 10], [8, 10]],
      [[10, 12], [10, 12], [10, 12], [9, 12], [10, 13], [10, 12]],
      [[0, 3], [0, 3], [0, 2], [0, 2], [1, 3], [0, 3]],
      [[3, 5], [3, 5], [2, 5], [2, 5], [3, 5], [3, 5]],
    ]);
    expect(boxes.map((b) => b.shape)).toEqual(['E', 'D', 'C', 'A', 'G']);
    expect(boxes[3].positionName).toBe('Open position');
    for (const b of boxes) expectSound(b, 'A', 'minor-pentatonic');
  });

  it('starts box n on the nth note of the scale, two notes per string', () => {
    for (const s of filterScales({ size: 5 })) {
      for (const tonic of ['E', 'Bb']) {
        const list = scalePatterns(tonic, s.id);
        expect(list, `${tonic} ${s.id}`).toHaveLength(5);
        list.forEach((b, i) => {
          expect(b.system).toBe('box');
          expect(b.index).toBe(i);
          expect(b.notes[0].degreeIndex).toBe(i);
          expect(shape(b).every((frets) => frets.length === 2)).toBe(true);
          expectSound(b, tonic, s.id);
          // Each note is the next note of the scale: no gaps, no repeats.
          b.notes.forEach((n, k) => expect(n.degreeIndex).toBe((i + k) % 5));
        });
      }
    }
  });

  it('plays the open E minor pentatonic with finger = fret', () => {
    const open = scalePatterns('E', 'minor-pentatonic')[0];
    expect(shape(open)).toEqual([[0, 3], [0, 2], [0, 2], [0, 2], [0, 3], [0, 3]]);
    expect(open.notes.map((n) => n.finger)).toEqual([0, 3, 0, 2, 0, 2, 0, 2, 0, 3, 0, 3]);
    expect(open.positionName).toBe('Open position');
  });

  it('repeats boxes an octave up on request', () => {
    const all = scalePatterns('A', 'minor-pentatonic', { allOctaves: true });
    const high = all.find((b) => b.id === 'box-1-8va')!;
    expect(shape(high)).toEqual([[17, 20], [17, 19], [17, 19], [17, 19], [17, 20], [17, 20]]);
    expect(all.length).toBeGreaterThan(5);
    expect(scalePatterns('A', 'minor-pentatonic', { minFret: 6 })[0].minFret).toBe(17);
  });
});

describe('CAGED positions', () => {
  const caged = scalePatterns('C', 'major');
  const byShape: Record<string, ScalePattern> = Object.fromEntries(caged.map((p) => [p.shape ?? '', p]));

  it('gives the five textbook C major positions, lowest first', () => {
    expect(caged.map((p) => p.shape)).toEqual(['C', 'A', 'G', 'E', 'D']);
    expect(caged.every((p) => p.system === 'caged')).toBe(true);
    expect(shape(byShape.C)).toEqual([[0, 1, 3], [0, 2, 3], [0, 2, 3], [0, 2], [0, 1, 3], [0, 1, 3]]);
    expect(shape(byShape.A)).toEqual([[3, 5], [2, 3, 5], [2, 3, 5], [2, 4, 5], [3, 5, 6], [3, 5]]);
    expect(shape(byShape.G)).toEqual([[5, 7, 8], [5, 7, 8], [5, 7], [4, 5, 7], [5, 6, 8], [5, 7, 8]]);
    expect(shape(byShape.E)).toEqual([[7, 8, 10], [7, 8, 10], [7, 9, 10], [7, 9, 10], [8, 10], [7, 8, 10]]);
    expect(shape(byShape.D)).toEqual([[10, 12, 13], [10, 12], [9, 10, 12], [9, 10, 12], [10, 12, 13], [10, 12, 13]]);
    expect(caged.map((p) => p.index)).toEqual(caged.map((p) => CAGED_ORDER.indexOf(p.shape!)));
  });

  it('has the roots where each chord shape has them', () => {
    expect(keys(byShape.C.roots)).toEqual(['2:1', '5:3']);
    expect(keys(byShape.A.roots)).toEqual(['3:5', '5:3']);
    expect(keys(byShape.G.roots)).toEqual(['1:8', '3:5', '6:8']);
    expect(keys(byShape.E.roots)).toEqual(['1:8', '4:10', '6:8']);
    expect(keys(byShape.D.roots)).toEqual(['2:13', '4:10']);
  });

  it('uses the textbook fingerings: one finger per fret, a shift where the pattern leans out', () => {
    const fingers = (p: ScalePattern, string: number) => p.notes.filter((n) => n.string === string).map((n) => n.finger);
    expect(byShape.E.notes.every((n) => n.finger === n.fret - 6 && !n.shift && !n.stretch)).toBe(true);
    expect(byShape.C.notes.every((n) => n.finger === n.fret)).toBe(true);
    expect(fingers(byShape.G, 3)).toEqual([1, 2, 4]); // 4 5 7: the hand leans back one fret
    expect(byShape.G.notes.find((n) => n.string === 3 && n.fret === 4)!.shift).toBe(true);
    expect(fingers(byShape.A, 2)).toEqual([1, 3, 4]); // 3 5 6
    expect(fingers(byShape.A, 1)).toEqual([1, 3]);
    expect(fingers(byShape.D, 4)).toEqual([1, 2, 4]); // 9 10 12
    expect(byShape.E.position).toBe(7);
    expect(byShape.E.positionName).toBe('7th position');
    expect(byShape.C.positionName).toBe('Open position');
  });

  it('covers the whole neck between them', () => {
    const everything = scalePatterns('C', 'major', { allOctaves: true, maxFret: 22 });
    const covered = new Set(everything.flatMap((p) => keys(p.notes)));
    for (const tone of scalePositions('C', 'major', { maxFret: 20 })) {
      expect(covered.has(`${tone.string}:${tone.fret}`), `string ${tone.string} fret ${tone.fret}`).toBe(true);
    }
    expect(everything.find((p) => p.id === 'caged-e-8va')!.minFret).toBe(19);
  });

  it('names minor positions after the minor chord shapes', () => {
    const minor = scalePatterns('A', 'minor');
    expect(minor.map((p) => p.shape)).toEqual(['A', 'G', 'E', 'D', 'C']);
    const e = minor.find((p) => p.shape === 'E')!;
    // A minor in fifth position: the Em shape, root under the index finger on string 6.
    expect(shape(e)).toEqual([[5, 7, 8], [5, 7, 8], [5, 7], [4, 5, 7], [5, 6, 8], [5, 7, 8]]);
    expect(keys(e.roots)).toEqual(['1:5', '4:7', '6:5']);
    // The same notes as C major, so the same five sets of positions.
    expect(new Set(minor.map((p) => keys(p.notes).join())).size).toBe(5);
    expect(new Set(minor.map((p) => keys(p.notes).join()))).toEqual(new Set(caged.map((p) => keys(p.notes).join())));
  });

  it('gives every mode of the major scale the same five shapes', () => {
    const modes: Array<[string, string]> = [['D', 'dorian'], ['E', 'phrygian'], ['F', 'lydian'], ['G', 'mixolydian'], ['B', 'locrian']];
    const reference = new Set(caged.map((p) => shape(p).map((f) => f.map((x) => x % 12).join('.')).join('|')));
    for (const [tonic, mode] of modes) {
      const list = scalePatterns(tonic, mode);
      expect(new Set(list.map((p) => p.shape)).size, mode).toBe(5);
      const got = new Set(list.map((p) => shape(p).map((f) => f.map((x) => x % 12).join('.')).join('|')));
      expect(got, mode).toEqual(reference);
      for (const p of list) expectSound(p, tonic, mode);
    }
  });

  it('gives every seven-note scale five different positions of at most five frets', () => {
    for (const s of filterScales({ size: 7 })) {
      for (const tonic of ['C', 'F#', 'Bb']) {
        const list = scalePatterns(tonic, s.id);
        const label = `${tonic} ${s.id}`;
        expect(list, label).toHaveLength(5);
        expect(new Set(list.map((p) => p.shape)), label).toEqual(new Set(CAGED_ORDER));
        expect(new Set(list.map((p) => keys(p.notes).join())).size, label).toBe(5);
        for (const p of list) {
          expectSound(p, tonic, s.id);
          expect(p.span, `${label} ${p.id}`).toBeLessThanOrEqual(5);
          // Every scale pitch between the lowest and highest note is in the pattern: a position has no holes.
          const midis = new Set(p.notes.map((n) => n.midi));
          const pcs = scalePcs(tonic, s.id);
          for (let m = Math.min(...midis); m <= Math.max(...midis); m++) {
            if (pcs.includes(m % 12)) expect(midis.has(m), `${label} ${p.id} midi ${m}`).toBe(true);
          }
          // The shape's own root sits inside it.
          expect(p.roots.length, `${label} ${p.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('works on a seven-string and in transposed standard tunings', () => {
    const seven = scalePatterns('C', 'major', { tuning: 'standard-7' });
    expect(seven.map((p) => p.shape)).toEqual(['C', 'A', 'G', 'E', 'D']);
    expect(seven[3].strings).toEqual([7, 6, 5, 4, 3, 2, 1]);
    for (const p of seven) expectSound(p, 'C', 'major', { tuning: 'standard-7' });
    const flat = scalePatterns('Eb', 'major', { tuning: 'half-step-down' });
    // E flat major a half step down is fingered like E major in standard tuning.
    expect(flat.map((p) => shape(p))).toEqual(scalePatterns('E', 'major').map((p) => shape(p)));
    const capo = scalePatterns('D', 'major', { capo: 2 });
    expect(capo.map((p) => shape(p))).toEqual(scalePatterns('C', 'major').map((p) => shape(p)));
    for (const p of capo) expectSound(p, 'D', 'major', { capo: 2 });
  });

  it('reads the shape off the root strings', () => {
    expect(cagedShapeOfRoots([{ string: 6, fret: 8 }, { string: 4, fret: 10 }, { string: 1, fret: 8 }])).toBe('E');
    expect(cagedShapeOfRoots([{ string: 5, fret: 3 }, { string: 3, fret: 5 }])).toBe('A');
    expect(cagedShapeOfRoots([{ string: 5, fret: 3 }, { string: 2, fret: 1 }])).toBe('C');
    expect(cagedShapeOfRoots([{ string: 4, fret: 0 }, { string: 2, fret: 3 }])).toBe('D');
    expect(cagedShapeOfRoots([{ string: 6, fret: 3 }, { string: 3, fret: 0 }, { string: 1, fret: 3 }])).toBe('G');
    expect(cagedShapeOfRoots([{ string: 6, fret: 3 }])).toBeNull();
  });
});

describe('three notes per string', () => {
  it('gives G major its seven patterns with the usual fingerings', () => {
    const list = scalePatterns('G', 'major', { system: '3nps' });
    expect(list).toHaveLength(7);
    expect(shape(list[0])).toEqual([[3, 5, 7], [3, 5, 7], [4, 5, 7], [4, 5, 7], [5, 7, 8], [5, 7, 8]]);
    expect(list[0].notes.map((n) => n.finger)).toEqual([1, 2, 4, 1, 2, 4, 1, 2, 4, 1, 2, 4, 1, 3, 4, 1, 3, 4]);
    expect(list[0].notes.slice(0, 3).map((n) => n.stretch)).toEqual([false, true, true]); // whole step, whole step
    expect(list[0].hasStretch).toBe(true);
    expect(list[0].name).toBe('3NPS pattern 1');
    list.forEach((p, i) => expect(p.notes[0].degreeIndex).toBe(i));
  });

  it('really has three notes on every string, for every seven-note scale', () => {
    for (const s of filterScales({ size: 7 })) {
      for (const tonic of ['G', 'Db']) {
        const list = scalePatterns(tonic, s.id, { system: '3nps' });
        expect(list, `${tonic} ${s.id}`).toHaveLength(7);
        for (const p of list) {
          expect(shape(p).map((f) => f.length), `${tonic} ${s.id} ${p.id}`).toEqual([3, 3, 3, 3, 3, 3]);
          expectSound(p, tonic, s.id);
          // Eighteen consecutive notes of the scale, strictly rising.
          p.notes.forEach((n, k) => {
            expect(n.degreeIndex).toBe((p.index + k) % 7);
            if (k > 0) expect(n.midi).toBeGreaterThan(p.notes[k - 1].midi);
          });
        }
      }
    }
  });

  it('adapts to other string counts', () => {
    const bass = scalePatterns('G', 'major', { system: '3nps', tuning: 'bass' });
    expect(bass).toHaveLength(7);
    expect(shape(bass[0])).toEqual([[3, 5, 7], [3, 5, 7], [4, 5, 7], [4, 5, 7]]);
  });
});

describe('positions for other scales', () => {
  it('lays the blues scale out like the pentatonic boxes', () => {
    const blues = scalePatterns('A', 'minor-blues');
    expect(blues.map((p) => p.system)).toEqual(['position', 'position', 'position', 'position', 'position']);
    expect(blues.map((p) => p.name)).toEqual(['Position 1', 'Position 2', 'Position 3', 'Position 4', 'Position 5']);
    expect(shape(blues[0])).toEqual([[5, 8], [5, 6, 7], [5, 7], [5, 7, 8], [5, 8], [5, 8]]);
    expect(blues.map((p) => p.shape)).toEqual(['E', 'D', 'C', 'A', 'G']);
  });

  it('groups every other scale by hand position, at most five frets wide', () => {
    for (const s of SCALES.filter((x) => x.size !== 5 && x.size !== 7)) {
      for (const tonic of ['C', 'Ab']) {
        const list = scalePatterns(tonic, s.id);
        const label = `${tonic} ${s.id}`;
        expect(list.length, label).toBeGreaterThanOrEqual(3);
        expect(list.every((p) => p.system === 'position'), label).toBe(true);
        expect(new Set(list.map((p) => keys(p.notes).join())).size, label).toBe(list.length);
        for (const p of list) {
          expectSound(p, tonic, s.id);
          expect(p.span, `${label} ${p.id}`).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it('finds the position under the hand at any fret', () => {
    const at5 = positionPatternAt('A', 'minor-pentatonic', 5)!;
    expect(shape(at5)).toEqual([[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]]);
    const open = positionPatternAt('C', 'major', 0)!;
    expect(open.positionName).toBe('Open position');
    expect(shape(open)).toEqual([[0, 1, 3], [0, 2, 3], [0, 2, 3], [0, 2], [0, 1, 3], [0, 1, 3]]);
    for (let fret = 0; fret <= 15; fret++) {
      const p = positionPatternAt('E', 'phrygian-dominant', fret)!;
      expectSound(p, 'E', 'phrygian-dominant');
      expect(p.span).toBeLessThanOrEqual(5);
    }
    expect(positionPatternAt('C', 'major', 30)).toBeNull();
  });
});

describe('runs along the neck', () => {
  it('plays a scale up one string', () => {
    const strings = scalePatterns('C', 'major', { system: 'single-string' });
    expect(strings).toHaveLength(6);
    expect(strings.map((p) => p.name)).toEqual(['String 6', 'String 5', 'String 4', 'String 3', 'String 2', 'String 1']);
    expect(shape(strings[0])).toEqual([[0, 1, 3, 5, 7, 8, 10, 12]]);
    expect(shape(strings[4])).toEqual([[0, 1, 3, 5, 6, 8, 10, 12]]);
    for (const p of strings) {
      expectSound(p, 'C', 'major');
      expect(p.strings).toHaveLength(1);
      expect(p.maxFret - p.minFret).toBe(12);
      expect(p.hasShift).toBe(true);
    }
    // F# major has no open strings: the run starts at the first note there is.
    expect(shape(scalePatterns('F#', 'major', { system: 'single-string' })[0])).toEqual([[1, 2, 4, 6, 7, 9, 11, 13]]);
  });

  it('plays one octave on two neighbouring strings', () => {
    const major = scalePatterns('C', 'major', { system: 'two-string' });
    expect(major.map((p) => p.name)).toEqual(['Strings 6–5', 'Strings 5–4', 'Strings 4–3', 'Strings 3–2', 'Strings 2–1']);
    // Two tetrachords: the same shape on both strings.
    expect(shape(major[1])).toEqual([[3, 5, 7, 8], [5, 7, 9, 10]]);
    expect(shape(major[3])).toEqual([[5, 7, 9, 10], [8, 10, 12, 13]]);
    const pent = scalePatterns('A', 'minor-pentatonic', { system: 'two-string' });
    expect(shape(pent[0])).toEqual([[5, 8, 10], [7, 10, 12]]);
    expect(shape(pent[1])).toEqual([[0, 3, 5], [2, 5, 7]]);
    for (const p of [...major, ...pent]) {
      expect(p.notes[0].isRoot && p.notes[p.notes.length - 1].isRoot).toBe(true);
      expect(p.notes[p.notes.length - 1].midi - p.notes[0].midi).toBe(12);
      expect(p.strings).toHaveLength(2);
    }
    for (const p of major) expectSound(p, 'C', 'major');
    for (const p of pent) expectSound(p, 'A', 'minor-pentatonic');
  });

  it('repeats one octave shape diagonally across the neck', () => {
    const pent = scalePatterns('A', 'minor-pentatonic', { system: 'diagonal' });
    expect(pent).toHaveLength(5);
    // The classic extended pentatonic, from G on the low string.
    expect(shape(pent[4])).toEqual([[3, 5], [3, 5, 7], [5, 7], [5, 7, 9], [8, 10], [8, 10, 12, 15]]);
    const major = scalePatterns('G', 'major', { system: 'diagonal' });
    expect(major).toHaveLength(7);
    expect(shape(major[0])).toEqual([[3, 5, 7], [3, 5, 7, 9], [5, 7, 9], [5, 7, 9, 11], [8, 10, 12], [8, 10, 12, 14, 15]]);
    for (const p of pent) expectSound(p, 'A', 'minor-pentatonic');
    for (const p of major) {
      expectSound(p, 'G', 'major');
      p.notes.forEach((n, k) => {
        if (k > 0) expect(n.midi).toBeGreaterThan(p.notes[k - 1].midi);
      });
      // Three octaves and the note that closes them.
      expect(p.notes[p.notes.length - 1].midi - p.notes[0].midi).toBe(36);
    }
  });
});

describe('every scale, every system, every tuning', () => {
  it('builds sound patterns for the whole catalog in standard tuning', () => {
    for (const s of SCALES) {
      const systems = patternSystemsFor(s);
      expect(systems.length).toBeGreaterThanOrEqual(4);
      const all = allScalePatterns('D', s.id);
      expect(Object.keys(all)).toEqual(systems);
      for (const system of systems) {
        const list = all[system]!;
        expect(list.length, `${s.id} ${system}`).toBeGreaterThan(0);
        expect(new Set(list.map((p) => p.id)).size, `${s.id} ${system}`).toBe(list.length);
        for (const p of list) {
          expect(p.system).toBe(system);
          expectSound(p, 'D', s.id);
        }
      }
    }
  });

  it('recommends the right systems', () => {
    expect(patternSystemsFor('minor-pentatonic')[0]).toBe('box');
    expect(patternSystemsFor('major')[0]).toBe('caged');
    expect(patternSystemsFor('major').slice(1, 2)).toEqual(['3nps']);
    expect(patternSystemsFor('major', 'dadgad')[0]).toBe('position');
    expect(patternSystemsFor('minor-blues')[0]).toBe('position');
    expect(patternSystemsFor('whole-tone')).not.toContain('3nps');
    expect(patternSystemsFor('diminished-half-whole')).toContain('3nps');
    for (const system of patternSystemsFor('major')) expect(PATTERN_SYSTEMS).toContain(system);
    expect(() => patternSystemsFor('nope')).toThrow(RangeError);
  });

  it('builds sound patterns in every catalog tuning', () => {
    const cases: Array<[string, string]> = [['C', 'major'], ['A', 'minor-pentatonic'], ['E', 'minor-blues'], ['G', 'harmonic-minor']];
    for (const t of TUNINGS) {
      for (const [tonic, scaleId] of cases) {
        const type = getScale(scaleId)!;
        for (const system of patternSystemsFor(type, t)) {
          const list = scalePatterns(tonic, scaleId, { tuning: t.id, system });
          expect(list.length, `${t.id} ${scaleId} ${system}`).toBeGreaterThan(0);
          for (const p of list) {
            expectSound(p, tonic, scaleId, { tuning: t.id });
            expect(p.tuning).toBe(t.id);
            expect(p.shape === null || hasStandardIntervals(t)).toBe(true);
            // A hand position is five frets at most, unless two strings are tuned more than a fourth apart:
            // there the lower string carries on up the neck (a shift) so that no scale note goes missing.
            const wide = tuningIntervals(t).some((step) => step > 5);
            if (system === 'position' || system === 'caged') expect(p.span, `${t.id} ${p.id}`).toBeLessThanOrEqual(wide ? 8 : 5);
            if (wide && p.span > 5) expect(p.hasShift || p.hasStretch || p.minFret === 0, `${t.id} ${p.id}`).toBe(true);
          }
        }
      }
    }
  });

  it('falls back to positions where CAGED does not apply', () => {
    const dadgad = scalePatterns('D', 'major', { tuning: 'dadgad', system: 'caged' });
    expect(dadgad.every((p) => p.system === 'position' && p.shape === null)).toBe(true);
    expect(dadgad[0].positionName).toBe('Open position');
    // Between them the positions hold every pitch the first twelve frets can sound.
    const covered = new Set(dadgad.flatMap((p) => p.notes.map((n) => n.midi)));
    for (const tone of scalePositions('D', 'major', { tuning: 'dadgad', maxFret: 11 })) expect(covered.has(tone.midi), `midi ${tone.midi}`).toBe(true);
    // In open tunings pentatonic boxes sprawl, so hand positions come first there.
    expect(patternSystemsFor('minor-pentatonic', 'open-c')[0]).toBe('position');
    expect(patternSystemsFor('minor-pentatonic', 'all-fourths')[0]).toBe('box');
  });

  it('looks patterns up one at a time', () => {
    expect(scalePattern('A', 'minor-pentatonic', 'box', 0)!.id).toBe('box-1');
    expect(scalePattern('C', 'major', 'caged', CAGED_ORDER.indexOf('E'))!.shape).toBe('E');
    expect(scalePattern('C', 'major', '3nps', 9)).toBeNull();
    const boxes = scalePatterns('A', 'minor-pentatonic');
    expect(patternContaining(boxes, { string: 3, fret: 9 })!.id).toBe('box-2');
    expect(patternContaining(boxes, { string: 3, fret: 6 })).toBeNull();
    expect(patternRootPc(boxes[0])).toBe(9);
    const systems: PatternSystem[] = ['box', 'diagonal'];
    expect(Object.keys(allScalePatterns('A', 'minor-pentatonic', { systems }))).toEqual(systems);
  });
});

describe('fingering lines', () => {
  it('keeps one finger per fret and names every exception', () => {
    const line = [5, 7, 8].map((fret) => ({ string: 6, fret }));
    expect(fingerLine(line).map((f) => f.finger)).toEqual([1, 3, 4]);
    const wide = [3, 5, 7].map((fret) => ({ string: 6, fret }));
    expect(fingerLine(wide, { wide: true })).toEqual([
      { finger: 1, stretch: false, shift: false }, { finger: 2, stretch: true, shift: false }, { finger: 4, stretch: true, shift: false },
    ]);
    // Without permission to stretch the same notes become a shift.
    const shifted = fingerLine(wide);
    expect(shifted.map((f) => f.finger)).toEqual([1, 3, 4]);
    expect(shifted[2].shift).toBe(true);
    expect(fingerLine([{ string: 3, fret: 0 }, { string: 3, fret: 2 }], { home: 1 }).map((f) => f.finger)).toEqual([0, 2]);
  });

  it('catches fingerings that break the contract', () => {
    const ok = [{ string: 6, fret: 5, finger: 1, stretch: false, shift: false }, { string: 6, fret: 8, finger: 4, stretch: false, shift: false }] as const;
    expect(checkFingering(ok)).toEqual([]);
    const silentStretch = [ok[0], { string: 6, fret: 9, finger: 4, stretch: false, shift: false }] as const;
    expect(checkFingering(silentStretch)).toHaveLength(1);
    expect(checkFingering([ok[0], { ...silentStretch[1], stretch: true }])).toEqual([]);
    expect(checkFingering([{ string: 1, fret: 0, finger: 2, stretch: false, shift: false }])).toHaveLength(1);
    expect(checkFingering([{ string: 1, fret: 3, finger: 0, stretch: false, shift: false }])).toHaveLength(1);
    expect(checkFingering([ok[0], { string: 6, fret: 12, finger: 4, stretch: true, shift: false }])).toHaveLength(1);
    expect(checkFingering([ok[0], { string: 6, fret: 7, finger: 3, stretch: true, shift: true }])).toHaveLength(1);
    const crossed = [{ string: 6, fret: 5, finger: 2, stretch: false, shift: false }, { string: 6, fret: 6, finger: 1, stretch: true, shift: false }] as const;
    expect(checkFingering(crossed).length).toBeGreaterThan(0);
  });
});
