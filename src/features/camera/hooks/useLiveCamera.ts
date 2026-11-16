/**
 * The camera and the vision pipeline behind the live fretboard: one "Start camera" tap opens the
 * camera (through `@/core/platform`), plays it in the screen's `<video>`, and runs the fretboard
 * tracker in its worker on every frame. The camera is released when the screen goes away and
 * while the tab is hidden (it comes back by itself when the tab is shown again).
 *
 * Per-frame work never goes through React: `onRender` and `onUpdate` are read from refs and called
 * by the pipeline directly.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { listDevices, requestCamera, stopStream, type MediaFailure } from '@/core/platform';
import { VisionPipeline, type PipelineMode, type PipelineRender, type PipelineUpdate, type VisionOptions } from '@/core/vision';
import { cameraDebug } from '../debug';

/** Where the camera is. */
export type CameraPhase = 'idle' | 'starting' | 'running' | 'blocked' | 'hidden';

/** A camera to pick from. */
export interface CameraDevice {
  id: string;
  label: string;
}

/** What the hook needs from the screen. */
export interface LiveCameraOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Tracker settings: guitar model, handedness, which way up, markers. Changes are sent to the running tracker. */
  tracker: VisionOptions;
  /** Every displayed video frame (draw the overlay here). */
  onRender: (render: PipelineRender) => void;
  /** Every processed frame (turn it into the status; set React state only when it changes). */
  onUpdate: (update: PipelineUpdate) => void;
  /** The camera the learner chose last time (undefined = the system default). */
  deviceId?: string;
}

/** What the hook gives the screen. */
export interface LiveCamera {
  phase: CameraPhase;
  failure: MediaFailure | null;
  mode: PipelineMode;
  devices: CameraDevice[];
  /** The camera in use (its device id), once running. */
  activeDevice: string | null;
  /** The pipeline while running (commands: calibrate, confirmFret, shiftNumbering ...). */
  pipeline: RefObject<VisionPipeline | null>;
  /** Start (from a tap). With `deviceId`, that camera. */
  start: (deviceId?: string) => Promise<void>;
  /** Release the camera and stop tracking. */
  stop: () => void;
  /** Seconds the camera has run in this visit (for the practice log). */
  secondsRunning: () => number;
}

/** Pause/resume the video element itself (a still picture for marking taps). */
export function freezeVideo(video: HTMLVideoElement | null, frozen: boolean): void {
  if (!video) return;
  if (frozen) video.pause();
  else void video.play().catch(() => undefined);
}

export function useLiveCamera(o: LiveCameraOptions): LiveCamera {
  const [phase, setPhase] = useState<CameraPhase>('idle');
  const [failure, setFailure] = useState<MediaFailure | null>(null);
  const [mode, setMode] = useState<PipelineMode>('idle');
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [activeDevice, setActiveDevice] = useState<string | null>(null);
  const pipelineRef = useRef<VisionPipeline | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const phaseRef = useRef<CameraPhase>('idle');
  const lastDevice = useRef<string | undefined>(o.deviceId);
  const runningSince = useRef<number | null>(null);
  const runSeconds = useRef(0);
  const latest = useRef(o);
  latest.current = o;

  const setPhaseBoth = useCallback((p: CameraPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  /** Stop the pipeline and the camera tracks (keeps the phase to the caller). */
  const release = useCallback(() => {
    generation.current++;
    pipelineRef.current?.stop();
    pipelineRef.current = null;
    if (streamRef.current) cameraDebug.releases++;
    stopStream(streamRef.current);
    streamRef.current = null;
    const video = latest.current.videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    if (runningSince.current !== null) runSeconds.current += (performance.now() - runningSince.current) / 1000;
    runningSince.current = null;
    cameraDebug.stream = null;
    cameraDebug.pipeline = null;
    setMode('idle');
  }, []);

  const start = useCallback(
    async (deviceId?: string) => {
      release();
      const gen = generation.current;
      setFailure(null);
      setPhaseBoth('starting');
      const wanted = deviceId ?? lastDevice.current;
      let cam = await requestCamera({ deviceId: wanted, facing: 'user' });
      // A camera remembered from another day may be gone: fall back to the default one.
      if (!cam.ok && wanted && (cam.reason === 'no-device' || cam.reason === 'unknown')) cam = await requestCamera({ facing: 'user' });
      if (gen !== generation.current) {
        if (cam.ok) stopStream(cam.stream);
        return;
      }
      if (!cam.ok) {
        setFailure(cam.reason);
        setPhaseBoth('blocked');
        return;
      }
      const stream = cam.stream;
      streamRef.current = stream;
      cameraDebug.stream = stream;
      cameraDebug.starts++;
      const track = stream.getVideoTracks()[0];
      const used = track?.getSettings().deviceId ?? null;
      setActiveDevice(used);
      if (used) lastDevice.current = used;
      track?.addEventListener('ended', () => {
        // Unplugged, or taken by the system: say so and offer a restart.
        if (streamRef.current === stream && phaseRef.current === 'running') {
          release();
          setFailure('no-device');
          setPhaseBoth('blocked');
        }
      });
      const video = latest.current.videoRef.current;
      if (!video) {
        release();
        setPhaseBoth('idle');
        return;
      }
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay of a muted camera preview is allowed everywhere that matters; the pipeline waits for frames anyway.
      }
      if (gen !== generation.current) return;
      const pipeline = new VisionPipeline({
        tracker: latest.current.tracker,
        onRender: (r) => latest.current.onRender(r),
        onUpdate: (u) => latest.current.onUpdate(u),
        onStatus: (s) => setMode(s.mode),
      });
      pipelineRef.current = pipeline;
      cameraDebug.pipeline = pipeline;
      await pipeline.start(video);
      if (gen !== generation.current) return;
      runningSince.current = performance.now();
      setPhaseBoth('running');
      // Labels are only readable once the camera is allowed.
      const list = await listDevices('videoinput');
      if (gen !== generation.current) return;
      setDevices(list.map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
    },
    [release, setPhaseBoth],
  );

  const stop = useCallback(() => {
    release();
    setPhaseBoth('idle');
  }, [release, setPhaseBoth]);

  // Send tracker setting changes to the running tracker (orientation and guitar changes restart its search).
  const trackerKey = JSON.stringify(o.tracker);
  const sentKey = useRef(trackerKey);
  useEffect(() => {
    if (sentKey.current === trackerKey) return;
    const before = JSON.parse(sentKey.current) as Record<string, unknown>;
    sentKey.current = trackerKey;
    const now = o.tracker as Record<string, unknown>;
    const changes: Record<string, unknown> = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(now)])) if (JSON.stringify(before[k]) !== JSON.stringify(now[k])) changes[k] = now[k];
    void pipelineRef.current?.setOptions(changes as Partial<VisionOptions>);
  }, [trackerKey, o.tracker]);

  // Hidden tab: let go of the camera; shown again: take it back.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (phaseRef.current === 'running' || phaseRef.current === 'starting') {
          release();
          setPhaseBoth('hidden');
        }
      } else if (phaseRef.current === 'hidden') {
        void start(lastDevice.current);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [release, start, setPhaseBoth]);

  // Leaving the screen releases everything.
  useEffect(() => () => release(), [release]);

  const secondsRunning = useCallback(() => runSeconds.current + (runningSince.current !== null ? (performance.now() - runningSince.current) / 1000 : 0), []);

  return { phase, failure, mode, devices, activeDevice, pipeline: pipelineRef, start, stop, secondsRunning };
}
