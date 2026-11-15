/**
 * The screen's own small preferences (view, labels, tempo, what plays underneath …), kept per
 * device through `useLocalState`. Progress never lives here. Anything stored is sanitised on read,
 * so an old or damaged value can never break the screen.
 */
import type { BackingStyleId } from '@/core/audio';
import { SEQUENCES, type SequenceKind } from '@/core/guitar';
import { VAMP_STYLES, type Accompaniment } from './backing';
import type { DotLabel, NeckView } from './neck';
import type { Direction, NotesPerBeat, PlaySource } from './play';

/** How much of the neck is drawn. */
export type RangeMode = 'neck' | 'shape' | 'custom';

/** Everything the screen remembers between visits. */
export interface ScreenSettings {
  view: Exclude<NeckView, 'compare'>;
  /** null: follow the learner's fretboard label setting (notes or degrees). */
  label: DotLabel | null;
  range: RangeMode;
  /** Frets on the wood for `custom`. */
  custom: [number, number];
  capo: number;
  bpm: number;
  perBeat: NotesPerBeat;
  source: PlaySource;
  direction: Direction;
  loop: boolean;
  accompaniment: Accompaniment;
  /** null: the vamp's own style. */
  style: BackingStyleId | null;
  click: boolean;
  sequence: SequenceKind;
}

/** What a first visit starts with: slow eighths, up and down, looping, over a drone. */
export const DEFAULT_SETTINGS: ScreenSettings = {
  view: 'shape',
  label: null,
  range: 'neck',
  custom: [0, 12],
  capo: 0,
  bpm: 72,
  perBeat: 2,
  source: 'shape',
  direction: 'up-down',
  loop: true,
  accompaniment: 'drone',
  style: null,
  click: false,
  sequence: 'thirds',
};

/** Tempo limits in quarter notes per minute. */
export const BPM_MIN = 30;
export const BPM_MAX = 240;

function pick<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function int(value: unknown, lo: number, hi: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(hi, Math.max(lo, Math.round(value))) : fallback;
}

/** Turn whatever was stored into valid settings (unknown fields dropped, bad values defaulted). */
export function sanitizeSettings(raw: unknown): ScreenSettings {
  const d = DEFAULT_SETTINGS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const custom = Array.isArray(r.custom) ? r.custom : d.custom;
  let from = int(custom[0], 0, 23, d.custom[0]);
  let to = int(custom[1], 1, 24, d.custom[1]);
  if (to - from < 3) {
    to = Math.min(24, from + 4);
    from = Math.min(from, to - 4);
  }
  return {
    view: pick(r.view, ['shape', 'all', 'connect'] as const, d.view),
    label: (['degree', 'note', 'finger'] as const).find((l) => l === r.label) ?? null,
    range: pick(r.range, ['neck', 'shape', 'custom'] as const, d.range),
    custom: [from, to],
    capo: int(r.capo, 0, 12, d.capo),
    bpm: int(r.bpm, BPM_MIN, BPM_MAX, d.bpm),
    perBeat: pick(r.perBeat, [1, 2, 3, 4] as const, d.perBeat),
    source: pick(r.source, ['shape', 'octave', 'sequence'] as const, d.source),
    direction: pick(r.direction, ['up', 'down', 'up-down'] as const, d.direction),
    loop: typeof r.loop === 'boolean' ? r.loop : d.loop,
    accompaniment: pick(r.accompaniment, ['none', 'drone', 'band'] as const, d.accompaniment),
    style: r.style === null || r.style === undefined ? null : pick(r.style as BackingStyleId, VAMP_STYLES, VAMP_STYLES[0]),
    click: typeof r.click === 'boolean' ? r.click : d.click,
    sequence: pick(r.sequence, SEQUENCES.map((s) => s.id), d.sequence),
  };
}

/** The label mode in force: the screen's own choice, else the learner's fretboard setting. */
export function labelInForce(settings: ScreenSettings, prefLabels: 'notes' | 'degrees'): DotLabel {
  return settings.label ?? (prefLabels === 'notes' ? 'note' : 'degree');
}
