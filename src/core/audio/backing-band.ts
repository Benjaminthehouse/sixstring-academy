/**
 * The backing band: plays an arrangement (drums, bass, keys and an optional rhythm guitar) through
 * a Transport. The rhythm guitar is muted by default ("minus guitar"): the learner is the guitarist.
 */
import { arrangeBacking, styleQuarterBpm, type ArrangeOptions, type BackingArrangement, type BackingBar, type BackingEvent, type BackingInstrument, type ChordSegment, type GuitarEvent } from './backing';
import { BACKING_STYLES, type BackingStyle, type BackingStyleId } from './backing-styles';
import { engineClock, type AudioEngine } from './engine';
import { GuitarSynth, getBass } from './guitar';
import type { DrumName } from './percussion';
import { PPQ } from './timeline';
import type { BassTone } from './tones';
import { Transport, type TransportClock } from './transport';
import { DrumKit, getDrums, playTone, type ToneHandle } from './voices';

/** Where the band's notes go. The default plays them on the engine; tests record them. */
export interface BandOutput {
  drum(name: DrumName, time: number, velocity: number, gain: number): void;
  bass(midi: number, time: number, seconds: number, velocity: number, gain: number, tone: BassTone): void;
  keys(midis: readonly number[], time: number, seconds: number, velocity: number, gain: number, voice: 'epiano' | 'organ'): void;
  guitar(event: GuitarEvent, time: number, seconds: number | undefined, gain: number): void;
  /** Silence everything, including notes scheduled but not yet heard. */
  stopAll(): void;
  /** Render the sounds an arrangement needs before it starts. */
  prepare?(arrangement: BackingArrangement, include: ReadonlySet<BackingInstrument>): Promise<void>;
}

/** Output that plays through the audio engine (the shared live one unless an engine is given). */
export function liveBandOutput(engine?: AudioEngine): BandOutput {
  let kit: DrumKit | null = null;
  let bass: GuitarSynth | null = null;
  let guitar: GuitarSynth | null = null;
  const tones = new Set<ToneHandle>();
  const drums = (): DrumKit => (kit ??= engine ? new DrumKit(engine) : getDrums());
  const bassSynth = (): GuitarSynth => (bass ??= engine ? new GuitarSynth({ engine, bus: 'bass', tone: 'bass-finger', mono: true }) : getBass());
  // The band's guitarist is a separate synth, so its strings never cut the learner's own notes.
  // It stands a little to the right, where a second guitarist would.
  const guitarSynth = (): GuitarSynth => (guitar ??= new GuitarSynth({ engine, bus: 'guitar', pan: 0.25 }));
  return {
    drum: (name, time, velocity, gain) => drums().play(name, time, velocity, gain),
    bass: (midi, time, seconds, velocity, gain, tone) => {
      bassSynth().pluck(midi, time, { duration: seconds, velocity, gain, tone });
    },
    keys: (midis, time, seconds, velocity, gain, voice) => {
      const g = gain / Math.sqrt(Math.max(1, midis.length));
      for (const m of midis) {
        const h = playTone(m, time, { voice, duration: seconds, velocity, gain: g, bus: 'keys' }, engine);
        tones.add(h);
        if (tones.size > 64) tones.delete(tones.values().next().value as ToneHandle);
      }
    },
    guitar: (ev, time, seconds, gain) => {
      guitarSynth().strum(ev.midis, time, {
        strings: ev.strings, direction: ev.direction, spread: ev.spread, velocity: ev.velocity, tone: ev.tone,
        articulation: ev.articulation, duration: seconds, gain,
      });
    },
    stopAll: () => {
      kit?.stopAll();
      bass?.stopAll();
      guitar?.stopAll();
      for (const h of tones) h.stop();
      tones.clear();
    },
    prepare: async (arrangement, include) => {
      const drumNames = new Set<DrumName>();
      const bassNotes = new Map<string, { midi: number; tone: BassTone }>();
      const guitarNotes = new Map<string, { midi: number; string: number; ev: GuitarEvent }>();
      for (const e of arrangement.events) {
        if (e.type === 'drum') drumNames.add(e.drum);
        else if (e.type === 'bass') bassNotes.set(`${e.midi}:${e.tone}`, { midi: e.midi, tone: e.tone });
        else if (e.type === 'guitar') e.midis.forEach((m, i) => guitarNotes.set(`${m}:${e.strings[i]}:${e.articulation}`, { midi: m, string: e.strings[i], ev: e }));
      }
      drumNames.add(BACKING_STYLES[arrangement.style].countIn);
      if (include.has('drums')) await drums().preload([...drumNames]);
      if (include.has('bass')) await bassSynth().preload([...bassNotes.values()].map((n) => ({ midi: n.midi, tone: n.tone })));
      if (include.has('guitar')) {
        for (const n of guitarNotes.values()) {
          await guitarSynth().preload([{ midi: n.midi, string: n.string }], { tone: n.ev.tone, articulation: n.ev.articulation });
        }
      }
    },
  };
}

/** Settings for {@link BackingBand.load}. */
export interface BackingOptions extends Omit<ArrangeOptions, 'style'> {
  style: BackingStyleId;
  /** Tempo in the style's felt beats per minute (default: the style's own). */
  tempo?: number;
  /** Repeat the choruses for ever instead of ending (default false). */
  loop?: boolean;
  /** Bars of count-in (default 1). */
  countInBars?: number;
}

/** Construction options for {@link BackingBand}. */
export interface BackingBandOptions {
  /** Use an existing transport (the band configures its tempo, meter and loop). */
  transport?: Transport;
  /** Clock for the band's own transport (default: the shared engine). */
  clock?: TransportClock;
  /** Engine to play into (default: the shared live engine). */
  engine?: AudioEngine;
  output?: BandOutput;
  /** `manual` for tests and offline rendering. */
  timer?: 'interval' | 'manual';
}

/** A chord change reported to the UI. */
export interface ChordChange {
  segment: ChordSegment;
  /** The chord after this one, if any (for "next chord" displays). */
  next: ChordSegment | null;
  time: number;
}

/** Drums, bass and keys that follow a chord progression in a chosen style. */
export class BackingBand {
  readonly transport: Transport;
  private readonly output: BandOutput;
  private current: BackingArrangement | null = null;
  private styleDef: BackingStyle = BACKING_STYLES['pop-rock'];
  private beatsPerMinute = 112;
  private readonly volume: Record<BackingInstrument, number> = { drums: 1, bass: 1, keys: 1, guitar: 1 };
  private readonly muted: Record<BackingInstrument, boolean> = { drums: false, bass: false, keys: false, guitar: true };
  private partIds: number[] = [];
  private readonly offs: Array<() => void> = [];
  private readonly chordListeners = new Set<(c: ChordChange) => void>();
  private readonly owns: boolean;

  constructor(opts: BackingBandOptions = {}) {
    this.owns = !opts.transport;
    this.transport = opts.transport ?? new Transport({ clock: opts.clock ?? opts.engine?.clock ?? engineClock, timer: opts.timer });
    this.output = opts.output ?? liveBandOutput(opts.engine);
    this.offs.push(
      this.transport.on('beat', (e) => {
        if (e.countIn && !this.muted.drums) this.output.drum(this.styleDef.countIn, e.time, e.downbeat ? 0.9 : 0.7, this.volume.drums);
      }),
      this.transport.on('pause', () => this.output.stopAll()),
      this.transport.on('seek', () => this.output.stopAll()),
    );
  }

  /** The arrangement being played (null before `load`). */
  get arrangement(): BackingArrangement | null {
    return this.current;
  }

  /** The style in use. */
  get style(): BackingStyle {
    return this.styleDef;
  }

  /**
   * Arrange a progression (one pass, bar by bar) and get ready to play it. Stops anything playing.
   * Returns the arrangement so the UI can draw the chord chart.
   */
  load(bars: readonly BackingBar[], opts: BackingOptions): BackingArrangement {
    this.transport.stop();
    this.output.stopAll();
    for (const id of this.partIds) this.transport.clear(id);
    this.partIds = [];
    const style = BACKING_STYLES[opts.style];
    this.styleDef = style;
    const loop = opts.loop ?? false;
    const arrangement = arrangeBacking(bars, { ...opts, ending: loop ? false : opts.ending });
    this.current = arrangement;
    this.beatsPerMinute = Math.max(20, Math.min(400, opts.tempo ?? style.tempo.default));
    const tr = this.transport;
    tr.setTimeSignature(style.timeSignature);
    tr.setSwing(0.5);
    tr.setTempo(styleQuarterBpm(style.id, this.beatsPerMinute));
    tr.countInBars = opts.countInBars ?? 1;
    if (loop) {
      tr.setLoop(0, arrangement.bodyTicks);
      tr.setEnd(null);
    } else {
      tr.clearLoop();
      tr.setEnd(arrangement.lengthTicks);
    }
    tr.seek(0);
    this.partIds.push(
      tr.addPart(arrangement.events, (time, ev) => this.play(ev, time)),
      tr.addPart(
        arrangement.chords.map((segment, i) => ({ tick: segment.startTick, segment, next: arrangement.chords[i + 1] ?? (loop ? arrangement.chords[0] : null) })),
        (time, ev) => {
          if (!this.chordListeners.size) return;
          const change: ChordChange = { segment: ev.segment, next: ev.next, time };
          tr.scheduleVisual(time, () => {
            for (const fn of [...this.chordListeners]) fn(change);
          });
        },
      ),
    );
    return arrangement;
  }

  private play(ev: BackingEvent, time: number): void {
    const secondsPerTick = 60 / (this.transport.bpm * PPQ);
    switch (ev.type) {
      case 'drum':
        if (!this.muted.drums) this.output.drum(ev.drum, time, ev.velocity, this.volume.drums);
        break;
      case 'bass':
        if (!this.muted.bass) this.output.bass(ev.midi, time, ev.duration * secondsPerTick, ev.velocity, this.volume.bass, ev.tone);
        break;
      case 'keys':
        if (!this.muted.keys) this.output.keys(ev.midis, time, ev.duration * secondsPerTick, ev.velocity, this.volume.keys * ev.level, ev.voice);
        break;
      case 'guitar':
        if (!this.muted.guitar) this.output.guitar(ev, time, ev.duration > 0 ? ev.duration * secondsPerTick : undefined, this.volume.guitar * ev.level);
        break;
    }
  }

  /** Render every sound the arrangement needs, so the first bar plays without a hitch. */
  async prepare(): Promise<void> {
    if (!this.current || !this.output.prepare) return;
    const include = new Set<BackingInstrument>((Object.keys(this.muted) as BackingInstrument[]).filter((k) => !this.muted[k]));
    await this.output.prepare(this.current, include);
  }

  /** Start from the top (after the count-in). Call `load` first. */
  start(opts: { countIn?: number } = {}): void {
    if (!this.current) return;
    this.transport.stop();
    this.transport.start({ from: 0, countIn: opts.countIn });
  }

  /** Stop and silence the band. */
  stop(): void {
    this.transport.stop();
    this.output.stopAll();
  }

  /** Pause; `resume()` continues from the same place. */
  pause(): void {
    this.transport.pause();
  }

  resume(): void {
    this.transport.start({ countIn: 0 });
  }

  get playing(): boolean {
    return this.transport.state === 'playing';
  }

  /** Tempo in the style's felt beats per minute. */
  get tempo(): number {
    return this.beatsPerMinute;
  }

  /** Change the tempo, also while playing. */
  setTempo(beatsPerMinute: number): void {
    this.beatsPerMinute = Math.max(20, Math.min(400, beatsPerMinute));
    this.transport.setTempo(styleQuarterBpm(this.styleDef.id, this.beatsPerMinute));
  }

  /** Volume of one band member, 0..1.5. */
  setVolume(instrument: BackingInstrument, volume: number): void {
    this.volume[instrument] = Math.max(0, Math.min(1.5, volume));
  }

  getVolume(instrument: BackingInstrument): number {
    return this.volume[instrument];
  }

  /** Mute or unmute one band member. The rhythm guitar starts muted. */
  setMuted(instrument: BackingInstrument, muted: boolean): void {
    this.muted[instrument] = muted;
  }

  isMuted(instrument: BackingInstrument): boolean {
    return this.muted[instrument];
  }

  /** The chord sounding right now (null before the first chord or when nothing is loaded). */
  currentChord(): ChordSegment | null {
    const a = this.current;
    if (!a) return null;
    const tick = this.transport.position().absTick;
    let hit: ChordSegment | null = null;
    for (const c of a.chords) {
      if (c.startTick <= tick && tick < c.endTick) hit = c;
    }
    return hit;
  }

  /** Called at every chord change, at the moment it is heard. Returns an unsubscribe function. */
  onChord(fn: (change: ChordChange) => void): () => void {
    this.chordListeners.add(fn);
    return () => {
      this.chordListeners.delete(fn);
    };
  }

  /** Stop, detach from the transport and release it when owned. */
  dispose(): void {
    this.stop();
    for (const id of this.partIds) this.transport.clear(id);
    this.partIds = [];
    for (const off of this.offs.splice(0)) off();
    this.chordListeners.clear();
    if (this.owns) this.transport.dispose();
  }
}
