/**
 * What the practice helpers show while the metronome runs: where the speed trainer is on its way
 * to the target, and whether this bar of the gap trainer clicks or stays silent. The tempo itself
 * is changed by the engine's own speed trainer (`speedTrainerBpm`); these views use the same maths.
 */
import { isSilentBar, speedTrainerBpm, speedTrainerLength, type SilentBarsConfig, type SpeedTrainerConfig } from '@/core/audio';
import type { GapSettings, TrainerSettings } from './settings';

/** The engine's speed-trainer config for these settings, or null when it is off or goes nowhere. */
export function trainerConfig(t: TrainerSettings): SpeedTrainerConfig | null {
  if (!t.on || t.start === t.target) return null;
  return { startBpm: t.start, targetBpm: t.target, stepBpm: Math.max(1, t.step), everyBars: Math.max(1, t.every) };
}

/** The engine's silent-bars config for these settings, or null when it is off. */
export function gapConfig(g: GapSettings): SilentBarsConfig | null {
  return g.on ? { playBars: Math.max(1, g.play), muteBars: Math.max(1, g.mute) } : null;
}

/** Where the speed trainer is. */
export interface TrainerProgress {
  /** Tempo for this bar. */
  bpm: number;
  /** 0..1 of the way from start to target. */
  fraction: number;
  /** Tempo steps taken so far, and how many there are in all. */
  step: number;
  steps: number;
  /** Bars until the next step (0 once the target is reached). */
  barsToNext: number;
  /** The target has been reached: it stays there. */
  done: boolean;
  /** Going up (true) or down. */
  rising: boolean;
}

/** Progress of the speed trainer after `barsElapsed` whole bars (bar 0 is the first bar). */
export function trainerProgress(cfg: SpeedTrainerConfig, barsElapsed: number): TrainerProgress {
  const bars = Math.max(0, Math.floor(barsElapsed));
  const every = Math.max(1, Math.round(cfg.everyBars));
  const bpm = speedTrainerBpm(cfg, bars);
  const span = Math.abs(cfg.targetBpm - cfg.startBpm);
  const length = speedTrainerLength(cfg);
  const steps = length / every;
  const done = bpm === cfg.targetBpm;
  const step = done ? steps : Math.floor(bars / every);
  return {
    bpm,
    fraction: span === 0 ? 1 : Math.abs(bpm - cfg.startBpm) / span,
    step,
    steps,
    barsToNext: done ? 0 : every - (bars % every),
    done,
    rising: cfg.targetBpm >= cfg.startBpm,
  };
}

/** One line for the trainer while it runs: "Step 3 of 8. Next: 95 BPM in 2 bars." */
export function trainerLine(p: TrainerProgress, cfg: SpeedTrainerConfig): string {
  if (p.done) return `Target reached: ${cfg.targetBpm} BPM. It stays here.`;
  const next = cfg.targetBpm >= cfg.startBpm ? Math.min(cfg.targetBpm, p.bpm + Math.abs(cfg.stepBpm)) : Math.max(cfg.targetBpm, p.bpm - Math.abs(cfg.stepBpm));
  return `Step ${p.step + 1} of ${p.steps + 1}. Next: ${next} BPM in ${p.barsToNext} ${p.barsToNext === 1 ? 'bar' : 'bars'}.`;
}

/** How long the whole climb takes, in words: "8 steps, 32 bars". */
export function trainerPlanWords(cfg: SpeedTrainerConfig): string {
  const every = Math.max(1, Math.round(cfg.everyBars));
  const bars = speedTrainerLength(cfg);
  const steps = bars / every;
  return `${steps} ${steps === 1 ? 'step' : 'steps'}, ${bars} ${bars === 1 ? 'bar' : 'bars'} to the target`;
}

/** Where the gap trainer is in its cycle. */
export interface GapStatus {
  silent: boolean;
  /** 1-based bar within the current phase (playing or silent). */
  barOfPhase: number;
  /** Bars in the current phase. */
  phaseBars: number;
}

/** Gap-trainer status of bar `bar` (0-based from the start). */
export function gapStatus(cfg: SilentBarsConfig, bar: number): GapStatus {
  const play = Math.max(1, cfg.playBars);
  const mute = Math.max(1, cfg.muteBars);
  const cycle = play + mute;
  const at = ((Math.floor(bar) % cycle) + cycle) % cycle;
  const silent = isSilentBar(cfg, bar);
  return silent ? { silent, barOfPhase: at - play + 1, phaseBars: mute } : { silent, barOfPhase: at + 1, phaseBars: play };
}
