/**
 * Playing takes back. A take is decoded once into an AudioBuffer (`decodeTake`, a small cache) and
 * played on the app's shared AudioContext straight to the output, untouched: no reverb, no
 * compressor, only the app's master volume. Decoding gives the exact length, so seeking is exact
 * (a MediaRecorder WebM file has no index, and an <audio> element often cannot seek in one).
 *
 * Decoded audio is big (about 11 MB a minute), so the cache keeps the last few takes only while
 * the Recorder screen holds it (`holdDecodedTakes`) and lets go of all of them when it closes.
 *
 * `TakePlayer` plays one buffer at a time; `swap` replaces it while keeping the position and the
 * playing state, which is what an A/B comparison needs.
 */
import { audioSoundingNow, audioSupported, getAudioContext, getEngine, getMasterVolume, isMuted } from '@/core/audio';

/** How many decoded takes are kept: the selected one and the two of a comparison. */
export const DECODE_CACHE_SIZE = 3;

/** A cache of decoded takes by id (see {@link createDecodeCache}). */
export interface DecodeCache<T> {
  /** The decoded take (null when it cannot be decoded); kept while the cache is held. */
  decode(id: string, blob: Blob): Promise<T | null>;
  /** Forget one take (it was deleted). */
  forget(id: string): void;
  /** Keep decoded takes until the returned release; when the last holder lets go, all are dropped. */
  hold(): () => void;
  /** Decoded takes kept now. */
  size(): number;
}

/**
 * A cache of decoded takes: the last `limit` used, a failed decode never kept (a later try may
 * work), and nothing kept at all while no screen holds it (so a take saved after leaving the
 * screen is not left in memory).
 */
export function createDecodeCache<T>(decode: (blob: Blob) => Promise<T | null>, limit = DECODE_CACHE_SIZE): DecodeCache<T> {
  const cache = new Map<string, Promise<T | null>>();
  let holders = 0;
  return {
    decode(id, blob) {
      const hit = cache.get(id);
      if (hit) {
        cache.delete(id);
        cache.set(id, hit);
        return hit;
      }
      const job = decode(blob).catch(() => null);
      if (holders === 0) return job;
      cache.set(id, job);
      void job.then((value) => {
        if (value === null && cache.get(id) === job) cache.delete(id);
      });
      while (cache.size > limit) cache.delete(cache.keys().next().value as string);
      return job;
    },
    forget(id) {
      cache.delete(id);
    },
    hold() {
      holders++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holders--;
        if (holders === 0) cache.clear();
      };
    },
    size: () => cache.size,
  };
}

const decoded = createDecodeCache<AudioBuffer>(async (blob) => {
  if (!audioSupported()) return null;
  return getAudioContext().decodeAudioData(await blob.arrayBuffer());
});

/** The decoded audio of a take (null when this browser cannot decode it). Cached for the last few takes while held. */
export function decodeTake(id: string, blob: Blob): Promise<AudioBuffer | null> {
  return decoded.decode(id, blob);
}

/** Forget a take's decoded audio (after it is deleted). */
export function forgetTake(id: string): void {
  decoded.forget(id);
}

/** Keep decoded takes while the screen is open: `useEffect(() => holdDecodedTakes(), [])`. */
export function holdDecodedTakes(): () => void {
  return decoded.hold();
}

/** How many decoded takes are in memory now (the browser check reads it after leaving the screen). */
export function decodedTakeCount(): number {
  return decoded.size();
}

/** The channels of a decoded take, for measuring it. */
export function channelsOf(buffer: AudioBuffer): Float32Array[] {
  const out: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) out.push(buffer.getChannelData(c));
  return out;
}

/** What a player is doing, for the screen. */
export interface PlayerState {
  playing: boolean;
  /** Length of the loaded take, seconds (0 when none). */
  duration: number;
}

/** Plays one decoded take at a time. */
export class TakePlayer {
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private trim = 1;
  private offset = 0;
  private startedAt = 0;
  private playingFlag = false;
  private release: (() => void) | null = null;
  private readonly listeners = new Set<(state: PlayerState) => void>();

  /** Called whenever playing starts or stops or a take is loaded. Returns an unsubscribe function. */
  onChange(fn: (state: PlayerState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const state = this.state();
    for (const fn of [...this.listeners]) fn(state);
  }

  /** Playing or not, and the length. */
  state(): PlayerState {
    return { playing: this.playingFlag, duration: this.duration };
  }

  get playing(): boolean {
    return this.playingFlag;
  }

  /** Length of the loaded take, seconds. */
  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  /** Where playback is, seconds (what is being heard now while playing). */
  position(): number {
    if (!this.playingFlag) return this.offset;
    const heard = this.offset + Math.max(0, audioSoundingNow() - this.startedAt);
    return Math.min(this.duration, heard);
  }

  /** Load a take (or nothing), stopping what was playing; the position goes back to the start. */
  load(buffer: AudioBuffer | null, trim = 1): void {
    this.halt();
    this.buffer = buffer;
    this.trim = trim;
    this.offset = 0;
    this.emit();
  }

  /** Replace the take while keeping the position (clamped) and whether it plays: A/B switching. */
  swap(buffer: AudioBuffer | null, trim = 1): void {
    const at = this.position();
    const wasPlaying = this.playingFlag;
    this.halt();
    this.buffer = buffer;
    this.trim = trim;
    this.offset = Math.min(at, Math.max(0, this.duration - 0.05));
    if (wasPlaying && buffer) this.play();
    else this.emit();
  }

  /** Start playing from `from` seconds (default: where it is). Returns false when nothing can play. */
  play(from?: number): boolean {
    const buffer = this.buffer;
    if (!buffer || !audioSupported()) return false;
    this.halt();
    let at = from ?? this.offset;
    if (at >= buffer.duration - 0.02) at = 0;
    this.offset = Math.max(0, at);
    try {
      const ctx = getAudioContext();
      this.release = getEngine().hold();
      const gain = ctx.createGain();
      gain.gain.value = this.outputGain();
      gain.connect(ctx.destination);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.onended = () => {
        if (this.source !== source) return;
        // Played to the end: back to the start, ready for another listen.
        this.halt();
        this.offset = 0;
        this.emit();
      };
      this.startedAt = ctx.currentTime;
      source.start(this.startedAt, this.offset);
      this.source = source;
      this.gainNode = gain;
      this.playingFlag = true;
    } catch {
      this.halt();
      return false;
    }
    this.emit();
    return true;
  }

  /** Stop where it is. */
  pause(): void {
    if (!this.playingFlag) return;
    this.offset = this.position();
    this.halt();
    this.emit();
  }

  /** Play or pause. Returns whether it now plays. */
  toggle(): boolean {
    if (this.playingFlag) {
      this.pause();
      return false;
    }
    return this.play();
  }

  /** Go to `seconds`; keeps playing if it was. */
  seek(seconds: number): void {
    const to = Math.max(0, Math.min(this.duration, Number.isFinite(seconds) ? seconds : 0));
    if (this.playingFlag) this.play(to);
    else {
      this.offset = to;
      this.emit();
    }
  }

  /** Follow a change of the app's volume or mute while playing. */
  refreshVolume(): void {
    if (this.gainNode) this.gainNode.gain.value = this.outputGain();
  }

  private outputGain(): number {
    return isMuted() ? 0 : this.trim * getMasterVolume();
  }

  private halt(): void {
    const source = this.source;
    this.source = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // never started
      }
      try {
        source.disconnect();
      } catch {
        // gone
      }
    }
    try {
      this.gainNode?.disconnect();
    } catch {
      // gone
    }
    this.gainNode = null;
    this.playingFlag = false;
    this.release?.();
    this.release = null;
  }

  /** Stop and let go of everything. */
  dispose(): void {
    this.halt();
    this.buffer = null;
    this.listeners.clear();
  }
}
