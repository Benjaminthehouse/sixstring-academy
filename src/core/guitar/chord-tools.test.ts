import { describe, expect, it } from 'vitest';
import { chordPcs, note as parseNote } from '@/core/theory';
import {
  arpeggioPatterns, arpeggioPositions, buildVoicing, checkFingering, formatFrets, identifyFretted, midiAt, openChordVoicings, toFrets,
  voicingFromFrets,
} from './index';

describe('identifying fretted chords', () => {
  it('names the textbook shapes', () => {
    expect(identifyFretted('x32010').symbol).toBe('C');
    expect(identifyFretted('320003').symbol).toBe('G');
    expect(identifyFretted('xx0232').symbol).toBe('D');
    expect(identifyFretted('x02210').symbol).toBe('Am');
    expect(identifyFretted('022100').symbol).toBe('E');
    expect(identifyFretted('133211').symbol).toBe('F');
    expect(identifyFretted('x24432').symbol).toBe('Bm');
    expect(identifyFretted('320001').symbol).toBe('G7');
    expect(identifyFretted('x32000').symbol).toBe('Cmaj7');
    expect(identifyFretted('x02010').symbol).toBe('Am7');
    expect(identifyFretted('xx0233').symbol).toBe('Dsus4');
    expect(identifyFretted('022xxx').symbol).toBe('E5');
    expect(identifyFretted('032010').symbol).toBe('C/E');
    expect(identifyFretted('200232').symbol).toBe('D/F#');
    expect(identifyFretted('x7678x').symbol).toBe('E7#9');
    expect(identifyFretted('x2323x').symbol).toBe('Bm7b5');
  });

  it('names every open chord of the library', () => {
    for (const v of openChordVoicings()) {
      const found = identifyFretted(v.frets);
      // A #11 chord without its fifth is read under its other name (xx3200: Fmaj7#11 or Fmaj7b5).
      const names = found.matches.map((m) => m.symbol.replace('maj7b5', 'maj7#11'));
      expect(names, formatFrets(v.frets)).toContain(v.chord);
    }
  });

  it('accepts positions, fret arrays and fret strings', () => {
    const positions = [{ string: 5, fret: 3 }, { string: 4, fret: 2 }, { string: 3, fret: 0 }, { string: 2, fret: 1 }, { string: 1, fret: 0 }];
    expect(identifyFretted(positions).symbol).toBe('C');
    expect(identifyFretted([null, 3, 2, 0, 1, 0]).symbol).toBe('C');
    expect(toFrets(positions)).toEqual([null, 3, 2, 0, 1, 0]);
    expect(toFrets('x32010')).toEqual([null, 3, 2, 0, 1, 0]);
    // Two fingers on one string: the higher fret sounds.
    expect(toFrets([{ string: 6, fret: 1 }, { string: 6, fret: 3 }])).toEqual([3, null, null, null, null, null]);
    expect(toFrets([{ string: 4, fret: 0 }], 4)).toEqual([0, null, null, null]);
    expect(() => toFrets([{ string: 7, fret: 0 }])).toThrow(RangeError);
    expect(() => identifyFretted('x3201')).toThrow(RangeError);
  });

  it('describes every sounding note', () => {
    const c = identifyFretted('x32010');
    expect(c.frets).toEqual([null, 3, 2, 0, 1, 0]);
    expect(c.notes.map((n) => `${n.string}:${n.fret} ${n.note} ${n.degree} ${n.role}`)).toEqual([
      '5:3 C 1 root', '4:2 E 3 third', '3:0 G 5 fifth', '2:1 C 1 root', '1:0 E 3 third',
    ]);
    expect(c.notes.every((n) => n.midi === midiAt(n))).toBe(true);
    const slash = identifyFretted('302210', { limit: 20 });
    expect(slash.matches.map((m) => m.symbol)).toContain('Am/G');
    const sharp = identifyFretted('244322');
    expect(sharp.notes.map((n) => n.note)).toEqual(sharp.symbol === 'F#' ? ['F#', 'C#', 'F#', 'A#', 'C#', 'F#'] : ['Gb', 'Db', 'Gb', 'Bb', 'Db', 'Gb']);
  });

  it('spells for the key it is told', () => {
    expect(identifyFretted('244322', { key: 'B major' }).symbol).toBe('F#');
    expect(identifyFretted('244322', { key: 'Db major' }).symbol).toBe('Gb');
    expect(identifyFretted('x46664', { key: 'Ab major' }).symbol).toBe('Db');
    expect(identifyFretted('x46664', { key: 'E major' }).symbol).toBe('C#');
  });

  it('follows tuning and capo', () => {
    expect(identifyFretted('320003', { capo: 2 }).symbol).toBe('A');
    expect(identifyFretted('x32010', { capo: 3 }).symbol).toMatch(/^(Eb|D#)$/);
    expect(identifyFretted('000000', { tuning: 'open-g' }).symbol).toBe('G/D');
    expect(identifyFretted('x00000', { tuning: 'open-g' }).symbol).toBe('G');
    expect(identifyFretted('000xxx', { tuning: 'drop-d' }).symbol).toBe('D5');
    expect(identifyFretted('000000', { tuning: 'dadgad' }).symbol).toBe('Dsus4');
    expect(identifyFretted('0003', { tuning: 'ukulele' }).matches.map((m) => m.symbol)).toContain('C');
    expect(identifyFretted('022100', { tuning: 'half-step-down' }).symbol).toMatch(/^(Eb|D#)$/);
  });

  it('says so when there is nothing to name', () => {
    const one = identifyFretted('x3xxxx');
    expect(one.symbol).toBeNull();
    expect(one.matches).toEqual([]);
    expect(one.notes).toEqual([{ string: 5, fret: 3, midi: 48, note: 'C', degree: null, role: null }]);
    expect(identifyFretted('xxxxxx').notes).toEqual([]);
    const cluster = identifyFretted('012345');
    expect(cluster.notes).toHaveLength(6);
    expect(cluster.notes.every((n) => parseNote(n.note).chroma === n.midi % 12)).toBe(true);
  });

  it('turns a made-up shape into a full voicing', () => {
    const v = voicingFromFrets('x32010')!;
    expect(v).toEqual(buildVoicing('C', 'x32010'));
    expect(voicingFromFrets('032010')!.chord).toBe('C/E');
    expect(voicingFromFrets('302210', { as: 'Am/G' })!.chord).toBe('Am/G');
    expect(voicingFromFrets('x3xxxx')).toBeNull();
    expect(voicingFromFrets('0 7 9 9 9 12')).toBeNull(); // E major, but no hand spans it
    expect(voicingFromFrets('320003', { capo: 2 })!.chord).toBe('A');
    // Read as another chord only when the notes allow it.
    expect(voicingFromFrets('x32010', { as: 'G' })).toBeNull();
    expect(voicingFromFrets('x32010', { as: 'Cmaj7' })).toBeNull(); // no B: it is not a major seventh chord
    const rootless = voicingFromFrets('x32010', { as: 'Am7' })!; // C E G: an A minor seventh without its root
    expect([rootless.rootless, rootless.omitted]).toEqual([true, ['1']]);
  });
});

describe('arpeggios', () => {
  it('lists every chord tone on the neck with its role', () => {
    const tones = arpeggioPositions('Am7', { maxFret: 12 });
    const pcs = chordPcs('Am7');
    expect(tones.every((t) => pcs.includes(t.midi % 12))).toBe(true);
    let expected = 0;
    for (let string = 1; string <= 6; string++) for (let fret = 0; fret <= 12; fret++) if (pcs.includes(midiAt({ string, fret }) % 12)) expected++;
    expect(tones).toHaveLength(expected);
    expect(tones.find((t) => t.string === 5 && t.fret === 0)).toMatchObject({ note: 'A', degree: '1', role: 'root', isRoot: true });
    expect(tones.find((t) => t.string === 2 && t.fret === 1)).toMatchObject({ note: 'C', degree: 'b3', role: 'third' });
    expect(tones.find((t) => t.string === 3 && t.fret === 0)).toMatchObject({ note: 'G', degree: 'b7', role: 'seventh' });
    expect(new Set(tones.map((t) => t.role))).toEqual(new Set(['root', 'third', 'fifth', 'seventh']));
    // A slash bass is not part of the arpeggio.
    expect(arpeggioPositions('C/D', { maxFret: 12 })).toEqual(arpeggioPositions('C', { maxFret: 12 }));
  });

  it('groups them into the five CAGED arpeggio shapes', () => {
    const shapes = arpeggioPatterns('Cmaj7');
    expect(shapes.map((p) => p.shape)).toEqual(['C', 'A', 'G', 'E', 'D']);
    expect(shapes.every((p) => p.scale === 'Cmaj7' && p.tonic === 'C')).toBe(true);
    const e = shapes.find((p) => p.shape === 'E')!;
    expect(e.notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['6:7', '6:8', '5:7', '5:10', '4:9', '4:10', '3:9', '2:8', '1:7', '1:8']);
    expect(e.notes.map((n) => n.role)).toEqual(['seventh', 'root', 'third', 'fifth', 'seventh', 'root', 'third', 'fifth', 'seventh', 'root']);
    expect(e.notes.map((n) => n.finger)).toEqual([1, 2, 1, 4, 3, 4, 3, 2, 1, 2]);
    const am = arpeggioPatterns('Am').find((p) => p.shape === 'E')!;
    expect(am.notes.map((n) => `${n.string}:${n.fret}`)).toEqual(['6:5', '6:8', '5:7', '4:7', '3:5', '2:5', '1:5', '1:8']);
  });

  it('builds sound, fingered patterns for all kinds of chords', () => {
    for (const symbol of ['C', 'F#m', 'Bb7', 'Ebmaj7', 'G#m7b5', 'Ddim7', 'Aaug', 'E9', 'Csus4', 'B13']) {
      const pcs = chordPcs(symbol);
      const list = arpeggioPatterns(symbol);
      expect(list.length, symbol).toBeGreaterThanOrEqual(3);
      for (const p of list) {
        expect(p.notes.every((n) => pcs.includes(n.midi % 12)), `${symbol} ${p.id}`).toBe(true);
        expect(p.notes.every((n) => n.role !== undefined), `${symbol} ${p.id}`).toBe(true);
        expect(checkFingering(p.notes), `${symbol} ${p.id}`).toEqual([]);
        expect(p.span, `${symbol} ${p.id}`).toBeLessThanOrEqual(5);
        expect(p.roots.length, `${symbol} ${p.id}`).toBeGreaterThan(0);
        // Every chord tone is in every position.
        expect(new Set(p.notes.map((n) => n.midi % 12)).size, `${symbol} ${p.id}`).toBe(new Set(pcs).size);
      }
    }
  });

  it('offers other layouts and other tunings', () => {
    const strings = arpeggioPatterns('Am7', { system: 'single-string' });
    expect(strings).toHaveLength(6);
    expect(strings[1].notes.map((n) => n.fret)).toEqual([0, 3, 7, 10, 12]);
    const diagonal = arpeggioPatterns('C', { system: 'diagonal' });
    expect(diagonal.length).toBeGreaterThan(0);
    const dadgad = arpeggioPatterns('D', { tuning: 'dadgad' });
    expect(dadgad.every((p) => p.system === 'position' && p.shape === null)).toBe(true);
    const bass = arpeggioPatterns('G7', { tuning: 'bass' });
    expect(bass.every((p) => checkFingering(p.notes).length === 0)).toBe(true);
    expect(() => arpeggioPatterns('nonsense')).toThrow(RangeError);
  });
});
