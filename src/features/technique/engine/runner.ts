/**
 * Plays an exercise part with the click: the song engine's `SongPlayer` for the guide guitar, the
 * count-in and the cursor, and this file's own click so a part can click on every beat, only on 2
 * and 4, only on the "and", or in odd-meter groups. One runner per exercise screen.
 */
import { normalizeClickSet, normalizeTone, playClick, unlockAudio, type ClickSet } from '@/core/audio';
import { songBpm, type ClickPattern, type ExercisePart } from '@/content/technique';
import { SongPlayer, liveOutput, type PlayerPosition, type Song } from '@/core/song';

/** What the runner is doing. */
export type RunState = 'idle' | 'loading' | 'count-in' | 'playing';

/** Listener events, delivered when the sound is heard. */
export type RunnerEvent =
  | { type: 'state'; state: RunState }
  | { type: 'countin'; beat: number; beats: number }
  | { type: 'beat'; bar: number; beat: number; time: number }
  | { type: 'pass'; count: number }
  | { type: 'end' };

/** How to play. */
export interface RunOptions {
  /** Repeat the part until stopped (practice), or play it once (a microphone take). */
  loop: boolean;
  /** The guide guitar plays the part. */
  guide: boolean;
  /** The click sounds while the part plays (the count-in always clicks). */
  click: boolean;
}

/** Click level for a tick, or null for no click. Pure, for tests. */
export function clickAt(pattern: ClickPattern, tickInBar: number, barTicks: number): 'accent' | 'beat' | 'sub' | null {
  const q = 960;
  if (pattern === 'beats') {
    if (tickInBar % q !== 0) return null;
    return tickInBar === 0 ? 'accent' : 'beat';
  }
  if (pattern === 'backbeat') {
    if (tickInBar % q !== 0) return null;
    return (tickInBar / q) % 2 === 1 ? 'accent' : null;
  }
  if (pattern === 'offbeat') {
    return tickInBar % q === q / 2 ? 'beat' : null;
  }
  const unit = pattern.unit === 'eighth' ? q / 2 : q;
  if (tickInBar % unit !== 0 || tickInBar >= barTicks) return null;
  const index = tickInBar / unit;
  let at = 0;
  for (const g of pattern.groups) {
    if (index === at) return at === 0 ? 'accent' : 'beat';
    at += g;
  }
  return 'sub';
}

/** Plays an exercise part with the click and a guide guitar. */
export class ExerciseRunner {
  private player: SongPlayer | null = null;
  private song: Song | null = null;
  private part: ExercisePart | null = null;
  private baseLadder = 0;
  private ladder = 0;
  private opts: RunOptions = { loop: true, guide: false, click: true };
  private clickSet: ClickSet = 'woodblock';
  private tone = 'steel';
  private takeBacks = new Set<() => void>();
  private offs: Array<() => void> = [];
  private listeners = new Set<(e: RunnerEvent) => void>();
  private stateNow: RunState = 'idle';

  /** Listen to state, count-in, beats, passes and the end. Returns the unsubscribe function. */
  subscribe(fn: (e: RunnerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: RunnerEvent): void {
    for (const fn of [...this.listeners]) fn(e);
  }

  private setState(s: RunState): void {
    if (this.stateNow === s) return;
    this.stateNow = s;
    this.emit({ type: 'state', state: s });
  }

  /** The current state. */
  get state(): RunState {
    return this.stateNow;
  }

  /** The learner's click and guitar sounds (from Settings). */
  setSounds(clickSound: string, guitarTone: string): void {
    this.clickSet = normalizeClickSet(clickSound);
    if (guitarTone !== this.tone) {
      this.tone = guitarTone;
      this.rebuild();
    }
  }

  /** Load a part at a ladder tempo. Stops anything playing. */
  load(part: ExercisePart, song: Song, ladderBpm: number): void {
    this.stop();
    this.part = part;
    this.song = song;
    this.baseLadder = ladderBpm;
    this.ladder = ladderBpm;
    this.rebuild();
  }

  private rebuild(): void {
    this.teardown();
    if (!this.song) return;
    const player = new SongPlayer(this.song, { output: liveOutput({ tone: normalizeTone(this.tone), clickSet: this.clickSet }), countInBars: 1 });
    this.player = player;
    player.setTrackMuted(this.song.tracks[0].id, !this.opts.guide);
    const t = player.timeline;
    const barStart = (tick: number): { start: number; length: number } => {
      // Ticks are song ticks in playback order; a loop wraps them back into the part.
      for (const b of t.bars) if (tick >= b.start && tick < b.start + b.length) return b;
      return t.bars[t.bars.length - 1] ?? { start: 0, length: 3840 };
    };
    const id = player.transport.scheduleRepeat((time, tick) => {
      if (!this.opts.click || !this.part) return;
      const b = barStart(tick);
      const level = clickAt(this.part.click ?? 'beats', tick - b.start, b.length);
      if (!level) return;
      const back = playClick(this.clickSet, level, time);
      this.takeBacks.add(back);
      setTimeout(() => this.takeBacks.delete(back), 4000);
    }, 480);
    this.offs.push(
      () => player.transport.clear(id),
      player.subscribe((e) => {
        if (e.type === 'countin') {
          this.setState('count-in');
          this.emit({ type: 'countin', beat: e.beat, beats: e.beats });
        } else if (e.type === 'beat') {
          if (this.stateNow === 'count-in') this.setState('playing');
          this.emit({ type: 'beat', bar: e.beat.bar, beat: e.beat.beat, time: e.time });
        } else if (e.type === 'loop') {
          this.emit({ type: 'pass', count: e.count });
        } else if (e.type === 'end') {
          this.takeBackClicks();
          this.setState('idle');
          this.emit({ type: 'end' });
        } else if (e.type === 'state' && e.state === 'stopped' && this.stateNow !== 'idle') {
          this.takeBackClicks();
          this.setState('idle');
        }
      }),
    );
  }

  private teardown(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.takeBackClicks();
    this.player?.dispose();
    this.player = null;
  }

  private takeBackClicks(): void {
    for (const back of this.takeBacks) back();
    this.takeBacks.clear();
  }

  /** Change guide guitar or click while playing or stopped. */
  configure(opts: Partial<RunOptions>): void {
    this.opts = { ...this.opts, ...opts };
    if (this.player && this.song) this.player.setTrackMuted(this.song.tracks[0].id, !this.opts.guide);
  }

  /** Change the tempo; while playing it applies at once, within the player's range. */
  setTempo(ladderBpm: number, song?: Song): void {
    this.ladder = ladderBpm;
    if (!this.player || !this.part) return;
    const percent = (100 * songBpm(this.part, ladderBpm)) / songBpm(this.part, this.baseLadder);
    if (this.stateNow !== 'idle' && percent >= 25 && percent <= 150) {
      this.player.tempoPercent = percent;
      return;
    }
    if (song) {
      const wasPlaying = this.stateNow !== 'idle';
      this.load(this.part, song, ladderBpm);
      if (wasPlaying) void this.start(this.opts);
    }
  }

  /** The ladder tempo playing now. */
  get tempo(): number {
    return this.ladder;
  }

  /** Start from the top with a one-bar count-in. Call from a tap or key press. */
  async start(opts: Partial<RunOptions> = {}): Promise<void> {
    this.opts = { ...this.opts, ...opts };
    const player = this.player;
    if (!player || !this.song) return;
    player.stop();
    this.takeBackClicks();
    this.setState('loading');
    await unlockAudio();
    try {
      await player.prepare();
    } catch {
      // A note that fails to render plays a moment late; never block the click on it.
    }
    if (player !== this.player || this.stateNow !== 'loading') return;
    player.setTrackMuted(this.song.tracks[0].id, !this.opts.guide);
    if (this.opts.loop) player.setLoopTicks(0, player.timeline.totalTicks);
    else player.clearLoop();
    player.play();
    this.setState('count-in');
  }

  /** Stop and go back to the top. */
  stop(): void {
    if (this.player && this.stateNow !== 'idle') this.player.stop();
    this.takeBackClicks();
    this.setState('idle');
  }

  /**
   * Audio time the first beat of this run is heard (after the count-in), on the shared audio clock
   * the microphone listens on; null before a run has started.
   */
  firstBeatTime(): number | null {
    return this.player?.firstBeatTime ?? null;
  }

  /** Where the music is, for the tab cursor (read it in requestAnimationFrame). */
  position(): PlayerPosition | null {
    return this.player?.position() ?? null;
  }

  /** Seconds one pass of the part lasts at the current tempo. */
  passSeconds(): number {
    if (!this.player || !this.part) return 0;
    return this.player.timeline.totalSeconds * (songBpm(this.part, this.baseLadder) / songBpm(this.part, this.ladder));
  }

  /** Free the player and its sounds. A later `load` builds a new one (screens remount under StrictMode). */
  dispose(): void {
    this.stop();
    this.teardown();
  }
}
