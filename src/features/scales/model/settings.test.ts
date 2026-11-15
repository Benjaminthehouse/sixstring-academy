import { describe, expect, it } from 'vitest';
import { getScale } from '@/core/theory';
import { displayScaleName, scaleTitle } from './catalog';
import { DEFAULT_SETTINGS, labelInForce, sanitizeSettings } from './settings';

describe('screen settings', () => {
  it('starts from sensible defaults when nothing is stored', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and repairs broken ones', () => {
    const s = sanitizeSettings({ view: 'connect', label: 'finger', bpm: 999, capo: -3, perBeat: 5, style: 'polka', custom: [9, 7], loop: 'yes', sequence: 'groups-4' });
    expect(s.view).toBe('connect');
    expect(s.label).toBe('finger');
    expect(s.bpm).toBe(240);
    expect(s.capo).toBe(0);
    expect(s.perBeat).toBe(2);
    expect(s.style).toBe('pop-rock');
    expect(s.loop).toBe(true);
    expect(s.sequence).toBe('groups-4');
    expect(s.custom[1] - s.custom[0]).toBeGreaterThanOrEqual(3);
    expect(sanitizeSettings({ custom: [23, 24] }).custom).toEqual([20, 24]);
  });

  it('follows the learner’s label setting until the screen picks its own', () => {
    expect(labelInForce(DEFAULT_SETTINGS, 'notes')).toBe('note');
    expect(labelInForce(DEFAULT_SETTINGS, 'degrees')).toBe('degree');
    expect(labelInForce({ ...DEFAULT_SETTINGS, label: 'finger' }, 'notes')).toBe('finger');
  });
});

describe('scale titles', () => {
  it('writes ordinary words in lower case and names in capitals', () => {
    expect(scaleTitle('A', getScale('minor-pentatonic')!)).toBe('A minor pentatonic');
    expect(scaleTitle('C', getScale('major')!)).toBe('C major');
    expect(scaleTitle('A', getScale('minor')!)).toBe('A natural minor');
    expect(scaleTitle('F#', getScale('dorian')!)).toBe('F♯ Dorian');
    expect(scaleTitle('Bb', getScale('lydian-sharp-2')!)).toBe('B♭ Lydian ♯2');
    expect(scaleTitle('E', getScale('phrygian-dominant')!)).toBe('E Phrygian dominant');
    expect(displayScaleName(getScale('whole-tone')!)).toBe('whole tone');
    expect(scaleTitle('C', getScale('major')!, 'solfege')).toBe('Do major');
  });
});
