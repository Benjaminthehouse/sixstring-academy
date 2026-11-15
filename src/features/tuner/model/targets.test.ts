import { describe, expect, it } from 'vitest';
import { TUNINGS, STANDARD_TUNING, getTuning, stringTargets } from '@/core/guitar';
import { midiToFreq } from '@/core/math/pitch-math';
import { buildTargets, clampA4, clampCapo, noteParts, ordinal, stringWords, targetsLabel, trackerRange } from './targets';

describe('buildTargets', () => {
  it('agrees with the guitar engine for every catalog tuning', () => {
    for (const tuning of TUNINGS) {
      const mine = buildTargets(tuning, { a4: 442 });
      const theirs = stringTargets(tuning, { a4: 442 });
      expect(mine.map((t) => [t.index, t.string, t.midi, t.note]), tuning.id).toEqual(theirs.map((t) => [t.index, t.string, t.midi, t.note]));
      mine.forEach((t, i) => expect(t.freq).toBeCloseTo(theirs[i].frequency, 9));
    }
  });

  it('numbers strings the player way: the first target is the highest-numbered string', () => {
    const t = buildTargets(STANDARD_TUNING);
    expect(t.map((x) => x.string)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(t.map((x) => x.note)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(t[0].freq).toBeCloseTo(82.407, 2);
    expect(t[5].freq).toBeCloseTo(329.628, 2);
  });

  it('a capo raises every target by its fret and respells the notes', () => {
    const t = buildTargets(STANDARD_TUNING, { capo: 2 });
    expect(t.map((x) => x.note)).toEqual(['F#2', 'B2', 'E3', 'A3', 'C#4', 'F#4']);
    expect(t.map((x) => x.midi)).toEqual([42, 47, 52, 57, 61, 66]);
    expect(t.map((x) => x.openMidi)).toEqual([40, 45, 50, 55, 59, 64]);
    expect(t[0].freq).toBeCloseTo(midiToFreq(42), 9);
    // A tuning written with flats keeps flats when shifted.
    expect(buildTargets(getTuning('half-step-down')!, { capo: 3 }).map((x) => x.note)).toEqual(['Gb2', 'B2', 'E3', 'A3', 'Db4', 'Gb4']);
  });

  it('the reference pitch scales the frequencies, not the notes', () => {
    const at432 = buildTargets(STANDARD_TUNING, { a4: 432 });
    expect(at432[1].note).toBe('A2');
    expect(at432[1].freq).toBeCloseTo(108, 6);
  });

  it('draws low strings heavier and wound', () => {
    const t = buildTargets(STANDARD_TUNING);
    expect(t[0].gauge).toBe(1);
    expect(t[5].gauge).toBe(0);
    expect(t.map((x) => x.wound)).toEqual([true, true, true, false, false, false]);
    for (let i = 1; i < t.length; i++) expect(t[i].gauge).toBeLessThan(t[i - 1].gauge);
  });
});

describe('clamps', () => {
  it('keeps the capo inside 0..12 whole frets', () => {
    expect([clampCapo(-3), clampCapo(2.6), clampCapo(40), clampCapo(Number.NaN), clampCapo(undefined)]).toEqual([0, 3, 12, 0, 0]);
  });
  it('keeps the reference pitch inside 415..466 Hz', () => {
    expect([clampA4(300), clampA4(441.24), clampA4(900), clampA4(Number.NaN), clampA4(undefined)]).toEqual([415, 441.2, 466, 440, 440]);
  });
});

describe('noteParts', () => {
  it('splits a name for the big readout', () => {
    expect(noteParts('E2')).toEqual({ letter: 'E', accidental: '', octave: '2', text: 'E2', short: 'E' });
    expect(noteParts('F#3')).toMatchObject({ letter: 'F', accidental: '♯', octave: '3', text: 'F♯3', short: 'F♯' });
    expect(noteParts('Eb4')).toMatchObject({ letter: 'E', accidental: '♭', short: 'E♭' });
  });
  it('follows the note-naming setting', () => {
    expect(noteParts('E2', 'solfege')).toMatchObject({ letter: 'Mi', accidental: '', short: 'Mi' });
    expect(noteParts('Bb3', 'solfege')).toMatchObject({ letter: 'Si', accidental: '♭' });
    // German: B flat is "B", B natural is "H".
    expect(noteParts('Bb3', 'german')).toMatchObject({ letter: 'B', accidental: '', short: 'B' });
    expect(noteParts('B3', 'german')).toMatchObject({ letter: 'H', accidental: '' });
  });
  it('labels a whole tuning', () => {
    expect(targetsLabel(buildTargets(getTuning('half-step-down')!))).toBe('E♭ A♭ D♭ G♭ B♭ E♭');
  });
});

describe('stringWords', () => {
  it('names the outer strings by thickness and the inner ones by number', () => {
    expect(stringWords(0, 6)).toMatchObject({ name: 'thickest string', pluck: 'Pluck the thickest string' });
    expect(stringWords(5, 6)).toMatchObject({ name: 'thinnest string', pluck: 'Pluck the thinnest string' });
    expect(stringWords(1, 6).name).toBe('5th string');
    expect(stringWords(2, 6).name).toBe('4th string');
    expect(stringWords(3, 6).name).toBe('3rd string');
    expect(stringWords(4, 6).name).toBe('2nd string');
    expect(stringWords(0, 6).where).toContain('string 6');
    expect(stringWords(1, 6).where).toContain('next to the thickest');
  });
  it('never calls a ukulele string "thickest": its top string is the high G', () => {
    const uke = getTuning('ukulele')!;
    expect(uke.reentrant).toBe(true);
    expect(stringWords(0, 4, true)).toMatchObject({ name: '4th string', where: 'the one nearest your chin' });
    expect(stringWords(3, 4, true).name).toBe('1st string');
  });
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

describe('trackerRange', () => {
  it('keeps the default range for standard tuning', () => {
    expect(trackerRange(buildTargets(STANDARD_TUNING))).toEqual({ minFreq: 60, maxFreq: 1760 });
  });
  it('listens a fourth below the lowest string, so a slack string is still heard', () => {
    const dropC = trackerRange(buildTargets(getTuning('drop-c')!));
    expect(dropC.minFreq).toBeCloseTo(49, 0);
    const bass = trackerRange(buildTargets(getTuning('bass')!));
    expect(bass.minFreq).toBeGreaterThanOrEqual(30);
    expect(bass.minFreq).toBeLessThan(31.5);
    expect(trackerRange(buildTargets(getTuning('bass-5')!)).minFreq).toBeCloseTo(23.1, 1);
  });
  it('covers every catalog tuning: each open string, and a minor third below it, is inside the range', () => {
    for (const tuning of TUNINGS) {
      const targets = buildTargets(tuning);
      const { minFreq, maxFreq } = trackerRange(targets);
      for (const t of targets) {
        expect(t.freq * Math.pow(2, -3 / 12), `${tuning.id} ${t.note}`).toBeGreaterThan(minFreq);
        expect(t.freq * 2).toBeLessThan(maxFreq);
      }
    }
  });
});
