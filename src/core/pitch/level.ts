/**
 * Level helpers: decibel conversions and the adaptive noise gate that decides whether a frame is
 * loud enough to be a note at all.
 */

/** Linear amplitude -> dBFS (floored at -120). */
export function toDb(amplitude: number): number {
  return amplitude > 1e-6 ? 20 * Math.log10(amplitude) : -120;
}

/** dBFS -> linear amplitude. */
export function fromDb(db: number): number {
  return Math.pow(10, db / 20);
}

/** Options for {@link NoiseGate}. */
export interface NoiseGateOptions {
  /** The gate never drops below this level in dBFS (default -62). */
  minGateDb?: number;
  /** The gate never rises above this level in dBFS, however noisy the room (default -38). */
  maxGateDb?: number;
  /** A note must be this many dB above the noise floor (default 8). */
  marginDb?: number;
  /** Slowest rate at which the floor estimate rises while nothing is playing, in dB per second (default 4; it rises faster when far below the level). */
  riseDbPerSecond?: number;
}

/**
 * Tracks the background level (room noise, hum) while nothing is playing and derives the gate
 * from it. The floor follows quiet stretches down quickly and creeps up slowly; it is frozen
 * while a note sounds, so a long sustained note is never mistaken for background.
 */
export class NoiseGate {
  private readonly minGate: number;
  private readonly maxGate: number;
  private readonly margin: number;
  private readonly rise: number;
  private floor = Number.NaN;
  private lastTime = Number.NaN;

  constructor(opts: NoiseGateOptions = {}) {
    this.minGate = opts.minGateDb ?? -62;
    this.maxGate = opts.maxGateDb ?? -38;
    this.margin = opts.marginDb ?? 8;
    this.rise = opts.riseDbPerSecond ?? 4;
  }

  /** Feed the level of one frame. `noteActive` freezes the estimate. */
  update(levelDb: number, time: number, noteActive: boolean): void {
    if (Number.isNaN(this.floor)) {
      this.floor = levelDb;
      this.lastTime = time;
      return;
    }
    const dt = Math.max(0, Math.min(0.25, time - this.lastTime));
    this.lastTime = time;
    if (noteActive) return;
    if (levelDb < this.floor) this.floor += (levelDb - this.floor) * Math.min(1, dt / 0.08);
    else this.floor = Math.min(levelDb, this.floor + Math.max(this.rise, (levelDb - this.floor) * 1.5) * dt);
  }

  /** Declare the current level to be background (used when a steady hum is recognised). */
  adopt(levelDb: number): void {
    this.floor = levelDb;
  }

  /** Estimated background level in dBFS (-120 before any audio). */
  get floorDb(): number {
    return Number.isNaN(this.floor) ? -120 : this.floor;
  }

  /** Level in dBFS a frame must reach to start a note. */
  get gateDb(): number {
    return Math.min(this.maxGate, Math.max(this.minGate, this.floorDb + this.margin));
  }

  /** Forget everything (new stream). */
  reset(): void {
    this.floor = Number.NaN;
    this.lastTime = Number.NaN;
  }
}
