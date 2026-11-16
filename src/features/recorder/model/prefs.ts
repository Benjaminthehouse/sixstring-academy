/**
 * The recorder's settings (`recorder.prefs`, a learner setting kept through platform storage):
 * whether to count in, whether to click while recording, the tempo and the beats in a bar.
 */

/** How the recorder starts a take. */
export interface RecorderPrefs {
  /** One bar of clicks before recording starts. */
  countIn: boolean;
  /** Keep clicking while recording (meant for headphones). */
  click: boolean;
  /** Tempo of the count-in and click, BPM. */
  bpm: number;
  /** Beats in the count-in bar (and in the click's bar). */
  beats: 2 | 3 | 4 | 6;
}

/** Storage key (platform storage, through `useLocalState`). */
export const PREFS_KEY = 'recorder.prefs';
export const MIN_BPM = 40;
export const MAX_BPM = 240;
/** Beats a count-in bar can have. */
export const BEAT_CHOICES: readonly RecorderPrefs['beats'][] = [2, 3, 4, 6];

/** A count-in at a relaxed tempo, no click during the take: what a learner wants the first time. */
export const DEFAULT_PREFS: RecorderPrefs = { countIn: true, click: false, bpm: 80, beats: 4 };

/** Stored settings checked and repaired (anything unreadable falls back to the default). */
export function sanitizePrefs(value: unknown): RecorderPrefs {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const bpm = typeof v.bpm === 'number' && Number.isFinite(v.bpm) ? Math.round(Math.max(MIN_BPM, Math.min(MAX_BPM, v.bpm))) : DEFAULT_PREFS.bpm;
  const beats = BEAT_CHOICES.includes(v.beats as RecorderPrefs['beats']) ? (v.beats as RecorderPrefs['beats']) : DEFAULT_PREFS.beats;
  return {
    countIn: typeof v.countIn === 'boolean' ? v.countIn : DEFAULT_PREFS.countIn,
    click: typeof v.click === 'boolean' ? v.click : DEFAULT_PREFS.click,
    bpm,
    beats,
  };
}

/** The settings in a few words, for the button that opens them ("Count-in at 80 BPM", "No count-in, click on"). */
export function describePrefs(p: RecorderPrefs): string {
  if (!p.countIn && !p.click) return 'Starts at once, no click';
  if (p.countIn && !p.click) return `Count-in at ${p.bpm} BPM`;
  if (!p.countIn) return `Click at ${p.bpm} BPM`;
  return `Count-in and click at ${p.bpm} BPM`;
}
