import { describe, expect, it } from 'vitest';
import { applyDrillAddress, changesSettings, drillParams, parseDrillParams } from './address';
import { drillById, drillPlan } from './drills';
import { candidatesFor } from './questions';
import { scopePcs, scopePositions } from './neck';
import { defaultSettings } from './settings';
import type { NeckContext } from './types';

const CTX: NeckContext = { tuning: [40, 45, 50, 55, 59, 64], spelling: 'sharps' };
const SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('fretboard drill address', () => {
  it('reads strings, frets, the note set and one note', () => {
    expect(parseDrillParams([])).toEqual({});
    expect(parseDrillParams(['strings-6-5'])).toEqual({ strings: [5, 6] });
    expect(parseDrillParams(['string-6'])).toEqual({ strings: [6] });
    expect(parseDrillParams(['frets-4-8'])).toEqual({ frets: [4, 8] });
    expect(parseDrillParams(['frets-8-4'])).toEqual({ frets: [4, 8] });
    expect(parseDrillParams(['fret-5'])).toEqual({ frets: [5, 5] });
    expect(parseDrillParams(['naturals'])).toEqual({ notes: 'naturals' });
    expect(parseDrillParams(['all-notes'])).toEqual({ notes: 'all' });
    expect(parseDrillParams(['note-c'])).toEqual({ note: { pc: 0, name: 'C' } });
    expect(parseDrillParams(['note-f-sharp'])).toEqual({ note: { pc: 6, name: 'F#' } });
    expect(parseDrillParams(['note-bb'])).toEqual({ note: { pc: 10, name: 'Bb' } });
    expect(parseDrillParams(['strings-6-5', 'all-notes', 'frets-0-12'])).toEqual({ strings: [5, 6], notes: 'all', frets: [0, 12] });
  });

  it('ignores what it does not know', () => {
    expect(parseDrillParams(['strings-9', 'frets-30-40', 'note-h', 'banana'])).toEqual({});
  });

  it('writes params that read back the same', () => {
    const a = { strings: [6, 5], frets: [0, 3] as [number, number], notes: 'naturals' as const, note: { pc: 6, name: 'F#' } };
    const params = drillParams('find-the-note', a);
    expect(params).toEqual(['drill', 'find-the-note', 'strings-5-6', 'frets-0-3', 'naturals', 'note-f-sharp']);
    for (const p of params) expect(p).toMatch(SAFE);
    expect(parseDrillParams(params.slice(2))).toEqual({ ...a, strings: [5, 6] });
  });

  it('stores strings, frets and the note set the way "Change" would', () => {
    const s = defaultSettings(6);
    // Mia: "keep only string 6, frets 0 to 3, natural notes".
    const mia = applyDrillAddress(s, parseDrillParams(['string-6', 'frets-0-3', 'naturals']), 6, 15);
    expect(mia).toMatchObject({ strings: [6], frets: [0, 3], notes: 'naturals' });
    // Kept inside the learner's neck.
    expect(applyDrillAddress(s, { frets: [12, 24] }, 6, 15).frets).toEqual([12, 15]);
    expect(changesSettings({ note: { pc: 0, name: 'C' } })).toBe(false);
    expect(changesSettings({ strings: [6] })).toBe(true);
  });

  it('asks about one note only, natural or not, in the drills that find it', () => {
    const s = { ...defaultSettings(6), strings: [5, 6] };
    const find = drillPlan(drillById('find-the-note')!, s, { pc: 0 });
    expect(scopePcs(find.scope, CTX)).toEqual([0]);
    const places = candidatesFor('find', find.scope, CTX);
    // C on strings 6 and 5 between frets 0 and 12: fret 8 and fret 3.
    expect(places.sort()).toEqual(['5:3', '6:8']);
    expect(scopePositions(find.scope, CTX).every((p) => (CTX.tuning[6 - p.string] + p.fret) % 12 === 0)).toBe(true);

    // F sharp is not a natural note, but asked by name it is the note of the round.
    const sharp = drillPlan(drillById('find-every-note')!, defaultSettings(6), { pc: 6 });
    expect(candidatesFor('every', sharp.scope, CTX)).toEqual(['pc:6']);
    expect(sharp.length).toBe(1);

    // The name drills ignore it.
    const name = drillPlan(drillById('name-the-note')!, defaultSettings(6), { pc: 0 });
    expect(name.scope.pcs).toBeUndefined();
    expect(drillPlan(drillById('find-every-note')!, defaultSettings(6)).length).toBe(5);
  });
});
