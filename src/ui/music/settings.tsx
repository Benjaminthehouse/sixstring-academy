/**
 * The music display settings every component reads: note naming, handedness, the fretboard's wood
 * and inlays, and what fretboard dots are labelled with. By default they follow the learner's
 * preferences in `core/progress`, so a screen does not have to pass them; a
 * `<MusicSettingsProvider>` (a lesson that teaches solfege, a gallery) overrides any of them for
 * its subtree, and a component prop overrides both.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { shallowEqual, useProgress, type ProgressState } from '@/core/progress';
import type { FretboardInlay, FretboardWood, NoteNaming } from './types';

/** What the music components show unless told otherwise. */
export interface MusicSettings {
  naming: NoteNaming;
  leftHanded: boolean;
  wood: FretboardWood;
  inlay: FretboardInlay;
  /** What fretboard dots show by default: note names or scale degrees. */
  labels: 'notes' | 'degrees';
}

/** The values used when nothing else says otherwise. */
export const DEFAULT_MUSIC_SETTINGS: Readonly<MusicSettings> = {
  naming: 'letters',
  leftHanded: false,
  wood: 'rosewood',
  inlay: 'dots',
  labels: 'notes',
};

const WOODS: readonly FretboardWood[] = ['rosewood', 'maple', 'ebony', 'pau-ferro', 'roasted-maple', 'koa'];
const INLAYS: readonly FretboardInlay[] = ['dots', 'offset-dots', 'blocks', 'diamonds', 'sharkfin', 'vine'];

/** The wood of a cosmetic id (`wood-maple` -> `maple`); unknown ids give rosewood. */
export function woodFromCosmetic(id: string | undefined | null): FretboardWood {
  const name = (id ?? '').replace(/^wood-/, '') as FretboardWood;
  return WOODS.includes(name) ? name : 'rosewood';
}

/** The inlay style of a cosmetic id (`inlay-blocks` -> `blocks`); unknown ids give dots. */
export function inlayFromCosmetic(id: string | undefined | null): FretboardInlay {
  const name = (id ?? '').replace(/^inlay-/, '') as FretboardInlay;
  return INLAYS.includes(name) ? name : 'dots';
}

const MusicSettingsContext = createContext<Partial<MusicSettings> | null>(null);

/** Override some music settings for everything inside. Unset values keep following the learner's preferences. */
export function MusicSettingsProvider({ children, ...value }: Partial<MusicSettings> & { children: ReactNode }) {
  const parent = useContext(MusicSettingsContext);
  const { naming, leftHanded, wood, inlay, labels } = value;
  const merged = useMemo(() => {
    const own: Partial<MusicSettings> = {};
    if (naming !== undefined) own.naming = naming;
    if (leftHanded !== undefined) own.leftHanded = leftHanded;
    if (wood !== undefined) own.wood = wood;
    if (inlay !== undefined) own.inlay = inlay;
    if (labels !== undefined) own.labels = labels;
    return { ...parent, ...own };
  }, [parent, naming, leftHanded, wood, inlay, labels]);
  return <MusicSettingsContext.Provider value={merged}>{children}</MusicSettingsContext.Provider>;
}

const selectFromPrefs = (s: ProgressState): MusicSettings => ({
  naming: s.prefs?.noteNaming ?? DEFAULT_MUSIC_SETTINGS.naming,
  leftHanded: s.prefs?.handedness === 'left',
  wood: woodFromCosmetic(s.prefs?.fretboard?.wood),
  inlay: inlayFromCosmetic(s.prefs?.fretboard?.inlay),
  labels: s.prefs?.fretboard?.labels === 'degrees' ? 'degrees' : 'notes',
});

/** The music settings in effect here: provider values first, then the learner's preferences. */
export function useMusicSettings(): MusicSettings {
  const fromPrefs = useProgress(selectFromPrefs, shallowEqual);
  const override = useContext(MusicSettingsContext);
  return useMemo(() => (override ? { ...fromPrefs, ...override } : fromPrefs), [fromPrefs, override]);
}
