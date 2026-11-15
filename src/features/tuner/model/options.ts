/**
 * The tuner's own small preferences (kept through the UI kit's storage hook). The tuning, the
 * reference pitch and the microphone live in `core/progress` prefs, shared with the rest of the app.
 */

/** Stored tuner options. */
export interface TunerOptions {
  /** `standard`: within 3 cents is in tune. `fine`: within 1 cent. */
  tolerance: 'standard' | 'fine';
  /** Which meter is drawn. */
  display: 'needle' | 'strobe';
  /** Show the measured frequency. */
  showHz: boolean;
  /** How a reference note sounds. */
  earVoice: 'tone' | 'pluck';
  /** Keep a reference note sounding until it is stopped. */
  earLoop: boolean;
  /** Play reference notes an octave higher (small speakers). */
  earOctaveUp: boolean;
  /** The learner has been through (or turned down) the guided flow once. */
  guideSeen: boolean;
  /** The "no microphone here" explanation has been read. */
  micNoteSeen: boolean;
}

/** What a new learner starts with. */
export const DEFAULT_OPTIONS: TunerOptions = {
  tolerance: 'standard',
  display: 'needle',
  showHz: false,
  earVoice: 'tone',
  earLoop: true,
  earOctaveUp: false,
  guideSeen: false,
  micNoteSeen: false,
};

/** Storage key of the options (the kit's hook adds the app prefix). */
export const OPTIONS_KEY = 'tuner.options';
/** Storage key of the learner's own tunings. */
export const SAVED_TUNINGS_KEY = 'tuner.tunings';

/** Cents either side of the note that count as in tune for a tolerance setting. */
export function toleranceCents(tolerance: TunerOptions['tolerance']): number {
  return tolerance === 'fine' ? 1 : 3;
}

/** Stored options made safe: unknown or damaged fields fall back to the defaults. */
export function sanitizeOptions(raw: unknown): TunerOptions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof TunerOptions, unknown>>;
  const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
  return {
    tolerance: r.tolerance === 'fine' ? 'fine' : 'standard',
    display: r.display === 'strobe' ? 'strobe' : 'needle',
    showHz: bool(r.showHz, DEFAULT_OPTIONS.showHz),
    earVoice: r.earVoice === 'pluck' ? 'pluck' : 'tone',
    earLoop: bool(r.earLoop, DEFAULT_OPTIONS.earLoop),
    earOctaveUp: bool(r.earOctaveUp, DEFAULT_OPTIONS.earOctaveUp),
    guideSeen: bool(r.guideSeen, DEFAULT_OPTIONS.guideSeen),
    micNoteSeen: bool(r.micNoteSeen, DEFAULT_OPTIONS.micNoteSeen),
  };
}

/** Stored tunings made safe: only well-formed entries survive (at most 24). */
export function sanitizeSavedTunings(raw: unknown): Array<{ id: string; name: string; midi: number[]; instrument: 'guitar' | 'bass' | 'ukulele' }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id: string; name: string; midi: number[]; instrument: 'guitar' | 'bass' | 'ukulele' }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, midi, instrument } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || !Array.isArray(midi)) continue;
    if (midi.length < 3 || midi.length > 8 || !midi.every((m) => typeof m === 'number' && Number.isFinite(m) && m >= 12 && m <= 96)) continue;
    out.push({ id, name: name.slice(0, 40), midi: midi.map((m) => Math.round(m as number)), instrument: instrument === 'bass' || instrument === 'ukulele' ? instrument : 'guitar' });
    if (out.length >= 24) break;
  }
  return out;
}
