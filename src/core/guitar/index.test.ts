/**
 * The examples and numbers quoted in `API.md`, checked against the engine, plus the barrel itself.
 */
import { describe, expect, it } from 'vitest';
import * as guitar from './index';
import {
  TUNINGS, arpeggioPatterns, chordDifficulty, chordVoicings, difficultyLevel, identifyFretted, nearestString, neckPoint, noteAt, planFingering,
  practiceSequence, scalePatterns, stringTargets, suggestCapo, voicingLibrary, voicingTransition,
} from './index';

describe('API.md examples', () => {
  it('chord voicings', () => {
    const c = chordVoicings('C')[0];
    expect(c).toMatchObject({ frets: [null, 3, 2, 0, 1, 0], fingers: [null, 3, 2, 0, 1, 0], label: 'Open', difficulty: 3.4, id: 'c-major-x32010' });
    expect(c.notes.slice(0, 2).map((n) => `${n.note} ${n.role}`)).toEqual(['C root', 'E third']);
    expect(chordVoicings('G', { capo: 3 })[0].frets).toEqual([0, 2, 2, 1, 0, 0]);
    const melody = chordVoicings('Cmaj7', { strings: [4, 3, 2, 1], allowOpen: false, top: 'B' });
    expect(melody.length).toBeGreaterThan(0);
    expect(melody.every((v) => v.movable && v.notes[v.notes.length - 1].note === 'B')).toBe(true);
    expect(chordVoicings('Am7', { tuning: 'ukulele' })[0].frets).toEqual([0, 0, 0, 0]);
    expect(chordVoicings('F#m7b5').length).toBe(12);
  });

  it('difficulty figures', () => {
    expect(chordDifficulty('Em')).toBe(2.2);
    expect(chordDifficulty('C')).toBe(3.4);
    expect(chordDifficulty('F')).toBe(4.4);
    expect(chordDifficulty('Bb')).toBe(6.9);
    expect(chordVoicings('F')[1].difficulty).toBe(6.9);
    expect([2.2, 3.4, 4.4, 6.9].map(difficultyLevel)).toEqual(['easy', 'easy', 'medium', 'hard']);
  });

  it('scale patterns and sequences', () => {
    const box1 = scalePatterns('A', 'minor-pentatonic')[0];
    expect([box1.minFret, box1.maxFret, box1.shape]).toEqual([5, 8, 'E']);
    expect(box1.notes.slice(0, 6).map((n) => n.finger)).toEqual([1, 4, 1, 3, 1, 3]);
    expect(box1.notes.slice(0, 2).map((n) => `${n.string}:${n.fret} ${n.note} ${n.degree} f${n.finger}`)).toEqual(['6:5 A 1 f1', '6:8 C b3 f4']);
    expect(practiceSequence(box1, 'groups-3').slice(0, 6).map((n) => box1.notes.indexOf(n))).toEqual([0, 1, 2, 1, 2, 3]);
    expect(scalePatterns('C', 'major').map((p) => `${p.name} ${p.positionName}`)).toEqual([
      'C shape Open position', 'A shape 2nd position', 'G shape 5th position', 'E shape 7th position', 'D shape 10th position',
    ]);
    expect(scalePatterns('G', 'major', { system: '3nps' })[0].notes).toHaveLength(18);
    expect(scalePatterns('A', 'minor-pentatonic', { allOctaves: true }).some((p) => p.id === 'box-1-8va')).toBe(true);
    expect(arpeggioPatterns('Cmaj7')).toHaveLength(5);
  });

  it('identification, capo, tuner, spelling, geometry, hand', () => {
    expect(identifyFretted('x32010').symbol).toBe('C');
    const g = identifyFretted([{ string: 6, fret: 3 }, { string: 5, fret: 2 }, { string: 4, fret: 0 }, { string: 1, fret: 3 }], { key: 'G major' });
    expect(g.symbol).toBe('G');
    const capo = suggestCapo(['Bb', 'Eb', 'F', 'Gm'])[0];
    expect([capo.capo, capo.shapes.map((s) => s.shape)]).toEqual([3, ['G', 'C', 'D', 'Em']]);
    expect(stringTargets('drop-d', { a4: 442 })[0]).toMatchObject({ string: 6, note: 'D2' });
    const heard = nearestString(108)!;
    expect([heard.string, Math.round(heard.cents)]).toEqual([5, -32]);
    expect(noteAt({ string: 1, fret: 1 }, { context: { tonic: 'F#', scale: 'major' } })).toBe('E#4');
    const point = neckPoint({ string: 3, fret: 7 });
    expect(point.x).toBeGreaterThan(190);
    expect(point.x).toBeLessThan(220);
    expect(planFingering([48, 50, 52, 53, 55, 57, 59, 60]).notes.map((n) => n.finger)).toEqual([3, 0, 2, 3, 0, 2, 0, 1]);
    expect(voicingTransition(chordVoicings('C')[0], chordVoicings('Am')[0]).tips[0]).toMatch(/^Keep your middle finger down on string 4, fret 2/);
  });

  it('catalog sizes quoted in the digest', () => {
    const ids = TUNINGS.map((t) => t.id);
    for (const id of ['standard', 'half-step-down', 'whole-step-down', 'drop-d', 'double-drop-d', 'drop-c-sharp', 'drop-c', 'dadgad', 'open-g', 'open-d',
      'open-e', 'open-a', 'open-c', 'open-dm', 'open-em', 'all-fourths', 'nashville', 'standard-7', 'drop-a-7', 'baritone', 'bass', 'bass-5',
      'bass-drop-d', 'ukulele', 'ukulele-low-g', 'ukulele-baritone']) expect(ids).toContain(id);
    expect(ids).toHaveLength(26);
    const library = voicingLibrary();
    expect(library.length).toBeGreaterThan(3000);
    expect(library.length).toBeLessThan(3500);
    expect(guitar.OPEN_SHAPES.length).toBeGreaterThanOrEqual(65);
  });
});

describe('the barrel', () => {
  it('exports every function the digest names', () => {
    const names = [
      'TUNINGS', 'STANDARD_TUNING', 'getTuning', 'tuning', 'tuningsFor', 'customTuning', 'tuningFromMidi', 'identifyTuning', 'tuningFrequencies',
      'stringTargets', 'nearestString', 'retuneSteps', 'tuningIntervals', 'hasStandardIntervals',
      'stringIndex', 'stringNumber', 'DEFAULT_FRETS', 'midiAt', 'pitchClassAt', 'frequencyAt', 'openStringMidi', 'physicalFret', 'isValidPosition',
      'noteAt', 'spellMidi', 'positionsForMidi', 'positionsForPitchClass', 'positionsForNote', 'fretboardNotes', 'neckRange', 'positionKey', 'samePosition',
      'fretDistance', 'fretAtDistance', 'fretSpaceAt', 'fretMidpoint', 'fingertipDistance', 'fretWidth', 'INLAY_FRETS', 'DOUBLE_INLAY_FRETS', 'inlayFrets',
      'NECK_PRESETS', 'neckGeometry', 'neckPoint', 'stringOffset', 'fretboardHalfWidth', 'fretWireSegment', 'fretboardLayout',
      'scalePositions', 'scalePatterns', 'patternSystemsFor', 'allScalePatterns', 'scalePattern', 'positionPatternAt', 'patternContaining',
      'cagedShapeOfRoots', 'tonePositions', 'tonePatterns', 'checkFingering', 'fingerLine', 'PATTERN_SYSTEMS', 'CAGED_ORDER',
      'practiceSequence', 'SEQUENCES', 'sequencesFor', 'sequenceMidi',
      'buildVoicing', 'tryBuildVoicing', 'voicingProblem', 'parseFrets', 'formatFrets', 'voicingPositions', 'moveVoicing', 'assignFingers', 'findBarres',
      'checkVoicingFingering', 'voicingDifficulty', 'difficultyLevel',
      'chordVoicings', 'bestVoicing', 'easiestVoicing', 'chordDifficulty', 'generateVoicings', 'libraryVoicings', 'openChordVoicings', 'voicingLibrary',
      'libraryChordTypes', 'OPEN_SHAPES', 'MOVABLE_SHAPES', 'VOICING_CATEGORIES', 'VOICING_CATEGORY_INFO', 'LIBRARY_ROOTS',
      'identifyFretted', 'voicingFromFrets', 'toFrets', 'arpeggioPositions', 'arpeggioPatterns',
      'suggestCapo', 'bestCapo', 'capoShapes', 'progressionDifficulty', 'transpositionDifficulty', 'rankTranspositions',
      'planFingering', 'handMove', 'RESTING_HAND', 'DEFAULT_HAND_WEIGHTS', 'positionChangeCost', 'simultaneousCost', 'voicingTransition',
      'changeDifficulty', 'closestVoicing',
    ];
    const exported = guitar as Record<string, unknown>;
    for (const name of names) expect(exported[name], name).toBeDefined();
  });
});
