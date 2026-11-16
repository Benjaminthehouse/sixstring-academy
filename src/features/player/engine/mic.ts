/**
 * The microphone for wait and flow mode: one pitch tracker on the audio engine's own context, so
 * the times of what is heard share the clock the song is scheduled on. Opened from a tap, closed
 * when the screen goes or the learner switches to a mode without it.
 */
import { getAudioContext, getEngine } from '@/core/audio';
import { PitchTracker, type ChromaEvent, type NoteOnEvent } from '@/core/pitch';
import { isArtifact, type MediaFailure } from '@/core/platform';
import { micOptions } from '@/core/settings';

/** Microphone state as the screen shows it. */
export type MicStatus = 'off' | 'starting' | 'on' | 'failed';

/** What the microphone tells the player. */
export interface MicHandlers {
  noteon(e: NoteOnEvent): void;
  chroma(e: ChromaEvent): void;
  /** Input level 0–1 (for the meter), about 30 times a second. */
  level(x: number, clipping: boolean): void;
  /** The device went away or the audio failed while listening. */
  lost(reason: MediaFailure): void;
}

/** One microphone input. */
export class MicInput {
  private tracker: PitchTracker | null = null;
  private release: (() => void) | null = null;
  private offs: Array<() => void> = [];
  private starting: Promise<{ ok: true } | { ok: false; reason: MediaFailure }> | null = null;
  status: MicStatus = 'off';

  constructor(private readonly on: MicHandlers) {}

  /** True where no microphone can ever be had (the Claude viewer refuses it). */
  static blockedByHost(): boolean {
    return isArtifact();
  }

  /** Round-trip latency to take off note times: what the speakers lag plus what the input lags (s). */
  get latency(): number {
    let out = 0;
    try {
      out += getEngine().outputLatency || 0;
    } catch {
      /* no audio engine: nothing to add */
    }
    out += this.tracker?.info?.inputLatency ?? 0;
    return Number.isFinite(out) ? Math.max(0, Math.min(0.5, out)) : 0;
  }

  /** Open the microphone (call from a tap). */
  start(): Promise<{ ok: true } | { ok: false; reason: MediaFailure }> {
    if (this.tracker && this.status === 'on') return Promise.resolve({ ok: true });
    if (this.starting) return this.starting;
    if (MicInput.blockedByHost()) {
      this.status = 'failed';
      return Promise.resolve({ ok: false, reason: 'blocked-by-host' });
    }
    this.status = 'starting';
    this.starting = (async () => {
      let ctx: AudioContext | undefined;
      try {
        ctx = getAudioContext();
      } catch {
        ctx = undefined;
      }
      const t = new PitchTracker({ ...micOptions(), chroma: true, ...(ctx ? { audioContext: ctx } : {}) });
      const res = await t.start();
      if (!res.ok) {
        t.stop();
        this.status = res.detail === 'superseded' ? 'off' : 'failed';
        return { ok: false as const, reason: res.reason === 'audio-failed' ? ('unknown' as const) : res.reason };
      }
      this.tracker = t;
      try {
        // The shared context must stay awake while the microphone is analysed through it.
        this.release = getEngine().hold();
      } catch {
        this.release = null;
      }
      this.offs.push(
        t.on('noteon', (e) => this.on.noteon(e)),
        t.on('chroma', (e) => this.on.chroma(e)),
        t.on('level', (e) => this.on.level(Math.max(0, Math.min(1, (e.db + 60) / 50)), e.clipping)),
        t.onStatus((s, fault) => {
          if (s === 'stopped' && fault) {
            this.teardown();
            this.status = 'failed';
            this.on.lost(fault === 'device-lost' ? 'no-device' : 'unknown');
          }
        }),
      );
      this.status = 'on';
      return { ok: true as const };
    })().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private teardown(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.tracker?.stop();
    this.tracker = null;
    this.release?.();
    this.release = null;
  }

  /** Close the microphone. */
  stop(): void {
    this.teardown();
    this.status = 'off';
  }
}
