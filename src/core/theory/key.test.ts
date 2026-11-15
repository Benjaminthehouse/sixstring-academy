import { describe, expect, it } from 'vitest';
import {
  ALL_KEYS, chordInKey, circleOfFifths, closelyRelatedKeys, degreeInKey, detectBestKey, detectKey,
  detectKeyFromChords, detectKeyFromNotes, diatonicChords, enharmonicKey, getKey, inKey, key, keyChords,
  keyFromSignature, keyScale, keySignature, keysWithSignature, MAJOR_KEYS, majorKey, MINOR_KEYS, minorKey,
  neighborKeys, noteAtDegree, parallelKey, parseKey, practicalKey, relativeKey, spellInKey,
} from './key';
import { chroma } from './note';

/** Independent truth table: major key, signature, relative minor. */
const SIGNATURES: Array<[string, number, string]> = [
  ['C', 0, 'A'], ['G', 1, 'E'], ['D', 2, 'B'], ['A', 3, 'F#'], ['E', 4, 'C#'], ['B', 5, 'G#'], ['F#', 6, 'D#'], ['C#', 7, 'A#'],
  ['F', -1, 'D'], ['Bb', -2, 'G'], ['Eb', -3, 'C'], ['Ab', -4, 'F'], ['Db', -5, 'Bb'], ['Gb', -6, 'Eb'], ['Cb', -7, 'Ab'],
];
const SHARPS = ['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#'];
const FLATS = ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb'];

describe('key signatures', () => {
  it('knows all fifteen major keys and their relative minors', () => {
    for (const [tonic, fifths, minorTonic] of SIGNATURES) {
      const major = majorKey(tonic);
      expect(major.fifths, tonic).toBe(fifths);
      expect(major.signature.count, tonic).toBe(Math.abs(fifths));
      expect(major.signature.type, tonic).toBe(fifths > 0 ? 'sharps' : fifths < 0 ? 'flats' : 'none');
      expect(major.signature.accidentals, tonic).toEqual((fifths >= 0 ? SHARPS : FLATS).slice(0, Math.abs(fifths)));
      expect(major.relative, tonic).toBe(`${minorTonic} minor`);
      expect(major.theoretical).toBe(false);
      const minor = minorKey(minorTonic);
      expect(minor.fifths, `${minorTonic} minor`).toBe(fifths);
      expect(minor.signature.accidentals).toEqual(major.signature.accidentals);
      expect(minor.relative).toBe(`${tonic} major`);
      expect(relativeKey(major).name).toBe(`${minorTonic} minor`);
      expect(relativeKey(minor).name).toBe(`${tonic} major`);
      expect(keyFromSignature(fifths).tonic).toBe(tonic);
      expect(keyFromSignature(fifths, 'minor').tonic).toBe(minorTonic);
      // Relative keys share every note.
      expect(minor.scale.map((n) => chroma(n)).sort()).toEqual(major.scale.map((n) => chroma(n)).sort());
      expect(new Set(minor.scale)).toEqual(new Set(major.scale));
    }
  });

  it('applies the signature to exactly the notes of the scale', () => {
    for (const k of ALL_KEYS) {
      const altered = new Set(k.signature.accidentals);
      for (const n of k.scale) {
        if (n.length > 1) expect(altered.has(n), `${k.name}: ${n}`).toBe(true);
        else expect([...altered].some((a) => a[0] === n), `${k.name}: ${n}`).toBe(false);
      }
      expect(k.scale.filter((n) => n.length > 1).length).toBe(k.signature.count);
    }
  });

  it('lists thirty standard keys', () => {
    expect(MAJOR_KEYS.map((k) => k.tonic)).toEqual(['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
    expect(MINOR_KEYS.map((k) => k.tonic)).toEqual(['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab']);
    expect(ALL_KEYS).toHaveLength(30);
    expect(new Set(ALL_KEYS.map((k) => k.id)).size).toBe(30);
    for (const k of ALL_KEYS) {
      expect(k.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(getKey(k.id)).toBe(k);
      expect(getKey(k.name)).toBe(k);
      expect(getKey(k.short)).toBe(k);
    }
    expect(keysWithSignature(-3)).toMatchObject({ major: { name: 'Eb major' }, minor: { name: 'C minor' } });
  });

  it('builds signatures directly', () => {
    expect(keySignature(0)).toEqual({ fifths: 0, type: 'none', count: 0, accidentals: [] });
    expect(keySignature(3).accidentals).toEqual(['F#', 'C#', 'G#']);
    expect(keySignature(-4).accidentals).toEqual(['Bb', 'Eb', 'Ab', 'Db']);
    expect(keySignature(8).accidentals).toEqual(['F##', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#']);
    expect(keySignature(-8).accidentals).toEqual(['Bbb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb']);
  });

  it('spells the famously tricky keys', () => {
    expect(key('F# major').scale).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
    expect(key('Cb major').scale).toEqual(['Cb', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb']);
    expect(key('Gb major').scale).toEqual(['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']);
    expect(key('C# major').scale).toEqual(['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#']);
    expect(key('D# minor').scale).toEqual(['D#', 'E#', 'F#', 'G#', 'A#', 'B', 'C#']);
    expect(key('G# minor').harmonicMinor).toEqual(['G#', 'A#', 'B', 'C#', 'D#', 'E', 'F##']);
    expect(key('A minor').harmonicMinor).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#']);
    expect(key('A minor').melodicMinor).toEqual(['A', 'B', 'C', 'D', 'E', 'F#', 'G#']);
    expect(key('Eb minor').scale).toEqual(['Eb', 'F', 'Gb', 'Ab', 'Bb', 'Cb', 'Db']);
    expect(key('C major').harmonicMinor).toBeNull();
    expect(keyScale('E minor', 'harmonic')).toEqual(['E', 'F#', 'G', 'A', 'B', 'C', 'D#']);
    expect(keyScale('E minor', 'melodic')).toEqual(['E', 'F#', 'G', 'A', 'B', 'C#', 'D#']);
    expect(keyScale('E minor')).toEqual(['E', 'F#', 'G', 'A', 'B', 'C', 'D']);
    expect(keyScale('G', 'harmonic')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
  });
});

describe('parseKey', () => {
  it('reads the usual ways of writing a key', () => {
    const cases: Array<[string, string]> = [
      ['C', 'C major'], ['C major', 'C major'], ['Cmaj', 'C major'], ['CM', 'C major'], ['Am', 'A minor'], ['A minor', 'A minor'],
      ['a minor', 'A minor'], ['A min', 'A minor'], ['A-', 'A minor'], ['F#m', 'F# minor'], ['F# minor', 'F# minor'],
      ['Bb', 'Bb major'], ['Bbm', 'Bb minor'], ['eb minor', 'Eb minor'], ['B♭ major', 'Bb major'], ['F♯ minor', 'F# minor'],
      ['f-sharp-minor', 'F# minor'], ['bb-major', 'Bb major'], ['b-flat-major', 'Bb major'], ['c-major', 'C major'],
      ['a-minor', 'A minor'], ['c-sharp-major', 'C# major'], ['A flat major', 'Ab major'], ['F sharp minor', 'F# minor'],
      ['G major key', 'G major'], ['D Dorian', ''], ['', ''], ['H minor', ''], ['C4', ''], ['Cm7', ''],
    ];
    for (const [input, expected] of cases) {
      const parsed = parseKey(input);
      expect(parsed ? `${parsed.tonic} ${parsed.mode}` : '', input).toBe(expected);
    }
    expect(getKey('nonsense')).toBeNull();
    expect(() => key('nonsense')).toThrow(RangeError);
    expect(getKey({ tonic: 'E', mode: 'minor' })!.name).toBe('E minor');
    expect(key(key('D major'))).toBe(key('D'));
  });
});

describe('related keys', () => {
  it('finds parallel and enharmonic keys', () => {
    expect(parallelKey('C major').name).toBe('C minor');
    expect(parallelKey('A minor').name).toBe('A major');
    expect(parallelKey('Db major')).toMatchObject({ name: 'Db minor', fifths: -8, theoretical: true });
    expect(practicalKey('Db minor').name).toBe('C# minor');
    expect(practicalKey('G# major').name).toBe('Ab major');
    expect(practicalKey('E major').name).toBe('E major');
    expect(key('G# major').signature.accidentals[0]).toBe('F##');
    expect(enharmonicKey('F# major')!.name).toBe('Gb major');
    expect(enharmonicKey('Gb major')!.name).toBe('F# major');
    expect(enharmonicKey('B major')!.name).toBe('Cb major');
    expect(enharmonicKey('C# major')!.name).toBe('Db major');
    expect(enharmonicKey('D# minor')!.name).toBe('Eb minor');
    expect(enharmonicKey('C major')).toBeNull();
    expect(enharmonicKey('E major')).toBeNull();
  });

  it('finds the neighbours on the circle of fifths', () => {
    const n = neighborKeys('C major');
    expect([n.dominant.name, n.subdominant.name, n.relative.name, n.parallel.name, n.dominantRelative.name, n.subdominantRelative.name])
      .toEqual(['G major', 'F major', 'A minor', 'C minor', 'E minor', 'D minor']);
    const m = neighborKeys('A minor');
    expect([m.dominant.name, m.subdominant.name, m.relative.name, m.parallel.name]).toEqual(['E minor', 'D minor', 'C major', 'A major']);
    expect(neighborKeys('C# major').dominant.name).toBe('Ab major');
    expect(neighborKeys('Cb major').subdominant.name).toBe('E major');
    expect(neighborKeys('Db major').parallel.name).toBe('C# minor');
    expect(closelyRelatedKeys('G major').map((k) => k.name)).toEqual(['E minor', 'D major', 'B minor', 'C major', 'A minor']);
    // Neighbouring keys differ by exactly one note.
    for (const k of MAJOR_KEYS) {
      if (Math.abs(k.fifths) === 7) continue;
      for (const other of [neighborKeys(k).dominant, neighborKeys(k).subdominant]) {
        const shared = other.scale.filter((x) => k.scale.map((y) => chroma(y)).includes(chroma(x)));
        expect(shared.length, `${k.name} / ${other.name}`).toBe(6);
      }
    }
  });

  it('lays out the circle of fifths', () => {
    const circle = circleOfFifths();
    expect(circle).toHaveLength(12);
    expect(circle.map((s) => s.major.map((k) => k.tonic).join('/'))).toEqual(['C', 'G', 'D', 'A', 'E', 'B/Cb', 'F#/Gb', 'Db/C#', 'Ab', 'Eb', 'Bb', 'F']);
    expect(circle.map((s) => s.minor.map((k) => k.tonic).join('/'))).toEqual(['A', 'E', 'B', 'F#', 'C#', 'G#/Ab', 'D#/Eb', 'Bb/A#', 'F', 'C', 'G', 'D']);
    expect(circle.map((s) => s.angle)).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
    circle.forEach((slot, i) => {
      expect(slot.pc).toBe((i * 7) % 12);
      for (const k of [...slot.major, ...slot.minor]) expect(chroma(k.tonic)).toBe(k.mode === 'major' ? slot.pc : (slot.pc + 9) % 12);
    });
    expect(circle.flatMap((s) => [...s.major, ...s.minor])).toHaveLength(30);
  });
});

describe('chords of a key', () => {
  it('builds diatonic triads and sevenths with functions', () => {
    const c = diatonicChords('C');
    expect(c.map((d) => d.symbol)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(c.map((d) => d.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(c.map((d) => d.function)).toEqual(['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant']);
    expect(diatonicChords('C', { sevenths: true }).map((d) => d.symbol)).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5']);
    expect(diatonicChords('Bb', { sevenths: true }).map((d) => d.symbol)).toEqual(['Bbmaj7', 'Cm7', 'Dm7', 'Ebmaj7', 'F7', 'Gm7', 'Am7b5']);
    expect(diatonicChords('E').map((d) => d.symbol)).toEqual(['E', 'F#m', 'G#m', 'A', 'B', 'C#m', 'D#dim']);
    expect(diatonicChords('Gb').map((d) => d.symbol)).toEqual(['Gb', 'Abm', 'Bbm', 'Cb', 'Db', 'Ebm', 'Fdim']);
  });

  it('exposes the three forms of a minor key', () => {
    expect(diatonicChords('A minor').map((d) => d.symbol)).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(diatonicChords('A minor').map((d) => d.roman)).toEqual(['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII']);
    expect(diatonicChords('A minor').map((d) => d.function)).toEqual(['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'subdominant', 'dominant']);
    expect(diatonicChords('A minor', { minor: 'harmonic' }).map((d) => d.symbol)).toEqual(['Am', 'Bdim', 'Caug', 'Dm', 'E', 'F', 'G#dim']);
    expect(diatonicChords('A minor', { minor: 'melodic' }).map((d) => d.symbol)).toEqual(['Am', 'Bm', 'Caug', 'D', 'E', 'F#dim', 'G#dim']);
    expect(diatonicChords('E minor', { sevenths: true, minor: 'harmonic' }).map((d) => d.symbol)).toEqual(['EmMaj7', 'F#m7b5', 'Gmaj7#5', 'Am7', 'B7', 'Cmaj7', 'D#dim7']);
    expect(diatonicChords('A minor', { minor: 'harmonic' })[4]).toMatchObject({ roman: 'V', function: 'dominant', variant: 'harmonic' });
    expect(diatonicChords('C', { minor: 'harmonic' })[4].variant).toBe('natural');
    expect(keyChords('A minor').map((d) => d.symbol)).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G', 'E', 'G#dim']);
    expect(keyChords('A minor', { sevenths: true }).map((d) => d.symbol)).toEqual(['Am7', 'Bm7b5', 'Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'E7', 'G#dim7']);
    expect(keyChords('G').map((d) => d.symbol)).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim']);
  });

  it('gives every key the same pattern of chord qualities', () => {
    for (const k of MAJOR_KEYS) {
      expect(diatonicChords(k).map((d) => d.type.id), k.name).toEqual(['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim']);
      expect(diatonicChords(k, { sevenths: true }).map((d) => d.type.id), k.name).toEqual(['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']);
    }
    for (const k of MINOR_KEYS) {
      expect(diatonicChords(k).map((d) => d.type.id), k.name).toEqual(['minor', 'dim', 'major', 'minor', 'minor', 'major', 'major']);
      expect(diatonicChords(k, { minor: 'harmonic', sevenths: true }).map((d) => d.type.id), k.name).toEqual(['mmaj7', 'm7b5', 'maj7sharp5', 'm7', '7', 'maj7', 'dim7']);
    }
  });

  it('tests membership', () => {
    expect(chordInKey('Dm7', 'C')).toBe(true);
    expect(chordInKey('D7', 'C')).toBe(false);
    expect(chordInKey('E7', 'A minor')).toBe(true);
    expect(chordInKey('D', 'A minor')).toBe(true);
    expect(chordInKey('Eb', 'A minor')).toBe(false);
    expect(inKey('F#', 'G')).toBe(true);
    expect(inKey('F', 'G')).toBe(false);
    expect(inKey('G#', 'A minor')).toBe(false);
    expect(inKey('G#', 'A minor', 'harmonic')).toBe(true);
    expect(inKey(66, 'G')).toBe(true);
  });
});

describe('spelling and degrees in a key', () => {
  it('spells pitch classes the way the key would', () => {
    const all = (name: string) => [...Array(12).keys()].map((pc) => spellInKey((chroma(key(name).tonic) + pc) % 12, name));
    expect(all('C major')).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
    expect(all('A minor')).toEqual(['A', 'Bb', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']);
    expect(all('F# major')).toEqual(['F#', 'G', 'G#', 'A', 'A#', 'B', 'B#', 'C#', 'D', 'D#', 'E', 'E#']);
    expect(all('Eb major')).toEqual(['Eb', 'Fb', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'Cb', 'C', 'Db', 'D']);
    expect(all('E minor')).toEqual(['E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#']);
    for (const k of ALL_KEYS) {
      for (const n of [...k.scale, ...(k.harmonicMinor ?? []), ...(k.melodicMinor ?? [])]) {
        expect(spellInKey(chroma(n), k), `${n} in ${k.name}`).toBe(n);
      }
    }
  });

  it('keeps octaves for MIDI numbers', () => {
    expect(spellInKey(66, 'G major')).toBe('F#4');
    expect(spellInKey(66, 'Gb major')).toBe('Gb4');
    expect(spellInKey(65, 'F# major')).toBe('E#4');
    expect(spellInKey(60, 'C# major')).toBe('B#3');
    expect(spellInKey(59, 'Gb major')).toBe('Cb4');
    expect(spellInKey(40, 'E minor')).toBe('E2');
    expect(spellInKey(66, 'G major', { octave: false })).toBe('F#');
  });

  it('names degrees', () => {
    expect(degreeInKey('E', 'C')).toBe('3');
    expect(degreeInKey('Eb', 'C')).toBe('b3');
    expect(degreeInKey('F#', 'C')).toBe('#4');
    expect(degreeInKey('Gb', 'C')).toBe('b5');
    expect(degreeInKey('C', 'A minor')).toBe('b3');
    expect(degreeInKey('G#', 'A minor')).toBe('7');
    expect(degreeInKey('E#', 'F# major')).toBe('7');
    expect(noteAtDegree('Eb major', 'b7')).toBe('Db');
    expect(noteAtDegree('A minor', '5')).toBe('E');
    expect(noteAtDegree('F#', '7')).toBe('E#');
  });
});

describe('detectKey', () => {
  const best = (chords: string[]) => detectKeyFromChords(chords)[0].key.name;
  const top2 = (chords: string[]) => detectKeyFromChords(chords).slice(0, 2).map((g) => g.key.name);

  it('finds the key of common progressions', () => {
    expect(best(['C', 'G', 'Am', 'F'])).toBe('C major');
    expect(best(['G', 'C', 'D', 'G'])).toBe('G major');
    expect(best(['Dm7', 'G7', 'Cmaj7'])).toBe('C major');
    expect(best(['Am', 'Dm', 'E7', 'Am'])).toBe('A minor');
    expect(best(['E', 'A', 'B7'])).toBe('E major');
    expect(best(['C', 'F', 'G'])).toBe('C major');
    expect(best(['D', 'A', 'Bm', 'G'])).toBe('D major');
    expect(best(['Em', 'Am', 'B7', 'Em'])).toBe('E minor');
    expect(best(['F#m', 'Bm', 'C#7', 'F#m'])).toBe('F# minor');
    expect(best(['Bb', 'Eb', 'F7', 'Bb'])).toBe('Bb major');
    expect(best(['Cm', 'Fm', 'G7', 'Cm'])).toBe('C minor');
    expect(best(['A7', 'D7', 'A7', 'E7', 'D7', 'A7'])).toBe('A major');
    expect(best(['Ebmaj7', 'Cm7', 'Fm7', 'Bb7'])).toBe('Eb major');
    expect(best(['Dm', 'Gm', 'A7', 'Dm'])).toBe('D minor');
    expect(best(['E5', 'G5', 'A5', 'E5'])).toBe('E minor');
    expect(best(['Am', 'G', 'F', 'E'])).toBe('A minor');
    expect(best(['Cmaj7', 'A7', 'Dm7', 'G7'])).toBe('C major');
    expect(best(['D', 'C', 'G', 'D'])).toBe('D major');
  });

  it('finds every one of the thirty keys from its primary chords, spelled as given', () => {
    for (const k of ALL_KEYS) {
      const chords = keyChords(k);
      const cadence = k.mode === 'major'
        ? [chords[0], chords[3], chords[4], chords[0]]
        : [chords[0], chords[3], chords[7], chords[0]];
      const guesses = detectKeyFromChords(cadence.map((c) => c.symbol));
      expect(guesses[0].key.name, k.name).toBe(k.name);
      expect(guesses[0].confidence, k.name).toBeGreaterThan(0.6);
      const sevenths = keyChords(k, { sevenths: true });
      const twoFiveOne = k.mode === 'major' ? [sevenths[1], sevenths[4], sevenths[0]] : [sevenths[1], sevenths[7], sevenths[0]];
      expect(detectKeyFromChords(twoFiveOne.map((c) => c.symbol))[0].key.name, `${k.name} ii-V-i`).toBe(k.name);
    }
  });

  it('finds every key from its scale played up and down', () => {
    for (const k of ALL_KEYS) {
      const up = k.mode === 'major' ? k.scale : k.harmonicMinor!;
      const melody = [...up, k.tonic, ...[...up].reverse()];
      expect(detectKeyFromNotes(melody)[0].key.name, k.name).toBe(k.name);
    }
  });

  it('puts relative keys first and second when the chords fit both', () => {
    expect(top2(['Am', 'F', 'C', 'G']).sort()).toEqual(['A minor', 'C major']);
    expect(top2(['Em', 'C', 'G', 'D']).sort()).toEqual(['E minor', 'G major']);
    expect(top2(['F#m', 'D', 'A', 'E']).sort()).toEqual(['A major', 'F# minor']);
  });

  it('follows the spelling of the chords', () => {
    expect(best(['F#', 'B', 'C#7', 'F#'])).toBe('F# major');
    expect(best(['Gb', 'Cb', 'Db7', 'Gb'])).toBe('Gb major');
    expect(best(['D#m', 'G#m', 'A#7', 'D#m'])).toBe('D# minor');
    expect(best(['Ebm', 'Abm', 'Bb7', 'Ebm'])).toBe('Eb minor');
    expect(best(['Db', 'Gb', 'Ab7', 'Db'])).toBe('Db major');
    expect(best(['C#', 'F#', 'G#7', 'C#'])).toBe('C# major');
  });

  it('reports confidences that reflect how clear the key is', () => {
    const clear = detectKeyFromChords(['Dm7', 'G7', 'Cmaj7', 'Am7', 'Dm7', 'G7', 'C']);
    const vague = detectKeyFromChords(['Am', 'F', 'C', 'G']);
    expect(clear[0].confidence).toBeGreaterThan(0.8);
    expect(vague[0].confidence).toBeLessThan(clear[0].confidence);
    for (const guesses of [clear, vague]) {
      expect(guesses.length).toBe(5);
      expect(guesses.reduce((sum, g) => sum + g.confidence, 0)).toBeLessThanOrEqual(1.001);
      for (let i = 1; i < guesses.length; i++) expect(guesses[i - 1].score).toBeGreaterThanOrEqual(guesses[i].score);
      for (const g of guesses) expect(g.confidence).toBeGreaterThanOrEqual(0);
    }
    expect(detectKeyFromChords([])).toEqual([]);
    expect(detectKeyFromChords(['N.C.', '???'])).toEqual([]);
    expect(detectKeyFromChords(['C', 'N.C.', 'G', 'C'], { limit: 2 })).toHaveLength(2);
  });

  it('detects keys from notes', () => {
    const twinkle = ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'];
    expect(detectKeyFromNotes(twinkle)[0].key.name).toBe('C major');
    const scaleRun = [69, 71, 72, 74, 76, 77, 80, 81, 80, 77, 76, 74, 72, 71, 69];
    expect(detectKeyFromNotes(scaleRun)[0].key.name).toBe('A minor');
    const gMajor = ['G3', 'B3', 'D4', 'G4', 'F#4', 'E4', 'D4', 'C4', 'B3', 'A3', 'G3'];
    expect(detectKeyFromNotes(gMajor)[0].key.name).toBe('G major');
    const eMinor = ['E2', 'G2', 'B2', 'E3', 'D#3', 'E3', 'F#3', 'G3', 'F#3', 'E3', 'B2', 'E2'];
    expect(detectKeyFromNotes(eMinor)[0].key.name).toBe('E minor');
    const flats = ['Eb4', 'G4', 'Bb4', 'Ab4', 'G4', 'F4', 'Eb4', 'D4', 'Eb4'];
    expect(detectKeyFromNotes(flats)[0].key.name).toBe('Eb major');
    expect(detectKeyFromNotes([])).toEqual([]);
    expect(detectKeyFromNotes(['C', 'E', 'G'], { weights: [4, 1, 1] })[0].key.tonic).toBe('C');
  });

  it('chooses chords or notes automatically', () => {
    expect(detectKey(['G', 'C', 'D', 'G'])[0].key.name).toBe('G major');
    expect(detectKey(['G4', 'B4', 'D5', 'G5', 'F#5', 'G5'])[0].key.name).toBe('G major');
    expect(detectKey([67, 71, 74, 79, 78, 79])[0].key.tonic).toBe('G');
    expect(detectKey(['C', 'E', 'G', 'C'], { as: 'notes' })[0].key.name).toBe('C major');
    expect(detectBestKey(['Am', 'Dm', 'E7', 'Am'])!.name).toBe('A minor');
    expect(detectBestKey([])).toBeNull();
  });
});
