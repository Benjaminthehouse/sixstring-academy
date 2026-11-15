/**
 * The learner's sound choices for ear training: guitar by default, a random root, no note names.
 * They are screen preferences (kept with `useLocalState`), so they are read defensively.
 */
import type { EarSettings } from './types';

/** What a first-time learner gets. */
export const DEFAULT_SETTINGS: EarSettings = {
  root: 'random',
  fixedRoot: 0,
  tone: 'steel',
  showFirstNote: false,
  aids: true,
  chordStyle: 'strum',
  progressionSound: 'guitar',
  keySetter: 'cadence',
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** Stored settings made safe: unknown fields dropped, bad values replaced by the defaults. */
export function cleanSettings(raw: unknown, toneFallback: EarSettings['tone'] = DEFAULT_SETTINGS.tone): EarSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof EarSettings, unknown>>;
  const fixed = Number(r.fixedRoot);
  return {
    root: pick(r.root, ['random', 'fixed'] as const, DEFAULT_SETTINGS.root),
    fixedRoot: Number.isInteger(fixed) && fixed >= 0 && fixed < 12 ? fixed : DEFAULT_SETTINGS.fixedRoot,
    tone: pick(r.tone, ['steel', 'nylon', 'clean'] as const, toneFallback),
    showFirstNote: typeof r.showFirstNote === 'boolean' ? r.showFirstNote : DEFAULT_SETTINGS.showFirstNote,
    aids: typeof r.aids === 'boolean' ? r.aids : DEFAULT_SETTINGS.aids,
    chordStyle: pick(r.chordStyle, ['strum', 'arpeggio'] as const, DEFAULT_SETTINGS.chordStyle),
    progressionSound: pick(r.progressionSound, ['guitar', 'band'] as const, DEFAULT_SETTINGS.progressionSound),
    keySetter: pick(r.keySetter, ['cadence', 'drone'] as const, DEFAULT_SETTINGS.keySetter),
  };
}
