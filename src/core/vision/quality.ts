/**
 * Adaptive quality for the camera pipeline: how big the working frame is and how often a full
 * detection may run, chosen from the measured cost of recent frames.
 *
 *  - Tracking (a board is followed) should finish inside `trackBudgetMs` per frame. When the median
 *    of recent tracked frames is over budget, the working frame steps down a size; when there has
 *    been clear headroom for a while (the bigger size would still fit with room to spare), it steps
 *    back up.
 *  - Detection (searching for a board) is the expensive call. It is spaced out so that at most
 *    `detectDuty` of the time is spent detecting; when even that is far over budget the frame
 *    steps down a size as well.
 *
 * Pure logic (no timers, no DOM): the pipeline feeds it measurements and reads `settings`.
 */

/** Options of `QualityController`. */
export interface QualityOptions {
  /** Working widths to choose from, largest first (default [640, 544, 480]). */
  widths?: number[];
  /** Width to start at (default: the largest). */
  startWidth?: number;
  /** Per-frame budget of a tracked frame, ms (default 45: about 22 frames per second with room to spare). */
  trackBudgetMs?: number;
  /** Per-frame budget of a full detection, ms (default 80). */
  detectBudgetMs?: number;
  /** Largest share of the time spent detecting while searching, 0..1 (default 0.75). */
  detectDuty?: number;
  /** Detection runs at least this often while searching, ms between runs (default 500). */
  maxDetectIntervalMs?: number;
  /** Recent measurements kept per kind (default 12). */
  window?: number;
  /** Headroom must last this long before the size steps up, ms (default 3000). */
  upAfterMs?: number;
  /** No size change within this long of the last one, ms (default 1500). */
  cooldownMs?: number;
  /** Measurements in the first this many ms (just-in-time compilation warming up) do not count, ms (default 2000). */
  warmupMs?: number;
}

/** What the pipeline should do now. */
export interface QualitySettings {
  /** Width of the working frame in pixels (the height follows the camera's aspect ratio). */
  workingWidth: number;
  /** While searching, wait this long after a detection before the next one, ms (0 = every frame). */
  detectIntervalMs: number;
  /** Index into `widths` (0 = the largest). */
  level: number;
}

/** Kind of work a frame needed. */
export type FrameWork = 'track' | 'detect';

const DEFAULTS: Required<Omit<QualityOptions, 'startWidth'>> = {
  widths: [640, 544, 480],
  trackBudgetMs: 45,
  detectBudgetMs: 80,
  detectDuty: 0.75,
  maxDetectIntervalMs: 500,
  window: 12,
  upAfterMs: 3000,
  cooldownMs: 1500,
  warmupMs: 2000,
};

function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

/** Chooses the working size and the detection rate from measured frame costs. */
export class QualityController {
  private readonly o: Required<Omit<QualityOptions, 'startWidth'>>;
  private level: number;
  private track: number[] = [];
  private detect: number[] = [];
  private changedAt = -Infinity;
  private headroomSince = -1;
  private interval = 0;
  private startedAt = NaN;

  /** Create a controller; see `QualityOptions`. */
  constructor(options: QualityOptions = {}) {
    const widths = (options.widths ?? DEFAULTS.widths).filter((w) => Number.isFinite(w) && w >= 64).sort((a, b) => b - a);
    this.o = { ...DEFAULTS, ...options, widths: widths.length > 0 ? widths : DEFAULTS.widths };
    const start = options.startWidth ?? this.o.widths[0];
    let level = 0;
    for (let i = 0; i < this.o.widths.length; i++) if (Math.abs(this.o.widths[i] - start) < Math.abs(this.o.widths[level] - start)) level = i;
    this.level = level;
  }

  /** The settings in force. */
  get settings(): QualitySettings {
    return { workingWidth: this.o.widths[this.level], detectIntervalMs: this.interval, level: this.level };
  }

  /** Median cost of recent tracked / detected frames, ms (NaN before any). */
  get medians(): { track: number; detect: number } {
    return { track: median(this.track), detect: median(this.detect) };
  }

  /** Forget the measurements (keeps the current size). */
  reset(): void {
    this.track = [];
    this.detect = [];
    this.headroomSince = -1;
    this.interval = 0;
    this.startedAt = NaN;
  }

  /** Record what one frame cost. Returns true when the working size changed. */
  record(kind: FrameWork, ms: number, nowMs: number): boolean {
    if (!Number.isFinite(ms) || ms < 0) return false;
    if (Number.isNaN(this.startedAt)) this.startedAt = nowMs;
    if (nowMs - this.startedAt < this.o.warmupMs) return false;
    const list = kind === 'track' ? this.track : this.detect;
    list.push(ms);
    if (list.length > this.o.window) list.shift();
    const o = this.o;
    if (kind === 'detect') {
      const m = median(this.detect);
      const duty = Math.min(0.95, Math.max(0.05, o.detectDuty));
      // Within budget: detect on every frame (the fastest lock). Over it: leave gaps so detection
      // takes at most `detectDuty` of the time.
      this.interval = m <= o.detectBudgetMs ? 0 : Math.min(o.maxDetectIntervalMs, Math.round(m * (1 / duty - 1)));
      // A detection far over budget at this size: a smaller frame is cheaper for the line search.
      if (this.detect.length >= 4 && m > 2.5 * o.detectBudgetMs && this.canChange(nowMs) && this.level < o.widths.length - 1) return this.step(1, nowMs);
      return false;
    }
    if (this.track.length < Math.min(8, o.window)) return false;
    const m = median(this.track);
    if (m > o.trackBudgetMs) {
      this.headroomSince = -1;
      if (this.canChange(nowMs) && this.level < o.widths.length - 1) return this.step(1, nowMs);
      return false;
    }
    if (this.level > 0) {
      // Cost grows with the pixel count: would the next size up still leave room to spare?
      const ratio = (o.widths[this.level - 1] / o.widths[this.level]) ** 2;
      if (m * ratio < 0.7 * o.trackBudgetMs) {
        if (this.headroomSince < 0) this.headroomSince = nowMs;
        if (nowMs - this.headroomSince >= o.upAfterMs && this.canChange(nowMs)) return this.step(-1, nowMs);
      } else this.headroomSince = -1;
    }
    return false;
  }

  private canChange(nowMs: number): boolean {
    return nowMs - this.changedAt >= this.o.cooldownMs;
  }

  private step(direction: 1 | -1, nowMs: number): boolean {
    this.level = Math.min(this.o.widths.length - 1, Math.max(0, this.level + direction));
    this.changedAt = nowMs;
    this.headroomSince = -1;
    this.track = [];
    this.detect = [];
    return true;
  }
}
