/**
 * Checks added by the adversarial review of the catalog, one block per class of error it found:
 * soloing scales that contradict a chord without the text saying so, tonalities that disagree
 * with the home chord, heardIn keys that disagree with the tonality, blues forms with the wrong
 * bar count or skeleton, guide-tone claims with third and seventh swapped, and the review's own
 * new entries and wording.
 */
import { describe, expect, it } from 'vitest';
import {
  chordFitsScale, chordNotes, chordToRoman, chordTones, intervalBetween, note, scaleNotes,
} from '@/core/theory';
import {
  PROGRESSIONS, getProgression, parseSlot, resolveProgression, soloScales,
  type Progression, type ResolvedChord,
} from './index';

const pc = (n: string) => note(n).chroma;
const chordsOf = (id: string, tonic: string): ResolvedChord[] => resolveProgression(getProgression(id)!, tonic).bars.flat();
const pcsOf = (symbol: string) => new Set(chordNotes(symbol, { withBass: true }).map(pc));
const MINORISH = new Set(['minor', 'dorian', 'phrygian', 'locrian']);
/** The reference key the tips use for their examples ("in C", "in A minor", "in E"). */
const referenceTonic = (p: Progression) =>
  p.tonality === 'phrygian' || p.tonality === 'phrygian-dominant' || p.tonality === 'locrian' ? 'E' : MINORISH.has(p.tonality) ? 'A' : 'C';

/**
 * Chord tones the scale contradicts: the scale holds the same letter with another accidental
 * (F where the chord has F#). A tone the scale simply leaves out (a pentatonic gap) is no clash.
 */
function clashes(symbol: string, scale: readonly string[]): string[] {
  const pcs = new Set(scale.map(pc));
  return chordNotes(symbol, { withBass: true }).filter(
    (n) => !pcs.has(pc(n)) && scale.some((s) => note(s).letter === note(n).letter),
  );
}

/**
 * The blues idiom: in a major-third tonality, the key's minor pentatonic or blues scale over a
 * major or dominant chord on I, IV or V, where the only clash is the chord's major third (the
 * blue-note rub players want). In a minor key the same clash against V is a real wrong note.
 */
function bluesRub(p: Progression, c: ResolvedChord, tonic: string, scale: string, degree: string, clash: string[]): boolean {
  if (MINORISH.has(p.tonality)) return false;
  if (degree !== '1' || (scale !== 'minor-pentatonic' && scale !== 'minor-blues')) return false;
  const rel = (pc(c.root) - pc(tonic) + 12) % 12;
  if (![0, 5, 7].includes(rel)) return false;
  const third = chordTones(c.symbol).find((t) => t.role === 'third');
  return !!third && third.interval === 'M3' && clash.length > 0 && clash.every((n) => pc(n) === pc(third.note));
}

/** Bars (1-based) the text points at: "bar 4", "bars 9 to 12", "bars 6, 14 and 16", "the last bar". */
function barsMentioned(text: string, total: number): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/\bbars? ((?:\d+(?:, | and | to ))*\d+)/g)) {
    for (const part of m[1].split(/, | and /)) {
      const [a, b] = part.split(' to ').map(Number);
      for (let n = a; n <= (b ?? a); n++) out.add(n);
    }
  }
  if (/\blast bar\b/.test(text)) out.add(total);
  return out;
}

/** Advice that covers every chord at once by telling the player to follow each chord. */
const BLANKET = /each chord's own root|each key centre|each dominant's root/;

/** Words that show a sentence is advice about what to play over a chord, not a list of shapes. */
const ADVICE = /scale|pentatonic|Dorian|Mixolydian|Lydian|Phrygian|Locrian|harmonic minor|melodic minor|natural minor|clash|contradict|\bfits?\b|chord tones|own notes|third|seventh|raised|instead/;

/**
 * Does the tip name this chord, in a sentence about what to play: by its chart token,
 * numeral, literal numeral or symbol, by its target ("the ii–V of bII"), by its bar ("bars 9 to
 * 12"), or with a blanket rule ("on each chord's own root")?
 */
function named(p: Progression, c: ResolvedChord, tonic: string, bar: number): boolean {
  return (p.tryThis.tip ?? '')
    .split(/(?<=[.;])\s+/)
    .filter((sentence) => ADVICE.test(sentence))
    .some((sentence) => namedIn(sentence, p, c, tonic, bar));
}

function namedIn(text: string, p: Progression, c: ResolvedChord, tonic: string, bar: number): boolean {
  if (BLANKET.test(text) || barsMentioned(text, p.bars.length).has(bar)) return true;
  const r = resolveProgression(p, tonic);
  const keyInput = { tonic: r.key.tonic, mode: r.key.keyMode };
  const analysis = chordToRoman(c.symbol, keyInput);
  const ref = referenceTonic(p);
  const refChord = resolveProgression(p, ref).bars.flat().find((x) => x.token === c.token);
  const slot = parseSlot(c.token)!;
  const names = new Set([c.token, slot.numeral, analysis.literal, analysis.roman, c.symbol, refChord?.symbol ?? c.symbol]);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const target = /\/([b#]?[ivIV]+)$/.exec(slot.numeral)?.[1];
  if (target && new RegExp(`\\bof ${esc(target)}(?![A-Za-z0-9#])`).test(text)) return true;
  return [...names].some((n) => new RegExp(`(?<![A-Za-z0-9#])${esc(n)}(?![A-Za-z0-9#])`).test(text));
}

describe('soloing scales', () => {
  it('cover every chord, or the advice names the chord where they clash', () => {
    const problems: string[] = [];
    for (const p of PROGRESSIONS) {
      const tonic = p.keys[0];
      const scales = soloScales(p, tonic).map((s, i) => ({ ...s, degree: p.tryThis.scales[i].degree, notes: scaleNotes(s.tonic, s.scale) }));
      resolveProgression(p, tonic).bars.forEach((barChords, b) => barChords.forEach((c) => {
        const ok = scales.some((s) => {
          const clash = clashes(c.symbol, s.notes);
          return clash.length === 0 || bluesRub(p, c, tonic, s.scale, s.degree, clash);
        });
        if (!ok && !named(p, c, tonic, b + 1)) problems.push(`${p.id}: ${c.token} (${c.symbol} in ${tonic}) clashes with every scale and the tip does not mention it`);
      }));
    }
    expect([...new Set(problems)]).toEqual([]);
  });

  it('come with a tip whenever the first scale does not fit every chord', () => {
    for (const p of PROGRESSIONS) {
      const tonic = p.keys[0];
      const [first] = soloScales(p, tonic);
      const notes = scaleNotes(first.tonic, first.scale);
      const misfits = resolveProgression(p, tonic).bars.flat().filter((c) => {
        const clash = clashes(c.symbol, notes);
        return clash.length > 0 && !bluesRub(p, c, tonic, first.scale, p.tryThis.scales[0].degree, clash);
      });
      if (misfits.length) expect(p.tryThis.tip, `${p.id}: ${first.scale} clashes with ${misfits.map((c) => c.symbol).join(', ')}`).toBeTruthy();
    }
  });

  it('the clash detector itself: F against F#, a pentatonic gap is fine, the blues rub is allowed', () => {
    expect(clashes('D7', scaleNotes('C', 'major'))).toEqual(['F#']);
    expect(clashes('F', scaleNotes('C', 'major-pentatonic'))).toEqual([]);
    expect(clashes('C7', scaleNotes('C', 'minor-pentatonic'))).toEqual(['E']);
    const p = getProgression('blues-12-bar')!;
    const c7 = chordsOf('blues-12-bar', 'C')[0];
    expect(bluesRub(p, c7, 'C', 'minor-pentatonic', '1', ['E'])).toBe(true);
    const a7 = chordsOf('blues-8-bar-ragtime', 'C')[3];
    expect(bluesRub(getProgression('blues-8-bar-ragtime')!, a7, 'C', 'minor-pentatonic', '1', clashes('A7', scaleNotes('C', 'minor-pentatonic')))).toBe(false);
  });
});

describe('tonality', () => {
  const MAJOR_HOME = new Set(['major', 'lydian', 'mixolydian', 'phrygian-dominant']);

  it('agrees with the first home chord of the chart (a major tonality never opens on a minor I)', () => {
    const noHome: string[] = [];
    for (const p of PROGRESSIONS) {
      const tonic = p.keys[0];
      const home = resolveProgression(p, tonic).bars.flat().filter((c) => pc(c.root) === pc(tonic));
      if (home.length === 0) {
        noHome.push(p.id);
        continue;
      }
      const tones = new Set(home[0].notes.map(pc));
      const t = pc(tonic);
      const majorThird = tones.has((t + 4) % 12);
      const minorThird = tones.has((t + 3) % 12);
      if (p.tonality === 'locrian') {
        expect(tones.has((t + 7) % 12) && (majorThird || minorThird), `${p.id}: a Locrian home has no perfect fifth over a third`).toBe(false);
      } else if (MAJOR_HOME.has(p.tonality)) {
        expect(minorThird && !majorThird, `${p.id}: ${p.tonality} but the home chord ${home[0].symbol} is minor`).toBe(false);
      } else {
        expect(majorThird && !minorThird, `${p.id}: ${p.tonality} but the home chord ${home[0].symbol} is major`).toBe(false);
      }
    }
    // Progressions that never sound their home chord are named on purpose, not by accident.
    expect(noHome.sort()).toEqual(['funk-ii-v-vamp', 'jazz-rhythm-bridge', 'pop-royal-road'].sort());
  });

  it('the vamps that are easy to hear in another key say so, and the engine agrees with what they say', () => {
    // dorian-i-iv: Am7–D7 is also ii7–V7 of G; lydian-i-ii: C–D is also IV–V of G;
    // mixolydian-i-bvii: D–C is also V–IV of G; rock-i-bvii-iv: E–D–A is also V–IV–I of A.
    expect(chordsOf('dorian-i-iv', 'A').map((c) => chordToRoman(c.symbol, 'G').roman)).toEqual(['ii7', 'V7']);
    expect(chordsOf('lydian-i-ii', 'C').map((c) => chordToRoman(c.symbol, 'G').roman)).toEqual(['IV', 'V']);
    expect(chordsOf('mixolydian-i-bvii', 'D').map((c) => chordToRoman(c.symbol, 'G').roman)).toEqual(['V', 'IV']);
    expect(chordsOf('rock-i-bvii-iv', 'E').slice(0, 3).map((c) => chordToRoman(c.symbol, 'A').roman)).toEqual(['V', 'IV', 'I']);
    for (const id of ['dorian-i-iv', 'lydian-i-ii', 'mixolydian-i-bvii', 'rock-i-bvii-iv']) {
      expect(getProgression(id)!.tryThis.tip, id).toMatch(/also|read V–IV–I/);
    }
  });
});

describe('heardIn', () => {
  it('names a key that matches the tonality whenever its note gives one', () => {
    for (const p of PROGRESSIONS) {
      for (const h of p.heardIn ?? []) {
        const m = /\bin ([A-G][b#]?)( minor| major)?\b/.exec(h.note ?? '');
        if (!m) continue;
        const saysMinor = m[2] === ' minor';
        expect(saysMinor, `${p.id}: "${h.title}" is said to be ${m[0]} but the tonality is ${p.tonality}`).toBe(MINORISH.has(p.tonality));
      }
    }
  });

  it('lists each recording once per progression', () => {
    for (const p of PROGRESSIONS) {
      const titles = (p.heardIn ?? []).map((h) => h.title.toLowerCase());
      expect(new Set(titles).size, p.id).toBe(titles.length);
    }
  });
});

describe('blues and other named forms', () => {
  it('have the bar count their name says', () => {
    for (const p of PROGRESSIONS) {
      const m = /(\d+)-bar/.exec(`${p.id} ${p.name}`);
      if (m) expect(p.bars.length, p.id).toBe(Number(m[1]));
    }
    expect(getProgression('jazz-rhythm-changes')!.bars.length).toBe(32);
    expect(getProgression('jazz-so-what')!.bars.length).toBe(32);
  });

  it('every 12-bar blues starts home, reaches IV in bar 5, is home in bar 11 and turns around on V', () => {
    const twelve = PROGRESSIONS.filter((p) => p.family === 'blues' && p.bars.length === 12);
    expect(twelve.length).toBeGreaterThanOrEqual(12);
    for (const p of twelve) {
      const tonic = p.keys[0];
      const bars = resolveProgression(p, tonic).bars;
      const deg = (bar: number, i = 0) => (pc(bars[bar][i === -1 ? bars[bar].length - 1 : i].root) - pc(tonic) + 12) % 12;
      expect(deg(0), `${p.id} bar 1`).toBe(0);
      expect(deg(4), `${p.id} bar 5`).toBe(5);
      expect(deg(10), `${p.id} bar 11`).toBe(0);
      expect(deg(11, -1), `${p.id} bar 12 ends on V`).toBe(7);
    }
  });

  it('the two 16-bar forms stretch the 12-bar in the places their text says', () => {
    const tokens = (id: string) => getProgression(id)!.bars.map((b) => b.join(' '));
    const twelve = tokens('blues-12-bar');
    const stop = tokens('blues-16-bar-stop-time');
    expect(stop.slice(0, 8)).toEqual(Array(8).fill('I7'));
    expect(stop.slice(8)).toEqual(twelve.slice(4));
    const stretched = tokens('blues-16-bar');
    expect(stretched.slice(0, 8)).toEqual(twelve.slice(0, 8));
    expect(stretched.slice(8, 14)).toEqual(['V7', 'IV7', 'V7', 'IV7', 'V7', 'IV7']); // the V7–IV7 pair three times
    expect(stretched.slice(14)).toEqual(twelve.slice(10));
  });
});

describe('guide tones (third and seventh)', () => {
  const third = (symbol: string) => chordTones(symbol).find((t) => t.role === 'third')!.note;
  const seventh = (symbol: string) => chordTones(symbol).find((t) => t.role === 'seventh')!.note;

  it('Bird blues: in every ii–V pair the minor chord\'s seventh falls a half step to the dominant\'s third, and its third stays as the seventh', () => {
    const bars = resolveProgression(getProgression('blues-bird')!, 'F').bars;
    let pairs = 0;
    for (const bar of bars) {
      if (bar.length !== 2) continue;
      const [a, b] = bar;
      const dominant = chordTones(b.symbol).some((t) => t.role === 'seventh' && t.interval === 'm7') && chordTones(b.symbol).some((t) => t.role === 'third' && t.interval === 'M3');
      const minorish = chordTones(a.symbol).some((t) => t.role === 'third' && t.interval === 'm3');
      if (!dominant || !minorish || (pc(b.root) - pc(a.root) + 12) % 12 !== 5) continue;
      pairs++;
      expect(intervalBetween(third(b.symbol), seventh(a.symbol)), `${a.symbol} ${b.symbol}`).toBe('m2');
      expect(pc(third(a.symbol)), `${a.symbol} ${b.symbol}`).toBe(pc(seventh(b.symbol)));
    }
    expect(pairs).toBeGreaterThanOrEqual(6);
    expect(getProgression('blues-bird')!.tryThis.tip).toMatch(/seventh of the minor chord and step down a half step to the third of the dominant/);
  });

  it('funk-i7-iv7: E7\'s third and seventh each fall a half step to A7\'s seventh and third', () => {
    const [i7, iv7] = chordsOf('funk-i7-iv7', 'E');
    expect([third(i7.symbol), seventh(i7.symbol), seventh(iv7.symbol), third(iv7.symbol)]).toEqual(['G#', 'D', 'G', 'C#']);
    const halfStepDown = (from: string, to: string) => (pc(from) - pc(to) + 12) % 12 === 1;
    expect(halfStepDown(third(i7.symbol), seventh(iv7.symbol))).toBe(true); // G# -> G
    expect(halfStepDown(seventh(i7.symbol), third(iv7.symbol))).toBe(true); // D -> C#
  });

  it('short ii–V–I and the diatonic circle of sevenths: at each change one guide tone falls a step, the other holds', () => {
    for (const [id, tonic] of [['jazz-ii-v-i-short', 'C'], ['classical-circle-sevenths', 'C']] as const) {
      const c = chordsOf(id, tonic);
      for (let i = 0; i + 1 < c.length; i++) {
        const [a, b] = [c[i].symbol, c[i + 1].symbol];
        expect(pc(third(a)), `${id}: ${a} -> ${b}, third holds`).toBe(pc(seventh(b)));
        expect(['m2', 'M2'], `${id}: ${a} -> ${b}, seventh falls a step`).toContain(intervalBetween(third(b), seventh(a)));
      }
    }
    // jazz-circle-minor only claims the falling seventh (at V7 to i7 the leading tone moves too).
    const c = chordsOf('jazz-circle-minor', 'A');
    for (let i = 0; i + 1 < c.length; i++) {
      expect(['m2', 'M2'], `${c[i].symbol} -> ${c[i + 1].symbol}`).toContain(intervalBetween(third(c[i + 1].symbol), seventh(c[i].symbol)));
    }
  });

  it('jazz-dominant-chain: the seventh of each dominant falls a half step to the third of the next chord', () => {
    const c = chordsOf('jazz-dominant-chain', 'C').filter((x, i, all) => i === 0 || x.symbol !== all[i - 1].symbol);
    for (let i = 0; i + 1 < c.length; i++) expect(intervalBetween(third(c[i + 1].symbol), seventh(c[i].symbol)), c[i].symbol).toBe('m2');
  });
});

describe('claims rewritten by the review', () => {
  it('rock-rising-fifths: roots rise by fifths, each chord is IV of the next, the first three come from the parallel minor', () => {
    const c = chordsOf('rock-rising-fifths', 'E').filter((x, i, all) => i === 0 || x.symbol !== all[i - 1].symbol);
    expect(c.map((x) => x.symbol)).toEqual(['C', 'G', 'D', 'A', 'E']);
    for (let i = 0; i + 1 < c.length; i++) {
      expect((pc(c[i + 1].root) - pc(c[i].root) + 12) % 12).toBe(7);
      expect(chordToRoman(c[i].symbol, c[i + 1].root).roman).toBe('IV');
    }
    for (const x of c.slice(0, 3)) expect(chordFitsScale(x.symbol, scaleNotes('E', 'minor')), x.symbol).toBe(true);
    expect(chordFitsScale('E', scaleNotes('E', 'minor'))).toBe(false);
    // The tip: the minor pentatonic fits the first four; over E its G meets the chord's G#.
    for (const x of c.slice(0, 4)) expect(clashes(x.symbol, scaleNotes('E', 'minor-pentatonic')), x.symbol).toEqual([]);
    expect(clashes('E', scaleNotes('E', 'minor-pentatonic'))).toEqual(['G#']);
  });

  it('gospel-736 falls by fifths through six of the seven degrees (the fourth is the one it skips)', () => {
    const roots = chordsOf('gospel-736', 'C').map((c) => c.root);
    expect(roots).toEqual(['B', 'E', 'A', 'D', 'G', 'C']);
    for (let i = 0; i + 1 < roots.length; i++) expect((pc(roots[i]) - pc(roots[i + 1]) + 12) % 12).toBe(7);
    expect(roots).not.toContain('F');
    expect(getProgression('gospel-736')!.why).toMatch(/six of the key's seven degrees/);
  });

  it('jazz-autumn: iv7–bVII7–bIIImaj7 is ii–V–I of the relative major, iiø7–V7b9–i6 is ii–V–i at home', () => {
    const c = chordsOf('jazz-autumn', 'G');
    expect(c.slice(0, 3).map((x) => chordToRoman(x.symbol, 'Bb').roman)).toEqual(['ii7', 'V7', 'Imaj7']);
    expect(c.slice(4, 7).map((x) => chordToRoman(x.symbol, 'G minor').roman.replace('V7b9', 'V7'))).toEqual(['iiø7', 'V7', 'i6']);
    // i6 has the natural sixth, so natural minor clashes with it (the tip says to raise the sixth).
    expect(clashes(c[6].symbol, scaleNotes('G', 'minor'))).toEqual(['E']);
  });

  it('blues-jazz: only the ii–V–I and the VI–ii–V move by fifths; I to VI is a third', () => {
    const bars = resolveProgression(getProgression('blues-jazz')!, 'F').bars;
    const roots = [...bars[8], ...bars[9], ...bars[10], ...bars[11]].map((c) => c.root);
    expect(roots).toEqual(['G', 'C', 'F', 'D', 'G', 'C']);
    expect((pc('F') - pc('D') + 12) % 12).toBe(3); // F down to D: a minor third, not a fifth
    expect(getProgression('blues-jazz')!.why).not.toMatch(/bars 9 to 12 fall by fifths/);
  });

  it('borrowed-chromatic-mediant: bVI brings two notes from outside the key', () => {
    const bvi = chordsOf('borrowed-chromatic-mediant', 'C')[1];
    const major = new Set(scaleNotes('C', 'major').map(pc));
    expect(bvi.notes.filter((n) => !major.has(pc(n)))).toEqual(['Ab', 'Eb']);
  });

  it('rnb-descending: every voice moves down a step, and the shapes alternate major-seventh and minor-seventh', () => {
    const c = chordsOf('rnb-descending', 'C');
    expect(c.map((x) => x.symbol)).toEqual(['Fmaj7', 'Em7', 'Dm7', 'Cmaj7']);
    for (let i = 0; i + 1 < c.length; i++) {
      c[i].notes.forEach((n, v) => expect(['m2', 'M2']).toContain(intervalBetween(c[i + 1].notes[v], n)));
    }
  });

  it('folk-rising-sun: both eight-bar halves end on V', () => {
    const bars = resolveProgression(getProgression('folk-rising-sun')!, 'A').bars;
    expect(bars[7][0].symbol).toBe('E');
    expect(bars[15][0].symbol).toBe('E');
    expect(bars[3][0].symbol).toBe('F'); // the first four-bar phrase ends on bVI, hence "halves", not "phrases"
  });

  it('the flamenco F shape quoted in a tip (133200) sounds F, A, C plus the open B and E, with F in the bass', () => {
    const TUNING = [40, 45, 50, 55, 59, 64];
    const midi = [...'133200'].map((f, i) => TUNING[i] + Number(f));
    expect(new Set(midi.map((m) => m % 12))).toEqual(new Set(['F', 'A', 'C', 'B', 'E'].map(pc)));
    expect(Math.min(...midi) % 12).toBe(pc('F'));
    expect(getProgression('flamenco-phrygian-vamp')!.tryThis.tip).toContain('133200');
  });

  it('pop-axis: vi is a tonic stand-in, so the loop has three functions, not four', () => {
    const fns = chordsOf('pop-axis', 'C').map((c) => chordToRoman(c.symbol, 'C').function);
    expect(new Set(fns)).toEqual(new Set(['tonic', 'dominant', 'subdominant']));
    expect(getProgression('pop-axis')!.why).toMatch(/all three harmonic functions/);
  });
});
