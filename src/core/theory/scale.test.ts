import { describe, expect, it } from 'vitest';
import { chord, CHORD_TYPES, getChordType } from './chord';
import { chroma, noteToMidi } from './note';
import {
  compareScales, degreeInScale, filterScales, getScale, harmonizeScale, parallelScales, relativeScales,
  SCALE_FAMILIES, scaleContains, scaleMidi, scaleModes, scaleNotes, scalePcs, SCALES, scalesContaining,
  scalesForChord, searchScales, spellInScale,
} from './scale';

/** Independent truth table: semitones above the tonic for every catalog id. */
const PCS: Record<string, string> = {
  major: '0 2 4 5 7 9 11', dorian: '0 2 3 5 7 9 10', phrygian: '0 1 3 5 7 8 10', lydian: '0 2 4 6 7 9 11',
  mixolydian: '0 2 4 5 7 9 10', minor: '0 2 3 5 7 8 10', locrian: '0 1 3 5 6 8 10',
  'melodic-minor': '0 2 3 5 7 9 11', 'dorian-b2': '0 1 3 5 7 9 10', 'lydian-augmented': '0 2 4 6 8 9 11',
  'lydian-dominant': '0 2 4 6 7 9 10', 'mixolydian-b6': '0 2 4 5 7 8 10', 'locrian-natural-2': '0 2 3 5 6 8 10',
  altered: '0 1 3 4 6 8 10',
  'harmonic-minor': '0 2 3 5 7 8 11', 'locrian-natural-6': '0 1 3 5 6 9 10', 'ionian-augmented': '0 2 4 5 8 9 11',
  'dorian-sharp-4': '0 2 3 6 7 9 10', 'phrygian-dominant': '0 1 4 5 7 8 10', 'lydian-sharp-2': '0 3 4 6 7 9 11',
  ultralocrian: '0 1 3 4 6 8 9',
  'harmonic-major': '0 2 4 5 7 8 11', 'dorian-b5': '0 2 3 5 6 9 10', 'phrygian-b4': '0 1 3 4 7 8 10',
  'lydian-b3': '0 2 3 6 7 9 11', 'mixolydian-b2': '0 1 4 5 7 9 10', 'lydian-augmented-sharp-2': '0 3 4 6 8 9 11',
  'locrian-bb7': '0 1 3 5 6 8 9',
  'double-harmonic': '0 1 4 5 7 8 11', 'lydian-sharp-2-sharp-6': '0 3 4 6 7 10 11', ultraphrygian: '0 1 3 4 7 8 9',
  'hungarian-minor': '0 2 3 6 7 8 11', oriental: '0 1 4 5 6 9 10', 'ionian-augmented-sharp-2': '0 3 4 5 8 9 11',
  'locrian-bb3-bb7': '0 1 2 5 6 8 9',
  'major-pentatonic': '0 2 4 7 9', egyptian: '0 2 5 7 10', 'man-gong': '0 3 5 8 10', yo: '0 2 5 7 9',
  'minor-pentatonic': '0 3 5 7 10', 'dominant-pentatonic': '0 2 4 7 10', 'minor-6-pentatonic': '0 3 5 7 9',
  kumoi: '0 2 3 7 9', 'in-sen': '0 1 5 7 10', 'minor-7b5-pentatonic': '0 3 5 6 10', hirajoshi: '0 2 3 7 8',
  iwato: '0 1 5 6 10', in: '0 1 5 7 8', chinese: '0 4 6 7 11', pelog: '0 1 3 7 8', ryukyu: '0 4 5 7 11',
  'major-hexatonic': '0 2 4 5 7 9', 'minor-hexatonic': '0 2 3 5 7 10',
  'minor-blues': '0 3 5 6 7 10', 'major-blues': '0 2 3 4 7 9', 'combined-blues': '0 2 3 4 5 6 7 9 10',
  'bebop-dominant': '0 2 4 5 7 9 10 11', 'bebop-major': '0 2 4 5 7 8 9 11', 'bebop-dorian': '0 2 3 4 5 7 9 10',
  'bebop-harmonic-minor': '0 2 3 5 7 8 10 11', 'bebop-melodic-minor': '0 2 3 5 7 8 9 11',
  chromatic: '0 1 2 3 4 5 6 7 8 9 10 11', 'whole-tone': '0 2 4 6 8 10', 'diminished-half-whole': '0 1 3 4 6 7 9 10',
  'diminished-whole-half': '0 2 3 5 6 8 9 11', augmented: '0 3 4 7 8 11', 'six-tone-symmetric': '0 1 4 5 8 9',
  tritone: '0 1 4 6 7 10', 'messiaen-3': '0 2 3 4 6 7 8 10 11', 'messiaen-4': '0 1 2 5 6 7 8 11',
  'messiaen-5': '0 1 5 6 7 11', 'messiaen-6': '0 2 4 5 6 8 10 11', 'messiaen-7': '0 1 2 3 5 6 7 8 9 11',
  'neapolitan-major': '0 1 3 5 7 9 11', 'leading-whole-tone': '0 2 4 6 8 10 11', 'lydian-minor': '0 2 4 6 7 8 10',
  'major-locrian': '0 2 4 5 6 8 10', 'neapolitan-minor': '0 1 3 5 7 8 11', 'aeolian-sharp-4': '0 2 3 6 7 8 10',
  'hungarian-major': '0 3 4 6 7 9 10', 'romanian-major': '0 1 4 6 7 9 10', 'spanish-8-tone': '0 1 3 4 5 6 8 10',
  persian: '0 1 4 5 6 8 11', enigmatic: '0 1 4 6 8 10 11', prometheus: '0 2 4 6 9 10',
  'prometheus-neapolitan': '0 1 4 6 9 10',
  todi: '0 1 3 6 7 8 11', purvi: '0 1 4 6 7 8 11', marva: '0 1 4 6 7 9 11',
};

/** Independent truth table: degree formulas of the 35 modes of the five seven-note families. */
const MODE_DEGREES: Record<string, string[]> = {
  major: [
    '1 2 3 4 5 6 7', '1 2 b3 4 5 6 b7', '1 b2 b3 4 5 b6 b7', '1 2 3 #4 5 6 7', '1 2 3 4 5 6 b7', '1 2 b3 4 5 b6 b7',
    '1 b2 b3 4 b5 b6 b7',
  ],
  'melodic-minor': [
    '1 2 b3 4 5 6 7', '1 b2 b3 4 5 6 b7', '1 2 3 #4 #5 6 7', '1 2 3 #4 5 6 b7', '1 2 3 4 5 b6 b7', '1 2 b3 4 b5 b6 b7',
    '1 b2 b3 b4 b5 b6 b7',
  ],
  'harmonic-minor': [
    '1 2 b3 4 5 b6 7', '1 b2 b3 4 b5 6 b7', '1 2 3 4 #5 6 7', '1 2 b3 #4 5 6 b7', '1 b2 3 4 5 b6 b7', '1 #2 3 #4 5 6 7',
    '1 b2 b3 b4 b5 b6 bb7',
  ],
  'harmonic-major': [
    '1 2 3 4 5 b6 7', '1 2 b3 4 b5 6 b7', '1 b2 b3 b4 5 b6 b7', '1 2 b3 #4 5 6 7', '1 b2 3 4 5 6 b7', '1 #2 3 #4 #5 6 7',
    '1 b2 b3 4 b5 b6 bb7',
  ],
  'double-harmonic': [
    '1 b2 3 4 5 b6 7', '1 #2 3 #4 5 #6 7', '1 b2 b3 b4 5 b6 bb7', '1 2 b3 #4 5 b6 7', '1 b2 3 4 b5 6 b7', '1 #2 3 4 #5 6 7',
    '1 b2 bb3 4 b5 b6 bb7',
  ],
};
const MODE_IDS: Record<string, string[]> = {
  major: ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'],
  'melodic-minor': ['melodic-minor', 'dorian-b2', 'lydian-augmented', 'lydian-dominant', 'mixolydian-b6', 'locrian-natural-2', 'altered'],
  'harmonic-minor': ['harmonic-minor', 'locrian-natural-6', 'ionian-augmented', 'dorian-sharp-4', 'phrygian-dominant', 'lydian-sharp-2', 'ultralocrian'],
  'harmonic-major': ['harmonic-major', 'dorian-b5', 'phrygian-b4', 'lydian-b3', 'mixolydian-b2', 'lydian-augmented-sharp-2', 'locrian-bb7'],
  'double-harmonic': ['double-harmonic', 'lydian-sharp-2-sharp-6', 'ultraphrygian', 'hungarian-minor', 'oriental', 'ionian-augmented-sharp-2', 'locrian-bb3-bb7'],
};

/** Independent truth table: spelled scales. */
const SPELLED: Array<[string, string, string]> = [
  // The fifteen major scales.
  ['C', 'major', 'C D E F G A B'], ['G', 'major', 'G A B C D E F#'], ['D', 'major', 'D E F# G A B C#'],
  ['A', 'major', 'A B C# D E F# G#'], ['E', 'major', 'E F# G# A B C# D#'], ['B', 'major', 'B C# D# E F# G# A#'],
  ['F#', 'major', 'F# G# A# B C# D# E#'], ['C#', 'major', 'C# D# E# F# G# A# B#'], ['F', 'major', 'F G A Bb C D E'],
  ['Bb', 'major', 'Bb C D Eb F G A'], ['Eb', 'major', 'Eb F G Ab Bb C D'], ['Ab', 'major', 'Ab Bb C Db Eb F G'],
  ['Db', 'major', 'Db Eb F Gb Ab Bb C'], ['Gb', 'major', 'Gb Ab Bb Cb Db Eb F'], ['Cb', 'major', 'Cb Db Eb Fb Gb Ab Bb'],
  // Minor scales, including the famously tricky ones.
  ['A', 'minor', 'A B C D E F G'], ['E', 'minor', 'E F# G A B C D'], ['D#', 'minor', 'D# E# F# G# A# B C#'],
  ['Eb', 'minor', 'Eb F Gb Ab Bb Cb Db'], ['A#', 'minor', 'A# B# C# D# E# F# G#'], ['Ab', 'minor', 'Ab Bb Cb Db Eb Fb Gb'],
  ['G#', 'harmonic-minor', 'G# A# B C# D# E F##'], ['A', 'harmonic-minor', 'A B C D E F G#'],
  ['D', 'harmonic-minor', 'D E F G A Bb C#'], ['C#', 'harmonic-minor', 'C# D# E F# G# A B#'],
  ['F', 'harmonic-minor', 'F G Ab Bb C Db E'], ['D#', 'harmonic-minor', 'D# E# F# G# A# B C##'],
  ['A', 'melodic-minor', 'A B C D E F# G#'], ['Bb', 'melodic-minor', 'Bb C Db Eb F G A'], ['G#', 'melodic-minor', 'G# A# B C# D# E# F##'],
  // Modes.
  ['D', 'dorian', 'D E F G A B C'], ['E', 'phrygian', 'E F G A B C D'], ['F', 'lydian', 'F G A B C D E'],
  ['G', 'mixolydian', 'G A B C D E F'], ['B', 'locrian', 'B C D E F G A'], ['E', 'phrygian-dominant', 'E F G# A B C D'],
  ['Bb', 'lydian-dominant', 'Bb C D E F G Ab'], ['G', 'altered', 'G Ab Bb Cb Db Eb F'], ['C', 'altered', 'C Db Eb Fb Gb Ab Bb'],
  ['C', 'double-harmonic', 'C Db E F G Ab B'], ['A', 'hungarian-minor', 'A B C D# E F G#'], ['F#', 'dorian', 'F# G# A B C# D# E'],
  ['Eb', 'lydian', 'Eb F G A Bb C D'], ['C', 'ultralocrian', 'C Db Eb Fb Gb Ab Bbb'], ['C', 'hungarian-major', 'C D# E F# G A Bb'],
  ['C', 'enigmatic', 'C Db E F# G# A# B'], ['C', 'persian', 'C Db E F Gb Ab B'], ['C', 'neapolitan-minor', 'C Db Eb F G Ab B'],
  // Pentatonic and blues.
  ['A', 'minor-pentatonic', 'A C D E G'], ['C', 'major-pentatonic', 'C D E G A'], ['F#', 'minor-pentatonic', 'F# A B C# E'],
  ['C#', 'major-pentatonic', 'C# D# E# G# A#'], ['Eb', 'minor-pentatonic', 'Eb Gb Ab Bb Db'], ['E', 'minor-pentatonic', 'E G A B D'],
  ['A', 'minor-blues', 'A C D Eb E G'], ['E', 'minor-blues', 'E G A Bb B D'], ['C', 'major-blues', 'C D Eb E G A'],
  ['Db', 'minor-blues', 'Db Fb Gb G Ab Cb'], ['G', 'major-pentatonic', 'G A B D E'], ['A', 'hirajoshi', 'A B C E F'],
  ['D', 'in-sen', 'D Eb G A C'], ['C', 'kumoi', 'C D Eb G A'], ['C', 'combined-blues', 'C D Eb E F Gb G A Bb'],
  // Bebop and symmetric scales.
  ['C', 'bebop-dominant', 'C D E F G A Bb B'], ['F#', 'bebop-dominant', 'F# G# A# B C# D# E E#'],
  ['C', 'whole-tone', 'C D E F# G# Bb'], ['F#', 'whole-tone', 'F# G# A# C D E'], ['Gb', 'whole-tone', 'Gb Ab Bb C D E'],
  ['C', 'diminished-half-whole', 'C Db Eb E F# G A Bb'], ['C', 'diminished-whole-half', 'C D Eb F Gb Ab A B'],
  ['Db', 'diminished-half-whole', 'Db D E F G Ab Bb B'], ['C', 'chromatic', 'C Db D Eb E F F# G Ab A Bb B'],
  ['F#', 'chromatic', 'F# G G# A A# B C C# D D# E F'], ['C', 'augmented', 'C Eb E G G# B'], ['C', 'tritone', 'C Db E Gb G Bb'],
];

const pcsOf = (id: string) => PCS[id].split(' ').map(Number);

describe('scale catalog', () => {
  it('has at least 80 scales with unique ids, names and note sets', () => {
    expect(SCALES.length).toBeGreaterThanOrEqual(80);
    expect(new Set(SCALES.map((s) => s.id)).size).toBe(SCALES.length);
    expect(new Set(SCALES.map((s) => s.name)).size).toBe(SCALES.length);
    expect(new Set(SCALES.map((s) => s.mask)).size).toBe(SCALES.length);
  });

  it('matches the independent semitone table exactly', () => {
    expect(Object.keys(PCS).sort()).toEqual(SCALES.map((s) => s.id).sort());
    for (const scale of SCALES) expect(scale.semitones, scale.id).toEqual(pcsOf(scale.id));
  });

  it('spans exactly one octave in ascending steps', () => {
    for (const scale of SCALES) {
      expect(scale.semitones[0], scale.id).toBe(0);
      expect(scale.steps.reduce((a, b) => a + b, 0), scale.id).toBe(12);
      expect(scale.steps.every((s) => s >= 1 && s <= 4), scale.id).toBe(true);
      expect(scale.steps.length).toBe(scale.size);
      expect(scale.stepPattern.length).toBe(scale.size);
      expect([...scale.semitones].sort((a, b) => a - b), scale.id).toEqual(scale.semitones);
      expect(new Set(scale.semitones).size).toBe(scale.size);
      expect(scale.degrees[0]).toBe('1');
      expect(scale.intervals[0]).toBe('P1');
    }
  });

  it('writes step patterns', () => {
    expect(getScale('major')!.stepPattern.join(' ')).toBe('W W H W W W H');
    expect(getScale('minor')!.stepPattern.join(' ')).toBe('W H W W H W W');
    expect(getScale('harmonic-minor')!.stepPattern.join(' ')).toBe('W H W W H WH H');
    expect(getScale('minor-pentatonic')!.stepPattern.join(' ')).toBe('WH W W WH W');
    expect(getScale('whole-tone')!.stepPattern.join(' ')).toBe('W W W W W W');
    expect(getScale('diminished-half-whole')!.stepPattern.join(' ')).toBe('H W H W H W H W');
    expect(getScale('hirajoshi')!.stepPattern.join(' ')).toBe('W H 2W H 2W');
    expect(getScale('chromatic')!.steps).toEqual(Array(12).fill(1));
  });

  it('has complete, sane metadata for every scale', () => {
    const families = SCALE_FAMILIES.map((f) => f.id);
    for (const scale of SCALES) {
      expect(scale.id, scale.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(families, scale.id).toContain(scale.family);
      expect(scale.description.length, scale.id).toBeGreaterThan(30);
      expect(scale.uses.length, scale.id).toBeGreaterThan(10);
      expect(`${scale.description}${scale.uses}`, scale.id).not.toMatch(/!/);
      expect(scale.genres.length, scale.id).toBeGreaterThan(0);
      expect([1, 2, 3, 4]).toContain(scale.tier);
      expect(scale.tags.length).toBeGreaterThan(2);
      expect(new Set(scale.aliases).size, `${scale.id} aliases`).toBe(scale.aliases.length);
    }
    for (const family of families) expect(filterScales({ family }).length, family).toBeGreaterThan(0);
  });

  it('never lets two scales answer to the same name', () => {
    const key = (text: string) => text.toLowerCase().replace(/[()’'.]/g, ' ').replace(/[\s_-]+/g, ' ').trim().replace(/ (scale|mode)$/, '');
    const owner = new Map<string, string>();
    for (const scale of SCALES) {
      for (const name of [scale.id, scale.name, ...scale.aliases]) {
        const k = key(name);
        const existing = owner.get(k);
        expect(existing === undefined || existing === scale.id, `"${name}" names both ${existing} and ${scale.id}`).toBe(true);
        owner.set(k, scale.id);
        expect(getScale(name)!.id, name).toBe(scale.id);
      }
    }
  });

  it('lists only real chord types, and scales contain the chords they claim', () => {
    const ids = new Set(CHORD_TYPES.map((t) => t.id));
    // The blues tradition: these scales are played over dominant chords precisely for the clash.
    const colour = new Set(['minor-pentatonic:7', 'minor-pentatonic:7sharp9', 'minor-blues:7', 'minor-blues:7sharp9', 'major-blues:7']);
    for (const scale of SCALES) {
      expect(new Set(scale.chords).size, scale.id).toBe(scale.chords.length);
      for (const id of scale.chords) {
        expect(ids.has(id), `${scale.id} lists unknown chord ${id}`).toBe(true);
        const type = getChordType(id)!;
        // A listed scale may alter the perfect fifth of a four-note-or-larger chord (altered over 7#9).
        const needed = type.semitones.filter((s) => !(s === 7 && type.semitones.length >= 4));
        const contained = needed.every((s) => scale.semitones.includes(s % 12));
        expect(contained || colour.has(`${scale.id}:${id}`), `${scale.id} does not contain ${id}`).toBe(true);
      }
    }
  });

  it('derives a quality for each scale', () => {
    const q = (id: string) => getScale(id)!.quality;
    expect(q('major')).toBe('major');
    expect(q('lydian')).toBe('major');
    expect(q('dorian')).toBe('minor');
    expect(q('minor-pentatonic')).toBe('minor');
    expect(q('mixolydian')).toBe('dominant');
    expect(q('altered')).toBe('dominant');
    expect(q('phrygian-dominant')).toBe('dominant');
    expect(q('locrian')).toBe('diminished');
    expect(q('diminished-whole-half')).toBe('diminished');
    expect(q('whole-tone')).toBe('augmented');
    expect(q('egyptian')).toBe('suspended');
    expect(q('chromatic')).toBe('other');
  });
});

describe('modes', () => {
  it('derives every mode of the five seven-note families correctly', () => {
    for (const [parent, ids] of Object.entries(MODE_IDS)) {
      ids.forEach((id, index) => {
        const scale = getScale(id)!;
        expect(scale, id).not.toBeNull();
        expect(scale.degrees.join(' '), id).toBe(MODE_DEGREES[parent][index]);
        expect(scale.parent, id).toBe(parent);
        expect(scale.mode, id).toBe(index + 1);
      });
    }
  });

  it('makes every declared mode the right rotation of its parent', () => {
    for (const scale of SCALES) {
      if (!scale.parent || scale.mode === null) continue;
      const parent = pcsOf(scale.parent);
      const start = parent[scale.mode - 1];
      const rotated = parent.map((_p, j) => (parent[(scale.mode! - 1 + j) % parent.length] - start + 12) % 12);
      expect(scale.semitones, `${scale.id} = mode ${scale.mode} of ${scale.parent}`).toEqual(rotated);
      expect(getScale(scale.parent)!.size).toBe(scale.size);
    }
  });

  it('uses each letter once in every seven-note scale, on every tonic', () => {
    const tonics = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'Cb'];
    for (const scale of SCALES) {
      if (scale.size !== 7) continue;
      for (const tonic of tonics) {
        const notes = scaleNotes(tonic, scale);
        expect(new Set(notes.map((n) => n[0])).size, `${tonic} ${scale.id}: ${notes.join(' ')}`).toBe(7);
      }
    }
  });

  it('lists the modes of a scale and finds them in the catalog', () => {
    expect(scaleModes('major').map((m) => m.scale?.id)).toEqual(MODE_IDS.major);
    expect(scaleModes('harmonic-minor').map((m) => m.scale?.id)).toEqual(MODE_IDS['harmonic-minor']);
    expect(scaleModes('major-pentatonic').map((m) => m.scale?.id)).toEqual(['major-pentatonic', 'egyptian', 'man-gong', 'yo', 'minor-pentatonic']);
    expect(scaleModes('dorian')[4].scale?.id).toBe('minor');
    expect(scaleModes('dorian')[4].degrees.join(' ')).toBe('1 2 b3 4 5 b6 b7');
    expect(scaleModes('whole-tone').every((m) => m.scale?.id === 'whole-tone')).toBe(true);
    expect(scaleModes('major-blues')[5].scale?.id).toBe('minor-blues');
    expect(scaleModes('kumoi')[1].scale?.id).toBe('in-sen');
    expect(scaleModes('hirajoshi').map((m) => m.scale?.id ?? null)).toEqual(['hirajoshi', 'iwato', null, 'in', 'chinese']);
    expect(scaleModes('major-hexatonic')[1].scale?.id).toBe('minor-hexatonic');
    expect(scaleModes('augmented')[1].scale?.id).toBe('six-tone-symmetric');
  });

  it('proves the symmetric scales really are symmetric', () => {
    const invariantUnder = (id: string, shift: number) => {
      const set = pcsOf(id);
      const moved = set.map((p) => (p + shift) % 12).sort((a, b) => a - b);
      return moved.join(' ') === set.join(' ');
    };
    expect(invariantUnder('whole-tone', 2)).toBe(true);
    expect(invariantUnder('diminished-half-whole', 3)).toBe(true);
    expect(invariantUnder('diminished-whole-half', 3)).toBe(true);
    expect(invariantUnder('augmented', 4)).toBe(true);
    expect(invariantUnder('six-tone-symmetric', 4)).toBe(true);
    expect(invariantUnder('messiaen-3', 4)).toBe(true);
    for (const id of ['tritone', 'messiaen-4', 'messiaen-5', 'messiaen-6', 'messiaen-7']) expect(invariantUnder(id, 6), id).toBe(true);
    expect(invariantUnder('major', 6)).toBe(false);
  });

  it('relates blues and bebop scales to their sources', () => {
    const set = (id: string) => new Set(pcsOf(id));
    const union = new Set([...set('minor-blues'), ...set('major-blues')]);
    expect([...union].sort((a, b) => a - b)).toEqual(pcsOf('combined-blues'));
    const added = (bebop: string, base: string) => pcsOf(bebop).filter((p) => !set(base).has(p));
    expect(added('bebop-dominant', 'mixolydian')).toEqual([11]);
    expect(added('bebop-major', 'major')).toEqual([8]);
    expect(added('bebop-dorian', 'dorian')).toEqual([4]);
    expect(added('bebop-harmonic-minor', 'harmonic-minor')).toEqual([10]);
    expect(added('bebop-melodic-minor', 'melodic-minor')).toEqual([8]);
    expect(added('minor-blues', 'minor-pentatonic')).toEqual([6]);
    expect(added('major-blues', 'major-pentatonic')).toEqual([3]);
    for (const p of pcsOf('major-pentatonic')) expect(set('major').has(p)).toBe(true);
    for (const p of pcsOf('minor-pentatonic')) expect(set('minor').has(p)).toBe(true);
  });

  it('finds relative and parallel scales', () => {
    const rel = relativeScales('C', 'major').map((r) => `${r.tonic} ${r.scale.id}`);
    expect(rel).toEqual(['D dorian', 'E phrygian', 'F lydian', 'G mixolydian', 'A minor', 'B locrian']);
    expect(relativeScales('A', 'minor').map((r) => `${r.tonic} ${r.scale.id}`)).toContain('C major');
    expect(relativeScales('A', 'minor-pentatonic').map((r) => `${r.tonic} ${r.scale.id}`)).toContain('C major-pentatonic');
    expect(relativeScales('F#', 'minor').find((r) => r.scale.id === 'major')!.tonic).toBe('A');
    // A symmetric scale is its own relative on each of its notes.
    expect(relativeScales('C', 'whole-tone').map((r) => `${r.tonic} ${r.scale.id}`)).toEqual(['D whole-tone', 'E whole-tone', 'F# whole-tone', 'G# whole-tone', 'Bb whole-tone']);
    expect(parallelScales('C', 'major').map((r) => `${r.tonic} ${r.scale.id}`)).toEqual([
      'C dorian', 'C phrygian', 'C lydian', 'C mixolydian', 'C minor', 'C locrian',
    ]);
    expect(parallelScales('E', 'phrygian-dominant').map((r) => r.scale.id)).toContain('harmonic-minor');
    // Relative modes share their notes exactly.
    for (const { tonic, scale } of relativeScales('Eb', 'melodic-minor')) {
      expect(scalePcs(tonic, scale).sort((a, b) => a - b)).toEqual(scalePcs('Eb', 'melodic-minor').sort((a, b) => a - b));
    }
  });
});

describe('scaleNotes', () => {
  it('spells scales correctly', () => {
    for (const [tonic, id, notes] of SPELLED) {
      expect(scaleNotes(tonic, id).join(' '), `${tonic} ${id}`).toBe(notes);
    }
  });

  it('puts every note at the right pitch on every tonic', () => {
    const tonics = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'Bb', 'B', 'Cb'];
    for (const scale of SCALES) {
      for (const tonic of tonics) {
        const notes = scaleNotes(tonic, scale);
        const offsets = notes.map((n) => (chroma(n) - chroma(tonic) + 12) % 12);
        expect(offsets, `${tonic} ${scale.id}`).toEqual(scale.semitones);
        expect(scalePcs(tonic, scale)).toEqual(notes.map((n) => chroma(n)));
        if (scale.size !== 7) {
          for (const n of notes.slice(1)) expect(n, `${tonic} ${scale.id}`).not.toMatch(/##|bb/);
        }
      }
    }
  });

  it('carries octaves upward from a pitched tonic', () => {
    expect(scaleNotes('C4', 'major')).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4']);
    expect(scaleNotes('A3', 'minor')).toEqual(['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4']);
    expect(scaleNotes('E2', 'minor-pentatonic', { closed: true })).toEqual(['E2', 'G2', 'A2', 'B2', 'D3', 'E3']);
    expect(scaleNotes('F#3', 'whole-tone').map((n) => noteToMidi(n))).toEqual([54, 56, 58, 60, 62, 64]);
    expect(scaleNotes('C', 'major', { closed: true })).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']);
    expect(scaleMidi(60, 'major')).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(scaleMidi(40, 'minor-pentatonic', 2)).toEqual([40, 43, 45, 47, 50, 52, 55, 57, 59, 62, 64]);
  });

  it('accepts names and aliases, and rejects unknown scales', () => {
    expect(scaleNotes('A', 'Aeolian')).toEqual(scaleNotes('A', 'minor'));
    expect(scaleNotes('C')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(() => scaleNotes('C', 'nonsense')).toThrow(RangeError);
    expect(() => scaleNotes('H', 'major')).toThrow(RangeError);
  });

  it('tests membership and degrees', () => {
    expect(scaleContains('C', 'major', 'E')).toBe(true);
    expect(scaleContains('C', 'major', 'Eb')).toBe(false);
    expect(scaleContains('C', 'major', 64)).toBe(true);
    expect(degreeInScale('A', 'major', 'C#')).toBe('3');
    expect(degreeInScale('A', 'minor', 'C')).toBe('b3');
    expect(degreeInScale('A', 'minor', 'C#')).toBeNull();
    expect(degreeInScale('A', 'minor', 'C#', { chromatic: true })).toBe('3');
    expect(degreeInScale('C', 'major', 'F#', { chromatic: true })).toBe('#4');
    expect(degreeInScale('C', 'major', 'Bb', { chromatic: true })).toBe('b7');
    expect(degreeInScale('C', 'major', 61, { chromatic: true })).toBe('b2');
  });

  it('spells any pitch class in the context of a scale', () => {
    expect(spellInScale('F#', 'major', 5)).toBe('E#');
    expect(spellInScale('C', 'major', 6)).toBe('F#');
    expect(spellInScale('C', 'major', 10)).toBe('Bb');
    expect(spellInScale('A', 'harmonic-minor', 8)).toBe('G#');
    expect(spellInScale('A', 'minor', 8)).toBe('G#');
    expect(spellInScale('A', 'minor', 10)).toBe('Bb');
    expect(spellInScale('A', 'minor', 7)).toBe('G');
    expect(spellInScale('Eb', 'major', 6)).toBe('Gb');
    expect(spellInScale('Eb', 'major', 9)).toBe('A');
    expect(spellInScale('E', 'major', 0)).toBe('C');
    expect(spellInScale('Gb', 'major', 11)).toBe('Cb');
  });
});

describe('lookup and search', () => {
  it('finds scales by id, name and alias', () => {
    const cases: Array<[string, string]> = [
      ['major', 'major'], ['Ionian', 'major'], ['ionian mode', 'major'], ['Natural Minor', 'minor'], ['aeolian', 'minor'],
      ['minor scale', 'minor'], ['Super Locrian', 'altered'], ['super-locrian', 'altered'], ['altered scale', 'altered'],
      ['Ukrainian Dorian', 'dorian-sharp-4'], ['Romanian minor', 'dorian-sharp-4'], ['Dorian ♯4', 'dorian-sharp-4'],
      ['acoustic', 'lydian-dominant'], ['Lydian b7', 'lydian-dominant'], ['Spanish Gypsy', 'phrygian-dominant'],
      ['Freygish', 'phrygian-dominant'], ['Byzantine', 'double-harmonic'], ['arabic', 'double-harmonic'],
      ['Gypsy minor', 'hungarian-minor'], ['blues', 'minor-blues'], ['Blues Scale', 'minor-blues'],
      ['half-whole diminished', 'diminished-half-whole'], ['diminished', 'diminished-whole-half'],
      ['whole tone', 'whole-tone'], ['Whole-Tone Scale', 'whole-tone'], ['jazz minor', 'melodic-minor'],
      ['hindu', 'mixolydian-b6'], ['suspended pentatonic', 'egyptian'], ['Sakura', 'in'], ['In Sen', 'in-sen'],
      ['Mystic', 'prometheus'], ['Locrian #2', 'locrian-natural-2'], ['Locrian ♮2', 'locrian-natural-2'],
      ['bebop', 'bebop-dominant'], ['pentatonic minor', 'minor-pentatonic'], ['Mixolydian ♭6', 'mixolydian-b6'],
    ];
    for (const [query, id] of cases) expect(getScale(query)?.id, query).toBe(id);
    expect(getScale('no such scale')).toBeNull();
    expect(getScale(SCALES[3])).toBe(SCALES[3]);
  });

  it('searches by text, tags and genre', () => {
    expect(searchScales('dorian')[0].id).toBe('dorian');
    expect(searchScales('dorian').map((s) => s.id)).toEqual(expect.arrayContaining(['dorian-b2', 'dorian-sharp-4', 'dorian-b5', 'bebop-dorian']));
    expect(searchScales('pentatonic').length).toBeGreaterThanOrEqual(10);
    expect(searchScales('pentatonic')[0].id).toBe('major-pentatonic');
    expect(searchScales('flamenco').map((s) => s.id)).toContain('phrygian-dominant');
    expect(searchScales('japanese').map((s) => s.id)).toEqual(expect.arrayContaining(['hirajoshi', 'in-sen', 'iwato']));
    expect(searchScales('klezmer').map((s) => s.id)).toContain('dorian-sharp-4');
    expect(searchScales('').length).toBe(SCALES.length);
    expect(searchScales('qqqq')).toEqual([]);
  });

  it('filters the catalog', () => {
    expect(filterScales({ family: 'diatonic' }).map((s) => s.id)).toEqual(MODE_IDS.major);
    expect(filterScales({ maxTier: 1 }).map((s) => s.id)).toEqual(['major', 'minor', 'major-pentatonic', 'minor-pentatonic', 'minor-blues', 'chromatic']);
    expect(filterScales({ size: 5 }).length).toBeGreaterThanOrEqual(14);
    expect(filterScales({ size: 8, family: 'bebop' }).length).toBe(5);
    expect(filterScales({ family: 'symmetric', tags: ['hexatonic'] }).map((s) => s.id)).toEqual(['whole-tone', 'augmented', 'six-tone-symmetric', 'tritone', 'messiaen-5']);
    expect(filterScales({ chord: '7alt' }).map((s) => s.id)).toEqual(['altered', 'spanish-8-tone']);
    expect(filterScales({ quality: 'dominant', family: 'melodic-minor' }).map((s) => s.id)).toEqual(['lydian-dominant', 'mixolydian-b6', 'altered']);
    expect(filterScales({ family: 'diatonic', isMode: false }).map((s) => s.id)).toEqual(['major']);
    for (const family of ['diatonic', 'melodic-minor', 'harmonic-minor', 'harmonic-major', 'double-harmonic'] as const) {
      expect(filterScales({ family }).length, family).toBe(7);
    }
  });
});

describe('scalesContaining', () => {
  it('finds the scales that hold a set of notes', () => {
    const exact = scalesContaining(['C', 'D', 'E', 'F', 'G', 'A', 'B'], { exact: true }).map((m) => `${m.tonic} ${m.scale.id}`);
    expect(exact[0]).toBe('C major');
    expect(exact.sort()).toEqual(['A minor', 'B locrian', 'C major', 'D dorian', 'E phrygian', 'F lydian', 'G mixolydian']);
    const am = scalesContaining(['A', 'C', 'D', 'E', 'G'], { tonic: 'A' });
    expect(am[0]).toMatchObject({ tonic: 'A', scale: { id: 'minor-pentatonic' }, extra: 0 });
    expect(am.map((m) => m.scale.id)).toEqual(expect.arrayContaining(['minor', 'dorian', 'phrygian', 'minor-blues']));
    expect(am.every((m) => m.tonic === 'A')).toBe(true);
  });

  it('finds every scale from its own notes, on every tonic', () => {
    for (const scale of SCALES) {
      for (const tonic of ['C', 'F#', 'Bb', 'E']) {
        const notes = scaleNotes(tonic, scale);
        const found = scalesContaining(notes, { exact: true, tonic, chromatic: true });
        expect(found.map((m) => m.scale.id), `${tonic} ${scale.id}`).toEqual([scale.id]);
        expect(found[0].notes).toEqual(notes);
      }
    }
  });

  it('keeps given spellings, accepts MIDI numbers, and honours options', () => {
    const fs = scalesContaining(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'], { exact: true, tonic: 'F#' });
    expect(fs).toHaveLength(1);
    expect(fs[0].notes).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
    expect(scalesContaining([60, 62, 64, 65, 67, 69, 71], { exact: true, tonic: 'C' })[0].scale.id).toBe('major');
    expect(scalesContaining(['C', 'E', 'G'], { tonic: 'C', maxTier: 1 }).map((m) => m.scale.id)).toEqual(['major-pentatonic', 'major']);
    expect(scalesContaining(['C', 'E', 'G'], { tonic: 'C', family: 'blues' }).map((m) => m.scale.id)).toEqual(['major-blues', 'combined-blues']);
    expect(scalesContaining(['C', 'Db', 'D'], { tonic: 'C', chromatic: true }).map((m) => m.scale.id)).toContain('chromatic');
    expect(scalesContaining(['C', 'Db', 'D'], { tonic: 'C' }).map((m) => m.scale.id)).not.toContain('chromatic');
    expect(scalesContaining(['C', 'E', 'G'], { limit: 3 })).toHaveLength(3);
    for (const m of scalesContaining(['Eb', 'G', 'Bb', 'D'], { limit: 40 })) {
      for (const n of ['Eb', 'G', 'Bb', 'D']) expect(m.notes.map((x) => chroma(x))).toContain(chroma(n));
    }
  });
});

describe('scalesForChord', () => {
  const top = (symbol: string, n = 3) => scalesForChord(symbol).slice(0, n).map((m) => m.scale.id);

  it('ranks the textbook choice first', () => {
    expect(top('C7', 1)).toEqual(['mixolydian']);
    expect(top('Cmaj7', 2)).toEqual(['major', 'lydian']);
    expect(top('Cm7', 4)).toEqual(['minor-pentatonic', 'minor-blues', 'dorian', 'minor']);
    expect(top('C', 2)).toEqual(['major-pentatonic', 'major']);
    expect(top('Am', 3)).toEqual(['minor-pentatonic', 'minor', 'minor-blues']);
    expect(top('C7alt', 1)).toEqual(['altered']);
    expect(top('C7#11', 1)).toEqual(['lydian-dominant']);
    expect(top('Cm7b5', 2)).toEqual(expect.arrayContaining(['locrian', 'locrian-natural-2']));
    expect(top('Cdim7', 1)).toEqual(['diminished-whole-half']);
    expect(top('C13b9', 2)).toContain('diminished-half-whole');
    expect(top('C7b9', 3)).toContain('phrygian-dominant');
    expect(top('Cmaj7#11', 1)).toEqual(['lydian']);
    expect(top('CmMaj7', 2)).toEqual(expect.arrayContaining(['melodic-minor', 'harmonic-minor']));
    expect(top('C7#5', 3)).toContain('whole-tone');
    expect(top('C7#9', 2)).toEqual(['altered', 'diminished-half-whole']);
    expect(top('E7#9', 7)).toEqual(expect.arrayContaining(['minor-pentatonic', 'minor-blues']));
    expect(top('Cmaj7#5', 1)).toEqual(['lydian-augmented']);
    expect(top('C7sus4', 2)).toContain('mixolydian');
    expect(top('C6', 2)).toEqual(expect.arrayContaining(['major-pentatonic', 'major']));
  });

  it('builds every match on the chord root and contains the chord unless it is a colour choice', () => {
    for (const symbol of ['C7', 'F#m7', 'Bbmaj7', 'E7#9', 'Abm7b5', 'D13', 'Gsus4', 'B5', 'Eb6/9']) {
      const c = chord(symbol);
      const matches = scalesForChord(symbol);
      expect(matches.length, symbol).toBeGreaterThan(0);
      for (const m of matches) {
        expect(m.tonic).toBe(c.root);
        const scalePitchClasses = m.notes.map((n) => chroma(n));
        const absent = c.notes.filter((n) => !scalePitchClasses.includes(chroma(n)));
        expect(m.missing, `${symbol} / ${m.scale.id}`).toEqual(absent);
        if (m.fit === 'compatible') expect(absent, `${symbol} / ${m.scale.id}`).toEqual([]);
        if (m.fit === 'primary') expect(absent.every((n) => n === c.notes[2] && c.notes.length >= 4), `${symbol} / ${m.scale.id}`).toBe(true);
        if (m.fit === 'colour') expect(absent.length).toBeGreaterThan(0);
        for (const a of m.avoid) expect(c.notes.map((n) => chroma(n))).not.toContain(chroma(a));
      }
      for (let i = 1; i < matches.length; i++) expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
    }
  });

  it('reports avoid notes, tensions and blues colours', () => {
    const major = scalesForChord('Cmaj7').find((m) => m.scale.id === 'major')!;
    expect(major.avoid).toEqual(['F']);
    expect(major.tensions).toEqual(['9', '13']);
    expect(major.fit).toBe('primary');
    const lydian = scalesForChord('Cmaj7').find((m) => m.scale.id === 'lydian')!;
    expect(lydian.avoid).toEqual([]);
    expect(lydian.tensions).toEqual(['9', '#11', '13']);
    const mixo = scalesForChord('G7').find((m) => m.scale.id === 'mixolydian')!;
    expect(mixo.avoid).toEqual(['C']);
    const altered = scalesForChord('G7').find((m) => m.scale.id === 'phrygian-dominant')!;
    expect(altered.tensions).toEqual(expect.arrayContaining(['b9', 'b13']));
    const blues = scalesForChord('A7').find((m) => m.scale.id === 'minor-blues')!;
    expect(blues.fit).toBe('colour');
    expect(blues.missing).toEqual(['C#']);
    expect(scalesForChord('A7', { strict: true }).map((m) => m.scale.id)).not.toContain('minor-blues');
    expect(scalesForChord('A7', { maxTier: 2 }).every((m) => m.scale.tier <= 2)).toBe(true);
    expect(scalesForChord('A7', { limit: 2 })).toHaveLength(2);
    expect(scalesForChord('Dm7').find((m) => m.scale.id === 'dorian')!.tensions).toEqual(['9', '11', '13']);
  });
});

describe('compareScales', () => {
  it('describes how one scale differs from another', () => {
    const dorian = compareScales('minor', 'dorian');
    expect(dorian.changes).toEqual([{ number: 6, a: 'b6', b: '6' }]);
    expect(dorian.shared).toEqual(['1', '2', 'b3', '4', '5', 'b7']);
    expect(dorian.summary).toBe('Dorian is Natural minor with a raised 6th.');
    expect(compareScales('major', 'lydian').summary).toBe('Lydian is Major with a raised 4th.');
    expect(compareScales('major', 'mixolydian').summary).toBe('Mixolydian is Major with a lowered 7th.');
    expect(compareScales('minor', 'harmonic-minor').summary).toBe('Harmonic minor is Natural minor with a raised 7th.');
    expect(compareScales('major', 'minor').changes.map((c) => c.number)).toEqual([3, 6, 7]);
    expect(compareScales('major', 'minor').summary).toBe('Natural minor is Major with a lowered 3rd, a lowered 6th and a lowered 7th.');
    const penta = compareScales('major', 'major-pentatonic');
    expect(penta.onlyA).toEqual(['4', '7']);
    expect(penta.summary).toBe('Major pentatonic is Major with no 4, 7.');
    expect(compareScales('minor-pentatonic', 'minor-blues').summary).toBe('Minor blues is Minor pentatonic with an added b5.');
    expect(compareScales('major', 'major').summary).toBe('Major has the same notes as Major.');
  });
});

describe('harmonizeScale', () => {
  const symbols = (tonic: string, id: string, sevenths = false) => harmonizeScale(tonic, id, { sevenths }).map((c) => c.symbol).join(' ');
  const romans = (tonic: string, id: string, sevenths = false) => harmonizeScale(tonic, id, { sevenths }).map((c) => c.roman).join(' ');

  it('builds the diatonic triads and sevenths of the major scale', () => {
    expect(symbols('C', 'major')).toBe('C Dm Em F G Am Bdim');
    expect(romans('C', 'major')).toBe('I ii iii IV V vi vii°');
    expect(symbols('C', 'major', true)).toBe('Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5');
    expect(romans('C', 'major', true)).toBe('Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7');
    expect(symbols('F#', 'major')).toBe('F# G#m A#m B C# D#m E#dim');
    expect(symbols('Eb', 'major', true)).toBe('Ebmaj7 Fm7 Gm7 Abmaj7 Bb7 Cm7 Dm7b5');
  });

  it('harmonises the three minor scales', () => {
    expect(symbols('A', 'minor')).toBe('Am Bdim C Dm Em F G');
    expect(romans('A', 'minor')).toBe('i ii° bIII iv v bVI bVII');
    expect(symbols('A', 'minor', true)).toBe('Am7 Bm7b5 Cmaj7 Dm7 Em7 Fmaj7 G7');
    expect(symbols('A', 'harmonic-minor')).toBe('Am Bdim Caug Dm E F G#dim');
    expect(romans('A', 'harmonic-minor')).toBe('i ii° bIII+ iv V bVI vii°');
    expect(symbols('A', 'harmonic-minor', true)).toBe('AmMaj7 Bm7b5 Cmaj7#5 Dm7 E7 Fmaj7 G#dim7');
    expect(romans('A', 'harmonic-minor', true)).toBe('imaj7 iiø7 bIIImaj7#5 iv7 V7 bVImaj7 vii°7');
    expect(symbols('A', 'melodic-minor', true)).toBe('AmMaj7 Bm7 Cmaj7#5 D7 E7 F#m7b5 G#m7b5');
  });

  it('harmonises modes with accidentals against the major scale', () => {
    expect(romans('D', 'dorian')).toBe('i ii bIII IV v vi° bVII');
    expect(romans('E', 'phrygian')).toBe('i bII bIII iv v° bVI bvii');
    expect(romans('F', 'lydian')).toBe('I II iii #iv° V vi vii');
    expect(romans('G', 'mixolydian')).toBe('I ii iii° IV v vi bVII');
    expect(symbols('E', 'phrygian-dominant')).toBe('E F G#dim Am Bdim Caug Dm');
  });

  it('names the odd chords of exotic scales and keeps the scale spelling', () => {
    const dh = harmonizeScale('C', 'double-harmonic');
    expect(dh.map((c) => c.symbol)).toEqual(['C', 'Db', 'Em', 'Fm', 'G(b5)', 'Abaug', 'Bsus2b5']);
    expect(dh[6].notes).toEqual(['B', 'Db', 'F']);
    expect(dh[4].notes).toEqual(['G', 'B', 'Db']);
    for (const scale of SCALES) {
      if (scale.size !== 7) continue;
      for (const sevenths of [false, true]) {
        const chords = harmonizeScale('C', scale, { sevenths });
        expect(chords).toHaveLength(7);
        for (const c of chords) {
          const parsed = chord(c.symbol);
          expect(parsed.notes.map((n) => chroma(n)).sort(), `${scale.id} ${c.symbol}`).toEqual(c.notes.map((n) => chroma(n)).sort());
        }
      }
    }
  });

  it('refuses scales that are not seven-note', () => {
    expect(() => harmonizeScale('C', 'minor-pentatonic')).toThrow(RangeError);
    expect(() => harmonizeScale('C', 'whole-tone')).toThrow(RangeError);
  });
});
