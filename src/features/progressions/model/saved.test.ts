import { beforeEach, describe, expect, it } from 'vitest';
import { readJSON, remove, writeJSON } from '@/core/platform/storage';
import { STARTER_DRAFT, type BuilderDraft } from './builder';
import {
  SAVED_KEY, deleteSaved, draftFromSaved, getSaved, getSavedById, isDirty, loadSaved, newSavedId, reloadSaved,
  renameSaved, restoreSaved, sanitizeSaved, saveDraft,
} from './saved';

const blues: BuilderDraft = {
  ...STARTER_DRAFT,
  name: 'Slow blues in A',
  tonic: 'A',
  slots: [{ token: 'I7', length: 4 }, { token: 'IV7', length: 2 }, { token: 'I7', length: 2 }, { token: 'V7', length: 1 }, { token: 'IV7', length: 1 }, { token: 'I7', length: 2 }],
  style: 'slow-blues',
  tempo: 60,
};

beforeEach(() => {
  remove(SAVED_KEY);
  reloadSaved();
});

describe('saving', () => {
  it('creates a new progression with a slug-safe id, stored under its own key', () => {
    const r = saveDraft(blues, { now: 1_700_000_000_000 })!;
    expect(r.created).toBe(true);
    expect(r.saved.id).toMatch(/^my-[a-z0-9]+$/);
    expect(r.saved.name).toBe('Slow blues in A');
    expect(getSaved()).toHaveLength(1);
    const stored = readJSON<unknown[]>(SAVED_KEY, []);
    expect(stored).toHaveLength(1);
    reloadSaved();
    expect(loadSaved()[0]).toMatchObject({ id: r.saved.id, tonic: 'A', style: 'slow-blues', tempo: 60, slots: blues.slots });
  });

  it('updates the progression a draft was opened from, and copies on request', () => {
    const first = saveDraft(blues, { now: 1000 })!;
    const draft = draftFromSaved(first.saved);
    expect(draft.savedId).toBe(first.saved.id);
    const again = saveDraft({ ...draft, tempo: 72 }, { now: 2000 })!;
    expect(again.created).toBe(false);
    expect(again.saved.id).toBe(first.saved.id);
    expect(again.saved.createdAt).toBe(1000);
    expect(again.saved.updatedAt).toBe(2000);
    expect(getSaved()).toHaveLength(1);
    const copy = saveDraft(draft, { now: 3000, asCopy: true, name: 'Copy' })!;
    expect(copy.created).toBe(true);
    expect(copy.saved.id).not.toBe(first.saved.id);
    expect(getSaved().map((s) => s.name)).toEqual(['Copy', 'Slow blues in A']);
  });

  it('refuses an empty draft and names a nameless one', () => {
    expect(saveDraft({ ...blues, slots: [] })).toBeNull();
    expect(saveDraft({ ...blues, name: '   ' })!.saved.name).toBe('My progression');
  });

  it('gives distinct ids even within the same millisecond', () => {
    const a = saveDraft(blues, { now: 5000 })!;
    const b = saveDraft({ ...blues, savedId: null }, { now: 5000 })!;
    expect(a.saved.id).not.toBe(b.saved.id);
    expect(newSavedId(5000, new Set([a.saved.id, b.saved.id]))).not.toMatch(new RegExp(`^(${a.saved.id}|${b.saved.id})$`));
  });
});

describe('renaming, deleting and undo', () => {
  it('renames, deletes and puts back', () => {
    const { saved } = saveDraft(blues, { now: 1000 })!;
    expect(renameSaved(saved.id, '  Twelve-bar  ', 2000)?.name).toBe('Twelve-bar');
    expect(renameSaved(saved.id, '   ')).toBeNull();
    const removed = deleteSaved(saved.id)!;
    expect(getSaved()).toHaveLength(0);
    expect(getSavedById(saved.id)).toBeNull();
    restoreSaved(removed);
    expect(getSavedById(saved.id)?.name).toBe('Twelve-bar');
  });
});

describe('reading storage', () => {
  it('drops unreadable and duplicate entries instead of failing', () => {
    writeJSON(SAVED_KEY, [
      { id: 'my-a', name: 'Good', tonic: 'C', mode: 'major', slots: [{ token: 'I', length: 1 }], style: 'pop-rock', tempo: 100, createdAt: 1, updatedAt: 1 },
      { id: 'my-a', name: 'Duplicate', tonic: 'C', mode: 'major', slots: [{ token: 'I', length: 1 }], style: 'pop-rock', tempo: 100 },
      { id: 'BAD ID', name: 'x', tonic: 'C', slots: [{ token: 'I', length: 1 }] },
      { id: 'my-empty', name: 'Empty', tonic: 'C', slots: [] },
      'junk',
      null,
    ]);
    reloadSaved();
    expect(getSaved().map((s) => s.name)).toEqual(['Good']);
    writeJSON(SAVED_KEY, { not: 'a list' });
    reloadSaved();
    expect(getSaved()).toEqual([]);
  });

  it('sanitizes one entry', () => {
    expect(sanitizeSaved({ id: 'my-x', slots: [{ token: 'I', length: 1 }] })?.name).toBe('My progression');
    expect(sanitizeSaved({ id: 'x', slots: [{ token: 'I', length: 1 }] })).toBeNull();
  });
});

describe('dirty drafts', () => {
  it('knows when a draft differs from what was saved', () => {
    const { saved } = saveDraft(blues, { now: 1 })!;
    const d = draftFromSaved(saved);
    expect(isDirty(d)).toBe(false);
    expect(isDirty({ ...d, tempo: d.tempo + 1 })).toBe(true);
    expect(isDirty({ ...blues, savedId: null })).toBe(true);
    expect(isDirty({ ...blues, savedId: null, slots: [] })).toBe(false);
  });
});
