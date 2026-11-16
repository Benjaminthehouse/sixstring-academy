/**
 * The generator limits the theory reviewers ran into, one block per item: each test fails on the
 * generators as they were (a parameter that did not exist, or an output that was wrong).
 */
import { describe, expect, it } from 'vitest';
import { midiAt, positionsForMidi } from '@/core/guitar';
import { classifyCadence, getKey, interval, intervalName, parseChord, parseNote, parseRoman, romanToChord, scaleNotes, transpose } from '@/core/theory';
import { findTargets } from '../grade';
import { plainText } from '../text';
import type { ChoiceExercise, Exercise, FretboardFigure, GeneratedStep } from '../types';
import { generateStrict, generatorProblems } from './index';
import { explainNumeral } from './theory';

const runs = (step: GeneratedStep, n = 200): Exercise[] => Array.from({ length: n }, (_u, seed) => generateStrict(step, { seed, difficulty: (seed % 5) / 4 }));
const text = (e: Exercise): string => plainText(('prompt' in e && e.prompt ? e.prompt : '') as string) + ' || ' + plainText(('explain' in e ? e.explain : '') as string);
const tags = (t: string, tag: string): string[] => [...t.matchAll(new RegExp(`\\{${tag}:([^}|]+)\\}`, 'g'))].map((m) => m[1]);
const optionTexts = (e: Exercise): string[] => (e.type === 'choice' || e.type === 'listen-choice' ? e.options.map((o) => String(o.text ?? '')) : e.type === 'fretboard-name' ? (e.options ?? []) : []);
const rightText = (e: ChoiceExercise): string => String(e.options.find((o) => o.correct)!.text);
const LETTERS = 'CDEFGAB';

describe('1. note-on-string names in-between notes with flats when asked', () => {
  it('accepts a spelling and uses it for the answer, the walk and every option', () => {
    expect(generatorProblems({ generate: 'note-on-string', params: { spelling: 'flats' } })).toEqual([]);
    expect(generatorProblems({ generate: 'note-on-string', params: { spelling: 'doubles' as 'flats' } })[0]).toMatch(/"spelling"/);
    let blacks = 0;
    for (const e of runs({ generate: 'note-on-string', params: { spelling: 'flats', strings: [6, 5, 4], frets: [0, 12] } })) {
      if (e.type !== 'fretboard-name') throw new Error(e.type);
      expect(text(e)).not.toMatch(/♯/);
      for (const o of e.options ?? []) expect(parseNote(o)!.alt, o).toBeLessThanOrEqual(0);
      const right = (e.options ?? []).find((o) => parseNote(o)!.chroma === midiAt(e.position) % 12)!;
      if (parseNote(right)!.alt !== 0) blacks++;
    }
    expect(blacks).toBeGreaterThan(20);
    // Finding and typing a fret name the target with a flat too.
    for (const e of runs({ generate: 'note-on-string', params: { spelling: 'flats', ask: 'find', frets: [0, 11] } })) {
      if (e.type !== 'fretboard-find' || !('note' in e.find)) throw new Error(e.type);
      expect(parseNote(e.find.note)!.alt).toBeLessThanOrEqual(0);
    }
  });

  it('a sharps drill (the default) never offers a flat, and both names appear with spelling: both', () => {
    for (const e of runs({ generate: 'note-on-string', params: { strings: [6, 5], frets: [0, 12] } })) {
      for (const o of optionTexts(e)) expect(parseNote(o)!.alt, `${optionTexts(e).join(' ')}`).toBeGreaterThanOrEqual(0);
    }
    const seen = new Set<number>();
    for (const e of runs({ generate: 'note-on-string', params: { spelling: 'both', frets: [0, 12] } })) for (const o of optionTexts(e)) seen.add(Math.sign(parseNote(o)!.alt));
    expect([...seen].sort()).toEqual([-1, 0, 1]);
  });
});

describe('2. step-up keeps its wrong options within what the pools allow', () => {
  it('whole steps from C D F G A: every option is a natural note', () => {
    for (const e of runs({ generate: 'step-up', params: { steps: [2], roots: ['C', 'D', 'F', 'G', 'A'] } })) {
      const notes = optionTexts(e).flatMap((o) => tags(o, 'n'));
      expect(notes.every((n) => parseNote(n)!.alt === 0), notes.join(' ')).toBe(true);
    }
  });

  it('a sharps drill offers no flat, a flats drill no sharp', () => {
    for (const [spelling, sign] of [['sharps', 1], ['flats', -1]] as const) {
      let accidentals = 0;
      for (const e of runs({ generate: 'step-up', params: { steps: [1, 2], spelling } })) {
        for (const n of optionTexts(e).flatMap((o) => tags(o, 'n'))) {
          const alt = parseNote(n)!.alt;
          expect(alt === 0 || alt === sign, `${spelling}: ${n}`).toBe(true);
          if (alt !== 0) accidentals++;
        }
        // The answer is still the note that many frets up.
        const [root] = tags(String(e.type === 'choice' ? e.prompt : ''), 'n');
        const steps = /two frets/.test(text(e)) ? 2 : 1;
        expect(parseNote(tags(rightText(e as ChoiceExercise), 'n')[0])!.chroma).toBe((parseNote(root)!.chroma + steps) % 12);
      }
      expect(accidentals).toBeGreaterThan(50);
    }
  });
});

describe('3. compound intervals where the neck fits them', () => {
  it('semitones-match pairs 9ths, 11ths and 13ths with their size', () => {
    const step: GeneratedStep = { generate: 'semitones-match', params: { intervals: ['M9', 'm9', 'P11', 'A11', 'M13', 'm13', 'P8'], pairs: 4 } };
    expect(generatorProblems(step)).toEqual([]);
    for (const e of runs(step, 60)) {
      if (e.type !== 'match-pairs') throw new Error(e.type);
      for (const pair of e.pairs) {
        const ivl = ['M9', 'm9', 'P11', 'A11', 'M13', 'm13', 'P8'].find((i) => intervalName(i) === String(pair.left).toLowerCase())!;
        expect(String(pair.right)).toBe(`${interval(ivl).semitones} half steps`);
      }
      if (/ninth|eleventh|thirteenth/.test(text(e).split('||')[1])) expect(text(e)).toMatch(/an octave \(12\) plus/);
    }
  });

  it('interval-on-neck finds a 9th, 10th or 13th exactly that far above the root', () => {
    const step: GeneratedStep = { generate: 'interval-on-neck', params: { intervals: ['M9', 'm10', 'M13'], ask: 'find' } };
    expect(generatorProblems(step)).toEqual([]);
    for (const e of runs(step)) {
      if (e.type !== 'fretboard-find' || !('interval' in e.find)) throw new Error(e.type);
      const targets = findTargets(e);
      expect(targets.length).toBeGreaterThan(0);
      for (const t of targets) expect(t.midi - midiAt(e.find.from)).toBe(interval(e.find.interval).semitones);
    }
  });

  it('interval-on-neck names a compound interval or degree beside a picture of both dots', () => {
    for (const ask of ['name', 'degree'] as const) {
      const step: GeneratedStep = { generate: 'interval-on-neck', params: { intervals: ['M9', 'm9', 'P11', 'M13'], ask } };
      expect(generatorProblems(step)).toEqual([]);
      for (const e of runs(step)) {
        if (e.type !== 'choice') throw new Error(e.type);
        const figure = e.figure as FretboardFigure;
        const [root, other] = figure.dots!;
        const semis = midiAt(other) - midiAt(root);
        expect(root.label).toBe('R');
        expect(other.fret >= figure.frets![0] && other.fret <= figure.frets![1]).toBe(true);
        const right = plainText(rightText(e));
        if (ask === 'name') expect(right.toLowerCase()).toBe(['major ninth', 'minor ninth', 'perfect eleventh', 'major thirteenth'].find((n) => interval({ 'major ninth': 'M9', 'minor ninth': 'm9', 'perfect eleventh': 'P11', 'major thirteenth': 'M13' }[n]!).semitones === semis));
        else expect(right).toBe({ 13: '♭9', 14: '9', 17: '11', 21: '13' }[semis]);
      }
    }
  });

  it('refuses a compound interval the neck cannot show from the roots allowed', () => {
    expect(generatorProblems({ generate: 'interval-on-neck', params: { intervals: ['P15'], strings: [1], frets: [10, 15] } })[0]).toMatch(/"P15" does not fit/);
    expect(generatorProblems({ generate: 'interval-on-neck', params: { intervals: ['M10'], ask: 'degree' } })[0]).toMatch(/no degree name/);
    expect(generatorProblems({ generate: 'interval-on-neck', params: { intervals: ['M16'] } })[0]).toMatch(/"M16"/);
  });
});

describe('4. interval-name can offer the enharmonic twin', () => {
  it('"A2 or m3?": the twin is a wrong option, and the letters explain why', () => {
    const step: GeneratedStep = { generate: 'interval-name', params: { intervals: ['m3', 'A2', 'A4', 'd5', 'M3', 'd4'], twins: true } };
    expect(generatorProblems(step)).toEqual([]);
    const twinOf: Record<string, string> = { 'minor third': 'augmented second', 'augmented second': 'minor third', 'augmented fourth': 'diminished fifth', 'diminished fifth': 'augmented fourth', 'major third': 'diminished fourth', 'diminished fourth': 'major third' };
    for (const e of runs(step)) {
      if (e.type !== 'choice') throw new Error(e.type);
      expect(e.spelling).toBe('exact');
      const right = plainText(rightText(e)).toLowerCase();
      const twin = twinOf[right];
      expect(e.options.filter((o) => !o.correct).map((o) => plainText(String(o.text)).toLowerCase())).toContain(twin);
      // Counted by hand: the letters decide.
      const [from, to] = tags(String(e.prompt), 'n');
      const letters = ((LETTERS.indexOf(parseNote(to)!.letter) - LETTERS.indexOf(parseNote(from)!.letter) + 7) % 7) + 1;
      expect(right).toMatch(new RegExp(['', '', 'second', 'third', 'fourth', 'fifth'][letters]));
      expect(plainText(e.explain)).toMatch(/is the same size but spans/);
    }
    // Without the switch every option is still a different size.
    for (const e of runs({ generate: 'interval-name', params: { intervals: ['m3', 'A2'] } }, 60)) expect(optionTexts(e).map((o) => o.toLowerCase())).not.toEqual(expect.arrayContaining(['minor third', 'augmented second']));
  });
});

describe('5. roman-chord, diatonic-chord and degree-in-key take an explicit key list', () => {
  it('draws only the listed keys, A and E without B♭ and E♭', () => {
    for (const kind of ['roman-chord', 'diatonic-chord', 'degree-in-key'] as const) {
      const step = { generate: kind, params: { keys: ['C major', 'G major', 'A major', 'E major'] } } as GeneratedStep;
      expect(generatorProblems(step), kind).toEqual([]);
      const seen = new Set<string>();
      for (const e of runs(step)) for (const k of tags(String((e as ChoiceExercise).prompt), 'k')) seen.add(getKey(k)!.name);
      expect([...seen].sort(), kind).toEqual(['A major', 'C major', 'E major', 'G major']);
    }
  });

  it('refuses unknown or modal keys, and keys beside modes or maxAccidentals', () => {
    expect(generatorProblems({ generate: 'roman-chord', params: { keys: ['H major'] } })[0]).toMatch(/"H major"/);
    expect(generatorProblems({ generate: 'diatonic-chord', params: { keys: ['A dorian'] } })[0]).toMatch(/"A dorian"/);
    expect(generatorProblems({ generate: 'degree-in-key', params: { keys: ['A major'], maxAccidentals: 3 } })[0]).toMatch(/"keys" lists the keys itself/);
  });
});

describe('6. interval-on-neck keeps every answer near the root on the picture', () => {
  // The content's own drills, and the default.
  const steps: GeneratedStep[] = [
    { generate: 'interval-on-neck', params: { intervals: ['P8'], ask: 'find', strings: [6, 5], frets: [0, 6] } },
    { generate: 'interval-on-neck', params: { intervals: ['P8'], ask: 'find', strings: [4, 3], frets: [0, 6] } },
    { generate: 'interval-on-neck', params: { intervals: ['P8', 'm7', 'P5', 'P4'], ask: 'find', strings: [6, 5], frets: [3, 9] } },
    { generate: 'interval-on-neck', params: { intervals: ['P4', 'P5', 'M3', 'P8'], ask: 'find', strings: [4, 3], frets: [2, 9] } },
    { generate: 'interval-on-neck' },
  ];
  it('every place the note sounds within four frets of the root is inside the region (so its shape is tappable)', () => {
    let wider = 0;
    for (const step of steps) {
      const [lo, hi] = (step.params as { frets?: [number, number] } | undefined)?.frets ?? [0, 7];
      for (const e of runs(step, 300)) {
        if (e.type !== 'fretboard-find' || !('interval' in e.find)) throw new Error(e.type);
        const from = e.find.from;
        const near = positionsForMidi(midiAt(from) + interval(e.find.interval).semitones, { minFret: 0, maxFret: 22 }).filter((q) => Math.abs(q.fret - from.fret) <= 4 && !(q.string === from.string && q.fret === from.fret));
        const targets = findTargets(e);
        for (const q of near) expect(targets.some((t) => t.string === q.string && t.fret === q.fret), `${JSON.stringify(step.params)} R ${from.string}:${from.fret} misses ${q.string}:${q.fret}`).toBe(true);
        expect(e.frets[0] <= lo && e.frets[1] >= hi && e.frets[1] - e.frets[0] + 1 <= 13).toBe(true);
        if (e.frets[1] > hi || e.frets[0] < lo) wider++;
      }
    }
    // The picture only grows when a shape would have run off it.
    expect(wider).toBeGreaterThan(50);
  });
});

describe('7. higher-lower names notes the way the lesson has taught them', () => {
  it('sharps only, flats only, or the everyday names (the default, unchanged)', () => {
    for (const e of runs({ generate: 'higher-lower', params: { spelling: 'sharps' } }, 300)) expect(text(e)).not.toMatch(/♭/);
    for (const e of runs({ generate: 'higher-lower', params: { spelling: 'flats' } }, 300)) expect(text(e)).not.toMatch(/♯/);
    const auto = runs({ generate: 'higher-lower' }, 300).map(text).join(' ');
    expect(auto).toMatch(/B♭/);
    expect(auto).toMatch(/F♯/);
  });
});

describe('8. cadences in minor, whole-tone and diminished scales, roman numerals explained truly', () => {
  it('cadence-ear plays minor-key phrases whose ending the engine classifies as named', () => {
    let minor = 0;
    for (const e of runs({ generate: 'cadence-ear', params: { types: ['authentic', 'half', 'plagal', 'deceptive'], modes: ['minor', 'major'] } }, 300)) {
      if (e.type !== 'listen-choice' || e.sound.kind !== 'progression') throw new Error(e.type);
      const key = tags(String(e.explain), 'k')[0];
      const type = classifyCadence(e.sound.chords, key)!.type;
      expect(plainText(String(e.options.find((o) => o.correct)!.text)).toLowerCase().startsWith(type)).toBe(true);
      if (/minor/.test(key)) {
        minor++;
        expect(parseChord(e.sound.chords[0])!.type.id).toBe('minor');
        expect(e.options.map((o) => String(o.text)).join(' ')).not.toMatch(/\{r:I\}|\{r:vi\}/);
      }
    }
    expect(minor).toBeGreaterThan(100);
  });

  it('scale-notes orders and fills the six-note whole-tone and the eight-note diminished scales', () => {
    const step: GeneratedStep = { generate: 'scale-notes', params: { scales: ['whole-tone', 'diminished-half-whole'], tonics: ['C', 'D', 'F', 'G'] } };
    expect(generatorProblems(step)).toEqual([]);
    const sizes = new Set<number>();
    for (const e of runs(step, 100)) {
      if (e.type !== 'order') throw new Error(e.type);
      const tiles = e.tiles.map((t) => tags(String(t), 'n')[0]);
      const tonic = tags(String(e.prompt), 'n').pop()!;
      expect(['whole-tone', 'diminished-half-whole'].some((s) => scaleNotes(tonic, s).join(' ') === tiles.join(' '))).toBe(true);
      sizes.add(tiles.length);
    }
    expect([...sizes].sort()).toEqual([6, 8]);
  });

  it('roman-chord explains V7/V as the V7 of V, and a borrowed ♭VII as the lowered 7th', () => {
    const v7v = explainNumeral(roman('V7/V'), getKey('A major')!, 'B7')!;
    expect(plainText(v7v)).toBe('V7/V is the V7 of V. In A major, V is E; the dominant seventh chord a perfect fifth above its root E is B7.');
    expect(plainText(v7v)).not.toMatch(/5th note/);
    const bVII = plainText(explainNumeral(roman('bVII'), getKey('A major')!, 'G')!);
    expect(bVII).toMatch(/7th note lowered by a half step\. In A major the 7th note is G♯; lowered, it is G/);
    expect(bVII).toMatch(/borrow it from A minor/);
    const vii = plainText(explainNumeral(roman('vii°'), getKey('A minor')!, 'G#dim')!);
    expect(vii).toMatch(/major scale on A, G♯\. A minor has G there, so this is the raised 7th/);
  });

  it('every roman-chord explanation names the right note for the degree it claims', () => {
    const step: GeneratedStep = { generate: 'roman-chord', params: { numerals: ['I', 'iv', 'bVII', 'bVI', 'V7/V', 'vii°/V', 'V/vi', 'VI7'], maxAccidentals: 4 } };
    expect(generatorProblems(step)).toEqual([]);
    for (const e of runs(step, 300)) {
      const t = plainText(String((e as ChoiceExercise).explain)).replace(/♯/g, '#').replace(/♭/g, 'b');
      const key = getKey(tags(String((e as ChoiceExercise).prompt), 'k')[0])!;
      const own = /the (\d)\w\w note of the scale\. In .* that note is ([A-G][#b]?)/.exec(t);
      if (own) expect(key.scale[Number(own[1]) - 1], t).toBe(own[2]);
      const moved = /In .* the (\d)\w\w note is ([A-G][#b]?); (lowered|raised), it is ([A-G][#b]{0,2})/.exec(t);
      if (moved) {
        expect(key.scale[Number(moved[1]) - 1], t).toBe(moved[2]);
        expect(transpose(moved[2], moved[3] === 'lowered' ? '-A1' : 'A1'), t).toBe(moved[4]);
      }
      const secondary = /In .*, (\S+) is ([A-G][#b]?\S*); the .* (?:above|below) its root ([A-G][#b]?) is (\S+)\.$/.exec(t);
      if (secondary) {
        expect(romanToChord(secondary[1], key)).toBe(secondary[2]);
        expect(parseChord(secondary[2])!.root).toBe(secondary[3]);
        expect(romanToChord(/^(\S+) is/.exec(t)![1], key), t).toBe(secondary[4]);
      }
      expect(own || moved || secondary, t).toBeTruthy();
    }
  });

  it('says a borrowed iv, v or ii° in a major key is borrowed, and leaves the key\'s own chords alone', () => {
    // Review fix: "iv is the minor chord on the 4th note" was true but never said why Fm is not in C major.
    const iv = plainText(explainNumeral(roman('iv'), getKey('C major')!, 'Fm')!);
    expect(iv).toBe('iv is the minor chord on the 4th note of the scale. In C major that note is F, so the chord is Fm. It is not in the key itself: major keys borrow it from C minor.');
    expect(plainText(explainNumeral(roman('ii°'), getKey('E major')!, 'F#dim')!)).toMatch(/major keys borrow it from E minor\.$/);
    expect(plainText(explainNumeral(roman('IV'), getKey('C major')!, 'F')!)).not.toMatch(/borrow/);
    expect(plainText(explainNumeral(roman('iv'), getKey('A minor')!, 'Dm')!)).not.toMatch(/borrow/);
    // A secondary dominant on a scale note (II = V/V) is not called borrowed.
    expect(plainText(explainNumeral(roman('II'), getKey('C major')!, 'D')!)).not.toMatch(/borrow/);
  });

  it('generatorProblems refuses numerals it cannot explain', () => {
    expect(generatorProblems({ generate: 'roman-chord', params: { numerals: ['I', 'subV7'] } })[0]).toMatch(/"subV7".*cannot spell or explain/);
    expect(generatorProblems({ generate: 'roman-chord', params: { numerals: ['bbVII'] } }).join(' ')).toMatch(/bbVII/);
    expect(generatorProblems({ generate: 'roman-chord', params: { numerals: ['V7/V', 'bVII', 'iv'] } })).toEqual([]);
  });
});

function roman(numeral: string): NonNullable<ReturnType<typeof parseRoman>> {
  const r = parseRoman(numeral);
  if (!r) throw new Error(numeral);
  return r;
}
