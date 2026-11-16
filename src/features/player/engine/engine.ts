/**
 * The player's engine: one per open song. It owns the song core's `SongPlayer` (sound, cursor
 * clock, loop, tempo, mutes), the microphone, the practice modes (wait, flow, tap along, listen),
 * the speed trainer, the results and the saved session. React reads its low-frequency state with
 * `useSyncExternalStore`; everything that moves with the music (cursor, fretboard, count-in,
 * judgements, input level) goes through channels that write to the DOM directly.
 *
 * Time domains: the SongPlayer schedules sounds on the audio clock and reports beats when they
 * are heard. Note-ons from the microphone carry the pluck's audio time; the learner plays with
 * what they hear, so the output and input latency are taken off before a note is scored.
 */
import { audioNow, audioRunning, audioSoundingNow, normalizeClickSet, normalizeTone, playUi, pluck, strum, unlockAudio, type ClickSet, type ToneName } from '@/core/audio';
import { getProgress, recordActivity, type ActivityResult } from '@/core/progress';
import { readJSON, writeJSON, type MediaFailure } from '@/core/platform';
import {
  SongPlayer, WaitMode, barCapacity, liveOutput, practiceTargets,
  type LiveOutputOptions, type PlayEvent, type PlayNote, type PlayStrum, type PracticeTarget, type Song, type SongPlayerOutput, type SongTimeline, type WaitResult,
} from '@/core/song';
import type { ChromaEvent, NoteOnEvent } from '@/core/pitch';
import { noteKey, type TabNoteState } from '@/ui/music/tab';
import { playerDebug, pushBounded, resetDebug } from '../debug';
import { IDLE_PICK, loopKey, normalizeLoop, stepBarTick, type LoopPick } from '../model/loop';
import { chordCandidates, chordSpec, StrumListener, strumWords } from '../model/heard-chord';
import { tempoMark } from '../model/meter';
import { chordName, describeSpots, heardName, spotName, targetSpots, type NeckLabelOptions, type NeckSpot } from '../model/neck';
import { activityFor, bestLine, readSongData, summarizeFlow, summarizeListen, summarizeWait, withRun, type RunSummary } from '../model/results';
import { FlowRun } from '../model/run';
import { sessionKey, type PlayerSession } from '../model/session';
import { StrumGate } from '../model/strum';
import { isCleanPass, trainerNext, trainerNote, type TrainerSettings } from '../model/trainer';
import { clampTempo, needsMic, type Arrangement, type BarRange, type PracticeMode, type ScoreLayer } from '../model/types';
import { MicInput, type MicStatus } from './mic';
import { whenAudioUnlocked } from './unlock';

/** What the transport is doing, as the controls show it. */
export type Phase = 'idle' | 'loading' | 'countin' | 'playing' | 'paused' | 'waiting';

/** The wait-mode prompt. */
export interface WaitView {
  index: number;
  total: number;
  target: PracticeTarget;
  /** Wrong notes on this target so far. */
  tries: number;
  hint: boolean;
  /** What to play, short: "B", "A and E", "G" (a chord). */
  name: string;
  /** Where to play it, in words. */
  where: string;
  feedback: { tone: 'ok' | 'bad' | 'info'; text: string } | null;
}

/** The results panel. */
export interface ResultsView {
  summary: RunSummary;
  activity: ActivityResult | null;
  best: string | null;
  newBest: boolean;
  /** Increments for every new result, so a celebration can fire once. */
  serial: number;
}

/** Low-frequency state for React. */
export interface EngineState {
  phase: Phase;
  mode: PracticeMode;
  tempo: number;
  loop: BarRange | null;
  pick: LoopPick;
  countIn: boolean;
  metronome: boolean;
  trainer: TrainerSettings;
  /** A short line about the trainer ("Next loop at 80 %", "You reached 100 %"). */
  trainerNote: string | null;
  track: string;
  muted: string[];
  solo: string[];
  /** In the microphone modes, hear your own part too (off: the microphone hears only you). */
  partAudible: boolean;
  layer: ScoreLayer;
  neck: boolean;
  /** Chord names and boxes hidden: playing it from memory. */
  hideChart: boolean;
  /** How the song is moved (capo, transposition); the engine's song is already arranged so. */
  arrangement: Arrangement;
  /** Last known position (updated on bars, seeks and pauses; the cursor itself moves per frame). */
  bar: number;
  tick: number;
  wait: WaitView | null;
  mic: { status: MicStatus; failure: MediaFailure | null };
  results: ResultsView | null;
  noteStates: ReadonlyMap<string, TabNoteState> | null;
  /** Passes of the loop in this run. */
  passes: number;
  /** The guitar sound. */
  tone: ToneName;
}

/** Events for the parts of the screen that follow the music. */
export type HudEvent =
  | { type: 'countin'; beat: number; beats: number }
  | { type: 'go' }
  | { type: 'judge'; grade: string; combo: number; offset?: number }
  | { type: 'level'; x: number; clipping: boolean }
  | { type: 'clear' };

/** What the fretboard should light: now (and whether it is a hint) and next. */
export interface NeckFrame {
  now: NeckSpot[];
  next: NeckSpot[];
  hint: boolean;
}

/** How to build an engine. */
export interface EngineOptions {
  song: Song;
  songId: string;
  title: string;
  session: PlayerSession;
  tone: string;
  clickSound: string;
  /** Where to start when the session's tick is -1 (an address that named a bar). */
  startBar?: number;
  /** How `song` was moved from the written song (kept with the session). */
  arrangement?: Arrangement;
}

/** A `SongPlayerOutput` whose guitar sound can be changed while the player lives. */
class SwitchableOutput implements SongPlayerOutput {
  private inner: SongPlayerOutput;
  constructor(private opts: LiveOutputOptions) {
    this.inner = liveOutput(opts);
  }
  set(opts: LiveOutputOptions): void {
    this.inner.stopAll();
    this.opts = { ...this.opts, ...opts };
    this.inner = liveOutput(this.opts);
  }
  note(e: PlayNote, time: number, seconds: number): void {
    this.inner.note(e, time, seconds);
  }
  strum(e: PlayStrum, time: number, seconds: number): void {
    this.inner.strum(e, time, seconds);
  }
  click(level: 'accent' | 'medium' | 'beat', time: number): void {
    this.inner.click(level, time);
  }
  stopAll(time?: number): void {
    this.inner.stopAll(time);
  }
  preload(events: readonly PlayEvent[]): Promise<void> {
    return this.inner.preload?.(events) ?? Promise.resolve();
  }
}

/** A run in progress (listen, flow or tap along). */
interface Run {
  kind: 'listen' | 'flow' | 'tap';
  flow: FlowRun | null;
  targets: PracticeTarget[];
  /** Wall-clock ms when it started (for the time spent). */
  startedAt: number;
  pausedFor: number;
  pausedAt: number | null;
  fromTick: number;
  fullSong: boolean;
  /** The slowest tempo used (stars are capped by it). */
  tempoMin: number;
}

/** A wait-mode run. */
interface WaitRun {
  wait: WaitMode;
  startedAt: number;
  fromTick: number;
  endTick: number;
  fullSong: boolean;
  tempo: number;
  states: Map<string, TabNoteState>;
  /** Wrong chords strummed on each target (by index), heard through the chroma. */
  chordMisses: Map<number, number>;
}

const HINT_AFTER = 2;
/** B2: below it a note-on may be a knock on the body (see the pitch module's limits). */
const LOW_NOTE = 47;
const SAVE_MS = 500;

/** The player engine. Always `dispose()` it. */
export class PlayerEngine {
  readonly player: SongPlayer;
  readonly timeline: SongTimeline;
  readonly song: Song;
  readonly songId: string;
  readonly title: string;
  readonly mic: MicInput;
  private readonly output: SwitchableOutput;
  private readonly offset: number;
  private stateNow: EngineState;
  /** The learner picked the score layer here (kept with the session; until then Settings decides). */
  private layerPicked: boolean;
  private readonly listeners = new Set<() => void>();
  private readonly hudListeners = new Set<(e: HudEvent) => void>();
  private readonly neckListeners = new Set<(f: NeckFrame) => void>();
  private readonly offs: Array<() => void> = [];
  private prepared: Promise<void> | null = null;
  private disposed = false;
  private run: Run | null = null;
  private waitRun: WaitRun | null = null;
  private allTargets: PracticeTarget[] = [];
  private targetIndexByTick = new Map<number, number>();
  private neckNow: NeckFrame = { now: [], next: [], hint: false };
  private inLoopEvent = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private serial = 0;
  private pendingStates: Array<[string, TabNoteState]> = [];
  private statesTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly runStates = new Map<string, TabNoteState>();
  /** One strum counts for one chord (a ringing chord keeps matching otherwise). */
  private readonly strum = new StrumGate();
  private lastLevel = Number.NEGATIVE_INFINITY;
  /** Audio time of the last thing heard (note-on or chroma frame), for the strum gate. */
  private lastHeard = 0;
  /** Wait mode: listens to each strum on a chord target, to say what a wrong chord sounded like. */
  private readonly strumEar = new StrumListener();
  /** Chords to name a wrong strum by: the song's own, then the common triads. */
  private readonly chordList: ReturnType<typeof chordCandidates>;
  private onHidden = () => {
    if (document.visibilityState === 'hidden') {
      // A phone put away, or another app in front: the music should not play on unheard.
      if (this.player.state === 'playing' && !this.waitRun) this.pause();
      this.saveNow();
    }
  };
  private onPageHide = () => this.saveNow();
  private preparedDone = false;
  private prepareTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: EngineOptions) {
    this.song = opts.song;
    this.songId = opts.songId;
    this.title = opts.title;
    this.output = new SwitchableOutput({ tone: normalizeTone(opts.tone, 'steel'), clickSet: normalizeClickSet(opts.clickSound) as ClickSet });
    const s = opts.session;
    this.layerPicked = s.layerPicked === true;
    this.player = new SongPlayer(opts.song, { output: this.output, countInBars: s.countIn ? 1 : 0, metronome: s.metronome });
    this.timeline = this.player.timeline;
    const first = this.timeline.bars[0];
    this.offset = first ? barCapacity(first.time) - first.length : 0;
    const track = s.track && opts.song.tracks.some((t) => t.id === s.track) ? s.track : opts.song.tracks[0]?.id ?? '';
    this.stateNow = {
      phase: 'idle', mode: s.mode, tempo: s.tempo, loop: normalizeLoop(s.loop, opts.song.bars.length), pick: IDLE_PICK, countIn: s.countIn, metronome: s.metronome,
      trainer: s.trainer, trainerNote: null, track, muted: s.muted, solo: s.solo, partAudible: false, layer: s.layer, neck: s.neck, hideChart: s.hideChart === true,
      arrangement: opts.arrangement ?? { transpose: s.transpose ?? 0, capo: s.capo ?? null }, bar: 0, tick: 0, wait: null,
      mic: { status: 'off', failure: MicInput.blockedByHost() ? 'blocked-by-host' : null }, results: null, noteStates: null, passes: 0, tone: normalizeTone(opts.tone, 'steel'),
    };
    this.chordList = chordCandidates(opts.song.chords.map((c) => c.symbol));
    this.mic = new MicInput({
      noteon: (e) => this.onNoteOn(e),
      chroma: (e) => this.onChroma(e),
      onset: (time) => {
        this.strum.onset(time);
        if (this.waitRun?.wait.current?.chord) this.strumEar.onset(time);
      },
      level: (x, clipping) => this.hud({ type: 'level', x, clipping }),
      lost: (reason) => {
        this.set({ mic: { status: 'failed', failure: reason } });
        if (this.player.state === 'playing') this.pause();
      },
    });
    resetDebug(opts.songId);
    playerDebug.mode = s.mode;
    this.indexTargets();
    this.player.tempoPercent = clampTempo(s.tempo);
    if (this.stateNow.loop) this.player.setLoop(this.stateNow.loop.from, this.stateNow.loop.to);
    this.applyMutes();
    // Where to start: the saved tick, or the bar the address named.
    const startTick = s.tick >= 0 ? s.tick : this.timeline.tickOfBar(opts.startBar ?? s.bar);
    this.player.seek(this.clampIntoLoop(startTick));
    this.syncPosition();
    this.listen();
    this.updateNeck();
    // Render the notes in idle time once audio may run, so the first Play starts at once.
    const soon = () => {
      this.prepareTimer = setTimeout(() => void this.prepareSoon(), 250);
    };
    if (audioRunning()) soon();
    else this.offs.push(whenAudioUnlocked(soon));
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onHidden);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide);
  }

  // ── React store ─────────────────────────────────────────────────────────────────────────────

  /** The current state (stable between changes). */
  getState = (): EngineState => this.stateNow;

  /** Hear about state changes. */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<EngineState>): void {
    if (this.disposed) return;
    this.stateNow = { ...this.stateNow, ...patch };
    for (const fn of [...this.listeners]) fn();
    this.scheduleSave();
  }

  /** Count-in, judgements and input level, as they happen. */
  onHud(fn: (e: HudEvent) => void): () => void {
    this.hudListeners.add(fn);
    return () => this.hudListeners.delete(fn);
  }

  private hud(e: HudEvent): void {
    for (const fn of this.hudListeners) fn(e);
  }

  /** What the fretboard lights, as it changes (called at once with the current frame). */
  onNeck(fn: (f: NeckFrame) => void): () => void {
    this.neckListeners.add(fn);
    fn(this.neckNow);
    return () => this.neckListeners.delete(fn);
  }

  private neck(f: NeckFrame): void {
    this.neckNow = f;
    for (const fn of this.neckListeners) fn(f);
  }

  /** Labels for the fretboard and the hints: the practised part's tuning and capo, the song's key. */
  get neckLabels(): NeckLabelOptions {
    const t = this.song.tracks.find((x) => x.id === this.stateNow.track);
    return { tuning: t?.tuning ?? this.song.tuning, capo: t?.capo ?? this.song.capo, ...(this.song.key ? { key: this.song.key } : {}) };
  }

  /** Every place the practised part plays (for the fretboard's range). */
  get partTargets(): readonly PracticeTarget[] {
    return this.allTargets;
  }

  // ── wiring ──────────────────────────────────────────────────────────────────────────────────

  private listen(): void {
    const p = this.player;
    this.offs.push(
      p.subscribe((e) => {
        switch (e.type) {
          case 'state':
            this.onPlayerState(e.state);
            break;
          case 'countin':
            if (this.stateNow.phase !== 'countin') this.set({ phase: 'countin' });
            this.hud({ type: 'countin', beat: e.beat, beats: e.beats });
            break;
          case 'beat':
            if (this.stateNow.phase === 'countin') {
              this.set({ phase: 'playing' });
              this.hud({ type: 'go' });
            }
            if (e.beat.track === this.stateNow.track && !this.waitRun) this.neckAtTick(e.beat.tick);
            break;
          case 'bar':
            pushBounded(playerDebug.bars, { bar: e.bar, index: e.index, time: e.time, heardAt: audioSoundingNow() }, 200);
            this.stateNow = { ...this.stateNow, bar: e.bar, tick: this.timeline.bars[e.index]?.start ?? this.stateNow.tick };
            for (const fn of [...this.listeners]) fn();
            this.scheduleSave();
            break;
          case 'tempo':
            if (this.run) this.run.tempoMin = Math.min(this.run.tempoMin, e.percent);
            playerDebug.tempo = e.percent;
            this.set({ tempo: e.percent });
            break;
          case 'end':
            this.onEnd();
            break;
          case 'range-end':
            this.onRangeEnd();
            break;
          default:
        }
      }),
      p.transport.on('start', (e) => this.onTransportStart(e.time, e.tick)),
      p.transport.on('loop', (e) => this.onLoop(e.time)),
      p.transport.on('tempo', (e) => this.onTransportTempo(e.time)),
    );
  }

  private indexTargets(): void {
    this.allTargets = practiceTargets(this.timeline, this.stateNow.track);
    this.targetIndexByTick = new Map(this.allTargets.map((t, i) => [t.tick, i]));
  }

  private applyMutes(): void {
    const s = this.stateNow;
    for (const t of this.song.tracks) {
      const muted = s.muted.includes(t.id) || (t.id === s.track && needsMic(s.mode) && !s.partAudible);
      this.player.setTrackMuted(t.id, muted);
      this.player.setTrackSolo(t.id, s.solo.includes(t.id));
    }
  }

  private prepareSoon(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.prepared) this.prepared = this.player.prepare().catch(() => undefined).then(() => {
      this.preparedDone = true;
    });
    return this.prepared;
  }

  private clampIntoLoop(tick: number): number {
    const l = this.player.loop;
    if (!l) return Math.max(0, Math.min(this.timeline.totalTicks, tick));
    return tick >= l.start && tick < l.end ? tick : l.start;
  }

  private syncPosition(): void {
    const pos = this.player.position();
    this.stateNow = { ...this.stateNow, bar: pos.bar, tick: pos.tick };
  }

  private writtenSecAt(transportTick: number): number {
    return this.timeline.secondsAt(Math.max(0, transportTick - this.offset));
  }

  private onTransportStart(time: number, tick: number): void {
    const musicStart = this.player.transport.timeAt(tick) ?? time;
    playerDebug.musicStart = musicStart;
    playerDebug.startTick = tick - this.offset;
    playerDebug.latency = this.mic.latency;
    const run = this.run;
    if (!run || run.kind === 'listen') return;
    if (!run.flow) {
      run.flow = new FlowRun(run.targets, { audio: musicStart, writtenSec: this.writtenSecAt(tick), percent: this.player.tempoPercent });
    } else {
      run.flow.reanchor(musicStart, this.writtenSecAt(tick));
    }
  }

  private onTransportTempo(time: number): void {
    const run = this.run;
    if (!run?.flow || this.inLoopEvent || this.player.state !== 'playing') return;
    const tick = this.player.transport.tickAt(time);
    run.flow.setTempo(this.player.tempoPercent, time, this.writtenSecAt(tick));
  }

  private onLoop(time: number): void {
    const run = this.run;
    const loop = this.player.loop;
    if (!run || !loop) return;
    this.inLoopEvent = true;
    try {
      const counts = run.flow ? run.flow.passCounts() : null;
      const clean = run.kind === 'listen' ? isCleanPass(null) : isCleanPass(counts);
      const t = this.stateNow.trainer;
      let note: string | null = this.stateNow.trainerNote;
      if (t.on) {
        const next = trainerNext(this.player.tempoPercent, t, clean);
        if (next.changed) this.player.tempoPercent = next.percent;
        note = trainerNote(next, t.target, (p) => this.tempoAt(p, loop.start));
      }
      run.flow?.newPass(time, this.timeline.secondsAt(loop.start), this.player.tempoPercent);
      // A new pass starts clean on the score.
      this.runStates.clear();
      this.flushStates(true);
      this.set({ passes: (this.run?.flow?.passCount ?? this.stateNow.passes + 1), trainerNote: note });
    } finally {
      this.inLoopEvent = false;
    }
  }

  private onPlayerState(state: 'stopped' | 'playing' | 'paused'): void {
    if (state === 'playing') {
      const p = this.player.position();
      if (this.run?.pausedAt) {
        this.run.pausedFor += performance.now() - this.run.pausedAt;
        this.run.pausedAt = null;
      }
      this.set({ phase: p.countIn ? 'countin' : 'playing' });
    } else if (state === 'paused') {
      this.syncPosition();
      if (this.run) this.run.pausedAt = performance.now();
      this.set({ phase: this.waitRun ? 'waiting' : 'paused', bar: this.stateNow.bar, tick: this.stateNow.tick });
      this.hud({ type: 'clear' });
      if (!this.waitRun) this.neckAtTick(this.stateNow.tick);
    } else {
      this.syncPosition();
      if (!this.waitRun && this.stateNow.phase !== 'loading') this.set({ phase: 'idle' });
      this.hud({ type: 'clear' });
      if (!this.waitRun) this.neckAtTick(this.stateNow.tick);
    }
  }

  // ── the fretboard ──────────────────────────────────────────────────────────────────────────

  /** Light what is played at a tick (the beat sounding there) and dim what comes next. */
  private neckAtTick(tick: number): void {
    const list = this.allTargets;
    const i = this.targetIndexByTick.get(tick);
    let now: NeckSpot[] = [];
    let nextIndex: number;
    if (i !== undefined) {
      now = targetSpots(list[i]);
      nextIndex = i + 1;
    } else {
      // A rest, a tie or a position between beats: nothing now, the next notes dimmed.
      nextIndex = list.findIndex((t) => t.tick > tick);
      if (nextIndex < 0) nextIndex = list.length;
      // When stopped on a beat's start, show that beat as "now".
      const exact = list[nextIndex - 1];
      if (exact && this.player.state !== 'playing' && exact.tick <= tick && tick < exact.tick + exact.beat.duration) {
        now = targetSpots(exact);
      }
    }
    const next = targetSpots(list[nextIndex] ?? null);
    this.neck({ now, next, hint: false });
  }

  private updateNeck(): void {
    if (this.waitRun) {
      const w = this.waitRun.wait;
      const cur = w.current;
      const next = w.targets[w.index + 1] ?? null;
      this.neck({ now: targetSpots(cur), next: targetSpots(next), hint: !!this.stateNow.wait?.hint });
    } else this.neckAtTick(this.stateNow.tick);
  }

  // ── transport controls ─────────────────────────────────────────────────────────────────────

  /** Play, or carry on (call from a tap or key press: it unlocks audio). */
  async play(): Promise<void> {
    if (this.disposed) return;
    const unlocking = unlockAudio();
    if (this.stateNow.phase === 'playing' || this.stateNow.phase === 'countin' || this.stateNow.phase === 'loading') return;
    // In wait mode the song already waits for the learner: Play has nothing more to do.
    if (this.waitRun) return;
    if (this.stateNow.results) this.set({ results: null, noteStates: null });
    if (needsMic(this.stateNow.mode) && this.mic.status !== 'on') {
      const ok = await this.startMic();
      if (!ok || this.disposed) return;
    }
    if (!this.preparedDone) {
      this.set({ phase: 'loading' });
      await unlocking;
      await this.prepareSoon();
      if (this.disposed) return;
      this.set({ phase: 'idle' });
    }
    if (this.player.state === 'paused' && this.run) {
      this.player.play();
      return;
    }
    this.run = null;
    if (this.stateNow.mode === 'wait') this.beginWait();
    else this.beginRun();
  }

  /** Pause where the music is (in wait mode, where the song waits anyway, this ends the run). */
  pause(): void {
    if (this.waitRun) {
      this.stop();
      return;
    }
    this.player.pause();
  }

  /** Play or pause (Space); in wait mode, start or stop. */
  toggle(): void {
    if (this.waitRun || this.stateNow.phase === 'playing' || this.stateNow.phase === 'countin') this.pause();
    else void this.play();
  }

  /** True while a wait-mode run is on. */
  get waiting(): boolean {
    return !!this.waitRun;
  }

  /**
   * Stop: end the run (with results when something was played) and go back to the start of the
   * loop or song. `quiet` ends it without the results panel (a mode or part switched mid-run): it
   * is still logged when it counted.
   */
  stop(quiet = false): void {
    if (this.waitRun) this.finishWait(false, quiet);
    else if (this.run) this.finishRun(false, quiet);
    this.player.stop();
    this.syncPosition();
    this.set({ phase: 'idle', wait: null, pick: IDLE_PICK, trainerNote: null });
    this.updateNeck();
  }

  /** Jump to a tick (absolute, playback order); a scored run starts again from there. */
  seekTick(tick: number): void {
    const t = this.clampIntoLoop(tick);
    if (this.waitRun) {
      const i = this.waitRun.wait.targets.findIndex((x) => x.tick >= t);
      if (i >= 0) {
        this.waitRun.wait.goTo(i);
        this.strum.reset();
        this.strumEar.cancel();
        this.player.stop();
        this.player.seek(this.waitRun.wait.targets[i].tick);
        this.syncPosition();
        this.set({ phase: 'waiting' });
        this.showWait(null);
        return;
      }
    }
    const playing = this.player.state === 'playing';
    if (this.run && this.run.kind !== 'listen') {
      // A jump breaks the timing of a scored run: drop it quietly and start a fresh one from there.
      this.run = null;
      this.runStates.clear();
      this.flushStates(true);
      if (playing) {
        this.player.stop();
        this.player.seek(t);
        this.beginRun();
        return;
      }
    }
    this.player.seek(t);
    this.syncPosition();
    this.set({ bar: this.stateNow.bar, tick: this.stateNow.tick });
    this.neckAtTick(t);
  }

  /** Jump to the first time a song bar is played. */
  seekBar(bar: number): void {
    this.seekTick(this.timeline.tickOfBar(bar));
  }

  /** ← / →: the previous or next bar in playback order. */
  stepBar(dir: -1 | 1): void {
    const pos = this.player.position();
    this.seekTick(stepBarTick(this.timeline, pos.tick, dir, this.player.loop));
  }

  /** Practice tempo, 25–150 %. */
  setTempo(percent: number): void {
    const p = clampTempo(percent);
    this.player.tempoPercent = p;
    this.set({ tempo: p, ...(this.stateNow.trainerNote ? { trainerNote: null } : {}) });
  }

  /** Loop bars (inclusive), or clear the loop. */
  setLoop(range: BarRange | null): void {
    const loop = normalizeLoop(range, this.song.bars.length);
    if (loop) this.player.setLoop(loop.from, loop.to);
    else this.player.clearLoop();
    this.set({ loop, pick: IDLE_PICK, trainerNote: null });
    if (loop && this.player.state !== 'playing') {
      const l = this.player.loop;
      const pos = this.player.position();
      if (l && (pos.tick < l.start || pos.tick >= l.end)) this.seekTick(l.start);
    }
    if (loop && this.stateNow.trainer.on && this.player.state !== 'playing') this.setTempo(this.stateNow.trainer.start);
  }

  /** The L key: A–B loop at the bar being played. */
  loopKey(): void {
    const bar = this.player.position().bar;
    const next = loopKey(this.stateNow.loop, this.stateNow.pick, bar);
    if (next.loop && next.pick.stage === 'end') {
      // The first bar is marked; looping starts once the last one is chosen.
      this.set({ loop: next.loop, pick: next.pick });
      return;
    }
    this.setLoop(next.loop);
  }

  /** Count-in before playing from a stop. */
  setCountIn(on: boolean): void {
    this.player.countInBars = on ? 1 : 0;
    this.set({ countIn: on });
  }

  /** The click on every beat. */
  setMetronome(on: boolean): void {
    this.player.metronome = on;
    this.set({ metronome: on });
  }

  /** Speed-trainer settings; switching it on with a loop starts the loop at its start tempo. */
  setTrainer(t: TrainerSettings): void {
    const wasOn = this.stateNow.trainer.on;
    this.set({ trainer: t, trainerNote: null });
    if (t.on && !wasOn && this.player.state !== 'playing') this.setTempo(t.start);
  }

  /** The part the learner plays (its tab, fretboard and targets). */
  setTrack(id: string): void {
    if (!this.song.tracks.some((t) => t.id === id) || id === this.stateNow.track) return;
    this.stop(true);
    this.set({ track: id, results: null });
    this.indexTargets();
    this.applyMutes();
    this.updateNeck();
  }

  /** Mute or unmute a track. */
  setMuted(id: string, muted: boolean): void {
    const list = muted ? [...new Set([...this.stateNow.muted, id])] : this.stateNow.muted.filter((x) => x !== id);
    this.set({ muted: list });
    this.applyMutes();
  }

  /** Solo a track (several may be). */
  setSolo(id: string, solo: boolean): void {
    const list = solo ? [...new Set([...this.stateNow.solo, id])] : this.stateNow.solo.filter((x) => x !== id);
    this.set({ solo: list });
    this.applyMutes();
  }

  /** In the microphone modes: hear your own part too. */
  setPartAudible(on: boolean): void {
    this.set({ partAudible: on });
    this.applyMutes();
  }

  /**
   * What the score shows: the learner's own pick for this song, kept over Settings from now on.
   * The notation alone (sight reading) also hides the fretboard, which would show the answers:
   * returns true when it did, so the screen can say so.
   */
  setLayer(layer: ScoreLayer): boolean {
    this.layerPicked = true;
    const hideNeck = layer === 'notation' && this.stateNow.layer !== 'notation' && this.stateNow.neck;
    this.set({ layer, ...(hideNeck ? { neck: false } : {}) });
    return hideNeck;
  }

  /**
   * Hide the chord names and boxes (play it from memory). Hiding them also hides the fretboard,
   * which would show the shapes: returns true when it did.
   */
  setHideChart(on: boolean): boolean {
    const hideNeck = on && !this.stateNow.hideChart && this.stateNow.neck;
    this.set({ hideChart: on, ...(hideNeck ? { neck: false } : {}) });
    if (this.waitRun) this.showWait(this.stateNow.wait?.feedback ?? null);
    return hideNeck;
  }

  /** A practice tempo as the meter counts it, at a tick ("♩. = 48" in 6/8, "72 bpm" in 4/4). */
  tempoAt(percent: number, tick = this.stateNow.tick): string {
    const bar = this.timeline.barAt(Math.max(0, tick));
    const time = (bar ? this.song.bars[bar.bar]?.time : this.song.bars[0]?.time) ?? null;
    return tempoMark((this.timeline.tempo.bpmAt(Math.max(0, tick)) * percent) / 100, time).short;
  }

  /** Show or hide the fretboard. */
  setNeck(on: boolean): void {
    this.set({ neck: on });
  }

  /** The guitar sound. */
  setTone(tone: string): void {
    const t = normalizeTone(tone, 'steel');
    this.output.set({ tone: t });
    this.set({ tone: t });
  }

  /** The click sound. */
  setClick(sound: string): void {
    this.output.set({ clickSet: normalizeClickSet(sound) as ClickSet });
  }

  /** Close the results panel. */
  closeResults(): void {
    this.set({ results: null, noteStates: null });
  }

  // ── modes ──────────────────────────────────────────────────────────────────────────────────

  /**
   * Switch practice mode. The microphone modes open the microphone (call from a tap); when it is
   * not available the result says why and the mode stays as it was.
   */
  async setMode(mode: PracticeMode): Promise<{ ok: true } | { ok: false; reason: MediaFailure }> {
    if (mode === this.stateNow.mode && (!needsMic(mode) || this.mic.status === 'on')) return { ok: true };
    void unlockAudio();
    if (needsMic(mode)) {
      const res = await this.mic.start();
      this.set({ mic: { status: this.mic.status, failure: res.ok ? null : res.reason } });
      if (!res.ok) return res;
      playerDebug.latency = this.mic.latency;
    }
    this.stop(true);
    if (!needsMic(mode) && this.mic.status !== 'off') {
      this.mic.stop();
      this.set({ mic: { status: 'off', failure: this.stateNow.mic.failure } });
    }
    // With nothing else to hear, a microphone mode keeps time with the click.
    const others = this.song.tracks.filter((t) => t.id !== this.stateNow.track).length;
    const metronome = needsMic(mode) && others === 0 ? true : this.stateNow.metronome;
    this.player.metronome = metronome;
    playerDebug.mode = mode;
    this.set({ mode, results: null, noteStates: null, metronome, partAudible: false });
    this.applyMutes();
    return { ok: true };
  }

  /** Open the microphone for the current mode (call from a tap). */
  async startMic(): Promise<boolean> {
    const res = await this.mic.start();
    this.set({ mic: { status: this.mic.status, failure: res.ok ? null : res.reason } });
    playerDebug.latency = this.mic.latency;
    return res.ok;
  }

  private beginRun(): void {
    const loop = this.player.loop;
    if (loop) {
      const pos = this.player.position();
      if (pos.tick !== loop.start) this.player.seek(loop.start);
    }
    const from = this.player.position().tick;
    const to = loop?.end ?? this.timeline.totalTicks;
    const kind = this.stateNow.mode === 'listen' ? 'listen' : this.stateNow.mode === 'tap' ? 'tap' : 'flow';
    const targets = kind === 'listen' ? [] : practiceTargets(this.timeline, this.stateNow.track, { fromTick: from, toTick: to });
    const firstStart = this.timeline.bars[0]?.start ?? 0;
    this.run = {
      kind, flow: null, targets, startedAt: performance.now(), pausedFor: 0, pausedAt: null, fromTick: from,
      fullSong: !loop && from <= firstStart, tempoMin: this.player.tempoPercent,
    };
    this.runStates.clear();
    this.flushStates(true);
    this.strum.reset();
    this.set({ passes: 1, trainerNote: null, wait: null });
    this.player.play();
  }

  private beginWait(): void {
    const loop = this.player.loop;
    const pos = this.player.position();
    const from = loop ? loop.start : pos.tick;
    const end = loop?.end ?? this.timeline.totalTicks;
    const targets = practiceTargets(this.timeline, this.stateNow.track, { fromTick: from, toTick: end });
    if (!targets.length) {
      this.set({ wait: null });
      return;
    }
    const wait = new WaitMode(targets, { toleranceCents: 50 });
    this.strum.reset();
    this.waitRun = { wait, startedAt: performance.now(), fromTick: from, endTick: end, fullSong: !loop && from <= (this.timeline.bars[0]?.start ?? 0), tempo: this.player.tempoPercent, states: new Map(), chordMisses: new Map() };
    this.strumEar.cancel();
    playerDebug.waitIndex = 0;
    playerDebug.waitTotal = targets.length;
    this.showWait(null);
    const first = targets[0];
    if (first.tick > from) this.player.playRange(from, first.tick, { countIn: this.stateNow.countIn });
    else {
      this.player.seek(first.tick);
      this.set({ phase: 'waiting' });
    }
  }

  private showWait(feedback: WaitView['feedback'], hint?: boolean): void {
    const w = this.waitRun;
    if (!w) return;
    const t = w.wait.current;
    if (!t) return;
    const rec = w.wait.summary().records[w.wait.index];
    const tries = rec?.wrong ?? 0;
    const showHint = hint ?? (tries >= HINT_AFTER || (this.stateNow.wait?.index === w.wait.index && !!this.stateNow.wait?.hint));
    // The note being waited on, on the score.
    for (const [k, v] of w.states) if (v === 'target') w.states.delete(k);
    w.states.set(noteKey(t.bar, t.beat.beat), 'target');
    const labels = this.neckLabels;
    const spots = targetSpots(t);
    const where = describeSpots(spots, labels, t.symbol);
    const name = t.symbol ? chordName(t.symbol) : joinNames(spots.map((x) => spotName(x, labels)));
    this.set({ wait: { index: w.wait.index, total: w.wait.targets.length, target: t, tries, hint: showHint, name, where, feedback }, noteStates: new Map(w.states) });
    playerDebug.waitIndex = w.wait.index;
    this.updateNeck();
  }

  /** Wait mode: show where the note is and let it be heard (counts as a hint). */
  hint(): void {
    const w = this.waitRun;
    const t = w?.wait.current;
    if (!w || !t) return;
    w.wait.hint();
    this.showWait(this.stateNow.wait?.feedback ?? null, true);
    this.sound(t);
  }

  /** Play a target's notes once, as a reference. */
  private sound(t: PracticeTarget): void {
    void unlockAudio();
    const tone = this.stateNow.tone;
    if (t.midis.length > 1) strum(t.midis, undefined, { tone, velocity: 0.7 });
    else if (t.midis[0] !== undefined) pluck(t.midis[0], undefined, { tone, velocity: 0.75, ...(t.positions[0] ? { string: t.positions[0].string } : {}), duration: 1.2 });
  }

  /** Wait mode: skip the note waited on. */
  skip(): void {
    const w = this.waitRun;
    if (!w) return;
    const cur = w.wait.current;
    if (!cur) return;
    w.states.set(noteKey(cur.bar, cur.beat.beat), 'miss');
    this.strum.reset();
    this.strumEar.cancel();
    const next = w.wait.skip();
    this.afterWaitStep(cur, next);
  }

  private afterWaitStep(done: PracticeTarget, next: PracticeTarget | null): void {
    const w = this.waitRun!;
    playerDebug.waitIndex = w.wait.index;
    if (next) {
      this.showWait(null);
      this.player.playRange(done.tick, next.tick);
    } else {
      // The last note: play out to the end of the range, then the results.
      this.set({ wait: null, noteStates: new Map(w.states) });
      if (w.endTick > done.tick) this.player.playRange(done.tick, w.endTick);
      else this.finishWait(true);
    }
  }

  private onRangeEnd(): void {
    const w = this.waitRun;
    if (!w) return;
    if (w.wait.done) {
      this.finishWait(true);
      return;
    }
    this.syncPosition();
    this.set({ phase: 'waiting' });
  }

  private waitHeard(r: WaitResult, midi: number): void {
    const w = this.waitRun;
    if (!w) return;
    if (r.kind === 'match' && r.target) {
      this.strumEar.cancel();
      if (r.target.chord) this.strum.close(this.lastHeard, this.lastLevel);
      w.states.set(noteKey(r.target.bar, r.target.beat.beat), 'hit');
      playUi('correct', { volume: 0.35 });
      this.afterWaitStep(r.target, r.next ?? null);
      if (r.next) this.showWait({ tone: 'ok', text: 'Yes.' });
    } else if (r.kind === 'wrong' && r.target) {
      // A strum is judged as a whole from its sound (`onChroma`): one string of it is not news.
      if (r.target.chord && this.strumEar.listening) return;
      const heard = heardName(midi, this.song.key);
      const hidden = this.stateNow.hideChart && !!r.target.symbol;
      const want = describeSpots(targetSpots(r.target), this.neckLabels, r.target.symbol);
      const text = r.octave
        ? `Right note, other octave. Try ${want}.`
        : r.target.chord
          ? hidden ? `${heard} is not in this chord.` : `${heard} is not in this chord. Play ${want}.`
          : `That sounded like ${heard}. This one is ${want}.`;
      const tries = (w.wait.summary().records[w.wait.index]?.wrong ?? 0);
      // After a few tries the hint comes by itself, with the note to hear.
      if (tries === HINT_AFTER) {
        w.wait.hint();
        this.sound(r.target);
      }
      this.showWait({ tone: 'bad', text });
    } else if (r.kind === 'partial') {
      this.showWait({ tone: 'info', text: 'Keep going: more of the chord.' });
    }
  }

  private onNoteOn(e: NoteOnEvent): void {
    this.lastHeard = e.time;
    const latency = this.mic.latency;
    const audio = e.time - latency;
    let result: string | null = null;
    let offset: number | undefined;
    let target: number | undefined;
    // A knock on the guitar's body reads as a short low note (F#2–A2): below B2 a note counts only
    // when it is what the music wants just then.
    const low = e.midi < LOW_NOTE;
    if (this.waitRun && this.stateNow.mode === 'wait') {
      const cur = this.waitRun.wait.current;
      if (low && !(cur && (cur.chord ? cur.pcs.includes(((Math.round(e.midi) % 12) + 12) % 12) : cur.midis.some((m) => Math.abs(m - e.midi) < 0.5)))) {
        pushBounded(playerDebug.notes, { time: e.time, audio, midi: e.midi, result: 'ignored-low' });
        return;
      }
      const r = this.waitRun.wait.hear({ time: e.time, midi: e.midi, freq: e.freq });
      result = r.kind;
      target = r.target?.index;
      this.waitHeard(r, e.midi);
    } else if (this.run?.flow && this.run.kind === 'flow' && this.player.state === 'playing') {
      if (low && !this.run.flow.wants(audio, e.midi)) {
        pushBounded(playerDebug.notes, { time: e.time, audio, midi: e.midi, result: 'ignored-low' });
        return;
      }
      const j = this.run.flow.hear({ audio, midi: e.midi, freq: e.freq });
      if (j) {
        result = j.grade;
        offset = j.offset;
        target = j.target;
        this.judged(j.grade, j.target, j.combo, j.offset);
      }
    }
    pushBounded(playerDebug.notes, { time: e.time, audio, midi: e.midi, result, ...(offset !== undefined ? { offset } : {}), ...(target !== undefined ? { target } : {}) });
  }

  private onChroma(e: ChromaEvent): void {
    this.lastLevel = e.levelDb;
    this.lastHeard = e.time;
    this.strum.level(e.levelDb);
    if (this.waitRun && this.stateNow.mode === 'wait') {
      const cur = this.waitRun.wait.current;
      if (!cur?.chord) return;
      if (this.strum.open) {
        const r = this.waitRun.wait.hearChroma({ time: e.time, chroma: e.chroma, bass: e.bass });
        if (r.kind === 'match') {
          this.waitHeard(r, -1);
          return;
        }
      }
      this.wrongChord(cur, e);
    } else if (this.run?.flow && this.run.kind === 'flow' && this.player.state === 'playing') {
      if (!this.strum.open) return;
      const j = this.run.flow.hearChroma({ audio: e.time - this.mic.latency, chroma: e.chroma, bass: e.bass });
      if (j) {
        this.strum.close(e.time, e.levelDb);
        this.judged(j.grade, j.target, j.combo, j.offset);
      }
    }
  }

  /**
   * Wait mode on a chord: a strum that did not match is named from its sound, kindly ("That
   * sounded like Am. The chart says C."), and after a couple of misses the hint comes by itself.
   */
  private wrongChord(target: PracticeTarget, e: ChromaEvent): void {
    const w = this.waitRun;
    if (!w) return;
    const want = (target.symbol ? chordSpec(target.symbol) : null) ?? { pcs: [...target.pcs] };
    const verdict = this.strumEar.frame(e.time, e.chroma, want, this.chordList);
    if (!verdict) return;
    const hidden = this.stateNow.hideChart && !!target.symbol && !this.stateNow.wait?.hint;
    const chart = target.symbol && !hidden ? chordName(target.symbol) : null;
    const key = this.song.key;
    const text = strumWords(verdict, chart, chordName, (pc) => heardName(60 + pc, key));
    pushBounded(playerDebug.notes, { time: e.time, audio: e.time, midi: -2, result: verdict.kind === 'other' ? `chord:${verdict.heard}` : verdict.kind });
    const misses = (w.chordMisses.get(w.wait.index) ?? 0) + 1;
    w.chordMisses.set(w.wait.index, misses);
    if (misses === HINT_AFTER && !this.stateNow.wait?.hint) {
      w.wait.hint();
      this.sound(target);
      this.showWait({ tone: verdict.kind === 'close' ? 'info' : 'bad', text }, true);
      return;
    }
    this.showWait({ tone: verdict.kind === 'close' ? 'info' : 'bad', text });
  }

  /** Tap along: a tap at a DOM event time (ms on the performance clock). */
  tap(eventTimeMs?: number): void {
    const run = this.run;
    if (!run?.flow || run.kind !== 'tap' || this.player.state !== 'playing') return;
    // The learner taps with what they hear: the sounding clock, moved back to when the tap happened.
    const ago = eventTimeMs !== undefined ? Math.max(0, Math.min(0.5, (performance.now() - eventTimeMs) / 1000)) : 0;
    const audio = audioSoundingNow() - ago;
    const j = run.flow.tap(audio);
    pushBounded(playerDebug.notes, { time: audio, audio, midi: -1, result: j?.grade ?? null, ...(j?.offset !== undefined ? { offset: j.offset } : {}) });
    if (j) this.judged(j.grade, j.target, j.combo, j.offset);
  }

  private judged(grade: string, targetIndex: number, combo: number, offset?: number): void {
    this.hud({ type: 'judge', grade, combo, ...(offset !== undefined ? { offset } : {}) });
    const run = this.run;
    if (!run) return;
    const t = run.targets[targetIndex];
    if (t?.chord && grade !== 'missed' && grade !== 'wrong') this.strum.close(this.lastHeard, this.lastLevel);
    if (t) this.queueState(noteKey(t.bar, t.beat.beat), grade === 'missed' || grade === 'wrong' ? 'miss' : 'hit');
  }

  /** Note colours on the score, at most a few times a second (not a render per note). */
  private queueState(key: string, state: TabNoteState): void {
    this.pendingStates.push([key, state]);
    if (!this.statesTimer) this.statesTimer = setTimeout(() => this.flushStates(false), 250);
  }

  private flushStates(reset: boolean): void {
    if (this.statesTimer) clearTimeout(this.statesTimer);
    this.statesTimer = null;
    for (const [k, v] of this.pendingStates) this.runStates.set(k, v);
    this.pendingStates = [];
    if (reset) this.runStates.clear();
    if (this.waitRun) return;
    this.set({ noteStates: this.runStates.size ? new Map(this.runStates) : null });
  }

  /** Called every animation frame while playing: misses are counted as their windows pass. */
  frame(): void {
    const run = this.run;
    if (!run?.flow || run.kind === 'listen' || this.player.state !== 'playing') return;
    // Notes are scored in the time of the music as scheduled; the newest one still being detected
    // was played at most (latency + detection) ago, which `advance` allows for.
    const now = run.kind === 'flow' ? audioNow() - this.mic.latency : audioSoundingNow();
    for (const j of run.flow.advance(now)) this.judged(j.grade, j.target, j.combo, j.offset);
  }

  // ── ends of runs ───────────────────────────────────────────────────────────────────────────

  private onEnd(): void {
    if (this.waitRun) return;
    if (this.run) this.finishRun(true);
    this.syncPosition();
    this.set({ phase: 'idle' });
  }

  private finishRun(reachedEnd: boolean, quiet = false): void {
    const run = this.run;
    this.run = null;
    if (!run) return;
    const durationSec = Math.max(0, (performance.now() - run.startedAt - run.pausedFor - (run.pausedAt ? performance.now() - run.pausedAt : 0)) / 1000);
    const ctx = { tempo: this.player.tempoPercent, starsTempo: Math.min(run.tempoMin, this.player.tempoPercent), fullSong: run.fullSong && reachedEnd, durationSec, barCount: this.song.bars.length };
    let summary: RunSummary;
    if (run.kind === 'listen' || !run.flow) {
      if (run.kind !== 'listen') return;
      summary = summarizeListen(ctx);
      // Listening earns a results panel at the end of the whole song; a shorter listen is only logged.
      if (!ctx.fullSong) {
        if (durationSec >= 30) this.record(summary, reachedEnd, 0);
        return;
      }
    } else {
      const result = reachedEnd ? run.flow.finish() : run.flow.stopEarly();
      if (result.judged === 0 && durationSec < 5) return;
      summary = summarizeFlow(result, run.kind, ctx);
    }
    this.flushStates(false);
    const pos = this.player.position();
    const progress = (pos.tick - run.fromTick) / Math.max(1, this.timeline.totalTicks - run.fromTick);
    if (quiet) {
      if (summary.total > 0) this.record(summary, reachedEnd, progress);
      return;
    }
    this.showResults(summary, reachedEnd, progress);
  }

  private finishWait(reachedEnd: boolean, quiet = false): void {
    const w = this.waitRun;
    this.waitRun = null;
    if (!w) return;
    const records = w.wait.summary().records;
    const durationSec = (performance.now() - w.startedAt) / 1000;
    const reached = records.filter((r) => r.matched || r.skipped).length;
    this.set({ wait: null, phase: 'idle', noteStates: w.states.size ? new Map(w.states) : null });
    if (reached === 0) return;
    const summary = summarizeWait(records, { tempo: w.tempo, fullSong: w.fullSong && reachedEnd, durationSec, barCount: this.song.bars.length });
    if (quiet) {
      this.record(summary, reachedEnd, reached / Math.max(1, records.length));
      return;
    }
    this.showResults(summary, reachedEnd, reached / Math.max(1, records.length));
  }

  /** Report the run to progress (once). */
  private record(summary: RunSummary, reachedEnd: boolean, progress: number): { activity: ActivityResult | null; newBest: boolean; previous: ReturnType<typeof withRun>['previous'] } {
    const skill = getProgress().skills[`song:${this.songId}`];
    const before = readSongData(skill?.data);
    const { data, newBest, previous } = withRun(before, summary, Date.now());
    let activity: ActivityResult | null = null;
    try {
      activity = recordActivity(activityFor(summary, { id: this.songId, title: this.title }, { progress, data, reachedEnd }));
      playerDebug.recorded++;
    } catch {
      activity = null;
    }
    return { activity, newBest, previous };
  }

  private showResults(summary: RunSummary, reachedEnd: boolean, progress: number): void {
    const { activity, newBest, previous } = this.record(summary, reachedEnd, progress);
    this.serial++;
    const results: ResultsView = { summary, activity, best: bestLine(newBest, previous, summary), newBest, serial: this.serial };
    playerDebug.results = { mode: summary.mode, accuracy: summary.accuracy, counts: summary.counts, stars: summary.stars, heat: summary.heat, suggestion: summary.suggestion, newBest, fullSong: summary.fullSong };
    if (summary.mode !== 'listen' && summary.played > 0) playUi(summary.accuracy !== null && summary.accuracy >= 0.95 ? 'lessonComplete' : 'good', { volume: 0.5 });
    this.set({ results });
  }

  // ── session ────────────────────────────────────────────────────────────────────────────────

  /** The session to keep for this song. */
  session(opened: string): PlayerSession {
    const s = this.stateNow;
    const pos = this.player.position();
    return {
      v: 1, at: Date.now(), opened, tick: Math.round(pos.tick), bar: pos.bar, tempo: s.tempo, loop: s.pick.stage === 'end' ? null : s.loop, mode: s.mode, layer: s.layer,
      layerPicked: this.layerPicked, track: s.track, muted: s.muted, solo: s.solo, countIn: s.countIn, metronome: s.metronome, trainer: s.trainer, neck: s.neck,
      hideChart: s.hideChart, transpose: s.arrangement.transpose, capo: s.arrangement.capo,
    };
  }

  private opened = '';

  /** The address params this screen was opened with (kept with the session). */
  setOpened(key: string): void {
    this.opened = key;
  }

  private scheduleSave(): void {
    if (this.saveTimer || this.disposed) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, SAVE_MS);
  }

  /** Write the session now. */
  saveNow(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      writeJSON(sessionKey(this.songId), this.session(this.opened));
    } catch {
      // Storage full or refused: the session is a convenience.
    }
  }

  /** Stop everything and release the audio and the microphone. Records a run left part-way. */
  dispose(): void {
    if (this.disposed) return;
    // Leaving part-way: the run is logged (as not completed), with no panel to show.
    if (this.waitRun) this.finishWait(false, true);
    else if (this.run) this.finishRun(false, true);
    this.saveNow();
    this.disposed = true;
    if (this.statesTimer) clearTimeout(this.statesTimer);
    if (this.prepareTimer) clearTimeout(this.prepareTimer);
    for (const off of this.offs) off();
    this.mic.stop();
    this.player.dispose();
    this.listeners.clear();
    this.hudListeners.clear();
    this.neckListeners.clear();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onHidden);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide);
  }
}

function joinNames(names: string[]): string {
  const list = [...new Set(names.filter(Boolean))];
  if (list.length <= 1) return list[0] ?? 'the next note';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** Read a saved session for a song (raw: the caller sanitises it). */
export function readSavedSession(songId: string): unknown {
  return readJSON<unknown>(sessionKey(songId), null);
}
