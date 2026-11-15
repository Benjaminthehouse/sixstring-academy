/**
 * Offline rendering of the real engine graph (mixer, limiter, instrument buses) to a buffer, where
 * the browser has OfflineAudioContext. Used by the browser smoke test to measure what actually
 * comes out, and usable by features that want to export audio.
 */
import { AudioEngine } from './engine';

/** Options for {@link renderOffline}. */
export interface OfflineRenderOptions {
  /** Length to render in seconds. */
  seconds: number;
  /** Sample rate (default 48000). */
  sampleRate?: number;
  /** Include the room reverb (default true). */
  reverb?: boolean;
}

/** The result of an offline render. */
export interface OfflineRender {
  sampleRate: number;
  /** Left and right channels. */
  channels: Float32Array[];
  /** Mono mix of the two channels. */
  samples: Float32Array;
}

type OfflineCtor = typeof OfflineAudioContext;

function offlineCtor(): OfflineCtor | null {
  const g = globalThis as typeof globalThis & { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  return g.OfflineAudioContext ?? g.webkitOfflineAudioContext ?? null;
}

/** True when this environment can render audio offline. */
export function offlineSupported(): boolean {
  return offlineCtor() !== null;
}

/**
 * Build a scene on a fresh offline engine and render it. `build` receives the engine; create
 * synths and transports with `{ engine }` (and `timer: 'manual'` plus `transport.advanceTo(seconds)`
 * for anything driven by a Transport), schedule everything, and return.
 */
export async function renderOffline(opts: OfflineRenderOptions, build: (engine: AudioEngine) => void | Promise<void>): Promise<OfflineRender> {
  const Ctor = offlineCtor();
  if (!Ctor) throw new Error('OfflineAudioContext is not available');
  const sampleRate = opts.sampleRate ?? 48000;
  const ctx = new Ctor(2, Math.max(1, Math.ceil(opts.seconds * sampleRate)), sampleRate);
  const engine = new AudioEngine(ctx, { reverb: opts.reverb });
  await build(engine);
  const rendered = await ctx.startRendering();
  engine.dispose();
  const channels = [rendered.getChannelData(0).slice(), rendered.getChannelData(rendered.numberOfChannels > 1 ? 1 : 0).slice()];
  const samples = new Float32Array(channels[0].length);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.5 * (channels[0][i] + channels[1][i]);
  return { sampleRate, channels, samples };
}
