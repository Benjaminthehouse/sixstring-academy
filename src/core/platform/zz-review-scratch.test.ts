import { describe, expect, it } from 'vitest';
import { mergeEntry, planDataImport, planDataSync } from './storage-merge';
import { sanitizeDataSet, type DataSet } from './storage-scope';

describe('review scratch', () => {
  it('H1 progressions.draft merge', () => {
    const local = { at: 10, value: { key: 'C', slots: [{ token: 'I', length: 4 }, { token: 'V', length: 4 }, { token: 'I', length: 4 }, { token: 'V', length: 4 }] } };
    const file = { at: 5, value: { key: 'G', slots: [{ token: 'vi', length: 4 }, { token: 'IV', length: 4 }] } };
    const out = mergeEntry('progressions.draft', local, file);
    console.log('H1', JSON.stringify(out.value));
  });
  it('H2 practice.draft merge', () => {
    const local = { at: 10, value: { day: '2026-11-16', minutes: 20, blocks: [{ id: 'a1', area: 'chords', minutes: 10, title: 'A' }, { id: 'a2', area: 'scales', minutes: 10, title: 'B' }] } };
    const file = { at: 5, value: { day: '2026-11-10', minutes: 15, blocks: [{ id: 'b1', area: 'ear', minutes: 15, title: 'C' }] } };
    console.log('H2', JSON.stringify(mergeEntry('practice.draft', local, file).value));
  });
  it('H3 corrupt incoming list with newer stamp', () => {
    const local = { at: 10, value: { journal: [{ id: 'l1', endedAt: 1 }, { id: 'l2', endedAt: 2 }], routines: [], goals: [] } };
    const fileA = { at: 20, value: { journal: 'oops', routines: [], goals: [] } };
    const fileB = { at: 20, value: { journal: [{ id: 'f1', endedAt: 3 }, 42], routines: [], goals: [] } };
    const fileC = { at: 20, value: 'garbage' };
    console.log('H3a', JSON.stringify(mergeEntry('practice.data', local, fileA).value));
    console.log('H3b', JSON.stringify(mergeEntry('practice.data', local, fileB).value));
    console.log('H3c', JSON.stringify(mergeEntry('practice.data', local, fileC).value));
    const savedLocal = { at: 10, value: [{ id: 'p1', name: 'mine' }] };
    console.log('H3d', JSON.stringify(mergeEntry('progressions.saved', savedLocal, { at: 20, value: {} }).value));
    console.log('H3e', JSON.stringify(mergeEntry('progressions.saved', savedLocal, { at: 20, value: [null, { id: 'p2' }] }).value));
  });
  it('H3f sanitize raw', () => {
    const { data, skipped } = sanitizeDataSet({ 'practice.data': { at: 1, raw: 'not json at all' }, arcade: { at: 1, value: null }, x: 5 });
    console.log('H3f', JSON.stringify(data), skipped);
    const local: DataSet = { 'practice.data': { at: 1, value: { journal: [{ id: 'a' }] } } };
    console.log('H3g', JSON.stringify(planDataImport(local, data, 'merge')));
  });
  it('H8 sync both changed, settings with lists', () => {
    const base = {};
    const l: DataSet = { 'progressions.draft': { at: 10, value: { slots: [{ token: 'I', length: 4 }, { token: 'I', length: 4 }] } } };
    const r: DataSet = { 'progressions.draft': { at: 11, value: { slots: [{ token: 'ii', length: 4 }] } } };
    console.log('H8', JSON.stringify(planDataSync(l, r, base, 'merge').result));
  });
});
