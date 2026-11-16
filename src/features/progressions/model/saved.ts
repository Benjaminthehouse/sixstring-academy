/**
 * The learner's own progressions, kept on this device under the storage key `progressions.saved`
 * (through the platform storage layer), plus the builder's working draft (`progressions.draft`).
 * Every instance of the hook sees every change at once; unreadable entries are dropped on load,
 * never thrown.
 */
import { useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from '@/core/platform/storage';
import { MAX_SLOTS, sanitizeDraft, type BuilderDraft } from './builder';

/** Storage key of the saved list. */
export const SAVED_KEY = 'progressions.saved';
/** Storage key of the builder's working draft. */
export const DRAFT_KEY = 'progressions.draft';
/** The most progressions kept. */
export const MAX_SAVED = 100;

/** A saved progression: a draft with an id, a name and dates. */
export interface SavedProgression extends Omit<BuilderDraft, 'savedId'> {
  id: string;
  createdAt: number;
  updatedAt: number;
}

const ID_RE = /^my-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A saved entry from storage, or null when it cannot be read. */
export function sanitizeSaved(raw: unknown): SavedProgression | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SavedProgression>;
  if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return null;
  const draft = sanitizeDraft({ ...r, savedId: r.id });
  if (!draft.slots.length || draft.slots.length > MAX_SLOTS) return null;
  const now = Date.now();
  const createdAt = typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : now;
  const updatedAt = typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : createdAt;
  const { savedId: _drop, ...rest } = draft;
  return { ...rest, name: draft.name.trim() || 'My progression', id: r.id, createdAt, updatedAt };
}

/** Read the list (newest change first), dropping anything unreadable or duplicated. */
export function loadSaved(): SavedProgression[] {
  const raw = readJSON<unknown>(SAVED_KEY, []);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SavedProgression[] = [];
  for (const item of raw) {
    const s = sanitizeSaved(item);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED);
}

// ── A tiny store so every screen sees changes at once ─────────────────────────────────────────

const listeners = new Set<() => void>();
let cache: SavedProgression[] | null = null;

function snapshot(): SavedProgression[] {
  if (!cache) cache = loadSaved();
  return cache;
}

function commit(list: SavedProgression[]): boolean {
  const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED);
  cache = sorted;
  const ok = writeJSON(SAVED_KEY, sorted);
  for (const fn of [...listeners]) fn();
  return ok;
}

/** Forget the in-memory copy (tests, or after storage was changed elsewhere). */
export function reloadSaved(): void {
  cache = null;
  for (const fn of [...listeners]) fn();
}

/** The saved progressions, newest change first. */
export function getSaved(): SavedProgression[] {
  return snapshot();
}

/** One saved progression by id, or null. */
export function getSavedById(id: string | null | undefined): SavedProgression | null {
  return (id && snapshot().find((s) => s.id === id)) || null;
}

/** A new id that is not taken: `my-` plus a base-36 time stamp. */
export function newSavedId(now: number, taken: ReadonlySet<string> = new Set(snapshot().map((s) => s.id))): string {
  const base = `my-${Math.max(0, Math.floor(now)).toString(36)}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** The result of saving a draft. */
export interface SaveResult {
  saved: SavedProgression;
  /** True when this created a new entry (not an update of the one the draft came from). */
  created: boolean;
  /** False when the browser could not store it (it is kept for this session). */
  persisted: boolean;
}

/**
 * Save a draft: updates the progression it was opened from, or creates a new one (`asCopy`
 * always creates). An empty draft cannot be saved (returns null).
 */
export function saveDraft(draft: BuilderDraft, opts: { now?: number; asCopy?: boolean; name?: string } = {}): SaveResult | null {
  if (!draft.slots.length) return null;
  const now = opts.now ?? Date.now();
  const list = snapshot();
  const existing = !opts.asCopy && draft.savedId ? list.find((s) => s.id === draft.savedId) : undefined;
  const { savedId: _drop, ...body } = draft;
  const name = (opts.name ?? draft.name).trim().slice(0, 60) || 'My progression';
  const saved: SavedProgression = existing
    ? { ...body, name, id: existing.id, createdAt: existing.createdAt, updatedAt: now }
    : { ...body, name, id: newSavedId(now, new Set(list.map((s) => s.id))), createdAt: now, updatedAt: now };
  const persisted = commit([saved, ...list.filter((s) => s.id !== saved.id)]);
  return { saved, created: !existing, persisted };
}

/** Rename a saved progression. */
export function renameSaved(id: string, name: string, now = Date.now()): SavedProgression | null {
  const list = snapshot();
  const s = list.find((x) => x.id === id);
  const clean = name.trim().slice(0, 60);
  if (!s || !clean) return null;
  const next = { ...s, name: clean, updatedAt: now };
  commit(list.map((x) => (x.id === id ? next : x)));
  return next;
}

/** Delete a saved progression; returns what was removed so it can be put back (undo). */
export function deleteSaved(id: string): SavedProgression | null {
  const list = snapshot();
  const s = list.find((x) => x.id === id) ?? null;
  if (s) commit(list.filter((x) => x.id !== id));
  return s;
}

/** Put a deleted progression back (undo). */
export function restoreSaved(entry: SavedProgression): void {
  const s = sanitizeSaved(entry);
  if (!s) return;
  commit([s, ...snapshot().filter((x) => x.id !== s.id)]);
}

/** A saved progression as a draft for the builder (editing it updates it). */
export function draftFromSaved(s: SavedProgression): BuilderDraft {
  const { id, createdAt: _c, updatedAt: _u, ...body } = s;
  return sanitizeDraft({ ...body, savedId: id });
}

/** True when the draft differs from the saved progression it came from (or was never saved and has chords). */
export function isDirty(draft: BuilderDraft): boolean {
  const s = getSavedById(draft.savedId);
  if (!s) return draft.slots.length > 0;
  const a = JSON.stringify([draft.name.trim() || s.name, draft.tonic, draft.mode, draft.slots, draft.style, draft.tempo]);
  const b = JSON.stringify([s.name, s.tonic, s.mode, s.slots, s.style, s.tempo]);
  return a !== b;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React: the saved progressions, re-rendering on every change. */
export function useSavedProgressions(): SavedProgression[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
