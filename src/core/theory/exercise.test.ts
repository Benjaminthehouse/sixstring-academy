import { describe, expect, it } from 'vitest';
import { CHORD_TYPES } from './chord';
import {
  checkSpelling, checkSpellings, distractorIntervals, distractorNotes, intervalsFrom, similarChordTypes,
} from './exercise';
import { interval, SIMPLE_INTERVALS } from './interval';
import { note } from './note';
import { scaleNotes, similarScales, SCALES } from './scale';

const NOTES = [...'CDEFGAB'].flatMap((l) => [l, `${l}#`, `${l}b`]);

describe('intervalsFrom', () => {
  it('lists every interval from a note with the correctly spelled note it reaches', () => {
    expect(intervalsFrom('F#').map((i) => `${i.interval} ${i.note}`)).toEqual([
      'P1 F#', 'm2 G', 'M2 G#', 'm3 A', 'M3 A#', 'P4 B', 'A4 B#', 'd5 C', 'P5 C#', 'm6 D', 'M6 D#', 'm7 E', 'M7 E#', 'P8 F#',
    ]);
    expect(intervalsFrom('Gb').map((i) => i.note)).toEqual(['Gb', 'Abb', 'Ab', 'Bbb', 'Bb', 'Cb', 'C', 'Dbb', 'Db', 'Ebb', 'Eb', 'Fb', 'F', 'Gb']);
    expect(intervalsFrom('C')[4]).toEqual({ interval: 'M3', name: 'major third', note: 'E', semitones: 4, degree: '3' });
    expect(intervalsFrom('C').map((i) => i.degree)).toEqual(['1', 'b2', '2', 'b3', '3', '4', '#4', 'b5', '5', 'b6', '6', 'b7', '7', '8']);
  });

  it('goes down, keeps octaves, and takes any list of intervals', () => {
    const down = intervalsFrom('C4', { descending: true });
    expect(down.map((i) => `${i.interval} ${i.note}`).slice(0, 6)).toEqual(['P1 C4', '-m2 B3', '-M2 Bb3', '-m3 A3', '-M3 Ab3', '-P4 G3']);
    expect(down.every((i) => i.degree === null && i.semitones <= 0)).toBe(true);
    expect(down[13]).toMatchObject({ interval: '-P8', name: 'descending perfect octave', note: 'C3', semitones: -12 });
    expect(intervalsFrom('E2', { intervals: ['M9', 'P11', 'M13'] }).map((i) => `${i.note} ${i.degree}`)).toEqual(['F#3 9', 'A3 11', 'C#4 13']);
    expect(intervalsFrom('E2', { intervals: ['-P4'] })[0].note).toBe('B1');
    expect(intervalsFrom('C', { intervals: [] })).toEqual([]);
    expect(() => intervalsFrom('H')).toThrow(RangeError);
    expect(() => intervalsFrom('C', { intervals: ['X9'] })).toThrow(RangeError);
  });

  it('lands on the right letter and pitch from every note', () => {
    for (const start of NOTES) {
      const list = intervalsFrom(`${start}3`);
      expect(list).toHaveLength(SIMPLE_INTERVALS.length);
      for (const step of list) {
        const ivl = interval(step.interval);
        expect(note(step.note).midi! - note(`${start}3`).midi!, `${start} ${step.interval}`).toBe(ivl.semitones);
        expect((note(step.note).step - note(start).step + 7) % 7, `${start} ${step.interval}`).toBe(ivl.steps % 7);
      }
    }
  });
});

describe('checkSpelling', () => {
  it('tells a wrong name from a wrong note', () => {
    expect(checkSpelling('E#', 'E#')).toBe('correct');
    expect(checkSpelling('F', 'E#')).toBe('enharmonic');
    expect(checkSpelling('Gbb', 'E#')).toBe('enharmonic');
    expect(checkSpelling('E', 'E#')).toBe('wrong');
    expect(checkSpelling('H', 'E#')).toBe('invalid');
    expect(checkSpelling('', 'C')).toBe('invalid');
    expect(checkSpelling('e♯', 'E#')).toBe('correct');
    expect(checkSpelling('Fx', 'F##')).toBe('correct');
    // Octaves count only when both sides have one.
    expect(checkSpelling('F4', 'E#4')).toBe('enharmonic');
    expect(checkSpelling('F5', 'E#4')).toBe('wrong');
    expect(checkSpelling('E#', 'E#4')).toBe('correct');
    expect(checkSpelling('B#3', 'C4')).toBe('enharmonic');
    expect(() => checkSpelling('C', 'not a note')).toThrow(RangeError);
  });

  it('marks a written-out scale, position by position', () => {
    const expected = scaleNotes('F#', 'major');
    expect(checkSpellings(expected, expected)).toEqual({ verdicts: Array(7).fill('correct'), correct: true, pitchesCorrect: true, missing: [], extra: [] });
    const withF = checkSpellings(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'F'], expected);
    expect(withF.verdicts[6]).toBe('enharmonic');
    expect(withF).toMatchObject({ correct: false, pitchesCorrect: true, missing: [], extra: [] });
    const wrong = checkSpellings(['F#', 'G#', 'A', 'B', 'C#', 'D#', 'E#'], expected);
    expect(wrong).toMatchObject({ correct: false, pitchesCorrect: false, missing: ['A#'], extra: ['A'] });
    expect(checkSpellings(['C', 'E'], ['C', 'E', 'G'])).toMatchObject({ correct: false, pitchesCorrect: false, missing: ['G'], extra: [] });
    expect(checkSpellings(['C', 'E', 'G', 'B'], ['C', 'E', 'G'])).toMatchObject({ correct: false, extra: ['B'], verdicts: ['correct', 'correct', 'correct', 'wrong'] });
    expect(checkSpellings(['E', 'C', 'G'], ['C', 'E', 'G']).correct).toBe(false);
    expect(checkSpellings([], [])).toMatchObject({ correct: true, pitchesCorrect: true });
  });

  it('marks chord tones in any order', () => {
    expect(checkSpellings(['E', 'C', 'G'], ['C', 'E', 'G'], { ordered: false })).toMatchObject({ correct: true, verdicts: ['correct', 'correct', 'correct'] });
    const fb = checkSpellings(['C', 'Fb', 'G'], ['C', 'E', 'G'], { ordered: false });
    expect(fb).toMatchObject({ correct: false, pitchesCorrect: true, verdicts: ['correct', 'enharmonic', 'correct'] });
    expect(checkSpellings(['C', 'E', 'E'], ['C', 'E', 'G'], { ordered: false })).toMatchObject({ correct: false, missing: ['G'], extra: ['E'] });
    expect(checkSpellings(['C', '??', 'G'], ['C', 'E', 'G'], { ordered: false }).verdicts).toEqual(['correct', 'invalid', 'correct']);
    // An exact name is matched before an enharmonic one, whatever the order.
    expect(checkSpellings(['Gb', 'F#'], ['F#', 'Gb'], { ordered: false }).correct).toBe(true);
  });
});

describe('distractors', () => {
  it('offers tempting wrong notes, nearest first, never the right pitch', () => {
    expect(distractorNotes('F#')).toEqual(['F', 'G', 'G#']);
    expect(distractorNotes('E#')).toEqual(['E', 'Eb', 'F#']);
    expect(distractorNotes('Bb', { count: 4 })).toEqual(['B', 'A', 'C', 'Ab']);
    expect(distractorNotes('C4')).toEqual(['C#4', 'B3', 'D4']);
    expect(distractorNotes('B3', { count: 2 })).toEqual(['Bb3', 'C4']);
    for (const answer of NOTES) {
      const list = distractorNotes(answer, { count: 11 });
      expect(list).toHaveLength(11);
      expect(new Set(list.map((n) => note(n).chroma)).size).toBe(11);
      expect(list.some((n) => note(n).chroma === note(answer).chroma), answer).toBe(false);
      for (const n of list) expect(Math.abs(note(n).alt)).toBeLessThan(2);
      expect(distractorNotes(answer)).toEqual(list.slice(0, 3));
    }
    expect(distractorNotes('C', { count: 50 })).toHaveLength(11);
  });

  it('offers the enharmonic twin only when the question is about spelling', () => {
    expect(distractorNotes('E#', { enharmonic: true })[0]).toBe('F');
    expect(distractorNotes('F##', { enharmonic: true })[0]).toBe('G');
    expect(distractorNotes('Cb', { enharmonic: true })[0]).toBe('B');
    expect(distractorNotes('E#4', { enharmonic: true })[0]).toBe('F4');
    for (const answer of NOTES) {
      for (const n of distractorNotes(answer, { count: 6, enharmonic: true })) expect(n).not.toBe(answer);
    }
  });

  it('respects a pool and an exclusion list', () => {
    expect(distractorNotes('F#', { pool: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] })).toEqual(['F', 'G', 'E']);
    expect(distractorNotes('E', { pool: scaleNotes('A', 'major') })).toEqual(['D', 'F#', 'C#']);
    expect(distractorNotes('F#', { exclude: ['F', 'G'] })).toEqual(['G#', 'E', 'C#']);
    expect(distractorNotes('F#', { exclude: ['Gb', 'F'], count: 2 })).toEqual(['G', 'G#']);
    expect(distractorNotes('C', { pool: ['C', 'B#'] })).toEqual([]);
    expect(distractorNotes('C', { pool: ['C', 'B#'], enharmonic: true })).toEqual(['B#']);
    expect(distractorNotes('C', { count: 0 })).toEqual([]);
  });

  it('offers neighbouring intervals and the inversion', () => {
    expect(distractorIntervals('M3')).toEqual(['m3', 'P4', 'm6']);
    expect(distractorIntervals('P5')).toEqual(['A4', 'm6', 'P4']);
    expect(distractorIntervals('d5')).toEqual(['P4', 'P5', 'M3']);
    expect(distractorIntervals('A4', { enharmonic: true })[0]).toBe('d5');
    expect(distractorIntervals('-m3')).toEqual(['-M2', '-M3', '-M6']);
    expect(distractorIntervals('M9')).toEqual(['m9', 'm10', 'P8']);
    expect(distractorIntervals('M3', { exclude: ['m3'], count: 2 })).toEqual(['P4', 'm6']);
    for (const answer of SIMPLE_INTERVALS) {
      const list = distractorIntervals(answer, { count: 4 });
      expect(list.length, answer).toBeGreaterThanOrEqual(3);
      expect(new Set(list.map((i) => interval(i).semitones)).size, answer).toBe(list.length);
      expect(list.some((i) => interval(i).semitones === interval(answer).semitones), answer).toBe(false);
    }
  });

  it('finds the chord types and scales one note away', () => {
    expect(similarChordTypes('major', { sameSize: true }).map((t) => t.id)).toEqual(['minor', 'sus2', 'sus4', 'aug', 'majb5', 'dim']);
    expect(similarChordTypes('maj7', { sameSize: true, limit: 3 }).map((t) => t.id)).toEqual(['6', 'add9', '7']);
    expect(similarChordTypes('m7b5', { sameSize: true, limit: 3 }).map((t) => t.id)).toEqual(['dim7', '7b5', 'm7']);
    expect(similarChordTypes('7', { maxTier: 1 }).map((t) => t.id)).toEqual(['major', '5', 'minor', 'sus2', 'sus4']);
    expect(() => similarChordTypes('nope')).toThrow(RangeError);
    expect(similarScales('major', { sameSize: true, limit: 4 }).map((s) => s.id)).toEqual(['lydian', 'mixolydian', 'melodic-minor', 'harmonic-major']);
    expect(similarScales('minor-pentatonic', { limit: 3 }).map((s) => s.id)).toEqual(['minor-blues', 'minor-hexatonic', 'minor']);
    const count = (n: number) => n.toString(2).replace(/0/g, '').length;
    const mask = (semis: number[]) => semis.reduce((m, s) => m | (1 << (s % 12)), 0);
    for (const type of CHORD_TYPES) {
      const near = similarChordTypes(type);
      expect(near.map((t) => t.id)).not.toContain(type.id);
      for (const other of near) expect(count(mask(other.semitones) ^ mask(type.semitones))).toBeGreaterThan(0);
      for (let i = 1; i < near.length; i++) expect(count(mask(near[i].semitones) ^ mask(type.semitones))).toBeGreaterThanOrEqual(count(mask(near[i - 1].semitones) ^ mask(type.semitones)));
    }
    for (const scale of SCALES) {
      const near = similarScales(scale, { limit: 4 });
      expect(near.map((s) => s.id)).not.toContain(scale.id);
      for (const other of near) expect(other.mask).not.toBe(scale.mask);
    }
  });
});
