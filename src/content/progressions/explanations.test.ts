/**
 * Hand-checked explanations: for a sample of progressions, the functional claim made in `why`
 * (which chord is borrowed, which is a secondary dominant, where the bass walks, which notes
 * move by half step) is verified against the theory engine in a reference key.
 */
import { describe, expect, it } from 'vitest';
import {
  chordFitsScale, chordNotes, chordToRoman, classifyCadence, degreeInKey, intervalBetween, note, scaleContains, scaleNotes,
} from '@/core/theory';
import { getProgression, resolveProgression, type ResolvedChord } from './index';

const chordsOf = (id: string, tonic: string): ResolvedChord[] => resolveProgression(getProgression(id)!, tonic).bars.flat();
const symbols = (id: string, tonic: string) => chordsOf(id, tonic).map((c) => c.symbol);
const pcs = (symbol: string) => new Set(chordNotes(symbol).map((n) => note(n).chroma));
const shared = (a: string, b: string) => [...pcs(a)].filter((x) => pcs(b).has(x)).length;
const pc = (n: string) => note(n).chroma;
/** The bass of every chord, as a degree of the key. */
const bassLine = (id: string, tonic: string, keyName: string) =>
  chordsOf(id, tonic).map((c) => degreeInKey(c.bass ?? c.root, keyName));
/** Semitones from one root down to the next, mod 12 (7 = falls a fifth). */
const fallsBy = (a: string, b: string) => (pc(a) - pc(b) + 12) % 12;
const whyOf = (id: string) => getProgression(id)!.why;

describe('explanations agree with the engine', () => {
  it('pop-axis: home, dominant, relative minor, subdominant', () => {
    const roman = symbols('pop-axis', 'C').map((s) => chordToRoman(s, 'C'));
    expect(roman.map((r) => r.roman)).toEqual(['I', 'V', 'vi', 'IV']);
    expect(roman.map((r) => r.function)).toEqual(['tonic', 'dominant', 'tonic', 'subdominant']);
    expect(shared('Am', 'C')).toBe(2);
  });

  it('rock-i-bvii-iv: two plagal steps, bVII from Mixolydian', () => {
    const [i, bvii, iv] = chordsOf('rock-i-bvii-iv', 'E');
    expect(fallsBy(bvii.root, iv.root)).toBe(5); // a fourth down = the plagal root motion
    expect(fallsBy(iv.root, i.root)).toBe(5);
    expect(chordToRoman(bvii.symbol, 'E').borrowedFrom).toContain('mixolydian');
    expect(whyOf('rock-i-bvii-iv')).toMatch(/IV chord of IV/);
  });

  it('rock-i-iv-v-minor: the minor v has no leading tone', () => {
    const v = chordsOf('rock-i-iv-v-minor', 'A')[2];
    expect(v.symbol).toBe('Em');
    expect(pcs(v.symbol).has(pc('G#'))).toBe(false);
    expect(chordToRoman(v.symbol, 'A').borrowedFrom).toContain('mixolydian');
  });

  it('fifties-i-i7-iv-iv: I7 is V7/IV, iv is borrowed and its b6 falls to the fifth of I', () => {
    const [, i7, , iv] = chordsOf('fifties-i-i7-iv-iv', 'C');
    expect(chordToRoman(i7.symbol, 'C', { next: 'F' }).roman).toBe('V7/IV');
    const a = chordToRoman(iv.symbol, 'C');
    expect(a.relation).toBe('borrowed');
    expect(a.borrowedFrom[0]).toBe('minor');
    expect(iv.notes).toContain('Ab');
    expect(intervalBetween('G', 'Ab')).toBe('m2');
  });

  it('blues-12-bar: I7 is home; the sevenths of I7 and IV7 are b7 and b3 of the key', () => {
    const [i7] = chordsOf('blues-12-bar', 'C');
    expect(chordToRoman(i7.symbol, 'C', { next: 'C7' }).roman).toBe('I7');
    expect(degreeInKey('Bb', 'C')).toBe('b7');
    expect(chordNotes('F7')[3]).toBe('Eb');
    expect(degreeInKey('Eb', 'C')).toBe('b3');
  });

  it('blues-jazz: ii–V into IV, VI7 = V7/ii, and #iv°7 shares the home note with IV7 and I7', () => {
    const bars = resolveProgression(getProgression('blues-jazz')!, 'F').bars;
    expect(chordToRoman(bars[3][1].symbol, 'F', { next: 'Bb7' }).roman).toBe('V7/IV');
    expect(chordToRoman(bars[7][0].symbol, 'F').roman).toBe('V7/ii');
    for (const s of ['Bb7', bars[5][0].symbol, 'F7']) expect(pcs(s).has(pc('F')), s).toBe(true);
  });

  it('blues-minor: V7 is the harmonic-minor dominant', () => {
    const v7 = chordsOf('blues-minor', 'A')[8];
    const a = chordToRoman(v7.symbol, 'A minor');
    expect(a.relation).toBe('diatonic');
    expect(a.variant).toBe('harmonic');
  });

  it('jazz-ii-v-i: subdominant, dominant, tonic; each seventh falls a step to the next third', () => {
    const [ii, v, i] = chordsOf('jazz-ii-v-i', 'C');
    expect([ii, v, i].map((c) => chordToRoman(c.symbol, 'C').function)).toEqual(['subdominant', 'dominant', 'tonic']);
    expect(intervalBetween(v.notes[1], ii.notes[3])).toBe('m2'); // C (7th of Dm7) to B (3rd of G7)
    expect(intervalBetween(i.notes[1], v.notes[3])).toBe('m2'); // F (7th of G7) to E (3rd of Cmaj7)
  });

  it('jazz-minor-ii-v-i: the b9 of V7b9 is the key\'s b6 and falls to the fifth of i', () => {
    const v = chordsOf('jazz-minor-ii-v-i', 'C')[1];
    expect(v.notes).toContain('Ab');
    expect(degreeInKey('Ab', 'C minor')).toBe('b6');
    expect(chordToRoman(chordsOf('jazz-minor-ii-v-i', 'C')[0].symbol, 'C minor').relation).toBe('diatonic');
  });

  it('jazz-backdoor: iv7 and bVII7 are borrowed; bVII7 rises a whole step home, its seventh falls to the fifth', () => {
    const c = chordsOf('jazz-backdoor', 'C');
    expect(chordToRoman(c[1].symbol, 'C').relation).toBe('borrowed');
    expect(chordToRoman(c[2].symbol, 'C', { next: 'Cmaj7' }).relation).toBe('borrowed');
    expect(intervalBetween(c[2].root, 'C')).toBe('M2');
    expect(c[2].notes[3]).toBe('Ab');
  });

  it('jazz-tritone-sub: bII7 is the tritone substitute and shares V7\'s third and seventh', () => {
    const sub = chordsOf('jazz-tritone-sub', 'C')[1];
    expect(chordToRoman(sub.symbol, 'C', { next: 'Cmaj7' }).relation).toBe('tritone-substitute');
    expect(shared(sub.symbol, 'G7')).toBe(2);
    expect(sub.notes).toContain('Cb');
  });

  it('jazz-dameron: each chord sits a tritone from the dominant it replaces', () => {
    const c = chordsOf('jazz-dameron', 'C');
    expect(c.map((x) => x.root)).toEqual(['C', 'Eb', 'Ab', 'Db']);
    ['A', 'D', 'G'].forEach((dominant, i) => expect((pc(c[i + 1].root) - pc(dominant) + 12) % 12).toBe(6));
  });

  it('jazz-coltrane-cycle: three key centres a major third apart', () => {
    const centres = chordsOf('jazz-coltrane-cycle', 'C').filter((c) => c.symbol.endsWith('maj7')).map((c) => c.root);
    expect(centres).toEqual(['C', 'Ab', 'E', 'C']);
    for (let i = 0; i + 1 < centres.length; i++) expect(fallsBy(centres[i], centres[i + 1])).toBe(4);
  });

  it('circle-of-fifths sequences fall by fifths, once by a diminished fifth', () => {
    for (const [id, tonic] of [['classical-circle-major', 'C'], ['classical-circle-minor', 'A'], ['jazz-autumn', 'G'], ['jazz-dominant-chain', 'C']] as const) {
      const roots = chordsOf(id, tonic).map((c) => c.root).filter((r, i, all) => i === 0 || r !== all[i - 1]);
      const steps = roots.slice(1).map((r, i) => fallsBy(roots[i], r));
      expect(steps.filter((s) => s !== 7).length, `${id}: ${roots.join(' ')}`).toBeLessThanOrEqual(1);
      for (const s of steps) expect([6, 7], `${id}: ${roots.join(' ')}`).toContain(s);
    }
  });

  it('bass-line claims: canon, walk-downs, gospel walk-up, laments', () => {
    expect(bassLine('classical-canon-bass', 'D', 'D major')).toEqual(['1', '7', '6', '5', '4', '3', '4', '5']);
    expect(bassLine('country-walk-down', 'C', 'C major')).toEqual(['1', '7', '6', '5', '4', '3', '2', '5']);
    expect(bassLine('gospel-walk-up', 'C', 'C major')).toEqual(['1', '3', '4', '#4', '5', '6', '2', '5']);
    expect(bassLine('classical-lament-diatonic', 'A', 'A minor')).toEqual(['1', 'b7', 'b6', '5']);
    expect(bassLine('classical-lament-chromatic', 'A', 'A minor')).toEqual(['1', '7', 'b7', '6', 'b6', '5']);
    for (const c of chordsOf('classical-lament-chromatic', 'A')) {
      expect(pcs(c.symbol).has(pc(c.bass ?? c.root)) && c.notes.map(pc).includes(pc(c.bass ?? c.root)), c.symbol).toBe(true);
    }
    expect(bassLine('classical-tonic-pedal', 'D', 'D major')).toEqual(['1', '1', '1', '1']);
  });

  it('cadence entries end with the cadence they are named after', () => {
    const last2 = (id: string, tonic: string, at = -2) => symbols(id, tonic).slice(at, at + 2 || undefined);
    expect(classifyCadence(last2('classical-plagal', 'C'), 'C')!.type).toBe('plagal');
    expect(classifyCadence(last2('classical-half-cadence', 'C'), 'C')!.type).toBe('half');
    expect(classifyCadence(symbols('classical-deceptive', 'C').slice(2, 4), 'C')!.type).toBe('deceptive');
    expect(classifyCadence(last2('classical-cadence-authentic', 'C'), 'C')!.type).toBe('authentic');
    const phrygian = classifyCadence(last2('classical-phrygian-half', 'A'), 'A minor')!;
    expect(phrygian.name).toMatch(/Phrygian/);
  });

  it('classical-neapolitan: bII is Neapolitan, over the fourth degree, and its root falls a diminished third to the leading tone', () => {
    const n6 = chordsOf('classical-neapolitan', 'A')[1];
    expect(chordToRoman(n6.root, 'A minor').relation).toBe('neapolitan');
    expect(degreeInKey(n6.bass!, 'A minor')).toBe('4');
    expect(intervalBetween('G#', n6.root)).toBe('d3');
  });

  it('classical-augmented-sixth: bVI7 has the pitch classes of the German sixth', () => {
    const ger = chordsOf('classical-augmented-sixth', 'A')[1];
    expect(new Set(ger.notes.map(pc))).toEqual(new Set(['F', 'A', 'C', 'D#'].map(pc)));
  });

  it('borrowed-creep: III is V/vi, all its notes rise a half step into IV, then iv is borrowed', () => {
    const [, iii, iv, ivm] = chordsOf('borrowed-creep', 'G');
    expect(chordToRoman(iii.symbol, 'G', { next: 'C' }).roman).toBe('V/vi');
    expect([...pcs(iii.symbol)].map((x) => (x + 1) % 12).sort()).toEqual([...pcs(iv.symbol)].sort());
    expect(chordToRoman(ivm.symbol, 'G').relation).toBe('borrowed');
  });

  it('borrowed-chromatic-mediant: I and bVI share only the home note', () => {
    const [i, bvi] = chordsOf('borrowed-chromatic-mediant', 'C');
    expect(shared(i.symbol, bvi.symbol)).toBe(1);
    expect(pcs(bvi.symbol).has(pc('C'))).toBe(true);
  });

  it('secondary dominants point where the text says', () => {
    expect(chordToRoman(chordsOf('secondary-v-of-v', 'C')[1].symbol, 'C').roman).toBe('V7/V');
    expect(chordsOf('secondary-v-of-v', 'C')[1].notes[1]).toBe('F#');
    expect(chordToRoman(chordsOf('secondary-v-of-vi', 'C')[1].symbol, 'C').roman).toBe('V7/vi');
    expect(chordsOf('secondary-v-of-vi', 'C')[1].notes[1]).toBe('G#');
    expect(chordToRoman(chordsOf('secondary-leading-tone', 'C')[2].root + 'dim7', 'C').relation).toBe('secondary-leading-tone');
    expect(chordToRoman(chordsOf('latin-ipanema', 'F')[5].symbol, 'F', { next: 'Fmaj7' }).relation).toBe('tritone-substitute');
  });

  it('modal entries carry their mode\'s characteristic note', () => {
    expect(chordsOf('dorian-i-iv', 'A')[1].notes).toContain('F#');
    expect(scaleContains('A', 'dorian', 'F#')).toBe(true);
    expect(chordsOf('lydian-i-ii', 'C')[1].notes).toContain('F#');
    expect(scaleContains('C', 'lydian', 'F#')).toBe(true);
    expect(degreeInKey(chordsOf('mixolydian-i-bvii', 'D')[1].root, 'D major')).toBe('b7');
    expect(degreeInKey(chordsOf('phrygian-i-bii', 'E')[1].root, 'E minor')).toBe('b2');
    expect(chordsOf('dorian-i-ii', 'A')[1].notes[2]).toBe('F#');
    const loc = chordsOf('metal-locrian', 'E');
    expect(scaleContains('E', 'locrian', loc[1].root) && scaleContains('E', 'locrian', loc[3].root)).toBe(true);
    expect(scaleContains('E', 'locrian', 'B')).toBe(false); // the I5's own fifth is outside the mode
    for (const c of chordsOf('locrian-i-bii', 'B')) expect(chordFitsScale(c.symbol, scaleNotes('B', 'locrian')), c.symbol).toBe(true);
  });

  it('two-chord colours that share no notes really share none', () => {
    for (const [id, tonic] of [['folk-double-tonic', 'A'], ['reggae-minor-i-bvii', 'A']] as const) {
      const [a, b] = chordsOf(id, tonic);
      expect(shared(a.symbol, b.symbol), id).toBe(0);
    }
  });

  it('flamenco: V is the harmonic-minor dominant; the flamenco view ends with bII falling a half step to I', () => {
    const v = chordsOf('flamenco-andalusian', 'A')[3];
    expect(chordFitsScale(v.symbol, scaleNotes('A', 'harmonic-minor'))).toBe(true);
    const f = chordsOf('flamenco-cadence-phrygian', 'E');
    expect(intervalBetween(f[3].root, f[2].root)).toBe('m2');
    // Phrygian chords on the way, the raised third only on the home chord (as tryThis says).
    for (const c of f.slice(0, 3)) expect(chordFitsScale(c.symbol, scaleNotes('E', 'phrygian')), c.symbol).toBe(true);
    expect(chordFitsScale(f[3].symbol, scaleNotes('E', 'phrygian-dominant'))).toBe(true);
  });

  it('gospel-iv-over-v: V\'s root in the bass, its seventh and ninth above, no leading tone', () => {
    const g = chordsOf('gospel-iv-over-v', 'C')[1];
    expect(g.bass).toBe('G');
    expect(g.notes).toEqual(expect.arrayContaining(['F', 'A']));
    expect(g.notes).not.toContain('B');
  });

  it('the Just the Two of Us loop reads IVmaj7–III7–vi7 in the relative major', () => {
    const c = chordsOf('rnb-just-the-two', 'F');
    expect(chordToRoman(c[0].symbol, 'Ab').roman).toBe('IVmaj7');
    expect(chordToRoman(c[1].symbol, 'Ab').literal).toBe('III7');
    expect(chordToRoman(c[2].symbol, 'Ab').roman).toBe('vi7');
  });

  it('folk-rising-sun: the major IV comes from melodic minor and V from harmonic minor', () => {
    const c = chordsOf('folk-rising-sun', 'A');
    expect(chordToRoman(c[2].symbol, 'A minor').variant).toBe('melodic');
    expect(chordToRoman(c[6].symbol, 'A minor').variant).toBe('harmonic');
  });

  it('fingerings quoted in tips sound the chords they name (standard tuning)', () => {
    const TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4, low to high
    const sound = (shape: string) => [...shape].map((f, i) => (f === 'x' ? null : TUNING[i] + Number(f))).filter((m): m is number => m !== null);
    const table: Array<[string, string, string]> = [
      ['pop-axis-walkdown', 'G/B', 'x20033'],
      ['pop-i-iv', 'Cadd9', 'x32033'],
      ['pop-i-iv', 'G', '320033'],
      ['gospel-plagal-pedal', 'A', 'x02220'],
      ['gospel-plagal-pedal', 'D/A', 'x00232'],
      ['gospel-iv-over-v', 'F/G', '3x3211'],
      ['line-major-down', 'C', 'x32010'],
      ['line-major-down', 'Cmaj7', 'x32000'],
      ['line-major-down', 'C7', 'x32310'],
      ['lydian-pedal', 'Dmaj7', 'xx0222'],
      ['lydian-pedal', 'E/D', 'xx0100'],
    ];
    for (const [id, symbol, shape] of table) {
      expect(getProgression(id)!.tryThis.tip, `${id} quotes ${shape}`).toContain(shape);
      const midi = sound(shape);
      const heard = new Set(midi.map((m) => m % 12));
      const full = new Set(chordNotes(symbol, { withBass: true }).map(pc));
      // Open shapes may leave out the fifth (the usual C7, x32310); every other tone must be there.
      const fifth = (pc(chordNotes(symbol)[0]) + 7) % 12;
      const withoutFifth = new Set([...full].filter((x) => x !== fifth));
      expect([full, withoutFifth], `${id}: ${shape} is ${symbol}`).toContainEqual(heard);
      const bass = chordNotes(symbol, { withBass: true })[0];
      expect(Math.min(...midi) % 12, `${id}: bass of ${shape}`).toBe(pc(bass));
    }
    // Single notes named by string and fret.
    const at = (string: number, fret: number) => (TUNING[6 - string] + fret) % 12;
    expect([at(6, 0), at(6, 3), at(6, 5)]).toEqual(['E', 'G', 'A'].map(pc)); // rock-i-biii-iv
    expect([at(6, 8), at(6, 10), at(5, 3), at(5, 5)]).toEqual(['C', 'D', 'C', 'D'].map(pc)); // metal-aeolian
    expect([at(6, 8), at(6, 4), at(6, 6)]).toEqual(['C', 'Ab', 'Bb'].map(pc)); // borrowed-mario
    expect([at(5, 0), at(5, 5), at(5, 7)]).toEqual(['A', 'D', 'E'].map(pc)); // rock-i-iv-v-iv power chords
    expect([at(6, 2), at(6, 3)]).toEqual(['F#', 'G'].map(pc)); // secondary-leading-tone
    expect([at(2, 0), at(2, 1), at(2, 2), at(2, 3)]).toEqual(['B', 'C', 'C#', 'D'].map(pc)); // line-minor-up
    expect([at(6, 3), at(5, 0), at(5, 2), at(5, 3)]).toEqual(['G', 'A', 'B', 'C'].map(pc)); // country-walk-up
    expect(at(6, 1)).toBe(pc('F')); // metal-phrygian: F5 at the first fret
  });

  it('line clichés move one voice by half steps', () => {
    const moving = (id: string, tonic: string) => {
      const c = chordsOf(id, tonic).map((x) => new Set(x.notes.map(pc)));
      return c.slice(1).map((now, i) => [...now].filter((x) => !c[i].has(x)));
    };
    expect(moving('line-minor-down', 'A')).toEqual([[pc('G#')], [pc('G')], [pc('F#')]]);
    // Chord symbols include the plain fifth again in I6 / i6; the moving line is G, G#, A, Bb (B, C, C#, D).
    expect(moving('line-major-up', 'C')).toEqual([[pc('G#')], [pc('G'), pc('A')], [pc('Bb')]]);
    expect(moving('line-minor-up', 'E')).toEqual([[pc('C')], [pc('B'), pc('C#')], [pc('D')]]);
  });
});
