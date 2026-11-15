import { describe, expect, it } from 'vitest';
import { degreeColor, degreeText, fingerColor, fingerText, intervalLongName, intervalText, isMusicColor, labelFontSize, noteText } from './format';
import { inlayFromCosmetic, woodFromCosmetic } from './settings';

describe('note and degree text', () => {
  it('names notes in every naming system', () => {
    expect(noteText('F#4')).toBe('F♯');
    expect(noteText('F#4', 'letters', { octave: true })).toBe('F♯4');
    expect(noteText('F#', 'solfege')).toBe('Fa♯');
    expect(noteText('B', 'german')).toBe('H');
    expect(noteText('Bb', 'german')).toBe('B');
    expect(noteText('E#', 'letters', { ascii: true })).toBe('E#');
    expect(noteText('not a note')).toBe('not a note');
  });

  it('writes degrees with the root as R or 1', () => {
    expect(degreeText('1')).toBe('R');
    expect(degreeText('1', { root: '1' })).toBe('1');
    expect(degreeText('b3')).toBe('♭3');
    expect(degreeText('#11')).toBe('♯11');
  });

  it('writes intervals', () => {
    expect(intervalText('m3')).toBe('m3');
    expect(intervalText('-P5')).toBe('↓P5');
    expect(intervalLongName('m3')).toBe('minor third');
    expect(intervalLongName('xx')).toBe('xx');
  });
});

describe('colours', () => {
  it('maps degrees to the seven degree colours', () => {
    expect(degreeColor('1')).toBe('deg-1');
    expect(degreeColor('b3')).toBe('deg-3');
    expect(degreeColor('#4')).toBe('deg-4');
    expect(degreeColor('9')).toBe('deg-2');
    expect(degreeColor('b13')).toBe('deg-6');
    expect(degreeColor('5', true)).toBe('deg-x');
    expect(degreeColor('?')).toBe('deg-x');
  });

  it('maps fingers to the finger colours', () => {
    expect([1, 2, 3, 4].map(fingerColor)).toEqual(['finger-1', 'finger-2', 'finger-3', 'finger-4']);
    expect(fingerColor('T')).toBe('finger-t');
    expect(fingerColor(0)).toBe('neutral');
    expect(fingerColor(null)).toBe('neutral');
    expect(fingerText(3)).toBe('3');
    expect(fingerText(0)).toBe('');
    expect(isMusicColor('deg-5')).toBe(true);
    expect(isMusicColor('red')).toBe(false);
  });
});

describe('labelFontSize', () => {
  it('fits longer labels in smaller type', () => {
    const r = 11;
    expect(labelFontSize('C', r)).toBeGreaterThan(labelFontSize('C♯', r) - 0.5);
    expect(labelFontSize('Sol♯', r)).toBeLessThan(labelFontSize('C', r));
    expect(labelFontSize('Sol♯', r) * 3.5 * 0.62).toBeLessThanOrEqual(r * 2 + 1e-9);
  });
});

describe('cosmetic ids', () => {
  it('turns shop ids into wood and inlay styles', () => {
    expect(woodFromCosmetic('wood-maple')).toBe('maple');
    expect(woodFromCosmetic('wood-unknown')).toBe('rosewood');
    expect(woodFromCosmetic(undefined)).toBe('rosewood');
    expect(inlayFromCosmetic('inlay-sharkfin')).toBe('sharkfin');
    expect(inlayFromCosmetic('')).toBe('dots');
  });
});
