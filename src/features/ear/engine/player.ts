/**
 * Turns sound plans into sound on the app's audio engine. The same `schedulePlan` drives the live
 * player and an offline render (`renderOffline`), so a check can render exactly what a question
 * plays.
 */
import {
  BackingBand, GuitarSynth, audioNow, audioState, getGuitar, startDrone, unlockAudio,
  type AudioEngine, type BackingBar, type DroneHandle, type ToneName, type VoiceHandle,
} from '@/core/audio';
import type { SoundPlan } from '../core/types';
import { notePlay } from './debug';

/** Something that can pluck and strum (the shared guitar, or a synth on an offline engine). */
export interface PlanTarget {
  pluck: GuitarSynth['pluck'];
  strum: GuitarSynth['strum'];
}

/** Schedule every event of a plan, with its zero at audio time `t0`. Returns the voices. */
export function schedulePlan(plan: SoundPlan, t0: number, target: PlanTarget, tone: ToneName): VoiceHandle[] {
  const voices: VoiceHandle[] = [];
  for (const e of plan.events) {
    const when = t0 + e.at;
    const common = { tone: e.tone ?? tone, duration: e.dur, ...(e.cents ? { cents: e.cents } : {}), ...(e.velocity !== undefined ? { velocity: e.velocity } : {}) };
    if (e.strike === 'strum' && e.midis.length > 1) {
      const strings = e.strings && e.strings.every((s): s is number => typeof s === 'number') ? e.strings : undefined;
      voices.push(...target.strum(e.midis, when, { ...common, direction: e.direction ?? 'down', ...(strings ? { strings } : {}) }));
    } else {
      e.midis.forEach((m, i) => {
        const string = e.strings?.[i];
        voices.push(target.pluck(m, when, { ...common, ...(typeof string === 'number' ? { string } : {}) }));
      });
    }
  }
  return voices;
}

/** Every distinct note of a plan, for preloading (in its own tone where the event has one). */
function preloadList(plan: SoundPlan): Array<{ midi: number; string?: number; tone?: ToneName }> {
  const seen = new Set<string>();
  const out: Array<{ midi: number; string?: number; tone?: ToneName }> = [];
  for (const e of plan.events) {
    e.midis.forEach((m, i) => {
      const s = e.strings?.[i] ?? undefined;
      const key = `${m}:${s ?? ''}:${e.tone ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ midi: m, ...(typeof s === 'number' ? { string: s } : {}), ...(e.tone ? { tone: e.tone } : {}) });
    });
  }
  return out;
}

/** Seconds the drone fades in and out. */
const DRONE_FADE = 0.25;

/** How a play ended. */
export interface PlayOutcome {
  /** The plan was heard to its end (false: stopped, or audio could not start). */
  finished: boolean;
  /** Audio did not start (locked or unsupported). */
  silent: boolean;
}

/** Options for {@link EarPlayer.play}. */
export interface PlayRequest {
  tone: ToneName;
  /** Use the backing band where the plan has a band part. */
  band?: boolean;
  /** For the debug record. */
  label?: string;
}

/**
 * The screen's player: one plan at a time, a new play replaces the old, `stop()` silences
 * everything at once. Resolves each play when it has finished sounding (or was replaced).
 */
export class EarPlayer {
  private voices: VoiceHandle[] = [];
  private drone: DroneHandle | null = null;
  private band: BackingBand | null = null;
  private bandOff: (() => void) | null = null;
  private doneTimer: ReturnType<typeof setTimeout> | null = null;
  private resolveCurrent: ((o: PlayOutcome) => void) | null = null;
  private token = 0;
  private disposed = false;

  /** True while a plan is sounding. */
  get playing(): boolean {
    return this.resolveCurrent !== null;
  }

  /** Play a plan from now (after a short lead so the first note is never clipped). */
  async play(plan: SoundPlan, req: PlayRequest): Promise<PlayOutcome> {
    this.stop();
    const token = ++this.token;
    if (this.disposed || audioState() === 'unsupported') return { finished: false, silent: true };
    const unlocked = await unlockAudio();
    if (token !== this.token) return { finished: false, silent: false };
    if (!unlocked) return { finished: false, silent: true };
    const useBand = !!(req.band && plan.band);
    if (useBand) return this.playBand(plan, req, token);
    await getGuitar().preload(preloadList(plan), { tone: req.tone });
    if (token !== this.token) return { finished: false, silent: false };
    const t0 = audioNow() + 0.08;
    this.voices = schedulePlan(plan, t0, getGuitar(), req.tone);
    if (plan.drone) {
      // On the audio clock with the notes: it starts and ends exactly where the plan says.
      const drone = plan.drone;
      this.drone = startDrone({ root: drone.midi, fifth: true, volume: 0.55, fadeIn: DRONE_FADE, when: t0 + drone.from, duration: Math.max(0.1, drone.to - drone.from), fadeOut: DRONE_FADE });
    }
    notePlay({ plan, t0, label: req.label ?? 'play', band: false });
    return new Promise<PlayOutcome>((resolve) => {
      this.resolveCurrent = resolve;
      this.doneTimer = setTimeout(() => this.finish(token, true), Math.max(0, (t0 + plan.length - audioNow()) * 1000));
    });
  }

  private async playBand(plan: SoundPlan, req: PlayRequest, token: number): Promise<PlayOutcome> {
    const part = plan.band!;
    this.band ??= new BackingBand();
    const band = this.band;
    const bars: BackingBar[] = part.split ?? part.bars.map((c) => ({ root: c.root, tones: c.tones, symbol: c.symbol }));
    band.load(bars, { style: part.style, tempo: part.tempo, choruses: 1, countInBars: 0, ending: false, fills: false });
    await band.prepare();
    if (token !== this.token) return { finished: false, silent: false };
    notePlay({ plan, t0: audioNow(), label: req.label ?? 'band', band: true });
    return new Promise<PlayOutcome>((resolve) => {
      this.resolveCurrent = resolve;
      this.bandOff = band.transport.on('end', () => this.finish(token, true));
      band.start();
    });
  }

  private finish(token: number, finished: boolean): void {
    if (token !== this.token) return;
    const resolve = this.resolveCurrent;
    this.resolveCurrent = null;
    if (this.doneTimer) clearTimeout(this.doneTimer);
    this.doneTimer = null;
    this.bandOff?.();
    this.bandOff = null;
    resolve?.({ finished, silent: false });
  }

  private stopDrone(): void {
    this.drone?.stop(0.3);
    this.drone = null;
  }

  /** Silence everything this player started; a pending play resolves as not finished. */
  stop(): void {
    const token = this.token;
    for (const v of this.voices) v.stop(undefined, 0.06);
    this.voices = [];
    this.stopDrone();
    if (this.band?.playing) this.band.stop();
    this.finish(token, false);
    // A play still getting ready (unlocking, rendering its notes) must not sound after this.
    this.token++;
  }

  /** Stop and free the band. The player cannot be used afterwards. */
  dispose(): void {
    this.stop();
    this.token++;
    this.disposed = true;
    this.band?.dispose();
    this.band = null;
  }
}

/** Play a plan on an offline engine (for checks): build the synth there and schedule at `t0`. */
export function schedulePlanOffline(engine: AudioEngine, plan: SoundPlan, tone: ToneName, t0 = 0.1): GuitarSynth {
  const synth = new GuitarSynth({ engine, tone });
  schedulePlan(plan, t0, synth, tone);
  if (plan.drone) startDrone({ root: plan.drone.midi, fifth: true, volume: 0.55, when: t0 + plan.drone.from, duration: Math.max(0.1, plan.drone.to - plan.drone.from), fadeIn: DRONE_FADE, fadeOut: DRONE_FADE }, engine);
  return synth;
}
