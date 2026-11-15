import { useCallback, useMemo } from 'react';
import { STANDARD_TUNING, type Tuning } from '@/core/guitar';
import { usePrefs, useProgress } from '@/core/progress';
import { fretCount, learnerTuning } from '@/core/settings';
import { formatNote } from '@/core/theory';
import { useLocalState } from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { cleanSettings, defaultSettings, SETTINGS_KEY, spellingFromPref, type TrainerSettings } from '../core/settings';
import { decodeStats, mapSkillId, type NeckStats } from '../core/stats';
import type { NeckContext } from '../core/types';

/** Everything a fretboard screen needs to know about the learner and their guitar. */
export interface Trainer {
  tuning: Tuning;
  /** Set when the learner's tuning is not a guitar this trainer can teach (a bass, a ukulele). */
  tuningNote: string | null;
  ctx: NeckContext;
  settings: TrainerSettings;
  setSettings: (next: TrainerSettings) => void;
  /** Highest fret of the learner's neck (Settings, 12–24). */
  maxFret: number;
  stats: NeckStats;
  /** Progress-store skill that keeps the neck map for this tuning. */
  mapId: string;
  /** Note name (ASCII) in the reader's naming: `C#` → `C♯` / `Do♯`. */
  fmt: (ascii: string) => string;
  naming: 'letters' | 'solfege' | 'german';
}

/** The learner's guitar, spelling, practice settings and neck map, kept in step with Settings. */
export function useTrainer(): Trainer {
  const prefs = usePrefs();
  const { naming } = useMusicSettings();
  const { tuning, tuningNote } = useMemo(() => {
    const t = learnerTuning(prefs);
    // The method is written for a six- or seven-string guitar; a bass or ukulele gets standard tuning.
    if (t.instrument !== 'guitar' || t.stringCount < 6) return { tuning: STANDARD_TUNING, tuningNote: `Your tuning in Settings (${t.name}) is not a six-string guitar, so the trainer uses standard tuning.` };
    return { tuning: t, tuningNote: null };
  }, [prefs]);
  const maxFret = Math.max(12, Math.min(24, fretCount(prefs)));
  const spelling = spellingFromPref(prefs.accidentals);
  const ctx = useMemo<NeckContext>(() => ({ tuning: tuning.midi, spelling }), [tuning, spelling]);
  const [raw, setRaw] = useLocalState<unknown>(SETTINGS_KEY, () => defaultSettings(tuning.stringCount));
  const settings = useMemo(() => cleanSettings(raw, tuning.stringCount, maxFret), [raw, tuning.stringCount, maxFret]);
  const setSettings = useCallback((next: TrainerSettings) => setRaw(cleanSettings(next, tuning.stringCount, maxFret)), [setRaw, tuning.stringCount, maxFret]);
  const mapId = mapSkillId(tuning.id);
  const data = useProgress((s) => s.skills[mapId]?.data);
  const stats = useMemo(() => decodeStats(data), [data]);
  const fmt = useCallback((ascii: string) => formatNote(ascii, { system: naming }), [naming]);
  return { tuning, tuningNote, ctx, settings, setSettings, maxFret, stats, mapId, fmt, naming };
}
