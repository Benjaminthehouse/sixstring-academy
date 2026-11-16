/**
 * The backing band for a screen: one `BackingBand`, created on the first Play (inside the tap, so
 * audio may start), reloaded when the progression, key or band settings change (and restarted at
 * the top if it was playing), disposed on unmount. Chord changes arrive from `band.onChord` at the
 * moment they are heard and become React state (a few times a bar at most); beats move the beat
 * dots through a callback, not through state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BackingSetup } from '@/content/progressions';
import { BACKING_INSTRUMENTS, BackingBand, unlockAudio, type BackingInstrument, type ChordSegment } from '@/core/audio';
import { stopPreview } from '../audio/preview';

/** What the band is doing. */
export type BandStatus = 'idle' | 'loading' | 'count-in' | 'playing' | 'paused';

/** The chord change last heard. */
export interface HeardChord {
  segment: ChordSegment;
  next: ChordSegment | null;
  /** Increments with every change (so a repeated chord still re-renders). */
  serial: number;
}

/** Options for {@link useBand}. */
export interface BandOptions {
  /** Players muted (the rest play). */
  muted: Record<BackingInstrument, boolean>;
  /** Called on every beat when it is heard: beat index in the bar (0-based), beats in the bar, and whether it is the count-in. */
  onBeat?: (beat: number, beatsInBar: number, countIn: boolean) => void;
  /** Called when the band stops by itself at the end of its choruses. */
  onEnd?: () => void;
}

/** The band and its controls. */
export interface Band {
  status: BandStatus;
  heard: HeardChord | null;
  /** Count-in beat now heard (1-based), or null. */
  countBeat: number | null;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  toggle: () => Promise<void>;
  /** Seconds actually played since the last `takeSeconds()`, and chord changes heard. */
  takeStats: () => { seconds: number; changes: number };
  /** True when a band has ever played on this screen (so the stats are worth reading). */
  started: boolean;
}

let latest: BackingBand | null = null;

/** The band a progressions screen is using right now, if any (browser checks listen to its `onChord`). */
export function currentBand(): BackingBand | null {
  return latest;
}

function signature(setup: BackingSetup | null): string {
  if (!setup) return '';
  const { tempo: _t, ...rest } = setup.options;
  return JSON.stringify([setup.bars, rest]);
}

/**
 * A band that plays `setup` (null: nothing to play). Tempo changes apply live; anything else
 * reloads the arrangement.
 */
export function useBand(setup: BackingSetup | null, opts: BandOptions): Band {
  const bandRef = useRef<BackingBand | null>(null);
  const [status, setStatus] = useState<BandStatus>('idle');
  const [heard, setHeard] = useState<HeardChord | null>(null);
  const [countBeat, setCountBeat] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const statusRef = useRef<BandStatus>('idle');
  statusRef.current = status;
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const loadedSig = useRef('');
  const serial = useRef(0);
  const offs = useRef<Array<() => void>>([]);
  const playStart = useRef<number | null>(null);
  const stats = useRef({ seconds: 0, changes: 0 });
  const runId = useRef(0);

  const clock = useCallback((playing: boolean) => {
    const now = performance.now();
    if (playStart.current !== null) stats.current.seconds += (now - playStart.current) / 1000;
    playStart.current = playing ? now : null;
  }, []);

  const ensureBand = useCallback((): BackingBand => {
    if (bandRef.current) return bandRef.current;
    const band = new BackingBand();
    bandRef.current = band;
    latest = band;
    offs.current.push(
      band.onChord((c) => {
        serial.current += 1;
        stats.current.changes += 1;
        setCountBeat(null);
        setHeard({ segment: c.segment, next: c.next, serial: serial.current });
        if (statusRef.current === 'count-in') setStatus('playing');
      }),
      band.transport.onVisual('beat', (e) => {
        if (e.countIn) setCountBeat(e.beat + 1);
        optsRef.current.onBeat?.(e.beat, e.beatsInBar, e.countIn);
      }),
      band.transport.onVisual('stop', () => {
        if (statusRef.current === 'playing' || statusRef.current === 'count-in') {
          clock(false);
          setStatus('idle');
          setCountBeat(null);
          optsRef.current.onEnd?.();
        }
      }),
    );
    return band;
  }, [clock]);

  const applyMutes = useCallback((band: BackingBand) => {
    for (const k of BACKING_INSTRUMENTS) band.setMuted(k, !!optsRef.current.muted[k]);
  }, []);

  const load = useCallback((band: BackingBand, s: BackingSetup) => {
    band.load(s.bars, s.options);
    loadedSig.current = signature(s);
  }, []);

  const play = useCallback(async () => {
    const s = setupRef.current;
    if (!s) return;
    const my = ++runId.current;
    stopPreview();
    setStatus('loading');
    await unlockAudio();
    if (my !== runId.current) return;
    const band = ensureBand();
    if (statusRef.current === 'paused' && loadedSig.current === signature(s)) {
      applyMutes(band);
      band.resume();
      clock(true);
      setStatus('playing');
      return;
    }
    load(band, s);
    applyMutes(band);
    try {
      await band.prepare();
    } catch {
      /* the band still plays; the first notes may be late */
    }
    if (my !== runId.current) return;
    setHeard(null);
    band.start();
    clock(true);
    setStarted(true);
    setStatus((s.options.countInBars ?? 1) > 0 ? 'count-in' : 'playing');
  }, [applyMutes, clock, ensureBand, load]);

  const pause = useCallback(() => {
    runId.current++;
    const band = bandRef.current;
    if (!band) return;
    if (statusRef.current === 'playing' || statusRef.current === 'count-in') {
      band.pause();
      clock(false);
      setCountBeat(null);
      setStatus('paused');
    } else if (statusRef.current === 'loading') {
      setStatus('idle');
    }
  }, [clock]);

  const stop = useCallback(() => {
    runId.current++;
    bandRef.current?.stop();
    clock(false);
    setCountBeat(null);
    setHeard(null);
    setStatus('idle');
  }, [clock]);

  const toggle = useCallback(async () => {
    const st = statusRef.current;
    if (st === 'playing' || st === 'count-in' || st === 'loading') pause();
    else await play();
  }, [pause, play]);

  const takeStats = useCallback(() => {
    clock(playStart.current !== null);
    const out = { seconds: stats.current.seconds, changes: stats.current.changes };
    stats.current = { seconds: 0, changes: 0 };
    return out;
  }, [clock]);

  // Live: tempo and mutes.
  const tempo = setup?.options.tempo;
  useEffect(() => {
    if (tempo !== undefined) bandRef.current?.setTempo(tempo);
  }, [tempo]);
  const mutedKey = BACKING_INSTRUMENTS.map((k) => (opts.muted[k] ? 1 : 0)).join('');
  useEffect(() => {
    const band = bandRef.current;
    if (band) applyMutes(band);
  }, [mutedKey, applyMutes]);

  // Anything else: reload, and carry on from the top if it was playing.
  const sig = signature(setup);
  useEffect(() => {
    const band = bandRef.current;
    if (!band || !loadedSig.current || sig === loadedSig.current) return;
    const st = statusRef.current;
    if (!setupRef.current) {
      stop();
      return;
    }
    if (st === 'playing' || st === 'count-in') {
      const s = setupRef.current;
      load(band, s);
      applyMutes(band);
      setHeard(null);
      band.start({ countIn: 0 });
      setStatus('playing');
    } else {
      if (st === 'paused') {
        band.stop();
        clock(false);
        setStatus('idle');
      }
      loadedSig.current = '';
    }
  }, [sig, applyMutes, clock, load, stop]);

  // Unmount: silence and free the band.
  useEffect(
    () => () => {
      runId.current++;
      for (const off of offs.current.splice(0)) off();
      if (latest === bandRef.current) latest = null;
      bandRef.current?.dispose();
      bandRef.current = null;
    },
    [],
  );

  return { status, heard, countBeat, play, pause, stop, toggle, takeStats, started };
}
