/**
 * Event vocabulary shared by the pure engine, the live microphone pipeline and the game helpers.
 * All times are seconds on the audio clock (the AudioContext's `currentTime` when live, time since
 * the start of the buffer when analysing offline).
 */

/** Smoothed pitch of the note that is sounding; one per analysis frame while a note is on. */
export interface PitchReading {
  /** Time of the newest audio in the frame. */
  time: number;
  /** Median-smoothed fundamental in Hz. */
  freq: number;
  /** Unsmoothed fundamental of this frame in Hz. */
  rawFreq: number;
  /** MIDI number of the sounding note (nearest note for the configured A4, with hysteresis). */
  midi: number;
  /** Deviation of `freq` from that note in cents; positive = sharp. May pass +/-50 briefly because of the hysteresis. */
  cents: number;
  /** 0..1: how periodic the frame is. */
  clarity: number;
  /** RMS level, linear (1 = full scale). */
  level: number;
  /** RMS level in dBFS. */
  levelDb: number;
  /** Seconds since this note began. */
  noteAge: number;
}

/** A new stable note began. */
export interface NoteOnEvent {
  /** Best estimate of when the note started (the pluck), not when it was confirmed. */
  time: number;
  /** Time at which the note was confirmed (always a little later than `time`). */
  detectedAt: number;
  /** MIDI number. */
  midi: number;
  /** Fundamental in Hz at confirmation. */
  freq: number;
  /** RMS level, linear. */
  level: number;
  /** RMS level in dBFS. */
  levelDb: number;
  /** True when this is the same pitch plucked again while it was still sounding. */
  retrigger: boolean;
}

/** The sounding note ended (it faded, was damped, or another note replaced it). */
export interface NoteOffEvent {
  time: number;
  midi: number;
  /** Seconds the note lasted. */
  duration: number;
}

/** Nothing is sounding: the input has been below the gate for a moment. Sent once per quiet stretch. */
export interface SilenceEvent {
  time: number;
}

/** A pluck or strum was heard. */
export interface OnsetEvent {
  /** When the attack began (accurate to roughly 10 ms). */
  time: number;
  /** How far the level jumped, in dB. */
  strength: number;
  /** RMS level just after the attack, in dBFS. */
  levelDb: number;
  /** Set when only the high-band spectral flux heard it (a light stroke over ringing strings). */
  fluxOnly?: boolean;
}

/** Input level meter reading; sent about 30 times a second whether or not anything is playing. */
export interface LevelEvent {
  time: number;
  /** RMS over the last few tens of milliseconds, linear. */
  rms: number;
  /** RMS in dBFS. */
  db: number;
  /** Largest absolute sample since the previous level event, linear. */
  peak: number;
  /** True while the input is hitting full scale: the learner should back off or turn the input down. */
  clipping: boolean;
  /** Current estimate of the room/hum level in dBFS. */
  noiseFloorDb: number;
  /** Level a note must exceed to be heard, in dBFS (adapts to the noise floor). */
  gateDb: number;
  /** True when a steady mains hum is present and is being ignored. */
  hum: boolean;
}

/** Twelve pitch-class energies from the polyphonic analyser (chords). */
export interface ChromaEvent {
  /** Time of the newest audio in the analysed window. */
  time: number;
  /** Seconds of audio the frame covers (it ends at `time`). */
  span: number;
  /** Energy per pitch class, C = 0 ... B = 11, scaled so the strongest is 1 (all 0 in silence). */
  chroma: number[];
  /** Pitch class of the lowest clearly sounding note, or -1 when unknown. */
  bass: number;
  /** RMS level of the window in dBFS. */
  levelDb: number;
}

/** Event name -> payload. */
export interface PitchEventMap {
  pitch: PitchReading;
  noteon: NoteOnEvent;
  noteoff: NoteOffEvent;
  silence: SilenceEvent;
  onset: OnsetEvent;
  level: LevelEvent;
  chroma: ChromaEvent;
}

/** Name of an analysis event. */
export type PitchEventType = keyof PitchEventMap;

/** One analysis event tagged with its name, as produced by the engine. */
export type PitchEvent = { [K in PitchEventType]: { type: K } & PitchEventMap[K] }[PitchEventType];

/**
 * Anything that emits analysis events: the live {@link PitchTracker}, or an {@link EventHub} fed
 * from an offline analysis in tests. The game helpers only depend on this.
 */
export interface PitchSource {
  /** Subscribe; returns the function that unsubscribes. */
  on<K extends PitchEventType>(type: K, handler: (event: PitchEventMap[K]) => void): () => void;
}

/** Minimal event dispatcher implementing {@link PitchSource}; `emit` replays engine events to listeners. */
export class EventHub implements PitchSource {
  private readonly handlers = new Map<PitchEventType, Set<(event: never) => void>>();

  on<K extends PitchEventType>(type: K, handler: (event: PitchEventMap[K]) => void): () => void {
    const set = this.handlers.get(type) ?? new Set<(event: never) => void>();
    this.handlers.set(type, set);
    const h = handler as (event: never) => void;
    set.add(h);
    return () => {
      set.delete(h);
    };
  }

  /** Deliver one event to its listeners. A throwing listener does not stop the others. */
  emit(event: PitchEvent): void {
    const set = this.handlers.get(event.type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as (e: PitchEvent) => void)(event);
      } catch (err) {
        // A broken screen handler must never take the audio pipeline down with it.
        if (typeof console !== 'undefined') console.error('[pitch] listener failed', err);
      }
    }
  }

  /** Deliver several events in order. */
  emitAll(events: readonly PitchEvent[]): void {
    for (const e of events) this.emit(e);
  }

  /** True when at least one listener is registered for `type`. */
  has(type: PitchEventType): boolean {
    return (this.handlers.get(type)?.size ?? 0) > 0;
  }

  /** Remove every listener. */
  clear(): void {
    this.handlers.clear();
  }
}
